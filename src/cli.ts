#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as path from "path";
import * as fs from "fs";
import { SessionLogger, ConversationTurn } from "./core/session-logger.js";
import { wrapProcess } from "./core/pty-wrapper.js";
import { compressSession, buildResumePrompt, buildMcpHint, writeResumeFile } from "./memory/compressor.js";
import { ContextOptions } from "./memory/context-builder.js";
import { startMcpServer } from "./mcp/server.js";
import { writeMcpJson, removeMcpJson, writeGlobalMcpJson } from "./mcp/config.js";
import {
  loadMemory,
  saveMemory,
  initMemory,
  formatMemoryForPrompt,
  getMemexDir,
  memoryExists,
  clearMemory,
  ensureGitignore,
  setFocus,
} from "./memory/store.js";
import { getDb } from "./storage/db.js";
import {
  createSession,
  finalizeSession,
  listSessions,
  getSession,
  searchSessions,
  pruneOldSessions,
  SessionRow,
} from "./storage/queries.js";

const MEMEX_VERSION = "0.4.2";

// ─── ASCII logo ───────────────────────────────────────────────────────────────

function printLogo(): void {
  const logo = [
    "  ███╗   ███╗███████╗███╗   ███╗███████╗██╗  ██╗",
    "  ████╗ ████║██╔════╝████╗ ████║██╔════╝╚██╗██╔╝",
    "  ██╔████╔██║█████╗  ██╔████╔██║█████╗   ╚███╔╝ ",
    "  ██║╚██╔╝██║██╔══╝  ██║╚██╔╝██║██╔══╝   ██╔██╗ ",
    "  ██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║███████╗██╔╝ ██╗",
    "  ╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝",
  ];
  console.log(chalk.magenta(logo.join("\n")));
  console.log(chalk.dim(`  persistent memory for AI agents  ·  v${MEMEX_VERSION}`));
  console.log();
}

const program = new Command();

program
  .name("memex")
  .description("Persistent memory for any AI terminal agent")
  .version(MEMEX_VERSION)
  .addHelpText("afterAll", "\n  npm: @patravishek/memex  |  https://github.com/patravishek/memex")
  .hook("preAction", (thisCommand) => {
    const aiCommands = ["start", "resume", "compress"];
    if (!aiCommands.includes(thisCommand.args[0])) return;

    const hasKey =
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.LITELLM_API_KEY;

    if (!hasKey) {
      console.error(chalk.red("\n  No AI provider configured.\n"));
      console.error(
        chalk.dim("  Add one of the following to your ~/.zshrc (or ~/.bashrc):\n")
      );
      console.error(chalk.dim("    export ANTHROPIC_API_KEY=sk-ant-..."));
      console.error(chalk.dim("    export OPENAI_API_KEY=sk-..."));
      console.error(
        chalk.dim(
          "    export LITELLM_API_KEY=... LITELLM_BASE_URL=https://your-proxy.com\n"
        )
      );
      console.error(chalk.dim("  Then reload your shell: source ~/.zshrc\n"));
      process.exit(1);
    }
  });

