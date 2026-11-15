import { expect, test } from "@playwright/test";

// The catalogue's search and difficulty filter are applied by the API. What can
// break silently is the wiring: criteria not reaching the query string, or the
// React state deadlocking so a request never fires at all. A unit test with a
// mocked fetch cannot see either.
test("catalogue search and difficulty filter are applied by the API", async ({ page }) => {
  await page.goto("/#/quizzes");
  await expect(page.getByRole("heading", { name: "Каталог тестів" })).toBeVisible();

  // Difficulty first: the button click must produce a request carrying every
  // level label that button stands for.
  const filtered = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/quizzes" && url.searchParams.has("complexity");
  });
  await page.getByRole("button", { name: "Просунуті" }).click();
  const byComplexity = await filtered;
  expect(byComplexity.status()).toBe(200);

  const levels = new URL(byComplexity.url()).searchParams.getAll("complexity");
  // "advanced" used to belong to no button, so quizzes at that level were
  // unreachable through the UI. Its presence here is the fix.
  expect(levels).toContain("high");
  expect(levels).toContain("advanced");

  // Then search. The term is debounced, so the assertion waits for the request
  // rather than assuming one fires per keystroke.
  const searched = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/quizzes" && url.searchParams.get("search") === "java";
  });
  await page.getByRole("button", { name: "Усі" }).click();
  await page.getByPlaceholder("Пошук за назвою або предметом").fill("java");
  const bySearch = await searched;
  expect(bySearch.status()).toBe(200);

  // A paged response must still report how many quizzes match overall, not how
  // many are on the page.
  const total = bySearch.headers()["x-total-count"];
  expect(total).toBeDefined();
  await expect(page.locator(".catalog-count")).toContainText(String(Number(total)));

  // The grid has to render whatever the API returned — proving the request was
  // not merely sent but consumed.
  if (Number(total) > 0) {
    await expect(page.locator(".quiz-card").first()).toBeVisible();
  }
});

test("a search matching nothing empties the catalogue instead of hanging", async ({ page }) => {
  await page.goto("/#/quizzes");
  await expect(page.getByRole("heading", { name: "Каталог тестів" })).toBeVisible();

  const searched = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/quizzes" && url.searchParams.get("search") === "zzz-no-such-quiz";
  });
  await page.getByPlaceholder("Пошук за назвою або предметом").fill("zzz-no-such-quiz");
  expect((await searched).status()).toBe(200);

  // Reaching this state at all is the point: an earlier draft raised the
  // loading flag in the same effect that cleared the list, while the loader was
  // gated on that flag being false, so no request ever went out and the page
  // sat on its skeleton forever.
  await expect(page.getByText("Нічого не знайдено")).toBeVisible();
  await expect(page.locator(".catalog-count")).toContainText("0");
});

test("a new filter is applied while an earlier catalogue response is still in flight", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });
  let firstReady!: () => void;
  const ready = new Promise<void>(resolve => {
    firstReady = resolve;
  });
  let intercepted = false;
  let originalNames: string[] = [];
  await page.route("**/api/v1/quizzes?*", async route => {
    if (!intercepted) {
      intercepted = true;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      originalNames = ((await response.json()) as Array<{ name: string }>).map(quiz => quiz.name);
      firstReady();
      await held;
      await route.fulfill({ response });
    } else {
      await route.continue();
    }
  });
  try {
    await page.goto("/#/quizzes");
    await ready;
    const filtered = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/v1/quizzes" && url.searchParams.getAll("complexity").includes("advanced");
    });
    await page.getByRole("button", { name: "Просунуті" }).click();
    const response = await filtered;
    expect(response.status()).toBe(200);
    const names = ((await response.json()) as Array<{ name: string }>).map(quiz => quiz.name);
    expect(names).not.toEqual(originalNames);
    const cards = page.locator(".quiz-card");
    await expect(cards).toHaveCount(names.length);
    if (names.length) await expect(cards.getByRole("heading")).toHaveText(names);
    else await expect(page.getByText("Нічого не знайдено")).toBeVisible();

    const previous = page.waitForResponse(candidate => {
      const url = new URL(candidate.url());
      return url.pathname === "/api/v1/quizzes" && !url.searchParams.has("complexity");
    });
    release();
    await (await previous).finished();
    // Flush the old response's React commit before asserting the final grid.
    await page.evaluate(
      () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    );
    await expect(cards).toHaveCount(names.length);
    if (names.length) await expect(cards.getByRole("heading")).toHaveText(names);
    await expect(page.getByRole("button", { name: "Просунуті" })).toHaveClass(/is-active/);
  } finally {
    release();
  }
});
