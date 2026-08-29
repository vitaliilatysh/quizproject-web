import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, QuizApi, normalizeBaseUrl, readPageMeta, toInstant } from "../src/api.js";

test("normalizeBaseUrl validates and canonicalizes HTTP URLs", () => {
  assert.equal(normalizeBaseUrl(" https://api.example.com///?ignored=yes#fragment "), "https://api.example.com");
  assert.throws(() => normalizeBaseUrl("ftp://example.com"), /HTTP/);
  assert.throws(() => normalizeBaseUrl(""), /порожнім/);
});

test("default fetch keeps the browser global as its receiver", async () => {
  const originalFetch = globalThis.fetch;
  let observedUrl;
  try {
    globalThis.fetch = async function (url) {
      assert.equal(this, globalThis);
      observedUrl = url;
      return new Response(JSON.stringify({ status: "UP" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    const api = new QuizApi({ baseUrl: "https://api.example.com" });
    assert.deepEqual(await api.health(), { status: "UP" });
    assert.equal(observedUrl, "https://api.example.com/actuator/health");
  } finally {
    globalThis.fetch = originalFetch;
  }
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

  // The catalogue is paginated, so it reports items alongside page metadata.
  // Called with no criteria it still asks for the whole collection.
  const result = await api.quizzes();
  assert.deepEqual(result.items, [{ id: 1, name: "Java" }]);
  assert.equal(result.page, null);
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

test("refresh exchanges the current bearer token for a fresh one", async () => {
  let observed;
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    getToken: () => "expiring-token",
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return new Response(JSON.stringify({
        accessToken: "fresh-token", tokenType: "Bearer", expiresIn: 900
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  assert.deepEqual(await api.refresh(),
    { accessToken: "fresh-token", tokenType: "Bearer", expiresIn: 900 });
  assert.equal(observed.url, "https://api.example.com/api/v1/auth/refresh");
  assert.equal(observed.options.method, "POST");
  assert.equal(observed.options.headers.Authorization, "Bearer expiring-token");
});

test("refresh fails before fetch when the session is absent", async () => {
  const api = new QuizApi({ baseUrl: "https://api.example.com", getToken: () => null, fetchImpl: () => assert.fail("fetch must not be called") });
  await assert.rejects(api.refresh(), error => error instanceof ApiError && error.code === "AUTH_REQUIRED");
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

test("API errors capture the backend correlation ID for support diagnostics", async () => {
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    fetchImpl: async () => new Response(JSON.stringify({
      status: 500,
      error: "Internal Server Error",
      message: "Unexpected failure",
      path: "/api/v1/quizzes"
    }), {
      status: 500,
      headers: { "content-type": "application/json", "X-Correlation-ID": "abc123-request-id" }
    })
  });

  await assert.rejects(api.request("/test"), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.correlationId, "abc123-request-id");
    return true;
  });
});

test("API errors leave the correlation ID unset when the backend does not send one", async () => {
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    fetchImpl: async () => new Response(JSON.stringify({
      status: 409,
      error: "Conflict",
      message: "Attempt is already completed"
    }), { status: 409, headers: { "content-type": "application/json" } })
  });

  await assert.rejects(api.request("/test"), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.correlationId, null);
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
  // Date bounds are now normalised to a canonical instant before being sent,
  // so an already-absolute input comes back with explicit milliseconds. Same
  // point in time, and still valid ISO-8601 for the Instant the API binds to.
  assert.equal(observed.at(-1).url,
    "https://api.example.com/api/v1/admin/results?from=2026-01-01T00%3A00%3A00.000Z&to=2026-12-31T23%3A59%3A59.000Z");
  assert.deepEqual(JSON.parse(observed[2].options.body), { name: "Databases" });
});

test("readPageMeta parses the four pagination headers", () => {
  const meta = readPageMeta(new Headers({
    "X-Page-Number": "2",
    "X-Page-Size": "20",
    "X-Total-Count": "97",
    "X-Total-Pages": "5"
  }));
  assert.deepEqual(meta, { number: 2, size: 20, totalCount: 97, totalPages: 5 });
});

test("readPageMeta returns null when the response was not paginated", () => {
  assert.equal(readPageMeta(new Headers()), null);
  // A partial set means something is wrong upstream; treat it as unpaginated
  // rather than rendering controls from half-known state.
  assert.equal(readPageMeta(new Headers({ "X-Total-Count": "97" })), null);
});

test("readPageMeta rejects values that are not whole counts", () => {
  const base = {
    "X-Page-Number": "0",
    "X-Page-Size": "20",
    "X-Total-Count": "97",
    "X-Total-Pages": "5"
  };
  assert.equal(readPageMeta(new Headers({ ...base, "X-Page-Number": "-1" })), null);
  assert.equal(readPageMeta(new Headers({ ...base, "X-Total-Pages": "many" })), null);
  assert.equal(readPageMeta(new Headers({ ...base, "X-Page-Size": "2.5" })), null);
  assert.equal(readPageMeta(new Headers({ ...base, "X-Total-Count": "" })), null);
});

test("adminUsers sends page and size and returns items with metadata", async () => {
  let observed;
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    getToken: () => "admin-token",
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return new Response(JSON.stringify([{ id: 7, username: "student" }]), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "X-Page-Number": "1",
          "X-Page-Size": "20",
          "X-Total-Count": "41",
          "X-Total-Pages": "3"
        }
      });
    }
  });

  const result = await api.adminUsers({ page: 1, size: 20 });
  assert.equal(observed.url, "https://api.example.com/api/v1/admin/users?page=1&size=20");
  assert.deepEqual(result.items, [{ id: 7, username: "student" }]);
  assert.deepEqual(result.page, { number: 1, size: 20, totalCount: 41, totalPages: 3 });
});

