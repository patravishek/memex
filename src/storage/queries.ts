import Database from "better-sqlite3";
import * as path from "path";
import { ProjectMemory, KeyDecision, ImportantFile } from "../memory/store.js";
import { ConversationTurn } from "../core/session-logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionRow {
  id: number;
  project_path: string;
  agent: string;
  started_at: string;
  ended_at: string | null;
  summary: string;
  log_file: string | null;
}

export interface SessionDetail extends SessionRow {
  turns: ConversationTurn[];
}

export interface SearchResult extends SessionRow {
  snippet: string;
}

// ─── Project ─────────────────────────────────────────────────────────────────

export function getProject(
  db: Database.Database,
  projectPath: string
): ProjectMemory | null {
  const row = db
    .prepare("SELECT * FROM project WHERE path = ?")
    .get(projectPath) as Record<string, string> | undefined;

  if (!row) return null;

  const recentSessions = listSessions(db, projectPath, 5).map((s) => ({
    date: s.ended_at ?? s.started_at,
    summary: s.summary,
    logFile: s.log_file ?? "",
  }));

  const lastSession = recentSessions.at(-1);
  let lastConversation: ConversationTurn[] = [];

  const latestSession = listSessions(db, projectPath, 1)[0];
  if (latestSession) {
    lastConversation = getTurns(db, latestSession.id);
  }

  return {
    projectName: row.name,
    projectPath: row.path,
    description: row.description,
    stack: parseJson<string[]>(row.stack, []),
    currentFocus: row.current_focus,
    pendingTasks: parseJson<string[]>(row.pending_tasks, []),
    gotchas: parseJson<string[]>(row.gotchas, []),
    importantFiles: parseJson<ImportantFile[]>(row.important_files, []),
    keyDecisions: parseJson<KeyDecision[]>(row.key_decisions, []),
    recentSessions,
    lastConversation,
    focusHistory: parseJson<string[]>(row.focus_history, []),
    lastUpdated: row.updated_at,
  };
}

export function upsertProject(
  db: Database.Database,
  memory: ProjectMemory
): void {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO project
      (path, name, description, stack, current_focus, focus_history,
       pending_tasks, gotchas, important_files, key_decisions,
       last_conversation, created_at, updated_at)
    VALUES
      (@path, @name, @description, @stack, @current_focus, @focus_history,
       @pending_tasks, @gotchas, @important_files, @key_decisions,
       @last_conversation, @created_at, @updated_at)
    ON CONFLICT(path) DO UPDATE SET
      name              = excluded.name,
      description       = excluded.description,
      stack             = excluded.stack,
      current_focus     = excluded.current_focus,
      focus_history     = excluded.focus_history,
      pending_tasks     = excluded.pending_tasks,
      gotchas           = excluded.gotchas,
      important_files   = excluded.important_files,
      key_decisions     = excluded.key_decisions,
      last_conversation = excluded.last_conversation,
      updated_at        = excluded.updated_at
  `).run({
    path: memory.projectPath,
    name: memory.projectName,
    description: memory.description,
    stack: JSON.stringify(memory.stack),
    current_focus: memory.currentFocus,
    focus_history: JSON.stringify(memory.focusHistory ?? []),
    pending_tasks: JSON.stringify(memory.pendingTasks),
    gotchas: JSON.stringify(memory.gotchas),
    important_files: JSON.stringify(memory.importantFiles),
    key_decisions: JSON.stringify(memory.keyDecisions),
    last_conversation: JSON.stringify(memory.lastConversation ?? []),
    created_at: now,
    updated_at: now,
  });
}

export function deleteProject(
  db: Database.Database,
  projectPath: string
): void {
  // Cascade via FK: sessions → conversation_turns
  const sessionIds = db
    .prepare("SELECT id FROM sessions WHERE project_path = ?")
    .all(projectPath) as { id: number }[];

  for (const { id } of sessionIds) {
    db.prepare("DELETE FROM conversation_turns WHERE session_id = ?").run(id);
  }

  db.prepare("DELETE FROM sessions WHERE project_path = ?").run(projectPath);
  db.prepare("DELETE FROM project WHERE path = ?").run(projectPath);
}

export function projectExists(
  db: Database.Database,
  projectPath: string
): boolean {
  const row = db
    .prepare("SELECT 1 FROM project WHERE path = ?")
    .get(projectPath);
  return row !== undefined;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export function createSession(
  db: Database.Database,
  projectPath: string,
  agent: string
): number {
  // Ensure a project row exists (may not exist on very first run)
  const exists = projectExists(db, projectPath);
  if (!exists) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO project
        (path, name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(projectPath, path.basename(projectPath), now, now);
  }

  const result = db.prepare(`
    INSERT INTO sessions (project_path, agent, started_at)
    VALUES (?, ?, ?)
  `).run(projectPath, agent, new Date().toISOString());

  return result.lastInsertRowid as number;
}

export function finalizeSession(
  db: Database.Database,
  sessionId: number,
  summary: string,
  logFile: string,
  turns: ConversationTurn[]
): void {
  db.prepare(`
    UPDATE sessions
    SET ended_at = ?, summary = ?, log_file = ?
    WHERE id = ?
  `).run(new Date().toISOString(), summary, logFile, sessionId);

  if (turns.length > 0) {
    const insert = db.prepare(`
      INSERT INTO conversation_turns (session_id, role, content, ts)
      VALUES (?, ?, ?, ?)
    `);

    const insertMany = db.transaction((rows: ConversationTurn[]) => {
      for (const t of rows) {
        insert.run(sessionId, t.role, t.content, t.ts);
      }
    });

    insertMany(turns);
  }
}

export function listSessions(
  db: Database.Database,
  projectPath?: string,
  limit = 20
): SessionRow[] {
  if (projectPath) {
    return db
      .prepare(
        "SELECT * FROM sessions WHERE project_path = ? ORDER BY started_at DESC LIMIT ?"
      )
      .all(projectPath, limit) as SessionRow[];
  }

  return db
    .prepare("SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?")
    .all(limit) as SessionRow[];
}

export function getSession(
  db: Database.Database,
  sessionId: number
): SessionDetail | null {
  const row = db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId) as SessionRow | undefined;

  if (!row) return null;
  return { ...row, turns: getTurns(db, sessionId) };
}

export function getTurns(
  db: Database.Database,
  sessionId: number
): ConversationTurn[] {
  return db
    .prepare(
      "SELECT role, content, ts FROM conversation_turns WHERE session_id = ? ORDER BY ts ASC"
    )
    .all(sessionId) as ConversationTurn[];
}

// ─── Search ───────────────────────────────────────────────────────────────────

export function searchSessions(
  db: Database.Database,
  query: string,
  projectPath?: string
): SearchResult[] {
  // FTS5 snippet() for highlighted excerpts
  const ftsQuery = query
    .trim()
    .split(/\s+/)
    .map((w) => `"${w.replace(/"/g, '""')}"`)
    .join(" OR ");

  if (projectPath) {
    return db.prepare(`
      SELECT s.*, snippet(sessions_fts, 0, '[', ']', '...', 12) AS snippet
      FROM sessions_fts
      JOIN sessions s ON s.id = sessions_fts.rowid
      WHERE sessions_fts MATCH ?
        AND s.project_path = ?
      ORDER BY rank
      LIMIT 20
    `).all(ftsQuery, projectPath) as SearchResult[];
  }

  return db.prepare(`
    SELECT s.*, snippet(sessions_fts, 0, '[', ']', '...', 12) AS snippet
    FROM sessions_fts
    JOIN sessions s ON s.id = sessions_fts.rowid
    WHERE sessions_fts MATCH ?
    ORDER BY rank
    LIMIT 20
  `).all(ftsQuery) as SearchResult[];
}

