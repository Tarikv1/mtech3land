// Legal points checked 2026-10-21 (Impressum § 5 DDG, OS platform shut down 20.07.2025, § 36 VSBG,
// § 5b Abs. 3 UWG review note, guarantee advertising, DSGVO / § 25 TDDDG transparency).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let out;
before(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "mt-legal-"));
  build({ root, outDir: out, quiet: true });
});
after(() => fs.rmSync(out, { recursive: true, force: true }));

const page = (rel) => fs.readFileSync(path.join(out, rel), "utf8");
const textOf = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const htmlFiles = (dir = out, rel = "") =>
  fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? htmlFiles(dir, r) : r.endsWith(".html") ? [r] : [];
  });

test("impressum has the mandatory details and no dead OS link", () => {
  const html = page("impressum/index.html");
  const t = textOf(html);
  for (const must of ["Ayşegül Sungur Nur", "Einzelunternehmen", "Hauptstraße 177", "79576 Weil am Rhein", "+49 1575 3815179", "mtech3land@gmail.com", "DE461413984", "§ 18 Abs. 2 MStV", "Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle"]) {
    assert.ok(t.includes(must), `Impressum lacks: ${must}`);
  }
  assert.ok(!html.includes("ec.europa.eu/consumers/odr"), "the OS platform was shut down on 20.07.2025");
  assert.ok(!/Online-Streitbeilegung|OS-Plattform/.test(t), "no reference to the OS platform");
});

test("impressum says the shop is independent of the brands it repairs", () => {
  const t = textOf(page("impressum/index.html"));
  assert.ok(t.includes("kein autorisierter Service-Partner"), "independence note");
  for (const mark of ["Apple", "Samsung", "PlayStation"]) assert.ok(t.includes(mark), mark);
});

test("datenschutz covers every data flow of the site", () => {
  const html = page("datenschutz/index.html");
  const t = textOf(html);
  for (const must of [
    "GitHub", "EU-US Data Privacy Framework", "Art. 45 DSGVO",
    "Cloudflare", "DNS",
    "§ 25 Abs. 2 Nr. 2 TDDDG",
    "Google Maps", "Einwilligung", "Art. 7 Abs. 3 DSGVO",
    "WhatsApp", "Meta Platforms Ireland",
    "E-Mail",
    "Google-Bewertungen",
    "Art. 15", "Art. 16", "Art. 17", "Art. 18", "Art. 20", "Art. 21",
    "Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg",
    "Wir selbst setzen keine Cookies",
    "kann Google Cookies",
    "Buchungsbelege 8 Jahre",
  ]) {
    assert.ok(t.includes(must), `Datenschutz lacks: ${must}`);
  }
  assert.ok(!/\bCDN\b/.test(t), "Cloudflare only resolves DNS; no CDN claim");
  assert.ok(!/Rechnungen[^.,;]*10 Jahre/.test(t), "invoices: 8 years since 1.1.2025 (BEG IV)");
});

test("the language choice is stored only after the visitor switches language", () => {
  const code = fs.readFileSync(path.join(root, "assets/js/i18n.js"), "utf8");
  const stored = {};
  const on = {};
  const toggle = { addEventListener: (type, fn) => (on[`toggle:${type}`] = fn) };
  const window = { MT_STR: { de: {}, en: {} }, dispatchEvent: () => {} };
  vm.runInNewContext(code, {
    window,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    localStorage: { getItem: (k) => stored[k] ?? null, setItem: (k, v) => (stored[k] = v) },
    document: {
      querySelectorAll: () => [],
      addEventListener: (type, fn) => (on[type] = fn),
      getElementById: (id) => (id === "langToggle" ? toggle : null),
      documentElement: { setAttribute: () => {} },
    },
  });
  on.DOMContentLoaded();
  assert.deepEqual(stored, {}, "a first visit stores nothing (§ 25 Abs. 2 Nr. 2 TDDDG covers only what the visitor asked for)");
  on["toggle:click"]();
  assert.equal(stored.mt_lang, "en");
  assert.equal(window.MT.lang, "en");
});

test("the documented browser-storage key is the one the site uses", () => {
  const js = fs.readFileSync(path.join(root, "assets/js/i18n.js"), "utf8");
  const keys = [...js.matchAll(/localStorage\.(?:setItem|getItem)\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 0, "i18n.js uses localStorage");
  const t = textOf(page("datenschutz/index.html"));
  for (const k of new Set(keys)) assert.ok(t.includes(k), `Datenschutz must name the stored key ${k}`);
  for (const f of fs.readdirSync(path.join(root, "assets/js"))) {
    const src = fs.readFileSync(path.join(root, "assets/js", f), "utf8");
    assert.ok(!/document\.cookie|sessionStorage|indexedDB/.test(src), `${f}: storage the Datenschutz does not describe`);
  }
});

test("reviews come with a visible authenticity note", () => {
  const html = page("index.html");
  const start = html.indexOf('id="bewertungen"');
  assert.ok(start > 0);
  const section = html.slice(start, html.indexOf("</section>", start));
  assert.ok(textOf(section).includes("Wir prüfen nicht, ob die Verfasser"), "§ 5b Abs. 3 UWG note next to the reviews");
  assert.ok(!/Kundschaft/.test(textOf(section)), "reviews are not called customer voices without verification");
  const trust = html.slice(html.indexOf('class="trust'), html.indexOf("</ul>", html.indexOf('class="trust')));
  assert.ok(trust.includes('href="#bewertungen"'), "the rating in the trust strip links to the reviews and their note");
});

test("no guarantee claims anywhere", () => {
  for (const f of htmlFiles()) {
    const t = textOf(page(f));
    assert.ok(!/Garantie|guarantee|warranty/i.test(t), `${f}: guarantee claim without published terms`);
  }
});

test("every page footer carries the trademark note", () => {
  const files = htmlFiles().filter((f) => page(f).includes("<footer"));
  assert.ok(files.length > 200);
  for (const f of files) assert.ok(page(f).includes("unabhängiger Reparaturbetrieb"), `${f}: footer trademark note`);
});
