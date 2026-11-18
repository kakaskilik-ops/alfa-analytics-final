import { test, expect } from "@playwright/test";
import { ownerTokens, ownerUser } from "./auth-fixture";
test("site asks for key before loading data; wrong key fails, owner session unlocks, key is not stored, logout locks", async ({
  page,
}) => {
  const key = "LOCAL_TEST_ONLY_OWNER_KEY_12345";
  let logoutFails = false;
  let dataReads = 0,
    logged = false;
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
    };
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (path.endsWith("/owner-key-login")) {
      const body = req.postDataJSON();
      if (body.key !== key)
        return route.fulfill({
          status: 401,
          json: { error: "Неверный ключ доступа." },
          headers,
        });
      logged = true;
      return route.fulfill({ json: { session: ownerTokens() }, headers });
    }
    if (path.endsWith("/user"))
      return route.fulfill({ json: ownerUser, headers });
    if (path.endsWith("/logout") && logoutFails)
      return route.fulfill({
        status: 503,
        json: { error: "TEST_UNAVAILABLE" },
        headers,
      });
    if (path.endsWith("/has_smm_owner_access"))
      return route.fulfill({ json: logged, headers });
    if (path.includes("/rest/v1/")) dataReads++;
    return route.fulfill({ json: [], headers });
  });
  await page.goto("http://127.0.0.1:5183/#metals");
  await expect(page.getByLabel("Ключ доступа", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Открыть карточку:/ }),
  ).toHaveCount(0);
  expect(dataReads).toBe(0);
  await page.getByLabel("Ключ доступа", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Неверный ключ");
  expect(dataReads).toBe(0);
  await page.getByLabel("Ключ доступа", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Металлы", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Открыть карточку:/ }),
  ).toHaveCount(13);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain(key);
  logoutFails = true;
  await page
    .getByRole("button", { name: "Выйти из личного кабинета", exact: true })
    .click();
  await expect(page.getByLabel("Ключ доступа", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Открыть карточку:/ }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("alfa-owner-auth-v1")),
    )
    .toBeNull();
  await page.reload();
  await expect(page.getByLabel("Ключ доступа", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("rate limit and unavailable login keep the site locked", async ({
  page,
}) => {
  let unavailable = false;
  await page.route("http://127.0.0.1:54321/**", (route) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    return route.fulfill({
      status: unavailable ? 503 : 429,
      json: {
        error: unavailable
          ? "Сервис входа временно недоступен."
          : "Слишком много попыток входа. Повторите через 15 минут.",
      },
      headers,
    });
  });
  await page.goto("http://127.0.0.1:5183");
  for (const step of [false, true]) {
    unavailable = step;
    await page.getByLabel("Ключ доступа", { exact: true }).fill("TEST_ONLY");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      step ? "недоступен" : "15 минут",
    );
    await expect(
      page.getByRole("heading", { name: "Обзор рынка", exact: true }),
    ).toHaveCount(0);
  }
});
