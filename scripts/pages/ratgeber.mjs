import fs from "node:fs";
import path from "node:path";
import { esc, page, readText, waLink } from "../html.mjs";
import { loadJson } from "../lib.mjs";
import { filler } from "./hub.mjs";
import { breadcrumbLd, crumbsHtml, sectionsHtml, str } from "./model.mjs";
import { fileOf } from "./simple.mjs";

// The Ratgeber: one article per src/content/ratgeber/<slug>.md (German only, spec §10) and the index /ratgeber/.
const DIR = "src/content/ratgeber";
const HUBS = "src/content/hubs";
const INDEX = "/ratgeber/";
// The articles in index order (spec §9). Every .md file must be listed here and every entry must have a file.
const ORDER = [
  "handy-wasserschaden-was-tun",
  "ps5-hdmi-anschluss-defekt",
  "akku-tauschen-oder-neues-handy",
  "laptop-wird-heiss-luefter-laut",
  "original-display-oder-nachbau",
  "handy-reparatur-fuer-kunden-aus-basel",
];
const KEYS = ["title", "description", "date", "related"];
const MAX_DESCRIPTION = 155;
const INDEX_TITLE = "Ratgeber: Tipps rund um die Reparatur";
const INDEX_DESCRIPTION =
  "Ratgeber von Mtech3land in Weil am Rhein, nahe Basel: Tipps bei Wasserschaden, schwachem Akku, Display-Wahl, PS5 ohne Bild und heißem Laptop.";

// "---\nkey: value\n…\n---\nbody" -> {meta: {title, description, date: "YYYY-MM-DD", related: [site paths]}, body}
export function parseFrontMatter(src) {
  const text = String(src).replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const m = text.match(/^---\n([\s\S]*?)\n---(?:\n([\s\S]*))?$/);
  if (!m) throw new Error("front matter: the file must start with a --- block");
  const raw = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const at = line.indexOf(":");
    const key = at > 0 ? line.slice(0, at).trim() : "";
    if (!KEYS.includes(key)) throw new Error(`front matter: unknown line "${line}"`);
    if (Object.hasOwn(raw, key)) throw new Error(`front matter: ${key} appears twice`);
    raw[key] = line.slice(at + 1).trim();
  }
  for (const key of KEYS) if (!raw[key]) throw new Error(`front matter: ${key} is missing`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) throw new Error(`front matter: date "${raw.date}" must be YYYY-MM-DD`);
  const related = raw.related.split(",").map((p) => p.trim()).filter(Boolean);
  for (const p of related) if (!/^\/([a-z0-9-]+\/)+$/.test(p)) throw new Error(`front matter: related "${p}" must be a site path like /name/`);
  return { meta: { title: raw.title, description: raw.description, date: raw.date, related }, body: (m[2] ?? "").trim() };
}

// ctx.file names the source in error messages
const fail = (ctx, msg) => {
  throw new Error(`${ctx.file ?? "markdown"}: ${msg}`);
};

function priceRef(ctx, ref, device, repair) {
  const d = ctx.devices.find((x) => x.slug === device);
  if (!d) fail(ctx, `bad price ref: ${ref} (unknown device)`);
  const r = d.repairs.find((x) => x.slug === repair);
  if (!r) fail(ctx, `bad price ref: ${ref} (unknown repair)`);
  if (r.price == null) fail(ctx, `bad price ref: ${ref} (no price in the data)`);
  return `${r.price} €`;
}

// {{price:<device>:<repair>}} "N €" from prices.json, {{maps}} the Google Maps link, everything else through the hub
// filler: {{hours}}, {{address}}, {{min.<repair>}}. Unknown names throw there.
function placeholder(ctx, key) {
  const ref = `{{${key}}}`;
  if (key.startsWith("price:")) {
    const m = key.match(/^price:([a-z0-9-]+):([a-z0-9-]+)$/);
    if (!m) fail(ctx, `bad price ref: ${ref}`);
    return priceRef(ctx, ref, m[1], m[2]);
  }
  if (key === "cta") fail(ctx, "{{cta}} must be a paragraph of its own");
  if (key === "maps") return ctx.site.mapsUrl;
  return filler(ctx.site, ctx.devices, ctx.file ?? "markdown")(`{${key}}`, "de");
}

// root-absolute site paths or https URLs; nothing else becomes an href. No backslash anywhere: browsers read
// "/\host" like "//host" (another site) and treat "\" as "/" in https URLs.
const SAFE_URL = /^(?:\/(?![/\\])[^\s\\]*|https:\/\/[^\s/\\]+\/[^\s\\]*)$/;

