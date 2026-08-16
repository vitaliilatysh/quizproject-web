import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = new URL("../dist/", import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(new URL("client/", dist), { recursive: true });
await mkdir(new URL("server/", dist), { recursive: true });
await mkdir(new URL(".openai/", dist), { recursive: true });
await cp(new URL("../public/", import.meta.url), new URL("client/", dist), { recursive: true });
await cp(new URL("../.openai/hosting.json", import.meta.url), new URL(".openai/hosting.json", dist));

const html = await readFile(new URL("client/index.html", dist), "utf8");
if (!html.includes("Quiz Project") || html.includes("codex-preview")) {
  throw new Error("The production page is missing final product metadata.");
}

await writeFile(new URL("server/index.js", dist), `export default {
  async fetch(request, env) {
    if (env?.ASSETS?.fetch) {
      const response = await env.ASSETS.fetch(request);
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const origin = new URL(request.url).origin;
        const html = (await response.text()).replaceAll("__SITE_ORIGIN__", origin);
        const headers = new Headers(response.headers);
        headers.set("content-type", "text/html; charset=utf-8");
        return new Response(html, { status: response.status, headers });
      }
      return response;
    }
    return new Response("Quiz Project Web assets are unavailable.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};\n`);

console.log(`Built Quiz Project Web from ${root}`);
