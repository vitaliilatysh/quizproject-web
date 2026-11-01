// Compile-time regressions. These exercise the aliases actually used by the UI.
import type { AnswerOption, AnswerRequest, Attempt, Profile, QuestionRequest } from "../src/types.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export type ContractChecks = [
  Expect<Equal<Attempt["score"], number | null>>,
  Expect<Equal<Attempt["completedAt"], string | null>>,
  Expect<Equal<Profile["lastLoginAt"], string | null>>,
  Expect<Equal<AnswerRequest["id"], number | undefined>>,
  Expect<Equal<QuestionRequest["answers"], AnswerRequest[]>>,
  Expect<Equal<Extract<"correct", keyof AnswerOption>, never>>
];
