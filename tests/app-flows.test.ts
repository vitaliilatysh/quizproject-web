// The parts of App the existing suite does not reach.
//
// app.test.ts is about one thing — whose data is whose, and what survives a
// handover — and it drives the app through sign-in and an attempt to get there.
// Everything either side of that route was untested: registration, the password
// change, the settings screen, and every failure each of them can report. Those
// failures are the app's only voice when the API says no, and until now nothing
// checked that it says the right thing, or anything at all.
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import App from "../src/App.js";
import { resetServerClock } from "../src/clock.js";
import { fakeToken, loginResponse, stubApi, type StubbedApi } from "./support/api-stub.js";
import {
  act, click, closeBrowser, openBrowser, render, settle, submit, type, type Rendered
} from "./support/dom.js";

const realFetch = globalThis.fetch;

beforeEach(() => openBrowser({ url: "http://localhost:4173/" }));
afterEach(() => {
  closeBrowser();
  resetServerClock();
  globalThis.fetch = realFetch;
  localStorage.clear();
});

type AppView = Rendered<Record<string, never>>;

function goTo(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new window.Event("hashchange"));
  });
}

function seedSession(username: string, roles: string[] = ["ROLE_USER"]): void {
  sessionStorage.setItem("quizproject.session", JSON.stringify({
    accessToken: fakeToken(username, { roles }),
    tokenType: "Bearer",
    expiresAt: Date.now() + 900_000,
    username,
    roles
  }));
}

// Every screen loads the catalogue on the way past, so every stub needs it.
const CATALOGUE = {
  "GET /api/v1/quizzes": { body: [] },
  "GET /api/v1/quizzes/summary": { body: { totalQuizzes: 12, totalSubjects: 4 } }
};

async function open(hash: string, routes: Record<string, unknown> = {}): Promise<{
  view: AppView;
  stub: StubbedApi;
}> {
  const stub = stubApi({ ...CATALOGUE, ...routes } as Parameters<typeof stubApi>[0]);
  const view = render(App) as AppView;
  await settle();
  if (hash) {
    goTo(hash);
    await settle();
  }
  return { view, stub };
}

const fill = (view: AppView, values: Record<string, string>): void => {
  for (const [name, value] of Object.entries(values)) {
    type(view.find(`input[name=${name}]`), value);
  }
};

const alertText = (view: AppView): string => view.query("[role=alert]")?.textContent ?? "";

test("a registration is checked in the browser before it costs a request", async () => {
  const { view, stub } = await open("#/signup");

  fill(view, {
    firstName: "Олена", lastName: "Ковальчук", username: "olena",
    password: "Password1!", confirmPassword: "Password2!"
  });
  await submit(view.find("form"));
  assert.equal(alertText(view), "Паролі не збігаються.");
  assert.equal(stub.countOf("POST /api/v1/auth/register"), 0,
    "a mismatched pair of passwords was sent to the API to be rejected there");

  // A space in a password is accepted by the field and refused by the API's
  // own pattern, so it is caught here rather than returned as a 400.
  fill(view, { password: "Pass word1", confirmPassword: "Pass word1" });
  await submit(view.find("form"));
  assert.equal(alertText(view), "Пароль не повинен містити пробіли.");
  assert.equal(stub.countOf("POST /api/v1/auth/register"), 0);
});

test("a registration sends the account as the API declares it, trimmed", async () => {
  const { view, stub } = await open("#/signup", {
    "POST /api/v1/auth/register": loginResponse("olena")
  });

  fill(view, {
    firstName: "  Олена  ", lastName: "  Ковальчук  ", username: "  olena  ",
    password: "Password1!", confirmPassword: "Password1!"
  });
  await submit(view.find("form"));

  assert.deepEqual(stub.lastOf("POST /api/v1/auth/register")?.body, {
    username: "olena", firstName: "Олена", lastName: "Ковальчук", password: "Password1!"
  });
  assert.equal(String(window.location.hash || "#/"), "#/quizzes",
    "a new account was left on the registration form");
  assert.match(view.text(), /Вітаємо/);
});

test("a login already taken is named as taken, not as a server failure", async () => {
  const { view } = await open("#/signup", {
    "POST /api/v1/auth/register": { status: 409, body: { message: "Duplicate" } }
  });

  fill(view, {
    firstName: "Олена", lastName: "Ковальчук", username: "olena",
    password: "Password1!", confirmPassword: "Password1!"
  });
  await submit(view.find("form"));
  assert.equal(alertText(view), "Цей логін уже зайнятий. Оберіть інший.");

  // Anything else is reported as the API worded it, which is the only thing
  // that could tell the reader what actually went wrong.
  const { view: broken } = await open("#/signup", {
    "POST /api/v1/auth/register": { status: 500, body: { message: "База даних недоступна." } }
  });
  fill(broken, {
    firstName: "Олена", lastName: "Ковальчук", username: "olena",
    password: "Password1!", confirmPassword: "Password1!"
  });
  await submit(broken.find("form"));
  assert.equal(alertText(broken), "База даних недоступна.");
});

