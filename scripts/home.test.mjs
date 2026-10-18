import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build, PENDING } from "./build.mjs";
import { esc } from "./html.mjs";
import { buildDevices, loadJson } from "./lib.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = loadJson(root, "src/site.json");
const strings = loadJson(root, "src/strings.json");
const reviews = loadJson(root, "assets/data/reviews.json");
const devices = buildDevices(loadJson(root, "assets/data/prices.json"), loadJson(root, "src/categories.json"), strings, loadJson(root, "src/model-order.json"));

let out;
let result;
let html;
before(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "mt-home-"));
  result = build({ root, outDir: out, quiet: true });
  html = fs.readFileSync(path.join(out, "index.html"), "utf8");
});
after(() => fs.rmSync(out, { recursive: true, force: true }));

const text = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const mainOf = (h) => h.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const jsonld = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const pageStrings = (h) => JSON.parse(h.match(/window\.MT_PAGE_STRINGS=(\{[\s\S]*?\});<\/script>/)[1]);
const sectionOf = (id) => mainOf(html).match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?\\n</section>`))[0];
const ratingDe = reviews.rating.toFixed(1).replace(".", ",");
const ratingEn = reviews.rating.toFixed(1);
// lowest price of a repair (standard or original variant) over the given devices
const minPrice = (list, slug) =>
  Math.min(...list.flatMap((d) => d.repairs).filter((r) => r.price != null && [slug, `${slug}-original`, `${slug}-original-irp`].includes(r.slug)).map((r) => r.price));

// The last commit of the pre-redesign site; main moves to the new site once the redesign is merged.
const OLD_SITE = "d099701";
function gitOld(file) {
  try {
    return execFileSync("git", ["show", `${OLD_SITE}:${file}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null; // shallow clone without that commit
  }
}

test("home is built, indexable and leaves PENDING", () => {
  assert.deepEqual(result.errors, []);
  const recs = result.pages.filter((p) => p.path === "/");
  assert.equal(recs.length, 1);
  assert.equal(recs[0].file, "index.html");
  assert.equal(recs[0].indexable, true);
  assert.ok(!PENDING.includes("/"));
  assert.ok(html.includes(`<link rel="canonical" href="${site.origin}/">`));
  assert.ok(!/name="robots"/.test(html));
});

test("home keeps legacy anchors", () => {
  for (const id of ["leistungen", "preise", "ablauf", "bewertungen", "kontakt"]) {
    assert.equal([...html.matchAll(new RegExp(`id="${id}"`, "g"))].length, 1, `id="${id}" exactly once`);
  }
  assert.match(html, /<section class="picker" id="preise" data-picker/, "#preise sits on the picker section");
});

test("home links all hubs", () => {
  for (const p of ["/handy-reparatur/", "/tablet-reparatur/", "/laptop-reparatur/", "/playstation-reparatur/", "/fehlerdiagnose/", "/datenrettung/", "/ratgeber/"]) {
    assert.ok(html.includes(`href="${p}"`), p);
  }
});

