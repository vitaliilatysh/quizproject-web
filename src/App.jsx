import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, QuizApi, normalizeBaseUrl } from "./api.js";
import { resetServerClock } from "./clock.js";
import {
  clearAnswers,
  clearSession,
  clearStoredAnswers,
  consumePendingQuiz,
  consumeReturnTo,
  readAnswers,
  readApiUrl,
  readSession,
  rememberPendingQuiz,
  rememberReturnTo,
  writeAnswers,
  writeApiUrl,
  writeSession
} from "./session.js";
import {
  AttemptPage,
  AdminPage,
  HomePage,
  Layout,
  LoginPage,
  NotFoundPage,
  ProfilePage,
  QuizzesPage,
  ResultsPage,
  SettingsPage,
  SignupPage
} from "./components.jsx";
import { autoSubmitDelay, complexityLabels, HOME_TEASER_SIZE, parseRoute, safeHash } from "./utils.js";

function navigate(hash) {
  globalThis.location.hash = safeHash(hash);
}

const TOKEN_REFRESH_MARGIN_MS = 60_000;
const TOKEN_REFRESH_RETRY_MS = 30_000;
// Matches the API's own default page size, so the first page a client renders
// is the same size whether or not it asked for one.
const PAGE_SIZE = 20;
// Search now costs a request, so wait for a pause in typing instead of firing
// one per keystroke.
const SEARCH_DEBOUNCE_MS = 300;
// One shared empty Set, so a route without a valid attempt does not hand the
// page a new identity on every render either.
const EMPTY_SELECTION = new Set();

function friendlyError(error) {
  if (!(error instanceof Error)) return "Сталася неочікувана помилка. Спробуйте ще раз.";
  const correlationId = error instanceof ApiError ? error.correlationId : null;
  return correlationId ? `${error.message} (код підтримки: ${correlationId})` : error.message;
}

function pageTitle(name) {
  return ({
    quizzes: "Тести",
    login: "Вхід",
    signup: "Реєстрація",
    profile: "Профіль",
    settings: "Налаштування",
    results: "Результати",
    attempt: "Проходження тесту",
    admin: "Адміністрування"
  })[name] || "Сторінка";
}

