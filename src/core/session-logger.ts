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
