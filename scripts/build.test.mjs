import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build, PENDING } from "./build.mjs";
import { ASSETS, VERSIONED_ASSETS } from "./html.mjs";
import { buildDevices, loadJson } from "./lib.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const made = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-"));
  made.push(dir);
  return dir;
};
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), "utf8");

function listFiles(dir, rel = "") {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, r));
    else out.push(r);
  }
  return out.sort();
}

test("build is deterministic", () => {
  const a = tmp();
  const b = tmp();
  const ra = build({ root, outDir: a, quiet: true });
  const rb = build({ root, outDir: b, quiet: true });
  assert.deepEqual(ra.errors, []);
  assert.deepEqual(rb.errors, []);
  const files = listFiles(a);
  assert.deepEqual(files, listFiles(b));
  assert.ok(files.length >= 8, files.join(", "));
  for (const f of files) {
    assert.ok(fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f))), `${f} differs between builds`);
  }
});

test("manifest clean only removes generated files", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "keep.txt"), "mine");
  fs.writeFileSync(path.join(dir, "old.html"), "stale");
  fs.mkdirSync(path.join(dir, "stale", "page"), { recursive: true });
  fs.writeFileSync(path.join(dir, "stale", "page", "index.html"), "stale");
  fs.writeFileSync(path.join(dir, ".build-manifest.json"), JSON.stringify(["old.html", "stale/page/index.html"]));
  const { errors } = build({ root, outDir: dir, quiet: true });
  assert.deepEqual(errors, []);
  assert.ok(fs.existsSync(path.join(dir, "keep.txt")), "keep.txt must survive");
  assert.ok(!fs.existsSync(path.join(dir, "old.html")), "old.html must be removed");
  assert.ok(!fs.existsSync(path.join(dir, "stale")), "emptied directories are pruned");
  const manifest = JSON.parse(read(dir, ".build-manifest.json"));
  assert.deepEqual(manifest, [...manifest].sort());
  assert.ok(manifest.includes("impressum/index.html") && manifest.includes("assets/js/strings.js"));
  assert.ok(!manifest.includes("keep.txt"));
});

test("manifest entries outside outDir are refused", () => {
  const parent = tmp();
  const dir = path.join(parent, "out");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(parent, "secret.txt"), "do not delete");
  fs.writeFileSync(path.join(dir, ".build-manifest.json"), JSON.stringify(["../secret.txt"]));
  assert.throws(() => build({ root, outDir: dir, quiet: true }), /unsafe manifest entry/);
  assert.ok(fs.existsSync(path.join(parent, "secret.txt")));
});

test("stubs redirect to new urls", () => {
  const dir = tmp();
  build({ root, outDir: dir, quiet: true });
  const konsolen = read(dir, "konsolen-reparatur/index.html");
  assert.ok(konsolen.includes("url=/playstation-reparatur/"));
  assert.ok(konsolen.includes("noindex"));
  assert.ok(konsolen.includes('<link rel="canonical" href="https://mtech3land.com/playstation-reparatur/">'));
  assert.ok(konsolen.includes('location.replace("/playstation-reparatur/")'));
  const macbook = read(dir, "macbook-laptop-reparatur/index.html");
  assert.ok(macbook.includes("url=/laptop-reparatur/"));
  assert.ok(macbook.includes("noindex"));
  assert.ok(macbook.includes('<a href="/laptop-reparatur/"'));
});

// Impressum and Datenschutz content is checked in legal.test.mjs.
test("nojekyll present", () => {
  assert.ok(fs.existsSync(path.join(root, ".nojekyll")));
});

// Device pages are checked in model.test.mjs; this test pins the fixed pages around them.
const devicePaths = new Set(
  buildDevices(loadJson(root, "assets/data/prices.json"), loadJson(root, "src/categories.json"), loadJson(root, "src/strings.json"), {}).map((d) => d.url),
);

