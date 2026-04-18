import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const iso = "2020-01-01T00:00:00.000Z";

const API_BASE = "http://127.0.0.1:8000";

async function obtainSessionToken(page: Page): Promise<void> {
  const email = `e2e-ind-${Date.now()}@example.com`;
  const password = "secret1234";
  const registerRes = await page.request.post(`${API_BASE}/api/v1/auth/register`, {
    data: JSON.stringify({ name: "E2E Industries Layout", email, password }),
    headers: { "Content-Type": "application/json" }
  });
  expect(registerRes.status(), await registerRes.text()).toBe(201);
  const loginRes = await page.request.post(`${API_BASE}/api/v1/auth/login`, {
    data: JSON.stringify({ email, password }),
    headers: { "Content-Type": "application/json" }
  });
  expect(loginRes.ok(), await loginRes.text()).toBeTruthy();
  const { access_token: accessToken } = (await loginRes.json()) as { access_token: string };
  await page.goto("/");
  await page.evaluate((token) => {
    window.localStorage.setItem("jobcrm-token", token);
  }, accessToken);
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

    await obtainSessionToken(page);

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
