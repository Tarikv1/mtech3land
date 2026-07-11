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

## Fonts / licensing
Saira, IBM Plex Sans, JetBrains Mono — all SIL Open Font License, free for commercial use.
No third-party images are bundled; the logo mark is an original SVG.
