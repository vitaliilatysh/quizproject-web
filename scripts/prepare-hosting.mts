import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);
const htmlUrl = new URL("client/index.html", dist);
const html = await readFile(htmlUrl, "utf8");

if (!html.includes("Quiz Project") || !html.includes("/assets/")) {
  throw new Error("Vite did not produce the expected Quiz Project application.");
}

await mkdir(new URL("server/", dist), { recursive: true });
await mkdir(new URL(".openai/", dist), { recursive: true });
await copyFile(new URL("../.openai/hosting.json", import.meta.url), new URL(".openai/hosting.json", dist));

await writeFile(new URL("server/index.js", dist), `export default {
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
};\n`);

console.log("Prepared Quiz Project Web for hosting.");
