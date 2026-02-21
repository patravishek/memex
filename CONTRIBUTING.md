# Contributing to Memex

First off — thank you for taking the time to contribute. Memex is a small tool built to solve a real problem, and every issue filed, bug fixed, and feature added makes it better for everyone using it.

This guide covers everything you need to get started.

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Project structure](#project-structure)
- [Making changes](#making-changes)
- [Submitting a pull request](#submitting-a-pull-request)
- [Reporting bugs](#reporting-bugs)
- [Requesting features](#requesting-features)
- [Licensing](#licensing)

---

## Code of conduct

Be direct, be kind, be constructive. That's it. We're all here to build something useful.

---

## Ways to contribute

You don't have to write code to contribute:

- **File a bug report** — something broken? Tell us exactly what happened
- **Request a feature** — something missing? Open an issue and describe the problem it solves
- **Improve documentation** — spotted something unclear in the README or this guide?
- **Write a test** — we have very few right now, any coverage helps
- **Share feedback** — used Memex in your workflow? Tell us what worked and what didn't
- **Fix a bug** — pick up an open issue and submit a PR
- **Build a feature** — check the roadmap, claim an issue before starting

---

## Development setup

### Prerequisites

- macOS (the session recording uses the macOS `script` command)
- Node.js 18+
- An Anthropic, OpenAI, or LiteLLM API key for testing compression

### Steps

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/memex.git
cd memex

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Link globally so you can test the CLI
npm link

# 5. Add your API key to ~/.zshrc if not already set
export ANTHROPIC_API_KEY=sk-ant-...
source ~/.zshrc

# 6. Test it works
memex --version
```

### Watch mode during development

```bash
# In one terminal — auto-rebuild on save
npx tsc --watch

# In another terminal — test your changes
cd /some/test/project
memex start claude
```

---

## Project structure

```
src/
├── cli.ts              # Entry point — all commands defined here
├── core/
│   ├── pty-wrapper.ts  # Wraps the agent process using macOS `script`
│   └── session-logger.ts  # Logs I/O to .jsonl and builds conversation turns
├── memory/
│   ├── store.ts        # ProjectMemory interface, load/save via SQLite
│   └── compressor.ts   # AI compression, resume prompt, MCP hint builder
├── storage/
│   ├── db.ts           # SQLite init, schema migrations
│   └── queries.ts      # All data access functions
├── mcp/
│   ├── server.ts       # MCP server bootstrap (stdio transport)
│   ├── tools.ts        # All 9 MCP tool definitions and handlers
│   └── config.ts       # .mcp.json generator
└── ai/
    └── provider.ts     # Anthropic / OpenAI / LiteLLM abstraction
```

### Key design decisions

- **SQLite over JSON** — all memory is stored in `.memex/memex.db`. The old `memory.json` format is auto-migrated on first run
- **stdio MCP transport** — the MCP server runs as a subprocess communicating over stdin/stdout. No ports, no HTTP, fully local
- **`script` command for session recording** — uses macOS's built-in `script` utility instead of `node-pty` to avoid native compilation issues
- **AI keys are stripped from the agent environment** — Memex uses `env -u KEY` to hard-unset its own API keys before launching the wrapped agent, preventing auth conflicts

---

## Making changes

### Branching

Create a branch from `main`:

```bash
git checkout -b fix/auth-conflict-warning
git checkout -b feat/sqlite-fts-improvements
git checkout -b docs/contributing-guide
```

Prefix conventions:
- `fix/` — bug fixes
- `feat/` — new features
- `docs/` — documentation only
- `chore/` — maintenance (deps, build, config)
- `refactor/` — code changes with no behaviour change

### Code style

- TypeScript strict mode is on — no `any` unless genuinely necessary
- No comments that just describe what the code does — only explain *why* if it's non-obvious
- Keep functions small and focused
- Errors should surface meaningful messages to the user, not raw stack traces

### Schema changes

If you need to change the database schema:

1. Add a new migration block in `src/storage/db.ts` — increment the version number
2. Never modify existing migration blocks — always add new ones
3. Consider backwards compatibility — existing `.memex/memex.db` files in the wild will be migrated

### Testing your changes manually

```bash
# Full workflow test
cd /tmp && mkdir test-project && cd test-project
memex start claude         # start a session, do some work, exit
memex status               # check memory was saved
memex history              # check session was recorded
memex resume claude        # verify context is restored
memex search "something"   # verify FTS works
```

---

## Submitting a pull request

1. **Open an issue first** for anything non-trivial — discuss the approach before writing code. This avoids duplicate work and lets us agree on direction upfront.

2. **Keep PRs focused** — one thing per PR. A fix and a refactor in the same PR makes review harder.

3. **Write a clear PR description:**
   - What problem does this solve?
   - What approach did you take and why?
   - Anything reviewers should pay attention to?
   - How did you test it?

4. **Update documentation** if your change affects user-facing behaviour — README, command help text, or this guide.

5. **Bump the version** if appropriate:
   - Bug fix → patch (`0.3.1` → `0.3.2`)
   - New feature → minor (`0.3.x` → `0.4.0`)
   - Breaking change → major (discuss first)

### PR checklist

```
[ ] npm run build passes with no errors
[ ] Tested manually with a real Claude session
[ ] README updated if behaviour changed
[ ] Version bumped if appropriate
[ ] PR description explains what and why
```

---

## Reporting bugs

Open a GitHub issue with:

1. **What you did** — the exact command you ran
2. **What you expected** — what should have happened
3. **What actually happened** — the full error output if any
4. **Environment:**
   - macOS version (`sw_vers`)
   - Node.js version (`node --version`)
   - Memex version (`memex --version`)
   - AI agent and version (`claude --version`)

The more specific you are, the faster it gets fixed.

---

## Requesting features

Open a GitHub issue with:

1. **The problem you're trying to solve** — not the feature itself, but the underlying need
2. **How you currently work around it** — if you do
3. **What you'd expect the solution to look like** — rough idea is fine

Check [ROADMAP.md](ROADMAP.md) first — your idea may already be planned.

---

## Licensing

Memex is released under the **MIT License**. See [LICENSE](LICENSE) for the full text.

### What this means for contributors

By submitting a pull request, you agree that your contribution will be licensed under the same MIT License that covers the project. You are confirming that:

- You wrote the code yourself, or have the right to contribute it
- You are not including code that is incompatible with the MIT License
- You understand your contribution becomes part of an open source project and may be used, modified, and distributed by anyone

You do **not** need to sign a CLA (Contributor License Agreement) or assign copyright. The MIT License is permissive — contributors retain copyright on their own contributions while granting the project the right to use them.

### What MIT means for users

Anyone can use, copy, modify, merge, publish, distribute, sublicense, or sell copies of Memex — commercially or otherwise — with no restrictions beyond keeping the copyright notice intact. No royalties, no permission needed, no strings attached.

---

## Questions?

Open a GitHub issue with the `question` label, or reach out directly via the contact details on the GitHub profile.

Thanks for contributing.
