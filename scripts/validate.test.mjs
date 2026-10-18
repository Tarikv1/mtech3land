import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validate } from "./validate.mjs";

const ORIGIN = "https://example.test";
const made = [];
const tmpDir = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
};
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});
const strings = { de: { "nav.prices": "Preise" }, en: { "nav.prices": "Prices" } };

function pageHtml({ title = "T", desc = "D", h1 = "H", canonical, body = "", head = "", pagePath }) {
  return (
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title}</title>` +
    `<meta name="description" content="${desc}"><link rel="canonical" href="${canonical ?? ORIGIN + pagePath}">${head}</head>` +
    `<body><main><h1>${h1}</h1>${body}</main></body></html>`
  );
}

// specs: [{path, indexable?, html? | title/desc/h1/body/head/canonical}] -> temp dir with files + sitemap
function setup(specs, { locs } = {}) {
  const dir = tmpDir("mt-val-");
  const pages = specs.map((s) => {
    const file = s.path === "/" ? "index.html" : `${s.path.slice(1)}index.html`;
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), s.html ?? pageHtml({ ...s, pagePath: s.path }));
    return { path: s.path, file, indexable: s.indexable ?? true, title: "", description: "", h1: "" };
  });
  const urls = locs ?? pages.filter((p) => p.indexable).map((p) => ORIGIN + p.path);
  fs.writeFileSync(
    path.join(dir, "sitemap.xml"),
    `<?xml version="1.0"?><urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`,
  );
  return { dir, pages };
}

function run(specs, { locs, ...opts } = {}) {
  const { dir, pages } = setup(specs, { locs });
  return validate({ outDir: dir, assetRoot: dir, pages, strings, allowMissing: [], origin: ORIGIN, ...opts });
}

const A = { path: "/a/", title: "Seite A", desc: "Beschreibung A", h1: "Titel A" };
const B = { path: "/b/", title: "Seite B", desc: "Beschreibung B", h1: "Titel B" };

test("clean pages produce no errors", () => {
  const errors = run([
    { ...A, body: '<a href="#top">x</a><a href="/b/?q=1#z">b</a><a href="https://example.com/">ext</a><span data-i18n="nav.prices">Preise</span>' },
    B,
  ]);
  assert.deepEqual(errors, []);
});

for (const [label, field] of [["title", "title"], ["description", "desc"], ["H1", "h1"]]) {
  test(`duplicate ${label} among indexable pages is reported once`, () => {
    const errors = run([A, { ...B, [field]: A[field] }]);
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.ok(errors[0].startsWith("b/index.html"), errors[0]);
    assert.match(errors[0], new RegExp(`duplicate ${label}`));
  });
}

test("duplicates on non-indexable pages are ignored", () => {
  const stub = { path: "/old/", indexable: false, title: A.title, desc: A.desc, h1: A.h1, canonical: ORIGIN + A.path, head: '<meta name="robots" content="noindex">' };
  assert.deepEqual(run([A, stub]), []);
});

test("broken internal link is reported", () => {
  const errors = run([{ ...A, body: '<a href="/nope/">x</a>' }]);
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.ok(errors[0].startsWith("a/index.html"), errors[0]);
  assert.match(errors[0], /\/nope\//);
});

test("broken src is reported", () => {
  const errors = run([{ ...A, body: '<img src="/img/none.png" alt="">' }]);
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.match(errors[0], /\/img\/none\.png/);
});

test("allowMissing is an exact path match", () => {
  assert.deepEqual(run([{ ...A, body: '<a href="/later/#x">x</a>' }], { allowMissing: ["/later/"] }), []);
  const errors = run([{ ...A, body: '<a href="/later/deep/">x</a>' }], { allowMissing: ["/later/"] });
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.match(errors[0], /\/later\/deep\//);
});

test("/assets links resolve against assetRoot", () => {
  const assetRoot = tmpDir("mt-assets-");
  fs.mkdirSync(path.join(assetRoot, "assets"));
  fs.writeFileSync(path.join(assetRoot, "assets", "x.css"), "");
  const { dir, pages } = setup([{ ...A, body: '<link rel="stylesheet" href="/assets/x.css?v=abcdef12"><img src="/assets/y.png" alt="">' }]);
  const errors = validate({ outDir: dir, assetRoot, pages, strings, allowMissing: [], origin: ORIGIN });
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.match(errors[0], /\/assets\/y\.png/);
});

test("js and css assets need a ?v= of exactly 8 lowercase hex chars", () => {
  const assetRoot = tmpDir("mt-assets-");
  fs.mkdirSync(path.join(assetRoot, "assets"));
  for (const f of ["x.css", "x.js", "x.png"]) fs.writeFileSync(path.join(assetRoot, "assets", f), "");
  const check = (body) => {
    const { dir, pages } = setup([{ ...A, body }]);
    return validate({ outDir: dir, assetRoot, pages, strings, allowMissing: [], origin: ORIGIN });
  };
  assert.deepEqual(
    check('<link href="/assets/x.css?v=0123abcd"><script src="/assets/x.js?v=deadbeef"></script><img src="/assets/x.png" alt="">'),
    [],
  );
  for (const bad of ["/assets/x.css", "/assets/x.js?v=1", "/assets/x.js?v=ABCDEF12", "/assets/x.css?v=abcdef123", "/assets/x.css?x=abcdef12"]) {
    const errors = check(`<a href="${bad}">x</a>`);
    assert.equal(errors.length, 1, `${bad}: ${errors.join("\n")}`);
    assert.ok(errors[0].startsWith("a/index.html"), errors[0]);
    assert.ok(errors[0].includes(bad), errors[0]);
    assert.match(errors[0], /\?v=/);
  }
});

test("invalid JSON-LD is reported", () => {
  const errors = run([{ ...A, head: '<script type="application/ld+json">{"@type": oops}</script>' }]);
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.ok(errors[0].startsWith("a/index.html"), errors[0]);
  assert.match(errors[0], /JSON-LD/);
});

test("valid JSON-LD passes", () => {
  assert.deepEqual(run([{ ...A, head: '<script type="application/ld+json">{"@type":"Thing"}</script>' }]), []);
});

test("canonical must equal the page's own path", () => {
  const errors = run([{ ...A, canonical: ORIGIN + "/b/" }, B]);
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.ok(errors[0].startsWith("a/index.html"), errors[0]);
  assert.match(errors[0], /canonical/);
});

test("missing i18n key is reported once, page strings count", () => {
  const errors = run([{ ...A, body: '<span data-i18n="x.missing">a</span><b data-i18n="x.missing">b</b>' }]);
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.ok(errors[0].startsWith("a/index.html"), errors[0]);
  assert.match(errors[0], /x\.missing/);

  const onlyDe = run([{ ...A, body: '<span data-i18n="x.half">a</span>' }], { strings: { de: { "x.half": "h" }, en: {} } });
  assert.equal(onlyDe.length, 1, onlyDe.join("\n"));
  assert.match(onlyDe[0], /en/);

  const page = { ...A, head: '<script>window.MT_PAGE_STRINGS={"de":{"p.k":"a"},"en":{"p.k":"b"}};</script>', body: '<span data-i18n="p.k">a</span><i data-i18n-attr="title:p.k"></i>' };
  assert.deepEqual(run([page]), []);
});

test("data-i18n-attr keys are checked too", () => {
  const errors = run([{ ...A, body: '<i data-i18n-attr="aria-label:no.such"></i>' }]);
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.match(errors[0], /no\.such/);
});

for (const token of ["null €", "undefined", "NaN", "&amp;#"]) {
  test(`forbidden text "${token}" is reported`, () => {
    const errors = run([{ ...A, body: `<p>Preis ${token} 5</p>` }]);
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.ok(errors[0].startsWith("a/index.html"), errors[0]);
    assert.ok(errors[0].includes(token), errors[0]);
  });
}

test("sitemap must list exactly the indexable pages", () => {
  const extra = run([A, B], { locs: [ORIGIN + "/a/", ORIGIN + "/b/", ORIGIN + "/ghost/"] });
  assert.equal(extra.length, 1, extra.join("\n"));
  assert.ok(extra[0].startsWith("sitemap.xml"), extra[0]);
  assert.match(extra[0], /\/ghost\//);

  const missing = run([A, B], { locs: [ORIGIN + "/a/"] });
  assert.equal(missing.length, 1, missing.join("\n"));
  assert.ok(missing[0].startsWith("sitemap.xml"), missing[0]);
  assert.match(missing[0], /\/b\//);
});

test("redirect stubs need noindex and an existing target", () => {
  const stub = (head) => ({ path: "/old/", indexable: false, title: "Old", desc: "Old", h1: "Old", canonical: ORIGIN + "/a/", head });
  const refresh = '<meta http-equiv="refresh" content="0; url=/a/">';
  assert.deepEqual(run([A, stub(`<meta name="robots" content="noindex,follow">${refresh}`)]), []);

  const noRobots = run([A, stub(refresh)]);
  assert.equal(noRobots.length, 1, noRobots.join("\n"));
  assert.ok(noRobots[0].startsWith("old/index.html"), noRobots[0]);
  assert.match(noRobots[0], /noindex/);

  const noTarget = run([A, stub('<meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=/gone/">')]);
  assert.equal(noTarget.length, 1, noTarget.join("\n"));
  assert.ok(noTarget[0].startsWith("old/index.html"), noTarget[0]);
  assert.match(noTarget[0], /\/gone\//);

  const pending = run([A, stub('<meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=/gone/">')], { allowMissing: ["/gone/"] });
  assert.deepEqual(pending, []);
});

test("indexable pages must not carry noindex", () => {
  const errors = run([{ ...A, head: '<meta name="robots" content="noindex">' }]);
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.match(errors[0], /noindex/);
});

// A page with the picker section (data-picker) and the two picker scripts go together, in both directions.
const PICKER_SCRIPTS = ["/assets/js/picker-state.js", "/assets/js/picker.js"];
const scriptTag = (url) => `<script src="${url}?v=0123abcd"></script>`;
const SECTION = '<section class="picker" data-picker data-type="" data-brand=""><div data-picker-tools hidden></div></section>';

function runWithPickerScripts(body) {
  const assetRoot = tmpDir("mt-assets-");
  fs.mkdirSync(path.join(assetRoot, "assets", "js"), { recursive: true });
  for (const url of PICKER_SCRIPTS) fs.writeFileSync(path.join(assetRoot, url.slice(1)), "");
  const { dir, pages } = setup([{ ...A, body }]);
  return validate({ outDir: dir, assetRoot, pages, strings, allowMissing: [], origin: ORIGIN });
}

test("a page with data-picker and both picker scripts passes; neither is fine too", () => {
  assert.deepEqual(runWithPickerScripts(SECTION + PICKER_SCRIPTS.map(scriptTag).join("")), []);
  assert.deepEqual(runWithPickerScripts('<div data-picker-tools hidden></div><p data-pickers="x">no picker</p>'), [], "data-picker-* attributes are not the section");
});

test("a page with data-picker must load both picker scripts", () => {
  for (const [i, missing] of PICKER_SCRIPTS.entries()) {
    const errors = runWithPickerScripts(SECTION + scriptTag(PICKER_SCRIPTS[1 - i]));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.ok(errors[0].startsWith("a/index.html"), errors[0]);
    assert.ok(errors[0].includes(missing), errors[0]);
    assert.match(errors[0], /data-picker/);
  }
  const none = runWithPickerScripts(SECTION);
  assert.equal(none.length, 2, none.join("\n"));
  for (const url of PICKER_SCRIPTS) assert.ok(none.some((e) => e.startsWith("a/index.html") && e.includes(url)), none.join("\n"));
});

test("a page loading a picker script must contain data-picker", () => {
  for (const url of PICKER_SCRIPTS) {
    const errors = runWithPickerScripts(scriptTag(url));
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.ok(errors[0].startsWith("a/index.html"), errors[0]);
    assert.ok(errors[0].includes(url), errors[0]);
    assert.match(errors[0], /data-picker/);
  }
});
