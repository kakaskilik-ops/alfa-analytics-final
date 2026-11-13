import { supabase } from "@/lib/supabase";
import { isMetal } from "../../supabase/functions/_shared/universe";
export interface NewsArticle {
  id: string;
  sourceId: string;
  sourceName: string;
  url: string;
  originalTitle: string;
  titleRu: string | null;
  summaryRu: string | null;
  excerpt: string;
  translationStatus: string;
  metalIds: string[];
  regions: string[];
  categories: string[];
  publishedAt: number;
  retrievedAt: number;
}
export async function fetchNews(
  filters: {
    metal?: string;
    region?: string;
    category?: string;
    days?: number;
    limit?: number;
  } = {},
): Promise<NewsArticle[]> {
  if (!supabase) throw new Error("База новостей не подключена.");
  let query = supabase
    .from("news_articles")
    .select(
      "id,scope,source_id,canonical_url,original_title,title_ru,summary_ru,excerpt,translation_status,metal_ids,regions,categories,published_at,retrieved_at,news_sources(name)",
    )
    .eq("is_public", true)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(filters.limit ?? 60);
  if (filters.metal) query = query.contains("metal_ids", [filters.metal]);
  if (filters.region) query = query.contains("regions", [filters.region]);
  if (filters.category)
    query = query.contains("categories", [filters.category]);
  if (filters.days)
    query = query.gte(
      "published_at",
      new Date(Date.now() - filters.days * 86400000).toISOString(),
    );
  const { data, error } = await query;
  if (error) throw new Error("Не удалось загрузить новости.");
  return (data ?? []).flatMap((r) => {
    const date = Date.parse(r.published_at),
      received = Date.parse(r.retrieved_at);
    let url;
    try {
      url = new URL(r.canonical_url);
    } catch {
      return [];
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !Array.isArray(r.metal_ids) ||
      (!r.metal_ids.length && r.scope !== "sector") ||
      !r.metal_ids.every(isMetal) ||
      !Number.isFinite(date) ||
      !Number.isFinite(received)
    )
      return [];
    const source = r.news_sources as unknown as { name: string } | null;
    return [
      {
        id: r.id,
        sourceId: r.source_id,
        sourceName: source?.name ?? r.source_id,
        url: url.href,
        originalTitle: String(r.original_title),
        titleRu: r.title_ru,
        summaryRu: r.summary_ru,
        excerpt: String(r.excerpt),
        translationStatus: r.translation_status,
        metalIds: r.metal_ids,
        regions: Array.isArray(r.regions) ? r.regions : [],
        categories: Array.isArray(r.categories) ? r.categories : [],
        publishedAt: date,
        retrievedAt: received,
      },
    ];
  });
}
export async function fetchNewsSources() {
  if (!supabase) throw new Error("Реестр новостных источников недоступен.");
  const { data, error } = await supabase
    .from("news_sources")
    .select("id,name,home_url,last_success_at,status,license_note");
  if (error) throw new Error("Реестр новостей не загружен.");
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    url: String(r.home_url),
    updatedAt: r.last_success_at ? Date.parse(r.last_success_at) : null,
    status: String(r.status),
    license: String(r.license_note),
  }));
}
