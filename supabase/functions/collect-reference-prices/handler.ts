import { scheduledJob, JobError } from "../_shared/jobs.ts";
import { fetchFeed, limitedBytes } from "../_shared/network.ts";
import { parseWorldBankWorkbook } from "../../../shared/worldbank.ts";
import {
  WORLD_BANK_SOURCE,
  WORLD_BANK_WORKBOOK,
} from "../../../shared/referenceMarkets.ts";
export async function handler(req: Request): Promise<Response> {
  return scheduledJob(req, "collect-reference-prices", async (db) => {
    try {
      const response = await fetchFeed(
        WORLD_BANK_WORKBOOK,
        ["thedocs.worldbank.org"],
        {
          Accept:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "User-Agent": "ALFA-Analytics-References/1.0",
        },
      );
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new JobError("reference_source_unavailable");
      }
      const raw = await limitedBytes(response, 2500000);
      let observations;
      try {
        observations = parseWorldBankWorkbook(raw);
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        throw new JobError(
          [
            "monthly_sheet_not_found",
            "unexpected_reference_columns",
            "unexpected_reference_unit",
            "invalid_workbook",
            "no_reference_observations",
          ].includes(code)
            ? code
            : "reference_validation_failed",
        );
      }
      const hash = [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", new Uint8Array(raw).buffer),
        ),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      let binary = "";
      for (let i = 0; i < raw.length; i += 8192)
        binary += String.fromCharCode(...raw.subarray(i, i + 8192));
      const { error: rawError } = await db
        .from("reference_import_payloads")
        .upsert(
          {
            source_id: WORLD_BANK_SOURCE,
            source_url: WORLD_BANK_WORKBOOK,
            content_sha256: hash,
            raw_base64: btoa(binary),
          },
          { onConflict: "source_id,content_sha256", ignoreDuplicates: true },
        );
      if (rawError) throw new JobError("reference_payload_write_failed");
      const { data: payload, error: lookupError } = await db
        .from("reference_import_payloads")
        .select("id")
        .eq("source_id", WORLD_BANK_SOURCE)
        .eq("content_sha256", hash)
        .single();
      if (lookupError || !payload)
        throw new JobError("reference_payload_lookup_failed");
      const retrieved_at = new Date().toISOString();
      const { data: written, error } = await db
        .from("reference_price_observations")
        .upsert(
          observations.map((o) => ({
            ...o,
            source_id: WORLD_BANK_SOURCE,
            source_url: WORLD_BANK_WORKBOOK,
            payload_id: payload.id,
            retrieved_at,
          })),
          {
            onConflict: "source_id,metal_id,period_start,price",
            ignoreDuplicates: true,
          },
        )
        .select("id");
      if (error) throw new JobError("reference_observations_write_failed");
      const { error: statusError } = await db
        .from("data_sources")
        .update({
          status: "connected",
          last_success_at: retrieved_at,
          last_error: null,
        })
        .eq("id", WORLD_BANK_SOURCE);
      if (statusError) throw new JobError("reference_status_failed");
      return {
        rows: written?.length ?? 0,
        details: {
          provider: WORLD_BANK_SOURCE,
          months: [...new Set(observations.map((o) => o.period_start))].length,
          latestPeriod: observations
            .map((o) => o.period_start)
            .sort()
            .reverse()[0],
        },
      };
    } catch (e) {
      await db
        .from("data_sources")
        .update({
          status: "error",
          last_error:
            e instanceof JobError ? e.code : "reference_collection_failed",
        })
        .eq("id", WORLD_BANK_SOURCE);
      throw e;
    }
  });
}