// Text is escaped first; placeholders, **bold** and [text](url) are applied to the escaped text.
function inline(ctx, text) {
  let html = esc(text).replace(/\{\{([^{}]*)\}\}/g, (_, key) => esc(placeholder(ctx, key.trim())));
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\(([^)\s]*)\)/g, (_, label, url) => {
    if (!SAFE_URL.test(url)) fail(ctx, `bad link: ${url}`);
    const external = url.startsWith("https://") ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${url}"${external}>${label}</a>`;
  });
  if (html.includes("**")) fail(ctx, `unclosed ** in "${text}"`);
  if (html.includes("](")) fail(ctx, `bad link in "${text}"`);
  return html;
}

function ctaHtml(ctx) {
  const { site, strings } = ctx;
  const tr = (tag, key, attrs = "") => `<${tag}${attrs} data-i18n="${key}">${esc(str(strings, "de", key))}</${tag}>`;
  return `<div class="cta-box">
  ${tr("p", "ratgeber.cta.text")}
  <a class="btn btn--wa" href="${esc(waLink(site, str(strings, "de", "wa.greeting")))}" target="_blank" rel="noopener"><svg class="ic" aria-hidden="true"><use href="#i-whatsapp"/></svg>${tr("span", "model.cta")}</a>
  <a class="btn btn--ghost" href="/#preise">${tr("span", "ratgeber.cta.prices")}</a>
</div>`;
}

const LISTS = [
  [/^- (.+)$/, "ul"],
  [/^\d+\. (.+)$/, "ol"],
];

function block(ctx, text) {
  if (text === "{{cta}}") return ctaHtml(ctx);
  const lines = text.split("\n").map((l) => l.trim());
  if (lines[0].startsWith("#")) {
    const m = lines[0].match(/^(#{2,3}) (.+)$/);
    if (!m) fail(ctx, `only ## and ### headings are allowed: ${lines[0]}`);
    if (lines.length > 1) fail(ctx, `a heading needs a blank line after it: ${lines[0]}`);
    const tag = `h${m[1].length}`;
    return `<${tag}>${inline(ctx, m[2])}</${tag}>`;
  }
  for (const [re, tag] of LISTS) {
    if (!re.test(lines[0])) continue;
    const items = lines.map((line) => {
      const m = line.match(re);
      if (!m) fail(ctx, `every line of a list must be an item: ${line}`);
      return `<li>${inline(ctx, m[1])}</li>`;
    });
    return `<${tag}>\n${items.join("\n")}\n</${tag}>`;
  }
  const stray = lines.slice(1).find((line) => LISTS.some(([re]) => re.test(line)) || line.startsWith("#"));
  if (stray) fail(ctx, `a list or heading needs a blank line before it: ${stray}`);
  return `<p>${inline(ctx, lines.join(" "))}</p>`;
}

// Blocks are separated by blank lines: ## / ### heading, "- " or "1. " list, {{cta}}, else a paragraph.
// ctx: {site, strings, devices, file?}
export function renderMarkdown(body, ctx) {
  return String(body)
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => block(ctx, b))
    .join("\n");
}

function loadArticles(root) {
  const files = fs.readdirSync(path.join(root, DIR)).filter((f) => f.endsWith(".md"));
  const listed = ORDER.map((slug) => `${slug}.md`);
  for (const file of files.sort()) if (!listed.includes(file)) throw new Error(`${DIR}/${file}: add it to ORDER in ratgeber.mjs`);
  for (const file of listed) if (!files.includes(file)) throw new Error(`${DIR}/${file}: listed in ORDER but missing`);
  return listed.map((file) => {
    const slug = file.slice(0, -".md".length);
    const where = `${DIR}/${file}`;
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`${where}: file name must be a slug`);
    let parsed;
    try {
      parsed = parseFrontMatter(readText(path.join(root, DIR, file)));
    } catch (e) {
      throw new Error(`${where}: ${e.message}`);
    }
    if (parsed.meta.description.length > MAX_DESCRIPTION) {
      throw new Error(`${where}: description has ${parsed.meta.description.length} chars (max ${MAX_DESCRIPTION})`);
    }
    return { where, path: `${INDEX}${slug}/`, ...parsed };
  });
}

