import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASSETS, VERSIONED_ASSETS, loadPartials, readText } from "./html.mjs";
import { buildDevices, loadJson } from "./lib.mjs";
import { homePages } from "./pages/home.mjs";
import { hubPages } from "./pages/hub.mjs";
import { modelPages } from "./pages/model.mjs";
import { pickerIndex } from "./picker-index.mjs";
import { ratgeberPages } from "./pages/ratgeber.mjs";
import { robotsTxt, sitemapXml, simplePages } from "./pages/simple.mjs";
import { validate } from "./validate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = ".build-manifest.json";

// Exact page paths that are linked before their page exists. Each later task removes the entries it builds.
export const PENDING = [];

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const hash = (text) => crypto.createHash("sha1").update(text).digest("hex").slice(0, 8);

// Opening-hours labels come from site.json, so they join the dictionary as keys the EN toggle can translate.
function withSiteStrings(strings, site) {
  const merged = { de: { ...strings.de }, en: { ...strings.en } };
  site.hours.forEach((h, i) => {
    merged.de[`hours.${i}`] = h.days.de;
    merged.en[`hours.${i}`] = h.days.en;
  });
  return merged;
}

// Absolute path of `rel` when it stays inside outDir, else null.
function inside(outDir, rel) {
  const base = path.resolve(outDir);
  const abs = path.resolve(base, rel);
  return !path.isAbsolute(rel) && abs.startsWith(base + path.sep) ? abs : null;
}

function readManifest(outDir) {
  const file = path.join(outDir, MANIFEST);
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(readText(file));
  const list = Array.isArray(data) ? data : data?.files;
  if (!Array.isArray(list) || list.some((f) => typeof f !== "string")) throw new Error(`${MANIFEST} is malformed`);
  return list;
}

// Deletes exactly the files the previous build recorded (and directories that became empty).
function clean(outDir) {
  const base = path.resolve(outDir);
  const files = readManifest(outDir).map((rel) => {
    const abs = inside(outDir, rel);
    if (!abs) throw new Error(`unsafe manifest entry: ${rel}`);
    return abs;
  });
  for (const abs of files) {
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) fs.unlinkSync(abs);
    for (let dir = path.dirname(abs); dir !== base; dir = path.dirname(dir)) {
      try {
        fs.rmdirSync(dir);
      } catch {
        break;
      }
    }
  }
}

// Static files the browser loads. Everything else in the repo (src/, scripts/, data sources, docs) stays out of the site.
const RUNTIME_DIRS = ["assets/css", "assets/js", "assets/img", "assets/fonts", "assets/video"];
const TEXT_ASSET = /\.(css|js|svg)$/;

export function runtimeAssets(root) {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (r !== ASSETS.strings.slice(1)) out.push(r); // strings.js is generated
    }
  };
  for (const dir of RUNTIME_DIRS) if (fs.existsSync(path.join(root, dir))) walk(dir);
  if (fs.existsSync(path.join(root, "CNAME"))) out.push("CNAME");
  return out.sort(cmp);
}

// Text assets are written normalised (LF, no BOM) so the artifact is the same on every platform.
const assetContent = (root, rel) => (TEXT_ASSET.test(rel) ? readText(path.join(root, rel)) : fs.readFileSync(path.join(root, rel)));

export function build({ root, outDir = path.join(root, "_site"), quiet = false }) {
  if (path.resolve(outDir) === path.resolve(root)) throw new Error("outDir must be a separate directory");
  const site = loadJson(root, "src/site.json");
  const strings = withSiteStrings(loadJson(root, "src/strings.json"), site);
  const partials = loadPartials(root);

  const stringsJs = `window.MT_STR=${JSON.stringify(strings)};`;
  const versions = {};
  for (const url of VERSIONED_ASSETS) {
    // strings.js is generated (hashed from memory); every other asset is read from the repo
    versions[url] = hash(url === ASSETS.strings ? stringsJs : readText(path.join(root, url.slice(1))));
  }

  const categories = loadJson(root, "src/categories.json");
  const devices = buildDevices(loadJson(root, "assets/data/prices.json"), categories, strings, loadJson(root, "src/model-order.json"));

  const ctx = { root, site, strings, partials, versions, categories, devices };
  const results = [...simplePages(ctx), ...modelPages(ctx), ...hubPages(ctx), ...homePages(ctx), ...ratgeberPages(ctx)];
  const pages = results.map((r) => r.rec).sort((a, b) => cmp(a.path, b.path));

  const files = new Map();
  const put = (rel, content) => {
    if (files.has(rel)) throw new Error(`two generators write ${rel}`);
    files.set(rel, content);
  };
  for (const rel of runtimeAssets(root)) put(rel, assetContent(root, rel));
  put(ASSETS.strings.slice(1), stringsJs);
  put("assets/data/picker.json", JSON.stringify(pickerIndex(devices, categories, strings)));
  for (const { rec, html } of results) put(rec.file, html);
  put("robots.txt", robotsTxt(site));
  put("sitemap.xml", sitemapXml(site, pages));

  // Everything is generated in memory first, so a template error never leaves a half-cleaned tree behind.
  clean(outDir);
  const names = [...files.keys()].sort(cmp);
  for (const rel of names) {
    const abs = inside(outDir, rel);
    if (!abs) throw new Error(`unsafe output path: ${rel}`);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files.get(rel));
  }
  fs.writeFileSync(path.join(outDir, MANIFEST), `${JSON.stringify(names, null, 2)}\n`);

  const errors = validate({ outDir, assetRoot: outDir, pages, strings, allowMissing: PENDING, origin: site.origin });

  if (!quiet) {
    console.log(`Built ${pages.length} pages (${pages.filter((p) => p.indexable).length} indexable), ${names.length} files.`);
    if (errors.length) console.error(`${errors.length} validation error(s):\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    else console.log("Validation OK: no errors.");
  }
  return { pages, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--out");
  const out = i >= 0 ? args[i + 1] : "_site";
  if (!out || out.startsWith("--")) {
    console.error("Usage: node scripts/build.mjs [--out <dir>]");
    process.exit(2);
  }
  const { errors } = build({ root: repoRoot, outDir: path.resolve(repoRoot, out) });
  process.exitCode = errors.length ? 1 : 0;
}
