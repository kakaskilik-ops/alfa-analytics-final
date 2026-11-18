import { test, expect } from "@playwright/test";
test("SMM private owner UI imports only after rights confirmation, groups tax views and clears on logout", async ({
  page,
}) => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const user = {
    id: owner,
    email: "owner@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  await page.addInitScript(
    ({ owner, user }) => {
      const token = {
        access_token: "local-browser-fixture",
        refresh_token: "local-fixture",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user,
      };
      sessionStorage.setItem("alfa-owner-auth-v1", JSON.stringify(token));
      void owner;
    },
    { owner, user },
  );
  const base = {
    series_id: "smm:test-only",
    metal_id: "copper",
    specification: "1# copper cathode",
    purity: "99.99%",
    delivery_form: "cathode",
    region: "China",
    price_type: "physical_spot",
    assessed_at: "2026-11-17",
    date_precision: "day",
    currency: "USD",
    unit: "ton",
    tax_status: "excluded",
    vat_rate: null,
    minimum: 14304.76,
    maximum: 14432.46,
    mean: 14368.61,
    source_url: "https://www-old.metal.com/Copper/201102250376",
  };
  let imported: unknown[] = [];
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
    };
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith("/has_smm_owner_access"))
      return route.fulfill({ json: true, headers });
    if (url.pathname.endsWith("/private_smm_observations")) {
      if (req.method() === "POST") {
        imported = req.postDataJSON();
        return route.fulfill({ json: [], headers });
      }
      return route.fulfill({ json: imported, headers });
    }
    if (url.pathname.endsWith("/user"))
      return route.fulfill({ json: user, headers });
    if (url.pathname.endsWith("/logout"))
      return route.fulfill({ json: {}, headers });
    return route.fulfill({ json: [], headers });
  });
  await page.goto("http://127.0.0.1:5183/#smm");
  const section = page.getByRole("region", {
    name: "SMM Market Data — приватно",
  });
  const file = section.getByLabel("Импорт SMM JSON");
  await expect(file).toBeDisabled();
  await section.getByRole("checkbox").check();
  await file.setInputFiles({
    name: "legal-user-fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([
        base,
        {
          ...base,
          tax_status: "included",
          minimum: null,
          maximum: null,
          mean: 16236.53,
        },
      ]),
    ),
  });
  await expect(section.getByRole("article")).toHaveCount(1);
  await expect(section).toContainText("14 304,76");
  await expect(section).toContainText("16 236,53");
  await expect(section).toContainText("НДС исключён");
  await expect(section).toContainText("НДС включён");
  expect(imported).toHaveLength(2);
  expect((imported[0] as { owner_id: string }).owner_id).toBe(owner);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("http://127.0.0.1:5183/#market");
  await expect(
    page.getByRole("region", { name: "SMM Market Data — приватно" }),
  ).toContainText("16 236,53");
  await page
    .getByRole("region", { name: "SMM Market Data — приватно" })
    .getByRole("button", { name: "Выйти", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "SMM Market Data — приватно" }),
  ).toHaveCount(0);
});
test("anonymous SMM route exposes login only and never requests private prices", async ({
  page,
}) => {
  const privateRequests: string[] = [];
  await page.route("http://127.0.0.1:54321/**", (route) => {
    if (route.request().url().includes("private_smm_observations"))
      privateRequests.push(route.request().url());
    return route.fulfill({
      json: [],
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("http://127.0.0.1:5183/#smm");
  await expect(page.getByLabel("Ключ доступа", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Импорт SMM JSON")).toHaveCount(0);
  expect(privateRequests).toEqual([]);
});
