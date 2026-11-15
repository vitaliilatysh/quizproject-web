import { expect } from "@playwright/test";
import { chooseFirstAnswer, draft, startAttempt } from "./attempt-helpers.js";
import { register, uniqueUsername } from "./helpers.js";
import { test } from "./timed-quiz.js";

test("returning to an expired attempt locks its saved answers without submitting", async ({
  page,
  timedQuiz
}, testInfo) => {
  test.setTimeout(110_000);
  const name = `Expired ${uniqueUsername(testInfo, "expired")}`;
  await timedQuiz(name, 1, "Чи збережено відповіді після повернення?");
  await register(page, uniqueUsername(testInfo, "expired"), "ExpiredPass1!");
  await page.getByPlaceholder("Пошук за назвою або предметом").fill(name);
  const attempt = await startAttempt(page, name);
  const answerId = await chooseFirstAnswer(page);
  const saved = JSON.stringify([Number(answerId)]);
  await expect.poll(() => draft(page, attempt.attemptId)).toBe(saved);
  let completions = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname === `/api/v1/attempts/${attempt.attemptId}/complete`)
      completions += 1;
  });

  // Leave the attempt so its auto-submit timer is cancelled. Let the real
  // server deadline pass; neither the response payload nor its clock is faked.
  await page.getByRole("link", { name: "← Каталог тестів" }).click();
  await expect(page).toHaveURL(/#\/quizzes$/);
  await expect
    .poll(() => Date.now(), { timeout: 75_000, intervals: [1_000] })
    .toBeGreaterThan(Date.parse(attempt.expiresAt) + 1_500);
  const loaded = page.waitForResponse(
    response => new URL(response.url()).pathname === `/api/v1/attempts/${attempt.attemptId}`
  );
  await page.goto(`/#/attempt/${attempt.attemptId}`);
  expect((await loaded).status()).toBe(200);
  await expect(page.getByText("Час вичерпано", { exact: true })).toBeVisible();
  await expect(page.locator(".timer-card strong")).toHaveText("00:00");
  const first = page.locator("label.answer-option").first().getByRole("checkbox");
  await expect(first).toBeChecked();
  for (const checkbox of await page.getByRole("checkbox").all()) await expect(checkbox).toBeDisabled();
  await expect(page.getByRole("button", { name: "Завершити тест" })).toBeDisabled();
  await expect(first).toBeChecked();
  expect(await draft(page, attempt.attemptId)).toBe(saved);
  await page.reload();
  await expect(page.getByText("Час вичерпано", { exact: true })).toBeVisible();
  await expect(first).toBeChecked();
  expect(completions).toBe(0);
});
