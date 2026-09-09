import { recordServerTime } from "./clock.js";
import type {
  AdminQuestion,
  AdminQuiz,
  AdminResult,
  AdminStatus,
  AdminUser,
  Attempt,
  AttemptCompletion,
  CatalogueSummary,
  HealthResponse,
  Level,
  PageMeta,
  Paged,
  Profile,
  Quiz,
  QuestionRequest,
  QuizRequest,
  RegisterRequest,
  Result,
  Subject,
  TokenResponse
} from "./types.js";

export interface ApiErrorOptions {
  status?: number;
  code?: string;
  path?: string;
  correlationId?: string | null;
  cause?: unknown;
}

export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly status: number;
  readonly code: string;
  readonly path: string;
  readonly correlationId: string | null;

  constructor(
    message: string,
    { status = 0, code = "NETWORK_ERROR", path = "", correlationId = null, cause }: ApiErrorOptions = {}
  ) {
    super(message, { cause });
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

export function readPageMeta(headers: Headers): PageMeta | null {
  const read = (name: string): number | null => {
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
// and App.tsx called adminResults() with no arguments at all.
export function toInstant(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Page and size as the catalogue and admin collections accept them. */
export interface PagingOptions {
  page?: number | undefined;
  size?: number | undefined;
}

function withPaging(params: URLSearchParams, { page, size }: PagingOptions = {}): URLSearchParams {
  if (Number.isInteger(page) && (page as number) >= 0) params.set("page", String(page));
  if (Number.isInteger(size) && (size as number) > 0) params.set("size", String(size));
  return params;
}

function queryOf(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function normalizeBaseUrl(value: string | null | undefined): string {
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

/**
 * Just enough of `fetch` for this client, so a test double need not be one.
 *
 * A synchronous Response is allowed because the call site awaits the result
 * either way — a stub has no reason to wrap one in a promise just to satisfy a
 * signature.
 */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response> | Response;

export interface QuizApiOptions {
  baseUrl: string;
  getToken?: () => string | null | undefined;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  readsServerClock?: boolean;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  authenticated?: boolean;
}

/** The shape of an error body, as far as it is worth trusting one. */
interface ErrorPayload {
  message?: unknown;
  error?: unknown;
  path?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class QuizApi {
  readonly baseUrl: string;
  readonly getToken: () => string | null | undefined;
  readonly fetchImpl: FetchLike;
  readonly timeoutMs: number;
  readonly readsServerClock: boolean;

  constructor({
    baseUrl,
    getToken = () => null,
    fetchImpl = (input, init) => globalThis.fetch(input, init),
    timeoutMs = 12_000,
    // Whether this client's responses are allowed to set the server clock.
    // False for one that is not the API the app is running against: the
    // settings screen probes an address the reader typed, and a stranger's
    // clock must not decide when an attempt in progress submits itself.
    readsServerClock = true
  }: QuizApiOptions) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.getToken = getToken;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.readsServerClock = readsServerClock;
  }

  /**
   * One request, with the response body typed as whatever the caller declared.
   *
   * `T` is an assertion about the endpoint, not a check of the bytes that came
   * back: nothing here validates the payload against the type. That is the
   * honest limit of it, and it is why the types in `types.ts` are transcribed
   * from the backend's own records rather than written to suit the call site —
   * the assertion is only worth anything if it matches the server.
   */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return await this.send(path, options, false) as T;
  }

  /**
   * A request whose collection response carries the four X-Page-* headers.
   *
   * Separate from {@link request} rather than a flag on it, because the flag
   * changed the return type: a boolean argument that decides between `T` and
   * `{ items, page }` is a conditional type in waiting, and two methods say the
   * same thing without one.
   */
  async requestPaged<T>(path: string, options: RequestOptions = {}): Promise<Paged<T>> {
    return await this.send(path, options, true) as Paged<T>;
  }

  private async send(path: string, options: RequestOptions, withPageMeta: boolean): Promise<unknown> {
    const { method = "GET", body, authenticated = false } = options;
    const headers: Record<string, string> = { Accept: "application/json" };
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
      headers["Authorization"] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const sentAt = Date.now();

    try {
      // `body` is spread in rather than set to undefined: with
      // exactOptionalPropertyTypes an explicit undefined is not the same as an
      // absent property, and RequestInit does not accept the former. It is the
      // same distinction a GET makes — no body at all, not an empty one.
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal
      });
      // Every response is a reading of the server's clock, including a failing
      // one, and taken here rather than after the body so that reading a slow
      // stream is not counted as time in flight. A response that carries no
      // readable Date leaves the previous reading standing.
      if (this.readsServerClock) recordServerTime(response.headers.get("Date"), sentAt);

      const contentType = response.headers.get("content-type") ?? "";
      const payload: unknown = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        const problem: ErrorPayload = isRecord(payload) ? payload : {};
        const message = typeof problem.message === "string" && problem.message
          ? problem.message
          : `Сервер повернув помилку ${response.status}.`;
        throw new ApiError(message, {
          status: response.status,
          code: typeof problem.error === "string" ? problem.error : "API_ERROR",
          path: typeof problem.path === "string" ? problem.path : path,
          correlationId: response.headers.get("X-Correlation-ID")
        });
      }

      return withPageMeta ? { items: payload, page: readPageMeta(response.headers) } : payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
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

  health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/actuator/health");
  }

  login(username: string, password: string): Promise<TokenResponse> {
    return this.request<TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      body: { username, password }
    });
  }

  refresh(): Promise<TokenResponse> {
    return this.request<TokenResponse>("/api/v1/auth/refresh", {
      method: "POST",
      authenticated: true
    });
  }

  register(account: RegisterRequest): Promise<TokenResponse> {
    return this.request<TokenResponse>("/api/v1/auth/register", {
      method: "POST",
      body: account
    });
  }

  profile(): Promise<Profile> {
    return this.request<Profile>("/api/v1/users/me", { authenticated: true });
  }

  // Returns 200 with no body, so the payload is the empty string `response.text()`
  // produced — typed as void because there is nothing in it to read.
  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.request<void>("/api/v1/users/me/password", {
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
  quizzes({ search, complexity, page, size }: {
    search?: string | undefined;
    complexity?: readonly string[] | undefined;
  } & PagingOptions = {}): Promise<Paged<Quiz>> {
    const params = new URLSearchParams();
    const term = typeof search === "string" ? search.trim() : "";
    if (term) params.set("search", term);
    for (const label of complexity ?? []) {
      if (label) params.append("complexity", label);
    }
    withPaging(params, { page, size });
    return this.requestPaged<Quiz>(`/api/v1/quizzes${queryOf(params)}`);
  }

  /**
   * Catalogue-wide totals. The home page shows how many quizzes exist and how
   * many subjects they span; the second figure cannot come from a page, since
   * X-Total-Count counts matching quizzes, not the subjects behind them.
   */
  catalogueSummary(): Promise<CatalogueSummary> {
    return this.request<CatalogueSummary>("/api/v1/quizzes/summary");
  }

  quiz(id: number | string): Promise<Quiz> {
    return this.request<Quiz>(`/api/v1/quizzes/${Number(id)}`);
  }

  startAttempt(quizId: number | string): Promise<Attempt> {
    return this.request<Attempt>(`/api/v1/quizzes/${Number(quizId)}/attempts`, {
      method: "POST",
      authenticated: true
    });
  }

  attempt(attemptId: number | string): Promise<Attempt> {
    return this.request<Attempt>(`/api/v1/attempts/${Number(attemptId)}`, {
      authenticated: true
    });
  }

  completeAttempt(attemptId: number | string, answerIds: readonly number[]): Promise<AttemptCompletion> {
    return this.request<AttemptCompletion>(`/api/v1/attempts/${Number(attemptId)}/complete`, {
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
  results(): Promise<Result[]> {
    return this.request<Result[]>("/api/v1/results/me", { authenticated: true });
  }

  adminStatus(): Promise<AdminStatus> {
    return this.request<AdminStatus>("/api/v1/admin/status", { authenticated: true });
  }

  adminSubjects(): Promise<Subject[]> {
    return this.request<Subject[]>("/api/v1/admin/subjects", { authenticated: true });
  }

  createSubject(name: string): Promise<Subject> {
    return this.request<Subject>("/api/v1/admin/subjects", {
      method: "POST", authenticated: true, body: { name }
    });
  }

  updateSubject(id: number | string, name: string): Promise<Subject> {
    return this.request<Subject>(`/api/v1/admin/subjects/${Number(id)}`, {
      method: "PUT", authenticated: true, body: { name }
    });
  }

  deleteSubject(id: number | string): Promise<void> {
    return this.request<void>(`/api/v1/admin/subjects/${Number(id)}`, {
      method: "DELETE", authenticated: true
    });
  }

  adminLevels(): Promise<Level[]> {
    return this.request<Level[]>("/api/v1/admin/levels", { authenticated: true });
  }

  adminQuizzes(): Promise<AdminQuiz[]> {
    return this.request<AdminQuiz[]>("/api/v1/admin/quizzes", { authenticated: true });
  }

  createQuiz(quiz: QuizRequest): Promise<AdminQuiz> {
    return this.request<AdminQuiz>("/api/v1/admin/quizzes", {
      method: "POST", authenticated: true, body: quiz
    });
  }

  updateQuiz(id: number | string, quiz: QuizRequest): Promise<AdminQuiz> {
    return this.request<AdminQuiz>(`/api/v1/admin/quizzes/${Number(id)}`, {
      method: "PUT", authenticated: true, body: quiz
    });
  }

  deleteQuiz(id: number | string): Promise<void> {
    return this.request<void>(`/api/v1/admin/quizzes/${Number(id)}`, {
      method: "DELETE", authenticated: true
    });
  }

  adminQuestions(quizId: number | string): Promise<AdminQuestion[]> {
    return this.request<AdminQuestion[]>(`/api/v1/admin/quizzes/${Number(quizId)}/questions`, {
      authenticated: true
    });
  }

  createQuestion(quizId: number | string, question: QuestionRequest): Promise<AdminQuestion> {
    return this.request<AdminQuestion>(`/api/v1/admin/quizzes/${Number(quizId)}/questions`, {
      method: "POST", authenticated: true, body: question
    });
  }

  updateQuestion(id: number | string, question: QuestionRequest): Promise<AdminQuestion> {
    return this.request<AdminQuestion>(`/api/v1/admin/questions/${Number(id)}`, {
      method: "PUT", authenticated: true, body: question
    });
  }

  deleteQuestion(id: number | string): Promise<void> {
    return this.request<void>(`/api/v1/admin/questions/${Number(id)}`, {
      method: "DELETE", authenticated: true
    });
  }

  adminUsers({ page, size }: PagingOptions = {}): Promise<Paged<AdminUser>> {
    const query = queryOf(withPaging(new URLSearchParams(), { page, size }));
    return this.requestPaged<AdminUser>(`/api/v1/admin/users${query}`, {
      authenticated: true
    });
  }

  updateUserStatus(id: number | string, status: string): Promise<AdminUser> {
    return this.request<AdminUser>(`/api/v1/admin/users/${Number(id)}/status`, {
      method: "PATCH", authenticated: true, body: { status }
    });
  }

  adminResults({ from, to, page, size }: {
    from?: string | undefined;
    to?: string | undefined;
  } & PagingOptions = {}): Promise<Paged<AdminResult>> {
    const params = new URLSearchParams();
    const fromInstant = toInstant(from);
    const toInstantValue = toInstant(to);
    if (fromInstant) params.set("from", fromInstant);
    if (toInstantValue) params.set("to", toInstantValue);
    withPaging(params, { page, size });
    return this.requestPaged<AdminResult>(`/api/v1/admin/results${queryOf(params)}`, {
      authenticated: true
    });
  }
}
