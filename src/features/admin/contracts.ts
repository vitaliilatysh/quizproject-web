import type { AdminQuiz, AdminResult, AdminUser, Level, PageMeta, Subject } from "../../types.js";

/** The six collections assembled by the admin feature's parallel requests. */
export interface AdminData {
  subjects: Subject[];
  levels: Level[];
  quizzes: AdminQuiz[];
  users: AdminUser[];
  usersPage: PageMeta | null;
  results: AdminResult[];
  resultsPage: PageMeta | null;
}

export interface ResultRange {
  from: string;
  to: string;
}

export type ExecuteAdmin = <T>(
  key: string,
  operation: () => Promise<T>,
  successMessage: string
) => Promise<T | null>;
