import { expect, test } from "@playwright/test";

// The home page used to derive its two hero figures by downloading the whole
// catalogue. It now teases a few quizzes and reads the totals from a summary
// endpoint. Both halves of that are worth pinning: that it stops asking for
// everything, and that the numbers on screen still describe the catalogue
// rather than the teaser.
test("home fetches only a teaser and reads its totals from the summary", async ({ page }) => {
  const catalogueRequest = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/v1/quizzes");
  const summaryRequest = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/v1/quizzes/summary");

  await page.goto("/#/");
  await expect(page.getByRole("heading", { name: "Навчайся." })).toBeVisible();

  const catalogue = await catalogueRequest;
  const params = new URL(catalogue.url()).searchParams;
  expect(catalogue.status()).toBe(200);
  // Asking for a bounded page is the whole point: without this the home page
  // downloads every quiz on the platform.
  expect(params.get("size")).toBe("3");
  expect(params.get("page")).toBe("0");

  const summary = await summaryRequest;
  expect(summary.status()).toBe(200);
  const { totalQuizzes, totalSubjects } = await summary.json();
  expect(Number.isInteger(totalQuizzes)).toBe(true);
  expect(Number.isInteger(totalSubjects)).toBe(true);

  const stats = page.locator(".hero__stats");
  await expect(stats).toContainText(String(totalQuizzes));
  await expect(stats).toContainText(String(totalSubjects));

  // The teaser renders at most what it asked for.
  const teased = await page.locator(".quiz-card").count();
  expect(teased).toBeLessThanOrEqual(3);

  // The seeded catalogue has more quizzes than the teaser shows, so the hero
  // figure must exceed the number of cards. If it did not, the totals would be
  // silently reporting the teaser instead of the catalogue.
  expect(totalQuizzes).toBeGreaterThan(teased);
});

test("the home page still renders when the summary endpoint fails", async ({ page }) => {
  // Web and API deploy independently, so an API without this endpoint must not
  // take the landing page down with it.
  await page.route("**/api/v1/quizzes/summary", route => route.fulfill({ status: 500 }));

  await page.goto("/#/");
  await expect(page.getByRole("heading", { name: "Навчайся." })).toBeVisible();
  await expect(page.locator(".hero__stats")).toContainText("—");
  // The teaser is the substance and must survive the missing totals.
  await expect(page.locator(".quiz-card").first()).toBeVisible();
});
