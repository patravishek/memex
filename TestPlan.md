# Memex Test Plan

> **Purpose:** Verify that all current features work correctly across CLI agents, IDE agents, and free/OSS model providers before writing compatibility documentation and publishing the blog post.
>
> **Version under test:** CLI `v0.4.6` · Extension `v0.5.7`  
> **Tester:** @patravishek  
> **Status:** 🔲 Not started

---

## How to use this document

For each test case, mark the result:
- ✅ Pass
- ❌ Fail — add a note describing what went wrong
- ⚠️ Partial — works but with caveats
- ⏭️ Skipped — tool not installed / not applicable

---

## Section 1 — Core CLI (smoke test, run first)

> These must pass before testing any agent integrations.

| # | Test | Command | Expected | Result | Notes |
|---|---|---|---|---|---|
| 1.1 | Install check | `memex --version` | `0.4.6` | | |
| 1.2 | Init a project | `cd /tmp && mkdir memex-test && cd memex-test && memex init` | "Project initialized" message, `.memex/memex.db` created | | |
| 1.3 | Status on empty project | `memex status` | Shows empty memory with project path | | |
| 1.4 | Status JSON output | `memex status --json` | Valid JSON with memory fields | | |
| 1.5 | Set focus | `memex focus "testing memex"` | "Focus updated" | | |
| 1.6 | List focus | `memex focus --list` | Shows "testing memex" as current | | |
| 1.7 | History empty | `memex history` | "No sessions recorded yet" | | |
| 1.8 | Forget | `memex forget` | "Memory cleared" | | |

---

## Section 2 — Session Lifecycle (bash agent)

> Uses `bash` as the agent — no external tools required. Tests the full session → compress → resume loop.

### 2A — Normal exit

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 2.1 | Start session | `cd /tmp/memex-test && memex start bash` | Shell opens inside memex wrapper | | |
| 2.2 | Generate content | Type: `echo "I am building a checkout flow with Stripe"` then `exit` | Session ends, compression runs | | |
| 2.3 | Compression output | After exit | "✔ Memory updated — focus: ..." shown | | |
| 2.4 | History shows session | `memex history` | Session #1 listed with summary | | |
| 2.5 | Status updated | `memex status` | `currentFocus` reflects what was discussed | | |
| 2.6 | Resume injects context | `memex resume bash` | Context printed before bash starts | | |

### 2B — Abrupt exit (crash recovery)

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 2.7 | Close terminal with X | Start `memex start bash`, type a few commands, **close the terminal window** | | | |
| 2.8 | Recovery on next run | Open new terminal, `cd /tmp/memex-test && memex resume bash` | "Recovering interrupted session from last run..." shown before starting | | |
| 2.9 | Ctrl+C exit | Start session, press `Ctrl+C` | Compression runs, session saved | | |
| 2.10 | Pending file cleaned up | After successful recovery | `.memex/pending-compression.json` deleted | | |

### 2C — Short session

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 2.11 | Too-short session | Start `memex start bash`, immediately `exit` | "Session too short to compress" | | |
| 2.12 | Still appears in history | `memex history` | Session shows as "no summary" but listed | | |

---

## Section 3 — CLI Agent: Claude

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 3.1 | Start with Claude | `memex start claude` | Claude launches, session recorded | | |
| 3.2 | Compression on exit | Type `exit` in Claude | Memory updated on exit | | |
| 3.3 | Resume with MCP | `memex resume claude` | CLAUDE.md hint injected + `.mcp.json` written | | |
| 3.4 | MCP tools available | Ask Claude: "use get_context tool" | Claude returns project memory | | |
| 3.5 | save_observation | Ask Claude: "use save_observation to save: Stripe webhook must be idempotent (type: gotcha)" | Observation saved | | |
| 3.6 | Observation in status | `memex status` | Gotcha appears in output | | |
| 3.7 | Focus updated | Ask Claude to work on something, exit | `currentFocus` updated to reflect end-of-session topic | | |
| 3.8 | Resume restores | Next `memex resume claude` | Claude acknowledges previous session | | |

---

## Section 4 — CLI Agent: Aider

> Install: `pip install aider-chat`

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 4.1 | Start with Aider | `memex start aider` | Aider launches inside memex | | |
| 4.2 | Session recorded | Work briefly, exit | Raw log created in `.memex/sessions/` | | |
| 4.3 | Compression | After exit | "✔ Memory updated" shown | | |
| 4.4 | Resume | `memex resume aider` | Context injected via RESUME.md | | |
| 4.5 | History | `memex history` | Aider session listed with agent=aider | | |

---

## Section 5 — CLI Agent: Ollama (free, offline)

> Install: `brew install ollama` then `ollama pull llama3.1`

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 5.1 | Ollama running | `ollama serve` (in separate terminal) | Ollama API available at localhost:11434 | | |
| 5.2 | Configure memex | `export LITELLM_BASE_URL=http://localhost:11434` `export LITELLM_MODEL=ollama/llama3.1` | Env vars set | | |
| 5.3 | Start session | `memex start "ollama run llama3.1"` | Ollama interactive session starts | | |
| 5.4 | Compression uses Ollama | Exit session | Compression runs using local model (no API call) | | |
| 5.5 | Memory quality | `memex status` | Memory fields populated (may be lower quality than Claude) | | |
| 5.6 | Resume | `memex resume "ollama run llama3.1"` | Context injected | | |

---

## Section 6 — CLI Agent: Groq (free API tier)

> Get free key at console.groq.com

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 6.1 | Configure | `export LITELLM_BASE_URL=https://api.groq.com/openai/v1` `export LITELLM_API_KEY=gsk_...` `export LITELLM_MODEL=groq/llama-3.1-8b-instant` | Env vars set | | |
| 6.2 | Test compression | Run a bash session and exit | Compression uses Groq API | | |
| 6.3 | Speed | Note how long compression takes | Should be faster than Anthropic | | |
| 6.4 | Memory quality | `memex status` | Memory populated | | |