test("a rejected sign-in blames the credentials, and only the credentials", async () => {
  for (const status of [401, 403]) {
    const { view } = await open("#/login", {
      "POST /api/v1/auth/login": { status, body: {} }
    });
    type(view.find("input[name=username]"), "olena");
    type(view.find("input[name=password]"), "wrong");
    await submit(view.find("form"));
    assert.equal(alertText(view), "Невірний логін або пароль.", `${status} was worded as something else`);
  }

  // A support code is the one thing that makes a 500 actionable, so it is
  // carried into the message rather than logged where nobody will look.
  const { view } = await open("#/login", {
    "POST /api/v1/auth/login": {
      status: 500, body: { message: "Внутрішня помилка." }
    }
  });
  type(view.find("input[name=username]"), "olena");
  type(view.find("input[name=password]"), "Password1!");
  await submit(view.find("form"));
  assert.match(alertText(view), /Внутрішня помилка\./);
});

test("a quiz chosen while signed out is started the moment the reader signs in", async () => {
  const { view, stub } = await open("", {
    "GET /api/v1/quizzes": {
      body: [{ id: 7, name: "Java", subject: "Програмування", complexity: "medium", totalQuestions: 3, timeToPassMinutes: 30 }]
    },
    "POST /api/v1/auth/login": loginResponse("olena"),
    "POST /api/v1/quizzes/7/attempts": {
      body: {
        attemptId: 4, quizId: 7, completed: false,
        expiresAt: new Date(Date.now() + 1_800_000).toISOString(), questions: []
      }
    }
  });

  click(view.find(".quiz-card button"));
  await settle();
  assert.equal(window.location.hash, "#/login", "a stranger was allowed to start an attempt");

  type(view.find("input[name=username]"), "olena");
  type(view.find("input[name=password]"), "Password1!");
  await submit(view.find("form"));

  assert.equal(stub.countOf("POST /api/v1/quizzes/7/attempts"), 1,
    "the quiz the reader picked before signing in was forgotten");
  assert.equal(window.location.hash, "#/attempt/4");
});

test("changing a password is checked here, then signs the reader out", async () => {
  seedSession("olena");
  const { view, stub } = await open("#/profile", {
    "GET /api/v1/users/me": {
      body: {
        username: "olena", firstName: "Олена", lastName: "Ковальчук",
        role: "user", status: "active",
        registeredAt: "2026-01-15T10:00:00Z", lastLoginAt: "2026-03-01T09:00:00Z"
      }
    },
    "PUT /api/v1/users/me/password": { body: {} }
  });

  const passwordForm = (): Element => view.find(".profile-card--password form");
  fill(view, { currentPassword: "Password1!", newPassword: "Password2!", confirmPassword: "Password3!" });
  await submit(passwordForm());
  assert.equal(alertText(view), "Нові паролі не збігаються.");
  assert.equal(stub.countOf("PUT /api/v1/users/me/password"), 0);

  fill(view, { newPassword: "Pass word2", confirmPassword: "Pass word2" });
  await submit(passwordForm());
  assert.equal(alertText(view), "Новий пароль не повинен містити пробіли.");
  assert.equal(stub.countOf("PUT /api/v1/users/me/password"), 0);

  fill(view, { newPassword: "Password2!", confirmPassword: "Password2!" });
  await submit(passwordForm());
  assert.deepEqual(stub.lastOf("PUT /api/v1/users/me/password")?.body,
    { currentPassword: "Password1!", newPassword: "Password2!" });

  // The old token is no longer usable, so keeping the reader signed in with it
  // would be keeping them signed in with nothing.
  assert.equal(sessionStorage.getItem("quizproject.session"), null);
  assert.equal(window.location.hash, "#/login");
});

