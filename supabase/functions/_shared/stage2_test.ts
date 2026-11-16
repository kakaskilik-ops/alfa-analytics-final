import { handler as ai } from "../ai-analyze/handler.ts";
import { handler as collector } from "../collect-news/handler.ts";
import { parseProviderQuote } from "./providers.ts";
import {
  parseHistoricalObservation,
  CanonicalJsonProvider,
} from "./quoteAdapters.ts";
import { fetchFeed } from "./network.ts";
import { generateText, parseTranslation } from "./openai.ts";
function assert(v: unknown, message = "assertion_failed"): asserts v {
  if (!v) throw new Error(message);
}
const now = Date.now();
const fixture = {
  metalId: "tungsten",
  sourceId: "test",
  price: 100,
  currency: "USD",
  unit: "kg",
  region: "Азия",
  country: "Китай",
  purity: 99.9,
  elementContent: null,
  deliveryTerms: "FCA test",
  marketType: "spot",
  grade: "W",
  productForm: "Порошок",
  composition: null,
  priceType: "assessment",
  publishedAt: new Date(now - 1000).toISOString(),
  retrievedAt: new Date(now).toISOString(),
  sourceUrl: "https://example.com/quote",
};
Deno.test(
  "regional provider: Asia requires country and certified content",
  () => {
    assert(parseProviderQuote(fixture).region === "Азия");
    for (const patch of [
      { country: null },
      { purity: null },
      { deliveryTerms: "" },
      { metalId: "gold" },
      { region: "Глобальный" },
    ]) {
      let rejected = false;
      try {
        parseProviderQuote({ ...fixture, ...patch });
      } catch {
        rejected = true;
      }
      assert(rejected);
    }
  },
);
Deno.test("history keeps region, country and exact commercial key", () => {
  const r = parseHistoricalObservation({
    ...fixture,
    tradeDate: new Date(now - 86400000).toISOString().slice(0, 10),
    open: 10,
    high: 12,
    low: 9,
    close: 11,
  });
  assert(r.region_code === "Азия" && r.country === "Китай");
  assert(r.comparison_key.includes("FCA test"));
  let rejected = false;
  try {
    parseHistoricalObservation({
      ...fixture,
      tradeDate: "2026-02-30",
      open: 10,
      high: 1,
      low: 9,
      close: 11,
    });
  } catch {
    rejected = true;
  }
  assert(rejected);
});
Deno.test("canonical adapter validates source identity", () => {
  const adapter = new CanonicalJsonProvider(
    "test",
    "https://example.com/feed",
    ["example.com"],
  );
  assert(adapter.parse([fixture]).length === 1);
  let rejected = false;
  try {
    adapter.parse([{ ...fixture, sourceId: "wrong" }]);
  } catch {
    rejected = true;
  }
  assert(rejected);
});
Deno.test(
  "feed transport refuses redirect outside approved hosts",
  async () => {
    let calls = 0;
    let rejected = false;
    try {
      await fetchFeed(
        "https://example.com/feed",
        ["example.com"],
        {},
        async () => {
          calls++;
          return new Response(null, {
            status: 302,
            headers: { location: "https://127.0.0.1/private" },
          });
        },
      );
    } catch {
      rejected = true;
    }
    assert(rejected && calls === 1);
  },
);
Deno.test(
  "OpenAI transport uses mocked response only and validates translations",
  async () => {
    const text = await generateText(
      [{ role: "user", content: "TEST FIXTURE" }],
      { key: "not-a-real-key", model: "test-model", maxTokens: 100 },
      async (_url, init) => {
        assert(!String(init?.body).includes("api_key"));
        return Response.json({
          choices: [{ message: { content: "Тестовый ответ" } }],
        });
      },
    );
    assert(text === "Тестовый ответ");
    assert(
      parseTranslation('{"title":"Тест","summary":"Тестовое резюме"}').title ===
        "Тест",
    );
    let rejected = false;
    try {
      parseTranslation('{"title":"","summary":42}');
    } catch {
      rejected = true;
    }
    assert(rejected);
  },
);
async function withEnv(
  vars: Record<string, string | undefined>,
  run: () => Promise<void>,
) {
  const before = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    before.set(k, Deno.env.get(k));
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  try {
    await run();
  } finally {
    for (const [k, v] of before) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}
const base = {
  AI_PROVIDER: "openai",
  ALLOW_PAID_AI: "true",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "test-only",
  OPENAI_API_KEY: undefined,
  AI_DAILY_TOKEN_LIMIT: "100000",
  ALLOWED_ORIGIN: "https://example.com",
};
Deno.test(
  "server handlers return configuration unavailable without secrets",
  () =>
    withEnv(
      { SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
      async () => {
        for (const handler of [ai, collector]) {
          const r = await handler(
            new Request("https://example.com/api", { method: "POST" }),
          );
          assert(r.status === 503);
          await r.body?.cancel();
        }
      },
    ),
);
Deno.test(
  "AI endpoint authenticates, validates input and does not imitate answers without key",
  () =>
    withEnv(base, async () => {
      const previous = globalThis.fetch;
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.includes("/auth/v1/user"))
          return Response.json({ id: "00000000-0000-0000-0000-000000000001" });
        if (url.includes("/rpc/consume_ai_quota")) return Response.json(true);
        throw new Error("unexpected_network_call");
      };
      try {
        const missing = await ai(
          new Request("https://example.com/api", {
            method: "POST",
            headers: { Authorization: "Bearer test" },
            body: JSON.stringify({
              question: "Проанализируй вольфрам",
              period: "1M",
            }),
          }),
        );
        assert(missing.status === 503);
        assert((await missing.json()).error.includes("OPENAI_API_KEY"));
        const invalid = await ai(
          new Request("https://example.com/api", {
            method: "POST",
            headers: { Authorization: "Bearer test" },
            body: JSON.stringify({ question: "test", metalIds: ["gold"] }),
          }),
        );
        assert(invalid.status === 400);
        await invalid.body?.cancel();
      } finally {
        globalThis.fetch = previous;
      }
    }),
);
Deno.test(
  "AI endpoint assembles factual context and uses mocked model response",
  () =>
    withEnv({ ...base, OPENAI_API_KEY: "test-key-never-sent" }, async () => {
      const previous = globalThis.fetch;
      let modelCalls = 0;
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.includes("/auth/v1/user"))
          return Response.json({ id: "00000000-0000-0000-0000-000000000001" });
        if (url.includes("/rpc/")) return Response.json(true);
        if (url.includes("/rest/v1/metals"))
          return Response.json([
            {
              id: "tungsten",
              name_ru: "Вольфрам",
              symbol: "W",
              aliases: ["вольфрам"],
            },
          ]);
        if (url.includes("/rest/v1/price_quotations"))
          return Response.json([
            {
              metal_id: "tungsten",
              normalized_price: 100,
              source_id: "test",
              source_url: "https://example.com/test",
              quoted_at: new Date(now).toISOString(),
              region: "Азия",
              country: "Китай",
              purity: 99.9,
              element_content: null,
              delivery_terms: "FCA",
              grade: "W",
              product_form: "powder",
              price_type: "assessment",
              market_type: "spot",
              composition: null,
              data_sources: { independence_id: "test" },
            },
          ]);
        if (
          url.includes("/rest/v1/price_history") ||
          url.includes("/rest/v1/news_articles")
        )
          return Response.json([]);
        if (url === "https://api.openai.com/v1/chat/completions") {
          modelCalls++;
          const body = JSON.parse(String(init?.body));
          assert(
            body.messages.at(-1).content.includes("https://example.com/test"),
          );
          return Response.json({
            choices: [{ message: { content: "ТЕСТОВЫЙ ОТВЕТ МОДЕЛИ" } }],
          });
        }
        throw new Error(`unexpected_network_call:${url}`);
      };
      try {
        const response = await ai(
          new Request("https://example.com/api", {
            method: "POST",
            headers: { Authorization: "Bearer test" },
            body: JSON.stringify({
              question: "Проанализируй вольфрам",
              period: "1M",
            }),
          }),
        );
        assert(response.status === 200);
        const data = await response.json();
        assert(
          data.text.includes("ТЕСТОВЫЙ") &&
            data.text.includes("https://example.com/test"),
        );
        assert(modelCalls === 1);
      } finally {
        globalThis.fetch = previous;
      }
    }),
);
Deno.test(
  "AI endpoint refuses a depleted global budget without model request",
  () =>
    withEnv({ ...base, OPENAI_API_KEY: "test-key-never-sent" }, async () => {
      const previous = globalThis.fetch;
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.includes("/auth/v1/user"))
          return Response.json({ id: "00000000-0000-0000-0000-000000000001" });
        if (url.includes("consume_ai_quota")) return Response.json(true);
        if (url.includes("reserve_ai_tokens")) return Response.json(false);
        if (url.includes("/metals"))
          return Response.json([
            { id: "tungsten", name_ru: "Вольфрам", aliases: [] },
          ]);
        if (url.includes("/price_quotations"))
          return Response.json([
            {
              metal_id: "tungsten",
              source_id: "test",
              normalized_price: 10,
              quoted_at: new Date(now).toISOString(),
              region: "США",
            },
          ]);
        if (url.includes("/news_articles") || url.includes("/price_history"))
          return Response.json([]);
        throw new Error("unexpected_network_call");
      };
      try {
        const response = await ai(
          new Request("https://example.com/api", {
            method: "POST",
            headers: { Authorization: "Bearer test" },
            body: JSON.stringify({ question: "Обзор вольфрама" }),
          }),
        );
        assert(response.status === 429);
        await response.body?.cancel();
      } finally {
        globalThis.fetch = previous;
      }
    }),
);
Deno.test(
  "news collector imports allowed metadata and skips duplicates on repeated run",
  () =>
    withEnv({ ...base, NEWS_AI_TRANSLATION: "false" }, async () => {
      const previous = globalThis.fetch;
      let inserts = 0,
        exists = false;
      globalThis.fetch = async (input, init) => {
        const url = String(input),
          method = init?.method ?? "GET";
        if (
          url.includes("/rpc/verify_collector_token") ||
          url.includes("/rpc/claim_news_source")
        )
          return Response.json(true);
        if (url.includes("/rest/v1/news_sources") && method === "GET")
          return Response.json([
            {
              id: "test",
              name: "Test source",
              feed_url: "https://example.com/rss",
              allowed_hosts: ["example.com"],
              format: "rss",
              etag: null,
              last_modified: null,
            },
          ]);
        if (url.includes("/rest/v1/news_ingestion_runs") && method === "POST")
          return Response.json({ id: "00000000-0000-0000-0000-000000000002" });
        if (url === "https://example.com/rss")
          return new Response(
            `<rss><channel><item><title>Tungsten exports from China increase</title><description>Mining supply report</description><link>https://example.com/article?utm_source=test</link><pubDate>${new Date(now - 1000).toUTCString()}</pubDate></item></channel></rss>`,
          );
        if (url.includes("/rest/v1/news_articles") && method === "GET")
          return Response.json(
            exists
              ? [
                  {
                    id: "00000000-0000-0000-0000-000000000003",
                    translation_status: "pending",
                  },
                ]
              : [],
          );
        if (url.includes("/rest/v1/news_articles") && method === "POST") {
          const row = JSON.parse(String(init?.body));
          assert(row.canonical_url === "https://example.com/article");
          assert(row.metal_ids.includes("tungsten"));
          assert(row.title_ru === null);
          assert(row.translation_status === "pending");
          inserts++;
          exists = true;
          return Response.json({ id: "00000000-0000-0000-0000-000000000003" });
        }
        if (url.includes("/rest/v1/news_metal_links") || method === "PATCH")
          return new Response(null, { status: 204 });
        throw new Error("unexpected_network_call");
      };
      try {
        for (let i = 0; i < 2; i++) {
          const response = await collector(
            new Request("https://example.com/api", {
              method: "POST",
              headers: { "x-collector-token": "test-only" },
            }),
          );
          assert(response.status === 200);
          const body = await response.json();
          assert(body.accepted === (i === 0 ? 1 : 0));
        }
        assert(inserts === 1);
      } finally {
        globalThis.fetch = previous;
      }
    }),
);
Deno.test(
  "news collector rejects an HTTP 202 HTML challenge without importing an article",
  () =>
    withEnv({ ...base, NEWS_AI_TRANSLATION: "false" }, async () => {
      const previous = globalThis.fetch;
      let errorCode = "";
      globalThis.fetch = async (input, init) => {
        const url = String(input),
          method = init?.method ?? "GET";
        if (
          url.includes("/rpc/verify_collector_token") ||
          url.includes("/rpc/claim_news_source")
        )
          return Response.json(true);
        if (url.includes("/rest/v1/news_sources") && method === "GET")
          return Response.json([
            {
              id: "test",
              feed_url: "https://example.com/rss",
              allowed_hosts: ["example.com"],
              format: "rss",
            },
          ]);
        if (url.includes("/rest/v1/news_ingestion_runs") && method === "POST")
          return Response.json({ id: "test-run" });
        if (url === "https://example.com/rss")
          return new Response("<html>Challenge</html>", {
            status: 202,
            headers: { "Content-Type": "text/html" },
          });
        if (
          url.includes("/rest/v1/news_ingestion_runs") &&
          method === "PATCH"
        ) {
          errorCode = JSON.parse(String(init?.body)).error_code;
          return Response.json(null);
        }
        if (url.includes("/rest/v1/news_sources") && method === "PATCH")
          return Response.json(null);
        throw new Error("Unexpected request or article import");
      };
      try {
        const response = await collector(
          new Request("https://example.com/api", { method: "POST" }),
        );
        const result = await response.json();
        assert(
          response.status === 207 &&
            result.accepted === 0 &&
            result.failed === 1 &&
            errorCode === "source_feed_not_ready",
        );
      } finally {
        globalThis.fetch = previous;
      }
    }),
);
