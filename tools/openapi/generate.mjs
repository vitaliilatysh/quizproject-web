import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { parseArgs } from "node:util";
import openapiTS, { astToString } from "openapi-typescript";
import { format, resolveConfig } from "prettier";

const root = new URL("../../", import.meta.url);
const snapshot = new URL("contract/openapi.json", root);
const output = new URL("src/generated/api.d.ts", root);
const provenance = new URL("contract/source.json", root);

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    if (typeof value.$ref === "string" && !value.$ref.startsWith("#/")) {
      throw new Error("External $refs are not allowed: commit a self-contained backend export.");
    }
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, sorted(value[key])])
    );
  }
  return value;
}

export function canonicalContract(document) {
  if (!/^3\.[01]\./.test(document.openapi) || !document.paths || !document.components?.schemas) {
    throw new Error("Expected an OpenAPI 3.0/3.1 document with paths and component schemas.");
  }
  // Hostnames describe where the exporter ran, not the wire contract.
  const { servers: _servers, ...contract } = document;
  return JSON.stringify(sorted(contract), null, 2) + "\n";
}

export async function generateTypes(document) {
  const schema = JSON.parse(canonicalContract(document));
  const ast = await openapiTS(schema, { alphabetize: true, defaultNonNullable: false });
  return format(
    "/** Generated from contract/openapi.json. Do not edit; run npm run api:generate. */\n" +
      astToString(ast),
    { ...(await resolveConfig(fileURLToPath(root))), parser: "typescript", endOfLine: "lf" }
  );
}

export async function run(args, files = { snapshot, output, provenance }) {
  const { values } = parseArgs({
    args,
    options: {
      check: { type: "boolean", default: false },
      schema: { type: "string" },
      source: { type: "string" }
    }
  });
  if (values.source && !/^[0-9a-f]{40}$/.test(values.source)) {
    throw new Error("--source must be the full backend commit SHA.");
  }
  if (values.schema && !values.check && !values.source) {
    throw new Error("Importing a contract requires --source <backend-commit-sha>.");
  }
  const input = values.schema ? resolve(values.schema) : files.snapshot;
  const document = JSON.parse(await readFile(input, "utf8"));
  const contract = canonicalContract(document);
  const generated = await generateTypes(document);
  if (values.check) {
    const held = canonicalContract(JSON.parse(await readFile(files.snapshot, "utf8")));
    if (contract !== held) {
      throw new Error(
        "Backend OpenAPI contract drifted. Import the new export, regenerate types and review the diff."
      );
    }
    if (generated !== (await readFile(files.output, "utf8")).replaceAll("\r\n", "\n")) {
      throw new Error("Generated API types are stale. Run npm run api:generate and commit the output.");
    }
    console.log("OpenAPI contract and generated types are in sync.");
    return;
  }
  await mkdir(dirname(fileURLToPath(files.output)), { recursive: true });
  if (values.schema) {
    await mkdir(dirname(fileURLToPath(files.snapshot)), { recursive: true });
    await writeFile(files.snapshot, contract);
    await writeFile(
      files.provenance,
      JSON.stringify(
        {
          repository: "vitaliilatysh/quizproject",
          commit: values.source
        },
        null,
        2
      ) + "\n"
    );
  }
  await writeFile(files.output, generated);
  console.log("Generated src/generated/api.d.ts from the backend contract.");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await run(process.argv.slice(2));
}
