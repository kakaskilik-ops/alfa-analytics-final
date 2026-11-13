export const FX_CURRENCIES = ["USD", "EUR", "RUB", "CNY"] as const;
export type FxCurrency = (typeof FX_CURRENCIES)[number];
export interface FxObservation {
  base_currency: FxCurrency;
  quote_currency: FxCurrency;
  rate: number;
  rate_date: string;
  origin: string;
  provider_details: string[];
  data_status: "live";
}
export function dateOnly(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}
export function frankfurterUrl(now = Date.now(), days = 7): string {
  if (!Number.isInteger(days) || days < 1 || days > 31)
    throw new Error("invalid_history_window");
  const url = new URL("https://api.frankfurter.dev/v2/rates");
  url.searchParams.set("base", "USD");
  url.searchParams.set("quotes", "EUR,RUB,CNY");
  url.searchParams.set("expand", "providers");
  url.searchParams.set("from", dateOnly(now - (days - 1) * 86400000));
  url.searchParams.set("to", dateOnly(now));
  return url.href;
}
export function parseFrankfurter(
  payload: unknown,
  now = Date.now(),
): FxObservation[] {
  if (!Array.isArray(payload) || !payload.length || payload.length > 200)
    throw new Error("invalid_fx_response");
  const groups = new Map<
    string,
    Map<FxCurrency, { rate: number; providers: string[] }>
  >();
  for (const raw of payload) {
    if (!raw || typeof raw !== "object") throw new Error("invalid_fx_row");
    const r = raw as Record<string, unknown>;
    if (
      r.base !== "USD" ||
      typeof r.quote !== "string" ||
      !["EUR", "RUB", "CNY"].includes(r.quote) ||
      typeof r.rate !== "number" ||
      !Number.isFinite(r.rate) ||
      r.rate <= 0
    )
      throw new Error("invalid_fx_rate");
    if (
      typeof r.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
      !Number.isFinite(Date.parse(r.date)) ||
      dateOnly(Date.parse(r.date)) !== r.date ||
      r.date > dateOnly(now) ||
      now - Date.parse(r.date) > 32 * 86400000
    )
      throw new Error("invalid_fx_date");
    if (!Array.isArray(r.providers) || !r.providers.length)
      throw new Error("missing_provider_attribution");
    const providers = r.providers.map((v) => {
      if (typeof v === "string" && /^[A-Z0-9_.-]{1,100}$/i.test(v)) return v;
      if (
        !v ||
        typeof v !== "object" ||
        typeof v.key !== "string" ||
        !/^[A-Z0-9_.-]{1,100}$/i.test(v.key) ||
        typeof v.date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v.date) ||
        v.date > String(r.date) ||
        typeof v.rate !== "number" ||
        !Number.isFinite(v.rate) ||
        v.rate <= 0
      )
        throw new Error("invalid_provider_attribution");
      return `${v.key}@${v.date}`;
    });
    const day = groups.get(r.date) ?? new Map();
    if (day.has(r.quote as FxCurrency)) throw new Error("duplicate_fx_row");
    day.set(r.quote as FxCurrency, { rate: r.rate, providers });
    groups.set(r.date, day);
  }
  const result: FxObservation[] = [];
  for (const [day, rates] of groups) {
    rates.set("USD", { rate: 1, providers: [] });
    for (const [base, a] of rates)
      for (const [quote, b] of rates) {
        if (base === quote) continue;
        const rate = b.rate / a.rate;
        if (!Number.isFinite(rate) || rate <= 0)
          throw new Error("invalid_fx_cross");
        result.push({
          base_currency: base,
          quote_currency: quote,
          rate,
          rate_date: day + "T00:00:00Z",
          origin: "Frankfurter v2 — расчётный справочный курс",
          provider_details: [...new Set([...a.providers, ...b.providers])],
          data_status: "live",
        });
      }
  }
  return result;
}
export function historicalRate(
  rows: Pick<
    FxObservation,
    "base_currency" | "quote_currency" | "rate" | "rate_date"
  >[],
  base: string,
  quote: string,
  at: number,
): number | null {
  if (base === quote) return 1;
  const selected = rows
    .filter(
      (r) =>
        r.base_currency === base &&
        r.quote_currency === quote &&
        Date.parse(r.rate_date) <= at &&
        at - Date.parse(r.rate_date) <= 4 * 86400000 &&
        Number.isFinite(r.rate) &&
        r.rate > 0,
    )
    .sort((a, b) => Date.parse(b.rate_date) - Date.parse(a.rate_date))[0];
  return selected?.rate ?? null;
}
