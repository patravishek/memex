# Memex

> Persistent memory for any AI terminal agent.

When you close a terminal session with Claude, GPT, or any AI coding agent — all context is lost. The next session starts from zero. You end up re-explaining the project, re-establishing decisions, re-describing what you were working on.

Memex fixes this. It wraps your AI agent session, records the conversation, and uses AI to compress it into a structured memory file. The next time you start a session, Memex automatically injects that context so your agent picks up exactly where it left off.

---

## How it works

```
memex start claude
      ↓
macOS `script` command records all terminal I/O
      ↓
Session logged to .memex/sessions/
      ↓
On exit: AI compresses transcript → .memex/memex.db (SQLite)
      ↓
memex resume claude
      ↓
Memory injected as first message → agent has full context
```

Memory is **project-scoped** — tied to the directory you run Memex from. Each project has its own independent SQLite database at `.memex/memex.db`. Session recording uses the macOS built-in `script` command — no native dependencies or compilation required.

---

## Install

### Prerequisites

- macOS
- Node.js 18+
- An API key from Anthropic, OpenAI, or a LiteLLM enterprise proxy
- Any AI terminal agent (e.g. [Claude CLI](https://docs.anthropic.com/en/docs/claude-code))

### Via Homebrew (recommended)

```bash
brew install patravishek/memex/memex
```

The `patravishek/memex/memex` format is Homebrew's shorthand for a third-party tap — it registers the tap and installs the formula in a single command, no separate `brew tap` step needed.

To upgrade later:

```bash
brew upgrade memex
```

### Via npm / manual

```bash
git clone https://github.com/patravishek/memex.git
cd memex
npm install && npm run build && npm link
```

`npm link` makes the `memex` command available globally from any directory.

---

## Configuration

Memex reads API keys from your **shell environment** — no config file required. Add your key to `~/.zshrc` (or `~/.bashrc`) and reload:

```bash
source ~/.zshrc
```

### Anthropic (default)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ANTHROPIC_MODEL=claude-3-haiku-20240307   # optional
```

### OpenAI

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini   # optional
```

### LiteLLM (enterprise proxy)

Many enterprises route AI traffic through a [LiteLLM](https://docs.litellm.ai) proxy to centralise key management, cost tracking, and model governance. Memex supports this natively.

```bash
export LITELLM_API_KEY=your_litellm_key
export LITELLM_BASE_URL=https://litellm.your-company.com
export LITELLM_MODEL=claude-3-haiku    # must match your proxy's model name
export LITELLM_TEAM_ID=your_team_id   # optional — for team-based routing
```

Memex uses the OpenAI SDK pointed at your LiteLLM proxy URL, so it works with **any model your enterprise has configured** — Claude, GPT-4, Mistral, Llama, and more. The `LITELLM_MODEL` value must match exactly what your proxy exposes (check with your LiteLLM admin).

### Provider auto-detection order

Memex auto-detects the provider from whichever keys are present in the environment:

1. **LiteLLM** — if both `LITELLM_API_KEY` and `LITELLM_BASE_URL` are set
2. **Anthropic** — if `ANTHROPIC_API_KEY` is set
3. **OpenAI** — if `OPENAI_API_KEY` is set

Override explicitly with `export AI_PROVIDER=anthropic|openai|litellm` if needed.

### Optional: `.env` file

If you prefer not to set shell variables globally, Memex also accepts a `.env` file inside the cloned repo directory. Shell environment variables always take precedence over `.env`.

```bash
cp .env.example .env
# edit .env with your keys
```

---

## Quickstart

```bash
# Install
brew install patravishek/memex/memex

# Add your API key to ~/.zshrc
echo 'export ANTHROPIC_API_KEY=sk-ant-...' >> ~/.zshrc && source ~/.zshrc

# Go to any project and start a tracked session
cd ~/your-project
memex start claude

# Next day — resume with full context restored
memex resume claude
```

---

## Usage

### `memex start [command]`

Start a tracked session. Memex wraps your agent, records all I/O, and compresses it into memory when you exit.

```bash
# Wrap Claude CLI (default)
memex start claude

# Wrap any other agent
memex start aider
memex start sgpt

# Run against a specific project directory
memex start claude --project /path/to/project
```

On exit, you'll see:

```
✔ Memory updated — focus: Implementing the checkout flow
  Pending tasks: 3, gotchas: 1
```

---

### `memex resume [command]`

Start a new session with full context automatically restored. Memex injects your project memory as the first message so the agent immediately understands where things stand.

```bash
memex resume claude
```

The agent receives a structured context block covering:

- What the project does and its tech stack
- What you were working on last session
- Pending tasks and key decisions
- Gotchas — mistakes and dead ends to avoid repeating

No more re-explaining. No more lost momentum.

---

### `memex status`

See what Memex currently knows about your project.

```bash
memex status
```

Example output:

```
  memex — project memory

  Project: my-app
  What this project does:
  E-commerce platform built with Next.js and Stripe...

  Tech stack: Next.js, TypeScript, Prisma, PostgreSQL

  Current focus: Implementing the checkout flow

  Pending tasks:
    - Add payment failure test cases
    - Fix flaky login selector on Safari

  Gotchas:
    - chalk v5 is ESM-only, use v4 in CommonJS projects

  Sessions recorded: 4
  Database: /your-project/.memex/memex.db
```

---

### `memex history`

List all past sessions for the current project with dates, durations, and summaries.

```bash
memex history

# Show more results
memex history -n 50

# Show sessions across all projects
memex history --all
```

Example output:

```
  memex — session history

  #12  Feb 18, 2026, 10:30 AM  [claude]  42m 18s
       Implemented cart persistence, fixed guest cart bug on page refresh.

  #11  Feb 17, 2026, 3:12 PM   [claude]  1h 5m
       Set up Stripe webhook handler and wrote integration tests.
```

---

### `memex show <id>`

View full details of any past session, including every recorded conversation turn.

```bash
memex show 12
```

---

### `memex search <query>`

Full-text search across all session summaries. Fast — backed by SQLite FTS5.

```bash
memex search "stripe webhook"
memex search "authentication bug"

# Search across all projects
memex search "prisma migration" --all
```

Example output:

```
  memex — search: "stripe webhook"

  #11  Feb 17, 2026  [claude]
       Set up [stripe webhook] handler and wrote integration tests for...
```

---

### `memex prune [days]`

Delete session records older than N days (default: 30). Raw JSONL log files in `.memex/sessions/` are not touched — remove those separately if needed.

```bash
# Remove sessions older than 30 days (default)
memex prune

# Remove sessions older than 7 days
memex prune 7
```

---

### `memex forget`

Clear all memory for the current project and start fresh.

```bash
# Clear memory fields but keep session history
memex forget --keep-sessions

# Clear everything
memex forget
```

---

### `memex compress`

Manually re-run compression on the latest session log. Useful if compression failed at the end of a session or you want to force a memory refresh.

```bash
memex compress
```

---

## Project structure

```
.memex/                           # Created in your project root
├── memex.db                      # SQLite database (memory + full session history)
├── memory.json.bak               # Auto-created if upgrading from v0.1 (safe to delete)
└── sessions/
    ├── 2026-02-18T10-00.jsonl    # Structured session log (raw I/O entries)
    └── 2026-02-18T10-00-raw.txt  # Raw terminal recording (from `script` command)
```

Add this to your project's `.gitignore` to keep raw session logs out of version control:

```
.memex/sessions/
```

The `memex.db` file is small (typically a few KB per session). You can commit it so your whole team shares the same project memory — useful for onboarding or handoffs. Use `memex history` to inspect it without opening a SQL client.

---

## What gets captured

| Field | Description |
|---|---|
| `description` | What the project does |
| `stack` | Tech stack detected from conversation |
| `currentFocus` | What was being worked on |
| `pendingTasks` | Tasks mentioned but not completed |
| `keyDecisions` | Architectural and design decisions made |
| `importantFiles` | Files referenced during the session |
| `gotchas` | Problems hit, mistakes made, things to avoid |
| `recentSessions` | Summaries of the last 5 sessions |

---

## Supported providers

| Provider | Key variable | Default model |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `claude-3-haiku-20240307` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` |
| LiteLLM | `LITELLM_API_KEY` + `LITELLM_BASE_URL` | Set via `LITELLM_MODEL` |

---

## Works with any agent

| Agent | Command |
|---|---|
| Claude CLI | `memex start claude` |
| Aider | `memex start aider` |
| Shell-GPT | `memex start sgpt` |
| Any custom agent | `memex start your-agent` |

---

## Notes

### Claude CLI users

Memex automatically strips its own API keys from the environment before passing it to the wrapped agent. This prevents the auth conflict warning that Claude CLI shows when `ANTHROPIC_API_KEY` is set in the environment but you are logged in via claude.ai.

### Key isolation

Your project's own `.env` files are never read or modified by Memex. Memex only reads from your shell environment and its own optional `.env` inside the repo directory.

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features across upcoming versions — including MCP server support, a local web UI, semantic vector search, and more.

Contributions welcome. If a feature matters to you, open an issue.

---

## License

MIT
