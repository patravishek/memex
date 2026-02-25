# Memex Roadmap

This document outlines the planned evolution of Memex. Features are grouped by milestone. Priorities may shift based on community feedback.

> **Current version:** v0.6.0 (CLI) · v0.6.0 (Extension)  
> **Core value prop:** Agent-agnostic persistent memory — works with Claude, Cursor, Copilot, Aider, Ollama, or any CLI/IDE agent. Simple install, no heavy dependencies, MIT licensed, enterprise-ready via LiteLLM.

Contributions welcome. If a feature matters to you, open an issue or a PR.

---

## ✅ v0.2 — Persistent Storage & Search

> Replace flat JSON with a proper database. Make memory queryable.

**Why:** `memory.json` works for a single project but doesn't scale. SQLite gives us queryable history, FTS search, and cross-session analytics with zero new infrastructure.

- [x] **SQLite storage** — migrated from `memory.json` to `.memex/memex.db` (WAL mode, FTS5 full-text index)
- [x] **Backwards compatibility** — `memory.json` auto-migrated to SQLite on first run
- [x] **`memex search <query>`** — FTS5 full-text search across session summaries
- [x] **`memex history`** — list past sessions with dates, durations, agent, and one-line summaries
- [x] **`memex show <session-id>`** — view full session details including every recorded conversation turn
- [x] **Retention policy** — `memex prune [days]` to delete session records older than N days (default: 30)

---

## ✅ v0.3 — MCP Server

> Expose Memex memory as MCP tools so agents pull context on demand instead of receiving a full dump.

**Why:** Injecting 35k chars of context into `CLAUDE.md` wastes tokens and triggers Claude's performance warning. An MCP server lets the agent query memory like a database — asking for exactly what it needs, when it needs it.

- [x] **`memex serve`** — stdio MCP server exposing all memory as tools
- [x] **`get_context`** — project name, description, stack, current focus
- [x] **`get_tasks`** — pending tasks
- [x] **`get_decisions`** — key decisions with reasons
- [x] **`get_gotchas`** — known pitfalls to avoid
- [x] **`get_important_files`** — files worth knowing about
- [x] **`get_recent_conversation`** — last N turns from previous session
- [x] **`search_sessions`** — FTS search across all session summaries
- [x] **`get_session`** — full detail of any past session by ID
- [x] **`save_observation`** — save notes, tasks, decisions, gotchas mid-session
- [x] **Auto-start on `memex resume`** — generates `.mcp.json` + short CLAUDE.md hint

---

## ✅ v0.4 — Progressive Context Injection + Reliability

> Layer context intelligently to save tokens. Make sessions survive abrupt shutdowns.

- [x] **Tiered injection** — `--tier 1|2|3`: one-liner → key facts → full context
- [x] **Token budget** — `--max-tokens <n>` cap on injected context
- [x] **Relevance scoring** — `--focus "<topic>"` sorts context by keyword relevance
- [x] **`<memex:skip>` tag** — strip sensitive content before AI compression
- [x] **Crash recovery** — SIGHUP / SIGINT / SIGPIPE all handled; `pending-compression.json` marker ensures sessions survive force-closed terminals
- [x] **`memex init`** — initialize project memory without launching an agent session

---

## ✅ v0.5 — IDE Support (VS Code / Cursor)

> Bring Memex memory to IDE-based AI agents.

- [x] **`memex-vscode` extension** — published to VS Code Marketplace and Open VSX
- [x] **Memory sidebar** — current focus, pending tasks, gotchas, last session, session count
- [x] **MCP auto-setup** — extension writes `.cursor/mcp.json` and `.vscode/mcp.json` automatically; resolves full binary path for nvm/volta environments
- [x] **`Save to Memex` command** — highlight text → right-click or Cmd+Shift+P → classify as task / decision / gotcha / note
- [x] **Empty state onboarding** — "Initialize Project" button when no memory found
- [x] **Unified memory** — CLI and IDE sessions share the same `.memex/memex.db`