test("a refused password change says which of the two passwords was wrong", async () => {
  const cases: ReadonlyArray<readonly [status: number, message: string]> = [
    [400, "Поточний пароль неправильний."],
    [409, "Новий пароль має відрізнятися від поточного."]
  ];

  for (const [status, message] of cases) {
    seedSession("olena");
    const { view } = await open("#/profile", {
      "GET /api/v1/users/me": {
        body: {
          username: "olena", firstName: "Олена", lastName: "Ковальчук", role: "user",
          status: "active", registeredAt: "2026-01-15T10:00:00Z", lastLoginAt: null
        }
      },
      "PUT /api/v1/users/me/password": { status, body: {} }
    });

    fill(view, { currentPassword: "Password1!", newPassword: "Password2!", confirmPassword: "Password2!" });
    await submit(view.find(".profile-card--password form"));
    assert.equal(alertText(view), message);
    assert.notEqual(sessionStorage.getItem("quizproject.session"), null,
      `a ${status} signed the reader out of a session that is still valid`);
  }
});

test("a profile that will not load offers the reason and reloads on request", async () => {
  seedSession("olena");
  const { view, stub } = await open("#/profile", {
    "GET /api/v1/users/me": { status: 500, body: { message: "Профіль недоступний." } }
  });

  assert.match(view.text(), /Профіль недоступний/);
  click(view.find(".empty-state button"));
  await settle();
  assert.equal(stub.countOf("GET /api/v1/users/me"), 2, "the retry button asked nobody for anything");
});

test("results are loaded once for the reader, and reloaded when asked", async () => {
  seedSession("olena");
  const { view, stub } = await open("#/results", {
    "GET /api/v1/results/me": { status: 503, body: { message: "Сервіс недоступний." } }
  });

  assert.match(view.text(), /Сервіс недоступний/);
  click(view.find(".empty-state button"));
  await settle();
  assert.equal(stub.countOf("GET /api/v1/results/me"), 2);
});

test("an expired session on a protected page returns the reader to it after signing in", async () => {
  seedSession("olena");
  // Expired for the token the tab is holding, fine for the one signing in
  // brings back — which is what an expiry is, and what makes the return trip
  // worth checking rather than merely the redirect away.
  let expired = true;
  const { view } = await open("#/results", {
    "GET /api/v1/results/me": () => expired ? { status: 401, body: {} } : { body: [] },
    "POST /api/v1/auth/login": () => { expired = false; return loginResponse("olena"); }
  });

  // A 401 mid-session is the token expiring, not the reader doing anything
  // wrong: they are told so, and sent somewhere they can act on it.
  assert.equal(window.location.hash, "#/login");
  assert.match(view.text(), /Сесія завершилась/);
  assert.equal(sessionStorage.getItem("quizproject.session"), null);

  type(view.find("input[name=username]"), "olena");
  type(view.find("input[name=password]"), "Password1!");
  await submit(view.find("form"));
  assert.equal(window.location.hash, "#/results", "the reader was not returned to the page that turned them away");
});

const ADMIN_ROUTES = {
  "GET /api/v1/admin/subjects": { body: [{ id: 1, name: "Програмування" }] },
  "GET /api/v1/admin/levels": { body: [{ id: 5, name: "medium" }] },
  "GET /api/v1/admin/quizzes": { body: [] },
  "GET /api/v1/admin/users": { body: [] },
  "GET /api/v1/admin/results": { body: [] }
};

test("the administration panel loads its five collections in one pass", async () => {
  seedSession("olena", ["ROLE_ADMIN"]);
  const { view, stub } = await open("#/admin", ADMIN_ROUTES);

  for (const key of Object.keys(ADMIN_ROUTES)) {
    assert.equal(stub.countOf(key), 1, `${key} was requested ${stub.countOf(key)} times`);
  }
  assert.match(view.text(), /Керуйте платформою/);

  // Both paginated collections ask for the same page size the API defaults to,
  // so the first page is the same whether or not the client asked for one.
  assert.equal(stub.lastOf("GET /api/v1/admin/users")?.query.get("size"), "20");
  assert.equal(stub.lastOf("GET /api/v1/admin/results")?.query.get("size"), "20");
});

test("an administration page opened by a reader says what is missing, not that it broke", async () => {
  seedSession("olena");
  const { view } = await open("#/admin", {
    ...ADMIN_ROUTES,
    "GET /api/v1/admin/subjects": { status: 403, body: {} }
  });
  assert.match(view.text(), /потрібна роль адміністратора/);
});

test("an administrative change reloads the panel and says so", async () => {
  seedSession("olena", ["ROLE_ADMIN"]);
  const { view, stub } = await open("#/admin", {
    ...ADMIN_ROUTES,
    "POST /api/v1/admin/subjects": { body: { id: 2, name: "Математика" } }
  });

  type(view.find(".admin-inline-form input"), "Математика");
  await submit(view.find("form.admin-inline-form"));

  assert.equal(stub.countOf("POST /api/v1/admin/subjects"), 1);
  assert.equal(stub.countOf("GET /api/v1/admin/subjects"), 2, "the panel still shows what it showed before the change");
  assert.match(view.text(), /Предмет додано/);
});

