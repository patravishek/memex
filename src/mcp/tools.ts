import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { getDb } from "../storage/db.js";
import {
  getProject,
  listSessions,
  getSession,
  searchSessions,
  getTurns,
  saveObservation,
  getObservations,
  ObservationType,
} from "../storage/queries.js";
import { getMemexDir } from "../memory/store.js";
import { buildContext } from "../memory/context-builder.js";

// ─── Tool manifest ────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "get_context",
    description:
      "Get the project summary. Call this first when starting work. Pass 'focus' to get memory sorted by relevance to a specific topic.",
    inputSchema: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          description:
            "Optional topic to sort memory by relevance, e.g. \"auth bug\" or \"payment flow\".",
        },
        tier: {
          type: "number",
          enum: [1, 2, 3],
          description:
            "Verbosity: 1=one-liner, 2=key facts + top tasks/gotchas, 3=full context (default: 3)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_tasks",
    description:
      "Get all pending tasks for this project, including any saved mid-session via save_observation.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_decisions",
    description:
      "Get key architectural and design decisions made on this project, with reasoning.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_gotchas",
    description:
      "Get known pitfalls, mistakes, and things to avoid. Always check before touching sensitive areas.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_important_files",
    description: "Get the list of important files and what each one does.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_recent_conversation",
    description:
      "Get recent conversation turns from the last session. Useful for understanding exactly where things left off.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max turns to return (default: 10, max: 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "search_sessions",
    description:
      "Full-text search across all past session summaries. Use to find when a bug was fixed, decision was made, or feature was implemented.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (keywords or phrases)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_session",
    description:
      "Get full details of a specific past session by ID, including its summary and all conversation turns.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "Session ID (use search_sessions to find relevant IDs)",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "save_observation",
    description:
      "Save an important observation mid-session. Records tasks, decisions, gotchas, or notes permanently without waiting for end-of-session compression.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["note", "task", "decision", "gotcha"],
          description:
            "Type: note (general), task (todo item), decision (architectural choice), gotcha (pitfall to avoid)",
        },
        content: {
          type: "string",
          description: "The observation to save",
        },
      },
      required: ["type", "content"],
    },
  },
] as const;

// ─── Handler ──────────────────────────────────────────────────────────────────

export function registerTools(server: Server, projectPath: string): void {
  const db = () => getDb(getMemexDir(projectPath));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS as unknown as typeof TOOLS[number][],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
    const { name, arguments: args = {} } = req.params;
    const text = await dispatch(name, args as Record<string, unknown>, projectPath, db);
    return { content: [{ type: "text", text }] };
  });
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

async function dispatch(
  name: string,
  args: Record<string, unknown>,
  projectPath: string,
  db: () => ReturnType<typeof getDb>
): Promise<string> {
  switch (name) {
    case "get_context": {
      const memory = getProject(db(), projectPath);
      if (!memory) return "No memory found. Run `memex start` first.";

      const focus = args.focus ? String(args.focus) : undefined;
      const tier = args.tier ? (Number(args.tier) as 1 | 2 | 3) : 3;

      const ctx = buildContext(memory, { tier, focus });
      const header = [`Path: ${memory.projectPath}`];
      if (memory.lastUpdated)
        header.push(`Memory last updated: ${new Date(memory.lastUpdated).toLocaleString()}`);
      if (focus)
        header.push(`(sorted by relevance to: "${focus}")`);

      return [...header, "", ctx].join("\n");
    }

    case "get_tasks": {
      const memory = getProject(db(), projectPath);
      const obs = getObservations(db(), projectPath, "task");
      const tasks = [
        ...(memory?.pendingTasks ?? []),
        ...obs.map(
          (o) => `[saved ${new Date(o.created_at).toLocaleDateString()}] ${o.content}`
        ),
      ];
      if (tasks.length === 0) return "No pending tasks recorded.";
      return tasks.map((t) => `• ${t}`).join("\n");
    }

    case "get_decisions": {
      const memory = getProject(db(), projectPath);
      const obs = getObservations(db(), projectPath, "decision");
      const decisions = [
        ...(memory?.keyDecisions ?? []).map(
          (d) => `• ${d.decision}\n  Reason: ${d.reason}`
        ),
        ...obs.map(
          (o) => `• [saved ${new Date(o.created_at).toLocaleDateString()}] ${o.content}`
        ),
      ];
      if (decisions.length === 0) return "No key decisions recorded yet.";
      return decisions.join("\n\n");
    }

    case "get_gotchas": {
      const memory = getProject(db(), projectPath);
      const obs = getObservations(db(), projectPath, "gotcha");
      const gotchas = [
        ...(memory?.gotchas ?? []),
        ...obs.map(
          (o) => `[saved ${new Date(o.created_at).toLocaleDateString()}] ${o.content}`
        ),
      ];
      if (gotchas.length === 0) return "No gotchas recorded yet.";
      return gotchas.map((g) => `⚠ ${g}`).join("\n");
    }

    case "get_important_files": {
      const memory = getProject(db(), projectPath);
      const files = memory?.importantFiles ?? [];
      if (files.length === 0) return "No important files recorded yet.";
      return files.map((f) => `${f.filePath}\n  ${f.purpose}`).join("\n\n");
    }

    case "get_recent_conversation": {
      const limit = Math.min(Number(args.limit ?? 10), 50);
      const latest = listSessions(db(), projectPath, 1)[0];
      if (!latest) return "No previous session found.";

      const turns = getTurns(db(), latest.id).slice(-limit);
      if (turns.length === 0) return "No conversation turns recorded for the last session.";

      const formatted = turns
        .map((t) => {
          const label = t.role === "user" ? "Human" : "Assistant";
          const time = new Date(t.ts).toLocaleTimeString();
          return `[${time}] ${label}:\n${t.content}`;
        })
        .join("\n\n---\n\n");

      return `Last session (#${latest.id}, ${new Date(latest.started_at).toLocaleDateString()}):\n\n${formatted}`;
    }

    case "search_sessions": {
      const query = String(args.query ?? "");
      if (!query) return "query is required.";
      const results = searchSessions(db(), query, projectPath);
      if (results.length === 0) return `No sessions matched "${query}".`;
      const lines = results.map((r) => {
        const date = new Date(r.started_at).toLocaleDateString();
        return `Session #${r.id} (${date}, ${r.agent}):\n  ${r.snippet}`;
      });
      return `${results.length} result(s) for "${query}":\n\n${lines.join("\n\n")}`;
    }

    case "get_session": {
      const id = Number(args.id);
      if (!id) return "id is required.";
      const session = getSession(db(), id);
      if (!session) return `Session #${id} not found.`;

      const lines = [
        `Session #${session.id}`,
        `Date:  ${new Date(session.started_at).toLocaleString()}`,
        `Agent: ${session.agent}`,
      ];
      if (session.summary) lines.push(`\nSummary:\n${session.summary}`);
      if (session.turns.length > 0) {
        lines.push(`\nConversation (${session.turns.length} turns):`);
        for (const turn of session.turns) {
          const label = turn.role === "user" ? "Human" : "Assistant";
          lines.push(`\n${label}: ${turn.content}`);
        }
      }
      return lines.join("\n");
    }

    case "save_observation": {
      const type = String(args.type ?? "note") as ObservationType;
      const content = String(args.content ?? "").trim();
      if (!content) return "content is required.";
      const id = saveObservation(db(), projectPath, type, content, undefined, "agent");
      return `Saved ${type} #${id}: "${content.slice(0, 80)}${content.length > 80 ? "…" : ""}"`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
