import { limitedText } from "./network.ts";
export class ModelError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export interface ModelConfig {
  provider: "openrouter" | "groq";
  model: string;
  key: string;
}
export function modelConfigurations(): ModelConfig[] {
  const result: ModelConfig[] = [],
    key = Deno.env.get("OPENROUTER_API_KEY");
  const model =
    Deno.env.get("OPENROUTER_MODEL") ?? "google/gemma-4-31b-it:free";
  if (
    key &&
    (model === "openrouter/free" || /^[a-zA-Z0-9_./-]+:free$/.test(model))
  ) {
    result.push({ provider: "openrouter", model, key });
  }
  const groq = Deno.env.get("GROQ_API_KEY");
  if (groq && Deno.env.get("GROQ_FREE_TIER_CONFIRMED") === "true")
    result.push({ provider: "groq", model: "qwen/qwen3.8-27b", key: groq });
  if (key && result.length && model !== "openrouter/free")
    result.push({ provider: "openrouter", model: "openrouter/free", key });
  return result;
}
export async function generateFreeReport(
  messages: { role: string; content: string }[],
  reserve: () => Promise<boolean>,
  fetcher: typeof fetch = fetch,
): Promise<{ content: string; provider: string; model: string }> {
  const configs = modelConfigurations();
  if (!configs.length) throw new ModelError("ai_not_configured");
  let code = "provider_unavailable";
  // At most two attempts, independently reserved. Never fall back to a paid model.
  for (const c of configs.slice(0, 2)) {
    if (!(await reserve())) throw new ModelError("ai_budget_exhausted");
    try {
      const response = await fetcher(
        c.provider === "openrouter"
          ? "https://openrouter.ai/api/v1/chat/completions"
          : "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          signal: AbortSignal.timeout(35000),
          headers: {
            Authorization: `Bearer ${c.key}`,
            "Content-Type": "application/json",
            ...(c.provider === "openrouter"
              ? {
                  "HTTP-Referer": "https://alfammetal.ru",
                  "X-OpenRouter-Title": "ALFA ANALYTICS",
                }
              : {}),
          },
          body: JSON.stringify({
            model: c.model,
            messages,
            temperature: 0.15,
            max_tokens: 2200,
            response_format: { type: "json_object" },
            ...(c.provider === "openrouter"
              ? {
                  provider: {
                    max_price: { prompt: 0, completion: 0, request: 0 },
                    require_parameters: true,
                    data_collection: "deny",
                  },
                }
              : {}),
          }),
        },
      );
      if (!response.ok) {
        code =
          response.status === 429
            ? "provider_rate_limit"
            : response.status === 401 || response.status === 403
              ? "provider_access_denied"
              : "provider_unavailable";
        await response.body?.cancel();
        if (
          response.status === 429 &&
          c.provider === "openrouter" &&
          !configs.some((v) => v.provider === "groq")
        )
          break;
        continue;
      }
      const parsed = JSON.parse(await limitedText(response, 100000)),
        content = parsed?.choices?.[0]?.message?.content;
      if (
        typeof content !== "string" ||
        !content.trim() ||
        content.length > 18000
      )
        throw new ModelError("invalid_model_response");
      // The actual routed model is recorded, not assumed from a configuration label.
      const used = typeof parsed.model === "string" ? parsed.model : c.model;
      if (
        c.provider === "openrouter" &&
        typeof parsed?.usage?.cost === "number" &&
        parsed.usage.cost > 0
      )
        throw new ModelError("unexpected_provider_cost");
      return { content, provider: c.provider, model: used };
    } catch (e) {
      if (e instanceof ModelError) throw e;
      code = "provider_unavailable";
    }
  }
  throw new ModelError(code);
}
