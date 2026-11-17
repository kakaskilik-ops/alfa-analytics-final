import { supabase } from "@/lib/supabase";
import { type MonitorEvent, MONITOR_STAGES } from "../../shared/monitor";
import { METAL_IDS } from "../../supabase/functions/_shared/universe";
export interface MonitorRow {
  id: string;
  sourceId: string;
  revision: number;
  checkedAt: string;
  data: MonitorEvent;
  title: string;
  body: string;
}
export interface MonitorSource {
  id: string;
  name: string;
  home_url: string;
  license_url: string;
  supported_regions: string[];
  supported_metals: string[];
  min_interval_seconds: number;
  enabled: boolean;
  status: string;
  last_checked_at: string | null;
  last_success_at: string | null;
  error_code: string | null;
}
export interface MonitorUpdate {
  id: number;
  event_id: string;
  revision: number;
  action: string;
  reason: string;
  created_at: string;
}
export interface MonitorData {
  events: MonitorRow[];
  sources: MonitorSource[];
  updates: MonitorUpdate[];
  truncated: boolean;
}
export function parsePublicMonitorRow(
  r: Record<string, unknown>,
): MonitorRow | null {
  const e = r.data as MonitorEvent | undefined;
  if (
    !e ||
    !Array.isArray(e.metalIds) ||
    !e.metalIds.length ||
    e.metalIds.some(
      (m) => !METAL_IDS.includes(m as (typeof METAL_IDS)[number]),
    ) ||
    !Object.prototype.hasOwnProperty.call(MONITOR_STAGES, e.stage) ||
    !e.country ||
    !e.region ||
    !e.publishedOn ||
    typeof r.id !== "string" ||
    typeof r.source_id !== "string" ||
    typeof r.last_checked_at !== "string"
  )
    return null;
  try {
    const u = new URL(e.sourceUrl);
    if (u.protocol !== "https:" || u.username || u.password) return null;
  } catch {
    return null;
  }
  return {
    id: r.id,
    sourceId: r.source_id,
    revision: Number(r.revision),
    checkedAt: r.last_checked_at,
    data: e,
    title: "",
    body: "",
  };
}
export async function fetchMonitorData(): Promise<MonitorData> {
  if (!supabase)
    throw Error(
      "Монитор не подключён к базе. Демонстрационные события не создаются.",
    );
  const [events, sources, updates] = await Promise.all([
    supabase
      .from("monitor_events")
      .select("id,source_id,data,revision,last_checked_at")
      .order("published_on", { ascending: false, nullsFirst: false })
      .order("id")
      .limit(201),
    supabase
      .from("monitor_sources")
      .select(
        "id,name,home_url,license_url,supported_regions,supported_metals,min_interval_seconds,enabled,status,last_checked_at,last_success_at,error_code",
      )
      .order("id"),
    supabase
      .from("monitor_public_updates")
      .select("id,event_id,revision,action,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (events.error || sources.error || updates.error)
    throw Error(
      "Данные мониторинга пока недоступны. Модуль требует применения миграции и включения проверенных источников.",
    );
  const rows = (events.data ?? []).slice(0, 200).flatMap((r) => {
    const v = parsePublicMonitorRow(r);
    return v ? [v] : [];
  });
  if (rows.length) {
    const publications = await supabase
      .from("monitor_publications")
      .select("event_id,revision,title_ru,body_ru")
      .in(
        "event_id",
        rows.map((r) => r.id),
      );
    if (publications.error)
      throw Error("Не удалось загрузить подтверждённые публикации монитора.");
    for (const row of rows) {
      const story = publications.data?.find(
        (p) => p.event_id === row.id && p.revision === row.revision,
      );
      if (story) {
        row.title = story.title_ru;
        row.body = story.body_ru;
      }
    }
  }
  return {
    events: rows,
    sources: (sources.data ?? []) as MonitorSource[],
    updates: (updates.data ?? []) as MonitorUpdate[],
    truncated: (events.data?.length ?? 0) > 200,
  };
}
