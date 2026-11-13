import { handler as reference } from "../collect-reference-prices/handler.ts";
import { handler as fx } from "../collect-fx/handler.ts";
import { handler as quotes } from "../collect-quotes/handler.ts";
import { handler as analytics } from "../compute-orientations/handler.ts";
function assert(v: unknown): asserts v {
  if (!v) throw new Error("assertion_failed");
}
Deno.test(
  "automation rejects unsupported methods without contacting sources",
  async () => {
    for (const handler of [fx, quotes, analytics, reference])
      assert(
        (await handler(new Request("https://example.com", { method: "GET" })))
          .status === 405,
      );
  },
);
Deno.test("automation requires server configuration", async () => {
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  try {
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    assert(
      (await fx(new Request("https://example.com", { method: "POST" })))
        .status === 503,
    );
  } finally {
    if (url) Deno.env.set("SUPABASE_URL", url);
    if (key) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", key);
  }
});
Deno.test(
  "automation rejects invalid collector token before claim or paid fetch",
  async () => {
    const original = globalThis.fetch;
    let calls = 0;
    const url = Deno.env.get("SUPABASE_URL"),
      key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    try {
      Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "TEST");
      globalThis.fetch = async (input) => {
        calls++;
        assert(String(input).endsWith("/rpc/verify_collector_token"));
        return new Response("false", {
          headers: { "Content-Type": "application/json" },
        });
      };
      assert(
        (await quotes(new Request("https://example.com", { method: "POST" })))
          .status === 401,
      );
      assert(calls === 1);
    } finally {
      globalThis.fetch = original;
      if (url) Deno.env.set("SUPABASE_URL", url);
      else Deno.env.delete("SUPABASE_URL");
      if (key) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", key);
      else Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    }
  },
);
Deno.test("automation cooldown skips source requests", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  try {
    Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "TEST");
    globalThis.fetch = async (input) => {
      calls++;
      const path = String(input);
      assert(
        path.endsWith("/rpc/verify_collector_token") ||
          path.endsWith("/rpc/claim_automation_job"),
      );
      return new Response(
        path.endsWith("/rpc/verify_collector_token") ? "true" : "null",
        { headers: { "Content-Type": "application/json" } },
      );
    };
    assert(
      (await fx(new Request("https://example.com", { method: "POST" })))
        .status === 202,
    );
    assert(calls === 2);
  } finally {
    globalThis.fetch = original;
    if (url) Deno.env.set("SUPABASE_URL", url);
    else Deno.env.delete("SUPABASE_URL");
    if (key) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", key);
    else Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  }
});
async function configured(task: () => Promise<void>) {
  const original = globalThis.fetch,
    url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  try {
    Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "TEST");
    await task();
  } finally {
    globalThis.fetch = original;
    if (url) Deno.env.set("SUPABASE_URL", url);
    else Deno.env.delete("SUPABASE_URL");
    if (key) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", key);
    else Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  }
}
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
Deno.test(
  "FX job validates, stores provenance and observations, logs actual writes, releases lease",
  () =>
    configured(async () => {
      let rawStored = false,
        fxWritten = false,
        released = false,
        finished = false;
      globalThis.fetch = async (input, init) => {
        const url = String(input),
          body = init?.body ? JSON.parse(String(init.body)) : null;
        if (url.endsWith("/rpc/verify_collector_token")) return json(true);
        if (url.endsWith("/rpc/claim_automation_job"))
          return json("00000000-0000-0000-0000-000000000001");
        if (url.endsWith("/rpc/finish_automation_job")) {
          released = true;
          return json(null);
        }
        if (url.includes("/automation_runs")) {
          if (init?.method === "POST") return json({ id: "run" });
          finished = body.status === "success" && body.rows_written === 2;
          return json(null);
        }
        if (url.startsWith("https://api.frankfurter.dev/")) {
          const date = new Date().toISOString().slice(0, 10);
          return json([
            {
              base: "USD",
              quote: "EUR",
              rate: 2,
              date,
              providers: [{ key: "TEST", date, rate: 2 }],
            },
          ]);
        }
        if (url.includes("/ingestion_payloads")) {
          if (init?.method === "POST") {
            rawStored =
              body.source_id === "frankfurter-v2" &&
              body.content_sha256.length === 64;
            return json(null);
          }
          return json({ id: "payload" });
        }
        if (url.includes("/fx_observations")) {
          fxWritten =
            body.length === 2 &&
            body.every(
              (r: { payload_id: string }) => r.payload_id === "payload",
            );
          return json([{ id: "1" }, { id: "2" }]);
        }
        if (url.includes("/data_sources")) return json(null);
        throw new Error("Unexpected request " + url);
      };
      const response = await fx(
        new Request("https://example.com", { method: "POST", body: "{}" }),
      );
      assert(response.status === 200);
      assert(rawStored && fxWritten && released && finished);
    }),
);
Deno.test(
  "quotes job reports missing approved sources without fetching a vendor",
  () =>
    configured(async () => {
      let released = false;
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.endsWith("/rpc/verify_collector_token")) return json(true);
        if (url.endsWith("/rpc/claim_automation_job"))
          return json("00000000-0000-0000-0000-000000000001");
        if (url.endsWith("/rpc/finish_automation_job")) {
          released = true;
          return json(null);
        }
        if (url.endsWith("/rpc/get_quote_adapters")) return json([]);
        if (url.includes("/automation_runs"))
          return json(init?.method === "POST" ? { id: "run" } : null);
        throw new Error("Unexpected vendor request");
      };
      const response = await quotes(
        new Request("https://example.com", { method: "POST" }),
      );
      const result = await response.json();
      assert(
        result.status === "partial" &&
          result.code === "quote_sources_not_configured" &&
          result.rowsWritten === 0 &&
          released,
      );
    }),
);
Deno.test(
  "analytics persists verified calculation and daily observation without overwriting history",
  () =>
    configured(async () => {
      let calculated = false,
        history = false;
      const now = new Date().toISOString();
      globalThis.fetch = async (input, init) => {
        const url = String(input),
          body = init?.body ? JSON.parse(String(init.body)) : null;
        if (url.endsWith("/rpc/verify_collector_token")) return json(true);
        if (url.endsWith("/rpc/claim_automation_job"))
          return json("00000000-0000-0000-0000-000000000001");
        if (url.endsWith("/rpc/finish_automation_job")) return json(null);
        if (url.includes("/automation_runs"))
          return json(init?.method === "POST" ? { id: "run" } : null);
        if (url.includes("/price_quotations"))
          return json([
            {
              id: "quote1",
              metal_id: "tungsten",
              source_id: "test",
              normalized_price: 100,
              normalized_currency: "USD",
              normalized_unit: "kg",
              market_type: "spot",
              region: "Европа",
              country: null,
              purity: 99.9,
              element_content: null,
              delivery_terms: "FCA TEST",
              grade: "W",
              product_form: "Порошок",
              composition: null,
              price_type: "assessment",
              quality_score: 0.9,
              quoted_at: now,
              retrieved_at: now,
              source_url: "https://example.com/quote",
              attribution: "TEST",
              exchange_name: null,
              data_status: "live",
              validation_status: "valid",
              data_sources: { name: "TEST", independence_id: "test" },
            },
          ]);
        if (url.includes("/analytical_calculations")) {
          calculated =
            body.input_quote_ids[0] === "quote1" &&
            body.metal_id === "tungsten";
          return json(null);
        }
        if (url.includes("/price_history")) {
          history =
            body.close === 100 &&
            body.region_code === "Европа" &&
            String(
              init?.headers ? new Headers(init.headers).get("prefer") : "",
            ).includes("ignore-duplicates");
          return json(null);
        }
        throw new Error("Unexpected request " + url);
      };
      const response = await analytics(
        new Request("https://example.com", { method: "POST" }),
      );
      assert(response.status === 200);
      assert(calculated && history);
    }),
);
