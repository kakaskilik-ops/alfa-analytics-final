import { generateFreeReport, modelConfigurations } from "./freeModels.ts";
import { handler as analyse } from "../ai-analyze/handler.ts";
import { handler as status } from "../ai-status/handler.ts";
function assert(v: unknown): asserts v {
  if (!v) throw new Error("assertion_failed");
}
async function env(
  values: Record<string, string | undefined>,
  task: () => Promise<void>,
) {
  const old = Object.keys(values).map((k) => [k, Deno.env.get(k)] as const);
  try {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
    await task();
  } finally {
    for (const [k, v] of old) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}
const base = {
  AI_PROVIDER: undefined,
  ALLOW_PAID_AI: undefined,
  OPENROUTER_API_KEY: "TEST_ONLY",
  OPENROUTER_MODEL: undefined,
  GROQ_API_KEY: undefined,
  GROQ_FREE_TIER_CONFIRMED: undefined,
};
Deno.test(
  "free provider requests enforce zero price and never call OpenAI",
  () =>
    env(base, async () => {
      let requests = 0;
      const result = await generateFreeReport(
        [{ role: "user", content: "TEST" }],
        async () => true,
        async (url, init) => {
          requests++;
          assert(
            String(url) === "https://openrouter.ai/api/v1/chat/completions",
          );
          const body = JSON.parse(String(init?.body));
          assert(
            body.model.endsWith(":free") &&
              body.provider.max_price.prompt === 0 &&
              body.provider.max_price.completion === 0 &&
              body.provider.max_price.request === 0,
          );
          assert(body.provider.data_collection === "deny");
          return Response.json({
            model: "TEST:free",
            choices: [{ message: { content: "{}" } }],
            usage: { cost: 0 },
          });
        },
      );
      assert(requests === 1 && result.provider === "openrouter");
    }),
);
Deno.test("free provider makes no request without a reserved quota", () =>
  env(base, async () => {
    let calls = 0;
    let rejected = false;
    try {
      await generateFreeReport(
        [],
        async () => false,
        async () => {
          calls++;
          return Response.json({});
        },
      );
    } catch {
      rejected = true;
    }
    assert(rejected && calls === 0);
  }),
);
Deno.test(
  "a paid model configuration and unconfirmed Groq account are disabled",
  () =>
    env(
      {
        ...base,
        OPENROUTER_MODEL: "openai/gpt-paid",
        GROQ_API_KEY: "TEST_ONLY",
      },
      async () => assert(modelConfigurations().length === 0),
    ),
);
Deno.test(
  "429 does not retry a second model under the same exhausted account",
  () =>
    env(base, async () => {
      let requests = 0;
      try {
        await generateFreeReport(
          [],
          async () => true,
          async () => {
            requests++;
            return new Response(null, { status: 429 });
          },
        );
      } catch {
        /* Expected rate limit. */
      }
      assert(requests === 1);
    }),
);
Deno.test(
  "status exposes configuration metadata without exposing keys or claiming verification",
  () =>
    env(
      {
        ...base,
        OPENROUTER_API_KEY: undefined,
        SUPABASE_URL: undefined,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
      },
      async () => {
        const r = await status(new Request("https://example.com"));
        const body = await r.json();
        assert(
          body.configured === false &&
            body.verifiedAt === null &&
            !JSON.stringify(body).includes("TEST_ONLY"),
        );
      },
    ),
);
const draft = {
  summary: "Есть подтверждённый месячный ориентир.",
  selectedFactIds: ["F1"],
  interpretations: [
    { text: "Отдельный ориентир не описывает весь рынок.", factIds: ["F1"] },
  ],
  risks: ["Нет текущих региональных котировок."],
  scenarios: [
    {
      direction: "growth",
      condition: "спрос усилится",
      description: "возможен рост",
    },
    {
      direction: "decline",
      condition: "спрос ослабнет",
      description: "возможно снижение",
    },
    {
      direction: "stable",
      condition: "баланс сохранится",
      description: "возможна стабилизация",
    },
  ],
  limitations: ["Данные ограничены опубликованными рядами."],
  conclusion: "Требуется наблюдение за новыми подтверждёнными данными.",
};
Deno.test(
  "authenticated free analysis reads real-shaped evidence and rejects invented numeric output",
  () =>
    env(
      {
        ...base,
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "TEST_SERVER",
        ALLOWED_ORIGIN: "https://example.com",
      },
      async () => {
        const old = globalThis.fetch;
        let providerCalls = 0,
          stored = 0,
          malformed = false;
        globalThis.fetch = async (input, init) => {
          const url = String(input),
            method = init?.method ?? "GET";
          if (url.includes("/auth/v1/user"))
            return Response.json({
              id: "00000000-0000-0000-0000-000000000001",
            });
          if (
            url.endsWith("/rpc/consume_ai_quota") ||
            url.endsWith("/rpc/reserve_ai_tokens") ||
            url.endsWith("/rpc/reserve_free_ai_call")
          )
            return Response.json(true);
          if (url.endsWith("/rpc/claim_ai_work"))
            return Response.json("00000000-0000-0000-0000-000000000002");
          if (url.endsWith("/rpc/release_ai_work")) return Response.json(null);
          if (url.includes("/rest/v1/metals"))
            return Response.json([
              { id: "copper", name_ru: "Медь", symbol: "Cu", aliases: [] },
            ]);
          if (url.includes("/rest/v1/reference_price_observations")) {
            const now = new Date(),
              date = new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
              )
                .toISOString()
                .slice(0, 10);
            return Response.json([
              {
                metal_id: "copper",
                period_start: date,
                price: 111,
                currency: "USD",
                unit: "ton",
                region: "Мировой ориентир (LME)",
                specification: "TEST",
                retrieved_at: now.toISOString(),
              },
            ]);
          }
          if (url.includes("/rest/v1/analytical_summaries")) {
            if (method === "POST") stored++;
            return Response.json(null);
          }
          if (url.includes("/rest/v1/ai_provider_health"))
            return Response.json(null);
          if (url.includes("/rest/v1/")) return Response.json([]);
          if (url === "https://openrouter.ai/api/v1/chat/completions") {
            providerCalls++;
            return Response.json({
              model: "TEST:free",
              usage: { cost: 0 },
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      ...draft,
                      ...(malformed
                        ? { summary: "Цена составит 999 долларов." }
                        : {}),
                    }),
                  },
                },
              ],
            });
          }
          throw new Error("Unexpected network request");
        };
        try {
          const request = () =>
            new Request("https://example.com/api", {
              method: "POST",
              headers: { Authorization: "Bearer TEST_USER" },
              body: JSON.stringify({
                question: "Проанализируй медь",
                metalIds: ["copper"],
                period: "3M",
              }),
            });
          const ok = await analyse(request()),
            body = await ok.json();
          assert(
            ok.status === 200 &&
              body.text.includes("111 USD/т") &&
              body.report.model === "TEST:free" &&
              stored === 1,
          );
          malformed = true;
          const invalid = await analyse(request());
          assert(invalid.status === 503 && stored === 1 && providerCalls === 2);
          const error = await invalid.json();
          assert(
            error.code === "unverified_model_response" &&
              !JSON.stringify(error).includes("999"),
          );
        } finally {
          globalThis.fetch = old;
        }
      },
    ),
);