// ─── memex start [command] ────────────────────────────────────────────────────
program
  .command("start")
  .description("Start an agent session with memory tracking")
  .argument("[command]", "Agent command to run", "claude")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .option("--args <args>", "Extra args to pass to the agent command", "")
  .action(async (command: string, options) => {
    const projectPath = path.resolve(options.project);
    const memexDir = getMemexDir(projectPath);

    // Ensure .memex/ and .mcp.json are excluded from git in this project
    if (ensureGitignore(projectPath)) {
      console.log(chalk.dim("  Added .memex/ and .mcp.json to .gitignore\n"));
    }

    printLogo();
    console.log(chalk.bold("  session started"));
    console.log(chalk.dim(`  Project: ${projectPath}`));
    console.log(chalk.dim(`  Agent:   ${command}\n`));

    if (memoryExists(projectPath)) {
      const memory = loadMemory(projectPath)!;
      console.log(
        chalk.dim(
          `  Memory loaded — last updated ${new Date(memory.lastUpdated).toLocaleString()}`
        )
      );
      console.log(chalk.dim(`  Focus: ${memory.currentFocus || "not set"}\n`));
    } else {
      initMemory(projectPath);
      console.log(chalk.dim("  No memory found — initialized fresh.\n"));
    }

    const db = getDb(memexDir);
    const sessionId = createSession(db, projectPath, command);
    const logger = new SessionLogger(memexDir);
    const args = options.args ? options.args.split(" ").filter(Boolean) : [];

    try {
      const result = await wrapProcess(logger, {
        command,
        args,
        cwd: projectPath,
      });

      await runCompression(
        result.transcript,
        projectPath,
        result.logPath,
        logger.getConversationTurns(),
        sessionId
      );
    } catch (err) {
      const errMsg = (err as Error).message;
      const transcript = logger.getTranscript();
      if (transcript && logger.getEntryCount() > 3) {
        await runCompression(
          transcript,
          projectPath,
          logger.getLogPath(),
          logger.getConversationTurns(),
          sessionId
        );
      } else {
        console.error(chalk.red(`\n  Session ended: ${errMsg}`));
      }
    }
  });

