import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { QuizApi } from "../../api.js";
import { friendlyError } from "../../app/errors.js";
import { navigate } from "../../app/navigation.js";
import {
  clearAnswers,
  clearStoredAnswers,
  readAnswers,
  rememberPendingQuiz,
  rememberReturnTo,
  writeAnswers,
  type Session
} from "../../session.js";
import type { Attempt, AttemptCompletion } from "../../types.js";
import { autoSubmitDelay, type Route } from "../../utils.js";

const EMPTY_SELECTION: ReadonlySet<number> = new Set<number>();
type HandleAuthError = (error: unknown, returnTo: string) => boolean;
type ToastMessage = (message: string, tone?: string) => void;

interface AttemptsOptions {
  api: QuizApi;
  session: Session | null;
  accessReady: boolean;
  route: Route;
  activeAccount: RefObject<string | null>;
  handleAuthError: HandleAuthError;
  setActionBusy: Dispatch<SetStateAction<string>>;
  toast: ToastMessage;
  onCompletion: () => void;
}

export function useAttempts({
  api, session, accessReady, route, activeAccount, handleAuthError, setActionBusy, toast, onCompletion
}: AttemptsOptions) {
  const [attempts, setAttempts] = useState<Record<number, Attempt>>({});
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [selections, setSelections] = useState<Record<number, Set<number>>>({});
  const [completions, setCompletions] = useState<Record<number, AttemptCompletion>>({});
  const requests = useRef(new Set<number>());
  const completionRequests = useRef(new Set<number>());

  const rememberAttempt = useCallback((attempt: Attempt): void => {
    setAttempts(current => ({ ...current, [attempt.attemptId]: attempt }));
    setSelections(current => ({ ...current, [attempt.attemptId]: readAnswers(attempt.attemptId) }));
  }, []);

  const load = useCallback(async (attemptId: number): Promise<void> => {
    if (!session || !Number.isInteger(attemptId) || attemptId <= 0 || requests.current.has(attemptId)) return;
    const requestedBy = session.username;
    requests.current.add(attemptId);
    setLoading(current => ({ ...current, [attemptId]: true }));
    setErrors(current => ({ ...current, [attemptId]: "" }));
    try {
      const attempt = await api.attempt(attemptId);
      if (activeAccount.current !== requestedBy) return;
      setAttempts(current => ({ ...current, [attemptId]: attempt }));
      setSelections(current => current[attemptId]
        ? current
        : { ...current, [attemptId]: readAnswers(attemptId) });
    } catch (error) {
      if (!handleAuthError(error, `#/attempt/${attemptId}`)) {
        setErrors(current => ({ ...current, [attemptId]: friendlyError(error) }));
      }
    } finally {
      requests.current.delete(attemptId);
      setLoading(current => ({ ...current, [attemptId]: false }));
    }
  }, [activeAccount, api, handleAuthError, session]);

  const start = useCallback(async (quizId: number): Promise<void> => {
    if (!session) {
      rememberReturnTo("#/quizzes");
      rememberPendingQuiz(quizId);
      navigate("#/login");
      return;
    }
    setActionBusy(`start-${quizId}`);
    try {
      const attempt = await api.startAttempt(quizId);
      rememberAttempt(attempt);
      navigate(`#/attempt/${attempt.attemptId}`);
    } catch (error) {
      if (!handleAuthError(error, "#/quizzes")) toast(friendlyError(error), "error");
    } finally {
      setActionBusy("");
    }
  }, [api, handleAuthError, rememberAttempt, session, setActionBusy, toast]);

  const toggle = useCallback((attemptId: number, answerId: number, checked: boolean): void => {
    setSelections(current => {
      const next = new Set(current[attemptId] ?? readAnswers(attemptId));
      if (checked) next.add(answerId);
      else next.delete(answerId);
      return { ...current, [attemptId]: next };
    });
  }, []);

  useEffect(() => {
    for (const [attemptId, answers] of Object.entries(selections)) writeAnswers(attemptId, answers);
  }, [selections]);

  const complete = useCallback(async (attemptId: number, { confirm = true } = {}): Promise<void> => {
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
      onCompletion();
      clearAnswers(attemptId);
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
  }, [api, handleAuthError, onCompletion, selections, setActionBusy, toast]);

  const routedAttemptId = route.name === "attempt" ? Number(route.params[0]) : null;

  useEffect(() => {
    if (routedAttemptId === null) return;
    setErrors(current => current[routedAttemptId] ? { ...current, [routedAttemptId]: "" } : current);
  }, [routedAttemptId]);

  useEffect(() => {
    if (route.name !== "attempt") return;
    const attemptId = Number(route.params[0]);
    if (!session) {
      rememberReturnTo(`#/attempt/${attemptId}`);
      navigate("#/login");
      return;
    }
    if (accessReady && Number.isInteger(attemptId) && attemptId > 0
        && !attempts[attemptId] && !loading[attemptId] && !errors[attemptId]) {
      void load(attemptId);
    }
  }, [accessReady, attempts, errors, load, loading, route, session]);

  useEffect(() => {
    if (route.name !== "attempt") return undefined;
    const attemptId = Number(route.params[0]);
    const attempt = attempts[attemptId];
    if (!attempt || attempt.completed || completions[attemptId]) return undefined;
    const delay = autoSubmitDelay(attempt.expiresAt);
    if (delay === null) return undefined;
    const timer = window.setTimeout(() => void complete(attemptId, { confirm: false }), delay);
    return () => window.clearTimeout(timer);
  }, [attempts, complete, completions, route]);

  const selection = useMemo((): ReadonlySet<number> => {
    if (route.name !== "attempt") return EMPTY_SELECTION;
    const attemptId = Number(route.params[0]);
    if (!Number.isInteger(attemptId) || attemptId <= 0) return EMPTY_SELECTION;
    return selections[attemptId] ?? readAnswers(attemptId);
  }, [route.name, route.params, selections]);

  const reset = useCallback(() => {
    setAttempts({});
    setErrors({});
    setLoading({});
    setSelections({});
    setCompletions({});
    clearStoredAnswers();
  }, []);

  return { attempts, loading, errors, completions, selection, load, start, toggle, complete, rememberAttempt, reset };
}
