import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);
const htmlUrl = new URL("client/index.html", dist);
const html = await readFile(htmlUrl, "utf8");

if (!html.includes("Quiz Project") || !html.includes("/assets/")) {
  throw new Error("Vite did not produce the expected Quiz Project application.");
}

// The build is split three ways, and the split is worth asserting because it
// would come undone silently. React lives in its own chunk so that a deploy
// does not make a returning reader fetch it again, and the administration panel
// in another so that most readers never fetch it at all. A change to the
// manualChunks matcher, or a static import of the panel from somewhere the
// entry reaches, merges a chunk back in and nothing else would say so: the page
// still works, it is only heavier.
const assets = await readdir(new URL("client/assets/", dist));
const chunks = assets.filter(name => name.endsWith(".js"));

for (const [label, prefix] of [
  ["React", "react-"],
  ["the administration panel", "admin-page-"]
] as const) {
  if (!chunks.some(name => name.startsWith(prefix))) {
    throw new Error(
      `${label} is no longer a chunk of its own — expected one named ${prefix}*.js, ` +
        `found ${chunks.join(", ")}. Check build.rollupOptions.output.manualChunks ` +
        `in vite.config.ts, and that nothing the entry reaches imports AdminPage statically.`
    );
  }
}

// Only the entry is referenced from the HTML; the other two are reached from it.
// If the panel's chunk were linked here it would be fetched on every visit,
// which is the thing being avoided.
if (html.includes("admin-page-")) {
  throw new Error("The administration panel is linked from index.html, so every reader fetches it.");
}

await mkdir(new URL("server/", dist), { recursive: true });
await mkdir(new URL(".openai/", dist), { recursive: true });
await copyFile(new URL("../.openai/hosting.json", import.meta.url), new URL(".openai/hosting.json", dist));

await writeFile(
  new URL("server/index.js", dist),
  `export default {
  async fetch(request, env) {
    if (!env?.ASSETS?.fetch) {
      return new Response("Quiz Project Web assets are unavailable.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;

    const origin = new URL(request.url).origin;
    const body = (await response.text()).replaceAll("__SITE_ORIGIN__", origin);
    const headers = new Headers(response.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(body, { status: response.status, headers });
  }
};\n`
);

console.log("Prepared Quiz Project Web for hosting.");