---

## ✅ v0.6 — Mid-Session Capture & Lifecycle Hooks

> Stop waiting until exit. Save memory as you work.

**Why:** The biggest gap vs. tools like [claude-mem](https://github.com/thedotmack/claude-mem) is real-time capture. Previously Memex only compressed at session end — if a session was 3 hours long, everything was at risk until exit. Lifecycle hooks and periodic snapshots fix this.

- [x] **Auto-snapshot every N min (configurable), both for CLI and Extension** — `--snapshot-interval <minutes>` on `start`/`resume`; VS Code setting `memex.snapshotIntervalMinutes` (default: 10); manual trigger via `memex snapshot` or the panel button
- [x] **Claude Code hooks** — `memex setup-hooks --claude` writes `.claude/settings.json` Stop hook; `memex hook:post` triggered automatically on every Claude session end
- [x] **Generic hook interface** — `memex hook:pre` (outputs context) and `memex hook:post` (compresses session) for use in any agent's config file or shell alias
- [x] **Observation streaming** — `save_observation` via MCP writes immediately to SQLite; new `memex observe <type> <content>` CLI command for terminal-side streaming
- [x] **Git-aware compression** — git branch, recent commits, and changed files automatically included in every AI compression prompt; changed files suggested for `importantFiles`
- [x] **Webhook support** — set `MEMEX_WEBHOOK_URL` env var or `webhookUrl` in `.memex/config.json` to receive a POST on session end and each snapshot
- [x] **Cursor / Copilot / Codex hooks** — these agents use MCP natively (already covered by v0.5); `memex setup-hooks` generates generic shell alias guidance for non-MCP workflows

---

## v0.7 — Semantic Vector Search (Pure JS, No Python) ⬅ next

> Find memory by meaning, not just keywords.

**Why:** Full-text search (FTS5) finds exact words. Semantic search finds *meaning* — "when did we have that auth problem" returns relevant sessions even if the word "authentication" never appeared. Tools like claude-mem use Python + Chroma DB for this; Memex will use a pure JS vector store (no Python dependency) to stay zero-dependency and enterprise-safe.

- [ ] **Local embeddings** — generate vector embeddings using a lightweight JS library (`@xenova/transformers` — runs entirely in Node, no API cost, works offline with Ollama)
- [ ] **Semantic `memex search`** — results ranked by meaning, not keyword match
- [ ] **Hybrid search** — combine semantic + FTS5 for best recall (keyword for exact matches, vector for fuzzy/conceptual)
- [ ] **Progressive MCP disclosure** — 3-layer retrieval pattern inspired by claude-mem:
  - `search_sessions(query)` → compact index (~50 tokens/result)
  - `get_session_timeline(id)` → context around a specific session
  - `get_session(id)` → full detail only when needed
  - ~10x token savings at scale
- [ ] **Related context on resume** — surface sessions semantically related to recent git commits when starting a new session
- [ ] **Memory deduplication** — detect and merge duplicate or contradictory entries

---

## v0.8 — Web UI

> A local browser dashboard for memory — no VS Code required.

**Why:** Not everyone uses VS Code. A `memex ui` command opens a local web UI accessible from any browser — useful for JetBrains users, Zed users, or anyone who wants a standalone memory browser.

- [ ] **`memex ui`** — open a local web dashboard at `localhost:3747` (no cloud, no account)
- [ ] **Memory viewer** — browse all fields: focus, tasks, gotchas, decisions, stack, sessions
- [ ] **Session browser** — scroll through past sessions, read raw transcripts, view summaries
- [ ] **Real-time updates** — live-refresh as memory changes (WebSocket or SSE)
- [ ] **Inline editing** — edit `currentFocus`, `pendingTasks`, `gotchas` directly in the UI
- [ ] **Session diff view** — see exactly what changed in memory between two sessions
- [ ] **Export** — download memory as JSON or Markdown

---

## v0.9 — JetBrains Plugin

> Bring Memex memory to IntelliJ-based IDEs — IntelliJ IDEA, WebStorm, PyCharm, GoLand, and beyond.

**Why:** JetBrains IDEs are widely used by backend and polyglot developers. The core Memex logic (`.memex/memex.db`, `memex serve`, `save_observation`) is IDE-agnostic — only the integration layer needs to be rewritten in Kotlin using the IntelliJ Platform SDK.

- [ ] **`memex-intellij` plugin** — published to [JetBrains Marketplace](https://plugins.jetbrains.com)
- [ ] **Memory tool window** — sidebar panel showing current focus, pending tasks, gotchas, and recent sessions
- [ ] **Save to Memex action** — right-click any selected text → classify as task / decision / gotcha / note
- [ ] **MCP auto-setup** — configure JetBrains AI Assistant to connect to `memex serve` on project open
- [ ] **Unified memory** — shares the same `.memex/memex.db` as the CLI and VS Code extension

---

## v1.0 — Multi-Agent Interoperability

> First-class support for every major AI coding agent — CLI and IDE.

**Why:** The premise of Memex is agent-agnostic memory. v1.0 formalises this with verified compatibility, dedicated setup guides, and agent-specific optimisations for every major tool.

**CLI agents (session recording + auto-compression):**

- [ ] **Aider** — verified integration with `memex start aider`; tested with Ollama and OpenAI backends
- [ ] **Shell-GPT** — `memex start sgpt` verified; guide for free-tier Groq setup
- [ ] **OpenHands** — headless agent wrapper compatibility
- [ ] **Goose** — Block's open source agent integration
- [ ] **`memex agents`** — built-in compatibility matrix: `memex agents list` shows all known agents and their setup status

**IDE agents (MCP tools on demand):**

- [ ] **Cursor Agent** — verified MCP tool availability; `memex setup-mcp --cursor` shortcut
- [ ] **GitHub Copilot** — `.vscode/mcp.json` auto-setup; verified `save_observation` from Copilot Chat
- [ ] **Windsurf (Codeium)** — MCP configuration guide; tested memory persistence
- [ ] **Zed AI** — MCP configuration guide
- [ ] **Continue.dev** — MCP configuration guide for the open-source Copilot alternative

**Free/offline agent support:**

- [ ] **Ollama auto-detect** — `memex setup-free` command that detects Ollama and configures it as the compression provider automatically
- [ ] **Groq quick-setup** — `memex setup-free --groq` prompts for API key and writes to shell config
- [ ] **Offline mode** — warn gracefully when no AI provider is configured; store raw session without compression; compress retroactively when a provider becomes available

---

## Ongoing / Across All Versions

- [ ] **Linux support** — replace `script` command with a cross-platform alternative (`node-pty` or similar)
- [ ] **Windows support** — investigate WSL-based approach
- [ ] **`memex doctor`** — diagnose common setup issues (missing API key, broken install, wrong Node version)
- [ ] **Shell completions** — bash/zsh tab completion for all commands
- [ ] **Homebrew core submission** — once traction is established, submit to `homebrew-core`

---

## Not Planned (by design)

These are intentionally out of scope to keep Memex simple and dependency-light:

- **Cloud sync / hosted memory** — memory stays local by default; no account, no SaaS
- **Claude-only integration** — Memex will always support any CLI agent and any IDE agent
- **Heavy runtime requirements** — no mandatory Bun, uv, or Python install for basic use; pure Node + SQLite
- **Crypto tokens** — Memex is a developer tool, not a financial product

---

## Contributing

If you want to work on any of these, open a GitHub issue to claim it before starting. This avoids duplicate effort and lets us discuss the approach upfront.

See [CONTRIBUTING.md](CONTRIBUTING.md) (coming soon) for development setup and PR guidelines.
