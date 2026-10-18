import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, PENDING } from "./build.mjs";
import { buildDevices, loadJson } from "./lib.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const prices = loadJson(root, "assets/data/prices.json");
const categories = loadJson(root, "src/categories.json");
const strings = loadJson(root, "src/strings.json");
const site = loadJson(root, "src/site.json");
const devices = buildDevices(prices, categories, strings, loadJson(root, "src/model-order.json"));

// Task 7 mapping, verbatim: hub id -> path, picker preset, parents whose devices the page lists, extra links
const HUBS = {
  handy: { path: "/handy-reparatur/", picker: { type: "handy", brand: "" }, parents: ["iphone", "samsung", "handy"], extra: ["/apple-watch-reparatur/"] },
  tablet: { path: "/tablet-reparatur/", picker: { type: "tablet", brand: "" }, parents: ["ipad"] },
  laptop: { path: "/laptop-reparatur/", picker: { type: "laptop", brand: "" }, parents: ["macbook", "laptop"] },
  playstation: { path: "/playstation-reparatur/", picker: { type: "playstation", brand: "" }, parents: ["playstation"] },
  fehlerdiagnose: { path: "/fehlerdiagnose/", picker: null, parents: null },
  iphone: { path: "/iphone-reparatur/", picker: { type: "handy", brand: "apple" }, parents: ["iphone"] },
  samsung: { path: "/samsung-reparatur/", picker: { type: "handy", brand: "samsung" }, parents: ["samsung"] },
  ipad: { path: "/ipad-reparatur/", picker: { type: "tablet", brand: "apple" }, parents: ["ipad"] },
  macbook: { path: "/macbook-reparatur/", picker: { type: "laptop", brand: "apple" }, parents: ["macbook"] },
  datenrettung: { path: "/datenrettung/", picker: null, parents: null },
};
const PHONE_HUBS = new Set(["handy", "iphone", "samsung"]);

let out;
let result;
before(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "mt-hub-"));
  result = build({ root, outDir: out, quiet: true });
});
after(() => fs.rmSync(out, { recursive: true, force: true }));

const html = (urlPath) => fs.readFileSync(path.join(out, urlPath.slice(1), "index.html"), "utf8");
const text = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const mainOf = (h) => h.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
const titleOf = (h) => h.match(/<title>([^<]*)<\/title>/)[1];
const descOf = (h) => h.match(/<meta name="description" content="([^"]*)"/)[1];
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const jsonld = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const pageStrings = (h) => JSON.parse(h.match(/window\.MT_PAGE_STRINGS=(\{[\s\S]*?\});<\/script>/)[1]);
// links of the page itself; the embedded picker's type tiles link the type hubs (and the Apple Watch page) on every picker page
const hrefs = (h) => [...mainOf(h).replace(/<section class="picker"[\s\S]*?<\/section>/, "").matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
const hubJson = (id) => loadJson(root, `src/content/hubs/${id}.json`);
const deviceUrls = new Set(devices.map((d) => d.url));
const modellist = (h) => mainOf(h).match(/<div class="modellist">([\s\S]*?)\n<\/div>/)[1];

test("all hubs built", () => {
  assert.deepEqual(result.errors, []);
  const sitemap = fs.readFileSync(path.join(out, "sitemap.xml"), "utf8");
  for (const [id, hub] of Object.entries(HUBS)) {
    const recs = result.pages.filter((p) => p.path === hub.path);
    assert.equal(recs.length, 1, `${hub.path} must be exactly one page record`);
    assert.equal(recs[0].indexable, true, hub.path);
    const h = html(hub.path);
    assert.ok(h.includes(`<link rel="canonical" href="${site.origin}${hub.path}">`), `${hub.path}: canonical`);
    assert.ok(!/name="robots"/.test(h), `${hub.path}: must be indexable`);
    assert.ok(sitemap.includes(`<loc>${site.origin}${hub.path}</loc>`), `${hub.path}: not in sitemap`);
    assert.ok(!PENDING.includes(hub.path), `${hub.path} is built, so it leaves PENDING`);
    assert.equal(hubJson(id).id, id);
    assert.equal(hubJson(id).path, hub.path);
  }
  assert.deepEqual(fs.readdirSync(path.join(root, "src/content/hubs")).sort(), Object.keys(HUBS).map((id) => `${id}.json`).sort());
});

test("hubs link every device", () => {
  const union = new Set();
  for (const hub of Object.values(HUBS)) {
    const linked = new Set(hrefs(html(hub.path)).filter((u) => deviceUrls.has(u)));
    for (const u of linked) union.add(u);
    const want = new Set([...(hub.parents ? devices.filter((d) => hub.parents.includes(d.parentId)).map((d) => d.url) : []), ...(hub.extra ?? [])]);
    assert.deepEqual([...linked].sort(), [...want].sort(), `${hub.path} links exactly the devices under its parents`);
  }
  assert.deepEqual([...union].sort(), [...deviceUrls].sort());
});

test("model list grouped by brand, newest first", () => {
  const list = modellist(html(HUBS.laptop.path));
  assert.deepEqual([...list.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]), ["Apple", "Microsoft"]);
  const order = [...list.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  const want = [...devices.filter((d) => d.parentId === "macbook"), ...devices.filter((d) => d.parentId === "laptop")].map((d) => d.url);
  assert.deepEqual(order, want);
  const handy = modellist(html(HUBS.handy.path));
  assert.deepEqual([...handy.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]), ["Apple", "Samsung", "Google", "Huawei", "Weitere Geräte"]);
  // a brand page lists one group, so it needs no group heading
  assert.ok(!modellist(html(HUBS.iphone.path)).includes("<h3"));
});