// Link texts for related paths: hub and brand pages (DE/EN), device pages and articles (one name for both languages).
function pageLabels(root, devices, articles) {
  const labels = new Map();
  for (const file of fs.readdirSync(path.join(root, HUBS)).filter((f) => f.endsWith(".json")).sort()) {
    const hub = loadJson(root, `${HUBS}/${file}`);
    labels.set(hub.path, hub.label);
  }
  for (const d of devices) labels.set(d.url, { de: d.name, en: d.name });
  for (const a of articles) labels.set(a.path, { de: a.meta.title, en: a.meta.title });
  return labels;
}

// ctx: {root, site, strings, partials, versions, devices} -> [{rec: PageRec, html}]
export function ratgeberPages(ctx) {
  const { root, site, strings, devices } = ctx;
  const base = { site, strings, partials: ctx.partials, versions: ctx.versions };
  const tx = (key) => str(strings, "de", key);
  // <tag attrs data-i18n="key">German text</tag>; the EN toggle swaps the text from the dictionary
  const tr = (tag, key, attrs = "") => `<${tag}${attrs} data-i18n="${key}">${esc(tx(key))}</${tag}>`;
  const articles = loadArticles(root);
  const labels = pageLabels(root, devices, articles);
  const home = { name: tx("crumbs.home"), url: "/", key: "crumbs.home" };
  const guides = { name: tx("nav.guides"), url: INDEX, key: "nav.guides" };

  const pages = articles.map((a) => {
    const { meta } = a;
    const body = renderMarkdown(a.body, { site, strings, devices, file: a.where });

    // related link texts are this page's own strings, so hub names switch with the EN toggle
    const own = { de: {}, en: {} };
    const related = meta.related.map((p, i) => {
      const label = labels.get(p);
      if (!label || p === a.path) throw new Error(`${a.where}: related "${p}" is not another page`);
      const key = `page.rel.${i}`;
      own.de[key] = esc(label.de);
      own.en[key] = esc(label.en);
      return `<li><a href="${esc(p)}" data-i18n="${key}">${own.de[key]}</a></li>`;
    });

    const [y, m, d] = meta.date.split("-");
    const article = `${crumbsHtml([home, guides], { name: meta.title }, strings)}
<h1 class="h1">${esc(meta.title)}</h1>
<p class="prose__note">${tr("span", "ratgeber.published")} <time datetime="${meta.date}">${d}.${m}.${y}</time></p>
${tr("p", "ratgeber.de_only", ' class="lang-note"')}
<div class="prose" lang="de">
${body}
</div>`;
    const more = `${tr("h2", "ratgeber.related")}
<ul class="hubs">
  ${related.join("\n  ")}
</ul>
<p><a class="btn btn--ghost" href="${INDEX}">${tr("span", "ratgeber.all")}</a></p>`;

    const title = `${meta.title} | ${site.name}`;
    const jsonld = [
      breadcrumbLd(site, [home, guides, { name: meta.title, url: a.path }]),
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: meta.title,
        description: meta.description,
        datePublished: meta.date,
        author: { "@type": "Organization", name: site.name },
        publisher: { "@id": `${site.origin}/#business` },
      },
    ];
    return {
      rec: { path: a.path, file: fileOf(a.path), indexable: true, title, description: meta.description, h1: meta.title },
      html: page({ ...base, path: a.path, title, description: meta.description, body: sectionsHtml([article, more], "article"), jsonld, pageStrings: own }),
    };
  });

  // the index: chrome translated, article titles and descriptions stay German like the articles (lang="de" for the EN view)
  const list = articles.map(
    (a) => `<li class="card guide" lang="de">
  <h2 class="h3"><a href="${esc(a.path)}">${esc(a.meta.title)}</a></h2>
  <p>${esc(a.meta.description)}</p>
</li>`,
  );
  const index = `${crumbsHtml([home], { name: guides.name, key: guides.key }, strings)}
${tr("h1", "ratgeber.h1", ' class="h1"')}
${tr("p", "ratgeber.lede", ' class="lede"')}
<ul class="guides">
${list.join("\n")}
</ul>`;
  const title = `${INDEX_TITLE} | ${site.name}`;
  pages.push({
    rec: { path: INDEX, file: fileOf(INDEX), indexable: true, title, description: INDEX_DESCRIPTION, h1: tx("ratgeber.h1") },
    html: page({
      ...base,
      path: INDEX,
      title,
      description: INDEX_DESCRIPTION,
      body: sectionsHtml([index], "hub"),
      jsonld: [breadcrumbLd(site, [home, { name: guides.name, url: INDEX }])],
    }),
  });
  return pages;
}
