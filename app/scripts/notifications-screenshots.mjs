/**
 * Preview + mocked API screenshots. Requires: npm run build && npm run preview -- --host 127.0.0.1 --port 4173
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";

const PREVIEW = "http://127.0.0.1:4173";
const OUT = "/workspace/.tmp/screenshots";

const sampleNotes = [
  {
    id: "n-demo-1",
    user_id: "u1",
    notification: "APPLICATION_UPDATE",
    type: "SUCCESS",
    timestamp: "2026-04-22T12:00:00Z",
    check: false,
    payload: { id: "app1", message: "Application preparation ready — review profile matches." },
    created_at: "2026-04-22T12:00:00Z",
    read_at: null,
    link: "/applications/app1"
  },
  {
    id: "n-demo-2",
    user_id: "u1",
    notification: "COMPANY_UPDATE",
    type: "WARN",
    timestamp: "2026-04-22T11:30:00Z",
    check: true,
    payload: { id: "c1", message: "Company research updated with new hiring signals." },
    created_at: "2026-04-22T11:30:00Z",
    read_at: null,
    link: "/companies/c1"
  }
];

async function mockApi(page) {
  /** Wall-clock since mock setup: first ~1s only seeds (handles parallel StrictMode GETs); later GETs include a new row for toast. */
  const mockStartedAt = Date.now();

  const handler = async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/auth/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "u1",
          name: "Demo User",
          email: "user@example.com",
          role: "user",
          admin: false,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z"
        })
      });
    }
    if (url.includes("/notifications/unread-count")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 2 })
      });
    }
    if (url.includes("/notifications?") && method === "GET") {
      const u = new URL(url);
      const limit = Number(u.searchParams.get("limit") || "10");
      const skip = Number(u.searchParams.get("skip") || "0");
      const unreadOnly = u.searchParams.get("unread_only") === "true";

      const isLayoutUnreadPoll = unreadOnly && limit === 25 && skip === 0;
      let rows = [...sampleNotes];
      if (isLayoutUnreadPoll) {
        const elapsed = Date.now() - mockStartedAt;
        if (elapsed < 1500) {
          rows = [sampleNotes[0]];
        } else {
          rows = [
            sampleNotes[0],
            {
              id: "n-new-toast",
              user_id: "u1",
              notification: "FOLLOW_UP_DRAFT",
              type: "WARN",
              timestamp: "2026-04-22T12:05:00Z",
              check: false,
              payload: { id: "a2", message: "Follow-up draft ready — review before sending." },
              created_at: "2026-04-22T12:05:00Z",
              read_at: null,
              link: "/applications/a2"
            }
          ];
        }
      }

      const slice = rows.slice(skip, skip + limit);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(slice)
      });
    }
    if (url.includes("/notifications") && method === "DELETE") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ deleted: 2 })
      });
    }
    if (url.includes("/notifications/") && url.endsWith("/read")) {
      return route.fulfill({ status: 204, body: "" });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  };

  await page.route("**/api/v1/**", handler);
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
await mockApi(page);

await page.addInitScript(() => {
  const orig = window.setInterval.bind(window);
  window.setInterval = function (handler, timeout, ...args) {
    const ms = typeof timeout === "number" ? timeout : 0;
    /** Faster than 45s for screenshots; keep slow enough that async poll() runs don't overlap. */
    if (ms === 45_000) return orig(handler, 800, ...args);
    return orig(handler, timeout, ...args);
  };
});

await page.goto(`${PREVIEW}/login`);
await page.evaluate(() => {
  window.localStorage.setItem("jobcrm-token", "mock-token-for-screenshot");
  window.sessionStorage.removeItem("jobcrm-notifications-initial-sync");
  window.sessionStorage.removeItem("jobcrm-notifications-seen-ids");
});

await page.goto(`${PREVIEW}/`, { waitUntil: "load" });
await page.getByRole("alert").waitFor({ state: "visible", timeout: 30_000 });
await page.screenshot({ path: `${OUT}/01-dashboard-with-toast.png`, fullPage: false });

await page.goto(`${PREVIEW}/notifications`, { waitUntil: "load" });
await page.waitForSelector("text=Notifications");
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/02-notifications-table-bulk.png`, fullPage: true });

await browser.close();
console.log("Wrote screenshots to", OUT);
