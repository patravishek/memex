import * as fs from "fs";
import * as path from "path";
// @ts-ignore - strip-ansi v6 CJS has no types issue
import stripAnsi from "strip-ansi";

export interface LogEntry {
  ts: number;
  source: "user" | "agent";
  raw: string;
  text: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

export class SessionLogger {
  private logPath: string;
  private buffer: LogEntry[] = [];
  private writeStream: fs.WriteStream;
  private inputBuffer = "";

  constructor(memexDir: string) {
    const sessionsDir = path.join(memexDir, "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.logPath = path.join(sessionsDir, `${timestamp}.jsonl`);
    this.writeStream = fs.createWriteStream(this.logPath, { flags: "a" });
  }

  logOutput(raw: string): void {
    const text = stripAnsi(raw).trim();
    if (!text) return;

    const entry: LogEntry = {
      ts: Date.now(),
      source: "agent",
      raw,
      text,
    };

    this.buffer.push(entry);
    this.writeStream.write(JSON.stringify(entry) + "\n");
  }

  logInput(raw: string): void {
    // Buffer input chars and flush on newline
    this.inputBuffer += raw;

    if (this.inputBuffer.includes("\r") || this.inputBuffer.includes("\n")) {
      const text = stripAnsi(this.inputBuffer).replace(/[\r\n]/g, "").trim();
      this.inputBuffer = "";

      if (!text) return;

      const entry: LogEntry = {
        ts: Date.now(),
        source: "user",
        raw,
        text,
      };

      this.buffer.push(entry);
      this.writeStream.write(JSON.stringify(entry) + "\n");
    }
  }

  getTranscript(): string {
    return this.buffer
      .map((e) => `[${e.source.toUpperCase()}]: ${e.text}`)
      .join("\n");
  }

  /**
   * Collapse sequential entries from the same source into conversation turns.
   * This simulates the message structure of the original session so it can be
   * re-injected as context on resume — replicating Claude's --resume behaviour
   * without depending on Anthropic's server-side session storage.
   */
  getConversationTurns(): ConversationTurn[] {
    const turns: ConversationTurn[] = [];

    for (const entry of this.buffer) {
      const role = entry.source === "user" ? "user" : "assistant";
      const last = turns[turns.length - 1];

      if (last && last.role === role) {
        // Merge consecutive messages from the same role into one turn
        last.content += "\n" + entry.text;
      } else {
        turns.push({ role, content: entry.text, ts: entry.ts });
      }
    }

    return turns;
  }

  getLogPath(): string {
    return this.logPath;
  }

  getEntryCount(): number {
    return this.buffer.length;
  }

  close(): void {
    this.writeStream.end();
  }
}
