import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, page, waLink } from "../html.mjs";
import { cheapest, displayFrom, loadJson, priceOf } from "../lib.mjs";
import { fileOf } from "./simple.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SUFFIX = "| Mtech3land";
const MAX_RELATED = 6;
export const AREA = ["Weil am Rhein", "Basel", "Lörrach"];
// die Apple Watch, die PlayStation: article and possessive in the German copy agree with the gender
const FEMININE_TYPES = new Set(["smartwatch", "playstation"]);
export const mine = (d) => (FEMININE_TYPES.has(d.type) ? "meine" : "mein");

// modelTitle/modelDescription/modelFaq take the repo dictionary unless the caller passes one.
let repoStrings;
const defaultStrings = () => (repoStrings ??= loadJson(repoRoot, "src/strings.json"));

export function str(strings, lang, key) {
  const value = strings[lang]?.[key];
  if (typeof value !== "string") throw new Error(`missing string ${lang}/${key}`);
  return value;
}

// trail: [{name, url, key}] links above the page (key = data-i18n key of the name); current: {name, key?}, key only when it is translated
export function crumbsHtml(trail, current, strings) {
  const own = current.key ? ` data-i18n="${current.key}"` : "";
  return `<nav class="crumbs" aria-label="${esc(str(strings, "de", "crumbs.label"))}" data-i18n-attr="aria-label:crumbs.label">
  <ol>
    ${trail.map((c) => `<li><a href="${esc(c.url)}" data-i18n="${c.key}">${esc(c.name)}</a></li>`).join("\n    ")}
    <li aria-current="page"${own}>${esc(current.name)}</li>
  </ol>
</nav>`;
}

// Each non-empty block in its own section; sections alternate white / warm whatever blocks a page has.
// A block is its inner HTML, or {id, html} when the section needs an anchor (the home page).
export const sectionsHtml = (blocks, wrapClass) =>
  blocks
    .filter(Boolean)
    .map((block, i) => {
      const { id, html } = typeof block === "string" ? { html: block } : block;
      const anchor = id ? ` id="${esc(id)}"` : "";
      return `<section class="section${i % 2 ? " section--warm" : ""}"${anchor}>\n  <div class="wrap ${wrapClass}">\n${html}\n  </div>\n</section>`;
    })
    .join("\n");

// list: [{name, url}] from the home page down to the page itself
export const breadcrumbLd = (site, list) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: list.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${site.origin}${c.url}` })),
});

// "Kontakt" heading, address, phone and opening hours; shared by model and hub pages
export function contactHtml(site, strings) {
  const tr = (tag, key, attrs = "") => `<${tag}${attrs} data-i18n="${key}">${esc(str(strings, "de", key))}</${tag}>`;
  const hours = site.hours.map(
    (h, i) => `<li><span data-i18n="hours.${i}">${esc(h.days.de)}</span> <span class="hours__t">${esc(h.open)}–${esc(h.close)}</span></li>`,
  );
  return `${tr("h2", "nav.contact")}
<div class="contact">
  <address>
    <p><strong>${esc(site.name)}</strong><br>${esc(site.street)}<br>${esc(site.zip)} ${esc(site.city)}</p>
    <p><a href="${esc(site.phoneHref)}">${esc(site.phone)}</a></p>
  </address>
  <div>
    ${tr("h3", "contact.hours", ' class="h3"')}
    <ul class="hours">
      ${hours.join("\n      ")}
    </ul>
  </div>
