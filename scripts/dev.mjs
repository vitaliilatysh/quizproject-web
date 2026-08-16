import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

function resolveFile(pathname) {
  const cleanPath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidate = normalize(join(root, cleanPath || "index.html"));
  if (!candidate.startsWith(root)) return null;
  try {
    return statSync(candidate).isFile() ? candidate : join(root, "index.html");
  } catch {
    return join(root, "index.html");
  }
}

createServer((request, response) => {
  if (!request.url || !["GET", "HEAD"].includes(request.method ?? "")) {
    response.writeHead(405).end();
    return;
  }
  const file = resolveFile(new URL(request.url, `http://${request.headers.host}`).pathname);
  if (!file) {
    response.writeHead(403).end();
    return;
  }
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": mime[extname(file)] ?? "application/octet-stream"
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Local: http://127.0.0.1:${port}`);
});
