import { it, expect } from "vitest";
import {
  parseFrankfurter,
  frankfurterUrl,
  historicalRate,
} from "../../shared/fx";
import { compareBenchmark } from "../../shared/benchmarks";
const now = Date.parse("2026-11-13T12:00:00Z");
const row = (quote = "EUR", rate = 2, date = "2026-11-13") => ({
  base: "USD",
  quote,
  rate,
  date,
  providers: [{ key: "TEST", date, rate }],
});
it("derives inverses and same-date crosses with provider attribution", () => {
  const rows = parseFrankfurter([row(), row("RUB", 100), row("CNY", 10)], now);
  expect(rows).toHaveLength(12);
  expect(
    rows.find((r) => r.base_currency === "EUR" && r.quote_currency === "RUB")
      ?.rate,
  ).toBe(50);
  expect(
    rows.find((r) => r.base_currency === "EUR" && r.quote_currency === "USD")
      ?.rate,
  ).toBe(0.5);
  expect(
    rows.every((r) => r.provider_details.includes("TEST@2026-11-13")),
  ).toBe(true);
});
it("never crosses observations from different dates", () => {
  const rows = parseFrankfurter([row(), row("RUB", 100, "2026-11-12")], now);
  expect(rows).toHaveLength(4);
  expect(
    rows.some((r) => r.base_currency === "EUR" && r.quote_currency === "RUB"),
  ).toBe(false);
});
it.each([0, -1, NaN, Infinity])("rejects invalid rate %s", (rate) =>
  expect(() => parseFrankfurter([row("EUR", rate)], now)).toThrow(),
);
it("rejects duplicate, future, invalid dates and missing attribution", () => {
  for (const input of [
    [row(), row()],
    [row("EUR", 2, "2026-11-14")],
    [row("EUR", 2, "2026-02-30")],
    [{ ...row(), providers: [] }],
  ])
    expect(() => parseFrankfurter(input, now)).toThrow();
});
it("historical conversion uses only preceding observations within four days", () => {
  const rows = parseFrankfurter(
    [row("EUR", 2, "2026-11-12"), row("EUR", 3)],
    now,
  );
  expect(
    historicalRate(rows, "USD", "EUR", Date.parse("2026-11-12T12:00:00Z")),
  ).toBe(2);
  expect(historicalRate(rows, "USD", "EUR", now)).toBe(3);
  expect(historicalRate(rows, "USD", "EUR", now + 5 * 86400000)).toBeNull();
  expect(historicalRate(rows, "USD", "EUR", now - 5 * 86400000)).toBeNull();
  expect(historicalRate([], "USD", "USD", now)).toBe(1);
});
it("builds bounded historical API request", () => {
  const url = new URL(frankfurterUrl(now, 7));
  expect(url.searchParams.get("from")).toBe("2026-11-07");
  expect(url.searchParams.get("expand")).toBe("providers");
  expect(() => frankfurterUrl(now, 32)).toThrow();
});
it("benchmark requires lawful access and identical product specification", () => {
  const estimate = {
    materialId: "tungsten",
    commercialKey: "powder-99.9-FCA",
    region: "Европа",
    currency: "USD",
    unit: "kg",
    at: now,
    price: 110,
  };
  const reference = {
    ...estimate,
    publishedAt: now,
    price: 100,
    licenseReference: "TEST licensed access",
    redistributionAllowed: false,
  };
  expect(compareBenchmark(estimate, reference)).toEqual({
    difference: 10,
    percent: 10,
  });
  for (const patch of [
    { commercialKey: "bar" },
    { region: "Азия" },
    { currency: "EUR" },
    { unit: "ton" },
    { licenseReference: "" },
    { publishedAt: now - 2 * 86400000 },
  ])
    expect(compareBenchmark(estimate, { ...reference, ...patch })).toBeNull();
});
