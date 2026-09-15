#!/usr/bin/env node
// Keeps the Google rating + review count in sync on every page.
//
//   node scripts/update-reviews.mjs          # fetch from Google Places, then apply
//   node scripts/update-reviews.mjs fetch    # only refresh assets/data/reviews.json
//   node scripts/update-reviews.mjs apply    # only rewrite HTML/JS from reviews.json
//
// Env: GOOGLE_PLACES_API_KEY (needed for fetch), GOOGLE_PLACE_ID (optional override).
// Source of truth: assets/data/reviews.json. Run "apply" after editing it by hand.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "assets", "data", "reviews.json");
const DEFAULT_PLACE_ID = "ChIJyVwljXm7kUcRjNI5xSnKFxk"; // Mtech3land, Hauptstraße 177, Weil am Rhein
const KEEPALIVE_DAYS = 30; // touch "checked" at least this often so the scheduled workflow stays active

const today = () => new Date().toISOString().slice(0, 10);
const readData = () => JSON.parse(readFileSync(DATA, "utf8"));

async function fetchFromGoogle() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    console.log("GOOGLE_PLACES_API_KEY not set – skipping fetch, using reviews.json as is.");
    return;
  }
  const placeId = process.env.GOOGLE_PLACE_ID || DEFAULT_PLACE_ID;
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount" },
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`);
  const { rating, userRatingCount: count } = await res.json();
  if (typeof rating !== "number" || rating < 1 || rating > 5 || !Number.isInteger(count) || count < 1) {
    throw new Error(`Unexpected Places response: rating=${rating} count=${count}`);
  }

  const old = readData();
  const changed = old.rating !== rating || old.count !== count;
  const ageDays = (Date.now() - Date.parse(old.checked || old.updated || 0)) / 86400000;
  if (!changed && ageDays < KEEPALIVE_DAYS) {
    console.log(`Google: ${rating} (${count}) – unchanged, nothing to write.`);
    return;
  }
  const next = {
    rating,
    count,
    placeId,
    updated: changed ? today() : old.updated,
    checked: today(),
  };
  writeFileSync(DATA, JSON.stringify(next, null, 2) + "\n");
  console.log(`Google: ${rating} (${count}) – ${changed ? "changed, " : "keepalive, "}reviews.json written.`);
}

function targetFiles() {
  const files = [join(ROOT, "index.html"), join(ROOT, "assets", "js", "i18n.js")];
  for (const name of readdirSync(ROOT)) {
    const p = join(ROOT, name, "index.html");
    try {
      if (statSync(p).isFile()) files.push(p);
    } catch {}
  }
  return files;
}

function apply() {
  const { rating, count } = readData();
  const rEn = rating.toFixed(1); // 5.0
  const rDe = rEn.replace(".", ","); // 5,0
  const perfect = rating >= 4.95;
  const ledeDe = perfect ? `${count} Bewertungen, alle 5 Sterne` : `${count} Bewertungen, Ø ${rDe} Sterne`;
  const ledeEn = perfect ? `${count} reviews, all 5 stars` : `${count} reviews, ${rEn} stars on average`;

  const rules = [
    [/("ratingValue":\s*")[\d.]+(")/g, `$1${rEn}$2`], // JSON-LD
    [/("reviewCount":\s*")\d+(")/g, `$1${count}$2`], // JSON-LD
    [/(<b>)\d,\d(<\/b> · )\d+( <span data-i18n="trust\.reviews">)/g, `$1${rDe}$2${count}$3`], // trust bar
    [/\d,\d( von 5 auf Google)/g, `${rDe}$1`], // rev.title DE (HTML + i18n)
    [/\d\.\d( out of 5 on Google)/g, `${rEn}$1`], // rev.title EN (i18n)
    [/\d+ Bewertungen, (?:alle 5 Sterne|Ø \d,\d Sterne)/g, ledeDe], // rev.lede DE
    [/\d+ reviews, (?:all 5 stars|\d\.\d stars on average)/g, ledeEn], // rev.lede EN
    [/(★)\d,\d( auf Google)/g, `$1${rDe}$2`], // meta description, subpages
    [/\d,\d(★ auf Google)/g, `${rDe}$1`], // meta description, home
  ];

  let total = 0;
  for (const file of targetFiles()) {
    const before = readFileSync(file, "utf8");
    let after = before;
    let hits = 0;
    for (const [re, to] of rules) {
      after = after.replace(re, (...m) => {
        hits++;
        return typeof to === "string" ? to.replace(/\$(\d)/g, (_, i) => m[+i]) : to;
      });
    }
    if (after !== before) writeFileSync(file, after);
    total += hits;
    console.log(`${hits.toString().padStart(3)}  ${file.slice(ROOT.length + 1)}${after !== before ? "" : "  (no change)"}`);
  }
  console.log(`Applied ${rEn} (${count}) – ${total} placeholders matched.`);
  if (total === 0) throw new Error("No placeholders matched – the HTML patterns changed?");
}

const mode = process.argv[2] || "all";
if (mode === "fetch" || mode === "all") await fetchFromGoogle();
if (mode === "apply" || mode === "all") apply();
