import { expect } from "@playwright/test";

export function uniqueUsername(testInfo, prefix) {
  const run = Date.now().toString(36).slice(-6);
  return `${prefix}${run}${testInfo.retry}`.slice(0, 15);
}

export async function submitAndExpectApiResponse(page, button, path, expectedStatus) {
  const [response] = await Promise.all([
    page.waitForResponse(candidate =>
      new URL(candidate.url()).pathname === path
      && candidate.request().method() === "POST"),
    button.click()
  ]);
  if (response.status() !== expectedStatus) {
    throw new Error(`${path} returned ${response.status()}: ${await response.text()}`);
  }
  return response;
}

export async function register(page, username, password) {
  await page.goto("/#/signup");
  await page.getByLabel("Ім’я", { exact: true }).fill("Endtoend");
  await page.getByLabel("Прізвище", { exact: true }).fill("Student");
  await page.getByLabel("Логін", { exact: true }).fill(username);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByLabel("Повторіть пароль", { exact: true }).fill(password);
  await submitAndExpectApiResponse(
    page,
    page.getByRole("button", { name: "Створити обліковий запис" }),
    "/api/v1/auth/register",
    201
  );
  await expect(page).toHaveURL(/#\/quizzes$/);
}

export async function login(page, username, password) {
  await page.goto("/#/login");
  await page.getByLabel("Логін", { exact: true }).fill(username);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await submitAndExpectApiResponse(
    page,
    page.getByRole("button", { name: "Увійти" }),
    "/api/v1/auth/login",
    200
  );
  await expect(page).toHaveURL(/#\/quizzes$/);
}
