/**
 * Minimal OpenAI-compatible chat-completion client. Defaults to OpenRouter,
 * but the endpoint is fully swappable via .env (AI_BASE_URL) so any
 * OpenAI-compatible provider — Groq, Together, a local LLM server, etc. —
 * can be used instead. Credentials always come from .env, never hardcoded.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  maxCompletionTokens?: number;
  extraHeaders: Record<string, string>;
}

export interface ChatCompleteOptions {
  temperature?: number;
  jsonObject?: boolean;
  reasoningEffort?: ReasoningEffort;
  maxCompletionTokens?: number;
}

export class AiCompletionTruncatedError extends Error {
  constructor(model: string) {
    super(
      `Respons AI terpotong karena mencapai batas output atau context (model=${model}, finish_reason=length)`
    );
    this.name = "AiCompletionTruncatedError";
  }
}

function isGpt54Mini(model: string): boolean {
  const modelId = model.toLowerCase().split("/").pop() || "";
  return modelId === "gpt-5.4-mini" || modelId.startsWith("gpt-5.4-mini-");
}

function readReasoningEffort(value: string | undefined): ReasoningEffort | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  if (["none", "low", "medium", "high", "xhigh"].includes(normalized)) {
    return normalized as ReasoningEffort;
  }

  throw new Error(
    "AI_REASONING_EFFORT tidak valid. Gunakan: none, low, medium, high, atau xhigh"
  );
}

function readPositiveInteger(name: string, value: string | undefined): number | undefined {
  if (!value) return undefined;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} harus berupa bilangan bulat positif`);
  }
  return parsed;
}

export function loadAiConfigFromEnv(): AiConfig {
  const baseUrl = (process.env.AI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const apiKey = process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) {
    throw new Error("AI_API_KEY belum di-set di .env (kredensial endpoint AI)");
  }
  const defaultModel = baseUrl.includes("openrouter.ai")
    ? "openai/gpt-5.4-mini"
    : "gpt-5.4-mini";
  const model = process.env.AI_MODEL || process.env.OPENROUTER_MODEL || defaultModel;
  const reasoningEffort =
    readReasoningEffort(process.env.AI_REASONING_EFFORT) ||
    (isGpt54Mini(model) ? "none" : undefined);
  const maxCompletionTokens =
    readPositiveInteger("AI_MAX_COMPLETION_TOKENS", process.env.AI_MAX_COMPLETION_TOKENS) ||
    (isGpt54Mini(model) ? 16_384 : undefined);

  // OpenRouter-specific attribution headers; harmless to omit for other
  // providers, so only send them when explicitly configured.
  const extraHeaders: Record<string, string> = {};
  if (process.env.AI_SITE_URL) extraHeaders["HTTP-Referer"] = process.env.AI_SITE_URL;
  if (process.env.AI_SITE_NAME) extraHeaders["X-Title"] = process.env.AI_SITE_NAME;

  return {
    baseUrl,
    apiKey,
    model,
    reasoningEffort,
    maxCompletionTokens,
    extraHeaders,
  };
}

/**
 * Some OpenAI-compatible servers stream Server-Sent-Events by default when
 * `stream` isn't explicitly set to false, or ignore the flag altogether.
 * This reconstructs the full message content from an SSE body
 * ("data: {...}\n\ndata: {...}\n\ndata: [DONE]") by concatenating each
 * chunk's delta/message content.
 */
function tryParseSseBody(body: string): string | null {
  const lines = body.split("\n").filter((l) => l.startsWith("data:"));
  if (lines.length === 0) return null;

  let content = "";
  let sawAny = false;
  for (const line of lines) {
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const chunk = JSON.parse(payload);
      const piece: string | undefined =
        chunk?.choices?.[0]?.delta?.content ?? chunk?.choices?.[0]?.message?.content;
      if (typeof piece === "string") {
        content += piece;
        sawAny = true;
      }
    } catch {
      return null;
    }
  }

  return sawAny ? content : null;
}

export async function chatComplete(
  config: AiConfig,
  messages: ChatMessage[],
  opts?: ChatCompleteOptions
): Promise<string> {
  const reasoningEffort = opts?.reasoningEffort ?? config.reasoningEffort;
  const maxCompletionTokens = opts?.maxCompletionTokens ?? config.maxCompletionTokens;

  // GPT-5.4 Mini is a reasoning model. Omit sampling controls while reasoning
  // controls are active, and use effort `none` by default to minimize cost.
  const modelOptions = reasoningEffort
    ? { reasoning_effort: reasoningEffort }
    : { temperature: opts?.temperature ?? 0.3 };

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...config.extraHeaders,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
      ...modelOptions,
      ...(maxCompletionTokens ? { max_completion_tokens: maxCompletionTokens } : {}),
      ...(opts?.jsonObject ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  const bodyText = await res.text();

  if (!res.ok) {
    throw new Error(`AI endpoint ${res.status} ${res.statusText}: ${bodyText.slice(0, 500)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(bodyText);
  } catch {
    // Server ignored `stream: false` and sent SSE anyway — reconstruct it.
    const reconstructed = tryParseSseBody(bodyText);
    if (reconstructed) return reconstructed;
    throw new Error(
      `Endpoint AI mengembalikan body yang bukan JSON valid (kemungkinan server mengabaikan stream:false). Cuplikan: ${bodyText.slice(0, 400)}`
    );
  }

  const choice = (
    data as {
      choices?: {
        finish_reason?: string | null;
        message?: { content?: string | null; refusal?: string | null };
      }[];
    }
  )?.choices?.[0];
  const content = choice?.message?.content;
  if (choice?.finish_reason === "length") {
    throw new AiCompletionTruncatedError(config.model);
  }
  if (!content) {
    const detail = [
      `model=${config.model}`,
      choice?.finish_reason ? `finish_reason=${choice.finish_reason}` : null,
      choice?.message?.refusal ? `refusal=${choice.message.refusal}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Endpoint AI mengembalikan respons kosong${detail ? ` (${detail})` : ""}`
    );
  }
  return content;
}
