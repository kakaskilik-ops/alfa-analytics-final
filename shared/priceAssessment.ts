/** Independent ALFA methodology v1. Not an Argus price or a substitute for licensed assessments. */
export const ASSESSMENT_METHOD = "ALFA-PRA-1";
export interface MarketEvidence {
  id: string;
  independenceId: string;
  metalId: string;
  grade: string;
  form: string;
  region: string;
  country: string;
  deliveryBasis: string;
  taxBasis: string;
  massBasis: "alloy" | "contained_metal" | "product";
  currency: "USD";
  pricePerKg: number;
  quantityKg: number;
  observedAt: string;
  sourceUrl: string;
  kind: "verified_trade" | "firm_bid" | "firm_offer" | "supplier_indication";
  /** Requires documented verification by BOTH counterparties; never inferred from a public price list. */
  counterpartyVerified: boolean;
  verificationId: string | null;
}
export interface AssessmentSpec {
  metalId: string;
  grade: string;
  form: string;
  region: string;
  country: string;
  deliveryBasis: string;
  taxBasis: string;
  massBasis: MarketEvidence["massBasis"];
  minLotKg: number;
  maxLotKg: number;
  start: string;
  end: string;
}
export function assessMarketPrice(
  input: MarketEvidence[],
  spec: AssessmentSpec,
) {
  if (
    [
      "metalId",
      "grade",
      "form",
      "region",
      "country",
      "deliveryBasis",
      "taxBasis",
    ].some(
      (k) =>
        typeof spec[k as keyof AssessmentSpec] !== "string" ||
        !String(spec[k as keyof AssessmentSpec]).trim(),
    ) ||
    !["alloy", "contained_metal", "product"].includes(spec.massBasis)
  )
    throw Error("incomplete_assessment_spec");
  const start = Date.parse(spec.start),
    end = Date.parse(spec.end);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    !(spec.minLotKg > 0) ||
    spec.maxLotKg < spec.minLotKg
  )
    throw Error("invalid_assessment_spec");
  const excluded: { id: string; reason: string }[] = [];
  const seen = new Map<string, MarketEvidence>();
  const conflicts = new Set<string>();
  for (const e of input) {
    let reason = "";
    const at = Date.parse(e.observedAt);
    if (
      !e.id ||
      !e.independenceId ||
      !/^https:\/\//.test(e.sourceUrl) ||
      !Number.isFinite(at) ||
      at < start ||
      at >= end
    )
      reason = "provenance_or_window";
    else if (
      [
        "metalId",
        "grade",
        "form",
        "region",
        "country",
        "deliveryBasis",
        "taxBasis",
        "massBasis",
      ].some(
        (k) =>
          !String(e[k as keyof MarketEvidence]).trim() ||
          e[k as keyof MarketEvidence] !== spec[k as keyof AssessmentSpec],
      )
    )
      reason = "incomparable_specification";
    else if (
      e.currency !== "USD" ||
      !(e.pricePerKg > 0 && Number.isFinite(e.pricePerKg)) ||
      !(e.quantityKg >= spec.minLotKg && e.quantityKg <= spec.maxLotKg)
    )
      reason = "invalid_price_or_lot";
    else if (
      e.kind !== "verified_trade" ||
      !e.counterpartyVerified ||
      !e.verificationId
    )
      reason = "not_a_bilaterally_verified_trade";
    if (reason) {
      excluded.push({ id: e.id, reason });
      continue;
    }
    const prior = seen.get(e.id);
    if (prior) {
      if (JSON.stringify(prior) !== JSON.stringify(e)) conflicts.add(e.id);
      else excluded.push({ id: e.id, reason: "duplicate_document" });
      continue;
    }
    seen.set(e.id, e);
  }
  const trades = [...seen.values()].filter((e) => {
    if (conflicts.has(e.id)) {
      excluded.push({
        id: e.id,
        reason: "conflicting_revisions_require_review",
      });
      return false;
    }
    return true;
  });
  const contributors = new Set(trades.map((e) => e.independenceId));
  if (trades.length < 3 || contributors.size < 3)
    return {
      method: ASSESSMENT_METHOD,
      status: "insufficient_evidence" as const,
      pricePerKg: null,
      tradeCount: trades.length,
      independentContributors: contributors.size,
      includedIds: trades.map((e) => e.id),
      excluded,
      reason:
        "Required: three comparable, independently contributed, bilaterally verified transactions. Public indications are not transactions.",
    };
  // Prevent one contributor's volume dominating this explicitly transaction-based methodology.
  const volume = trades.reduce((s, e) => s + e.quantityKg, 0);
  const byContributor = new Map<string, number>();
  for (const e of trades)
    byContributor.set(
      e.independenceId,
      (byContributor.get(e.independenceId) ?? 0) + e.quantityKg,
    );
  if ([...byContributor.values()].some((v) => v / volume > 0.5))
    return {
      method: ASSESSMENT_METHOD,
      status: "review_required" as const,
      pricePerKg: null,
      tradeCount: trades.length,
      independentContributors: contributors.size,
      includedIds: trades.map((e) => e.id),
      excluded,
      reason:
        "Contributor concentration exceeds the ALFA 50% review threshold.",
    };
  const values = trades.map((e) => e.pricePerKg),
    low = Math.min(...values),
    high = Math.max(...values);
  if (high / low > 1.25)
    return {
      method: ASSESSMENT_METHOD,
      status: "review_required" as const,
      pricePerKg: null,
      tradeCount: trades.length,
      independentContributors: contributors.size,
      includedIds: trades.map((e) => e.id),
      excluded,
      reason:
        "Wide price dispersion requires documented review; no observation is silently removed.",
    };
  return {
    method: ASSESSMENT_METHOD,
    status: "transaction_assessment" as const,
    pricePerKg:
      trades.reduce((s, e) => s + e.pricePerKg * e.quantityKg, 0) / volume,
    low,
    high,
    volumeKg: volume,
    tradeCount: trades.length,
    independentContributors: contributors.size,
    includedIds: trades.map((e) => e.id),
    excluded,
    reason:
      "Volume-weighted price of the specified verified transactions only; not a universal market price.",
  };
}
