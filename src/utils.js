export function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatCountdown(expiresAt, now = Date.now()) {
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// How many quizzes the home page teases. It is both the number rendered and the
// page size requested, so the two cannot drift apart.
export const HOME_TEASER_SIZE = 3;

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
const DIFFICULTY_BUCKETS = Object.freeze({
  easy: Object.freeze({ levels: ["low", "easy"], text: "Початковий", tone: "green" }),
  medium: Object.freeze({ levels: ["medium", "normal"], text: "Середній", tone: "blue" }),
  hard: Object.freeze({ levels: ["high", "advanced", "hard"], text: "Просунутий", tone: "coral" })
});

function bucketFor(value) {
  const normalized = String(value ?? "").toLowerCase();
  return Object.values(DIFFICULTY_BUCKETS).find(bucket => bucket.levels.includes(normalized));
}

export function difficultyLabel(value) {
  return bucketFor(value)?.text || String(value || "Не вказано");
}

export function difficultyTone(value) {
  return bucketFor(value)?.tone || "green";
}

// The level labels to ask the API for. An unknown button narrows nothing rather
// than narrowing the catalogue to nothing, which is also what "Усі" wants.
export function complexityLabels(filter) {
  return DIFFICULTY_BUCKETS[filter]?.levels ?? [];
}

export function parseRoute(hash = globalThis.location?.hash || "") {
  const route = hash.replace(/^#\/?/, "").split("?")[0];
  const [name = "", ...params] = route.split("/").filter(Boolean);
  return { name: name || "home", params };
}

export function safeHash(value, fallback = "#/") {
  return /^#\/[a-z0-9/_-]*$/i.test(value || "") ? value : fallback;
}

export function quizCountLabel(count) {
  const value = Math.abs(Number(count));
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "тестів";
  if (last === 1) return "тест";
  if (last >= 2 && last <= 4) return "тести";
  return "тестів";
}
