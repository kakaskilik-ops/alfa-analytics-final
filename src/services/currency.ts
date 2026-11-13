import { historicalRate, type FxObservation } from "../../shared/fx";
import type { CurrencyCode, UnitCode, ExchangeRate } from "@/types/market";
import { supabase } from "@/lib/supabase";

export const CURRENCY_CODES: CurrencyCode[] = [
  "USD",
  "EUR",
  "GBP",
  "RUB",
  "CNY",
  "SEK",
];

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  RUB: "RUB",
  CNY: "CNY",
  SEK: "SEK",
};

export const UNIT_LABELS: Record<UnitCode, string> = {
  ton: "т",
  kg: "кг",
  g: "г",
  ozt: "тр. унц.",
  lb: "фунт",
};

export const UNIT_TO_KG: Record<UnitCode, number> = {
  ton: 1000,
  kg: 1,
  g: 0.001,
  ozt: 0.0311034768,
  lb: 0.45359237,
};

const rateMetadata = new Map<string, { date: number; origin: string }>();
let rateHistory: FxObservation[] = [];
let liveRateCache: Map<string, number> | null = null;
let liveRateOrigin = "";
let liveRateTimestamp = 0;
let liveRateStatus: "live" | "unavailable" = "unavailable";

export function getRate(
  base: CurrencyCode,
  quote: CurrencyCode,
): number | null {
  if (base === quote) return 1;
  if (liveRateCache) {
    const key = `${base}-${quote}`;
    const cached = liveRateCache.get(key);
    if (
      cached !== undefined &&
      Date.now() - (rateMetadata.get(key)?.date ?? 0) <= 4 * 86400000
    )
      return cached;
    const reverse = liveRateCache.get(`${quote}-${base}`);
    if (
      reverse !== undefined &&
      reverse !== 0 &&
      Date.now() - (rateMetadata.get(`${quote}-${base}`)?.date ?? 0) <=
        4 * 86400000
    )
      return 1 / reverse;
  }
  return null;
}

export function getRateStatus(): "live" | "unavailable" {
  return liveRateStatus;
}

export function getRateOrigin(): string {
  return liveRateStatus === "live" ? liveRateOrigin : "Курс недоступен";
}

export function getRateTimestamp(): number {
  return liveRateTimestamp;
}

export async function loadLiveRates(): Promise<void> {
  liveRateCache = null;
  rateMetadata.clear();
  rateHistory = [];
  liveRateStatus = "unavailable";
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from("app_exchange_rates")
      .select(
        "base_currency, quote_currency, rate, rate_date, origin, data_status",
      )
      .order("rate_date", { ascending: false })
      .order("provider_priority", { ascending: true })
      .limit(5000);

    if (error || !data || data.length === 0) return;

    const cache = new Map<string, number>();
    let latestDate = 0;
    let origin = "";
    let hasLive = false;

    for (const row of data) {
      const base = row.base_currency as CurrencyCode;
      const quote = row.quote_currency as CurrencyCode;
      const rate = Number(row.rate);
      const rowDate = Date.parse(row.rate_date as string);
      if (
        CURRENCY_CODES.includes(base) &&
        CURRENCY_CODES.includes(quote) &&
        Number.isFinite(rate) &&
        rate > 0 &&
        Number.isFinite(rowDate) &&
        rowDate <= Date.now() + 300000 &&
        ["live", "cached"].includes(row.data_status)
      ) {
        if (
          !rateHistory.some(
            (r) =>
              r.base_currency === base &&
              r.quote_currency === quote &&
              r.rate_date === row.rate_date,
          )
        )
          rateHistory.push({
            base_currency: base,
            quote_currency: quote,
            rate,
            rate_date: row.rate_date,
          } as FxObservation);
      }
      if (
        !CURRENCY_CODES.includes(base) ||
        !CURRENCY_CODES.includes(quote) ||
        !Number.isFinite(rate) ||
        rate <= 0 ||
        !Number.isFinite(rowDate) ||
        Date.now() - rowDate > 4 * 86400000 ||
        rowDate > Date.now() + 300000 ||
        row.data_status !== "live"
      )
        continue;
      if (cache.has(`${base}-${quote}`)) continue;
      cache.set(`${base}-${quote}`, rate);
      rateMetadata.set(`${base}-${quote}`, {
        date: rowDate,
        origin: String(row.origin),
      });
      if (rowDate > latestDate) {
        latestDate = rowDate;
        origin = row.origin as string;
        hasLive = row.data_status === "live";
      }
    }

    liveRateCache = cache;
    liveRateTimestamp = latestDate;
    liveRateOrigin = origin;
    liveRateStatus = hasLive ? "live" : "unavailable";
  } catch {
    // Leave rates unavailable when the database cannot be read.
  }
}

export function convertPrice(
  price: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  fromUnit: UnitCode,
  toUnit: UnitCode,
): number | null {
  const rate = getRate(fromCurrency, toCurrency);
  if (rate === null || !Number.isFinite(price) || price <= 0) return null;
  const pricePerKg = price / UNIT_TO_KG[fromUnit];
  const convertedPerKg = pricePerKg * rate;
  return convertedPerKg * UNIT_TO_KG[toUnit];
}

export function normalizePriceToUsdPerKg(
  price: number,
  fromCurrency: CurrencyCode,
  fromUnit: UnitCode,
): number | null {
  return convertPrice(price, fromCurrency, "USD", fromUnit, "kg");
}

export function getExchangeRates(): ExchangeRate[] {
  if (!liveRateCache) return [];
  const rates: ExchangeRate[] = [];
  for (const [key, rate] of liveRateCache) {
    const [base, quote] = key.split("-") as [CurrencyCode, CurrencyCode];
    rates.push({
      base,
      quote,
      rate,
      updatedAt: rateMetadata.get(key)?.date ?? liveRateTimestamp,
      origin: rateMetadata.get(key)?.origin ?? liveRateOrigin,
      dataStatus: liveRateStatus,
    });
  }
  return rates;
}

export function getPairMetadata(base: CurrencyCode, quote: CurrencyCode) {
  return (
    rateMetadata.get(`${base}-${quote}`) ??
    rateMetadata.get(`${quote}-${base}`) ??
    null
  );
}

export function getHistoricalRate(
  base: CurrencyCode,
  quote: CurrencyCode,
  at: number,
): number | null {
  return historicalRate(rateHistory, base, quote, at);
}
