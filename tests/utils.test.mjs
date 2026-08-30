import assert from "node:assert/strict";
import test from "node:test";
import { complexityLabels, difficultyLabel, difficultyTone, formatCountdown, parseRoute, quizCountLabel, safeHash } from "../src/utils.js";

// The levels the production migration seeds. Every one of them reaches the
// interface, so everything the interface does with difficulty has to account
// for all four.
const STORED_LEVELS = ["low", "medium", "high", "advanced"];

test("difficultyLabel translates backend values", () => {
  assert.equal(difficultyLabel("EASY"), "Початковий");
  assert.equal(difficultyLabel("medium"), "Середній");
  assert.equal(difficultyLabel("custom"), "custom");
});

test("formatCountdown never renders negative time", () => {
  assert.equal(formatCountdown("2026-01-01T00:01:05Z", Date.parse("2026-01-01T00:00:00Z")), "01:05");
  assert.equal(formatCountdown("2026-01-01T00:00:00Z", Date.parse("2026-01-01T00:01:00Z")), "00:00");
});

test("safeHash rejects navigation outside the SPA", () => {
  assert.equal(safeHash("#/attempt/42"), "#/attempt/42");
  assert.equal(safeHash("https://evil.example"), "#/");
});

test("parseRoute extracts a route and its parameters", () => {
  assert.deepEqual(parseRoute("#/attempt/42?source=history"), { name: "attempt", params: ["42"] });
  assert.deepEqual(parseRoute(""), { name: "home", params: [] });
});

test("quizCountLabel follows Ukrainian plural forms", () => {
  assert.equal(quizCountLabel(1), "тест");
  assert.equal(quizCountLabel(3), "тести");
  assert.equal(quizCountLabel(12), "тестів");
  assert.equal(quizCountLabel(21), "тест");
});

test("complexityLabels maps every difficulty button onto stored level labels", () => {
  // The database seeds low, medium, high and advanced. "advanced" previously
  // belonged to no bucket, so those quizzes disappeared from every filter but
  // "all"; it now sits with the hardest group.
  assert.deepEqual(complexityLabels("all"), []);
  assert.deepEqual(complexityLabels("easy"), ["low", "easy"]);
  assert.deepEqual(complexityLabels("medium"), ["medium", "normal"]);
  assert.ok(complexityLabels("hard").includes("advanced"));
  assert.ok(complexityLabels("hard").includes("high"));

  const covered = new Set(["all", "easy", "medium", "hard"].flatMap(complexityLabels));
  for (const stored of STORED_LEVELS) {
    assert.ok(covered.has(stored), `no button offers the stored level "${stored}"`);
  }

  // An unknown value must not silently narrow the catalogue to nothing.
  assert.deepEqual(complexityLabels("nonsense"), []);
});

test("every stored level is translated and coloured, not only filtered", () => {
  // Filtering, wording and colour were three separate lists, and "advanced" was
  // added to the first alone: the hardest level the database holds was found by
  // the "Просунутий" button and then shown as the raw word "advanced" on the
  // green badge that means "easiest". Asserting the whole seeded set rather
  // than that one value, because the next level added will drift the same way.
  for (const level of STORED_LEVELS) {
    assert.notEqual(difficultyLabel(level), level, `level "${level}" is shown untranslated`);
    assert.ok(["green", "blue", "coral"].includes(difficultyTone(level)),
      `level "${level}" has no colour of its own`);
  }

  assert.equal(difficultyLabel("advanced"), "Просунутий");
  // Tied to the level it shares a bucket with rather than to a literal, so the
  // two cannot be given different colours without failing here.
  assert.equal(difficultyTone("advanced"), difficultyTone("high"));

  // A value the database does not hold still has to render as something.
  assert.equal(difficultyLabel("custom"), "custom");
  assert.equal(difficultyLabel(""), "Не вказано");
  assert.equal(difficultyTone("custom"), "green");
});
