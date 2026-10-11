// What a write in the admin panel asks for afterwards.
//
// Every action used to end in a full reload: `execute` awaited `load()`, and
// `load()` was a fan-out of five. Measured on the panel as it was, adding one
// subject cost six requests — the POST, then subjects, levels, quizzes, the
// users page and the date-filtered results query. Two of those the
// administrator was not looking at, one of them cannot answer differently at
// all, and the results query is the most expensive of the five.
//
// The counts here are the point of the change, so they are asserted exactly.
// An off-by-one in either direction is a regression: upwards means the fan-out
// is creeping back, downwards means something is no longer being refreshed that
// the backend's cascades say moves.
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { readFile } from "node:fs/promises";

import App from "../src/App.js";
import { resetServerClock } from "../src/clock.js";
import { ADMIN_INVALIDATES } from "../src/features/admin/contracts.js";
import { fakeToken, stubApi, type StubbedApi } from "./support/api-stub.js";
import {
  act,
  click,
  closeBrowser,
  openBrowser,
  render,
  settle,
  settleUntil,
  submit,
  type
} from "./support/dom.js";

const realFetch = globalThis.fetch;

beforeEach(() => openBrowser());
afterEach(() => {
  closeBrowser();
  resetServerClock();
  globalThis.fetch = realFetch;
  sessionStorage.clear();
  localStorage.clear();
});

function goTo(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new window.Event("hashchange"));
  });
}

const quiz = {
  id: 7,
  name: "Java",
  subject: "IT",
  subjectId: 1,
  levelId: 5,
  complexity: "medium",
  timeToPassMinutes: 30,
  totalQuestions: 2
};

const ROUTES = {
  "GET /api/v1/quizzes": { body: [] },
  "GET /api/v1/quizzes/summary": { body: { totalQuizzes: 0, totalSubjects: 0 } },
  "GET /api/v1/admin/subjects": { body: [{ id: 1, name: "IT" }] },
  "GET /api/v1/admin/levels": { body: [{ id: 5, name: "medium" }] },
  "GET /api/v1/admin/quizzes": { body: [quiz] },
  "GET /api/v1/admin/users": { body: [{ id: 3, username: "olena", role: "user", status: "active" }] },
  "GET /api/v1/admin/results": { body: [] },
  "GET /api/v1/admin/quizzes/7/questions": { body: [] },
  "POST /api/v1/admin/subjects": { status: 201, body: { id: 2, name: "New" } },
  "PUT /api/v1/admin/quizzes/7": { body: quiz },
  "PATCH /api/v1/admin/users/3/status": {
    body: { id: 3, username: "olena", role: "user", status: "blocked" }
  }
};

async function openPanel(): Promise<{
  view: ReturnType<typeof render>;
  api: StubbedApi;
  since: () => string[];
}> {
  const api = stubApi(ROUTES as Parameters<typeof stubApi>[0]);
  sessionStorage.setItem(
    "quizproject.session",
    JSON.stringify({
      accessToken: fakeToken("root", { roles: ["ROLE_ADMIN"] }),
      tokenType: "Bearer",
      expiresAt: Date.now() + 900_000,
      refreshToken: "refresh-root",
      refreshExpiresAt: Date.now() + 604_800_000,
      username: "root",
      roles: ["ROLE_ADMIN"]
    })
  );
  const view = render(App);
  await settle();
  goTo("#/admin");
  // The panel is a chunk of its own, so the first test in a process to open it
  // waits on a real import before any of its markup exists.
  await settleUntil(() => view.findAll("input[placeholder='Новий предмет']").length > 0);
  window.confirm = () => true;
  let mark = api.calls.filter(call => call.path.startsWith("/api/v1/admin")).length;
  return {
    view,
    api,
    since: () => {
      const all = api.calls.filter(call => call.path.startsWith("/api/v1/admin"));
      const slice = all.slice(mark).map(call => `${call.method} ${call.path}`);
      mark = all.length;
      return slice;
    }
  };
}

