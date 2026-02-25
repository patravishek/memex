import { chat } from "../ai/provider.js";
import {
  ProjectMemory,
  loadMemory,
  saveMemory,
  initMemory,
} from "./store.js";
import {
  buildContext,
  buildResumeContent,
  ContextOptions,
} from "./context-builder.js";
import { getGitContext, formatGitContext } from "../core/git.js";

// ─── <memex:skip> filter ─────────────────────────────────────────────────────

/**
 * Strip <memex:skip>…</memex:skip> blocks from a transcript before it is
 * sent to the AI for compression.  The removed span is replaced with a
 * placeholder so the AI is aware content was deliberately excluded.
 *
 * Usage: type `<memex:skip>` before and `</memex:skip>` after any text you
 * don't want stored (passwords, personal context, etc.).
 */
export function applySkipFilter(transcript: string): string {
  return transcript.replace(
    /<memex:skip>[\s\S]*?<\/memex:skip>/gi,
    "[content excluded by <memex:skip>]"
  );
}

const SYSTEM_PROMPT = `You are a memory manager for an AI coding agent. 
Your job is to extract and maintain a structured understanding of a software project 
from conversation transcripts between a developer and an AI assistant.

Be concise, accurate, and practical. Focus on what would actually help the AI 
resume work on this project without losing context. Output must always be valid JSON.`;

export async function compressSession(
  transcript: string,
  projectPath: string,
  logFile: string,
  options: { partial?: boolean } = {}
): Promise<ProjectMemory> {
  const existing = loadMemory(projectPath) ?? initMemory(projectPath);

  const existingContext =
    existing.description
      ? `Existing project memory:\n${JSON.stringify(existing, null, 2)}`
      : "No existing memory for this project.";

  // Strip any <memex:skip> blocks before sending to the AI
  const safeTranscript = applySkipFilter(transcript);

  const existingFocusHistory = existing.focusHistory ?? [];

  // Append git context if available
  const gitCtx = getGitContext(projectPath);
  const gitSection = gitCtx
    ? `\n--- GIT CONTEXT ---\n${formatGitContext(gitCtx)}\n--- END GIT CONTEXT ---\n`
    : "";

  // Partial snapshots don't add a new recentSessions entry — session is still ongoing
  const recentSessionsInstruction = options.partial
    ? `Keep recentSessions unchanged: ${JSON.stringify(existing.recentSessions ?? [])}`
    : `Add a new entry to recentSessions:
{ "date": "${new Date().toISOString()}", "summary": "2-3 sentence summary of this session", "logFile": "${logFile}" }

Keep recentSessions to the last 5 entries only.`;

  const response = await chat(
    [
      {
        role: "user",
        content: `Analyze this conversation transcript and update the project memory.

${existingContext}
${gitSection}
--- TRANSCRIPT ---
${safeTranscript.slice(-12000)}
--- END TRANSCRIPT ---

Return an updated JSON object merging existing memory with new information from this session.
Schema:
{
  "projectName": "string",
  "projectPath": "${projectPath}",
  "stack": ["array of tech stack items"],
  "description": "string - what this project does",
  "keyDecisions": [
    { "decision": "string", "reason": "string", "date": "ISO date string" }
  ],
  "currentFocus": "string - what was being worked on at the END of this transcript (update this if the work shifted during the session)",
  "focusHistory": ["string array - previous focus topics, newest last, max 10 entries"],
  "pendingTasks": ["string array - tasks mentioned but not completed"],
  "importantFiles": [
    { "filePath": "string", "purpose": "string" }
  ],
  "gotchas": ["string array - problems encountered, mistakes made, things to avoid"],
  "recentSessions": ${JSON.stringify(existing.recentSessions ?? [])},
  "lastUpdated": "${new Date().toISOString()}"
}

IMPORTANT for currentFocus and focusHistory:
- Set currentFocus to whatever was being worked on at the END of the transcript, even if it differs from the existing value.
- If currentFocus changed from "${existing.currentFocus ?? ""}", add the old value to focusHistory (if not already present).
- Existing focusHistory to carry forward: ${JSON.stringify(existingFocusHistory)}
- Keep focusHistory to the last 10 entries only.
${gitCtx && gitCtx.changedFiles.length > 0
  ? `- The git context shows changed files — consider adding relevant ones to importantFiles if not already present.`
  : ""}

${recentSessionsInstruction}
Return ONLY the JSON, no markdown, no explanation.`,
      },
    ],
    SYSTEM_PROMPT
  );

  try {
    // Strip markdown code fences if the AI wrapped the JSON in them
    const cleaned = response
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const updated = JSON.parse(cleaned) as ProjectMemory;

    // Ensure focusHistory is never lost if the AI omits it
    if (!Array.isArray(updated.focusHistory) || updated.focusHistory.length === 0) {
      // Carry forward existing history; if focus changed, push old value in
      const prev = existing.currentFocus ?? "";
      const next = updated.currentFocus ?? "";
      if (prev && prev !== next && !existingFocusHistory.includes(prev)) {
        updated.focusHistory = [...existingFocusHistory, prev].slice(-10);
      } else {
        updated.focusHistory = existingFocusHistory;
      }
    }

    saveMemory(projectPath, updated);
    return updated;
  } catch (parseErr) {
    const reason = response.trim().length === 0
      ? "AI returned an empty response — is your API key set correctly?"
      : `Could not parse AI response as JSON: ${(parseErr as Error).message}`;

    existing.recentSessions.push({
      date: new Date().toISOString(),
      summary: `Session recorded but compression failed — ${reason}`,
      logFile,
    });
    if (existing.recentSessions.length > 5) {
      existing.recentSessions = existing.recentSessions.slice(-5);
    }
    saveMemory(projectPath, existing);

    // Re-throw so the CLI can surface the real reason to the user
    throw new Error(reason);
  }
}

