import { expect, test } from "@playwright/test";
import { login, register, uniqueUsername } from "./helpers.js";
import { chooseFirstAnswer, draft, startAttempt } from "./attempt-helpers.js";

test("session survives past the original token lifetime via a silent refresh", async ({ page }, testInfo) => {
  const username = uniqueUsername(testInfo, "refresh");
  await register(page, username, "RefreshPass123!");

  const refreshResponse = await page.waitForResponse(
    candidate =>
      new URL(candidate.url()).pathname === "/api/v1/auth/refresh" && candidate.request().method() === "POST",
    { timeout: 30_000 }
  );
  expect(refreshResponse.status()).toBe(200);
  const refreshRequest = refreshResponse.request();
  expect(refreshRequest.headers()["authorization"]).toBeUndefined();
  expect(refreshRequest.postDataJSON()).toEqual({ refreshToken: expect.any(String) });

  const refreshed = (await refreshResponse.json()) as { accessToken: string; refreshToken: string };
  expect(refreshed.accessToken).toBeTruthy();
  expect(refreshed.refreshToken).toBeTruthy();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = JSON.parse(sessionStorage.getItem("quizproject.session") ?? "null") as {
          refreshToken?: string;
        } | null;
        return stored?.refreshToken;
      })
    )
    .toBe(refreshed.refreshToken);

  // The original short-lived JWT (JWT_TTL is configured short for this workflow) has
  // now expired. A subsequent authenticated action must still succeed on the refreshed
  // token instead of bouncing the user back to the login page.
  await page.getByTitle("Відкрити профіль").click();
  await expect(page).toHaveURL(/#\/profile$/);
  await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible();
});

test("a rejected refresh returns to login and restores the same attempt after signing in", async ({
  page
}, testInfo) => {
  const username = uniqueUsername(testInfo, "revoked");
  const password = "RevokedPass1!";
  await register(page, username, password);
  const attempt = await startAttempt(page);
  const answerId = await chooseFirstAnswer(page);
  const saved = JSON.stringify([Number(answerId)]);
  await expect.poll(() => draft(page, attempt.attemptId)).toBe(saved);
  const refresh = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === "/api/v1/auth/refresh" &&
      response.request().method() === "POST" &&
      response.status() === 401,
    { timeout: 30_000 }
  );
  const accessToken = await page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem("quizproject.session")!) as { accessToken: string };
    return session.accessToken;
  });
  const api = process.env["E2E_API_URL"] || process.env["E2E_WEB_URL"] || "http://127.0.0.1:4173";
  // Revoke on the API without telling the UI, as another device/session might.
  // The next real refresh must be rejected by the backend, not a mocked 401.
  const revoked = await page.request.post(`${api}/api/v1/auth/logout`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  expect(revoked.status()).toBe(204);
  expect((await refresh).status()).toBe(401);
  await expect(page).toHaveURL(/#\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem("quizproject.session"))).toBeNull();
  expect(await draft(page, attempt.attemptId)).toBe(saved);
  await expect(page.locator(".question-card")).toHaveCount(0);

  await login(page, username, password, `#/attempt/${attempt.attemptId}`);
  await expect(page.getByRole("heading", { name: `Тест #${attempt.quizId}` })).toBeVisible();
  await expect(page.locator("label.answer-option").first().getByRole("checkbox")).toBeChecked();
  expect(await draft(page, attempt.attemptId)).toBe(saved);
});
