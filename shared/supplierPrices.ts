export const RARE_PRICE_URL = "https://metal-supply.biz/";
export const FERRO_PRICE_URL = "https://metotechnics.com/ferrosplavy-cena.htm";
export const QS_PRICE_URL =
  "https://www.qsrarematerials.com/uploadfile/down/20230303/QS%20Product%20Cata.pdf";
export const QS_PRICE_SHA256 =
  "685c9f10554296ae0ab1bdde2f7b38a0002b6e25733fcc09439b15c1a4f6b7d6";
export interface SupplierPrice {
  metal_id: string;
  source_id: string;
  observed_on: string;
  date_precision: "day" | "year";
  date_basis: "retrieval_snapshot" | "catalogue_year";
  original_price: number;
  original_currency: "USD";
  original_unit: "lb" | "kg";
  specification: string;
  region: "Европа" | "США";
  country: string;
  price_kind: "supplier_bid" | "supplier_catalogue" | "supplier_floor";
  source_url: string;
  notes: string;
}
const names: Record<string, string> = {
  "Chromium metal 99% min.": "chromium",
  "Molybdenum 99.95%": "molybdenum",
  "Niobium 99.9%": "niobium",
  "Tantalum 99.9%": "tantalum",
  "Tungsten 99.9%": "tungsten",
  "Zirconium 99.9%": "zirconium",
  "Cobalt 99.8%": "cobalt",
};
export function parseRarePrices(
  html: string,
  now = new Date(),
): SupplierPrice[] {
  if (
    !html.includes(
      "Indicative metal purchase prices in USD/lb excluding VAT, converted from EUR/kg.",
    )
  )
    throw Error("supplier_basis_changed");
  const prices: SupplierPrice[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(
    /<tr>\s*<td>\s*<a href="(\/product\/\d+)">([^<]+)<\/a>\s*<\/td>\s*<td>\s*<span class="purchase-price">\s*([\d,]+(?:\.\d+)?) USD\/lb\s*<\/span>\s*<\/td>\s*<\/tr>/g,
  )) {
    const metal = names[match[2]];
    if (!metal) continue;
    if (seen.has(metal)) throw Error("supplier_duplicate_material");
    seen.add(metal);
    const price = Number(match[3].replace(/,/g, ""));
    if (!Number.isFinite(price) || price <= 0 || price > 1000000)
      throw Error("supplier_invalid_price");
    prices.push({
      metal_id: metal,
      source_id: "rare-metals-bid",
      observed_on: now.toISOString().slice(0, 10),
      date_precision: "day",
      date_basis: "retrieval_snapshot",
      original_price: price,
      original_currency: "USD",
      original_unit: "lb",
      specification:
        match[2] +
        "; форма поставки не уточнена — не переносить на другие формы",
      region: "Европа",
      country: "Германия",
      price_kind: "supplier_bid",
      source_url: "https://metal-supply.biz" + match[1],
      notes:
        "Индикативная закупочная цена без НДС, не цена продажи и не биржевая котировка. USD/lb уже пересчитаны самим закупщиком из EUR/kg; его валютный курс не является новой региональной ценой. Дата — снимок открытого предложения; дата публикации не указана. Регион — юридический адрес закупщика, место приёмки и логистика не подтверждены.",
    });
  }
  if (prices.length !== 7) throw Error("supplier_price_table_incomplete");
  return prices;
}
/** Three factual quotations from the public 2023 promotional catalogue, last table, Plate/Sheet >10 mm. */
export const QS_CATALOGUE_PRICES: SupplierPrice[] = [
  [
    "tantalum",
    580,
    "Тантал: лист/плита толщиной >10 мм; чистота в таблице не указана",
  ],
  [
    "niobium",
    170,
    "Ниобий: лист/плита толщиной >10 мм; чистота в таблице не указана",
  ],
  [
    "zirconium",
    80,
    "Цирконий марки 702: лист/плита толщиной >10 мм; не универсальная цена чистого Zr",
  ],
].map(([metal, price, spec]) => ({
  metal_id: String(metal),
  source_id: "qs-catalogue",
  observed_on: "2023-01-01",
  date_precision: "year",
  date_basis: "catalogue_year",
  original_price: Number(price),
  original_currency: "USD",
  original_unit: "lb",
  specification: String(spec),
  region: "США",
  country: "США",
  price_kind: "supplier_catalogue",
  source_url: QS_PRICE_URL,
  notes:
    "Индикативный архивный прайс каталога 2023 года, не действующая оферта. Поставщик просит уточнять наличие, актуальную стоимость и скидки. Фрахт, упаковка, НДС и пошлины не включены по условиям поставщика. Регион — адрес поставщика Troy, Michigan; место доставки не установлено. Точный день публикации не указан.",
}));
export function parseFerroPrices(
  html: string,
  now = new Date(),
): SupplierPrice[] {
  const text = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");
  const configs = [
    { name: "Ferromolybdenum", grade: "FeMo60", metal: "ferromolybdenum" },
    { name: "Ferrotungsten", grade: "FeW70", metal: "ferrotungsten" },
  ];
  if (!text.includes("given for reference only"))
    throw Error("ferro_disclaimer_changed");
  return configs.map((c) => {
    const found = [
      ...text.matchAll(
        new RegExp(
          c.name +
            "\\s+Slugs\\s+" +
            c.grade +
            "\\s+-\\s+from\\s+([0-9]+(?:\\.[0-9]+)?)\\s*\\$/kg",
          "g",
        ),
      ),
    ];
    if (found.length !== 1) throw Error("ferro_table_changed");
    const value = Number(found[0][1]);
    if (!(value > 0 && value < 1000000)) throw Error("ferro_invalid_price");
    return {
      metal_id: c.metal,
      source_id: "metotechnics-floor",
      observed_on: now.toISOString().slice(0, 10),
      date_precision: "day",
      date_basis: "retrieval_snapshot",
      original_price: value,
      original_currency: "USD",
      original_unit: "kg",
      specification:
        c.grade +
        "; куски (Slugs); USD за кг сплава, не за кг содержащегося Mo/W",
      region: "Европа",
      country: "Россия, Москва (поставщик)",
      price_kind: "supplier_floor",
      source_url: FERRO_PRICE_URL,
      notes:
        "Нижняя граница справочного прайса «от», не текущая подтверждённая рыночная котировка и не юридическая оферта. Дата публикации и давность цены не указаны; дата — снимок страницы. НДС, объём партии, фрахт и условия поставки не подтверждены; стоимость необходимо уточнить у поставщика. Независимого сопоставимого подтверждения нет.",
    };
  });
}
export function priceUsdKg(price: number, unit: "lb" | "kg" | "ton") {
  if (!(price > 0) || !Number.isFinite(price)) throw Error("invalid_price");
  return price / (unit === "lb" ? 0.45359237 : unit === "ton" ? 1000 : 1);
}