test("diagnose price derived", () => {
  const min = Math.min(...prices.devices.flatMap((d) => d.repairs).filter((r) => r.slug === "fehleranalyse" && r.price != null).map((r) => r.price));
  assert.ok(Number.isFinite(min));
  const h = html(HUBS.fehlerdiagnose.path);
  assert.ok(text(mainOf(h)).includes(`ab ${min} €`), `main text needs "ab ${min} €"`);
  assert.ok(titleOf(h).includes(`ab ${min} €`));
});

const servicesOf = (h) => text(mainOf(h).match(/<ul class="checks">([\s\S]*?)<\/ul>/)[1]);

test("client services present", () => {
  const want = {
    playstation: ["HDMI", "Laufwerk", "Lüfter", "Überhitzung"],
    laptop: ["Komponentenwechsel"],
    tablet: ["Displaytausch"],
    fehlerdiagnose: ["elektronische Geräte"],
  };
  for (const [id, words] of Object.entries(want)) {
    const list = servicesOf(html(HUBS[id].path));
    for (const w of words) assert.ok(list.includes(w), `${id}: services list misses "${w}"`);
  }
});

const BANNED = /\b(beste[nrms]?|günstigste[nrms]?|billigste[nrms]?|garantiert)\b|\d+\s*(Jahre?|Monate?|Tage?)\s+Garantie/i;

test("hub copy follows the rules", () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const [id, hub] of Object.entries(HUBS)) {
    const h = html(hub.path);
    const json = hubJson(id);
    const title = unesc(titleOf(h));
    const description = unesc(descOf(h));
    assert.ok(title.length <= 60, `${id}: title ${title.length} chars: ${title}`);
    assert.ok(description.length <= 155, `${id}: description ${description.length} chars: ${description}`);
    assert.ok(title.includes("Weil am Rhein") && description.includes("Weil am Rhein"), id);
    titles.add(title);
    descriptions.add(description);

    assert.equal(json.intro.de.length, 2, id);
    assert.equal(json.intro.en.length, 2, id);
    assert.ok(json.services.length >= 3 && json.services.length <= 6, `${id}: ${json.services.length} services`);
    assert.equal(json.faq.length, 4, id);
    assert.equal([...h.matchAll(/<details>/g)].length, 4, `${id}: 4 FAQs on the page`);
    assert.ok(json.related.length > 0 && !json.related.includes(hub.path), id);

    const all = pageStrings(h);
    const words = [title, description, ...Object.values(all.de), ...Object.values(all.en)].join("\n");
    assert.doesNotMatch(words, BANNED, id);
    assert.doesNotMatch(words, /[{}]/, `${id}: unfilled placeholder`);
    assert.equal(/30 Minuten|30 minutes/.test(words), PHONE_HUBS.has(id), `${id}: "oft in 30 Minuten" is for phones only`);
    assert.match(text(h.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]), /in Weil am Rhein$/, id);
  }
  assert.equal(titles.size, 10);
  assert.equal(descriptions.size, 10);
});

test("no unsourced travel-time claim", () => {
  // the hub copy, the shared dictionary (it holds the home page copy) and the Ratgeber articles
  const articles = fs.readdirSync(path.join(root, "src/content/ratgeber")).filter((f) => f.endsWith(".md")).map((f) => `src/content/ratgeber/${f}`);
  assert.ok(articles.length > 0, "no Ratgeber articles found");
  for (const file of [...Object.keys(HUBS).map((id) => `src/content/hubs/${id}.json`), "src/strings.json", ...articles]) {
    const raw = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(raw, /wenige Minuten|few minutes/i, `${file}: use "nahe Basel" / "direkt an der Grenze zu Basel"`);
  }
});

test("original-part services say they depend on the model", () => {
  for (const id of Object.keys(HUBS)) {
    for (const s of hubJson(id).services) {
      if (/original/i.test(s.de)) assert.match(s.de, /je nach Modell/, `${id}: ${s.de}`);
      if (/original|genuine/i.test(s.en)) assert.match(s.en, /depending on the model/, `${id}: ${s.en}`);
    }
  }
});

