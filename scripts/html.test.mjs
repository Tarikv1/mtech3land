import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, render, waLink, page, VERSIONED_ASSETS } from "./html.mjs";
import { loadJson } from "./lib.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = loadJson(root, "src/site.json");
const strings = loadJson(root, "src/strings.json");

test("esc escapes the five HTML characters", () => {
  assert.equal(esc(`a & b < c > "d" 'e'`), "a &amp; b &lt; c &gt; &quot;d&quot; &#39;e&#39;");
  assert.equal(esc(5), "5");
});

test("render escapes {{x}}, keeps {{{x}}} raw, supports dotted keys", () => {
  const out = render("{{a}}|{{{a}}}|{{o.p.q}}", { a: "<b>&", o: { p: { q: "deep" } } }, {});
  assert.equal(out, "&lt;b&gt;&amp;|<b>&|deep");
});

test("render resolves flat keys that contain dots", () => {
  assert.equal(render("{{{t.nav.prices}}}", { t: { "nav.prices": "Preise" } }, {}), "Preise");
  assert.equal(render("{{xs.0.name}}", { xs: [{ name: "n" }] }, {}), "n");
});

test("render expands partials recursively with the same vars", () => {
  const partials = { outer: "[{{x}}{{> inner}}]", inner: "<{{x}}>" };
  assert.equal(render("{{> outer}}", { x: "1" }, partials), "[1<1>]");
});

test("render never re-scans substituted values", () => {
  assert.equal(render("{{{a}}}", { a: "{{b}}" }, {}), "{{b}}");
  assert.equal(render("{{a}}", { a: "{{b}}" }, {}), "{{b}}");
});

test("render throws on missing vars, non-scalars and missing partials", () => {
  assert.throws(() => render("{{nope}}", {}, {}), /missing var: nope/);
  assert.throws(() => render("{{{o.nope}}}", { o: {} }, {}), /missing var: o\.nope/);
  assert.throws(() => render("{{n}}", { n: null }, {}), /missing var: n/);
  assert.throws(() => render("{{o}}", { o: {} }, {}), /not a scalar: o/);
  assert.throws(() => render("{{> gone}}", {}, {}), /missing partial: gone/);
  assert.equal(render("{{e}}", { e: "" }, {}), "");
});

test("waLink encodes the prefilled text", () => {
  assert.equal(waLink({ wa: "4915753815179" }, "Hallo, Größe & mehr"), "https://wa.me/4915753815179?text=Hallo%2C%20Gr%C3%B6%C3%9Fe%20%26%20mehr");
});

const versions = Object.fromEntries(VERSIONED_ASSETS.map((url) => [url, "abc12345"]));
const base = { site, strings, versions, path: "/x/", title: "Titel – Mtech3land", description: "Beschreibung", body: "<h1>Hi</h1>" };

test("page wraps body with header, footer, stickybar and scripts", () => {
  const html = page(base);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/mtech3land\.com\/x\/">/);
  assert.match(html, /<main[^>]*>\s*<h1>Hi<\/h1>\s*<\/main>/);
  for (const href of ["/handy-reparatur/", "/tablet-reparatur/", "/laptop-reparatur/", "/playstation-reparatur/", "/#preise", "/ratgeber/", "/#kontakt", "/impressum/", "/datenschutz/"]) {
    assert.ok(html.includes(`href="${href}"`), `missing link ${href}`);
  }
  assert.match(html, /id="langToggle"/);
  assert.match(html, /<script src="\/assets\/js\/i18n\.js\?v=abc12345">/);
  assert.match(html, /<script src="\/assets\/js\/strings\.js\?v=abc12345">/);
  assert.match(html, /<link rel="stylesheet" href="\/assets\/css\/styles\.css\?v=abc12345">/);
  assert.ok(html.indexOf("strings.js") < html.indexOf("i18n.js") && html.indexOf("i18n.js") < html.indexOf("app.js"));
  assert.doesNotMatch(html, /noindex/);
});

test("page refuses assets without a version", () => {
  assert.throws(() => page({ ...base, versions: {} }), /unversioned asset: \/assets\/css\/styles\.css/);
  assert.throws(() => page({ ...base, versions: undefined }), /unversioned asset/);
  for (const url of VERSIONED_ASSETS) {
    const { [url]: _dropped, ...rest } = versions;
    assert.throws(() => page({ ...base, versions: rest }), (e) => e.message === `unversioned asset: ${url}`);
  }
});

test("page adds noindex, JSON-LD, page strings and extra head only when given", () => {
  const html = page({
    ...base,
    noindex: true,
    jsonld: [{ "@type": "Thing", name: "</script>" }],
    pageStrings: { de: { "p.k": "a" }, en: { "p.k": "b" } },
    extraHead: "<!--extra-->",
  });
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.match(html, /<script type="application\/ld\+json">.*"@type":"Thing".*<\/script>/);
  assert.equal((html.match(/<\/script>/g) ?? []).length, html.match(/<script/g).length);
  assert.ok(html.includes('window.MT_PAGE_STRINGS={"de":{"p.k":"a"},"en":{"p.k":"b"}};'));
  assert.ok(html.indexOf("MT_PAGE_STRINGS") < html.indexOf("/assets/js/i18n.js"));
  assert.ok(html.includes("<!--extra-->"));
});
