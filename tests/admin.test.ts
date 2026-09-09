// The administration panel, driven the way an administrator drives it.
//
// This screen is a third of components.tsx and it had no test at all: every
// assertion about it came from the E2E suite, which signs in as an admin and
// clicks through the happy path. What was missing is everything either side of
// that path — a rename nobody confirmed, a delete of the quiz currently open in
// the question editor, a question list that failed to load — and all of it is
// state this component holds itself, so a server-side test cannot reach it.
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { AdminPage, type AdminPageProps, type ExecuteAdmin } from "../src/components.js";
import { QuizApi, type FetchLike } from "../src/api.js";
import type {
  AdminQuestion, AdminQuiz, AdminResult, AdminUser, Level, PageMeta, Subject
} from "../src/types.js";
import { click, closeBrowser, openBrowser, render, select, settle, submit, type, type Rendered } from "./support/dom.js";

/** One call the component made on its own, rather than through onExecute. */
interface DirectCall {
  method: string;
  path: string;
}

interface StubbedApi {
  api: QuizApi;
  calls: DirectCall[];
}

/**
 * A QuizApi whose responses are decided per path.
 *
 * AdminPage is handed the client rather than a bag of callbacks, and it uses it
 * for exactly one thing on its own: loading the questions of the selected quiz.
 * Everything else goes through onExecute, which the page above it owns.
 */
function stubbedApi(routes: Record<string, unknown> = {}): StubbedApi {
  const calls: DirectCall[] = [];
  const fetchImpl: FetchLike = (url, options) => {
    const path = new URL(url).pathname;
    const method = options.method ?? "GET";
    calls.push({ method, path });
    const answer = routes[`${method} ${path}`];
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer ?? []), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  return {
    api: new QuizApi({ baseUrl: "https://api.example.com", getToken: () => "token", fetchImpl }),
    calls
  };
}

/** onExecute as App implements it, minus the toast: run it, hand back the result. */
interface Executor {
  execute: ExecuteAdmin;
  keys: string[];
  messages: string[];
}

function executor({ failing = false } = {}): Executor {
  const keys: string[] = [];
  const messages: string[] = [];
  const execute = (async <T,>(key: string, operation: () => Promise<T>, successMessage: string): Promise<T | null> => {
    keys.push(key);
    messages.push(successMessage);
    // A failure is swallowed by App and reported as a toast; the caller sees
    // null and must not treat it as success. Several branches here turn on
    // exactly that distinction.
    if (failing) return null;
    return await operation();
  }) satisfies ExecuteAdmin;
  return { execute, keys, messages };
}

const subject = (over: Partial<Subject> = {}): Subject => ({ id: 1, name: "Програмування", ...over });
const level = (over: Partial<Level> = {}): Level => ({ id: 5, name: "medium", ...over });

const adminQuiz = (over: Partial<AdminQuiz> = {}): AdminQuiz => ({
  id: 7, name: "Java", subject: "Програмування", subjectId: 1, levelId: 5,
  complexity: "medium", timeToPassMinutes: 30, totalQuestions: 12, ...over
});

const adminUser = (over: Partial<AdminUser> = {}): AdminUser => ({
  id: 3, username: "olena", role: "user", status: "active", ...over
});

const adminResult = (over: Partial<AdminResult> = {}): AdminResult => ({
  attemptId: 11, username: "olena", quizId: 7, quizName: "Java", score: 80,
  completedAt: "2026-03-01T09:00:00Z", ...over
});

const question = (over: Partial<AdminQuestion> = {}): AdminQuestion => ({
  id: 21, quizId: 7, text: "Що таке JVM?", answers: [
    { id: 101, text: "Віртуальна машина", correct: true },
    { id: 102, text: "Компілятор", correct: false },
    { id: 103, text: "Редактор", correct: false },
    { id: 104, text: "Профайлер", correct: false }
  ], ...over
});

const page = (over: Partial<PageMeta> = {}): PageMeta =>
  ({ number: 0, size: 20, totalCount: 40, totalPages: 2, ...over });

function props(over: Partial<AdminPageProps> = {}): AdminPageProps {
  return {
    data: {
      subjects: [subject()],
      levels: [level(), level({ id: 6, name: "high" })],
      quizzes: [adminQuiz()],
      users: [adminUser()],
      usersPage: null,
      results: [adminResult()],
      resultsPage: null
    },
    loading: false,
    error: "",
    busy: "",
    api: stubbedApi().api,
    resultRange: { from: "", to: "" },
    onResultRangeChange: () => {},
    onUsersPageChange: () => {},
    onResultsPageChange: () => {},
    onRetry: () => {},
    onExecute: executor().execute,
    ...over
  };
}

