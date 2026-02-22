import { ProjectMemory, KeyDecision, ImportantFile } from "./store.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * How much context to inject.
 *
 * Tier 1 — one-liner (< 200 chars):
 *   Project name + current focus + last session date.
 *   Used for MCP hint (agent pulls detail via tools).
 *
 * Tier 2 — key facts (< 1500 chars):
 *   + tech stack + top 3 pending tasks + top 3 gotchas.
 *   Good default for --no-mcp with small projects.
 *
 * Tier 3 — full context (no internal limit before token budget):
 *   Everything: decisions, important files, conversation history.
 *   Legacy behaviour (v0.1/v0.2).
 */
export type ContextTier = 1 | 2 | 3;

export interface ContextOptions {
  /** How verbose the injected context should be (default: 3) */
  tier?: ContextTier;
  /**
   * Approximate token budget. Context is truncated to fit.
   * Rough estimate: 1 token ≈ 4 chars.
   * Default: no limit (4096 token soft cap).
   */
  maxTokens?: number;
  /**
   * Free-text focus hint. When provided, memory fields are scored and
   * sorted by relevance to the focus — items that mention keywords from
   * the focus string come first. Irrelevant items are deprioritised but
   * not dropped (they may still fit within the token budget).
   */
  focus?: string;
}

// ─── Estimation ───────────────────────────────────────────────────────────────

/** Rough token estimate: 1 token ≈ 4 chars (conservative for code). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function tokensToChars(tokens: number): number {
  return tokens * 4;
}

// ─── Relevance scoring ────────────────────────────────────────────────────────

/**
 * Score a string against a focus query.
 * Returns a number 0–N where N is the number of matching keywords.
 */
function scoreRelevance(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
}

function focusKeywords(focus: string): string[] {
  return focus
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** Sort an array of strings by relevance to focus (highest first). */
function sortByRelevance(items: string[], keywords: string[]): string[] {
  if (!keywords.length) return items;
  return [...items].sort(
    (a, b) => scoreRelevance(b, keywords) - scoreRelevance(a, keywords)
  );
}

function sortDecisionsByRelevance(
  items: KeyDecision[],
  keywords: string[]
): KeyDecision[] {
  if (!keywords.length) return items;
  return [...items].sort(
    (a, b) =>
      scoreRelevance(`${b.decision} ${b.reason}`, keywords) -
      scoreRelevance(`${a.decision} ${a.reason}`, keywords)
  );
}

function sortFilesByRelevance(
  items: ImportantFile[],
  keywords: string[]
): ImportantFile[] {
  if (!keywords.length) return items;
  return [...items].sort(
    (a, b) =>
      scoreRelevance(`${b.filePath} ${b.purpose}`, keywords) -
      scoreRelevance(`${a.filePath} ${a.purpose}`, keywords)
  );
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build a context string from project memory.
 *
 * Tiers control verbosity. Token budget truncates the result.
 * Focus reorders items so the most relevant appear first (and thus
 * survive truncation if the budget is tight).
 */
export function buildContext(
  memory: ProjectMemory,
  opts: ContextOptions = {}
): string {
  const tier = opts.tier ?? 3;
  const charLimit = opts.maxTokens
    ? tokensToChars(opts.maxTokens)
    : tier === 1 ? 300
    : tier === 2 ? 2000
    : 35000;
  const keywords = opts.focus ? focusKeywords(opts.focus) : [];

  const parts: string[] = [];

  // ── Tier 1: one-liner orientation ─────────────────────────────────────────
  const lastSession = memory.recentSessions.at(-1);
  const lastDate = lastSession
    ? new Date(lastSession.date).toLocaleDateString()
    : null;

  const oneLiner = [
    `Project: ${memory.projectName}`,
    memory.currentFocus ? `Focus: ${memory.currentFocus}` : null,
    lastDate ? `Last session: ${lastDate}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  parts.push(oneLiner);

  if (tier === 1) {
    return applyLimit(parts.join("\n"), charLimit);
  }

  // ── Tier 2: key facts ─────────────────────────────────────────────────────
  if (memory.description) {
    parts.push(`\nWhat this project does:\n${memory.description}`);
  }

  if (memory.stack.length) {
    parts.push(`\nStack: ${memory.stack.join(", ")}`);
  }

  const tasks = sortByRelevance(memory.pendingTasks, keywords);
  const topTasks = tier === 2 ? tasks.slice(0, 3) : tasks;
  if (topTasks.length) {
    parts.push(`\nPending tasks:\n${topTasks.map((t) => `- ${t}`).join("\n")}`);
    if (tier === 2 && tasks.length > 3) {
      parts.push(`  … and ${tasks.length - 3} more (use get_tasks() for full list)`);
    }
  }

  const gotchas = sortByRelevance(memory.gotchas, keywords);
  const topGotchas = tier === 2 ? gotchas.slice(0, 3) : gotchas;
  if (topGotchas.length) {
    parts.push(
      `\nGotchas:\n${topGotchas.map((g) => `- ${g}`).join("\n")}`
    );
    if (tier === 2 && gotchas.length > 3) {
      parts.push(`  … and ${gotchas.length - 3} more (use get_gotchas() for full list)`);
    }
  }

  if (lastSession) {
    parts.push(`\nLast session (${lastDate}):\n${lastSession.summary}`);
  }

  if (tier === 2) {
    return applyLimit(parts.join("\n"), charLimit);
  }

  // ── Tier 3: full context ──────────────────────────────────────────────────
  const decisions = sortDecisionsByRelevance(memory.keyDecisions, keywords);
  if (decisions.length) {
    parts.push(
      `\nKey decisions:\n${decisions
        .map((d) => `- ${d.decision} (reason: ${d.reason})`)
        .join("\n")}`
    );
  }

  const files = sortFilesByRelevance(memory.importantFiles, keywords);
  if (files.length) {
    parts.push(
      `\nImportant files:\n${files.map((f) => `- ${f.filePath}: ${f.purpose}`).join("\n")}`
    );
  }

  return applyLimit(parts.join("\n"), charLimit);
}

/**
 * Build the full CLAUDE.md resume prompt with tier/budget/focus support.
 * Wraps buildContext with the Memex header and instruction block.
 */
export function buildResumeContent(
  memory: ProjectMemory,
  opts: ContextOptions = {}
): string {
  const tier = opts.tier ?? 3;
  const context = buildContext(memory, opts);

  const instruction =
    tier === 1
      ? "> Full memory available via MCP tools — call `get_context()` to start."
      : "> **When you start:** Read this fully, then say: _\"Continuing from our last session — [where we left off]. What would you like to work on?\"_";

  const focusNote = opts.focus
    ? `\n> Focus filter active: memory sorted by relevance to **"${opts.focus}"**`
    : "";

  return [
    "# Memex — Session Context",
    "",
    instruction,
    focusNote,
    "",
    "---",
    "",
    context,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Truncate text to charLimit, cutting at the last newline to avoid mid-line breaks.
 * Appends a note if truncation occurred.
 */
function applyLimit(text: string, charLimit: number): string {
  if (text.length <= charLimit) return text;

  const cut = text.slice(0, charLimit);
  const lastNewline = cut.lastIndexOf("\n");
  const trimmed =
    lastNewline > charLimit * 0.8 ? cut.slice(0, lastNewline) : cut;

  return trimmed + "\n\n> [Memex: context truncated to fit token budget]";
}
