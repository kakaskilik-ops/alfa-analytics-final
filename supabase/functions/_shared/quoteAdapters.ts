import {
  parseProviderQuote,
  type ProviderQuote,
  type QuoteProvider,
} from "./providers.ts";
import { fetchFeed, limitedText } from "./network.ts";
/** Canonical JSON transport for an approved vendor gateway. Official vendors require their own mapping adapter. */
export class CanonicalJsonProvider implements QuoteProvider {
  constructor(
    readonly sourceId: string,
    private endpoint: string,
    private allowedHosts: string[],
    private headers: Record<string, string> = {},
  ) {}
  async fetchQuotes(signal: AbortSignal): Promise<unknown> {
    const response = await fetchFeed(
      this.endpoint,
      this.allowedHosts,
      this.headers,
      fetch,
      signal,
    );
    if (!response.ok) throw new Error("quote_source_unavailable");
    return JSON.parse(await limitedText(response, 262144));
  }
  parse(payload: unknown): ProviderQuote[] {
    if (!Array.isArray(payload) || payload.length > 100)
      throw new Error("invalid_quote_batch");
    return payload.map((raw) => {
      const q = parseProviderQuote(raw);
      if (q.sourceId !== this.sourceId) throw new Error("source_mismatch");
      return q;
    });
  }
}
export function quoteComparisonKey(q: ProviderQuote): string {
  return JSON.stringify([
    q.metalId,
    "USD",
    "kg",
    q.region,
    q.marketType,
    q.grade,
    q.productForm,
    q.composition,
    q.priceType,
    q.country,
    q.purity,
    q.elementContent,
    q.deliveryTerms,
  ]);
}
export function parseHistoricalObservation(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("invalid_history");
  const r = input as Record<string, unknown>;
  const q = parseProviderQuote(r, Date.now(), 1826 * 86400000);
  const date = String(r.tradeDate ?? "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    Date.parse(date) > Date.now() ||
    Date.now() - Date.parse(date) > 1826 * 86400000
  )
    throw new Error("invalid_history_date");
  for (const k of ["open", "high", "low", "close"])
    if (typeof r[k] !== "number" || !Number.isFinite(r[k]) || r[k] <= 0)
      throw new Error("invalid_ohlc");
  const o = r.open as number,
    h = r.high as number,
    l = r.low as number,
    c = r.close as number;
  if (h < Math.max(o, c) || l > Math.min(o, c) || l > h)
    throw new Error("invalid_ohlc");
  const units = {
    kg: 1,
    ton: 1000,
    g: 0.001,
    ozt: 0.0311034768,
    lb: 0.45359237,
  };
  const mass = units[q.unit];
  return {
    metal_id: q.metalId,
    source_id: q.sourceId,
    trade_date: date,
    open: o / mass,
    high: h / mass,
    low: l / mass,
    close: c / mass,
    currency: "USD",
    unit: "kg",
    region_code: q.region,
    country: q.country,
    comparison_key: quoteComparisonKey(q),
    data_status: "live",
  };
}
