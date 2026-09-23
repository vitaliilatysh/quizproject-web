// The guards useAdminQuestions exists for. Each one was absent while this load
// lived inline in AdminPage, and each is a thing the other feature hooks have
// always done: a 401 ends the session, a failure carries the correlation id,
// and an answer for a quiz nobody is looking at any more is dropped.
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { useAdminQuestions } from "../src/features/admin/use-admin-questions.js";
import { ApiError, type QuizApi } from "../src/api.js";
import type { AdminQuestion } from "../src/types.js";
import type { Session } from "../src/session.js";
import { act, closeBrowser, openBrowser, render, settle } from "./support/dom.js";
import { useRef } from "react";

beforeEach(() => openBrowser());
afterEach(() => closeBrowser());

const OLENA = { username: "olena" } as Session;

const question = (over: Partial<AdminQuestion> = {}): AdminQuestion => ({
  id: 21,
  quizId: 7,
  text: "Що таке JVM?",
  answers: [],
  ...over
});

type Hook = ReturnType<typeof useAdminQuestions>;

/**
 * Renders the hook and hands the latest return value back.
 *
 * A probe component rather than a testing-library renderHook: this repository
 * has no testing-library, and a component is all one needs — `latest` is
 * reassigned on every render, so reading it after `settle()` reads the state
 * React has actually committed.
 */
function mountHook(
  api: Partial<QuizApi>,
  options: {
    session?: Session | null;
    account?: string | null;
    onAuthError?: (error: unknown, returnTo: string) => boolean;
  } = {}
): () => Hook {
  let latest: Hook;
  const { session = OLENA, account = "olena", onAuthError = () => false } = options;
  function Probe() {
    const activeAccount = useRef<string | null>(account);
    latest = useAdminQuestions({
      api: api as QuizApi,
      session,
      activeAccount,
      handleAuthError: onAuthError
    });
    return null;
  }
  render(Probe);
  return () => latest;
}

test("a loaded list replaces what was there", async () => {
  const hook = mountHook({ adminQuestions: async () => [question()] });
  await act(async () => {
    await hook().load("7");
  });
  assert.deepEqual(
    hook().questions.map(q => q.text),
    ["Що таке JVM?"]
  );
  assert.equal(hook().loading, false);
  assert.equal(hook().error, "");
});

test("selecting nothing clears the list without asking the API", async () => {
  let calls = 0;
  const hook = mountHook({
    adminQuestions: async () => {
      calls += 1;
      return [question()];
    }
  });
  await act(async () => {
    await hook().load("7");
  });
  await act(async () => {
    await hook().load("");
  });
  assert.deepEqual(hook().questions, []);
  assert.equal(calls, 1, "an empty selection was sent to the server as a request");
});

// The whole point of moving this out of the component. Previously the panel
// printed the message and left the dead session in place.
test("a 401 is handed to handleAuthError and never shown as an error message", async () => {
  const seen: string[] = [];
  const hook = mountHook(
    {
      adminQuestions: async () => {
        throw new ApiError("Unauthorized", { status: 401, path: "/x" });
      }
    },
    {
      onAuthError: (_error, returnTo) => {
        seen.push(returnTo);
        return true;
      }
    }
  );
  await act(async () => {
    await hook().load("7");
  });
  assert.deepEqual(seen, ["#/admin"], "a 401 loading questions left the session alive");
  assert.equal(hook().error, "", "the panel showed an error for a failure that ends the session");
});

test("a failure carries the correlation id support will ask for", async () => {
  const hook = mountHook({
    adminQuestions: async () => {
      throw new ApiError("Сервер недоступний.", { status: 500, path: "/x", correlationId: "abc-123" });
    }
  });
  await act(async () => {
    await hook().load("7");
  });
  assert.equal(hook().error, "Сервер недоступний. (код підтримки: abc-123)");
  assert.equal(hook().loading, false, "the spinner outlived the request that failed");
});

// Reading a rejection that is not an Error: friendlyError answers for it, where
// the panel used to print String(reason) and hope for the best.
test("a rejection that is not an error is still worded for the reader", async () => {
  const hook = mountHook({ adminQuestions: () => Promise.reject("сервер закрив з’єднання") });
  await act(async () => {
    await hook().load("7");
  });
  assert.equal(hook().error, "Сталася неочікувана помилка. Спробуйте ще раз.");
});

// The race the in-flight guard used by the other hooks would get wrong: there,
// dropping the second call is right because it asks for the same thing. Here it
// asks for a different quiz, so the first answer is the one to drop.
test("a slow answer for a quiz left behind does not overwrite a newer one", async () => {
  const pending = new Map<string, (rows: AdminQuestion[]) => void>();
  const hook = mountHook({
    adminQuestions: async (quizId: string) =>
      new Promise<AdminQuestion[]>(resolve => pending.set(String(quizId), resolve))
  });

  let slow!: Promise<void>;
  let fast!: Promise<void>;
  await act(async () => {
    slow = hook().load("7");
    await settle();
  });
  await act(async () => {
    fast = hook().load("8");
    await settle();
  });

  await act(async () => {
    pending.get("8")!([question({ id: 31, text: "Що таке DI?" })]);
    await fast;
    pending.get("7")!([question()]);
    await slow;
  });

  assert.deepEqual(
    hook().questions.map(q => q.text),
    ["Що таке DI?"],
    "the answer for the quiz the reader navigated away from won"
  );
  assert.equal(hook().loading, false);
});

test("an answer that arrives after a different reader signed in is dropped", async () => {
  const hook = mountHook({ adminQuestions: async () => [question()] }, { account: "petro" });
  await act(async () => {
    await hook().load("7");
  });
  assert.deepEqual(hook().questions, [], "one administrator was shown the questions another had asked for");
});

test("reset empties the list and forgets what was asked for", async () => {
  const hook = mountHook({ adminQuestions: async () => [question()] });
  await act(async () => {
    await hook().load("7");
  });
  await act(async () => {
    hook().reset();
  });
  assert.deepEqual(hook().questions, []);
  assert.equal(hook().error, "");
  assert.equal(hook().loading, false);
});

test("a signed-out reader is still a reader the answer is checked against", async () => {
  const hook = mountHook({ adminQuestions: async () => [question()] }, { session: null, account: null });
  await act(async () => {
    await hook().load("7");
  });
  assert.deepEqual(
    hook().questions.map(q => q.id),
    [21]
  );
});
