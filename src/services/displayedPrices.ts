import type { LiveMarketData } from "./liveData";
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
  taxStatus?: "included" | "excluded" | "unknown";
  category?: "reference" | "supplier" | "market" | "owner_reference";
  marketRegion?: "Europe" | "USA" | "Asia" | "global";
  regionVerified?: boolean;
  minimumPerKg?: number;
  maximumPerKg?: number;
  massBasis?: "metal" | "alloy" | "contained_mo";
  verificationStatus?: "unverified" | "source_matched" | "verified";
  sourcePublishedOn?: string;
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
      category: "supplier",
      taxStatus: r.source_id === "rare-metals-bid" ? "excluded" : "unknown",
      marketRegion: r.region === "США" ? "USA" : "Europe",
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
      category: "reference" as const,
      taxStatus: "unknown" as const,
      marketRegion: "global" as const,
      regionVerified: true,
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
export type ReferenceScope = "all" | "Europe" | "USA" | "Asia" | "global";
/** Already validated public USD/kg quotations; supplier addresses never determine region. */
export function regionalPriceReferences(
  data: LiveMarketData | null | undefined,
): DisplayedPrice[] {
  return (data?.regionalQuotes ?? []).flatMap((q) => {
    const region =
      q.region === "Европа"
        ? "Europe"
        : q.region === "США"
          ? "USA"
          : q.region === "Азия"
            ? "Asia"
            : null;
    if (
      !region ||
      q.originalCurrency !== "USD" ||
      q.originalUnit !== "kg" ||
      !q.livePrice ||
      !Number.isFinite(q.livePrice)
    )
      return [];
    return [
      {
        metalId: q.metalId,
        pricePerKg: q.livePrice,
        pricePerTon: q.livePrice * 1000,
        observedOn: new Date(q.timestamp).toISOString().slice(0, 10),
        sourceName: q.sourceName,
        sourceUrl: q.sourceUrl,
        kind: "Региональная рыночная котировка",
        specification: q.marketLabel,
        region: q.marketLabel,
        checkedAt: q.timestamp,
        stale: q.dataStatus !== "live",
        category: "market" as const,
        marketRegion: region as "Europe" | "USA" | "Asia",
        regionVerified: true,
        taxStatus: "unknown" as const,
        massBasis: q.metalId.startsWith("ferro")
          ? ("alloy" as const)
          : ("metal" as const),
      },
    ];
  });
}
export function selectPrimaryPrices(
  rows: DisplayedPrice[],
  scope: ReferenceScope = "all",
) {
  const selected = new Map<string, DisplayedPrice>();
  const priority = (p: DisplayedPrice) =>
    p.category === "owner_reference" ? 3 : p.category === "market" ? 2 : 1;
  for (const r of rows) {
    if (r.category === "supplier") continue;
    if (scope !== "all" && !(r.regionVerified && r.marketRegion === scope))
      continue;
    const old = selected.get(r.metalId);
    if (
      !old ||
      priority(r) > priority(old) ||
      (r.category === old.category && r.checkedAt > old.checkedAt)
    )
      selected.set(r.metalId, r);
  }
  return [...selected.values()];
}
export function parseOwnerReferences(
  rows: Record<string, unknown>[],
): DisplayedPrice[] {
  return rows.flatMap((r) => {
    const low = r.minimum_usd_kg === null ? null : Number(r.minimum_usd_kg),
      high = r.maximum_usd_kg === null ? null : Number(r.maximum_usd_kg),
      point = r.point_usd_kg === null ? null : Number(r.point_usd_kg);
    if (
      ![low, high, point].every(
        (v) => v === null || (Number.isFinite(v) && v > 0),
      ) ||
      !(
        (low === null && high === null && point !== null) ||
        (low !== null && high !== null && low <= high && point === null)
      )
    )
      return [];
    if (
      !["metal", "alloy", "contained_mo"].includes(String(r.mass_basis)) ||
      !["unverified", "source_matched", "verified"].includes(
        String(r.verification_status),
      )
    )
      return [];
    const base = point ?? low!;
    return [
      {
        metalId: String(r.metal_id),
        specification: String(r.specification),
        pricePerKg: base,
        pricePerTon: base * 1000,
        minimumPerKg: low ?? undefined,
        maximumPerKg: high ?? undefined,
        massBasis: r.mass_basis as DisplayedPrice["massBasis"],
        observedOn: String(r.observed_on ?? ""),
        dateLabel: r.observed_on
          ? String(r.observed_on)
          : "Дата исходного наблюдения не указана",
        sourcePublishedOn: r.source_published_on
          ? String(r.source_published_on)
          : undefined,
        sourceName: "Данные владельца · " + String(r.claimed_publisher),
        sourceUrl: String(r.evidence_url ?? ""),
        kind: "Исторический рыночный ориентир",
        category: "owner_reference" as const,
        region: String(r.basis_description),
        marketRegion: r.market_region as DisplayedPrice["marketRegion"],
        regionVerified: r.region_verified === true,
        taxStatus: r.tax_status as DisplayedPrice["taxStatus"],
        checkedAt: Date.parse(String(r.recorded_at)),
        stale: true,
        verificationStatus:
          r.verification_status as DisplayedPrice["verificationStatus"],
        notes: String(r.verification_note),
      },
    ];
  });
}
/** Private UI model only: never passed to quote calculations, model context or exports. */
export async function fetchPrimaryPrices(): Promise<DisplayedPrice[]> {
  const [rows, privatePrices] = await Promise.all([
    fetchDisplayedPrices(),
    supabase
      ? supabase
          .from("private_market_references")
          .select(
            "metal_id,minimum_usd_kg,maximum_usd_kg,point_usd_kg,mass_basis,specification,market_region,region_verified,basis_description,observed_on,source_published_on,claimed_publisher,evidence_url,tax_status,verification_status,verification_note,recorded_at",
          )
          .order("recorded_at", { ascending: false })
          .limit(500)
      : Promise.resolve(null),
  ]);
  if (privatePrices?.error)
    throw Error(
      "Не удалось загрузить частные исторические ориентиры. Повторите попытку.",
    );
  const owner = parseOwnerReferences(privatePrices?.data ?? []);
  // Preserve public monthly references as a separate source; choose per region before precedence.
  return [...owner, ...rows.filter((r) => r.category !== "supplier")];
}
