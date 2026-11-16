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
  "paid OpenRouter configuration is disabled and confirmed owner Groq is primary",
  () =>
    env(
      {
        ...base,
        OPENROUTER_MODEL: "openai/gpt-paid",
        GROQ_API_KEY: "TEST_ONLY",
      },
      async () => {
        const configs = modelConfigurations();
        assert(
          configs.length === 1 &&
            configs[0].provider === "groq" &&
            configs[0].model === "openai/gpt-oss-120b",
        );
      },
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
  summary:
    "Доступные месячные оценки дают проверяемую основу для анализа, но полнота периода и сопоставимость с торговыми потоками требуют отдельной проверки.",
  selectedFactIds: ["F1"],
  interpretations: [
    {
      section: "dynamics",
      text: "Месячный ориентир описывает опубликованную среднюю оценку, а не цену сделки на текущий момент; динамика определяется только сопоставимыми наблюдениями.",
      factIds: ["F1"],
    },
    {
      section: "trade",
      text: "Один ценовой ряд не устанавливает объём импорта или экспорта; торговые стоимости следует анализировать отдельно по странам и товарным группам.",
      factIds: ["F1"],
    },
    {
      section: "factors",
      text: "Причины изменения цены не установлены отдельным наблюдением; подтверждённый вывод о влиянии событий требует датированных материалов и дополнительных рядов.",
      factIds: ["F1"],
    },
  ],
  risks: [
    "Неполное покрытие периода ограничивает достоверность сравнения ценовых окон.",
    "Отсутствие сопоставимых данных производства не позволяет устанавливать баланс предложения.",
  ],
  scenarios: [
    {
      direction: "growth",
      condition:
        "новая месячная оценка превысит наблюдаемый максимум выбранного окна",
      description:
        "появится проверяемый признак усиления ценового ряда, который следует сопоставить с дальнейшими публикациями",
      factIds: ["F3"],
    },
    {
      direction: "decline",
      condition:
        "новая месячная оценка окажется ниже наблюдаемого минимума выбранного окна",
      description:
        "возникнет основание исследовать ослабление ряда без автоматического вывода о доказанной причине снижения",
      factIds: ["F2"],
    },
    {
      direction: "stable",
      condition:
        "новые месячные оценки останутся внутри наблюдаемого диапазона вокруг среднего",
      description:
        "ряд не даст подтверждения выхода из наблюдаемого диапазона и потребуется сопоставление следующих закрытых месяцев",
      factIds: ["F4"],
    },
  ],
  limitations: [
    "Причинная связь между событиями и ценой не установлена; торговля и выпуск требуют самостоятельных рядов.",
  ],
  conclusion:
    "Имеющиеся наблюдения следует интерпретировать в пределах их периода и спецификации. Месячная оценка не подтверждает текущую спотовую цену, а недостаток торговой статистики не является доказательством отсутствия торговли.",
};

