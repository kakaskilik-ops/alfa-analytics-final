import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  parseProviderQuote,
  normalizeProviderQuote,
} from "../_shared/providers.ts";
// Server-to-server ingestion only. No browser CORS; a Vault collector token is required.
Deno.serve(async (req: Request) => {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL"),
      key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return reply({ error: "unavailable" }, 503);
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data: authorized, error: authError } = await db.rpc(
      "verify_collector_token",
      { p_token: req.headers.get("x-collector-token") ?? "" },
    );
    if (authError || authorized !== true)
      return reply({ error: "unauthorized" }, 401);
    // Bound the stream before parsing JSON rather than trusting Content-Length.
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: "empty_body" }, 400);
    const decoder = new TextDecoder();
    let raw = "",
      bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 262144) {
        await reader.cancel();
        return reply({ error: "payload_too_large" }, 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return reply({ error: "invalid_json" }, 400);
    }
    if (!Array.isArray(payload) || payload.length < 1 || payload.length > 100)
      return reply({ error: "batch_size_1_to_100" }, 400);
    let quotes;
    try {
      quotes = payload.map((q) => parseProviderQuote(q));
    } catch {
      return reply({ error: "invalid_quote_specification" }, 400);
    }
    const ids = [...new Set(quotes.map((q) => q.sourceId))];
    const { data: sources, error: sourceError } = await db
      .from("data_sources")
      .select("id,quality_score")
      .in("id", ids);
    if (sourceError || !sources || sources.length !== ids.length)
      return reply({ error: "unknown_source" }, 400);
    const rows = quotes.map((q) =>
      normalizeProviderQuote(
        q,
        Number(sources.find((s) => s.id === q.sourceId)!.quality_score),
      ),
    );
    const seen = new Set<string>();
    for (const r of rows) {
      const identity = JSON.stringify([
        r.metal_id,
        r.source_id,
        r.quoted_at,
        r.region,
        r.market_type,
        r.grade,
        r.product_form,
        r.composition,
        r.price_type,
        r.country,
        r.purity,
        r.element_content,
        r.delivery_terms,
      ]);
      if (seen.has(identity)) return reply({ error: "duplicate_quote" }, 400);
      seen.add(identity);
    }
    const { error } = await db.from("price_quotations").upsert(rows, {
      onConflict:
        "metal_id,source_id,quoted_at,region,market_type,grade,product_form,composition,price_type,country,purity,element_content,delivery_terms",
    });
    if (error) return reply({ error: "batch_rejected" }, 400);
    return reply({ accepted: rows.length });
  } catch {
    console.error("ingest_quotes_failed");
    return reply({ error: "ingestion_failed" }, 503);
  }
});
