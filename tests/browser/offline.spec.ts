import { test, expect } from "@playwright/test";
test("missing authentication configuration fails closed on desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5182/#metals");
  await expect(page.getByRole("alert")).toContainText("не настроено");
  await expect(page.getByLabel("Ключ доступа", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Открыть карточку:/ }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
