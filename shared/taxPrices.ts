/** Source-reported representations; never infer VAT or manufacture a range. */
export interface TaxPrice {
  seriesId: string;
  assessedAt: string;
  currency: string;
  unit: "kg" | "ton";
  taxStatus: "included" | "excluded" | "unknown";
  vatRate: number | null;
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
}
export function validateTaxPrice(p: TaxPrice): boolean {
  return (
    Boolean(p.seriesId.trim()) &&
    Number.isFinite(Date.parse(p.assessedAt)) &&
    /^[A-Z]{3}$/.test(p.currency) &&
    ["kg", "ton"].includes(p.unit) &&
    ["included", "excluded", "unknown"].includes(p.taxStatus) &&
    (p.vatRate === null ||
      (p.taxStatus !== "unknown" &&
        Number.isFinite(p.vatRate) &&
        p.vatRate >= 0 &&
        p.vatRate <= 1)) &&
    [p.minimum, p.maximum, p.mean].every(
      (v) => v === null || (Number.isFinite(v) && v > 0),
    ) &&
    ((p.minimum === null && p.maximum === null && p.mean !== null) ||
      (p.minimum !== null &&
        p.maximum !== null &&
        p.minimum <= p.maximum &&
        (p.mean === null || (p.mean >= p.minimum && p.mean <= p.maximum))))
  );
}
export function observationIdentity(p: TaxPrice): string {
  // Currency, units and tax views never create independent source confirmations.
  return JSON.stringify([p.seriesId, new Date(p.assessedAt).toISOString()]);
}
export function preferredTaxView(rows: TaxPrice[]): TaxPrice | undefined {
  const valid = rows.filter(validateTaxPrice);
  if (new Set(valid.map(observationIdentity)).size > 1) return undefined;
  // Only explicitly supplied ex-VAT data receives preference. No VAT conversion.
  return (
    valid.find((p) => p.taxStatus === "excluded") ??
    valid.find((p) => p.taxStatus === "unknown") ??
    valid[0]
  );
}
