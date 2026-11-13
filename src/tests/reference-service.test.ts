import { it, expect } from "vitest";
import { parseReferenceRows } from "@/services/referenceMarkets";
const now = Date.parse("2026-11-13T12:00:00Z");
const row = {
  metal_id: "copper",
  source_id: "world-bank-pink-sheet",
  period_start: "2026-10-01",
  price: 100,
  currency: "USD",
  unit: "ton",
  region: "Мировой ориентир (LME)",
  specification: "TEST",
  retrieved_at: "2026-11-13T10:00:00Z",
};
it("keeps the latest revision of a month without mixing specification, region or unit", () => {
  const rows = parseReferenceRows(
    [
      row,
      { ...row, price: 110, retrieved_at: "2026-11-13T11:00:00Z" },
      { ...row, price: 120, unit: "kg" },
      { ...row, price: 130, region: "Европа" },
      { ...row, metal_id: "gold" },
    ],
    now,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].price).toBe(110);
});
it("does not display a current incomplete month or invalid price as monthly history", () => {
  expect(
    parseReferenceRows(
      [
        { ...row, period_start: "2026-11-01" },
        { ...row, price: -1 },
        { ...row, price: NaN },
        { ...row, source_id: "unapproved" },
      ],
      now,
    ),
  ).toEqual([]);
});
