import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { useQuizCatalogue } from "../src/features/catalogue/use-quiz-catalogue.js";
import type { CatalogueSummary, Paged, Quiz } from "../src/types.js";
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

type Source = Parameters<typeof useQuizCatalogue>[0];
interface Pending {
  baseUrl: string;
  options: NonNullable<Parameters<Source["quizzes"]>[0]>;
  response: ReturnType<typeof deferred<Paged<Quiz>>>;
}

function mount(
  routeName = "quizzes",
  summary = (): Promise<CatalogueSummary> => Promise.resolve({ totalQuizzes: 10, totalSubjects: 2 })
) {
  const requests: Pending[] = [];
  const source = (baseUrl = "https://api.example.com"): Source => ({
    baseUrl,
    quizzes: (options = {}) => {
      const response = deferred<Paged<Quiz>>();
      requests.push({ baseUrl, options, response });
      return response.promise;
    },
    catalogueSummary: summary
  });
  let latest!: ReturnType<typeof useQuizCatalogue>;
  function Probe(props: { api: Source; routeName: string }) {
    latest = useQuizCatalogue(props.api, props.routeName);
    return null;
  }
  const api = source();
  const view = render(Probe, { api, routeName });
  return {
    get: () => latest,
    requests,
    source,
    api,
    view,
    at: (index: number): Pending => {
      const request = requests[index];
      assert.ok(request, `request ${index} was never started`);
      return request;
    }
  };
}

async function answer(request: Pending, id: number): Promise<void> {
  await act(async () => {
    request.response.resolve({
      items: [
        {
          id,
          name: `Quiz ${id}`,
          subject: "IT",
          complexity: "high",
          totalQuestions: 1,
          timeToPassMinutes: 10
        }
      ],
      page: { number: request.options.page ?? 0, size: 20, totalCount: 100 + id, totalPages: 6 }
    });
  });
}

for (const outcome of ["success", "failure"] as const) {
  for (const oldFirst of [true, false]) {
    test(`a changed filter wins over an old ${outcome}, ${oldFirst ? "old" : "new"} response first`, async () => {
      const f = mount();
      await act(async () => f.get().setFilter("hard"));
      assert.equal(f.requests.length, 2, "the new filter waited behind the previous query");
      assert.deepEqual(f.at(1).options.complexity, ["high", "advanced", "hard"]);
      const finishOld = async () => {
        if (outcome === "success") await answer(f.at(0), 1);
        else await act(async () => f.at(0).response.reject(Error("obsolete failure")));
      };
      if (oldFirst) {
        await finishOld();
        assert.equal(f.get().loading, true, "an obsolete response stopped the current spinner");
        assert.equal(f.get().quizzes, null);
        assert.equal(f.get().error, "");
        await answer(f.at(1), 2);
      } else {
        await answer(f.at(1), 2);
        await finishOld();
      }
      assert.deepEqual(
        f.get().quizzes?.map(q => q.id),
        [2]
      );
      assert.equal(f.get().pageMeta?.totalCount, 102);
      assert.equal(f.get().loading, false);
      assert.equal(f.get().error, "");
    });
  }
}

test("an old success cannot hide the current error, and retry is explicit", async () => {
  const f = mount();
  await act(async () => f.get().setFilter("hard"));
  await act(async () => f.at(1).response.reject(Error("current failure")));
  await answer(f.at(0), 1);
  assert.equal(f.get().error, "current failure");
  assert.equal(f.get().quizzes, null);
  assert.equal(f.requests.length, 2);
  let retry!: Promise<void>;
  await act(async () => {
    retry = f.get().load();
  });
  await answer(f.at(2), 3);
  await retry;
  assert.deepEqual(
    f.get().quizzes?.map(q => q.id),
    [3]
  );
  assert.equal(f.get().error, "");
});

test("duplicate loads of the same pending query are coalesced", async () => {
  const f = mount();
  await act(async () => {
    await Promise.all([f.get().load(), f.get().load()]);
  });
  assert.equal(f.requests.length, 1);
  await answer(f.at(0), 1);
  await act(async () => f.get().setFilter("all"));
  assert.equal(f.requests.length, 1);
});

test("A to B to A keeps the newest A response", async () => {
  const f = mount();
  await act(async () => f.get().setFilter("hard"));
  await act(async () => f.get().setFilter("all"));
  assert.equal(f.requests.length, 3);
  await answer(f.at(2), 3);
  await answer(f.at(0), 1);
  await answer(f.at(1), 2);
  assert.deepEqual(
    f.get().quizzes?.map(q => q.id),
    [3]
  );
});

test("filter and debounced search changes start at page zero", async t => {
  const f = mount();
  await answer(f.at(0), 1);
  await act(async () => f.get().setPage(2));
  await answer(f.at(1), 2);
  await act(async () => f.get().setFilter("hard"));
  assert.equal(f.at(2).options.page, 0);
  await answer(f.at(2), 3);
  await act(async () => f.get().setPage(3));
  await answer(f.at(3), 4);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await act(async () => f.get().setSearch("java"));
    await act(async () => {
      t.mock.timers.tick(299);
    });
    assert.equal(f.requests.length, 4);
    await act(async () => {
      t.mock.timers.tick(1);
    });
    assert.equal(f.at(4).options.page, 0);
    assert.equal(f.at(4).options.search, "java");
    await answer(f.at(4), 5);
  } finally {
    t.mock.timers.reset();
  }
});

test("a different API supersedes the old response; token rotation keeps the public cache", async () => {
  const f = mount();
  f.view.rerender({ api: f.source("https://other.example.com"), routeName: "quizzes" });
  await answer(f.at(1), 2);
  await answer(f.at(0), 1);
  assert.deepEqual(
    f.get().quizzes?.map(q => q.id),
    [2]
  );
  f.view.rerender({ api: f.source("https://other.example.com"), routeName: "quizzes" });
  assert.equal(f.requests.length, 2, "replacing a client at the same URL reloaded public data");
});

test("invalidation replaces an in-flight query without accepting its late response", async () => {
  const f = mount();
  await act(async () => f.get().invalidate());
  assert.equal(f.requests.length, 2);
  await answer(f.at(0), 1);
  assert.equal(f.get().loading, true);
  await answer(f.at(1), 2);
  assert.deepEqual(
    f.get().quizzes?.map(q => q.id),
    [2]
  );
});

test("a pending query can finish offscreen and be read on returning", async () => {
  const f = mount();
  f.view.rerender({ api: f.api, routeName: "profile" });
  await answer(f.at(0), 1);
  f.view.rerender({ api: f.api, routeName: "quizzes" });
  assert.deepEqual(
    f.get().quizzes?.map(q => q.id),
    [1]
  );
  assert.equal(f.requests.length, 1);
});

test("a missing summary leaves the home teaser usable", async () => {
  const f = mount("home", () => Promise.reject(Error("no summary")));
  await answer(f.at(0), 1);
  assert.deepEqual(
    f.get().quizzes?.map(q => q.id),
    [1]
  );
  assert.equal(f.get().summary, null);
  assert.equal(f.get().error, "");
});

test("unmounted catalogue loaders do not start or commit requests", async () => {
  const f = mount();
  const load = f.get().load;
  f.view.unmount();
  await load();
  await answer(f.at(0), 1);
  assert.equal(f.requests.length, 1);
});
