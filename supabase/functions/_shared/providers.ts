import { isMetal, isRegion } from "./universe.ts";
/** Contract for licensed/public source adapters. Values are never inferred from metal names. */
export interface ProviderQuote {
  metalId: string;
  sourceId: string;
  price: number;
  currency: "USD";
  unit: "kg" | "ton" | "g" | "ozt" | "lb";
  region: string;
  country: string | null;
  purity: number | null;
  elementContent: number | null;
  deliveryTerms: string;
  marketType:
    "exchange" | "spot" | "wholesale" | "regional" | "scrap" | "raw" | "alloy";
  grade: string;
  productForm: string;
  composition: string | null;
  priceType: string;
  publishedAt: string;
  retrievedAt: string;
  sourceUrl: string;
}
export interface QuoteProvider {
  readonly sourceId: string;
  fetchQuotes(signal: AbortSignal): Promise<unknown>;
  parse(payload: unknown): ProviderQuote[];
}
const units: Record<string, number> = {
  kg: 1,
  ton: 1000,
  g: 0.001,
  ozt: 0.0311034768,
  lb: 0.45359237,
};
export function parseProviderQuote(
  input: unknown,
  now = Date.now(),
  maxAgeMs = 4 * 86400000,
): ProviderQuote {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("invalid_record");
  const r = input as Record<string, unknown>;
  for (const k of [
    "metalId",
    "sourceId",
    "region",
    "marketType",
    "grade",
    "productForm",
    "priceType",
    "publishedAt",
    "retrievedAt",
    "sourceUrl",
  ]) {
    if (typeof r[k] !== "string" || !r[k].trim() || r[k].length > 500)
      throw new Error("missing_specification");
  }
  if (typeof r.price !== "number" || !Number.isFinite(r.price) || r.price <= 0)
    throw new Error("invalid_price");
  if (
    r.currency !== "USD" ||
    typeof r.unit !== "string" ||
    !Object.prototype.hasOwnProperty.call(units, r.unit)
  )
    throw new Error("unsupported_currency_or_unit");
  if (
    ![
      "exchange",
      "spot",
      "wholesale",
      "regional",
      "scrap",
      "raw",
      "alloy",
    ].includes(r.marketType as string)
  )
    throw new Error("invalid_market");
  if (
    !["spot", "futures", "bid", "ask", "transaction", "assessment"].includes(
      r.priceType as string,
    )
  )
    throw new Error("invalid_price_type");
  if (
    r.composition !== null &&
    (typeof r.composition !== "string" || r.composition.length > 2000)
  )
    throw new Error("invalid_composition");
  const published = Date.parse(r.publishedAt as string),
    retrieved = Date.parse(r.retrievedAt as string);
  if (
    !Number.isFinite(published) ||
    !Number.isFinite(retrieved) ||
    published > now + 300000 ||
    now - published > maxAgeMs ||
    retrieved < published - 300000 ||
    retrieved > now + 300000
  )
    throw new Error("invalid_timestamp");
  if (!isMetal(r.metalId) || !isRegion(r.region))
    throw new Error("unsupported_metal_or_region");
  if (
    r.region === "Азия" &&
    (typeof r.country !== "string" || !r.country.trim())
  )
    throw new Error("missing_country");
  if (
    r.country !== null &&
    (typeof r.country !== "string" || r.country.length > 100)
  )
    throw new Error("invalid_country");
  if (
    typeof r.deliveryTerms !== "string" ||
    !r.deliveryTerms.trim() ||
    r.deliveryTerms.length > 300
  )
    throw new Error("missing_delivery_terms");
  for (const k of ["purity", "elementContent"])
    if (
      r[k] !== null &&
      (typeof r[k] !== "number" ||
        !Number.isFinite(r[k]) ||
        r[k] <= 0 ||
        r[k] > 100)
    )
      throw new Error("invalid_content");
  if (r.purity === null && r.elementContent === null)
    throw new Error("missing_composition");
  const url = new URL(r.sourceUrl as string);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("invalid_source_url");
  return r as unknown as ProviderQuote;
}
export function normalizeProviderQuote(q: ProviderQuote, quality: number) {
  return {
    metal_id: q.metalId,
    source_id: q.sourceId,
    original_price: q.price,
    original_currency: q.currency,
    original_unit: q.unit,
    normalized_price: q.price / units[q.unit],
    normalized_currency: "USD",
    normalized_unit: "kg",
    region: q.region,
    country: q.country,
    purity: q.purity,
    element_content: q.elementContent,
    delivery_terms: q.deliveryTerms,
    market_type: q.marketType,
    grade: q.grade,
    product_form: q.productForm,
    composition: q.composition,
    price_type: q.priceType,
    quality_score: quality,
    quoted_at: q.publishedAt,
    retrieved_at: q.retrievedAt,
    source_url: q.sourceUrl,
    attribution: q.sourceId,
    data_status: "live",
    validation_status: "valid",
  };
}
