import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";
import { ASSETS, VERSIONED_ASSETS, loadPartials, page, render, waLink } from "./html.mjs";
import { buildDevices, loadJson } from "./lib.mjs";
import { pickerIndex } from "./picker-index.mjs";
import { listedRows, mine } from "./pages/model.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const prices = loadJson(root, "assets/data/prices.json");
const categories = loadJson(root, "src/categories.json");
const strings = loadJson(root, "src/strings.json");
const site = loadJson(root, "src/site.json");
const order = loadJson(root, "src/model-order.json");
const devices = buildDevices(prices, categories, strings, order);
const idx = pickerIndex(devices, categories, strings);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// The state script is a plain browser script. It runs here through new Function (same realm as this file, whatever the
// nearest package.json says about .js files): once as a CommonJS module, once as a browser script on a fake window.
const stateCode = read("assets/js/picker-state.js");
const loadState = () => {
  const module = { exports: {} };
  new Function("module", stateCode)(module);
  return module.exports;
};
const { parseHash, toHash, normalizeQuery, search, brandsFor, devicesFor, findDevice, deviceUrl, modelNumbers, revealOptions, waMessage, waUrl } = loadState();

let out;
before(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "mt-picker-"));
  build({ root, outDir: out, quiet: true });
});
after(() => fs.rmSync(out, { recursive: true, force: true }));

test("index small and complete", () => {
  assert.ok(JSON.stringify(idx).length < 80 * 1024);
  assert.equal(idx.d.length, devices.length);
  assert.deepEqual(
    idx.d.map((d) => d.s),
    devices.map((d) => d.slug),
  );
});

test("order file complete", () => {
  const ordered = Object.values(order).flat();
  assert.equal(new Set(ordered).size, ordered.length, "a slug appears twice in model-order.json");
  assert.deepEqual([...ordered].sort(), devices.map((d) => d.slug).sort());
});

test("index lists every group newest first, as model-order.json says", () => {
  for (const [group, slugs] of Object.entries(order)) {
    const inIndex = idx.d.filter((d) => devices.find((x) => x.slug === d.s).group === group).map((d) => d.s);
    assert.deepEqual(inIndex, slugs, group);
  }
});

test("index shape", () => {
  assert.equal(idx.v, 1);
  assert.deepEqual(
    idx.types.map((t) => t.id),
    ["handy", "tablet", "laptop", "playstation", "smartwatch"],
  );
  assert.deepEqual(idx.types[0].brands, ["apple", "samsung", "google", "huawei"]);
  assert.deepEqual(idx.types[1].brands, ["apple"]);
  assert.deepEqual(idx.types[2].brands, ["apple", "microsoft"]);
  assert.equal(new Set(idx.keys).size, idx.keys.length);
  assert.equal(new Set(idx.parents).size, idx.parents.length);
  for (const k of idx.keys) assert.ok(strings.de[`repair.${k}`] && strings.en[`repair.${k}`], `no label for ${k}`);
  idx.d.forEach((d, i) => {
    const src = devices[i];
    assert.deepEqual([d.s, d.n, d.c, d.t, d.b], [src.slug, src.name, src.codes.join(", "), src.type, src.brand]);
    assert.ok(Number.isInteger(d.p) && d.p >= -1 && d.p < idx.parents.length);
    assert.equal("u" in d, d.p === -1, `${d.s}: u only when there is no parent`);
    assert.equal(deviceUrl(idx, d), src.url, d.s);
    for (const [k, price] of d.r) {
      assert.ok(Number.isInteger(k) && k >= 0 && k < idx.keys.length);
      assert.ok(price === null || Number.isInteger(price));
    }
  });
  assert.equal(idx.d.find((d) => d.t === "smartwatch").u, "/apple-watch-reparatur/");
});

test("index rows are the rows of the model page", () => {
  const text = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  for (const [i, d] of idx.d.entries()) {
    const src = devices[i];
    const html = fs.readFileSync(path.join(out, src.url.slice(1), "index.html"), "utf8");
    const onPage = [...html.matchAll(/<li class="pricelist__row">([\s\S]*?)<\/li>/g)].map((m) => [
      text(m[1].match(/<span class="pricelist__label"[^>]*>([\s\S]*?)<\/span>/)[1]),
      text(m[1].match(/<span class="pricelist__price"[^>]*>([\s\S]*?)<\/span>/)[1]),
    ]);
    const inIndex = d.r.map(([k, price]) => [strings.de[`repair.${idx.keys[k]}`], price === null ? strings.de["price.request"] : `${price} €`]);
    assert.deepEqual(inIndex, onPage, d.s);
    assert.deepEqual(
      d.r,
      listedRows(src, categories, strings).map((r) => [idx.keys.indexOf(r.slug), r.price]),
      d.s,
    );
  }
});

