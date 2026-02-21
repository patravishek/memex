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
    const updated = JSON.parse(response) as ProjectMemory;
    saveMemory(projectPath, updated);
    return updated;
  } catch {
    // If AI response fails to parse, at least save a basic session entry
    existing.recentSessions.push({
      date: new Date().toISOString(),
      summary: "Session recorded but compression failed — raw log preserved.",
      logFile,
    });
    if (existing.recentSessions.length > 5) {
      existing.recentSessions = existing.recentSessions.slice(-5);
    }
    saveMemory(projectPath, existing);
    return existing;
  }
}

export function buildResumePrompt(memory: ProjectMemory): string {
  return `[MEMEX CONTEXT - DO NOT REPEAT THIS BACK]
You have previously worked on this project. Here is your memory:

Project: ${memory.projectName}
Description: ${memory.description || "Not yet recorded"}
Stack: ${memory.stack.join(", ") || "Not yet recorded"}
Current focus: ${memory.currentFocus || "Not specified"}

Pending tasks:
${memory.pendingTasks.map((t) => `- ${t}`).join("\n") || "None recorded"}

Key decisions:
${memory.keyDecisions.map((d) => `- ${d.decision} (${d.reason})`).join("\n") || "None recorded"}

Gotchas to avoid:
${memory.gotchas.map((g) => `- ${g}`).join("\n") || "None recorded"}

Important files:
${memory.importantFiles.map((f) => `- ${f.filePath}: ${f.purpose}`).join("\n") || "None recorded"}

Last session (${memory.recentSessions.at(-1)?.date ?? "unknown"}):
${memory.recentSessions.at(-1)?.summary ?? "No previous session"}

Please acknowledge this context briefly and ask how to continue.`;
}
