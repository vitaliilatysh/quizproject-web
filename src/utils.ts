import { serverNow } from "./clock.js";

/** A parsed location hash: the page to show and whatever followed it. */
export interface Route {
  name: string;
  params: string[];
}

/** The tone a difficulty pill is painted in. */
export type DifficultyTone = "green" | "blue" | "coral";

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatCountdown(expiresAt: string, now: number = serverNow()): string {
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// How many quizzes the home page teases. It is both the number rendered and the
// page size requested, so the two cannot drift apart.
export const HOME_TEASER_SIZE = 3;

interface DifficultyBucket {
  levels: readonly string[];
  text: string;
  tone: DifficultyTone;
}

// The three difficulty buttons the interface offers: which stored level labels
// each one covers, and how a quiz at that level is presented.
//
// The database seeds four levels — low, medium, high and advanced — so one
// button has to cover two. The older spellings are kept because they cost
// nothing: a label the database does not hold simply matches no row.
//
// One map rather than three lists, because three lists is what this was, and
// they drifted. "advanced" was added to the filter alone, so a quiz at the
// hardest level the database holds was found by the "Просунутий" button and
// then shown with the raw English word on the green badge meaning "easiest" —
// the card contradicting the filter that produced it.
const DIFFICULTY_BUCKETS: Readonly<Record<string, DifficultyBucket>> = Object.freeze({
  easy: Object.freeze({ levels: ["low", "easy"], text: "Початковий", tone: "green" }),
  medium: Object.freeze({ levels: ["medium", "normal"], text: "Середній", tone: "blue" }),
  hard: Object.freeze({ levels: ["high", "advanced", "hard"], text: "Просунутий", tone: "coral" })
} satisfies Record<string, DifficultyBucket>);

function bucketFor(value: string | null | undefined): DifficultyBucket | undefined {
  const normalized = String(value ?? "").toLowerCase();
  return Object.values(DIFFICULTY_BUCKETS).find(bucket => bucket.levels.includes(normalized));
}

export function difficultyLabel(value: string | null | undefined): string {
  return bucketFor(value)?.text || String(value || "Не вказано");
}

export function difficultyTone(value: string | null | undefined): DifficultyTone {
  return bucketFor(value)?.tone || "green";
}

// The level labels to ask the API for. An unknown button narrows nothing rather
// than narrowing the catalogue to nothing, which is also what "Усі" wants.
//
// Typed as a plain string rather than a union of the four buttons: the value
// arrives from a click handler on data-driven markup, and an unknown one is a
// case this function is written to answer, not one the compiler should forbid.
export function complexityLabels(filter: string): string[] {
  return [...(DIFFICULTY_BUCKETS[filter]?.levels ?? [])];
}

export function parseRoute(hash: string = globalThis.location?.hash || ""): Route {
  const route = hash.replace(/^#\/?/, "").replace(/\?.*$/, "");
  const [name = "", ...params] = route.split("/").filter(Boolean);
  return { name: name || "home", params };
}

export function safeHash(value: string | null | undefined, fallback = "#/"): string {
  return /^#\/[a-z0-9/_-]*$/i.test(value || "") ? (value as string) : fallback;
}

export function quizCountLabel(count: number): string {
  const value = Math.abs(Number(count));
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "тестів";
  if (last === 1) return "тест";
  if (last >= 2 && last <= 4) return "тести";
  return "тестів";
}

// Submitting at the moment the countdown reaches zero is submitting too late.
// The API stamps a completion when it handles the request and refuses anything
// stamped after the deadline, so a request that leaves at zero arrives late by
// however long the network took — always. The submission has to start before
// the deadline for the answers to count at all.
//
// Three seconds buys room for a slow connection. It is time taken off the end
// of the attempt, which is the price of not losing the whole thing.
export const AUTO_SUBMIT_LEAD_MS = 3_000;

/**
 * How long to wait before submitting an attempt on the reader's behalf, or null
 * when there is nothing worth waiting for.
 *
 * Null once the deadline has passed: the API would refuse that submission, so
 * firing one would only replace a quiz the reader can no longer finish with an
 * error about it. Zero when the deadline is closer than the lead — there is
 * still a chance, and not trying is a certainty.
 */
export function autoSubmitDelay(
  expiresAt: string | null | undefined,
  now: number = serverNow()
): number | null {
  const deadline = new Date(expiresAt ?? Number.NaN).getTime();
  if (!Number.isFinite(deadline) || deadline <= now) return null;
  return Math.max(0, deadline - AUTO_SUBMIT_LEAD_MS - now);
}
