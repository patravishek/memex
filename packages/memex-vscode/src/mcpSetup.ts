import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { execSync } from "child_process";

interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

function resolveMemexBinary(): string {
  // Try to find the full path so Cursor/IDE processes that don't load
  // shell profiles (nvm, volta, fnm) can still find the binary.
  try {
    return execSync("which memex", { encoding: "utf-8" }).trim();
  } catch {
    return "memex"; // fallback — works if memex is in system PATH
  }
}

function buildMemexEntry(projectPath: string): McpServerEntry {
  return {
    command: resolveMemexBinary(),
    args: ["serve", "--project", projectPath],
    env: {},
  };
}

function writeMcpFile(filePath: string, projectPath: string): boolean {
  let existing: McpConfig = { mcpServers: {} };

  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, "utf-8")) as McpConfig;
      existing.mcpServers ??= {};

      // Already has an up-to-date memex entry — skip
      const current = existing.mcpServers["memex"];
      const expectedCommand = resolveMemexBinary();
      if (
        current?.command === expectedCommand &&
        JSON.stringify(current.args) === JSON.stringify(["serve", "--project", projectPath])
      ) {
        return false;
      }
    } catch {
      // Malformed file — overwrite
    }
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  existing.mcpServers["memex"] = buildMemexEntry(projectPath);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  return true;
}

/**
 * Write .cursor/mcp.json and .vscode/mcp.json for the workspace.
 * Both are idempotent — only updated if the memex entry is missing or stale.
 * Returns the list of files that were actually written.
 */
export function setupMcpConfigs(workspaceRoot: string): string[] {
  const written: string[] = [];

  const targets = [
    path.join(workspaceRoot, ".cursor", "mcp.json"),
    path.join(workspaceRoot, ".vscode", "mcp.json"),
  ];

  for (const target of targets) {
    if (writeMcpFile(target, workspaceRoot)) {
      written.push(target);
    }
  }

  return written;
}

/**
 * Show a notification after writing MCP configs, with an option to view
 * the generated file.
 */
export async function notifyMcpSetup(written: string[]): Promise<void> {
  if (written.length === 0) return;

  const names = written.map((f) => path.relative(process.cwd(), f)).join(", ");
  const action = await vscode.window.showInformationMessage(
    `Memex: MCP config written (${names}). Cursor Agent and Copilot can now use Memex memory tools.`,
    "Open .cursor/mcp.json"
  );

  if (action === "Open .cursor/mcp.json") {
    const cursorConfig = written.find((f) => f.includes(".cursor"));
    if (cursorConfig) {
      const doc = await vscode.workspace.openTextDocument(cursorConfig);
      await vscode.window.showTextDocument(doc);
    }
  }
}
