export class ApiError extends Error {
  constructor(message, { status = 0, code = "NETWORK_ERROR", path = "", cause } = {}) {
    super(message, { cause });
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.path = path;
  }
}

export function normalizeBaseUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new TypeError("API URL не може бути порожнім.");

  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) {
    throw new TypeError("API URL має використовувати HTTP або HTTPS.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export class QuizApi {
  constructor({ baseUrl, getToken = () => null, fetchImpl = globalThis.fetch, timeoutMs = 12_000 }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.getToken = getToken;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(path, { method = "GET", body, authenticated = false } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    if (authenticated) {
      const token = this.getToken();
      if (!token) {
        throw new ApiError("Увійдіть, щоб продовжити.", {
          status: 401,
          code: "AUTH_REQUIRED",
          path
        });
      }
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const contentType = response.headers.get("content-type") ?? "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        const message = typeof payload === "object" && payload?.message
          ? payload.message
          : `Сервер повернув помилку ${response.status}.`;
        throw new ApiError(message, {
          status: response.status,
          code: typeof payload === "object" ? payload?.error : "API_ERROR",
          path: typeof payload === "object" ? payload?.path : path
        });
      }

      return payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error?.name === "AbortError") {
        throw new ApiError("Сервер не відповів вчасно. Спробуйте ще раз.", {
          code: "TIMEOUT",
          path,
          cause: error
        });
      }
      throw new ApiError("Не вдалося з’єднатися з API. Перевірте адресу сервера та CORS.", {
        code: "NETWORK_ERROR",
        path,
        cause: error
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  health() {
    return this.request("/actuator/health");
  }

  login(username, password) {
    return this.request("/api/v1/auth/login", {
      method: "POST",
      body: { username, password }
    });
  }

  quizzes() {
    return this.request("/api/v1/quizzes");
  }

  quiz(id) {
    return this.request(`/api/v1/quizzes/${Number(id)}`);
  }

  startAttempt(quizId) {
    return this.request(`/api/v1/quizzes/${Number(quizId)}/attempts`, {
      method: "POST",
      authenticated: true
    });
  }

  attempt(attemptId) {
    return this.request(`/api/v1/attempts/${Number(attemptId)}`, {
      authenticated: true
    });
  }

  completeAttempt(attemptId, answerIds) {
    return this.request(`/api/v1/attempts/${Number(attemptId)}/complete`, {
      method: "POST",
      authenticated: true,
      body: { answerIds }
    });
  }

  results() {
    return this.request("/api/v1/results/me", { authenticated: true });
  }
}
