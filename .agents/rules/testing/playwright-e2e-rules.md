
# Playwright E2E

- Critical journeys first (auth, CRUD, nav). `getByRole` / `getByLabel` / `getByTestId` — not CSS/XPath.
- Auto-wait assertions; no `sleep`. Mock flaky externals. Success + error paths. Small specs per feature.

```ts
await page.getByTestId("login-submit").click();
await expect(page).toHaveURL(/dashboard/);
```
