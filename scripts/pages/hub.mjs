import fs from "node:fs";
import path from "node:path";
import { esc, loadPartials, page, render, waLink } from "../html.mjs";
import { loadJson } from "../lib.mjs";
import { AREA, breadcrumbLd, contactHtml, crumbsHtml, sectionsHtml, str } from "./model.mjs";
import { fileOf } from "./simple.mjs";

// One page per src/content/hubs/<id>.json: the service hubs, the brand pages and the service pages.
const DIR = "src/content/hubs";
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 155;
const LANGS = ["de", "en"];

const isText = (v) => typeof v === "string" && v.trim() !== "";
const isPair = (v) => isText(v?.de) && isText(v?.en);

// Throws "<file>: <problem>" for the first field that breaks the hub shape. ctx: {categories, paths: Set of all hub paths}
export function checkHub(hub, file, ctx) {
  const fail = (msg) => {
    throw new Error(`${file}: ${msg}`);
  };
  const id = path.basename(file, ".json");
  if (hub.id !== id) fail(`id "${hub.id}" must equal the file name "${id}"`);
  if (typeof hub.path !== "string" || !/^\/[a-z0-9-]+\/$/.test(hub.path)) fail(`path "${hub.path}" must look like /name/`);
  if (!isPair(hub.label)) fail("label needs de and en");
  if (!isText(hub.title?.de)) fail("title.de is missing");
  if (!isText(hub.description?.de)) fail("description.de is missing");
  if (!isPair(hub.h1)) fail("h1 needs de and en");
  for (const lang of LANGS) {
    const list = hub.intro?.[lang];
    if (!Array.isArray(list) || list.length !== 2 || !list.every(isText)) fail(`intro.${lang} needs 2 paragraphs`);
  }
  if (!Array.isArray(hub.services) || hub.services.length < 3 || hub.services.length > 6 || !hub.services.every(isPair)) {
    fail("services need 3 to 6 entries with de and en");
  }
  if (!Array.isArray(hub.faq) || hub.faq.length !== 4 || !hub.faq.every((f) => isPair(f?.q) && isPair(f?.a))) {
    fail("faq needs 4 entries with q and a in de and en");
  }
  if (hub.picker !== null) {
    const { type, brand } = hub.picker ?? {};
    if (!Object.hasOwn(ctx.categories.types, type ?? "")) fail(`picker type "${type}" is not a type in categories.json`);
    if (brand !== null && !Object.hasOwn(ctx.categories.brands, brand ?? "")) fail(`picker brand "${brand}" is not a brand in categories.json`);
  }
  if (hub.models !== null) {
    const { parents, extra } = hub.models ?? {};
    if (!Array.isArray(parents) || !parents.length) fail("models.parents is empty");
    for (const p of parents) if (!Object.hasOwn(ctx.categories.parents, p)) fail(`models parent "${p}" is not a parent in categories.json`);
    if (!Array.isArray(extra) || !extra.every((x) => isPair(x?.label) && typeof x.url === "string" && x.url.startsWith("/"))) {
      fail("models.extra needs entries {label: {de, en}, url}");
    }
  }
  if (!Array.isArray(hub.related) || !hub.related.length) fail("related is empty");
  for (const p of hub.related) if (p === hub.path || !ctx.paths.has(p)) fail(`related "${p}" is not another hub`);
}

// Lowest price of a repair over the devices, original variants included: the "ab N €" of a hub.
function minPrice(devices, slug) {
  const slugs = [slug, `${slug}-original`, `${slug}-original-irp`];
  let best = null;
  for (const d of devices) {
    for (const r of d.repairs) if (r.price != null && slugs.includes(r.slug) && (best === null || r.price < best)) best = r.price;
  }
  return best;
}

