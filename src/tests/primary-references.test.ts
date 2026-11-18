import { describe, it, expect } from "vitest";
import {
  parseOwnerReferences,
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
    expect(p.dateLabel).toContain("не указана");
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
