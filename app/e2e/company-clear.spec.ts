import { expect, test } from "@playwright/test";

const API_ORIGIN = "http://127.0.0.1:8000";

/** Stable user so re-runs can log in after the first successful registration. */
const E2E_EMAIL = "e2e.company.clear@example.com";
const E2E_PASSWORD = "secret1234";

test.describe("Company clear (enrichment wipe, keeps name + website)", () => {
  test("clears research fields except name and website via UI and API", async ({ page, request }) => {
    test.setTimeout(120_000);

    let loginRes = await request.post(`${API_ORIGIN}/api/v1/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: { email: E2E_EMAIL, password: E2E_PASSWORD }
    });
    if (!loginRes.ok()) {
      const reg = await request.post(`${API_ORIGIN}/api/v1/auth/register`, {
        headers: { "Content-Type": "application/json" },
        data: { name: "E2E Company Clear", email: E2E_EMAIL, password: E2E_PASSWORD }
      });
      if (!reg.ok()) {
        test.skip(
          true,
          `Need auth: login failed and register returned ${reg.status()} (${await reg.text()}). ` +
            `Use a fresh API (CI or CI=1 locally) or ensure this user can register.`
        );
        return;
      }
      loginRes = await request.post(`${API_ORIGIN}/api/v1/auth/login`, {
        headers: { "Content-Type": "application/json" },
        data: { email: E2E_EMAIL, password: E2E_PASSWORD }
      });
    }
    if (!loginRes.ok()) {
      throw new Error(`Login failed: ${loginRes.status()} ${await loginRes.text()}`);
    }
    const { access_token: token } = (await loginRes.json()) as { access_token: string };
    const auth = { Authorization: `Bearer ${token}` };

    const indRes = await request.post(`${API_ORIGIN}/api/v1/industries`, {
      headers: { ...auth, "Content-Type": "application/json" },
      data: { name: `E2E Ind ${Date.now()}`, description: "e2e" }
    });
    expect(indRes.ok()).toBeTruthy();
    const industry = (await indRes.json()) as { id: string };

    const companyRes = await request.post(`${API_ORIGIN}/api/v1/companies`, {
      headers: { ...auth, "Content-Type": "application/json" },
      data: {
        name: "E2E Clear Target",
        research_status: "indexed",
        website: "https://company.example",
        linkedin: "https://linkedin.example/in",
        industry_ids: [industry.id],
        hq_locations: ["Austin", "Berlin"],
        employee_count_text: "100-200",
        actively_hiring: true,
        work_mode: "hybrid",
        work_mode_description: "3 days in office",
        overview: "Overview body for e2e",
        full_overview: "https://drive.example.com/folder",
        analysis_links: [{ topic: "Culture", link: "https://analysis.example" }],
        enrichment_source_links: ["https://source.example"]
      }
    });
    expect(companyRes.ok()).toBeTruthy();
    const company = (await companyRes.json()) as { id: string };

    const before = await request.get(`${API_ORIGIN}/api/v1/companies/${company.id}`, {
      headers: auth
    });
    const beforeJson = (await before.json()) as { overview: string };
    expect(beforeJson.overview).toContain("Overview");

    await page.goto("/login");
    await page.evaluate((t) => localStorage.setItem("jobcrm-token", t), token);
    await page.goto(`/companies/${company.id}`);
    await expect(page.getByRole("heading", { name: "E2E Clear Target" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByRole("heading", { name: "Clear company research" })).toBeVisible();
    await expect(page.getByText(/Loading related applications/i)).toBeHidden({ timeout: 30_000 });

    await page.getByRole("button", { name: "Clear company" }).click();

    await expect(page.getByLabel("Website")).toHaveValue("https://company.example", { timeout: 15_000 });
    await expect(page.getByLabel("LinkedIn")).toHaveValue("");
    await expect(page.getByLabel("Employee count (text)")).toHaveValue("");
    await expect(page.getByLabel("Overview")).toHaveValue("");
    await expect(page.getByLabel("Full company detail link")).toHaveValue("");
    await expect(page.getByLabel("HQ locations (comma-separated)")).toHaveValue("");
    await expect(page.getByLabel("Work mode description")).toHaveValue("");

    // DaisyUI uses <label><span class="label-text">…</span><select/></label>; getByLabel does not resolve this select reliably.
    const workModeSelect = page
      .locator("label.form-control")
      .filter({ has: page.locator("span.label-text", { hasText: /^Work mode$/ }) })
      .locator("select");
    await expect(workModeSelect).toHaveValue("");

    await expect(page.getByLabel("Actively hiring")).toHaveValue("");

    const after = await request.get(`${API_ORIGIN}/api/v1/companies/${company.id}`, {
      headers: auth
    });
    expect(after.ok()).toBeTruthy();
    const c = (await after.json()) as Record<string, unknown>;
    expect(c.name).toBe("E2E Clear Target");
    expect(c.research_status).toBe("pending");
    expect(c.website).toBe("https://company.example");
    expect(c.linkedin).toBeNull();
    expect(c.employee_count_text).toBeNull();
    expect(c.actively_hiring).toBeNull();
    expect(c.work_mode).toBeNull();
    expect(c.work_mode_description).toBeNull();
    expect(c.overview).toBeNull();
    expect(c.full_overview).toBeNull();
    expect(c.industry_ids).toEqual([]);
    expect(c.hq_locations).toEqual([]);
    expect(c.analysis_links).toEqual([]);
    expect(c.enrichment_source_links).toEqual([]);
  });
});
