# Memex Roadmap

This document outlines the planned evolution of Memex. Features are grouped by milestone. Priorities may shift based on community feedback.

> **Current version:** v0.4.0  
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

## v0.4 — Progressive Context Injection ✅ (current)

> Stop dumping all memory at once. Layer context intelligently to save tokens.

**Why:** Injecting everything into the first message is expensive and noisy. Most sessions only need a fraction of the stored memory. Progressive disclosure — inject a compact summary first, let the agent request more — is significantly more token-efficient on large or long-running projects.

- [x] **Tiered injection** — `--tier 1|2|3`: one-liner → key facts → full context (default 3)
- [x] **Token budget option** — `--max-tokens <n>` flag to cap how much context is injected
- [x] **Relevance scoring** — `--focus "<topic>"` sorts tasks, gotchas, decisions by keyword relevance; items most related to the focus surface first (and survive if budget is tight)
- [x] **`<memex:skip>` tag** — any content in the session transcript wrapped with `<memex:skip>…</memex:skip>` is stripped before AI compression (privacy control)
- [x] **Focus-aware injection** — `--focus` works in both MCP and `--no-mcp` mode; also available as a `tier`/`focus` parameter on the `get_context()` MCP tool

---

## v0.5 — IDE Support

> Bring Memex memory to IDE-based AI agents — Cursor, Copilot, Windsurf, and beyond.

**Why:** Memex currently only wraps CLI agents (`claude`, `aider`, `sgpt`). Most developers use IDE-integrated AI — Cursor Agent, GitHub Copilot, Windsurf. These tools have no terminal process to intercept, so the PTY wrapping approach doesn't apply. A VS Code / Cursor extension can hook into the editor's AI conversation API and bring the same persistent memory experience to IDE workflows.

- [ ] **Cursor / VS Code extension** — `memex-vscode` extension published to the VS Code Marketplace and Open VSX
- [ ] **Session capture** — hook into the IDE's AI chat API to record conversations as Memex sessions
- [ ] **Context injection on chat open** — automatically inject a tier-1 or tier-2 context hint at the start of each new AI chat
- [ ] **MCP integration** — register Memex as an MCP server inside Cursor so `get_context()`, `get_tasks()`, `search_sessions()` are available to Cursor Agent natively
- [ ] **Focus panel** — a sidebar panel showing current focus, pending tasks, and recent sessions without leaving the editor
- [ ] **Inline `save_observation` command** — highlight any text in the editor and right-click → "Save to Memex memory" (saves as a note or decision)
- [ ] **End-of-chat compression** — when an AI chat session ends, trigger the same compression pipeline as the CLI to update `memex.db`
- [ ] **Unified memory** — CLI and IDE sessions share the same `.memex/memex.db` — switch between `claude` CLI and Cursor Agent on the same project without losing context

---

## v0.6 — Web UI

> A local dashboard for browsing and editing project memory without touching JSON.

**Why:** JSON files are fine for developers but awkward for anyone else. A lightweight local UI makes memory visible and editable — useful for teams where PMs or non-technical members need to see or contribute project context.

- [ ] **`memex ui`** — open a local web dashboard (no cloud, no account)
- [ ] **Memory viewer** — browse current memory, all fields, last updated
- [ ] **Session browser** — scroll through past sessions, read transcripts, view summaries
- [ ] **Inline editing** — edit `currentFocus`, `pendingTasks`, `gotchas` directly in the UI
- [ ] **Session diff view** — see what changed in memory between sessions
- [ ] **Export** — download memory as JSON or Markdown from the UI

---

## v0.7 — Agent Lifecycle Hooks

> Move beyond PTY wrapping to proper agent integration points.

**Why:** PTY + `script` works but is a blunt instrument. Proper lifecycle hooks — fired before/after sessions, on specific agent events — give Memex cleaner integration and enable capabilities like real-time observation capture that PTY can't do.

- [ ] **Claude Code hooks** — integrate with Claude Code's native hook system (`SessionStart`, `SessionEnd`, `PostToolUse`)
- [ ] **Generic hook interface** — `memex hook:pre` and `memex hook:post` for use in any agent's config
- [ ] **Webhook support** — fire an HTTP webhook on session end (useful for CI/CD, Slack notifications, etc.)
- [ ] **Mid-session snapshots** — save memory checkpoints every N minutes, not just on exit
- [ ] **Git-aware compression** — diff the git state before/after a session and include changed files in memory

---

## v0.8 — JetBrains Plugin

> Bring Memex memory to IntelliJ-based IDEs — IntelliJ IDEA, WebStorm, PyCharm, GoLand, and beyond.

**Why:** JetBrains IDEs are widely used by backend and polyglot developers. The VS Code extension covers the Cursor/Copilot audience, but a large portion of developers work exclusively in JetBrains tools. The core Memex logic (`.memex/memex.db`, `memex serve`, `save_observation`) is IDE-agnostic — only the integration layer needs to be rewritten in Kotlin using the IntelliJ Platform SDK.

- [ ] **`memex-intellij` plugin** — published to [JetBrains Marketplace](https://plugins.jetbrains.com)
- [ ] **Memory tool window** — sidebar panel showing current focus, pending tasks, gotchas, and recent sessions
- [ ] **Save to Memex action** — right-click any selected text → classify as task / decision / gotcha / note
- [ ] **MCP auto-setup** — configure JetBrains AI Assistant to connect to `memex serve` on project open
- [ ] **Unified memory** — shares the same `.memex/memex.db` as the CLI and VS Code extension

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
- **Claude-only integration** — Memex will always support any CLI agent and eventually any IDE agent
- **Heavy runtime requirements** — no mandatory Bun, uv, or vector database install for basic use

---

## Contributing

If you want to work on any of these, open a GitHub issue to claim it before starting. This avoids duplicate effort and lets us discuss the approach upfront.

See [CONTRIBUTING.md](CONTRIBUTING.md) (coming soon) for development setup and PR guidelines.
