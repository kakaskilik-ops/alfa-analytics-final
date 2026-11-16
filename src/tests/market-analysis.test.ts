import {
  renderVerifiedReport,
  type VerifiedReport,
} from "../../shared/aiReport";
import { it, expect } from "vitest";
import {
  buildAnalysisPacket,
  validateProfessionalDraft,
} from "../../supabase/functions/_shared/analysisPacket";
import {
  validateAnalystDraft,
  type EvidenceFact,
  type AnalystDraft,
} from "../../shared/aiReport";
import { quantitativeScenarios } from "../../shared/professionalScenarios";
import { PGlite } from "@electric-sql/pglite";
import {
  resolveAnalysisWindow,
  expectedMonths,
} from "../../shared/analysisWindow";
import {
  buildPriceSeries,
  normalizeTrade,
  type MonthlyInput,
  type TradeInput,
} from "../../shared/marketCalculations";
import {
  parseAiInput,
  chooseMetalIds,
} from "../../supabase/functions/_shared/analysis";
const now = Date.parse("2026-11-16T12:00:00Z"),
  question =
    "Проведи подробный анализ мирового рынка меди за последние 12 месяцев с расчётами, тенденциями, торговой статистикой и источниками";
const window = resolveAnalysisWindow({ question, period: "3M" }, now);
const rows: MonthlyInput[] = Array.from({ length: 24 }, (_, i) => ({
  metal_id: "copper",
  source_id: "world-bank-pink-sheet",
  period_start: new Date(Date.UTC(2024, 10 + i, 1)).toISOString().slice(0, 10),
  price: 100 + i * 10,
  currency: "USD",
  unit: "ton",
  region: "Мировой ориентир (LME)",
  specification: "TEST: Cu cathodes",
  retrieved_at: "2026-11-16T00:00:00Z",
}));
it("honours twelve months in the question over default ninety days and understands the inflected metal name", () => {
  const input = parseAiInput({ question, period: "3M" }, now);
  expect(input.period).toBe("1Y");
  expect(window.requested).toEqual({ start: "2025-11-17", end: "2026-11-16" });
  expect(window.previous).toEqual({ start: "2024-11-17", end: "2025-11-16" });
  expect(expectedMonths(window.requested)).toHaveLength(12);
  expect(
    chooseMetalIds(input, [
      { id: "copper", name_ru: "Медь", symbol: "Cu", aliases: [] },
    ]),
  ).toEqual(["copper"]);
});
it("distinguishes rolling thirty days, completed calendar quarter, leap year and explicit date range", () => {
  const thirty = resolveAnalysisWindow(
    { question: "За 30 дней", period: "1Y" },
    now,
  );
  expect(thirty.requested).toEqual({ start: "2026-10-18", end: "2026-11-16" });
  expect(thirty.previous).toEqual({ start: "2026-09-18", end: "2026-10-17" });
  const q = resolveAnalysisWindow({ question: "Проанализируй квартал" }, now);
  expect(q.requested).toEqual({ start: "2026-07-01", end: "2026-09-30" });
  expect(q.previous).toEqual({ start: "2026-04-01", end: "2026-06-30" });
  const leap = resolveAnalysisWindow(
    { question: "За последние 12 месяцев" },
    Date.parse("2024-02-29T12:00:00Z"),
  );
  expect(leap.requested.start).toBe("2023-03-01");
  const custom = resolveAnalysisWindow(
    { question: "С 2026-03-15 по 2026-06-20" },
    now,
  );
  expect(custom.period).toBe("custom");
  expect(custom.requested).toEqual({ start: "2026-03-15", end: "2026-06-20" });
  expect(() =>
    resolveAnalysisWindow({ question: "С 2026-02-30 по 2026-03-02" }, now),
  ).toThrow();
  expect(() =>
    resolveAnalysisWindow({ question: "С 2026-12-01 по 2027-01-01" }, now),
  ).toThrow();
  expect(
    resolveAnalysisWindow(
      { question: "За 30 дней" },
      Date.parse("2026-11-16T22:30:00Z"),
    ).requested.end,
  ).toBe("2026-11-17");
});
it("uses all twenty-four source points, separates MoM / window change / previous-window comparison", () => {
  const s = buildPriceSeries(rows, window, now)[0];
  expect(s.current).toHaveLength(12);
  expect(s.previous).toHaveLength(12);
  expect(s.currentMetrics).toMatchObject({
    first: 220,
    last: 330,
    change: 110,
    changePct: 50,
    min: 220,
    max: 330,
    mean: 275,
    returnCount: 11,
    missingMonths: [],
  });
  expect(s.previousMetrics.mean).toBe(155);
  expect(s.meanChange).toBe(120);
  expect(s.meanChangePct).toBeCloseTo(77.4193548387, 8);
  expect(s.endpointChangePct).toBeCloseTo(57.1428571429, 8);
  expect(s.current[0].delta).toBe(10);
  expect(s.current[0].pct).toBeCloseTo(4.7619047619, 8);
});
it("matches independent SQL aggregates and sample logarithmic-return volatility", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE TABLE source_prices(month date,price double precision)",
    );
    for (const r of rows)
      await db.query("INSERT INTO source_prices VALUES($1,$2)", [
        r.period_start,
        r.price,
      ]);
    const result = await db.query<{
      n: number;
      min: number;
      max: number;
      mean: number;
      vol: number;
      q25: number;
      q75: number;
    }>(
      `WITH current AS(SELECT * FROM source_prices WHERE month>'2025-10-31' AND month<'2026-11-01'),r AS(SELECT ln(price/lag(price) OVER(ORDER BY month)) value FROM current) SELECT (SELECT count(*)::int FROM current) n,(SELECT min(price) FROM current) min,(SELECT max(price) FROM current) max,(SELECT avg(price) FROM current) mean,(SELECT stddev_samp(value)*100 FROM r) vol,(SELECT percentile_cont(0.25) WITHIN GROUP(ORDER BY price) FROM current) q25,(SELECT percentile_cont(0.75) WITHIN GROUP(ORDER BY price) FROM current) q75`,
    );
    const s = buildPriceSeries(rows, window, now)[0],
      sql = result.rows[0];
    expect(s.currentMetrics.n).toBe(sql.n);
    expect(s.currentMetrics.mean).toBeCloseTo(sql.mean, 10);
    expect(s.currentMetrics.min).toBe(sql.min);
    expect(s.currentMetrics.max).toBe(sql.max);
    expect(s.currentMetrics.q25).toBeCloseTo(sql.q25, 10);
    expect(s.currentMetrics.q75).toBeCloseTo(sql.q75, 10);
    expect(s.currentMetrics.monthlyVolatilityPct).toBeCloseTo(sql.vol, 10);
  } finally {
    await db.close();
  }
});
it("does not manufacture zero change or volatility from one point; honours revisions and specification boundaries", () => {
  const w = resolveAnalysisWindow({ question: "За 30 дней" }, now),
    s = buildPriceSeries(rows, w, now)[0];
  expect(s.currentMetrics.n).toBe(1);
  expect(s.currentMetrics.change).toBeNull();
  expect(s.currentMetrics.monthlyVolatilityPct).toBeNull();
  const last = rows[23],
    revised = { ...last, price: 350, retrieved_at: "2026-11-16T01:00:00Z" };
  expect(
    buildPriceSeries([...rows, revised], window, now)[0].currentMetrics.last,
  ).toBe(350);
  const conflict = { ...last, price: 999 };
  expect(
    buildPriceSeries([...rows, conflict], window, now)[0].currentMetrics.n,
  ).toBe(11);
  expect(
    buildPriceSeries(
      [...rows, { ...last, specification: "OTHER GRADE", price: 2000 }],
      window,
      now,
    ),
  ).toHaveLength(2);
});
it("does not calculate return across missing months or publish an incomplete month", () => {
  const missing = rows.filter((r) => r.period_start !== "2026-05-01"),
    s = buildPriceSeries(missing, window, now)[0];
  expect(s.currentMetrics.returnCount).toBe(9);
  expect(s.currentMetrics.missingMonths).toEqual(["2026-05-01"]);
  const future = { ...rows[23], period_start: "2026-11-01", price: 999 };
  const monthEndNow = Date.parse("2026-11-30T12:00:00Z"),
    w = resolveAnalysisWindow({ question: "За 12 месяцев" }, monthEndNow);
  expect(
    buildPriceSeries([...rows, future], w, monthEndNow)[0].current.some(
      (p) => p.month === "2026-11-01",
    ),
  ).toBe(false);
});
it("compares trade only within same metric / country / product code / unit and never derives a market price", () => {
  const base: TradeInput = {
    metal_id: "copper",
    metric: "import_value",
    value: 200,
    unit: "USD",
    period_year: 2025,
    country: "Германия",
    country_code: "DEU",
    region: "Европа",
    commodity_code: "HS2022:740311",
    product_description: "TEST cathodes",
    estimated: false,
    source_url: "https://comtradeapi.un.org/test",
    retrieved_at: "2026-11-16",
    source_id: "un-comtrade",
  };
  const r = normalizeTrade(
    [
      base,
      { ...base, period_year: 2024, value: 100 },
      { ...base, metric: "import_mass", unit: "kg", value: 10 },
    ],
    window,
  );
  const value = r.find(
    (x) => x.period_year === 2025 && x.metric === "import_value",
  )!;
  expect(value.changePct).toBe(100);
  expect(value.relation).toBe("background");
  expect(r.find((x) => x.metric === "import_mass")!.changePct).toBeNull();
  expect(
    normalizeTrade(
      [
        base,
        { ...base, period_year: 2024, commodity_code: "OTHER", value: 100 },
      ],
      window,
    )[0].changePct,
  ).toBeNull();
  expect(r.every((x) => !x.metric.includes("price"))).toBe(true);
});

