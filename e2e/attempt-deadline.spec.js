import { expect, test } from "@playwright/test";
import { register, uniqueUsername } from "./helpers.js";

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const API = process.env.E2E_API_URL || process.env.E2E_WEB_URL || "http://127.0.0.1:4173";

// Both tests need a quiz whose time limit they choose, which only an
// administrator can create. Returned rather than fixtured so each test deletes
// what it made, in a finally, on a database the whole suite shares.
async function createQuiz(request, headers, name, minutes, questionText) {
  const subject = await request.post(`${API}/api/v1/admin/subjects`, { headers, data: { name } })
    .then(response => response.json());
  const levels = await request.get(`${API}/api/v1/admin/levels`, { headers })
    .then(response => response.json());
  const quiz = await request.post(`${API}/api/v1/admin/quizzes`, {
    headers,
    data: { name, subjectId: subject.id, levelId: levels[0].id, timeToPassMinutes: minutes }
  }).then(response => response.json());
  await request.post(`${API}/api/v1/admin/quizzes/${quiz.id}/questions`, {
    headers,
    data: {
      text: questionText,
      answers: [
        { text: "Так", correct: true },
        { text: "Ні", correct: false },
        { text: "Лише вручну", correct: false },
        { text: "Ніколи", correct: false }
      ]
    }
  });
  return { subject, quiz };
}

async function administrate(request) {
  const token = await request.post(`${API}/api/v1/auth/login`, {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD }
  }).then(response => response.json()).then(body => body.accessToken);
  return { Authorization: `Bearer ${token}` };
}

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

  const headers = await administrate(request);
  const name = `Deadline ${uniqueUsername(testInfo, "dl")}`;

  const { subject, quiz } = await createQuiz(request, headers, name, 1,
    "Чи надсилається спроба сама, коли час вичерпано?");

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

// The deadline belongs to the server; the clock the browser read it against
// belonged to the device. Nothing kept the two in step, and a laptop set five
// minutes fast simply showed five minutes less — then submitted the attempt
// that much early, with the reader watching a timer that agreed with itself
// and with nothing else.
//
// Only Date is faked here, not the timers: that is exactly the condition under
// test, a device whose clock is wrong while everything else works. The reading
// the page corrects itself with is the Date header on its own API responses.
//
// This suite reaches the API through the dev server's proxy, so it is
// same-origin and the header is readable whatever CORS says. What is proved
// here is that the page uses the reading. That the header survives a real
// deployment, where the API is on another origin and Date is not one of the
// headers a browser exposes by default, is the backend's own test to make.
test("the countdown follows the server's clock, not the device's", async ({ page, request }, testInfo) => {
  test.skip(!ADMIN_USERNAME || !ADMIN_PASSWORD, "E2E administrator credentials are required");

  const SKEW_MINUTES = 5;
  const LIMIT_MINUTES = 30;

  const headers = await administrate(request);
  const name = `Skew ${uniqueUsername(testInfo, "sk")}`;
  const { subject, quiz } = await createQuiz(request, headers, name, LIMIT_MINUTES,
    "Чи показує таймер час сервера?");

  try {
    // Before the first navigation, so every script the page runs sees it.
    await page.clock.setFixedTime(new Date(Date.now() + SKEW_MINUTES * 60_000));

    await register(page, uniqueUsername(testInfo, "sk"), "SkewPass1!");
    await page.getByPlaceholder("Пошук за назвою або предметом").fill(name);
    const card = page.locator(".quiz-card").filter({ hasText: name });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Розпочати тест" }).click();
    await expect(page.getByRole("heading", { name: `Тест #${quiz.id}` })).toBeVisible();

    // Thirty minutes were granted a moment ago, so 29:5x or 30:00. Read off the
    // device's clock it would say 24:5x — five minutes of someone's exam.
    await expect(page.locator(".timer-card strong")).toHaveText(/^(29|30):[0-5]\d$/);
  } finally {
    await request.delete(`${API}/api/v1/admin/quizzes/${quiz.id}`, { headers });
    await request.delete(`${API}/api/v1/admin/subjects/${subject.id}`, { headers });
  }
});
