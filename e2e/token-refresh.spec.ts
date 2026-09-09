import { expect, test } from "@playwright/test";
import { register, uniqueUsername } from "./helpers.js";

test("session survives past the original token lifetime via a silent refresh", async ({ page }, testInfo) => {
  const username = uniqueUsername(testInfo, "refresh");
  await register(page, username, "RefreshPass123!");

  const refreshResponse = await page.waitForResponse(candidate =>
    new URL(candidate.url()).pathname === "/api/v1/auth/refresh"
    && candidate.request().method() === "POST", { timeout: 30_000 });
  expect(refreshResponse.status()).toBe(200);
  const refreshedToken = (await refreshResponse.json()).accessToken;
  expect(refreshedToken).toBeTruthy();

  // The original short-lived JWT (JWT_TTL is configured short for this workflow) has
  // now expired. A subsequent authenticated action must still succeed on the refreshed
  // token instead of bouncing the user back to the login page.
  await page.getByTitle("Відкрити профіль").click();
  await expect(page).toHaveURL(/#\/profile$/);
  await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible();
});
