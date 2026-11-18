import { isMetal } from "../supabase/functions/_shared/universe";
export interface SmmImportRow {
  series_id: string;
  metal_id: string;
  specification: string;
  purity: string;
  delivery_form: string;
  region: string;
  price_type: string;
  assessed_at: string;
  date_precision: string;
  currency: string;
  unit: string;
  tax_status: string;
  vat_rate: number | null;
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
  source_url: string;
}
export function parsePrivateSmmImport(input: unknown): SmmImportRow[] {
  if (!Array.isArray(input) || !input.length || input.length > 500)
    throw Error("Нужен JSON-массив от 1 до 500 наблюдений.");
  const keys = [
    "series_id",
    "metal_id",
    "specification",
    "purity",
    "delivery_form",
    "region",
    "price_type",
    "assessed_at",
    "date_precision",
    "currency",
    "unit",
    "tax_status",
    "vat_rate",
    "minimum",
    "maximum",
    "mean",
    "source_url",
  ] as const;
  const seen = new Set<string>();
  return input.map((item, i) => {
    if (
      !item ||
      typeof item !== "object" ||
      keys.some((k) => !(k in item)) ||
      Object.keys(item).some((k) => !(keys as readonly string[]).includes(k))
    )
      throw Error(`Строка ${i + 1}: неверные поля.`);
    const r = item as SmmImportRow;
    const fail = () => {
      throw Error(
        `Строка ${i + 1}: проверьте спецификацию, дату, диапазон, единицы, НДС и ссылку SMM.`,
      );
    };
    for (const k of [
      "series_id",
      "specification",
      "purity",
      "delivery_form",
      "region",
    ] as const)
      if (
        typeof r[k] !== "string" ||
        !r[k].trim() ||
        r[k].length >
          (k === "specification" ? 1000 : k === "series_id" ? 150 : 200)
      )
        fail();
    if (
      !isMetal(r.metal_id) ||
      ![
        "physical_spot",
        "assessment",
        "futures",
        "premium",
        "concentrate",
      ].includes(r.price_type) ||
      !["day", "timestamp", "month"].includes(r.date_precision) ||
      !/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(r.assessed_at) ||
      !Number.isFinite(Date.parse(r.assessed_at)) ||
      Date.parse(r.assessed_at) > Date.now() + 300000 ||
      !/^[A-Z]{3}$/.test(r.currency) ||
      !["kg", "ton", "lb", "mtu"].includes(r.unit) ||
      !["included", "excluded", "unknown"].includes(r.tax_status)
    )
      fail();
    for (const v of [r.minimum, r.maximum, r.mean])
      if (
        v !== null &&
        (typeof v !== "number" || !Number.isFinite(v) || v <= 0)
      )
        fail();
    if (
      r.vat_rate !== null &&
      (typeof r.vat_rate !== "number" ||
        !Number.isFinite(r.vat_rate) ||
        r.vat_rate < 0 ||
        r.vat_rate > 1 ||
        r.tax_status === "unknown")
    )
      fail();
    if (r.minimum === null || r.maximum === null) {
      if (r.minimum !== null || r.maximum !== null || r.mean === null) fail();
    } else if (
      r.minimum > r.maximum ||
      (r.mean !== null && (r.mean < r.minimum || r.mean > r.maximum))
    )
      fail();
    let u: URL;
    try {
      u = new URL(r.source_url);
    } catch {
      return fail();
    }
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      !(
        u.hostname === "metal.com" ||
        /^[a-z0-9-]+\.metal\.com$/.test(u.hostname)
      )
    )
      fail();
    const key = JSON.stringify([
      r.series_id,
      new Date(r.assessed_at).toISOString(),
      r.currency,
      r.unit,
      r.tax_status,
    ]);
    if (seen.has(key))
      throw Error(`Строка ${i + 1}: повторное налоговое представление.`);
    seen.add(key);
    return Object.fromEntries(
      keys.map((k) => [k, r[k]]),
    ) as unknown as SmmImportRow;
  });
}
