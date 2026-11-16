import { it, expect, vi } from "vitest";
const fixture = vi.hoisted(() => {
  const rows = ["aluminum", "copper", "tin", "zinc"]
    .flatMap((metal) =>
      Array.from({ length: 200 }, (_, i) => ({
        metal_id: metal,
        source_id: "world-bank-pink-sheet",
        period_start: new Date(Date.UTC(2000, i, 1)).toISOString().slice(0, 10),
        price: 100 + i,
        currency: "USD",
        unit: "ton",
        region: "Мировой ориентир (LME)",
        specification: "TEST ONLY",
        retrieved_at: "2020-01-01T00:00:00Z",
      })),
    )
    .sort((a, b) => a.period_start.localeCompare(b.period_start));
  const pages: number[][] = [];
  return { rows, pages };
});
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: async (start: number, end: number) => {
          fixture.pages.push([start, end]);
          return { data: fixture.rows.slice(start, end + 1), error: null };
        },
      };
      return query;
    },
  },
}));
import { fetchReferencePrices } from "@/services/referenceMarkets";
it("reads all pages of a long public history instead of silently truncating at six hundred rows", async () => {
  const rows = await fetchReferencePrices();
  expect(rows).toHaveLength(800);
  expect(rows.filter((r) => r.metal_id === "copper")).toHaveLength(200);
  expect(fixture.pages).toEqual([
    [0, 499],
    [500, 999],
  ]);
  await fetchReferencePrices();
  expect(fixture.pages).toHaveLength(2);
});
