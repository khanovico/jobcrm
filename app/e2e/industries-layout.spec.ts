import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const iso = "2020-01-01T00:00:00.000Z";

const API_BASE = "http://127.0.0.1:8000";
const E2E_EMAIL = "e2e-admin@example.com";
const E2E_PASSWORD = "secret1234";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "JobCRM" })).toBeVisible();
}

test.describe("Industries page layout", () => {
  test("table area scrolls while create panel stays within viewport height", async ({ page }) => {
    const manyIndustries = Array.from({ length: 100 }, (_, i) => ({
      id: `industry-${i}`,
      name: `Industry ${i + 1}`,
      description: "Description text",
      created_at: iso,
      updated_at: iso
    }));

    await page.route("**/api/v1/industries*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(manyIndustries)
      });
    });

    await login(page);

    await page.goto("/industries");
    await expect(page.getByTestId("industries-table-scroll")).toBeVisible();

    const scroll = page.getByTestId("industries-table-scroll");
    const panel = page.getByTestId("industries-create-panel");

    const tableScrollHeight = await scroll.evaluate((el) => el.scrollHeight);
    const tableClientHeight = await scroll.evaluate((el) => el.clientHeight);
    expect(tableScrollHeight).toBeGreaterThan(tableClientHeight);

    const panelScrollHeight = await panel.evaluate((el) => el.scrollHeight);
    const panelClientHeight = await panel.evaluate((el) => el.clientHeight);
    expect(panelScrollHeight).toBeLessThanOrEqual(panelClientHeight + 8);

    await page.screenshot({
      path: path.join(repoRoot, ".tmp/industries-layout.png"),
      fullPage: true
    });
  });
});