test("sections in order", () => {
  const main = mainOf(html);
  const marks = [
    '<section class="hero">',
    '<ul class="trust">',
    'id="leistungen"',
    'id="preise"',
    'class="cta-box home__promo"',
    'id="ablauf"',
    'id="bewertungen"',
    '<div class="faq">',
    'id="kontakt"',
  ];
  const at = marks.map((m) => main.indexOf(m));
  for (const [i, m] of marks.entries()) assert.ok(at[i] >= 0, `missing ${m}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, "sections out of order");
});

test("hero copy", () => {
  const hero = mainOf(html).match(/<section class="hero">([\s\S]*?)\n<\/section>/)[1];
  assert.equal(text(hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]), "Handy-, Tablet-, Laptop- und PlayStation-Reparatur in Weil am Rhein");
  assert.ok(text(hero.match(/<p class="lede"[^>]*>([\s\S]*?)<\/p>/)[1]).includes("nahe Basel"));
  assert.ok(text(hero).includes(esc(site.promo.de)), "promo pill from site.json");
  assert.match(hero, /<a class="btn btn--primary" href="#preise">[\s\S]*?Preis finden/);
  assert.ok(hero.includes(`href="${site.phoneHref}"`), "call button");
  assert.match(hero, /<img src="\/assets\/img\/storefront\.jpg" width="1400" height="1050" fetchpriority="high" alt="[^"]+"/);
});

test("service tiles link the six service pages", () => {
  const tiles = sectionOf("leistungen").match(/<ul class="tiles tiles--svc">([\s\S]*?)<\/ul>/)[1];
  const links = [...tiles.matchAll(/<a class="tile tile--svc" href="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(links, ["/handy-reparatur/", "/tablet-reparatur/", "/laptop-reparatur/", "/playstation-reparatur/", "/fehlerdiagnose/", "/datenrettung/"]);
});

test("picker without preset", () => {
  assert.equal([...html.matchAll(/<section class="picker"/g)].length, 1);
  assert.match(html, /<section class="picker" id="preise" data-picker data-type="" data-brand="" data-wa="/);
  assert.ok(html.includes('<script src="/assets/js/picker.js?v='));
  assert.ok(html.includes('<script src="/assets/js/picker-state.js?v='));
});

test("review numbers come from reviews.json", () => {
  const all = pageStrings(html);
  assert.equal(all.de["page.rating"], ratingDe);
  assert.equal(all.en["page.rating"], ratingEn);
  assert.equal(all.de["page.reviews"], `${reviews.count} Google-Bewertungen`);
  assert.equal(all.en["page.reviews"], `${reviews.count} Google reviews`);
  const rev = text(sectionOf("bewertungen"));
  assert.ok(rev.includes(`${ratingDe} von 5 auf Google`), rev);
  assert.ok(rev.includes(`${reviews.count} Google-Bewertungen`), rev);
  // the copy itself carries no review number: every count and rating on the page is filled from the data file
  for (const lang of ["de", "en"]) {
    for (const [key, value] of Object.entries(strings[lang]).filter(([k]) => k.startsWith("home."))) {
      assert.doesNotMatch(value, /\b36\b|5[,.]0/, `${lang}/${key} hard-codes a review number`);
    }
  }
  assert.ok(unesc(html.match(/<meta name="description" content="([^"]*)"/)[1]).includes(`${reviews.count} Google-Bewertungen`));
});

test("stars are decorative", () => {
  const stars = [...html.matchAll(/<[^>]*class="stars"[^>]*>/g)].map((m) => m[0]);
  assert.ok(stars.length >= 4, `${stars.length} star rows`);
  for (const tag of stars) assert.ok(tag.includes('aria-hidden="true"'), tag);
  assert.ok(!/[★☆]/.test(text(mainOf(html).replace(/<span class="stars" aria-hidden="true">[★☆]{5}<\/span>/g, ""))), "stars only inside aria-hidden spans");
});

// stars of the overall rating: Math.round(rating) filled, the rest outlined
const starRow = (rating) => `<span class="stars" aria-hidden="true">${"★".repeat(Math.round(rating))}${"☆".repeat(5 - Math.round(rating))}</span>`;

test("rating stars follow reviews.json", () => {
  const trust = mainOf(html).match(/<ul class="trust">([\s\S]*?)<\/ul>/)[1];
  assert.ok(trust.includes(starRow(reviews.rating)), trust);
  // a lower rating in a copy of the data: build there
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mt-home-rating-"));
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), "mt-home-rating-out-"));
  try {
    for (const dir of ["src", "assets"]) fs.cpSync(path.join(root, dir), path.join(tmpRoot, dir), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, "assets/data/reviews.json"), JSON.stringify({ ...reviews, rating: 4.4 }));
    const { errors } = build({ root: tmpRoot, outDir: tmpOut, quiet: true });
    assert.deepEqual(errors, []);
    const low = fs.readFileSync(path.join(tmpOut, "index.html"), "utf8");
    const lowTrust = mainOf(low).match(/<ul class="trust">([\s\S]*?)<\/ul>/)[1];
    assert.ok(lowTrust.includes('<span class="stars" aria-hidden="true">★★★★☆</span>'), lowTrust);
    assert.ok(text(lowTrust).includes("4,4 von 5 Sternen"), text(lowTrust));
    const rev = mainOf(low).match(/<section[^>]*id="bewertungen"[\s\S]*?\n<\/section>/)[0];
    assert.ok(rev.match(/<h2[\s\S]*?<\/h2>/)[0].includes("★★★★☆"), "reviews heading stars follow the rating");
    assert.ok(text(rev).includes("4,4 von 5 auf Google"));
    assert.equal(jsonld(low).find((o) => o["@id"]).aggregateRating.ratingValue, "4.4");
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(tmpOut, { recursive: true, force: true });
  }
});

test("prices read N € in both languages", () => {
  const files = ["src/strings.json", "src/site.json", ...fs.readdirSync(path.join(root, "src/content/hubs")).map((f) => `src/content/hubs/${f}`)];
  for (const file of files) {
    for (const m of fs.readFileSync(path.join(root, file), "utf8").matchAll(/[^"\n]*€\s?\d[^"\n]*/g)) assert.fail(`${file}: "€N" instead of "N €": ${m[0]}`);
  }
});

test("customer quotes copied from the old site", (t) => {
  const old = gitOld("index.html");
  if (old === null) return t.skip(`git commit ${OLD_SITE} not available`);
  const bare = (s) => s.replace(/[„“"]/g, "").trim();
  const oldQuotes = [...old.matchAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g)].map((m) => bare(text(m[1])));
  const quotes = [...mainOf(html).matchAll(/<blockquote>([\s\S]*?)<\/blockquote>/g)].map((m) => bare(text(m[1])));
  assert.equal(oldQuotes.length, 3);
  assert.deepEqual(quotes, oldQuotes);
  for (const name of ["Özgür H.", "Bilal T.", "Susi D."]) assert.ok(mainOf(html).includes(`<cite>${name}</cite>`), name);
  assert.ok(sectionOf("bewertungen").includes(`href="${site.mapsUrl}"`), "link to Google Maps");
});

test("business json-ld", () => {
  const biz = jsonld(html).find((o) => o["@id"] === "https://mtech3land.com/#business");
  assert.ok(biz, "no block with the business @id");
  assert.equal(biz["@type"], "MobilePhoneStore");
  assert.equal(biz.url, `${site.origin}/`);
  assert.equal(biz.name, site.name);
  assert.equal(biz.telephone, site.phoneHref.replace(/^tel:/, ""));
  assert.equal(biz.image, `${site.origin}/assets/img/storefront.jpg`);
  assert.deepEqual(biz.address, { "@type": "PostalAddress", streetAddress: site.street, postalCode: site.zip, addressLocality: site.city, addressCountry: "DE" });
  assert.deepEqual(biz.geo, { "@type": "GeoCoordinates", latitude: 47.5937219, longitude: 7.6266889 });
  assert.deepEqual(biz.aggregateRating, { "@type": "AggregateRating", ratingValue: reviews.rating.toFixed(1), reviewCount: String(reviews.count) });
  assert.deepEqual(
    biz.openingHoursSpecification.map((h) => [h.opens, h.closes]),
    site.hours.map((h) => [h.open, h.close]),
  );
  assert.deepEqual(biz.openingHoursSpecification[0].dayOfWeek, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  assert.equal(biz.openingHoursSpecification[1].dayOfWeek, "Saturday");
});

test("map not loaded on load", () => {
  assert.ok(!html.includes("<iframe"));
  assert.ok(html.includes("data-map-src"));
  const holder = `<div class="map" id="mapHolder" data-map-src="${esc(site.mapEmbed)}">`;
  assert.ok(html.includes(holder), holder);
  assert.match(html.slice(html.indexOf(holder)), /^<div[^>]*>\s*<button id="mapLoad" type="button">/);
});

test("contact block", () => {
  const contact = sectionOf("kontakt");
  for (const fact of [site.street, `${site.zip} ${site.city}`, site.phone, site.phoneHref, `https://wa.me/${site.wa}`, ...site.hours.flatMap((h) => [h.open, h.close])]) {
    assert.ok(contact.includes(esc(fact)), `contact misses ${fact}`);
  }
  assert.match(contact, /<img src="\/assets\/img\/interior\.jpg" width="591" height="1050" loading="lazy" alt="[^"]+"/);
});

