import { randomUUID } from "node:crypto";
import { expect, request, type FullConfig } from "@playwright/test";

/** Own the catalogue fixtures instead of depending on production demo names and answers. */
export default async function setup(config: FullConfig): Promise<() => Promise<void>> {
  const username = process.env["E2E_ADMIN_USERNAME"];
  const password = process.env["E2E_ADMIN_PASSWORD"];
  if (!username || !password)
    throw new Error("E2E administrator credentials are required for catalogue fixtures.");
  const api = await request.newContext({
    baseURL: process.env["E2E_API_URL"] || config.projects[0]!.use.baseURL!
  });
  const quizzes: number[] = [];
  let subjectId: number | undefined;

  async function authenticate(): Promise<Record<string, string>> {
    const response = await api.post("/api/v1/auth/login", { data: { username, password } });
    expect(response.status()).toBe(200);
    const { accessToken } = (await response.json()) as { accessToken: string };
    return { Authorization: `Bearer ${accessToken}` };
  }

  async function cleanup(): Promise<void> {
    try {
      if (subjectId !== undefined) {
        const headers = await authenticate();
        for (const id of quizzes) {
          expect((await api.delete(`/api/v1/admin/quizzes/${id}`, { headers })).ok()).toBe(true);
        }
        expect((await api.delete(`/api/v1/admin/subjects/${subjectId}`, { headers })).ok()).toBe(true);
      }
    } finally {
      await api.dispose();
    }
  }

  try {
    const headers = await authenticate();
    const suffix = randomUUID().slice(0, 8);
    const subject = await api.post("/api/v1/admin/subjects", { headers, data: { name: `E2E ${suffix}` } });
    expect(subject.status()).toBe(201);
    subjectId = ((await subject.json()) as { id: number }).id;
    const levels = await api.get("/api/v1/admin/levels", { headers });
    expect(levels.status()).toBe(200);
    const levelId = ((await levels.json()) as Array<{ id: number }>)[0]!.id;
    // Four ready quizzes guarantee the home-page total exceeds its three-card
    // teaser, even when the application starts with no demo quizzes at all.
    for (let index = 0; index < 4; index += 1) {
      const name = `E2E ${suffix} quiz ${index}`;
      const response = await api.post("/api/v1/admin/quizzes", {
        headers,
        data: { name, subjectId, levelId, timeToPassMinutes: 5 }
      });
      expect(response.status()).toBe(201);
      const { id } = (await response.json()) as { id: number };
      quizzes.push(id);
      const patterns =
        index === 0
          ? [
              [true, false, true, true],
              [true, true, false, false],
              [true, false, false, false]
            ]
          : [[true, false, false, false]];
      for (const [number, pattern] of patterns.entries()) {
        const question = await api.post(`/api/v1/admin/quizzes/${id}/questions`, {
          headers,
          data: {
            text: `Fixture question ${number + 1}`,
            answers: pattern.map(correct => ({ text: correct ? "correct" : "no", correct }))
          }
        });
        expect(question.status()).toBe(201);
      }
      if (index === 0) {
        process.env["E2E_QUIZ_NAME"] = name;
        process.env["E2E_QUIZ_ID"] = String(id);
      }
    }
  } catch (error) {
    await cleanup();
    throw error;
  }
  return cleanup;
}
