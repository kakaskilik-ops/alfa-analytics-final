import { scheduledJob, JobError, storePayload } from "../_shared/jobs.ts";
import { fetchFeed, limitedBytes, limitedText } from "../_shared/network.ts";
import {
  RARE_PRICE_URL,
  FERRO_PRICE_URL,
  parseFerroPrices,
  QS_PRICE_URL,
  QS_PRICE_SHA256,
  QS_CATALOGUE_PRICES,
  qsCatalogueEvidence,
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
          const bytes = await limitedBytes(response, 2500000);
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
          payloadText = qsCatalogueEvidence(hash, bytes.length);
        }
        const payloadId = await storePayload(db, source, url, payloadText);
        const saved = await db
          .from("supplier_price_observations")
          .upsert(
            prices.map((p) => ({
              ...p,
              payload_id: payloadId,
              tax_status:
                p.source_id === "rare-metals-bid" ? "excluded" : "unknown",
              vat_rate: null,
            })),
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
                  "body_too_large",
                  "empty_response",
                  "feed_host_not_allowed",
                  "invalid_redirect",
                  "too_many_redirects",
                  "catalogue_invalid_size",
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
