import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, QuizApi, normalizeBaseUrl } from "./api.js";
import {
  clearAnswers,
  clearSession,
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
import { parseRoute, safeHash } from "./utils.js";

function navigate(hash) {
  globalThis.location.hash = safeHash(hash);
}

function friendlyError(error) {
  return error instanceof Error
    ? error.message
    : "Сталася неочікувана помилка. Спробуйте ще раз.";
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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [toasts, setToasts] = useState([]);
  const quizzesRequest = useRef(false);
  const resultsRequest = useRef(false);
  const adminRequest = useRef(false);
  const profileRequest = useRef(false);
  const attemptRequests = useRef(new Set());

  const api = useMemo(() => new QuizApi({
    baseUrl: apiUrl,
    getToken: () => session?.accessToken
  }), [apiUrl, session?.accessToken]);

  const toast = useCallback((message, tone = "success") => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setToasts(current => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), 4200);
  }, []);

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

  const loadQuizzes = useCallback(async () => {
    if (quizzesRequest.current) return;
    quizzesRequest.current = true;
    setQuizzesLoading(true);
    setQuizError("");
    try {
      setQuizzes(await api.quizzes());
    } catch (error) {
      setQuizError(friendlyError(error));
    } finally {
      quizzesRequest.current = false;
      setQuizzesLoading(false);
    }
  }, [api]);

  const loadResults = useCallback(async () => {
    if (!session || resultsRequest.current) return;
    resultsRequest.current = true;
    setResultsLoading(true);
    setResultError("");
    try {
      setResults(await api.results());
    } catch (error) {
      if (!handleAuthError(error, "#/results")) setResultError(friendlyError(error));
    } finally {
      resultsRequest.current = false;
      setResultsLoading(false);
    }
  }, [api, handleAuthError, session]);

  const loadAttempt = useCallback(async attemptId => {
    if (!session || !Number.isInteger(attemptId) || attemptId <= 0 || attemptRequests.current.has(attemptId)) return;
    attemptRequests.current.add(attemptId);
    setAttemptLoading(current => ({ ...current, [attemptId]: true }));
    setAttemptErrors(current => ({ ...current, [attemptId]: "" }));
    try {
      const attempt = await api.attempt(attemptId);
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

  const loadAdmin = useCallback(async () => {
    if (!session || adminRequest.current) return;
    adminRequest.current = true;
    setAdminLoading(true);
    setAdminError("");
    try {
      const [subjects, levels, adminQuizzes, users, allResults] = await Promise.all([
        api.adminSubjects(), api.adminLevels(), api.adminQuizzes(), api.adminUsers(), api.adminResults()
      ]);
      setAdminData({ subjects, levels, quizzes: adminQuizzes, users, results: allResults });
    } catch (error) {
      if (handleAuthError(error, "#/admin")) return;
      setAdminError(error instanceof ApiError && error.status === 403
        ? "Для цієї сторінки потрібна роль адміністратора."
        : friendlyError(error));
    } finally {
      adminRequest.current = false;
      setAdminLoading(false);
    }
  }, [api, handleAuthError, session]);

  const loadProfile = useCallback(async () => {
    if (!session || profileRequest.current) return;
    profileRequest.current = true;
    setProfileLoading(true);
    setProfileError("");
    try {
      setProfile(await api.profile());
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
    if (["home", "quizzes"].includes(route.name) && quizzes === null && !quizzesLoading) {
      void loadQuizzes();
    }
  }, [loadQuizzes, quizzes, quizzesLoading, route.name]);

  useEffect(() => {
    if (route.name !== "results") return;
    if (!session) {
      rememberReturnTo("#/results");
      navigate("#/login");
      return;
    }
    if (results === null && !resultsLoading) void loadResults();
  }, [loadResults, results, resultsLoading, route.name, session]);

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
      setProfile(null);
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
      setProfile(null);
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
    setSession(null);
    setResults(null);
    setAdminData(null);
    setProfile(null);
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
      const next = new Set(current[attemptId] || readAnswers(attemptId));
      if (checked) next.add(answerId);
      else next.delete(answerId);
      writeAnswers(attemptId, next);
      return { ...current, [attemptId]: next };
    });
  }, []);

  const completeAttempt = useCallback(async attemptId => {
    const selected = selections[attemptId] || readAnswers(attemptId);
    if (!window.confirm(`Надіслати ${selected.size} вибраних відповідей? Завершення не можна скасувати.`)) return;
    setActionBusy(`complete-${attemptId}`);
    try {
      const result = await api.completeAttempt(attemptId, [...selected]);
      setCompletions(current => ({ ...current, [attemptId]: result }));
      setResults(null);
      setAdminData(null);
      clearAnswers(attemptId);
      toast("Тест завершено. Результат збережено.");
    } catch (error) {
      if (!handleAuthError(error, `#/attempt/${attemptId}`)) toast(friendlyError(error), "error");
    } finally {
      setActionBusy("");
    }
  }, [api, handleAuthError, selections, toast]);

  const testConnection = useCallback(async value => {
    setConnection("checking");
    setSettingsError("");
    try {
      const probe = new QuizApi({ baseUrl: value });
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
      if (await testConnection(normalized)) toast("Адресу API збережено.");
    } catch (error) {
      setConnection("error");
      setSettingsError(error.message);
    }
  }, [testConnection, toast]);

  let page;
  if (route.name === "home") {
    page = <HomePage session={session} quizzes={quizzes} loading={quizzesLoading} error={quizError} busy={actionBusy} onRetry={loadQuizzes} onStart={startQuiz} />;
  } else if (route.name === "quizzes") {
    page = <QuizzesPage quizzes={quizzes} loading={quizzesLoading} error={quizError} busy={actionBusy} search={search} filter={filter} onSearch={setSearch} onFilter={setFilter} onRetry={loadQuizzes} onStart={startQuiz} />;
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
    page = <AttemptPage attempt={attempts[attemptId]} loading={Boolean(attemptLoading[attemptId])} error={invalid ? "Некоректний номер спроби." : attemptErrors[attemptId]} selected={invalid ? new Set() : selections[attemptId] || readAnswers(attemptId)} completion={completions[attemptId]} busy={actionBusy === `complete-${attemptId}`} onToggle={toggleAnswer} onComplete={completeAttempt} />;
  } else if (route.name === "admin") {
    page = <AdminPage data={adminData} loading={adminLoading} error={adminError} busy={actionBusy} api={api} onRetry={loadAdmin} onExecute={executeAdmin} />;
  } else {
    page = <NotFoundPage />;
  }

  return <Layout route={route} session={session} onLogout={logout} toasts={toasts}>{page}</Layout>;
}
