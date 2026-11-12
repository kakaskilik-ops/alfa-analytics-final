export function headers(req: Request): Record<string, string> {
  const allowed = Deno.env.get("ALLOWED_ORIGIN") ?? "";
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    ...(req.headers.get("origin") === allowed && allowed
      ? { "Access-Control-Allow-Origin": allowed }
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
  if (origin && origin !== Deno.env.get("ALLOWED_ORIGIN"))
    return json(req, { error: "Доступ запрещён" }, 403);
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes)
    return json(req, { error: "Слишком большой запрос" }, 413);
  return null;
}
