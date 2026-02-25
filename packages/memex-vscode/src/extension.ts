import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { execFile } from "child_process";
import { MemoryPanel } from "./MemoryPanel";
import { setupMcpConfigs, notifyMcpSetup } from "./mcpSetup";
import { saveObservationCommand } from "./commands";

let memoryPanel: MemoryPanel | undefined;
let snapshotTimer: ReturnType<typeof setInterval> | undefined;

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
      vscode.commands.registerCommand("memex.refresh", () => {}),
      vscode.commands.registerCommand("memex.snapshot", () => {
        vscode.window.showWarningMessage(
          "Memex: No memory found for this project. Run `memex start` in your terminal first."
        );
      })
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
    }),

    vscode.commands.registerCommand("memex.snapshot", () => {
      runSnapshot(workspaceRoot);
    })
  );

  // Auto-setup MCP configs on activation (silent — no notification unless files changed)
  const written = setupMcpConfigs(workspaceRoot);
  if (written.length > 0) {
    notifyMcpSetup(written).catch(() => {});
  }

  // After the 3rd time the extension activates with a live DB, ask for a review.
  maybeShowFeedbackPrompt(context);

  // Auto-snapshot: fire `memex snapshot` every N minutes while VS Code is open
  startSnapshotTimer(workspaceRoot);

  // Re-read snapshot interval when settings change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("memex.snapshotIntervalMinutes")) {
        startSnapshotTimer(workspaceRoot);
      }
    })
  );

  // Watch for .memex/memex.db creation if it doesn't exist yet
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceRoot, ".memex/memex.db")
  );
  watcher.onDidCreate(() => {
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
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = undefined;
  }
}

// ─── Auto-snapshot timer ──────────────────────────────────────────────────────

function startSnapshotTimer(workspaceRoot: string): void {
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = undefined;
  }

  const intervalMins = vscode.workspace
    .getConfiguration("memex")
    .get<number>("snapshotIntervalMinutes", 10);

  if (!intervalMins || intervalMins <= 0) return;

  const intervalMs = intervalMins * 60 * 1000;
  snapshotTimer = setInterval(() => {
    runSnapshot(workspaceRoot);
  }, intervalMs);
}

/**
 * Call `memex snapshot --project <root>` silently.
 * Only has an effect if there is an active session in progress.
 * Refreshes the memory panel when done.
 */
function runSnapshot(workspaceRoot: string): void {
  execFile(
    "memex",
    ["snapshot", "--project", workspaceRoot],
    { timeout: 60000, cwd: workspaceRoot },
    (err) => {
      if (!err) {
        memoryPanel?.refresh();
      }
    }
  );
}

/**
 * Show a one-time feedback prompt after the extension has been used 3 times.
 * Tracks activation count in globalState so it only ever shows once.
 */
function maybeShowFeedbackPrompt(context: vscode.ExtensionContext): void {
  const PROMPTED_KEY = "memex.feedbackPromptShown";
  const COUNT_KEY = "memex.activationCount";

  if (context.globalState.get<boolean>(PROMPTED_KEY)) return;

  const count = (context.globalState.get<number>(COUNT_KEY) ?? 0) + 1;
  context.globalState.update(COUNT_KEY, count);

  if (count < 3) return;

  // Mark as shown before displaying — prevents showing twice if VS Code
  // restarts before the user interacts with the notification
  context.globalState.update(PROMPTED_KEY, true);

  vscode.window
    .showInformationMessage(
      "Enjoying Memex? A ⭐ or review helps others discover it!",
      "⭐ Star on GitHub",
      "Write a Review",
      "Maybe Later"
    )
    .then((action) => {
      if (action === "⭐ Star on GitHub") {
        vscode.env.openExternal(
          vscode.Uri.parse("https://github.com/patravishek/memex")
        );
      } else if (action === "Write a Review") {
        vscode.env.openExternal(
          vscode.Uri.parse(
            "https://marketplace.visualstudio.com/items?itemName=patravishek.memex-vscode&ssr=false#review-details"
          )
        );
      } else if (action === "Maybe Later") {
        // Reset the flag so we try again after 3 more activations
        context.globalState.update(PROMPTED_KEY, false);
        context.globalState.update(COUNT_KEY, 0);
      }
    });
}

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  return folders[0].uri.fsPath;
}
