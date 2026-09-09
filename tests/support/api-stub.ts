// A stand-in for the API, so App can be driven without a server.
//
// Routes are matched on method and pathname only; the query string is handed to
// the handler, because several of these tests are about what the app asked for
// rather than what it did with the answer.

/** One recorded request, as the assertions read it back. */
export interface StubCall {
  key: string;
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  authorization: string | null;
}

/** What a route hands back. A bare object is a 200 with that body. */
export interface StubResponse {
  status?: number;
  body?: unknown;
}

export type StubHandler =
  | StubResponse
  | ((call: StubCall) => StubResponse | Promise<StubResponse>);

export interface StubbedApi {
  calls: StubCall[];
  countOf: (key: string) => number;
  lastOf: (key: string) => StubCall | null;
}

export function stubApi(routes: Record<string, StubHandler>): StubbedApi {
  const calls: StubCall[] = [];

  globalThis.fetch = (async (url: string | URL | Request, options: RequestInit = {}) => {
    const target = new URL(String(url));
    const method = options.method || "GET";
    const key = `${method} ${target.pathname}`;
    const headers = options.headers as Record<string, string> | undefined;
    calls.push({
      key,
      method,
      path: target.pathname,
      query: target.searchParams,
      body: typeof options.body === "string" ? JSON.parse(options.body) : null,
      authorization: headers?.["Authorization"] ?? null
    });

    const handler = routes[key];
    if (!handler) {
      // Louder than a 404: an unrouted call means the test does not describe
      // what the app actually does, and a silent empty answer would hide that.
      throw new Error(`No stub for ${key}. Stubbed: ${Object.keys(routes).join(", ") || "nothing"}`);
    }

    const result = typeof handler === "function"
      ? await handler(calls.at(-1) as StubCall)
      : handler;
    const { status = 200, body = {} } = result ?? {};
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" }
    });
  }) as typeof globalThis.fetch;

  return {
    calls,
    countOf: key => calls.filter(call => call.key === key).length,
    lastOf: key => calls.filter(call => call.key === key).at(-1) ?? null
  };
}

// A JWT only as far as session.ts reads one: it splits on ".", base64-decodes
// the middle and takes sub, roles and exp. Nothing verifies a signature here.
let issued = 0;

export interface FakeTokenOptions {
  roles?: string[];
  ttlSeconds?: number;
}

export function fakeToken(username: string, { roles = ["ROLE_USER"], ttlSeconds = 900 }: FakeTokenOptions = {}): string {
  const payload = {
    sub: username,
    roles,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    // Every token minted here is a distinct string. Without this, exp lands in
    // whole seconds and two tokens issued in the same second are byte-identical
    // — which would quietly hide any bug that turns on a token changing, such
    // as a refresh being mistaken for a different reader signing in.
    jti: (issued += 1)
  };
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(payload)}.signature`;
}

export function loginResponse(username: string, options?: FakeTokenOptions): StubResponse {
  return { body: { accessToken: fakeToken(username, options), tokenType: "Bearer", expiresIn: 900 } };
}
