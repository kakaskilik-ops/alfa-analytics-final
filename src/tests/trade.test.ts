import { it, expect } from "vitest";
import { parseComtrade, comtradeUrl } from "../../shared/trade";
const now = Date.parse("2026-11-13"),
  row = {
    typeCode: "C",
    freqCode: "A",
    refYear: 2025,
    period: "2025",
    reporterCode: 156,
    flowCode: "M",
    partnerCode: 0,
    partner2Code: 0,
    classificationCode: "H6",
    cmdCode: "810110",
    customsCode: "C00",
    motCode: 0,
    netWgt: 10,
    primaryValue: 100,
    isNetWgtEstimated: true,
    isReported: false,
    isAggregate: true,
  };
const body = (r = row) => ({ data: [r], count: 1, error: "" });
it("keeps trade values and mass separate, including source estimation flags", () => {
  const rows = parseComtrade(body(), "tungsten", now);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({
    metric: "import_value",
    unit: "USD",
    value: 100,
    country: "Китай",
    source_aggregate: true,
  });
  expect(rows[1]).toMatchObject({
    metric: "import_mass",
    unit: "kg",
    value: 10,
    estimated: true,
  });
  expect(rows.every((r) => !r.metric.includes("price"))).toBe(true);
});
it("does not infer a price or a zero for a missing weight", () => {
  const rows = parseComtrade(
    body({ ...row, netWgt: null as unknown as number }),
    "tungsten",
    now,
  );
  expect(rows).toHaveLength(1);
});
it("rejects ambiguous material mappings, changed HS versions and dimensions", () => {
  expect(() => comtradeUrl("niobium", now)).toThrow();
  for (const patch of [
    { cmdCode: "TOTAL" },
    { classificationCode: "H5" },
    { reporterCode: 0 },
    { partnerCode: 156 },
    { refYear: 2026, period: "2026" },
    { primaryValue: -1 },
  ])
    expect(() =>
      parseComtrade(body({ ...row, ...patch }), "tungsten", now),
    ).toThrow();
});
it("rejects a truncated or duplicate preview response", () => {
  expect(() =>
    parseComtrade({ data: [row], count: 500 }, "tungsten", now),
  ).toThrow();
  expect(() =>
    parseComtrade({ data: [row, row], count: 2 }, "tungsten", now),
  ).toThrow();
});
it("uses only the official preview host and bounded product/country/year parameters", () => {
  const u = new URL(comtradeUrl("tungsten", now));
  expect(u.hostname).toBe("comtradeapi.un.org");
  expect(u.searchParams.get("period")).toBe("2025");
  expect(u.searchParams.get("maxRecords")).toBe("100");
});
