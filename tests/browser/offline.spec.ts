import { test, expect } from "@playwright/test";
import assert from "node:assert/strict";
test("offline catalogue, regional controls, news and mobile navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  const results: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5182");
  await page
    .getByRole("heading", { name: "Обзор рынка", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Металлы", exact: true }).click();
  await page.getByRole("heading", { name: "Металлы", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: /Открыть карточку:/ }).count(),
    13,
  );
  results.push("PASS exactly 13 catalogue cards");
  await page
    .getByPlaceholder("Поиск по названию, символу или марке")
    .fill("золото");
  assert.equal(
    await page.getByRole("button", { name: /Открыть карточку:/ }).count(),
    0,
  );
  await page
    .getByPlaceholder("Поиск по названию, символу или марке")
    .fill("вольфрам");
  await page
    .getByRole("button", { name: "Открыть карточку: Вольфрам", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("heading", { name: "Три мировых рынка" }).waitFor();
  await page.getByRole("heading", { name: "Последние новости" }).waitFor();
  assert.equal(
    await page.getByText("Нет подтверждённых данных", { exact: true }).count(),
    3,
  );
  await page.keyboard.press("Escape");
  results.push(
    "PASS restricted search, regional comparison and metal news block",
  );
  await page.getByRole("button", { name: "Азия", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Валюта и единица" })
    .selectOption("RUB/kg");
  await page
    .getByText("Подтверждённый валютный курс отсутствует.", { exact: false })
    .waitFor();
  results.push("PASS Asia selector and unavailable confirmed FX");
  await page.getByRole("button", { name: "Новости", exact: true }).click();
  await page
    .getByRole("heading", { name: "Новости рынка металлов", exact: true })
    .waitFor();
  await page
    .getByText("База новостей не подключена.", { exact: false })
    .waitFor();
  await page.getByRole("button", { name: "Сводка за день" }).click();
  await page
    .getByText("ИИ недоступен: база данных не подключена.", { exact: true })
    .waitFor();
  results.push("PASS news offline state, filters and digest unavailable state");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of [
    "Главная",
    "Металлы",
    "Аналитика",
    "Новости",
    "ИИ-аналитик",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(120);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `mobile overflow ${name}`,
    );
  }
  await page.getByRole("button", { name: "Новости", exact: true }).click();
  assert.deepEqual(errors, []);
  expect(errors).toEqual([]);
});