test("index follows the display rulings of the model page", () => {
  const rowsOf = (slug) => idx.d.find((d) => d.s === slug).r.map(([k, p]) => [idx.keys[k], p]);
  const slugsOf = (slug) => rowsOf(slug).map(([k]) => k);
  // a core repair the data lacks is listed as unpriced
  const gap = devices.find((d) => d.type === "handy" && !d.repairs.some((r) => r.slug === "ladebuchse"));
  assert.ok(gap, "fixture: a phone without ladebuchse");
  assert.deepEqual(rowsOf(gap.slug).find(([k]) => k === "ladebuchse"), ["ladebuchse", null]);
  // an unpriced standard row is hidden next to a priced original variant
  const hidden = devices.find((d) => d.repairs.some((r) => r.slug === "display" && r.price == null) && d.repairs.some((r) => /^display-original/.test(r.slug) && r.price != null));
  assert.ok(hidden, "fixture: unpriced display next to priced original");
  assert.ok(!slugsOf(hidden.slug).includes("display"));
  assert.ok(slugsOf(hidden.slug).some((k) => /^display-original/.test(k)));
  // iPad 10.2 (2019): its data has an empty Display row next to priced LCD / Displayglas rows; like the page, the index omits it
  const ipad = rowsOf("ipad-10-2-2019");
  assert.ok(!ipad.some(([k]) => k === "display"));
  assert.deepEqual(ipad.filter(([k]) => k === "lcd" || k === "displayglas"), [["lcd", 289], ["displayglas", 159]]);
  // the type's extras come last, unpriced
  const ps = devices.find((d) => d.type === "playstation");
  assert.deepEqual(rowsOf(ps.slug).slice(-2), [["laufwerk", null], ["luefter", null]]);
});

test("brands and models per type", () => {
  assert.deepEqual(brandsFor(idx, "handy"), ["apple", "samsung", "google", "huawei"]);
  assert.deepEqual(brandsFor(idx, "playstation"), ["sony"]);
  assert.deepEqual(brandsFor(idx, "toaster"), []);
  const iphones = devicesFor(idx, "handy", "apple");
  assert.deepEqual(
    iphones.map((d) => d.s),
    order.iPhone,
  );
  assert.deepEqual(devicesFor(idx, "handy", "sony"), []);
  assert.deepEqual(devicesFor(idx, "toaster", "apple"), []);
  assert.equal(findDevice(idx, "iphone-13-pro").n, "iPhone 13 Pro");
  assert.equal(findDevice(idx, "iphone-99"), null);
});

test("hash round trip", () => {
  const s = { t: "handy", b: "apple", m: "iphone-13-pro" };
  assert.deepEqual(parseHash(toHash(s), idx), s);
  assert.equal(toHash(s), "#t=handy&b=apple&m=iphone-13-pro");
  assert.equal(toHash({ t: "handy", b: null, m: null }), "#t=handy");
  assert.equal(toHash({ t: null, b: null, m: null }), "");
  for (const d of idx.d) {
    const state = { t: d.t, b: d.b, m: d.s };
    assert.deepEqual(parseHash(toHash(state), idx), state, d.s);
  }
});

test("stale slug falls back", () => {
  assert.deepEqual(parseHash("#t=handy&b=apple&m=iphone-99", idx), { t: "handy", b: "apple", m: null });
  assert.deepEqual(parseHash("#t=toaster&b=apple", idx), { t: null, b: null, m: null });
  assert.deepEqual(parseHash("", idx), { t: null, b: null, m: null });
  // a later field is only valid under the earlier ones
  assert.deepEqual(parseHash("#t=handy&b=sony", idx), { t: "handy", b: null, m: null });
  assert.deepEqual(parseHash("#t=handy&b=samsung&m=iphone-13-pro", idx), { t: "handy", b: "samsung", m: null });
  assert.deepEqual(parseHash("#b=apple&m=iphone-13-pro", idx), { t: null, b: null, m: null });
  assert.deepEqual(parseHash("#t=tablet", idx), { t: "tablet", b: null, m: null });
});

