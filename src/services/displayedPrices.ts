import { fetchReferencePrices } from "./referenceMarkets";
import { WORLD_BANK_URL } from "../../shared/referenceMarkets";
import { supabase } from "@/lib/supabase";
import { priceUsdKg } from "../../shared/supplierPrices";
export interface DisplayedPrice {
  metalId: string;
  pricePerKg: number;
  pricePerTon: number;
  observedOn: string;
  sourceName: string;
  sourceUrl: string;
  kind: string;
  specification: string;
  region: string;
  checkedAt: number;
  stale: boolean;
  originalPrice?: number;
  originalUnit?: string;
  dateLabel?: string;
  notes?: string;
  lowerBound?: boolean;
}
let lastSupplierPrices: DisplayedPrice[] = [];
export function parseSupplierPriceRows(
  rows: Record<string, unknown>[],
  now = Date.now(),
): DisplayedPrice[] {
  const result = new Map<string, DisplayedPrice>();
  const conflicts = new Set<string>();
  for (const r of rows) {
    const value = Number(r.original_price),
      day = String(r.observed_on),
      checked = Date.parse(String(r.retrieved_at));
    if (
      !["rare-metals-bid", "qs-catalogue", "metotechnics-floor"].includes(
        String(r.source_id),
      ) ||
      r.original_currency !== "USD" ||
      !["kg", "lb"].includes(String(r.original_unit)) ||
      !["supplier_bid", "supplier_catalogue", "supplier_floor"].includes(
        String(r.price_kind),
      ) ||
      !Number.isFinite(value) ||
      value <= 0 ||
      !Number.isFinite(checked) ||
      checked > now + 300000 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      Date.parse(day) > now ||
      typeof r.specification !== "string" ||
      !r.specification.trim()
    )
      continue;
    const source =
      r.source_id === "rare-metals-bid"
        ? "Rare Metals"
        : r.source_id === "metotechnics-floor"
          ? "Metotechnics"
          : "QS Advanced Materials";
    const url = String(r.source_url);
    if (
      !(r.source_id === "rare-metals-bid"
        ? /^https:\/\/metal-supply\.biz\/product\/\d+$/.test(url)
        : r.source_id === "metotechnics-floor"
          ? url === "https://metotechnics.com/ferrosplavy-cena.htm"
          : /^https:\/\/www\.qsrarematerials\.com\/uploadfile\/down\//.test(
              url,
            ))
    )
      continue;
    const metal = String(r.metal_id);
    const key = JSON.stringify([r.source_id, metal, r.specification]);
    const old = result.get(key);
    if (
      old &&
      (old.observedOn > day ||
        (old.observedOn === day && old.checkedAt > checked))
    )
      continue;
    if (
      old &&
      old.observedOn === day &&
      old.checkedAt === checked &&
      old.originalPrice !== value
    ) {
      conflicts.add(key);
      continue;
    }
    conflicts.delete(key);
    const perKg = priceUsdKg(value, r.original_unit as "kg" | "lb");
    result.set(key, {
      metalId: metal,
      pricePerKg: perKg,
      pricePerTon: perKg * 1000,
      observedOn: day,
      dateLabel:
        r.date_precision === "year"
          ? day.slice(0, 4) + " (год каталога)"
          : day + " (снимок предложения)",
      sourceName: source,
      sourceUrl: url,
      kind:
        r.price_kind === "supplier_bid"
          ? "Индикативная закупочная цена"
          : r.price_kind === "supplier_floor"
            ? "Нижняя граница недатированного прайса"
            : "Индикативная цена предложения — архив",
      lowerBound: r.price_kind === "supplier_floor",
      specification: r.specification,
      region:
        String(r.region) +
        " · " +
        String(r.country) +
        " · адрес поставщика, не место доставки",
      checkedAt: checked,
      stale:
        r.price_kind === "supplier_floor" ||
        r.date_precision === "year" ||
        now - Date.parse(day) > 14 * 86400000,
      originalPrice: value,
      originalUnit: r.original_unit === "kg" ? "USD/кг сплава" : "USD/lb",
      notes: String(r.notes ?? ""),
    });
  }
  return [...result.entries()]
    .filter(([k]) => !conflicts.has(k))
    .map(([, v]) => v)
    .sort(
      (a, b) =>
        b.observedOn.localeCompare(a.observedOn) ||
        a.sourceName.localeCompare(b.sourceName),
    );
}
export async function fetchDisplayedPrices(): Promise<DisplayedPrice[]> {
  const [referenceResult, supplierResult] = await Promise.allSettled([
    fetchReferencePrices(),
    supabase
      ? supabase
          .from("supplier_price_observations")
          .select(
            "metal_id,source_id,observed_on,date_precision,date_basis,original_price,original_currency,original_unit,specification,region,country,price_kind,source_url,notes,retrieved_at",
          )
          .order("observed_on", { ascending: false })
          .order("retrieved_at", { ascending: false })
          .order("id")
          .limit(1000)
      : Promise.resolve(null),
  ]);
  if (
    supplierResult.status === "fulfilled" &&
    supplierResult.value &&
    !supplierResult.value.error
  )
    lastSupplierPrices = parseSupplierPriceRows(
      supplierResult.value.data ?? [],
    );
  const rows =
    referenceResult.status === "fulfilled" ? referenceResult.value : [];
  if (referenceResult.status === "rejected" && !lastSupplierPrices.length)
    throw referenceResult.reason;
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const old = latest.get(row.metal_id);
    if (!old || row.period_start > old.period_start)
      latest.set(row.metal_id, row);
  }
  return [
    ...[...latest.values()].map((r) => ({
      metalId: r.metal_id,
      pricePerKg: r.price / 1000,
      pricePerTon: r.price,
      observedOn: r.period_start,
      sourceName: "World Bank",
      sourceUrl: WORLD_BANK_URL,
      kind: "Мировой месячный ориентир",
      specification: r.specification,
      region: "Мировой ориентир — не региональная котировка",
      checkedAt: r.retrievedAt,
      stale: Date.now() - Date.parse(r.period_start) > 75 * 86400000,
    })),
    ...lastSupplierPrices,
  ];
}
