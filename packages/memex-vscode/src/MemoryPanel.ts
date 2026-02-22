import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface RecentSession {
  date: string;
  summary: string;
}

interface MemoryData {
  projectName?: string;
  currentFocus?: string;
  pendingTasks?: string[];
  gotchas?: string[];
  recentSessions?: RecentSession[];
  lastUpdated?: string;
  sessionCount?: number;
  error?: string;
}

export class MemoryPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = "memex.memoryPanel";

  private _view?: vscode.WebviewView;
  private _watcher?: vscode.FileSystemWatcher;
  private _workspaceRoot: string;
  private _refreshTimeout?: NodeJS.Timeout;

  constructor(workspaceRoot: string) {
    this._workspaceRoot = workspaceRoot;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    this._render();

    // Watch .memex/memex.db for changes and auto-refresh
    const dbPath = path.join(this._workspaceRoot, ".memex", "memex.db");
    this._watcher = vscode.workspace.createFileSystemWatcher(dbPath);
    this._watcher.onDidChange(() => this._debouncedRefresh());
    this._watcher.onDidCreate(() => this._debouncedRefresh());

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this._render();
    });

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === "refresh") this._render();
      if (msg.command === "init") {
        try {
          await this.runInit();
          vscode.window.showInformationMessage("Memex: Project initialized successfully!");
          this._render();
        } catch {
          vscode.window.showErrorMessage("Memex: Failed to initialize. Is the CLI installed? Run: npm i -g @patravishek/memex");
        }
      }
    });
  }

  public refresh(): void {
    this._render();
  }

  public dispose(): void {
    this._watcher?.dispose();
  }

  private _debouncedRefresh(): void {
    if (this._refreshTimeout) clearTimeout(this._refreshTimeout);
    this._refreshTimeout = setTimeout(() => this._render(), 800);
  }

  private async _render(): Promise<void> {
    if (!this._view) return;
    this._view.webview.html = this._loadingHtml();
    const data = await this._fetchMemory();
    this._view.webview.html = this._buildHtml(data);
  }

  private async _fetchMemory(): Promise<MemoryData> {
    try {
      const { stdout } = await execFileAsync(
        "memex",
        ["status", "--json", "--project", this._workspaceRoot],
        { timeout: 8000, cwd: this._workspaceRoot }
      );
      return JSON.parse(stdout) as MemoryData;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return { error: "not_installed" };
      }
      return { error: "no_memory" };
    }
  }

  public async runInit(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { spawn } = require("child_process") as typeof import("child_process");
      const child = spawn("memex", ["init", "--project", this._workspaceRoot], {
        stdio: "pipe",
        cwd: this._workspaceRoot,
      });
      child.on("close", (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(`memex init exited with code ${code}`));
      });
      child.on("error", reject);
    });
  }

  private _loadingHtml(): string {
    return `<!DOCTYPE html><html><body style="padding:16px;font-family:var(--vscode-font-family);color:var(--vscode-foreground)">
      <p style="opacity:0.5">Loading memory...</p>
    </body></html>`;
  }

  private _buildHtml(data: MemoryData): string {
    if (data.error === "not_installed") {
      return this._wrapHtml(`
        <div class="empty-state">
          <div class="empty-icon">⬡</div>
          <p class="empty-title">Memex CLI not found</p>
          <p class="empty-sub">Install it to get started:</p>
          <code>npm i -g @patravishek/memex</code>
        </div>
      `);
    }

    if (data.error === "no_memory") {
      return this._wrapHtml(`
        <div class="empty-state">
          <div class="empty-icon">⬡</div>
          <p class="empty-title">No memory yet</p>
          <p class="empty-sub">Initialize Memex for this project to get started.</p>
          <button class="init-btn" onclick="init()">Initialize Project</button>
          <p class="empty-hint">Or run in your terminal:<br><code>memex init</code></p>
        </div>
      `);
    }

    if (data.error) {
      return this._wrapHtml(`
        <div class="empty-state">
          <div class="empty-icon">⬡</div>
          <p>${escapeHtml(data.error)}</p>
        </div>
      `);
    }

    const focus = data.currentFocus
      ? `<section>
          <h2>Current Focus</h2>
          <div class="focus-badge">${escapeHtml(data.currentFocus)}</div>
        </section>`
      : "";

    const tasks = data.pendingTasks?.length
      ? `<section>
          <h2>Pending Tasks <span class="badge">${data.pendingTasks.length}</span></h2>
          <ul>${data.pendingTasks
            .slice(0, 5)
            .map((t) => `<li>${escapeHtml(t)}</li>`)
            .join("")}
          ${data.pendingTasks.length > 5 ? `<li class="more">+${data.pendingTasks.length - 5} more</li>` : ""}
          </ul>
        </section>`
      : "";

    const gotchas = data.gotchas?.length
      ? `<section>
          <h2>Gotchas <span class="badge gotcha">${data.gotchas.length}</span></h2>
          <ul class="gotchas">${data.gotchas
            .slice(0, 3)
            .map((g) => `<li>${escapeHtml(g)}</li>`)
            .join("")}
          ${data.gotchas.length > 3 ? `<li class="more">+${data.gotchas.length - 3} more</li>` : ""}
          </ul>
        </section>`
      : "";

    const lastSession = data.recentSessions?.at(-1);
    const session = lastSession
      ? `<section>
          <h2>Last Session</h2>
          <div class="session-date">${formatDate(lastSession.date)}</div>
          <p class="session-summary">${escapeHtml(lastSession.summary)}</p>
        </section>`
      : "";

    const footer = `<div class="footer">
      ${data.sessionCount !== undefined ? `<span>${data.sessionCount} session${data.sessionCount !== 1 ? "s" : ""} recorded</span>` : ""}
      ${data.lastUpdated ? `<span>Updated ${timeAgo(data.lastUpdated)}</span>` : ""}
    </div>`;

    return this._wrapHtml(`
      <div class="header">
        <span class="project-name">${escapeHtml(data.projectName ?? "Project")}</span>
        <button class="refresh-btn" onclick="refresh()" title="Refresh">↻</button>
      </div>
      ${focus}${tasks}${gotchas}${session}${footer}
    `);
  }

  private _wrapHtml(body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 12px;
    line-height: 1.5;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .project-name {
    font-weight: 600;
    font-size: 13px;
    color: var(--vscode-foreground);
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .refresh-btn {
    background: none;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    opacity: 0.5;
    font-size: 16px;
    padding: 2px 4px;
    border-radius: 3px;
  }
  .refresh-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
  section {
    margin-bottom: 16px;
  }
  h2 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .badge {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: normal;
  }
  .badge.gotcha {
    background: var(--vscode-inputValidation-warningBackground);
    color: var(--vscode-inputValidation-warningForeground, #fff);
  }
  .focus-badge {
    background: var(--vscode-textBlockQuote-background);
    border-left: 3px solid var(--vscode-textLink-foreground);
    padding: 7px 10px;
    border-radius: 0 4px 4px 0;
    font-size: 12px;
    color: var(--vscode-foreground);
  }
  ul {
    list-style: none;
    padding: 0;
  }
  ul li {
    padding: 4px 0 4px 14px;
    font-size: 12px;
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.1));
    position: relative;
  }
  ul li::before {
    content: "·";
    position: absolute;
    left: 3px;
    color: var(--vscode-textLink-foreground);
  }
  ul.gotchas li::before { content: "!"; color: var(--vscode-editorWarning-foreground); }
  li.more {
    opacity: 0.5;
    font-size: 11px;
    border-bottom: none;
  }
  li.more::before { content: ""; }
  .session-date {
    font-size: 11px;
    opacity: 0.55;
    margin-bottom: 4px;
  }
  .session-summary {
    font-size: 12px;
    opacity: 0.85;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    opacity: 0.4;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
  }
  .empty-state {
    text-align: center;
    padding: 24px 16px;
    font-size: 12px;
  }
  .empty-icon { font-size: 28px; margin-bottom: 8px; opacity: 0.3; }
  .empty-title { font-weight: 600; margin-bottom: 6px; opacity: 0.8; }
  .empty-sub { opacity: 0.55; margin-bottom: 12px; }
  .empty-hint { opacity: 0.45; margin-top: 12px; line-height: 1.6; }
  .init-btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
    padding: 6px 16px;
    font-size: 12px;
    cursor: pointer;
    font-family: var(--vscode-font-family);
  }
  .init-btn:hover { background: var(--vscode-button-hoverBackground); }
  code {
    background: var(--vscode-textCodeBlock-background);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
  }
</style>
</head>
<body>
${body}
<script>
  const vscode = acquireVsCodeApi();
  function refresh() { vscode.postMessage({ command: 'refresh' }); }
  function init() { vscode.postMessage({ command: 'init' }); }
</script>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
