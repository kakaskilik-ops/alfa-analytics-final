import type {
  AveragePriceResult,
  PriceQuoteRecord,
} from "../src/types/market.ts";
import { comparisonKey, quoteIssues, selectComparable } from "./quotes.ts";
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b),
    m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length,
  );
}
export function trimmedMean(values: number[], fraction = 0.1): number | null {
  if (!values.length || fraction < 0 || fraction >= 0.5) return null;
  const s = [...values].sort((a, b) => a - b),
    n = Math.floor(s.length * fraction),
    t = s.slice(n, s.length - n);
  return t.reduce((a, b) => a + b, 0) / t.length;
}
export function detectOutliers(values: number[]): number[] {
  if (values.length < 3) return [];
  const m = median(values)!;
  // Conservative guard: >50% from median requires manual review, never automatic acceptance.
  return values.filter((v) => Math.abs(v - m) / m > 0.5);
}
export function isRealRecord(r: PriceQuoteRecord): boolean {
  return quoteIssues(r).length === 0;
}
export function computeAveragePrice(
  records: PriceQuoteRecord[],
  now = Date.now(),
): AveragePriceResult {
  const mixed =
    new Set(
      records.filter((r) => !quoteIssues(r, now).length).map(comparisonKey),
    ).size > 1;
  const selected = selectComparable(records, now),
    outliers = detectOutliers(selected.map((r) => r.price));
  const accepted = selected.filter((r) => !outliers.includes(r.price)),
    prices = accepted.map((r) => r.price);
  const count = accepted.length;
  const empty: AveragePriceResult = {
    weightedAverage: null,
    simpleAverage: null,
    trimmedMean: null,
    min: null,
    max: null,
    median: null,
    standardDeviation: null,
    dispersion: null,
    quotationCount: count,
    sourceCount: count,
    confidence: "none",
    computedAt: now,
    outliers,
    qualityScore: 0,
    rejectedCount: records.length - count,
    reason: mixed
      ? "Выберите сопоставимые условия рынка"
      : "Недостаточно данных: нужно минимум два независимых источника",
  };
  if (count < 2) return empty;
  const mean = prices.reduce((a, b) => a + b, 0) / count,
    sd = standardDeviation(prices)!,
    dispersion = sd / mean;
  const quality =
    accepted.reduce(
      (s, r) =>
        s + r.qualityScore * (1 - (now - r.timestamp) / (2 * 4 * 86400000)),
      0,
    ) / count;
  const hasWeights = accepted.every(
    (r) => r.weightReason?.trim() && Number.isFinite(r.weight) && r.weight! > 0,
  );
  const weighted = hasWeights
    ? accepted.reduce((s, r) => s + r.price * r.weight!, 0) /
      accepted.reduce((s, r) => s + r.weight!, 0)
    : null;
  return {
    ...empty,
    weightedAverage: weighted,
    simpleAverage: mean,
    trimmedMean: trimmedMean(prices),
    min: Math.min(...prices),
    max: Math.max(...prices),
    median: median(prices),
    standardDeviation: sd,
    dispersion,
    qualityScore: quality,
    reason: null,
    confidence:
      count >= 3 && quality >= 0.8 && dispersion < 0.15
        ? "high"
        : quality >= 0.6 && dispersion < 0.3
          ? "medium"
          : "low",
  };
}
export const CONFIDENCE_LABELS = {
  high: "Высокая",
  medium: "Средняя",
  low: "Низкая",
  none: "Недостаточно данных",
};
export const CONFIDENCE_COLORS = {
  high: "text-brand-500",
  medium: "text-yellow-400",
  low: "text-orange-400",
  none: "text-ink-400",
};
