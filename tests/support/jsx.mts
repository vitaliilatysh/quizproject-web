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
    // Without this the transform's output has no line mapping back to the
    // source, and everything downstream counts lines in the erased code while
    // reporting them against the original file. Both readers of those numbers
    // were wrong, in ways that looked plausible:
    //
    //   coverage      it named request<T>'s body uncovered — a method every
    //                 one of the tests goes through — while clock.ts read 25%
    //                 of lines against 100% of its functions. The
    //                 contradiction is the only reason anyone looked.
    //   stack traces  a throw was reported one line above itself.
    //
    // The map alone fixes neither completely: Node applies it to stack traces
    // only under --enable-source-maps, which `npm test` and `npm run coverage`
    // both pass. With the pair in place the coverage report named real gaps —
    // the request timeout branch and QuizApi.quiz(), neither of which had a
    // test at the time.
    //
    // The caveat, and the reason the gate does not pass the flag: `line %`
    // becomes conservative. Lines with no mapping — a file's comment header,
    // chiefly — count against the total, so a heavily commented module reads
    // low even at full coverage of its code, and a 100% threshold could never
    // be met. `npm run coverage:check` runs without the flag, where the
    // denominator is the executable lines and the threshold means what it
    // says; `npm run coverage` runs with it, for finding what is missing.
    //
    // Inline rather than a file, because there is no build directory here: the
    // transformed source only ever exists in memory.
    sourcemap: "inline",
    sourcefile: url
  });
  return { format: "module", shortCircuit: true, source: code };
}
