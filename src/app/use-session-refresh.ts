import { useEffect, type Dispatch, type SetStateAction } from "react";
import { ApiError, type QuizApi } from "../api.js";
import { clearSession, writeSession, type Session } from "../session.js";

const TOKEN_REFRESH_MARGIN_MS = 60_000;
const TOKEN_REFRESH_RETRY_MS = 30_000;

export function useSessionRefresh(
  api: QuizApi,
  session: Session | null,
  setSession: Dispatch<SetStateAction<Session | null>>
): void {
  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    let timer = window.setTimeout(attemptRefresh,
      Math.max(0, session.expiresAt - Date.now() - TOKEN_REFRESH_MARGIN_MS));

    async function attemptRefresh(): Promise<void> {
      try {
        const tokenResponse = await api.refresh(session!.refreshToken);
        if (!cancelled) setSession(writeSession(tokenResponse, session!.username));
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
  }, [api, session, setSession]);
}