// ─── memex resume [command] ───────────────────────────────────────────────────
program
  .command("resume")
  .description("Resume an agent session with full context restored")
  .argument("[command]", "Agent command to run", "claude")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .option("--args <args>", "Extra args to pass to the agent command", "")
  .option(
    "--no-mcp",
    "Disable MCP mode: inject full context via CLAUDE.md instead (v0.1 behaviour)",
    false
  )
  .option(
    "--tier <n>",
    "Context verbosity: 1=one-liner, 2=key facts, 3=full (default: 3 for --no-mcp, 1 for MCP)",
    (v) => parseInt(v, 10) as 1 | 2 | 3
  )
  .option(
    "--max-tokens <n>",
    "Approx token budget for injected context (1 token ≈ 4 chars). Default: no hard cap.",
    (v) => parseInt(v, 10)
  )
  .option(
    "--focus <topic>",
    'Surface memory relevant to a specific topic first, e.g. --focus "auth bug"'
  )
  .action(async (command: string, options) => {
    const projectPath = path.resolve(options.project);
    const memexDir = getMemexDir(projectPath);
    const memory = loadMemory(projectPath);

    // Ensure .memex/ and .mcp.json are excluded from git in this project
    if (ensureGitignore(projectPath)) {
      console.log(chalk.dim("  Added .memex/ and .mcp.json to .gitignore\n"));
    }

    // MCP mode: on by default for Claude, off for other agents or when --no-mcp passed.
    // In MCP mode we write a short hint (~500 chars) to CLAUDE.md + generate .mcp.json.
    // The full memory dump is served on demand via MCP tools.
    const useMcp = command === "claude" && options.mcp !== false;

    // v0.4: build ContextOptions from CLI flags.
    // --focus also persists to memory.currentFocus so future resumes inherit it
    // without needing to retype it. The AI updates currentFocus naturally during
    // compression, so it stays fresh.
    // If --focus is passed, persist it via setFocus (updates focusHistory too)
    if (options.focus) {
      setFocus(projectPath, options.focus);
    }

    // Re-load after potential focus update
    const currentMemory = loadMemory(projectPath);
    const focusTopic: string | undefined =
      currentMemory?.currentFocus || undefined;

    const ctxOpts: ContextOptions = {
      tier: options.tier ?? (useMcp ? 1 : 3),
      maxTokens: options.maxTokens,
      focus: focusTopic,
    };

    printLogo();
    console.log(chalk.bold("  resuming session\n"));
    if (useMcp) {
      console.log(chalk.dim("  Mode: MCP (context served on demand via tools)"));
    }
    if (ctxOpts.focus) {
      const focusSource = options.focus ? "from flag, saved to memory" : "from memory";
      console.log(chalk.dim(`  Focus: "${ctxOpts.focus}" (${focusSource})`));
    }
    if (ctxOpts.maxTokens) {
      console.log(chalk.dim(`  Token budget: ~${ctxOpts.maxTokens} tokens`));
    }
    if (ctxOpts.tier && ctxOpts.tier !== 3) {
      console.log(chalk.dim(`  Tier: ${ctxOpts.tier} (${ctxOpts.tier === 1 ? "one-liner" : "key facts"})`));
    }
    console.log();

    if (!currentMemory) {
      console.log(
        chalk.yellow(
          "  No memory found for this project. Starting fresh session instead.\n"
        )
      );
      initMemory(projectPath);
    } else {
      console.log(chalk.bold("  Restoring context:\n"));
      console.log(
        chalk.dim(
          formatMemoryForPrompt(currentMemory)
            .split("\n")
            .map((l) => `  ${l}`)
            .join("\n")
        )
      );
      console.log();
    }

    const claudeMdPath = path.join(projectPath, "CLAUDE.md");
    const resumeFilePath = path.join(memexDir, "RESUME.md");
    let injectedViaClaudeMd = false;
    let originalClaudeMd: string | null = null;
    let wroteProjectMcpJson = false;

    if (currentMemory) {
      if (useMcp) {
        // ── MCP mode: short hint in CLAUDE.md + .mcp.json in project root ──
        originalClaudeMd = fs.existsSync(claudeMdPath)
          ? fs.readFileSync(claudeMdPath, "utf-8")
          : null;

        const hint = buildMcpHint(currentMemory, { focus: ctxOpts.focus });
        const memexSection = [
          "<!-- MEMEX_CONTEXT_START -->",
          hint,
          "<!-- MEMEX_CONTEXT_END -->",
          "",
        ].join("\n");

        const existing = originalClaudeMd ? `\n\n${originalClaudeMd}` : "";
        fs.writeFileSync(claudeMdPath, memexSection + existing, "utf-8");
        injectedViaClaudeMd = true;

        // Generate .mcp.json so Claude launches `memex serve` automatically
        const mcpJsonPath = writeMcpJson(projectPath, projectPath);
        wroteProjectMcpJson = true;

        console.log(chalk.dim(`  Context hint injected → ${claudeMdPath}`) + chalk.dim(` (${hint.length} chars)`));
        console.log(chalk.dim(`  MCP config written    → ${mcpJsonPath}`));
        console.log(chalk.dim("  Claude will auto-connect to Memex tools on startup\n"));
      } else {
        // ── Legacy mode: full context dump into CLAUDE.md / RESUME.md ──
        writeResumeFile(currentMemory, resumeFilePath, ctxOpts);

        if (command === "claude") {
          originalClaudeMd = fs.existsSync(claudeMdPath)
            ? fs.readFileSync(claudeMdPath, "utf-8")
            : null;

          const memexSection = [
            "<!-- MEMEX_CONTEXT_START -->",
            fs.readFileSync(resumeFilePath, "utf-8"),
            "<!-- MEMEX_CONTEXT_END -->",
            "",
          ].join("\n");

          const existing = originalClaudeMd ? `\n\n${originalClaudeMd}` : "";
          fs.writeFileSync(claudeMdPath, memexSection + existing, "utf-8");
          injectedViaClaudeMd = true;
          console.log(chalk.dim(`  Context injected → ${claudeMdPath}`));
          console.log(chalk.dim("  Claude reads this on startup — it will acknowledge the context when it starts\n"));
        } else {
          console.log(chalk.dim(`  Context written to: ${resumeFilePath}\n`));
        }
      }
    }

    const db = getDb(memexDir);
    const sessionId = createSession(db, projectPath, command);
    const logger = new SessionLogger(memexDir);
    const args = options.args ? options.args.split(" ").filter(Boolean) : [];

    try {
      const result = await wrapProcess(logger, {
        command,
        args,
        cwd: projectPath,
        injectOnReady: !injectedViaClaudeMd && memory
          ? `Please read the file ${resumeFilePath} to restore context from our previous sessions, then ask how to continue.`
          : undefined,
        injectDelayMs: 3000,
      });

      await runCompression(
        result.transcript,
        projectPath,
        result.logPath,
        logger.getConversationTurns(),
        sessionId
      );
    } catch (err) {
      const transcript = logger.getTranscript();
      if (transcript && logger.getEntryCount() > 3) {
        await runCompression(
          transcript,
          projectPath,
          logger.getLogPath(),
          logger.getConversationTurns(),
          sessionId
        );
      }
    } finally {
      // Restore CLAUDE.md and clean up temp files
      if (injectedViaClaudeMd) {
        if (originalClaudeMd === null) {
          fs.rmSync(claudeMdPath, { force: true });
        } else {
          fs.writeFileSync(claudeMdPath, originalClaudeMd, "utf-8");
        }
      }
      // Remove the session-scoped .mcp.json (keep it only if setup-mcp was used)
      if (wroteProjectMcpJson) {
        removeMcpJson(projectPath);
      }
      if (fs.existsSync(resumeFilePath)) fs.unlinkSync(resumeFilePath);
    }
  });