test("faq: six questions from the data", () => {
  const faq = mainOf(html).match(/<div class="faq">([\s\S]*?)\n<\/div>/)[1];
  assert.equal([...faq.matchAll(/<details>/g)].length, 6);
  const all = pageStrings(html);
  for (let i = 0; i < 6; i++) {
    for (const lang of ["de", "en"]) {
      assert.ok(all[lang][`faq.${i}.q`] && all[lang][`faq.${i}.a`], `${lang} faq.${i}`);
      assert.doesNotMatch(all[lang][`faq.${i}.q`] + all[lang][`faq.${i}.a`], /[{}]/, `${lang} faq.${i}: unfilled placeholder`);
    }
  }
  const ofType = (type) => devices.filter((d) => d.type === type);
  const display = ["handy", "tablet", "laptop"].map((type) => minPrice(ofType(type), "display"));
  for (const price of display) assert.ok(text(faq).includes(`ab ${price} €`), `display price ${price} € derived from prices.json`);
  assert.ok(text(faq).includes(`ab ${minPrice(devices, "fehleranalyse")} €`), "diagnosis price derived from prices.json");
  // every euro amount in the FAQ is a derived price, never typed into the copy
  const derived = new Set([...display, minPrice(devices, "fehleranalyse")].map(String));
  for (const m of text(faq).matchAll(/(\d+(?:,\d+)?) €/g)) assert.ok(derived.has(m[1]), `FAQ price ${m[1]} € is not derived`);
  assert.equal(all.de["faq.5.a"].match(/Weil am Rhein/g).length, 1, `one sentence, no repeated town: ${all.de["faq.5.a"]}`);
  assert.ok(all.de["faq.5.a"].includes("direkt an der Grenze zu Basel"));
});

