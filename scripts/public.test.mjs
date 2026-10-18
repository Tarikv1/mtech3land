// The site repo is public: internal price tooling and its source must never be committed here.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadJson } from "./lib.mjs";
import { build } from "./build.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEXT = /\.(mjs|js|json|md|html|yml|yaml|css|txt|svg)$/;
// tokens are assembled from parts so this file never contains them literally (the scan includes this file)
const word = (...parts) => parts.join("");
const TOOL = word("fetch", "-", "prices");
const FORBIDDEN = new RegExp([word("fix", "-?", "point"), word("rp", "_", "csrf"), word("admin", "-", "ajax"), TOOL].join("|"), "i");

const tracked = () =>
  execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);

test("no internal price tooling in the tracked tree", () => {
  const files = tracked();
  assert.ok(files.length > 10, "git ls-files returned the tree");
  const tooling = files.filter((f) => f.includes(TOOL) || f.startsWith("scripts/fixtures/"));
  assert.deepEqual(tooling, []);
  const hits = files
    .filter((f) => TEXT.test(f) && fs.existsSync(path.join(root, f)))
    .filter((f) => FORBIDDEN.test(fs.readFileSync(path.join(root, f), "utf8")));
  assert.deepEqual(hits, []);
});

test("prices carry no source tags", () => {
  const prices = loadJson(root, "assets/data/prices.json");
  assert.ok(prices.devices.length > 0);
  assert.deepEqual(prices.devices.filter((d) => "source" in d).map((d) => d.device), []);
});

test("robots.txt lists only the sitemap", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "mt-public-"));
  build({ root, outDir: out, quiet: true });
  assert.equal(fs.readFileSync(path.join(out, "robots.txt"), "utf8"), "User-agent: *\nAllow: /\n\nSitemap: https://mtech3land.com/sitemap.xml\n");
});
