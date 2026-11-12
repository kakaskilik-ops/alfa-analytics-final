import { METALS, METAL_MAP } from "@/data/metals";
import { buildQuote } from "@/services/market";
import type { Metal, MetalQuote, PeriodKey, DataStatus } from "@/types/market";
import { fetchAllLiveQuotations, fetchPriceHistory } from "@/services/database";
import { loadLiveRates } from "@/services/currency";
import {
  quoteIssues,
  comparisonKey,
  UNIT_TO_KG,
} from "@/services/quoteValidation";
import { MARKET_TYPE_LABELS } from "@/data/sources";
import { PERIODS } from "@/data/periods";
export interface LiveQuoteData {
  metalId: string;
  livePrice: number | null;
  originalCurrency: string;
  originalUnit: string;
  sourceName: string;
  sourceUrl: string;
  marketLabel: string;
  exchangeName: string | null;
  timestamp: number;
  dataStatus: DataStatus;
  history: { date: number; price: number }[];
}
export interface LiveMarketData {
  quotes: Map<string, LiveQuoteData>;
  loaded: boolean;
  updatedAt: number;
  error: string | null;
}
let cachedData: LiveMarketData | null = null;
let cacheAt = 0;
export async function loadLiveMarketData(
  force = false,
): Promise<LiveMarketData> {
  if (!force && cachedData && Date.now() - cacheAt < 300000) return cachedData;
  try {
    await loadLiveRates();
    const records = await fetchAllLiveQuotations();
    const valid = records.filter(
      (q) => !quoteIssues(q).length && q.currency === "USD" && q.unit === "kg",
    );
    const selected = new Map<string, (typeof valid)[number]>();
    // Only display a headline when there is a single market specification for the material.
    for (const q of valid) {
      if (!METAL_MAP[q.metalId]) continue;
      if (
        new Set(valid.filter((r) => r.metalId === q.metalId).map(comparisonKey))
          .size !== 1
      )
        continue;
      if (!selected.has(q.metalId)) selected.set(q.metalId, q);
    }
    const quotes = new Map<string, LiveQuoteData>();
    await Promise.all(
      [...selected.values()].map(async (q) => {
        let history: { date: number; price: number }[] = [];
        try {
          history = (
            await fetchPriceHistory(q.metalId, q.sourceId, comparisonKey(q))
          )
            .filter(
              (h) =>
                h.currency === q.currency &&
                h.unit === q.unit &&
                h.close > 0 &&
                h.date <= q.timestamp,
            )
            .map((h) => ({ date: h.date, price: h.close }));
        } catch {
          /* A quote may be valid while history is unavailable. */
        }
        quotes.set(q.metalId, {
          metalId: q.metalId,
          livePrice: q.price,
          originalCurrency: q.currency,
          originalUnit: q.unit,
          sourceName: q.sourceName,
          sourceUrl: q.sourceUrl,
          marketLabel: `${q.region} · ${MARKET_TYPE_LABELS[q.marketType]} · ${q.grade} · ${q.productForm}`,
          exchangeName: q.exchangeName,
          timestamp: q.timestamp,
          dataStatus: q.dataStatus,
          history,
        });
      }),
    );
    cachedData = {
      quotes,
      loaded: true,
      updatedAt: Math.max(0, ...[...quotes.values()].map((q) => q.timestamp)),
      error: null,
    };
    cacheAt = Date.now();
    return cachedData;
  } catch {
    return {
      quotes: new Map(),
      loaded: false,
      updatedAt: 0,
      error: "Котировки недоступны. Проверьте подключение базы и источников.",
    };
  }
}
export function buildHybridQuote(
  metal: Metal,
  period: PeriodKey,
  at: Date,
  live: LiveQuoteData | null,
): MetalQuote {
  const empty = buildQuote(metal, period, at);
  if (
    !live ||
    live.livePrice === null ||
    live.livePrice <= 0 ||
    Date.now() - live.timestamp > 4 * 86400000
  )
    return empty;
  const cfg = PERIODS.find((p) => p.key === period)!;
  const cutoff = at.getTime() - cfg.durationMs;
  const factor = UNIT_TO_KG[metal.unit];
  const series = live.history
    .filter(
      (h) =>
        h.date >= cutoff &&
        h.date <= at.getTime() &&
        Number.isFinite(h.price) &&
        h.price > 0,
    )
    .map((h) => ({ date: h.date, price: h.price * factor }))
    .sort((a, b) => a.date - b.date);
  const values = series.map((p) => p.price),
    first = values[0],
    last = values[values.length - 1];
  const change = values.length >= 2 ? last! - first : null;
  return {
    ...empty,
    price: live.livePrice * factor,
    change,
    changePct: change === null ? null : (100 * change) / first,
    high: values.length ? Math.max(...values) : null,
    low: values.length ? Math.min(...values) : null,
    average: values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null,
    series,
    dataStatus: live.dataStatus,
    sourceName: live.sourceName,
    publishedAt: live.timestamp,
    sourceUrl: live.sourceUrl,
    marketLabel: live.marketLabel,
  };
}
export function buildHybridQuotes(
  metals: Metal[],
  period: PeriodKey,
  at: Date,
  data: LiveMarketData | null,
): MetalQuote[] {
  return metals.map((m) =>
    buildHybridQuote(m, period, at, data?.quotes.get(m.id) ?? null),
  );
}
export function getLiveMetalIds(data: LiveMarketData | null): Set<string> {
  return new Set(data?.quotes.keys());
}
export { METALS };
