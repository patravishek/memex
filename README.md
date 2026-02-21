# Memex

> Persistent memory for any AI terminal agent.

When you close a terminal session with Claude, GPT, or any AI coding agent — all context is lost. The next session starts from zero. You end up re-explaining the project, re-establishing decisions, re-describing what you were working on.

Memex fixes this. It wraps your AI agent session, records the conversation, and uses AI to compress it into a structured memory file. The next time you start a session, Memex automatically injects that context so your agent picks up exactly where it left off.

---

## How it works

```
memex start claude
      ↓
PTY wrapper intercepts all I/O
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

---

## Install

### Prerequisites

- Node.js 18+
- An Anthropic or OpenAI API key
- Any AI terminal agent (e.g. [Claude CLI](https://docs.anthropic.com/en/docs/claude-code))

### Setup

```bash
git clone https://github.com/patravishek/memex.git
cd memex
npm install
npm run build
```

Then link it globally so you can use `memex` from anywhere:

```bash
npm link
```

### Configure your API key

```bash
cp .env.example .env
```

Edit `.env` and add your key:

```env
# Use Anthropic (default)
ANTHROPIC_API_KEY=sk-ant-...
AI_PROVIDER=anthropic
ANTHROPIC_MODEL=claude-3-haiku-20240307

# OR use OpenAI
OPENAI_API_KEY=sk-...
AI_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini
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
```

On exit, you'll see:

```
✔ Memory updated — focus: Implementing the checkout flow
  Pending tasks: 3, gotchas: 1
```

---

### `memex resume [command]`

Start a new session with full context automatically restored. Memex injects your project memory as the first message so the agent immediately understands what you were working on.

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
```

---

### `memex forget`

Clear memory for the current project and start fresh.

```bash
# Clear memory but keep raw session logs
memex forget --keep-sessions

# Clear everything
memex forget
```

---

### `memex compress`

Manually re-run compression on the latest session log. Useful if compression failed or you want to force an update.

```bash
memex compress
```

---

## Project structure

```
.memex/                        # Created in your project root (gitignored)
├── memory.json                # Compressed project memory
└── sessions/
    ├── 2026-02-18T10-00.jsonl # Raw session log
    └── 2026-02-18T14-30.jsonl
```

Add `.memex/sessions/` to your `.gitignore` (raw logs can be large). The `memory.json` file is small and worth committing if you want shared memory across a team.

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
| `recentSessions` | Last 5 session summaries |

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

## License

MIT
