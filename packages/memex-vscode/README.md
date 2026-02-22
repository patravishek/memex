<p align="center">
  <img src="images/icon.png" width="100" alt="Memex" />
</p>

<h1 align="center">Memex</h1>

<p align="center">Persistent, agent-agnostic memory for AI coding tools — now inside your IDE.</p>

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

- [Memex CLI](https://www.npmjs.com/package/@patravishek/memex) installed globally:
  ```bash
  npm install -g @patravishek/memex
  ```
- An API key for compression (Anthropic, OpenAI, or LiteLLM):
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```
- A project with Memex initialized (run `memex start` once in your terminal)

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