---

## Section 7 — MCP Tools (IDE agents)

> These tests work with any MCP-compatible agent — Cursor, Copilot, etc.

### 7A — MCP Server

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 7.1 | Start MCP server | `memex serve --project /tmp/memex-test` | Server starts (no output — stdio transport) | | |
| 7.2 | setup-mcp | `cd ~/your-project && memex setup-mcp` | `.cursor/mcp.json` and `.vscode/mcp.json` written | | |
| 7.3 | Global MCP | `memex setup-mcp --global` | `~/.claude/mcp.json` written | | |

### 7B — Cursor Agent

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 7.4 | MCP loads | Open project in Cursor, check MCP panel | memex server shown as connected | | |
| 7.5 | get_context | Ask Cursor Agent: "call get_context" | Returns project memory | | |
| 7.6 | get_tasks | Ask: "call get_tasks" | Returns pending tasks | | |
| 7.7 | get_gotchas | Ask: "call get_gotchas" | Returns gotchas | | |
| 7.8 | save_observation | Ask: "use save_observation to save this decision: using SQLite over Postgres for simplicity" | Observation saved | | |
| 7.9 | Persists | `memex status` in terminal | Observation from Cursor appears | | |
| 7.10 | search_sessions | Ask: "search_sessions for stripe" | Returns relevant sessions | | |

### 7C — GitHub Copilot (VS Code)

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 7.11 | MCP loads | Open project in VS Code, check `.vscode/mcp.json` exists | File present with memex config | | |
| 7.12 | Copilot Chat | Ask in Copilot Chat: "#get_context" | Returns project memory | | |
| 7.13 | save_observation | Use `#save_observation` from Copilot | Saves to memex.db | | |

---

## Section 8 — VS Code Extension

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 8.1 | Extension installs | Install from marketplace | Memex icon appears in activity bar | | |
| 8.2 | Empty state | Open project without memex | "No memory yet" + "Initialize Project" button | | |
| 8.3 | Init button | Click "Initialize Project" | Project initialized, panel refreshes | | |
| 8.4 | Memory panel | Open project with existing memory | Shows focus, tasks, gotchas, last session | | |
| 8.5 | Auto-refresh | Run `memex compress` in terminal | Panel updates within ~1 second | | |
| 8.6 | Save to Memex | Select text → right-click → "Save to Memex" | Type picker shown, saved to memory | | |
| 8.7 | Command palette | Cmd+Shift+P → "Save to Memex" | Input box shown | | |
| 8.8 | Setup MCP button | Click plug icon in panel | `.cursor/mcp.json` written | | |
| 8.9 | Not installed state | Extension active but `memex` CLI not in PATH | "Memex CLI not found" + install instructions | | |
| 8.10 | Star prompt | After 3rd activation | "Enjoying Memex?" notification shown once | | |

---

## Section 9 — memex compress & recovery

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 9.1 | Manual compress | After a bash session, run `memex compress` | Compresses latest raw log | | |
| 9.2 | Compress finalizes session | `memex history` after compress | Session shows `ended_at` and summary | | |
| 9.3 | Compress uses raw log | Check output | Uses `-raw.txt` file for better quality | | |
| 9.4 | Double compress | Run `memex compress` twice | Second run still works (idempotent) | | |

---

## Section 10 — Privacy & Edge Cases

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 10.1 | memex:skip tag | Run a session, type `<memex:skip>secret password: abc123</memex:skip>` then exit | Compressed memory does NOT contain "abc123" | | |
| 10.2 | No API key | Unset all API keys, run a session | Clear error: "No AI provider configured" | | |
| 10.3 | Wrong API key | Set invalid key, run and exit | Compression fails gracefully, raw log preserved | | |
| 10.4 | Focus history | Set focus 3 times with different topics | Old topics appear in `memex focus --list` | | |
| 10.5 | Prune | `memex prune 0` | All sessions removed | | |
| 10.6 | Forget keep sessions | `memex forget --keep-sessions` | Memory cleared, sessions still in `memex history` | | |
| 10.7 | .gitignore | First `memex start` in a clean project | `.memex/` added to `.gitignore` automatically | | |

---

## Section 11 — Star / Feedback Prompt

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 11.1 | CLI prompt timing | After 3rd successful session compression | Star prompt shown in terminal | | |
| 11.2 | Not shown twice | Run a 4th session | Prompt NOT shown again | | |
| 11.3 | Extension prompt | After 3rd IDE activation with live DB | VS Code notification shown | | |
| 11.4 | Maybe Later resets | Click "Maybe Later" | Prompt shown again after 3 more activations | | |

---

## Bug Log

Use this section to track issues found during testing.

| # | Section | Description | Severity | Status |
|---|---|---|---|---|
| — | — | — | — | — |

> **Severity:** 🔴 Blocker · 🟡 Major · 🟢 Minor

---

## Summary Checklist

- [ ] Section 1 — Core CLI
- [ ] Section 2 — Session Lifecycle
- [ ] Section 3 — Claude
- [ ] Section 4 — Aider
- [ ] Section 5 — Ollama
- [ ] Section 6 — Groq
- [ ] Section 7 — MCP Tools
- [ ] Section 8 — VS Code Extension
- [ ] Section 9 — Compress & Recovery
- [ ] Section 10 — Privacy & Edge Cases
- [ ] Section 11 — Star Prompt

---

## After Testing

Once sections 1–3 pass, the blog post can be written.  
Once sections 4–6 pass, the README compatibility table can be updated.  
Once all sections pass, tag `v0.5.0` as the first "stable" release.
