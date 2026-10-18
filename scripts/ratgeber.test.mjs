import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, PENDING } from "./build.mjs";
import { esc } from "./html.mjs";
import { buildDevices, loadJson } from "./lib.mjs";
import { parseFrontMatter, renderMarkdown } from "./pages/ratgeber.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = loadJson(root, "src/site.json");
const strings = loadJson(root, "src/strings.json");
const devices = buildDevices(loadJson(root, "assets/data/prices.json"), loadJson(root, "src/categories.json"), strings, loadJson(root, "src/model-order.json"));
const ctx = { site, strings, devices };

// spec §9, in the spec's order
const SLUGS = [
  "handy-wasserschaden-was-tun",
  "ps5-hdmi-anschluss-defekt",
  "akku-tauschen-oder-neues-handy",
  "laptop-wird-heiss-luefter-laut",
  "original-display-oder-nachbau",
  "handy-reparatur-fuer-kunden-aus-basel",
];
const DIR = path.join(root, "src/content/ratgeber");
const source = (slug) => fs.readFileSync(path.join(DIR, `${slug}.md`), "utf8");

// pages an article may count as internal links: hubs, brand and service pages, device pages
const hubPaths = new Set(
  fs
    .readdirSync(path.join(root, "src/content/hubs"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => loadJson(root, `src/content/hubs/${f}`).path),
);
const devicePaths = new Set(devices.map((d) => d.url));

let out;
let result;
before(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "mt-ratgeber-"));
  result = build({ root, outDir: out, quiet: true });
});
after(() => fs.rmSync(out, { recursive: true, force: true }));
const html = (urlPath) => fs.readFileSync(path.join(out, urlPath.slice(1), "index.html"), "utf8");