// Hub copy placeholders, all filled from the data files so the text never drifts:
// {min.<repair slug>} lowest price over the hub's devices, {hours} opening hours, {address} street, zip and city.
// The home page fills its copy with it too (home.mjs).
export function filler(site, devices, file) {
  const hours = (lang) => site.hours.map((h) => `${h.days[lang]} ${h.open}–${h.close}`).join(", ");
  return (text, lang) =>
    text.replace(/\{([^{}]*)\}/g, (match, key) => {
      if (key === "hours") return hours(lang);
      if (key === "address") return `${site.street}, ${site.zip} ${site.city}`;
      const slug = key.match(/^min\.([a-z0-9-]+)$/)?.[1];
      if (!slug) throw new Error(`${file}: unknown placeholder ${match}`);
      const price = minPrice(devices, slug);
      if (price === null) throw new Error(`${file}: no price for ${match}`);
      return String(price);
    });
}

function loadHubs(root, categories) {
  const files = fs.readdirSync(path.join(root, DIR)).filter((f) => f.endsWith(".json")).sort();
  const hubs = files.map((file) => ({ file, hub: loadJson(root, `${DIR}/${file}`) }));
  const paths = new Set(hubs.map(({ hub }) => hub.path));
  if (paths.size !== hubs.length) throw new Error(`${DIR}: two hubs share a path`);
  for (const { file, hub } of hubs) checkHub(hub, file, { categories, paths });
  return hubs;
}