/**
 * The panel section with this heading.
 *
 * Five sections share the same class and much of the same markup, so indexing
 * into `findAll("button")` would tie every assertion to the order the sections
 * happen to be written in — and quietly move to another section's button the
 * first time one is added.
 */
function card(view: Rendered<AdminPageProps>, title: string): HTMLElement {
  const found = view.findAll("section.admin-card")
    .find(section => section.querySelector("h2")?.textContent === title);
  if (!found) throw new Error(`No panel section titled "${title}"`);
  return found;
}

const buttonsIn = (section: HTMLElement, selector: string): HTMLButtonElement[] =>
  [...section.querySelectorAll<HTMLButtonElement>(selector)];

function fieldIn(section: HTMLElement, selector: string): HTMLInputElement {
  const found = section.querySelector<HTMLInputElement>(selector);
  if (!found) throw new Error(`Nothing matched ${selector} in this panel section`);
  return found;
}

/** Mount and let the question load that every mount starts finish. */
async function mount(over: Partial<AdminPageProps> = {}): Promise<Rendered<AdminPageProps>> {
  const view = render(AdminPage, props(over));
  await settle();
  return view;
}

// window.prompt and window.confirm are how this screen asks before it destroys
// something, and happy-dom implements neither — an unstubbed call is a
// TypeError, not a silently skipped dialog. Answering "yes" by default keeps
// each test explicit about the case it is actually testing.
let answered: string[] = [];

beforeEach(() => {
  openBrowser();
  answered = [];
  window.confirm = (message?: string) => { answered.push(String(message)); return true; };
  window.prompt = (message?: string) => { answered.push(String(message)); return "Математика"; };
});

afterEach(() => closeBrowser());

test("the panel says it is loading before it has anything to show", async () => {
  const view = await mount({ data: null, loading: true });
  assert.match(view.text(), /Готуємо панель/);
  assert.ok(view.query(".result-skeleton"), "no skeleton stood in for the panel");
});

test("a panel that could not load offers the reason and a way to retry", async () => {
  let retried = 0;
  const view = await mount({ data: null, error: "403 Forbidden", onRetry: () => { retried += 1; } });
  assert.match(view.text(), /Панель недоступна/);
  assert.match(view.text(), /403 Forbidden/);
  click(view.find("button"));
  assert.equal(retried, 1);

  // No data and no error either: the reader still needs something to press.
  const silent = await mount({ data: null });
  assert.match(silent.text(), /Не вдалося отримати дані/);
});

test("the drafts open on the first subject, level and quiz rather than on nothing", async () => {
  const view = await mount();
  assert.equal(view.at<HTMLSelectElement>("select", 0).value, "1", "the subject select opened blank");
  assert.equal(view.at<HTMLSelectElement>("select", 1).value, "5", "the level select opened blank");
  assert.equal(view.find<HTMLSelectElement>(".admin-quiz-select").value, "7");

  // The level names are translated in the editor exactly as they are on a card;
  // an untranslated one here would let an admin pick "high" from a list that
  // shows "Просунутий" everywhere else.
  assert.deepEqual(
    view.findAll<HTMLOptionElement>("select option").map(option => option.textContent),
    ["Програмування", "Середній", "Просунутий", "Java"]
  );
});

test("the totals count the whole collection, not the page of it that is loaded", async () => {
  const counted = await mount({
    data: { ...props().data!, usersPage: page({ totalCount: 137 }), resultsPage: page({ totalCount: 402 }) }
  });
  const totals = counted.findAll(".admin-stats strong").map(node => node.textContent);
  assert.deepEqual(totals, ["1", "1", "137", "402"]);

  // Unpaginated, so the loaded rows are the whole collection and counting them
  // is correct rather than a fallback that happens to be close.
  const whole = await mount();
  assert.deepEqual(whole.findAll(".admin-stats strong").map(node => node.textContent), ["1", "1", "1", "1"]);
});