test("adding a subject asks for subjects, and for nothing else", async () => {
  const { view, since } = await openPanel();

  type(view.find("input[placeholder='Новий предмет']"), "New");
  await act(async () => {
    submit(view.find("form.admin-inline-form"));
    await settle();
  });
  await settle();

  assert.deepEqual(since(), ["POST /api/v1/admin/subjects", "GET /api/v1/admin/subjects"]);
});

test("blocking a reader asks for the users page, and for nothing else", async () => {
  const { view, since } = await openPanel();

  click(view.findAll<HTMLButtonElement>("button").find(button => button.textContent === "Заблокувати"));
  await settle();

  assert.deepEqual(since(), ["PATCH /api/v1/admin/users/3/status", "GET /api/v1/admin/users"]);
});

// Renaming a quiz has to take the results table with it, because ResultResponse
// carries quizName — the rows change with no attempt touched. This is the one
// mapping that looks wider than the action and is not.
test("saving a quiz takes the results table with it", async () => {
  const { view, since } = await openPanel();

  click(view.findAll<HTMLButtonElement>("button").find(button => button.textContent === "Редагувати"));
  await act(async () => {
    submit(view.find("form.admin-grid-form"));
    await settle();
  });
  await settle();

  assert.deepEqual(since(), [
    "PUT /api/v1/admin/quizzes/7",
    "GET /api/v1/admin/quizzes",
    "GET /api/v1/admin/results"
  ]);
});

// The levels list has no create, rename or delete anywhere in the API client,
// so no action in this panel can make it answer differently. It is read when the
// panel is assembled and never again.
test("no write ever asks for the levels again", async () => {
  const { view, api, since } = await openPanel();
  assert.equal(api.countOf("GET /api/v1/admin/levels"), 1, "the panel did not read the levels once");

  type(view.find("input[placeholder='Новий предмет']"), "New");
  await act(async () => {
    submit(view.find("form.admin-inline-form"));
    await settle();
  });
  await settle();
  click(view.findAll<HTMLButtonElement>("button").find(button => button.textContent === "Заблокувати"));
  await settle();
  void since();

  assert.equal(api.countOf("GET /api/v1/admin/levels"), 1, "a write refetched reference data");
});

// A partial load merges rather than replaces, so what it did not ask for has to
// still be on screen afterwards — the panel must not blank the sections a write
// did not reach.
test("what a write did not ask for is still on screen", async () => {
  const { view, since } = await openPanel();

  type(view.find("input[placeholder='Новий предмет']"), "New");
  await act(async () => {
    submit(view.find("form.admin-inline-form"));
    await settle();
  });
  await settle();
  void since();

  const text = view.text();
  assert.match(text, /olena/, "the users section was emptied by a subject being added");
  assert.match(text, /Java/, "the quizzes section was emptied by a subject being added");
  assert.match(text, /medium|Середній|Складність/, "the levels went missing from the quiz form");
});

// The map is keyed by the string AdminPage passes to onExecute, and the two live
// in different files. An unmapped key falls back to the whole panel, so drift is
// safe rather than silent — but it is still drift, and it costs the fan-out this
// change exists to remove.
test("every action the panel can run says what it reaches", async () => {
  const source = await readFile("src/features/admin/admin-page.tsx", "utf8");
  const keys = [...source.matchAll(/onExecute\(\s*"([a-z-]+)"/g)]
    .map(match => match[1])
    .filter((key): key is string => key !== undefined);

  assert.ok(keys.length >= 8, `expected the panel's actions, found ${JSON.stringify(keys)}`);
  const unmapped = [...new Set(keys)].filter(key => !(key in ADMIN_INVALIDATES));
  assert.deepEqual(unmapped, [], `actions with no entry in ADMIN_INVALIDATES: ${unmapped.join(", ")}`);

  const stale = Object.keys(ADMIN_INVALIDATES).filter(key => !keys.includes(key));
  assert.deepEqual(stale, [], `entries for actions that no longer exist: ${stale.join(", ")}`);
});