// ctx: {root, site, strings, partials, versions, devices, categories} -> [{rec: PageRec, html}]
export function hubPages(ctx) {
  const { root, site, strings, devices, categories } = ctx;
  const partials = ctx.partials ?? loadPartials(root);
  const base = { site, strings, partials, versions: ctx.versions };
  const tx = (key) => str(strings, "de", key);
  // shared UI text from strings.json: <tag attrs data-i18n="key">German text</tag>
  const tr = (tag, key, attrs = "") => `<${tag}${attrs} data-i18n="${key}">${esc(tx(key))}</${tag}>`;
  const hubs = loadHubs(root, categories);
  const byPath = new Map(hubs.map(({ hub }) => [hub.path, hub]));

  return hubs.map(({ file, hub }) => {
    const scope = hub.models ? devices.filter((d) => hub.models.parents.includes(d.parentId)) : devices;
    const fill = filler(site, scope, file);
    const title = fill(hub.title.de, "de");
    const description = fill(hub.description.de, "de");
    if (title.length > MAX_TITLE) throw new Error(`${file}: title has ${title.length} chars (max ${MAX_TITLE}): ${title}`);
    if (description.length > MAX_DESCRIPTION) throw new Error(`${file}: description has ${description.length} chars (max ${MAX_DESCRIPTION})`);

    // the page's own text in both languages; values are HTML-escaped like every dictionary entry (i18n.js sets innerHTML)
    const own = { de: {}, en: {} };
    const put = (key, pair) => {
      for (const lang of LANGS) own[lang][key] = esc(fill(pair[lang], lang));
    };
    // <tag attrs data-i18n="key">German text</tag> for a key of this page
    const pt = (tag, key, attrs = "") => `<${tag}${attrs} data-i18n="${key}">${own.de[key]}</${tag}>`;

    const typeHub = hub.picker ? categories.types[hub.picker.type].hub : null;
    const parent = typeHub && typeHub !== hub.path ? (byPath.get(typeHub) ?? null) : null;
    put("page.label", hub.label);
    put("page.h1", hub.h1);
    if (parent) put("page.parent", parent.label);
    hub.intro.de.forEach((_, i) => put(`page.intro.${i}`, { de: hub.intro.de[i], en: hub.intro.en[i] }));
    hub.services.forEach((s, i) => put(`page.svc.${i}`, s));
    hub.faq.forEach((f, i) => {
      put(`faq.${i}.q`, f.q);
      put(`faq.${i}.a`, f.a);
    });
    hub.related.forEach((p, i) => put(`page.rel.${i}`, byPath.get(p).label));
    (hub.models?.extra ?? []).forEach((x, i) => put(`page.extra.${i}`, x.label));

    const trail = [
      { name: tx("crumbs.home"), url: "/", key: "crumbs.home" },
      ...(parent ? [{ name: parent.label.de, url: parent.path, key: "page.parent" }] : []),
    ];
    const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
    const intro = `${crumbsHtml(trail, { name: hub.label.de, key: "page.label" }, strings)}
${pt("h1", "page.h1", ' class="h1"')}
${pt("p", "page.intro.0", ' class="lede"')}
${pt("p", "page.intro.1")}
${tr("h2", "hub.services", ' class="h3"')}
<ul class="checks">
  ${hub.services.map((_, i) => pt("li", `page.svc.${i}`)).join("\n  ")}
</ul>
<div class="hub__cta">
  <a class="btn btn--wa" href="${esc(waLink(site, tx("wa.greeting")))}" target="_blank" rel="noopener">${icon("whatsapp")}${tr("span", "model.cta")}</a>
  <a class="btn btn--ghost" href="${esc(site.phoneHref)}">${icon("phone")}${tr("span", "cta.call")}</a>
</div>`;

    const picker = hub.picker
      ? `${tr("h2", "hub.picker")}
${render(partials.picker, { site, t: strings.de, picker: { idAttr: "", type: hub.picker.type, brand: hub.picker.brand ?? "" } }, partials)}`
      : "";

    let models = "";
    if (hub.models) {
      // parents in the order the hub lists them, devices newest first (buildDevices order), grouped by brand
      const brands = new Map();
      for (const d of hub.models.parents.flatMap((p) => scope.filter((x) => x.parentId === p))) brands.set(d.brand, [...(brands.get(d.brand) ?? []), d]);
      if (!brands.size) throw new Error(`${file}: models.parents list no device`);
      const groups = [...brands].map(([brand, list]) => ({
        heading: tr("h3", `brand.${brand}`),
        links: list.map((d) => `<li><a href="${esc(d.url)}">${esc(d.name)}</a></li>`),
      }));
      if (hub.models.extra.length) {
        groups.push({ heading: tr("h3", "hub.models.extra"), links: hub.models.extra.map((x, i) => `<li>${pt("a", `page.extra.${i}`, ` href="${esc(x.url)}"`)}</li>`) });
      }
      // one group needs no heading (a brand page)
      const block = (g) => `  <div>
    ${groups.length > 1 ? `${g.heading}\n    ` : ""}<ul>
      ${g.links.join("\n      ")}
    </ul>
  </div>`;
      models = `${tr("h2", "hub.models")}
<div class="modellist">
${groups.map(block).join("\n")}
</div>`;
    }

    const faq = `${tr("h2", "model.faq.title")}
<div class="faq">
${hub.faq.map((_, i) => `<details>${pt("summary", `faq.${i}.q`)}${pt("p", `faq.${i}.a`)}</details>`).join("\n")}
</div>`;

    const more = `${tr("h2", "hub.related")}
<ul class="hubs">
  ${hub.related.map((p, i) => `<li>${pt("a", `page.rel.${i}`, ` href="${esc(p)}"`)}</li>`).join("\n  ")}
</ul>
${contactHtml(site, strings)}`;

    const body = sectionsHtml([intro, picker, models, faq, more], "hub");
    const jsonld = [
      breadcrumbLd(site, [...trail, { name: hub.label.de, url: hub.path }]),
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: hub.label.de,
        url: `${site.origin}${hub.path}`,
        provider: { "@id": `${site.origin}/#business` },
        areaServed: AREA,
      },
    ];

    return {
      rec: { path: hub.path, file: fileOf(hub.path), indexable: true, title, description, h1: fill(hub.h1.de, "de") },
      html: page({ ...base, path: hub.path, title, description, body, jsonld, pageStrings: own, picker: Boolean(hub.picker) }),
    };
  });
}
