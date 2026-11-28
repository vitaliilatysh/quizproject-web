import { expect, type Page } from "@playwright/test";
import { BASELINE_QUIZ_NAME } from "./helpers.js";
import type { Attempt } from "../src/types.js";

export async function startAttempt(page: Page, quizName = BASELINE_QUIZ_NAME): Promise<Attempt> {
  const card = page.locator(".quiz-card").filter({ hasText: quizName });
  await expect(card).toBeVisible();
  const [response] = await Promise.all([
    page.waitForResponse(
      candidate =>
        /^\/api\/v1\/quizzes\/\d+\/attempts$/.test(new URL(candidate.url()).pathname) &&
        candidate.request().method() === "POST"
    ),
    card.getByRole("button", { name: "Розпочати тест" }).click()
  ]);
  expect(response.status()).toBe(201);
  const attempt = (await response.json()) as Attempt;
  await expect(page).toHaveURL(url => url.hash === `#/attempt/${attempt.attemptId}`);
  await expect(page.getByRole("heading", { name: `Тест #${attempt.quizId}` })).toBeVisible();
  return attempt;
}

export async function chooseFirstAnswer(page: Page): Promise<string> {
  const option = page.locator("label.answer-option").first();
  await option.click();
  const checkbox = option.getByRole("checkbox");
  await expect(checkbox).toBeChecked();
  return checkbox.inputValue();
}

export async function draft(page: Page, attemptId: number): Promise<string | null> {
  return page.evaluate(id => sessionStorage.getItem(`quizproject.answers.${id}`), attemptId);
}
