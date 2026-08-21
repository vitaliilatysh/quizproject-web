import assert from "node:assert/strict";
import test from "node:test";
import { difficultyLabel, formatCountdown, parseRoute, quizCountLabel, safeHash } from "../src/utils.js";

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