const ld = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const withoutCta = (h) => h.replace(/<div class="cta-box">[\s\S]*?<\/div>/g, " ");
const words = (h) =>
  h
    .replace(/<[^>]*>/g, " ")
    .replace(/&[#a-z0-9]+;/gi, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

test("markdown renderer", () => {
  assert.equal(renderMarkdown("## A\n\nText **b** [l](/x/)", ctx), '<h2>A</h2>\n<p>Text <strong>b</strong> <a href="/x/">l</a></p>');
});

test("escapes before markup", () => {
  assert.ok(renderMarkdown("a < b", ctx).includes("a &lt; b"));
  assert.equal(renderMarkdown('**<i>"x"</i>**', ctx), "<p><strong>&lt;i&gt;&quot;x&quot;&lt;/i&gt;</strong></p>");
});

test("headings, lists, line breaks and external links", () => {
  assert.equal(
    renderMarkdown("### T\n\n- a\n- **b**\n\n1. eins\n2. zwei\n\n[BAZG](https://www.bazg.admin.ch/)", ctx),
    '<h3>T</h3>\n<ul>\n<li>a</li>\n<li><strong>b</strong></li>\n</ul>\n<ol>\n<li>eins</li>\n<li>zwei</li>\n</ol>\n<p><a href="https://www.bazg.admin.ch/" target="_blank" rel="noopener">BAZG</a></p>',
  );
  assert.equal(renderMarkdown("eins\nzwei\r\n\r\n\r\ndrei", ctx), "<p>eins zwei</p>\n<p>drei</p>");
});

test("unsafe or broken markup is refused", () => {
  assert.throws(() => renderMarkdown("[x](javascript:alert(1))", ctx), /bad link/);
  assert.throws(() => renderMarkdown("[x](//evil.example/)", ctx), /bad link/);
  assert.throws(() => renderMarkdown("[x](http://example.com/)", ctx), /bad link/);
  // browsers read "/\host" like "//host": a protocol-relative link to another site
  assert.throws(() => renderMarkdown("[x](/\\evil.example/)", ctx), /bad link/);
  assert.throws(() => renderMarkdown("[x](https://good.example\\@evil.example/)", ctx), /bad link/);
  assert.equal(renderMarkdown("[x](/a/b/)", ctx), '<p><a href="/a/b/">x</a></p>');
  assert.throws(() => renderMarkdown("**offen", ctx), /\*\*/);
  assert.throws(() => renderMarkdown("{{nope}}", ctx), /unknown placeholder/);
  assert.throws(() => renderMarkdown("Text {{cta}}", ctx), /cta/);
  assert.throws(() => renderMarkdown("Liste:\n- a", ctx), /blank line/);
  assert.throws(() => renderMarkdown("# H1", ctx), /heading/);
});

test("price refs resolve from data", () => {
  const priced = devices.find((d) => d.slug === "iphone-13-pro").repairs.find((r) => r.slug === "display-original-irp");
  assert.ok(priced.price != null, "fixture: iphone-13-pro has a priced original display");
  assert.equal(renderMarkdown("{{price:iphone-13-pro:display-original-irp}}", ctx), `<p>${priced.price} €</p>`);
  assert.throws(() => renderMarkdown("{{price:nope:display}}", ctx), /bad price ref/);
  assert.throws(() => renderMarkdown("{{price:iphone-13-pro:nope}}", ctx), /bad price ref/);
  const empty = devices.find((d) => d.slug === "iphone-13-pro").repairs.find((r) => r.slug === "display");
  assert.equal(empty.price, null, "fixture: iphone-13-pro has an unpriced standard display");
  assert.throws(() => renderMarkdown("{{price:iphone-13-pro:display}}", ctx), /bad price ref/);
  assert.throws(() => renderMarkdown("{{price:iphone-13-pro}}", ctx), /bad price ref/);
});

test("site placeholders come from site.json", () => {
  const hours = renderMarkdown("{{hours}}", ctx);
  for (const h of site.hours) assert.ok(hours.includes(`${h.days.de} ${h.open}–${h.close}`), hours);
  assert.equal(renderMarkdown("{{address}}", ctx), `<p>${esc(`${site.street}, ${site.zip} ${site.city}`)}</p>`);
  assert.equal(renderMarkdown("[Maps]({{maps}})", ctx), `<p><a href="${esc(site.mapsUrl)}" target="_blank" rel="noopener">Maps</a></p>`);
});

test("cta block: WhatsApp and price list", () => {
  const cta = renderMarkdown("{{cta}}", ctx);
  assert.match(cta, /^<div class="cta-box">/);
  assert.ok(cta.includes(`href="https://wa.me/${site.wa}?text=`), cta);
  assert.ok(cta.includes('href="/#preise"'), cta);
  for (const key of ["ratgeber.cta.text", "model.cta", "ratgeber.cta.prices"]) assert.ok(cta.includes(`data-i18n="${key}"`), key);
});

test("front matter", () => {
  const src = "---\r\ntitle: T: mit Doppelpunkt\r\ndescription: D\r\ndate: 2026-10-17\r\nrelated: /a/, /b/c/\r\n---\r\n\r\nBody\r\n";
  assert.deepEqual(parseFrontMatter(src), {
    meta: { title: "T: mit Doppelpunkt", description: "D", date: "2026-10-17", related: ["/a/", "/b/c/"] },
    body: "Body",
  });
  assert.throws(() => parseFrontMatter("title: T\n\nBody"), /front matter/);
  assert.throws(() => parseFrontMatter("---\ntitle: T\ndescription: D\ndate: 17.10.2026\nrelated: /a/\n---\nB"), /date/);
  assert.throws(() => parseFrontMatter("---\ntitle: T\ndescription: D\ndate: 2026-10-17\n---\nB"), /related/);
  assert.throws(() => parseFrontMatter("---\ntitle: T\ndescription: D\ndate: 2026-10-17\nrelated: a/\n---\nB"), /related/);
});

test("six articles, word count, links", () => {
  assert.deepEqual(result.errors, []);
  const built = result.pages.filter((p) => p.path.startsWith("/ratgeber/") && p.path !== "/ratgeber/");
  assert.deepEqual(built.map((p) => p.path).sort(), SLUGS.map((s) => `/ratgeber/${s}/`).sort());
  for (const slug of SLUGS) {
    const url = `/ratgeber/${slug}/`;
    const { meta, body } = parseFrontMatter(source(slug));
    const rendered = renderMarkdown(body, ctx);
    const h = html(url);
    const rec = built.find((p) => p.path === url);

    assert.equal(meta.date, "2026-10-17", slug);
    assert.equal(rec.indexable, true, slug);
    assert.equal(rec.h1, meta.title, slug);
    assert.equal(rec.title, `${meta.title} | ${site.name}`, slug);
    assert.equal(rec.description, meta.description, slug);
    assert.ok(meta.description.length <= 155, `${slug}: description has ${meta.description.length} chars`);
    assert.ok(h.includes(`<div class="prose" lang="de">\n${rendered}\n</div>`), `${slug}: page carries the rendered article, marked German`);

    const count = words(withoutCta(rendered));
    assert.ok(count >= 600 && count <= 1000, `${slug}: ${count} words`);
    assert.equal([...rendered.matchAll(/<div class="cta-box">/g)].length, 1, `${slug}: one CTA box`);

    const links = new Set([...withoutCta(rendered).matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]).filter((u) => !u.startsWith("/ratgeber/")));
    for (const u of links) assert.ok(hubPaths.has(u) || devicePaths.has(u), `${slug}: ${u} is not a hub or device page`);
    assert.ok(links.size >= 2, `${slug}: ${links.size} internal links to hub/device pages`);

    assert.ok(meta.related.length >= 2, `${slug}: related`);
    for (const p of meta.related) assert.ok(h.includes(`href="${p}"`), `${slug}: related ${p}`);

    assert.ok(h.includes('<a href="/ratgeber/" data-i18n="nav.guides">'), `${slug}: crumb to the index`);
    assert.ok(h.includes(`<time datetime="${meta.date}">`), `${slug}: date line`);
    assert.ok(h.includes('data-i18n="ratgeber.de_only"'), `${slug}: EN notice`);

    const blocks = ld(h);
    assert.deepEqual(
      blocks.find((b) => b["@type"] === "Article"),
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: meta.title,
        description: meta.description,
        datePublished: "2026-10-17",
        author: { "@type": "Organization", name: "Mtech3land" },
        publisher: { "@id": "https://mtech3land.com/#business" },
      },
      slug,
    );
    const crumbs = blocks.find((b) => b["@type"] === "BreadcrumbList");
    assert.deepEqual(
      crumbs.itemListElement.map((i) => [i.position, i.name, i.item]),
      [
        [1, "Start", "https://mtech3land.com/"],
        [2, "Ratgeber", "https://mtech3land.com/ratgeber/"],
        [3, meta.title, `https://mtech3land.com${url}`],
      ],
      slug,
    );
  }
});

