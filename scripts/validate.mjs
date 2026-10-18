import fs from "node:fs";
import path from "node:path";
import { PICKER_ASSETS } from "./html.mjs";

const attrsOf = (tag) => {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1].toLowerCase()] = m[2];
  return out;
};
const tagsOf = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => attrsOf(m[0]));
const plain = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const FORBIDDEN = [
  ["null €", /null €/],
  ["undefined", /\bundefined\b/],
  ["NaN", /\bNaN\b/],
  ["&amp;#", /&amp;#/],
];

function inspect(html) {
  const metas = tagsOf(html, "meta");
  const refresh = metas.find((m) => m["http-equiv"]?.toLowerCase() === "refresh")?.content;
  return {
    title: html.match(/<title>([\s\S]*?)<\/title>/i)?.[1].trim() ?? "",
    description: metas.find((m) => m.name === "description")?.content ?? "",
    h1: plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? ""),
    canonical: tagsOf(html, "link").find((l) => l.rel === "canonical")?.href ?? "",
    noindex: metas.some((m) => m.name === "robots" && /noindex/i.test(m.content ?? "")),
    redirect: refresh === undefined ? null : (refresh.match(/url=\s*(\S+)/i)?.[1] ?? ""),
  };
}

// Checks the built site. Every message starts with the offending file's path relative to outDir.
export function validate({ outDir, assetRoot = outDir, pages, strings, allowMissing = [], origin }) {
  const errors = [];
  const allowed = new Set(allowMissing);

  const exists = (urlPath) => {
    let rel;
    try {
      rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
    } catch {
      return false;
    }
    const file = rel === "" || rel.endsWith("/") ? `${rel}index.html` : rel;
    if (file.split("/").includes("..")) return false;
    const bases = file.startsWith("assets/") ? [assetRoot, outDir] : [outDir];
    return bases.some((base) => fs.existsSync(path.join(base, file)));
  };

  const seen = { title: new Map(), description: new Map(), H1: new Map() };

  for (const rec of pages) {
    const file = rec.file;
    const abs = path.join(outDir, file);
    if (!fs.existsSync(abs)) {
      errors.push(`${file}: page file is missing`);
      continue;
    }
    const html = fs.readFileSync(abs, "utf8");
    const info = inspect(html);

    if (rec.indexable) {
      for (const [label, value] of [["title", info.title], ["description", info.description], ["H1", info.h1]]) {
        if (!value) {
          errors.push(`${file}: missing ${label}`);
          continue;
        }
        const first = seen[label].get(value);
        if (first) errors.push(`${file}: duplicate ${label} "${value}" (also ${first})`);
        else seen[label].set(value, file);
      }

      let own = null;
      try {
        own = new URL(info.canonical);
      } catch {
        errors.push(`${file}: canonical is missing or not an absolute URL`);
      }
      if (own && (own.pathname !== rec.path || (origin && own.origin !== origin))) {
        errors.push(`${file}: canonical ${info.canonical} does not match own path ${rec.path}`);
      }
      if (info.noindex) errors.push(`${file}: indexable page carries noindex`);
    } else if (!info.noindex) {
      errors.push(`${file}: non-indexable page needs <meta name="robots" content="noindex">`);
    }

    if (info.redirect !== null) {
      const target = info.redirect.match(/^(?:https?:\/\/[^/]+)?(\/[^?#]*)/)?.[1];
      if (!target) errors.push(`${file}: redirect target "${info.redirect}" is not a site path`);
      else if (!allowed.has(target) && !exists(target)) errors.push(`${file}: redirect target ${target} does not exist`);
    }

    [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].forEach((m, i) => {
      try {
        JSON.parse(m[1]);
      } catch (e) {
        errors.push(`${file}: JSON-LD block ${i + 1} does not parse (${e.message})`);
      }
    });

    const targets = new Set();
    for (const m of html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)) {
      if (m[1].startsWith("//")) continue;
      targets.add(m[1].split(/[?#]/)[0]);
    }
    for (const target of [...targets].sort()) {
      if (!allowed.has(target) && !exists(target)) errors.push(`${file}: broken link ${target}`);
    }

    // cache busting: js/css under /assets must carry ?v= plus exactly 8 lowercase hex chars
    const unversioned = new Set();
    for (const m of html.matchAll(/\b(?:href|src)="(\/assets\/[^"]*)"/g)) {
      if (/^\/assets\/[^?#]*\.(?:js|css)(?:\?|#|$)/.test(m[1]) && !/^[^?#]*\?v=[0-9a-f]{8}(?:#.*)?$/.test(m[1])) unversioned.add(m[1]);
    }
    for (const url of [...unversioned].sort()) errors.push(`${file}: asset ${url} needs ?v= followed by 8 lowercase hex chars`);

    // the picker section and its two scripts go together: a section without them is dead, scripts without it are dead weight
    const hasPicker = /<[^>]*\sdata-picker(?=[\s/>=])/i.test(html);
    const scripts = tagsOf(html, "script").map((t) => (t.src ?? "").split(/[?#]/)[0]);
    for (const url of Object.values(PICKER_ASSETS)) {
      if (hasPicker && !scripts.includes(url)) errors.push(`${file}: page has a picker (data-picker) but does not load ${url}`);
      if (!hasPicker && scripts.includes(url)) errors.push(`${file}: loads ${url} but has no picker (data-picker)`);
    }

    let pageStrings = {};
    const inline = html.match(/window\.MT_PAGE_STRINGS\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
    if (inline) {
      try {
        pageStrings = JSON.parse(inline[1]);
      } catch (e) {
        errors.push(`${file}: MT_PAGE_STRINGS does not parse (${e.message})`);
      }
    }
    const keys = new Set();
    for (const m of html.matchAll(/\sdata-i18n="([^"]+)"/g)) keys.add(m[1]);
    for (const m of html.matchAll(/\sdata-i18n-attr="([^"]+)"/g)) {
      const colon = m[1].indexOf(":");
      if (colon >= 0) keys.add(m[1].slice(colon + 1));
    }
    for (const key of [...keys].sort()) {
      const missing = ["de", "en"].filter((lang) => typeof strings?.[lang]?.[key] !== "string" && typeof pageStrings?.[lang]?.[key] !== "string");
      if (missing.length) errors.push(`${file}: i18n key "${key}" is missing for ${missing.join(", ")}`);
    }

    for (const [label, re] of FORBIDDEN) {
      if (re.test(html)) errors.push(`${file}: page text contains "${label}"`);
    }
  }

  const sitemap = path.join(outDir, "sitemap.xml");
  if (!fs.existsSync(sitemap)) {
    errors.push("sitemap.xml: file is missing");
  } else {
    const listed = new Set();
    for (const m of fs.readFileSync(sitemap, "utf8").matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)) {
      const loc = m[1].replace(/&amp;/g, "&");
      let url;
      try {
        url = new URL(loc);
      } catch {
        errors.push(`sitemap.xml: ${loc} is not an absolute URL`);
        continue;
      }
      if (origin && url.origin !== origin) errors.push(`sitemap.xml: ${loc} is not on ${origin}`);
      listed.add(url.pathname);
    }
    const wanted = new Set(pages.filter((p) => p.indexable).map((p) => p.path));
    for (const p of [...listed].sort()) if (!wanted.has(p)) errors.push(`sitemap.xml: lists ${p}, which is not an indexable page`);
    for (const p of [...wanted].sort()) if (!listed.has(p)) errors.push(`sitemap.xml: misses indexable page ${p}`);
  }

  return errors;
}
