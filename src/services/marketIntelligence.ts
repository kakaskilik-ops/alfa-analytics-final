import { supabase } from "@/lib/supabase";
import type { VerifiedReport } from "../../shared/aiReport";
import { validateAnalystDraft } from "../../shared/aiReport";
export interface AiRuntimeStatus {
  configured: boolean;
  verifiedAt: string | null;
  primary: { provider: string; model: string } | null;
  message: string;
}
export async function fetchAiRuntimeStatus(): Promise<AiRuntimeStatus> {
  if (!supabase)
    return {
      configured: false,
      verifiedAt: null,
      primary: null,
      message: "Подключение Supabase не настроено.",
    };
  const { data, error } = await supabase.functions.invoke("ai-status", {
    method: "GET",
  });
  if (error || !data || typeof data.configured !== "boolean")
    throw new Error("Не удалось проверить доступность ИИ.");
  return data as AiRuntimeStatus;
}
export async function fetchLatestMarketReport(): Promise<VerifiedReport | null> {
  if (!supabase) throw new Error("База данных не подключена.");
  const { data, error } = await supabase
    .from("market_ai_reports")
    .select("report")
    .order("generated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error("Последний отчёт временно недоступен.");
  const report = data?.[0]?.report;
  if (!report) return null;
  try {
    if (
      !Array.isArray(report.facts) ||
      !Array.isArray(report.sources) ||
      typeof report.generatedAt !== "string" ||
      typeof report.model !== "string"
    )
      throw new Error("invalid_report");
    validateAnalystDraft(report.draft, report.facts);
    return report as VerifiedReport;
  } catch {
    throw new Error("Сохранённый отчёт не прошёл проверку формата.");
  }
}
export interface MarketStatistic {
  metalId: string;
  metric: string;
  value: number;
  unit: string;
  year: number;
  country: string;
  region: string;
  commodity: string;
  description: string;
  estimated: boolean;
  source: string;
  sourceUrl: string;
  retrievedAt: number;
}
export async function fetchMetalStatistics(
  metalId: string,
): Promise<MarketStatistic[]> {
  if (!supabase) throw new Error("База данных не подключена.");
  const { data, error } = await supabase
    .from("market_statistics")
    .select(
      "metal_id,metric,value,unit,period_year,country,region,commodity_code,product_description,estimated,source_id,source_url,retrieved_at",
    )
    .eq("metal_id", metalId)
    .order("period_year", { ascending: false })
    .order("country", { ascending: true })
    .limit(120);
  if (error) throw new Error("Не удалось получить статистику материала.");
  return (data ?? []).flatMap((r) => {
    const value = Number(r.value),
      at = Date.parse(r.retrieved_at);
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      r.period_year >= new Date().getUTCFullYear() ||
      r.metal_id !== metalId ||
      !Number.isFinite(at)
    )
      return [];
    let url;
    try {
      url = new URL(r.source_url);
      if (url.protocol !== "https:" || url.username || url.password) return [];
    } catch {
      return [];
    }
    return [
      {
        metalId: r.metal_id,
        metric: r.metric,
        value,
        unit: r.unit,
        year: r.period_year,
        country: r.country,
        region: r.region,
        commodity: r.commodity_code,
        description: r.product_description,
        estimated: r.estimated,
        source: r.source_id,
        sourceUrl: url.href,
        retrievedAt: at,
      },
    ];
  });
}
