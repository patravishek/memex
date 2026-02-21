import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// .env is optional — environment variables set in ~/.zshrc or ~/.bashrc take
// precedence. The .env file (if present) only fills in what's missing.
const envPath = path.join(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}

export type AIProvider = "anthropic" | "openai" | "litellm";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

const DEFAULTS = {
  anthropic: "claude-3-haiku-20240307",
  openai: "gpt-4o-mini",
  // LiteLLM model names depend on what's configured in the enterprise proxy.
  // Override with LITELLM_MODEL in .env to match your deployment.
  litellm: "gpt-4o-mini",
};

function resolveProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER as AIProvider | undefined;

  if (provider === "litellm") return "litellm";
  if (provider === "openai") return "openai";
  if (provider === "anthropic") return "anthropic";

  // Auto-detect from available keys
  if (process.env.LITELLM_API_KEY && process.env.LITELLM_BASE_URL) return "litellm";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";

  return "anthropic";
}

function buildLiteLLMClient(): OpenAI {
  const apiKey = process.env.LITELLM_API_KEY;
  const baseURL = process.env.LITELLM_BASE_URL;

  if (!apiKey) throw new Error("LITELLM_API_KEY is not set.");
  if (!baseURL) throw new Error("LITELLM_BASE_URL is not set.");

  // LiteLLM exposes an OpenAI-compatible API — we reuse the OpenAI SDK
  // and just point it at the enterprise proxy.
  return new OpenAI({
    apiKey,
    baseURL: baseURL.replace(/\/$/, "") + "/v1",
    defaultHeaders: {
      // Some LiteLLM deployments require this to identify the caller
      ...(process.env.LITELLM_TEAM_ID
        ? { "x-litellm-team": process.env.LITELLM_TEAM_ID }
        : {}),
    },
  });
}

export async function chat(
  messages: AIMessage[],
  systemPrompt: string
): Promise<string> {
  const provider = resolveProvider();

  // ── Anthropic direct ────────────────────────────────────────────────────────
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.ANTHROPIC_MODEL ?? DEFAULTS.anthropic;

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    return response.content[0].type === "text" ? response.content[0].text : "";
  }

  // ── LiteLLM proxy ───────────────────────────────────────────────────────────
  if (provider === "litellm") {
    const client = buildLiteLLMClient();
    const model = process.env.LITELLM_MODEL ?? DEFAULTS.litellm;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    return response.choices[0]?.message?.content ?? "";
  }

  // ── OpenAI direct ───────────────────────────────────────────────────────────
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? DEFAULTS.openai;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}