it("renders every source month and server metric even when the model selects only one fact", () => {
  const series = buildPriceSeries(rows, window, now);
  const report: VerifiedReport = {
    provider: "TEST",
    model: "TEST",
    generatedAt: "2026-11-16",
    evidenceHash: "TEST",
    sources: [{ name: "TEST", url: "https://example.com" }],
    facts: [],
    draft: {
      summary: "TEST",
      selectedFactIds: ["F1"],
      interpretations: [],
      risks: [],
      scenarios: [],
      limitations: [],
      conclusion: "TEST",
    },
    analytics: {
      version: 3,
      window,
      metals: [{ id: "copper", name: "Медь" }],
      prices: series,
      trade: [],
      news: [],
      limitations: [],
      coverage: {
        monthlyRows: 24,
        currentPoints: 12,
        previousPoints: 12,
        tradeRows: 0,
        newsCandidates: 0,
        selectedNews: 0,
      },
    },
  };
  const text = renderVerifiedReport(report);
  expect((text.match(/• \d{4}-\d{2}:/g) ?? []).length).toBe(24);
  expect(text).toContain("275 USD/т");
  expect(text).toContain("155 USD/т");
  expect(text).toContain("+77,42 %");
  expect(text).toContain("2. ДИНАМИКА");
  expect(text).toContain("3. МЕЖДУНАРОДНАЯ ТОРГОВЛЯ");
  expect(text).toContain("Месячная волатильность");
});

