import { expect, test } from "@playwright/test";
import { register, uniqueUsername } from "./helpers.js";

// The attempt page's checkboxes are controlled by a Set held in App state. That
// Set used to be rebuilt inline on every render whenever the state had no entry
// yet, so any App-wide re-render handed the page a new identity. The App
// re-renders whenever the silent token refresh calls setSession — every few
// seconds at the short JWT_TTL this workflow configures — and a click landing in
// that window could be reverted before React committed it.
//
// This asserts the selection survives a refresh actually happening, rather than
// hoping the race does not occur.
test("a chosen answer survives a silent token refresh", async ({ page }, testInfo) => {
  const username = uniqueUsername(testInfo, "sel");
  await register(page, username, "SelectPass123!");

  const testCard = page.locator(".quiz-card").filter({ hasText: "Test1" });
  await expect(testCard).toBeVisible();
  await testCard.getByRole("button", { name: "Розпочати тест" }).click();
  await expect(page.getByRole("heading", { name: "Тест #1" })).toBeVisible();

  const firstAnswer = page.locator("label.answer-option").first().getByRole("checkbox");
  await firstAnswer.check();
  await expect(firstAnswer).toBeChecked();

  // Wait for a refresh to land, which is what re-renders the whole App.
  const refreshed = await page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/v1/auth/refresh", { timeout: 30_000 });
  expect(refreshed.status()).toBe(200);

  await expect(firstAnswer).toBeChecked();

  // Persistence now mirrors committed state from an effect instead of running
  // inside the state updater, so the choice must also have reached storage.
  const stored = await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(name => name.startsWith("quizproject.answers."));
    return key ? JSON.parse(sessionStorage.getItem(key)) : null;
  });
  expect(Array.isArray(stored)).toBe(true);
  expect(stored.length).toBe(1);
});

test("a selection survives a reload of the attempt page", async ({ page }, testInfo) => {
  const username = uniqueUsername(testInfo, "reload");
  await register(page, username, "ReloadPass123!");

  const testCard = page.locator(".quiz-card").filter({ hasText: "Test1" });
  await testCard.getByRole("button", { name: "Розпочати тест" }).click();
  await expect(page.getByRole("heading", { name: "Тест #1" })).toBeVisible();

  const firstAnswer = page.locator("label.answer-option").first().getByRole("checkbox");
  await firstAnswer.check();
  await expect(firstAnswer).toBeChecked();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Тест #1" })).toBeVisible();
  // Seeded back from storage, which only works if the effect wrote it.
  await expect(page.locator("label.answer-option").first().getByRole("checkbox")).toBeChecked();
});
