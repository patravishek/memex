import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

/**
 * Start the Memex MCP server for a given project path.
 *
 * Transport: stdio — the agent (e.g. Claude Code) launches this as a subprocess
 * and communicates over stdin/stdout. All I/O stays on the local machine.
 */
export async function startMcpServer(projectPath: string): Promise<void> {
  const server = new Server(
    { name: "memex", version: "0.4.0" },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  registerTools(server, projectPath);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGTERM", async () => {
    await server.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}
