import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SessionLogger } from "./session-logger.js";

export interface WrapOptions {
  command: string;
  args?: string[];
  cwd?: string;
  injectOnReady?: string;
  injectDelayMs?: number;
}

export interface WrapResult {
  exitCode: number;
  transcript: string;
  logPath: string;
}

// Common binary locations — checked in order when shell lookup fails
const COMMON_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  process.env.HOME ? `${process.env.HOME}/.local/bin` : "",
].filter(Boolean);

function resolveCommandPath(command: string): string {
  if (command.startsWith("/")) return command;

  try {
    const shell = process.env.SHELL ?? "/bin/zsh";
    const result = child_process.spawnSync(shell, ["-lc", `which ${command}`], {
      encoding: "utf-8",
      timeout: 5000,
    });
    const resolved = result.stdout?.trim().split("\n")[0];
    if (resolved && resolved.startsWith("/")) return resolved;
  } catch {
    // fall through
  }

  for (const dir of COMMON_BIN_DIRS) {
    const candidate = path.join(dir as string, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep scanning
    }
  }

  return command;
}

/**
 * Primary strategy: record via macOS `script` command (no native bindings).
 * `script -q <logfile> <cmd>` transparently records all terminal I/O.
 */
async function wrapWithScript(
  logger: SessionLogger,
  options: WrapOptions,
  resolvedCommand: string
): Promise<WrapResult> {
  return new Promise((resolve, reject) => {
    // script records raw terminal output; we use a separate txt file for it
    const rawLogPath = logger.getLogPath().replace(".jsonl", "-raw.txt");

    // If we need to inject a resume prompt, write it to a temp file
    // and prepend a note so the agent reads it on first turn
    let injectFile: string | null = null;
    if (options.injectOnReady) {
      injectFile = path.join(os.tmpdir(), `memex-context-${Date.now()}.txt`);
      fs.writeFileSync(injectFile, options.injectOnReady, "utf-8");
    }

    const args = options.args ?? [];

    // macOS `script` syntax: script [-q] [-F pipe] [file [command [args]]]
    // -q = quiet (no typescript start/stop messages)
    const scriptArgs = ["-q", rawLogPath, resolvedCommand, ...args];

    const proc = child_process.spawn("script", scriptArgs, {
      stdio: "inherit",
      cwd: options.cwd ?? process.cwd(),
      env: {
        ...process.env,
        // Pass the context file path if resuming — agent can be told to read it
        ...(injectFile ? { MEMEX_CONTEXT_FILE: injectFile } : {}),
      },
    });

    // If injecting a resume prompt, auto-type it via a stdin write after delay
    if (injectFile && options.injectOnReady) {
      const delay = options.injectDelayMs ?? 3000;
      const text = options.injectOnReady;
      setTimeout(() => {
        try {
          if (proc.stdin) {
            proc.stdin.write(text + "\n");
          } else {
            // stdin is inherited — write directly to process.stdin
            process.stdin.write(text + "\n");
          }
        } catch {
          // ignore — session may have ended
        }
      }, delay);
    }

    proc.on("error", (err) => {
      reject(new Error(`Failed to start session: ${err.message}`));
    });

    proc.on("close", (code) => {
      // Parse the raw script log into a readable transcript
      const transcript = parseScriptLog(rawLogPath);

      // Feed into session logger so it's saved in structured format
      transcript.split("\n").forEach((line) => {
        if (line.trim()) logger.logOutput(line);
      });
      logger.close();

      if (injectFile && fs.existsSync(injectFile)) {
        fs.unlinkSync(injectFile);
      }

      resolve({
        exitCode: code ?? 0,
        transcript,
        logPath: logger.getLogPath(),
      });
    });
  });
}

/**
 * Fallback strategy: spawn directly with inherited stdio.
 * No transcript capture — compression will work from minimal context.
 */
async function wrapWithSpawn(
  logger: SessionLogger,
  options: WrapOptions,
  resolvedCommand: string
): Promise<WrapResult> {
  return new Promise((resolve, reject) => {
    const proc = child_process.spawn(
      resolvedCommand,
      options.args ?? [],
      {
        stdio: "inherit",
        cwd: options.cwd ?? process.cwd(),
        env: process.env as Record<string, string>,
      }
    );

    proc.on("error", (err) => {
      reject(
        new Error(
          `Could not start "${resolvedCommand}": ${err.message}\n` +
          `Verify it is installed: which ${options.command}`
        )
      );
    });

    proc.on("close", (code) => {
      logger.close();
      resolve({
        exitCode: code ?? 0,
        transcript: logger.getTranscript(),
        logPath: logger.getLogPath(),
      });
    });
  });
}

export async function wrapProcess(
  logger: SessionLogger,
  options: WrapOptions
): Promise<WrapResult> {
  const resolvedCommand = resolveCommandPath(options.command);

  // Check the command actually exists before attempting anything
  try {
    fs.accessSync(resolvedCommand, fs.constants.X_OK);
  } catch {
    throw new Error(
      `Command "${options.command}" not found or not executable.\n` +
      `Expected at: ${resolvedCommand}\n` +
      `Run: which ${options.command}`
    );
  }

  // Try script-based recording first (macOS built-in, no native deps)
  try {
    return await wrapWithScript(logger, options, resolvedCommand);
  } catch (scriptErr) {
    // Fall back to plain spawn with inherited stdio
    console.error(`\n  [memex] script recording unavailable, falling back to direct spawn`);
    return await wrapWithSpawn(logger, options, resolvedCommand);
  }
}

function parseScriptLog(logPath: string): string {
  if (!fs.existsSync(logPath)) return "";

  try {
    const raw = fs.readFileSync(logPath, "utf-8");
    // Strip ANSI escape codes and carriage returns
    const clean = raw
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
      .replace(/\x1b\[[0-9;]*m/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[^\x20-\x7E\n\t]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return clean;
  } catch {
    return "";
  }
}