// ─── Migration ────────────────────────────────────────────────────────────────

/**
 * Import an existing memory.json into the DB.
 * Called once on first open when a legacy file is found.
 */
export function migrateFromJson(
  db: Database.Database,
  memory: ProjectMemory
): void {
  upsertProject(db, memory);

  // Seed recentSessions as session rows so history is preserved
  for (const s of memory.recentSessions ?? []) {
    const res = db.prepare(`
      INSERT INTO sessions (project_path, agent, started_at, ended_at, summary, log_file)
      VALUES (?, 'unknown', ?, ?, ?, ?)
    `).run(
      memory.projectPath,
      s.date,
      s.date,
      s.summary,
      s.logFile ?? null
    );

    // Seed last conversation into most recent migrated session
    const isLast =
      s === memory.recentSessions[memory.recentSessions.length - 1];
    if (isLast && memory.lastConversation?.length) {
      finalizeSession(
        db,
        res.lastInsertRowid as number,
        s.summary,
        s.logFile ?? "",
        memory.lastConversation
      );
    }
  }
}

// ─── Retention ────────────────────────────────────────────────────────────────

/**
 * Delete sessions (and their turns) older than `days` days.
 * Raw JSONL log files are NOT deleted — callers handle that separately.
 */
export function pruneOldSessions(
  db: Database.Database,
  projectPath: string,
  keepDays: number
): number {
  const cutoff = new Date(
    Date.now() - keepDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const old = db
    .prepare(
      "SELECT id FROM sessions WHERE project_path = ? AND started_at < ?"
    )
    .all(projectPath, cutoff) as { id: number }[];

  for (const { id } of old) {
    db.prepare("DELETE FROM conversation_turns WHERE session_id = ?").run(id);
  }

  const result = db
    .prepare("DELETE FROM sessions WHERE project_path = ? AND started_at < ?")
    .run(projectPath, cutoff);

  return result.changes;
}

// ─── Observations ─────────────────────────────────────────────────────────────

export type ObservationType = "note" | "task" | "decision" | "gotcha";

export interface ObservationRow {
  id: number;
  project_path: string;
  session_id: number | null;
  type: ObservationType;
  content: string;
  source: "agent" | "user";
  created_at: string;
}

export function saveObservation(
  db: Database.Database,
  projectPath: string,
  type: ObservationType,
  content: string,
  sessionId?: number,
  source: "agent" | "user" = "agent"
): number {
  // Ensure a project row exists — the FK constraint requires it.
  // Mirrors the same guard in createSession so save_observation is always safe
  // to call even on a project that has never had a full memex start/resume.
  if (!projectExists(db, projectPath)) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO project
        (path, name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(projectPath, path.basename(projectPath), now, now);
  }

  const result = db.prepare(`
    INSERT INTO observations (project_path, session_id, type, content, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(projectPath, sessionId ?? null, type, content, source, new Date().toISOString());
  return result.lastInsertRowid as number;
}

export function getObservations(
  db: Database.Database,
  projectPath: string,
  type?: ObservationType
): ObservationRow[] {
  if (type) {
    return db.prepare(
      "SELECT * FROM observations WHERE project_path = ? AND type = ? ORDER BY created_at DESC"
    ).all(projectPath, type) as ObservationRow[];
  }
  return db.prepare(
    "SELECT * FROM observations WHERE project_path = ? ORDER BY created_at DESC"
  ).all(projectPath) as ObservationRow[];
}

export function clearObservations(
  db: Database.Database,
  projectPath: string
): void {
  db.prepare("DELETE FROM observations WHERE project_path = ?").run(projectPath);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
