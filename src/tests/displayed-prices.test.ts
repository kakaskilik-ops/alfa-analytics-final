import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseRarePrices,
  parseFerroPrices,
  priceUsdKg,
  QS_CATALOGUE_PRICES,
  QS_PRICE_SHA256,
  qsCatalogueEvidence,
} from "../../shared/supplierPrices";
import { parseSupplierPriceRows } from "../services/displayedPrices";
const rare = readFileSync("tests/fixtures/prices/rare.html", "utf8");
const ferro = readFileSync("tests/fixtures/prices/metotechnics.html", "utf8");
const date = new Date("2026-11-17T13:00:00Z");
describe("published supplier evidence, not fabricated market quotes", () => {
  it("accepts the actual 2.1MB catalogue but persists a small checksum-verified excerpt", () => {
    const evidence = JSON.parse(qsCatalogueEvidence(QS_PRICE_SHA256, 2128330));
    expect(evidence.rows).toHaveLength(3);
    expect(evidence.original_byte_length).toBe(2128330);
    expect(JSON.stringify(evidence).length).toBeLessThan(10000);
    expect(() => qsCatalogueEvidence("changed", 2128330)).toThrow();
    expect(() => qsCatalogueEvidence(QS_PRICE_SHA256, 3000000)).toThrow();
  });
  it("reads seven exact metal/purity bid rows and excludes compounds", () => {
    const rows = parseRarePrices(rare, date);
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.metal_id === "tungsten")?.original_price).toBe(
      22.74,
    );
    expect(rows.find((r) => r.metal_id === "chromium")?.original_price).toBe(
      2.5,
    );
    expect(
      rows.every(
        (r) => r.price_kind === "supplier_bid" && r.original_unit === "lb",
      ),
    ).toBe(true);
    expect(rows.every((r) => !r.specification.includes("oxide"))).toBe(true);
  });
  it("fails closed when table units or grade change, zero, duplicate or missing price", () => {
    expect(() =>
      parseRarePrices(rare.replace(/USD\/lb/g, "USD/kg"), date),
    ).toThrow();
    expect(() => parseRarePrices(rare.replace("22.74", "0"), date)).toThrow();
    expect(() =>
      parseRarePrices(rare.replace("Tungsten 99.9%", "Tungsten alloy"), date),
    ).toThrow();
    expect(() => parseRarePrices(rare + rare, date)).toThrow();
  });
  it("keeps FeMo60 and FeW70 separate, retaining the from qualifier and alloy mass basis", () => {
    const rows = parseFerroPrices(ferro, date);
    expect(rows.map((r) => r.metal_id)).toEqual([
      "ferromolybdenum",
      "ferrotungsten",
    ]);
    expect(rows.map((r) => r.original_price)).toEqual([24, 32]);
    expect(
      rows.every(
        (r) => r.price_kind === "supplier_floor" && r.original_unit === "kg",
      ),
    ).toBe(true);
    expect(rows[0].specification).toContain("не за кг содержащегося");
    expect(() =>
      parseFerroPrices(ferro.replace("FeMo60", "Mo"), date),
    ).toThrow();
  });
  it("converts mass only, not a new geographic quote or a contained-metal price", () => {
    expect(priceUsdKg(1000, "ton")).toBe(1);
    expect(priceUsdKg(1, "lb")).toBeCloseTo(2.20462262185, 10);
    expect(priceUsdKg(24, "kg")).toBe(24);
    expect(() => priceUsdKg(0, "kg")).toThrow();
  });
  it("retains catalogue year, exact geometry and grade 702 instead of treating as pure zirconium", () => {
    const z = QS_CATALOGUE_PRICES.find((r) => r.metal_id === "zirconium")!;
    expect(z.original_price).toBe(80);
    expect(z.specification).toContain("702");
    expect(z.date_precision).toBe("year");
    expect(z.observed_on).toBe("2023-01-01");
  });
  it("renders lower bounds as stale undated evidence, not a current confirmed price", () => {
    const rows = parseSupplierPriceRows(
      parseFerroPrices(ferro, date).map((r) => ({
        ...r,
        retrieved_at: date.toISOString(),
      })),
      date.getTime(),
    );
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (r) => r.lowerBound && r.stale && r.notes?.includes("Независимого"),
      ),
    ).toBe(true);
  });
  it("selects latest same-day revisions and rejects conflicting simultaneous values", () => {
    const row = {
      ...parseRarePrices(rare, date)[0],
      retrieved_at: "2026-11-17T12:00:00Z",
    };
    const newer = {
      ...row,
      original_price: 3,
      retrieved_at: "2026-11-17T13:00:00Z",
    };
    expect(
      parseSupplierPriceRows([row, newer], date.getTime())[0].originalPrice,
    ).toBe(3);
    expect(
      parseSupplierPriceRows(
        [row, { ...row, original_price: 4 }],
        date.getTime(),
      ),
    ).toEqual([]);
  });
});
