import assert from "node:assert/strict";
import test from "node:test";

// Node has no sessionStorage, and session.ts reads it lazily inside each
// function, so a stub installed before the first call is enough.
//
// Typed as a real Storage so the stub cannot quietly drift from the interface
// the code under test is written against — `clear` is not used by anything here
// and was missing from this object entirely until the compiler said so.
function useStubStorage(entries: Record<string, string> = {}): void {
  const store = new Map<string, string>(Object.entries(entries));
  const storage: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null
  };
  globalThis.sessionStorage = storage;
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
