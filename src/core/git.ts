import { execSync } from "child_process";

export interface GitContext {
  branch: string;
  recentCommits: string[];
  changedFiles: string[];
}

/**
 * Extract git context from the current project directory.
 * Returns null if the directory is not a git repo or git is unavailable.
 */
export function getGitContext(cwd: string): GitContext | null {
  try {
    execSync("git rev-parse --git-dir", { cwd, stdio: "ignore" });

    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    const logOut = execSync("git log --oneline -5", {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const recentCommits = logOut ? logOut.split("\n").filter(Boolean) : [];

    const diffOut = execSync("git diff --name-only HEAD", {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const changedFiles = diffOut ? diffOut.split("\n").filter(Boolean) : [];

    return { branch, recentCommits, changedFiles };
  } catch {
    return null;
  }
}

/**
 * Format git context as a human-readable block for inclusion in AI prompts.
 */
export function formatGitContext(ctx: GitContext): string {
  const lines: string[] = [`Git branch: ${ctx.branch}`];

  if (ctx.recentCommits.length > 0) {
    lines.push("", "Recent commits:");
    lines.push(...ctx.recentCommits.map((c) => `  ${c}`));
  }

  if (ctx.changedFiles.length > 0) {
    lines.push("", `Files changed since HEAD (${ctx.changedFiles.length}):`);
    lines.push(...ctx.changedFiles.slice(0, 20).map((f) => `  ${f}`));
    if (ctx.changedFiles.length > 20) {
      lines.push(`  … and ${ctx.changedFiles.length - 20} more`);
    }
  }

  return lines.join("\n");
}
