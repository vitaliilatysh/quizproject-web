import type { TokenResponse } from "./types.js";

const SESSION_KEY = "quizproject.session";
const API_URL_KEY = "quizproject.apiUrl";
const RETURN_TO_KEY = "quizproject.returnTo";
const PENDING_QUIZ_KEY = "quizproject.pendingQuiz";
const ANSWERS_PREFIX = "quizproject.answers.";

/**
 * What this tab knows about who is signed in.
 *
 * Not an API type: it is assembled here from the token response and the claims
 * inside the JWT, and it is what lands in sessionStorage.
 */
export interface Session {
  accessToken: string;
  tokenType: string;
  /** Epoch milliseconds, from the JWT's `exp` where usable, else `expiresIn`. */
  expiresAt: number;
  username: string;
  roles: string[];
}

/**
 * The claims this app reads. Everything is optional because the payload is
 * whatever JSON happened to be in the middle segment — including, when the
 * token is malformed, an empty object from the catch below.
 */
interface JwtPayload {
  sub?: unknown;
  exp?: unknown;
  roles?: unknown;
}

// Set by public/runtime-config.js, which Kubernetes overwrites per environment.
// Declared rather than assumed: it is absent in dev, and reading an undeclared
// global is exactly the mistake the compiler should be catching elsewhere.
declare global {
  // eslint-disable-next-line no-var
  var QUIZ_PROJECT_API_URL: string | undefined;
}

function decodeJwtPayload(token: string): JwtPayload {
  try {
    const segment = token.split(".")[1] ?? "";
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(Array.from(atob(normalized), character =>
      `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return {};
  }
}

/**
 * Narrows the parsed sessionStorage entry, which is `unknown` until proven
 * otherwise. The stored value is under the reader's control — another tab, an
 * older build, or a hand-edited devtools entry can all put something else
 * there — so the shape is checked rather than asserted.
 */
function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Session>;
  return typeof candidate.accessToken === "string"
    && typeof candidate.expiresAt === "number"
    && typeof candidate.username === "string";
}

export function readSession(): Session | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY) as string);
    if (!isSession(value) || !value.accessToken || !value.expiresAt || value.expiresAt <= Date.now()) {
      clearSession();
      return null;
    }
    return value;
  } catch {
    clearSession();
    return null;
  }
}

export function writeSession(tokenResponse: TokenResponse, username: string): Session {
  const payload = decodeJwtPayload(tokenResponse.accessToken);
  const jwtExpiry = Number(payload.exp) * 1000;
  const ttlExpiry = Date.now() + Number(tokenResponse.expiresIn || 0) * 1000;
  const session: Session = {
    accessToken: tokenResponse.accessToken,
    tokenType: tokenResponse.tokenType || "Bearer",
    expiresAt: Number.isFinite(jwtExpiry) && jwtExpiry > Date.now() ? jwtExpiry : ttlExpiry,
    username: typeof payload.sub === "string" && payload.sub ? payload.sub : username,
    roles: Array.isArray(payload.roles) ? payload.roles.filter(role => typeof role === "string") : []
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function readApiUrl(): string {
  return localStorage.getItem(API_URL_KEY)
    || globalThis.QUIZ_PROJECT_API_URL
    || "http://localhost:8081";
}

export function writeApiUrl(value: string): void {
  localStorage.setItem(API_URL_KEY, value);
}

export function rememberReturnTo(hash: string): void {
  sessionStorage.setItem(RETURN_TO_KEY, hash.startsWith("#/") ? hash : "#/quizzes");
}

export function consumeReturnTo(): string {
  const value = sessionStorage.getItem(RETURN_TO_KEY) || "#/quizzes";
  sessionStorage.removeItem(RETURN_TO_KEY);
  return value;
}

export function rememberPendingQuiz(id: number): void {
  sessionStorage.setItem(PENDING_QUIZ_KEY, String(id));
}

export function consumePendingQuiz(): number | null {
  const value = sessionStorage.getItem(PENDING_QUIZ_KEY);
  sessionStorage.removeItem(PENDING_QUIZ_KEY);
  return value ? Number(value) : null;
}

export function readAnswers(attemptId: number | string): Set<number> {
  try {
    const values: unknown = JSON.parse(sessionStorage.getItem(`${ANSWERS_PREFIX}${attemptId}`) || "[]");
    return new Set(Array.isArray(values) ? values.filter(value => Number.isInteger(value)) as number[] : []);
  } catch {
    return new Set();
  }
}

export function writeAnswers(attemptId: number | string, values: Iterable<number>): void {
  sessionStorage.setItem(`${ANSWERS_PREFIX}${attemptId}`, JSON.stringify([...values]));
}

export function clearAnswers(attemptId: number | string): void {
  sessionStorage.removeItem(`${ANSWERS_PREFIX}${attemptId}`);
}

/**
 * Forgets the answers saved for every attempt, whichever they belong to.
 *
 * Used when one account replaces another in the tab. Clearing them one
 * attempt at a time is not possible there: the outgoing reader's attempt ids
 * are exactly what is being discarded, so nothing is left to enumerate them
 * with. The keys are read back by attempt id alone, so leaving them behind
 * would offer one reader's choices to the next.
 */
export function clearStoredAnswers(): void {
  // Walked with length/key rather than Object.keys. Enumerating a Storage as a
  // plain object works only because of its named-property behaviour, which any
  // stand-in for it is unlikely to reproduce; length and key are the API it
  // actually publishes. Collected first, because removing while indexing shifts
  // everything after the entry that was just dropped.
  const doomed: string[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(ANSWERS_PREFIX)) doomed.push(key);
  }
  for (const key of doomed) sessionStorage.removeItem(key);
}
