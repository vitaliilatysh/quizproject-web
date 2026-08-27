import { expect, test } from "@playwright/test";
import { login, register, uniqueUsername } from "./helpers.js";

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test("registration, profile and password change work end to end", async ({ page }, testInfo) => {
  const username = uniqueUsername(testInfo, "acct");
  const initialPassword = "StartPass123!";
  const changedPassword = "ChangedPass123!";

  await register(page, username, initialPassword);
  await page.getByTitle("Відкрити профіль").click();

  await expect(page.getByRole("heading", { name: "Endtoend Student" })).toBeVisible();
  await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible();

  await page.getByLabel("Поточний пароль").fill(initialPassword);
  await page.getByLabel("Новий пароль", { exact: true }).fill(changedPassword);
  await page.getByLabel("Повторіть новий пароль").fill(changedPassword);
  await page.getByRole("button", { name: "Оновити пароль" }).click();

  await expect(page).toHaveURL(/#\/login$/);
  await login(page, username, changedPassword);
  await expect(page.getByTitle("Відкрити профіль")).toContainText(username);
});

test("student completes a quiz and sees the persisted result", async ({ page }, testInfo) => {
  const username = uniqueUsername(testInfo, "quiz");
  await register(page, username, "QuizPass123!");

  const testCard = page.locator(".quiz-card").filter({ hasText: "Test1" });
  await expect(testCard).toBeVisible();
  await testCard.getByRole("button", { name: "Розпочати тест" }).click();
  await expect(page.getByRole("heading", { name: "Тест #1" })).toBeVisible();

  const correctAnswers = page.locator("label.answer-option").filter({
    has: page.getByText("correct", { exact: true })
  });
  await expect(correctAnswers).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) {
    const checkbox = correctAnswers.nth(index).getByRole("checkbox");
    await checkbox.check({ force: true });
    await expect(checkbox).toBeChecked();
  }

  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Завершити тест" }).click();
  await expect(page.locator(".completion__score")).toHaveText("100%");

  await page.getByRole("link", { name: "Історія результатів" }).click();
  const result = page.locator(".result-row").filter({ hasText: "Test1" });
  await expect(result).toContainText("100%");
});

test("administrator can create, update and delete catalog content", async ({ page }, testInfo) => {
  test.skip(!ADMIN_USERNAME || !ADMIN_PASSWORD, "E2E administrator credentials are required");
  await login(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  await page.getByRole("link", { name: "Адміністрування" }).click();
  await expect(page.getByRole("heading", { name: "Керуйте платформою" })).toBeVisible();

  const suffix = `${Date.now().toString(36).slice(-5)}${testInfo.retry}`;
  const subjectName = `E2E ${suffix}`;
  const renamedSubject = `E2E updated ${suffix}`;
  const quizName = `E2E quiz ${suffix}`;
  const updatedQuizName = `E2E quiz updated ${suffix}`;
  const questionText = `E2E question ${suffix}?`;
  const updatedQuestionText = `E2E question updated ${suffix}?`;

  const subjects = page.locator("section.admin-card").filter({
    has: page.getByRole("heading", { name: "Предмети", exact: true })
  });
  await subjects.getByPlaceholder("Новий предмет").fill(subjectName);
  await subjects.getByRole("button", { name: "Додати" }).click();
  let subjectRow = subjects.locator(".admin-list__row").filter({ hasText: subjectName });
  await expect(subjectRow).toBeVisible();

  page.once("dialog", dialog => dialog.accept(renamedSubject));
  await subjectRow.getByRole("button", { name: "Перейменувати" }).click();
  subjectRow = subjects.locator(".admin-list__row").filter({ hasText: renamedSubject });
  await expect(subjectRow).toBeVisible();

  const quizzes = page.locator("section.admin-card").filter({
    has: page.getByRole("heading", { name: "Тести", exact: true })
  });
  await expect(quizzes.getByRole("combobox").first()).not.toHaveValue("");
  await quizzes.getByLabel("Назва", { exact: true }).fill(quizName);
  await quizzes.getByLabel("Хвилин", { exact: true }).fill("7");
  await quizzes.getByRole("button", { name: "Створити тест" }).click();

  let quizRow = quizzes.locator(".admin-table__row").filter({ hasText: quizName });
  await expect(quizRow).toBeVisible();
  await quizRow.getByRole("button", { name: "Редагувати" }).click();
  await quizzes.getByLabel("Назва", { exact: true }).fill(updatedQuizName);
  await quizzes.getByRole("button", { name: "Зберегти" }).click();
  quizRow = quizzes.locator(".admin-table__row").filter({ hasText: updatedQuizName });
  await expect(quizRow).toBeVisible();

  const questions = page.locator("section.admin-card").filter({
    has: page.getByRole("heading", { name: "Запитання", exact: true })
  });
  await questions.locator("select.admin-quiz-select").selectOption({ label: updatedQuizName });
  await questions.getByLabel("Текст запитання").fill(questionText);
  const answerInputs = questions.locator(".admin-answer-grid input:not([type='checkbox'])");
  await expect(answerInputs).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await answerInputs.nth(index).fill(`Answer ${index + 1}`);
  }
  const correctCheckboxes = questions.locator(".admin-answer-grid input[type='checkbox']");
  await expect(correctCheckboxes).toHaveCount(4);
  await correctCheckboxes.first().check();
  await questions.getByRole("button", { name: "Додати запитання" }).click();

  let question = questions.locator("article").filter({ hasText: questionText });
  await expect(question).toBeVisible();
  await question.getByRole("button", { name: "Редагувати" }).click();
  await questions.getByLabel("Текст запитання").fill(updatedQuestionText);
  await questions.getByRole("button", { name: "Зберегти запитання" }).click();
  question = questions.locator("article").filter({ hasText: updatedQuestionText });
  await expect(question).toBeVisible();

  page.once("dialog", dialog => dialog.accept());
  await question.getByRole("button", { name: "Видалити" }).click();
  await expect(question).toHaveCount(0);

  page.once("dialog", dialog => dialog.accept());
  await quizRow.getByRole("button", { name: "Видалити" }).click();
  await expect(quizzes.locator(".admin-table__row").filter({ hasText: updatedQuizName })).toHaveCount(0);

  page.once("dialog", dialog => dialog.accept());
  await subjectRow.getByRole("button", { name: "Видалити" }).click();
  await expect(subjects.locator(".admin-list__row").filter({ hasText: renamedSubject })).toHaveCount(0);
});
