import { describe, it, expect } from "vitest";
import {
  computeAveragePrice,
  median,
  standardDeviation,
  trimmedMean,
} from "@/services/averagePrice";
import {
  quoteIssues,
  comparisonKey,
  MAX_QUOTE_AGE_MS,
} from "@/services/quoteValidation";
import { buildHybridQuote } from "@/services/liveData";
import { buildIndex, buildQuote, getVolatility } from "@/services/market";
import { convertPrice, getRate } from "@/services/currency";
import { METALS } from "@/data/metals";
import { CATEGORIES } from "@/data/categories";
import { buildQuotesCsv, buildExcelXml } from "@/services/export";
import type { PriceQuoteRecord } from "@/types/market";
const now = Date.now();
const record = (
  sourceId: string,
  price: number,
  patch: Partial<PriceQuoteRecord> = {},
): PriceQuoteRecord => ({
  sourceId,
  price,
  metalId: "copper",
  sourceName: sourceId,
  sourceUrl: "https://example.com/quote",
  currency: "USD",
  unit: "kg",
  region: "Россия",
  marketType: "wholesale",
  grade: "М1",
  productForm: "Катод",
  exchangeName: null,
  qualityScore: 0.95,
  dataStatus: "live",
  validationStatus: "valid",
  timestamp: now - 1000,
  retrievedAt: now,
  attribution: "Источник",
  ...patch,
});
describe("Расчёт рыночной оценки", () => {
  it("вычисляет среднее, медиану, диапазон и разброс", () => {
    const r = computeAveragePrice(
      [record("a", 10), record("b", 12), record("c", 14)],
      now,
    );
    expect(r.simpleAverage).toBe(12);
    expect(r.median).toBe(12);
    expect(r.min).toBe(10);
    expect(r.max).toBe(14);
    expect(r.sourceCount).toBe(3);
    expect(r.standardDeviation).toBeCloseTo(Math.sqrt(8 / 3));
  });
  it("не придумывает веса из qualityScore", () =>
    expect(
      computeAveragePrice([record("a", 10), record("b", 20)], now)
        .weightedAverage,
    ).toBeNull());
  it("принимает только документированные положительные веса", () => {
    const r = computeAveragePrice(
      [
        record("a", 10, {
          weight: 1,
          weightReason: "Объём подтверждённых сделок",
        }),
        record("b", 20, {
          weight: 3,
          weightReason: "Объём подтверждённых сделок",
        }),
      ],
      now,
    );
    expect(r.weightedAverage).toBe(17.5);
  });
  it("не выдаёт оценку по одному источнику", () =>
    expect(computeAveragePrice([record("a", 10)], now).confidence).toBe(
      "none",
    ));
  it("не считает перепечатки независимыми источниками", () => {
    const r = computeAveragePrice(
      [
        record("a", 10, { independenceId: "same" }),
        record("b", 11, { independenceId: "same" }),
      ],
      now,
    );
    expect(r.sourceCount).toBe(1);
    expect(r.median).toBeNull();
  });
  it("оставляет самое свежее наблюдение независимого источника", () => {
    const r = computeAveragePrice(
      [
        record("a", 10, { timestamp: now - 2000 }),
        record("a", 12),
        record("b", 14),
      ],
      now,
    );
    expect(r.simpleAverage).toBe(13);
    expect(r.quotationCount).toBe(2);
  });
  it("исключает аномальное отклонение", () => {
    const r = computeAveragePrice(
      [record("a", 10), record("b", 11), record("c", 100)],
      now,
    );
    expect(r.outliers).toEqual([100]);
    expect(r.simpleAverage).toBe(10.5);
  });
  for (const patch of [
    { currency: "EUR" },
    { unit: "ton" },
    { region: "Китай" },
    { marketType: "scrap" },
    { grade: "М2" },
    { productForm: "Лом" },
    { metalId: "gold" },
    { composition: "Ni 20%" },
    { priceType: "futures" },
  ] as Partial<PriceQuoteRecord>[]) {
    it(`отклоняет смешанные условия ${JSON.stringify(patch)}`, () => {
      expect(
        computeAveragePrice([record("a", 10), record("b", 10, patch)], now)
          .simpleAverage,
      ).toBeNull();
    });
  }
  it("возвращает пустой результат", () =>
    expect(computeAveragePrice([], now).sourceCount).toBe(0));
  it("снижает качество при старении", () => {
    const fresh = computeAveragePrice([record("a", 10), record("b", 10)], now);
    const old = computeAveragePrice(
      [
        record("a", 10, { timestamp: now - MAX_QUOTE_AGE_MS + 1 }),
        record("b", 10, { timestamp: now - MAX_QUOTE_AGE_MS + 1 }),
      ],
      now,
    );
    expect(old.qualityScore).toBeLessThan(fresh.qualityScore);
  });
  it("базовые статистические функции", () => {
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(standardDeviation([1])).toBeNull();
    expect(trimmedMean([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 0.1)).toBe(5.5);
  });
});
describe("Валидация входящих котировок", () => {
  for (const price of [0, -1, NaN, Infinity])
    it(`отклоняет цену ${price}`, () =>
      expect(quoteIssues(record("a", price), now).length).toBeGreaterThan(0));
  for (const patch of [
    { unit: "short-ton" },
    { unit: "constructor" },
    { currency: "XXX" },
    { timestamp: now - MAX_QUOTE_AGE_MS - 1 },
    { timestamp: now + 600000 },
    { retrievedAt: now + 600000 },
    { validationStatus: "suspect" },
    { dataStatus: "demo" },
    { grade: null },
    { productForm: null },
    { sourceUrl: "javascript:alert(1)" },
    { sourceUrl: "https://secret:pass@example.com" },
    { qualityScore: 1.5 },
  ] as Partial<PriceQuoteRecord>[])
    it(`отклоняет некорректные данные ${JSON.stringify(patch)}`, () =>
      expect(quoteIssues(record("a", 10, patch), now).length).toBeGreaterThan(
        0,
      ));
  it("формирует разные ключи для разных рынков", () =>
    expect(comparisonKey(record("a", 10))).not.toBe(
      comparisonKey(record("a", 10, { marketType: "spot" })),
    ));
});
describe("История и отсутствие данных", () => {
  const gold = METALS.find((m) => m.id === "gold")!;
  const at = new Date(now);
  const live = {
    metalId: "gold",
    livePrice: 100,
    originalCurrency: "USD",
    originalUnit: "kg",
    sourceName: "test",
    sourceUrl: "https://example.com",
    marketLabel: "Спот",
    exchangeName: null,
    timestamp: now,
    dataStatus: "live" as const,
    history: [],
  };
  it("не создаёт демо-котировку без данных", () => {
    const q = buildQuote(gold, "1M", at);
    expect(q.price).toBeNull();
    expect(q.series).toEqual([]);
    expect(q.dataStatus).toBe("unavailable");
  });
  it("не создаёт историю из одной реальной цены", () => {
    const q = buildHybridQuote(gold, "1M", at, live);
    expect(q.series).toEqual([]);
    expect(q.changePct).toBeNull();
    expect(q.price).toBeCloseTo(3.11034768);
  });
  it("правильно переводит историю из USD/кг в USD/тр. унц.", () => {
    const q = buildHybridQuote(gold, "1M", at, {
      ...live,
      history: [
        { date: now - 86400000, price: 100 },
        { date: now - 1000, price: 200 },
      ],
    });
    expect(q.series[0].price).toBeCloseTo(3.11034768);
    expect(q.changePct).toBe(100);
  });
  it("фильтрует период и устаревший headline", () => {
    expect(
      buildHybridQuote(gold, "1D", at, {
        ...live,
        history: [{ date: now - 10 * 86400000, price: 10 }],
      }).series,
    ).toEqual([]);
    expect(
      buildHybridQuote(gold, "1M", at, {
        ...live,
        timestamp: now - 5 * 86400000,
      }).price,
    ).toBeNull();
  });
  it("строит индекс только по общим датам двух материалов", () => {
    const q = buildQuote(gold, "1M", at);
    const a = {
        ...q,
        dataStatus: "live" as const,
        series: [
          { date: 1, price: 10 },
          { date: 2, price: 20 },
          { date: 3, price: 30 },
        ],
      },
      b = {
        ...q,
        dataStatus: "live" as const,
        series: [
          { date: 1, price: 100 },
          { date: 3, price: 200 },
        ],
      };
    expect(buildIndex([a, b])).toEqual([
      { date: 1, price: 100 },
      { date: 3, price: 250 },
    ]);
    expect(buildIndex([a])).toEqual([]);
  });
  it("волатильность требует историю", () =>
    expect(getVolatility(buildQuote(gold, "1M", at))).toBeNull());
});
describe("Валюты, экспорт и каталог", () => {
  it("переводит единицы без валютного API", () => {
    expect(convertPrice(10, "USD", "USD", "kg", "ton")).toBe(10000);
    expect(convertPrice(10, "USD", "USD", "ozt", "kg")).toBeCloseTo(
      321.5074657,
    );
  });
  it("не подставляет фиксированный FX курс", () => {
    expect(getRate("USD", "RUB")).toBeNull();
    expect(convertPrice(10, "USD", "RUB", "kg", "kg")).toBeNull();
  });
  it("защищает CSV от формул и XML от внедрения разметки", () => {
    const q = {
      ...buildQuote(METALS[0], "1M", new Date(now)),
      sourceName: "=SUM(A1)",
      marketLabel: "<tag>&",
    };
    expect(buildQuotesCsv([q], "1M", new Date(now))).toContain("'=SUM(A1)");
    expect(buildExcelXml([q], "1M", new Date(now))).toContain(
      "&lt;tag&gt;&amp;",
    );
    expect(buildExcelXml([q], "1M", new Date(now))).not.toContain("NaN");
  });
  it("каталог содержит обязательные марки без дублирования id", () => {
    expect(new Set(METALS.map((m) => m.id)).size).toBe(METALS.length);
    expect(CATEGORIES.length).toBe(9);
    for (const name of [
      "ПОС-18",
      "ПОС-30",
      "ПОС-40",
      "ПОС-60",
      "Б83",
      "Б16",
      "Б88",
      "БН",
      "Р6М3",
      "Р9М4К8",
      "Р6М5",
      "Р18",
      "Р6М5К5",
      "Р9",
      "Р12",
      "Б55",
      "Б19",
      "Б28",
      "ЭИ943",
      "ЭИ904Л",
      "МН18",
      "Н28",
      "МН40",
      "Н65",
      "ВТ1-0",
      "ВК-ТК",
      "W/Cu/Ni",
      "W/Ni/Co",
      "W/Ni",
      "W/Ni/Fe",
      "29НК",
      "49КФ",
      "Ц0",
    ])
      expect(METALS.some((m) => m.nameRu === name)).toBe(true);
  });
});
