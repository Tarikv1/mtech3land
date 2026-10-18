#!/usr/bin/env node
// Refreshes assets/data/reviews.json (Google rating + review count) from the Places API (New).
// The generator injects that file into the site, so run `node scripts/build.mjs` afterwards;
// the GitHub Action .github/workflows/deploy.yml does both daily (sync job, then build + deploy).
//
//   node scripts/update-reviews.mjs
//
// Env: GOOGLE_PLACES_API_KEY (required: missing or empty -> error on stderr, exit 1),
//      GOOGLE_PLACE_ID (optional override of the place below).
// Exit codes: 0 ok, 1 missing key or failed fetch, 2 usage (the script takes no arguments).
// Tests never reach Google: they inject `fetchImpl`.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "assets", "data", "reviews.json");
const DEFAULT_PLACE_ID = "ChIJyVwljXm7kUcRjNI5xSnKFxk"; // Mtech3land, Hauptstraße 177, Weil am Rhein
const KEEPALIVE_DAYS = 30; // touch "checked" at least this often so the scheduled workflow stays active

const MISSING_KEY = "GOOGLE_PLACES_API_KEY missing – add it: gh secret set GOOGLE_PLACES_API_KEY -R Tarikv1/mtech3land";
const USAGE = "usage: node scripts/update-reviews.mjs   (no arguments; env GOOGLE_PLACES_API_KEY required, GOOGLE_PLACE_ID optional)";

// Node reports a network failure as the generic "fetch failed"; the reason (DNS, timeout, reset) sits in err.cause.
export function errorText(err) {
  const cause = err.cause?.message;
  return cause ? `${err.message} (${cause})` : err.message;
}

// -> {rating, count}; throws on a failed request or a payload that does not look like a rating
export async function fetchReviews({ key, placeId, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount" },
    signal: AbortSignal.timeout(20000), // a hung connection fails the run instead of stalling it
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`);
  const { rating, userRatingCount: count } = await res.json();
  if (typeof rating !== "number" || rating < 1 || rating > 5 || !Number.isInteger(count) || count < 1) {
    throw new Error(`Unexpected Places response: rating=${rating} count=${count}`);
  }
  return { rating, count };
}

// -> {next, changed}, or null when nothing changed and "checked" is younger than KEEPALIVE_DAYS.
// "updated" moves only when rating or count changed; a keepalive touches "checked" alone.
export function nextReviews(old, { rating, count }, { placeId, now = new Date() }) {
  const shown = Math.round(rating * 10) / 10; // the site and the file carry one decimal
  const changed = old.rating !== shown || old.count !== count;
  const today = now.toISOString().slice(0, 10);
  const ageDays = (now - Date.parse(old.checked ?? old.updated)) / 86400000;
  if (!changed && ageDays < KEEPALIVE_DAYS) return null; // an unreadable date gives NaN: stale, so it falls through
  return { changed, next: { rating: shown, count, placeId, updated: changed ? today : old.updated, checked: today } };
}

// JSON.stringify would write 5.0 as 5, so the rating is spelled out with one decimal.
export function serializeReviews({ rating, count, placeId, updated, checked }) {
  return `{
  "rating": ${rating.toFixed(1)},
  "count": ${count},
  "placeId": ${JSON.stringify(placeId)},
  "updated": ${JSON.stringify(updated)},
  "checked": ${JSON.stringify(checked)}
}
`;
}

// Fetch from Google and rewrite `file` when needed. -> {status: "unchanged" | "changed" | "keepalive", rating, count}
export async function syncReviews({ file = DATA, key, placeId = DEFAULT_PLACE_ID, fetchImpl = fetch, now = new Date() }) {
  const fetched = await fetchReviews({ key, placeId, fetchImpl });
  const plan = nextReviews(JSON.parse(readFileSync(file, "utf8")), fetched, { placeId, now });
  if (!plan) return { status: "unchanged", ...fetched };
  writeFileSync(file, serializeReviews(plan.next));
  return { status: plan.changed ? "changed" : "keepalive", ...fetched };
}

async function main(args, env) {
  if (args.length) {
    console.error(USAGE);
    return 2;
  }
  const key = env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) {
    console.error(MISSING_KEY);
    return 1;
  }
  const { status, rating, count } = await syncReviews({ key, placeId: env.GOOGLE_PLACE_ID?.trim() || DEFAULT_PLACE_ID });
  console.log(`Google: ${rating} (${count}) – ${status}${status === "unchanged" ? ", nothing to write" : ", reviews.json written"}.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await main(process.argv.slice(2), process.env).catch((err) => {
    console.error(errorText(err));
    return 1;
  });
}
