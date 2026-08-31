// Node runs .mjs and .js; it does not know what to do with JSX. This hook hands
// every .jsx file to esbuild on the way in, which is the same transform Vite
// applies to the same files when the app is built — the tests therefore run the
// components as written, not a copy of them.
//
// A module hook rather than a build step so there is nothing to keep in sync and
// nothing to clean up: `node --import ./tests/support/register.mjs` is the whole
// of it, and a file edited between runs is picked up on the next one.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { transformSync } from "esbuild";

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".jsx")) return nextLoad(url, context);

  const source = await readFile(fileURLToPath(url), "utf8");
  const { code } = transformSync(source, {
    loader: "jsx",
    jsx: "automatic",
    format: "esm",
    target: "node22",
    sourcefile: url
  });
  return { format: "module", shortCircuit: true, source: code };
}
