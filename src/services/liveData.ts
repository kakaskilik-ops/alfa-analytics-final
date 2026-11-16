import { isRegion } from "../../supabase/functions/_shared/universe";
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
  region?: string;
  specificationKey?: string;
  country?: string | null;
}
export interface LiveMarketData {
  quotes: Map<string, LiveQuoteData>;
  regionalQuotes?: LiveQuoteData[];
  selectedRegion?: string;
  displayCurrency?: import("@/types/market").CurrencyCode;
  displayUnit?: import("@/types/market").UnitCode;
  loaded: boolean;
  updatedAt: number;
  error: string | null;
}
let cachedData: LiveMarketData | null = null;
let cacheAt = 0;
let inFlight: Promise<LiveMarketData> | null = null;
export async function loadLiveMarketData(
  force = false,
): Promise<LiveMarketData> {
  if (inFlight) return inFlight;
  inFlight = loadMarketData(force);
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
async function loadMarketData(force = false): Promise<LiveMarketData> {
  if (!force && cachedData && Date.now() - cacheAt < 300000) return cachedData;
  try {
    await loadLiveRates();
    const records = await fetchAllLiveQuotations();
    const valid = records.filter(
      (q) =>
        !quoteIssues(q).length &&
        q.currency === "USD" &&
        q.unit === "kg" &&
        isRegion(q.region) &&
        (q.region !== "Азия" || Boolean(q.country)),
    );
    const selected = new Map<string, (typeof valid)[number]>();
    for (const q of valid) {
      if (!METAL_MAP[q.metalId]) continue;
      const key = comparisonKey(q);
      if (!selected.has(key)) selected.set(key, q);
    }
    const regionalQuotes: LiveQuoteData[] = [];
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
        regionalQuotes.push({
          region: q.region,
          specificationKey: comparisonKey(q),
          country: q.country,
          metalId: q.metalId,
          livePrice: q.price,
          originalCurrency: q.currency,
          originalUnit: q.unit,
          sourceName: q.sourceName,
          sourceUrl: q.sourceUrl,
          marketLabel: `${q.region} · ${MARKET_TYPE_LABELS[q.marketType]} · ${q.grade} · ${q.productForm} · ${q.purity ?? q.elementContent}% · ${q.deliveryTerms}`,
          exchangeName: q.exchangeName,
          timestamp: q.timestamp,
          dataStatus: q.dataStatus,
          history,
        });
      }),
    );
    cachedData = {
      regionalQuotes,
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
    displayQuote(
      buildHybridQuote(m, period, at, data?.quotes.get(m.id) ?? null),
      data,
    ),
  );
}
export function getLiveMetalIds(data: LiveMarketData | null): Set<string> {
  return new Set(data?.quotes.keys());
}
export { METALS };

import { convertPrice, getHistoricalRate } from "./currency";
export function displayQuote(
  q: MetalQuote,
  data: LiveMarketData | null,
): MetalQuote {
  const currency = data?.displayCurrency ?? "USD",
    unit = data?.displayUnit ?? "kg";
  const conv = (v: number | null) =>
    v === null ? null : convertPrice(v, "USD", currency, "kg", unit);
  const factor = convertPrice(1, "USD", currency, "kg", unit);
  if (factor === null)
    return {
      ...q,
      metal: { ...q.metal, currency, unit },
      price: null,
      change: null,
      changePct: null,
      high: null,
      low: null,
      average: null,
      series: [],
      dataStatus: "unavailable",
    };
  const mass = UNIT_TO_KG[unit];
  const series = q.series.flatMap((p) => {
    const rate = getHistoricalRate("USD", currency, p.date);
    return rate === null
      ? []
      : [{ date: p.date, price: p.price * mass * rate }];
  });
  const first = series[0]?.price,
    last = series[series.length - 1]?.price;
  const change = series.length >= 2 ? last - first : null;
  return {
    ...q,
    metal: { ...q.metal, currency, unit },
    price: conv(q.price),
    change,
    changePct: change === null ? null : (change / first) * 100,
    high: series.length ? Math.max(...series.map((p) => p.price)) : null,
    low: series.length ? Math.min(...series.map((p) => p.price)) : null,
    average: series.length
      ? series.reduce((s, p) => s + p.price, 0) / series.length
      : null,
    series: factor === null ? [] : series,
    dataStatus: factor === null ? "unavailable" : q.dataStatus,
  };
}
export function regionalView(
  data: LiveMarketData | null,
  region: string,
  choices: Record<string, string>,
  currency: import("@/types/market").CurrencyCode,
  unit: import("@/types/market").UnitCode,
): LiveMarketData | null {
  if (!data) return null;
  const quotes = new Map<string, LiveQuoteData>();
  for (const m of METALS) {
    const options = (data.regionalQuotes ?? []).filter(
      (q) => q.metalId === m.id && q.region === region,
    );
    const choice = options.find((q) => q.specificationKey === choices[m.id]);
    if (choice) quotes.set(m.id, choice);
    else if (options.length === 1) quotes.set(m.id, options[0]);
  }
  return {
    ...data,
    quotes,
    selectedRegion: region,
    displayCurrency: currency,
    displayUnit: unit,
    updatedAt: Math.max(0, ...[...quotes.values()].map((q) => q.timestamp)),
  };
}
