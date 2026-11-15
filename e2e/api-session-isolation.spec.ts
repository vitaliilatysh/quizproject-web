import { expect, test } from "@playwright/test";
import { register, uniqueUsername } from "./helpers.js";

test("changing the API address signs out without forwarding the previous server's credentials", async ({
  page
}, testInfo) => {
  await page.clock.install();
  await register(page, uniqueUsername(testInfo, "apiscope"), "ApiScopePass1!");
  // A separate backend path also exercises URL isolation under the production
  // connect-src 'self' policy. Unit regressions cover different origins too.
  const otherApi = new URL("/separate-api", page.url()).href;
  const prefix = new URL(otherApi).pathname;
  const received: Array<{ method: string; path: string; authorization: boolean; refreshToken: boolean }> = [];
  await page.route(`${otherApi}/**`, async route => {
    const request = route.request();
    const body = request.postData() ? (request.postDataJSON() as Record<string, unknown>) : null;
    const path = new URL(request.url()).pathname.slice(prefix.length);
    received.push({
      method: request.method(),
      path,
      authorization: request.headers()["authorization"] !== undefined,
      refreshToken: !!body && "refreshToken" in body
    });
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS"
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
    } else if (path === "/api/v1/quizzes/summary") {
      await route.fulfill({
        status: 200,
        headers,
        contentType: "application/json",
        body: JSON.stringify({ totalQuizzes: 0, totalSubjects: 0 })
      });
    } else {
      await route.fulfill({ status: 401, headers, contentType: "application/json", body: "{}" });
    }
  });

  await page.goto("/#/settings");
  await page.getByLabel("Базова адреса API").fill(otherApi);
  await page.getByRole("button", { name: "Зберегти й перевірити" }).click();
  await expect(page.locator(".connection-state")).toHaveText("API доступний");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("quizproject.session"))).toBeNull();
  await page.clock.fastForward(20_000);
  await page.goto("/#/profile");
  await expect(page).toHaveURL(/#\/login$/);
  expect(received.some(request => request.path === "/api/v1/quizzes/summary")).toBe(true);
  expect(received.filter(request => request.authorization || request.refreshToken)).toEqual([]);
  expect(received.filter(request => request.path === "/api/v1/auth/refresh")).toEqual([]);
});
