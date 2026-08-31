import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import {
  AttemptPage, HomePage, Layout, QuizCollection, QuizzesPage, ResultsPage
} from "../src/components.jsx";
import { resetServerClock } from "../src/clock.js";
import { click, closeBrowser, openBrowser, render } from "./support/dom.mjs";

beforeEach(() => openBrowser());
afterEach(() => { closeBrowser(); resetServerClock(); });

const quiz = (over = {}) => ({
  id: 7, name: "Java", subject: "Програмування",
  complexity: "medium", totalQuestions: 12, timeToPassMinutes: 30, ...over
});

const collection = (over = {}) => ({
  quizzes: [quiz()], loading: false, error: "", limit: 0, busy: null,
  onRetry: () => {}, onStart: () => {}, ...over
});

// The one that shipped: "advanced" was in the filter's list of levels but in no
// map of labels, so the hardest quiz the database holds was found by the
// "Просунутий" button and then drawn with the raw English word on the green
// badge that means "easiest" — a card contradicting the filter that produced it.
// Every level the database seeds is checked here, not just the one that broke.
test("a quiz card names its difficulty in the reader's language", () => {
  const expected = [
    ["low", "Початковий", "pill--green"],
    ["medium", "Середній", "pill--blue"],
    ["high", "Просунутий", "pill--coral"],
    ["advanced", "Просунутий", "pill--coral"]
  ];

  for (const [complexity, label, tone] of expected) {
    const view = render(QuizCollection, collection({ quizzes: [quiz({ complexity })] }));
    const badge = view.find(".pill");
    assert.equal(badge.textContent, label, `${complexity} was labelled ${badge.textContent}`);
    assert.ok(badge.className.includes(tone), `${complexity} got ${badge.className}`);
    view.unmount();
  }
});

// A level nobody has translated yet is shown as it is, which is how someone
// notices a new one was seeded. Only an absent level reads as "not stated" —
// the distinction matters, because the bug above looked exactly like the first
// case while being the second.
test("an untranslated difficulty is shown, a missing one is named as missing", () => {
  const shown = render(QuizCollection, collection({ quizzes: [quiz({ complexity: "sudden" })] }));
  assert.equal(shown.find(".pill").textContent, "sudden");
  assert.ok(shown.find(".pill").className.includes("pill--green"));
  shown.unmount();

  for (const missing of [null, undefined, ""]) {
    const view = render(QuizCollection, collection({ quizzes: [quiz({ complexity: missing })] }));
    assert.equal(view.find(".pill").textContent, "Не вказано", `${String(missing)} was not treated as missing`);
    view.unmount();
  }
});

test("the catalogue distinguishes loading, failure and emptiness", () => {
  const loading = render(QuizCollection, collection({ quizzes: null, loading: true, limit: 4 }));
  assert.equal(loading.findAll(".skeleton-card").length, 4);
  assert.equal(loading.findAll(".quiz-card:not(.skeleton-card)").length, 0);
  loading.unmount();

  let retried = 0;
  const failed = render(QuizCollection, collection({ error: "API не відповідає", onRetry: () => { retried += 1; } }));
  assert.match(failed.text(), /API не відповідає/);
  click(failed.find(".button--dark"));
  assert.equal(retried, 1, "the retry button does not retry");
  failed.unmount();

  // Empty is not the same as failed, and neither is the same as still loading:
  // three states that a single "no cards" check would confuse.
  const empty = render(QuizCollection, collection({ quizzes: [] }));
  assert.match(empty.text(), /Нічого не знайдено/);
  assert.equal(empty.findAll(".skeleton-card").length, 0);
});

test("the home page teases a limited number of quizzes, the catalogue does not", () => {
  const many = Array.from({ length: 9 }, (_, index) => quiz({ id: index + 1, name: `Тест ${index + 1}` }));

  const teased = render(QuizCollection, collection({ quizzes: many, limit: 3 }));
  assert.equal(teased.findAll(".quiz-card").length, 3);
  assert.ok(teased.find(".quiz-card").className.includes("quiz-card--compact"));
  teased.unmount();

  const full = render(QuizCollection, collection({ quizzes: many, limit: 0 }));
  assert.equal(full.findAll(".quiz-card").length, 9);
});

