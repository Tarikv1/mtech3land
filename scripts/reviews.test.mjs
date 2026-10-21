import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";
import { readText } from "./html.mjs";
import { errorText, fetchReviews, nextReviews, serializeReviews, syncReviews } from "./update-reviews.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "update-reviews.mjs");
const dataFile = path.join(root, "assets", "data", "reviews.json");
const MISSING_KEY = "GOOGLE_PLACES_API_KEY missing – add it: gh secret set GOOGLE_PLACES_API_KEY -R Tarikv1/mtech3land";

const tmpDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const rm = (dir) => fs.rmSync(dir, { recursive: true, force: true });
const day = (iso) => new Date(`${iso}T09:00:00Z`);

function runCli(args, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  if (!("GOOGLE_PLACES_API_KEY" in extraEnv)) delete env.GOOGLE_PLACES_API_KEY;
  return spawnSync(process.execPath, [script, ...args], { cwd: root, env, encoding: "utf8" });
}

// A fetch stand-in that records its calls and answers with the given status and body.
function fakeFetch(status, body) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
  impl.calls = calls;
  return impl;
}

test("missing key exits 1", () => {
  const before = fs.readFileSync(dataFile, "utf8");
  const r = runCli([]);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stderr.trim(), MISSING_KEY);
  assert.ok(r.stderr.includes("gh secret set"));
  assert.equal(fs.readFileSync(dataFile, "utf8"), before, "reviews.json untouched");
});

test("an empty key (unset Actions secret) exits 1 too", () => {
  for (const key of ["", "   "]) {
    const r = runCli([], { GOOGLE_PLACES_API_KEY: key });
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.stderr.trim(), MISSING_KEY);
  }
});

test("any argument is a usage error, exit 2 (no apply or fetch command any more)", () => {
  const before = fs.readFileSync(dataFile, "utf8");
  for (const arg of ["apply", "fetch"]) {
    for (const env of [{}, { GOOGLE_PLACES_API_KEY: "dummy" }]) {
      const r = runCli([arg], env);
      assert.equal(r.status, 2, `${arg}: ${r.stderr}`);
      assert.match(r.stderr, /usage/i);
    }
  }
  assert.equal(fs.readFileSync(dataFile, "utf8"), before, "reviews.json untouched");
});

test("fetch parses places response", async () => {
  const f = fakeFetch(200, { rating: 4.9, userRatingCount: 40 });
  assert.deepEqual(await fetchReviews({ key: "k", placeId: "ChIJ/x y", fetchImpl: f }), { rating: 4.9, count: 40 });
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  assert.equal(url, "https://places.googleapis.com/v1/places/ChIJ%2Fx%20y");
  assert.equal(init.headers["X-Goog-Api-Key"], "k", "key travels in a header, never in the URL");
  assert.equal(init.headers["X-Goog-FieldMask"], "rating,userRatingCount");
  assert.ok(!url.includes("key="));
  assert.ok(init.signal instanceof AbortSignal, "the request carries a timeout signal, so a hung connection cannot stall the job");
});

test("errorText names the cause behind Node's generic \"fetch failed\"", () => {
  const cause = new Error("getaddrinfo ENOTFOUND places.googleapis.com");
  assert.equal(errorText(new Error("fetch failed", { cause })), "fetch failed (getaddrinfo ENOTFOUND places.googleapis.com)");
  assert.equal(errorText(new Error("Places API 403: denied")), "Places API 403: denied");
  assert.equal(errorText(new Error("boom", { cause: "not an error" })), "boom");
});

test("fetch rejects bad payloads and failed requests", async () => {
  const bad = [
    { rating: 7 },
    { rating: 7, userRatingCount: 40 },
    { rating: 0.5, userRatingCount: 40 },
    { rating: "4.9", userRatingCount: 40 },
    { rating: 4.9 },
    { rating: 4.9, userRatingCount: 0 },
    { rating: 4.9, userRatingCount: 3.5 },
    { rating: 4.9, userRatingCount: "40" },
    {},
  ];
  for (const body of bad) {
    await assert.rejects(fetchReviews({ key: "k", placeId: "p", fetchImpl: fakeFetch(200, body) }), /Unexpected Places response/, JSON.stringify(body));
  }
  await assert.rejects(fetchReviews({ key: "k", placeId: "p", fetchImpl: fakeFetch(403, { error: "denied" }) }), /Places API 403/);
});

test("reviews.json keeps one decimal on the rating", () => {
  const current = readText(dataFile); // LF, whatever the checkout's autocrlf did
  assert.equal(serializeReviews(JSON.parse(current)), current, "serializer reproduces the committed file");
  const out = serializeReviews({ rating: 5, count: 7, placeId: "p", updated: "2026-01-02", checked: "2026-01-03" });
  assert.ok(out.includes('"rating": 5.0,'), out);
  assert.deepEqual(JSON.parse(out), { rating: 5, count: 7, placeId: "p", updated: "2026-01-02", checked: "2026-01-03" });
  assert.ok(serializeReviews({ rating: 4.9, count: 1, placeId: "p", updated: "a", checked: "b" }).includes('"rating": 4.9,'));
  assert.ok(out.endsWith("}\n"));
});

