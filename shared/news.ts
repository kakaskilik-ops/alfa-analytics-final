import { XMLParser, XMLValidator } from "fast-xml-parser";
import { METAL_IDS } from "../supabase/functions/_shared/universe.ts";
export const NEWS_CATEGORIES = {
  mining: "Добыча",
  production: "Производство",
  trade: "Экспорт и импорт",
  sanctions: "Санкции",
  logistics: "Логистика",
  demand: "Спрос",
  supply: "Предложение",
  technology: "Технологии",
  regulation: "Регулирование",
} as const;
const terms: Record<string, RegExp> = {
  tungsten: /(?:\btungsten\b|вольфрам)/iu,
  molybdenum: /(?:\bmolybdenum\b|молибден)/iu,
  ferromolybdenum: /(?:\bferro[ -]?molybdenum\b|ферромолибден)/iu,
  ferrotungsten: /(?:\bferro[ -]?tungsten\b|ферровольфрам)/iu,
  tin: /(?:\btin\b|олов[оа])/iu,
  zinc: /(?:\bzinc\b|цинк)/iu,
  copper: /(?:\bcopper\b|(?<![\p{L}])мед(?:ь|и|ью|н[а-яё]*)(?![\p{L}]))/iu,
  aluminum: /(?:\balumin(?:um|ium)\b|алюмини)/iu,
  chromium: /(?:\bchromium\b|хром)/iu,
  cobalt: /(?:\bcobalt\b|кобальт)/iu,
  zirconium: /(?:\bzirconium\b|циркони)/iu,
  niobium: /(?:\bniobium\b|ниоби)/iu,
  tantalum: /(?:\btantalum\b|тантал)/iu,
};
const categoryTerms: Record<keyof typeof NEWS_CATEGORIES, RegExp> = {
  mining: /mining|\bmine\b|deposit|\bore\b|добыч|месторожд|рудник/iu,
  production: /produc|smelt|refin|производ|плавк|переработ/iu,
  trade: /export|import|tariff|экспорт|импорт|пошлин/iu,
  sanctions: /sanction|санкци/iu,
  logistics:
    /logistic|shipping|freight|логист|перевоз|транспорт|(?:^|[^а-яё])порт[а-яё]*/iu,
  demand: /demand|consum|спрос|потреблен/iu,
  supply: /supply|shortage|поставк|дефицит|предложени/iu,
  technology: /technolog|battery|alloy|технолог|аккумулятор|сплав/iu,
  regulation:
    /regulat|government|policy|critical mineral|правительств|регулир|закон/iu,
};
export function classifyNews(title: string, excerpt: string) {
  const text = `${title} ${excerpt}`.normalize("NFKC");
  const categories = (
    Object.keys(categoryTerms) as (keyof typeof NEWS_CATEGORIES)[]
  ).filter((k) => categoryTerms[k].test(text));
  const metalIds = METAL_IDS.filter((id) => terms[id].test(text));
  // Require an explicit metal name and industrial/economic context, never bare W/Sn/Co.
  if (
    !categories.length ||
    !metalIds.length ||
    /copper (?:hair|haircut)|tin man|tin soldier|cobalt (?:blue dress|paint colour|strike)|chromium (?:browser|web browser)/iu.test(
      text,
    )
  )
    return null;
  const regions: string[] = [];
  if (/europe|european|germany|france|европ|германи/iu.test(text))
    regions.push("Европа");
  if (/\bU\.?S\.?A?\b|united states|american|США|американ/iu.test(text))
    regions.push("США");
  if (/asia|china|japan|korea|ази[яи]|кита[йя]|япони|коре/iu.test(text))
    regions.push("Азия");
  return { metalIds: [...metalIds], regions, categories };
}
export function stripMarkup(v: unknown, max = 800): string {
  const s =
    typeof v === "string"
      ? v
      : typeof v === "object" && v !== null && "#text" in v
        ? String((v as Record<string, unknown>)["#text"])
        : "";
  return s
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
export function canonicalUrl(input: string): string {
  const u = new URL(input);
  if (u.protocol !== "https:" || u.username || u.password)
    throw new Error("invalid_article_url");
  for (const key of [...u.searchParams.keys()])
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key);
  u.hash = "";
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/$/, "") || "/";
  return u.href;
}
export interface FeedItem {
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string;
}
function asList(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}
export function parseFeed(
  text: string,
  format: "rss" | "atom" | "json" = "rss",
  now = Date.now(),
): FeedItem[] {
  if (
    new TextEncoder().encode(text).length > 1048576 ||
    /<!DOCTYPE|<!ENTITY/i.test(text)
  )
    throw new Error("unsafe_feed");
  let entries: unknown[];
  if (format === "json") {
    const payload = JSON.parse(text);
    if (!payload || !Array.isArray(payload.items))
      throw new Error("invalid_json_feed");
    entries = payload.items;
  } else {
    if (XMLValidator.validate(text) !== true) throw new Error("invalid_xml");
    const root = new XMLParser({
      ignoreAttributes: false,
      processEntities: false,
      parseTagValue: false,
    }).parse(text);
    if (!root.rss?.channel && !root.feed) throw new Error("invalid_feed_shape");
    entries = asList(root.rss?.channel?.item ?? root.feed?.entry);
  }
  const result: FeedItem[] = [];
  for (const raw of entries.slice(0, 100)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const title = stripMarkup(r.title, 300),
      excerpt = stripMarkup(r.description ?? r.summary ?? r.content_text, 800);
    const links = asList(r.link);
    const link = links.find(
      (l) =>
        typeof l === "string" ||
        (typeof l === "object" &&
          l !== null &&
          (!("@_rel" in l) ||
            (l as Record<string, unknown>)["@_rel"] === "alternate")),
    );
    const href =
      typeof link === "string"
        ? link
        : link && typeof link === "object"
          ? String((link as Record<string, unknown>)["@_href"] ?? "")
          : String(r.url ?? "");
    const date = Date.parse(
      String(r.pubDate ?? r.published ?? r.updated ?? r.date_published ?? ""),
    );
    if (!title || !Number.isFinite(date) || date > now + 300000) continue;
    try {
      result.push({
        title,
        url: canonicalUrl(href),
        excerpt,
        publishedAt: new Date(date).toISOString(),
      });
    } catch {
      /* Invalid links are not published. */
    }
  }
  return [...new Map(result.map((r) => [r.url, r])).values()];
}
export async function newsFingerprint(
  title: string,
  publishedAt: string,
): Promise<string> {
  const normalized = title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${normalized}|${publishedAt.slice(0, 10)}`),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
