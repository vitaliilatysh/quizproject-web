import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import App from "../src/App.jsx";
import { resetServerClock } from "../src/clock.js";
import { fakeToken, loginResponse, stubApi } from "./support/api-stub.mjs";
import { act, click, closeBrowser, openBrowser, render, settle, type } from "./support/dom.mjs";

const realFetch = globalThis.fetch;

beforeEach(() => openBrowser({ url: "http://localhost:4173/" }));
afterEach(() => {
  closeBrowser();
  resetServerClock();
  globalThis.fetch = realFetch;
});

const ANSWERS = attemptId => `quizproject.answers.${attemptId}`;

function goTo(hash) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new window.Event("hashchange"));
  });
}

function seedSession(username, { roles = ["ROLE_USER"], expiresInMs = 900_000 } = {}) {
  sessionStorage.setItem("quizproject.session", JSON.stringify({
    accessToken: fakeToken(username, { roles }),
    tokenType: "Bearer",
    expiresAt: Date.now() + expiresInMs,
    username,
    roles
  }));
}

async function signIn(view, username, password = "Password1!") {
  type(view.find("input[name=username]"), username);
  type(view.find("input[name=password]"), password);
  await act(async () => {
    view.find("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
}

// Built when the request arrives, not when the stub is declared. The API stamps
// an attempt's deadline as it hands the attempt over, and a body frozen at
// declaration time would instead start the clock before the app has even
// rendered — spending the window on setup and leaving the deadline test to race
// its own preamble on a slow machine.
const attemptBody = (attemptId, { minutes = 30 } = {}) => () => ({
  body: {
    attemptId, quizId: 7, completed: false,
    expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    questions: [{
      id: 11, text: "Що таке JVM?",
      answers: [{ id: 101, text: "Віртуальна машина" }, { id: 102, text: "Компілятор" }]
    }]
  }
});

const CATALOGUE = {
  "GET /api/v1/quizzes": { body: [] },
  "GET /api/v1/quizzes/summary": { body: { totalQuizzes: 0, totalSubjects: 0 } }
};

// The bug this pins had a fix, and then the fix had a bug, so both directions
// are here. Handing the tab to a different person must drop what the last one
// left; a session simply expiring must not, because the reader is coming back.
test("signing in as somebody else drops the previous reader's answers", async () => {
  stubApi({
    ...CATALOGUE,
    "POST /api/v1/auth/login": loginResponse("borys")
  });

  seedSession("olena");
  sessionStorage.setItem(ANSWERS(4), JSON.stringify([101, 102]));

  const view = render(App);
  await settle();

  // Olena's own session is still the one in the tab, so her draft stands.
  assert.notEqual(sessionStorage.getItem(ANSWERS(4)), null, "the draft was cleared before anyone else signed in");

  goTo("#/login");
  await signIn(view, "borys");

  assert.equal(sessionStorage.getItem(ANSWERS(4)), null,
    "Borys can still see the answers Olena selected");
});

test("a session that expires keeps the reader's answers for their return", async () => {
  stubApi({
    ...CATALOGUE,
    "GET /api/v1/results/me": { status: 401, body: { message: "expired" } }
  });

  seedSession("olena");
  sessionStorage.setItem(ANSWERS(4), JSON.stringify([101, 102]));

  const view = render(App);
  await settle();

  goTo("#/results");
  await settle();

  // The 401 signs her out and sends her to the form — with the draft intact,
  // because she is the one coming back to it.
  assert.equal(sessionStorage.getItem("quizproject.session"), null, "the expired session was kept");
  assert.equal(window.location.hash, "#/login");
  assert.equal(sessionStorage.getItem(ANSWERS(4)), JSON.stringify([101, 102]),
    "an interrupted reader lost the answers they had already chosen");
  assert.match(view.text(), /Продовжити навчання/);
});

test("signing out is not a handover either", async () => {
  stubApi(CATALOGUE);

  seedSession("olena");
  sessionStorage.setItem(ANSWERS(4), JSON.stringify([101]));

  const view = render(App);
  await settle();

  click(view.findAll("button").find(button => button.textContent === "Вийти"));
  await settle();

  assert.equal(sessionStorage.getItem("quizproject.session"), null);
  assert.equal(sessionStorage.getItem(ANSWERS(4)), JSON.stringify([101]),
    "signing out threw away a draft the same reader can still come back to");
});

test("a handover drops the attempt the API would refuse to reload", async () => {
  const api = stubApi({
    ...CATALOGUE,
    "GET /api/v1/attempts/4": attemptBody(4),
    "POST /api/v1/auth/login": loginResponse("borys")
  });

  seedSession("olena");
  const view = render(App);
  await settle();

  goTo("#/attempt/4");
  await settle();
  assert.equal(api.countOf("GET /api/v1/attempts/4"), 1);
  assert.match(view.text(), /Що таке JVM/);

  goTo("#/login");
  await signIn(view, "borys");

  // Cached under Olena, the attempt would have been rendered to Borys without a
  // request — the route effect skips loading whatever is already in hand.
  goTo("#/attempt/4");
  await settle();
  assert.equal(api.countOf("GET /api/v1/attempts/4"), 2,
    "the second reader was shown the first reader's attempt from cache");
});

// The token this app holds is refreshed silently, and the reader is very likely
// to be mid-quiz when it happens — under the fifteen-second TTL the E2E suite
// runs with, every few seconds. Each refresh mints a new session object for the
// same person, so the account-handover effect is keyed on the login rather than
// on the session: keyed on the session, every refresh would read as a different
// reader taking over the tab, and would throw away the answers of the one still
// sitting in front of it.
//
// Driven through the app's own timer and request rather than by poking state,
// because what is under test is what setSession then triggers. It costs the
// five seconds that timer floors at, which is why it is the only test here that
// waits on a clock. Watched from the catalogue rather than the attempt page: a
// wrongly-cleared attempt is immediately refetched, and the refetch would mask
// exactly the clearing this is looking for.
test("a refreshed token is not a different reader", async () => {
  const refreshed = loginResponse("olena");
  const api = stubApi({
    ...CATALOGUE,
    "POST /api/v1/auth/refresh": refreshed
  });

  // Expiring inside the refresh margin, so the timer takes its 5s floor.
  seedSession("olena", { expiresInMs: 61_000 });
  const before = JSON.parse(sessionStorage.getItem("quizproject.session")).accessToken;
  sessionStorage.setItem(ANSWERS(4), JSON.stringify([101, 102]));

  const view = render(App);
  await settle();
  goTo("#/quizzes");
  await settle();

  await act(async () => { await new Promise(resolve => setTimeout(resolve, 5600)); });
  await settle();

  assert.equal(api.countOf("POST /api/v1/auth/refresh"), 1,
    "the refresh never ran, so this test proves nothing about it");

  // The request alone is not the transition under test. Were the app to stop
  // installing what came back, everything below would still hold — same login,
  // same draft, same name on screen — and this test would pass without the
  // session ever having been replaced. So: the stored token is the new one.
  const after = JSON.parse(sessionStorage.getItem("quizproject.session"));
  assert.notEqual(after.accessToken, before, "the refreshed token was never installed");
  assert.equal(after.accessToken, refreshed.body.accessToken);
  assert.equal(after.username, "olena", "the refresh did not leave a usable session behind");
  assert.equal(sessionStorage.getItem(ANSWERS(4)), JSON.stringify([101, 102]),
    "a silent token refresh threw away the reader's draft");
  assert.match(view.text(), /olena/, "the refresh signed the reader out");
});

// Weaker than it looks, and worth saying so: a plain re-render cannot reproduce
// the bug this guards the ground of. That one was a race — the controlled Set
// was rebuilt inline, so a click landing during a concurrent re-render was
// reverted before React committed it — and a Set rebuilt with the same contents
// still renders the same ticks, so no assertion on the DOM can tell the two
// apart. What this does pin is that the tick is held in state and survives
// renders it did not cause; the race itself stays covered by the E2E suite.
test("a ticked answer survives renders it did not cause", async () => {
  stubApi({
    ...CATALOGUE,
    "GET /api/v1/attempts/4": attemptBody(4)
  });

  seedSession("olena");
  const view = render(App);
  await settle();
  goTo("#/attempt/4");
  await settle();

  click(view.findAll("input[type=checkbox]")[0]);
  view.rerender({});
  view.rerender({});
  await settle();

  assert.equal(view.findAll("input[type=checkbox]")[0].checked, true);
});

// Leaving the attempt and coming back mounts the page afresh, with no selection
// in state: the ticks have to come back off what was written down.
test("a reader who navigates away and back finds the page as they left it", async () => {
  stubApi({
    ...CATALOGUE,
    "GET /api/v1/attempts/4": attemptBody(4)
  });

  seedSession("olena");
  const view = render(App);
  await settle();
  goTo("#/attempt/4");
  await settle();

  click(view.findAll("input[type=checkbox]")[1]);
  await settle();

  goTo("#/quizzes");
  await settle();
  assert.equal(view.findAll("input[type=checkbox]").length, 0);

  goTo("#/attempt/4");
  await settle();
  const boxes = view.findAll("input[type=checkbox]");
  assert.equal(boxes[0].checked, false);
  assert.equal(boxes[1].checked, true, "the answer chosen before leaving was lost");
});

test("a ticked answer is written down, and unticking takes it back", async () => {
  stubApi({
    ...CATALOGUE,
    "GET /api/v1/attempts/4": attemptBody(4)
  });

  seedSession("olena");
  const view = render(App);
  await settle();
  goTo("#/attempt/4");
  await settle();

  click(view.findAll("input[type=checkbox]")[0]);
  await settle();
  assert.deepEqual(JSON.parse(sessionStorage.getItem(ANSWERS(4))), [101]);

  click(view.findAll("input[type=checkbox]")[1]);
  await settle();
  assert.deepEqual(JSON.parse(sessionStorage.getItem(ANSWERS(4))), [101, 102]);

  click(view.findAll("input[type=checkbox]")[0]);
  await settle();
  assert.deepEqual(JSON.parse(sessionStorage.getItem(ANSWERS(4))), [102]);
});

test("a reader who reopens a paused attempt finds their answers still ticked", async () => {
  stubApi({
    ...CATALOGUE,
    "GET /api/v1/attempts/4": attemptBody(4)
  });

  seedSession("olena");
  sessionStorage.setItem(ANSWERS(4), JSON.stringify([102]));

  const view = render(App);
  await settle();
  goTo("#/attempt/4");
  await settle();

  const boxes = view.findAll("input[type=checkbox]");
  assert.equal(boxes[0].checked, false);
  assert.equal(boxes[1].checked, true, "a saved answer was not restored");
});

test("submitting asks first, and does not submit when the answer is no", async () => {
  const api = stubApi({
    ...CATALOGUE,
    "GET /api/v1/attempts/4": attemptBody(4),
    "POST /api/v1/attempts/4/complete": { body: { attemptId: 4, score: 100 } }
  });

  seedSession("olena");
  const view = render(App);
  await settle();
  goTo("#/attempt/4");
  await settle();
  click(view.findAll("input[type=checkbox]")[0]);

  const asked = [];
  window.confirm = message => { asked.push(message); return false; };
  click(view.find(".attempt-submit button"));
  await settle();

  assert.equal(asked.length, 1);
  assert.match(asked[0], /1 вибраних відповідей/, "the reader was not told what they were sending");
  assert.equal(api.countOf("POST /api/v1/attempts/4/complete"), 0,
    "the attempt was submitted after the reader said no");

  window.confirm = () => true;
  click(view.find(".attempt-submit button"));
  await settle();

  assert.equal(api.countOf("POST /api/v1/attempts/4/complete"), 1);
  assert.deepEqual(api.lastOf("POST /api/v1/attempts/4/complete").body, { answerIds: [101] });
  assert.match(view.text(), /Ваш результат/);
  assert.equal(sessionStorage.getItem(ANSWERS(4)), null, "a submitted draft was left behind");
});

// The deadline submits without asking: there is nobody there to answer, and a
// dialog would hold the answers until the attempt expired — the thing automatic
// submission exists to prevent.
test("the deadline submits by itself, and does not stop to ask", async () => {
  const api = stubApi({
    ...CATALOGUE,
    "GET /api/v1/attempts/4": attemptBody(4, { minutes: 0.08 }),
    "POST /api/v1/attempts/4/complete": { body: { attemptId: 4, score: 100 } }
  });

  seedSession("olena");
  // Counted rather than thrown from: this runs inside a timer, and an exception
  // there escapes the test that caused it and lands on whichever one is running
  // when it surfaces.
  let asked = 0;
  window.confirm = () => { asked += 1; return true; };

  const view = render(App);
  await settle();
  goTo("#/attempt/4");
  await settle();
  click(view.findAll("input[type=checkbox]")[0]);
  assert.equal(api.countOf("POST /api/v1/attempts/4/complete"), 0, "it submitted before the deadline");

  // 4.8 seconds of quiz from the moment the API handed it over, less the
  // three-second head start: the timer is due 1.8s after the fetch, and only a
  // settle and a click stand between the two. Waiting past it rather than up to
  // it, so a slow machine is late rather than wrong.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 2400)); });
  await settle();

  assert.equal(asked, 0, "the deadline stopped to ask a question nobody was there to answer");
  assert.equal(api.countOf("POST /api/v1/attempts/4/complete"), 1,
    "the deadline passed and the attempt stayed open");
  assert.deepEqual(api.lastOf("POST /api/v1/attempts/4/complete").body, { answerIds: [101] },
    "the answer chosen before the deadline did not go with it");
  assert.match(view.text(), /Ваш результат/);
});

test("a guarded route sends a stranger to sign in, and remembers where they were", async () => {
  stubApi(CATALOGUE);

  const view = render(App);
  await settle();

  goTo("#/results");
  await settle();

  assert.equal(window.location.hash, "#/login");
  assert.match(view.text(), /Продовжити навчання/);
  assert.equal(sessionStorage.getItem("quizproject.returnTo"), "#/results");
});

test("signing in returns the reader to the page that turned them away", async () => {
  stubApi({
    ...CATALOGUE,
    "POST /api/v1/auth/login": loginResponse("olena"),
    "GET /api/v1/results/me": { body: [] }
  });

  const view = render(App);
  await settle();

  goTo("#/results");
  await settle();
  await signIn(view, "olena");

  assert.equal(window.location.hash, "#/results");
  assert.equal(sessionStorage.getItem("quizproject.returnTo"), null,
    "the remembered page was not consumed, so the next sign-in would go there too");
});

test("the administration screen is offered to an administrator and refused to a reader", async () => {
  stubApi(CATALOGUE);

  seedSession("olena", { roles: ["ROLE_USER"] });
  const view = render(App);
  await settle();
  assert.equal(view.findAll("a").filter(a => a.textContent === "Адміністрування").length, 0);
  view.unmount();

  seedSession("root", { roles: ["ROLE_USER", "ROLE_ADMIN"] });
  const admin = render(App);
  await settle();
  assert.equal(admin.findAll("a").filter(a => a.textContent === "Адміністрування").length, 1);
});

test("a bad attempt number is refused without asking the API about it", async () => {
  const api = stubApi(CATALOGUE);

  seedSession("olena");
  const view = render(App);
  await settle();

  goTo("#/attempt/nonsense");
  await settle();

  assert.match(view.text(), /Некоректний номер спроби/);
  assert.equal(api.calls.filter(call => call.path.startsWith("/api/v1/attempts")).length, 0,
    "the API was asked about an attempt that cannot exist");
});
