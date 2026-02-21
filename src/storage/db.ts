import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";

let _db: Database.Database | null = null;
let _dbPath: string | null = null;

/**
 * Returns a singleton DB connection for the given memex directory.
 * Switches to a new connection if the project path changes.
 */
export function getDb(memexDir: string): Database.Database {
  const dbPath = path.join(memexDir, "memex.db");

  if (_db && _dbPath === dbPath) return _db;

  if (_db) _db.close();

  fs.mkdirSync(memexDir, { recursive: true });
  _db = new Database(dbPath);
  _dbPath = dbPath;

  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  runMigrations(_db);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    _dbPath = null;
  }
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);

  const row = db
    .prepare(
      "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1"
    )
    .get() as { version: number } | undefined;
  const currentVersion = row?.version ?? 0;

  if (currentVersion < 1) {
    db.exec(`
      -- Core project metadata (one row per tracked project)
      CREATE TABLE IF NOT EXISTS project (
        path            TEXT PRIMARY KEY,
        name            TEXT NOT NULL DEFAULT '',
        description     TEXT NOT NULL DEFAULT '',
        stack           TEXT NOT NULL DEFAULT '[]',
        current_focus   TEXT NOT NULL DEFAULT '',
        pending_tasks   TEXT NOT NULL DEFAULT '[]',
        gotchas         TEXT NOT NULL DEFAULT '[]',
        important_files TEXT NOT NULL DEFAULT '[]',
        key_decisions   TEXT NOT NULL DEFAULT '[]',
        -- Cached last N turns for fast CLAUDE.md injection (JSON blob)
        last_conversation TEXT NOT NULL DEFAULT '[]',
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );

      -- One row per agent session (started/ended)
      CREATE TABLE IF NOT EXISTS sessions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        agent        TEXT NOT NULL DEFAULT 'claude',
        started_at   TEXT NOT NULL,
        ended_at     TEXT,
        summary      TEXT NOT NULL DEFAULT '',
        log_file     TEXT,
        FOREIGN KEY (project_path) REFERENCES project(path)
      );

      -- Individual conversation turns per session (for memex show / search)
      CREATE TABLE IF NOT EXISTS conversation_turns (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        role       TEXT NOT NULL,
        content    TEXT NOT NULL,
        ts         INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      -- FTS5 index over session summaries for memex search
      CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
        summary,
        content='sessions',
        content_rowid='id'
      );

      CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
        INSERT INTO sessions_fts(rowid, summary) VALUES (new.id, new.summary);
      END;

      CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
        INSERT INTO sessions_fts(sessions_fts, rowid, summary)
          VALUES('delete', old.id, old.summary);
      END;

      CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE OF summary ON sessions BEGIN
        INSERT INTO sessions_fts(sessions_fts, rowid, summary)
          VALUES('delete', old.id, old.summary);
        INSERT INTO sessions_fts(rowid, summary) VALUES (new.id, new.summary);
      END;

      INSERT INTO schema_version VALUES (1);
    `);
  }
}
