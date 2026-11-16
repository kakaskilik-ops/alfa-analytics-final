import {
  resolveAnalysisWindow,
  type AnalysisWindow,
} from "../../../shared/analysisWindow.ts";
export { PERIOD_DAYS } from "../../../shared/analysisWindow.ts";
import { isMetal, isRegion, METAL_IDS } from "./universe.ts";
export interface AiInput {
  question: string;
  metalIds: string[];
  period: string;
  region: string | null;
  newsId: string | null;
  kind: "chat" | "news" | "daily" | "weekly";
  startDate?: string;
  endDate?: string;
  window?: AnalysisWindow;
  messages: { role: "user" | "assistant"; content: string }[];
}
export function parseAiInput(raw: unknown, now = Date.now()): AiInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("invalid_request");
  const r = raw as Record<string, unknown>;
  if (
    typeof r.question !== "string" ||
    r.question.trim().length < 3 ||
    r.question.length > 2000
  )
    throw new Error("invalid_question");
  const window = resolveAnalysisWindow(
    {
      question: r.question,
      period: r.period as string | undefined,
      startDate: r.startDate as string | undefined,
      endDate: r.endDate as string | undefined,
    },
    now,
  );
  const period = window.period;
  const ids = r.metalIds ?? [];
  if (!Array.isArray(ids) || ids.length > 13 || ids.some((id) => !isMetal(id)))
    throw new Error("invalid_metals");
  if (r.region != null && !isRegion(r.region))
    throw new Error("invalid_region");
  if (
    r.newsId != null &&
    (typeof r.newsId !== "string" || !/^[0-9a-f-]{36}$/i.test(r.newsId))
  )
    throw new Error("invalid_news_id");
  const kind = r.kind ?? "chat";
  if (!["chat", "news", "daily", "weekly"].includes(String(kind)))
    throw new Error("invalid_kind");
  if (kind === "news" && r.newsId == null) throw new Error("missing_news_id");
  const messages = r.messages ?? [];
  if (
    !Array.isArray(messages) ||
    messages.length > 10 ||
    messages.some(
      (m) =>
        !m ||
        !["user", "assistant"].includes(m.role) ||
        typeof m.content !== "string" ||
        m.content.length > 2000,
    )
  )
    throw new Error("invalid_history");
  return {
    question: r.question.trim(),
    metalIds: [...new Set(ids as string[])],
    period,
    startDate: window.requested.start,
    endDate: window.requested.end,
    window,
    region: (r.region as string) ?? null,
    newsId: (r.newsId as string) ?? null,
    kind: kind as AiInput["kind"],
    messages,
  };
}
export function chooseMetalIds(
  input: AiInput,
  catalog: { id: string; name_ru: string; symbol: string; aliases: string[] }[],
): string[] {
  const text = input.question.toLowerCase();
  const terms: Record<string, RegExp> = {
    copper: /(?<![а-яa-z])(?:мед[ьиью]|copper)(?![а-яa-z])/iu,
    aluminum: /алюмини|\balumin(?:um|ium)\b/iu,
    tungsten: /(?<![а-яa-z])(?:вольфрам|tungsten)/iu,
    molybdenum: /(?<![а-яa-z])(?:молибден|molybdenum)/iu,
    ferromolybdenum: /ферромолибден|ferro[ -]?molybdenum/iu,
    ferrotungsten: /ферровольфрам|ferro[ -]?tungsten/iu,
    tin: /олов[оаяу]|\btin\b/iu,
    zinc: /цинк|\bzinc\b/iu,
    chromium: /хром|\bchromium\b/iu,
    cobalt: /кобальт|\bcobalt\b/iu,
    zirconium: /циркони|\bzirconium\b/iu,
    niobium: /ниоби|\bniobium\b/iu,
    tantalum: /тантал|\btantalum\b/iu,
  };
  const mentioned = catalog
    .filter(
      (m) =>
        isMetal(m.id) &&
        (terms[m.id]?.test(text) ||
          new RegExp(`(?<![A-Za-zА-Яа-я])${m.symbol}(?![A-Za-zА-Яа-я])`).test(
            input.question,
          )),
    )
    .map((m) => m.id);
  if (mentioned.length) return mentioned;
  return input.metalIds.length ? input.metalIds : [...METAL_IDS];
}
export interface RegionalObservation {
  metal_id: string;
  source_id: string;
  region: string;
  normalized_price: number;
  quoted_at: string;
  specification: string;
  independence_id: string;
}
export function compareRegionalPrices(rows: RegionalObservation[]) {
  const groups = new Map<string, RegionalObservation[]>();
  for (const q of rows) {
    if (
      !isMetal(q.metal_id) ||
      !isRegion(q.region) ||
      !Number.isFinite(q.normalized_price) ||
      q.normalized_price <= 0
    )
      continue;
    const key = JSON.stringify([q.metal_id, q.specification, q.region]);
    const arr = groups.get(key) ?? [];
    arr.push(q);
    groups.set(key, arr);
  }
  const estimates = [...groups.values()].flatMap((arr) => {
    const latest = new Map<string, RegionalObservation>();
    for (const q of arr) {
      const k = q.independence_id || q.source_id;
      if (
        !latest.has(k) ||
        Date.parse(latest.get(k)!.quoted_at) < Date.parse(q.quoted_at)
      )
        latest.set(k, q);
    }
    const prices = [...latest.values()]
      .map((q) => q.normalized_price)
      .sort((a, b) => a - b);
    if (prices.length < 2) return [];
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const spread =
      Math.sqrt(
        prices.reduce((sum, v) => sum + (v - mean) ** 2, 0) / prices.length,
      ) / mean;
    if (spread > 0.3) return [];
    const middle = Math.floor(prices.length / 2);
    return [
      {
        metalId: arr[0].metal_id,
        specification: arr[0].specification,
        region: arr[0].region,
        median:
          prices.length % 2
            ? prices[middle]
            : (prices[middle - 1] + prices[middle]) / 2,
        sources: [...latest.values()].map((q) => q.source_id),
      },
    ];
  });
  const differences = estimates.flatMap((a, i) =>
    estimates
      .slice(i + 1)
      .filter(
        (b) => a.metalId === b.metalId && a.specification === b.specification,
      )
      .map((b) => ({
        metalId: a.metalId,
        from: a.region,
        to: b.region,
        percent: (b.median / a.median - 1) * 100,
        sources: [...a.sources, ...b.sources],
      })),
  );
  return { estimates, differences };
}
