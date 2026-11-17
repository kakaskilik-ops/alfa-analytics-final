import { it, expect } from "vitest";
import {
  assessMarketPrice,
  type MarketEvidence,
  type AssessmentSpec,
} from "../../shared/priceAssessment";
// Explicitly synthetic verification cases; never inserted into production.
const spec: AssessmentSpec = {
  metalId: "ferromolybdenum",
  grade: "FeMo65",
  form: "lumps",
  region: "Европа",
  country: "Нидерланды",
  deliveryBasis: "in-warehouse Rotterdam",
  taxBasis: "ex VAT",
  massBasis: "alloy",
  minLotKg: 100,
  maxLotKg: 10000,
  start: "2026-11-17T00:00:00Z",
  end: "2026-11-18T00:00:00Z",
};
const make = (id: string, price: number): MarketEvidence => ({
  ...spec,
  id,
  independenceId: id,
  currency: "USD",
  pricePerKg: price,
  quantityKg: 1000,
  observedAt: "2026-11-17T12:00:00Z",
  sourceUrl: "https://example.test/" + id,
  kind: "verified_trade",
  counterpartyVerified: true,
  verificationId: "TEST-" + id,
});
it("requires three independently verified transactions, not matching website numbers", () => {
  const offers = ["a", "b", "c"].map((id) => ({
    ...make(id, 60),
    kind: "supplier_indication" as const,
    counterpartyVerified: false,
    verificationId: null,
  }));
  expect(assessMarketPrice(offers, spec).pricePerKg).toBeNull();
  expect(assessMarketPrice([make("a", 60), make("b", 61)], spec).status).toBe(
    "insufficient_evidence",
  );
});
it("keeps alloy mass, grade, delivery, date and product form separate", () => {
  for (const changes of [
    { massBasis: "contained_metal" as const },
    { grade: "FeMo60" },
    { form: "powder" },
    { deliveryBasis: "FOB China" },
    { observedAt: "2026-11-16T00:00:00Z" },
  ]) {
    const r = assessMarketPrice(
      [make("a", 60), make("b", 61), { ...make("c", 62), ...changes }],
      spec,
    );
    expect(r.pricePerKg).toBeNull();
    expect(r.excluded).toHaveLength(1);
  }
});
it("deduplicates documents, refuses conflicting revisions and contributor copies", () => {
  expect(
    assessMarketPrice([make("a", 60), make("a", 60), make("a", 60)], spec)
      .tradeCount,
  ).toBe(1);
  expect(
    assessMarketPrice(
      [make("a", 60), make("a", 70), make("b", 60), make("c", 60)],
      spec,
    ).pricePerKg,
  ).toBeNull();
  expect(
    assessMarketPrice(
      ["a", "b", "c"].map((id) => ({
        ...make(id, 60),
        independenceId: "same-publisher",
      })),
      spec,
    ).pricePerKg,
  ).toBeNull();
});
it("calculates a transparent VWAP only when evidence qualifies and defers dispersion/concentration", () => {
  expect(
    assessMarketPrice([make("a", 60), make("b", 61), make("c", 62)], spec)
      .pricePerKg,
  ).toBe(61);
  expect(
    assessMarketPrice([make("a", 30), make("b", 60), make("c", 62)], spec)
      .status,
  ).toBe("review_required");
  expect(
    assessMarketPrice(
      [{ ...make("a", 60), quantityKg: 9000 }, make("b", 61), make("c", 62)],
      spec,
    ).pricePerKg,
  ).toBeNull();
});
