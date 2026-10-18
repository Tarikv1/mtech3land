import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";
import { buildDevices, loadJson } from "./lib.mjs";
import { waLink } from "./html.mjs";
import { listedRows } from "./pages/model.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const prices = loadJson(root, "assets/data/prices.json");
const categories = loadJson(root, "src/categories.json");
const strings = loadJson(root, "src/strings.json");
const site = loadJson(root, "src/site.json");
const devices = buildDevices(prices, categories, strings, loadJson(root, "src/model-order.json"));
const byUrl = (url) => {
  const d = devices.find((x) => x.url === url);
  assert.ok(d, `no device at ${url}`);
  return d;
};

let out;
let result;
before(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "mt-model-"));
  result = build({ root, outDir: out, quiet: true });
});
after(() => fs.rmSync(out, { recursive: true, force: true }));

const html = (d) => fs.readFileSync(path.join(out, d.url.slice(1), "index.html"), "utf8");
const titleOf = (h) => h.match(/<title>([^<]*)<\/title>/)[1];
const descOf = (h) => h.match(/<meta name="description" content="([^"]*)"/)[1];
const text = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const jsonld = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const service = (h) => jsonld(h).find((o) => o["@type"] === "Service");
const pageStrings = (h) => JSON.parse(h.match(/window\.MT_PAGE_STRINGS=(\{[\s\S]*?\});<\/script>/)[1]);
const BAD = /\b(null|undefined|NaN)\b/;
const REQUEST = strings.de["price.request"];

