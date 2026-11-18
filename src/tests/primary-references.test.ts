import { describe, it, expect } from "vitest";
import {
  parseOwnerReferences,
  parseTaxViews,
  selectPrimaryPrices,
  type DisplayedPrice,
} from "../services/displayedPrices";
const row = {
  metal_id: "ferromolybdenum",
  minimum_usd_kg: null,
  maximum_usd_kg: null,
  point_usd_kg: 10,
  mass_basis: "contained_mo",
  specification: "TEST_ONLY alloy",
  market_region: "Europe",
  region_verified: true,
  basis_description: "TEST_ONLY DDP Europe",
  observed_on: null,
  source_published_on: null,
  claimed_publisher: "TEST_ONLY",
  evidence_url: null,
  tax_status: "unknown",
  verification_status: "unverified",
  verification_note: "Test fixture, not a production price",
  recorded_at: "2026-11-18T00:00:00Z",
};
describe("private historical reference selection", () => {
  it("preserves a point without inventing a range and keeps contained-Mo units", () => {
    const p = parseOwnerReferences([row])[0];
    expect(p.pricePerKg).toBe(10);
    expect(p.pricePerTon).toBe(10000);
    expect(p.minimumPerKg).toBeUndefined();
    expect(p.massBasis).toBe("contained_mo");
    expect(p.observedOn).toBe("");
    expect(p.dateLabel).toContain("не установлена");
  });
  it("preserves reported endpoints without manufacturing a mean", () => {
    const p = parseOwnerReferences([
      { ...row, point_usd_kg: null, minimum_usd_kg: 100, maximum_usd_kg: 120 },
    ])[0];
    expect(p.minimumPerKg).toBe(100);
    expect(p.maximumPerKg).toBe(120);
    expect(p.pricePerKg).toBe(100);
  });
  it("excludes buyer offers even if the supplier is in the requested region", () => {
    const p = parseOwnerReferences([row])[0];
    const bid = { ...p, category: "supplier" as const };
    expect(selectPrimaryPrices([bid], "Europe")).toEqual([]);
    expect(selectPrimaryPrices([bid])).toEqual([]);
  });
  it("requires verified market basis and never substitutes another region", () => {
    const p = parseOwnerReferences([row])[0];
    expect(selectPrimaryPrices([p], "Europe")).toHaveLength(1);
    expect(selectPrimaryPrices([p], "USA")).toEqual([]);
    expect(
      selectPrimaryPrices([{ ...p, regionVerified: false }], "Europe"),
    ).toEqual([]);
  });
  it("selects by region before giving owner snapshots precedence", () => {
    const p = parseOwnerReferences([row])[0];
    const wb = {
      ...p,
      category: "reference",
      marketRegion: "global",
      regionVerified: true,
    } as DisplayedPrice;
    expect(selectPrimaryPrices([p, wb])[0]).toEqual(p);
    expect(selectPrimaryPrices([p, wb], "global")[0]).toEqual(wb);
  });
  it("rejects malformed price shapes and NaN", () => {
    for (const r of [
      { ...row, point_usd_kg: NaN },
      { ...row, minimum_usd_kg: 2 },
      { ...row, point_usd_kg: null, minimum_usd_kg: 3, maximum_usd_kg: 2 },
    ])
      expect(parseOwnerReferences([r])).toEqual([]);
  });
});

it("keeps multiple regional observations without merging specifications", () => {
  const a = parseOwnerReferences([{ ...row, id: 1 }])[0],
    b = {
      ...a,
      observationId: "2",
      marketRegion: "Asia" as const,
      regionVerified: true,
    };
  expect(selectPrimaryPrices([a, b])[0].alternatives).toEqual([b]);
  expect(selectPrimaryPrices([a, b], "Europe")).toEqual([a]);
  expect(selectPrimaryPrices([a, b], "Asia")).toEqual([b]);
  expect(selectPrimaryPrices([a, b], "USA")).toEqual([]);
});
it("never infers a VAT rate for unknown or missing tax evidence", () => {
  expect(
    parseOwnerReferences([{ ...row, vat_rate: 0.13 }])[0].vatRate,
  ).toBeUndefined();
  expect(
    parseOwnerReferences([
      { ...row, tax_status: "excluded", vat_rate: 0.13 },
    ])[0].vatRate,
  ).toBe(0.13);
  expect(
    parseOwnerReferences([{ ...row, assessment_kind: "single_trade" }])[0].kind,
  ).toContain("не средняя");
});
it("tax representations require permission and valid published values; no inferred tax arithmetic", () => {
  const v = {
    tax_status: "included",
    assessed_on: "2026-01-01",
    vat_rate: 0.13,
    minimum_usd_kg: 100,
    maximum_usd_kg: 120,
    point_usd_kg: null,
    evidence_url: "https://example.test/price",
    source_published_on: "2026-01-01",
    usage_permission_confirmed: true,
  };
  expect(parseTaxViews([v])).toEqual([]);
  expect(parseTaxViews([v], "2026-01-02")).toEqual([]);
  expect(parseTaxViews([v, v], "2026-01-01")).toHaveLength(1);
  expect(
    parseTaxViews([{ ...v, usage_permission_confirmed: false }], "2026-01-01"),
  ).toEqual([]);
  expect(parseTaxViews([{ ...v, vat_rate: NaN }], "2026-01-01")).toEqual([]);
  expect(parseTaxViews([{ ...v, minimum_usd_kg: 130 }], "2026-01-01")).toEqual(
    [],
  );
  expect(parseTaxViews([{ ...v, point_usd_kg: 110 }], "2026-01-01")).toEqual(
    [],
  );
});