test("Ratgeber index lists every article", () => {
  const rec = result.pages.find((p) => p.path === "/ratgeber/");
  assert.ok(rec, "index page is built");
  assert.equal(rec.indexable, true);
  assert.ok(rec.title.length <= 60, rec.title);
  assert.ok(rec.description.length <= 155, rec.description);
  const h = html("/ratgeber/");
  // one card per article, in the spec's order, German text marked lang="de" for the EN view
  const cards = [...h.matchAll(/<li class="card guide" lang="de">\s*<h2 class="h3"><a href="\/ratgeber\/([a-z0-9-]+)\/">([^<]*)<\/a><\/h2>\s*<p>([^<]*)<\/p>/g)];
  assert.deepEqual(
    cards.map((m) => m[1]),
    SLUGS,
  );
  for (const [, slug, title, description] of cards) {
    const { meta } = parseFrontMatter(source(slug));
    assert.equal(title, esc(meta.title), `${slug}: title`);
    assert.equal(description, esc(meta.description), `${slug}: description`);
  }
  for (const key of ["ratgeber.h1", "ratgeber.lede"]) assert.ok(h.includes(`data-i18n="${key}"`), key);
  assert.ok(ld(h).some((b) => b["@type"] === "BreadcrumbList"));
  const sitemap = fs.readFileSync(path.join(out, "sitemap.xml"), "utf8");
  for (const p of ["/ratgeber/", ...SLUGS.map((s) => `/ratgeber/${s}/`)]) assert.ok(sitemap.includes(`<loc>https://mtech3land.com${p}</loc>`), p);
});

