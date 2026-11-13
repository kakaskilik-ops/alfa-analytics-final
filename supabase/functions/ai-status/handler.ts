import { modelConfigurations } from "../_shared/freeModels.ts";
import { serverClient } from "../_shared/jobs.ts";
export async function handler(req: Request): Promise<Response> {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "GET")
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers,
    });
  const configs = modelConfigurations(),
    url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let verifiedAt: string | null = null;
  if (url && key && configs.length) {
    const db = serverClient(url, key);
    const { data } = await db
      .from("ai_provider_health")
      .select("last_success_at")
      .in("provider", [...new Set(configs.map((c) => c.provider))])
      .order("last_success_at", { ascending: false })
      .limit(1);
    verifiedAt = data?.[0]?.last_success_at ?? null;
  }
  return new Response(
    JSON.stringify({
      configured: configs.length > 0,
      verifiedAt,
      primary: configs[0]
        ? { provider: configs[0].provider, model: configs[0].model }
        : null,
      freeOnly: true,
      message: !configs.length
        ? "Бесплатный провайдер ещё не настроен. Реальный ответ модели пока не проверен."
        : verifiedAt
          ? "Реальный ответ провайдера проходил проверку. Доступность бесплатного API может меняться."
          : "Ключ настроен, но успешный проверенный ответ модели ещё не зарегистрирован.",
    }),
    { headers },
  );
}