test("a subject is created, and the field clears only when it worked", async () => {
  const { api, calls } = stubbedApi();
  const run = executor();
  const view = await mount({ api, onExecute: run.execute });

  const field = fieldIn(card(view, "Предмети"), ".admin-inline-form input");
  type(field, "Математика");
  await submit(view.find("form.admin-inline-form"));

  assert.deepEqual(run.keys, ["subject-create"]);
  assert.match(String(run.messages[0]), /Предмет додано/);
  assert.ok(calls.some(call => call.method === "POST" && call.path === "/api/v1/admin/subjects"));
  assert.equal(field.value, "", "the field kept a subject that has already been created");

  // A failure leaves the typing in place: retyping it is the reader's work,
  // and there is nothing else in the form to recover it from.
  const failed = executor({ failing: true });
  const second = await mount({ onExecute: failed.execute });
  const retained = fieldIn(card(second, "Предмети"), ".admin-inline-form input");
  type(retained, "Фізика");
  await submit(second.find("form.admin-inline-form"));
  assert.equal(retained.value, "Фізика", "a failed create threw away what was typed");
});

test("renaming a subject asks for the new name and refuses the empty answers", async () => {
  const run = executor();
  const view = await mount({ onExecute: run.execute });
  const rename = (): void => click(buttonsIn(card(view, "Предмети"), ".admin-list__row button")[0]);

  window.prompt = () => null;
  rename();
  await settle();
  assert.deepEqual(run.keys, [], "a cancelled prompt renamed the subject anyway");

  window.prompt = () => "   ";
  rename();
  await settle();
  assert.deepEqual(run.keys, [], "a blank name was accepted as a name");

  // The name it already has, with the whitespace an admin leaves behind: a
  // request that changes nothing is a request not worth making.
  window.prompt = () => "  Програмування  ";
  rename();
  await settle();
  assert.deepEqual(run.keys, [], "the unchanged name was sent as a rename");

  window.prompt = () => "  Математика  ";
  rename();
  await settle();
  assert.deepEqual(run.keys, ["subject-update"]);
});

test("deleting a subject happens only after it is confirmed", async () => {
  const run = executor();
  const view = await mount({ onExecute: run.execute });
  const remove = (): void => click(buttonsIn(card(view, "Предмети"), ".admin-list__row button")[1]);

  window.confirm = () => false;
  remove();
  await settle();
  assert.deepEqual(run.keys, [], "a refused confirmation deleted the subject");

  window.confirm = (message?: string) => { answered.push(String(message)); return true; };
  remove();
  await settle();
  assert.deepEqual(run.keys, ["subject-delete"]);
  assert.match(String(answered.at(-1)), /Програмування/, "the dialog did not name what it would delete");
});

test("the quiz form creates, then edits the quiz it was pointed at, then lets go", async () => {
  const run = executor();
  const view = await mount({ onExecute: run.execute });
  const nameOf = (): HTMLInputElement => view.find<HTMLInputElement>(".admin-grid-form input");
  const saveButton = (): HTMLButtonElement => view.find<HTMLButtonElement>(".admin-grid-form button");

  assert.equal(saveButton().textContent, "Створити тест");
  type(nameOf(), "Spring");
  await submit(view.find("form.admin-grid-form"));
  assert.deepEqual(run.keys, ["quiz-save"]);
  assert.match(String(run.messages[0]), /створено/);
  assert.equal(nameOf().value, "", "the form kept the quiz it had just created");

  // "Редагувати" on the row loads that quiz into the same form, and the same
  // submit now has to update rather than create a second copy of it.
  click(buttonsIn(card(view, "Тести"), ".admin-table__row button")[0]);
  assert.equal(nameOf().value, "Java");
  assert.equal(saveButton().textContent, "Зберегти");
  await submit(view.find("form.admin-grid-form"));
  assert.match(String(run.messages[1]), /оновлено/);
  assert.equal(nameOf().value, "", "the form stayed in edit mode after the update landed");

  // Cancel is offered only while a quiz is loaded, and it empties the form
  // rather than leaving a half-edited copy of somebody else's quiz in it.
  assert.equal(buttonsIn(card(view, "Тести"), ".admin-grid-form .button-row button").length, 1);
  click(buttonsIn(card(view, "Тести"), ".admin-table__row button")[0]);
  assert.equal(buttonsIn(card(view, "Тести"), ".admin-grid-form .button-row button").length, 2);
  click(buttonsIn(card(view, "Тести"), ".admin-grid-form .button-row button")[1]);
  assert.equal(nameOf().value, "");
  assert.equal(saveButton().textContent, "Створити тест");
});

