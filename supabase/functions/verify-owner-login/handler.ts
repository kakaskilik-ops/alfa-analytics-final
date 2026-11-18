import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { serverClient } from "../_shared/jobs.ts";
import { handler as login } from "../owner-key-login/handler.ts";
/** Privileged smoke test: no credential, identity or protected rows leave the function. */
export async function handler(req: Request): Promise<Response> {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"),
    service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !service || !anon) return reply({ error: "not_configured" }, 503);
  const db = serverClient(url, service);
  const permission = await db.rpc("verify_collector_token", {
    p_token: req.headers.get("x-collector-token") ?? "",
  });
  if (permission.error || permission.data !== true)
    return reply({ error: "unauthorized" }, 401);
  let access: string | null = null,
    passed = false,
    revoked = false;
  let referenceRows = 0;
  try {
    const key = Deno.env.get("OWNER_ACCESS_KEY");
    if (!key) throw Error("not_configured");
    const response = await login(
      new Request(url + "/functions/v1/owner-key-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://alfammetal.ru",
        },
        body: JSON.stringify({ key }),
      }),
    );
    if (response.status !== 200) throw Error("login_failed");
    const data = await response.json();
    access = data.session?.access_token ?? null;
    if (!access || !data.session?.refresh_token) throw Error("session_missing");
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      },
    });
    const saved = await client.auth.setSession(data.session);
    if (saved.error) throw Error("session_invalid");
    const [user, owner, allowed, rows, references] = await Promise.all([
      client.auth.getUser(),
      db.rpc("site_owner_id"),
      client.rpc("has_smm_owner_access"),
      client.from("private_smm_observations").select("id").limit(1),
      client
        .from("private_market_references")
        .select(
          "metal_id,assessment_kind,original_currency,original_unit,private_reference_tax_views(assessed_on,tax_status)",
        )
        .limit(500),
    ]);
    passed =
      !user.error &&
      !owner.error &&
      typeof owner.data === "string" &&
      user.data.user?.id === owner.data &&
      !allowed.error &&
      allowed.data === true &&
      !rows.error &&
      !references.error;
    referenceRows = references.data?.length ?? 0;
  } catch {
    passed = false;
  } finally {
    if (access) {
      try {
        const r = await db.auth.admin.signOut(access, "local");
        revoked = !r.error;
      } catch {
        revoked = false;
      }
    }
  }
  return reply(
    {
      correctKeyLogin: passed,
      realAuthSession: passed,
      ownerRlsAccess: passed,
      testSessionRevoked: revoked,
      privateReferenceRows: referenceRows,
    },
    passed && revoked ? 200 : 503,
  );
}