test("picker embedded with the preset", () => {
  for (const [id, hub] of Object.entries(HUBS)) {
    const h = html(hub.path);
    const tags = [...h.matchAll(/<section class="picker"([^>]*)>/g)];
    if (!hub.picker) {
      assert.equal(tags.length, 0, id);
      assert.ok(!h.includes("data-picker") && !h.includes("/assets/js/picker.js"), id);
      continue;
    }
    assert.equal(tags.length, 1, id);
    assert.ok(tags[0][1].startsWith(` data-picker data-type="${hub.picker.type}" data-brand="${hub.picker.brand}"`), `${id}: ${tags[0][1]}`);
    assert.ok(!tags[0][1].includes(' id="'), `${id}: only the home page picker has an id`);
    assert.ok(h.includes('<script src="/assets/js/picker.js?v='), id);
  }
});

test("hub texts are translatable", () => {
  for (const [id, hub] of Object.entries(HUBS)) {
    const h = html(hub.path);
    const all = pageStrings(h);
    assert.deepEqual(Object.keys(all.de).sort(), Object.keys(all.en).sort(), id);
    // page.* and faq.* keys are this page's own strings; shared UI keys (hub.*, nav.*) live in strings.json
    const shown = [...mainOf(h).matchAll(/data-i18n="((?:page|faq)\.[^"]+)">([^<]*)</g)];
    assert.ok(shown.length >= 10, `${id}: ${shown.length} translatable hub texts`);
    for (const [, key, value] of shown) {
      assert.equal(value, all.de[key], `${id}: ${key}`);
      assert.ok(all.en[key], `${id}: ${key} has no English text`);
    }
    const json = hubJson(id);
    assert.equal(all.en["page.h1"], json.h1.en);
    assert.equal(json.services.length, Object.keys(all.de).filter((k) => k.startsWith("page.svc.")).length, id);
  }
});

test("breadcrumbs and structured data", () => {
  for (const [id, hub] of Object.entries(HUBS)) {
    const h = html(hub.path);
    const crumbs = h.match(/<nav class="crumbs"[\s\S]*?<\/nav>/)[0];
    const links = [...crumbs.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    // a brand page sits below the hub of its device type
    const typeHub = hub.picker ? categories.types[hub.picker.type].hub : hub.path;
    assert.deepEqual(links, typeHub === hub.path ? ["/"] : ["/", typeHub], id);
    assert.ok(crumbs.includes(`<li aria-current="page" data-i18n="page.label">${hubJson(id).label.de}</li>`), id);

    const ld = jsonld(h);
    const trail = ld.find((o) => o["@type"] === "BreadcrumbList");
    assert.deepEqual(trail.itemListElement.map((i) => new URL(i.item).pathname), [...links, hub.path]);
    const service = ld.find((o) => o["@type"] === "Service");
    assert.ok(service, id);
    assert.equal(service.provider["@id"], `${site.origin}/#business`);
    assert.ok(!("offers" in service), `${id}: hub services carry no offers`);
  }
});

test("contact snippet and related hubs", () => {
  for (const [id, hub] of Object.entries(HUBS)) {
    const h = mainOf(html(hub.path));
    assert.ok(h.includes(site.street) && h.includes(site.phoneHref) && h.includes(site.hours[0].open), id);
    const related = h.match(/<ul class="hubs">([\s\S]*?)<\/ul>/)[1];
    assert.deepEqual([...related.matchAll(/href="([^"]*)"/g)].map((m) => m[1]), hubJson(id).related, id);
  }
});

test("hub json is checked at build time", async () => {
  const { checkHub } = await import("./pages/hub.mjs");
  const ctx = { categories, paths: new Set(Object.values(HUBS).map((h) => h.path)) };
  const good = hubJson("iphone");
  assert.doesNotThrow(() => checkHub(good, "iphone.json", ctx));
  const bad = (patch) => ({ ...structuredClone(good), ...patch });
  assert.throws(() => checkHub(bad({ faq: good.faq.slice(0, 3) }), "iphone.json", ctx), /iphone\.json: .*faq/);
  assert.throws(() => checkHub(bad({ services: good.services.slice(0, 2) }), "iphone.json", ctx), /services/);
  assert.throws(() => checkHub(bad({ intro: { de: good.intro.de, en: [] } }), "iphone.json", ctx), /intro/);
  assert.throws(() => checkHub(bad({ picker: { type: "toaster", brand: null } }), "iphone.json", ctx), /picker/);
  assert.throws(() => checkHub(bad({ models: { parents: ["nokia"], extra: [] } }), "iphone.json", ctx), /parent/);
  assert.throws(() => checkHub(bad({ related: ["/nirgendwo/"] }), "iphone.json", ctx), /related/);
  assert.throws(() => checkHub(bad({ id: "ipad" }), "iphone.json", ctx), /id/);
});