// ─── memex serve ──────────────────────────────────────────────────────────────
program
  .command("serve")
  .description("Start the Memex MCP server (stdio transport) for an agent to connect to")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .action(async (options) => {
    const projectPath = path.resolve(options.project);
    // MCP server communicates over stdio — no console output after this point
    // or it will corrupt the JSON-RPC framing.
    await startMcpServer(projectPath);
  });

// ─── memex setup-mcp ──────────────────────────────────────────────────────────
program
  .command("setup-mcp")
  .description("Generate .mcp.json so Claude Code auto-connects to Memex on startup")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .option("--global", "Write to ~/.claude/mcp.json (applies to all Claude sessions)", false)
  .action((options) => {
    const projectPath = path.resolve(options.project);

    let filePath: string;
    if (options.global) {
      filePath = writeGlobalMcpJson(projectPath);
      console.log(chalk.green(`\n  Global MCP config written → ${filePath}`));
      console.log(chalk.dim("  Project path is resolved dynamically at runtime."));
      console.log(chalk.dim("  Claude will use Memex tools for whichever project is open.\n"));
    } else {
      filePath = writeMcpJson(projectPath, projectPath);
      console.log(chalk.green(`\n  MCP config written → ${filePath}`));
      console.log(chalk.dim(`  Project: ${projectPath}`));
      console.log(chalk.dim("  Commit this file to share Memex with your team.\n"));
    }

    console.log(chalk.bold("  Available tools once connected:"));
    const tools = [
      ["get_context", "Project summary, stack, current focus"],
      ["get_tasks", "Pending tasks"],
      ["get_decisions", "Key architectural decisions"],
      ["get_gotchas", "Pitfalls to avoid"],
      ["get_important_files", "Files worth knowing about"],
      ["get_recent_conversation", "Last N conversation turns"],
      ["search_sessions", "Full-text search across session history"],
      ["get_session", "Full detail of any past session"],
      ["save_observation", "Save notes, tasks, decisions mid-session"],
    ];
    for (const [name, desc] of tools) {
      console.log(`  ${chalk.cyan(name.padEnd(28))} ${chalk.dim(desc)}`);
    }
    console.log();
  });

