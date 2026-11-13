import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { limitedText } from "../_shared/network.ts";
import { parseHistoricalObservation } from "../_shared/quoteAdapters.ts";
export async function handler(req: Request) {
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
    if (!url || !key) return reply({ error: "not_configured" }, 503);
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data: allowed, error: authError } = await db.rpc(
      "verify_collector_token",
      { p_token: req.headers.get("x-collector-token") ?? "" },
    );
    if (authError || allowed !== true)
      return reply({ error: "unauthorized" }, 401);
    let rows;
    try {
      const body = JSON.parse(
        await limitedText(new Response(req.body), 262144),
      );
      if (!Array.isArray(body) || body.length < 1 || body.length > 100)
        throw new Error("invalid_batch");
      rows = body.map(parseHistoricalObservation);
    } catch {
      return reply({ error: "invalid_history_batch" }, 400);
    }
    const { error } = await db.from("price_history").upsert(rows, {
      onConflict: "metal_id,source_id,trade_date,comparison_key",
    });
    if (error) return reply({ error: "history_rejected" }, 400);
    return reply({ accepted: rows.length });
  } catch {
    return reply({ error: "history_unavailable" }, 503);
  }
}
