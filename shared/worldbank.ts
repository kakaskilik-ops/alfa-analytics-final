import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import {
  REFERENCE_SERIES,
  type ReferenceObservation,
} from "./referenceMarkets.ts";
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v
    : v && typeof v === "object"
      ? [v as Record<string, unknown>]
      : [];
function xml(bytes: Uint8Array) {
  const s = strFromU8(bytes);
  if (s.length > 12000000 || /<!DOCTYPE|<!ENTITY/i.test(s))
    throw new Error("unsafe_workbook_xml");
  return new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    removeNSPrefix: true,
    processEntities: false,
  }).parse(s);
}
function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    return (
      text(r.t ?? r["#text"]) ||
      list(r.r)
        .map((x) => text(x.t))
        .join("")
    );
  }
  return "";
}
/** Read only publisher-provided numeric cells; no formulas/macros are executed. */
export function parseWorldBankWorkbook(
  bytes: Uint8Array,
  now = Date.now(),
): ReferenceObservation[] {
  if (
    bytes.length > 2500000 ||
    bytes.length < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b
  )
    throw new Error("invalid_workbook");
  const entries = unzipSync(bytes, {
    filter: (f) =>
      f.name === "xl/workbook.xml" ||
      f.name === "xl/_rels/workbook.xml.rels" ||
      f.name === "xl/sharedStrings.xml" ||
      /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name)
        ? f.originalSize <= 10000000
        : false,
  });
  if (Object.values(entries).reduce((s, v) => s + v.length, 0) > 18000000)
    throw new Error("workbook_too_large");
  if (!entries["xl/workbook.xml"] || !entries["xl/_rels/workbook.xml.rels"])
    throw new Error("invalid_workbook_structure");
  const workbook = xml(entries["xl/workbook.xml"]),
    rels = xml(entries["xl/_rels/workbook.xml.rels"]);
  const sheet = list(workbook.workbook?.sheets?.sheet).find(
    (s) => String(s["@_name"]).trim() === "Monthly Prices",
  );
  if (!sheet) throw new Error("monthly_sheet_not_found");
  const relation = list(rels.Relationships?.Relationship).find(
    (r) => r["@_Id"] === sheet["@_id"],
  );
  const target = String(relation?.["@_Target"] ?? "")
    .replace(/^\//, "")
    .replace(/^xl\//, "");
  if (!/^worksheets\/sheet\d+\.xml$/.test(target) || !entries["xl/" + target])
    throw new Error("invalid_sheet_reference");
  const strings = entries["xl/sharedStrings.xml"]
    ? list(xml(entries["xl/sharedStrings.xml"]).sst?.si).map(text)
    : [];
  const worksheet = xml(entries["xl/" + target]);
  const rows = list(worksheet.worksheet?.sheetData?.row);
  if (rows.length > 2000) throw new Error("too_many_workbook_rows");
  const matrix = rows.map((r) => {
    const cells = new Map<string, string>();
    for (const c of list(r.c)) {
      const col = String(c["@_r"] ?? "").replace(/\d+$/, "");
      if (!/^[A-Z]{1,3}$/.test(col) || c.f !== undefined) continue;
      const raw =
        c["@_t"] === "s"
          ? strings[Number(c.v)]
          : c["@_t"] === "inlineStr"
            ? text(c.is)
            : text(c.v);
      cells.set(col, raw ?? "");
    }
    return cells;
  });
  const columns = new Map<string, string>();
  for (const series of REFERENCE_SERIES) {
    const header = matrix
      .slice(0, 12)
      .flatMap((r) =>
        [...r].filter(
          ([, v]) => v.trim().toLowerCase() === series.column.toLowerCase(),
        ),
      );
    if (header.length !== 1) throw new Error("unexpected_reference_columns");
    const col = header[0][0];
    const unit = matrix
      .slice(0, 12)
      .some((r) =>
        /^\(?\$\/mt\)?$/i.test((r.get(col) ?? "").replace(/\s/g, "")),
      );
    if (!unit) throw new Error("unexpected_reference_unit");
    columns.set(series.id, col);
  }
  const date = new Date(now),
    lastCompleteMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
    cutoff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 36, 1);
  const result: ReferenceObservation[] = [];
  const seen = new Set<string>();
  for (const row of matrix) {
    const month = row.get("A") ?? "";
    const match = /^(\d{4})M(0[1-9]|1[0-2])$/.exec(month);
    if (!match) continue;
    const at = Date.UTC(Number(match[1]), Number(match[2]) - 1, 1);
    if (at >= lastCompleteMonth || at < cutoff) continue;
    for (const series of REFERENCE_SERIES) {
      const raw = row.get(columns.get(series.id)!) ?? "";
      if (!raw || raw === ".." || raw === "…") continue;
      const price = Number(raw);
      if (!Number.isFinite(price) || price <= 0 || price >= 1e9)
        throw new Error("invalid_reference_price");
      const period_start = `${match[1]}-${match[2]}-01`,
        key = series.id + period_start;
      if (seen.has(key)) throw new Error("duplicate_reference_month");
      seen.add(key);
      result.push({
        metal_id: series.id,
        period_start,
        price,
        currency: "USD",
        unit: "ton",
        region: "Мировой ориентир (LME)",
        specification: series.specification,
      });
    }
  }
  if (!result.length) throw new Error("no_reference_observations");
  return result;
}