test("Ratgeber strings exist in German and English", () => {
  for (const key of ["ratgeber.h1", "ratgeber.lede", "ratgeber.de_only", "ratgeber.published", "ratgeber.related", "ratgeber.all", "ratgeber.cta.text", "ratgeber.cta.prices"]) {
    for (const lang of ["de", "en"]) assert.ok(typeof strings[lang][key] === "string" && strings[lang][key].trim(), `${lang}/${key}`);
  }
  assert.match(strings.en["ratgeber.de_only"], /German/);
  // the notice is for English readers: hidden while the page is German
  assert.match(fs.readFileSync(path.join(root, "assets/css/styles.css"), "utf8"), /html\[lang="de"\] \.lang-note\{display:none\}/);
});

const BANNED = /\b(beste[nrms]?|günstigste[nrms]?|billigste[nrms]?|garantiert)\b|\d+\s*(Jahre?|Monate?|Tage?)\s+Garantie/i;
const PAYMENT = /\b(TWINT|PayPal|Kreditkarte|EC-Karte|Girocard|Barzahlung|bar bezahlen|Kartenzahlung|Apple Pay|Google Pay)\b/i;
const TRAVEL = /wenige Minuten|few minutes|Minuten (?:zu Fuß|entfernt|mit dem|mit der|von|bis|ab)|Fahrzeit|Gehminuten|Fahrminuten|\b\d+\s?(?:m|km|Meter|Kilometer)\b/i;

test("article copy follows the content rules", () => {
  for (const slug of SLUGS) {
    const src = source(slug);
    const prose = src.replace(/\{\{[^{}]*\}\}/g, " ");
    assert.doesNotMatch(prose, /\d+\s?(?:€|Euro\b|EUR\b)/, `${slug}: prices only via {{price:…}}`);
    assert.doesNotMatch(src, /\b(?:etwa|ca\.|circa|rund|ungefähr)\s+\{\{price:/i, `${slug}: a placeholder price is exact, no hedge before it`);
    assert.doesNotMatch(src, TRAVEL, `${slug}: no travel times or distances; use "nahe Basel" / "direkt an der Grenze zu Basel"`);
    assert.doesNotMatch(src, BANNED, `${slug}: no superlatives or warranty durations`);
    assert.doesNotMatch(src, PAYMENT, `${slug}: no payment methods`);
    assert.doesNotMatch(src, /immer gerettet|100\s?%|hundertprozentig/i, `${slug}: no guarantees`);
    assert.equal([...src.matchAll(/\{\{cta\}\}/g)].length, 1, `${slug}: one {{cta}}`);
  }
});

test("basel article makes no customs claims", () => {
  const src = source("handy-reparatur-fuer-kunden-aus-basel");
  assert.ok(src.includes("https://www.bazg.admin.ch/"));
  assert.doesNotMatch(src, /\bCHF\s?\d|Freigrenze|zollfrei|MWST-frei|mehrwertsteuerfrei/i);
  assert.ok(src.includes("Die Tram 8 fährt von Basel nach Weil am Rhein"));
  assert.ok(src.includes("direkt an der Grenze zu Basel"));
  for (const p of ["{{maps}}", "{{hours}}", "{{address}}"]) assert.ok(src.includes(p), p);
  // parking: only a pointer to Google Maps, no claim of our own
  const parking = src.split(/(?<=[.!?])\s+/).filter((s) => /park/i.test(s));
  assert.equal(parking.length, 1, parking.join(" | "));
  assert.match(parking[0], /Google Maps/);
  const h = html("/ratgeber/handy-reparatur-fuer-kunden-aus-basel/");
  assert.ok(h.includes(`href="${esc(site.mapsUrl)}"`));
  assert.ok(h.includes('href="https://www.bazg.admin.ch/"'));
});

test("pending list empty", () => {
  assert.deepEqual(PENDING, []);
});
