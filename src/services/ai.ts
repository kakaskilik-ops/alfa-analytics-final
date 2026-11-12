import { supabase } from "@/lib/supabase";
import type { MetalQuote } from "@/types/market";
export interface AiRequest {
  question: string;
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
  const { data, error } = await supabase.functions.invoke("ai-analyze", {
    body: {
      question: request.question,
      metalIds: request.metalIds,
      period: request.period ?? "1M",
    },
  });
  if (error || typeof data?.text !== "string")
    throw new Error("Сервис ИИ недоступен или лимит запросов исчерпан.");
  return { text: data.text, quotes: [] };
}