// price-list rows as rendered: [{label, price, wa}]
function rowsIn(h) {
  return [...h.matchAll(/<li class="pricelist__row">([\s\S]*?)<\/li>/g)].map((m) => ({
    label: text(m[1].match(/<span class="pricelist__label"[^>]*>([\s\S]*?)<\/span>/)[1]),
    price: text(m[1].match(/<span class="pricelist__price"[^>]*>([\s\S]*?)<\/span>/)[1]),
    wa: new URL(m[1].match(/class="pricelist__wa" href="([^"]*)"/)[1].replace(/&amp;/g, "&")).searchParams.get("text"),
  }));
}
const labelsIn = (h) => rowsIn(h).map((r) => r.label);
const labelOf = (row) => strings.de[row.labelKey];
const priceTextOf = (row) => (row.price == null ? REQUEST : `${row.price} €`);
const hrefsIn = (h, cls) => [...h.match(new RegExp(`<div class="${cls}">([\\s\\S]*?)</div>`))[1].matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

test("build passes validation", () => {
  assert.deepEqual(result.errors, []);
});

test("one page per device", () => {
  assert.equal(devices.length, 272);
  for (const d of devices) {
    assert.ok(fs.existsSync(path.join(out, d.url.slice(1), "index.html")), `${d.url} has no file`);
    const recs = result.pages.filter((p) => p.path === d.url);
    assert.equal(recs.length, 1, `${d.url} must be exactly one page record`);
    assert.equal(recs[0].indexable, true);
  }
  assert.equal(new Set(devices.map((d) => d.url)).size, devices.length);
});

// an unpriced standard row (display, akku) next to a priced variant is not shown: the original parts, and for the
// display also the iPad parts (LCD, Displayglas, Digitizer-Glas)
const hiddenRow = (d, row) =>
  row.price == null &&
  d.repairs.some(
    (o) => o.price != null && [`${row.slug}-original`, `${row.slug}-original-irp`, ...(row.slug === "display" ? ["lcd", "displayglas", "digitizer-glas"] : [])].includes(o.slug),
  );

test("prices in html equal data", () => {
  let hidden = 0;
  for (const d of devices) {
    const actual = rowsIn(html(d));
    for (const row of [...d.repairs, ...d.extras]) {
      const want = { label: labelOf(row), price: priceTextOf(row) };
      const at = actual.findIndex((r) => r.label === want.label && r.price === want.price);
      if (hiddenRow(d, row)) {
        hidden++;
        assert.ok(at < 0, `${d.url}: empty "${want.label}" row must be hidden next to its priced original`);
        continue;
      }
      assert.ok(at >= 0, `${d.url}: no row "${want.label}" with "${want.price}"`);
      actual.splice(at, 1);
    }
  }
  assert.ok(hidden > 0, "data has no hidden-row case, the rule is untested");
});

test("hides empty standard row next to priced original", () => {
  const h = html(byUrl("/iphone-reparatur/iphone-14-pro/"));
  const display = rowsIn(h).filter((r) => r.label.startsWith("Display"));
  assert.equal(display.length, 1);
  assert.equal(display[0].label, "Display (Original Apple)");
  assert.equal(display[0].price, "405 €");
  assert.deepEqual(rowsIn(h).filter((r) => r.label.startsWith("Akku")).map((r) => [r.label, r.price]), [["Akku (Original Apple)", "119 €"]]);
  // other empty rows of the same device stay
  assert.equal(rowsIn(h).find((r) => r.label === "Hörmuschel").price, "auf Anfrage");
  // empty display and no priced variant (original, LCD, glass): the row stays. No device in the data is left in
  // that state, so a synthetic one covers it.
  const row = (slug, price) => ({ slug, labelKey: `repair.${slug}`, priority: categories.repairPriority[slug], price, original: false });
  const slugsOfRows = (repairs) => listedRows({ type: "tablet", repairs, extras: [] }, categories, strings).map((r) => [r.slug, r.price]);
  assert.deepEqual(slugsOfRows([row("display", null), row("akku", 99)]).find(([s]) => s === "display"), ["display", null]);
  assert.deepEqual(slugsOfRows([row("display", null), row("lcd", null), row("akku", 99)]).find(([s]) => s === "display"), ["display", null]);
  assert.ok(!slugsOfRows([row("display", null), row("lcd", 149)]).some(([s]) => s === "display"));
  assert.ok(!slugsOfRows([row("display", null), row("digitizer-glas", 99)]).some(([s]) => s === "display"));
  // a core display row is not added next to any display variant either
  assert.ok(!slugsOfRows([row("displayglas", 109), row("akku", 99)]).some(([s]) => s === "display"));
  // offers are unaffected: priced rows only
  assert.equal(service(h).offers.length, byUrl("/iphone-reparatur/iphone-14-pro/").repairs.filter((r) => r.price != null).length);
});

test("no null leakage", () => {
  for (const d of devices) {
    const h = html(d);
    const parts = { title: titleOf(h), description: descOf(h), jsonld: JSON.stringify(jsonld(h)) };
    for (const [what, value] of Object.entries(parts)) assert.ok(!BAD.test(value), `${d.url}: ${what} contains null/undefined/NaN`);
    assert.ok(!/null €/.test(h) && !/\bundefined\b/.test(h), `${d.url}: page text leaks`);
  }
  const t = titleOf(html(byUrl("/iphone-reparatur/iphone-14-pro/")));
  assert.ok(t.includes("Display ab 405 €"), t);
});

test("no double-escaped entities", () => {
  const h = fs.readFileSync(path.join(out, "macbook-reparatur/macbook-air-13-3-a1369/index.html"), "utf8");
  assert.ok(h.includes("13,3″"));
  assert.ok(!h.includes("&amp;#8243;") && !h.includes("&#8243;"));
});

test("titles unique and suffixed", () => {
  const titles = devices.map((d) => titleOf(html(d)));
  for (const t of titles) assert.ok(t.endsWith(" | Mtech3land"), t);
  assert.equal(new Set(titles).size, devices.length);
  assert.equal(new Set(devices.map((d) => descOf(html(d)))).size, devices.length);
});

test("offers only for priced rows", () => {
  for (const d of devices) {
    const priced = d.repairs.filter((r) => r.price != null);
    const s = service(html(d));
    assert.ok(s, `${d.url}: no Service JSON-LD`);
    const offers = s.offers ?? [];
    assert.equal(offers.length, priced.length, d.url);
    offers.forEach((o, i) => {
      assert.deepEqual(o, { "@type": "Offer", name: labelOf(priced[i]), price: String(priced[i].price), priceCurrency: "EUR" });
    });
    assert.equal(s.name, `${d.name} Reparatur`);
    assert.deepEqual(s.provider, { "@id": `${site.origin}/#business` });
    assert.deepEqual(s.areaServed, ["Weil am Rhein", "Basel", "Lörrach"]);
  }
});

test("breadcrumbs", () => {
  const h = html(byUrl("/iphone-reparatur/iphone-13-pro/"));
  const list = jsonld(h).find((o) => o["@type"] === "BreadcrumbList");
  assert.deepEqual(
    list.itemListElement.map((i) => [i.position, i.name, i.item]),
    [
      [1, "Start", `${site.origin}/`],
      [2, "iPhone", `${site.origin}/iphone-reparatur/`],
      [3, "iPhone 13 Pro", `${site.origin}/iphone-reparatur/iphone-13-pro/`],
    ],
  );
  const crumbs = h.match(/<nav class="crumbs"[\s\S]*?<\/nav>/)[0];
  assert.ok(crumbs.includes('href="/"') && crumbs.includes('href="/iphone-reparatur/"') && crumbs.includes('aria-current="page"'));
  const wl = jsonld(html(byUrl("/apple-watch-reparatur/"))).find((o) => o["@type"] === "BreadcrumbList");
  assert.deepEqual(wl.itemListElement.map((i) => i.name), ["Start", "Apple Watch"]);
});

test("playstation extras on request", () => {
  const rows = rowsIn(html(byUrl("/playstation-reparatur/ps5/")));
  for (const label of ["Laufwerk", "Lüfter / Überhitzung"]) {
    assert.equal(rows.find((r) => r.label === label)?.price, "auf Anfrage", label);
  }
});

test("core rows are listed as on request and never priced", () => {
  // a newer model whose data has only Fehlerdiagnose + Wasserschaden
  const raw = prices.devices.find((x) => x.device === "Apple iPhone 18 Pro (A3714, A3472, A3713, A3715)");
  assert.equal(raw?.repairs.length, 2);
  assert.ok(raw, "no new handy device in data");
  const d = devices.find((x) => x.device === raw.device);
  const h = html(d);
  const rows = rowsIn(h);
  for (const label of ["Display", "Akku", "Ladebuchse"]) {
    assert.equal(rows.find((r) => r.label === label)?.price, "auf Anfrage", `${d.url}: ${label}`);
  }
  assert.equal(service(h).offers.length, 2, "core rows must not become offers");
  assert.equal(titleOf(h), `${d.name} Reparatur Weil am Rhein – Fehlerdiagnose ab 39 € | Mtech3land`);
  const order = rows.map((r) => r.label);
  const at = (l) => order.indexOf(l);
  assert.ok(at("Display") < at("Akku") && at("Akku") < at("Ladebuchse") && at("Ladebuchse") < at("Wasserschaden") && at("Wasserschaden") < at("Fehlerdiagnose"), order.join(", "));
});

test("core rows are skipped when the repair or its original variant exists", () => {
  const labels = labelsIn(html(byUrl("/iphone-reparatur/iphone-14-pro/")));
  assert.equal(labels.filter((l) => l === "Display").length, 0, "no standard Display row: empty data row hidden, no core row added");
  assert.equal(labels.filter((l) => l === "Akku").length, 0, "no standard Akku row: empty data row hidden, no core row added");
  assert.equal(rowsIn(html(byUrl("/iphone-reparatur/iphone-14-pro/"))).find((r) => r.label === "Display (Original Apple)").price, "405 €");

  // original variant only: no extra standard row
  const variantOnly = byUrl("/handy-reparatur/pixel-10a/");
  assert.ok(variantOnly.repairs.some((r) => r.slug === "display-original") && !variantOnly.repairs.some((r) => r.slug === "display"));
  assert.ok(!labelsIn(html(variantOnly)).includes("Display"));

  // no display row at all: one is added
  const tablet = byUrl("/ipad-reparatur/ipad-pro-11/");
  assert.ok(!tablet.repairs.some((r) => r.slug.startsWith("display")));
  assert.equal(rowsIn(html(tablet)).find((r) => r.label === "Display")?.price, "auf Anfrage");

  const ps = labelsIn(html(byUrl("/playstation-reparatur/ps5-slim/")));
  assert.ok(ps.includes("HDMI") && ps.includes("Reinigung"));
  const laptop = labelsIn(html(devices.find((d) => d.type === "laptop" && !d.repairs.some((r) => r.slug === "tastatur"))));
  assert.ok(laptop.includes("Tastatur") && laptop.includes("Display") && laptop.includes("Akku"));
  assert.deepEqual(labelsIn(html(byUrl("/apple-watch-reparatur/"))), ["Display", "Displayglas", "Akku"]);
});

test("whatsapp links", () => {
  const d = byUrl("/iphone-reparatur/iphone-13-pro/");
  const h = html(d);
  const cta = h.match(/<a class="btn btn--wa" href="([^"]*)"/)[1].replace(/&amp;/g, "&");
  assert.equal(cta, waLink(site, "Hallo, ich brauche eine Reparatur für mein iPhone 13 Pro."));
  const priced = d.repairs.find((r) => r.price != null);
  assert.equal(rowsIn(h).find((r) => r.label === labelOf(priced)).wa, `Hallo, ich brauche ${labelOf(priced)} für mein iPhone 13 Pro (${priced.price} €).`);
  const open = byUrl("/iphone-reparatur/iphone-14-pro/");
  const nullRow = rowsIn(html(open)).find((r) => r.label === "Hörmuschel");
  assert.equal(nullRow.price, "auf Anfrage");
  assert.equal(nullRow.wa, "Hallo, ich brauche Hörmuschel für mein iPhone 14 Pro.");
  // die PlayStation, die Apple Watch
  const ps = html(byUrl("/playstation-reparatur/ps5/"));
  assert.equal(ps.match(/<a class="btn btn--wa" href="([^"]*)"/)[1], waLink(site, "Hallo, ich brauche eine Reparatur für meine PlayStation 5."));
  assert.equal(rowsIn(ps).find((r) => r.label === "HDMI").wa, "Hallo, ich brauche HDMI für meine PlayStation 5 (249 €).");
  const watch = rowsIn(html(byUrl("/apple-watch-reparatur/")));
  assert.equal(watch.find((r) => r.label === "Akku").wa, "Hallo, ich brauche Akku für meine Apple Watch (99 €).");
});

