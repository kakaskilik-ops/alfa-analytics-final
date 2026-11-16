import { verifyGuestChallenge } from "../_shared/guestAccess.ts";
import { handler as legacy } from "./legacy.ts";
import { guard, json } from "../_shared/http.ts";
import { serverClient } from "../_shared/jobs.ts";
import { limitedText } from "../_shared/network.ts";
import { parseAiInput } from "../_shared/analysis.ts";
import { buildMarketEvidence } from "../_shared/marketEvidence.ts";
import {
  analyseVerifiedFacts,
  ModelError,
  renderVerifiedReport,
  modelConfigurations,
} from "../_shared/marketAnalyst.ts";
const messages: Record<string, string> = {
  ai_not_configured:
    "Бесплатный ИИ пока не подключён. Ключ провайдера настраивает администратор; реальный ответ модели ещё не проверен.",
  insufficient_market_evidence:
    "Нет подтверждённых рыночных показателей для выбранного металла. Одних валютных курсов недостаточно для заключения.",
  ai_budget_exhausted:
    "Лимит бесплатного ИИ на сегодня или на эту минуту исчерпан. Данные сайта остаются доступны.",
  provider_rate_limit:
    "Бесплатный провайдер ограничил частоту запросов. Повторите позже.",
  provider_access_denied:
    "Провайдер отклонил доступ. Проверьте ключ, регион и условия аккаунта в панели провайдера.",
  provider_unavailable:
    "Бесплатный провайдер временно недоступен. Ответ не сформирован.",
  context_too_large:
    "Для бесплатной модели этот объём данных слишком велик. Выберите меньше металлов или более короткий период; история не была скрыто сокращена.",
  analysis_in_progress: "Такой анализ уже формируется. Повторите запрос позже.",
  unverified_model_response:
    "Ответ модели не прошёл проверку фактов и формата и не опубликован. Попробуйте позже.",
};
export async function handler(req: Request): Promise<Response> {
  // Existing paid integration remains available only behind an explicit owner opt-in.
  if (
    !Deno.env.get("GROQ_API_KEY") &&
    Deno.env.get("AI_PROVIDER") === "openai" &&
    Deno.env.get("ALLOW_PAID_AI") === "true"
  )
    return legacy(req);
  const rejected = guard(req, 24576);
  if (rejected) return rejected;
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json(req, { error: "Сервис не настроен" }, 503);
  const db = serverClient(url, key),
    token = req.headers.get("authorization")?.replace(/^Bearer /i, "");

  try {
    let ownerId: string | undefined, guestId: string | undefined;
    if (token) {
      const {
        data: { user },
        error,
      } = await db.auth.getUser(token);
      if (error || !user)
        return json(
          req,
          { error: "Сессия недействительна. Обновите страницу." },
          401,
        );
      ownerId = user.id;
    }
    let input, raw: string;
    try {
      raw = await limitedText(new Response(req.body), 24576);
      const body = JSON.parse(raw);
      if (body.website)
        return json(req, { error: "Запрос отклонён защитой от спама." }, 403);
      input = parseAiInput(body);
    } catch {
      return json(req, { error: "Некорректный запрос" }, 400);
    }
    let nonce: string | undefined;
    if (!ownerId) {
      const proof = await verifyGuestChallenge(req, key, raw!);
      if (!proof)
        return json(
          req,
          {
            error:
              "Не пройдена проверка защиты чата. Обновите страницу и повторите запрос.",
          },
          403,
        );
      guestId = proof.visitor;
      nonce = proof.nonce;
    }
    const { data: quota, error: quotaError } = ownerId
      ? await db.rpc("consume_ai_quota", { p_user_id: ownerId })
      : await db.rpc("consume_guest_ai_quota", {
          p_visitor_hash: guestId,
          p_nonce: nonce,
        });
    if (quotaError)
      return json(
        req,
        { error: "Не удалось проверить лимит чата. Повторите позже." },
        503,
      );
    if (!quota)
      return json(
        req,
        {
          error:
            "Лимит бесплатного чата: до пяти запросов в сутки с одной сети и пауза не менее тридцати секунд.",
        },
        429,
      );
    if (!modelConfigurations().length)
      throw new ModelError("ai_not_configured");
    const evidence = await buildMarketEvidence(db, input);
    const scope = {
      period: input.period,
      region: input.region,
      metalIds: evidence.metalIds,
      start: evidence.start.slice(0, 10),
      end: evidence.end.slice(0, 10),
      coverage: evidence.coverage,
    };
    const result = await analyseVerifiedFacts(db, {
      facts: evidence.facts,
      analytics: evidence.analytics,
      question: input.question,
      scope,
      ownerId,
      guestId,
      messages: input.messages,
    });
    return json(req, {
      text: renderVerifiedReport(result.report),
      report: result.report,
      cached: result.cached,
      coverage: evidence.coverage,
    });
  } catch (e) {
    const code = e instanceof ModelError ? e.code : "evidence_unavailable";
    console.error("market_ai:" + code);
    return json(
      req,
      {
        error:
          messages[code] ??
          "Не удалось проверить данные для анализа. Ответ не сформирован.",
        code,
      },
      code === "ai_budget_exhausted" || code === "provider_rate_limit"
        ? 429
        : code === "analysis_in_progress"
          ? 409
          : 503,
    );
  }
}
