import type { VerifiedReport } from "../../shared/aiReport";
import { supabase, invokeAnalysis } from "@/lib/supabase";
import type { MetalQuote } from "@/types/market";
export interface AiRequest {
  question: string;
  website?: string;
  kind?: "chat" | "news" | "daily" | "weekly";
  newsId?: string;
  region?: string;
  messages?: { role: "user" | "assistant"; content: string }[];
  metalIds?: string[];
  period?: string;
  startDate?: string;
  endDate?: string;
  context?: Record<string, unknown>;
}
export interface AiResponse {
  text: string;
  quotes: MetalQuote[];
  report?: VerifiedReport;
  cached?: boolean;
}
export const AI_STATUS = {
  enabled: Boolean(supabase),
  message: "Чат без регистрации. Действуют серверные лимиты бесплатного ИИ.",
};
export async function sendAiRequest(
  request: AiRequest,
  _at: Date,
): Promise<AiResponse> {
  if (!supabase) throw new Error("ИИ недоступен: база данных не подключена.");
  const data = await invokeAnalysis({
    question: request.question,
    website: request.website ?? "",
    kind: request.kind,
    newsId: request.newsId,
    region: request.region,
    messages: request.messages,
    metalIds: request.metalIds,
    period: request.period ?? "1M",
    startDate: request.startDate,
    endDate: request.endDate,
  });
  if (
    !data ||
    typeof data !== "object" ||
    !("text" in data) ||
    typeof data.text !== "string"
  )
    throw new Error("Некорректный ответ ИИ.");
  return {
    text: data.text,
    quotes: [],
    ...("report" in data ? { report: data.report as VerifiedReport } : {}),
    ...("cached" in data ? { cached: Boolean(data.cached) } : {}),
  };
}
