import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from "react";
import { ApiError, type QuizApi } from "../../api.js";
import { friendlyError } from "../../app/errors.js";
import { navigate } from "../../app/navigation.js";
import { rememberReturnTo, type Session } from "../../session.js";
import {
  ADMIN_INVALIDATES,
  ADMIN_PARTS,
  type AdminData,
  type AdminPart,
  type ExecuteAdmin,
  type ResultRange
} from "./contracts.js";

const PAGE_SIZE = 20;
type HandleAuthError = (error: unknown, returnTo: string) => boolean;
type ToastMessage = (message: string, tone?: string) => void;

interface AdminDataOptions {
  api: QuizApi;
  session: Session | null;
  accessReady: boolean;
  routeName: string;
  activeAccount: RefObject<string | null>;
  handleAuthError: HandleAuthError;
  setActionBusy: Dispatch<SetStateAction<string>>;
  toast: ToastMessage;
}

export function useAdminData({
  api,
  session,
  accessReady,
  routeName,
  activeAccount,
  handleAuthError,
  setActionBusy,
  toast
}: AdminDataOptions) {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [usersPage, setUsersPage] = useState(0);
  const [resultsPage, setResultsPage] = useState(0);
  const [resultRange, setResultRange] = useState<ResultRange>({ from: "", to: "" });
  const requestInFlight = useRef(false);
  // What a partial load merges into. State would be the value captured when the
  // call was made; a write's answers have to land on whatever is on screen when
  // they arrive.
  const dataRef = useRef<AdminData | null>(null);
  dataRef.current = data;

  const changeResultRange = useCallback((patch: Partial<ResultRange>): void => {
    setResultsPage(0);
    setResultRange(current => ({ ...current, ...patch }));
  }, []);

  /**
   * Loads the panel, or only the parts a write can have changed.
   *
   * With no argument it fetches all six collections and replaces what is on
   * screen: opening the panel, retrying after a failure, turning a page,
   * changing the result range. With a list it asks for those alone and merges
   * the answers in, which is what a mutation does. Every action used to cost the
   * whole fan-out — measured before this, one added subject cost six requests,
   * among them the users page and the date-filtered results query, neither of
   * which the administrator was looking at.
   *
   * A partial load needs something to merge into, so with nothing on screen it
   * widens to everything rather than assembling a half-built panel. Read
   * through a ref, because what to merge into is whatever is current at the
   * moment the answers arrive, not what was current when the call was made.
   */
  const load = useCallback(
    async (parts?: readonly AdminPart[]): Promise<void> => {
      if (!session || requestInFlight.current) return;
      const requestedBy = session.username;
      const whole = parts === undefined || dataRef.current === null;
      const wanted = whole ? new Set(ADMIN_PARTS) : new Set(parts);
      requestInFlight.current = true;
      setLoading(true);
      setError("");
      try {
        const [subjects, levels, quizzes, users, results] = await Promise.all([
          wanted.has("subjects") ? api.adminSubjects() : undefined,
          // Reference data the API offers no way to change, so it is read when
          // the panel is assembled and never again by a write.
          whole ? api.adminLevels() : undefined,
          wanted.has("quizzes") ? api.adminQuizzes() : undefined,
          wanted.has("users") ? api.adminUsers({ page: usersPage, size: PAGE_SIZE }) : undefined,
          wanted.has("results")
            ? api.adminResults({
                from: resultRange.from || undefined,
                to: resultRange.to || undefined,
                page: resultsPage,
                size: PAGE_SIZE
              })
            : undefined
        ]);
        if (activeAccount.current !== requestedBy) return;
        const held = dataRef.current;
        setData({
          subjects: subjects ?? held?.subjects ?? [],
          levels: levels ?? held?.levels ?? [],
          quizzes: quizzes ?? held?.quizzes ?? [],
          users: users ? users.items : (held?.users ?? []),
          usersPage: users ? users.page : (held?.usersPage ?? null),
          results: results ? results.items : (held?.results ?? []),
          resultsPage: results ? results.page : (held?.resultsPage ?? null)
        });
      } catch (reason) {
        if (handleAuthError(reason, "#/admin")) return;
        setError(
          reason instanceof ApiError && reason.status === 403
            ? "Для цієї сторінки потрібна роль адміністратора."
            : friendlyError(reason)
        );
      } finally {
        requestInFlight.current = false;
        setLoading(false);
      }
    },
    [activeAccount, api, handleAuthError, resultRange.from, resultRange.to, resultsPage, session, usersPage]
  );

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
    async <T>(key: string, operation: () => Promise<T>, successMessage: string): Promise<T | null> => {
      setActionBusy(`admin-${key}`);
      try {
        const result = await operation();
        // The key already says which action ran, so it can say what the action
        // reaches. An unmapped key refetches the panel, which is the answer for
        // an action whose reach nobody has established yet.
        await load(ADMIN_INVALIDATES[key] ?? ADMIN_PARTS);
        toast(successMessage);
        return result;
      } catch (reason) {
        if (!handleAuthError(reason, "#/admin")) toast(friendlyError(reason), "error");
        return null;
      } finally {
        setActionBusy("");
      }
    },
    [handleAuthError, load, setActionBusy, toast]
  ) satisfies ExecuteAdmin;

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
