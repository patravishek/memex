import * as fs from "fs";
import * as path from "path";
import { ConversationTurn } from "../core/session-logger.js";
import { getDb } from "../storage/db.js";
import {
  getProject,
  upsertProject,
  deleteProject,
  projectExists,
  migrateFromJson,
} from "../storage/queries.js";

export interface KeyDecision {
  decision: string;
  reason: string;
  date: string;
}

export interface ImportantFile {
  filePath: string;
  purpose: string;
}

export interface RecentSession {
  date: string;
  summary: string;
  logFile: string;
}

export interface ProjectMemory {
  projectName: string;
  projectPath: string;
  stack: string[];
  description: string;
  keyDecisions: KeyDecision[];
  currentFocus: string;
  /**
   * Rolling history of past focus topics (max 10, newest last).
   * Populated whenever currentFocus changes — either via --focus flag or
   * by AI compression detecting a topic shift.
   */
  focusHistory: string[];
  pendingTasks: string[];
  importantFiles: ImportantFile[];
  /** Things that went wrong or surprised us — prevents repeating mistakes */
  gotchas: string[];
  recentSessions: RecentSession[];
  /**
   * Last N conversation turns from the most recent session.
   * Used to simulate Claude's --resume without relying on server-side
   * session storage that expires. Never expires, works across machines.
   */
  lastConversation: ConversationTurn[];
  lastUpdated: string;
}

const LEGACY_MEMORY_FILE = "memory.json";

export function getMemexDir(projectPath: string): string {
  return path.join(projectPath, ".memex");
}

export function memoryExists(projectPath: string): boolean {
  const memexDir = getMemexDir(projectPath);
  const db = getDb(memexDir);
  return projectExists(db, projectPath);
}

export function loadMemory(projectPath: string): ProjectMemory | null {
  const memexDir = getMemexDir(projectPath);
  const db = getDb(memexDir);

  // Auto-migrate legacy memory.json on first access
  const legacyPath = path.join(memexDir, LEGACY_MEMORY_FILE);
  if (!projectExists(db, projectPath) && fs.existsSync(legacyPath)) {
    try {
      const legacy = JSON.parse(
        fs.readFileSync(legacyPath, "utf-8")
      ) as ProjectMemory;
      migrateFromJson(db, legacy);
      fs.renameSync(legacyPath, legacyPath + ".bak");
    } catch {
      // If migration fails, continue — worst case is a fresh start
    }
  }

  return getProject(db, projectPath);
}

export function saveMemory(
  projectPath: string,
  memory: ProjectMemory
): void {
  const memexDir = getMemexDir(projectPath);
  fs.mkdirSync(memexDir, { recursive: true });
  memory.lastUpdated = new Date().toISOString();
  const db = getDb(memexDir);
  upsertProject(db, memory);
}

export function initMemory(projectPath: string): ProjectMemory {
  const memory: ProjectMemory = {
    projectName: path.basename(projectPath),
    projectPath,
    stack: [],
    description: "",
    keyDecisions: [],
    currentFocus: "",
    focusHistory: [],
    pendingTasks: [],
    importantFiles: [],
    gotchas: [],
    recentSessions: [],
    lastConversation: [],
    lastUpdated: new Date().toISOString(),
  };

  saveMemory(projectPath, memory);
  return memory;
}

const MAX_FOCUS_HISTORY = 10;

/**
 * Update currentFocus and push the previous value to focusHistory.
 * Pass an empty string to clear focus entirely.
 * Safe to call with the same value — no-ops if focus hasn't changed.
 */
export function setFocus(projectPath: string, topic: string): ProjectMemory {
  const memory = loadMemory(projectPath) ?? initMemory(projectPath);
  const prev = memory.currentFocus ?? "";

  if (prev === topic) return memory; // no change

  if (prev && !memory.focusHistory?.includes(prev)) {
    memory.focusHistory = [
      ...(memory.focusHistory ?? []),
      prev,
    ].slice(-MAX_FOCUS_HISTORY);
  }

  memory.currentFocus = topic;
  memory.lastUpdated = new Date().toISOString();
  saveMemory(projectPath, memory);
  return memory;
}

export function clearMemory(
  projectPath: string,
  keepSessions = false
): void {
  const memexDir = getMemexDir(projectPath);
  const db = getDb(memexDir);

  if (keepSessions) {
    // Only wipe project metadata, leave session history intact
    const blank = initMemory(projectPath);
    upsertProject(db, blank);
  } else {
    deleteProject(db, projectPath);
  }
}

export function formatMemoryForPrompt(memory: ProjectMemory): string {
  const lines: string[] = [];

  lines.push(`Project: ${memory.projectName}`);
  lines.push(`Path: ${memory.projectPath}`);

  if (memory.description) {
    lines.push(`\nWhat this project does:\n${memory.description}`);
  }

  if (memory.stack.length > 0) {
    lines.push(`\nTech stack: ${memory.stack.join(", ")}`);
  }

  if (memory.currentFocus) {
    lines.push(`\nCurrent focus: ${memory.currentFocus}`);
  }

  if (memory.pendingTasks.length > 0) {
    lines.push("\nPending tasks:");
    memory.pendingTasks.forEach((t) => lines.push(`  - ${t}`));
  }

  if (memory.keyDecisions.length > 0) {
    lines.push("\nKey decisions made:");
    memory.keyDecisions.forEach((d) =>
      lines.push(`  - ${d.decision} (reason: ${d.reason})`)
    );
  }

  if (memory.importantFiles.length > 0) {
    lines.push("\nImportant files:");
    memory.importantFiles.forEach((f) =>
      lines.push(`  - ${f.filePath}: ${f.purpose}`)
    );
  }

  if (memory.gotchas.length > 0) {
    lines.push("\nGotchas (things that tripped us up before):");
    memory.gotchas.forEach((g) => lines.push(`  - ${g}`));
  }

  if (memory.recentSessions.length > 0) {
    const last = memory.recentSessions[memory.recentSessions.length - 1];
    lines.push(`\nLast session (${last.date}):\n${last.summary}`);
  }

  return lines.join("\n");
}

// ─── Git protection ───────────────────────────────────────────────────────────

const GITIGNORE_ENTRIES = [".memex/", ".mcp.json"];
const GITIGNORE_BLOCK_START = "# Memex — auto-added";
const GITIGNORE_BLOCK_END = "# end Memex";

/**
 * Ensure the project's .gitignore contains entries to exclude Memex artefacts.
 * Safe to call on every `start` and `resume` — idempotent.
 * Returns true if .gitignore was modified, false if it was already up to date.
 */
export function ensureGitignore(projectPath: string): boolean {
  const gitignorePath = path.join(projectPath, ".gitignore");
  const existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf-8")
    : "";

  // Already has the block — nothing to do
  if (existing.includes(GITIGNORE_BLOCK_START)) return false;

  // Filter to only entries not already present line-by-line
  const missing = GITIGNORE_ENTRIES.filter(
    (entry) => !existing.split("\n").some((line) => line.trim() === entry)
  );
  if (missing.length === 0) return false;

  const block = [
    "",
    GITIGNORE_BLOCK_START,
    ...missing,
    GITIGNORE_BLOCK_END,
    "",
  ].join("\n");

  fs.writeFileSync(gitignorePath, existing + block, "utf-8");
  return true;
}