// ─── memex focus ──────────────────────────────────────────────────────────────
program
  .command("focus")
  .description('Set the current focus topic, e.g. memex focus "auth bug"')
  .argument("[topic]", "New focus topic to set")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .option("--list", "List current focus and all past focus topics")
  .option("--clear", "Clear the current focus entirely")
  .action((topic: string | undefined, options) => {
    const projectPath = path.resolve(options.project);
    const memory = loadMemory(projectPath);

    if (!memory) {
      console.log(chalk.yellow("\n  No memory found. Run `memex start` first.\n"));
      return;
    }

    // ── Clear ────────────────────────────────────────────────────────────────
    if (options.clear) {
      setFocus(projectPath, "");
      console.log(chalk.bold.magenta("\n  memex — focus cleared\n"));
      return;
    }

    // ── List ─────────────────────────────────────────────────────────────────
    if (options.list) {
      console.log(chalk.bold.magenta("\n  memex — focus history\n"));

      if (memory.currentFocus) {
        console.log(chalk.bold("  Current: ") + chalk.green(memory.currentFocus));
      } else {
        console.log(chalk.dim("  Current: (none)"));
      }

      const history = memory.focusHistory ?? [];
      if (history.length) {
        console.log(chalk.dim("\n  Past topics (most recent first):"));
        [...history].reverse().forEach((f, i) => {
          console.log(chalk.dim(`    ${i + 1}. ${f}`));
        });
      } else {
        console.log(chalk.dim("\n  No focus history yet."));
      }
      console.log();
      return;
    }

    // ── Set ──────────────────────────────────────────────────────────────────
    if (topic) {
      const updated = setFocus(projectPath, topic);
      console.log(chalk.bold.magenta("\n  memex — focus updated\n"));
      console.log(chalk.bold("  Current: ") + chalk.green(updated.currentFocus));
      if (updated.focusHistory?.length) {
        console.log(chalk.dim(`\n  Previous: ${[...updated.focusHistory].reverse()[0]}`));
      }
      console.log(chalk.dim("\n  Use `memex focus --list` to see full history.\n"));
      return;
    }

    // ── No args: show usage hint ──────────────────────────────────────────────
    console.log(chalk.bold.magenta("\n  memex focus\n"));
    console.log(chalk.dim("  Commands:"));
    console.log(chalk.dim('    memex focus "my topic"      — set a new focus'));
    console.log(chalk.dim("    memex focus --list          — list current + history"));
    console.log(chalk.dim("    memex focus --clear         — clear current focus"));
    console.log(chalk.dim('    memex resume claude --focus "my topic"  — set at session start\n'));
  });

// ─── memex status ─────────────────────────────────────────────────────────────
program
  .command("status")
  .description("Show current memory for this project")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .option("--json", "Output memory as JSON (for tooling / IDE extensions)")
  .action((options) => {
    const projectPath = path.resolve(options.project);
    const memory = loadMemory(projectPath);

    if (!memory) {
      if (options.json) {
        console.log(JSON.stringify({ error: "No memory found" }));
      } else {
        console.log(
          chalk.yellow("\n  No memory found. Run `memex start` to begin tracking.\n")
        );
      }
      return;
    }

    if (options.json) {
      const memexDir = getMemexDir(projectPath);
      const db = getDb(memexDir);
      const sessions = listSessions(db, projectPath, 1000);
      console.log(JSON.stringify({ ...memory, sessionCount: sessions.length }, null, 2));
      return;
    }

    console.log(chalk.bold.magenta("\n  memex — project memory\n"));
    console.log(
      formatMemoryForPrompt(memory)
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n")
    );

    const memexDir = getMemexDir(projectPath);
    const db = getDb(memexDir);
    const sessions = listSessions(db, projectPath, 1000);
    console.log(chalk.dim(`\n  Sessions recorded: ${sessions.length}`));
    console.log(
      chalk.dim(`  Database: ${path.join(memexDir, "memex.db")}\n`)
    );
  });

// ─── memex history ────────────────────────────────────────────────────────────
program
  .command("history")
  .description("List past sessions for this project")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .option("-n, --limit <n>", "Number of sessions to show", "20")
  .option("--all", "Show sessions across all projects", false)
  .action((options) => {
    const projectPath = path.resolve(options.project);
    const memexDir = getMemexDir(options.all ? process.cwd() : projectPath);
    const db = getDb(memexDir);
    const limit = parseInt(options.limit, 10);

    const sessions = options.all
      ? listSessions(db, undefined, limit)
      : listSessions(db, projectPath, limit);

    if (sessions.length === 0) {
      console.log(
        chalk.yellow("\n  No sessions recorded yet. Run `memex start` to begin.\n")
      );
      return;
    }

    console.log(chalk.bold.magenta("\n  memex — session history\n"));

    for (const s of sessions) {
      const date = new Date(s.started_at).toLocaleString();
      const duration = s.ended_at
        ? formatDuration(
            new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()
          )
        : "ongoing";

      const status = s.ended_at ? chalk.dim(duration) : chalk.yellow("ongoing");
      const summary = s.summary
        ? chalk.white(truncate(s.summary, 80))
        : chalk.dim("no summary");

      console.log(
        `  ${chalk.cyan(`#${s.id}`)}  ${chalk.dim(date)}  [${chalk.magenta(s.agent)}]  ${status}`
      );
      console.log(`     ${summary}`);
      if (options.all) {
        console.log(chalk.dim(`     ${s.project_path}`));
      }
      console.log();
    }

    console.log(chalk.dim(`  Use \`memex show <id>\` to view a session in full.\n`));
  });

