import { ApiError } from "../api.js";

/** Convert any rejected operation into the app's user-facing error vocabulary. */
export function friendlyError(error: unknown): string {
  if (!(error instanceof Error)) return "Сталася неочікувана помилка. Спробуйте ще раз.";
  const correlationId = error instanceof ApiError ? error.correlationId : null;
  return correlationId ? `${error.message} (код підтримки: ${correlationId})` : error.message;
}
