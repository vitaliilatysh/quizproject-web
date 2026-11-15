import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { createElement, useState } from "react";
import { ApiError } from "../src/api.js";
import { useAuthActions } from "../src/features/auth/use-auth-actions.js";
import { useAuthSession } from "../src/features/auth/use-auth-session.js";
import { readSession, rememberPendingQuiz, writeSession } from "../src/session.js";
import { fakeToken } from "./support/api-stub.js";
import { act, closeBrowser, openBrowser, render, settle, submit, type } from "./support/dom.js";

const A = "https://first.example.com";
const B = "https://second.example.com";
const realFetch = globalThis.fetch;
beforeEach(() => openBrowser());
afterEach(() => {
  closeBrowser();
  globalThis.fetch = realFetch;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {
    resolve = yes;
  });
  return { promise, resolve };
}

function token(username: string) {
  return {
    accessToken: fakeToken(username),
    tokenType: "Bearer",
    expiresIn: 900,
    refreshToken: `refresh-${username}`,
    refreshExpiresIn: 604_800
  };
}

function seed(username: string, apiUrl: string, expired = false) {
  const session = writeSession(token(username), username, apiUrl);
  if (expired) {
    session.expiresAt = Date.now() - 1;
    sessionStorage.setItem("quizproject.session", JSON.stringify(session));
  }
  return session;
}

type Kind = "login" | "signup" | "password";
interface Request {
  url: URL;
  options: RequestInit;
  response: ReturnType<typeof deferred<Response>>;
}

function mount(kind: Kind = "login", apiUrl = A) {
  const requests: Request[] = [];
  const messages: string[] = [];
  const attempts: number[] = [];
  globalThis.fetch = (async (url, options = {}) => {
    const response = deferred<Response>();
    requests.push({ url: new URL(String(url)), options, response });
    return response.promise;
  }) as typeof fetch;
  let latest!: {
    auth: ReturnType<typeof useAuthSession>;
    actions: ReturnType<typeof useAuthActions>;
    busy: string;
  };
  const values =
    kind === "password"
      ? { currentPassword: "Password1!", newPassword: "ChangedPass1!", confirmPassword: "ChangedPass1!" }
      : {
          username: "olena",
          password: "Password1!",
          confirmPassword: "Password1!",
          firstName: "Test",
          lastName: "Reader"
        };
  function Probe(props: { apiUrl: string }) {
    const [busy, setBusy] = useState("");
    const toast = (message: string) => messages.push(message);
    const auth = useAuthSession(props.apiUrl, toast, () => {});
    const actions = useAuthActions({
      api: auth.api,
      apiUrl: props.apiUrl,
      setSession: auth.setSession,
      setActionBusy: setBusy,
      handleAuthError: auth.handleAuthError,
      rememberAttempt: attempt => attempts.push(attempt.attemptId),
      resetProtectedData: () => {},
      toast
    });
    latest = { auth, actions, busy };
    const onSubmit =
      kind === "login"
        ? actions.submitLogin
        : kind === "signup"
          ? actions.submitRegistration
          : actions.changePassword;
    return createElement(
      "form",
      { onSubmit },
      Object.entries(values).map(([name, value]) =>
        createElement("input", { key: name, name, defaultValue: value })
      )
    );
  }
  const view = render(Probe, { apiUrl });
  return {
    get: () => latest,
    view,
    requests,
    messages,
    attempts,
    at: (index: number): Request => {
      const request = requests[index];
      assert.ok(request);
      return request;
    }
  };
}

async function reply(request: Request, body: unknown, status = 200) {
  await act(async () =>
    request.response.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" }
      })
    )
  );
}

test("changing APIs blocks old access and scheduled refresh credentials before a request can be sent", async () => {
  seed("olena", A, true);
  const f = mount();
  f.view.rerender({ apiUrl: B });
  await settle();
  assert.equal(f.get().auth.session, null);
  assert.equal(sessionStorage.getItem("quizproject.session"), null);
  await assert.rejects(
    f.get().auth.api.auth.profile(),
    error => error instanceof ApiError && error.code === "AUTH_REQUIRED"
  );
  assert.equal(f.requests.length, 0, "the selected API received credentials from the previous API");
});

