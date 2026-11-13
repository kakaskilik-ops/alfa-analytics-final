export function allowedOrigins():string[]{return [...new Set(['https://alfammetal.ru','https://www.alfammetal.ru',...(Deno.env.get('ALLOWED_ORIGIN')??'').split(',').map(v=>v.trim()).filter(Boolean)])];}
export function headers(req: Request): Record<string, string> {
  const allowed = allowedOrigins();
  const origin=req.headers.get("origin")??"";
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    ...(allowed.includes(origin)
      ? { "Access-Control-Allow-Origin": origin }
      : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
  };
}
export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}
export function guard(req: Request, maxBytes = 8192): Response | null {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== "POST")
    return json(req, { error: "Метод не поддерживается" }, 405);
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins().includes(origin))
    return json(req, { error: "Доступ запрещён" }, 403);
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes)
    return json(req, { error: "Слишком большой запрос" }, 413);
  return null;
}
