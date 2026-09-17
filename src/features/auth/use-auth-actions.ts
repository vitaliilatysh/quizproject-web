import { useCallback, useState, type Dispatch, type SubmitEvent, type SetStateAction } from "react";
import { ApiError, QuizApi, type QuizApi as QuizApiClient } from "../../api.js";
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
  const [loginError, setLoginError] = useState("");
  const [signupError, setSignupError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const continueAfterAuthentication = useCallback(async (nextSession: Session): Promise<void> => {
    const pendingQuiz = consumePendingQuiz();
    if (pendingQuiz) {
      const authenticatedApi = new QuizApi({ baseUrl: apiUrl, getToken: () => nextSession.accessToken });
      const attempt = await authenticatedApi.startAttempt(pendingQuiz);
      rememberAttempt(attempt);
      consumeReturnTo();
      navigate(`#/attempt/${attempt.attemptId}`);
    } else {
      navigate(consumeReturnTo());
    }
  }, [apiUrl, rememberAttempt]);

  const submitLogin = useCallback(async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const username = formText(data, "username").trim();
    setActionBusy("login");
    setLoginError("");
    try {
      const token = await api.login(username, formText(data, "password"));
      const nextSession = writeSession(token, username);
      setSession(nextSession);
      setPasswordError("");
      toast("Вхід успішний. Вітаємо!");
      await continueAfterAuthentication(nextSession);
    } catch (error) {
      setLoginError(error instanceof ApiError && [401, 403].includes(error.status)
        ? "Невірний логін або пароль."
        : friendlyError(error));
    } finally {
      setActionBusy("");
    }
  }, [api, continueAfterAuthentication, setActionBusy, setSession, toast]);

  const submitRegistration = useCallback(async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
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
    setActionBusy("signup");
    try {
      const token = await api.register(account);
      const nextSession = writeSession(token, account.username);
      setSession(nextSession);
      setPasswordError("");
      toast("Обліковий запис створено. Вітаємо!");
      await continueAfterAuthentication(nextSession);
    } catch (error) {
      setSignupError(error instanceof ApiError && error.status === 409
        ? "Цей логін уже зайнятий. Оберіть інший."
        : friendlyError(error));
    } finally {
      setActionBusy("");
    }
  }, [api, continueAfterAuthentication, setActionBusy, setSession, toast]);

  const changePassword = useCallback(async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
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
    setActionBusy("password");
    try {
      await api.changePassword(currentPassword, newPassword);
      clearSession();
      setSession(null);
      resetProtectedData();
      toast("Пароль змінено. Увійдіть із новим паролем.");
      navigate("#/login");
    } catch (error) {
      if (handleAuthError(error, "#/profile")) return;
      let message = friendlyError(error);
      if (error instanceof ApiError && error.status === 400) {
        message = "Поточний пароль неправильний.";
      } else if (error instanceof ApiError && error.status === 409) {
        message = "Новий пароль має відрізнятися від поточного.";
      }
      setPasswordError(message);
    } finally {
      setActionBusy("");
    }
  }, [api, handleAuthError, resetProtectedData, setActionBusy, setSession, toast]);

  const clearPasswordError = useCallback(() => setPasswordError(""), []);

  return { loginError, signupError, passwordError, submitLogin, submitRegistration, changePassword, clearPasswordError };
}
