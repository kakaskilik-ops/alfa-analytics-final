import { supabase } from "@/lib/supabase";
import { FX_CURRENCIES, type FxCurrency } from "../../shared/fx";
export const FX_PAIRS = [
  ["USD", "RUB"],
  ["EUR", "RUB"],
  ["CNY", "RUB"],
  ["USD", "CNY"],
  ["EUR", "USD"],
] as const;
export interface FxRate {
  base: FxCurrency;
  quote: FxCurrency;
  rate: number;
  date: number;
  retrievedAt: number;
  source: string;
  url: string;
  origin: string;
}
export function parseFxRows(
  input: Record<string, unknown>[],
  now = Date.now(),
): FxRate[] {
  const seen = new Set<string>();
  return input.flatMap((row) => {
    const base = row.base_currency as FxCurrency,
      quote = row.quote_currency as FxCurrency,
      rate = Number(row.rate),
      date = Date.parse(String(row.rate_date)),
      retrievedAt = Date.parse(String(row.retrieved_at));
    if (
      !FX_CURRENCIES.includes(base) ||
      !FX_CURRENCIES.includes(quote) ||
      base === quote ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      !Number.isFinite(date) ||
      date > now ||
      !Number.isFinite(retrievedAt) ||
      retrievedAt > now + 300000 ||
      !["live", "cached"].includes(String(row.data_status)) ||
      row.source_id !== "frankfurter-v2"
    )
      return [];
    const key = [base, quote, date, row.source_id].join("|");
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        base,
        quote,
        rate,
        date,
        retrievedAt,
        source: "frankfurter-v2",
        url: "https://frankfurter.dev/",
        origin: "Frankfurter v2 — расчётный справочный курс",
      },
    ];
  });
}
export function fxPair(
  rows: FxRate[],
  base: FxCurrency,
  quote: FxCurrency,
  now = Date.now(),
) {
  const history = rows
    .filter((r) => r.base === base && r.quote === quote && r.date <= now)
    .sort((a, b) => a.date - b.date);
  const latest = history[history.length - 1] ?? null,
    previous = history[history.length - 2] ?? null;
  const change = latest && previous ? latest.rate - previous.rate : null;
  return {
    history,
    latest,
    previous,
    change,
    changePct:
      change === null || !previous ? null : (change / previous.rate) * 100,
    stale: latest ? now - latest.date > 4 * 86400000 : true,
  };
}
export function convertMoney(
  amount: string,
  base: FxCurrency,
  quote: FxCurrency,
  rows: FxRate[],
  now = Date.now(),
): number | null {
  if (
    !/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(amount.trim()) ||
    !FX_CURRENCIES.includes(base) ||
    !FX_CURRENCIES.includes(quote)
  )
    return null;
  const value = Number(amount.replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || value > 1e15) return null;
  const pair = fxPair(rows, base, quote, now),
    rate = base === quote ? 1 : pair.stale ? null : (pair.latest?.rate ?? null);
  const converted = rate === null ? null : value * rate;
  return converted !== null && Number.isFinite(converted) ? converted : null;
}
export async function fetchFxRates(): Promise<FxRate[]> {
  if (!supabase) throw new Error("Подключение валютного модуля не настроено.");
  const { data, error } = await supabase
    .from("fx_observations")
    .select(
      "base_currency,quote_currency,rate,rate_date,retrieved_at,data_status,source_id",
    )
    .eq("source_id", "frankfurter-v2")
    .gte("rate_date", new Date(Date.now() - 45 * 86400000).toISOString())
    .order("rate_date", { ascending: false })
    .limit(600);
  if (error)
    throw new Error("Не удалось обновить курсы валют. Повторите попытку.");
  return parseFxRows(data ?? []);
}
