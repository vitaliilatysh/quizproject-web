// One convention the browser suite has to keep, and the reason it exists.
//
// `force` switches off Playwright's actionability checks — including the
// stability wait, which is the one that refuses to click an element that is
// still moving. The attempt page moves: a countdown above the answers
// re-renders on a timer. With `force`, a click point computed just before a
// re-render is dispatched at stale coordinates afterwards.
//
// That is not theory. quiz-workflows.spec.ts used `check({ force: true })` on
// `.answer-option input`, which styles.css gives pointer-events: none so that
// the label is the hit target, and the suite failed on 2026-09-24 with
// "Clicking the checkbox did not change its state" — twice in one job, original
// and retry. Reproduced afterwards on a page carrying the same stylesheet rule
// and a block above it that changes height: three failures in ten runs, the same
// message, while clicking the label passed every time.
//
// A flake is silent, so a comment at the call site would not have stopped this
// coming back. If some future case genuinely needs `force`, this test is the
// place to record what was considered: that the element is the real hit target,
// and that nothing above it moves.
import assert from "node:assert/strict";
import test from "node:test";

import { readFile, readdir } from "node:fs/promises";

test("no browser test switches off the checks that catch a moving target", async () => {
  const specs = (await readdir("e2e")).filter(name => name.endsWith(".ts"));
  assert.ok(specs.length > 0, "no browser specs were found to check");

  const offenders: string[] = [];
  for (const name of specs) {
    const body = await readFile(`e2e/${name}`, "utf8");
    body.split("\n").forEach((line, index) => {
      // Comment lines are skipped, because the explanation of why not to use
      // this has to be allowed to name it. A guard that cannot survive being
      // written down next to its own reason is a guard nobody keeps.
      const code = line.trimStart();
      if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
      if (/\bforce:\s*true\b/.test(line)) offenders.push(`e2e/${name}:${index + 1}`);
    });
  }

  assert.deepEqual(offenders, [], `force: true is back at ${offenders.join(", ")}`);
});
