import {
  type AnalysisWindow,
  type DateSpan,
  expectedMonths,
  monthEnd,
  parseDate,
  shiftMonths,
} from "./analysisWindow.ts";
export interface MonthlyInput {
  metal_id: string;
  source_id?: string;
  period_start: string;
  price: number | string;
  currency: string;
  unit: string;
  region: string;
  specification: string;
  retrieved_at: string;
}
export interface PricePoint {
  month: string;
  price: number;
  receivedAt: string;
  delta: number | null;
  pct: number | null;
}
export interface PriceMetrics {
  n: number;
  first: number | null;
  last: number | null;
  change: number | null;
  changePct: number | null;
  min: number | null;
  max: number | null;
  minMonths: string[];
  maxMonths: string[];
  mean: number | null;
  q25: number | null;
  median: number | null;
  q75: number | null;
  monthlyVolatilityPct: number | null;
  returnCount: number;
  missingMonths: string[];
}
export interface PriceSeries {
  metalId: string;
  source: string;
  url: string;
  specification: string;
  currency: "USD";
  unit: "USD/т";
  region: string;
  current: PricePoint[];
  previous: PricePoint[];
  currentMetrics: PriceMetrics;
  previousMetrics: PriceMetrics;
  meanChange: number | null;
  meanChangePct: number | null;
  endpointChange: number | null;
  endpointChangePct: number | null;
  limitations: string[];
}
export interface TradeInput {
  metal_id: string;
  metric: string;
  value: number | string;
  unit: string;
  period_year: number;
  country: string;
  country_code: string;
  region: string;
  commodity_code: string;
  product_description: string;
  estimated: boolean;
  source_url: string;
  retrieved_at: string;
  source_id: string;
}
export interface TradePoint extends Omit<TradeInput, "value"> {
  value: number;
  relation: "current" | "previous" | "background";
  change: number | null;
  changePct: number | null;
  comparisonYear: number | null;
}
export interface NewsContext {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  url: string;
  source: string;
  metalIds: string[];
  scope: "metal" | "sector";
  receivedAt: string;
}
export interface MarketAnalytics {
  version: 3;
  window: AnalysisWindow;
  metals: { id: string; name: string }[];
  prices: PriceSeries[];
  trade: TradePoint[];
  news: NewsContext[];
  limitations: string[];
  coverage: {
    monthlyRows: number;
    currentPoints: number;
    previousPoints: number;
    tradeRows: number;
    newsCandidates: number;
    selectedNews: number;
  };
}
const url = "https://www.worldbank.org/en/research/commodity-markets";
export function change(last: number, first: number) {
  return {
    absolute: last - first,
    pct: first !== 0 ? (last / first - 1) * 100 : null,
  };
}
export function quantile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    i = (sorted.length - 1) * p,
    k = Math.floor(i);
  return (
    sorted[k] +
    (sorted[Math.min(k + 1, sorted.length - 1)] - sorted[k]) * (i - k)
  );
}
export function priceMetrics(
  points: PricePoint[],
  span: DateSpan,
  completedThrough = span.end,
): PriceMetrics {
  const values = points.map((p) => p.price),
    first = points[0]?.price ?? null,
    last = points[points.length - 1]?.price ?? null,
    returns = points.flatMap((p, i) =>
      i > 0 && shiftMonths(points[i - 1].month, 1) === p.month
        ? [Math.log(p.price / points[i - 1].price)]
        : [],
    );
  const rmean = returns.length
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : 0,
    vol =
      returns.length >= 6
        ? Math.sqrt(
            returns.reduce((s, x) => s + (x - rmean) ** 2, 0) /
              (returns.length - 1),
          ) * 100
        : null;
  const min = values.length ? Math.min(...values) : null,
    max = values.length ? Math.max(...values) : null;
  return {
    n: points.length,
    first,
    last,
    change: points.length >= 2 ? last! - first! : null,
    changePct: points.length >= 2 ? (last! / first! - 1) * 100 : null,
    min,
    max,
    minMonths: points.filter((p) => p.price === min).map((p) => p.month),
    maxMonths: points.filter((p) => p.price === max).map((p) => p.month),
    q25: quantile(values, 0.25),
    median: quantile(values, 0.5),
    q75: quantile(values, 0.75),
    mean: values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null,
    monthlyVolatilityPct: vol,
    returnCount: returns.length,
    missingMonths: expectedMonths({
      ...span,
      end: span.end < completedThrough ? span.end : completedThrough,
    }).filter((m) => !points.some((p) => p.month === m)),
  };
}
export function buildPriceSeries(
  rows: MonthlyInput[],
  window: AnalysisWindow,
  now = Date.now(),
): PriceSeries[] {
  const groups = new Map<string, MonthlyInput[]>();
  for (const r of rows) {
    if (
      (r.source_id !== undefined && r.source_id !== "world-bank-pink-sheet") ||
      r.currency !== "USD" ||
      r.unit !== "ton" ||
      r.region !== "Мировой ориентир (LME)" ||
      !/^\d{4}-\d{2}-01$/.test(r.period_start) ||
      !(Number(r.price) > 0) ||
      !Number.isFinite(Number(r.price)) ||
      !Number.isFinite(Date.parse(r.retrieved_at)) ||
      Date.parse(r.retrieved_at) > now
    )
      continue;
    try {
      if (parseDate(shiftMonths(r.period_start, 1)) > now) continue;
    } catch {
      continue;
    }
    const key = JSON.stringify([
      r.metal_id,
      r.source_id ?? "world-bank-pink-sheet",
      r.specification,
      r.region,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()]
    .map((group): PriceSeries => {
      const latest = new Map<string, MonthlyInput>(),
        conflicts = new Set<string>();
      for (const r of group) {
        const old = latest.get(r.period_start);
        if (!old || Date.parse(r.retrieved_at) > Date.parse(old.retrieved_at)) {
          latest.set(r.period_start, r);
          conflicts.delete(r.period_start);
        } else if (
          Date.parse(r.retrieved_at) === Date.parse(old.retrieved_at) &&
          Number(r.price) !== Number(old.price)
        )
          conflicts.add(r.period_start);
      }
      const ordered = [...latest.values()]
        .filter((r) => !conflicts.has(r.period_start))
        .sort((a, b) => a.period_start.localeCompare(b.period_start));
      const points: PricePoint[] = ordered.map((r) => {
        const prev = latest.get(shiftMonths(r.period_start, -1)),
          c =
            prev && !conflicts.has(prev.period_start)
              ? change(Number(r.price), Number(prev.price))
              : null;
        return {
          month: r.period_start,
          price: Number(r.price),
          receivedAt: r.retrieved_at,
          delta: c?.absolute ?? null,
          pct: c?.pct ?? null,
        };
      });
      const inSpan = (span: DateSpan) =>
          points.filter(
            (p) =>
              monthEnd(p.month) >= span.start && monthEnd(p.month) <= span.end,
          ),
        current = inSpan(window.requested),
        previous = inSpan(window.previous),
        a = priceMetrics(current, window.requested, window.completedMonthEnd),
        b = priceMetrics(previous, window.previous, window.completedMonthEnd),
        means =
          a.mean !== null && b.mean !== null ? change(a.mean, b.mean) : null,
        ends =
          a.last !== null && b.last !== null ? change(a.last, b.last) : null;
      const limitations: string[] = [];
      if (a.n < 2)
        limitations.push(
          "В текущем окне меньше двух месячных точек: изменение между началом и концом не вычисляется.",
        );
      if (a.monthlyVolatilityPct === null)
        limitations.push(
          "Для волатильности нужны минимум шесть последовательных месячных лог-доходностей.",
        );
      if (a.missingMonths.length)
        limitations.push(
          `Нет месяцев текущего окна: ${a.missingMonths.map((m) => m.slice(0, 7)).join(", ")}.`,
        );
      if (b.missingMonths.length)
        limitations.push(
          `Нет месяцев предыдущего окна: ${b.missingMonths.map((m) => m.slice(0, 7)).join(", ")}.`,
        );
      if (conflicts.size)
        limitations.push(
          `Исключены конфликтующие версии: ${[...conflicts].join(", ")}.`,
        );
      return {
        metalId: group[0].metal_id,
        source: "World Bank Pink Sheet",
        url,
        specification: group[0].specification,
        currency: "USD",
        unit: "USD/т",
        region: group[0].region,
        current,
        previous,
        currentMetrics: a,
        previousMetrics: b,
        meanChange: means?.absolute ?? null,
        meanChangePct: means?.pct ?? null,
        endpointChange: ends?.absolute ?? null,
        endpointChangePct: ends?.pct ?? null,
        limitations,
      };
    })
    .filter((s) => s.current.length || s.previous.length);
}
export function normalizeTrade(
  rows: TradeInput[],
  window: AnalysisWindow,
): TradePoint[] {
  const latest = new Map<string, TradeInput>();
  for (const r of rows) {
    const v = Number(r.value);
    if (
      !Number.isFinite(v) ||
      v < 0 ||
      ![
        "import_value",
        "export_value",
        "import_mass",
        "export_mass",
        "mine_production",
        "reserves",
      ].includes(r.metric) ||
      !Number.isInteger(r.period_year)
    )
      continue;
    if (
      (r.metric.endsWith("_value") && r.unit !== "USD") ||
      (!r.metric.endsWith("_value") && !["kg", "ton"].includes(r.unit))
    )
      continue;
    try {
      if (new URL(r.source_url).protocol !== "https:") continue;
    } catch {
      continue;
    }
    const key = JSON.stringify([
      r.source_id,
      r.metal_id,
      r.metric,
      r.country_code,
      r.commodity_code,
      r.period_year,
      r.unit,
    ]);
    const old = latest.get(key);
    if (!old || Date.parse(r.retrieved_at) > Date.parse(old.retrieved_at))
      latest.set(key, r);
  }
  const list = [...latest.values()];
  return list
    .map((r): TradePoint => {
      const start = `${r.period_year}-01-01`,
        end = `${r.period_year}-12-31`,
        inside = (s: DateSpan) => start >= s.start && end <= s.end,
        prior = list.find(
          (p) =>
            p.period_year === r.period_year - 1 &&
            p.source_id === r.source_id &&
            p.metal_id === r.metal_id &&
            p.metric === r.metric &&
            p.country_code === r.country_code &&
            p.commodity_code === r.commodity_code &&
            p.unit === r.unit,
        ),
        c = prior ? change(Number(r.value), Number(prior.value)) : null;
      return {
        ...r,
        value: Number(r.value),
        relation: inside(window.requested)
          ? "current"
          : inside(window.previous)
            ? "previous"
            : "background",
        change: c?.absolute ?? null,
        changePct: c?.pct ?? null,
        comparisonYear: prior?.period_year ?? null,
      };
    })
    .sort(
      (a, b) =>
        a.metal_id.localeCompare(b.metal_id) ||
        b.period_year - a.period_year ||
        a.country_code.localeCompare(b.country_code) ||
        a.metric.localeCompare(b.metric),
    );
}
