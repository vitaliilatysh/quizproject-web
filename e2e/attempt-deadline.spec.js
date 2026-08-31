import { expect, test } from "@playwright/test";
import { register, uniqueUsername } from "./helpers.js";

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const API = process.env.E2E_API_URL || process.env.E2E_WEB_URL || "http://127.0.0.1:4173";

// The timer under the countdown says the attempt ends by itself. It did not:
// at zero the form stayed open, and the button the reader then pressed was
// refused, because the API stamps a completion when it handles the request and
// rejects one stamped after the deadline. Every answer went with it.
//
// Nothing short of watching a deadline pass proves this fires, so the test
// builds a quiz with the shortest limit the API accepts — one minute — and
// waits. It costs about a minute of the run; losing a reader's finished quiz
// costs more.
test("an attempt submits itself when its time runs out", async ({ page, request }, testInfo) => {
  test.skip(!ADMIN_USERNAME || !ADMIN_PASSWORD, "E2E administrator credentials are required");
  test.setTimeout(150_000);

  const token = await request.post(`${API}/api/v1/auth/login`, {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD }
  }).then(response => response.json()).then(body => body.accessToken);
  const headers = { Authorization: `Bearer ${token}` };
  const name = `Deadline ${uniqueUsername(testInfo, "dl")}`;

  const subject = await request.post(`${API}/api/v1/admin/subjects`, { headers, data: { name } })
    .then(response => response.json());
  const levels = await request.get(`${API}/api/v1/admin/levels`, { headers })
    .then(response => response.json());
  const quiz = await request.post(`${API}/api/v1/admin/quizzes`, {
    headers,
    data: { name, subjectId: subject.id, levelId: levels[0].id, timeToPassMinutes: 1 }
  }).then(response => response.json());
  await request.post(`${API}/api/v1/admin/quizzes/${quiz.id}/questions`, {
    headers,
    data: {
      text: "Чи надсилається спроба сама, коли час вичерпано?",
      answers: [
        { text: "Так", correct: true },
        { text: "Ні", correct: false },
        { text: "Лише вручну", correct: false },
        { text: "Ніколи", correct: false }
      ]
    }
  });

  try {
    await register(page, uniqueUsername(testInfo, "dl"), "DeadlinePass1!");
    // Searched for rather than looked for on the first page: the catalogue is
    // paginated, and a quiz created just now need not be on the page shown.
    await page.getByPlaceholder("Пошук за назвою або предметом").fill(name);
    const card = page.locator(".quiz-card").filter({ hasText: name });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Розпочати тест" }).click();
    await expect(page.getByRole("heading", { name: `Тест #${quiz.id}` })).toBeVisible();

    await page.locator("label.answer-option").first().click();
    await expect(page.locator("label.answer-option").first().getByRole("checkbox")).toBeChecked();

    // Nobody presses the button. The deadline has to do it, and the answer
    // chosen above has to survive the trip — a completion that arrived too late
    // would leave this page showing a conflict instead of a score.
    await expect(page.getByRole("heading", { name: "Ваш результат" })).toBeVisible({ timeout: 90_000 });
    await expect(page.locator(".completion__score")).toContainText("100");
  } finally {
    await request.delete(`${API}/api/v1/admin/quizzes/${quiz.id}`, { headers });
    await request.delete(`${API}/api/v1/admin/subjects/${subject.id}`, { headers });
  }
});
