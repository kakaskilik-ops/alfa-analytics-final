function escapeXml(s: string): string {
  return s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
import { CATEGORY_MAP } from "@/data/categories";
import { PERIODS } from "@/data/periods";
import { formatDateTime } from "@/lib/format";
import type { MetalQuote, PeriodKey } from "@/types/market";

const HEADERS = [
  "Металл",
  "Символ",
  "Категория",
  "Цена за единицу",
  "Валюта",
  "Единица",
  "Изменение",
  "Изменение %",
  "Максимум",
  "Минимум",
  "Среднее",
  "Период",
  "Дата обновления (МСК)",
  "Статус данных",
  "Источник",
  "Ссылка",
  "Условия рынка",
];

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return value.toFixed(2).replace(".", ",");
}

function escapeCell(value: string): string {
  if (/^[=+@\-\t\r]/.test(value)) value = `'${value}`;
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function statusLabel(quote: MetalQuote): string {
  return {
    live: "Подтверждено",
    cached: "Сохранено",
    demo: "Демонстрация",
    unavailable: "Нет данных",
  }[quote.dataStatus];
}

export function buildQuotesCsv(
  quotes: MetalQuote[],
  period: PeriodKey,
  updatedAt: Date,
): string {
  const periodLabel =
    PERIODS.find((item) => item.key === period)?.label ?? period;
  const updated = formatDateTime(updatedAt.getTime());

  const rows = quotes.map((quote) => {
    const { metal } = quote;
    return [
      metal.nameRu,
      metal.symbol,
      CATEGORY_MAP[metal.categoryId].name,
      formatNumber(quote.price),
      metal.currency,
      metal.unit,
      formatNumber(quote.change),
      formatNumber(quote.changePct),
      formatNumber(quote.high),
      formatNumber(quote.low),
      formatNumber(quote.average),
      periodLabel,
      quote.publishedAt ? formatDateTime(quote.publishedAt) : updated,
      statusLabel(quote),
      quote.sourceName,
      quote.sourceUrl,
      quote.marketLabel,
    ];
  });

  return [HEADERS, ...rows]
    .map((row) => row.map((cell) => escapeCell(String(cell))).join(";"))
    .join("\r\n");
}

export function buildExcelXml(
  quotes: MetalQuote[],
  period: PeriodKey,
  updatedAt: Date,
): string {
  const periodLabel =
    PERIODS.find((item) => item.key === period)?.label ?? period;
  const updated = formatDateTime(updatedAt.getTime());

  const headerCells = HEADERS.map(
    (h) => `<Cell><Data ss:Type="String">${h}</Data></Cell>`,
  ).join("");

  const dataRows = quotes
    .map((quote) => {
      const { metal } = quote;
      const cells = [
        { type: "String", value: metal.nameRu },
        { type: "String", value: metal.symbol },
        { type: "String", value: CATEGORY_MAP[metal.categoryId].name },
        {
          type: quote.price === null ? "String" : "Number",
          value: quote.price?.toFixed(4) ?? "",
        },
        { type: "String", value: metal.currency },
        { type: "String", value: metal.unit },
        {
          type: quote.change === null ? "String" : "Number",
          value: quote.change?.toFixed(4) ?? "",
        },
        {
          type: quote.changePct === null ? "String" : "Number",
          value: quote.changePct?.toFixed(2) ?? "",
        },
        {
          type: quote.high === null ? "String" : "Number",
          value: quote.high?.toFixed(4) ?? "",
        },
        {
          type: quote.low === null ? "String" : "Number",
          value: quote.low?.toFixed(4) ?? "",
        },
        {
          type: quote.average === null ? "String" : "Number",
          value: quote.average?.toFixed(4) ?? "",
        },
        { type: "String", value: periodLabel },
        { type: "String", value: updated },
        { type: "String", value: statusLabel(quote) },
        { type: "String", value: quote.sourceName },
        { type: "String", value: quote.sourceUrl },
        { type: "String", value: quote.marketLabel },
      ];
      const cellXml = cells
        .map(
          (c) =>
            `<Cell><Data ss:Type="${c.type}">${escapeXml(String(c.value))}</Data></Cell>`,
        )
        .join("");
      return `<Row>${cellXml}</Row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Котировки">
<Table>
<Row>${headerCells}</Row>
${dataRows}
</Table>
</Worksheet>
</Workbook>`;
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(["\uFEFF", content], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadExcel(filename: string, content: string): void {
  const blob = new Blob(["\uFEFF", content], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