const OLD = { rating: 5.0, count: 36, placeId: "p", updated: "2026-09-01", checked: "2026-10-10" };

test("nextReviews: changed values move updated and checked to today", () => {
  const r = nextReviews(OLD, { rating: 5, count: 40 }, { placeId: "p", now: day("2026-10-17") });
  assert.equal(r.changed, true);
  assert.deepEqual(r.next, { rating: 5, count: 40, placeId: "p", updated: "2026-10-17", checked: "2026-10-17" });
  const lower = nextReviews(OLD, { rating: 4.9, count: 36 }, { placeId: "p", now: day("2026-10-17") });
  assert.equal(lower.changed, true);
  assert.equal(lower.next.rating, 4.9);
});

test("nextReviews: unchanged and checked recently writes nothing", () => {
  assert.equal(nextReviews(OLD, { rating: 5, count: 36 }, { placeId: "p", now: day("2026-10-17") }), null);
});

test("nextReviews: 30-day keepalive touches checked only", () => {
  assert.equal(nextReviews(OLD, { rating: 5, count: 36 }, { placeId: "p", now: day("2026-11-08") }), null, "29 days: still fresh");
  const r = nextReviews(OLD, { rating: 5, count: 36 }, { placeId: "p", now: day("2026-11-10") });
  assert.equal(r.changed, false);
  assert.deepEqual(r.next, { rating: 5, count: 36, placeId: "p", updated: "2026-09-01", checked: "2026-11-10" });
});

test("nextReviews: an unreadable checked date counts as stale", () => {
  const r = nextReviews({ ...OLD, checked: "oops", updated: "oops" }, { rating: 5, count: 36 }, { placeId: "p", now: day("2026-10-17") });
  assert.equal(r.changed, false);
  assert.equal(r.next.checked, "2026-10-17");
});

test("nextReviews: a rating beyond one decimal is rounded so the file stays stable", () => {
  const first = nextReviews(OLD, { rating: 4.85, count: 36 }, { placeId: "p", now: day("2026-10-17") });
  assert.equal(first.next.rating, 4.9);
  assert.equal(nextReviews(first.next, { rating: 4.85, count: 36 }, { placeId: "p", now: day("2026-10-18") }), null);
});

test("syncReviews writes the file only when needed", async () => {
  const dir = tmpDir("mt-reviews-sync-");
  try {
    const file = path.join(dir, "reviews.json");
    fs.writeFileSync(file, serializeReviews(OLD));

    const same = await syncReviews({ file, key: "k", placeId: "p", fetchImpl: fakeFetch(200, { rating: 5, userRatingCount: 36 }), now: day("2026-10-17") });
    assert.equal(same.status, "unchanged");
    assert.equal(fs.readFileSync(file, "utf8"), serializeReviews(OLD), "bytes untouched");

    const changed = await syncReviews({ file, key: "k", placeId: "p", fetchImpl: fakeFetch(200, { rating: 4.9, userRatingCount: 41 }), now: day("2026-10-17") });
    assert.equal(changed.status, "changed");
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { rating: 4.9, count: 41, placeId: "p", updated: "2026-10-17", checked: "2026-10-17" });

    const alive = await syncReviews({ file, key: "k", placeId: "p", fetchImpl: fakeFetch(200, { rating: 4.9, userRatingCount: 41 }), now: day("2026-12-01") });
    assert.equal(alive.status, "keepalive");
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { rating: 4.9, count: 41, placeId: "p", updated: "2026-10-17", checked: "2026-12-01" });

    const before = fs.readFileSync(file, "utf8");
    await assert.rejects(syncReviews({ file, key: "k", placeId: "p", fetchImpl: fakeFetch(500, {}), now: day("2026-12-02") }), /Places API 500/);
    assert.equal(fs.readFileSync(file, "utf8"), before, "a failed fetch never touches the file");
  } finally {
    rm(dir);
  }
});

// Review numbers appear as "<n> Google-Bewertungen", "<n> Google reviews" and JSON-LD reviewCount.
const COUNT_RE = /(\d+)\s+Google[- ](?:Bewertungen|reviews)|"reviewCount":\s*"(\d+)"/g;