test("hash parsing never throws", () => {
  for (const hash of [undefined, null, 5, {}, "#", "#&&&", "#t", "#t=", "#t=%E0%A4%A", "#t=handy&t=tablet", "#__proto__=x&constructor=y", "#preise", "t=handy&b=apple"]) {
    assert.doesNotThrow(() => parseHash(hash, idx), String(hash));
  }
  assert.deepEqual(parseHash("t=handy&b=apple", idx), { t: "handy", b: "apple", m: null }, "the leading # is optional");
  assert.deepEqual(parseHash("#preise", idx), { t: null, b: null, m: null });
  assert.deepEqual(parseHash("#t=handy", null), { t: null, b: null, m: null }, "no index, no state");
});

test("normalizeQuery", () => {
  assert.equal(normalizeQuery("  MacBook   Air 13,3″ "), "macbook air 13.3");
  assert.equal(normalizeQuery(`13" 'x'`), "13 x");
  assert.equal(normalizeQuery(""), "");
  assert.equal(normalizeQuery(null), "");
});

test("search by code and comma", () => {
  assert.ok(search(idx, "a2338").some((d) => d.s === "macbook-pro-13-a2338"));
  assert.ok(search(idx, "macbook air 13.3").some((d) => d.s === "macbook-air-13-3-a1369"));
  assert.ok(search(idx, "macbook air 13,3").some((d) => d.s === "macbook-air-13-3-a1369"));
  assert.ok(search(idx, "GALAXY s22").length >= 1);
  assert.deepEqual(search(idx, "   "), []);
  assert.deepEqual(search(idx, ""), []);
  assert.deepEqual(search(idx, "zzzzzz"), []);
});

test("search matches every token, in any order, and caps the list", () => {
  assert.ok(search(idx, "pro 13 iphone").some((d) => d.s === "iphone-13-pro"));
  const hits = search(idx, "iphone 13 pro");
  assert.ok(hits.length > 1 && hits.every((d) => ["iphone", "13", "pro"].every((w) => `${d.n} ${d.c}`.toLowerCase().includes(w))));
  assert.ok(search(idx, "iphone 13 pro nonsense").length === 0, "one missing token excludes the device");
  assert.deepEqual(search(idx, "sm-s942").map((d) => d.s), ["galaxy-s26"], "a Samsung model code finds its phone");
  assert.ok(search(idx, "S901B").some((d) => d.s === "galaxy-s22"));
  assert.equal(search(idx, "a").length, 12);
  assert.ok(search(idx, "galaxy").length <= 12);
});

test("search finds devices whose model codes contain spaces", () => {
  // codes are kept as the model page prints them ("A2696, A2757, A2777, iPad 10"), so the words of one code stay together
  assert.ok(search(idx, "A2777").some((d) => d.s === "ipad-10-9"));
  assert.ok(search(idx, "ipad 10 a2696").some((d) => d.s === "ipad-10-9"));
  assert.ok(search(idx, "nov 2023 a2992").some((d) => d.s === "macbook-pro-14-inch"));
});

test("search puts the exact name first", () => {
  assert.equal(search(idx, "iphone 13")[0].s, "iphone-13");
  assert.equal(search(idx, "IPHONE 13 pro")[0].s, "iphone-13-pro");
  // otherwise the order of the index (newest first) stays
  const hits = search(idx, "iphone 1").map((d) => d.s);
  assert.deepEqual(hits, [...hits].sort((a, b) => order.iPhone.indexOf(a) - order.iPhone.indexOf(b)));
});

test("model numbers on the card are those of the model page", () => {
  const text = (s) =>
    s
      .replace(/<[^>]*>/g, " ")
      .replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e])
      .replace(/\s+/g, " ")
      .trim();
  let withSpaces = 0;
  for (const [i, d] of idx.d.entries()) {
    const html = fs.readFileSync(path.join(out, devices[i].url.slice(1), "index.html"), "utf8");
    const note = html.match(/<p class="prose__note">([\s\S]*?)<\/p>/);
    assert.equal(modelNumbers(strings.de["model.codes"], d), note ? text(note[1]) : "", d.s);
    if (devices[i].codes.some((c) => c.includes(" "))) withSpaces++;
  }
  assert.ok(withSpaces >= 8, "fixture: devices with a space inside a model code");
  assert.equal(modelNumbers("Modellnummern:", findDevice(idx, "ipad-10-9")), "Modellnummern: A2696, A2757, A2777, iPad 10");
  assert.equal(modelNumbers("Model numbers:", findDevice(idx, "macbook-pro-14-inch")), "Model numbers: " + devices.find((d) => d.slug === "macbook-pro-14-inch").codes.join(", "));
  assert.equal(modelNumbers("x", { c: "" }), "");
});

