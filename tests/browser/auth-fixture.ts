import type { Page, Route } from "@playwright/test";
// Localhost browser fixtures only; this token has no real signature or production privileges.
export const ownerUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
export function ownerTokens() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  return {
    access_token:
      encode({ alg: "HS256", typ: "JWT" }) +
      "." +
      encode({
        sub: ownerUser.id,
        exp,
        role: "authenticated",
        aud: "authenticated",
      }) +
      ".TEST_ONLY_SIGNATURE",
    refresh_token: "TEST_ONLY_REFRESH",
    expires_at: exp,
    expires_in: 3600,
    token_type: "bearer",
    user: ownerUser,
  };
}
export async function installOwnerSession(page: Page) {
  await page.addInitScript(
    (session) =>
      sessionStorage.setItem("alfa-owner-auth-v1", JSON.stringify(session)),
    ownerTokens(),
  );
}
export async function ownerPermissionFixture(route: Route) {
  if (
    new URL(route.request().url()).pathname.endsWith("/has_smm_owner_access")
  ) {
    await route.fulfill({
      json: true,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
    return true;
  }
  return false;
}
