import { handler, sameKey } from "./handler.ts";
import { handler as smoke } from "../verify-owner-login/handler.ts";
function assert(v: unknown): asserts v {
  if (!v) throw Error("assertion_failed");
}
const key = "LOCAL_TEST_ONLY_OWNER_KEY_12345";
const owner = "11111111-1111-4111-8111-111111111111";
const encode = (v: unknown) =>
  btoa(JSON.stringify(v))
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
const token =
  encode({ alg: "HS256", typ: "JWT" }) +
  "." +
  encode({
    sub: owner,
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "authenticated",
    aud: "authenticated",
  }) +
  ".TEST_SIGNATURE";
const user = {
  id: owner,
  email: "owner@example.test",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
async function setup(
  task: (
    calls: { path: string; body: string }[],
    set: (v: string) => void,
  ) => Promise<void>,
) {
  const values = {
    OWNER_ACCESS_KEY: key,
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "TEST_SERVICE",
    SUPABASE_ANON_KEY: "TEST_PUBLIC",
  };
  const before = Object.keys(values).map((k) => [k, Deno.env.get(k)] as const),
    original = globalThis.fetch;
  let mode = "ok";
  const calls: { path: string; body: string }[] = [];
  try {
    for (const [k, v] of Object.entries(values)) Deno.env.set(k, v);
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input)),
        body = String(init?.body ?? "");
      assert(url.origin === "https://test.supabase.co");
      calls.push({ path: url.pathname, body });
      assert(!body.includes(key));
      let data: unknown;
      if (url.pathname.endsWith("/verify_collector_token"))
        data = mode !== "bad-collector";
      else if (url.pathname.endsWith("/has_smm_owner_access"))
        data = mode !== "rls-denied";
      else if (url.pathname.endsWith("/private_smm_observations")) data = [];
      else if (url.pathname.endsWith("/user")) data = { user };
      else if (url.pathname.endsWith("/logout")) {
        assert(url.searchParams.get("scope") === "local");
        data = {};
      } else if (url.pathname.endsWith("/claim_owner_login_attempt"))
        data = mode !== "limited";
      else if (url.pathname.endsWith("/site_owner_id"))
        data = mode === "no-owner" ? null : owner;
      else if (url.pathname.includes("/admin/users/"))
        data = {
          user: {
            ...user,
            factors: mode === "mfa" ? [{ status: "verified" }] : [],
          },
        };
      else if (url.pathname.endsWith("/admin/generate_link"))
        data = {
          ...user,
          id:
            mode === "wrong-user"
              ? "22222222-2222-4222-8222-222222222222"
              : owner,
          action_link: "https://test.supabase.co/PRIVATE_TEST_LINK",
          hashed_token: "TEST_HASH",
          email_otp: "TEST_OTP",
          verification_type: "magiclink",
          redirect_to: "https://example.test",
        };
      else if (url.pathname.endsWith("/verify"))
        data = {
          access_token: token,
          refresh_token: "TEST_REFRESH",
          expires_in: 3600,
          token_type: "bearer",
          user,
        };
      else throw Error("unexpected_network");
      if (mode === "upstream-failure")
        return new Response(
          JSON.stringify({ message: "PRIVATE_UPSTREAM_DETAIL" }),
          { status: 500 },
        );
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    };
    await task(calls, (v) => {
      mode = v;
    });
  } finally {
    globalThis.fetch = original;
    for (const [k, v] of before) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}
