import { type ApiCore, type PagingOptions, queryOf, toInstant, withPaging } from "./core.js";
import type {
  AdminQuestion,
  AdminQuiz,
  AdminResult,
  AdminStatus,
  AdminUser,
  Level,
  Paged,
  QuestionRequest,
  QuizRequest,
  Subject
} from "../types.js";

/** Everything gated behind the administrator role: subjects, quizzes, questions, users and results. */
export class AdminApi {
  constructor(private readonly core: ApiCore) {}

  adminStatus(): Promise<AdminStatus> {
    return this.core.request<AdminStatus>("/api/v1/admin/status", { authenticated: true });
  }

  adminSubjects(): Promise<Subject[]> {
    return this.core.request<Subject[]>("/api/v1/admin/subjects", { authenticated: true });
  }

  createSubject(name: string): Promise<Subject> {
    return this.core.request<Subject>("/api/v1/admin/subjects", {
      method: "POST",
      authenticated: true,
      body: { name }
    });
  }

  updateSubject(id: number | string, name: string): Promise<Subject> {
    return this.core.request<Subject>(`/api/v1/admin/subjects/${Number(id)}`, {
      method: "PUT",
      authenticated: true,
      body: { name }
    });
  }

  deleteSubject(id: number | string): Promise<void> {
    return this.core.request<void>(`/api/v1/admin/subjects/${Number(id)}`, {
      method: "DELETE",
      authenticated: true
    });
  }

  adminLevels(): Promise<Level[]> {
    return this.core.request<Level[]>("/api/v1/admin/levels", { authenticated: true });
  }

  adminQuizzes(): Promise<AdminQuiz[]> {
    return this.core.request<AdminQuiz[]>("/api/v1/admin/quizzes", { authenticated: true });
  }

  createQuiz(quiz: QuizRequest): Promise<AdminQuiz> {
    return this.core.request<AdminQuiz>("/api/v1/admin/quizzes", {
      method: "POST",
      authenticated: true,
      body: quiz
    });
  }

  updateQuiz(id: number | string, quiz: QuizRequest): Promise<AdminQuiz> {
    return this.core.request<AdminQuiz>(`/api/v1/admin/quizzes/${Number(id)}`, {
      method: "PUT",
      authenticated: true,
      body: quiz
    });
  }

  deleteQuiz(id: number | string): Promise<void> {
    return this.core.request<void>(`/api/v1/admin/quizzes/${Number(id)}`, {
      method: "DELETE",
      authenticated: true
    });
  }

  adminQuestions(quizId: number | string): Promise<AdminQuestion[]> {
    return this.core.request<AdminQuestion[]>(`/api/v1/admin/quizzes/${Number(quizId)}/questions`, {
      authenticated: true
    });
  }

  createQuestion(quizId: number | string, question: QuestionRequest): Promise<AdminQuestion> {
    return this.core.request<AdminQuestion>(`/api/v1/admin/quizzes/${Number(quizId)}/questions`, {
      method: "POST",
      authenticated: true,
      body: question
    });
  }

  updateQuestion(id: number | string, question: QuestionRequest): Promise<AdminQuestion> {
    return this.core.request<AdminQuestion>(`/api/v1/admin/questions/${Number(id)}`, {
      method: "PUT",
      authenticated: true,
      body: question
    });
  }

  deleteQuestion(id: number | string): Promise<void> {
    return this.core.request<void>(`/api/v1/admin/questions/${Number(id)}`, {
      method: "DELETE",
      authenticated: true
    });
  }

  adminUsers({ page, size }: PagingOptions = {}): Promise<Paged<AdminUser>> {
    const query = queryOf(withPaging(new URLSearchParams(), { page, size }));
    return this.core.requestPaged<AdminUser>(`/api/v1/admin/users${query}`, {
      authenticated: true
    });
  }

  updateUserStatus(id: number | string, status: string): Promise<AdminUser> {
    return this.core.request<AdminUser>(`/api/v1/admin/users/${Number(id)}/status`, {
      method: "PATCH",
      authenticated: true,
      body: { status }
    });
  }

  adminResults({
    from,
    to,
    page,
    size
  }: {
    from?: string | undefined;
    to?: string | undefined;
  } & PagingOptions = {}): Promise<Paged<AdminResult>> {
    const params = new URLSearchParams();
    const fromInstant = toInstant(from);
    const toInstantValue = toInstant(to);
    if (fromInstant) params.set("from", fromInstant);
    if (toInstantValue) params.set("to", toInstantValue);
    withPaging(params, { page, size });
    return this.core.requestPaged<AdminResult>(`/api/v1/admin/results${queryOf(params)}`, {
      authenticated: true
    });
  }
}
