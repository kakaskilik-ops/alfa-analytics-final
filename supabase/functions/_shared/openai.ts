export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export async function generateText(
  messages: AiMessage[],
  options: { key: string; model: string; maxTokens: number; json?: boolean },
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: {
      Authorization: `Bearer ${options.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      max_completion_tokens: options.maxTokens,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      response.status === 429 ? "provider_rate_limit" : "provider_unavailable",
    );
  }
  const value = await response.json();
  const text = value?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim() || text.length > 20000)
    throw new Error("invalid_model_response");
  return text;
}
export function parseTranslation(text: string): {
  title: string;
  summary: string;
} {
  const r = JSON.parse(text);
  if (
    !r ||
    typeof r.title !== "string" ||
    typeof r.summary !== "string" ||
    !/[а-яё]/iu.test(r.title + r.summary) ||
    r.title.length > 400 ||
    r.summary.length > 1200 ||
    !r.title.trim() ||
    !r.summary.trim()
  )
    throw new Error("invalid_translation");
  return r;
}
