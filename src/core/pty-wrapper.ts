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

function resolveCommandPath(command: string): string {
  // Spawn through `which` to resolve the full path from the user's shell PATH.
  // This handles nvm-managed binaries, homebrew installs, etc.
  try {
    const shell = process.env.SHELL ?? "/bin/zsh";
    const result = child_process.spawnSync(
      shell,
      ["-i", "-c", `which ${command}`],
      { encoding: "utf-8" }
    );
    const resolved = result.stdout?.trim();
    if (resolved && resolved.length > 0) return resolved;
  } catch {
    // fall through to using command as-is
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