</div>`;
}

const fill = (tpl, vars) =>
  tpl.replace(/\{(\w+)\}/g, (_, key) => {
    if (!Object.hasOwn(vars, key)) throw new Error(`missing placeholder: ${key}`);
    return String(vars[key]);
  });

const pricedRows = (d) => d.repairs.filter((r) => r.price != null);

export function modelTitle(d, strings = defaultStrings()) {
  const base = `${d.name} Reparatur Weil am Rhein`;
  const display = displayFrom(d);
  if (display != null) return `${base} – Display ab ${display} € ${SUFFIX}`;
  const best = cheapest(d);
  if (best) return `${base} – ${str(strings, "de", best.row.labelKey)} ab ${best.price} € ${SUFFIX}`;
  return `${base} ${SUFFIX}`;
}

export function modelDescription(d, strings = defaultStrings()) {
  const top = pricedRows(d).slice(0, 3);
  const lead = `${d.name} Reparatur in Weil am Rhein, nahe Basel`;
  if (!top.length) return `${lead}. Preis auf Anfrage, Termin per WhatsApp.`;
  return `${lead}: ${top.map((r) => `${str(strings, "de", r.labelKey)} ${r.price} €`).join(", ")}. Termin per WhatsApp.`;
}

export function modelFaq(d, lang, strings = defaultStrings()) {
  const t = (key, vars = {}) => fill(str(strings, lang, `model.faq.${key}`), vars);
  const faq = [];
  const display = displayFrom(d);
  if (display != null) {
    const at = str(strings, lang, FEMININE_TYPES.has(d.type) ? "model.faq.at.f" : "model.faq.at");
    faq.push({ q: t("display.q", { at, name: d.name }), a: t("display.a", { at, name: d.name, price: display }) });
  }
  faq.push({ q: t("time.q"), a: t(d.type === "handy" ? "time.a.handy" : "time.a.other") });
  const diagnosis = priceOf(d, "fehleranalyse");
  if (diagnosis != null) faq.push({ q: t("diag.q"), a: t("diag.a", { price: diagnosis }) });
  faq.push({ q: t("appt.q"), a: t("appt.a") });
  return faq;
}

// Repair rows by priority, then the type's extras. A core repair of the type is added as an unpriced row only
// when the device has neither that slug nor one of its variants, so a short data row set still lists the basics.
// Variants are the original parts (-original, -original-irp) and, for the display, the iPad parts LCD, Displayglas
// and Digitizer-Glas. An unpriced standard row is dropped when a priced variant of it exists ("Display auf Anfrage"
// must not sit above "Display (Original Apple) 405 €" or "LCD 289 €"). The price picker index (picker-index.mjs)
// ships these same rows.
const DISPLAY_PARTS = ["lcd", "displayglas", "digitizer-glas"];
const variantsOf = (slug) => [`${slug}-original`, `${slug}-original-irp`, ...(slug === "display" ? DISPLAY_PARTS : [])];
export function listedRows(d, categories, strings = defaultStrings()) {
  const has = (slug) => d.repairs.some((r) => r.slug === slug || variantsOf(slug).includes(r.slug));
  const pricedVariant = (slug) => d.repairs.some((r) => r.price != null && variantsOf(slug).includes(r.slug));
  const shown = d.repairs.filter((r) => r.price != null || !pricedVariant(r.slug));
  const core = (categories.coreRepairs?.[d.type] ?? [])
    .filter((slug) => !has(slug))
    .map((slug) => {
      const priority = categories.repairPriority[slug];
      const labelKey = `repair.${slug}`;
      if (priority === undefined) throw new Error(`unmapped core repair: ${slug}`);
      str(strings, "de", labelKey);
      str(strings, "en", labelKey);
      return { slug, labelKey, priority, price: null, original: false };
    });
  return [...[...shown, ...core].sort((a, b) => a.priority - b.priority), ...d.extras];
}

// Nearest siblings of the same group, alternating newer and older (the list is newest first); shown newest first.
function relatedOf(d, group) {
  if (!d.parentId) return [];
  const i = group.indexOf(d);
  const picked = [];
  for (let step = 1; picked.length < MAX_RELATED && (i - step >= 0 || i + step < group.length); step++) {
    for (const j of [i - step, i + step]) if (j >= 0 && j < group.length && picked.length < MAX_RELATED) picked.push(j);
  }
  return picked.sort((a, b) => a - b).map((j) => group[j]);
}

function rowHtml(d, row, site, strings) {
  const label = str(strings, "de", row.labelKey);
  const ask = `Hallo, ich brauche ${label} für ${mine(d)} ${d.name}${row.price == null ? "" : ` (${row.price} €)`}.`;
  const price =
    row.price == null
      ? `<span class="pricelist__price" data-i18n="price.request">${esc(str(strings, "de", "price.request"))}</span>`
      : `<span class="pricelist__price">${row.price} €</span>`;
  return `<li class="pricelist__row">
  <span class="pricelist__label" data-i18n="${row.labelKey}">${esc(label)}</span>
  ${price}
  <a class="pricelist__wa" href="${esc(waLink(site, ask))}" target="_blank" rel="noopener"><svg class="ic" aria-hidden="true"><use href="#i-whatsapp"/></svg><span class="sr-only"><span data-i18n="model.cta">${esc(str(strings, "de", "model.cta"))}</span>: <span data-i18n="${row.labelKey}">${esc(label)}</span></span></a>
