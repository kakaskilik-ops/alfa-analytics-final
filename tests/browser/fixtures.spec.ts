import { test, expect } from "@playwright/test";
import assert from "node:assert/strict";
// Synthetic fixtures used only by this test; no production database or paid API is contacted.
const now = Date.now();
const regions = ["Европа", "США", "Азия"];
const quotations = regions.map((region, i) => ({
  metal_id: "tungsten",
  source_id: "test-" + i,
  original_price: 10 + i * 2,
  original_currency: "USD",
  original_unit: "kg",
  normalized_price: 10 + i * 2,
  normalized_currency: "USD",
  normalized_unit: "kg",
  grade: "W",
  product_form: "Порошок",
  purity: 99.9,
  element_content: null,
  delivery_terms: "FCA test",
  composition: null,
  country: region === "Азия" ? "Китай" : null,
  region,
  market_type: "spot",
  price_type: "assessment",
  exchange_name: null,
  quality_score: 0.9,
  data_status: "live",
  validation_status: "valid",
  quoted_at: new Date(now - 60000).toISOString(),
  retrieved_at: new Date(now).toISOString(),
  source_url: "https://example.com/quote",
  attribution: "TEST",
  specification_id: null,
  data_sources: {
    name: "Тестовый источник " + region,
    independence_id: "test-" + i,
    url: "https://example.com",
  },
}));
const news = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    source_id: "test",
    canonical_url: "https://example.com/news",
    original_title: "Tungsten production expands in China",
    title_ru: "Рост производства вольфрама",
    summary_ru: "ТЕСТОВАЯ НОВОСТЬ: производство вольфрама.",
    excerpt: "TEST FIXTURE",
    translation_status: "ready",
    metal_ids: ["tungsten"],
    regions: ["Азия"],
    categories: ["production"],
    published_at: new Date(now - 2 * 86400000).toISOString(),
    retrieved_at: new Date(now).toISOString(),
    news_sources: { name: "Тестовый источник" },
  },
];

test("regional histories, FX, news and mobile rendering", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const u = new URL(route.request().url()),
      table = u.pathname.split("/").at(-1);
    let data = [];
    if (table === "price_quotations") data = quotations;
    if (table === "price_history") {
      const key = JSON.parse(u.searchParams.get("comparison_key").slice(3));
      const idx = regions.indexOf(key[3]);
      data = [10, 5, 1].map((d, i) => ({
        trade_date: new Date(now - d * 86400000).toISOString().slice(0, 10),
        open: 10 + idx * 2 + i,
        high: 10 + idx * 2 + i,
        low: 10 + idx * 2 + i,
        close: 10 + idx * 2 + i,
        currency: "USD",
        unit: "kg",
        data_status: "live",
      }));
    }
    if (table === "fx_observations") {
      const rates = { USD: 1, EUR: 0.9, RUB: 90, CNY: 7 };
      data = Array.from({ length: 7 }, (_, i) =>
        Object.entries(rates).flatMap(([a, x]) =>
          Object.entries(rates)
            .filter(([b]) => a !== b)
            .map(([b, y]) => ({
              base_currency: a,
              quote_currency: b,
              rate: y / x,
              rate_date: new Date(now - (i + 1) * 86400000).toISOString(),
              retrieved_at: new Date(now).toISOString(),
              data_status: "live",
              source_id: "frankfurter-v2",
            })),
        ),
      ).flat();
    }
    if (table === "reference_price_observations")
      data = ["aluminum", "copper", "tin", "zinc"].flatMap((m) =>
        [1, 2, 3].map((i) => ({
          metal_id: m,
          source_id: "world-bank-pink-sheet",
          period_start: new Date(
            Date.UTC(
              new Date(now).getUTCFullYear(),
              new Date(now).getUTCMonth() - i,
              1,
            ),
          )
            .toISOString()
            .slice(0, 10),
          price: 100 + i,
          currency: "USD",
          unit: "ton",
          region: "Мировой ориентир (LME)",
          specification: "TEST monthly reference",
          retrieved_at: new Date(now).toISOString(),
        })),
      );
    if (table === "app_exchange_rates")
      data = [
        {
          base_currency: "USD",
          quote_currency: "EUR",
          rate: 0.9,
          rate_date: new Date(now - 3600000).toISOString(),
          origin: "Тестовый курс EUR",
          data_status: "live",
        },
        {
          base_currency: "USD",
          quote_currency: "RUB",
          rate: 90,
          rate_date: new Date(now - 7200000).toISOString(),
          origin: "Тестовый курс RUB",
          data_status: "live",
        },
      ];
    if (table === "news_articles") data = news;
    await route.fulfill({
      json: data,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("http://127.0.0.1:5183");
  await page
    .getByText("Данные источников загружены", { exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "Курсы валют", exact: true })
    .waitFor();
  await expect(page.getByLabel("Результат конвертации")).toContainText(
    "9 000,00 RUB",
  );
  await page.getByLabel("Сумма для конвертации").fill("0");
  await expect(page.getByLabel("Результат конвертации")).toContainText(
    "0,00 RUB",
  );
  await page.getByLabel("Сумма для конвертации").fill("100");
  await page
    .getByRole("button", { name: "История EUR/USD", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "История EUR/USD", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "7 дней", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "7 дней", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("heading", { name: "Месячные ориентиры металлов", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Месячная история: Медь", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Месячный график copper, 3 наблюдений",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Металлы", exact: true }).click();
  await page
    .getByRole("button", { name: "Открыть карточку: Вольфрам", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Китай", { exact: false }).first().waitFor();
  assert.equal(await dialog.locator(".recharts-surface").count(), 4);
  await dialog
    .getByText("Рост производства вольфрама", { exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "США", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Валюта и единица" })
    .selectOption("USD/ton");
  await page.getByText("12 000,00 USD", { exact: false }).first().waitFor();
  await page
    .getByRole("combobox", { name: "Валюта и единица" })
    .selectOption("EUR/kg");
  await page.getByText("10,80 EUR", { exact: false }).first().waitFor();
  await page.getByText("Тестовый курс EUR", { exact: false }).first().waitFor();
  await page.getByRole("button", { name: "Новости", exact: true }).click();
  await page
    .getByRole("heading", { name: "Рост производства вольфрама", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Проанализировать новость", exact: true })
    .click();
  await page
    .getByText("Для ИИ-аналитики войдите в систему.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Аналитика", exact: true }).click();
  await page.getByRole("heading", { name: "Аналитика", exact: true }).waitFor();
  await page
    .getByRole("combobox", { name: "Материал для сравнения регионов" })
    .selectOption("tungsten");
  await page
    .getByText("Рост производства вольфрама", { exact: false })
    .first()
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of [
    "Главная",
    "Металлы",
    "Аналитика",
    "Новости",
    "Источники",
    "ИИ-аналитик",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(100);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      name,
    );
  }
  expect(errors).toEqual([]);
});