test("an administrative change that failed is reported and changes nothing", async () => {
  seedSession("olena", ["ROLE_ADMIN"]);
  const { view, stub } = await open("#/admin", {
    ...ADMIN_ROUTES,
    "POST /api/v1/admin/subjects": { status: 409, body: { message: "Такий предмет уже є." } }
  });

  type(view.find(".admin-inline-form input"), "Програмування");
  await submit(view.find("form.admin-inline-form"));

  assert.match(view.text(), /Такий предмет уже є/);
  assert.equal(stub.countOf("GET /api/v1/admin/subjects"), 1, "a failed change reloaded the panel anyway");
  assert.equal(view.find<HTMLInputElement>(".admin-inline-form input").value, "Програмування");
});

test("paging the panel asks for the page, not for the whole collection again", async () => {
  seedSession("olena", ["ROLE_ADMIN"]);
  const { view, stub } = await open("#/admin", {
    ...ADMIN_ROUTES,
    "GET /api/v1/admin/users": {
      body: [{ id: 3, username: "olena", role: "user", status: "active" }]
    }
  });

  // The stub answers without the X-Page-* headers, so the pager is not
  // rendered; the page state is still what drives the request, and changing it
  // is what this checks.
  assert.equal(stub.lastOf("GET /api/v1/admin/users")?.query.get("page"), "0");

  const [from] = view.findAll<HTMLInputElement>(".admin-date-filter input");
  type(from, "2026-03-01T00:00");
  await settle();

  const last = stub.lastOf("GET /api/v1/admin/results");
  assert.ok(String(last?.query.get("from")).startsWith("2026-0"),
    `the date range never reached the request: ${String(last?.query.get("from"))}`);
  assert.equal(last?.query.get("page"), "0", "a narrower range kept a page number that may no longer exist");
});

test("the settings screen reports what it found at the address it was given", async () => {
  const { view, stub } = await open("#/settings", {
    "GET /actuator/health": { body: { status: "UP" } }
  });

  click(view.find("button[type=button]"));
  await settle();
  assert.equal(view.find(".connection-state").textContent, "API доступний");
  assert.equal(stub.countOf("GET /actuator/health"), 1);

  // An API that answers but is not UP is not a working API, and saying "no
  // connection" would send the reader looking for a network fault.
  const { view: down } = await open("#/settings", {
    "GET /actuator/health": { body: { status: "DOWN" } }
  });
  click(down.find("button[type=button]"));
  await settle();
  assert.equal(down.find(".connection-state").textContent, "Немає з’єднання");
  assert.match(down.text(), /стан не UP/);
});

test("an address that cannot be an API address is refused before it is saved", async () => {
  const { view } = await open("#/settings", {});

  type(view.find("input[name=apiUrl]"), "ftp://example.com");
  await submit(view.find("form"));

  assert.match(view.text(), /HTTP/);
  assert.equal(localStorage.getItem("quizproject.apiUrl"), null,
    "an address the client cannot use was written down anyway");
});

test("a saved address is written down, confirmed, and used from then on", async () => {
  const { view, stub } = await open("#/settings", {
    "GET /actuator/health": { body: { status: "UP" } }
  });

  type(view.find("input[name=apiUrl]"), "https://api.example.com/");
  await submit(view.find("form"));

  // Normalised on the way in: the trailing slash would otherwise produce
  // double-slashed paths in every request built from it.
  assert.equal(localStorage.getItem("quizproject.apiUrl"), "https://api.example.com");
  assert.match(view.text(), /Адресу API збережено/);
  assert.equal(stub.lastOf("GET /actuator/health")?.path, "/actuator/health");
});

test("an address changed in another tab is picked up in this one", async () => {
  const { view } = await open("", {});
  localStorage.setItem("quizproject.apiUrl", "https://other.example.com");

  await act(async () => {
    window.dispatchEvent(Object.assign(new window.Event("storage"), { key: "quizproject.apiUrl" }));
    await Promise.resolve();
  });
  await settle();

  goTo("#/settings");
  await settle();
  assert.equal(view.find<HTMLInputElement>("input[name=apiUrl]").value, "https://other.example.com");

  // An event for some other key is not this app's business.
  localStorage.setItem("quizproject.apiUrl", "https://third.example.com");
  await act(async () => {
    window.dispatchEvent(Object.assign(new window.Event("storage"), { key: "theme" }));
    await Promise.resolve();
  });
  await settle();
  assert.equal(view.find<HTMLInputElement>("input[name=apiUrl]").value, "https://other.example.com");
});

