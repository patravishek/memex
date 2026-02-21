import * as pty from "node-pty";
import * as child_process from "child_process";
import { SessionLogger } from "./session-logger.js";

export interface WrapOptions {
  /** Command to run, e.g. "claude" */
  command: string;
  args?: string[];
  cwd?: string;
  /** Text to auto-send as the first message once the agent is ready */
  injectOnReady?: string;
  /** Milliseconds to wait before injecting the first message */
  injectDelayMs?: number;
}

export interface WrapResult {
  exitCode: number;
  transcript: string;
  logPath: string;
}

// Common binary locations to check as fallback when shell lookup fails
const COMMON_BIN_DIRS = [
  "/opt/homebrew/bin",       // Homebrew on Apple Silicon
  "/usr/local/bin",          // Homebrew on Intel / manual installs
  "/usr/bin",
  "/bin",
  process.env.HOME ? `${process.env.HOME}/.local/bin` : "",
  process.env.HOME ? `${process.env.HOME}/.nvm/versions/node/current/bin` : "",
].filter(Boolean);

function resolveCommandPath(command: string): string {
  // If already an absolute path, use it directly
  if (command.startsWith("/")) return command;

  // Try resolving via login shell — sources ~/.zshrc / ~/.bash_profile
  // so it finds nvm, homebrew, and other managed binaries
  try {
    const shell = process.env.SHELL ?? "/bin/zsh";
    const result = child_process.spawnSync(
      shell,
      ["-lc", `which ${command}`],
      { encoding: "utf-8", timeout: 5000 }
    );
    const resolved = result.stdout?.trim().split("\n")[0];
    if (resolved && resolved.startsWith("/")) return resolved;
  } catch {
    // fall through to directory scan
  }

  // Fallback: scan known binary directories directly
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  for (const dir of COMMON_BIN_DIRS) {
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // not here, keep scanning
    }
  }

  return command;
}

export async function wrapProcess(
  logger: SessionLogger,
  options: WrapOptions
): Promise<WrapResult> {
  return new Promise((resolve, reject) => {
    const shell = process.env.SHELL ?? "/bin/zsh";
    const cols = process.stdout.columns ?? 120;
    const rows = process.stdout.rows ?? 30;

    // Resolve the full binary path so node-pty can find it without a login shell
    const resolvedCommand = resolveCommandPath(options.command);

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(resolvedCommand, options.args ?? [], {
        name: "xterm-color",
        cols,
        rows,
        cwd: options.cwd ?? process.cwd(),
        env: process.env as Record<string, string>,
      });
    } catch (spawnErr) {
      reject(
        new Error(
          `Could not start "${options.command}". Is it installed and in your PATH?\n` +
            `Run: which ${options.command}`
        )
      );
      return;
    }

    // Resize PTY when terminal resizes
    process.stdout.on("resize", () => {
      ptyProcess.resize(
        process.stdout.columns ?? 120,
        process.stdout.rows ?? 30
      );
    });

    // PTY output → stdout + logger
    ptyProcess.onData((data: string) => {
      process.stdout.write(data);
      logger.logOutput(data);
    });

    // stdin → PTY + logger
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on("data", (data: Buffer) => {
      const str = data.toString();
      ptyProcess.write(str);
      logger.logInput(str);
    });

    // Auto-inject context after delay if provided
    if (options.injectOnReady) {
      const delay = options.injectDelayMs ?? 2500;
      const injectedText = options.injectOnReady;

      setTimeout(() => {
        ptyProcess.write(injectedText + "\r");
        logger.logInput(injectedText + "\n");
      }, delay);
    }

    ptyProcess.onExit(({ exitCode }) => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      logger.close();

      resolve({
        exitCode: exitCode ?? 0,
        transcript: logger.getTranscript(),
        logPath: logger.getLogPath(),
      });
    });
  });
}
