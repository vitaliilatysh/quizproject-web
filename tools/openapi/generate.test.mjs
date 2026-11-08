import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { canonicalContract, generateTypes, run } from "./generate.mjs";

const schema = {
  openapi: "3.1.0",
  info: { title: "Test", version: "v1" },
  paths: {},
  components: {
    schemas: {
      Attempt: {
        type: "object",
        required: ["id", "score"],
        properties: {
          id: { type: "integer" },
          score: { type: ["integer", "null"] },
          note: { type: "string" }
        }
      }
    }
  }
};
const source = "a".repeat(40);

async function sandbox(t) {
  const directory = await mkdtemp(join(tmpdir(), "quiz-openapi-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const url = name => pathToFileURL(join(directory, name));
  const files = { snapshot: url("contract.json"), output: url("api.d.ts"), provenance: url("source.json") };
  const input = url("export.json");
  await writeFile(input, JSON.stringify(schema));
  await run(["--schema", fileURLToPath(input), "--source", source], files);
  return { files, input };
}

test("canonical contract ignores hostnames and object-key order, not nullability", () => {
  assert.equal(
    canonicalContract(schema),
    canonicalContract({
      components: schema.components,
      paths: {},
      info: schema.info,
      openapi: "3.1.0",
      servers: [{ url: "https://some-host.invalid" }]
    })
  );
  const changed = structuredClone(schema);
  changed.components.schemas.Attempt.properties.score.type = "integer";
  assert.notEqual(canonicalContract(schema), canonicalContract(changed));
});

test("generator preserves required, optional and nullable fields", async () => {
  const generated = await generateTypes(schema);
  assert.match(generated, /id: number;/);
  assert.match(generated, /score: number \| null;/);
  assert.match(generated, /note\?: string;/);
  assert.equal(generated, await generateTypes(schema));
});

test("import writes the contract, provenance and repeatable generated types", async t => {
  const { files } = await sandbox(t);
  assert.equal(await readFile(files.snapshot, "utf8"), canonicalContract(schema));
  assert.deepEqual(JSON.parse(await readFile(files.provenance, "utf8")), {
    repository: "vitaliilatysh/quizproject",
    commit: source
  });
  const before = await readFile(files.output, "utf8");
  await run([], files);
  assert.equal(await readFile(files.output, "utf8"), before);
  await run(["--check"], files);
});

test("check accepts Windows newlines without rewriting files", async t => {
  const { files, input } = await sandbox(t);
  const windows = (await readFile(files.output, "utf8")).replaceAll("\n", "\r\n");
  await writeFile(files.output, windows);
  await run(["--check", "--schema", fileURLToPath(input)], files);
  assert.equal(await readFile(files.output, "utf8"), windows);
});

test("check rejects stale generated types and does not repair them silently", async t => {
  const { files } = await sandbox(t);
  await writeFile(files.output, "// stale\n");
  await assert.rejects(run(["--check"], files), /types are stale/);
  assert.equal(await readFile(files.output, "utf8"), "// stale\n");
});

test("check rejects backend drift even for validation not expressed by TypeScript", async t => {
  const { files, input } = await sandbox(t);
  const changed = structuredClone(schema);
  changed.components.schemas.Attempt.properties.note.maxLength = 30;
  await writeFile(input, JSON.stringify(changed));
  await assert.rejects(run(["--check", "--schema", fileURLToPath(input)], files), /contract drifted/);
  assert.equal(await readFile(files.snapshot, "utf8"), canonicalContract(schema));
});

test("invalid or externally referenced contracts fail closed", async () => {
  assert.throws(() => canonicalContract({ openapi: "2.0" }), /Expected an OpenAPI/);
  assert.throws(() => canonicalContract({ ...schema, paths: null }), /Expected an OpenAPI/);
  assert.throws(() => canonicalContract({ ...schema, components: {} }), /Expected an OpenAPI/);
  assert.throws(
    () =>
      canonicalContract({
        ...schema,
        paths: {
          "/x": { $ref: "https://example.invalid/remote.json" }
        }
      }),
    /External \$refs/
  );
  await assert.rejects(run(["--schema", "missing.json"]), /requires --source/);
  await assert.rejects(run(["--source", "master"]), /full backend commit SHA/);
  await assert.rejects(run(["--typo"]), /Unknown option/);
});

test("missing or malformed schema files fail rather than accepting stale output", async t => {
  const { files, input } = await sandbox(t);
  await writeFile(input, "not JSON");
  await assert.rejects(run(["--check", "--schema", fileURLToPath(input)], files), SyntaxError);
  await rm(input);
  await assert.rejects(run(["--check", "--schema", fileURLToPath(input)], files), /ENOENT/);
});
