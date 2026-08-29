export class ApiError extends Error {
  constructor(message, { status = 0, code = "NETWORK_ERROR", path = "", correlationId = null, cause } = {}) {
    super(message, { cause });
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.path = path;
    this.correlationId = correlationId;
  }
}

// The API paginates only when `page` or `size` is sent; without them it still
// returns the whole array and sets none of these headers. Returning null in that
// case lets callers treat "not paginated" and "paginated" uniformly instead of
// inventing a fake single page. All four headers are exposed through CORS by the
// backend, so a browser can actually read them.
const PAGE_HEADERS = Object.freeze({
  number: "X-Page-Number",
  size: "X-Page-Size",
  totalCount: "X-Total-Count",
  totalPages: "X-Total-Pages"
});

export function readPageMeta(headers) {
  const read = name => {
    const raw = headers.get(name);
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : null;
  };

  const number = read(PAGE_HEADERS.number);
  const size = read(PAGE_HEADERS.size);
  const totalCount = read(PAGE_HEADERS.totalCount);
  const totalPages = read(PAGE_HEADERS.totalPages);
  if (number === null || size === null || totalCount === null || totalPages === null) {
    return null;
  }
  return { number, size, totalCount, totalPages };
}

// `<input type="datetime-local">` yields "2026-01-01T00:00" — no seconds and no
// offset. The API binds these to Instant, which needs an absolute point in time,
// so the raw value is rejected. Interpreting it as local wall-clock time and
// converting to UTC is what the admin means when picking a date on their screen.
// This path was never exercised before: the filter used to run in the browser,
// and App.jsx called adminResults() with no arguments at all.
export function toInstant(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function withPaging(params, { page, size } = {}) {
  if (Number.isInteger(page) && page >= 0) params.set("page", String(page));
  if (Number.isInteger(size) && size > 0) params.set("size", String(size));
  return params;
}

function queryOf(params) {
  const query = params.toString();
  return query ? `?${query}` : "";
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
  constructor({
    baseUrl,
    getToken = () => null,
    fetchImpl = (...args) => globalThis.fetch(...args),
    timeoutMs = 12_000
  }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.getToken = getToken;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(path, { method = "GET", body, authenticated = false, withPageMeta = false } = {}) {
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
          path: typeof payload === "object" ? payload?.path : path,
          correlationId: response.headers.get("X-Correlation-ID")
        });
      }

      return withPageMeta ? { items: payload, page: readPageMeta(response.headers) } : payload;
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

  refresh() {
    return this.request("/api/v1/auth/refresh", {
      method: "POST",
      authenticated: true
    });
  }

  register(account) {
    return this.request("/api/v1/auth/register", {
      method: "POST",
      body: account
    });
  }

  profile() {
    return this.request("/api/v1/users/me", { authenticated: true });
  }

  changePassword(currentPassword, newPassword) {
    return this.request("/api/v1/users/me/password", {
      method: "PUT",
      authenticated: true,
      body: { currentPassword, newPassword }
    });
  }

  /**
   * The catalogue's search and level filter are applied by the API, not here.
   * This endpoint is paginated, so narrowing the loaded page in the browser
   * would hide every match sitting on another page.
   *
   * `complexity` is a list of level labels as the database stores them. The
   * three difficulty buttons in the UI each map to one or more of those labels,
   * which keeps the grouping in the interface that shows it rather than in the
   * API contract.
   */
  quizzes({ search, complexity, page, size } = {}) {
    const params = new URLSearchParams();
    const term = typeof search === "string" ? search.trim() : "";
    if (term) params.set("search", term);
    for (const label of complexity ?? []) {
      if (label) params.append("complexity", label);
    }
    withPaging(params, { page, size });
    return this.request(`/api/v1/quizzes${queryOf(params)}`, { withPageMeta: true });
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

  // Deliberately not paginated. The results screen shows the viewer's average
  // and best score across every attempt, and those cannot be computed from one
  // page — X-Total-Count answers "how many", not "what is the mean". The list
  // is also bounded by a single user's attempts, so it grows far slower than
  // the admin collections. Paginating it would keep the numbers on screen while
  // silently changing what they mean.
  results() {
    return this.request("/api/v1/results/me", { authenticated: true });
  }

  adminStatus() {
    return this.request("/api/v1/admin/status", { authenticated: true });
  }

  adminSubjects() {
    return this.request("/api/v1/admin/subjects", { authenticated: true });
  }

  createSubject(name) {
    return this.request("/api/v1/admin/subjects", {
      method: "POST", authenticated: true, body: { name }
    });
  }

  updateSubject(id, name) {
    return this.request(`/api/v1/admin/subjects/${Number(id)}`, {
      method: "PUT", authenticated: true, body: { name }
    });
  }

  deleteSubject(id) {
    return this.request(`/api/v1/admin/subjects/${Number(id)}`, {
      method: "DELETE", authenticated: true
    });
  }

  adminLevels() {
    return this.request("/api/v1/admin/levels", { authenticated: true });
  }

  adminQuizzes() {
    return this.request("/api/v1/admin/quizzes", { authenticated: true });
  }

  createQuiz(quiz) {
    return this.request("/api/v1/admin/quizzes", {
      method: "POST", authenticated: true, body: quiz
    });
  }

  updateQuiz(id, quiz) {
    return this.request(`/api/v1/admin/quizzes/${Number(id)}`, {
      method: "PUT", authenticated: true, body: quiz
    });
  }

  deleteQuiz(id) {
    return this.request(`/api/v1/admin/quizzes/${Number(id)}`, {
      method: "DELETE", authenticated: true
    });
  }

  adminQuestions(quizId) {
    return this.request(`/api/v1/admin/quizzes/${Number(quizId)}/questions`, {
      authenticated: true
    });
  }

  createQuestion(quizId, question) {
    return this.request(`/api/v1/admin/quizzes/${Number(quizId)}/questions`, {
      method: "POST", authenticated: true, body: question
    });
  }

  updateQuestion(id, question) {
    return this.request(`/api/v1/admin/questions/${Number(id)}`, {
      method: "PUT", authenticated: true, body: question
    });
  }

  deleteQuestion(id) {
    return this.request(`/api/v1/admin/questions/${Number(id)}`, {
      method: "DELETE", authenticated: true
    });
  }

  adminUsers({ page, size } = {}) {
    const query = queryOf(withPaging(new URLSearchParams(), { page, size }));
    return this.request(`/api/v1/admin/users${query}`, {
      authenticated: true,
      withPageMeta: true
    });
  }

  updateUserStatus(id, status) {
    return this.request(`/api/v1/admin/users/${Number(id)}/status`, {
      method: "PATCH", authenticated: true, body: { status }
    });
  }

  adminResults({ from, to, page, size } = {}) {
    const params = new URLSearchParams();
    const fromInstant = toInstant(from);
    const toInstantValue = toInstant(to);
    if (fromInstant) params.set("from", fromInstant);
    if (toInstantValue) params.set("to", toInstantValue);
    withPaging(params, { page, size });
    return this.request(`/api/v1/admin/results${queryOf(params)}`, {
      authenticated: true,
      withPageMeta: true
    });
  }
}
