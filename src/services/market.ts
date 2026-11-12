import { CATEGORIES } from "@/data/categories";
import type {
  Metal,
  MetalQuote,
  PeriodKey,
  PricePoint,
  MetalCategoryId,
  MarketIndex,
} from "@/types/market";
export function buildQuote(
  metal: Metal,
  _period: PeriodKey,
  _at: Date,
): MetalQuote {
  return {
    metal,
    price: null,
    change: null,
    changePct: null,
    high: null,
    low: null,
    average: null,
    series: [],
    dataStatus: "unavailable",
    sourceName: "Нет подтверждённых данных",
    publishedAt: null,
    sourceUrl: "",
    marketLabel: "",
  };
}
export function buildQuotes(
  metals: Metal[],
  period: PeriodKey,
  at: Date,
): MetalQuote[] {
  return metals.map((m) => buildQuote(m, period, at));
}
export function buildIndex(quotes: MetalQuote[]): PricePoint[] {
  const valid = quotes.filter(
    (q) => q.series.length >= 2 && q.dataStatus === "live",
  );
  if (valid.length < 2) return [];
  // Exact common timestamps, fixed equal-weight basket, no interpolation or forward fill.
  const maps = valid.map(
    (q) => new Map(q.series.map((p) => [p.date, p.price])),
  );
  const dates = [...maps[0].keys()]
    .filter((t) => maps.every((m) => m.has(t)))
    .sort((a, b) => a - b);
  if (dates.length < 2) return [];
  return dates.map((date) => ({
    date,
    price:
      (100 * maps.reduce((s, m) => s + m.get(date)! / m.get(dates[0])!, 0)) /
      maps.length,
  }));
}
export function buildIndicesByCategory(quotes: MetalQuote[]): MarketIndex[] {
  const definitions: { id: MetalCategoryId | "all"; name: string }[] = [
    { id: "all", name: "Индекс общего рынка металлов" },
    ...CATEGORIES.map((c) => ({ id: c.id, name: `Индекс: ${c.name}` })),
  ];
  return definitions.flatMap((d) => {
    const series = buildIndex(
      d.id === "all"
        ? quotes
        : quotes.filter((q) => q.metal.categoryId === d.id),
    );
    if (series.length < 2) return [];
    return [
      {
        id: d.id,
        name: d.name,
        categoryId: d.id,
        series,
        changePct:
          (series[series.length - 1].price / series[0].price - 1) * 100,
      },
    ];
  });
}
export function getTopMovers(
  quotes: MetalQuote[],
  count: number,
  direction: "up" | "down",
): MetalQuote[] {
  return quotes
    .filter(
      (q) =>
        q.changePct !== null &&
        (direction === "up" ? q.changePct > 0 : q.changePct < 0),
    )
    .sort((a, b) =>
      direction === "up"
        ? b.changePct! - a.changePct!
        : a.changePct! - b.changePct!,
    )
    .slice(0, count);
}
export function getVolatility(q: MetalQuote): number | null {
  if (q.series.length < 3) return null;
  const returns = q.series
    .slice(1)
    .map((p, i) => Math.log(p.price / q.series[i].price));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  return Math.sqrt(
    returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length,
  );
}
export function getTrendDirection(q: MetalQuote): "up" | "down" | "flat" {
  return q.changePct !== null && q.changePct > 0.5
    ? "up"
    : q.changePct !== null && q.changePct < -0.5
      ? "down"
      : "flat";
}
export function filterByCategory(
  metals: Metal[],
  category: MetalCategoryId | "all",
): Metal[] {
  return category === "all"
    ? metals
    : metals.filter((m) => m.categoryId === category);
}