test("scroll to a shared link: smooth only without reduced motion", () => {
  assert.deepEqual(revealOptions(false), { block: "start", behavior: "smooth" });
  assert.deepEqual(revealOptions(true), { block: "start", behavior: "auto" });
  const code = read("assets/js/picker.js");
  assert.match(code, /prefers-reduced-motion: reduce/);
  assert.match(code, /scrollIntoView\(P\.revealOptions\(/);
});

test("state script works as a module and as a browser script", () => {
  const window = {};
  new Function("window", stateCode)(window);
  assert.equal(typeof window.MTPicker.parseHash, "function");
  assert.deepEqual(Object.keys(window.MTPicker).sort(), Object.keys(loadState()).sort());
  for (const name of ["parseHash", "toHash", "normalizeQuery", "search", "brandsFor", "devicesFor"]) {
    assert.equal(typeof window.MTPicker[name], "function", name);
  }
});

test("whatsapp text and link are those of the model pages", () => {
  for (const [i, d] of idx.d.entries()) {
    const src = devices[i];
    assert.equal(waMessage(d.n, d.t), `Hallo, ich brauche eine Reparatur für ${mine(src)} ${src.name}.`, d.s);
  }
  const text = waMessage("Galaxy S22 Ultra", "handy");
  assert.equal(waUrl(site.wa, text), waLink(site, text));
  assert.equal(waUrl(site.wa, "Größe & mehr"), waLink(site, "Größe & mehr"));
  const html = fs.readFileSync(path.join(out, devices.find((d) => d.slug === "iphone-13-pro").url.slice(1), "index.html"), "utf8");
  assert.ok(html.includes(waUrl(site.wa, waMessage("iPhone 13 Pro", "handy")).replace(/&/g, "&amp;")));
});

// ---- strings -----------------------------------------------------------------------------------------------------

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("brand and picker strings exist in German and English", () => {
  for (const id of Object.keys(categories.brands)) {
    for (const lang of ["de", "en"]) assert.equal(typeof strings[lang][`brand.${id}`], "string", `${lang}/brand.${id}`);
  }
  for (const id of Object.keys(categories.types)) assert.ok(strings.de[categories.types[id].labelKey] && strings.en[categories.types[id].labelKey]);
  for (const key of Object.keys(strings.de).filter((k) => k.startsWith("picker."))) {
    assert.equal(typeof strings.en[key], "string", `en/${key}`);
    assert.deepEqual(placeholders(strings.en[key]), placeholders(strings.de[key]), `${key}: placeholders differ`);
  }
  for (const key of Object.keys(strings.en).filter((k) => k.startsWith("picker."))) assert.equal(typeof strings.de[key], "string", `de/${key}`);
});

test("every string key picker.js asks for exists", () => {
  const code = read("assets/js/picker.js");
  // every string literal that looks like a dictionary key ("picker.more", "model.cta"); "type." style prefixes are built per id
  const keys = new Set([...code.matchAll(/"([a-z]+(?:\.\w+)+)"/g)].map((m) => m[1]));
  for (const n of [1, 2, 3]) {
    keys.add(`picker.step.${n}`);
    keys.add(`picker.heading.${n}`);
  }
  assert.ok(keys.size > 10, [...keys].join(", "));
  assert.ok(keys.has("picker.more.f") && keys.has("model.cta") && keys.has("price.request"), [...keys].join(", "));
  for (const key of keys) {
    for (const lang of ["de", "en"]) assert.equal(typeof strings[lang][key], "string", `${lang}/${key}`);
  }
  for (const prefix of ["type.", "brand."]) assert.ok(code.includes(`"${prefix}"`), `picker.js builds ${prefix}<id> keys`);
});

test("picker.js is valid script source", () => {
  for (const file of ["assets/js/picker.js", "assets/js/picker-state.js"]) assert.doesNotThrow(() => new Function(read(file)), file);
});

// ---- partial -----------------------------------------------------------------------------------------------------

const partials = loadPartials(root);
const renderPicker = (picker) => render(partials.picker, { site, t: strings.de, picker }, partials);

test("partial: server-rendered links, labelled search, live region", () => {
  const html = renderPicker({ idAttr: ' id="preise"', type: "handy", brand: "apple" });
  assert.ok(html.startsWith(`<section class="picker" id="preise" data-picker data-type="handy" data-brand="apple" data-wa="${site.wa}">`), html.slice(0, 200));
  assert.ok(html.trimEnd().endsWith("</section>"));
  const hrefs = [...html.matchAll(/<a class="tile"[^>]*href="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, [...Object.values(categories.types).map((t) => t.hub), "/fehlerdiagnose/"]);
  for (const [id, type] of Object.entries(categories.types)) {
    assert.match(html, new RegExp(`<a class="tile" href="${type.hub}" data-key="t:${id}">`), id);
  }
  assert.match(html, /<label class="picker__search">[\s\S]*<input type="search"[^>]*>[\s\S]*<\/label>/);
  assert.match(html, /<span class="sr-only" data-i18n="picker\.search\.label">/);
  assert.match(html, /<p class="sr-only"[^>]*role="status"[^>]*aria-live="polite"[^>]*><\/p>/);
  assert.match(html, /data-picker-tools hidden/);
  assert.ok(!html.includes("{{"));
});

test("partial: no id attribute, no preset", () => {
  const html = renderPicker({ idAttr: "", type: "", brand: "" });
  assert.ok(html.startsWith(`<section class="picker" data-picker data-type="" data-brand="" data-wa="${site.wa}">`));
});

test("partial: preset values are escaped", () => {
  const html = renderPicker({ idAttr: "", type: '"><script>x</script>', brand: "a&b" });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes('data-type="&quot;&gt;&lt;script&gt;x&lt;/script&gt;"') && html.includes('data-brand="a&amp;b"'));
});

test("partial: every i18n key it uses exists in both languages", () => {
  const html = renderPicker({ idAttr: "", type: "", brand: "" });
  const keys = new Set([...html.matchAll(/\sdata-i18n="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\sdata-i18n-attr="([^"]+)"/g)) keys.add(m[1].slice(m[1].indexOf(":") + 1));
  assert.ok(keys.size >= 8);
  for (const key of keys) {
    for (const lang of ["de", "en"]) assert.equal(typeof strings[lang][key], "string", `${lang}/${key}`);
  }
});

// ---- page() and build --------------------------------------------------------------------------------------------

const versions = Object.fromEntries(VERSIONED_ASSETS.map((url) => [url, "abc12345"]));
const base = { site, strings, versions, path: "/x/", title: "Titel – Mtech3land", description: "Beschreibung", body: "<h1>Hi</h1>" };
const STATE_JS = '<script src="/assets/js/picker-state.js?v=abc12345"></script>';
const PICKER_JS = '<script src="/assets/js/picker.js?v=abc12345"></script>';

test("page loads the picker scripts only when asked", () => {
  const plain = page(base);
  assert.ok(!plain.includes("picker"));
  const withPicker = page({ ...base, picker: true });
  const app = withPicker.indexOf('<script src="/assets/js/app.js?v=abc12345"></script>');
  assert.ok(app > 0);
  assert.ok(withPicker.indexOf(STATE_JS) > app, "after app.js");
  assert.ok(withPicker.indexOf(PICKER_JS) > withPicker.indexOf(STATE_JS), "state script first");
  assert.ok(withPicker.trimEnd().endsWith(`${PICKER_JS}\n</body>\n</html>`));
  assert.equal(withPicker.replace(`${STATE_JS}\n${PICKER_JS}\n`, ""), plain, "nothing else differs");
});

test("picker scripts are versioned assets", () => {
  assert.ok(VERSIONED_ASSETS.includes("/assets/js/picker-state.js") && VERSIONED_ASSETS.includes("/assets/js/picker.js"));
  assert.ok(!Object.values(ASSETS).some((url) => url.includes("picker")), "ASSETS stays the list every page loads");
  const missing = { ...versions };
  delete missing["/assets/js/picker.js"];
  assert.throws(() => page({ ...base, versions: missing, picker: true }), /unversioned asset: \/assets\/js\/picker\.js/);
  assert.throws(() => page({ ...base, versions: missing }), /unversioned asset: \/assets\/js\/picker\.js/, "checked on every page");
});

test("build writes picker.json and lists it in the manifest", () => {
  const file = path.join(out, "assets/data/picker.json");
  const written = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(written, JSON.parse(JSON.stringify(idx)));
  assert.ok(fs.statSync(file).size < 80 * 1024);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, ".build-manifest.json"), "utf8"));
  assert.ok(manifest.includes("assets/data/picker.json"));
  // hand-written scripts are copied into the artifact unchanged (LF-normalised)
  for (const rel of ["assets/js/picker.js", "assets/js/picker-state.js"]) {
    assert.ok(manifest.includes(rel), rel);
    const src = fs.readFileSync(path.join(root, rel), "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
    assert.equal(fs.readFileSync(path.join(out, rel), "utf8"), src, rel);
  }
});
