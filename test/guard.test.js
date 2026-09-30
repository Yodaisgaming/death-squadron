import { test } from "node:test";
import assert from "node:assert/strict";
import { scanText } from "../scripts/guard.js";

const b64 = (s) => Buffer.from(s, "base64").toString("utf8");
const USER_ID = b64("MzUwMTkx");
const COMPANY = b64("VmFudGFnZQ==");
const SHORT = b64("aHNv");
const UUID = ["00000000", "0000", "4000", "8000", "00000000abcd"].join("-");
const WIN_PATH = ["C:", "Users", "someone"].join("\\");

test("guard flags work identifiers, paths and ids", () => {
  assert.ok(scanText("a.md", `id ${USER_ID}`).length);
  assert.ok(scanText("a.md", `${COMPANY} Education`).length);
  assert.ok(scanText("a.md", `${COMPANY.toLowerCase()}-workspace`).length);
  assert.ok(scanText("a.md", `the ${SHORT} site`).length);
  assert.ok(scanText("a.md", WIN_PATH).length);
  assert.ok(scanText("a.md", UUID).length);
});

test("guard lets ordinary words and fixtures through", () => {
  assert.equal(scanText("a.md", "an advantage for the fleet").length, 0);
  assert.equal(scanText("a.js", "var thsox=1").length, 0);
  assert.equal(scanText("test/fixtures/claude/x.json", UUID).length, 0);
});

test("dist may only reference localhost and XML namespaces", () => {
  assert.ok(scanText("dist/a.js", "fetch('https://example.com/x')", { dist: true }).length);
  assert.equal(scanText("dist/a.js", "'http://www.w3.org/2000/svg' 'http://localhost:7777/'", { dist: true }).length, 0);
});
