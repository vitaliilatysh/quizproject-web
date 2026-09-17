import { useCallback, useState } from "react";
import type { Toast } from "../components.js";

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone = "success") => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setToasts(current => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), 4200);
  }, []);

  return { toasts, toast };
}
