# Mtech3land — Website

Static, bilingual (DE/EN) landing page for **Mtech3land**, Hauptstraße 177, 79576 Weil am Rhein.
No build step, no framework — plain HTML/CSS/JS. Host it anywhere.

## Preview locally
```bash
cd mtech3land
python -m http.server 8098
# open http://127.0.0.1:8098
```
(Any static server works — the price table needs http://, not file://, because it fetches `assets/data/prices.json`.)

## Deploy (pick one)
- **Netlify / Vercel** — drag the `mtech3land` folder onto their dashboard. Done.
- **GitHub Pages** — push the folder contents to a repo, enable Pages.
- **Classic web hosting** — upload the folder via FTP to your web root.

Everything is self-contained except two runtime dependencies that need internet:
Google Fonts (Saira / IBM Plex Sans / JetBrains Mono) and the Google Maps embed.

## Edit the important stuff
| What | Where |
|------|-------|
| Phone / WhatsApp number | search & replace `4915753815179` (and `+49 1575 3815179`) across `index.html`, `assets/js/*` |
| Opening hours | `index.html` → `<table class="hours">` (+ the `openingHoursSpecification` JSON-LD in `<head>`) |
| Prices | `assets/data/prices.json` — one entry per device: `{ "group", "device", "repairs":[ {"name","slug","price"} ] }`; `price: null` shows **auf Anfrage** |
| Text & translations | `assets/js/i18n.js` (DE + EN dictionaries) |
| Colours | `assets/css/styles.css` → `:root` (`--red`, `--bg`, …) |
| Logo / social image | `assets/img/favicon.svg`, `assets/img/og.svg` |
| Photos | drop files into `assets/img/` and reference them in `index.html` |

## Prices
Seeded from a comparable Freiburg repair shop's public price list (147 devices, 928 fixed prices +
201 "auf Anfrage"). **Review them and adjust to your own before launch.**

## ⚠️ Before going live
- [ ] Add a real **Impressum** and **Datenschutzerklärung** (legally required in Germany) — footer links are placeholders.
- [ ] Swap in real storefront/repair **photos** (e.g. from the Google Business profile).
- [ ] Double-check **prices** and **opening hours**.
- [ ] Optional: replace the Google Fonts `<link>` with self-hosted fonts for a fully offline site.

## Google rating & review count (auto-update)
The "5,0 · 32 Google-Bewertungen" figures on every page come from `assets/data/reviews.json`.
`scripts/update-reviews.mjs` rewrites all pages + `i18n.js` from that file, and the GitHub Action
`.github/workflows/update-reviews.yml` runs it daily (04:17 UTC): it asks the Google Places API for
the current rating/count, and commits + pushes only when something changed (GitHub Pages then redeploys).

**One-time setup (needed once, otherwise the numbers stay as they are):**
1. In [Google Cloud Console](https://console.cloud.google.com/) create/select a project, attach a billing
   account (Google requires one even for free usage) and enable **Places API (New)**.
2. Create an **API key** (APIs & Services → Credentials) and restrict it to *Places API (New)*.
3. In this repo: Settings → Secrets and variables → Actions → **New repository secret**
   `GOOGLE_PLACES_API_KEY` = the key.
4. Actions tab → "Update Google reviews" → **Run workflow** to test. Every run afterwards is automatic.

Cost: 1 request/day (~30/month) — far inside the free monthly quota of Places API (New).
Place ID is hardcoded in the script (`ChIJyVwljXm7kUcRjNI5xSnKFxk`); override with a repo variable
`GOOGLE_PLACE_ID` if the business ever moves to a new Google listing.

Manual update without API key: edit `rating`/`count` in `assets/data/reviews.json`, then
`node scripts/update-reviews.mjs apply` and push.

## Fonts / licensing
Saira, IBM Plex Sans, JetBrains Mono — all SIL Open Font License, free for commercial use.
No third-party images are bundled; the logo mark is an original SVG.
