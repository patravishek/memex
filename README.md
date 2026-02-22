<p align="center">
  <img src="images/icon.png" width="100" alt="Memex" />
</p>

<h1 align="center">Memex</h1>

<p align="center">Persistent, agent-agnostic memory for AI coding tools.</p>
<p align="center">Works across Claude, Cursor, Copilot, Gemini — and any MCP-compatible agent.</p>

```
    Day 1                              Day 2
      │                                  │
  memex start claude               memex resume claude
      │                                  │
  "Build me a checkout flow"        "Continue from where we left off"
      │                                  │
  Claude works...                   Claude: "Yesterday we finished the
      │                              cart logic. Still need to wire up
  You close the terminal            Stripe webhooks. Want me to start?"
      │                                  │
  [Memex saves everything]          Back in flow in 10 seconds.
```

No more re-explaining your project. No more lost momentum. Switch between Claude CLI, Cursor Agent, Copilot, or any MCP-compatible tool — they all share the same memory. Start a feature in Claude, continue it in Cursor, hand it off to a teammate using a different tool entirely. The context follows the project, not the agent.

---

## Install

```bash
# npm
npm install -g @patravishek/memex

# pnpm
pnpm add -g @patravishek/memex

# Homebrew
brew install patravishek/memex/memex
```

Then add your API key to `~/.zshrc`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

```bash
source ~/.zshrc
```

That's the entire setup.

---

## The two commands you need

```bash
memex start claude      # Day 1 — or any time you start fresh on a project
memex resume claude     # Every session after — Claude picks up where it left off
```

That's it. Everything else is automatic.

**Using Cursor, Copilot, or another IDE agent instead of the CLI?** Initialize without launching any agent:

```bash
memex init              # creates .memex/memex.db and sets up the project
memex setup-mcp         # connects Cursor Agent / Copilot via MCP
```

---

## What it actually feels like

**Day 1 — Starting a new project:**

```bash
cd ~/my-project
memex start claude
```

You work with Claude for a couple of hours. Build some features, make decisions, hit a few problems. When you're done, you close the terminal. Memex quietly saves everything in the background.

**Day 2 — Coming back:**

```bash
cd ~/my-project
memex resume claude
```

Claude responds:

```
Continuing from our last session — we were building the checkout flow.

Here's what I have in memory:
• Project: my-app (Next.js + Stripe + PostgreSQL)
• Last session: Finished cart persistence, fixed guest cart bug
• Still pending: Wire up Stripe webhooks, add payment failure handling
• Watch out: Stripe webhook events can arrive out of order under load

What would you like to work on?
```

Claude is your **personal engineering assistant** — it remembers your project, your decisions, your mistakes, and exactly where you left off.

---

## How it works

```
memex start claude
      ↓
Session recorded locally (.memex/sessions/)
      ↓
You exit → AI compresses transcript → .memex/memex.db
      ↓
memex resume claude
      ↓
Claude gets a short context hint + MCP tools connected
      ↓
Claude calls get_context(), get_gotchas()... on demand
      ↓
No wasted tokens. No performance warnings. Just context.
```

Memory is **project-scoped** — each project has its own independent database at `.memex/memex.db`. Nothing is shared between projects unless you choose to.

---

## Install

### Prerequisites

