import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { limitedText } from "../_shared/network.ts";
import { visitorHash } from "../_shared/guestAccess.ts";

const bytes = (s: string) => new TextEncoder().encode(s);
export async function sameKey(input: string, secret: string) {
  const [a, b] = await Promise.all(
    [input, secret].map((s) => crypto.subtle.digest("SHA-256", bytes(s))),
  );
  const left = new Uint8Array(a),
    right = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
function allowedOrigin(origin: string | null) {
  if (!origin) return true; // non-browser clients still require the secret and atomic rate limit
  return (
    origin === "https://alfammetal.ru" ||
    origin === "https://alfa-analytics-final.pages.dev" ||
    /^https:\/\/[a-z0-9-]+\.alfa-analytics-final\.pages\.dev$/.test(origin) ||
    /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)
  );
}
export async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "content-type,apikey,authorization,x-client-info",
  };
  if (origin && allowedOrigin(origin))
    headers["Access-Control-Allow-Origin"] = origin;
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (!allowedOrigin(origin))
    return reply({ error: "Вход с этого адреса не разрешён." }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  const secret = Deno.env.get("OWNER_ACCESS_KEY") ?? "";
  const configured = secret.length >= 24 && secret.length <= 256;
  if (req.method === "GET") return reply({ configured });
  if (req.method !== "POST")
    return reply({ error: "Метод не поддерживается." }, 405);
  if (!configured)
    return reply({ error: "Личный ключ ещё не настроен владельцем." }, 503);
  let body: { key?: unknown; website?: unknown };
  try {
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      throw Error();
    body = JSON.parse(await limitedText(new Response(req.body), 2048));
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof body.key !== "string" ||
      body.key.length > 256 ||
      body.key.length === 0 ||
      (body.website !== undefined && body.website !== "")
    )
      throw Error();
  } catch {
    return reply({ error: "Некорректный запрос входа." }, 400);
  }
  const url = Deno.env.get("SUPABASE_URL"),
    service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !service || !anon)
    return reply({ error: "Сервис входа временно недоступен." }, 503);
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  };
  const db = createClient(url, service, options);
  try {
    const network = await visitorHash(req, secret);
    const claim = await db.rpc("claim_owner_login_attempt", {
      p_network_hash: network,
    });
    if (claim.error) throw Error("rate_limit_unavailable");
    if (claim.data !== true)
      return new Response(
        JSON.stringify({
          error: "Слишком много попыток входа. Повторите через 15 минут.",
        }),
        { status: 429, headers: { ...headers, "Retry-After": "900" } },
      );
    if (!(await sameKey(body.key as string, secret)))
      return reply({ error: "Неверный ключ доступа." }, 401);
    const owner = await db.rpc("site_owner_id");
    if (owner.error || typeof owner.data !== "string")
      throw Error("owner_not_configured");
    const existing = await db.auth.admin.getUserById(owner.data);
    const user = existing.data?.user;
    if (
      existing.error ||
      !user?.email ||
      !user.email_confirmed_at ||
      user.id !== owner.data ||
      user.factors?.some((f) => f.status === "verified")
    )
      throw Error("owner_unavailable");
    const generated = await db.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
    });
    if (
      generated.error ||
      generated.data?.user?.id !== owner.data ||
      !generated.data.properties?.hashed_token
    )
      throw Error("session_link_failed");
    // generateLink does not send email. Verify server-side; never expose the link/hash/service key.
    const auth = createClient(url, anon, options);
    const verified = await auth.auth.verifyOtp({
      token_hash: generated.data.properties.hashed_token,
      type: "email",
    });
    if (
      verified.error ||
      verified.data.user?.id !== owner.data ||
      !verified.data.session
    )
      throw Error("session_verification_failed");
    return reply({
      session: {
        access_token: verified.data.session.access_token,
        refresh_token: verified.data.session.refresh_token,
      },
    });
  } catch {
    // Never log request bodies, keys, links, tokens or upstream error messages.
    console.error("owner_login:unavailable");
    return reply(
      { error: "Сервис входа временно недоступен. Попробуйте позже." },
      503,
    );
  }
}
