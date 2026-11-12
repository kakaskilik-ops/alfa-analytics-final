import { parseProviderQuote, normalizeProviderQuote } from "./providers.ts";
import { guard } from "./http.ts";
function assert(ok: boolean) {
  if (!ok) throw new Error("Assertion failed");
}
const now = Date.now();
const quote = {
  metalId: "copper",
  sourceId: "test-fixture",
  price: 1000,
  currency: "USD",
  unit: "ton",
  region: "Россия",
  marketType: "wholesale",
  grade: "М1",
  productForm: "Катод",
  composition: null,
  priceType: "assessment",
  publishedAt: new Date(now - 1000).toISOString(),
  retrievedAt: new Date(now).toISOString(),
  sourceUrl: "https://example.com/quote",
};
Deno.test("provider: canonical mass normalization", () => {
  const r = normalizeProviderQuote(parseProviderQuote(quote, now), 0.8);
  assert(r.normalized_price === 1);
  assert(r.original_price === 1000);
});
for (const patch of [
  { price: 0 },
  { currency: "RUB" },
  { unit: "short-ton" },
  { unit: "constructor" },
  { publishedAt: "bad" },
  { sourceUrl: "javascript:alert(1)" },
  { grade: "" },
  { priceType: "unknown" },
  { composition: 42 },
])
  Deno.test(`provider rejects ${JSON.stringify(patch)}`, () => {
    let rejected = false;
    try {
      parseProviderQuote({ ...quote, ...patch }, now);
    } catch {
      rejected = true;
    }
    assert(rejected);
  });
Deno.test("http: only POST and configured Origin", () => {
  assert(
    guard(new Request("https://example.com", { method: "GET" }))?.status ===
      405,
  );
  assert(
    guard(
      new Request("https://example.com", {
        method: "POST",
        headers: { Origin: "https://unexpected.example" },
      }),
    )?.status === 403,
  );
});