- macOS
- Node.js 18+
- An API key from Anthropic, OpenAI, or a LiteLLM enterprise proxy
- Claude CLI — [install here](https://docs.anthropic.com/en/docs/claude-code)

### Via npm / pnpm / yarn

```bash
# npm
npm install -g @patravishek/memex

# pnpm
pnpm add -g @patravishek/memex

# yarn
yarn global add @patravishek/memex
```

Available on npm at [`@patravishek/memex`](https://www.npmjs.com/package/@patravishek/memex).

### Via Homebrew

```bash
brew install patravishek/memex/memex
```

### From source

```bash
git clone https://github.com/patravishek/memex.git
cd memex
npm install && npm run build && npm link
```

---

## Configuration

Memex reads API keys from your **shell environment** — no config file required. Add to `~/.zshrc` and reload:

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

Many enterprises route AI traffic through a [LiteLLM](https://docs.litellm.ai) proxy for centralised key management, cost tracking, and model governance. Memex supports this natively — your session data never leaves the corporate network.

```bash
export LITELLM_API_KEY=your_litellm_key
export LITELLM_BASE_URL=https://litellm.your-company.com
export LITELLM_MODEL=claude-3-haiku
export LITELLM_TEAM_ID=your_team_id   # optional
```

### Provider auto-detection

Memex picks the provider automatically based on what's set:

1. **LiteLLM** — if `LITELLM_API_KEY` + `LITELLM_BASE_URL` are both set
2. **Anthropic** — if `ANTHROPIC_API_KEY` is set
3. **OpenAI** — if `OPENAI_API_KEY` is set

---

## All commands

### `memex init`

Initialize Memex for a project without launching any agent. Creates `.memex/memex.db` and sets up `.gitignore`. Use this when working with IDE-based agents like Cursor or Copilot that don't need the CLI session wrapper.

```bash
cd ~/my-project
memex init
```

After running, open the Memex sidebar in VS Code / Cursor — or run `memex setup-mcp` to connect your IDE agent via MCP.

---

### `memex start [command]`

Start a tracked session on a project for the first time.

```bash
memex start claude
memex start aider
memex start claude --project /path/to/project
```

On first run, Memex automatically adds `.memex/` and `.mcp.json` to the project's `.gitignore` so session data is never accidentally committed.

When you exit, you'll see:

```
✔ Memory updated — focus: Implementing the checkout flow
  Pending tasks: 3, gotchas: 1, conversation turns saved: 24
```

---

### `memex resume [command]`

Resume with full context restored. Claude connects to Memex memory tools automatically on startup.

```bash
memex resume claude
```

Claude gets a brief summary of where things stand, then queries memory on demand — no 35k char dump, no performance warnings.

**v0.4 options:**

```bash
# Focus memory on a specific area — sorts gotchas, tasks, decisions by relevance
memex resume claude --focus "stripe webhooks"

# Control how much context is injected (1=one-liner, 2=key facts, 3=full)
memex resume claude --no-mcp --tier 2

# Hard cap on context size (~1 token = 4 chars)
memex resume claude --no-mcp --max-tokens 1000

# Combine: focus + budget
memex resume claude --no-mcp --focus "auth bug" --max-tokens 800

# Fall back to full context dump (no MCP)
memex resume claude --no-mcp
```

The `--focus` topic is saved to memory automatically — future resumes pick it up without you retyping it.

---

### `memex focus [topic]`

View or set the current focus topic for this project.

```bash
# Set a new focus (saved to memory, used on next resume automatically)
memex focus "stripe payment integration"

# List current focus and full history
memex focus --list

# Clear focus entirely
memex focus --clear
```

```
  memex — focus history

  Current: stripe payment integration

  Past topics (most recent first):
    1. checkout redirect bug
    2. auth refactor
    3. onboarding UX
```

Focus history keeps the last 10 topics. The AI also updates `currentFocus` naturally during end-of-session compression as work shifts — so history builds up even without explicitly running `memex focus`.

---

### `memex status`

See what Memex currently knows about your project.

```bash
memex status
```

```
  memex — project memory

  Project: my-app
  What this project does:
  E-commerce platform with Next.js and Stripe

  Tech stack: Next.js, TypeScript, Prisma, PostgreSQL
  Current focus: Implementing the checkout flow

  Pending tasks:
    - Wire up Stripe webhooks
    - Add payment failure handling

  Gotchas:
    - Stripe webhook events can arrive out of order under load

  Sessions recorded: 4
  Database: /my-app/.memex/memex.db
```

---

### `memex history`

List past sessions with dates, durations, and one-line summaries.

```bash
memex history
memex history -n 50
```

```
  #12  Feb 18, 2026  [claude]  42m
       Finished cart persistence, fixed guest cart bug on page refresh.

  #11  Feb 17, 2026  [claude]  1h 5m
       Set up Stripe webhook handler and wrote integration tests.
```

---

### `memex show <id>`

View the full transcript and summary of any past session.

```bash
memex show 12
```

---

### `memex search <query>`

Full-text search across all past session summaries.

```bash
memex search "stripe webhook"
memex search "authentication bug"
```

---

### `memex setup-mcp`

Make Memex memory tools permanently available in Claude without using `memex resume`.

```bash
# For this project only (commit to share with teammates)
memex setup-mcp

# For every Claude session on your machine
memex setup-mcp --global
```

After this, just run `claude` normally and say "resume from where we left off" — Claude will find the memory automatically.

---

### `memex compress`

Manually re-run compression on the latest session. Useful if the session ended unexpectedly.

```bash
memex compress
```

---

### `memex prune [days]`

Delete session records older than N days (default: 30).

```bash
memex prune        # removes sessions older than 30 days
memex prune 7      # removes sessions older than 7 days
```

---

### `memex forget`

Clear all memory for the current project.

```bash
memex forget                  # clear everything
memex forget --keep-sessions  # clear memory fields, keep session history
```

---

## MCP tools (available inside Claude sessions)

When Claude connects via MCP, it can call these tools on demand:

| Tool | What it does |
|---|---|
| `get_context()` | Project summary, stack, current focus. Accepts optional `focus` (relevance sort) and `tier` (1/2/3 verbosity) |
| `get_tasks()` | Pending tasks |
| `get_decisions()` | Key architectural decisions with reasons |
| `get_gotchas()` | Pitfalls to avoid |
| `get_important_files()` | Files worth knowing about |
| `get_recent_conversation()` | Last N turns from previous session |
| `search_sessions("query")` | Search past session history |
| `get_session(id)` | Full detail of a specific session |
| `save_observation(type, content)` | Save a note, task, decision, or gotcha mid-session |

`save_observation` is particularly useful — Claude can save important discoveries immediately without waiting for end-of-session compression.

Claude can also request a relevance-sorted view mid-session:

```
get_context(focus="payment flow", tier=2)
```

---

## Privacy — `<memex:skip>` tag

Wrap any text in a session with `<memex:skip>…</memex:skip>` and Memex will strip it from the transcript **before** it's sent to the AI for compression. The raw session log is unaffected (local only), but the compressed memory will never contain that content.

Useful for passwords accidentally typed, personal context, internal URLs, or anything you don't want stored permanently:

```
<memex:skip>
  Staging DB password: s3cr3t-temp
</memex:skip>
```

The AI sees `[content excluded by <memex:skip>]` in its place.

---

## Project structure

```
.memex/
├── memex.db          # SQLite database — memory + full session history
└── sessions/
    ├── *.jsonl       # Structured session logs
    └── *-raw.txt     # Raw terminal recordings
```

`.memex/` and `.mcp.json` are automatically added to the project's `.gitignore` on the first `memex start` or `memex resume`. Nothing needs to be done manually.

If `.memex/` was already committed to a repo before upgrading to v0.4, run once:

```bash
git rm -r --cached .memex/
git commit -m "chore: stop tracking .memex directory"
```

---

## Works with any agent

Memory lives in `.memex/memex.db` — a local SQLite file that every agent reads from and writes to via MCP. Switch tools mid-project without losing a single byte of context.

**CLI agents** (session recording + auto-compression):

| Agent | Command |
|---|---|
| Claude CLI | `memex start claude` |
| Aider | `memex start aider` |
| Shell-GPT | `memex start sgpt` |
| Any CLI agent | `memex start your-agent` |

**IDE agents** (MCP tools available on demand):

| Agent | How |
|---|---|
| Cursor Agent | Auto-configured via `.cursor/mcp.json` — install the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=patravishek.memex-vscode) or run `memex setup-mcp` |
| GitHub Copilot | Auto-configured via `.vscode/mcp.json` — same extension |
| Any MCP client | Run `memex serve --project /path/to/project` |

**The interoperability story:**

```
Start feature with Claude CLI          memex resume claude
         ↓ session compressed into
    .memex/memex.db  ←── single source of truth
         ↑ MCP tools              ↑ MCP tools
  Cursor Agent              GitHub Copilot
  get_context()             get_tasks()
  save_observation()        search_sessions()
```

---

## Notes

**Claude CLI users:** Memex automatically strips its own API keys from the environment before launching Claude, preventing the `Auth conflict: Both a token and an API key are set` warning.

**Your data stays local:** The only external call Memex makes is a single AI API call at the end of each session to compress the transcript. All memory, session logs, and MCP tool responses are purely local — no Memex server, no cloud, no account.

**Enterprise:** If your company uses LiteLLM, the compression call goes through your corporate proxy. The MCP tools make zero network calls — they read local SQLite.

---

## Roadmap

**Current: v0.4.2** — Progressive context injection (tiered, focus-aware, token-budgeted)

See [ROADMAP.md](ROADMAP.md) for what's next — including a local web UI, semantic vector search, and more.

Contributions welcome. If a feature matters to you, open an issue.

---

## License

MIT
