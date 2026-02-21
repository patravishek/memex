#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { SessionLogger } from "./core/session-logger.js";
import { wrapProcess } from "./core/pty-wrapper.js";
import { compressSession, buildResumePrompt } from "./memory/compressor.js";
import {
  loadMemory,
  saveMemory,
  initMemory,
  formatMemoryForPrompt,
  getMemexDir,
  memoryExists,
} from "./memory/store.js";

dotenv.config();

const program = new Command();

program
  .name("memex")
  .description("Persistent memory for any AI terminal agent")
  .version("0.1.0");

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

    console.log(chalk.bold.magenta("\n  memex — session started\n"));
    console.log(chalk.dim(`  Project: ${projectPath}`));
    console.log(chalk.dim(`  Agent:   ${command}\n`));

    if (memoryExists(projectPath)) {
      const memory = loadMemory(projectPath)!;
      console.log(
        chalk.dim(
          `  Memory loaded — last updated ${new Date(memory.lastUpdated).toLocaleString()}`
        )
      );
      console.log(
        chalk.dim(`  Focus: ${memory.currentFocus || "not set"}\n`)
      );
    } else {
      initMemory(projectPath);
      console.log(chalk.dim("  No memory found — initialized fresh.\n"));
    }

    const logger = new SessionLogger(memexDir);
    const args = options.args ? options.args.split(" ").filter(Boolean) : [];

    try {
      const result = await wrapProcess(logger, {
        command,
        args,
        cwd: projectPath,
      });

      await runCompression(result.transcript, projectPath, result.logPath);
    } catch (err) {
      const errMsg = (err as Error).message;
      // Compress even on error exit if we have transcript
      const transcript = logger.getTranscript();
      if (transcript && logger.getEntryCount() > 3) {
        await runCompression(transcript, projectPath, logger.getLogPath());
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
  .action(async (command: string, options) => {
    const projectPath = path.resolve(options.project);
    const memexDir = getMemexDir(projectPath);
    const memory = loadMemory(projectPath);

    console.log(chalk.bold.magenta("\n  memex — resuming session\n"));

    if (!memory) {
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
          formatMemoryForPrompt(memory)
            .split("\n")
            .map((l) => `  ${l}`)
            .join("\n")
        )
      );
      console.log();
    }

    const resumePrompt = memory ? buildResumePrompt(memory) : "";
    const logger = new SessionLogger(memexDir);
    const args = options.args ? options.args.split(" ").filter(Boolean) : [];

    try {
      const result = await wrapProcess(logger, {
        command,
        args,
        cwd: projectPath,
        injectOnReady: resumePrompt || undefined,
        injectDelayMs: 3000,
      });

      await runCompression(result.transcript, projectPath, result.logPath);
    } catch (err) {
      const transcript = logger.getTranscript();
      if (transcript && logger.getEntryCount() > 3) {
        await runCompression(transcript, projectPath, logger.getLogPath());
      }
    }
  });

// ─── memex status ─────────────────────────────────────────────────────────────
program
  .command("status")
  .description("Show current memory for this project")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .action((options) => {
    const projectPath = path.resolve(options.project);
    const memory = loadMemory(projectPath);

    if (!memory) {
      console.log(
        chalk.yellow(
          "\n  No memory found. Run `memex start` to begin tracking.\n"
        )
      );
      return;
    }

    console.log(chalk.bold.magenta("\n  memex — project memory\n"));
    console.log(formatMemoryForPrompt(memory)
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n")
    );

    const memexDir = getMemexDir(projectPath);
    const sessionsDir = path.join(memexDir, "sessions");
    if (fs.existsSync(sessionsDir)) {
      const count = fs.readdirSync(sessionsDir).length;
      console.log(chalk.dim(`\n  Sessions logged: ${count}`));
    }
    console.log(
      chalk.dim(
        `  Memory file: ${path.join(getMemexDir(projectPath), "memory.json")}\n`
      )
    );
  });

// ─── memex forget ─────────────────────────────────────────────────────────────
program
  .command("forget")
  .description("Clear all memory for this project")
  .option("-p, --project <path>", "Project directory", process.cwd())
  .option("--keep-sessions", "Keep raw session logs, only clear memory", false)
  .action((options) => {
    const projectPath = path.resolve(options.project);
    const memexDir = getMemexDir(projectPath);
    const memPath = path.join(memexDir, "memory.json");

    if (!fs.existsSync(memPath)) {
      console.log(chalk.yellow("\n  No memory to clear.\n"));
      return;
    }

    fs.rmSync(memPath);

    if (!options.keepSessions) {
      const sessionsDir = path.join(memexDir, "sessions");
      if (fs.existsSync(sessionsDir)) {
        fs.rmSync(sessionsDir, { recursive: true });
      }
    }

    console.log(chalk.green("\n  Memory cleared.\n"));
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function runCompression(
  transcript: string,
  projectPath: string,
  logPath: string
): Promise<void> {
  if (!transcript || transcript.trim().length < 50) {
    console.log(chalk.dim("\n  Session too short to compress.\n"));
    return;
  }

  const spinner = ora("  Compressing session into memory...").start();
  try {
    const updated = await compressSession(transcript, projectPath, logPath);
    spinner.succeed(
      chalk.green("  Memory updated") +
        chalk.dim(` — focus: ${updated.currentFocus || "not set"}`)
    );
    console.log(
      chalk.dim(`  Pending tasks: ${updated.pendingTasks.length}`) +
        chalk.dim(`, gotchas: ${updated.gotchas.length}\n`)
    );
  } catch (err) {
    spinner.fail(
      chalk.red("  Compression failed — raw session log preserved")
    );
    console.error(chalk.dim(`  ${(err as Error).message}\n`));
  }
}

program.parse();
