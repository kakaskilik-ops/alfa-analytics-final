import type { PriceQuoteRecord } from "@/types/market";
export const MAX_QUOTE_AGE_MS = 4 * 86400000;
export const UNIT_TO_KG: Record<string, number> = {
  kg: 1,
  ton: 1000,
  g: 0.001,
  ozt: 0.0311034768,
  lb: 0.45359237,
};
export function safeSourceUrl(value: string): string | null {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function comparisonKey(r: PriceQuoteRecord): string {
  return JSON.stringify([
    r.metalId,
    r.currency,
    r.unit,
    r.region,
    r.marketType,
    r.grade,
    r.productForm,
    r.composition ?? null,
    r.priceType ?? "unknown",
  ]);
}
export function quoteIssues(r: PriceQuoteRecord, now = Date.now()): string[] {
  const issues: string[] = [];
  if (!Number.isFinite(r.price) || r.price <= 0)
    issues.push("Цена должна быть положительной");
  if (!Object.prototype.hasOwnProperty.call(UNIT_TO_KG, r.unit))
    issues.push("Неизвестная единица");
  if (!["USD", "EUR", "GBP", "RUB", "CNY", "SEK"].includes(r.currency))
    issues.push("Неизвестная валюта");
  if (
    ![
      "exchange",
      "spot",
      "wholesale",
      "regional",
      "scrap",
      "raw",
      "alloy",
    ].includes(r.marketType)
  )
    issues.push("Неизвестный рынок");
  if (!r.metalId || !r.sourceId || !r.region || !r.grade || !r.productForm)
    issues.push("Не заполнена спецификация");
  if (!safeSourceUrl(r.sourceUrl))
    issues.push("Не подтверждена ссылка на источник");
  if (
    !Number.isFinite(r.timestamp) ||
    now - r.timestamp > MAX_QUOTE_AGE_MS ||
    r.timestamp > now + 300000
  )
    issues.push("Некорректная дата или устаревшие данные");
  if (
    !Number.isFinite(r.retrievedAt) ||
    r.retrievedAt < r.timestamp - 300000 ||
    r.retrievedAt > now + 300000
  )
    issues.push("Некорректная дата получения");
  if (
    !Number.isFinite(r.qualityScore) ||
    r.qualityScore <= 0 ||
    r.qualityScore > 1
  )
    issues.push("Неизвестное качество");
  if (
    !["live", "cached"].includes(r.dataStatus) ||
    r.validationStatus !== "valid"
  )
    issues.push("Котировка не подтверждена");
  return issues;
}
export function selectComparable(
  records: PriceQuoteRecord[],
  now = Date.now(),
): PriceQuoteRecord[] {
  const valid = records.filter((r) => quoteIssues(r, now).length === 0);
  // A caller must select explicit specifications. Never silently select one market from a mixed set.
  if (new Set(valid.map(comparisonKey)).size > 1) return [];
  const latest = new Map<string, PriceQuoteRecord>();
  for (const r of valid) {
    const key = r.independenceId || r.sourceId;
    if (!latest.has(key) || latest.get(key)!.timestamp < r.timestamp)
      latest.set(key, r);
  }
  return [...latest.values()];
}
