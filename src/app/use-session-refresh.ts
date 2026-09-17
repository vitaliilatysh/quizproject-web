import { useEffect, type Dispatch, type SetStateAction } from "react";
import { ApiError, type QuizApi } from "../api.js";
import { clearSession, writeSession, type Session } from "../session.js";

// Renew up to a minute early, but never earlier than halfway through a token's
// remaining life. A fixed one-minute margin collapses short-lived tokens to a
// zero-delay loop: installing each refreshed session immediately schedules the
// next refresh. The full-stack tests deliberately use a fifteen-second TTL.
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
    const remaining = session.expiresAt - Date.now();
    let timer = window.setTimeout(attemptRefresh,
      Math.max(0, remaining - Math.min(TOKEN_REFRESH_MARGIN_MS, remaining / 2)));

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

