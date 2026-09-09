/**
 * The API's contract, as the API actually declares it.
 *
 * Every type here was transcribed from a Java record in the backend repository
 * rather than inferred from how this app happens to read the responses. The
 * source for each is named above it, so a future change on that side can be
 * followed to the type that has to move with it. Inferring them from usage
 * would have produced types that describe this frontend's habits — a field
 * nobody renders would simply be missing, and a field rendered defensively
 * would be optional for no reason the API agrees with.
 *
 * Two conventions carried over from Java:
 *
 *   - `int` and `long` are both `number`. Attempt ids are `long` on the admin
 *     results endpoint and `int` everywhere else; neither goes near 2^53.
 *   - `Instant` is serialised as an ISO-8601 string. It is `string` here, and
 *     nullable exactly where the record allows null.
 *
 * What is deliberately NOT modelled: `role`, `status` and `complexity` are
 * plain strings, not unions. The first two come from database rows the admin UI
 * can change, and `complexity` is a level label the seed data owns — the
 * frontend already treats an unrecognised value as "show it as it came", and a
 * union would turn a new database row into a compile error in a repository that
 * cannot fix it.
 */

// --- auth ------------------------------------------------------------------

/** api/auth/TokenResponse.java */
export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

/** api/auth/RegisterRequest.java */
export interface RegisterRequest {
  username: string;
  firstName: string;
  lastName: string;
  password: string;
}

// --- account ---------------------------------------------------------------

/** api/account/ProfileResponse.java */
export interface Profile {
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  registeredAt: string;
  lastLoginAt: string | null;
}

// --- catalogue -------------------------------------------------------------

/** api/quiz/QuizResponse.java */
export interface Quiz {
  id: number;
  name: string;
  subject: string;
  complexity: string;
  timeToPassMinutes: number;
  totalQuestions: number;
}

/** domain QuizCatalogueSummary.java */
export interface CatalogueSummary {
  totalQuizzes: number;
  totalSubjects: number;
}

// --- attempts --------------------------------------------------------------

/** api/attempt/AnswerOptionResponse.java — no `correct` flag, by design */
export interface AnswerOption {
  id: number;
  text: string;
}

/** api/attempt/AttemptQuestionResponse.java */
export interface AttemptQuestion {
  id: number;
  text: string;
  answers: AnswerOption[];
}

/** api/attempt/AttemptResponse.java */
export interface Attempt {
  attemptId: number;
  quizId: number;
  startedAt: string;
  expiresAt: string;
  completed: boolean;
  /** Integer, not int: null until the attempt is completed. */
  score: number | null;
  completedAt: string | null;
  questions: AttemptQuestion[];
}

/** api/attempt/AttemptCompletionResponse.java */
export interface AttemptCompletion {
  attemptId: number;
  quizId: number;
  score: number;
  completedAt: string;
}

// --- results ---------------------------------------------------------------

/** api/result/ResultResponse.java */
export interface Result {
  attemptId: number;
  quizId: number;
  quizName: string;
  score: number;
  completedAt: string;
}

// --- administration --------------------------------------------------------
// All from api/admin/AdminModels.java.

export interface Subject {
  id: number;
  name: string;
}

export interface Level {
  id: number;
  name: string;
}

/**
 * Not the same shape as the public {@link Quiz}: this one carries the numeric
 * subjectId and levelId that the edit form binds its selects to, which the
 * catalogue response has no reason to expose.
 */
export interface AdminQuiz {
  id: number;
  name: string;
  timeToPassMinutes: number;
  levelId: number;
  complexity: string;
  subjectId: number;
  subject: string;
  totalQuestions: number;
}

/** Carries `correct`, unlike the {@link AnswerOption} an attempt is shown. */
export interface AdminAnswer {
  id: number;
  text: string;
  correct: boolean;
}

export interface AdminQuestion {
  id: number;
  quizId: number;
  text: string;
  answers: AdminAnswer[];
}

export interface AdminUser {
  id: number;
  username: string;
  role: string;
  status: string;
}

export interface AdminResult {
  attemptId: number;
  username: string;
  quizId: number;
  quizName: string;
  score: number;
  completedAt: string;
}

export interface AdminStatus {
  service: string;
  access: string;
}

/** AdminModels.QuizRequest — what the quiz form sends, not what it gets back. */
export interface QuizRequest {
  name: string;
  subjectId: number;
  levelId: number;
  timeToPassMinutes: number;
}

/** AdminModels.AnswerRequest */
export interface AnswerRequest {
  text: string;
  correct: boolean;
}

/** AdminModels.QuestionRequest — the API requires exactly four answers. */
export interface QuestionRequest {
  text: string;
  answers: AnswerRequest[];
}

// --- transport -------------------------------------------------------------

/**
 * api/support/ApiError.java. Only `message`, `error` and `path` are read here,
 * but the record has five fields and a partial type would misdescribe it.
 */
export interface ApiErrorBody {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
}

/**
 * The four X-Page-* headers, read together or not at all.
 *
 * Null rather than a synthetic single page when the response carries none: the
 * API paginates only when asked to, and "this collection was not paginated" is
 * a different fact from "it had one page".
 */
export interface PageMeta {
  number: number;
  size: number;
  totalCount: number;
  totalPages: number;
}

/** A collection response together with whatever paging the server reported. */
export interface Paged<T> {
  items: T[];
  page: PageMeta | null;
}

/** GET /actuator/health, of which this app reads only the status. */
export interface HealthResponse {
  status: string;
}
