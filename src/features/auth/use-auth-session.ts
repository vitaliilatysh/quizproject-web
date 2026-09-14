import { useCallback, useMemo, useState } from "react";
import { ApiError, QuizApi } from "../../api.js";
import { navigate } from "../../app/navigation.js";
import { useSessionRefresh } from "../../app/use-session-refresh.js";
import {
  clearSession,
  readSession,
  rememberReturnTo,
  type Session
} from "../../session.js";

type ToastMessage = (message: string, tone?: string) => void;

export function useAuthSession(apiUrl: string, toast: ToastMessage, onUnauthorized: () => void) {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const api = useMemo(() => new QuizApi({
    baseUrl: apiUrl,
    getToken: () => session?.accessToken
  }), [apiUrl, session?.accessToken]);

  useSessionRefresh(api, session, setSession);

  const handleAuthError = useCallback((error: unknown, returnTo: string): boolean => {
    if (!(error instanceof ApiError) || error.status !== 401) return false;
    clearSession();
    setSession(null);
    onUnauthorized();
    rememberReturnTo(returnTo);
    toast("Сесія завершилась. Увійдіть ще раз.", "error");
    navigate("#/login");
    return true;
  }, [onUnauthorized, toast]);

  const logout = useCallback((): void => {
    void api.logout().catch(() => undefined);
    clearSession();
    setSession(null);
    toast("Ви вийшли з облікового запису.");
    navigate("#/");
  }, [api, toast]);

  return { api, session, setSession, handleAuthError, logout };
}
