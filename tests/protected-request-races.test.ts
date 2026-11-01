import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { ApiError, type QuizApi } from "../src/api.js";
import { useAccountData } from "../src/features/account/use-account-data.js";
import { useAdminData } from "../src/features/admin/use-admin-data.js";
import { useAdminQuestions } from "../src/features/admin/use-admin-questions.js";
import type { Session } from "../src/session.js";
import { act, closeBrowser, openBrowser, render } from "./support/dom.js";

beforeEach(() => openBrowser());
afterEach(() => closeBrowser());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const session = { username: "olena" } as Session;
const unauthorized = () => new ApiError("Expired", { status: 401, path: "/x" });

function mountStores(api: Partial<QuizApi>) {
  let account!: ReturnType<typeof useAccountData>;
  let admin!: ReturnType<typeof useAdminData>;
  let questions!: ReturnType<typeof useAdminQuestions>;
  const activeAccount = { current: "olena" as string | null };
  const authErrors: unknown[] = [];
  const messages: string[] = [];
  let busy = "";
  const handleAuthError = (error: unknown) => {
    authErrors.push(error);
    return true;
  };
  const options = {
    api: api as QuizApi,
    session,
    accessReady: true,
    routeName: "home",
    activeAccount,
    handleAuthError,
    setActionBusy: (value: React.SetStateAction<string>) => {
      busy = typeof value === "function" ? value(busy) : value;
    },
    toast: (message: string) => messages.push(message)
  };
  function Probe() {
    account = useAccountData(api as QuizApi, session, true, "home", activeAccount, handleAuthError);
    admin = useAdminData(options);
    questions = useAdminQuestions(options);
    return null;
  }
  render(Probe);
  return {
    account: () => account,
    admin: () => admin,
    questions: () => questions,
    activeAccount,
    authErrors,
    messages,
    busy: () => busy
  };
}

const cases = ["profile", "results", "admin", "questions"] as const;
for (const kind of cases) {
  for (const outcome of ["success", "401"] as const) {
    for (const oldFirst of [true, false]) {
      test(`${kind}: old ${outcome}, ${oldFirst ? "old" : "new"} first, after A -> B -> A`, async () => {
        const old = deferred<never>();
        const next = deferred<never>();
        let calls = 0;
        const request = () => (++calls === 1 ? old.promise : next.promise);
        const stores = mountStores({
          profile: request,
          results: request,
          resultSummary: async () => ({ totalAttempts: 0, averageScore: 0, bestScore: 0 }),
          adminSubjects: request,
          adminLevels: async () => [],
          adminQuizzes: async () => [],
          adminUsers: async () => ({ items: [], page: null }),
          adminResults: async () => ({ items: [], page: null }),
          adminQuestions: request
        });
        const store = () => {
          if (kind === "profile") {
            const hook = stores.account();
            return {
              load: hook.loadProfile,
              reset: hook.reset,
              loading: hook.profileLoading,
              data: hook.profile
            };
          }
          if (kind === "results") {
            const hook = stores.account();
            return {
              load: hook.loadResults,
              reset: hook.reset,
              loading: hook.resultsLoading,
              data: hook.results?.page.items
            };
          }
          if (kind === "admin") {
            const hook = stores.admin();
            return { load: hook.load, reset: hook.reset, loading: hook.loading, data: hook.data?.subjects };
          }
          const hook = stores.questions();
          return {
            load: () => hook.load("7"),
            reset: hook.reset,
            loading: hook.loading,
            data: hook.questions
          };
        };
        const value = (label: string) => {
          if (kind === "profile") return { username: label };
          if (kind === "results") return { items: [{ quizName: label }], page: null };
          return [{ name: label }];
        };
        let first!: Promise<void>;
        let second!: Promise<void>;
        await act(async () => {
          first = store().load();
        });
        await act(async () => {
          stores.activeAccount.current = "borys";
          store().reset();
          stores.activeAccount.current = "olena";
          store().reset();
        });
        assert.equal(store().loading, false, "reset left the previous session's spinner");
        await act(async () => {
          second = store().load();
        });
        assert.equal(calls, 2, "the old in-flight flag blocked the new session");
        const finishOld = async () => {
          if (outcome === "401") old.reject(unauthorized());
          else old.resolve(value("OLD") as never);
          await first;
        };
        const finishNew = async () => {
          next.resolve(value("NEW") as never);
          await second;
        };
        if (oldFirst) {
          await act(finishOld);
          assert.equal(store().loading, true, "old finally cleared a new request's spinner");
          // A stale finally must not release the duplicate-load guard either.
          if (kind !== "questions") {
            await act(async () => {
              await store().load();
            });
            assert.equal(calls, 2);
          }
          await act(finishNew);
        } else {
          await act(finishNew);
          await act(finishOld);
        }
        assert.match(JSON.stringify(store().data), /NEW/);
        assert.doesNotMatch(JSON.stringify(store().data), /OLD/);
        assert.equal(store().loading, false);
        assert.deepEqual(stores.authErrors, [], "an old 401 ended the new session");
      });
    }
  }
}

for (const outcome of ["success", "401"] as const) {
  test(`admin mutation: late ${outcome} cannot reload, notify or release a new action`, async () => {
    const operation = deferred<string>();
    const replacement = deferred<string>();
    let reloads = 0;
    const stores = mountStores({
      adminSubjects: async () => {
        reloads++;
        return [];
      }
    });
    let first!: Promise<string | null>;
    let second!: Promise<string | null>;
    await act(async () => {
      first = stores.admin().execute("old", () => operation.promise, "old saved");
    });
    await act(async () => {
      stores.admin().reset();
    });
    await act(async () => {
      second = stores.admin().execute("new", () => replacement.promise, "new saved");
    });
    await act(async () => {
      if (outcome === "401") operation.reject(unauthorized());
      else operation.resolve("old");
      assert.equal(await first, null);
    });
    assert.equal(stores.busy(), "admin-new");
    assert.equal(reloads, 0);
    assert.deepEqual(stores.messages, []);
    assert.deepEqual(stores.authErrors, []);
    await act(async () => {
      stores.admin().reset();
      replacement.resolve("new");
      await second;
    });
  });
}

test("an admin mutation whose reload crosses a session boundary stays silent", async () => {
  const response = deferred<[]>();
  const stores = mountStores({
    adminSubjects: () => response.promise,
    adminLevels: async () => [],
    adminQuizzes: async () => [],
    adminUsers: async () => ({ items: [], page: null }),
    adminResults: async () => ({ items: [], page: null })
  });
  let operation!: Promise<string | null>;
  await act(async () => {
    operation = stores.admin().execute("subject", async () => "saved", "saved");
  });
  await act(async () => {
    stores.admin().reset();
    response.resolve([]);
    assert.equal(await operation, null);
  });
  assert.deepEqual(stores.messages, []);
});

test("questions: 7 -> 8 -> 7 rejects the first request even without an account change", async () => {
  const old = deferred<[]>();
  let calls = 0;
  const stores = mountStores({ adminQuestions: async () => (++calls === 1 ? old.promise : []) });
  let first!: Promise<void>;
  await act(async () => {
    first = stores.questions().load("7");
  });
  await act(async () => {
    await stores.questions().load("8");
    await stores.questions().load("7");
  });
  await act(async () => {
    old.reject(unauthorized());
    await first;
  });
  assert.deepEqual(stores.authErrors, []);
  assert.equal(stores.questions().loading, false);
});
