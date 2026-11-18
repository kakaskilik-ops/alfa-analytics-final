import { describe, expect, it } from "vitest";
import {
  observationIdentity,
  preferredTaxView,
  validateTaxPrice,
  type TaxPrice,
} from "../../shared/taxPrices";
describe("source reported VAT representations (user supplied SMM example, not a production feed)", () => {
  const ex: TaxPrice = {
    seriesId: "smm:201102250376",
    assessedAt: "2026-11-17",
    currency: "USD",
    unit: "ton",
    taxStatus: "excluded",
    vatRate: null,
    minimum: 14304.76,
    maximum: 14432.46,
    mean: 14368.61,
  };
  const inc: TaxPrice = {
    ...ex,
    taxStatus: "included",
    minimum: null,
    maximum: null,
    mean: 16236.53,
  };
  it("counts two tax views and original CNY as one observation", () => {
    const original = { ...inc, currency: "CNY", mean: 108020 };
    expect(new Set([ex, inc, original].map(observationIdentity)).size).toBe(1);
    expect(preferredTaxView([inc, ex, original])).toEqual(ex);
    expect(ex.mean! / 1000).toBeCloseTo(14.36861, 8);
    expect(inc.mean! / 1000).toBeCloseTo(16.23653, 8);
    expect(inc.mean).toBe(16236.53); // not recalculated using an assumed FX/VAT rate
  });
  it("does not infer VAT or a missing range", () => {
    const unknown: TaxPrice = { ...inc, taxStatus: "unknown" };
    expect(preferredTaxView([unknown])).toEqual(unknown);
    expect(unknown.vatRate).toBeNull();
    expect(unknown.minimum).toBeNull();
    expect(validateTaxPrice({ ...unknown, vatRate: 0.13 })).toBe(false);
  });
  it("rejects invalid ranges, means and mixed observations", () => {
    expect(validateTaxPrice({ ...ex, maximum: 1 })).toBe(false);
    expect(validateTaxPrice({ ...ex, mean: 20000 })).toBe(false);
    expect(validateTaxPrice({ ...ex, mean: NaN })).toBe(false);
    expect(
      preferredTaxView([ex, { ...inc, seriesId: "other" }]),
    ).toBeUndefined();
  });
});