test("review numbers identical on every page", () => {
  const tmpRoot = tmpDir("mt-reviews-root-");
  const tmpOut = tmpDir("mt-reviews-out-");
  try {
    for (const dir of ["src", "assets"]) fs.cpSync(path.join(root, dir), path.join(tmpRoot, dir), { recursive: true });
    const current = JSON.parse(readText(dataFile));
    // any count that differs from the committed one, so the test stays valid whatever the real number becomes
    const probe = current.count === 41 ? 42 : 41;
    fs.writeFileSync(path.join(tmpRoot, "assets/data/reviews.json"), serializeReviews({ ...current, count: probe }));

    const { errors } = build({ root: tmpRoot, outDir: tmpOut, quiet: true });
    assert.deepEqual(errors, []);

    const withCount = new Map();
    for (const rel of fs.readdirSync(tmpOut, { recursive: true })) {
      if (!/\.(html|js|json|xml)$/.test(rel)) continue;
      const abs = path.join(tmpOut, rel);
      if (!fs.statSync(abs).isFile()) continue;
      const found = [...readText(abs).matchAll(COUNT_RE)].map((m) => m[1] ?? m[2]);
      if (found.length) withCount.set(rel.replaceAll("\\", "/"), found);
    }

    assert.ok(withCount.has("index.html"), "the home page carries the count");
    for (const [rel, found] of withCount) {
      assert.ok(found.every((n) => n === String(probe)), `${rel} shows ${found.join(", ")}, expected only ${probe}`);
    }
    assert.ok([...withCount.values()].flat().length >= 4, "trust strip, heading, meta description and JSON-LD all carry the count");

    const home = readText(path.join(tmpOut, "index.html"));
    const biz = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((o) => o.aggregateRating);
    assert.equal(biz.aggregateRating.reviewCount, String(probe));
    // exact numbers, not substrings: "41 Google" must not count as a hit for a committed count of 1
    const homeCounts = [...home.matchAll(COUNT_RE)].map((m) => m[1] ?? m[2]);
    assert.ok(homeCounts.length >= 4 && !homeCounts.includes(String(current.count)), `the committed count ${current.count} lingers: ${homeCounts.join(", ")}`);
  } finally {
    rm(tmpRoot);
    rm(tmpOut);
  }
});

// ---- .github/workflows/deploy.yml (text checks; the workflow itself only runs on GitHub) ----
const workflowFile = path.join(root, ".github/workflows/deploy.yml");
const workflow = () => readText(workflowFile);
const jobText = (yml, name) => {
  const start = yml.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `workflow lacks job ${name}`);
  const next = yml.slice(start + 1).search(/\n  [a-z]+:\n/);
  return next < 0 ? yml.slice(start) : yml.slice(start, start + 1 + next);
};
const pos = (text, needle) => {
  const i = text.indexOf(needle);
  assert.ok(i >= 0, `missing: ${needle}`);
  return i;
};

test("deploy workflow triggers and permissions", () => {
  const yml = workflow();
  for (const needle of ["branches: [main]", "pull_request:", "workflow_dispatch:", "pages: write", "id-token: write"]) pos(yml, needle);
  for (const job of ["build", "deploy"]) assert.match(jobText(yml, job), /^    timeout-minutes: 10$/m, `${job} has a 10 minute timeout`);
});

test("no review automation: no schedule, no sync job, CI never commits", () => {
  // decided 2026-10-21: the Google review count is updated by hand in assets/data/reviews.json
  const yml = workflow();
  assert.ok(!/^\s*schedule:/m.test(yml), "no scheduled runs");
  assert.ok(!yml.includes("\n  sync:\n"), "no sync job");
  assert.ok(!yml.includes("update-reviews.mjs"), "the workflow does not fetch reviews");
  assert.ok(!/git (commit|push)/.test(yml), "CI never commits");
  assert.ok(!yml.includes("contents: write"), "read-only repository access is enough");
});

test("build runs on its own", () => {
  const build = jobText(workflow(), "build");
  assert.ok(!build.includes("needs:"), "build has no upstream job");
});

test("tests gate the build and deploy runs only on main", () => {
  const yml = workflow();
  const build = jobText(yml, "build");
  for (const a of ["actions/checkout@v7", "actions/setup-node@v7"]) pos(build, a);
  pos(build, "node-version: 22");
  assert.ok(pos(build, 'node --test "scripts/*.test.mjs"') < pos(build, "node scripts/build.mjs --out _site"));
  assert.ok(pos(build, "node scripts/build.mjs --out _site") < pos(build, "actions/configure-pages@v6"));
  assert.ok(pos(build, "actions/configure-pages@v6") < pos(build, "actions/upload-pages-artifact@v5"));
  pos(build, "path: _site");
  const deploy = jobText(yml, "deploy");
  pos(deploy, "needs: build");
  pos(deploy, "if: ${{ !cancelled() && needs.build.result == 'success' && github.event_name != 'pull_request' && github.ref == 'refs/heads/main' }}");
  pos(deploy, "name: github-pages");
  pos(deploy, "actions/deploy-pages@v5");
});

test("old review workflow is gone", () => {
  assert.ok(!fs.existsSync(path.join(root, ".github/workflows/update-reviews.yml")));
  assert.deepEqual(fs.readdirSync(path.join(root, ".github/workflows")), ["deploy.yml"]);
});
