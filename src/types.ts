import type { components } from "./generated/api.js";

/** Wire DTOs come from the backend's exported OpenAPI, never handwritten copies. */
type Schemas = components["schemas"];
export type TokenResponse = Schemas["TokenResponse"];
export type RegisterRequest = Schemas["RegisterRequest"];
export type Profile = Schemas["ProfileResponse"];
export type Quiz = Schemas["QuizResponse"];
export type CatalogueSummary = Schemas["QuizCatalogueSummary"];
export type AnswerOption = Schemas["AnswerOptionResponse"];
export type AttemptQuestion = Schemas["AttemptQuestionResponse"];
export type Attempt = Schemas["AttemptResponse"];
export type AttemptCompletion = Schemas["AttemptCompletionResponse"];
export type Result = Schemas["ResultResponse"];
export type ResultSummary = Schemas["ResultSummary"];
export type Subject = Schemas["AdminSubject"];
export type Level = Schemas["AdminLevel"];
export type AdminQuiz = Schemas["AdminQuiz"];
export type AdminAnswer = Schemas["AdminAnswer"];
export type AdminQuestion = Schemas["AdminQuestion"];
export type AdminUser = Schemas["AdminUser"];
export type AdminResult = Schemas["AdminResult"];
export type AdminStatus = Schemas["AdminStatusResponse"];
export type QuizRequest = Schemas["QuizRequest"];
export type AnswerRequest = Schemas["AnswerRequest"];
export type QuestionRequest = Schemas["QuestionRequest"];
export type ApiErrorBody = Schemas["ApiError"];

// Frontend composition and HTTP-header metadata are not JSON response DTOs.
export interface ResultHistory {
  page: Paged<Result>;
  summary: ResultSummary;
}

/** The four X-Page-* headers, read together or not at all. */
export interface PageMeta {
  number: number;
  size: number;
  totalCount: number;
  totalPages: number;
}

/** Null means the response did not include paging headers. */
export interface Paged<T> {
  items: T[];
  page: PageMeta | null;
}
