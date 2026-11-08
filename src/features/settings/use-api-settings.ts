import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeBaseUrl, QuizApi } from "../../api.js";
import { friendlyError } from "../../app/errors.js";
import { resetServerClock } from "../../clock.js";
import { readApiUrl, writeApiUrl } from "../../session.js";

type ToastMessage = (message: string, tone?: string) => void;

export function useApiSettings(toast: ToastMessage, onApiChanged: (external: boolean) => void) {
  const [apiUrl, setApiUrl] = useState<string>(() => readApiUrl());
  const currentApiUrl = useRef(normalizeBaseUrl(apiUrl));
  const [connection, setConnection] = useState("idle");
  const [error, setError] = useState("");

  const updateApiUrl = useCallback(
    (normalized: string, external: boolean) => {
      if (normalized === currentApiUrl.current) return;
      currentApiUrl.current = normalized;
      setApiUrl(normalized);
      onApiChanged(external);
    },
    [onApiChanged]
  );

  useEffect(() => {
    resetServerClock();
  }, [apiUrl]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "quizproject.apiUrl") return;
      updateApiUrl(normalizeBaseUrl(readApiUrl()), true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [updateApiUrl]);

  const testConnection = useCallback(async (value: string): Promise<boolean> => {
    setConnection("checking");
    setError("");
    try {
      const probe = new QuizApi({ baseUrl: value, readsServerClock: false });
      await probe.checkConnection();
      setConnection("ok");
      return true;
    } catch (reason) {
      setConnection("error");
      setError(friendlyError(reason));
    }
    return false;
  }, []);

  const save = useCallback(
    async (value: string): Promise<void> => {
      try {
        const normalized = normalizeBaseUrl(value);
        writeApiUrl(normalized);
        updateApiUrl(normalized, false);
        if (await testConnection(normalized)) toast("Адресу API збережено.");
      } catch (reason) {
        setConnection("error");
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    },
    [updateApiUrl, testConnection, toast]
  );

  return { apiUrl, connection, error, testConnection, save };
}
