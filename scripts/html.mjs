import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Inputs are already entity-decoded; this makes them safe for text and attribute context.
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

// Source text is read with LF endings and no BOM so output does not depend on the checkout (autocrlf).
export const readText = (file) => fs.readFileSync(file, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");

// Flat keys may contain dots ("nav.prices"), so try the whole key first, then split at the first dot.
function lookup(vars, key) {
  if (vars === null || typeof vars !== "object") return undefined;
  if (Object.hasOwn(vars, key)) return vars[key];
  const dot = key.indexOf(".");
  if (dot < 0 || !Object.hasOwn(vars, key.slice(0, dot))) return undefined;
  return lookup(vars[key.slice(0, dot)], key.slice(dot + 1));
}

const TAG = /\{\{\{\s*([\w.-]+)\s*\}\}\}|\{\{>\s*([\w.-]+)\s*\}\}|\{\{\s*([\w.-]+)\s*\}\}/g;

// {{key}} escaped, {{{key}}} raw, {{> name}} partial (same vars). Substituted text is never re-scanned.
export function render(tpl, vars, partials = {}, depth = 0) {
  if (depth > 10) throw new Error("partials nested too deep");
  return tpl.replace(TAG, (_, rawKey, partial, plainKey) => {
    if (partial !== undefined) {
      if (!Object.hasOwn(partials, partial)) throw new Error(`missing partial: ${partial}`);
      return render(partials[partial], vars, partials, depth + 1);
    }
    const key = rawKey ?? plainKey;
    const value = lookup(vars, key);
    if (value === undefined || value === null) throw new Error(`missing var: ${key}`);
    if (typeof value === "object") throw new Error(`var is not a scalar: ${key}`);
    return rawKey !== undefined ? String(value) : esc(value);
  });
}

export const waLink = (site, text) => `https://wa.me/${site.wa}?text=${encodeURIComponent(text)}`;

export function loadPartials(root) {
  const dir = path.join(root, "src", "partials");
  const partials = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort()) {
    // the file's final newline would otherwise add a blank line at every {{> name}}
    partials[file.slice(0, -".html".length)] = readText(path.join(dir, file)).replace(/\n$/, "");
  }
  return partials;
}

let defaultPartials;
const repoPartials = () => (defaultPartials ??= loadPartials(repoRoot));

// "<" is escaped so no value can close the surrounding <script> element.
const jsonForScript = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

// The one list of assets every page links; each must have a ?v= hash (see page() and build()).
export const ASSETS = {
  css: "/assets/css/styles.css",
  strings: "/assets/js/strings.js",
  i18n: "/assets/js/i18n.js",
  app: "/assets/js/app.js",
};
// Scripts only the pages that render the picker partial load (ctx.picker), after app.js and in this order.
export const PICKER_ASSETS = {
  state: "/assets/js/picker-state.js",
  picker: "/assets/js/picker.js",
};
export const VERSIONED_ASSETS = [...Object.values(ASSETS), ...Object.values(PICKER_ASSETS)];

// Every picker url is resolved on every page, so a missing hash fails whichever page is built first; only picker pages print the tags.
const pickerTags = (asset, print) => {
  const tags = Object.values(PICKER_ASSETS).map((url) => `<script src="${esc(asset(url))}"></script>\n`);
  return print ? tags.join("") : "";
};

const LAYOUT = `<!doctype html>
<html lang="de">
{{> head}}
<body>
{{> icons}}
{{> header}}
<main id="main">
{{{body}}}
</main>
{{> footer}}
{{> stickybar}}
<script src="{{scriptStrings}}"></script>
<script src="{{scriptI18n}}"></script>
<script src="{{scriptApp}}"></script>
{{{pickerScripts}}}</body>
</html>
`;

// ctx: {site, strings, path, title, description, body, jsonld?, noindex?, pageStrings?, extraHead?, partials?, versions?, picker?}
// `path` is the canonical path (redirect stubs pass their target). `versions` maps "/assets/..." urls to ?v= hashes.
// `picker: true` (set by every page whose body contains the picker partial) adds the two picker scripts.
export function page(ctx) {
  const { site, strings, path: pagePath, title, description, body } = ctx;
  if (!strings?.de) throw new Error("page: ctx.strings ({de, en}) is required");
  const versions = ctx.versions ?? {};
  const asset = (url) => {
    if (!versions[url]) throw new Error(`unversioned asset: ${url}`);
    return `${url}?v=${versions[url]}`;
  };
  const t = strings.de;

  const head = [
    ctx.noindex ? '<meta name="robots" content="noindex,follow">' : "",
    ctx.pageStrings ? `<script>window.MT_PAGE_STRINGS=${jsonForScript(ctx.pageStrings)};</script>` : "",
    ...(ctx.jsonld ?? []).map((o) => `<script type="application/ld+json">${jsonForScript(o)}</script>`),
    ctx.extraHead ?? "",
  ].filter(Boolean);

  const hours = site.hours.map(
    (h, i) => `<li><span data-i18n="hours.${i}">${esc(h.days.de)}</span> <span class="hours__t">${esc(h.open)}–${esc(h.close)}</span></li>`,
  );

  return render(
    LAYOUT,
    {
      site,
      t,
      title,
      description,
      body,
      canonical: `${site.origin}${pagePath}`,
      ogImage: `${site.origin}/assets/img/og.svg`,
      cssHref: asset(ASSETS.css),
      headExtra: head.map((line) => `${line}\n`).join(""),
      waHref: waLink(site, t["wa.greeting"]),
      hoursHtml: hours.join("\n        "),
      scriptStrings: asset(ASSETS.strings),
      scriptI18n: asset(ASSETS.i18n),
      scriptApp: asset(ASSETS.app),
      pickerScripts: pickerTags(asset, ctx.picker === true),
    },
    ctx.partials ?? repoPartials(),
  );
}
