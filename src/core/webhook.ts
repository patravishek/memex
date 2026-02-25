import * as https from "https";
import * as http from "http";
import { ProjectMemory } from "../memory/store.js";

export interface WebhookPayload {
  event: "session_end" | "snapshot";
  projectPath: string;
  projectName?: string;
  focus?: string;
  summary?: string;
  pendingTasks: string[];
  gotchas: string[];
  timestamp: string;
}

/**
 * POST a JSON payload to a webhook URL.
 * Never throws — webhook errors are silently swallowed so they never
 * interrupt the user's session flow.
 */
export async function fireWebhook(url: string, payload: WebhookPayload): Promise<void> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      resolve();
      return;
    }

    const body = JSON.stringify(payload);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "memex/0.6",
        },
      },
      () => resolve()
    );

    req.on("error", () => resolve());
    req.setTimeout(5000, () => {
      req.destroy();
      resolve();
    });
    req.write(body);
    req.end();
  });
}

/**
 * Build a webhook payload from a ProjectMemory object.
 */
export function buildWebhookPayload(
  memory: ProjectMemory,
  event: WebhookPayload["event"],
  summary?: string
): WebhookPayload {
  return {
    event,
    projectPath: memory.projectPath,
    projectName: memory.projectName,
    focus: memory.currentFocus,
    summary,
    pendingTasks: memory.pendingTasks ?? [],
    gotchas: memory.gotchas ?? [],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Resolve webhook URL from env var or .memex/config.json.
 * Returns undefined if no webhook is configured.
 */
export function getWebhookUrl(memexDir: string): string | undefined {
  if (process.env.MEMEX_WEBHOOK_URL) {
    return process.env.MEMEX_WEBHOOK_URL;
  }

  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const configPath = path.join(memexDir, "config.json");

  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      if (typeof cfg.webhookUrl === "string") return cfg.webhookUrl;
    } catch {
      // ignore
    }
  }

  return undefined;
}