const BANNED =
  /\b(beste[nrms]?|günstigste[nrms]?|billigste[nrms]?|schnellste[nrms]?|garantiert|Profis?|Experten?|best|cheapest|fastest)\b|100\s?%|\d+\s*(Jahre?|Monate?|Tage?)\s+Garantie|\d+[- ](years?|months?|days?)\s+warranty/i;
// "Karte" alone is the map ("Karte laden"), so only card-payment compounds count
const PAYMENT = /\b(bar|EC-Karte|Kartenzahlung|Kreditkarte|Twint|PayPal|cash|card|Zahlung|bezahl\w*|payment|pay)\b/i;

test("home copy follows the rules", () => {
  const title = unesc(html.match(/<title>([^<]*)<\/title>/)[1]);
  const description = unesc(html.match(/<meta name="description" content="([^"]*)"/)[1]);
  assert.ok(title.length <= 60, `title ${title.length} chars: ${title}`);
  assert.ok(description.length <= 155, `description ${description.length} chars: ${description}`);
  assert.ok(title.includes("Weil am Rhein") && description.includes("Weil am Rhein"));
  assert.ok(title.includes("Reparatur"), title);
  // German compounds are hyphenated: "Handy-, Tablet- … Reparatur", never "Handy Reparatur"
  assert.ok(description.includes("Handy-, Tablet-, Laptop- und PlayStation-Reparatur"), description);
  for (const w of [title, description, strings.de["home.h1"]]) assert.doesNotMatch(w, /\b(Handy|Tablet|Laptop|PlayStation),? (Tablet|Laptop|und|&|PlayStation|Reparatur)\b/, w);
  assert.ok(description.includes("nahe Basel"));

  const all = pageStrings(html);
  const own = [...Object.entries(strings.de), ...Object.entries(strings.en)].filter(([k]) => k.startsWith("home.")).map(([, v]) => v);
  assert.ok(own.length >= 30, `${own.length} home strings`);
  for (const w of [title, description, ...own, ...Object.values(all.de), ...Object.values(all.en)]) {
    assert.doesNotMatch(w, BANNED, w);
    assert.doesNotMatch(w, PAYMENT, `no payment claims: ${w}`);
    assert.doesNotMatch(w, /wenige Minuten|few minutes|\d+\s*(Min\.|Minuten|minutes?)\s+(von|bis|nach|from|to)\s+Basel/i, `use "nahe Basel": ${w}`);
    // "oft in 30 Minuten" is a phone claim only
    if (/30\s*Min/i.test(w)) assert.match(w, /Handy|phone/i, `30 minutes without phones: ${w}`);
  }
});

test("home texts are translatable", () => {
  const all = pageStrings(html);
  assert.deepEqual(Object.keys(all.de).sort(), Object.keys(all.en).sort());
  for (const key of Object.keys(strings.de).filter((k) => k.startsWith("home."))) assert.equal(typeof strings.en[key], "string", `en/${key}`);
  for (const key of Object.keys(strings.en).filter((k) => k.startsWith("home."))) assert.equal(typeof strings.de[key], "string", `de/${key}`);
  const keys = [...mainOf(html).matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.filter((k) => k.startsWith("home.")).length >= 20, "hero, tiles, steps and contact use home.* keys");
  assert.ok(keys.includes("page.promo") && keys.includes("faq.0.q"));
  // prices keep a no-break space before "€"
  const nbsp = (s) => s.replace(/ /g, " ");
  assert.equal(nbsp(all.de["page.promo"]), esc(site.promo.de));
  assert.equal(nbsp(all.en["page.promo"]), esc(site.promo.en));
  for (const value of [...Object.values(all.de), ...Object.values(all.en)]) assert.doesNotMatch(value, /\d €/, `price may break before €: ${value}`);
});

test("trust partial", () => {
  assert.ok(fs.existsSync(path.join(root, "src/partials/trust.html")));
  const trust = text(mainOf(html).match(/<ul class="trust">([\s\S]*?)<\/ul>/)[1]);
  // the stars are hidden from screen readers, so the rating is spelled out next to them
  assert.ok(trust.includes(`${ratingDe} von 5 Sternen · ${reviews.count} Google-Bewertungen`), trust);
  assert.ok(trust.includes("oft in 30 Min."), trust);
  assert.ok(trust.includes("nahe Basel"), trust);
});