test("related models", () => {
  const d = byUrl("/iphone-reparatur/iphone-13-pro/");
  const h = html(d);
  const hrefs = hrefsIn(h, "modellist");
  const group = devices.filter((x) => x.group === d.group);
  const i = group.indexOf(d);
  assert.equal(hrefs.length, 6);
  assert.ok(!hrefs.includes(d.url));
  assert.ok(hrefs.every((u) => group.some((x) => x.url === u)));
  const indexes = hrefs.map((u) => group.findIndex((x) => x.url === u));
  assert.deepEqual(indexes, [i - 3, i - 2, i - 1, i + 1, i + 2, i + 3], "three newer, three older, newest first");
  assert.ok(h.includes('href="/iphone-reparatur/"'), "link to parent");

  // the newest model has only older neighbours
  const group0 = devices.filter((x) => x.group === "iPhone");
  assert.deepEqual(hrefsIn(html(group0[0]), "modellist"), group0.slice(1, 7).map((x) => x.url));
  // a group with fewer than 7 models lists the others
  const huawei = devices.filter((x) => x.group === "Huawei");
  assert.equal(hrefsIn(html(huawei[2]), "modellist").length, huawei.length - 1);
  // no parent -> no related list
  assert.ok(!html(byUrl("/apple-watch-reparatur/")).includes('class="modellist"'));
});

