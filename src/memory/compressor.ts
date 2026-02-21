import { chat } from "../ai/provider.js";
import {
  ProjectMemory,
  loadMemory,
  saveMemory,
  initMemory,
  KeyDecision,
  ImportantFile,
} from "./store.js";

const SYSTEM_PROMPT = `You are a memory manager for an AI coding agent. 
Your job is to extract and maintain a structured understanding of a software project 
from conversation transcripts between a developer and an AI assistant.

Be concise, accurate, and practical. Focus on what would actually help the AI 
resume work on this project without losing context. Output must always be valid JSON.`;

export async function compressSession(
  transcript: string,
  projectPath: string,
  logFile: string
): Promise<ProjectMemory> {
  const existing = loadMemory(projectPath) ?? initMemory(projectPath);

  const existingContext =
    existing.description
      ? `Existing project memory:\n${JSON.stringify(existing, null, 2)}`
      : "No existing memory for this project.";

  const response = await chat(
    [
      {
        role: "user",
        content: `Analyze this conversation transcript and update the project memory.

${existingContext}

--- TRANSCRIPT ---
${transcript.slice(-12000)}
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
  "currentFocus": "string - what is being worked on right now",
  "pendingTasks": ["string array - tasks mentioned but not completed"],
  "importantFiles": [
    { "filePath": "string", "purpose": "string" }
  ],
  "gotchas": ["string array - problems encountered, mistakes made, things to avoid"],
  "recentSessions": ${JSON.stringify(existing.recentSessions ?? [])},
  "lastUpdated": "${new Date().toISOString()}"
}

Add a new entry to recentSessions:
{ "date": "${new Date().toISOString()}", "summary": "2-3 sentence summary of this session", "logFile": "${logFile}" }

Keep recentSessions to the last 5 entries only.
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

export function buildResumePrompt(memory: ProjectMemory): string {
  const lastSession = memory.recentSessions.at(-1);
  const lastDate = lastSession
    ? new Date(lastSession.date).toLocaleString()
    : "unknown";

  const sections: string[] = [
    `Project: ${memory.projectName}`,
  ];

  if (memory.description) sections.push(`Description: ${memory.description}`);
  if (memory.stack.length) sections.push(`Stack: ${memory.stack.join(", ")}`);
  if (memory.currentFocus) sections.push(`Current focus: ${memory.currentFocus}`);

  if (memory.pendingTasks.length) {
    sections.push(`Pending tasks:\n${memory.pendingTasks.map((t) => `- ${t}`).join("\n")}`);
  }

  if (memory.keyDecisions.length) {
    sections.push(`Key decisions:\n${memory.keyDecisions.map((d) => `- ${d.decision} (${d.reason})`).join("\n")}`);
  }

  if (memory.gotchas.length) {
    sections.push(`Gotchas to avoid:\n${memory.gotchas.map((g) => `- ${g}`).join("\n")}`);
  }

  if (memory.importantFiles.length) {
    sections.push(`Important files:\n${memory.importantFiles.map((f) => `- ${f.filePath}: ${f.purpose}`).join("\n")}`);
  }

  if (lastSession) {
    sections.push(`Last session (${lastDate}):\n${lastSession.summary}`);
  }

  return [
    "# Memex — Session Context",
    "",
    "> This file was written by Memex before this session started.",
    "> **When you start, read this fully, then immediately say:**",
    "> _\"Continuing from our last session — [one sentence on where we left off]. Here's what I have in memory: [brief summary]. What would you like to work on?\"_",
    "",
    "---",
    "",
    sections.join("\n\n"),
  ].join("\n");
}

/**
 * Write resume context to a markdown file so it can be read cleanly
 * without being piped through stdin (which causes formatting issues).
 * Includes the recent conversation history if available, simulating
 * Claude's --resume behaviour without relying on server-side sessions.
 */
const CLAUDE_MD_CHAR_LIMIT = 35000; // Stay safely under Claude's 40k warning
const MAX_TURNS_IN_CLAUDE_MD = 10;   // Last N turns of conversation to inject
const MAX_TURN_CHARS = 1500;         // Truncate individual long turns

export function writeResumeFile(memory: ProjectMemory, filePath: string): void {
  const fs = require("fs") as typeof import("fs");
  const lines: string[] = [buildResumePrompt(memory)];

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

  // Hard cap — truncate from the bottom (trim conversation history, keep memory)
  let content = lines.join("\n");
  if (content.length > CLAUDE_MD_CHAR_LIMIT) {
    content = content.slice(0, CLAUDE_MD_CHAR_LIMIT);
    // Ensure we don't cut mid-line
    const lastNewline = content.lastIndexOf("\n");
    if (lastNewline > CLAUDE_MD_CHAR_LIMIT * 0.8) {
      content = content.slice(0, lastNewline);
    }
    content += "\n\n> [Memex: conversation history truncated to fit size limit]";
  }

  fs.writeFileSync(filePath, content, "utf-8");
}
