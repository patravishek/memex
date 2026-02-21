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
    "Memex context (your memory from previous sessions):",
    "",
    sections.join("\n\n"),
    "",
    "Please acknowledge this briefly and ask how to continue.",
  ].join("\n");
}

/**
 * Write resume context to a markdown file so it can be read cleanly
 * without being piped through stdin (which causes formatting issues).
 * Includes the recent conversation history if available, simulating
 * Claude's --resume behaviour without relying on server-side sessions.
 */
export function writeResumeFile(memory: ProjectMemory, filePath: string): void {
  const fs = require("fs") as typeof import("fs");
  const lines: string[] = [buildResumePrompt(memory)];

  if (memory.lastConversation && memory.lastConversation.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(
      `Recent conversation history (last ${memory.lastConversation.length} turns from previous session):`
    );
    lines.push("");
    lines.push(
      "Use this to understand exactly where we left off, as if the session never ended."
    );
    lines.push("");

    for (const turn of memory.lastConversation) {
      const label = turn.role === "user" ? "Human" : "Assistant";
      lines.push(`**${label}:** ${turn.content}`);
      lines.push("");
    }
  }

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}