test("each page names itself in the tab, and an unknown one is still named", async () => {
  const titles: ReadonlyArray<readonly [hash: string, title: string]> = [
    ["#/", "Quiz Project — Quiz Project"],
    ["#/quizzes", "Тести — Quiz Project"],
    ["#/login", "Вхід — Quiz Project"],
    ["#/signup", "Реєстрація — Quiz Project"],
    ["#/settings", "Налаштування — Quiz Project"],
    ["#/nowhere", "Сторінка — Quiz Project"]
  ];

  const { view } = await open("", {});
  for (const [hash, title] of titles) {
    goTo(hash);
    await settle();
    assert.equal(document.title, title, `${hash} was titled "${document.title}"`);
  }
  assert.match(view.text(), /Цієї сторінки немає/, "an unknown route rendered something other than the 404 page");
});

test("the home page still works when the totals endpoint does not", async () => {
  // web and api deploy separately, so an API without /summary is a real state
  // to be in — and the two figures it feeds are worth degrading for, not
  // failing for.
  const { view } = await open("", {
    "GET /api/v1/quizzes/summary": { status: 404, body: {} }
  });
  assert.match(view.text(), /Обери тему|Перевір/, "the home page failed along with its totals");
  assert.doesNotMatch(view.text(), /undefined/);
});

test("a toast says its piece and then goes away on its own", async () => {
  seedSession("olena");
  const { view } = await open("", {});
  assert.equal(view.findAll(".toast").length, 0);

  click(view.find(".site-header button"));
  await settle();
  assert.equal(view.findAll(".toast").length, 1);
  assert.match(view.text(), /Ви вийшли з облікового запису/);

  // 4200ms is the app's own lifetime for one. Waited out rather than mocked,
  // because a fake clock here would test the mock rather than the timeout.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 4400)); });
  assert.equal(view.findAll(".toast").length, 0, "the toast is still on screen");
});

// The bug this pins: an attempt that failed to load was requested again, and
// again, about seventeen hundred times a second for as long as the page stayed
// open. The effect asked whether the attempt was loaded and whether a request
// was in flight, and never whether the last one had already failed — so the
// failure clearing the in-flight flag was itself the trigger for the next
// request. The catalogue's loader was written with that guard; three others
// were not.
//
// One request each, from a page a reader can leave. The retry that follows is
// the reader asking for it.
test("a failed load is not retried until somebody asks for it", async () => {
  const failing = { status: 500, body: { message: "База даних недоступна." } };
  const cases: ReadonlyArray<readonly [hash: string, key: string, retriable: boolean]> = [
    ["#/profile", "GET /api/v1/users/me", true],
    ["#/results", "GET /api/v1/results/me", true],
    ["#/quizzes", "GET /api/v1/quizzes", true],
    ["#/admin", "GET /api/v1/admin/subjects", true],
    // The attempt page offers a way back to the catalogue rather than a retry:
    // an attempt that cannot be loaded is usually one that is not the reader's
    // or no longer exists.
    ["#/attempt/4", "GET /api/v1/attempts/4", false]
  ];

  for (const [hash, key, retriable] of cases) {
    // Opened directly at the page rather than navigated to it: arriving from
    // the home page is a second, legitimate request — the query changed — and
    // it would hide the one this test is counting.
    closeBrowser();
    openBrowser({ url: `http://localhost:4173/${hash}` });
    seedSession("olena", ["ROLE_ADMIN"]);
    const { view, stub } = await open("", {
      ...ADMIN_ROUTES,
      "GET /api/v1/quizzes": failing,
      "GET /api/v1/quizzes/summary": failing,
      "GET /api/v1/users/me": failing,
      "GET /api/v1/results/me": failing,
      "GET /api/v1/attempts/4": failing,
      "GET /api/v1/admin/subjects": failing
    });

    // Twice, because one pass would not tell a loop from a request that simply
    // has not come back yet.
    await settle();
    await settle();
    assert.equal(stub.countOf(key), 1, `${hash} asked for ${key} ${stub.countOf(key)} times after one failure`);
    assert.match(view.text(), /База даних недоступна|потрібна роль/,
      `${hash} failed without saying why`);

    const retry = view.query(".empty-state button");
    assert.equal(Boolean(retry), retriable, `${hash} disagrees about offering a retry`);
    if (retry) {
      click(retry);
      await settle();
      await settle();
      assert.equal(stub.countOf(key), 2, `${hash} did not retry exactly once when asked`);
    }
  }
});
