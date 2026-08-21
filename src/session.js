const SESSION_KEY = "quizproject.session";
const API_URL_KEY = "quizproject.apiUrl";
const RETURN_TO_KEY = "quizproject.returnTo";
const PENDING_QUIZ_KEY = "quizproject.pendingQuiz";

function decodeJwtPayload(token) {
  try {
    const segment = token.split(".")[1];
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(Array.from(atob(normalized), character =>
      `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export function readSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (!value?.accessToken || !value?.expiresAt || value.expiresAt <= Date.now()) {
      clearSession();
      return null;
    }
    return value;
  } catch {
    clearSession();
    return null;
  }
}

export function writeSession(tokenResponse, username) {
  const payload = decodeJwtPayload(tokenResponse.accessToken);
  const jwtExpiry = Number(payload.exp) * 1000;
  const ttlExpiry = Date.now() + Number(tokenResponse.expiresIn || 0) * 1000;
  const session = {
    accessToken: tokenResponse.accessToken,
    tokenType: tokenResponse.tokenType || "Bearer",
    expiresAt: Number.isFinite(jwtExpiry) && jwtExpiry > Date.now() ? jwtExpiry : ttlExpiry,
    username: payload.sub || username,
    roles: Array.isArray(payload.roles) ? payload.roles : []
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function readApiUrl() {
  return localStorage.getItem(API_URL_KEY)
    || globalThis.QUIZ_PROJECT_API_URL
    || "http://localhost:8081";
}

export function writeApiUrl(value) {
  localStorage.setItem(API_URL_KEY, value);
}

export function rememberReturnTo(hash) {
  sessionStorage.setItem(RETURN_TO_KEY, hash.startsWith("#/") ? hash : "#/quizzes");
}

export function consumeReturnTo() {
  const value = sessionStorage.getItem(RETURN_TO_KEY) || "#/quizzes";
  sessionStorage.removeItem(RETURN_TO_KEY);
  return value;
}

export function rememberPendingQuiz(id) {
  sessionStorage.setItem(PENDING_QUIZ_KEY, String(id));
}

export function consumePendingQuiz() {
  const value = sessionStorage.getItem(PENDING_QUIZ_KEY);
  sessionStorage.removeItem(PENDING_QUIZ_KEY);
  return value ? Number(value) : null;
}

export function readAnswers(attemptId) {
  try {
    const values = JSON.parse(sessionStorage.getItem(`quizproject.answers.${attemptId}`) || "[]");
    return new Set(values.filter(Number.isInteger));
  } catch {
    return new Set();
  }
}

export function writeAnswers(attemptId, values) {
  sessionStorage.setItem(`quizproject.answers.${attemptId}`, JSON.stringify([...values]));
}

export function clearAnswers(attemptId) {
  sessionStorage.removeItem(`quizproject.answers.${attemptId}`);
}
