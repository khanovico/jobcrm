import { expect, test } from "@playwright/test";

const E2E_EMAIL = "e2e-admin@example.com";
const E2E_PASSWORD = "secret1234";

test.describe("JobCRM smoke", () => {
  test("login and see dashboard metrics", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "JobCRM" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Company research pipeline" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Application ready" })).toBeVisible();
  });
});
