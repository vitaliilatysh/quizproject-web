import { useCallback, useEffect, useRef, useState } from "react";
import { pageTitle, useRoute } from "./app/navigation.js";
import { useToasts } from "./app/use-toasts.js";
import {
  AdminPage,
  AttemptPage,
  HomePage,
  Layout,
  LoginPage,
  NotFoundPage,
  ProfilePage,
  QuizzesPage,
  ResultsPage,
  SettingsPage,
  SignupPage
} from "./components.js";
import { useAccountData } from "./features/account/use-account-data.js";
import { useAdminData } from "./features/admin/use-admin-data.js";
import { useAttempts } from "./features/attempts/use-attempts.js";
import { useAuthActions } from "./features/auth/use-auth-actions.js";
import { useAuthSession } from "./features/auth/use-auth-session.js";
import { useQuizCatalogue } from "./features/catalogue/use-quiz-catalogue.js";
import { useApiSettings } from "./features/settings/use-api-settings.js";

export { friendlyError } from "./app/errors.js";

export default function App() {
  const route = useRoute();
  const [actionBusy, setActionBusy] = useState("");
  const { toasts, toast } = useToasts();

  // Settings and auth sit above the feature stores because both determine
  // which API client every feature uses. Stable relay callbacks break the
  // dependency cycle without teaching either hook about unrelated data.
  const protectedReset = useRef<() => void>(null!);
  const apiReset = useRef<(external: boolean) => void>(null!);
  const onUnauthorized = useCallback(() => protectedReset.current(), []);
  const onApiChanged = useCallback((external: boolean) => apiReset.current(external), []);
  const settings = useApiSettings(toast, onApiChanged);
  const auth = useAuthSession(settings.apiUrl, toast, onUnauthorized);
  const accountName = auth.session?.username ?? null;
  const activeAccount = useRef<string | null>(accountName);

  const catalogue = useQuizCatalogue(auth.api, route.name);
  const account = useAccountData(
    auth.api,
    auth.session,
    auth.accessReady,
    route.name,
    activeAccount,
    auth.handleAuthError
  );
  const admin = useAdminData(
    auth.api,
    auth.session,
    auth.accessReady,
    route.name,
    activeAccount,
    auth.handleAuthError,
    setActionBusy,
    toast
  );
  const onAttemptCompletion = useCallback(() => {
    account.invalidateResults();
    admin.invalidate();
  }, [account.invalidateResults, admin.invalidate]);
  const attempts = useAttempts(
    auth.api,
    auth.session,
    auth.accessReady,
    route,
    activeAccount,
    auth.handleAuthError,
    setActionBusy,
    toast,
    onAttemptCompletion
  );

  const resetProtectedData = useCallback(() => {
    account.reset();
    admin.invalidate();
  }, [account.reset, admin.invalidate]);
  const authActions = useAuthActions({
    api: auth.api,
    apiUrl: settings.apiUrl,
    setSession: auth.setSession,
    setActionBusy,
    handleAuthError: auth.handleAuthError,
    rememberAttempt: attempts.rememberAttempt,
    resetProtectedData,
    toast
  });

  // The relays always point at the latest feature callbacks while preserving a
  // stable identity for the settings/session effects that subscribe to them.
  protectedReset.current = resetProtectedData;
  apiReset.current = external => {
    catalogue.invalidate();
    if (external) account.reset();
    else account.invalidateResults();
    admin.reset();
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${route.name === "home" ? "Quiz Project" : pageTitle(route.name)} — Quiz Project`;
  }, [route]);

  // A token refresh keeps the same owner. A genuinely different login drops
  // every account-bound cache, including answers persisted outside React.
  useEffect(() => {
    if (accountName === null || activeAccount.current === accountName) return;
    activeAccount.current = accountName;
    account.reset();
    admin.reset();
    attempts.reset();
  }, [account.reset, accountName, admin.reset, attempts.reset]);

  const logout = useCallback(() => {
    authActions.clearPasswordError();
    auth.logout();
  }, [auth.logout, authActions.clearPasswordError]);

  let page;
  if (route.name === "home") {
    page = <HomePage
      session={auth.session}
      quizzes={catalogue.quizzes}
      summary={catalogue.summary}
      loading={catalogue.loading}
      error={catalogue.error}
      busy={actionBusy}
      onRetry={() => void catalogue.load()}
      onStart={quizId => void attempts.start(quizId)}
    />;
  } else if (route.name === "quizzes") {
    page = <QuizzesPage
      quizzes={catalogue.quizzes}
      pageMeta={catalogue.pageMeta}
      loading={catalogue.loading}
      error={catalogue.error}
      busy={actionBusy}
      search={catalogue.search}
      filter={catalogue.filter}
      onSearch={catalogue.setSearch}
      onFilter={catalogue.setFilter}
      onPageChange={catalogue.setPage}
      onRetry={() => void catalogue.load()}
      onStart={quizId => void attempts.start(quizId)}
    />;
  } else if (route.name === "login") {
    page = <LoginPage
      error={authActions.loginError}
      busy={actionBusy === "login"}
      onSubmit={event => void authActions.submitLogin(event)}
    />;
  } else if (route.name === "signup") {
    page = <SignupPage
      error={authActions.signupError}
      busy={actionBusy === "signup"}
      onSubmit={event => void authActions.submitRegistration(event)}
    />;
  } else if (route.name === "profile") {
    page = <ProfilePage
      profile={account.profile}
      loading={account.profileLoading}
      error={account.profileError}
      passwordError={authActions.passwordError}
      busy={actionBusy === "password"}
      onRetry={() => void account.loadProfile()}
      onPasswordChange={event => void authActions.changePassword(event)}
    />;
  } else if (route.name === "settings") {
    page = <SettingsPage
      apiUrl={settings.apiUrl}
      connection={settings.connection}
      error={settings.error}
      onSave={value => void settings.save(value)}
      onTest={value => void settings.testConnection(value)}
    />;
  } else if (route.name === "results") {
    page = <ResultsPage
      results={account.results}
      loading={account.resultsLoading}
      error={account.resultError}
      onRetry={() => void account.loadResults()}
    />;
  } else if (route.name === "attempt") {
    const attemptId = Number(route.params[0]);
    const invalid = !Number.isInteger(attemptId) || attemptId <= 0;
    page = <AttemptPage
      attempt={attempts.attempts[attemptId]}
      loading={Boolean(attempts.loading[attemptId])}
      error={invalid ? "Некоректний номер спроби." : attempts.errors[attemptId]}
      selected={attempts.selection}
      completion={attempts.completions[attemptId]}
      busy={actionBusy === `complete-${attemptId}`}
      onToggle={attempts.toggle}
      onComplete={id => void attempts.complete(id)}
    />;
  } else if (route.name === "admin") {
    page = <AdminPage
      data={admin.data}
      loading={admin.loading}
      error={admin.error}
      busy={actionBusy}
      api={auth.api}
      resultRange={admin.resultRange}
      onResultRangeChange={admin.changeResultRange}
      onUsersPageChange={admin.setUsersPage}
      onResultsPageChange={admin.setResultsPage}
      onRetry={() => void admin.load()}
      onExecute={admin.execute}
    />;
  } else {
    page = <NotFoundPage />;
  }

  return <Layout route={route} session={auth.session} onLogout={logout} toasts={toasts}>{page}</Layout>;
}
