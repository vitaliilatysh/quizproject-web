import assert from "node:assert/strict";
import test from "node:test";

// Node has no sessionStorage, and session.js reads it lazily inside each
// function, so a stub installed before the first call is enough.
function useStubStorage(entries = {}) {
  const store = new Map(Object.entries(entries));
  globalThis.sessionStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    get length() { return store.size; },
    key: index => [...store.keys()][index] ?? null
  };
}

test("clearStoredAnswers removes every attempt's answers and nothing else", async () => {
  const store = {
    "quizproject.answers.1": "[10,11]",
    "quizproject.answers.42": "[7]",
    "quizproject.session": "{\"accessToken\":\"x\"}",
    "quizproject.returnTo": "#/quizzes"
  };
  useStubStorage(store);
  const { clearStoredAnswers, readAnswers } = await import("../src/session.js");

  clearStoredAnswers();

  assert.deepEqual([...readAnswers(1)], []);
  assert.deepEqual([...readAnswers(42)], []);
  assert.equal(sessionStorage.getItem("quizproject.session"), "{\"accessToken\":\"x\"}");
  assert.equal(sessionStorage.getItem("quizproject.returnTo"), "#/quizzes");
});