Deno.test(
  "evidence uses full available period endpoints and cache ignores retrieval-only changes",
  async () => {
    const { createClient } = await import("npm:@supabase/supabase-js@2.57.4");
    const { buildMarketEvidence, evidenceFingerprint } =
      await import("./marketEvidence.ts");
    const { parseAiInput } = await import("./analysis.ts");
    const db = createClient("https://test.supabase.co", "TEST_ONLY", {
      global: {
        fetch: async (input) => {
          const url = String(input);
          if (url.includes("/rest/v1/metals"))
            return Response.json([
              { id: "copper", name_ru: "Медь", symbol: "Cu", aliases: [] },
            ]);
          if (url.includes("/rest/v1/reference_price_observations"))
            return Response.json(
              Array.from({ length: 12 }, (_, i) => ({
                metal_id: "copper",
                period_start: new Date(Date.UTC(2026, 9 - i, 1))
                  .toISOString()
                  .slice(0, 10),
                price: 120 - i,
                currency: "USD",
                unit: "ton",
                region: "Мировой ориентир (LME)",
                specification: "TEST",
                retrieved_at: "2026-11-13T00:00:00Z",
              })),
            );
          return Response.json([]);
        },
      },
      auth: { persistSession: false },
    });
    const evidence = await buildMarketEvidence(
      db,
      parseAiInput({
        question: "Медь за год",
        metalIds: ["copper"],
        period: "1Y",
      }),
      Date.parse("2026-11-13T12:00:00Z"),
    );
    const change = evidence.facts.find((f) => f.unit === "%");
    assert(
      change?.periodStart === "2025-12-01" && change.periodEnd === "2026-10-01",
    );
    const a = await evidenceFingerprint(evidence.facts),
      b = await evidenceFingerprint(
        evidence.facts.map((f) => ({
          ...f,
          receivedAt: "2026-11-14T00:00:00Z",
        })),
      );
    assert(a === b);
  },
);
