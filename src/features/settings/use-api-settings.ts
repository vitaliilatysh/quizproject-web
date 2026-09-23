import { useCallback, useEffect, useState } from "react";
import { normalizeBaseUrl, QuizApi } from "../../api.js";
import { friendlyError } from "../../app/errors.js";
import { resetServerClock } from "../../clock.js";
import { readApiUrl, writeApiUrl } from "../../session.js";

type ToastMessage = (message: string, tone?: string) => void;

export function useApiSettings(toast: ToastMessage, onApiChanged: (external: boolean) => void) {
  const [apiUrl, setApiUrl] = useState<string>(() => readApiUrl());
  const [connection, setConnection] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    resetServerClock();
  }, [apiUrl]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "quizproject.apiUrl") return;
      setApiUrl(readApiUrl());
      onApiChanged(true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [onApiChanged]);

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
        setApiUrl(normalized);
        onApiChanged(false);
        if (await testConnection(normalized)) toast("Адресу API збережено.");
      } catch (reason) {
        setConnection("error");
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    },
    [onApiChanged, testConnection, toast]
  );

  return { apiUrl, connection, error, testConnection, save };
}
