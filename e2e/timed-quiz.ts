import { expect, test as base, type APIRequestContext } from "@playwright/test";

const API = process.env["E2E_API_URL"] || process.env["E2E_WEB_URL"] || "http://127.0.0.1:4173";
const ADMIN_USERNAME = process.env["E2E_ADMIN_USERNAME"] ?? "";
const ADMIN_PASSWORD = process.env["E2E_ADMIN_PASSWORD"] ?? "";

type CreateTimedQuiz = (name: string, minutes: number, question: string) => Promise<{ id: number }>;

async function administrate(request: APIRequestContext): Promise<Record<string, string>> {
  const response = await request.post(`${API}/api/v1/auth/login`, {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD }
  });
  expect(response.status()).toBe(200);
  const token = (await response.json()) as { accessToken: string };
  return { Authorization: `Bearer ${token.accessToken}` };
}

export const test = base.extend<{ timedQuiz: CreateTimedQuiz }>({
  timedQuiz: async ({ request }, use) => {
    test.skip(!ADMIN_USERNAME || !ADMIN_PASSWORD, "E2E administrator credentials are required");
    const subjects: number[] = [];
    const quizzes: number[] = [];
    try {
      await use(async (name, minutes, question) => {
        const headers = await administrate(request);
        const subjectResponse = await request.post(`${API}/api/v1/admin/subjects`, {
          headers,
          data: { name }
        });
        expect(subjectResponse.status()).toBe(201);
        const subject = (await subjectResponse.json()) as { id: number };
        subjects.push(subject.id);
        const levelsResponse = await request.get(`${API}/api/v1/admin/levels`, { headers });
        expect(levelsResponse.status()).toBe(200);
        const levels = (await levelsResponse.json()) as Array<{ id: number }>;
        expect(levels.length).toBeGreaterThan(0);
        const quizResponse = await request.post(`${API}/api/v1/admin/quizzes`, {
          headers,
          data: { name, subjectId: subject.id, levelId: levels[0]!.id, timeToPassMinutes: minutes }
        });
        expect(quizResponse.status()).toBe(201);
        const quiz = (await quizResponse.json()) as { id: number };
        quizzes.push(quiz.id);
        const questionResponse = await request.post(`${API}/api/v1/admin/quizzes/${quiz.id}/questions`, {
          headers,
          data: {
            text: question,
            answers: [
              { text: "Так", correct: true },
              { text: "Ні", correct: false },
              { text: "Лише вручну", correct: false },
              { text: "Ніколи", correct: false }
            ]
          }
        });
        expect(questionResponse.status()).toBe(201);
        return quiz;
      });
    } finally {
      if (subjects.length) {
        // The short access token expires during a one-minute deadline test.
        // Authenticate again so teardown really removes the created fixtures.
        const headers = await administrate(request);
        for (const id of quizzes) {
          expect((await request.delete(`${API}/api/v1/admin/quizzes/${id}`, { headers })).ok()).toBe(true);
        }
        for (const id of subjects) {
          expect((await request.delete(`${API}/api/v1/admin/subjects/${id}`, { headers })).ok()).toBe(true);
        }
      }
    }
  }
});
