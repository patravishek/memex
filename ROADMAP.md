# Memex Roadmap

This document outlines the planned evolution of Memex. Features are grouped by milestone. Priorities may shift based on community feedback.

> **Current version:** v0.1.0  
> **Core value prop:** Agent-agnostic persistent memory — works with Claude, GPT, Aider, or any CLI agent. Simple install, no heavy dependencies, enterprise-ready via LiteLLM.

Contributions welcome. If a feature matters to you, open an issue or a PR.

---

## v0.2 — Persistent Storage & Search

> Replace flat JSON with a proper database. Make memory queryable.

**Why:** `memory.json` works for a single project but doesn't scale. As sessions accumulate, you can't search history, query past decisions, or see what happened across projects. SQLite gives us all of that with zero new infrastructure.

- [ ] **SQLite storage** — migrate from `memory.json` to a local SQLite database per project (`.memex/memex.db`)
- [ ] **Backwards compatibility** — auto-migrate existing `memory.json` on first run, keep JSON export available
- [ ] **`memex search <query>`** — full-text search across all session logs and memory entries
- [ ] **`memex history`** — list past sessions with dates, durations, and one-line summaries
- [ ] **`memex show <session-id>`** — view full details of any past session
- [ ] **Retention policy** — configurable auto-cleanup of raw session logs older than N days

---

## v0.3 — MCP Server

> Expose Memex memory as MCP tools so agents can pull context on demand instead of receiving a full dump.

**Why:** The current approach injects the entire memory blob as the first message. This wastes context tokens and gives the agent no control over what it retrieves. An MCP server lets the agent query memory like a database — asking for exactly what it needs, when it needs it.

- [ ] **`memex serve`** — start a local MCP server exposing memory tools
- [ ] **`memex:search`** tool — semantic + keyword search across session history
- [ ] **`memex:get_context`** tool — retrieve current project summary and focus
- [ ] **`memex:get_decisions`** tool — fetch key decisions made on this project
- [ ] **`memex:get_gotchas`** tool — fetch known pitfalls and mistakes to avoid
- [ ] **`memex:save`** tool — let the agent manually save important observations mid-session
- [ ] **Auto-start MCP server** on `memex resume` and register it with the agent session
- [ ] **MCP config snippet** — auto-generate `.mcp.json` or equivalent for quick agent setup

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
