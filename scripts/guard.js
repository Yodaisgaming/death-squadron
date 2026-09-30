#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const decode = (b64) => JSON.parse(Buffer.from(b64, "base64").toString("utf8"));

const SUBSTRING_TERMS = decode("WyIzNTAxOTEiLCJwcmFldmVuc2FuYSIsImFwYW1lZCIsIm5vdmFhY2FkZW15Il0=");
const WORD_TERMS = decode("WyJoc28iLCJidnMiLCJtYnN6Il0=");
const COMPANY = Buffer.from("dmFudGFnZQ==", "base64").toString("utf8");

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const RULES = [
  ...SUBSTRING_TERMS.map((t) => ({ name: `term #${SUBSTRING_TERMS.indexOf(t) + 1}`, re: new RegExp(escapeRe(t), "i") })),
  ...WORD_TERMS.map((t, i) => ({ name: `short term #${i + 1}`, re: new RegExp(`(?<![A-Za-z0-9_$])${escapeRe(t)}(?![A-Za-z0-9_$])`, "i") })),
  { name: "company name", re: new RegExp(`(?<!ad)${COMPANY}`, "i") },
  { name: "Windows user path", re: /[A-Za-z]:(\\\\|\\|\/)+Users/i },
];

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const URL_RE = /https?:\/\/[^\s"'`)<>]*/gi;
const URL_ALLOW = [/^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i, /^http:\/\/www\.w3\.org\//i];

const BINARY_EXT = new Set([".ttf", ".woff", ".woff2", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".glb", ".tgz", ".ico"]);
const isBinary = (p) => BINARY_EXT.has(p.slice(p.lastIndexOf(".")).toLowerCase());
const isFixture = (p) => p.split(/[\\/]/).slice(0, 2).join("/") === "test/fixtures";

export function scanText(path, text, { dist = false } = {}) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.re.test(line)) hits.push({ path, line: i + 1, rule: rule.name });
    }
    if (!isFixture(path) && UUID_RE.test(line)) hits.push({ path, line: i + 1, rule: "UUID-shaped string outside test/fixtures" });
    if (dist) {
      for (const m of line.matchAll(URL_RE)) {
        if (!URL_ALLOW.some((re) => re.test(m[0]))) hits.push({ path, line: i + 1, rule: `external URL in dist: ${m[0].slice(0, 60)}` });
      }
    }
  });
  return hits;
}

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: ROOT });
  return out.toString("utf8").split("\0").filter(Boolean);
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else files.push(p);
  }
  return files;
}

function main() {
  const args = process.argv.slice(2);
  const hits = [];
  for (const rel of trackedFiles()) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs) || isBinary(rel)) continue;
    hits.push(...scanText(rel.split(sep).join("/"), readFileSync(abs, "utf8")));
  }
  const distDir = join(ROOT, "dist");
  if (args.includes("--dist") || existsSync(distDir)) {
    if (existsSync(distDir)) {
      for (const abs of walk(distDir)) {
        const rel = relative(ROOT, abs).split(sep).join("/");
        if (isBinary(rel)) continue;
        hits.push(...scanText(rel, readFileSync(abs, "utf8"), { dist: true }));
      }
    } else if (args.includes("--dist")) {
      console.error("guard: dist/ is missing, run npm run build first");
      process.exit(1);
    }
  }
  if (hits.length) {
    console.error(`guard: ${hits.length} finding(s)`);
    for (const h of hits.slice(0, 50)) console.error(`  ${h.path}:${h.line}  ${h.rule}`);
    process.exit(1);
  }
  console.log("guard: clean");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