test("starting a quiz reports which quiz, and says so while it is working", () => {
  const started = [];
  const view = render(QuizCollection, collection({
    quizzes: [quiz({ id: 4 }), quiz({ id: 9, name: "SQL" })],
    onStart: id => started.push(id)
  }));

  click(view.findAll(".quiz-card button")[1]);
  assert.deepEqual(started, [9], "the wrong card's id was reported");

  view.rerender(collection({ quizzes: [quiz({ id: 4 })], busy: "start-4" }));
  const button = view.find(".quiz-card button");
  assert.match(button.textContent, /Створюємо спробу/);
  assert.equal(button.disabled, true, "a second click could open a second attempt");
});

// X-Total-Count counts every match; the page in front of the reader holds at
// most `size` of them. Showing the page's length as the total is the mistake
// this pins.
test("the catalogue counts every match, not the page in front of you", () => {
  const view = render(QuizzesPage, {
    quizzes: [quiz(), quiz({ id: 8 })],
    pageMeta: { number: 1, size: 2, totalCount: 47, totalPages: 24 },
    loading: false, error: "", busy: null, search: "", filter: "all",
    onSearch: () => {}, onFilter: () => {}, onPageChange: () => {},
    onRetry: () => {}, onStart: () => {}
  });

  assert.match(view.find(".catalog-count").textContent, /^47 /);
  assert.match(view.find(".pager__status").textContent, /3–4 з 47/);
});

test("paging stops at both ends and reports the page it is asking for", () => {
  const asked = [];
  const page = number => ({
    quizzes: [quiz()], pageMeta: { number, size: 10, totalCount: 30, totalPages: 3 },
    loading: false, error: "", busy: null, search: "", filter: "all",
    onSearch: () => {}, onFilter: () => {}, onPageChange: n => asked.push(n),
    onRetry: () => {}, onStart: () => {}
  });

  const view = render(QuizzesPage, page(0));
  const [back, next] = view.findAll(".pager button");
  assert.equal(back.disabled, true, "there is no page before the first");
  click(next);
  assert.deepEqual(asked, [1]);

  view.rerender(page(2));
  const ends = view.findAll(".pager button");
  assert.equal(ends[1].disabled, true, "there is no page after the last");
  click(ends[0]);
  assert.deepEqual(asked, [1, 1]);
});

test("a single page of results is not worth a pager", () => {
  const view = render(QuizzesPage, {
    quizzes: [quiz()], pageMeta: { number: 0, size: 10, totalCount: 4, totalPages: 1 },
    loading: false, error: "", busy: null, search: "", filter: "all",
    onSearch: () => {}, onFilter: () => {}, onPageChange: () => {},
    onRetry: () => {}, onStart: () => {}
  });
  assert.equal(view.find(".pager"), null);
});

test("the header shows administration only to administrators", () => {
  const shell = (session, route = { name: "home", params: [] }) => ({
    route, session, onLogout: () => {}, toasts: [], children: null
  });

  const anonymous = render(Layout, shell(null));
  assert.equal(anonymous.find(".account-name"), null);
  assert.equal(anonymous.findAll("a").filter(a => a.textContent === "Адміністрування").length, 0);
  anonymous.unmount();

  const reader = render(Layout, shell({ username: "olena", roles: ["ROLE_USER"] }));
  assert.equal(reader.find(".account-name").textContent, "olena");
  assert.equal(reader.find(".avatar").textContent, "O");
  assert.equal(reader.findAll("a").filter(a => a.textContent === "Адміністрування").length, 0,
    "a reader was offered the administration screen");
  reader.unmount();

  const admin = render(Layout, shell({ username: "root", roles: ["ROLE_USER", "ROLE_ADMIN"] }));
  assert.equal(admin.findAll("a").filter(a => a.textContent === "Адміністрування").length, 1);
});

