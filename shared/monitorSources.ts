import { METAL_IDS } from "../supabase/functions/_shared/universe.ts";
import {
  classifyMonitorMaterial,
  decimal,
  finishMonitorEvent,
  sourceDay,
  type MonitorEvent,
  type MonitorStage,
  type ParsedMonitorRecord,
} from "./monitor.ts";
export type MonitorSourceId = "ted" | "usaspending" | "contracts-finder";
export const MONITOR_SOURCES = [
  {
    id: "ted",
    name: "TED — ЕС",
    home: "https://ted.europa.eu/",
    endpoint: "https://api.ted.europa.eu/v3/notices/search",
    host: "api.ted.europa.eu",
    license: "https://ted.europa.eu/en/legal-notice",
    regions: ["Европа"],
    interval: 1800,
  },
  {
    id: "usaspending",
    name: "USAspending — США",
    home: "https://www.usaspending.gov/",
    endpoint: "https://api.usaspending.gov/api/v2/search/spending_by_award/",
    host: "api.usaspending.gov",
    license: "https://www.usaspending.gov/about",
    regions: ["США"],
    interval: 3600,
  },
  {
    id: "contracts-finder",
    name: "Contracts Finder — Великобритания",
    home: "https://www.contractsfinder.service.gov.uk/",
    endpoint:
      "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search",
    host: "www.contractsfinder.service.gov.uk",
    license:
      "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    regions: ["Европа"],
    interval: 1800,
  },
] as const;
export const MONITOR_TERMS = [
  "tungsten",
  "molybdenum",
  "ferromolybdenum",
  "ferrotungsten",
  "tin",
  "zinc",
  "copper",
  "aluminium",
  "chromium",
  "cobalt",
  "zirconium",
  "niobium",
  "tantalum",
];
// Narrow USAspending's broad full-text search: company names / TIN / e-invoicing are not metal purchases.
export const MONITOR_US_TERMS = [
  "tungsten powder",
  "molybdenum powder",
  "ferromolybdenum",
  "ferrotungsten",
  "tin ingot",
  "zinc ingot",
  "copper cathode",
  "aluminum ingot",
  "chromium metal",
  "cobalt metal",
  "zirconium metal",
  "niobium metal",
  "tantalum powder",
];
export const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 5000) : null;
function localized(v: unknown): string | null {
  if (typeof v === "string") return text(v);
  const o = record(v);
  const a = o.eng ?? o.en ?? Object.values(o)[0];
  return text(Array.isArray(a) ? a[0] : a);
}
const EUROPE = new Set([
  "AUT",
  "BEL",
  "BGR",
  "HRV",
  "CYP",
  "CZE",
  "DNK",
  "EST",
  "FIN",
  "FRA",
  "DEU",
  "GRC",
  "HUN",
  "IRL",
  "ITA",
  "LVA",
  "LTU",
  "LUX",
  "MLT",
  "NLD",
  "POL",
  "PRT",
  "ROU",
  "SVK",
  "SVN",
  "ESP",
  "SWE",
  "GBR",
  "CHE",
  "NOR",
  "ISL",
  "LIE",
  "UKR",
  "MDA",
  "SRB",
  "ALB",
  "BIH",
  "MNE",
  "MKD",
]);
const countries: Record<string, string> = {
  DEU: "Германия",
  FRA: "Франция",
  GBR: "Великобритания",
  USA: "США",
  CHN: "Китай",
  JPN: "Япония",
  KOR: "Республика Корея",
  LUX: "Люксембург",
  ITA: "Италия",
  BEL: "Бельгия",
  ESP: "Испания",
  NLD: "Нидерланды",
  POL: "Польша",
  GRC: "Греция",
  NOR: "Норвегия",
  CHE: "Швейцария",
  FIN: "Финляндия",
  SWE: "Швеция",
  AUT: "Австрия",
  CZE: "Чехия",
  LTU: "Литва",
  MLT: "Мальта",
};
function geography(code: string | null) {
  return {
    country: code ? (countries[code] ?? code) : null,
    region:
      code && EUROPE.has(code)
        ? "Европа"
        : code === "USA"
          ? "США"
          : code && ["CHN", "JPN", "KOR", "IND", "TWN", "SGP"].includes(code)
            ? "Азия"
            : null,
  };
}
function base(
  sourceId: string,
  entityId: string,
  title: string,
  publishedOn: string | null,
): MonitorEvent {
  const classified = classifyMonitorMaterial(title);
  return {
    sourceId,
    entityId,
    processId: entityId,
    referenceId: null,
    sourceVersion: publishedOn,
    title,
    metalIds: classified.metalIds,
    country: null,
    countryBasis: "buyer",
    region: null,
    buyer: null,
    supplier: null,
    procurementType: null,
    procedureStatus: null,
    stage: "notice",
    publishedOn,
    decisionOn: null,
    signedOn: null,
    amount: null,
    currency: null,
    amountBasis: null,
    quantity: null,
    unit: null,
    specification: null,
    deliveryTerms: null,
    taxIncluded: null,
    logisticsIncluded: null,
    additionalCharges: null,
    singleMaterialLine: false,
    includesServices: null,
    priceKind: null,
    pricePerKg: null,
    priceReason: "missing_data",
    comparable: false,
    sourceUrl: "",
    reviewReasons: classified.reviewReasons,
    cancellationScope: null,
    fieldPaths: {},
  };
}
export function parseTed(
  input: unknown,
  now = Date.now(),
): ParsedMonitorRecord[] {
  const body = record(input);
  if (body.timedOut !== false || !Array.isArray(body.notices))
    throw Error("invalid_or_timed_out_ted_response");
  return body.notices.flatMap((value: unknown) => {
    const r = record(value),
      id = text(r["publication-number"]),
      title = localized(r["notice-title"]);
    if (!id || !/^\d+-\d{4}$/.test(id) || !title)
      throw Error("invalid_ted_notice");
    const e = base("ted", id, title, sourceDay(r["publication-date"]));
    e.referenceId = id;
    if (!e.metalIds.length) return [];
    if (
      array(r["classification-cpv"]).some(
        (c) => typeof c === "string" && /^(0934|33)/.test(c),
      )
    )
      e.reviewReasons.push("energy_or_medical_product_classification");
    const codes = [
      ...new Set(
        array(r["buyer-country"]).filter(
          (x): x is string => typeof x === "string",
        ),
      ),
    ];
    Object.assign(e, geography(codes.length === 1 ? codes[0] : null));
    e.buyer = localized(r["buyer-name"]);
    e.procedureStatus = text(r["notice-type"]);
    e.procurementType = text(r["form-type"]);
    const form = text(r["form-type"]);
    const stages: Record<string, MonitorStage> = {
      competition: "notice",
      result: "result",
      change: "amendment",
      "cont-modif": "amendment",
      planning: "notice",
    };
    e.stage = stages[form ?? ""] ?? "notice";
    if (!stages[form ?? ""]) e.reviewReasons.push("unmapped_notice_status");
    e.sourceUrl = `https://ted.europa.eu/en/notice/-/detail/${id}`;
    e.fieldPaths = {
      entityId: "publication-number",
      referenceId: "publication-number",
      title: "notice-title.eng",
      publishedOn: "publication-date",
      country: "buyer-country",
      buyer: "buyer-name",
      stage: "form-type",
    };
    return [{ event: finishMonitorEvent(e, now), raw: value }];
  });
}
export function parseUsaspending(
  input: unknown,
  now = Date.now(),
): ParsedMonitorRecord[] {
  const body = record(input);
  if (!Array.isArray(body.results) || !body.page_metadata)
    throw Error("invalid_usaspending_response");
  return body.results.flatMap((value: unknown) => {
    const r = record(value),
      id = text(r.generated_internal_id),
      title = text(r.Description);
    if (!id || !title) throw Error("invalid_award_record");
    const e = base(
      "usaspending",
      id,
      title,
      sourceDay(r["Last Modified Date"]),
    );
    if (!e.metalIds.length) return [];
    Object.assign(e, geography("USA"));
    e.countryBasis = "registry";
    e.stage = "award_record";
    e.referenceId = text(r["Award ID"]);
    e.procedureStatus = "Реестровая запись; исполнение не установлено";
    e.procurementType = "federal_contract_record";
    e.buyer = text(r["Awarding Agency"]);
    e.supplier = text(r["Recipient Name"]);
    e.amount = decimal(r["Award Amount"]);
    e.currency = e.amount === null ? null : "USD";
    e.amountBasis = "cumulative_obligations";
    e.priceKind = "obligation";
    e.sourceUrl = `https://www.usaspending.gov/award/${encodeURIComponent(id)}`;
    e.sourceVersion = text(r["Last Modified Date"]) ?? e.publishedOn;
    e.specification = title;
    const quantities = [
      ...title.matchAll(
        /(?:\bQTY\s*:\s*|^THE GOVERNMENT REQUIRES\s+)(\d{1,3}(?:,\d{3})+(?:\.\d{1,6})?|\d+(?:\.\d{1,6})?)\s*(KG|KILOGRAMS|LBS\.?|LB\.?|TONNES|T)\b/gi,
      ),
    ];
    if (quantities.length === 1) {
      e.quantity = decimal(quantities[0][1].replace(/,/g, ""));
      const unit = quantities[0][2].toUpperCase().replace(/\./g, "");
      e.unit =
        unit === "KG" || unit === "KILOGRAMS"
          ? "kg"
          : unit === "LBS" || unit === "LB"
            ? "lb"
            : "t";
    } else if (quantities.length > 1)
      e.reviewReasons.push("multiple_quantities_not_allocated");
    e.fieldPaths = {
      entityId: "generated_internal_id",
      referenceId: "Award ID",
      publishedOn: "Last Modified Date (day precision)",
      title: "Description",
      buyer: "Awarding Agency",
      supplier: "Recipient Name",
      amount: "Award Amount",
      currency: "USAspending contract amounts are USD (source schema)",
      country: "Federal registry jurisdiction, not delivery country",
      ...(e.quantity !== null
        ? {
            quantity:
              "Description (single explicit QTY / REQUIRES mass literal; not allocated to Award Amount)",
          }
        : {}),
    };
    return [{ event: finishMonitorEvent(e, now), raw: value }];
  });
}
/** OCDS object/ID-array merge for incremental releases; absence does not erase known fields. */
export function mergeOcds(previous: unknown, release: unknown): unknown {
  if (release === null) return null;
  if (Array.isArray(release)) {
    if (!release.every((x) => typeof record(x).id === "string")) return release;
    const old = array(previous),
      map = new Map(old.map((x) => [String(record(x).id), x]));
    for (const x of release)
      map.set(
        String(record(x).id),
        mergeOcds(map.get(String(record(x).id)), x),
      );
    return [...map.values()];
  }
  if (release && typeof release === "object") {
    const result = { ...record(previous) };
    for (const [k, v] of Object.entries(record(release))) {
      if (["__proto__", "constructor", "prototype"].includes(k)) continue;
      if (v === null) delete result[k];
      else result[k] = mergeOcds(result[k], v);
    }
    return result;
  }
  return release;
}
export function parseContractsFinderRelease(
  value: unknown,
  now = Date.now(),
): ParsedMonitorRecord[] {
  const r = record(value),
    t = record(r.tender),
    ocid = text(r.ocid),
    title = text(t.title);
  if (!ocid || !title || !text(r.id)) throw Error("invalid_ocds_release");
  const root = base(
    "contracts-finder",
    ocid + "/tender",
    title,
    sourceDay(r.date),
  );
  if (!root.metalIds.length) {
    const candidate = classifyMonitorMaterial(text(t.description) ?? "");
    if (!candidate.metalIds.length) return [];
    root.metalIds = candidate.metalIds;
    root.reviewReasons.push(
      ...candidate.reviewReasons,
      "material_only_in_description_check_procurement_scope",
    );
  }
  root.processId = ocid;
  root.referenceId = text(t.id);
  // Canonicalise only a real timestamp with a declared timezone, never invent one for a date.
  const releaseDate = text(r.date);
  root.sourceVersion =
    releaseDate &&
    /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(releaseDate) &&
    Number.isFinite(Date.parse(releaseDate))
      ? new Date(releaseDate).toISOString()
      : root.publishedOn;
  root.country = "Великобритания";
  root.countryBasis = "registry";
  root.region = "Европа";
  root.buyer = text(record(r.buyer).name);
  root.procedureStatus = text(t.status);
  root.procurementType =
    text(t.procurementMethod) ?? text(t.procurementMethodDetails);
  const urls = [
    ...array(t.documents),
    ...array(r.awards).flatMap((a) => array(record(a).documents)),
    ...array(r.contracts).flatMap((c) => array(record(c).documents)),
  ]
    .map((d) => text(record(d).url))
    .filter(
      (s): s is string =>
        !!s &&
        s.startsWith("https://www.contractsfinder.service.gov.uk/Notice/"),
    );
  root.sourceUrl =
    urls[0] ??
    `https://www.contractsfinder.service.gov.uk/Notice/${String(r.id).replace(/-\d+$/, "")}`;
  root.fieldPaths = {
    entityId: "ocid + tender/award id",
    referenceId: "tender.id / contracts[].id",
    title: "tender.title",
    publishedOn: "date",
    buyer: "buyer.name",
    country: "Contracts Finder UK buyer registry",
    stage: "tender.status / awards.status / contracts.status",
  };
  const output: ParsedMonitorRecord[] = [];
  if (t.status === "cancelled") {
    root.stage = "cancelled";
    root.cancellationScope = "procedure";
    return [{ event: finishMonitorEvent(root, now), raw: value }];
  }
  const awards = array(r.awards),
    contracts = array(r.contracts);
  if (!awards.length) {
    root.amount = decimal(record(t.value).amount);
    root.currency = text(record(t.value).currency);
    root.priceKind = "initial";
    root.amountBasis = "initial_tender_total";
    const items = array(t.items),
      item = record(items[0]);
    if (items.length === 1) {
      root.quantity = decimal(item.quantity);
      root.unit = text(record(item.unit).id);
      root.specification = text(item.description);
    }
    root.fieldPaths = {
      ...root.fieldPaths,
      amount: "tender.value.amount (initial budget only)",
      quantity: "tender.items[].quantity (not awarded quantity)",
    };
    root.stage = array(r.tag).some(
      (x) => x === "tenderAmendment" || x === "tenderUpdate",
    )
      ? "amendment"
      : "notice";
    return [{ event: finishMonitorEvent(root, now), raw: value }];
  }
  for (const a of awards) {
    const award = record(a),
      aid = text(award.id);
    if (!aid) throw Error("missing_award_id");
    const c = record(contracts.find((x) => record(x).awardID === aid)),
      e = {
        ...root,
        fieldPaths: { ...root.fieldPaths },
        reviewReasons: [...root.reviewReasons],
        entityId: ocid + "/award/" + aid,
      };
    e.stage =
      award.status === "cancelled"
        ? "cancelled"
        : award.status === "active"
          ? "award"
          : "result";
    e.cancellationScope = e.stage === "cancelled" ? "entity" : null;
    if (c.status === "terminated") {
      e.stage = "terminated";
      e.cancellationScope = "entity";
    } else if (sourceDay(c.dateSigned)) {
      e.stage = "signed";
      e.signedOn = sourceDay(c.dateSigned);
    }
    // A passed end date or OCDS contract.status=terminated/active does NOT prove delivered goods.
    e.referenceId = text(c.id) ?? root.referenceId ?? aid;
    e.decisionOn = sourceDay(award.date);
    e.procedureStatus = text(c.status) ?? text(award.status);
    const suppliers = array(award.suppliers)
      .map((s) => text(record(s).name))
      .filter(Boolean);
    e.supplier = suppliers.length === 1 ? suppliers[0] : null;
    if (suppliers.length > 1)
      e.reviewReasons.push("multiple_suppliers_not_allocated");
    const valueObj = record(Object.keys(c).length ? c.value : award.value);
    e.amount = decimal(valueObj.amount);
    e.currency = text(valueObj.currency);
    e.priceKind = e.stage === "signed" ? "signed_contract" : "award";
    e.amountBasis = "contract_total_unallocated";
    const items = array(c.items).length ? array(c.items) : array(award.items); // Never reuse tender quantities for an awarded contract.
    const item = record(items[0]),
      unit = record(item.unit);
    if (items.length === 1) {
      e.quantity = decimal(item.quantity);
      e.unit = text(unit.id);
      e.specification = text(item.description);
      e.singleMaterialLine = true;
    }
    // Source must explicitly allocate line value and exclude services; titles alone cannot establish this.
    // OCDS goods category / one item do not prove the absence of ancillary services or allocated taxes.
    // Keep price blocked until explicit source allocation is verified; never infer it from title or a total.
    e.fieldPaths = {
      ...e.fieldPaths,
      decisionOn: "awards[].date",
      signedOn: "contracts[].dateSigned",
      amount: "contracts[].value / awards[].value",
      supplier: "awards[].suppliers",
      quantity: "contracts[].items / awards[].items (never tender.items)",
      unit: "awarded item.unit.id",
    };
    output.push({ event: finishMonitorEvent(e, now), raw: value });
  }
  return output;
}
export function monitorRequest(
  sourceId: MonitorSourceId,
  cursor: Record<string, unknown>,
  now = Date.now(),
) {
  const source = MONITOR_SOURCES.find((s) => s.id === sourceId)!;
  const page = Number.isInteger(cursor.page) ? Number(cursor.page) : 1;
  if (sourceId === "ted")
    return {
      url: source.endpoint,
      method: "POST",
      body: {
        query: `(${MONITOR_TERMS.map((s) => `notice-title ~ "${s}"`).join(" OR ")}) SORT BY publication-date DESC`,
        fields: [
          "publication-number",
          "publication-date",
          "notice-title",
          "buyer-country",
          "buyer-name",
          "notice-type",
          "form-type",
          "classification-cpv",
        ],
        limit: 20,
        page,
        scope: "ALL",
      },
    };
  if (sourceId === "usaspending")
    return {
      url: source.endpoint,
      method: "POST",
      body: {
        filters: {
          keywords: MONITOR_US_TERMS,
          award_type_codes: ["A", "B", "C", "D"],
        },
        fields: [
          "Award ID",
          "Recipient Name",
          "Award Amount",
          "Description",
          "Awarding Agency",
          "Start Date",
          "Last Modified Date",
          "generated_internal_id",
        ],
        page,
        limit: 20,
        sort: "Last Modified Date",
        order: "desc",
      },
    };
  const end = new Date(now).toISOString(),
    from =
      typeof cursor.from === "string"
        ? cursor.from
        : new Date(now - 86400000).toISOString();
  const width =
    typeof cursor.windowMs === "number"
      ? Math.max(60000, Math.min(cursor.windowMs, 86400000))
      : 86400000;
  const to =
    typeof cursor.to === "string"
      ? cursor.to
      : new Date(Math.min(Date.parse(from) + width, now)).toISOString();
  const url = new URL(source.endpoint);
  url.searchParams.set("publishedFrom", from);
  url.searchParams.set("publishedTo", to);
  return {
    url: url.href,
    method: "GET",
    body: undefined,
    window: { from, to },
    end,
  };
}
export const MONITOR_UNIVERSE = [...METAL_IDS];
