import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import type { EvidenceFact } from "../../../shared/aiReport.ts";
import {
  resolveAnalysisWindow,
  monthEnd,
} from "../../../shared/analysisWindow.ts";
import {
  buildPriceSeries,
  normalizeTrade,
  type MarketAnalytics,
  type MonthlyInput,
  type TradeInput,
  type NewsContext,
} from "../../../shared/marketCalculations.ts";
import { type AiInput, chooseMetalIds } from "./analysis.ts";
import { METAL_IDS } from "./universe.ts";
function publicUrl(value: unknown): string | null {
  try {
    const u = new URL(String(value));
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      ![...u.searchParams.keys()].some((k) =>
        /api.?key|token|secret|password|signature/i.test(k),
      )
      ? u.href
      : null;
  } catch {
    return null;
  }
}
// A limit is not a sample: page every bounded financial row, and fail closed if the safety ceiling is reached.
type PageQuery<T> = {
  range: (
    a: number,
    b: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>;
};
async function readAll<T>(query: () => PageQuery<T>, max = 5000): Promise<T[]> {
  let rows: T[] = [];
  for (let offset = 0; offset < max; offset += 500) {
    const { data, error } = await query().range(offset, offset + 499);
    if (error) throw Error("evidence_unavailable");
    rows = rows.concat(data ?? []);
    if (!data || data.length < 500) return rows;
  }
  throw Error("evidence_range_too_large");
}
export async function buildMarketEvidence(
  db: SupabaseClient,
  input: AiInput,
  now = Date.now(),
) {
  const window = resolveAnalysisWindow(
    {
      ...input,
      startDate: input.period === "custom" ? input.startDate : undefined,
      endDate: input.period === "custom" ? input.endDate : undefined,
    },
    now,
  );
  const { data: catalog, error } = await db
    .from("metals")
    .select("id,name_ru,symbol,aliases")
    .in("id", [...METAL_IDS]);
  if (error) throw Error("evidence_unavailable");
  const ids = chooseMetalIds(input, catalog ?? []),
    name = (id: string) => catalog?.find((m) => m.id === id)?.name_ru ?? id;
  const monthStart = window.previous.start.slice(0, 7) + "-01",
    queryStart = monthStart,
    end = window.requested.end,
    maxTradeYear = Number(end.slice(0, 4)) - (end.slice(5) < "12-31" ? 1 : 0);
  const newsBase = () => {
    const q = db
      .from("news_articles")
      .select(
        "id,original_title,title_ru,excerpt,scope,metal_ids,regions,published_at,retrieved_at,canonical_url,source_id",
      )
      .eq("is_public", true)
      .lte("published_at", end + "T23:59:59.999Z");
    return input.newsId
      ? q.eq("id", input.newsId)
      : q
          .or(`scope.eq.sector,metal_ids.ov.{${ids.join(",")}}`)
          .gte("published_at", window.requested.start + "T00:00:00Z");
  };
  const [rawPrices, rawTrade, newsResult, fxResult, quotesResult] =
    await Promise.all([
      readAll<MonthlyInput>(() =>
        db
          .from("reference_price_observations")
          .select(
            "metal_id,source_id,period_start,price,currency,unit,region,specification,retrieved_at",
          )
          .in("metal_id", ids)
          .eq("source_id", "world-bank-pink-sheet")
          .gte("period_start", queryStart)
          .lte("period_start", end)
          .order("period_start", { ascending: true })
          .order("id", { ascending: true }),
      ),
      readAll<TradeInput>(() =>
        db
          .from("market_statistics")
          .select(
            "metal_id,metric,value,unit,period_year,country,country_code,region,commodity_code,product_description,estimated,source_url,retrieved_at,source_id",
          )
          .in("metal_id", ids)
          .gte("period_year", Number(window.previous.start.slice(0, 4)) - 1)
          .lte("period_year", maxTradeYear)
          .order("id", { ascending: true }),
      ),
      newsBase().order("published_at", { ascending: false }).limit(201),
      db
        .from("fx_observations")
        .select("base_currency,quote_currency,rate,rate_date,retrieved_at")
        .eq("source_id", "frankfurter-v2")
        .gte("rate_date", new Date(now - 4 * 86400000).toISOString())
        .lte("rate_date", new Date(now).toISOString())
        .order("rate_date", { ascending: false })
        .limit(60),
      db
        .from("price_quotations")
        .select(
          "metal_id,normalized_price,normalized_currency,normalized_unit,region,country,grade,product_form,purity,element_content,delivery_terms,source_id,source_url,quoted_at,retrieved_at,price_type",
        )
        .in("metal_id", ids)
        .eq("validation_status", "valid")
        .eq("data_status", "live")
        .gte("quality_score", 0.7)
        .gte("quoted_at", new Date(now - 4 * 86400000).toISOString())
        .lte("quoted_at", new Date(now).toISOString())
        .order("quoted_at", { ascending: false })
        .limit(26),
    ]);
  if (newsResult.error || fxResult.error || quotesResult.error)
    throw Error("evidence_unavailable");
  const prices = buildPriceSeries(
      rawPrices.filter((r) => ids.includes(r.metal_id)) as MonthlyInput[],
      window,
      now,
    ),
    trade = normalizeTrade(
      rawTrade.filter(
        (r) =>
          ids.includes(r.metal_id) &&
          (!input.region || r.region === input.region) &&
          r.period_year < new Date(now).getUTCFullYear() &&
          r.period_year <= maxTradeYear &&
          r.period_year >= Number(window.previous.start.slice(0, 4)) - 1 &&
          Number.isFinite(Date.parse(r.retrieved_at)) &&
          Date.parse(r.retrieved_at) <= now &&
          publicUrl(r.source_url),
      ) as TradeInput[],
      window,
    );
  const newsCandidates = (newsResult.data ?? []).filter(
    (n) =>
      publicUrl(n.canonical_url) &&
      Date.parse(n.published_at) <=
        Math.min(now, Date.parse(end + "T23:59:59.999Z")) &&
      (!input.newsId
        ? n.published_at >= window.requested.start + "T00:00:00Z"
        : true) &&
      Date.parse(n.retrieved_at) <= now &&
      (!input.newsId || n.id === input.newsId) &&
      (!input.region || !n.regions || n.regions.includes(input.region)),
  );
  const ranked = [...newsCandidates].sort(
    (a, b) =>
      Number(b.metal_ids?.some((id: string) => ids.includes(id))) -
        Number(a.metal_ids?.some((id: string) => ids.includes(id))) ||
      b.published_at.localeCompare(a.published_at),
  );
  const news: NewsContext[] = ranked.slice(0, 12).map((n) => ({
    id: n.id,
    title: String(n.title_ru ?? n.original_title).slice(0, 400),
    excerpt: String(n.excerpt ?? "").slice(0, 400),
    date: n.published_at,
    url: n.canonical_url,
    source: n.source_id,
    metalIds: n.metal_ids ?? [],
    scope: n.metal_ids?.some((id: string) => ids.includes(id))
      ? "metal"
      : "sector",
    receivedAt: n.retrieved_at,
  }));
  const limitations: string[] = [];
  for (const id of ids) {
    if (!prices.some((s) => s.metalId === id))
      limitations.push(
        `${name(id)}: нет сопоставимого месячного ценового ряда в двух выбранных окнах.`,
      );
    if (!trade.some((r) => r.metal_id === id && r.relation === "current"))
      limitations.push(
        `${name(id)}: нет годовой торговли, полностью покрывающей выбранный диапазон; доступные календарные годы отделены как фон.`,
      );
  }
  if (!news.some((n) => n.scope === "metal"))
    limitations.push(
      "Прямые новости об выбранных металлах за период отсутствуют; отраслевые новости не доказывают причины их ценовой динамики.",
    );
  if (newsCandidates.length > news.length)
    limitations.push(
      `В контексте ${news.length} наиболее релевантных публикаций из ${newsCandidates.length}${newsCandidates.length > 200 ? "+" : ""}; это не исчерпывающий обзор новостей.`,
    );
  limitations.push(
    "Подтверждённого причинного анализа изменений цен, полного мирового баланса спроса/предложения и актуальных рядов производства/запасов нет.",
  );
  const analytics: MarketAnalytics = {
    version: 3,
    window,
    metals: ids.map((id) => ({ id, name: name(id) })),
    prices,
    trade,
    news,
    limitations,
    coverage: {
      monthlyRows: rawPrices.length,
      currentPoints: prices.reduce((n, s) => n + s.current.length, 0),
      previousPoints: prices.reduce((n, s) => n + s.previous.length, 0),
      tradeRows: trade.length,
      newsCandidates: newsCandidates.length,
      selectedNews: news.length,
    },
  };
  const facts: EvidenceFact[] = [];
  const add = (
    f: Omit<EvidenceFact, "id" | "withinPeriod">,
    withinPeriod?: boolean,
  ) => {
    if (
      !publicUrl(f.url) ||
      !Number.isFinite(Date.parse(f.receivedAt)) ||
      Date.parse(f.receivedAt) > now
    )
      return;
    facts.push({
      ...f,
      id: "F" + (facts.length + 1),
      withinPeriod:
        withinPeriod ??
        (f.periodStart >= window.requested.start &&
          f.periodEnd <= window.requested.end),
    });
  };
  for (const s of prices) {
    for (const [scope, points] of [
      ["current", s.current],
      ["previous", s.previous],
    ] as const)
      for (const p of points)
        add(
          {
            metalId: s.metalId,
            kind: "monthly_price",
            label: `${name(s.metalId)} — месячное среднее ${scope === "current" ? "текущего" : "предыдущего"} окна`,
            value: p.price,
            unit: s.unit,
            periodStart: p.month,
            periodEnd: monthEnd(p.month),
            receivedAt: p.receivedAt,
            region: s.region,
            specification: s.specification,
            source: s.source,
            url: s.url,
          },
          scope === "current",
        );
  }
  for (const s of prices) {
    const basis = facts.filter(
        (f) =>
          f.metalId === s.metalId &&
          f.kind === "monthly_price" &&
          f.specification === s.specification,
      ),
      receivedAt = [...s.current, ...s.previous]
        .map((p) => p.receivedAt)
        .sort()
        .at(-1);
    if (!receivedAt) continue;
    const values: [string, string, number | null, string, string][] = [
      [
        "change",
        "Изменение от первого до последнего месячного среднего",
        s.currentMetrics.change,
        "USD/т",
        "last-first",
      ],
      [
        "changePct",
        "Изменение от первого до последнего месячного среднего",
        s.currentMetrics.changePct,
        "%",
        "(last/first-1)*100",
      ],
      [
        "min",
        "Минимальное месячное среднее окна",
        s.currentMetrics.min,
        "USD/т",
        "min(current)",
      ],
      [
        "max",
        "Максимальное месячное среднее окна",
        s.currentMetrics.max,
        "USD/т",
        "max(current)",
      ],
      [
        "mean",
        "Арифметическое среднее месячных средних",
        s.currentMetrics.mean,
        "USD/т",
        "sum(current)/count(current)",
      ],
      [
        "previousMean",
        "Среднее предыдущего сопоставимого окна",
        s.previousMetrics.mean,
        "USD/т",
        "sum(previous)/count(previous)",
      ],
      [
        "meanChange",
        "Изменение среднего относительно прошлого окна",
        s.meanChange,
        "USD/т",
        "mean(current)-mean(previous)",
      ],
      [
        "meanChangePct",
        "Изменение среднего относительно прошлого окна",
        s.meanChangePct,
        "%",
        "(mean(current)/mean(previous)-1)*100",
      ],
      [
        "endpointChange",
        "Разница последних наблюдений двух окон",
        s.endpointChange,
        "USD/т",
        "last(current)-last(previous)",
      ],
      [
        "endpointChangePct",
        "Разница последних наблюдений двух окон",
        s.endpointChangePct,
        "%",
        "(last(current)/last(previous)-1)*100",
      ],
      [
        "monthlyVolatilityPct",
        "Выборочное стандартное отклонение месячных лог-доходностей",
        s.currentMetrics.monthlyVolatilityPct,
        "%",
        "sampleStd(log(p[t]/p[t-1]))*100; only consecutive months; at least 6 returns",
      ],
    ];
    values.push(
      [
        "q25",
        "Нижний квартиль месячных средних",
        s.currentMetrics.q25,
        "USD/т",
        "linear quantile (n-1)*0.25",
      ],
      [
        "median",
        "Медиана месячных средних",
        s.currentMetrics.median,
        "USD/т",
        "linear quantile (n-1)*0.5",
      ],
      [
        "q75",
        "Верхний квартиль месячных средних",
        s.currentMetrics.q75,
        "USD/т",
        "linear quantile (n-1)*0.75",
      ],
    );
    for (const [metricKey, label, value, unit, formula] of values)
      if (value !== null && Number.isFinite(value))
        add(
          {
            metalId: s.metalId,
            kind: "derived_metric",
            metricKey,
            label: name(s.metalId) + " — " + label,
            value,
            unit,
            periodStart: window.requested.start,
            periodEnd: window.requested.end,
            receivedAt,
            region: s.region,
            specification: s.specification,
            source: s.source,
            url: s.url,
            basisIds: basis.map((f) => f.id),
            formula,
          },
          true,
        );
  }
  for (const r of trade)
    add(
      {
        metalId: r.metal_id,
        kind:
          r.metric === "mine_production"
            ? "production"
            : r.metric === "reserves"
              ? "reserves"
              : "trade",
        label: `${name(r.metal_id)} — ${r.metric}: ${r.country}`,
        value: r.value,
        unit: r.unit,
        periodStart: r.period_year + "-01-01",
        periodEnd: r.period_year + "-12-31",
        receivedAt: r.retrieved_at,
        region: r.country,
        specification: `${r.product_description}; ${r.commodity_code}; ${r.estimated ? "оценка источника; " : ""}годовой показатель, не рыночная котировка`,
        source: r.source_id,
        url: r.source_url,
      },
      r.relation === "current",
    );
  for (const n of news)
    add({
      metalId: n.metalIds.find((id) => ids.includes(id)) ?? null,
      kind: "news",
      label:
        n.scope === "metal"
          ? "Новость выбранного металла"
          : "Отраслевой контекст, не доказанная причина",
      value: n.title,
      unit: "",
      periodStart: n.date,
      periodEnd: n.date,
      receivedAt: n.receivedAt,
      region: "Глобальный контекст",
      specification:
        "Только заголовок и RSS-анонс; полный текст не прочитан, причинная связь с ценой не установлена.",
      source: n.source,
      url: n.url,
    });
  const seen = new Set<string>();
  for (const r of fxResult.data ?? []) {
    const pair = r.base_currency + "/" + r.quote_currency;
    if (
      !["USD/RUB", "EUR/RUB", "CNY/RUB", "USD/CNY", "EUR/USD"].includes(pair) ||
      seen.has(pair) ||
      !(Number(r.rate) > 0)
    )
      continue;
    seen.add(pair);
    add({
      metalId: null,
      kind: "fx",
      label: "Справочный курс " + pair,
      value: Number(r.rate),
      unit: r.quote_currency + " за " + r.base_currency,
      periodStart: r.rate_date,
      periodEnd: r.rate_date,
      receivedAt: r.retrieved_at,
      region: "Международный",
      specification:
        "Последний справочный курс; не история валют за выбранный период и не доказанная причина динамики.",
      source: "Frankfurter v2",
      url: "https://frankfurter.dev/",
    });
  }
  for (const q of quotesResult.data ?? []) {
    if (
      !publicUrl(q.source_url) ||
      q.normalized_currency !== "USD" ||
      q.normalized_unit !== "kg" ||
      !q.delivery_terms ||
      (q.purity == null && q.element_content == null) ||
      (input.region && q.region !== input.region) ||
      (q.region === "Азия" && !q.country) ||
      !(Number(q.normalized_price) > 0)
    )
      continue;
    add({
      metalId: q.metal_id,
      kind: "regional_quote",
      label: name(q.metal_id) + " — отдельная региональная котировка",
      value: Number(q.normalized_price),
      unit: "USD/кг",
      periodStart: q.quoted_at,
      periodEnd: q.quoted_at,
      receivedAt: q.retrieved_at,
      region: q.country ?? q.region,
      specification: JSON.stringify([
        q.grade,
        q.product_form,
        q.purity,
        q.element_content,
        q.delivery_terms,
        q.price_type,
      ]),
      source: q.source_id,
      url: q.source_url,
    });
  }
  return {
    facts,
    analytics,
    metalIds: ids,
    start: window.requested.start + "T00:00:00Z",
    end: window.requested.end + "T23:59:59.999Z",
    coverage: ids.map((id) => ({
      id,
      name: name(id),
      kinds: [
        ...new Set(facts.filter((f) => f.metalId === id).map((f) => f.kind)),
      ],
    })),
  };
}
export async function evidenceFingerprint(
  facts: EvidenceFact[],
  extra: unknown = [],
) {
  const value = JSON.stringify([
    "verified-evidence-v1",
    facts.map(({ receivedAt: _, ...f }) => f),
    extra,
  ]);
  const d = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(d)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
