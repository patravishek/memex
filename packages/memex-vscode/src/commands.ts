import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const OBSERVATION_TYPES = [
  { label: "$(checklist) Task", type: "task", description: "Something still to be done" },
  { label: "$(lightbulb) Decision", type: "decision", description: "An architectural or design choice" },
  { label: "$(warning) Gotcha", type: "gotcha", description: "A pitfall or thing to avoid" },
  { label: "$(note) Note", type: "note", description: "General information worth remembering" },
];

/**
 * Save the currently selected text (or prompted text) to Memex memory
 * via `memex serve` stdio MCP. Shows a quick-pick to classify the type first.
 */
export async function saveObservationCommand(workspaceRoot: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  let content = editor?.document.getText(editor.selection) ?? "";

  if (!content.trim()) {
    const input = await vscode.window.showInputBox({
      prompt: "What do you want to save to Memex?",
      placeHolder: "Describe the task, decision, gotcha, or note...",
    });
    if (!input?.trim()) return;
    content = input.trim();
  }

  const picked = await vscode.window.showQuickPick(OBSERVATION_TYPES, {
    placeHolder: "How should this be classified?",
    title: "Save to Memex",
  });
  if (!picked) return;

  const { type } = picked;

  // Build the MCP JSON-RPC call to save_observation via `memex serve`
  const mcpRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "save_observation",
      arguments: { type, content },
    },
  });

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Saving to Memex..." },
      async () => {
        await runMcpCall(workspaceRoot, mcpRequest);
      }
    );

    vscode.window.showInformationMessage(
      `Memex: ${capitalize(type)} saved — "${truncate(content, 60)}"`
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      `Memex: Failed to save observation — ${(err as Error).message}`
    );
  }
}

/**
 * Spawn `memex serve` with a MCP initialize + tool call sequence over stdio,
 * then kill the process. This is fire-and-forget for a single tool call.
 */
async function runMcpCall(workspaceRoot: string, toolCall: string): Promise<void> {
  // We need to send initialize first, then the tool call
  const initRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "memex-vscode", version: "0.5.0" },
    },
  });

  const input = initRequest + "\n" + toolCall + "\n";

  return new Promise((resolve, reject) => {
    const { spawn } = require("child_process") as typeof import("child_process");
    const child = spawn("memex", ["serve", "--project", workspaceRoot], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: workspaceRoot,
    });

    let stdout = "";
    let stderr = "";
    let resolved = false;

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      // Once we get a response to our tool call (id:1), we're done
      if (stdout.includes('"id":1') || stdout.includes('"id": 1')) {
        if (!resolved) {
          resolved = true;
          child.kill();
          resolve();
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (!resolved) reject(new Error(`Could not start memex: ${err.message}. Is it installed? Run: npm i -g @patravishek/memex`));
    });

    child.on("close", () => {
      if (!resolved) {
        if (stderr.includes("error") || stderr.includes("Error")) {
          reject(new Error(stderr.trim().split("\n")[0]));
        } else {
          resolve();
        }
      }
    });

    child.stdin.write(input);
    child.stdin.end();

    // Safety timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        resolve();
      }
    }, 8000);
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
