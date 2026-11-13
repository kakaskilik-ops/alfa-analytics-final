import { scheduledJob, JobError } from "../_shared/jobs.ts";
import { computeAveragePrice } from "../../../shared/analytics.ts";
import { comparisonKey, quoteIssues } from "../../../shared/quotes.ts";
import { METAL_IDS } from "../_shared/universe.ts";
import type { PriceQuoteRecord } from "../../../src/types/market.ts";
export async function handler(req: Request): Promise<Response> {
  return scheduledJob(req, "compute-orientations", async (db) => {
    const { data, error } = await db
      .from("price_quotations")
      .select(
        "id,metal_id,source_id,normalized_price,normalized_currency,normalized_unit,market_type,region,country,purity,element_content,delivery_terms,grade,product_form,composition,price_type,quality_score,quoted_at,retrieved_at,source_url,attribution,exchange_name,data_status,validation_status,data_sources(name,independence_id)",
      )
      .in("metal_id", [...METAL_IDS])
      .eq("validation_status", "valid")
      .in("data_status", ["live", "cached"])
      .gte("quoted_at", new Date(Date.now() - 4 * 86400000).toISOString())
      .order("quoted_at", { ascending: false })
      .limit(1000);
    if (error) throw new JobError("analytics_read_failed");
    const groups = new Map<
      string,
      { record: PriceQuoteRecord; id: string }[]
    >();
    for (const r of data ?? []) {
      const source = r.data_sources as unknown as {
        name?: string;
        independence_id?: string;
      } | null;
      const record: PriceQuoteRecord = {
        metalId: r.metal_id,
        sourceId: r.source_id,
        sourceName: source?.name ?? r.source_id,
        sourceUrl: r.source_url,
        price: Number(r.normalized_price),
        currency: r.normalized_currency,
        unit: r.normalized_unit,
        marketType: r.market_type,
        region: r.region,
        country: r.country,
        purity: r.purity == null ? null : Number(r.purity),
        elementContent:
          r.element_content == null ? null : Number(r.element_content),
        deliveryTerms: r.delivery_terms,
        grade: r.grade,
        productForm: r.product_form,
        composition: r.composition,
        priceType: r.price_type,
        qualityScore: Number(r.quality_score),
        timestamp: Date.parse(r.quoted_at),
        retrievedAt: Date.parse(r.retrieved_at),
        exchangeName: r.exchange_name,
        attribution: r.attribution,
        dataStatus: r.data_status,
        validationStatus: r.validation_status,
        independenceId: source?.independence_id ?? r.source_id,
      };
      if (quoteIssues(record).length) continue;
      const key = comparisonKey(record),
        group = groups.get(key) ?? [];
      group.push({ record, id: r.id });
      groups.set(key, group);
    }
    let count = 0;
    for (const [key, group] of groups) {
      const result = computeAveragePrice(group.map((r) => r.record));
      const { error: writeError } = await db
        .from("analytical_calculations")
        .insert({
          metal_id: group[0].record.metalId,
          comparison_key: key,
          methodology_version: "v3-verified-sources",
          input_quote_ids: group.map((r) => r.id),
          result,
          computed_at: new Date(result.computedAt).toISOString(),
        });
      if (writeError) throw new JobError("analytics_write_failed");
      count++;
      // Daily bars reflect only validated observations retained by this system.
      // Never synthesize missing days or treat them as an exchange OHLC series.
      const days = new Map<string, PriceQuoteRecord[]>();
      for (const { record } of group) {
        const day = new Date(record.timestamp).toISOString().slice(0, 10);
        const bucket = `${record.sourceId}|${day}`;
        days.set(bucket, [...(days.get(bucket) ?? []), record]);
      }
      for (const observations of days.values()) {
        observations.sort((a, b) => a.timestamp - b.timestamp);
        const first = observations[0],
          last = observations[observations.length - 1];
        const prices = observations.map((q) => q.price);
        const { error: historyError } = await db.from("price_history").upsert(
          {
            metal_id: first.metalId,
            source_id: first.sourceId,
            trade_date: new Date(first.timestamp).toISOString().slice(0, 10),
            open: first.price,
            high: Math.max(...prices),
            low: Math.min(...prices),
            close: last.price,
            currency: "USD",
            unit: "kg",
            region_code: first.region,
            country: first.country,
            comparison_key: key,
            data_status: "live",
          },
          {
            onConflict: "metal_id,source_id,trade_date,comparison_key",
            ignoreDuplicates: true,
          },
        );
        if (historyError) throw new JobError("analytics_history_write_failed");
      }
    }
    return {
      rows: count,
      ...((data?.length ?? 0) >= 1000
        ? { status: "partial" as const, code: "analytics_input_limit" }
        : {}),
      ...(!count
        ? { status: "partial" as const, code: "no_verified_quotes" }
        : {}),
    };
  });
}