// ─── memex show <id> ──────────────────────────────────────────────────────────
program
  .command("show <id>")
  .description("Show full details of a past session")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .action((id: string, options) => {
    const projectPath = path.resolve(options.project);
    const memexDir = getMemexDir(projectPath);
    const db = getDb(memexDir);

    const session = getSession(db, parseInt(id, 10));
    if (!session) {
      console.log(chalk.red(`\n  Session #${id} not found.\n`));
      process.exit(1);
    }

    console.log(chalk.bold.magenta(`\n  memex — session #${session.id}\n`));
    console.log(chalk.dim(`  Project: ${session.project_path}`));
    console.log(chalk.dim(`  Agent:   ${session.agent}`));
    console.log(
      chalk.dim(`  Started: ${new Date(session.started_at).toLocaleString()}`)
    );
    if (session.ended_at) {
      console.log(
        chalk.dim(`  Ended:   ${new Date(session.ended_at).toLocaleString()}`)
      );
      const ms =
        new Date(session.ended_at).getTime() -
        new Date(session.started_at).getTime();
      console.log(chalk.dim(`  Duration: ${formatDuration(ms)}`));
    }
    if (session.log_file) {
      console.log(chalk.dim(`  Log file: ${session.log_file}`));
    }

    if (session.summary) {
      console.log(chalk.bold("\n  Summary:"));
      console.log(`  ${session.summary}`);
    }

    if (session.turns.length > 0) {
      console.log(chalk.bold(`\n  Conversation (${session.turns.length} turns):\n`));

      for (const turn of session.turns) {
        const label =
          turn.role === "user"
            ? chalk.green("  You")
            : chalk.blue("  Agent");
        const time = chalk.dim(new Date(turn.ts).toLocaleTimeString());
        console.log(`${label}  ${time}`);
        console.log(
          chalk.white(
            turn.content
              .split("\n")
              .map((l) => `    ${l}`)
              .join("\n")
          )
        );
        console.log();
      }
    } else {
      console.log(chalk.dim("\n  No conversation turns recorded for this session.\n"));
    }
  });

// ─── memex search <query> ─────────────────────────────────────────────────────
program
  .command("search <query>")
  .description("Full-text search across session summaries")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .option("--all", "Search across all projects", false)
  .action((query: string, options) => {
    const projectPath = path.resolve(options.project);
    const memexDir = getMemexDir(projectPath);
    const db = getDb(memexDir);

    const results = options.all
      ? searchSessions(db, query)
      : searchSessions(db, query, projectPath);

    if (results.length === 0) {
      console.log(
        chalk.yellow(`\n  No sessions match "${query}".\n`)
      );
      return;
    }

    console.log(chalk.bold.magenta(`\n  memex — search: "${query}"\n`));

    for (const r of results) {
      const date = new Date(r.started_at).toLocaleString();
      console.log(
        `  ${chalk.cyan(`#${r.id}`)}  ${chalk.dim(date)}  [${chalk.magenta(r.agent)}]`
      );
      if (options.all) {
        console.log(chalk.dim(`     ${r.project_path}`));
      }
      console.log(`     ${chalk.white(r.snippet)}`);
      console.log();
    }

    console.log(
      chalk.dim(`  ${results.length} result(s). Use \`memex show <id>\` for details.\n`)
    );
  });