test("adminResults combines the date range with paging in one query", async () => {
  let observed;
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    getToken: () => "admin-token",
    fetchImpl: async url => {
      observed = url;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  const result = await api.adminResults({
    from: "2026-01-01T00:00", to: "2026-02-01T00:00", page: 2, size: 20
  });
  const query = new URL(observed).searchParams;
  // Converted to an absolute instant: the API binds these to Instant, which
  // rejects the offset-less value a datetime-local input produces.
  assert.equal(query.get("from"), new Date("2026-01-01T00:00").toISOString());
  assert.equal(query.get("to"), new Date("2026-02-01T00:00").toISOString());
  assert.match(query.get("from"), /Z$/);
  assert.equal(query.get("page"), "2");
  assert.equal(query.get("size"), "20");
  // No pagination headers came back, so there is no page to report.
  assert.equal(result.page, null);
  assert.deepEqual(result.items, []);
});

test("omitting page and size leaves the request unpaginated", async () => {
  let observed;
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    getToken: () => "admin-token",
    fetchImpl: async url => {
      observed = url;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  await api.adminUsers();
  assert.equal(observed, "https://api.example.com/api/v1/admin/users");
});

test("results stays unpaginated so its averages cover every attempt", async () => {
  let observed;
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    getToken: () => "student-token",
    fetchImpl: async url => {
      observed = url;
      return new Response(JSON.stringify([{ attemptId: 1, score: 80 }]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  assert.deepEqual(await api.results(), [{ attemptId: 1, score: 80 }]);
  assert.equal(observed, "https://api.example.com/api/v1/results/me");
});

test("toInstant converts widget values and rejects unusable ones", () => {
  assert.equal(toInstant("2026-01-01T00:00"), new Date("2026-01-01T00:00").toISOString());
  assert.match(toInstant("2026-01-01T00:00"), /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  assert.equal(toInstant(""), null);
  assert.equal(toInstant(undefined), null);
  assert.equal(toInstant("not-a-date"), null);
});

test("a blank date range is omitted from the query entirely", async () => {
  let observed;
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    getToken: () => "admin-token",
    fetchImpl: async url => {
      observed = url;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  await api.adminResults({ from: "", to: "", page: 0, size: 20 });
  const query = new URL(observed).searchParams;
  assert.equal(query.has("from"), false);
  assert.equal(query.has("to"), false);
  assert.equal(query.get("page"), "0");
});

test("quizzes sends the search term and every requested level label", async () => {
  let observed;
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    fetchImpl: async url => {
      observed = url;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "X-Page-Number": "0",
          "X-Page-Size": "20",
          "X-Total-Count": "3",
          "X-Total-Pages": "1"
        }
      });
    }
  });

  const result = await api.quizzes({
    search: "  java  ",
    complexity: ["high", "advanced", "hard"],
    page: 0,
    size: 20
  });

  const query = new URL(observed).searchParams;
  assert.equal(query.get("search"), "java");
  assert.deepEqual(query.getAll("complexity"), ["high", "advanced", "hard"]);
  assert.equal(query.get("page"), "0");
  assert.deepEqual(result.page, { number: 0, size: 20, totalCount: 3, totalPages: 1 });
});

test("quizzes omits blank criteria rather than sending empty parameters", async () => {
  let observed;
  const api = new QuizApi({
    baseUrl: "https://api.example.com",
    fetchImpl: async url => {
      observed = url;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  await api.quizzes({ search: "   ", complexity: [], page: 0, size: 20 });
  const query = new URL(observed).searchParams;
  assert.equal(query.has("search"), false);
  assert.equal(query.has("complexity"), false);
  assert.equal(query.get("page"), "0");
});
