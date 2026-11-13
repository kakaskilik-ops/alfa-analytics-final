import { scheduledJob, JobError, storePayload } from "../_shared/jobs.ts";
import { fetchFeed, limitedText } from "../_shared/network.ts";
import {
  comtradeUrl,
  parseComtrade,
  COMTRADE_SOURCE,
} from "../../../shared/trade.ts";
export async function handler(req: Request) {
  return scheduledJob(req, "collect-trade", async (db) => {
    let limit = 3;
    if (req.body) {
      try {
        const body = JSON.parse(
          await limitedText(new Response(req.body), 1024),
        );
        if (body.limit !== undefined) {
          if (
            !Number.isInteger(body.limit) ||
            body.limit < 1 ||
            body.limit > 12
          )
            throw new Error("invalid_limit");
          limit = body.limit;
        }
      } catch {
        throw new JobError("invalid_trade_batch");
      }
    }
    const { count, error: countError } = await db
      .from("market_statistics")
      .select("id", { count: "exact", head: true })
      .eq("source_id", COMTRADE_SOURCE);
    if (countError) throw new JobError("trade_registry_unavailable");
    if ((count ?? 0) >= 5000)
      return { rows: 0, status: "partial", code: "trade_distribution_cap" };
    const { data: targets, error } = await db
      .from("statistic_collection_state")
      .select("metal_id,last_attempt_at")
      .order("last_attempt_at", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (error) throw new JobError("trade_registry_unavailable");
    const started = Date.now();
    let written = 0,
      failed = 0,
      processed = 0,
      rateLimited = false;
    for (const target of targets ?? []) {
      if (Date.now() - started > 75000) break;
      if (
        target.last_attempt_at &&
        Date.now() - Date.parse(target.last_attempt_at) < 23 * 3600000
      )
        continue;
      const { error: attemptError } = await db
        .from("statistic_collection_state")
        .update({
          last_attempt_at: new Date().toISOString(),
          status: "started",
          error_code: null,
        })
        .eq("metal_id", target.metal_id);
      if (attemptError) throw new JobError("trade_state_write_failed");
      processed++;
      try {
        const url = comtradeUrl(target.metal_id),
          response = await fetchFeed(url, ["comtradeapi.un.org"], {
            Accept: "application/json",
            "User-Agent": "ALFA-Analytics-Trade/1.0",
          });
        if (response.status !== 200) {
          await response.body?.cancel();
          if (response.status === 429) rateLimited = true;
          throw new JobError(
            response.status === 429
              ? "trade_source_rate_limited"
              : "trade_source_unavailable",
          );
        }
        const raw = await limitedText(response, 1048576);
        let observations;
        try {
          observations = parseComtrade(JSON.parse(raw), target.metal_id);
        } catch {
          throw new JobError("trade_validation_failed");
        }
        const payload = await storePayload(db, COMTRADE_SOURCE, url, raw);
        if (observations.length) {
          const { data: rows, error: writeError } = await db
            .from("market_statistics")
            .upsert(
              observations.map((r) => ({
                ...r,
                source_id: COMTRADE_SOURCE,
                source_url: url,
                retrieved_at: new Date().toISOString(),
                payload_id: payload,
              })),
              {
                onConflict:
                  "source_id,metal_id,metric,country_code,period_year,commodity_code",
              },
            )
            .select("id");
          if (writeError) throw new JobError("trade_write_failed");
          written += rows?.length ?? 0;
        }
        await db
          .from("statistic_collection_state")
          .update({
            status: observations.length ? "success" : "no_data",
            error_code: null,
          })
          .eq("metal_id", target.metal_id);
      } catch (e) {
        failed++;
        await db
          .from("statistic_collection_state")
          .update({
            status: "error",
            error_code:
              e instanceof JobError ? e.code : "trade_collection_failed",
          })
          .eq("metal_id", target.metal_id);
        if (rateLimited) break;
      }
      if (processed < (targets?.length ?? 0))
        await new Promise((r) => setTimeout(r, 1200));
    }
    if (processed > failed) {
      await db
        .from("data_sources")
        .update({
          status: "connected",
          last_success_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", COMTRADE_SOURCE);
    }
    return {
      rows: written,
      status: failed ? "partial" : "success",
      ...(failed
        ? {
            code: rateLimited
              ? "trade_source_rate_limited"
              : "trade_sources_failed",
          }
        : {}),
      details: { processed, failed },
    };
  });
}
