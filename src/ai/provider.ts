import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import * as dotenv from "dotenv";

dotenv.config();

export type AIProvider = "anthropic" | "openai";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

const DEFAULTS = {
  anthropic: "claude-3-haiku-20240307",
  openai: "gpt-4o-mini",
};

function resolveProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER as AIProvider | undefined;
  if (provider === "openai") return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "anthropic";
}

export async function chat(
  messages: AIMessage[],
  systemPrompt: string
): Promise<string> {
  const provider = resolveProvider();

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