it("handles Russian dates, a named quarter/year and calendar-year comparison without leap-day drift", () => {
  expect(
    resolveAnalysisWindow({ question: "С 15.03.2026 по 20.06.2026" }, now)
      .requested,
  ).toEqual({ start: "2026-03-15", end: "2026-06-20" });
  const q = resolveAnalysisWindow(
    { question: "Медь за III квартал 2025" },
    now,
  );
  expect(q.requested).toEqual({ start: "2025-07-01", end: "2025-09-30" });
  expect(q.previous).toEqual({ start: "2025-04-01", end: "2025-06-30" });
  const y = resolveAnalysisWindow({ question: "Медь за 2025 год" }, now);
  expect(y.previous).toEqual({ start: "2024-01-01", end: "2024-12-31" });
  expect(
    resolveAnalysisWindow({ question: "Медь за текущий квартал" }, now)
      .requested,
  ).toEqual({ start: "2026-10-01", end: "2026-11-16" });
});

it("passes every source observation to the model and rejects fabricated numeric prose and unsupported trade trends", () => {
  const prices = buildPriceSeries(rows, window, now);
  const analytics = {
    version: 3 as const,
    window,
    prices,
    metals: [{ id: "copper", name: "Медь" }],
    trade: [],
    news: [],
    limitations: [],
    coverage: {
      monthlyRows: 24,
      currentPoints: 12,
      previousPoints: 12,
      tradeRows: 0,
      newsCandidates: 0,
      selectedNews: 0,
    },
  };
  const facts: EvidenceFact[] = rows.map((r, i) => ({
    id: "F" + (i + 1),
    metalId: r.metal_id,
    kind: "monthly_price",
    label: "Медь",
    value: Number(r.price),
    unit: "USD/т",
    periodStart: r.period_start,
    periodEnd: r.period_start,
    receivedAt: r.retrieved_at,
    region: r.region,
    specification: r.specification,
    source: "TEST",
    url: "https://example.com/source",
    withinPeriod: i >= 12,
  }));
  for (const key of ["max", "min", "q25", "q75"] as const)
    facts.push({
      ...facts[0],
      id: "D-" + key,
      kind: "derived_metric",
      metricKey: key,
      value: prices[0].currentMetrics[key]!,
    });
  const packet = buildAnalysisPacket(analytics, facts);
  expect(packet.series[0].current).toHaveLength(12);
  expect(packet.series[0].previous).toHaveLength(12);
  expect(packet.series[0].current.map((p) => p[2])).toEqual(
    rows.slice(12).map((r) => r.price),
  );
  expect(packet.tradeComparability.hasComparableYearPairs).toBe(false);
  const draft: AnalystDraft = {
    summary:
      "Наблюдаемый месячный ориентир повысился относительно начала окна, однако имеющиеся данные не устанавливают причины этой динамики.",
    selectedFactIds: [],
    scenarios: quantitativeScenarios(analytics, facts),
    risks: [],
    limitations: [],
    interpretations: [
      {
        section: "dynamics",
        factIds: ["F24"],
        text: "Месячный ориентир повышается относительно начала окна; это описание наблюдений, а не доказательство изменения спроса.",
      },
      {
        section: "trade",
        factIds: ["F24"],
        text: "Динамика импорта не установлена: отсутствуют сопоставимые годовые наблюдения одного продукта и одной страны.",
      },
      {
        section: "factors",
        factIds: ["F24"],
        text: "Причинное влияние отраслевых событий на цену не установлено; проверка гипотез требует независимого баланса предложения и потребления.",
      },
    ],
    conclusion:
      "Вывод ограничен месячной историей выбранной спецификации. Наблюдаемое повышение ориентира не доказывает дефицит металла: для этого отсутствуют подтверждённые балансы производства, запасов и потребления.",
  };
  expect(() =>
    validateProfessionalDraft(draft, facts, analytics),
  ).not.toThrow();
  const fabricated = { ...draft, summary: "Цена выросла на 99 процентов" };
  expect(() =>
    validateAnalystDraft(fabricated, facts, { professional: true }),
  ).toThrow("unverified_model_claim");
  expect(() =>
    validateProfessionalDraft(
      { ...draft, summary: draft.summary + " Импорт значительно увеличился." },
      facts,
      analytics,
    ),
  ).toThrow("unsupported_trade_trend");
  expect(() =>
    validateAnalystDraft(
      {
        ...draft,
        interpretations: [
          { ...draft.interpretations[0], factIds: ["INVENTED"] },
        ],
      },
      facts,
      { professional: true },
    ),
  ).toThrow("invalid_fact_reference");
  expect(draft.scenarios.map((s) => s.factIds)).toEqual([
    ["D-max"],
    ["D-min"],
    ["D-q25", "D-q75"],
  ]);
  expect(
    quantitativeScenarios(
      {
        ...analytics,
        prices: [{ ...prices[0], current: prices[0].current.slice(0, 1) }],
      },
      facts,
    ),
  ).toEqual([]);
});