// ─── memex forget ─────────────────────────────────────────────────────────────
program
  .command("forget")
  .description("Clear all memory for this project")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .option("--keep-sessions", "Keep session history, only clear memory fields", false)
  .action((options) => {
    const projectPath = path.resolve(options.project);
    const memexDir = getMemexDir(projectPath);

    if (!memoryExists(projectPath)) {
      console.log(chalk.yellow("\n  No memory to clear.\n"));
      return;
    }

    clearMemory(projectPath, options.keepSessions);

    if (!options.keepSessions) {
      const sessionsDir = path.join(memexDir, "sessions");
      if (fs.existsSync(sessionsDir)) {
        fs.rmSync(sessionsDir, { recursive: true });
      }
    }

    console.log(
      chalk.green(
        options.keepSessions
          ? "\n  Memory fields cleared (session history preserved).\n"
          : "\n  Memory cleared.\n"
      )
    );
  });

// ─── memex compress ───────────────────────────────────────────────────────────
program
  .command("compress")
  .description("Manually re-compress the latest session into memory")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .action(async (options) => {
    const projectPath = path.resolve(options.project);
    const sessionsDir = path.join(getMemexDir(projectPath), "sessions");

    if (!fs.existsSync(sessionsDir)) {
      console.log(chalk.yellow("\n  No sessions found to compress.\n"));
      return;
    }

    const files = fs
      .readdirSync(sessionsDir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort();

    if (files.length === 0) {
      console.log(chalk.yellow("\n  No session logs found.\n"));
      return;
    }

    const latest = path.join(sessionsDir, files[files.length - 1]);
    const lines = fs.readFileSync(latest, "utf-8").trim().split("\n");
    const transcript = lines
      .map((l) => {
        try {
          const e = JSON.parse(l);
          return `[${e.source.toUpperCase()}]: ${e.text}`;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .join("\n");

    await runCompression(transcript, projectPath, latest);
  });

// ─── memex prune ─────────────────────────────────────────────────────────────
program
  .command("prune")
  .description("Delete session records older than N days")
  .argument("[days]", "Retention period in days", "30")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .action((days: string, options) => {
    const projectPath = path.resolve(options.project);
    const memexDir = getMemexDir(projectPath);
    const db = getDb(memexDir);
    const keepDays = parseInt(days, 10);

    const removed = pruneOldSessions(db, projectPath, keepDays);

    if (removed === 0) {
      console.log(
        chalk.dim(`\n  No sessions older than ${keepDays} days to remove.\n`)
      );
    } else {
      console.log(
        chalk.green(`\n  Removed ${removed} session(s) older than ${keepDays} days.\n`)
      );
    }
  });

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function runCompression(
  transcript: string,
  projectPath: string,
  logPath: string,
  conversationTurns: ConversationTurn[] = [],
  sessionId?: number
): Promise<void> {
  if (!transcript || transcript.trim().length < 50) {
    console.log(chalk.dim("\n  Session too short to compress.\n"));
    return;
  }

  const spinner = ora("  Compressing session into memory...").start();
  try {
    const updated = await compressSession(transcript, projectPath, logPath);

    const MAX_TURNS = 30;
    const turns = conversationTurns.slice(-MAX_TURNS);
    updated.lastConversation = turns;
    saveMemory(projectPath, updated);

    // Persist the session record + turns in SQLite
    if (sessionId !== undefined) {
      const memexDir = getMemexDir(projectPath);
      const db = getDb(memexDir);
      const sessionSummary = updated.recentSessions.at(-1)?.summary ?? "";
      finalizeSession(db, sessionId, sessionSummary, logPath, turns);
    }

    spinner.succeed(
      chalk.green("  Memory updated") +
        chalk.dim(` — focus: ${updated.currentFocus || "not set"}`)
    );
    console.log(
      chalk.dim(`  Pending tasks: ${updated.pendingTasks.length}`) +
        chalk.dim(`, gotchas: ${updated.gotchas.length}`) +
        chalk.dim(`, conversation turns saved: ${turns.length}\n`)
    );
  } catch (err) {
    const reason = (err as Error).message;
    spinner.fail(chalk.red("  Compression failed — raw session log preserved"));
    console.error(chalk.yellow(`\n  Reason: ${reason}`));
    if (reason.includes("API key")) {
      console.error(chalk.dim("  Fix: add your key to ~/.zshrc and run: source ~/.zshrc\n"));
    } else {
      console.error(chalk.dim(`  Raw log saved to: ${logPath}\n`));
    }
  }
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

program.parse();