const req = (body: unknown, origin = "https://alfammetal.ru") =>
  new Request("https://test.supabase.co/functions/v1/owner-key-login", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
Deno.test(
  "owner login rejects bad origins, body, honeypot and unset secret before network",
  () =>
    setup(async (calls) => {
      for (const r of [
        req({ key }, "https://evil.example"),
        req({ key, website: "spam" }),
        req({ key: "a".repeat(300) }),
        req(null),
      ]) {
        const s = await handler(r);
        assert(s.status === 400 || s.status === 403);
      }
      Deno.env.delete("OWNER_ACCESS_KEY");
      assert((await handler(req({ key }))).status === 503);
      const health = await handler(
        new Request("https://test.supabase.co/functions/v1/owner-key-login"),
      );
      assert((await health.json()).configured === false);
      assert(calls.length === 0);
    }),
);
Deno.test(
  "wrong key and atomic quota denial never issue Auth links or sessions",
  () =>
    setup(async (calls, set) => {
      assert(await sameKey(key, key));
      assert(!(await sameKey("wrong", key)));
      const bad = await handler(req({ key: "wrong" }));
      assert(bad.status === 401);
      assert(
        calls.length === 1 &&
          calls[0].path.endsWith("/claim_owner_login_attempt"),
      );
      set("limited");
      const limited = await handler(req({ key }));
      assert(
        limited.status === 429 && limited.headers.get("Retry-After") === "900",
      );
      assert(calls.every((c) => !c.path.includes("/auth/")));
    }),
);
Deno.test(
  "verified key creates only the allowlisted owner session without email, redirects, secret or link disclosure",
  () =>
    setup(async (calls) => {
      const response = await handler(
        req({ key, user_id: "forged", email: "attacker@example.test" }),
      );
      assert(response.status === 200);
      assert(response.headers.get("Cache-Control") === "no-store");
      assert(
        response.headers.get("Access-Control-Allow-Origin") ===
          "https://alfammetal.ru",
      );
      const raw = await response.text(),
        data = JSON.parse(raw);
      assert(
        data.session.access_token === token &&
          data.session.refresh_token === "TEST_REFRESH",
      );
      for (const forbidden of [
        key,
        "TEST_SERVICE",
        "TEST_HASH",
        "TEST_OTP",
        "PRIVATE_TEST_LINK",
        "owner@example.test",
      ])
        assert(!raw.includes(forbidden));
      assert(calls.length === 5);
      assert(calls.some((c) => c.path.endsWith("/admin/generate_link")));
      assert(!calls.some((c) => c.path.endsWith("/otp")));
      assert(
        calls
          .find((c) => c.path.endsWith("/verify"))
          ?.body.includes("TEST_HASH"),
      );
    }),
);
Deno.test(
  "missing/ambiguous owner, MFA, identity mismatch and upstream failures fail closed without raw errors",
  () =>
    setup(async (calls, set) => {
      for (const mode of [
        "no-owner",
        "mfa",
        "wrong-user",
        "upstream-failure",
      ]) {
        set(mode);
        calls.length = 0;
        const r = await handler(req({ key }));
        assert(r.status === 503);
        const raw = await r.text();
        assert(!raw.includes("PRIVATE_UPSTREAM_DETAIL") && !raw.includes(key));
        if (mode !== "upstream-failure")
          assert(!calls.some((c) => c.path.endsWith("/verify")));
      }
    }),
);
Deno.test(
  "privileged login smoke denies callers before touching the key or Auth",
  () =>
    setup(async (calls, set) => {
      set("bad-collector");
      const r = await smoke(
        new Request(
          "https://test.supabase.co/functions/v1/verify-owner-login",
          { method: "POST" },
        ),
      );
      assert(r.status === 401 && calls.length === 1);
      assert(!calls.some((c) => c.path.includes("/auth/")));
    }),
);
Deno.test(
  "privileged smoke returns only booleans and revokes only its test session (mock Auth)",
  () =>
    setup(async (calls) => {
      const r = await smoke(
        new Request(
          "https://test.supabase.co/functions/v1/verify-owner-login",
          {
            method: "POST",
            headers: { "x-collector-token": "TEST_COLLECTOR" },
          },
        ),
      );
      const raw = await r.text(),
        data = JSON.parse(raw);
      assert(
        r.status === 200 &&
          data.correctKeyLogin &&
          data.realAuthSession &&
          data.ownerRlsAccess &&
          data.testSessionRevoked,
      );
      for (const forbidden of [key, token, "TEST_REFRESH", owner, user.email])
        assert(!raw.includes(forbidden));
      assert(calls.some((c) => c.path.endsWith("/logout")));
    }),
);
Deno.test(
  "privileged smoke revokes its issued session even if the RLS check fails",
  () =>
    setup(async (calls, set) => {
      set("rls-denied");
      const r = await smoke(
        new Request(
          "https://test.supabase.co/functions/v1/verify-owner-login",
          {
            method: "POST",
            headers: { "x-collector-token": "TEST_COLLECTOR" },
          },
        ),
      );
      const data = await r.json();
      assert(
        r.status === 503 && !data.correctKeyLogin && data.testSessionRevoked,
      );
      assert(calls.some((c) => c.path.endsWith("/logout")));
    }),
);
