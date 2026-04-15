import { expect, test } from "@playwright/test";

test.describe("JobCRM smoke", () => {
  test("register and see dashboard metrics", async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Register" })).toBeVisible();
    await page.getByLabel("Name").fill("E2E User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("secret1234");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "JobCRM" })).toBeVisible();
    await expect(page.getByText("Pending preparation")).toBeVisible();
  });
});
