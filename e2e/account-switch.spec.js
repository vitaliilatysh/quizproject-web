import { expect, test } from "@playwright/test";
import { login, register, uniqueUsername } from "./helpers.js";

// Attempts, results and saved answers used to be cached under no particular
// owner. Signing out cleared some of them and signing straight in as somebody
// else cleared almost none, while the route effect skips its request whenever
// the attempt is already in state — so the next reader in the tab was shown the
// previous one's attempt without a single call to the API, which would have
// refused it.
//
// Both tests move between accounts without reloading the page, because a reload
// is precisely what used to hide the bug: it throws away the React state that
// holds the leak. Changing the hash is what the back button does too.
test("an attempt is not shown to the next reader in the same tab", async ({ page }, testInfo) => {
  const first = uniqueUsername(testInfo, "swa");
  const second = uniqueUsername(testInfo, "swb");

  await register(page, first, "SwitchPassA1!");
  const card = page.locator(".quiz-card").filter({ hasText: "Test1" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Розпочати тест" }).click();
  await expect(page.getByRole("heading", { name: "Тест #1" })).toBeVisible();

  const attemptUrl = new URL(page.url()).hash;
  expect(attemptUrl).toMatch(/^#\/attempt\/\d+$/);
  await page.locator("label.answer-option").first().click();
  await expect(page.locator("label.answer-option").first().getByRole("checkbox")).toBeChecked();

  await page.getByRole("button", { name: "Вийти" }).click();
  await expect(page.getByRole("link", { name: "Увійти" })).toBeVisible();

  await register(page, second, "SwitchPassB1!");

  // The attempt belongs to the first account, so the API answers 404 and the
  // page has to say so. Before the fix nothing was requested at all and the
  // questions were rendered straight out of the previous reader's state.
  await page.evaluate(hash => { globalThis.location.hash = hash; }, attemptUrl);
  await expect(page.getByRole("heading", { name: "Спроба недоступна" })).toBeVisible();
  await expect(page.locator(".question-card")).toHaveCount(0);

  const savedAnswers = await page.evaluate(() =>
    Object.keys(sessionStorage).filter(key => key.startsWith("quizproject.answers.")));
  expect(savedAnswers).toEqual([]);
});

test("signing in over an open session does not inherit its data", async ({ page }, testInfo) => {
  const first = uniqueUsername(testInfo, "ova");
  const second = uniqueUsername(testInfo, "ovb");

  await register(page, first, "OverPassA1!");
  const card = page.locator(".quiz-card").filter({ hasText: "Test1" });
  await card.getByRole("button", { name: "Розпочати тест" }).click();
  await expect(page.getByRole("heading", { name: "Тест #1" })).toBeVisible();
  const attemptUrl = new URL(page.url()).hash;

  // #/login renders its form to a signed-in reader as well, so an account can
  // be replaced without ever passing through signed-out. That path used to
  // clear the profile and nothing else.
  await register(page, second, "OverPassB1!");
  await expect(page.locator(".account-name")).toHaveText(second);

  await page.evaluate(hash => { globalThis.location.hash = hash; }, attemptUrl);
  await expect(page.getByRole("heading", { name: "Спроба недоступна" })).toBeVisible();
  await expect(page.locator(".question-card")).toHaveCount(0);
});

// The counterpart to the two above, and the reason signing out is not treated
// as a handover. An expiring session is the likeliest way to be interrupted in
// the middle of a quiz, and it remembers the attempt URL so the reader comes
// straight back to it. Clearing on the way out would hand them their own
// unfinished quiz with every answer gone.
test("a paused quiz keeps its answers when the same reader signs back in", async ({ page }, testInfo) => {
  const reader = uniqueUsername(testInfo, "same");
  const password = "SamePass123!";

  await register(page, reader, password);
  const card = page.locator(".quiz-card").filter({ hasText: "Test1" });
  await card.getByRole("button", { name: "Розпочати тест" }).click();
  await expect(page.getByRole("heading", { name: "Тест #1" })).toBeVisible();
  const attemptUrl = new URL(page.url()).hash;

  await page.locator("label.answer-option").first().click();
  await expect(page.locator("label.answer-option").first().getByRole("checkbox")).toBeChecked();

  await page.getByRole("button", { name: "Вийти" }).click();
  await expect(page.getByRole("link", { name: "Увійти" })).toBeVisible();
  await login(page, reader, password);

  await page.evaluate(hash => { globalThis.location.hash = hash; }, attemptUrl);
  await expect(page.getByRole("heading", { name: "Тест #1" })).toBeVisible();
  await expect(page.locator("label.answer-option").first().getByRole("checkbox")).toBeChecked();
});
