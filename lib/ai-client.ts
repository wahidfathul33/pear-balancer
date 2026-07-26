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

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  extraHeaders: Record<string, string>;
}

export function loadAiConfigFromEnv(): AiConfig {
  const baseUrl = (process.env.AI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const apiKey = process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) {
    throw new Error("AI_API_KEY belum di-set di .env (kredensial endpoint AI)");
  }
  const model = process.env.AI_MODEL || process.env.OPENROUTER_MODEL || "openai/gpt-5.6-terra";

  // OpenRouter-specific attribution headers; harmless to omit for other
  // providers, so only send them when explicitly configured.
  const extraHeaders: Record<string, string> = {};
  if (process.env.AI_SITE_URL) extraHeaders["HTTP-Referer"] = process.env.AI_SITE_URL;
  if (process.env.AI_SITE_NAME) extraHeaders["X-Title"] = process.env.AI_SITE_NAME;

  return { baseUrl, apiKey, model, extraHeaders };
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

/**
 * True when an error thrown by `chatComplete` is a 4xx (the request itself
 * was rejected — e.g. an unsupported `response_format`). Only a 4xx is worth
 * retrying without the offending param; 5xx/timeout/network failures are not,
 * since retrying would just pay for a second slow generation for nothing.
 */
export function isBadRequestError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /AI endpoint 4\d\d\b/.test(msg);
}

export async function chatComplete(
  config: AiConfig,
  messages: ChatMessage[],
  opts?: { temperature?: number; jsonObject?: boolean }
): Promise<string> {
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
      temperature: opts?.temperature ?? 0.3,
      stream: false,
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

  const content: string | undefined = (data as { choices?: { message?: { content?: string } }[] })
    ?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Endpoint AI mengembalikan respons kosong");
  }
  return content;
}