test("every device with a parent has related models and a parent link", () => {
  for (const d of devices.filter((x) => x.parentId)) {
    const h = html(d);
    assert.ok(h.includes('class="modellist"'), `${d.url}: no related list`);
    const parentUrl = categories.parents[d.parentId].url;
    assert.ok(h.includes(`<a class="btn btn--ghost" href="${parentUrl}"`), `${d.url}: no parent link`);
    assert.equal(hrefsIn(h, "modellist").filter((u) => u === d.url).length, 0);
  }
});

test("page content: h1, model numbers, badges, faq, contact", () => {
  const mac = html(byUrl("/macbook-reparatur/macbook-pro-13-a2338/"));
  assert.equal(text(mac.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]), "MacBook Pro 13″ (A2338) Reparatur in Weil am Rhein");
  assert.ok(text(mac).includes("Modellnummern: A2338"));
  const iphone = html(byUrl("/iphone-reparatur/iphone-13-pro/"));
  assert.ok(iphone.includes("Oft in 30 Min.") && iphone.includes("Garantie") && iphone.includes("Termin per WhatsApp"));
  assert.ok(!iphone.includes("Dauer nach Diagnose"));
  assert.ok(mac.includes("Dauer nach Diagnose") && !mac.includes("Oft in 30 Min."));
  assert.equal([...iphone.matchAll(/<details>/g)].length, 4);
  assert.ok(iphone.includes(site.street) && iphone.includes(site.phoneHref) && iphone.includes("12:30"));
  const noCodes = devices.find((d) => d.codes.length === 0);
  assert.ok(!text(html(noCodes)).includes("Modellnummern"), `${noCodes.url}: codes line without codes`);
});

