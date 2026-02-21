import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Build the MCP server entry for Memex.
 *
 * Project-scoped (default): bakes in the project path so the server always
 * reads from the correct DB regardless of where Claude is launched from.
 *
 * Global (dynamic=true): omits --project so `memex serve` defaults to
 * process.cwd() at runtime. Claude Code launches MCP servers from the
 * project's working directory, so the correct DB is resolved automatically
 * no matter which project is open — no stale path problem.
 */
export function buildMemexEntry(
  projectPath: string,
  dynamic = false
): McpServerEntry {
  return {
    command: "memex",
    args: dynamic ? ["serve"] : ["serve", "--project", projectPath],
    env: {},
  };
}

/**
 * Write (or merge into) a .mcp.json file at the given directory.
 * If the file already exists, the memex entry is added/replaced while
 * all other server entries are preserved.
 */
export function writeMcpJson(
  dir: string,
  projectPath: string,
  dynamic = false
): string {
  const filePath = path.join(dir, ".mcp.json");

  let existing: McpConfig = { mcpServers: {} };
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, "utf-8")) as McpConfig;
      existing.mcpServers ??= {};
    } catch {
      // Malformed existing file — start fresh
    }
  }

  existing.mcpServers["memex"] = buildMemexEntry(projectPath, dynamic);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  return filePath;
}

/**
 * Remove the memex entry from a .mcp.json file.
 * If it was the only entry, deletes the file entirely.
 */
export function removeMcpJson(dir: string): void {
  const filePath = path.join(dir, ".mcp.json");
  if (!fs.existsSync(filePath)) return;

  try {
    const config = JSON.parse(fs.readFileSync(filePath, "utf-8")) as McpConfig;
    delete config.mcpServers?.["memex"];

    if (Object.keys(config.mcpServers ?? {}).length === 0) {
      fs.rmSync(filePath, { force: true });
    } else {
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    }
  } catch {
    fs.rmSync(filePath, { force: true });
  }
}

/**
 * Path to the global Claude MCP config file (~/.claude/mcp.json).
 * Writing here makes Memex available in every Claude session, regardless
 * of which project is open.
 */
export function globalMcpConfigPath(): string {
  return path.join(os.homedir(), ".claude", "mcp.json");
}

/**
 * Write the global MCP config (~/.claude/mcp.json) without a hardcoded
 * project path. `memex serve` will resolve the project from cwd at runtime,
 * so the correct memory DB is used regardless of which project is open.
 */
export function writeGlobalMcpJson(projectPath: string): string {
  const dir = path.join(os.homedir(), ".claude");
  fs.mkdirSync(dir, { recursive: true });
  return writeMcpJson(dir, projectPath, true /* dynamic */);
}
