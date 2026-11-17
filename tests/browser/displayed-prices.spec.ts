import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("all 13 cards show sourced numeric observations, with ferro floors kept distinct", async ({
  page,
}) => {
  const suppliers = JSON.parse(
    await readFile("work/prices/test-public.json", "utf8"),
  );
  const reference = JSON.parse(
    await readFile("tests/fixtures/prices/worldbank.json", "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const table = new URL(route.request().url()).pathname.split("/").pop();
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "*",
        },
      });
    return route.fulfill({
      json:
        table === "reference_price_observations"
          ? reference
          : table === "supplier_price_observations"
            ? suppliers
            : [],
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("http://127.0.0.1:5183/#metals");
  for (const id of [
    "copper",
    "aluminum",
    "tin",
    "zinc",
    "tungsten",
    "molybdenum",
    "chromium",
    "cobalt",
    "zirconium",
    "niobium",
    "tantalum",
    "ferromolybdenum",
    "ferrotungsten",
  ])
    await expect(
      page.getByLabel("Подтверждённая цена: " + id, { exact: true }),
    ).toBeVisible();
  const copper = page.getByLabel("Подтверждённая цена: copper", {
    exact: true,
  });
  await expect(copper).toContainText("14,508");
  await expect(copper).toContainText("14 508 USD/т");
  await expect(copper).toContainText("World Bank");
  await expect(copper).toContainText("2026-10");
  const femo = page.getByLabel("Подтверждённая цена: ferromolybdenum", {
    exact: true,
  });
  await expect(femo).toContainText("от 24");
  await expect(femo).toContainText("FeMo60");
  await expect(femo).toContainText("Давность цены неизвестна");
  await page.getByRole("button", { name: "Ферросплавы", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Открыть карточку:/ }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Все категории", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Открыть карточку: Медь", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByLabel("Подтверждённая цена: copper", { exact: true }),
  ).toContainText("14,508");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(copper).toContainText("USD/кг");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("http://127.0.0.1:5183/#market");
  await expect(
    page.getByRole("heading", {
      name: "Мировые ценовые ориентиры",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("14 508 USD/т", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
