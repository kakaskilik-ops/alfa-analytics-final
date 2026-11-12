import { it, expect } from "vitest";
import {
  regionalView,
  displayQuote,
  buildHybridQuote,
  type LiveMarketData,
  type LiveQuoteData,
} from "@/services/liveData";
import { METALS } from "@/data/metals";
import {
  compareRegionalPrices,
  parseAiInput,
} from "../../supabase/functions/_shared/analysis";
const now = Date.now();
function live(region: string, price: number, spec = region): LiveQuoteData {
  return {
    metalId: "tungsten",
    livePrice: price,
    originalCurrency: "USD",
    originalUnit: "kg",
    sourceName: "TEST",
    sourceUrl: "https://example.com",
    marketLabel: "TEST",
    exchangeName: null,
    timestamp: now,
    dataStatus: "live",
    history: [],
    region,
    specificationKey: spec,
  };
}
function market(records: LiveQuoteData[]): LiveMarketData {
  return {
    quotes: new Map(),
    regionalQuotes: records,
    loaded: true,
    updatedAt: now,
    error: null,
  };
}
it("does not synthesize prices for absent regions", () => {
  const data = market([live("США", 10)]);
  expect(regionalView(data, "Европа", {}, "USD", "kg")?.quotes.size).toBe(0);
  expect(
    regionalView(data, "США", {}, "USD", "kg")?.quotes.get("tungsten")
      ?.livePrice,
  ).toBe(10);
  expect(regionalView(data, "Азия", {}, "USD", "kg")?.quotes.size).toBe(0);
});
it("requires a commercial specification when alternatives exist", () => {
  const data = market([live("Европа", 10, "a"), live("Европа", 12, "b")]);
  expect(regionalView(data, "Европа", {}, "USD", "kg")?.quotes.size).toBe(0);
  expect(
    regionalView(data, "Европа", { tungsten: "b" }, "USD", "kg")?.quotes.get(
      "tungsten",
    )?.livePrice,
  ).toBe(12);
});
it("converts display units consistently and refuses unknown FX", () => {
  const raw = buildHybridQuote(METALS[0], "1M", new Date(now), live("США", 10));
  expect(
    displayQuote(raw, {
      ...market([]),
      displayUnit: "ton",
      displayCurrency: "USD",
    }).price,
  ).toBe(10000);
  expect(
    displayQuote(raw, { ...market([]), displayCurrency: "RUB" }).price,
  ).toBeNull();
});
it("calculates regional percentage differences only for comparable independent samples", () => {
  const r = (region: string, source: string, price: number, spec = "same") => ({
    metal_id: "tungsten",
    source_id: source,
    independence_id: source,
    region,
    normalized_price: price,
    specification: spec,
    quoted_at: new Date(now).toISOString(),
  });
  const result = compareRegionalPrices([
    r("Европа", "a", 10),
    r("Европа", "b", 12),
    r("Азия", "c", 20),
    r("Азия", "d", 24),
    r("США", "e", 100, "different"),
    r("США", "f", 200, "different"),
  ]);
  expect(result.differences).toHaveLength(1);
  expect(result.differences[0].percent).toBe(100);
});
it("AI request validation caps conversation and forbids metals outside catalogue", () => {
  expect(() =>
    parseAiInput({ question: "Gold price", metalIds: ["gold"] }),
  ).toThrow();
  expect(() =>
    parseAiInput({ question: "Сравни рынки", region: "Россия" }),
  ).toThrow();
  expect(() =>
    parseAiInput({
      question: "Сравни рынки",
      messages: Array(11).fill({ role: "user", content: "test" }),
    }),
  ).toThrow();
  expect(
    parseAiInput({
      question: "Обзор рынка",
      period: "1W",
      metalIds: ["tungsten"],
    }),
  ).toMatchObject({ period: "1W", metalIds: ["tungsten"] });
});

it("does not present highly dispersed regional samples as a market estimate", () => {
  const rows = [10, 1000].map((price, i) => ({
    metal_id: "tungsten",
    source_id: String(i),
    independence_id: String(i),
    region: "Европа",
    normalized_price: price,
    specification: "same",
    quoted_at: new Date().toISOString(),
  }));
  expect(compareRegionalPrices(rows).estimates).toEqual([]);
});
