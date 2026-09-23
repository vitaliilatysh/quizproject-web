import { useCallback, useRef, useState, type RefObject } from "react";
import type { QuizApi } from "../../api.js";
import { friendlyError } from "../../app/errors.js";
import type { AdminQuestion } from "../../types.js";
import type { Session } from "../../session.js";

type HandleAuthError = (error: unknown, returnTo: string) => boolean;

interface AdminQuestionsOptions {
  api: QuizApi;
  session: Session | null;
  activeAccount: RefObject<string | null>;
  handleAuthError: HandleAuthError;
}

/**
 * The questions of one quiz, loaded on demand for the admin panel.
 *
 * Separate from useAdminData because the trigger is different: that hook loads
 * six collections once for the screen, this one reloads for whichever quiz is
 * selected. It was previously inline in AdminPage and was the only data load in
 * the application with none of the guards the others carry — a 401 left the
 * session alive behind an error message, the correlation id never reached the
 * reader, and a slow response could overwrite a newer one.
 */
export function useAdminQuestions({ api, session, activeAccount, handleAuthError }: AdminQuestionsOptions) {
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // The quiz the most recent call asked for. The other hooks guard with an
  // in-flight flag, which is right when every call asks for the same thing:
  // the second call is redundant and dropping it costs nothing. Here each call
  // asks for a different quiz, so dropping the newer one would leave the reader
  // looking at the quiz they just navigated away from. The answer that arrives
  // for a quiz nobody is looking at any more is the one to drop instead.
  const requested = useRef("");

  const load = useCallback(
    async (quizId: string): Promise<void> => {
      requested.current = quizId;
      if (!quizId) {
        setQuestions([]);
        setError("");
        setLoading(false);
        return;
      }
      const requestedBy = session?.username ?? null;
      setLoading(true);
      setError("");
      try {
        const loaded = await api.adminQuestions(quizId);
        if (requested.current !== quizId || activeAccount.current !== requestedBy) return;
        setQuestions(loaded);
      } catch (reason) {
        if (requested.current !== quizId) return;
        if (handleAuthError(reason, "#/admin")) return;
        setError(friendlyError(reason));
      } finally {
        // Only the answer still being waited on may take the spinner down; a
        // superseded one would clear it while its replacement is still in flight.
        if (requested.current === quizId) setLoading(false);
      }
    },
    [activeAccount, api, handleAuthError, session]
  );

  const reset = useCallback(() => {
    requested.current = "";
    setQuestions([]);
    setError("");
    setLoading(false);
  }, []);

  return { questions, loading, error, load, reset };
}
