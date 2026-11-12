import { AdminApi } from "./admin-api.js";
import { AuthApi } from "./auth-api.js";
import { CatalogueApi } from "./catalogue-api.js";
import { ApiCore, type PagingOptions, type QuizApiOptions, type RequestOptions } from "./core.js";
import type {
  AdminQuestion,
  AdminQuiz,
  AdminResult,
  AdminStatus,
  AdminUser,
  Attempt,
  AttemptCompletion,
  CatalogueSummary,
  Level,
  Paged,
  Profile,
  Quiz,
  QuestionRequest,
  QuizRequest,
  RegisterRequest,
  Result,
  ResultSummary,
  Subject,
  TokenResponse
} from "../types.js";

/**
 * The app's one API client. Request mechanics live in {@link ApiCore} and the
 * REST resources are grouped by who owns them — {@link AuthApi},
 * {@link CatalogueApi}, {@link AdminApi} — reachable both through `auth` /
 * `catalogue` / `admin` and, for every call site written before the split,
 * through the same flat methods this class always had.
 */
export class QuizApi {
  readonly baseUrl: string;
  readonly auth: AuthApi;
  readonly catalogue: CatalogueApi;
  readonly admin: AdminApi;
  private readonly core: ApiCore;

  constructor(options: QuizApiOptions) {
    this.core = new ApiCore(options);
    this.baseUrl = this.core.baseUrl;
    this.auth = new AuthApi(this.core);
    this.catalogue = new CatalogueApi(this.core);
    this.admin = new AdminApi(this.core);
  }

  /** Escape hatch for a resource none of the domain clients cover yet. */
  request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.core.request<T>(path, options);
  }

  checkConnection(): Promise<void> {
    return this.catalogue.checkConnection();
  }

  login(username: string, password: string): Promise<TokenResponse> {
    return this.auth.login(username, password);
  }

  refresh(refreshToken: string): Promise<TokenResponse> {
    return this.auth.refresh(refreshToken);
  }

  logout(): Promise<void> {
    return this.auth.logout();
  }

  register(account: RegisterRequest): Promise<TokenResponse> {
    return this.auth.register(account);
  }

  profile(): Promise<Profile> {
    return this.auth.profile();
  }

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.auth.changePassword(currentPassword, newPassword);
  }

  quizzes(
    options?: {
      search?: string | undefined;
      complexity?: readonly string[] | undefined;
    } & PagingOptions
  ): Promise<Paged<Quiz>> {
    return this.catalogue.quizzes(options);
  }

  catalogueSummary(): Promise<CatalogueSummary> {
    return this.catalogue.catalogueSummary();
  }

  quiz(id: number | string): Promise<Quiz> {
    return this.catalogue.quiz(id);
  }

  startAttempt(quizId: number | string): Promise<Attempt> {
    return this.catalogue.startAttempt(quizId);
  }

  attempt(attemptId: number | string): Promise<Attempt> {
    return this.catalogue.attempt(attemptId);
  }

  completeAttempt(attemptId: number | string, answerIds: readonly number[]): Promise<AttemptCompletion> {
    return this.catalogue.completeAttempt(attemptId, answerIds);
  }

  results(options?: PagingOptions): Promise<Paged<Result>> {
    return this.catalogue.results(options);
  }

  resultSummary(): Promise<ResultSummary> {
    return this.catalogue.resultSummary();
  }

  adminStatus(): Promise<AdminStatus> {
    return this.admin.adminStatus();
  }

  adminSubjects(): Promise<Subject[]> {
    return this.admin.adminSubjects();
  }

  createSubject(name: string): Promise<Subject> {
    return this.admin.createSubject(name);
  }

  updateSubject(id: number | string, name: string): Promise<Subject> {
    return this.admin.updateSubject(id, name);
  }

  deleteSubject(id: number | string): Promise<void> {
    return this.admin.deleteSubject(id);
  }

  adminLevels(): Promise<Level[]> {
    return this.admin.adminLevels();
  }

  adminQuizzes(): Promise<AdminQuiz[]> {
    return this.admin.adminQuizzes();
  }

  createQuiz(quiz: QuizRequest): Promise<AdminQuiz> {
    return this.admin.createQuiz(quiz);
  }

  updateQuiz(id: number | string, quiz: QuizRequest): Promise<AdminQuiz> {
    return this.admin.updateQuiz(id, quiz);
  }

  deleteQuiz(id: number | string): Promise<void> {
    return this.admin.deleteQuiz(id);
  }

  adminQuestions(quizId: number | string): Promise<AdminQuestion[]> {
    return this.admin.adminQuestions(quizId);
  }

  createQuestion(quizId: number | string, question: QuestionRequest): Promise<AdminQuestion> {
    return this.admin.createQuestion(quizId, question);
  }

  updateQuestion(id: number | string, question: QuestionRequest): Promise<AdminQuestion> {
    return this.admin.updateQuestion(id, question);
  }

  deleteQuestion(id: number | string): Promise<void> {
    return this.admin.deleteQuestion(id);
  }

  adminUsers(options?: PagingOptions): Promise<Paged<AdminUser>> {
    return this.admin.adminUsers(options);
  }

  updateUserStatus(id: number | string, status: string): Promise<AdminUser> {
    return this.admin.updateUserStatus(id, status);
  }

  adminResults(
    options?: {
      from?: string | undefined;
      to?: string | undefined;
    } & PagingOptions
  ): Promise<Paged<AdminResult>> {
    return this.admin.adminResults(options);
  }
}
