import assert from "node:assert/strict";
import test from "node:test";
import { formText } from "../src/form-data.js";

test("text form fields preserve whitespace and Unicode, including passwords", () => {
  const data = new FormData();
  data.set("password", "  секрет 🔑  ");
  data.set("empty", "");
  assert.equal(formText(data, "password"), "  секрет 🔑  ");
  assert.equal(formText(data, "empty"), "");
});

test("missing fields and file uploads do not become text in API requests", () => {
  const data = new FormData();
  data.set("username", new File(["olena"], "username.txt"));
  assert.equal(formText(data, "missing"), "");
  assert.equal(formText(data, "username"), "");
});
