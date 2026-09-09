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

// Everything below drives the branches the suite never reached: the two catch
// blocks, the storage writers, and the three fallbacks readApiUrl walks.

test("a session that is absent, malformed or expired reads as no session", async () => {
  const { readSession } = await import("../src/session.js");

  useStubStorage();
  assert.equal(readSession(), null, "nothing stored is nobody signed in");

  useStubStorage({ "quizproject.session": "{not json" });
  assert.equal(readSession(), null, "a malformed entry is not a session");

  // Shape, not just parseability: another tab or an older build could have left
  // something JSON-valid behind that is not a session at all.
  useStubStorage({ "quizproject.session": JSON.stringify({ accessToken: 42 }) });
  assert.equal(readSession(), null, "a wrong-shaped entry is not a session");

  useStubStorage({
    "quizproject.session": JSON.stringify({
      accessToken: "x", tokenType: "Bearer", username: "olena", roles: [],
      expiresAt: Date.now() - 1
    })
  });
  assert.equal(readSession(), null, "an expired session is over");
  assert.equal(sessionStorage.getItem("quizproject.session"), null,
    "the expired entry was left behind for the next read to trip over");
});

test("a stored session is returned whole", async () => {
  const { readSession } = await import("../src/session.js");
  const stored = {
    accessToken: "header.payload.signature", tokenType: "Bearer",
    expiresAt: Date.now() + 60_000, username: "olena", roles: ["ROLE_USER"]
  };
  useStubStorage({ "quizproject.session": JSON.stringify(stored) });
  assert.deepEqual(readSession(), stored);
});

// The JWT is read, not verified: sub and roles come from the payload, and the
// expiry prefers the token's own claim over the advertised lifetime.
test("writeSession prefers the token's expiry and falls back to expiresIn", async () => {
  const { writeSession } = await import("../src/session.js");
  useStubStorage();

  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 600;
  const jwt = `${encode({ alg: "none" })}.${encode({ sub: "olena", roles: ["ROLE_ADMIN"], exp })}.sig`;

  const fromClaim = writeSession({ accessToken: jwt, tokenType: "Bearer", expiresIn: 900 }, "ignored");
  assert.equal(fromClaim.username, "olena", "the token's subject wins over the typed login");
  assert.deepEqual(fromClaim.roles, ["ROLE_ADMIN"]);
  assert.equal(fromClaim.expiresAt, exp * 1000);
  assert.equal(JSON.parse(String(sessionStorage.getItem("quizproject.session"))).username, "olena");

  // A token this function cannot read at all: the decode fails, the payload is
  // empty, and both the login and the expiry come from what the API said.
  const before = Date.now();
  const opaque = writeSession({ accessToken: "not-a-jwt", tokenType: "", expiresIn: 900 }, "petro");
  assert.equal(opaque.username, "petro", "with no subject to read, the typed login stands");
  assert.deepEqual(opaque.roles, []);
  assert.equal(opaque.tokenType, "Bearer", "an empty token type still authorises as Bearer");
  assert.ok(opaque.expiresAt >= before + 900_000, "expiresIn was not used");

  // An expiry already in the past is not an expiry worth keeping.
  const stale = `${encode({ alg: "none" })}.${encode({ sub: "olena", exp: 1 })}.sig`;
  const recovered = writeSession({ accessToken: stale, tokenType: "Bearer", expiresIn: 60 }, "olena");
  assert.ok(recovered.expiresAt > Date.now(), "a past claim was preferred over the live lifetime");

  // roles that are not a list, and entries inside one that are not strings.
  const odd = `${encode({ alg: "none" })}.${encode({ sub: "olena", roles: "ROLE_USER" })}.sig`;
  assert.deepEqual(writeSession({ accessToken: odd, tokenType: "Bearer", expiresIn: 60 }, "olena").roles, []);
  const mixed = `${encode({ alg: "none" })}.${encode({ sub: "olena", roles: ["ROLE_USER", 7] })}.sig`;
  assert.deepEqual(
    writeSession({ accessToken: mixed, tokenType: "Bearer", expiresIn: 60 }, "olena").roles,
    ["ROLE_USER"], "a non-string role was carried into the session");
});