test("faq follows the price data and is translatable", () => {
  const ih = html(byUrl("/iphone-reparatur/iphone-14-pro/"));
  const strs = pageStrings(ih);
  assert.deepEqual(Object.keys(strs).sort(), ["de", "en"]);
  assert.equal(strs.de["faq.0.q"], "Was kostet ein Displaytausch beim iPhone 14 Pro?");
  assert.ok(strs.de["faq.0.a"].includes("405 €"));
  assert.ok(strs.en["faq.0.q"].includes("iPhone 14 Pro") && /screen/i.test(strs.en["faq.0.q"]));
  const visible = [...ih.matchAll(/<summary data-i18n="(faq\.\d+\.q)">([^<]*)<\/summary>/g)];
  assert.equal(visible.length, 4);
  for (const [, key, shown] of visible) assert.equal(shown, strs.de[key]);
  const answers = [...ih.matchAll(/<p data-i18n="(faq\.\d+\.a)">([^<]*)<\/p>/g)];
  assert.equal(answers.length, 4);
  for (const [, key, shown] of answers) assert.equal(shown, strs.de[key]);
  // Apple Watch has no diagnosis price -> no diagnosis question; "bei der" because it is feminine
  const w = pageStrings(html(byUrl("/apple-watch-reparatur/")));
  assert.equal(w.de["faq.0.q"], "Was kostet ein Displaytausch bei der Apple Watch?");
  assert.ok(w.de["faq.0.a"].startsWith("Der Displaytausch bei der Apple Watch kostet"));
  assert.ok(w.en["faq.0.q"].includes("for the Apple Watch"));
  const console5 = pageStrings(html(byUrl("/playstation-reparatur/ps5/")));
  assert.equal(console5.de["faq.1.a"], "Die Fehlerdiagnose kostet bei uns 39 €.");
  assert.ok(!Object.values(console5.de).some((v) => /dein PlayStation/.test(v)));
  assert.equal(Object.keys(w.de).filter((k) => k.endsWith(".q")).length, 3);
  assert.ok(!Object.values(w.de).some((v) => v.includes("Fehlerdiagnose")));
  // no priced display row at all -> no display question
  const noDisp = devices.find((d) => !d.repairs.some((r) => r.slug.startsWith("display") && r.price != null));
  assert.ok(!Object.values(pageStrings(html(noDisp)).de).some((v) => v.includes("Displaytausch")), noDisp.url);
});