function useRoute() {
  const [route, setRoute] = useState(() => parseRoute());
  useEffect(() => {
    const onChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  const [session, setSession] = useState(() => readSession());
  // Who the cached data belongs to. A refreshed token keeps the same login, so
  // this only changes when a different person is actually signed in.
  const accountName = session?.username ?? null;
  const [apiUrl, setApiUrl] = useState(() => readApiUrl());
  const [quizzes, setQuizzes] = useState(null);
  const [quizzesLoading, setQuizzesLoading] = useState(false);
  const [quizError, setQuizError] = useState("");
  const [results, setResults] = useState(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultError, setResultError] = useState("");
  const [adminData, setAdminData] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  // Paging and the results date range live here rather than inside AdminPage
  // because both now drive the request. Filtering a single page in the browser
  // would hide every match that sits on another page.
  const [adminUsersPage, setAdminUsersPage] = useState(0);
  const [adminResultsPage, setAdminResultsPage] = useState(0);
  const [adminResultRange, setAdminResultRange] = useState({ from: "", to: "" });
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [attempts, setAttempts] = useState({});
  const [attemptLoading, setAttemptLoading] = useState({});
  const [attemptErrors, setAttemptErrors] = useState({});
  const [selections, setSelections] = useState({});
  const [completions, setCompletions] = useState({});
  const [actionBusy, setActionBusy] = useState("");
  const [loginError, setLoginError] = useState("");
  const [signupError, setSignupError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [connection, setConnection] = useState("idle");
  // `search` tracks the input; `appliedSearch` is what actually gets requested,
  // trailing it by one debounce interval.
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [quizzesPage, setQuizzesPage] = useState(0);
  const [quizzesMeta, setQuizzesMeta] = useState(null);
  const [catalogueSummary, setCatalogueSummary] = useState(null);
  const [toasts, setToasts] = useState([]);
  const quizzesRequest = useRef(false);
  const resultsRequest = useRef(false);
  const adminRequest = useRef(false);
  const profileRequest = useRef(false);
  const attemptRequests = useRef(new Set());
  // Completions in flight, so the deadline and the button cannot submit the
  // same attempt twice and leave one of them to report a conflict.
  const completionRequests = useRef(new Set());
  // The account the cached data currently belongs to. Also what an in-flight
  // request compares itself against before committing what it loaded.
  const activeAccount = useRef(accountName);

  const api = useMemo(() => new QuizApi({
    baseUrl: apiUrl,
    getToken: () => session?.accessToken
  }), [apiUrl, session?.accessToken]);

  const toast = useCallback((message, tone = "success") => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setToasts(current => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), 4200);
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    let timer = window.setTimeout(attemptRefresh,
      Math.max(5000, session.expiresAt - Date.now() - TOKEN_REFRESH_MARGIN_MS));

    async function attemptRefresh() {
      try {
        const tokenResponse = await api.refresh();
        if (!cancelled) setSession(writeSession(tokenResponse, session.username));
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          setSession(null);
        } else {
          timer = window.setTimeout(attemptRefresh, TOKEN_REFRESH_RETRY_MS);
        }
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, session]);

  // An offset measured against a server the app has stopped talking to is
  // worse than none at all: it is a confident wrong answer. Pointing the app
  // at another API drops it, and the first response from the new one takes a
  // fresh reading. Between the two the device's own clock is used, which is
  // what happened everywhere before this was measured at all.
  useEffect(() => {
    resetServerClock();
  }, [apiUrl]);

  const handleAuthError = useCallback((error, returnTo) => {
    if (!(error instanceof ApiError) || error.status !== 401) return false;
    clearSession();
    setSession(null);
    setProfile(null);
    rememberReturnTo(returnTo);
    toast("Сесія завершилась. Увійдіть ще раз.", "error");
    navigate("#/login");
    return true;
  }, [toast]);

  const catalogueRoute = route.name === "quizzes";

  const loadQuizzes = useCallback(async () => {
    if (quizzesRequest.current) return;
    quizzesRequest.current = true;
    setQuizzesLoading(true);
    setQuizError("");
    try {
      // The catalogue page asks the server to search, filter and page. The home
      // page needs only the handful of quizzes it teases, plus two totals that
      // no page can supply — how many quizzes exist and how many subjects they
      // span — so it reads those from the summary endpoint instead of counting
      // a catalogue it no longer downloads.
      const request = catalogueRoute
        ? api.quizzes({
            search: appliedSearch,
            complexity: complexityLabels(filter),
            page: quizzesPage,
            size: PAGE_SIZE
        })
        : api.quizzes({ page: 0, size: HOME_TEASER_SIZE });

      // The hero's figures are worth degrading for, not failing for: web and
      // API deploy separately, so an API without this endpoint should still
      // render a working home page with dashes where the totals go.
      const [{ items, page }, summary] = await Promise.all([
        request,
        catalogueRoute ? Promise.resolve(null) : api.catalogueSummary().catch(() => null)
      ]);
      setQuizzes(items);
      setQuizzesMeta(page);
      if (!catalogueRoute) setCatalogueSummary(summary);
    } catch (error) {
      setQuizError(friendlyError(error));
    } finally {
      quizzesRequest.current = false;
      setQuizzesLoading(false);
    }
  }, [api, appliedSearch, catalogueRoute, filter, quizzesPage]);

  const loadResults = useCallback(async () => {
    if (!session || resultsRequest.current) return;
    // Whose data this request is for. A request already in flight when a
    // different account signs in would otherwise land after the caches were
    // emptied and put the previous reader's rows back on screen.
    const requestedBy = session.username;
    resultsRequest.current = true;
    setResultsLoading(true);
    setResultError("");
    try {
      const rows = await api.results();
      if (activeAccount.current !== requestedBy) return;
      setResults(rows);
    } catch (error) {
      if (!handleAuthError(error, "#/results")) setResultError(friendlyError(error));
    } finally {
      resultsRequest.current = false;
      setResultsLoading(false);
    }
  }, [api, handleAuthError, session]);

  const loadAttempt = useCallback(async attemptId => {
    if (!session || !Number.isInteger(attemptId) || attemptId <= 0 || attemptRequests.current.has(attemptId)) return;
    const requestedBy = session.username;
    attemptRequests.current.add(attemptId);
    setAttemptLoading(current => ({ ...current, [attemptId]: true }));
    setAttemptErrors(current => ({ ...current, [attemptId]: "" }));
    try {
      const attempt = await api.attempt(attemptId);
      if (activeAccount.current !== requestedBy) return;
      setAttempts(current => ({ ...current, [attemptId]: attempt }));
      setSelections(current => current[attemptId]
        ? current
        : { ...current, [attemptId]: readAnswers(attemptId) });
    } catch (error) {
      if (!handleAuthError(error, `#/attempt/${attemptId}`)) {
        setAttemptErrors(current => ({ ...current, [attemptId]: friendlyError(error) }));
      }
    } finally {
      attemptRequests.current.delete(attemptId);
      setAttemptLoading(current => ({ ...current, [attemptId]: false }));
    }
  }, [api, handleAuthError, session]);

  const changeAdminResultRange = useCallback(patch => {
    // A narrower range can have fewer pages than the one currently selected,
    // which would otherwise land on an empty page that looks like "no results".
    setAdminResultsPage(0);
    setAdminResultRange(current => ({ ...current, ...patch }));
  }, []);

  const loadAdmin = useCallback(async () => {
    if (!session || adminRequest.current) return;
    const requestedBy = session.username;
    adminRequest.current = true;
    setAdminLoading(true);
    setAdminError("");
    try {
      // Subjects, levels and quizzes are bounded catalogues, so they stay whole.
      // Users and results grow with every registration and every finished
      // attempt, so those two are the ones worth paging.
      const [subjects, levels, adminQuizzes, users, allResults] = await Promise.all([
        api.adminSubjects(),
        api.adminLevels(),
        api.adminQuizzes(),
        api.adminUsers({ page: adminUsersPage, size: PAGE_SIZE }),
        api.adminResults({
          from: adminResultRange.from || undefined,
          to: adminResultRange.to || undefined,
          page: adminResultsPage,
          size: PAGE_SIZE
        })
      ]);
      if (activeAccount.current !== requestedBy) return;
      setAdminData({
        subjects,
        levels,
        quizzes: adminQuizzes,
        users: users.items,
        usersPage: users.page,
        results: allResults.items,
        resultsPage: allResults.page
      });
    } catch (error) {
      if (handleAuthError(error, "#/admin")) return;
      setAdminError(error instanceof ApiError && error.status === 403
        ? "Для цієї сторінки потрібна роль адміністратора."
        : friendlyError(error));
    } finally {
      adminRequest.current = false;
      setAdminLoading(false);
    }
  }, [adminResultRange.from, adminResultRange.to, adminResultsPage, adminUsersPage,
      api, handleAuthError, session]);

  const loadProfile = useCallback(async () => {
    if (!session || profileRequest.current) return;
    const requestedBy = session.username;
    profileRequest.current = true;
    setProfileLoading(true);
    setProfileError("");
    try {
      const loaded = await api.profile();
      if (activeAccount.current !== requestedBy) return;
      setProfile(loaded);
    } catch (error) {
      if (!handleAuthError(error, "#/profile")) setProfileError(friendlyError(error));
    } finally {
      profileRequest.current = false;
      setProfileLoading(false);
    }
  }, [api, handleAuthError, session]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${route.name === "home" ? "Quiz Project" : pageTitle(route.name)} — Quiz Project`;
  }, [route]);

  useEffect(() => {
    // Gated on the error rather than on the loading flag. Gating on loading
    // deadlocks against the reset effect below, which raises it; and a failed
    // load leaves quizzes null with loading back to false, so a loading-based
    // guard re-fires the request forever against an API that is still down.
    // quizzesRequest already prevents overlapping calls, and the error is
    // cleared whenever the query changes or the reader retries.
    if (["home", "quizzes"].includes(route.name) && quizzes === null && !quizError) {
      void loadQuizzes();
    }
  }, [loadQuizzes, quizError, quizzes, route.name]);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // A narrower search or filter can have fewer pages than the one selected,
  // which would otherwise land on an empty page that reads as "nothing found".
  useEffect(() => {
    setQuizzesPage(0);
  }, [appliedSearch, filter]);

  // Any change to the query invalidates the cached slice. Loading is raised in
  // the same effect: leaving it false for one render shows the empty state
  // under the new controls, which looks like a search that found nothing.
  useEffect(() => {
    setQuizzes(null);
    setQuizzesMeta(null);
    setQuizError("");
    setQuizzesLoading(true);
  }, [appliedSearch, catalogueRoute, filter, quizzesPage]);

  useEffect(() => {
    if (route.name !== "results") return;
    if (!session) {
      rememberReturnTo("#/results");
      navigate("#/login");
      return;
    }
    if (results === null && !resultsLoading) void loadResults();
  }, [loadResults, results, resultsLoading, route.name, session]);

  // Changing a page or the date range clears the cached slice so the existing
  // "load when null" effects refetch it. Dropping the data also keeps the
  // skeleton visible during the request instead of showing the previous page's
  // rows under new controls.
  useEffect(() => {
    // Loading is raised in the same effect that drops the data. Without it there
    // is one render where data is null and loading is still false, which falls
    // through to the "Панель недоступна" branch — a failure banner flashing on
    // every page click.
    setAdminData(null);
    setAdminLoading(true);
  }, [adminUsersPage, adminResultsPage, adminResultRange.from, adminResultRange.to]);

  // Everything held for one account is dropped when a different one takes over
  // the tab — and only then.
  //
  // Keyed on the login rather than on the session object, because a silent token
  // refresh mints a new object for the same person every few minutes and must
  // not count as a change. And keyed on the login rather than on the session
  // going falsy, because #/login renders its form to an authenticated reader
  // too: one account can replace another without ever passing through
  // signed-out, and that path used to clear nothing but the profile.
  //
  // Signing out is deliberately not a handover. An expiring session is the most
  // likely way to be interrupted mid-quiz, and it remembers the attempt URL so
  // the reader lands back on it — clearing then would greet them with their own
  // unfinished quiz and none of their answers. Ownership is kept until somebody
  // else actually signs in, which is safe because nothing renders account data
  // while signed out: every guarded route sends a reader with no session to the
  // login page.
  //
  // The attempt caches are the ones that matter. The route effect skips its
  // request whenever attempts[id] is already there, so a leftover entry is
  // rendered to the next reader rather than being refused by the API — which is
  // what would happen, since an attempt only loads for the account that owns it.
  // The clear runs before that can be seen: signing in as somebody else is only
  // reachable from #/login or #/signup, so the attempt page is not mounted, and
  // the effect commits before the hash change that navigates away from the form.
  useEffect(() => {
    if (accountName === null || activeAccount.current === accountName) return;
    activeAccount.current = accountName;
    setAdminUsersPage(0);
    setAdminResultsPage(0);
    setAdminResultRange({ from: "", to: "" });
    setAttempts({});
    setAttemptErrors({});
    setAttemptLoading({});
    setSelections({});
    setCompletions({});
    setResults(null);
    setAdminData(null);
    setProfile(null);
    // Saved answers outlive React state, and are read back by attempt id alone.
    clearStoredAnswers();
  }, [accountName]);

  useEffect(() => {
    if (route.name !== "attempt") return;
    const attemptId = Number(route.params[0]);
    if (!session) {
      rememberReturnTo(`#/attempt/${attemptId}`);
      navigate("#/login");
      return;
    }
    if (Number.isInteger(attemptId) && attemptId > 0 && !attempts[attemptId] && !attemptLoading[attemptId]) {
      void loadAttempt(attemptId);
    }
  }, [attemptLoading, attempts, loadAttempt, route, session]);

  useEffect(() => {
    if (route.name !== "admin") return;
    if (!session) {
      rememberReturnTo("#/admin");
      navigate("#/login");
      return;
    }
    if (adminData === null) void loadAdmin();
  }, [adminData, loadAdmin, route.name, session]);

  useEffect(() => {
    if (route.name !== "profile") return;
    if (!session) {
      rememberReturnTo("#/profile");
      navigate("#/login");
      return;
    }
    if (profile === null && !profileLoading) void loadProfile();
  }, [loadProfile, profile, profileLoading, route.name, session]);

  useEffect(() => {
    const onStorage = event => {
      if (event.key !== "quizproject.apiUrl") return;
      setApiUrl(readApiUrl());
      setQuizzes(null);
      setResults(null);
      setAdminData(null);
      setProfile(null);
      setAdminUsersPage(0);
      setAdminResultsPage(0);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const startQuiz = useCallback(async quizId => {
    if (!session) {
      rememberReturnTo("#/quizzes");
      rememberPendingQuiz(quizId);
      navigate("#/login");
      return;
    }
    setActionBusy(`start-${quizId}`);
    try {
      const attempt = await api.startAttempt(quizId);
      setAttempts(current => ({ ...current, [attempt.attemptId]: attempt }));
      setSelections(current => ({ ...current, [attempt.attemptId]: readAnswers(attempt.attemptId) }));
      navigate(`#/attempt/${attempt.attemptId}`);
    } catch (error) {
      if (!handleAuthError(error, "#/quizzes")) toast(friendlyError(error), "error");
    } finally {
      setActionBusy("");
    }
  }, [api, handleAuthError, session, toast]);

  const submitLogin = useCallback(async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const username = String(data.get("username") || "").trim();
    setActionBusy("login");
    setLoginError("");
    try {
      const token = await api.login(username, String(data.get("password") || ""));
      const nextSession = writeSession(token, username);
      setSession(nextSession);
      setPasswordError("");
      toast("Вхід успішний. Вітаємо!");

      const pendingQuiz = consumePendingQuiz();
      if (pendingQuiz) {
        const authenticatedApi = new QuizApi({ baseUrl: apiUrl, getToken: () => nextSession.accessToken });
        const attempt = await authenticatedApi.startAttempt(pendingQuiz);
        setAttempts(current => ({ ...current, [attempt.attemptId]: attempt }));
        setSelections(current => ({ ...current, [attempt.attemptId]: readAnswers(attempt.attemptId) }));
        consumeReturnTo();
        navigate(`#/attempt/${attempt.attemptId}`);
      } else {
        navigate(consumeReturnTo());
      }
    } catch (error) {
      setLoginError(error instanceof ApiError && [401, 403].includes(error.status)
        ? "Невірний логін або пароль."
        : friendlyError(error));
    } finally {
      setActionBusy("");
    }
  }, [api, apiUrl, toast]);

  const submitRegistration = useCallback(async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    const confirmation = String(data.get("confirmPassword") || "");
    setSignupError("");
    if (password !== confirmation) {
      setSignupError("Паролі не збігаються.");
      return;
    }
    if (/\s/.test(password)) {
      setSignupError("Пароль не повинен містити пробіли.");
      return;
    }
    const account = {
      username: String(data.get("username") || "").trim(),
      firstName: String(data.get("firstName") || "").trim(),
      lastName: String(data.get("lastName") || "").trim(),
      password
    };
    setActionBusy("signup");
    try {
      const token = await api.register(account);
      const nextSession = writeSession(token, account.username);
      setSession(nextSession);
      setPasswordError("");
      toast("Обліковий запис створено. Вітаємо!");

      const pendingQuiz = consumePendingQuiz();
      if (pendingQuiz) {
        const authenticatedApi = new QuizApi({ baseUrl: apiUrl, getToken: () => nextSession.accessToken });
        const attempt = await authenticatedApi.startAttempt(pendingQuiz);
        setAttempts(current => ({ ...current, [attempt.attemptId]: attempt }));
        setSelections(current => ({ ...current, [attempt.attemptId]: readAnswers(attempt.attemptId) }));
        consumeReturnTo();
        navigate(`#/attempt/${attempt.attemptId}`);
      } else {
        navigate(consumeReturnTo());
      }
    } catch (error) {
      setSignupError(error instanceof ApiError && error.status === 409
        ? "Цей логін уже зайнятий. Оберіть інший."
        : friendlyError(error));
    } finally {
      setActionBusy("");
    }
  }, [api, apiUrl, toast]);

  const changePassword = useCallback(async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword") || "");
    const newPassword = String(data.get("newPassword") || "");
    const confirmation = String(data.get("confirmPassword") || "");
    setPasswordError("");
    if (newPassword !== confirmation) {
      setPasswordError("Нові паролі не збігаються.");
      return;
    }
    if (/\s/.test(newPassword)) {
      setPasswordError("Новий пароль не повинен містити пробіли.");
      return;
    }
    setActionBusy("password");
    try {
      await api.changePassword(currentPassword, newPassword);
      clearSession();
      setSession(null);
      setProfile(null);
      setResults(null);
      setAdminData(null);
      toast("Пароль змінено. Увійдіть із новим паролем.");
      navigate("#/login");
    } catch (error) {
      if (handleAuthError(error, "#/profile")) return;
      setPasswordError(error instanceof ApiError && error.status === 400
        ? "Поточний пароль неправильний."
        : error instanceof ApiError && error.status === 409
          ? "Новий пароль має відрізнятися від поточного."
          : friendlyError(error));
    } finally {
      setActionBusy("");
    }
  }, [api, handleAuthError, toast]);

  const logout = useCallback(() => {
    clearSession();
    // Dropping the cached data is the account effect's job, and only its job:
    // this bug existed because signing out cleared some of it here while
    // signing in as somebody else cleared almost none over there.
    setSession(null);
    setPasswordError("");
    toast("Ви вийшли з облікового запису.");
    navigate("#/");
  }, [toast]);

  const executeAdmin = useCallback(async (key, operation, successMessage) => {
    setActionBusy(`admin-${key}`);
    try {
      const result = await operation();
      await loadAdmin();
      toast(successMessage);
      return result;
    } catch (error) {
      if (!handleAuthError(error, "#/admin")) toast(friendlyError(error), "error");
      return null;
    } finally {
      setActionBusy("");
    }
  }, [handleAuthError, loadAdmin, toast]);

  const toggleAnswer = useCallback((attemptId, answerId, checked) => {
    setSelections(current => {
      const next = new Set(current[attemptId] ?? readAnswers(attemptId));
      if (checked) next.add(answerId);
      else next.delete(answerId);
      return { ...current, [attemptId]: next };
    });
  }, []);

  // Persistence mirrors the committed state rather than running inside the
  // updater. A state updater must be pure: StrictMode invokes it twice, and
  // under a concurrent re-render it can run against state that is never
  // committed — writing answers the reader never actually selected.
  useEffect(() => {
    for (const [attemptId, answers] of Object.entries(selections)) {
      writeAnswers(attemptId, answers);
    }
  }, [selections]);

  // `confirm` is false when the deadline submits instead of the reader: there is
  // nothing to agree to, and a dialog nobody is there to dismiss would hold the
  // answers until the attempt expired — the very thing this avoids.
  const completeAttempt = useCallback(async (attemptId, { confirm = true } = {}) => {
    if (completionRequests.current.has(attemptId)) return;
    const selected = selections[attemptId] || readAnswers(attemptId);
    if (confirm
        && !window.confirm(`Надіслати ${selected.size} вибраних відповідей? Завершення не можна скасувати.`)) {
      return;
    }
    completionRequests.current.add(attemptId);
    setActionBusy(`complete-${attemptId}`);
    try {
      const result = await api.completeAttempt(attemptId, [...selected]);
      setCompletions(current => ({ ...current, [attemptId]: result }));
      setResults(null);
      setAdminData(null);
      clearAnswers(attemptId);
      // Drop it from state as well: the mirror effect writes every entry it
      // finds, so leaving this one behind would restore what was just cleared.
      setSelections(current => {
        const next = { ...current };
        delete next[attemptId];
        return next;
      });
      toast("Тест завершено. Результат збережено.");
    } catch (error) {
      if (!handleAuthError(error, `#/attempt/${attemptId}`)) toast(friendlyError(error), "error");
    } finally {
      completionRequests.current.delete(attemptId);
      setActionBusy("");
    }
  }, [api, handleAuthError, selections, toast]);

  // The timer under the countdown promises the attempt finishes by itself, and
  // it did not: at zero the form stayed open, the reader pressed the button, and
  // the API refused a submission it stamps after the deadline — losing every
  // answer to a conflict message.
  //
  // One timer computed from the absolute deadline, not a per-second countdown,
  // so nothing accumulates drift; and it is recomputed on every answer, because
  // choosing one rebuilds completeAttempt. A backgrounded tab can still have its
  // timer throttled past the deadline, and then the API refuses the completion
  // exactly as it did before — late is the old behaviour, not a new failure.
  //
  // Only the attempt on screen is watched. Walking away from one leaves it to
  // expire server-side, which is what already happened.
  useEffect(() => {
    if (route.name !== "attempt") return undefined;
    const attemptId = Number(route.params[0]);
    const attempt = attempts[attemptId];
    if (!attempt || attempt.completed || completions[attemptId]) return undefined;

    const delay = autoSubmitDelay(attempt.expiresAt);
    if (delay === null) return undefined;

    const timer = window.setTimeout(() => {
      void completeAttempt(attemptId, { confirm: false });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [attempts, completeAttempt, completions, route]);

  // The checkbox is controlled by this Set, so its identity has to survive a
  // re-render that changed nothing about the attempt. Built inline, the
  // readAnswers fallback produced a fresh Set on every App render — and the App
  // re-renders whenever the silent token refresh calls setSession, which at the
  // short JWT_TTL the E2E uses is every few seconds. A click landing in that
  // window could be reverted before React committed it, which is what
  // "Clicking the checkbox did not change its state" looks like from Playwright.
  const attemptSelection = useMemo(() => {
    if (route.name !== "attempt") return EMPTY_SELECTION;
    const attemptId = Number(route.params[0]);
    if (!Number.isInteger(attemptId) || attemptId <= 0) return EMPTY_SELECTION;
    return selections[attemptId] ?? readAnswers(attemptId);
  }, [route.name, route.params, selections]);

  const testConnection = useCallback(async value => {
    setConnection("checking");
    setSettingsError("");
    try {
      const probe = new QuizApi({ baseUrl: value, readsServerClock: false });
      const health = await probe.health();
      if (String(health?.status).toUpperCase() === "UP") {
        setConnection("ok");
        return true;
      }
      setConnection("error");
      setSettingsError("API відповів, але його стан не UP.");
    } catch (error) {
      setConnection("error");
      setSettingsError(friendlyError(error));
    }
    return false;
  }, []);

  const saveApiUrl = useCallback(async value => {
    try {
      const normalized = normalizeBaseUrl(value);
      writeApiUrl(normalized);
      setApiUrl(normalized);
      setQuizzes(null);
      setResults(null);
      setAdminData(null);
      setAdminUsersPage(0);
      setAdminResultsPage(0);
      if (await testConnection(normalized)) toast("Адресу API збережено.");
    } catch (error) {
      setConnection("error");
      setSettingsError(error.message);
    }
  }, [testConnection, toast]);

  let page;
  if (route.name === "home") {
    page = <HomePage session={session} quizzes={quizzes} summary={catalogueSummary} loading={quizzesLoading} error={quizError} busy={actionBusy} onRetry={loadQuizzes} onStart={startQuiz} />;
  } else if (route.name === "quizzes") {
    page = <QuizzesPage quizzes={quizzes} pageMeta={quizzesMeta} loading={quizzesLoading} error={quizError} busy={actionBusy} search={search} filter={filter} onSearch={setSearch} onFilter={setFilter} onPageChange={setQuizzesPage} onRetry={loadQuizzes} onStart={startQuiz} />;
  } else if (route.name === "login") {
    page = <LoginPage error={loginError} busy={actionBusy === "login"} onSubmit={submitLogin} />;
  } else if (route.name === "signup") {
    page = <SignupPage error={signupError} busy={actionBusy === "signup"} onSubmit={submitRegistration} />;
  } else if (route.name === "profile") {
    page = <ProfilePage profile={profile} loading={profileLoading} error={profileError} passwordError={passwordError} busy={actionBusy === "password"} onRetry={loadProfile} onPasswordChange={changePassword} />;
  } else if (route.name === "settings") {
    page = <SettingsPage apiUrl={apiUrl} connection={connection} error={settingsError} onSave={saveApiUrl} onTest={testConnection} />;
  } else if (route.name === "results") {
    page = <ResultsPage results={results} loading={resultsLoading} error={resultError} onRetry={loadResults} />;
  } else if (route.name === "attempt") {
    const attemptId = Number(route.params[0]);
    const invalid = !Number.isInteger(attemptId) || attemptId <= 0;
    page = <AttemptPage attempt={attempts[attemptId]} loading={Boolean(attemptLoading[attemptId])} error={invalid ? "Некоректний номер спроби." : attemptErrors[attemptId]} selected={attemptSelection} completion={completions[attemptId]} busy={actionBusy === `complete-${attemptId}`} onToggle={toggleAnswer} onComplete={completeAttempt} />;
  } else if (route.name === "admin") {
    page = <AdminPage data={adminData} loading={adminLoading} error={adminError} busy={actionBusy} api={api} resultRange={adminResultRange} onResultRangeChange={changeAdminResultRange} onUsersPageChange={setAdminUsersPage} onResultsPageChange={setAdminResultsPage} onRetry={loadAdmin} onExecute={executeAdmin} />;
  } else {
    page = <NotFoundPage />;
  }

  return <Layout route={route} session={session} onLogout={logout} toasts={toasts}>{page}</Layout>;
}
