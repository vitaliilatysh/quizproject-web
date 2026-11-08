import { recordServerTime } from "../clock.js";
import type { Paged, PageMeta } from "../types.js";

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

export function withPaging(params: URLSearchParams, { page, size }: PagingOptions = {}): URLSearchParams {
  if (Number.isInteger(page) && (page as number) >= 0) params.set("page", String(page));
  if (Number.isInteger(size) && (size as number) > 0) params.set("size", String(size));
  return params;
}

export function queryOf(params: URLSearchParams): string {
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

  let pathEnd = url.pathname.length;
  while (url.pathname[pathEnd - 1] === "/") pathEnd -= 1;
  url.pathname = url.pathname.slice(0, pathEnd);
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

async function readResponse(response: Response, path: string): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (response.ok) return payload;

  const problem: ErrorPayload = isRecord(payload) ? payload : {};
  const message =
    typeof problem.message === "string" && problem.message
      ? problem.message
      : `Сервер повернув помилку ${response.status}.`;
  throw new ApiError(message, {
    status: response.status,
    code: typeof problem.error === "string" ? problem.error : "API_ERROR",
    path: typeof problem.path === "string" ? problem.path : path,
    correlationId: response.headers.get("X-Correlation-ID")
  });
}

/**
 * The one place that actually calls `fetch`: headers, timeout, error mapping
 * and the server-clock reading. Every domain client (auth, catalogue, admin)
 * holds one of these rather than repeating it, so the request mechanics stay
 * in a single spot while each client only states which resources it owns.
 */
export class ApiCore {
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
    return (await this.send(path, options, false)) as T;
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
    return (await this.send(path, options, true)) as Paged<T>;
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

      const payload = await readResponse(response, path);
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
}