test("build output: pages, sitemap, robots, 404", () => {
  const dir = tmp();
  const { pages, errors } = build({ root, outDir: dir, quiet: true });
  assert.deepEqual(errors, []);
  const fixed = pages.filter((p) => !devicePaths.has(p.path));
  assert.equal(pages.length, fixed.length + devicePaths.size, "every device has exactly one page");
  assert.deepEqual(
    fixed.map((p) => p.path),
    [
      "/",
      "/404.html",
      "/datenrettung/",
      "/datenschutz/",
      "/fehlerdiagnose/",
      "/handy-reparatur/",
      "/impressum/",
      "/ipad-reparatur/",
      "/iphone-reparatur/",
      "/konsolen-reparatur/",
      "/laptop-reparatur/",
      "/macbook-laptop-reparatur/",
      "/macbook-reparatur/",
      "/playstation-reparatur/",
      "/ratgeber/",
      "/ratgeber/akku-tauschen-oder-neues-handy/",
      "/ratgeber/handy-reparatur-fuer-kunden-aus-basel/",
      "/ratgeber/handy-wasserschaden-was-tun/",
      "/ratgeber/laptop-wird-heiss-luefter-laut/",
      "/ratgeber/original-display-oder-nachbau/",
      "/ratgeber/ps5-hdmi-anschluss-defekt/",
      "/samsung-reparatur/",
      "/tablet-reparatur/",
    ],
  );
  const indexable = [
    "/",
    "/datenrettung/",
    "/datenschutz/",
    "/fehlerdiagnose/",
    "/handy-reparatur/",
    "/impressum/",
    "/ipad-reparatur/",
    "/iphone-reparatur/",
    "/laptop-reparatur/",
    "/macbook-reparatur/",
    "/playstation-reparatur/",
    "/ratgeber/",
    "/ratgeber/akku-tauschen-oder-neues-handy/",
    "/ratgeber/handy-reparatur-fuer-kunden-aus-basel/",
    "/ratgeber/handy-wasserschaden-was-tun/",
    "/ratgeber/laptop-wird-heiss-luefter-laut/",
    "/ratgeber/original-display-oder-nachbau/",
    "/ratgeber/ps5-hdmi-anschluss-defekt/",
    "/samsung-reparatur/",
    "/tablet-reparatur/",
  ];
  assert.deepEqual(
    fixed.filter((p) => p.indexable).map((p) => p.path),
    indexable,
  );
  for (const p of pages) assert.deepEqual(Object.keys(p).sort(), ["description", "file", "h1", "indexable", "path", "title"]);

  const sitemap = read(dir, "sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, indexable.length + devicePaths.size);
  assert.deepEqual(
    locs.filter((u) => !devicePaths.has(new URL(u).pathname)),
    indexable.map((p) => `https://mtech3land.com${p}`),
  );
  assert.ok(!sitemap.includes("lastmod"));

  assert.equal(
    read(dir, "robots.txt"),
    "User-agent: *\nAllow: /\n\nSitemap: https://mtech3land.com/sitemap.xml\n",
  );

  const notFound = read(dir, "404.html");
  assert.ok(notFound.includes("noindex"));
  for (const href of ["/#preise", "/handy-reparatur/", "/tablet-reparatur/", "/laptop-reparatur/", "/playstation-reparatur/", "/fehlerdiagnose/"]) {
    assert.ok(notFound.includes(`href="${href}"`), `404 misses ${href}`);
  }
});

test("PENDING lists exact paths", () => {
  assert.ok(Array.isArray(PENDING));
  assert.ok(!PENDING.includes("/"), "the home page is built");
  assert.ok(!PENDING.includes("/ratgeber/"), "the Ratgeber is built");
  for (const p of PENDING) assert.match(p, /^\/([a-z0-9-]+\/)*$/);
});

test("strings.js assigns the merged dictionary to window.MT_STR", () => {
  const dir = tmp();
  build({ root, outDir: dir, quiet: true });
  const js = read(dir, "assets/js/strings.js");
  assert.ok(js.startsWith("window.MT_STR="));
  assert.ok(js.endsWith(";"));
  const window = {};
  vm.runInNewContext(js, { window });
  assert.equal(window.MT_STR.de["nav.prices"], "Preise");
  assert.equal(window.MT_STR.en["nav.prices"], "Prices");
  assert.equal(window.MT_STR.de["repair.display"], "Display");
  assert.ok(window.MT_STR.de["hours.0"] && window.MT_STR.en["hours.0"]);
});

// Independent of the build: sha1 of the text as the build reads it (no BOM, LF endings), first 8 hex chars.
const sha1 = (file) =>
  crypto
    .createHash("sha1")
    .update(fs.readFileSync(file, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n"))
    .digest("hex")
    .slice(0, 8);

test("script and style urls carry the sha1 of their file", () => {
  const dir = tmp();
  build({ root, outDir: dir, quiet: true });
  assert.ok(VERSIONED_ASSETS.includes("/assets/css/styles.css"));
  for (const file of ["impressum/index.html", "404.html"]) {
    const html = read(dir, file);
    for (const url of Object.values(ASSETS)) {
      // strings.js is generated into outDir; every other asset is read from the repo
      const expected = sha1(path.join(url === "/assets/js/strings.js" ? dir : root, url.slice(1)));
      assert.ok(html.includes(`"${url}?v=${expected}"`), `${file}: ${url} should carry ?v=${expected}`);
    }
    // the picker scripts are versioned too, but only pages that render the picker load them
    for (const url of VERSIONED_ASSETS.filter((u) => !Object.values(ASSETS).includes(u))) assert.ok(!html.includes(url), `${file} must not load ${url}`);
  }
});

test("i18n.js keeps its behaviour and reads window.MT_STR", () => {
  const code = fs.readFileSync(path.join(root, "assets/js/i18n.js"), "utf8");
  const events = [];
  const stored = {};
  const attrs = {};
  class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  }
  const window = {
    MT_STR: { de: { a: "A-de", b: "B-de" }, en: { a: "A-en" } },
    MT_PAGE_STRINGS: { de: { c: "C-de" }, en: { c: "C-en" } },
    dispatchEvent: (e) => events.push(e),
  };
  const context = {
    window,
    CustomEvent,
    localStorage: { getItem: (k) => stored[k] ?? null, setItem: (k, v) => (stored[k] = v) },
    document: {
      querySelectorAll: () => [],
      addEventListener: () => {},
      getElementById: () => null,
      documentElement: { setAttribute: (k, v) => (attrs[k] = v) },
    },
  };
  vm.runInNewContext(code, context);
  const { tr, setLang } = window.MT;
  assert.equal(tr("a"), "A-de");
  assert.equal(tr("c"), "C-de");
  assert.equal(tr("unknown.key"), "unknown.key");
  setLang("en");
  assert.equal(window.MT.lang, "en");
  assert.equal(tr("a"), "A-en");
  assert.equal(tr("b"), "B-de", "falls back to German");
  assert.equal(tr("c"), "C-en");
  assert.equal(stored.mt_lang, "en");
  assert.equal(attrs.lang, "en");
  assert.deepEqual(events.map((e) => [e.type, e.detail]), [["mt:lang", "en"]]);
  assert.ok(!code.includes('"nav.services"'), "dictionary must not be inlined any more");
});

const RUNTIME = /^(?:[^/]+\.html|[a-z0-9-]+(?:\/[a-z0-9-]+)*\/index\.html|sitemap\.xml|robots\.txt|CNAME|\.build-manifest\.json|assets\/(?:css|js|img|fonts|video)\/[^/]+|assets\/data\/picker\.json)$/;

test("artifact holds only runtime files", () => {
  const dir = tmp();
  build({ root, outDir: dir, quiet: true });
  const files = listFiles(dir);
  assert.deepEqual(files.filter((f) => !RUNTIME.test(f)), []);
  for (const must of ["index.html", "CNAME", "assets/css/styles.css", "assets/js/picker.js", "assets/img/storefront.jpg", "assets/data/picker.json"]) {
    assert.ok(files.includes(must), must);
  }
  for (const never of ["assets/data/prices.json", "assets/data/reviews.json", "README.md", "src/site.json", "scripts/build.mjs"]) {
    assert.ok(!files.includes(never), never);
  }
});

test("every css url() resolves inside the artifact", () => {
  const dir = tmp();
  build({ root, outDir: dir, quiet: true });
  const css = read(dir, "assets/css/styles.css");
  const urls = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]).filter((u) => !u.startsWith("data:"));
  assert.ok(urls.length >= 4, "fonts referenced");
  for (const u of urls) {
    const file = path.resolve(dir, "assets/css", u.split(/[?#]/)[0]);
    assert.ok(fs.existsSync(file), u);
  }
});

test("outDir must be separate", () => {
  assert.throws(() => build({ root, outDir: root, quiet: true }), /separate directory/);
});

test("cli builds into --out", () => {
  const dir = tmp();
  execFileSync(process.execPath, [path.join(root, "scripts", "build.mjs"), "--out", dir], { cwd: root, stdio: "pipe" });
  assert.ok(fs.existsSync(path.join(dir, "index.html")));
  assert.ok(fs.existsSync(path.join(dir, "assets", "css", "styles.css")));
});
