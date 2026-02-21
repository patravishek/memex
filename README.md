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
On exit: AI compresses transcript → .memex/memory.json
      ↓
memex resume claude
      ↓
Memory injected as first message → agent has full context
```

Memory is **project-scoped** — tied to the directory you run Memex from. Each project has its own independent memory file.

Session recording uses the macOS built-in `script` command — no native dependencies or compilation required.

---

## Install

### Prerequisites

- macOS (uses the built-in `script` command for session recording)
- Node.js 18+
- An API key from Anthropic, OpenAI, or a LiteLLM enterprise proxy
- Any AI terminal agent (e.g. [Claude CLI](https://docs.anthropic.com/en/docs/claude-code))

### Setup

```bash
git clone https://github.com/patravishek/memex.git
cd memex
npm install
npm run build
```

Link it globally so you can run `memex` from any project directory:

```bash
npm link
```

---

## Configuration

Memex reads API keys from your **shell environment** — the same place you already keep secrets. No `.env` file required.

Add one of the following to your `~/.zshrc` (or `~/.bashrc`):

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

Memex uses the OpenAI SDK pointed at your LiteLLM proxy URL, so it works with **any model your enterprise has configured** — Claude, GPT-4, Mistral, Llama, and more.

After editing your shell config, reload it:

```bash
source ~/.zshrc
```

### Provider auto-detection order

Memex auto-detects the provider from whichever keys are present:

1. **LiteLLM** — if both `LITELLM_API_KEY` and `LITELLM_BASE_URL` are set
2. **Anthropic** — if `ANTHROPIC_API_KEY` is set
3. **OpenAI** — if `OPENAI_API_KEY` is set

Override explicitly with `export AI_PROVIDER=anthropic|openai|litellm` if needed.

### Optional: `.env` file

If you prefer not to set shell variables globally, Memex also accepts a `.env` file in the repo directory. Shell environment variables always take precedence over `.env`.

```bash
cp .env.example .env
# edit .env with your keys
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

# Run from a specific project directory
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
    - Update README with deploy instructions

  Key decisions:
    - Using Stripe Elements over custom UI (better compliance)
    - Soft deletes for orders, hard deletes for draft carts

  Gotchas:
    - chalk v5 is ESM-only, use v4 in CommonJS projects
    - Prisma migrations need --skip-generate in CI

  Last session (Feb 18, 2026):
  Implemented the cart persistence logic and fixed a bug where
  guest carts were lost on page refresh. Started on checkout flow.

  Sessions logged: 4
  Memory file: /your-project/.memex/memory.json
```

---

### `memex forget`

Clear memory for the current project and start fresh.

```bash
# Clear memory but keep raw session logs
memex forget --keep-sessions

# Clear everything including session logs
memex forget
```

---

### `memex compress`

Manually re-run compression on the latest session log. Useful if compression failed at the end of a session, or if you want to force a memory refresh.

```bash
memex compress
```

---

## Project structure

```
.memex/                         # Created in your project root
├── memory.json                 # Compressed project memory (small, safe to commit)
└── sessions/
    ├── 2026-02-18T10-00.jsonl  # Raw session log
    └── 2026-02-18T14-30.jsonl
```

Add this to your `.gitignore` to keep raw logs out of version control:

```
.memex/sessions/
```

The `memory.json` file itself is small and human-readable. Committing it means your whole team shares the same project context — useful for onboarding or handoffs.

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

| Provider | Set `AI_PROVIDER` to | Notes |
|---|---|---|
| Anthropic | `anthropic` | Direct API, default model: `claude-3-haiku-20240307` |
| OpenAI | `openai` | Direct API, default model: `gpt-4o-mini` |
| LiteLLM | `litellm` | Enterprise proxy, model depends on your deployment |

---

## Works with any agent

Memex wraps any terminal-based AI agent:

| Agent | Command |
|---|---|
| Claude CLI | `memex start claude` |
| Aider | `memex start aider` |
| Shell-GPT | `memex start sgpt` |
| Any custom agent | `memex start your-agent` |

---

## Notes

### Claude CLI users

If you use Claude CLI logged in via claude.ai (rather than an API key), you may see an auth conflict warning if `ANTHROPIC_API_KEY` is set in your shell environment. Memex automatically strips its own API keys from the environment it passes to the wrapped agent, so this warning should not appear. If it does, run:

```bash
claude /logout
```

Then log back in via claude.ai. Memex uses its own `.env` file for compression — your Claude CLI session is not affected.

### `.env` file location

Memex looks for its `.env` file in the directory where it is installed (the cloned repo), not in your project directory. Your project's own `.env` files are never read or modified by Memex.

---

## License

MIT
