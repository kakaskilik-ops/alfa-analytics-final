import { supabase, invokeAnalysis } from "@/lib/supabase";
import type { MetalQuote } from "@/types/market";
export interface AiRequest {
  question: string;
  kind?: "chat" | "news" | "daily" | "weekly";
  newsId?: string;
  region?: string;
  messages?: { role: "user" | "assistant"; content: string }[];
  metalIds?: string[];
  period?: string;
  context?: Record<string, unknown>;
}
export interface AiResponse {
  text: string;
  quotes: MetalQuote[];
}
export const AI_STATUS = {
  enabled: Boolean(supabase),
  message: "Для анализа требуется вход в систему и настроенный серверный API.",
};
export async function sendAiRequest(
  request: AiRequest,
  _at: Date,
): Promise<AiResponse> {
  if (!supabase) throw new Error("ИИ недоступен: база данных не подключена.");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Для ИИ-аналитики войдите в систему.");
  const data = await invokeAnalysis(
    {
      question: request.question,
      kind: request.kind,
      newsId: request.newsId,
      region: request.region,
      messages: request.messages,
      metalIds: request.metalIds,
      period: request.period ?? "1M",
    },
    session.access_token,
  );
  if (
    !data ||
    typeof data !== "object" ||
    !("text" in data) ||
    typeof data.text !== "string"
  )
    throw new Error("Некорректный ответ ИИ.");
  return { text: data.text, quotes: [] };
}
