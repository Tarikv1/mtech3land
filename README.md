# Mtech3land — Website

Bilingual (DE/EN) site for **Mtech3land**, Hauptstraße 177, 79576 Weil am Rhein. Live at https://mtech3land.com (GitHub Pages, repo `Tarikv1/mtech3land`).

The pages are generated. A zero-dependency Node script (Node 22, no `npm install`) turns `src/` and `assets/data/` into plain HTML in `_site/`. Only `_site/` is published (GitHub Actions deploys it to Pages); the repo holds sources only and `_site/` is git-ignored.

## Build, test, preview
```bash
node scripts/build.mjs                  # build into _site/: every page, sitemap, robots.txt, picker data, runtime assets; validates links, titles, JSON-LD; exit 1 on errors
node scripts/build.mjs --out <dir>      # build somewhere else
node --test "scripts/*.test.mjs"        # all tests
python -m http.server 8098 --bind 127.0.0.1 --directory _site   # preview at http://127.0.0.1:8098
```
Commit source changes only — never generated files. `_site/.build-manifest.json` lists what the build wrote, so a rebuild also removes pages that no longer exist.

## Edit the important stuff
Change the source, run `node scripts/build.mjs`, run the tests, commit.

| What | Where |
|------|-------|
| Phone / WhatsApp, address, e-mail, opening hours, promo line | `src/site.json` |
| Home, navigation, picker, footer and other shared texts (DE + EN) | `src/strings.json` |
| Hub pages (iPhone, Samsung, Laptop, PlayStation, ...) | `src/content/hubs/*.json` |
| Ratgeber articles | `src/content/ratgeber/*.md` (front matter: `title`, `description`, `date`, `related`) |
| Impressum, Datenschutz, 404 | `src/pages/*.html` |
| Header, footer, trust strip, picker markup | `src/partials/*.html` |
| Device groups and repair types | `src/categories.json` |
| Prices | `assets/data/prices.json` (`price: null` shows "auf Anfrage") |
| Newest-first model order in the picker | `src/model-order.json` (written by the price refresh) |
| Google rating and review count | `assets/data/reviews.json` (updated by hand, see below) |
| Colours, fonts, layout | `assets/css/styles.css` |
| Logo, photos | `assets/img/` |

## Refresh prices
Neue Modelle und Preise kommen über ein internes Werkzeug außerhalb dieses Repos; Ergebnis sind Änderungen an `assets/data/prices.json` und `src/model-order.json`. Existing rows are never edited by it. The client checks new rows before they go live. Then run the tests, build and commit.

## Deploy
`.github/workflows/deploy.yml` publishes the site. GitHub Pages must be set to **Source: GitHub Actions** (Settings → Pages); the custom domain `mtech3land.com` and HTTPS stay as they are.
- Pull request: tests + build only.
- Push to `main`: tests → `node scripts/build.mjs --out _site` → upload `_site/` → deploy.
- "Run workflow" (manual): same as a push, redeploys `main`.

Only `_site/` reaches the website — never `src/`, `scripts/`, `assets/data/prices.json` or this README.

Rollback: revert the faulty commit on `main` and push (the workflow redeploys the previous state). Emergency fallback to the old branch-based hosting: revert to a commit that still contains the generated pages and switch Settings → Pages back to "Deploy from a branch: main / (root)".

## Update the Google rating
The rating and review count come from `assets/data/reviews.json`. The build puts them into the trust strip, the reviews section, the meta description and the `aggregateRating` of the home page. They are updated by hand; nothing syncs them automatically.

1. Look up the current rating and count on the Google Business Profile.
2. Edit `rating` (one decimal, e.g. `5.0`), `count`, `updated` and `checked` (`YYYY-MM-DD`) in `assets/data/reviews.json`.
3. Open a pull request; merging it to `main` runs the tests and deploys.

Optional: `GOOGLE_PLACES_API_KEY=… node scripts/update-reviews.mjs` fetches the numbers from the Places API (New) locally. Never put the key into the repo.

## Legal pages
`src/pages/impressum.html` and `src/pages/datenschutz.html` were reviewed on 2026-10-21. `scripts/legal.test.mjs` pins the mandatory points. Update the Datenschutz whenever the site adds a new external service (fonts, maps, analytics, forms, embeds). The review note next to the Google reviews (§ 5b Abs. 3 UWG) must stay.

## Fonts / licensing
Saira and IBM Plex Sans are self-hosted (`assets/fonts/`), both SIL Open Font License, free for commercial use. The Google Maps embed loads only on the visitor's click. The logo mark is an original SVG.