test("an API selected before reload cannot inherit a stored session from another server", async () => {
  seed("olena", A);
  const f = mount("login", B);
  assert.equal(f.get().auth.session, null);
  assert.equal(readSession(B), null);
  assert.equal(f.requests.length, 0);
});

test("equivalent API addresses retain the session and refresh against its issuer", async () => {
  seed("olena", A, true);
  const f = mount();
  f.view.rerender({ apiUrl: "https://FIRST.example.com///?ignored=yes#fragment" });
  await settle();
  assert.equal(f.at(0).url.origin, A);
  assert.equal(f.at(0).url.pathname, "/api/v1/auth/refresh");
  await reply(f.at(0), token("olena"));
  assert.equal(f.get().auth.session?.apiUrl, A);
  assert.equal(readSession(A)?.apiUrl, A);
});

for (const outcome of ["success", "401"] as const) {
  test(`a refresh from the previous API cannot replace a new session after a late ${outcome}`, async () => {
    seed("olena", A, true);
    const f = mount();
    await settle();
    const previous = f.at(0);
    f.view.rerender({ apiUrl: B });
    await act(async () => f.get().auth.setSession(seed("borys", B)));
    await reply(previous, outcome === "success" ? token("olena") : {}, outcome === "success" ? 200 : 401);
    assert.equal(f.get().auth.session?.username, "borys");
    assert.equal(readSession(B)?.username, "borys");
    assert.equal(f.requests.length, 1);
  });
}

for (const kind of ["login", "signup", "password"] as const) {
  for (const outcome of ["success", "401"] as const) {
    test(`${kind}: an old ${outcome} after API A to B to A cannot change the new session`, async () => {
      if (kind === "password") seed("olena", A);
      const f = mount(kind);
      await submit(f.view.find("form"));
      const previous = f.at(0);
      f.view.rerender({ apiUrl: B });
      f.view.rerender({ apiUrl: A });
      await act(async () => f.get().auth.setSession(seed("borys", A)));
      await reply(previous, outcome === "success" ? token("olena") : {}, outcome === "success" ? 200 : 401);
      assert.equal(f.get().auth.session?.username, "borys");
      assert.equal(readSession(A)?.username, "borys");
      assert.deepEqual(f.messages, []);
      assert.equal(f.get().actions.loginError, "");
      assert.equal(f.get().actions.signupError, "");
      assert.equal(f.get().actions.passwordError, "");
    });
  }
}

test("a previous API login cannot release the next login's busy state", async () => {
  const f = mount();
  await submit(f.view.find("form"));
  f.view.rerender({ apiUrl: B });
  type(f.view.find("input[name=username]"), "borys");
  await submit(f.view.find("form"));
  await reply(f.at(0), token("olena"));
  assert.equal(f.get().busy, "login");
  assert.equal(f.get().auth.session, null);
  await reply(f.at(1), token("borys"));
  assert.equal(f.get().busy, "");
  assert.equal(readSession(B)?.username, "borys");
});

test("an attempt started by an old API login cannot navigate or populate a new API", async () => {
  rememberPendingQuiz(7);
  const f = mount();
  await submit(f.view.find("form"));
  await reply(f.at(0), token("olena"));
  assert.equal(f.at(1).url.pathname, "/api/v1/quizzes/7/attempts");
  f.view.rerender({ apiUrl: B });
  await act(async () => f.get().auth.setSession(seed("borys", B)));
  const routeBefore = location.hash;
  await reply(f.at(1), {
    attemptId: 4,
    quizId: 7,
    completed: false,
    questions: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  assert.deepEqual(f.attempts, []);
  assert.equal(location.hash, routeBefore);
  assert.equal(readSession(B)?.username, "borys");
});
