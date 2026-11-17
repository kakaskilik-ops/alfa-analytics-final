import { scheduledJob, JobError, storePayload } from "../_shared/jobs.ts";
import { fetchFeed, limitedBytes, limitedText } from "../_shared/network.ts";
import {
  RARE_PRICE_URL,
  FERRO_PRICE_URL,
  parseFerroPrices,
  QS_PRICE_URL,
  QS_PRICE_SHA256,
  QS_CATALOGUE_PRICES,
  parseRarePrices,
} from "../../../shared/supplierPrices.ts";
export async function handler(req: Request) {
  return scheduledJob(req, "collect-price-evidence", async (db) => {
    let rows = 0;
    const results = [];
    for (const source of [
      "rare-metals-bid",
      "qs-catalogue",
      "metotechnics-floor",
    ]) {
      try {
        const url =
          source === "rare-metals-bid"
            ? RARE_PRICE_URL
            : source === "metotechnics-floor"
              ? FERRO_PRICE_URL
              : QS_PRICE_URL;
        const response = await fetchFeed(url, [new URL(url).hostname], {
          Accept: source !== "qs-catalogue" ? "text/html" : "application/pdf",
          "User-Agent": "ALFA-Analytics-Prices/1.0",
        });
        if (response.status !== 200) {
          await response.body?.cancel();
          throw new JobError("supplier_source_unavailable");
        }
        let prices, payloadText;
        if (source !== "qs-catalogue") {
          payloadText = await limitedText(response, 900000);
          prices =
            source === "metotechnics-floor"
              ? parseFerroPrices(payloadText)
              : parseRarePrices(payloadText);
        } else {
          const bytes = await limitedBytes(response, 700000);
          const hash = [
            ...new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new Uint8Array(bytes).buffer,
              ),
            ),
          ]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          if (hash !== QS_PRICE_SHA256)
            throw new JobError("catalogue_changed_requires_review");
          prices = QS_CATALOGUE_PRICES;
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          payloadText = JSON.stringify({
            format: "pdf-base64",
            sha256: hash,
            base64: btoa(binary),
            extraction:
              "Last price table: Plate/Sheet >10mm, catalogue year 2023",
          });
        }
        const payloadId = await storePayload(db, source, url, payloadText);
        const saved = await db
          .from("supplier_price_observations")
          .upsert(
            prices.map((p) => ({ ...p, payload_id: payloadId })),
            {
              onConflict:
                "source_id,metal_id,specification,observed_on,original_price",
              ignoreDuplicates: true,
            },
          )
          .select("id");
        if (saved.error) throw new JobError("supplier_price_write_failed");
        rows += saved.data?.length ?? 0;
        const health = await db
          .from("data_sources")
          .update({
            status: "connected",
            last_success_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", source);
        if (health.error) throw new JobError("supplier_status_failed");
        results.push({
          source,
          status: "success",
          written: saved.data?.length ?? 0,
        });
      } catch (e) {
        const code =
          e instanceof JobError
            ? e.code
            : e instanceof Error &&
                [
                  "supplier_basis_changed",
                  "supplier_duplicate_material",
                  "supplier_invalid_price",
                  "supplier_price_table_incomplete",
                ].includes(e.message)
              ? e.message
              : "supplier_collection_failed";
        await db
          .from("data_sources")
          .update({ status: "error", last_error: code })
          .eq("id", source);
        results.push({ source, status: "error", code });
      }
    }
    return {
      rows,
      status: results.some((r) => r.status === "error") ? "partial" : "success",
      details: { sources: results },
    };
  });
}
