import { useCallback, useRef, useState, type Dispatch, type SubmitEvent, type SetStateAction } from "react";
import { ApiError, normalizeBaseUrl, QuizApi, type QuizApi as QuizApiClient } from "../../api.js";
import { friendlyError } from "../../app/errors.js";
import { navigate } from "../../app/navigation.js";
import { formText } from "../../form-data.js";
import {
  clearSession,
  consumePendingQuiz,
  consumeReturnTo,
  writeSession,
  type Session
} from "../../session.js";
import type { Attempt, RegisterRequest } from "../../types.js";

type HandleAuthError = (error: unknown, returnTo: string) => boolean;
type ToastMessage = (message: string, tone?: string) => void;

interface AuthActionsOptions {
  api: QuizApiClient;
  apiUrl: string;
  setSession: Dispatch<SetStateAction<Session | null>>;
  setActionBusy: Dispatch<SetStateAction<string>>;
  handleAuthError: HandleAuthError;
  rememberAttempt: (attempt: Attempt) => void;
  resetProtectedData: () => void;
  toast: ToastMessage;
}

export function useAuthActions({
  api,
  apiUrl,
  setSession,
  setActionBusy,
  handleAuthError,
  rememberAttempt,
  resetProtectedData,
  toast
}: AuthActionsOptions) {
  const normalizedApiUrl = normalizeBaseUrl(apiUrl);
  const context = useRef({ apiUrl: normalizedApiUrl, generation: 0 });
  if (context.current.apiUrl !== normalizedApiUrl) {
    context.current = { apiUrl: normalizedApiUrl, generation: context.current.generation + 1 };
  }
  const [loginError, setLoginError] = useState("");
  const [signupError, setSignupError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const continueAfterAuthentication = useCallback(
    async (nextSession: Session, generation: number): Promise<void> => {
      const pendingQuiz = consumePendingQuiz();
      if (pendingQuiz) {
        const authenticatedApi = new QuizApi({ baseUrl: apiUrl, getToken: () => nextSession.accessToken });
        const attempt = await authenticatedApi.catalogue.startAttempt(pendingQuiz);
        if (context.current.generation !== generation) return;
        rememberAttempt(attempt);
        consumeReturnTo();
        navigate(`#/attempt/${attempt.attemptId}`);
      } else {
        navigate(consumeReturnTo());
      }
    },
    [apiUrl, rememberAttempt]
  );

  const submitLogin = useCallback(
    async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const username = formText(data, "username").trim();
      const generation = context.current.generation;
      setActionBusy("login");
      setLoginError("");
      try {
        const token = await api.auth.login(username, formText(data, "password"));
        if (context.current.generation !== generation) return;
        const nextSession = writeSession(token, username, normalizedApiUrl);
        setSession(nextSession);
        setPasswordError("");
        toast("Вхід успішний. Вітаємо!");
        await continueAfterAuthentication(nextSession, generation);
      } catch (error) {
        if (context.current.generation !== generation) return;
        setLoginError(
          error instanceof ApiError && [401, 403].includes(error.status)
            ? "Невірний логін або пароль."
            : friendlyError(error)
        );
      } finally {
        if (context.current.generation === generation) setActionBusy("");
      }
    },
    [api, continueAfterAuthentication, normalizedApiUrl, setActionBusy, setSession, toast]
  );

  const submitRegistration = useCallback(
    async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const password = formText(data, "password");
      const confirmation = formText(data, "confirmPassword");
      setSignupError("");
      if (password !== confirmation) {
        setSignupError("Паролі не збігаються.");
        return;
      }
      if (/\s/.test(password)) {
        setSignupError("Пароль не повинен містити пробіли.");
        return;
      }
      const account: RegisterRequest = {
        username: formText(data, "username").trim(),
        firstName: formText(data, "firstName").trim(),
        lastName: formText(data, "lastName").trim(),
        password
      };
      const generation = context.current.generation;
      setActionBusy("signup");
      try {
        const token = await api.auth.register(account);
        if (context.current.generation !== generation) return;
        const nextSession = writeSession(token, account.username, normalizedApiUrl);
        setSession(nextSession);
        setPasswordError("");
        toast("Обліковий запис створено. Вітаємо!");
        await continueAfterAuthentication(nextSession, generation);
      } catch (error) {
        if (context.current.generation !== generation) return;
        setSignupError(
          error instanceof ApiError && error.status === 409
            ? "Цей логін уже зайнятий. Оберіть інший."
            : friendlyError(error)
        );
      } finally {
        if (context.current.generation === generation) setActionBusy("");
      }
    },
    [api, continueAfterAuthentication, normalizedApiUrl, setActionBusy, setSession, toast]
  );

  const changePassword = useCallback(
    async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const currentPassword = formText(data, "currentPassword");
      const newPassword = formText(data, "newPassword");
      const confirmation = formText(data, "confirmPassword");
      setPasswordError("");
      if (newPassword !== confirmation) {
        setPasswordError("Нові паролі не збігаються.");
        return;
      }
      if (/\s/.test(newPassword)) {
        setPasswordError("Новий пароль не повинен містити пробіли.");
        return;
      }
      const generation = context.current.generation;
      setActionBusy("password");
      try {
        await api.auth.changePassword(currentPassword, newPassword);
        if (context.current.generation !== generation) return;
        clearSession();
        setSession(null);
        resetProtectedData();
        toast("Пароль змінено. Увійдіть із новим паролем.");
        navigate("#/login");
      } catch (error) {
        if (context.current.generation !== generation) return;
        if (handleAuthError(error, "#/profile")) return;
        let message = friendlyError(error);
        if (error instanceof ApiError && error.status === 400) {
          message = "Поточний пароль неправильний.";
        } else if (error instanceof ApiError && error.status === 409) {
          message = "Новий пароль має відрізнятися від поточного.";
        }
        setPasswordError(message);
      } finally {
        if (context.current.generation === generation) setActionBusy("");
      }
    },
    [api, handleAuthError, resetProtectedData, setActionBusy, setSession, toast]
  );

  const clearPasswordError = useCallback(() => setPasswordError(""), []);

  return {
    loginError,
    signupError,
    passwordError,
    submitLogin,
    submitRegistration,
    changePassword,
    clearPasswordError
  };
}