</li>`;
}

// ctx: {root, site, strings, partials, versions, devices, categories} -> [{rec: PageRec, html}]
export function modelPages(ctx) {
  const { site, strings, devices, categories } = ctx;
  const base = { site, strings, partials: ctx.partials, versions: ctx.versions };
  const tx = (key) => str(strings, "de", key);
  // <tag attrs data-i18n="key">German text</tag>; the EN toggle swaps the text from the dictionary
  const tr = (tag, key, attrs = "") => `<${tag}${attrs} data-i18n="${key}">${esc(tx(key))}</${tag}>`;
  const groups = new Map();
  for (const d of devices) groups.set(d.group, [...(groups.get(d.group) ?? []), d]);

  return devices.map((d) => {
    const parent = d.parentId ? categories.parents[d.parentId] : null;
    const title = modelTitle(d, strings);
    const description = modelDescription(d, strings);
    const h1 = `${d.name} ${tx("model.h1")}`;
    const ask = waLink(site, `Hallo, ich brauche eine Reparatur für ${mine(d)} ${d.name}.`);

    const trail = [
      { name: tx("crumbs.home"), url: "/", key: "crumbs.home" },
      ...(parent ? [{ name: tx(parent.labelKey), url: parent.url, key: parent.labelKey }] : []),
    ];
    const crumbs = crumbsHtml(trail, { name: d.name }, strings);

    const badge = (icon, key) => `<li class="badge"><svg class="ic" aria-hidden="true"><use href="#i-${icon}"/></svg>${tr("span", key)}</li>`;
    const badges = [
      d.type === "handy" ? badge("bolt", "model.badge.fast") : badge("clock", "model.badge.diag"),
      badge("whatsapp", "model.badge.wa"),
    ];

    const codes = d.codes.length ? `\n<p class="prose__note">${tr("span", "model.codes")} ${esc(d.codes.join(", "))}</p>` : "";
    const rows = listedRows(d, categories, strings).map((row) => rowHtml(d, row, site, strings));

    const main = `${crumbs}
<h1 class="h1">${esc(d.name)} ${tr("span", "model.h1")}</h1>${codes}
<ul class="badges">
  ${badges.join("\n  ")}
</ul>
${tr("h2", "nav.prices")}
<ul class="pricelist">
${rows.join("\n")}
</ul>
<div class="cta-box">
  ${tr("p", "model.cta.text")}
  <a class="btn btn--wa" href="${esc(ask)}" target="_blank" rel="noopener"><svg class="ic" aria-hidden="true"><use href="#i-whatsapp"/></svg>${tr("span", "model.cta")}</a>
</div>`;

    const faqDe = modelFaq(d, "de", strings);
    const faqEn = modelFaq(d, "en", strings);
    const pageStrings = { de: {}, en: {} };
    faqDe.forEach((f, i) => {
      pageStrings.de[`faq.${i}.q`] = esc(f.q);
      pageStrings.de[`faq.${i}.a`] = esc(f.a);
      pageStrings.en[`faq.${i}.q`] = esc(faqEn[i].q);
      pageStrings.en[`faq.${i}.a`] = esc(faqEn[i].a);
    });
    const faq = `${tr("h2", "model.faq.title")}
<div class="faq">
${faqDe.map((_, i) => `<details><summary data-i18n="faq.${i}.q">${pageStrings.de[`faq.${i}.q`]}</summary><p data-i18n="faq.${i}.a">${pageStrings.de[`faq.${i}.a`]}</p></details>`).join("\n")}
</div>`;

    const siblings = relatedOf(d, groups.get(d.group));
    const related = parent
      ? `${tr("h2", "model.related")}
<div class="modellist">
  <ul>
    ${siblings.map((s) => `<li><a href="${esc(s.url)}">${esc(s.name)}</a></li>`).join("\n    ")}
  </ul>
</div>
<p><a class="btn btn--ghost" href="${esc(parent.url)}">${tr("span", "model.parent")} ${tr("span", parent.labelKey)}</a></p>`
      : "";

    const contact = contactHtml(site, strings);

    const body = sectionsHtml([main, faq, related, contact], "model");

    const offers = pricedRows(d).map((r) => ({ "@type": "Offer", name: tx(r.labelKey), price: String(r.price), priceCurrency: "EUR" }));
    const jsonld = [
      breadcrumbLd(site, [...trail, { name: d.name, url: d.url }]),
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: `${d.name} Reparatur`,
        provider: { "@id": `${site.origin}/#business` },
        areaServed: AREA,
        ...(offers.length ? { offers } : {}),
      },
    ];

    return {
      rec: { path: d.url, file: fileOf(d.url), indexable: true, title, description, h1 },
      html: page({ ...base, path: d.url, title, description, body, jsonld, pageStrings }),
    };
  });
}