test("deleting the quiz that is open in the editor closes the editor with it", async () => {
  const run = executor();
  const { api } = stubbedApi({ "GET /api/v1/admin/quizzes/7/questions": [question()] });
  const view = await mount({ api, onExecute: run.execute });
  assert.match(view.text(), /Що таке JVM/, "the questions of the selected quiz were never loaded");

  click(buttonsIn(card(view, "Тести"), ".admin-table__row button")[1]);
  await settle();

  assert.deepEqual(run.keys, ["quiz-delete"]);
  assert.match(String(answered.at(-1)), /разом із запитаннями/);
  assert.match(view.text(), /Спочатку створіть тест/,
    "the editor still offers the questions of a quiz that no longer exists");
});

test("a delete that failed leaves the editor open on the quiz that is still there", async () => {
  const { api } = stubbedApi({ "GET /api/v1/admin/quizzes/7/questions": [question()] });
  const view = await mount({ api, onExecute: executor({ failing: true }).execute });
  click(buttonsIn(card(view, "Тести"), ".admin-table__row button")[1]);
  await settle();
  assert.match(view.text(), /Що таке JVM/, "a failed delete emptied the editor anyway");
});

test("a question list that will not load says so instead of staying blank", async () => {
  const { api } = stubbedApi({
    "GET /api/v1/admin/quizzes/7/questions": new Error("Мережа недоступна")
  });
  const view = await mount({ api });
  assert.match(view.find(".alert--error").textContent ?? "", /API/,
    "the load failure was swallowed and the editor looked merely empty");
});

test("a question is written with four answers, one of them marked correct", async () => {
  const run = executor();
  const { api, calls } = stubbedApi();
  const view = await mount({ api, onExecute: run.execute });

  type(view.find("textarea"), "  Що таке JIT?  ");
  const texts = view.findAll<HTMLInputElement>(".admin-answer-grid > label > input");
  assert.equal(texts.length, 4, "the editor no longer offers exactly four answers");
  texts.forEach((input, index) => type(input, ` Варіант ${index + 1} `));

  const correct = view.findAll<HTMLInputElement>(".admin-answer-grid input[type=checkbox]");
  assert.ok(correct.every(box => !box.checked), "an answer was pre-marked as correct");
  click(correct[1]);
  assert.deepEqual(correct.map(box => box.checked), [false, true, false, false]);

  await submit(view.find("form.admin-question-form"));
  assert.deepEqual(run.keys, ["question-save"]);
  assert.ok(calls.some(call => call.method === "POST" && call.path === "/api/v1/admin/quizzes/7/questions"));
  assert.equal(view.find<HTMLTextAreaElement>("textarea").value, "",
    "the editor kept the question it had just added");
  assert.ok(
    view.findAll<HTMLInputElement>(".admin-answer-grid input[type=checkbox]").every(box => !box.checked),
    "the next question started with the previous one's answer already ticked");
});

test("editing a question fills the editor from it and saves over it", async () => {
  const run = executor();
  const { api } = stubbedApi({ "GET /api/v1/admin/quizzes/7/questions": [question()] });
  const view = await mount({ api, onExecute: run.execute });

  click(buttonsIn(card(view, "Запитання"), ".admin-question-list .button-row button")[0]);
  assert.equal(view.find<HTMLTextAreaElement>("textarea").value, "Що таке JVM?");
  assert.deepEqual(
    view.findAll<HTMLInputElement>(".admin-answer-grid input[type=checkbox]").map(box => box.checked),
    [true, false, false, false], "the answer that is correct came back unticked");

  await submit(view.find("form.admin-question-form"));
  assert.deepEqual(run.keys, ["question-save"]);
  assert.match(String(run.messages[0]), /оновлено/);

  // Cancel while editing returns the form to a new blank question rather than
  // leaving the saved one loaded and inviting a duplicate.
  click(buttonsIn(card(view, "Запитання"), ".admin-question-list .button-row button")[0]);
  click(buttonsIn(card(view, "Запитання"), ".admin-question-form .button-row button")[1]);
  assert.equal(view.find<HTMLTextAreaElement>("textarea").value, "");
});

test("deleting a question is confirmed, and the list is read back afterwards", async () => {
  const run = executor();
  const { api, calls } = stubbedApi({ "GET /api/v1/admin/quizzes/7/questions": [question()] });
  const view = await mount({ api, onExecute: run.execute });
  const loadsBefore = calls.filter(call => call.method === "GET").length;

  window.confirm = () => false;
  click(buttonsIn(card(view, "Запитання"), ".admin-question-list .button-row button")[1]);
  await settle();
  assert.deepEqual(run.keys, [], "a refused confirmation deleted the question");

  window.confirm = () => true;
  click(buttonsIn(card(view, "Запитання"), ".admin-question-list .button-row button")[1]);
  await settle();
  assert.deepEqual(run.keys, ["question-delete"]);
  assert.ok(calls.filter(call => call.method === "GET").length > loadsBefore,
    "the list still shows a question the server no longer has");
});