test("modelTitle and modelDescription formats", async () => {
  const { modelTitle, modelDescription } = await import("./pages/model.mjs");
  const row = (slug, price) => ({ slug, labelKey: `repair.${slug}`, priority: categories.repairPriority[slug], price, original: false });
  const dev = (repairs) => ({ name: "Testphone 1", repairs, extras: [] });
  assert.equal(modelTitle(dev([row("akku", 99), row("display", 220)])), "Testphone 1 Reparatur Weil am Rhein – Display ab 220 € | Mtech3land");
  assert.equal(modelTitle(dev([row("akku", 99), row("ladebuchse", 79)])), "Testphone 1 Reparatur Weil am Rhein – Ladebuchse ab 79 € | Mtech3land");
  assert.equal(modelTitle(dev([row("akku", null)])), "Testphone 1 Reparatur Weil am Rhein | Mtech3land");
  assert.equal(
    modelDescription(dev([row("display", 220), row("akku", 99), row("ladebuchse", 79), row("backcover", 59)])),
    "Testphone 1 Reparatur in Weil am Rhein, nahe Basel: Display 220 €, Akku 99 €, Ladebuchse 79 €. Termin per WhatsApp.",
  );
  assert.equal(
    modelDescription(dev([row("display", null), row("akku", 99)])),
    "Testphone 1 Reparatur in Weil am Rhein, nahe Basel: Akku 99 €. Termin per WhatsApp.",
  );
  assert.equal(
    modelDescription(dev([row("display", null)])),
    "Testphone 1 Reparatur in Weil am Rhein, nahe Basel. Preis auf Anfrage, Termin per WhatsApp.",
  );
});

test("modelFaq", async () => {
  const { modelFaq } = await import("./pages/model.mjs");
  const row = (slug, price) => ({ slug, labelKey: `repair.${slug}`, priority: categories.repairPriority[slug], price, original: false });
  const phone = { name: "Testphone 1", type: "handy", repairs: [row("display", 220), row("fehleranalyse", 29)], extras: [] };
  const de = modelFaq(phone, "de");
  assert.deepEqual(de.map((f) => f.q), [
    "Was kostet ein Displaytausch beim Testphone 1?",
    "Wie lange dauert die Reparatur?",
    "Was kostet die Fehlerdiagnose?",
    "Brauche ich einen Termin?",
  ]);
  assert.ok(de[0].a.includes("ab 220 €") && de[1].a.startsWith("Oft in 30 Minuten") && de[2].a.includes("29 €"));
  assert.equal(de[0].a, "Der Displaytausch beim Testphone 1 kostet bei uns ab 220 €, inkl. MwSt.");
  assert.equal(modelFaq({ ...phone, type: "smartwatch" }, "de")[0].q, "Was kostet ein Displaytausch bei der Testphone 1?");
  assert.equal(de[3].a, "Nein. Komm vorbei oder schreib uns vorher per WhatsApp.");
  const en = modelFaq(phone, "en");
  assert.equal(en.length, 4);
  assert.ok(en.every((f) => f.q && f.a));
  const laptop = { ...phone, type: "laptop", repairs: [row("akku", 99)] };
  const l = modelFaq(laptop, "de");
  assert.deepEqual(l.map((f) => f.q), ["Wie lange dauert die Reparatur?", "Brauche ich einen Termin?"]);
  assert.equal(l[0].a, "Nach der Diagnose sagen wir dir, wie lange es dauert.");
});

test("every core repair slug is mapped", () => {
  assert.ok(categories.coreRepairs, "categories.coreRepairs missing");
  for (const [type, slugs] of Object.entries(categories.coreRepairs)) {
    assert.ok(categories.types[type], `unknown type ${type}`);
    for (const s of slugs) {
      assert.ok(categories.repairPriority[s] !== undefined, `${s}: no priority`);
      assert.ok(strings.de[`repair.${s}`] && strings.en[`repair.${s}`], `${s}: no label`);
    }
  }
  for (const type of Object.keys(categories.types)) assert.ok(categories.coreRepairs[type]?.length, `${type}: no core repairs`);
});

