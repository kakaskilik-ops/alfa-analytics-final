import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ publicPrices: vi.fn(), from: vi.fn() }));
vi.mock("../services/referenceMarkets", () => ({
  fetchReferencePrices: mocks.publicPrices,
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));
import { fetchPrimaryPrices } from "../services/displayedPrices";
const synthetic = {
  metal_id: "tungsten",
  minimum_usd_kg: null,
  maximum_usd_kg: null,
  point_usd_kg: 10,
  mass_basis: "metal",
  verification_status: "unverified",
  specification: "TEST_ONLY",
  recorded_at: "2026-01-01T00:00:00Z",
};
beforeEach(() => vi.resetAllMocks());
function database(privateError: boolean) {
  mocks.from.mockImplementation((table: string) => {
    const chain = {
      select: () => chain,
      order: () => chain,
      limit: async () =>
        table === "private_market_references"
          ? {
              data: privateError ? null : [synthetic],
              error: privateError ? { message: "fixture denied" } : null,
            }
          : { data: [], error: null },
    };
    return chain;
  });
}
it("keeps owner references available when the public source fails", async () => {
  database(false);
  mocks.publicPrices.mockRejectedValue(Error("fixture unavailable"));
  const rows = await fetchPrimaryPrices();
  expect(rows).toHaveLength(1);
  expect(rows[0].pricePerKg).toBe(10);
  expect(rows[0].category).toBe("owner_reference");
});
it("reports private read failures instead of silently replacing owner values", async () => {
  database(true);
  mocks.publicPrices.mockResolvedValue([]);
  await expect(fetchPrimaryPrices()).rejects.toThrow("частные исторические");
});
