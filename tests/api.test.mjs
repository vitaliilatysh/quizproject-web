import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, QuizApi, normalizeBaseUrl } from "../src/api.js";

test("normalizeBaseUrl validates and canonicalizes HTTP URLs", () => {
  assert.equal(normalizeBaseUrl(" https://api.example.com///?ignored=yes#fragment "), "https://api.example.com");
  assert.throws(() => normalizeBaseUrl("ftp://example.com"), /HTTP/);
  assert.throws(() => normalizeBaseUrl(""), /порожнім/);
});

test("quizzes requests the public catalogue without an auth header", async () => {
  let observed;
  const api = new QuizApi({
    baseUrl: "https://api.example.com/",
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return new Response(JSON.stringify([{ id: 1, name: "Java" }]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  assert.deepEqual(await api.quizzes(), [{ id: 1, name: "Java" }]);
  assert.equal(observed.url, "https://api.example.com/api/v1/quizzes");
  assert.equal(observed.options.method, "GET");
  assert.equal(observed.options.headers.Authorization, undefined);
});

test("protected requests attach the short-lived bearer token", async () => {
  let observed;
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    getToken: () => "signed-token",
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return new Response(JSON.stringify({ attemptId: 42 }), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    }
  });

  assert.deepEqual(await api.startAttempt(7), { attemptId: 42 });
  assert.equal(observed.options.headers.Authorization, "Bearer signed-token");
  assert.equal(observed.options.method, "POST");
});

test("completeAttempt serializes selected answer IDs", async () => {
  let body;
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    getToken: () => "token",
    fetchImpl: async (_url, options) => {
      body = options.body;
      return new Response(JSON.stringify({ score: 80 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  await api.completeAttempt(12, [2, 5]);
  assert.deepEqual(JSON.parse(body), { answerIds: [2, 5] });
});

test("API errors preserve the backend message and status", async () => {
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    fetchImpl: async () => new Response(JSON.stringify({
      status: 409,
      error: "Conflict",
      message: "Attempt is already completed",
      path: "/api/v1/attempts/9/complete"
    }), { status: 409, headers: { "content-type": "application/json" } })
  });

  await assert.rejects(api.request("/test"), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.message, "Attempt is already completed");
    return true;
  });
});

test("protected requests fail before fetch when the session is absent", async () => {
  const api = new QuizApi({ baseUrl: "https://api.example.com", getToken: () => null, fetchImpl: () => assert.fail("fetch must not be called") });
  await assert.rejects(api.results(), error => error instanceof ApiError && error.code === "AUTH_REQUIRED");
});

test("account lifecycle uses public registration and protected profile resources", async () => {
  const observed = [];
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    getToken: () => "account-token",
    fetchImpl: async (url, options) => {
      observed.push({ url, options });
      if (options.method === "PUT") return new Response(null, { status: 204 });
      return new Response(JSON.stringify(url.endsWith("/register")
        ? { accessToken: "jwt", tokenType: "Bearer", expiresIn: 900 }
        : { username: "student" }), {
        status: url.endsWith("/register") ? 201 : 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  await api.register({ username: "student", firstName: "Test", lastName: "User", password: "secret123" });
  await api.profile();
  await api.changePassword("secret123", "updated123");

  assert.deepEqual(observed.map(call => [call.url, call.options.method]), [
    ["https://api.example.com/api/v1/auth/register", "POST"],
    ["https://api.example.com/api/v1/users/me", "GET"],
    ["https://api.example.com/api/v1/users/me/password", "PUT"]
  ]);
  assert.equal(observed[0].options.headers.Authorization, undefined);
  assert.equal(observed[1].options.headers.Authorization, "Bearer account-token");
  assert.deepEqual(JSON.parse(observed[2].options.body), {
    currentPassword: "secret123",
    newPassword: "updated123"
  });
});

test("administration methods use protected REST resources and mutation verbs", async () => {
  const observed = [];
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    getToken: () => "admin-token",
    fetchImpl: async (url, options) => {
      observed.push({ url, options });
      return new Response(options.method === "DELETE" ? null : JSON.stringify({ id: 9 }), {
        status: options.method === "POST" ? 201 : options.method === "DELETE" ? 204 : 200,
        headers: options.method === "DELETE" ? {} : { "content-type": "application/json" }
      });
    }
  });

  await api.adminStatus();
  await api.adminSubjects();
  await api.createSubject("Databases");
  await api.updateSubject(9, "SQL");
  await api.deleteSubject(9);
  await api.adminLevels();
  await api.adminQuizzes();
  await api.createQuiz({ name: "SQL", subjectId: 1, levelId: 2, timeToPassMinutes: 10 });
  await api.updateQuiz(9, { name: "SQL 2", subjectId: 1, levelId: 2, timeToPassMinutes: 12 });
  await api.deleteQuiz(9);
  await api.adminQuestions(9);
  await api.createQuestion(9, { text: "Question", answers: [] });
  await api.updateQuestion(8, { text: "Updated", answers: [] });
  await api.deleteQuestion(8);
  await api.adminUsers();
  await api.updateUserStatus(3, "blocked");
  await api.adminResults({ from: "2026-01-01T00:00:00Z", to: "2026-12-31T23:59:59Z" });

  assert.ok(observed.every(call => call.options.headers.Authorization === "Bearer admin-token"));
  assert.deepEqual(observed.map(call => call.options.method), [
    "GET", "GET", "POST", "PUT", "DELETE", "GET", "GET", "POST", "PUT",
    "DELETE", "GET", "POST", "PUT", "DELETE", "GET", "PATCH", "GET"
  ]);
  assert.equal(observed.at(-1).url,
    "https://api.example.com/api/v1/admin/results?from=2026-01-01T00%3A00%3A00Z&to=2026-12-31T23%3A59%3A59Z");
  assert.deepEqual(JSON.parse(observed[2].options.body), { name: "Databases" });
});
