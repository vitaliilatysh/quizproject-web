import { type ApiCore, type PagingOptions, queryOf, withPaging } from "./core.js";
import type {
  Attempt,
  AttemptCompletion,
  CatalogueSummary,
  Paged,
  Quiz,
  Result,
  ResultSummary
} from "../types.js";

/** The public catalogue, and a signed-in reader's own attempts and results. */
export class CatalogueApi {
  constructor(private readonly core: ApiCore) {}

  async checkConnection(): Promise<void> {
    await this.core.request<CatalogueSummary>("/api/v1/quizzes/summary");
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
  quizzes({
    search,
    complexity,
    page,
    size
  }: {
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
    return this.core.requestPaged<Quiz>(`/api/v1/quizzes${queryOf(params)}`);
  }

  /**
   * Catalogue-wide totals. The home page shows how many quizzes exist and how
   * many subjects they span; the second figure cannot come from a page, since
   * X-Total-Count counts matching quizzes, not the subjects behind them.
   */
  catalogueSummary(): Promise<CatalogueSummary> {
    return this.core.request<CatalogueSummary>("/api/v1/quizzes/summary");
  }

  quiz(id: number | string): Promise<Quiz> {
    return this.core.request<Quiz>(`/api/v1/quizzes/${Number(id)}`);
  }

  startAttempt(quizId: number | string): Promise<Attempt> {
    return this.core.request<Attempt>(`/api/v1/quizzes/${Number(quizId)}/attempts`, {
      method: "POST",
      authenticated: true
    });
  }

  attempt(attemptId: number | string): Promise<Attempt> {
    return this.core.request<Attempt>(`/api/v1/attempts/${Number(attemptId)}`, {
      authenticated: true
    });
  }

  completeAttempt(attemptId: number | string, answerIds: readonly number[]): Promise<AttemptCompletion> {
    return this.core.request<AttemptCompletion>(`/api/v1/attempts/${Number(attemptId)}/complete`, {
      method: "POST",
      authenticated: true,
      body: { answerIds }
    });
  }

  // Paginated now that the aggregates have their own endpoint. Until
  // /results/me/summary existed this fetched every attempt, on purpose: the
  // screen shows the average and best score across all of them, which no page
  // can supply — X-Total-Count answers "how many", not "what is the mean" — and
  // paginating would have kept those numbers on screen while silently changing
  // what they meant. resultSummary() is computed by the server over the whole
  // history, so the list is free to be bounded like every other one.
  results({ page, size }: PagingOptions = {}): Promise<Paged<Result>> {
    const query = queryOf(withPaging(new URLSearchParams(), { page, size }));
    return this.core.requestPaged<Result>(`/api/v1/results/me${query}`, { authenticated: true });
  }

  resultSummary(): Promise<ResultSummary> {
    return this.core.request<ResultSummary>("/api/v1/results/me/summary", { authenticated: true });
  }
}
