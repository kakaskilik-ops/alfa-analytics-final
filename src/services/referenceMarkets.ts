import { supabase } from "@/lib/supabase";
import {
  REFERENCE_SERIES,
  WORLD_BANK_SOURCE,
  type ReferenceObservation,
} from "../../shared/referenceMarkets";
export interface ReferencePrice extends ReferenceObservation {
  retrievedAt: number;
}
let pending: Promise<ReferencePrice[]> | null = null,
  cache: ReferencePrice[] | null = null,
  cachedAt = 0;
export function parseReferenceRows(
  rows: Record<string, unknown>[],
  now = Date.now(),
): ReferencePrice[] {
  const dates = new Map<string, ReferencePrice>();
  for (const r of rows) {
    const price = Number(r.price),
      retrievedAt = Date.parse(String(r.retrieved_at)),
      period = String(r.period_start),
      series = REFERENCE_SERIES.find((s) => s.id === r.metal_id);
    if (
      !series ||
      r.source_id !== WORLD_BANK_SOURCE ||
      r.currency !== "USD" ||
      r.unit !== "ton" ||
      r.region !== "Мировой ориентир (LME)" ||
      !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(period) ||
      Date.parse(period) >=
        Date.UTC(
          new Date(now).getUTCFullYear(),
          new Date(now).getUTCMonth(),
          1,
        ) ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(retrievedAt) ||
      retrievedAt > now + 300000 ||
      typeof r.specification !== "string" ||
      !r.specification.trim()
    )
      continue;
    const key = series.id + period,
      old = dates.get(key);
    if (!old || old.retrievedAt < retrievedAt)
      dates.set(key, {
        metal_id: series.id,
        period_start: period,
        price,
        currency: "USD",
        unit: "ton",
        region: "Мировой ориентир (LME)",
        specification: r.specification,
        retrievedAt,
      });
  }
  return [...dates.values()].sort((a, b) =>
    a.period_start.localeCompare(b.period_start),
  );
}
export async function fetchReferencePrices(): Promise<ReferencePrice[]> {
  if (cache && Date.now() - cachedAt < 300000) return cache;
  if (pending) return pending;
  pending = (async () => {
    if (!supabase) throw new Error("Подключение к базе данных не настроено.");
    const { data, error } = await supabase
      .from("reference_price_observations")
      .select(
        "metal_id,source_id,period_start,price,currency,unit,region,specification,retrieved_at",
      )
      .eq("source_id", WORLD_BANK_SOURCE)
      .order("retrieved_at", { ascending: false })
      .limit(600);
    if (error) throw new Error("Не удалось загрузить месячные ориентиры.");
    cache = parseReferenceRows(data ?? []);
    cachedAt = Date.now();
    return cache;
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
