import { it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { parseWorldBankWorkbook } from "../../shared/worldbank";
// Synthetic workbook used only by tests, never inserted as production prices.
function workbook(unit = "($/mt)", date = "2026M10", extra = "") {
  const cells = ["Aluminum", "Copper", "Tin", "Zinc"]
    .map(
      (v, i) =>
        `<c r="${String.fromCharCode(66 + i)}1" t="inlineStr"><is><t>${v}</t></is></c>`,
    )
    .join("");
  const units = ["B", "C", "D", "E"]
    .map((c) => `<c r="${c}2" t="inlineStr"><is><t>${unit}</t></is></c>`)
    .join("");
  const values = ["B", "C", "D", "E"]
    .map((c, i) => `<c r="${c}3"><v>${100 + i}</v></c>`)
    .join("");
  return zipSync({
    "xl/workbook.xml": strToU8(
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Monthly Prices" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<worksheet><sheetData><row>${cells}</row><row>${units}</row><row><c r="A3" t="inlineStr"><is><t>${date}</t></is></c>${values}</row>${extra}</sheetData></worksheet>`,
    ),
  });
}
const now = Date.parse("2026-11-13T12:00:00Z");
it("reads four separately specified monthly LME-based world reference series", () => {
  const rows = parseWorldBankWorkbook(workbook(), now);
  expect(rows).toHaveLength(4);
  expect(rows.map((r) => r.metal_id)).toEqual([
    "aluminum",
    "copper",
    "tin",
    "zinc",
  ]);
  expect(
    rows.every(
      (r) =>
        r.currency === "USD" &&
        r.unit === "ton" &&
        r.period_start === "2026-10-01" &&
        r.region === "Мировой ориентир (LME)",
    ),
  ).toBe(true);
});
it("fails closed on changed units and future/current incomplete periods", () => {
  expect(() => parseWorldBankWorkbook(workbook("($/kg)"), now)).toThrow(
    "unexpected_reference_unit",
  );
  expect(() =>
    parseWorldBankWorkbook(workbook("($/mt)", "2026M11"), now),
  ).toThrow("no_reference_observations");
  expect(() =>
    parseWorldBankWorkbook(workbook("($/mt)", "2027M01"), now),
  ).toThrow();
});
it("rejects a non-workbook body and repeated periods", () => {
  expect(() =>
    parseWorldBankWorkbook(strToU8("<html>challenge</html>"), now),
  ).toThrow("invalid_workbook");
  expect(() =>
    parseWorldBankWorkbook(
      workbook(
        "($/mt)",
        "2026M10",
        '<row><c r="A4" t="inlineStr"><is><t>2026M10</t></is></c><c r="B4"><v>999</v></c></row>',
      ),
      now,
    ),
  ).toThrow("duplicate_reference_month");
});