/**
 * Partial compression: update memory mid-session without finalizing the session
 * or adding a new recentSessions entry.  Used by auto-snapshot and `memex snapshot`.
 */
export async function compressSnapshot(
  transcript: string,
  projectPath: string,
  logFile: string
): Promise<ProjectMemory> {
  return compressSession(transcript, projectPath, logFile, { partial: true });
}

/**
 * Build the plain resume context block (used internally and in tests).
 * External callers can pass ContextOptions for tier/budget/focus control.
 */
export function buildResumePrompt(
  memory: ProjectMemory,
  opts: ContextOptions = {}
): string {
  return buildResumeContent(memory, { tier: 3, ...opts });
}

/**
 * Build a short (~300 char) CLAUDE.md hint for MCP mode.
 * Tier 1 orientation only — agent pulls full detail via tools.
 * Accepts an optional focus to surface in the hint.
 */
export function buildMcpHint(
  memory: ProjectMemory,
  opts: Pick<ContextOptions, "focus"> = {}
): string {
  const oneLiner = buildContext(memory, { tier: 1, ...opts });

  const lines = [
    "# Memex — Session Context (MCP mode)",
    "",
    "> Full memory available via MCP tools. Use them to retrieve context on demand.",
  ];

  if (opts.focus) {
    lines.push(`> Focus filter: **"${opts.focus}"** — call \`get_context()\` for relevance-sorted details.`);
  }

  lines.push("", "---", "", oneLiner, "",
    "**When you start:**",
    "1. Call `get_context()` for the full project summary",
    "2. Call `get_gotchas()` before touching any sensitive areas",
    "3. Use `search_sessions(\"<topic>\")` to find relevant past work",
    "4. Call `save_observation(type, content)` to record anything important mid-session"
  );

  return lines.join("\n");
}

/**
 * Write resume context to a CLAUDE.md file.
 *
 * Accepts ContextOptions so the caller can pass --tier / --max-tokens / --focus.
 * Appends recent conversation turns after the context block for non-MCP mode.
 */
const DEFAULT_CHAR_LIMIT = 35000; // Stay safely under Claude's 40k warning
const MAX_TURNS_IN_CLAUDE_MD = 10;
const MAX_TURN_CHARS = 1500;

export function writeResumeFile(
  memory: ProjectMemory,
  filePath: string,
  opts: ContextOptions = {}
): void {
  const fs = require("fs") as typeof import("fs");
  const lines: string[] = [buildResumeContent(memory, { tier: 3, ...opts })];

  if (memory.lastConversation && memory.lastConversation.length > 0) {
    const recentTurns = memory.lastConversation.slice(-MAX_TURNS_IN_CLAUDE_MD);

    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(
      `Last ${recentTurns.length} conversation turns (use to understand where we left off):`
    );
    lines.push("");

    for (const turn of recentTurns) {
      const label = turn.role === "user" ? "Human" : "Assistant";
      const content =
        turn.content.length > MAX_TURN_CHARS
          ? turn.content.slice(0, MAX_TURN_CHARS) + "… [truncated]"
          : turn.content;
      lines.push(`**${label}:** ${content}`);
      lines.push("");
    }
  }

  // Effective char limit: honour maxTokens if set, otherwise default
  const charLimit = opts.maxTokens
    ? opts.maxTokens * 4
    : DEFAULT_CHAR_LIMIT;

  let content = lines.join("\n");
  if (content.length > charLimit) {
    content = content.slice(0, charLimit);
    const lastNewline = content.lastIndexOf("\n");
    if (lastNewline > charLimit * 0.8) {
      content = content.slice(0, lastNewline);
    }
    content += "\n\n> [Memex: conversation history truncated to fit token budget]";
  }

  fs.writeFileSync(filePath, content, "utf-8");
}
