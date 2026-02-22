import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { MemoryPanel } from "./MemoryPanel";
import { setupMcpConfigs, notifyMcpSetup } from "./mcpSetup";
import { saveObservationCommand } from "./commands";

let memoryPanel: MemoryPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return;

  // Only activate fully if .memex/memex.db exists
  const dbPath = path.join(workspaceRoot, ".memex", "memex.db");
  if (!fs.existsSync(dbPath)) {
    // Still register commands so they're available, but show helpful message
    context.subscriptions.push(
      vscode.commands.registerCommand("memex.saveObservation", () => {
        vscode.window.showWarningMessage(
          "Memex: No memory found for this project. Run `memex start` in your terminal first."
        );
      }),
      vscode.commands.registerCommand("memex.setupMcp", () => {
        vscode.window.showWarningMessage(
          "Memex: No memory found for this project. Run `memex start` in your terminal first."
        );
      }),
      vscode.commands.registerCommand("memex.refresh", () => {})
    );
    return;
  }

  // Register the sidebar memory panel
  memoryPanel = new MemoryPanel(workspaceRoot);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MemoryPanel.viewType,
      memoryPanel,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("memex.saveObservation", () =>
      saveObservationCommand(workspaceRoot)
    ),

    vscode.commands.registerCommand("memex.setupMcp", async () => {
      const written = setupMcpConfigs(workspaceRoot);
      if (written.length === 0) {
        vscode.window.showInformationMessage("Memex: MCP configs are already up to date.");
      } else {
        await notifyMcpSetup(written);
      }
    }),

    vscode.commands.registerCommand("memex.refresh", () => {
      memoryPanel?.refresh();
    })
  );

  // Auto-setup MCP configs on activation (silent — no notification unless files changed)
  const written = setupMcpConfigs(workspaceRoot);
  if (written.length > 0) {
    // New files written — notify the user
    notifyMcpSetup(written).catch(() => {});
  }

  // Watch for .memex/memex.db creation if it doesn't exist yet
  // (covers the case where user runs `memex start` after opening VS Code)
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceRoot, ".memex/memex.db")
  );
  watcher.onDidCreate(() => {
    // Reload the window to re-activate with full functionality
    vscode.window
      .showInformationMessage(
        "Memex memory detected! Reload window to activate the Memex panel.",
        "Reload"
      )
      .then((action) => {
        if (action === "Reload") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
  });
  context.subscriptions.push(watcher);
}

export function deactivate(): void {
  memoryPanel?.dispose();
}

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  return folders[0].uri.fsPath;
}