// The shop's Apple parts claim is only "genuine Apple part": Apple's IRP programme membership is unconfirmed,
// so neither the programme name nor its long form may reach a visitor (slugs and label keys keep "irp").
test("no IRP claim in built pages, strings.js or src text", () => {
  const CLAIM = /\bIRP\b|Independent Repair/;
  const walk = (dir, keep) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const abs = path.join(dir, e.name);
      return e.isDirectory() ? walk(abs, keep) : keep(e.name) ? [abs] : [];
    });
  const built = walk(out, (n) => n.endsWith(".html") || n === "strings.js");
  assert.ok(built.length > 272, "built files not found");
  const sources = walk(path.join(root, "src"), (n) => /\.(json|md|html)$/.test(n));
  assert.ok(sources.length > 10, "src files not found");
  const hits = [...built.map((f) => ["built", path.relative(out, f)]), ...sources.map((f) => ["src", path.relative(root, f)])]
    .filter(([kind, rel]) => CLAIM.test(fs.readFileSync(path.join(kind === "built" ? out : root, rel), "utf8")))
    .map(([kind, rel]) => `${kind}:${rel.replaceAll("\\", "/")}`);
  assert.deepEqual(hits, []);
  assert.equal(strings.de["repair.display-original-irp"], "Display (Original Apple)");
  assert.equal(strings.de["repair.akku-original-irp"], "Akku (Original Apple)");
  assert.equal(strings.en["repair.display-original-irp"], "Screen (genuine Apple)");
  assert.equal(strings.en["repair.akku-original-irp"], "Battery (genuine Apple)");
});

// iPad pages list LCD / Displayglas as their display repairs. An empty "Display" row (a data row without price, or
// the core row added when the data lacks one) must not sit above them.
test("an empty Display row is not listed next to priced LCD or Displayglas", () => {
  const ipads = ["ipad-10-9", "ipad-10-2-2021", "ipad-10-2-2020", "ipad-10-2-2019", "ipad-9-7-2018", "ipad-9-7-2017", "ipad-mini-3", "ipad-air"];
  for (const slug of ipads) {
    const d = byUrl(`/ipad-reparatur/${slug}/`);
    const rows = rowsIn(html(d));
    assert.ok(!rows.some((r) => r.label === "Display"), `${d.url}: empty "Display" row listed`);
    assert.ok(rows.some((r) => r.label === strings.de["repair.lcd"] && r.price !== REQUEST), `${d.url}: no priced LCD row`);
    assert.ok(rows.some((r) => r.label === strings.de["repair.displayglas"] && r.price !== REQUEST), `${d.url}: no priced Displayglas row`);
  }
  // every device: no empty Display row next to a priced display variant (original, LCD, glass, digitizer glass)
  const VARIANTS = ["display-original", "display-original-irp", "lcd", "displayglas", "digitizer-glas"];
  for (const d of devices) {
    const rows = rowsIn(html(d));
    const empty = rows.some((r) => r.label === "Display" && r.price === REQUEST);
    const priced = d.repairs.some((r) => VARIANTS.includes(r.slug) && r.price != null);
    assert.ok(!(empty && priced), `${d.url}: empty Display row next to a priced display variant`);
  }
  // the 2019 model keeps its LCD and Displayglas rows with their prices
  const rows2019 = rowsIn(html(byUrl("/ipad-reparatur/ipad-10-2-2019/")));
  assert.deepEqual(rows2019.filter((r) => /^(LCD|Displayglas)/.test(r.label)).map((r) => [r.label, r.price]), [
    [strings.de["repair.lcd"], "289 €"],
    [strings.de["repair.displayglas"], "159 €"],
  ]);
  // a tablet with no display variant at all still gets the core Display row
  assert.equal(rowsIn(html(byUrl("/ipad-reparatur/ipad-pro-11/"))).find((r) => r.label === "Display")?.price, REQUEST);
});