test("choosing another quiz loads its questions and empties the editor", async () => {
  const { api, calls } = stubbedApi({
    "GET /api/v1/admin/quizzes/7/questions": [question()],
    "GET /api/v1/admin/quizzes/8/questions": [question({ id: 31, text: "Що таке DI?" })]
  });
  const view = await mount({
    api,
    data: { ...props().data!, quizzes: [adminQuiz(), adminQuiz({ id: 8, name: "Spring" })] }
  });

  type(view.find("textarea"), "напівнаписане запитання");
  select(view.find(".admin-quiz-select"), "8");
  await settle();

  assert.match(view.text(), /Що таке DI/);
  assert.doesNotMatch(view.text(), /Що таке JVM/);
  assert.equal(view.find<HTMLTextAreaElement>("textarea").value, "",
    "a draft written for one quiz was carried over to another");
  assert.ok(calls.some(call => call.path === "/api/v1/admin/quizzes/8/questions"));
});

test("with no quizzes at all the editor asks for one rather than offering nothing", async () => {
  const { api, calls } = stubbedApi();
  const view = await mount({ api, data: { ...props().data!, quizzes: [] } });
  assert.match(view.text(), /Спочатку створіть тест/);
  assert.equal(calls.length, 0, "questions were requested for a quiz that does not exist");
});

test("blocking a user is confirmed; letting them back in is not", async () => {
  const run = executor();
  const view = await mount({
    onExecute: run.execute,
    data: { ...props().data!, users: [adminUser(), adminUser({ id: 4, username: "petro", status: "BLOCKED" })] }
  });

  const buttons = buttonsIn(card(view, "Користувачі"), ".admin-table__row > button");
  assert.deepEqual(buttons.map(button => button.textContent), ["Заблокувати", "Активувати"]);

  window.confirm = () => false;
  click(buttons[0]);
  await settle();
  assert.deepEqual(run.keys, [], "a refused confirmation blocked the user anyway");

  // Unblocking asks nothing: it is the reversible direction.
  click(buttons[1]);
  await settle();
  assert.deepEqual(run.keys, ["user-status"]);
  assert.match(String(run.messages[0]), /активовано/);

  window.confirm = (message?: string) => { answered.push(String(message)); return true; };
  click(buttons[0]);
  await settle();
  assert.match(String(run.messages[1]), /заблоковано/);
  assert.match(String(answered.at(-1)), /olena/);
});

test("the pagers and the date range report what was asked for", async () => {
  const users: number[] = [];
  const results: number[] = [];
  const ranges: Array<Partial<{ from: string; to: string }>> = [];
  const view = await mount({
    data: { ...props().data!, usersPage: page(), resultsPage: page({ number: 1 }) },
    onUsersPageChange: value => users.push(value),
    onResultsPageChange: value => results.push(value),
    onResultRangeChange: patch => ranges.push(patch)
  });

  const pagers = view.findAll(".pager");
  assert.equal(pagers.length, 2, "one of the two paginated collections has no pager");
  click(pagers[0]?.querySelectorAll("button")[1]);
  click(pagers[1]?.querySelectorAll("button")[0]);
  assert.deepEqual(users, [1]);
  assert.deepEqual(results, [0]);

  const [from, to] = view.findAll<HTMLInputElement>(".admin-date-filter input");
  type(from, "2026-03-01T00:00");
  type(to, "2026-03-31T23:59");
  assert.deepEqual(ranges, [{ from: "2026-03-01T00:00" }, { to: "2026-03-31T23:59" }]);
});

test("an empty range says so rather than showing an empty table", async () => {
  const view = await mount({ data: { ...props().data!, results: [] } });
  assert.match(view.text(), /результатів немає/);
});

test("every destructive control is disabled while an operation is in flight", async () => {
  const view = await mount({ busy: "admin-quiz-delete" });
  const disabled = view.findAll<HTMLButtonElement>("button").filter(button => button.disabled);
  assert.ok(disabled.length >= 5, `only ${disabled.length} controls were locked while working`);

  // A busy key from somewhere else in the app — a quiz starting on another
  // screen — is not this panel's work and must not freeze it.
  const idle = await mount({ busy: "start-7" });
  assert.equal(idle.findAll<HTMLButtonElement>("button").filter(button => button.disabled).length, 0);
});
