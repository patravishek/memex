# Memex Roadmap

This document outlines the planned evolution of Memex. Features are grouped by milestone. Priorities may shift based on community feedback.

> **Current version:** v0.3.0  
> **Core value prop:** Agent-agnostic persistent memory — works with Claude, GPT, Aider, or any CLI agent. Simple install, no heavy dependencies, enterprise-ready via LiteLLM.

Contributions welcome. If a feature matters to you, open an issue or a PR.

---

## ✅ v0.2 — Persistent Storage & Search

> Replace flat JSON with a proper database. Make memory queryable.

**Why:** `memory.json` works for a single project but doesn't scale. As sessions accumulate, you can't search history, query past decisions, or see what happened across projects. SQLite gives us all of that with zero new infrastructure.

- [x] **SQLite storage** — migrated from `memory.json` to `.memex/memex.db` (WAL mode, FTS5 full-text index)
- [x] **Backwards compatibility** — `memory.json` auto-migrated to SQLite on first run; original renamed to `memory.json.bak`
- [x] **`memex search <query>`** — FTS5 full-text search across session summaries with highlighted snippets
- [x] **`memex history`** — list past sessions with dates, durations, agent, and one-line summaries
- [x] **`memex show <session-id>`** — view full session details including every recorded conversation turn
- [x] **Retention policy** — `memex prune [days]` to delete session records older than N days (default: 30)

---

## ✅ v0.3 — MCP Server

> Expose Memex memory as MCP tools so agents pull context on demand instead of receiving a full dump.

**Why:** Injecting 35k chars of context into `CLAUDE.md` wastes tokens and triggers Claude's performance warning. An MCP server lets the agent query memory like a database — asking for exactly what it needs, when it needs it.

- [x] **`memex serve`** — stdio MCP server exposing all memory as tools (zero network traffic; runs as agent subprocess)
- [x] **`get_context`** tool — project name, description, stack, current focus
- [x] **`get_tasks`** tool — pending tasks (memory + mid-session observations)
- [x] **`get_decisions`** tool — key decisions with reasons
- [x] **`get_gotchas`** tool — known pitfalls and mistakes to avoid
- [x] **`get_important_files`** tool — files worth knowing about
- [x] **`get_recent_conversation`** tool — last N conversation turns from previous session
- [x] **`search_sessions`** tool — FTS search across all session summaries
- [x] **`get_session`** tool — full detail of any past session by ID
- [x] **`save_observation`** tool — save notes, tasks, decisions, gotchas mid-session without waiting for compression
- [x] **Auto-start on `memex resume`** — generates `.mcp.json` + short CLAUDE.md hint (~500 chars, no performance warning); `--no-mcp` flag for legacy full-dump behaviour
- [x] **`memex setup-mcp`** — generate `.mcp.json` permanently; `--global` flag writes to `~/.claude/mcp.json`
- [x] **`observations` table** — schema migration v2; mid-session saves persist immediately and roll into compression

---

## v0.4 — Progressive Context Injection

> Stop dumping all memory at once. Layer context intelligently to save tokens.

**Why:** Injecting everything into the first message is expensive and noisy. Most sessions only need a fraction of the stored memory. Progressive disclosure — inject a compact summary first, let the agent request more — is significantly more token-efficient on large or long-running projects.

- [ ] **Tiered injection** — inject a 3-level summary: one-liner → key facts → full context
- [ ] **Token budget option** — `--max-tokens <n>` flag to cap how much context is injected
- [ ] **Relevance scoring** — surface the most recently touched areas first, not just everything
- [ ] **`<memex:skip>` tag** — any content wrapped in this tag is excluded from compression and injection (privacy control)
- [ ] **Focus-aware injection** — if a session starts with a specific task ("fix the login bug"), inject only memory relevant to that area

---

## v0.5 — Web UI

> A local dashboard for browsing and editing project memory without touching JSON.

**Why:** JSON files are fine for developers but awkward for anyone else. A lightweight local UI makes memory visible and editable — useful for teams where PMs or non-technical members need to see or contribute project context.

- [ ] **`memex ui`** — open a local web dashboard (no cloud, no account)
- [ ] **Memory viewer** — browse current memory, all fields, last updated
- [ ] **Session browser** — scroll through past sessions, read transcripts, view summaries
- [ ] **Inline editing** — edit `currentFocus`, `pendingTasks`, `gotchas` directly in the UI
- [ ] **Session diff view** — see what changed in memory between sessions
- [ ] **Export** — download memory as JSON or Markdown from the UI

---

## v0.6 — Agent Lifecycle Hooks

> Move beyond PTY wrapping to proper agent integration points.

**Why:** PTY + `script` works but is a blunt instrument. Proper lifecycle hooks — fired before/after sessions, on specific agent events — give Memex cleaner integration and enable capabilities like real-time observation capture that PTY can't do.

- [ ] **Claude Code hooks** — integrate with Claude Code's native hook system (`SessionStart`, `SessionEnd`, `PostToolUse`)
- [ ] **Generic hook interface** — `memex hook:pre` and `memex hook:post` for use in any agent's config
- [ ] **Webhook support** — fire an HTTP webhook on session end (useful for CI/CD, Slack notifications, etc.)
- [ ] **Mid-session snapshots** — save memory checkpoints every N minutes, not just on exit
- [ ] **Git-aware compression** — diff the git state before/after a session and include changed files in memory

---

## v1.0 — Semantic Memory & Vector Search

> Embed sessions into vectors. Make memory genuinely intelligent.

**Why:** Full-text search finds exact words. Semantic search finds meaning — "when did we have that authentication problem" returns relevant results even if the word "authentication" never appeared. This is the capability that makes memory genuinely useful on large, long-running projects.

- [ ] **Local embeddings** — generate vector embeddings for session content using a local model (no API cost)
- [ ] **Semantic search** — `memex search "why did we switch databases"` returns relevant past sessions by meaning
- [ ] **Hybrid search** — combine semantic + full-text for best results
- [ ] **Related context** — when resuming, surface sessions semantically related to what was just committed
- [ ] **Cross-project memory** — optional global memory store shared across all projects (opt-in)
- [ ] **Memory deduplication** — detect and merge duplicate or contradictory entries

---

## Ongoing / Across All Versions

- [ ] **Linux support** — replace `script` command with a cross-platform alternative
- [ ] **Windows support** — investigate WSL-based approach
- [ ] **`memex doctor`** — diagnose common setup issues (missing API key, broken install, etc.)
- [ ] **Shell completions** — bash/zsh tab completion for all commands
- [ ] **Homebrew core submission** — once traction is established, submit to `homebrew-core` for single-command install

---

## Not Planned (by design)

These are intentionally out of scope to keep Memex simple and dependency-light:

- **Cloud sync / hosted memory** — memory stays local by default; no account, no SaaS
- **Claude-only integration** — Memex will always support any CLI agent
- **Heavy runtime requirements** — no mandatory Bun, uv, or vector database install for basic use

---

## Contributing

If you want to work on any of these, open a GitHub issue to claim it before starting. This avoids duplicate effort and lets us discuss the approach upfront.

See [CONTRIBUTING.md](CONTRIBUTING.md) (coming soon) for development setup and PR guidelines.