Deno.test(
  "authenticated Groq overrides legacy paid flags, reads evidence and rejects invented numbers",
  () =>
    env(
      {
        ...base,
        GROQ_API_KEY: "TEST_GROQ",
        AI_PROVIDER: "openai",
        ALLOW_PAID_AI: "true",
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
                retrieved_at: new Date(now.getTime() - 1000).toISOString(),
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
          if (url === "https://api.groq.com/openai/v1/chat/completions") {
            providerCalls++;
            return Response.json({
              model: "openai/gpt-oss-120b",
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
              body.report.model === "openai/gpt-oss-120b" &&
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
    const change = evidence.analytics.prices[0].currentMetrics;
    assert(
      change.n === 12 &&
        change.change === 11 &&
        evidence.analytics.prices[0].current[0].month === "2025-11-01",
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

Deno.test(
  "Groq is first with both keys and uses bounded reasoning JSON requests",
  () =>
    env({ ...base, GROQ_API_KEY: "TEST_GROQ" }, async () => {
      let requests = 0;
      const result = await generateFreeReport(
        [{ role: "user", content: "TEST" }],
        async () => true,
        async (url, init) => {
          requests++;
          assert(
            String(url) === "https://api.groq.com/openai/v1/chat/completions",
          );
          const body = JSON.parse(String(init?.body));
          assert(
            body.model === "openai/gpt-oss-120b" &&
              body.reasoning_effort === "low" &&
              body.response_format.type === "json_object" &&
              body.max_tokens === 3200,
          );
          return Response.json({
            model: body.model,
            choices: [{ message: { content: "{}" } }],
          });
        },
      );
      assert(requests === 1 && result.provider === "groq");
    }),
);
Deno.test(
  "Groq 429 stops without another provider, and quota denial never contacts Groq",
  () =>
    env(
      { ...base, OPENROUTER_API_KEY: undefined, GROQ_API_KEY: "TEST_GROQ" },
      async () => {
        let calls = 0;
        for (const allowed of [true, false]) {
          try {
            await generateFreeReport(
              [],
              async () => allowed,
              async () => {
                calls++;
                return new Response(null, { status: 429 });
              },
            );
          } catch {
            /* Expected. */
          }
        }
        assert(calls === 1);
      },
    ),
);

Deno.test(
  "guest chat caches privately, rejects quota exhaustion and validates supplied sessions",
  () =>
    env(
      {
        ...base,
        GROQ_API_KEY: "TEST_GROQ",
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "TEST_SERVER",
      },
      async () => {
        const old = globalThis.fetch;
        let calls = 0,
          allowed = true,
          saved: unknown = null,
          quotaCalls = 0;
        globalThis.fetch = async (input, init) => {
          const url = String(input),
            method = init?.method ?? "GET";
          if (url.includes("/auth/v1/user"))
            return Response.json({ message: "Invalid JWT" }, { status: 401 });
          if (url.endsWith("/rpc/consume_guest_ai_quota")) {
            quotaCalls++;
            const args = JSON.parse(String(init?.body));
            assert(
              /^[a-f0-9]{64}$/.test(args.p_visitor_hash) &&
                !String(init?.body).includes("192.0.2.1"),
            );
            return Response.json(allowed);
          }
          if (
            url.endsWith("/rpc/reserve_free_ai_call") ||
            url.endsWith("/rpc/reserve_ai_tokens")
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
                retrieved_at: new Date(now.getTime() - 1000).toISOString(),
              },
            ]);
          }
          if (url.includes("/rest/v1/guest_ai_cache")) {
            if (method === "POST") {
              saved = JSON.parse(String(init?.body)).report;
              return Response.json(null);
            }
            return Response.json(saved ? { report: saved } : null);
          }
          if (
            url.includes("/rest/v1/analytical_summaries") ||
            url.includes("/rest/v1/market_ai_reports")
          )
            throw new Error(
              "Guest conversation must not enter user/public reports",
            );
          if (url.includes("/rest/v1/")) return Response.json([]);
          if (url === "https://api.groq.com/openai/v1/chat/completions") {
            calls++;
            return Response.json({
              model: "openai/gpt-oss-120b",
              choices: [{ message: { content: JSON.stringify(draft) } }],
            });
          }
          throw new Error("Unexpected request");
        };
        const req = async (token?: string) => {
          const raw = JSON.stringify({
            question: "Проанализируй медь",
            metalIds: ["copper"],
            period: "3M",
          });
          const r = new Request("https://example.com/api", {
            method: "POST",
            headers: {
              "x-forwarded-for": "192.0.2.1",
              ...(token ? { Authorization: "Bearer " + token } : {}),
            },
            body: raw,
          });
          if (!token) {
            const { issueGuestChallenge } = await import("./guestAccess.ts");
            const { solveGuestProof } =
              await import("../../../shared/guestProof.ts");
            const c = await issueGuestChallenge(r, "TEST_SERVER", raw);
            r.headers.set("x-ai-challenge", c.token);
            r.headers.set("x-ai-proof", String(await solveGuestProof(c.token)));
          }
          return r;
        };
        try {
          const first = await analyse(await req());
          const body = await first.json();
          assert(
            first.status === 200 &&
              body.text.includes("111 USD/т") &&
              saved &&
              calls === 1,
          );
          const cached = await analyse(await req());
          assert(
            cached.status === 200 &&
              (await cached.json()).cached === true &&
              calls === 1,
          );
          allowed = false;
          const limited = await analyse(await req());
          assert(limited.status === 429 && calls === 1);
          await limited.body?.cancel();
          const invalid = await analyse(await req("INVALID"));
          assert(invalid.status === 401 && quotaCalls === 3 && calls === 1);
          await invalid.body?.cancel();
        } finally {
          globalThis.fetch = old;
        }
      },
    ),
);

Deno.test(
  "guest proof binds body and expiry but permits network changes; missing proof makes no upstream call",
  () =>
    env(
      {
        ...base,
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "TEST_SERVER",
      },
      async () => {
        const { issueGuestChallenge, verifyGuestChallenge } =
          await import("./guestAccess.ts");
        const { solveGuestProof } =
          await import("../../../shared/guestProof.ts");
        const raw = JSON.stringify({
            question: "Проанализируй медь",
            metalIds: ["copper"],
            period: "3M",
          }),
          now = Date.now();
        const r = new Request("https://example.com/api", {
          method: "POST",
          headers: { "x-forwarded-for": "192.0.2.1" },
          body: raw,
        });
        const challenge = await issueGuestChallenge(r, "TEST_SERVER", raw, now),
          counter = await solveGuestProof(challenge.token);
        r.headers.set("x-ai-challenge", challenge.token);
        r.headers.set("x-ai-proof", String(counter));
        assert(await verifyGuestChallenge(r, "TEST_SERVER", raw, now));
        assert(!(await verifyGuestChallenge(r, "TEST_SERVER", raw + " ", now)));
        assert(
          !(await verifyGuestChallenge(r, "TEST_SERVER", raw, now + 300001)),
        );
        r.headers.set("x-forwarded-for", "192.0.2.2");
        assert(await verifyGuestChallenge(r, "TEST_SERVER", raw, now));
        assert(await verifyGuestChallenge(r, "TEST_SERVER", raw, now - 10000));
        const old = globalThis.fetch;
        let network = 0;
        globalThis.fetch = async () => {
          network++;
          throw new Error("No upstream before a valid proof");
        };
        try {
          const rejected = await analyse(
            new Request("https://example.com/api", {
              method: "POST",
              body: raw,
            }),
          );
          assert(rejected.status === 403 && network === 0);
          await rejected.body?.cancel();
        } finally {
          globalThis.fetch = old;
        }
      },
    ),
);
Deno.test(
  "guest challenge rejects honeypot and foreign origins without model calls",
  () =>
    env({ ...base, SUPABASE_SERVICE_ROLE_KEY: "TEST_SERVER" }, async () => {
      const { handler } = await import("../ai-challenge/handler.ts");
      const bad = await handler(
        new Request("https://example.com/api", {
          method: "POST",
          body: JSON.stringify({
            question: "Проанализируй медь",
            website: "spam",
          }),
        }),
      );
      assert(bad.status === 403);
      await bad.body?.cancel();
      const foreign = await handler(
        new Request("https://example.com/api", {
          method: "POST",
          headers: { Origin: "https://attacker.example" },
          body: "{}",
        }),
      );
      assert(foreign.status === 403);
      await foreign.body?.cancel();
    }),
);
