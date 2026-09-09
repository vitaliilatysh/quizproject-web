// Node runs .mjs and .js; it does not know what to do with JSX, and it does not
// know what to do with types. This hook hands every .ts and .tsx file to
// esbuild on the way in, which is the same transform Vite applies to the same
// files when the app is built — the tests therefore run the components as
// written, not a copy of them.
//
// A module hook rather than a build step so there is nothing to keep in sync and
// nothing to clean up: `node --import ./tests/support/register.mts` is the whole
// of it, and a file edited between runs is picked up on the next one.
//
// esbuild erases types, it does not check them. That is deliberate and it is
// why `npm run typecheck` exists as a separate command: a type error must fail
// the build for the whole repository at once, not once per test file that
// happens to import the offending module.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { transformSync, type Loader } from "esbuild";

// Longest suffix first: ".tsx" also ends with "x", and ".mts" also ends with
// ".ts" — matching in the wrong order would hand a file to the wrong loader.
const LOADERS: ReadonlyArray<readonly [suffix: string, loader: Loader]> = [
  [".tsx", "tsx"],
  [".mts", "ts"],
  [".ts", "ts"],
  [".jsx", "jsx"]
];

function loaderFor(url: string): Loader | null {
  // A query string survives into the resolved URL for some importers, so the
  // extension is read off the path rather than the whole thing.
  const path = url.split("?")[0] ?? url;
  return LOADERS.find(([suffix]) => path.endsWith(suffix))?.[1] ?? null;
}

interface ResolveContext {
  parentURL?: string | undefined;
}

/**
 * Lets the sources keep importing each other by their compiled name.
 *
 * `src/App.tsx` imports `./api.js`, because that is the specifier that will be
 * correct once anything compiles it, and it is what Vite and tsc both expect.
 * Node's resolver takes the specifier literally: it looks for `api.js` on disk,
 * does not find one, and fails. Rewriting a relative `.js`/`.jsx` specifier to
 * the `.ts`/`.tsx` file sitting beside it closes that gap without asking the
 * sources to name files that will not exist after a build.
 *
 * Only relative specifiers, and only when the TypeScript file is really there —
 * a package that genuinely ships `.js` is left alone.
 */
export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: (specifier: string, context: ResolveContext) => unknown
): Promise<unknown> {
  const parentURL = context.parentURL;
  if (parentURL && specifier.startsWith(".") && /\.jsx?$/.test(specifier)) {
    for (const replacement of [".ts", ".tsx"]) {
      const candidate = specifier.replace(/\.jsx?$/, replacement);
      if (existsSync(new URL(candidate, parentURL))) {
        return nextResolve(candidate, context);
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(
  url: string,
  context: unknown,
  nextLoad: (url: string, context: unknown) => unknown
): Promise<unknown> {
  const loader = loaderFor(url);
  if (loader === null) return nextLoad(url, context);

  const source = await readFile(fileURLToPath(url), "utf8");
  const { code } = transformSync(source, {
    loader,
    jsx: "automatic",
    format: "esm",
    target: "node22",
    sourcefile: url
  });
  return { format: "module", shortCircuit: true, source: code };
}
