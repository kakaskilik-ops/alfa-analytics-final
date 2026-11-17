import { describe, it, expect } from "vitest";
import ted from "../../tests/fixtures/monitor/ted.json";
import usa from "../../tests/fixtures/monitor/usaspending.json";
import cf from "../../tests/fixtures/monitor/contracts-finder.json";
import {
  classifyMonitorMaterial,
  unitPrice,
  finishMonitorEvent,
  monitorStory,
  sourceDay,
  monitorComparisonKey,
} from "../../shared/monitor";
import {
  parseTed,
  parseUsaspending,
  parseContractsFinderRelease,
  mergeOcds,
  monitorRequest,
} from "../../shared/monitorSources";
const official = parseUsaspending(usa)[0].event;
describe("market monitor: original source facts", () => {
  it("retains exact USA obligation amount and explicit mass without inventing a unit price", () => {
    const rows = parseUsaspending(usa);
    for (const { event: e, raw } of rows) {
      const r = raw as Record<string, unknown>;
      expect(e.amount).toBe(String(r["Award Amount"]));
      expect(e.referenceId).toBe(r["Award ID"]);
      expect(e.pricePerKg).toBeNull();
      expect(e.stage).toBe("award_record");
      expect(e.signedOn).toBeNull();
      expect(e.decisionOn).toBeNull();
      expect(e.amountBasis).toBe("cumulative_obligations");
    }
    expect(
      rows.find((x) => x.event.title.includes("420.00KG"))?.event.quantity,
    ).toBe("420.00");
    expect(rows[0].event.quantity).toBe("34000");
    expect(rows[0].event.unit).toBe("lb");
  });
  it("does not promote TED result notices to signed sales or medical Mo to metal news", () => {
    const rows = parseTed(ted);
    expect(rows.filter((x) => !x.event.reviewReasons.length)).toHaveLength(3);
    expect(
      rows.find((x) => x.event.entityId === "59182-2021")?.event.stage,
    ).toBe("result");
    expect(
      rows
        .filter((x) => x.event.title.includes("technetium"))
        .every((x) => x.event.reviewReasons.length > 0),
    ).toBe(true);
    for (const x of rows) {
      expect(x.event.amount).toBeNull();
      expect(x.event.pricePerKg).toBeNull();
    }
  });
  it("reads the real Birmingham award, not a fulfilled sale, and leaves mass unknown", () => {
    const rows = cf.releases.flatMap((r) => parseContractsFinderRelease(r));
    const e = rows.find((x) =>
      x.event.title.includes("Spherical Tungsten Powder"),
    )!.event;
    expect(e.amount).toBe("30266.39");
    expect(e.currency).toBe("GBP");
    expect(e.supplier).toBe("ACANTECS LIMITED");
    expect(e.stage).toBe("award");
    expect(e.decisionOn).toBe("2023-10-17");
    expect(e.referenceId).toBe("SC12023/23");
    expect(e.sourceVersion).toBe("2023-10-23T14:34:11.000Z");
    expect(e.signedOn).toBeNull();
    expect(e.quantity).toBeNull();
    expect(e.pricePerKg).toBeNull();
    expect(e.reviewReasons).toEqual([]);
    expect(monitorStory(e).text).toContain(
      "не подтверждают состоявшуюся поставку",
    );
  });
  it("keeps description-only remediation out of public metal purchases", () => {
    const [e] = parseContractsFinderRelease(cf.releases[0]);
    expect(e.event.reviewReasons).toContain(
      "material_only_in_description_check_procurement_scope",
    );
  });
});
describe("market monitor: independent safeguards (synthetic inputs only)", () => {
  it.each([
    "Tungsten e-invoicing software",
    "Molybdenum-99 generator",
    "Preparation and application of niobium metal coupons",
    "ALUMINUM INGOT A356.2",
    "Copper wire installation",
  ])("queues ambiguous product %s", (title) =>
    expect(classifyMonitorMaterial(title).reviewReasons.length).toBeGreaterThan(
      0,
    ),
  );
  it("distinguishes ferroalloys and rejects impossible calendar dates", () => {
    expect(classifyMonitorMaterial("ferromolybdenum ingot").metalIds).toEqual([
      "ferromolybdenum",
    ]);
    expect(classifyMonitorMaterial("ferrotungsten").metalIds).toEqual([
      "ferrotungsten",
    ]);
    expect(sourceDay("2026-02-30")).toBeNull();
    expect(sourceDay("2024-02-29+02:00")).toBe("2024-02-29");
  });
  const priced = {
    ...official,
    metalIds: ["tungsten"],
    amount: "12345.67",
    quantity: "2.5",
    unit: "t",
    currency: "USD",
    amountBasis: "single_material_line",
    singleMaterialLine: true,
    includesServices: false,
    priceKind: "award" as const,
    reviewReasons: [],
  };
  it("uses exact decimals and correct mass conversion", () => {
    expect(unitPrice(priced).value).toBe("4.938268000000");
    expect(
      unitPrice({ ...priced, amount: "1", quantity: "1", unit: "lb" }).value,
    ).toBe("2.204622621849");
    expect(unitPrice({ ...priced, quantity: "0" }).value).toBeNull();
    expect(unitPrice({ ...priced, unit: "pieces" }).value).toBeNull();
  });
  it("rejects mixed totals, services, obligations and unreviewed prices", () => {
    for (const changes of [
      { includesServices: true },
      { includesServices: null },
      { singleMaterialLine: false },
      { amountBasis: "total" },
      { priceKind: "obligation" as const },
    ])
      expect(unitPrice({ ...priced, ...changes }).value).toBeNull();
    expect(
      finishMonitorEvent({ ...priced, reviewReasons: ["ambiguous"] })
        .pricePerKg,
    ).toBeNull();
    expect(
      finishMonitorEvent({ ...priced, metalIds: ["tungsten", "copper"] })
        .pricePerKg,
    ).toBeNull();
  });
  it("keeps different specifications/countries/currencies in separate series", () => {
    expect(monitorComparisonKey(priced)).not.toBe(
      monitorComparisonKey({ ...priced, currency: "EUR" }),
    );
    expect(monitorComparisonKey(priced)).not.toBe(
      monitorComparisonKey({ ...priced, specification: "99.99%" }),
    );
  });
  it("merges incremental cancellations, retains known awards, never borrows tender mass", () => {
    const r = {
      ocid: "TEST",
      id: "TEST-1",
      date: "2026-11-15T00:00:00Z",
      buyer: { name: "TEST" },
      tender: {
        title: "Tungsten powder",
        status: "complete",
        items: [{ id: "1", quantity: 999, unit: { id: "kg" } }],
      },
      awards: [
        { id: "A", status: "active", value: { amount: 100, currency: "GBP" } },
      ],
    };
    expect(parseContractsFinderRelease(r)[0].event.quantity).toBeNull();
    const initial = parseContractsFinderRelease({
      ...r,
      awards: [],
      tender: {
        ...r.tender,
        status: "active",
        value: { amount: 100, currency: "GBP" },
      },
    })[0].event;
    expect(initial.stage).toBe("notice");
    expect(initial.amount).toBe("100");
    expect(initial.priceKind).toBe("initial");
    expect(initial.quantity).toBe("999");
    expect(initial.pricePerKg).toBeNull();
    const merged = mergeOcds(r, {
      id: "TEST-2",
      date: "2026-11-16T00:00:00Z",
      tender: { status: "cancelled" },
    });
    const e = parseContractsFinderRelease(merged)[0].event;
    expect(e.stage).toBe("cancelled");
    expect(e.cancellationScope).toBe("procedure");
  });
  it("uses actual searches, bounded OCDS windows, no syntax-only TED requests", () => {
    const a = monitorRequest("ted", {});
    expect(a.body).not.toHaveProperty("checkQuerySyntax");
    expect(a.body).toHaveProperty("scope", "ALL");
    const c = monitorRequest(
      "contracts-finder",
      {},
      Date.parse("2026-11-17T00:00:00Z"),
    );
    expect(c.window?.from).toBe("2026-11-16T00:00:00.000Z");
  });
});
