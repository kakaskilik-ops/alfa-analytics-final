import type { EvidenceFact, AnalystDraft } from "../../../shared/aiReport.ts";
import type { MarketAnalytics } from "../../../shared/marketCalculations.ts";
export function stableAnalytics(a: MarketAnalytics): unknown {
  return JSON.parse(
    JSON.stringify(a, (k, v) =>
      ["receivedAt", "retrieved_at"].includes(k) ? undefined : v,
    ),
  );
}
export function buildAnalysisPacket(a: MarketAnalytics, facts: EvidenceFact[]) {
  const sourceMap = new Map<string, string>(),
    sources: Record<string, unknown> = {};
  const source = (f: EvidenceFact) => {
    const k = JSON.stringify([f.source, f.url, f.specification]);
    if (!sourceMap.has(k)) {
      const id = "S" + (sourceMap.size + 1);
      sourceMap.set(k, id);
      sources[id] = {
        name: f.source,
        url: f.url,
        specification: f.specification,
      };
    }
    return sourceMap.get(k)!;
  };
  const byPoint = (metal: string, month: string, spec: string) =>
    facts.find(
      (f) =>
        f.kind === "monthly_price" &&
        f.metalId === metal &&
        f.periodStart === month &&
        f.specification === spec,
    )?.id;
  const series = a.prices.map((s) => ({
    metal: s.metalId,
    region: s.region,
    source: source(
      facts.find(
        (f) =>
          f.kind === "monthly_price" &&
          f.metalId === s.metalId &&
          f.specification === s.specification,
      )!,
    ),
    columns: ["factId", "month", "USD_per_t", "MoM_USD_per_t", "MoM_pct"],
    current: s.current.map((p) => [
      byPoint(s.metalId, p.month, s.specification),
      p.month.slice(0, 7),
      p.price,
      p.delta,
      p.pct,
    ]),
    previous: s.previous.map((p) => [
      byPoint(s.metalId, p.month, s.specification),
      p.month.slice(0, 7),
      p.price,
    ]),
    metrics: s.currentMetrics,
    previousMetrics: s.previousMetrics,
    limits: s.limitations,
  }));
  const metricFacts = facts
    .filter((f) => f.kind === "derived_metric")
    .map((f) => ({
      id: f.id,
      metal: f.metalId,
      key: f.metricKey,
      value: f.value,
      unit: f.unit,
    }));
  const trade = facts
    .filter(
      (f) =>
        f.kind === "trade" || f.kind === "production" || f.kind === "reserves",
    )
    .map((f) => [
      f.id,
      f.metalId,
      a.trade.find(
        (t) =>
          t.metal_id === f.metalId &&
          t.period_year === Number(f.periodStart.slice(0, 4)) &&
          t.source_url === f.url &&
          f.label.includes(t.metric) &&
          f.label.endsWith(t.country),
      )?.metric ?? f.kind,
      f.kind === "trade"
        ? a.trade.find(
            (t) =>
              t.metal_id === f.metalId &&
              t.period_year === Number(f.periodStart.slice(0, 4)) &&
              t.source_url === f.url &&
              f.label.includes(t.metric) &&
              f.label.endsWith(t.country),
          )?.country_code
        : f.label,
      Number(f.periodStart.slice(0, 4)),
      f.value,
      f.unit,
      f.withinPeriod ? "current" : "background",
      source(f),
      a.trade.find(
        (t) =>
          t.metal_id === f.metalId &&
          t.period_year === Number(f.periodStart.slice(0, 4)) &&
          t.source_url === f.url &&
          f.label.includes(t.metric) &&
          f.label.endsWith(t.country),
      )?.commodity_code ?? f.specification,
    ]);
  const news = a.news.map((n) => ({
    fact: facts.find((f) => f.kind === "news" && f.url === n.url)?.id,
    date: n.date,
    title: n.title,
    excerpt: n.excerpt.slice(0, 240),
    scope: n.scope,
    url: n.url,
  }));
  const other = facts
    .filter((f) => f.kind === "fx" || f.kind === "regional_quote")
    .map((f) => [f.id, f.label, f.value, f.unit, f.periodStart, source(f)]);
  const packet = {
    version: 3,
    window: a.window,
    metals: a.metals,
    series,
    metricFacts,
    metricFormulas: Object.fromEntries(
      facts
        .filter((f) => f.kind === "derived_metric")
        .map((f) => [f.metricKey, f.formula]),
    ),
    tradeColumns: [
      "factId",
      "metal",
      "metric",
      "countryCodeOrLabel",
      "year",
      "value",
      "unit",
      "relation",
      "source",
      "commodityCode",
    ],
    trade,
    news,
    other,
    scenarioAnchors: a.prices.map((s) => ({
      metal: s.metalId,
      growth: metricFacts.find((f) => f.metal === s.metalId && f.key === "max")
        ?.id,
      decline: metricFacts.find((f) => f.metal === s.metalId && f.key === "min")
        ?.id,
      stable: metricFacts.find((f) => f.metal === s.metalId && f.key === "q25")
        ?.id,
    })),
    tradeComparability: {
      years: [...new Set(a.trade.map((t) => t.period_year))],
      hasComparableYearPairs: a.trade.some((t) => t.comparisonYear !== null),
      countryCoverage: [...new Set(a.trade.map((t) => t.country))],
      withinRequestedWindow: a.trade.filter((t) => t.relation === "current")
        .length,
      warning:
        "Сравнивать страны между собой нельзя как динамику во времени. Без двух лет одного кода/страны/показателя рост или снижение торговли не установлены. Эта выборка не подтверждает мировое лидерство страны.",
    },
    newsCausality: {
      metalSpecific: a.news.filter((n) => n.scope === "metal").length,
      warning:
        "Заголовки/анонсы не доказывают расширение мощностей или изменение предложения выбранного металла; причинный эффект на цену не измерен.",
    },
    limits: a.limitations,
    sources,
    coverage: a.coverage,
  };
  if (new TextEncoder().encode(JSON.stringify(packet)).length <= 16000)
    return packet;
  // Broad reports retain EVERY observation. Deduplicate metadata rather than sample financial rows.
  const blocks = new Map<
    string,
    {
      metal: string;
      country: string;
      year: number;
      source: string;
      product: string;
      relation: string;
      values: unknown[][];
    }
  >();
  const tradeMetricTypes: Record<string, { metric: string; unit: string }> = {};
  for (const row of trade) {
    const [
      id,
      metal,
      metric,
      country,
      year,
      value,
      unit,
      relation,
      sourceId,
      product,
    ] = row;
    const sourceName = (sources[String(sourceId)] as { name: string }).name;
    const commonSource = Object.entries(sources).find(
      ([, s]) => (s as { name: string }).name === sourceName,
    )![0];
    const key = JSON.stringify([metal, country, year, commonSource, product]);
    const typeKey =
      Object.keys(tradeMetricTypes).find(
        (k) =>
          tradeMetricTypes[k].metric === metric &&
          tradeMetricTypes[k].unit === unit,
      ) ?? "T" + Object.keys(tradeMetricTypes).length;
    tradeMetricTypes[typeKey] = { metric: String(metric), unit: String(unit) };
    if (!blocks.has(key))
      blocks.set(key, {
        metal: String(metal),
        country: String(country),
        year: Number(year),
        source: commonSource,
        product: String(product),
        relation: String(relation),
        values: [],
      });
    blocks
      .get(key)!
      .values.push([
        id,
        typeKey,
        value,
        facts
          .find((f) => f.id === id)
          ?.specification.includes("оценка источника") ?? false,
      ]);
  }
  const usedSources = new Set([
    ...series.map((s) => s.source),
    ...[...blocks.values()].map((b) => b.source),
    ...other.map((row) => String(row[5])),
  ]);
  return {
    ...packet,
    news: news.map((n) => ({ ...n, excerpt: n.excerpt.slice(0, 80) })),
    series: series.map((s) => ({
      ...s,
      columns: undefined,
      specification: (sources[s.source] as { specification: string })
        .specification,
      metrics: { n: s.metrics.n, returnCount: s.metrics.returnCount },
      previousMetrics: {
        n: s.previousMetrics.n,
        mean: s.previousMetrics.mean,
        monthlyVolatilityPct: s.previousMetrics.monthlyVolatilityPct,
        returnCount: s.previousMetrics.returnCount,
      },
      limits: undefined,
    })),
    seriesColumns: series[0]?.columns,
    metricFacts: metricFacts.map((f) => [
      f.id,
      f.metal,
      f.key,
      f.value,
      f.unit,
    ]),
    metricFactColumns: ["id", "metal", "key", "value", "unit"],
    trade: [...blocks.values()],
    tradeColumns: ["factId", "metricType", "value", "estimated"],
    tradeMetricTypes,
    tradeProducts: Object.fromEntries(
      a.trade.map((t) => [
        t.commodity_code,
        { specification: t.product_description },
      ]),
    ),
    sources: Object.fromEntries(
      Object.entries(sources)
        .filter(([id]) => usedSources.has(id))
        .map(([id, s]) => [id, { name: (s as { name: string }).name }]),
    ),
    tradeComparability: { ...packet.tradeComparability, warning: undefined },
    newsCausality: { ...packet.newsCausality, warning: undefined },
    scenarioAnchors: undefined,
    limits: {
      noMonthlyPrices: a.metals
        .filter((m) => !a.prices.some((p) => p.metalId === m.id))
        .map((m) => m.id),
      noFullWindowAnnualTrade: a.metals
        .filter(
          (m) =>
            !a.trade.some(
              (t) => t.metal_id === m.id && t.relation === "current",
            ),
        )
        .map((m) => m.id),
      causalBalanceMissing: true,
      newsSelected: a.coverage.selectedNews,
      newsCandidates: a.coverage.newsCandidates,
      monthlyGaps: a.prices.map((s) => [
        s.metalId,
        s.currentMetrics.missingMonths,
        s.previousMetrics.missingMonths,
      ]),
    },
  };
}
export function validateProfessionalDraft(
  d: AnalystDraft,
  facts: EvidenceFact[],
  a: MarketAnalytics,
) {
  if (d.summary.length < 80 || d.conclusion.length < 100)
    throw Error("superficial_report");
  for (const section of ["dynamics", "trade", "factors"])
    if (
      !d.interpretations.some(
        (x) => x.section === section && x.text.length >= 60,
      )
    )
      throw Error("missing_analysis_section");
  const all = [
    d.summary,
    d.conclusion,
    ...d.interpretations.map((x) => x.text),
    ...d.risks,
    ...d.scenarios.flatMap((s) => [s.condition, s.description]),
  ];
  if (
    all.some((x) =>
      /без указания конкретных чисел|продолжить наблюдение|необходимо следить|рекомендуется следить|Германия остаётся ключевым|крупнейш|ведущ[а-я]* экономик|миров[а-я]* лидер|лидирует/iu.test(
        x,
      ),
    )
  )
    throw Error("unsupported_or_generic_claim");
  const unsupportedTrade = !a.trade.some((t) => t.comparisonYear !== null);
  if (unsupportedTrade) {
    for (const paragraph of [
      d.summary,
      d.conclusion,
      ...d.interpretations
        .filter((x) => x.section === "trade")
        .map((x) => x.text),
    ])
      for (const sentence of paragraph.split(/[.!?;]/)) {
        if (
          /(?:рост|увеличени|снижени|сокращени|изменени).{0,65}(?:торгов|импорт|экспорт|объ[её]м)|(?:торгов|импорт|экспорт|объ[её]м).{0,65}(?:рост|увелич|сниж|сокращ|изменени)/iu.test(
            sentence,
          ) &&
          !/(?:нельзя|невозможно|не (?:вычисл|установ|подтверж|доказ|сопостав|позвол|представля|оцени|определ|мож)|нет (?:прошл|сопостав)|отсутств)/iu.test(
            sentence,
          )
        )
          throw Error("unsupported_trade_trend");
      }
  }
  const comparable = a.prices.filter(
    (s) =>
      s.currentMetrics.monthlyVolatilityPct !== null &&
      s.previousMetrics.monthlyVolatilityPct !== null,
  );
  const prose = [
    d.summary,
    d.conclusion,
    ...d.interpretations.map((x) => x.text),
  ].join(" ");
  if (
    /(?:рост|увеличен).{0,20}волатильн|волатильн.{0,30}(?:вырос|увелич)/iu.test(
      prose,
    ) &&
    (!comparable.length ||
      comparable.some(
        (s) =>
          s.currentMetrics.monthlyVolatilityPct! <=
          s.previousMetrics.monthlyVolatilityPct!,
      ))
  )
    throw Error("unsupported_volatility_increase");
  if (
    d.scenarios.some((s) =>
      /привед[её]т|гарантир|обеспечит|ожидается/iu.test(s.description),
    )
  )
    throw Error("unjustified_prediction");
  const normalized = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}]+/gu, " ")
      .trim();
  if (
    new Set(d.scenarios.map((s) => normalized(s.condition))).size !==
      d.scenarios.length ||
    new Set(d.scenarios.map((s) => normalized(s.description))).size !==
      d.scenarios.length
  )
    throw Error("repeated_scenarios");
  for (const s of d.scenarios) {
    if (
      s.condition.length < 40 ||
      s.description.length < 40 ||
      !s.factIds?.length
    )
      throw Error("unanchored_scenario");
    if (
      !/(?:месяч|средн|максим|миним|импорт|экспорт|объём|объем|производ|запас|курс|котиров|волатиль)/iu.test(
        s.condition,
      )
    )
      throw Error("unobservable_scenario");
  }
  for (const scenario of d.scenarios) {
    if (!/нов[а-я]*|следующ|будущ/iu.test(scenario.condition))
      throw Error("scenario_is_not_future_conditional");
    const key = { growth: "max", decline: "min", stable: "q25" }[
      scenario.direction
    ];
    const anchors = facts.filter(
      (f) => f.kind === "derived_metric" && f.metricKey === key,
    );
    if (
      anchors.length &&
      !scenario.factIds?.some((id) => anchors.some((f) => f.id === id))
    )
      throw Error("wrong_scenario_anchor");
  }
  if (all.some((x) => /в разделе (?:dynamics|trade|factors)/iu.test(x)))
    throw Error("implementation_language_in_report");
  if (a.prices.length) {
    const priceIds = new Set(
      facts
        .filter(
          (f) => f.kind === "monthly_price" || f.kind === "derived_metric",
        )
        .map((f) => f.id),
    );
    if (
      !d.interpretations.some(
        (x) =>
          x.section === "dynamics" && x.factIds.some((id) => priceIds.has(id)),
      )
    )
      throw Error("ungrounded_price_analysis");
  }
  const tradeIds = new Set(
    facts.filter((f) => f.kind === "trade").map((f) => f.id),
  );
  if (
    tradeIds.size &&
    !d.interpretations.some(
      (x) => x.section === "trade" && x.factIds.some((id) => tradeIds.has(id)),
    )
  )
    throw Error("ungrounded_trade_analysis");
}