test("an attempt keeps the catalogue tab lit, since that is where it came from", () => {
  const view = render(Layout, {
    route: { name: "attempt", params: ["12"] }, session: { username: "olena", roles: [] },
    onLogout: () => {}, toasts: [], children: null
  });
  const active = view.findAll(".main-nav a").filter(a => a.className.includes("is-active"));
  assert.equal(active.length, 1);
  assert.equal(active[0].textContent, "Тести");
});

test("signing out is offered only to someone signed in, and reports the press", () => {
  let signedOut = 0;
  const view = render(Layout, {
    route: { name: "home", params: [] }, session: { username: "olena", roles: [] },
    onLogout: () => { signedOut += 1; }, toasts: [], children: null
  });
  click(view.findAll("button").find(button => button.textContent === "Вийти"));
  assert.equal(signedOut, 1);

  view.rerender({
    route: { name: "home", params: [] }, session: null,
    onLogout: () => {}, toasts: [], children: null
  });
  assert.equal(view.findAll("button").filter(b => b.textContent === "Вийти").length, 0);
});

test("results are averaged over every attempt, and the best is the best", () => {
  const view = render(ResultsPage, {
    results: [
      { attemptId: 1, quizId: 3, quizName: "Java", score: 90, completedAt: "2026-03-01T10:00:00Z" },
      { attemptId: 2, quizId: 3, quizName: "Java", score: 40, completedAt: "2026-03-02T10:00:00Z" },
      { attemptId: 3, quizId: 5, quizName: "SQL", score: 71, completedAt: "2026-03-03T10:00:00Z" }
    ],
    loading: false, error: "", onRetry: () => {}
  });

  const [completed, average, best] = view.findAll(".result-summary strong");
  assert.equal(completed.textContent, "3");
  assert.equal(average.textContent, "67%", "the mean of 90, 40 and 71 is 67");
  assert.equal(best.textContent, "90%");
  assert.equal(view.findAll(".result-row").length, 3);
});

test("an empty history reads as empty rather than as a zero score", () => {
  const view = render(ResultsPage, { results: [], loading: false, error: "", onRetry: () => {} });
  assert.match(view.text(), /Історія ще порожня/);
  assert.equal(view.findAll(".result-row").length, 0);
});

test("a score is banded, and the bands do not overlap", () => {
  const at = score => {
    const view = render(ResultsPage, {
      results: [{ attemptId: 1, quizId: 1, quizName: "Java", score, completedAt: "2026-03-01T10:00:00Z" }],
      loading: false, error: "", onRetry: () => {}
    });
    const badge = view.find(".score-badge").className;
    view.unmount();
    return badge;
  };

  assert.ok(at(80).includes("score-badge--great"));
  assert.ok(at(79).includes("score-badge--good"));
  assert.ok(at(60).includes("score-badge--good"));
  assert.ok(!at(59).includes("score-badge--good"));
  assert.ok(!at(59).includes("score-badge--great"));
});

const attempt = (over = {}) => ({
  attemptId: 3, quizId: 7, completed: false,
  expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  questions: [{
    id: 11, text: "Що таке JVM?",
    answers: [{ id: 101, text: "Віртуальна машина" }, { id: 102, text: "Компілятор" }]
  }],
  ...over
});

const attemptProps = (over = {}) => ({
  attempt: attempt(), loading: false, error: "", selected: new Set(),
  completion: null, busy: false, onToggle: () => {}, onComplete: () => {}, ...over
});

test("an answer is checked when the page is told it is, and not otherwise", () => {
  const view = render(AttemptPage, attemptProps({ selected: new Set([102]) }));
  const boxes = view.findAll("input[type=checkbox]");
  assert.equal(boxes[0].checked, false);
  assert.equal(boxes[1].checked, true);
});

