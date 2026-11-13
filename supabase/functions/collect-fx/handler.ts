import { scheduledJob, storePayload, JobError } from "../_shared/jobs.ts";
import { frankfurterUrl, parseFrankfurter } from "../../../shared/fx.ts";
import { fetchFeed, limitedText } from "../_shared/network.ts";
export async function handler(req: Request): Promise<Response> {
  return scheduledJob(req, "collect-fx", async (db) => {
    let days = 7;
    if (req.body) {
      try {
        const body = JSON.parse(
          await limitedText(new Response(req.body), 1024),
        );
        if (body.days !== undefined) {
          if (!Number.isInteger(body.days) || body.days < 1 || body.days > 31)
            throw new Error("invalid_days");
          days = body.days;
        }
      } catch {
        throw new JobError("invalid_history_window");
      }
    }
    const url = frankfurterUrl(Date.now(), days);
    const response = await fetchFeed(url, ["api.frankfurter.dev"], {
      Accept: "application/json",
      "User-Agent": "ALFA-Analytics-FX/3.0",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new JobError("fx_source_unavailable");
    }
    const raw = await limitedText(response, 1048576);
    let rows;
    try {
      rows = parseFrankfurter(JSON.parse(raw));
    } catch {
      throw new JobError("fx_validation_failed");
    }
    const payloadId = await storePayload(db, "frankfurter-v2", url, raw);
    const retrievedAt = new Date().toISOString();
    const { data: written, error } = await db
      .from("fx_observations")
      .upsert(
        rows.map((r) => ({
          ...r,
          source_id: "frankfurter-v2",
          source_url: url,
          payload_id: payloadId,
          retrieved_at: retrievedAt,
        })),
        {
          onConflict: "source_id,base_currency,quote_currency,rate_date",
          ignoreDuplicates: true,
        },
      )
      .select("id");
    if (error) throw new JobError("fx_write_failed");
    const { error: updateError } = await db
      .from("data_sources")
      .update({
        status: "connected",
        last_success_at: retrievedAt,
        last_error: null,
      })
      .eq("id", "frankfurter-v2");
    if (updateError) throw new JobError("fx_status_write_failed");
    const newest = Math.max(...rows.map((r) => Date.parse(r.rate_date)));
    return {
      rows: written?.length ?? 0,
      status: Date.now() - newest > 4 * 86400000 ? "partial" : "success",
      ...(Date.now() - newest > 4 * 86400000
        ? { code: "fx_source_stale" }
        : {}),
      details: {
        provider: "frankfurter-v2",
        latestObservation: new Date(newest).toISOString(),
      },
    };
  });
}
