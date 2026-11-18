import { describe, expect, it } from "vitest";
import { parsePrivateSmmImport } from "../../shared/privateSmm";
const row = {
  series_id: "smm:user-fixture",
  metal_id: "copper",
  specification: "1# copper cathode",
  purity: "99.99%",
  delivery_form: "cathode",
  region: "China",
  price_type: "physical_spot",
  assessed_at: "2026-11-17",
  date_precision: "day",
  currency: "USD",
  unit: "ton",
  tax_status: "excluded",
  vat_rate: null,
  minimum: 14304.76,
  maximum: 14432.46,
  mean: 14368.61,
  source_url: "https://www-old.metal.com/Copper/201102250376",
};
describe("private SMM import", () => {
  it("accepts explicit source values without VAT/FX guessing", () => {
    expect(parsePrivateSmmImport([row])[0]).toEqual(row);
    const included = {
      ...row,
      tax_status: "included",
      minimum: null,
      maximum: null,
      mean: 16236.53,
    };
    expect(parsePrivateSmmImport([row, included])).toHaveLength(2);
  });
  it("rejects duplicate views, impersonation, malformed values and foreign source URLs", () => {
    for (const v of [
      [],
      [row, row],
      [{ ...row, owner_id: "other" }],
      [{ ...row, source_url: "https://metal.com.evil.org/" }],
      [{ ...row, source_url: "https://user:pw@metal.com/a" }],
      [{ ...row, minimum: 99999 }],
      [{ ...row, maximum: null }],
      [{ ...row, mean: NaN }],
      [{ ...row, tax_status: "unknown", vat_rate: 0.13 }],
      [{ ...row, unit: "ounce" }],
      [{ ...row, metal_id: "iron" }],
    ])
      expect(() => parsePrivateSmmImport(v)).toThrow();
  });
});
