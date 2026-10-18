import fs from "node:fs";
import path from "node:path";

const YEAR = /^(19\d{2}|20[0-2]\d)$/;
export const isYear = (s) => YEAR.test(String(s).trim());
const PARENS = /\(([^)]*)\)/g;
const PREFIXES = [
  [/^apple /i, ""],
  [/^samsung galaxy /i, "galaxy-"],
  [/^google pixel /i, "pixel-"],
  [/^microsoft surface /i, "surface-"],
  [/^playstation /i, "ps"],
];
const DISPLAY_SLUGS = ["display", "display-original-irp", "display-original"];

export function decodeEntities(s) {
  return String(s).replace(/&#(\d+);|&amp;/g, (m, n) => (n ? String.fromCodePoint(Number(n)) : "&"));
}

export function normalizeGroup(g) {
  return String(g).trim();
}

export function displayName(device) {
  return decodeEntities(device)
    .trim()
    .replace(PARENS, (m, inner) => (YEAR.test(inner.trim()) ? `(${inner.trim()})` : ""))
    .replace(/^Apple (?=iPhone|iPad|MacBook)/, "")
    .replace(/\bPlaystation\b/g, "PlayStation")
    .replace(/\s+/g, " ")
    .trim();
}

export function modelCodes(device) {
  const codes = [];
  for (const m of decodeEntities(device).matchAll(PARENS)) {
    if (YEAR.test(m[1].trim())) continue;
    for (const part of m[1].replace(/\bN\/A\b/gi, "").split(/[/,]/)) {
      const code = part.replace(/\s+/g, " ").trim();
      if (code) codes.push(code);
    }
  }
  return codes;
}

export function baseSlug(device) {
  let s = decodeEntities(device).replace(PARENS, " ").replace(/\+/g, " plus ").trim();
  for (const [re, to] of PREFIXES) {
    if (re.test(s)) {
      s = s.replace(re, to);
      break;
    }
  }
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const yearOf = (device) => [...decodeEntities(device).matchAll(PARENS)].map((m) => m[1].trim()).find((g) => YEAR.test(g)) ?? null;
const firstACode = (device) => modelCodes(device).find((c) => /^A\d{4}$/.test(c)) ?? null;

export function resolveSlugs(devices) {
  const bases = devices.map((d) => baseSlug(d.device));
  const counts = new Map();
  for (const b of bases) counts.set(b, (counts.get(b) ?? 0) + 1);
  const slugs = new Map();
  const seen = new Set();
  devices.forEach((d, i) => {
    let slug = bases[i];
    if (counts.get(slug) > 1) {
      const suffix = yearOf(d.device) ?? firstACode(d.device)?.toLowerCase();
      if (!suffix) throw new Error(`slug collision: ${slug}`);
      slug += `-${suffix}`;
    }
    if (seen.has(slug)) throw new Error(`slug collision: ${slug}`);
    seen.add(slug);
    slugs.set(d.device, slug);
  });
  return slugs;
}

export function loadJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8").replace(/^﻿/, ""));
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function buildDevices(prices, categories, strings, order = {}) {
  const slugs = resolveSlugs(prices.devices);
  const row = (slug, price) => {
    const priority = categories.repairPriority[slug];
    const labelKey = `repair.${slug}`;
    if (priority === undefined || !strings.de?.[labelKey] || !strings.en?.[labelKey]) {
      throw new Error(`unmapped repair: ${slug}`);
    }
    return { slug, labelKey, priority, price: price ?? null, original: /-original(-irp)?$/.test(slug) };
  };
  const devices = prices.devices.map((d) => {
    const group = normalizeGroup(d.group);
    const g = categories.groups[group];
    if (!g) throw new Error(`unmapped group: ${group}`);
    const slug = slugs.get(d.device);
    const parent = g.parent ? categories.parents[g.parent] : null;
    const url = g.pageUrl ?? (parent ? `${parent.url}${slug}/` : null);
    if (!url) throw new Error(`unmapped group: ${group}`);
    return {
      slug,
      device: d.device,
      name: displayName(d.device),
      codes: modelCodes(d.device),
      group,
      type: g.type,
      brand: g.brand,
      parentId: g.parent ?? null,
      url,
      repairs: d.repairs.map((r) => row(r.slug, r.price)).sort((a, b) => a.priority - b.priority),
      extras: (categories.extras[g.type] ?? []).map((s) => row(s, null)).sort((a, b) => a.priority - b.priority),
    };
  });

  const byName = new Map();
  for (const d of devices) byName.set(d.name, [...(byName.get(d.name) ?? []), d]);
  for (const [name, same] of byName) {
    if (same.length < 2) continue;
    for (const d of same) {
      const code = firstACode(d.device);
      if (!code) throw new Error(`name collision: ${name}`);
      d.name = `${name} (${code})`;
    }
  }

  const groups = [...new Set(devices.map((d) => d.group))];
  const rank = (d) => {
    const i = order[d.group]?.indexOf(d.slug) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return devices.sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || rank(a) - rank(b) || cmp(a.name, b.name));
}

export function priceOf(d, slug) {
  return d.repairs.find((r) => r.slug === slug)?.price ?? null;
}

export function cheapest(d) {
  let best = null;
  for (const row of d.repairs) {
    if (row.price != null && (!best || row.price < best.price)) best = { row, price: row.price };
  }
  return best;
}

export function displayFrom(d) {
  const found = DISPLAY_SLUGS.map((s) => priceOf(d, s)).filter((p) => p != null);
  return found.length ? Math.min(...found) : null;
}
