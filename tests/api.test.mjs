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
