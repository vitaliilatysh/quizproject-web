import assert from "node:assert/strict";
import test from "node:test";
import { difficultyLabel, escapeHtml, formatCountdown, safeHash } from "../public/js/utils.js";

test("escapeHtml neutralizes text inserted into templates", () => {
  assert.equal(escapeHtml(`<img src=x onerror='boom'>&`), "&lt;img src=x onerror=&#39;boom&#39;&gt;&amp;");
});

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
