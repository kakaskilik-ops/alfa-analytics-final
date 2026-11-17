import { METAL_IDS } from "../supabase/functions/_shared/universe.ts";
export const MONITOR_STAGES = {
  notice: "Объявление тендера",
  amendment: "Изменение условий",
  result: "Опубликованы результаты процедуры",
  award: "Присуждение контракта",
  award_record: "Опубликованная запись о контракте",
  signed: "Подписанный контракт",
  contract: "Запись контракта",
  implementation: "Сведения об исполнении",
  fulfilled: "Подтверждённое исполнение",
  cancelled: "Отмена",
  terminated: "Расторжение",
  price_publication: "Официальная ценовая публикация",
} as const;
export type MonitorStage = keyof typeof MONITOR_STAGES;
export type PriceKind =
  | "initial"
  | "bid"
  | "award"
  | "signed_contract"
  | "delivery"
  | "exchange"
  | "indicative"
  | "obligation";
export const MONITOR_PRICE_KINDS: Record<PriceKind, string> = {
  initial: "Начальная цена тендера",
  bid: "Цена предложения",
  award: "Цена присуждённого контракта",
  signed_contract: "Цена подписанного контракта",
  delivery: "Цена исполненной поставки",
  exchange: "Биржевая котировка",
  indicative: "Индикативная цена",
  obligation: "Накопленные обязательства",
};
export const MONITOR_AMOUNT_BASES: Record<string, string> = {
  cumulative_obligations: "Накопленные обязательства, не цена контракта",
  contract_total_unallocated:
    "Общая сумма без распределения на товарные позиции",
  single_material_line: "Стоимость одной подтверждённой товарной позиции",
  initial_tender_total: "Начальный бюджет тендера без распределения на позиции",
};
export interface MonitorEvent {
  sourceId: string;
  entityId: string;
  processId: string;
  referenceId: string | null;
  sourceVersion: string | null;
  title: string;
  metalIds: string[];
  country: string | null;
  countryBasis: "buyer" | "registry" | "delivery";
  region: string | null;
  buyer: string | null;
  supplier: string | null;
  procurementType: string | null;
  procedureStatus: string | null;
  stage: MonitorStage;
  publishedOn: string | null;
  decisionOn: string | null;
  signedOn: string | null;
  amount: string | null;
  currency: string | null;
  amountBasis: string | null;
  quantity: string | null;
  unit: string | null;
  specification: string | null;
  deliveryTerms: string | null;
  taxIncluded: boolean | null;
  logisticsIncluded: boolean | null;
  additionalCharges: string | null;
  singleMaterialLine: boolean;
  includesServices: boolean | null;
  priceKind: PriceKind | null;
  pricePerKg: string | null;
  priceReason: string;
  comparable: boolean;
  sourceUrl: string;
  reviewReasons: string[];
  cancellationScope: "procedure" | "entity" | null;
  fieldPaths: Record<string, string>;
}
export interface ParsedMonitorRecord {
  event: MonitorEvent;
  raw: unknown;
}
export const MONITOR_METALS: Record<string, string> = {
  tungsten: "вольфрам",
  molybdenum: "молибден",
  ferromolybdenum: "ферромолибден",
  ferrotungsten: "ферровольфрам",
  tin: "олово",
  zinc: "цинк",
  copper: "медь",
  aluminum: "алюминий",
  chromium: "хром",
  cobalt: "кобальт",
  zirconium: "цирконий",
  niobium: "ниобий",
  tantalum: "тантал",
};
const metalWords: Record<string, RegExp> = {
  tungsten: /\btungsten\b|\bwolfram\b|вольфрам|鎢|钨/iu,
  molybdenum: /\bmolybdenum\b|\bmolybd[eèé]ne\b|молибден|鉬|钼/iu,
  ferromolybdenum: /\bferro[ -]?molybdenum\b|ферромолибден|鉬鐵|钼铁/iu,
  ferrotungsten: /\bferro[ -]?(?:tungsten|wolfram)\b|ферровольфрам|鎢鐵|钨铁/iu,
  tin: /\btin\b|\b[eé]tain\b|(?<![а-яё])олов(?:о|а|у|ом|е)(?![а-яё])|錫|锡/iu,
  zinc: /\bzinc\b|\bzink\b|цинк|鋅|锌/iu,
  copper:
    /\bcopper\b|\bcuivre\b|\bkupfer\b|\bcobre\b|(?<![а-яё])мед(?:ь|и|ью)(?![а-яё])|銅|铜/iu,
  aluminum: /\balumini?um\b|алюмини|鋁|铝/iu,
  chromium: /\bchromium\b|\bchrom\b|хром|鉻|铬/iu,
  cobalt: /\bcobalt\b|\bkobalt\b|кобальт|鈷|钴/iu,
  zirconium: /\bzirconium\b|циркони|鋯|锆/iu,
  niobium: /\bniobium\b|ниоби|鈮|铌/iu,
  tantalum: /\btantalum\b|\btantale\b|тантал|鉭|钽/iu,
};
export function classifyMonitorMaterial(text: string) {
  const t = text.normalize("NFKC");
  const ids = METAL_IDS.filter((id) => metalWords[id].test(t));
  if (ids.includes("ferromolybdenum"))
    ids.splice(ids.indexOf("molybdenum"), ids.includes("molybdenum") ? 1 : 0);
  if (ids.includes("ferrotungsten"))
    ids.splice(ids.indexOf("tungsten"), ids.includes("tungsten") ? 1 : 0);
  const related =
    /\b(?:oxide|sulphate|sulfate|chloride|carbide|ore|concentrate|isotope|generator|technetium|cable|wire|pipe|plumbing|battery|electrode|radiopharmac|coating|medical|installation|remediation|software|lanth|doped|chromium browser|tax identification)\b|molybdenum[- ]?\d|оксид|концентрат|карбид|кабел|радиофарм|монтаж|銅線|氧化/iu.test(
      t,
    ) ||
    /e[- ]?invoic|financial services|\bplating\b|\b(?:development|research|enhancing|preparation|SBIR|STTR)\b|application of/iu.test(
      t,
    ) ||
    (ids.some((id) => id !== "ferromolybdenum" && id !== "ferrotungsten") &&
      /\balloy\b|\brhen\b|\bshot\b/iu.test(t));
  const explicitMaterial =
    /\bpowder\b|\bingots?\b|\bunwrought\b|\bcathodes?\b|\bbillets?\b|\bmetal\b|\bbuy\b|\bpurchase\b|\bferro[ -]?(?:molybdenum|tungsten)\b|порош|слит|катод|ферромолибден|ферровольфрам|錠|锭/iu.test(
      t,
    ) ||
    /(?:^|[:–—]\s*)(?:tungsten|molybdenum|tin|zinc|copper|alumini?um|chromium|cobalt|zirconium|niobium|tantalum)\s*$/iu.test(
      t,
    );
  return {
    metalIds: ids,
    reviewReasons: ids.length
      ? related
        ? ["related_product_or_service_not_confirmed_bulk_metal"]
        : ids.includes("aluminum") &&
            /\b(?:A?356(?:\.[12])?|355|6061)\b/i.test(t)
          ? ["alloy_grade_requires_material_scope_review"]
          : !explicitMaterial
            ? ["material_scope_requires_original_document_review"]
            : []
      : [],
  };
}
export function sourceDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const n = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === s
    ? s
    : null;
}
export function decimal(value: unknown): string | null {
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) || Math.abs(value) > 1e12)
  )
    return null;
  const s =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value
        : null;
  if (!s || !/^\d{1,20}(?:\.\d{1,12})?$/.test(s)) return null;
  return s;
}
function scaled(s: string) {
  const [a, b = ""] = s.split(".");
  return BigInt(a) * 10n ** 12n + BigInt(b.padEnd(12, "0"));
}
export const KG_FACTORS: Record<string, string> = {
  kg: "1",
  t: "1000",
  ton: "1000",
  tonne: "1000",
  g: "0.001",
  lb: "0.45359237",
  KGM: "1",
  TNE: "1000",
  GRM: "0.001",
  LBR: "0.45359237",
};
/** Exact fixed-point division, rounded to twelve decimals. No exchange-rate or grade substitution. */
export function unitPrice(
  e: Pick<
    MonitorEvent,
    | "amount"
    | "quantity"
    | "unit"
    | "currency"
    | "amountBasis"
    | "singleMaterialLine"
    | "includesServices"
    | "priceKind"
  >,
): { value: string | null; reason: string } {
  if (!e.amount || !e.quantity || !e.unit || !e.currency)
    return { value: null, reason: "missing_amount_quantity_unit_or_currency" };
  if (
    !decimal(e.amount) ||
    !decimal(e.quantity) ||
    !/^[A-Z]{3}$/.test(e.currency)
  )
    return { value: null, reason: "invalid_numeric_fields" };
  if (
    !e.singleMaterialLine ||
    e.includesServices !== false ||
    e.amountBasis !== "single_material_line"
  )
    return { value: null, reason: "unallocated_total_or_services" };
  if (
    !e.priceKind ||
    e.priceKind === "obligation" ||
    e.priceKind === "exchange" ||
    e.priceKind === "indicative"
  )
    return { value: null, reason: "not_a_supported_contract_price_basis" };
  const factor = KG_FACTORS[e.unit];
  if (!factor) return { value: null, reason: "unsupported_mass_unit" };
  const denominator = scaled(e.quantity) * scaled(factor);
  if (denominator <= 0n) return { value: null, reason: "nonpositive_quantity" };
  if (scaled(e.amount) <= 0n)
    return { value: null, reason: "nonpositive_amount" };
  const n = (scaled(e.amount) * 10n ** 24n + denominator / 2n) / denominator;
  return {
    value:
      (n / 10n ** 12n).toString() +
      "." +
      (n % 10n ** 12n).toString().padStart(12, "0"),
    reason: "verified_single_material_amount_divided_by_mass",
  };
}
export function finishMonitorEvent(
  e: MonitorEvent,
  now = Date.now(),
): MonitorEvent {
  const reasons = [...e.reviewReasons];
  if (
    !e.metalIds.length ||
    e.metalIds.some(
      (id) => !METAL_IDS.includes(id as (typeof METAL_IDS)[number]),
    )
  )
    reasons.push("unsupported_material");
  if (!e.country || !e.region) reasons.push("missing_country_or_region");
  if (
    !sourceDay(e.publishedOn) ||
    (e.publishedOn && Date.parse(e.publishedOn) > now + 86400000)
  )
    reasons.push("invalid_publication_date");
  try {
    const u = new URL(e.sourceUrl);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      [...u.searchParams.keys()].some((k) =>
        /key|token|secret|password/i.test(k),
      )
    )
      reasons.push("unsafe_source_url");
  } catch {
    reasons.push("unsafe_source_url");
  }
  const singleMaterialLine = e.singleMaterialLine && e.metalIds.length === 1;
  const p = unitPrice({ ...e, singleMaterialLine });
  return {
    ...e,
    singleMaterialLine,
    reviewReasons: [...new Set(reasons)],
    pricePerKg: reasons.length ? null : p.value,
    priceReason: reasons.length ? "manual_review_required" : p.reason,
    comparable:
      !reasons.length &&
      p.value !== null &&
      e.specification !== null &&
      e.deliveryTerms !== null &&
      e.taxIncluded !== null &&
      e.logisticsIncluded !== null &&
      e.additionalCharges !== null &&
      ["award", "signed", "fulfilled"].includes(e.stage),
  };
}
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonicalJson((v as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(v) ?? "null";
}
export function monitorComparisonKey(e: MonitorEvent) {
  return canonicalJson([
    e.metalIds,
    e.country,
    e.specification,
    e.currency,
    e.deliveryTerms,
    e.taxIncluded,
    e.logisticsIncluded,
    e.additionalCharges,
    e.priceKind,
    e.stage,
  ]);
}
export function monitorStory(e: MonitorEvent): { title: string; text: string } {
  const names = e.metalIds.map((id) => MONITOR_METALS[id] ?? id).join(", ");
  const title = `${MONITOR_STAGES[e.stage]}: ${names} · ${e.country ?? "страна не указана"}`;
  const labels = [
    `Документ источника: ${e.title}`,
    `Дата публикации/обновления источника: ${e.publishedOn ?? "не опубликована"}.`,
    `Статус: ${MONITOR_STAGES[e.stage]}. ${e.procedureStatus ?? ""}`,
    `Идентификатор: ${e.entityId}.`,
    `Номер в первоисточнике: ${e.referenceId ?? "не опубликован"}.`,
    `Покупатель: ${e.buyer ?? "не опубликован"}. Поставщик: ${e.supplier ?? "не опубликован"}.`,
    `Объём: ${e.quantity === null ? "не опубликован" : e.quantity + " " + (e.unit ?? "единица не указана")}.`,
    `Сумма: ${e.amount === null ? "не опубликована" : e.amount + " " + (e.currency ?? "валюта не указана")}; основание: ${MONITOR_AMOUNT_BASES[e.amountBasis ?? ""] ?? "не установлено"}.`,
    e.pricePerKg === null
      ? "Цена единицы не рассчитана: нет подтверждённой сопоставимой суммы и массы одной позиции."
      : `Расчётное отношение суммы к массе: ${e.pricePerKg} ${e.currency}/кг; тип цены ${e.priceKind ? MONITOR_PRICE_KINDS[e.priceKind] : "не установлен"}. Это не средняя рыночная цена.`,
    `Спецификация: ${e.specification ?? "не опубликована"}. Базис поставки: ${e.deliveryTerms ?? "не опубликован"}.`,
    `НДС: ${e.taxIncluded === null ? "не установлен" : e.taxIncluded ? "включён" : "не включён"}. Логистика: ${e.logisticsIncluded === null ? "не установлена" : e.logisticsIncluded ? "включена" : "не включена"}. Дополнительные сборы: ${e.additionalCharges ?? "не установлены"}.`,
    "Объявление и присуждение не подтверждают состоявшуюся поставку или продажу. Контрактные суммы не являются биржевыми котировками.",
    e.countryBasis === "registry"
      ? "Страна относится к юрисдикции реестра покупателя, не к месту поставки."
      : "Страна относится к опубликованным данным покупателя/поставки.",
    `Первичный источник: ${e.sourceUrl}`,
  ];
  return { title, text: labels.join("\n") };
}
