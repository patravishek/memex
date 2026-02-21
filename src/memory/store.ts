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