test("ticking an answer reports the attempt, the answer and the direction", () => {
  const toggles = [];
  const view = render(AttemptPage, attemptProps({
    onToggle: (attemptId, answerId, checked) => toggles.push([attemptId, answerId, checked])
  }));

  click(view.findAll("input[type=checkbox]")[0]);
  assert.deepEqual(toggles, [[3, 101, true]]);

  // Unticking has to report false, or a second press would look like a first.
  view.rerender(attemptProps({
    selected: new Set([101]),
    onToggle: (attemptId, answerId, checked) => toggles.push([attemptId, answerId, checked])
  }));
  click(view.findAll("input[type=checkbox]")[0]);
  assert.deepEqual(toggles[1], [3, 101, false]);
});

test("a finished attempt shows its score instead of its questions", () => {
  const view = render(AttemptPage, attemptProps({ completion: { score: 83 } }));
  assert.equal(view.find(".completion__score strong").textContent, "83");
  assert.equal(view.findAll("input[type=checkbox]").length, 0,
    "a completed attempt still offered its answer boxes");
});

test("an attempt the API already marked complete needs no completion payload", () => {
  const view = render(AttemptPage, attemptProps({ attempt: attempt({ completed: true, score: 55 }), completion: null }));
  assert.equal(view.find(".completion__score strong").textContent, "55");
});

test("submitting is announced and blocked while it is in flight", () => {
  const completed = [];
  const view = render(AttemptPage, attemptProps({ busy: true, onComplete: id => completed.push(id) }));
  const submit = view.find(".attempt-submit button");
  assert.match(submit.textContent, /Перевіряємо/);
  assert.equal(submit.disabled, true, "the attempt could be submitted twice");
  assert.deepEqual(completed, []);
});

test("an unreachable attempt offers a way out rather than a blank page", () => {
  const view = render(AttemptPage, attemptProps({ attempt: null, error: "Спроба не знайдена" }));
  assert.match(view.text(), /Спроба не знайдена/);
  assert.equal(view.find("a[href='#/quizzes']").textContent, "До каталогу");
});

test("the home page sends a stranger to sign in and a reader to their results", () => {
  const props = session => ({
    session, quizzes: [quiz()], summary: { totalQuizzes: 12, totalSubjects: 4 },
    loading: false, error: "", busy: null, onRetry: () => {}, onStart: () => {}
  });

  const stranger = render(HomePage, props(null));
  const invitation = stranger.find(".hero__actions .text-link");
  assert.equal(invitation.getAttribute("href"), "#/login");
  assert.match(invitation.textContent, /Увійти до кабінету/);
  stranger.unmount();

  const reader = render(HomePage, props({ username: "olena", roles: [] }));
  const link = reader.find(".hero__actions .text-link");
  assert.equal(link.getAttribute("href"), "#/results");
  assert.match(link.textContent, /Мої результати/);
});

// Both figures describe the whole catalogue while the page loads only the three
// quizzes it teases, so counting the loaded array would report the teaser's size
// under a label promising a catalogue total.
test("the home page's totals come from the catalogue, not from what it teased", () => {
  const view = render(HomePage, {
    session: null,
    quizzes: [quiz({ id: 1 }), quiz({ id: 2 }), quiz({ id: 3 })],
    summary: { totalQuizzes: 137, totalSubjects: 9 },
    loading: false, error: "", busy: null, onRetry: () => {}, onStart: () => {}
  });

  const [quizzes, subjects] = view.findAll(".hero__stats strong");
  assert.equal(quizzes.textContent, "137");
  assert.equal(subjects.textContent, "9");
});

test("totals that have not arrived are left blank rather than shown as zero", () => {
  const view = render(HomePage, {
    session: null, quizzes: null, summary: null,
    loading: true, error: "", busy: null, onRetry: () => {}, onStart: () => {}
  });
  const [quizzes, subjects] = view.findAll(".hero__stats strong");
  assert.equal(quizzes.textContent, "—", "an unknown catalogue size was reported as a number");
  assert.equal(subjects.textContent, "—");
});
