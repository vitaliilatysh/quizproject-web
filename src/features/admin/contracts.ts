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

/**
 * The collections a mutation can change, named so a write can say which.
 *
 * `levels` is not among them on purpose: the API exposes no way to create,
 * rename or delete one, so no action in this panel can make that request answer
 * differently. It is fetched when the panel opens and never again.
 */
export type AdminPart = "subjects" | "quizzes" | "users" | "results";

export const ADMIN_PARTS: readonly AdminPart[] = ["subjects", "quizzes", "users", "results"];

/**
 * What each action invalidates, read off the backend's own cascades rather than
 * guessed from the action's name. Two of them are not what they look like:
 *
 * - `subject-delete` refuses outright when a quiz still uses the subject
 *   (CatalogueAdminService: "Subject N is used by a quiz"), so it can only ever
 *   remove an unused one. Nothing cascades, and only the subject list moves.
 * - `quiz-save` has to take `results` with it, because ResultResponse carries
 *   `quizName` — renaming a quiz changes what the results table reads, with no
 *   attempt touched.
 *
 * A key with no entry here refetches everything. An action nobody mapped is an
 * action whose reach nobody has established, and the safe answer for that is
 * the whole panel, not none of it.
 */
export const ADMIN_INVALIDATES: Readonly<Record<string, readonly AdminPart[]>> = {
  "subject-create": ["subjects"],
  // QuizResponse carries the subject's name.
  "subject-update": ["subjects", "quizzes"],
  "subject-delete": ["subjects"],
  "quiz-save": ["quizzes", "results"],
  // Deletes the quiz's attempts, which is what the results table lists.
  "quiz-delete": ["quizzes", "results"],
  // Creating or deleting one moves QuizResponse.totalQuestions. An attempt's
  // score is stored rather than recomputed, so the results table does not move.
  "question-save": ["quizzes"],
  "question-delete": ["quizzes"],
  "user-status": ["users"]
};

export interface ResultRange {
  from: string;
  to: string;
}

export type ExecuteAdmin = <T>(
  key: string,
  operation: () => Promise<T>,
  successMessage: string
) => Promise<T | null>;
