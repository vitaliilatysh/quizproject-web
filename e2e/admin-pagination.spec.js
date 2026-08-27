import { expect, test } from "@playwright/test";
import { login } from "./helpers.js";

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

const PAGE_HEADERS = ["x-page-number", "x-page-size", "x-total-count", "x-total-pages"];

// Deliberately asserts the request/response contract rather than clicking to a
// second page. Reaching page two needs more than PAGE_SIZE rows, and seeding 21
// users per run would be slow and would leave permanent fixtures behind. What
// can break silently here is the contract itself: the client forgetting to send
// page/size, or the backend dropping the headers from Access-Control-Expose-
// Headers, which makes them invisible to the browser while curl still sees them.
test("admin collections are requested with paging and answer with page metadata", async ({ page }) => {
  test.skip(!ADMIN_USERNAME || !ADMIN_PASSWORD, "E2E administrator credentials are required");

  const usersResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/v1/admin/users");
  const resultsResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/v1/admin/results");

  await login(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  await page.getByRole("link", { name: "Адміністрування" }).click();
  await expect(page.getByRole("heading", { name: "Керуйте платформою" })).toBeVisible();

  for (const [name, pending] of [["users", usersResponse], ["results", resultsResponse]]) {
    const response = await pending;
    expect(response.status(), `${name} request failed`).toBe(200);

    const params = new URL(response.url()).searchParams;
    expect(params.get("page"), `${name} was requested without a page`).toBe("0");
    expect(params.get("size"), `${name} was requested without a size`).toBe("20");

    const headers = response.headers();
    for (const header of PAGE_HEADERS) {
      expect(headers[header], `${name} response is missing ${header}`).toBeDefined();
    }
    expect(Number(headers["x-total-count"])).toBeGreaterThanOrEqual(0);
  }

  // The counters read X-Total-Count, so they must survive a paged response
  // rather than collapsing to the number of rows on screen.
  const stats = page.locator(".admin-stats");
  await expect(stats).toContainText("Користувачі");
  await expect(stats).toContainText("Результати");
});

// The date filter used to run in the browser, so its query parameters were never
// actually sent. Now that filtering is server-side, the value a
// `datetime-local` input produces ("2026-01-01T00:00") has to be converted:
// the API binds from/to to Instant, which rejects a value with no offset. This
// test exists to catch a 400 that no mocked-fetch unit test can see.
test("the results date filter reaches the API in a format it accepts", async ({ page }) => {
  test.skip(!ADMIN_USERNAME || !ADMIN_PASSWORD, "E2E administrator credentials are required");

  await login(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  await page.getByRole("link", { name: "Адміністрування" }).click();
  await expect(page.getByRole("heading", { name: "Керуйте платформою" })).toBeVisible();

  const filtered = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/admin/results" && url.searchParams.has("from");
  });

  const results = page.locator("section.admin-card").filter({
    has: page.getByRole("heading", { name: "Усі результати" })
  });
  await results.getByLabel("Від").fill("2026-01-01T00:00");

  const response = await filtered;
  expect(response.status(), await response.text()).toBe(200);

  const from = new URL(response.url()).searchParams.get("from");
  // An offset-bearing instant, not the raw widget value.
  expect(from).toMatch(/Z$/);
  expect(Number.isNaN(Date.parse(from))).toBe(false);

  // Narrowing the range must return to the first page, otherwise a filter that
  // yields fewer pages lands on an empty one that reads as "no results".
  expect(new URL(response.url()).searchParams.get("page")).toBe("0");
});
