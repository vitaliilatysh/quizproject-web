import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { ApiError, type QuizApi } from "../../api.js";
import { friendlyError } from "../../app/errors.js";
import { navigate } from "../../app/navigation.js";
import { rememberReturnTo, type Session } from "../../session.js";
import type { AdminData, ExecuteAdmin, ResultRange } from "./contracts.js";

const PAGE_SIZE = 20;
type HandleAuthError = (error: unknown, returnTo: string) => boolean;
type ToastMessage = (message: string, tone?: string) => void;

export function useAdminData(
  api: QuizApi,
  session: Session | null,
  accessReady: boolean,
  routeName: string,
  activeAccount: RefObject<string | null>,
  handleAuthError: HandleAuthError,
  setActionBusy: Dispatch<SetStateAction<string>>,
  toast: ToastMessage
) {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [usersPage, setUsersPage] = useState(0);
  const [resultsPage, setResultsPage] = useState(0);
  const [resultRange, setResultRange] = useState<ResultRange>({ from: "", to: "" });
  const requestInFlight = useRef(false);

  const changeResultRange = useCallback((patch: Partial<ResultRange>): void => {
    setResultsPage(0);
    setResultRange(current => ({ ...current, ...patch }));
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (!session || requestInFlight.current) return;
    const requestedBy = session.username;
    requestInFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const [subjects, levels, quizzes, users, results] = await Promise.all([
        api.adminSubjects(),
        api.adminLevels(),
        api.adminQuizzes(),
        api.adminUsers({ page: usersPage, size: PAGE_SIZE }),
        api.adminResults({
          from: resultRange.from || undefined,
          to: resultRange.to || undefined,
          page: resultsPage,
          size: PAGE_SIZE
        })
      ]);
      if (activeAccount.current !== requestedBy) return;
      setData({
        subjects,
        levels,
        quizzes,
        users: users.items,
        usersPage: users.page,
        results: results.items,
        resultsPage: results.page
      });
    } catch (reason) {
      if (handleAuthError(reason, "#/admin")) return;
      setError(reason instanceof ApiError && reason.status === 403
        ? "Для цієї сторінки потрібна роль адміністратора."
        : friendlyError(reason));
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [activeAccount, api, handleAuthError, resultRange.from, resultRange.to, resultsPage, session, usersPage]);

  useEffect(() => {
    setData(null);
    setLoading(true);
  }, [resultRange.from, resultRange.to, resultsPage, usersPage]);

  useEffect(() => {
    if (routeName !== "admin") return;
    if (!session) {
      rememberReturnTo("#/admin");
      navigate("#/login");
    } else if (accessReady && data === null) {
      void load();
    }
  }, [accessReady, data, load, routeName, session]);

  const execute = useCallback(
    async <T,>(key: string, operation: () => Promise<T>, successMessage: string): Promise<T | null> => {
      setActionBusy(`admin-${key}`);
      try {
        const result = await operation();
        await load();
        toast(successMessage);
        return result;
      } catch (reason) {
        if (!handleAuthError(reason, "#/admin")) toast(friendlyError(reason), "error");
        return null;
      } finally {
        setActionBusy("");
      }
    }, [handleAuthError, load, setActionBusy, toast]) satisfies ExecuteAdmin;

  const invalidate = useCallback(() => setData(null), []);

  const reset = useCallback(() => {
    setUsersPage(0);
    setResultsPage(0);
    setResultRange({ from: "", to: "" });
    setData(null);
  }, []);

  return {
    data,
    loading,
    error,
    resultRange,
    setUsersPage,
    setResultsPage,
    changeResultRange,
    load,
    execute,
    invalidate,
    reset
  };
}
