import { expect, test } from "@playwright/test";
import { chooseFirstAnswer, draft, startAttempt } from "./attempt-helpers.js";
import { register, submitAndExpectApiResponse, uniqueUsername } from "./helpers.js";

test("retrying a failed attempt load restores its draft without creating another attempt", async ({
  page
}, testInfo) => {
  let starts = 0;
  page.on("request", request => {
    if (
      /^\/api\/v1\/quizzes\/\d+\/attempts$/.test(new URL(request.url()).pathname) &&
      request.method() === "POST"
    )
      starts += 1;
  });
  await register(page, uniqueUsername(testInfo, "getretry"), "RecoveryPass1!");
  const attempt = await startAttempt(page);
  const answerId = await chooseFirstAnswer(page);
  const saved = JSON.stringify([Number(answerId)]);
  await expect.poll(() => draft(page, attempt.attemptId)).toBe(saved);

  const path = `/api/v1/attempts/${attempt.attemptId}`;
  let loads = 0;
  await page.route(`**${path}`, async route => {
    loads += 1;
    if (loads === 1) await route.abort("failed");
    else await route.continue();
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Спроба недоступна" })).toBeVisible();
  expect(loads).toBe(1);
  expect(await draft(page, attempt.attemptId)).toBe(saved);

  const response = page.waitForResponse(candidate => new URL(candidate.url()).pathname === path);
  await page.getByRole("button", { name: "Спробувати ще раз" }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole("heading", { name: `Тест #${attempt.quizId}` })).toBeVisible();
  await expect(page.locator("label.answer-option").first().getByRole("checkbox")).toBeChecked();
  await expect(page).toHaveURL(url => url.hash === `#/attempt/${attempt.attemptId}`);
  expect(await draft(page, attempt.attemptId)).toBe(saved);
  expect(loads).toBe(2);
  expect(starts).toBe(1);
});

test("a failed completion keeps the answers and can be submitted again", async ({ page }, testInfo) => {
  await register(page, uniqueUsername(testInfo, "postretry"), "RecoveryPass1!");
  const attempt = await startAttempt(page);
  const answerId = await chooseFirstAnswer(page);
  const saved = JSON.stringify([Number(answerId)]);
  await expect.poll(() => draft(page, attempt.attemptId)).toBe(saved);

  const path = `/api/v1/attempts/${attempt.attemptId}/complete`;
  const submissions: unknown[] = [];
  await page.route(`**${path}`, async route => {
    submissions.push(route.request().postDataJSON());
    if (submissions.length === 1) await route.abort("failed");
    else await route.continue();
  });
  page.on("dialog", dialog => dialog.accept());
  const submit = page.getByRole("button", { name: "Завершити тест" });
  await submit.click();
  await expect(page.locator(".toast--error")).toBeVisible();
  await expect(submit).toBeEnabled();
  await expect(page.locator("label.answer-option").first().getByRole("checkbox")).toBeChecked();
  expect(await draft(page, attempt.attemptId)).toBe(saved);

  await submitAndExpectApiResponse(page, submit, path, 200);
  await expect(page.getByRole("heading", { name: "Ваш результат" })).toBeVisible();
  expect(submissions).toEqual([{ answerIds: [Number(answerId)] }, { answerIds: [Number(answerId)] }]);
  await expect.poll(() => draft(page, attempt.attemptId)).toBeNull();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ваш результат" })).toBeVisible();
  expect(submissions).toHaveLength(2);
});

test("a double click submits once, freezes answers and accepts a response after the displayed deadline", async ({
  page
}, testInfo) => {
  await page.clock.install();
  await register(page, uniqueUsername(testInfo, "pending"), "PendingPass1!");
  const attempt = await startAttempt(page);
  const answerId = await chooseFirstAnswer(page);
  const path = `/api/v1/attempts/${attempt.attemptId}/complete`;
  const submissions: unknown[] = [];
  let serverStatus: number | undefined;
  let release!: () => void;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route(`**${path}`, async route => {
    submissions.push(route.request().postDataJSON());
    // The real API accepts the completion before expiry; only delivery to the
    // browser is held. Advancing the browser clock below does not age the API.
    const response = await route.fetch();
    serverStatus = response.status();
    await held;
    await route.fulfill({ response });
  });

  try {
    page.on("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Завершити тест" }).dblclick();
    await expect.poll(() => serverStatus).toBe(200);
    await expect(page.getByRole("button", { name: "Перевіряємо…" })).toBeDisabled();
    const answers = page.getByRole("checkbox");
    for (const answer of await answers.all()) await expect(answer).toBeDisabled();
    await expect(answers.nth(1)).not.toBeChecked();
    await expect(answers.first()).toBeChecked();

    await page.clock.setSystemTime(new Date(Date.parse(attempt.expiresAt) + 60_000));
    await page.clock.runFor(1_000);
    await expect(page.locator(".timer-card strong")).toHaveText("00:00");
    await expect(page.getByText("Час вичерпано", { exact: true })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Перевіряємо…" })).toBeDisabled();
    await expect(answers.first()).toBeChecked();
    expect(await draft(page, attempt.attemptId)).toBe(JSON.stringify([Number(answerId)]));
    expect(submissions).toEqual([{ answerIds: [Number(answerId)] }]);

    release();
    await expect(page.getByRole("heading", { name: "Ваш результат" })).toBeVisible();
    await expect.poll(() => draft(page, attempt.attemptId)).toBeNull();
    expect(submissions).toHaveLength(1);
  } finally {
    release();
  }
});
