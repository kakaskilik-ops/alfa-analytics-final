export const COMTRADE_SOURCE = "un-comtrade";
export const TRADE_PRODUCTS = {
  tungsten: {
    code: "810110",
    description: "Порошки вольфрама; не все формы W",
  },
  molybdenum: {
    code: "810210",
    description: "Порошки молибдена; не все формы Mo",
  },
  ferromolybdenum: {
    code: "720270",
    description: "Ферромолибден; содержание Mo отдельно не установлено",
  },
  ferrotungsten: {
    code: "720280",
    description:
      "Общая группа ферровольфрама и ферросиликовольфрама; FeW отдельно не выделен",
  },
  tin: { code: "800110", description: "Олово необработанное нелегированное" },
  zinc: {
    code: "790111",
    description:
      "Цинк нелегированный, содержание цинка не менее девяноста девяти целых девяноста девяти сотых процента",
  },
  copper: {
    code: "740311",
    description: "Медь рафинированная: катоды и секции катодов",
  },
  aluminum: {
    code: "760110",
    description: "Алюминий необработанный нелегированный",
  },
  chromium: { code: "811221", description: "Хром необработанный и порошки" },
  cobalt: {
    code: "810520",
    description:
      "Общая группа штейнов, промежуточных продуктов, необработанного Co и порошков",
  },
  zirconium: {
    code: "810921",
    description:
      "Цирконий необработанный и порошки, менее одной части Hf на пятьсот частей Zr",
  },
  tantalum: {
    code: "810320",
    description: "Тантал необработанный, спечённые прутки, порошки",
  },
} as const;
export const TRADE_COUNTRIES: Record<
  number,
  { code: string; name: string; region: string }
> = {
  156: { code: "CHN", name: "Китай", region: "Азия" },
  276: { code: "DEU", name: "Германия", region: "Европа" },
  842: { code: "USA", name: "США", region: "США" },
};
export function comtradeUrl(metalId: string, now = Date.now()): string {
  const product = TRADE_PRODUCTS[metalId as keyof typeof TRADE_PRODUCTS];
  if (!product) throw new Error("unsupported_trade_product");
  const year = new Date(now).getUTCFullYear();
  const url = new URL("https://comtradeapi.un.org/public/v1/preview/C/A/HS");
  for (const [k, v] of Object.entries({
    period: String(year - 1),
    reporterCode: "156,276,842",
    cmdCode: product.code,
    flowCode: "M,X",
    partnerCode: "0",
    partner2Code: "0",
    customsCode: "C00",
    motCode: "0",
    maxRecords: "100",
  }))
    url.searchParams.set(k, v);
  return url.href;
}
export interface TradeObservation {
  metal_id: string;
  metric: "import_value" | "export_value" | "import_mass" | "export_mass";
  value: number;
  unit: "USD" | "kg";
  period_year: number;
  country_code: string;
  country: string;
  region: string;
  commodity_code: string;
  product_description: string;
  estimated: boolean;
  source_reported: boolean | null;
  source_aggregate: boolean | null;
}
export function parseComtrade(
  input: unknown,
  metalId: string,
  now = Date.now(),
): TradeObservation[] {
  const product = TRADE_PRODUCTS[metalId as keyof typeof TRADE_PRODUCTS];
  if (!product || !input || typeof input !== "object")
    throw new Error("invalid_trade_response");
  const body = input as Record<string, unknown>;
  if (
    body.error ||
    !Array.isArray(body.data) ||
    body.data.length >= 100 ||
    typeof body.count !== "number" ||
    body.count !== body.data.length
  )
    throw new Error("invalid_or_truncated_trade_response");
  const results: TradeObservation[] = [],
    seen = new Set<string>(),
    currentYear = new Date(now).getUTCFullYear();
  for (const x of body.data) {
    if (!x || typeof x !== "object") throw new Error("invalid_trade_row");
    const r = x as Record<string, unknown>,
      country = TRADE_COUNTRIES[Number(r.reporterCode)],
      year = Number(r.refYear);
    if (
      !country ||
      r.typeCode !== "C" ||
      r.freqCode !== "A" ||
      r.classificationCode !== "H6" ||
      String(r.cmdCode) !== product.code ||
      r.partnerCode !== 0 ||
      r.partner2Code !== 0 ||
      r.customsCode !== "C00" ||
      r.motCode !== 0 ||
      !["M", "X"].includes(String(r.flowCode)) ||
      !Number.isInteger(year) ||
      year >= currentYear ||
      year < currentYear - 3 ||
      String(r.period) !== String(year)
    )
      throw new Error("unexpected_trade_dimensions");
    const prefix = r.flowCode === "M" ? "import" : "export";
    const key = [metalId, country.code, year, prefix].join("|");
    if (seen.has(key)) throw new Error("duplicate_trade_aggregate");
    seen.add(key);
    const common = {
      metal_id: metalId,
      period_year: year,
      country_code: country.code,
      country: country.name,
      region: country.region,
      commodity_code: "HS2022:" + product.code,
      product_description: product.description,
      source_reported: typeof r.isReported === "boolean" ? r.isReported : null,
      source_aggregate:
        typeof r.isAggregate === "boolean" ? r.isAggregate : null,
    };
    for (const [field, metric, unit, estimated] of [
      ["primaryValue", prefix + "_value", "USD", false],
      ["netWgt", prefix + "_mass", "kg", r.isNetWgtEstimated === true],
    ] as const) {
      if (r[field] === null || r[field] === undefined) continue;
      const value = r[field];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        throw new Error("invalid_trade_value");
      results.push({
        ...common,
        value,
        metric: metric as TradeObservation["metric"],
        unit,
        estimated,
      });
    }
  }
  return results;
}