test("the API address prefers what was saved, then the runtime config, then localhost", async () => {
  const { readApiUrl, writeApiUrl } = await import("../src/session.js");
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null
  } satisfies Storage;

  delete (globalThis as { QUIZ_PROJECT_API_URL?: string }).QUIZ_PROJECT_API_URL;
  assert.equal(readApiUrl(), "http://localhost:8081", "nothing anywhere should still be usable in dev");

  globalThis.QUIZ_PROJECT_API_URL = "https://runtime.example.com";
  assert.equal(readApiUrl(), "https://runtime.example.com",
    "the address Kubernetes writes into runtime-config.js was ignored");

  writeApiUrl("https://saved.example.com");
  assert.equal(readApiUrl(), "https://saved.example.com",
    "what the reader saved must outrank the deployment's default");
  delete (globalThis as { QUIZ_PROJECT_API_URL?: string }).QUIZ_PROJECT_API_URL;
});

test("where to return to, and which quiz was waiting, survive the trip through sign-in", async () => {
  const { rememberReturnTo, consumeReturnTo, rememberPendingQuiz, consumePendingQuiz } =
    await import("../src/session.js");
  useStubStorage();

  assert.equal(consumeReturnTo(), "#/quizzes", "with nothing remembered, the catalogue is the default");

  rememberReturnTo("#/attempt/42");
  assert.equal(consumeReturnTo(), "#/attempt/42");
  assert.equal(consumeReturnTo(), "#/quizzes", "consuming it twice must not send the reader back again");

  // Anything that is not an in-app hash is refused rather than followed.
  rememberReturnTo("https://evil.example");
  assert.equal(consumeReturnTo(), "#/quizzes");

  assert.equal(consumePendingQuiz(), null, "no quiz was waiting");
  rememberPendingQuiz(7);
  assert.equal(consumePendingQuiz(), 7);
  assert.equal(consumePendingQuiz(), null, "the pending quiz was started twice");
});

test("answers are stored per attempt, and unreadable ones are simply empty", async () => {
  const { readAnswers, writeAnswers, clearAnswers } = await import("../src/session.js");
  useStubStorage();

  assert.deepEqual([...readAnswers(4)], [], "an attempt nobody has answered yet");

  writeAnswers(4, new Set([101, 102]));
  assert.deepEqual([...readAnswers(4)].sort(), [101, 102]);
  assert.deepEqual([...readAnswers(5)], [], "attempt 5 read attempt 4's answers");

  clearAnswers(4);
  assert.deepEqual([...readAnswers(4)], []);

  useStubStorage({ "quizproject.answers.9": "{not json" });
  assert.deepEqual([...readAnswers(9)], [], "a corrupt draft must not throw at the reader");

  // Stored as something parseable but not a list of whole numbers.
  useStubStorage({ "quizproject.answers.9": JSON.stringify({ nope: true }) });
  assert.deepEqual([...readAnswers(9)], []);
  useStubStorage({ "quizproject.answers.9": JSON.stringify([1, "2", 3.5, 4]) });
  assert.deepEqual([...readAnswers(9)], [1, 4], "only whole answer ids are answers");
});

test("clearSession removes the session and leaves everything else", async () => {
  const { clearSession } = await import("../src/session.js");
  useStubStorage({ "quizproject.session": "{}", "quizproject.answers.1": "[1]" });
  clearSession();
  assert.equal(sessionStorage.getItem("quizproject.session"), null);
  assert.equal(sessionStorage.getItem("quizproject.answers.1"), "[1]");
});

test("a login that advertises no lifetime is a session that is over on arrival", async () => {
  const { writeSession, readSession } = await import("../src/session.js");
  useStubStorage();

  // Zero is what the API sends for a token it will not honour, and it is also
  // what an absent field falls back to. Either way the expiry is now, and the
  // session has to read back as no session rather than as one with a deadline
  // in the past that nothing checks.
  const written = writeSession(
    { accessToken: "opaque", tokenType: "Bearer", expiresIn: 0 }, "olena");
  assert.ok(written.expiresAt <= Date.now(), "a zero lifetime bought the token time it was not given");
  assert.equal(written.username, "olena");
  assert.equal(readSession(), null, "an already-expired session was handed back as current");
});
