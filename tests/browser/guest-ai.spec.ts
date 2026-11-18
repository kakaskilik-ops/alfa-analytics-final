import { installOwnerSession, ownerPermissionFixture } from "./auth-fixture";
import { test, expect } from "@playwright/test";
import {
  issueGuestChallenge,
  verifyGuestChallenge,
} from "../../supabase/functions/_shared/guestAccess";
// Only test fixtures. No production DB or Groq requests.
test("AI guest proof and Russian quota handling remain intact behind the owner site gate", async ({
  page,
}) => {
  await installOwnerSession(page);
  let calls = 0;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const r = route.request(),
      url = new URL(r.url()),
      table = url.pathname.split("/").at(-1),
      cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
      };
    if (
      route.request().method() !== "OPTIONS" &&
      (await ownerPermissionFixture(route))
    )
      return;
    if (r.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    if (table === "ai-status")
      return route.fulfill({
        json: {
          configured: true,
          verifiedAt: null,
          primary: { provider: "groq", model: "openai/gpt-oss-120b" },
          message: "TEST",
        },
        headers: cors,
      });
    if (table === "ai-challenge") {
      const challenge = await issueGuestChallenge(
        new Request(r.url()),
        "TEST_ONLY",
        r.postData(),
      );
      return route.fulfill({ json: challenge, headers: cors });
    }
    if (table === "ai-analyze") {
      expect(r.headers().authorization).toBeUndefined();
      const proof = await verifyGuestChallenge(
        new Request(r.url(), { headers: r.headers() }),
        "TEST_ONLY",
        r.postData(),
      );
      expect(proof).not.toBeNull();
      calls++;
      if (calls === 2) {
        const body = JSON.parse(r.postData());
        expect(body.period).toBe("custom");
        expect(body.startDate).toBe("2025-11-01");
        expect(body.endDate).toBe("2026-10-31");
      }
      return calls === 1
        ? route.fulfill({
            json: {
              text: "ТЕСТОВЫЙ ответ по подтверждённым данным.",
              cached: false,
            },
            headers: cors,
          })
        : route.fulfill({
            status: 429,
            json: {
              error:
                "Лимит бесплатного чата: до пяти запросов в сутки с одной сети и пауза не менее тридцати секунд.",
            },
            headers: cors,
          });
    }
    return route.fulfill({ json: [], headers: cors });
  });
  await page.goto("http://127.0.0.1:5183/#ai");
  await expect(
    page.getByLabel("Электронная почта", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Вход и регистрация не нужны/)).toBeVisible();
  await page.getByLabel("Вопрос ИИ-аналитику").fill("Проанализируй медь");
  await page
    .getByRole("button", { name: "Отправить вопрос", exact: true })
    .click();
  await expect(
    page.getByText("ТЕСТОВЫЙ ответ по подтверждённым данным.", { exact: true }),
  ).toBeVisible({ timeout: 35000 });
  await page.getByLabel("Период ИИ-анализа").selectOption("custom");
  await page.getByLabel("Начало периода анализа").fill("2025-11-01");
  await page.getByLabel("Конец периода анализа").fill("2026-10-31");
  await page.getByLabel("Вопрос ИИ-аналитику").fill("Проанализируй олово");
  await page
    .getByRole("button", { name: "Отправить вопрос", exact: true })
    .click();
  await expect(
    page.getByText(/Лимит бесплатного чата: до пяти запросов/),
  ).toBeVisible({ timeout: 35000 });
  expect(calls).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
