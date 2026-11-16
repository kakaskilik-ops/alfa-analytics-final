import { it, expect } from "vitest";
import { parseFxRows, fxPair, convertMoney, type FxRate } from "@/services/fx";
const now = Date.parse("2026-11-13T12:00:00Z");
const row = (date: string, rate: number, patch = {}) => ({
  base_currency: "USD",
  quote_currency: "RUB",
  rate,
  rate_date: date,
  retrieved_at: new Date(now).toISOString(),
  data_status: "live",
  source_id: "frankfurter-v2",
  ...patch,
});
it("compares the previous available date, not a missing calendar day", () => {
  const data = parseFxRows(
    [row("2026-11-13", 100), row("2026-11-10", 80)],
    now,
  );
  const p = fxPair(data, "USD", "RUB", now);
  expect(p.change).toBe(20);
  expect(p.changePct).toBe(25);
  expect(p.previous?.date).toBe(Date.parse("2026-11-10"));
  expect(data).toHaveLength(2);
});
it("excludes malformed, nonpositive, future, duplicate and other-source rows", () => {
  expect(
    parseFxRows(
      [
        row("2026-11-13", 100),
        row("2026-11-13", 200),
        row("2026-11-14", 150),
        row("2026-11-12", 0),
        row("bad", 10),
        row("2026-11-11", 10, { source_id: "other" }),
      ],
      now,
    ),
  ).toHaveLength(1);
});
it("converts zero, decimal comma and identity but rejects invalid or stale values", () => {
  const data = parseFxRows([row("2026-11-13", 100)], now);
  expect(convertMoney("1,5", "USD", "RUB", data, now)).toBe(150);
  expect(convertMoney("0", "USD", "RUB", data, now)).toBe(0);
  expect(convertMoney("3", "USD", "USD", [], now)).toBe(3);
  for (const v of ["", "-1", "Infinity", "NaN", "0x10", "1e3", "12abc"])
    expect(convertMoney(v, "USD", "RUB", data, now)).toBeNull();
  expect(convertMoney("1", "USD", "RUB", data, now + 5 * 86400000)).toBeNull();
  expect(convertMoney("1", "EUR", "USD", data, now)).toBeNull();
});
it("does not calculate a change without two dated observations", () => {
  const p = fxPair([] as FxRate[], "USD", "RUB", now);
  expect(p.latest).toBeNull();
  expect(p.change).toBeNull();
});
