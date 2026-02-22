# Memex

> Persistent, agent-agnostic memory for AI coding tools — now inside your IDE.

---

Memex gives your AI coding agents a long-term memory that persists across sessions, projects, and tools. This extension brings that memory directly into VS Code and Cursor — no terminal required.

**Start a feature with Claude CLI. Continue it in Cursor. Hand it off to a teammate on Copilot.** The context follows the project, not the agent.

---

## Features

### Memory Sidebar Panel
A sidebar panel showing what Memex knows about your project — current focus, pending tasks, gotchas, and your last session summary. Auto-refreshes whenever memory is updated.

### MCP Auto-Setup
On activation, the extension automatically writes `.cursor/mcp.json` and `.vscode/mcp.json` so Cursor Agent and GitHub Copilot can call Memex memory tools natively — no manual configuration needed.

Available tools inside any MCP-compatible agent:
- `get_context()` — project summary, stack, current focus
- `get_tasks()` — pending tasks
- `get_decisions()` — key architectural decisions
- `get_gotchas()` — pitfalls to avoid
- `search_sessions("query")` — search past session history
- `save_observation(type, content)` — save a note, task, decision, or gotcha

### Save to Memex
Right-click any selected text in the editor → **Save to Memex** → classify it as a task, decision, gotcha, or note. Saved instantly to memory via MCP.

Also available via `Cmd+Shift+P` → **Save to Memex** to type content manually.

---

## Requirements

> **The Memex CLI npm package must be installed globally for this extension to work.** The extension is a UI layer — it relies on the CLI for all memory operations, MCP serving, and database access.

1. **Install the Memex CLI** (required):
   ```bash
   npm install -g @patravishek/memex
   ```
   Verify it's installed:
   ```bash
   memex --version
   ```

2. **Add an AI API key** (required for session compression when using CLI agents):
   ```bash
   # Add to ~/.zshrc or ~/.bashrc, then reload your shell
   export ANTHROPIC_API_KEY=sk-ant-...
   # or
   export OPENAI_API_KEY=sk-...
   ```

3. **Initialize Memex for your project** (required once per project):
   ```bash
   cd your-project
   memex init
   ```
   Or click the **"Initialize Project"** button in the Memex sidebar panel — no terminal needed.

---

## Getting Started

1. Install the Memex CLI: `npm install -g @patravishek/memex`
2. Open your project in VS Code / Cursor
3. In the terminal: `memex start claude` (exits after first run — just initializes memory)
4. Reload the window — the Memex sidebar panel will appear
5. Open a new Cursor Agent chat and ask: *"Use get_context to show me the project memory"*

---

## How It Works

```
Claude CLI session          Cursor Agent chat
      ↓ compresses into           ↑ reads via MCP
    .memex/memex.db  ←── shared local SQLite database
                                  ↑ reads via MCP
                          GitHub Copilot chat
```

Memory is **project-scoped** and **fully local** — no cloud, no account, no data leaving your machine. The only external call is the AI compression step at the end of a CLI session.

---

## Commands

| Command | Description |
|---|---|
| `Memex: Save to Memex` | Save selected text or typed content to memory |
| `Memex: Setup MCP` | Manually regenerate `.cursor/mcp.json` and `.vscode/mcp.json` |
| `Memex: Refresh Panel` | Force-refresh the memory sidebar |

---

## Links

- [npm package](https://www.npmjs.com/package/@patravishek/memex)
- [GitHub](https://github.com/patravishek/memex)
- [Roadmap](https://github.com/patravishek/memex/blob/main/ROADMAP.md)
- [Issues](https://github.com/patravishek/memex/issues)

---

## License

MIT
