import { test, expect } from "@playwright/test";
import { installOwnerSession, ownerPermissionFixture } from "./auth-fixture";
import { readFile } from "node:fs/promises";
import { METAL_IDS } from "../../supabase/functions/_shared/universe";
// Synthetic private fixture ONLY. Owner's actual historical prices are not committed or seeded by tests.
const snapshots = METAL_IDS.map((id, i) => ({
  metal_id: id,
  assessment_kind: id === "ferromolybdenum" ? "single_trade" : "unknown",
  vat_rate: null,
  tax_status_verified: false,
  original_currency: "USD",
  original_unit: "kg",
  publisher_currency: "CNY",
  publisher_unit: "ton",
  series_context:
    "TEST_ONLY publisher metadata; original snapshot date unknown",
  private_reference_tax_views:
    id === "tungsten"
      ? [
          {
            tax_status: "included",
            assessed_on: "2026-01-01",
            vat_rate: 0.13,
            minimum_usd_kg: 113,
            maximum_usd_kg: 135.6,
            point_usd_kg: null,
            evidence_url: "https://example.test/published",
            source_published_on: "2026-01-01",
            usage_permission_confirmed: true,
          },
        ]
      : [],
  minimum_usd_kg: id === "tungsten" ? 100 : null,
  maximum_usd_kg: id === "tungsten" ? 120 : null,
  point_usd_kg: id === "tungsten" ? null : i + 10,
  mass_basis:
    id === "ferromolybdenum"
      ? "contained_mo"
      : id === "ferrotungsten"
        ? "alloy"
        : "metal",
  specification: "TEST_ONLY " + id,
  market_region: id === "ferromolybdenum" ? "Europe" : "Asia",
  region_verified: id === "ferromolybdenum",
  basis_description: "TEST_ONLY market basis",
  observed_on: id === "tungsten" ? "2026-01-01" : null,
  source_published_on: null,
  claimed_publisher: "TEST_ONLY",
  evidence_url: null,
  tax_status: "unknown",
  verification_status: "unverified",
  verification_note: "Synthetic fixture, not real market data",
  recorded_at: "2026-11-18T00:00:00Z",
}));
test("13 owner historical references match lower quotations and catalogue; buyer prices absent; regional and unit isolation", async ({
  page,
}) => {
  await installOwnerSession(page);
  const suppliers = [
    {
      metal_id: "tungsten",
      source_id: "rare-metals-bid",
      original_price: 1,
      original_currency: "USD",
      original_unit: "kg",
      price_kind: "supplier_bid",
      observed_on: "2026-01-01",
      retrieved_at: "2026-01-01T12:00:00Z",
      specification: "TEST_ONLY",
      source_url: "https://metal-supply.biz/product/1",
      region: "США",
      country: "USA",
    },
  ];
  const wb = JSON.parse(
    await readFile("tests/fixtures/prices/worldbank.json", "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (await ownerPermissionFixture(route)) return;
    const table = new URL(route.request().url()).pathname.split("/").pop();
    return route.fulfill({
      json:
        table === "private_market_references"
          ? snapshots
          : table === "supplier_price_observations"
            ? suppliers
            : table === "reference_price_observations"
              ? wb
              : [],
      headers,
    });
  });
  await page.goto("http://127.0.0.1:5183/#metals");
  const texts = new Map<string, string>();
  for (const id of METAL_IDS) {
    const p = page.getByLabel("Ценовой ориентир: " + id, { exact: true });
    await expect(p).toBeVisible();
    texts.set(id, (await p.textContent())!);
  }
  await expect(page.locator("main")).not.toContainText("Rare Metals");
  await expect(page.locator("main")).not.toContainText("Metotechnics");
  await expect(
    page.getByLabel("Ценовой ориентир: tungsten", { exact: true }),
  ).toContainText("100–120");
  await expect(
    page.getByLabel("Ценовой ориентир: ferromolybdenum", { exact: true }),
  ).toContainText("USD/кг содержащегося Mo");
  await expect(
    page.getByLabel("Ценовой ориентир: ferrotungsten", { exact: true }),
  ).toContainText("USD/кг сплава");
  await page
    .getByRole("button", { name: "Открыть карточку: Вольфрам", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByLabel("Ценовой ориентир: tungsten", { exact: true }),
  ).toContainText("100–120");
  await page.keyboard.press("Escape");
  await page.goto("http://127.0.0.1:5183/#market");
  await expect(
    page.getByRole("heading", { name: "Цены на металлы", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Цены на металлы", exact: true }),
  ).toHaveCount(0);
  for (const id of METAL_IDS)
    await expect(
      page.getByLabel("Ценовой ориентир: " + id, { exact: true }),
    ).toHaveText(texts.get(id)!);
  const currency = await page
    .getByRole("heading", { name: "Курсы валют", exact: true })
    .boundingBox();
  const quotes = await page
    .getByRole("heading", { name: "Котировки металлов", exact: true })
    .boundingBox();
  expect(currency!.y).toBeLessThan(quotes!.y);
  await page
    .getByLabel("Единица ориентира", { exact: true })
    .selectOption("ton");
  await expect(
    page.getByLabel("Ценовой ориентир: tungsten", { exact: true }),
  ).toContainText("100 000–120 000");
  await expect(
    page.getByLabel("Ценовой ориентир: ferromolybdenum", { exact: true }),
  ).toContainText("USD/т содержащегося Mo");
  await page
    .getByLabel("Регион ориентиров", { exact: true })
    .selectOption("Europe");
  await expect(
    page.getByLabel("Ценовой ориентир: ferromolybdenum", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Ценовой ориентир: tungsten", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Регион ориентиров", { exact: true })
    .selectOption("USA");
  await expect(page.getByLabel(/^Ценовой ориентир:/)).toHaveCount(0);
  await page
    .getByLabel("Регион ориентиров", { exact: true })
    .selectOption("global");
  await expect(
    page.getByLabel("Ценовой ориентир: copper", { exact: true }),
  ).toContainText("World Bank");
  await expect(
    page.getByLabel("Ценовой ориентир: copper", { exact: true }),
  ).toContainText("14 508");
  await page.getByRole("button", { name: "Медь", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByLabel("Ценовой ориентир: copper", { exact: true }),
  ).toContainText("14 508");
  await page.keyboard.press("Escape");
  await page
    .getByLabel("Регион ориентиров", { exact: true })
    .selectOption("all");
  await page
    .getByLabel("Налоговое представление: tungsten", { exact: true })
    .selectOption("included");
  await expect(
    page.getByLabel("Ценовой ориентир: tungsten", { exact: true }),
  ).toContainText("113 000–135 600");
  await expect(
    page.getByLabel("Ценовой ориентир: tungsten", { exact: true }),
  ).toContainText("Ставка НДС: 13%");
  await page
    .getByLabel("Налоговое представление: tungsten", { exact: true })
    .selectOption("primary");
  await expect(
    page.getByRole("button", { name: "CSV", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("http://127.0.0.1:5183/#metals");
  await page
    .getByLabel("Единица ориентира", { exact: true })
    .selectOption("ton");
  await expect(
    page.getByLabel("Ценовой ориентир: tungsten", { exact: true }),
  ).toContainText("100 000–120 000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
