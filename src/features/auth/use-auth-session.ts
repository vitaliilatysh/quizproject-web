import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, normalizeBaseUrl, QuizApi } from "../../api.js";
import { navigate } from "../../app/navigation.js";
import { useSessionRefresh } from "../../app/use-session-refresh.js";
import { clearSession, readSession, rememberReturnTo, type Session } from "../../session.js";

type ToastMessage = (message: string, tone?: string) => void;

export function useAuthSession(apiUrl: string, toast: ToastMessage, onUnauthorized: () => void) {
  const normalizedApiUrl = normalizeBaseUrl(apiUrl);
  const [storedSession, setSession] = useState<Session | null>(() => readSession(normalizedApiUrl));
  // Gate credentials during render, before effects or feature loaders can use
  // the newly selected API. Storage cleanup alone would leave that gap open.
  const session = storedSession?.apiUrl === normalizedApiUrl ? storedSession : null;
  useEffect(() => {
    if (storedSession && !session) {
      clearSession();
      setSession(null);
    }
  }, [session, storedSession]);
  // A restored session may legitimately have an expired access token while its
  // refresh token still lives. Protected feature loaders must wait for the
  // refresh effect instead of racing it with a request guaranteed to answer 401.
  const accessReady = session === null || session.expiresAt > Date.now();
  const api = useMemo(
    () =>
      new QuizApi({
        baseUrl: normalizedApiUrl,
        getToken: () => session?.accessToken
      }),
    [normalizedApiUrl, session?.accessToken]
  );

  useSessionRefresh(api.auth, session, setSession);

  const handleAuthError = useCallback(
    (error: unknown, returnTo: string): boolean => {
      if (!(error instanceof ApiError) || error.status !== 401) return false;
      clearSession();
      setSession(null);
      onUnauthorized();
      rememberReturnTo(returnTo);
      toast("Сесія завершилась. Увійдіть ще раз.", "error");
      navigate("#/login");
      return true;
    },
    [onUnauthorized, toast]
  );

  const logout = useCallback((): void => {
    void api.auth.logout().catch(() => undefined);
    clearSession();
    setSession(null);
    toast("Ви вийшли з облікового запису.");
    navigate("#/");
  }, [api, toast]);

  return { api, session, accessReady, setSession, handleAuthError, logout };
}
