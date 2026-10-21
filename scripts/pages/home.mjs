import { esc, loadPartials, page, render, waLink } from "../html.mjs";
import { loadJson } from "../lib.mjs";
import { filler } from "./hub.mjs";
import { contactHtml, sectionsHtml, str } from "./model.mjs";

// The home page: hero, trust strip, services, price picker, promo, steps, reviews, FAQ, contact.
// Copy lives in strings.json (home.*); numbers come from the data files at build time.
const SOURCE = "strings.json (home.*)";
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 155;
const LANGS = ["de", "en"];
const FAQ_COUNT = 6;
const TITLE = "Handy-, Tablet- & Laptop-Reparatur in Weil am Rhein";
const DESCRIPTION =
  "Handy-, Tablet-, Laptop- und PlayStation-Reparatur in Weil am Rhein, nahe Basel. Preise online, Handys oft in 30 Min. {rating} ★ bei {count} Google-Bewertungen.";
// Star rows are decorative (aria-hidden): the rating is always written out next to them.
// The overall rating shows Math.round(rating) filled stars and outlines the rest; a quoted review card shows five.
const starRow = (rating) => {
  const full = Math.round(rating);
  return `<span class="stars" aria-hidden="true">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>`;
};
const FIVE_STARS = starRow(5);

// Google reviews quoted on the old home page (main:index.html), kept in German as the customers wrote them.
const QUOTES = [
  { name: "Özgür H.", text: "„Sehr freundlich, kompetent und zuverlässig. Mein Handy wurde schnell und professionell repariert. Klare Empfehlung!“" },
  { name: "Bilal T.", text: "„Ausgezeichneter Service! Schnelle und zuverlässige Hilfe, sehr freundlich und kompetent. Absolut empfehlenswert.“" },
  { name: "Susi D.", text: "„Superschnelle Reparatur. Sehr freundlicher Inhaber. Daumen hoch! 👍“" },
];

// one tile per service page: icon from partials/icons.html, title and text keys from strings.json
const SERVICES = [
  { url: "/handy-reparatur/", icon: "mobile", title: "type.handy", text: "home.svc.handy" },
  { url: "/tablet-reparatur/", icon: "tablet", title: "type.tablet", text: "home.svc.tablet" },
  { url: "/laptop-reparatur/", icon: "laptop", title: "type.laptop", text: "home.svc.laptop" },
  { url: "/playstation-reparatur/", icon: "gamepad", title: "type.playstation", text: "home.svc.playstation" },
  { url: "/fehlerdiagnose/", icon: "stethoscope", title: "repair.fehleranalyse", text: "home.svc.diagnose" },
  { url: "/datenrettung/", icon: "data", title: "home.svc.data.title", text: "home.svc.data" },
];

// LocalBusiness facts not in site.json, as on the old home page; opening days keyed by the English label in site.json
const GEO = { "@type": "GeoCoordinates", latitude: 47.5937219, longitude: 7.6266889 };
const DAYS = { "Mon–Fri": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], Sat: "Saturday" };

function checkReviews(r) {
  if (typeof r?.rating !== "number" || !(r.rating >= 1 && r.rating <= 5)) throw new Error(`reviews.json: rating ${r?.rating} must be a number from 1 to 5`);
  if (!Number.isInteger(r.count) || r.count < 0) throw new Error(`reviews.json: count ${r.count} must be a whole number`);
  return r;
}

// ctx: {root, site, strings, partials, versions, devices, categories} -> [{rec: PageRec, html}]
export function homePages(ctx) {
  const { root, site, strings, devices, categories } = ctx;
  const partials = ctx.partials ?? loadPartials(root);
  const reviews = checkReviews(loadJson(root, "assets/data/reviews.json"));
  const rating = { de: reviews.rating.toFixed(1).replace(".", ","), en: reviews.rating.toFixed(1) };

  // {rating} {count} from reviews.json and {min.<type>.<repair>} over one device type here; the hub filler does the rest
  const fillAll = filler(site, devices, SOURCE);
  const fill = (text, lang) =>
    fillAll(
      text.replace(/\{(rating|count)\}|\{min\.([a-z]+)\.([a-z0-9-]+)\}/g, (match, key, type, slug) => {
        if (key) return key === "rating" ? rating[lang] : String(reviews.count);
        if (!Object.hasOwn(categories.types, type)) throw new Error(`${SOURCE}: unknown device type in ${match}`);
        return filler(site, devices.filter((d) => d.type === type), SOURCE)(`{min.${slug}}`, lang);
      }),
      lang,
    );

  const tx = (key) => str(strings, "de", key);
  const pair = (key) => ({ de: str(strings, "de", key), en: str(strings, "en", key) });
  // shared UI text: <tag attrs data-i18n="key">German text</tag>
  const tr = (tag, key, attrs = "") => `<${tag}${attrs} data-i18n="${key}">${esc(tx(key))}</${tag}>`;
  const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  // the page's own text, filled from the data in both languages; values are HTML-escaped (i18n.js sets innerHTML).
  // A price never breaks between the number and "€" (no-break space).
  const own = { de: {}, en: {} };
  const put = (key, value) => {
    for (const lang of LANGS) own[lang][key] = esc(fill(value[lang], lang).replace(/(\d) €/g, "$1 €"));
  };
  const pt = (tag, key, attrs = "") => `<${tag}${attrs} data-i18n="${key}">${own.de[key]}</${tag}>`;
  put("page.promo", site.promo);
  put("page.rating", rating);
  put("page.reviews", pair("home.trust.reviews"));
  put("page.rev.title", pair("home.rev.title"));
  put("page.rev.lede", pair("home.rev.lede"));
  for (let i = 0; i < FAQ_COUNT; i++) {
    put(`faq.${i}.q`, pair(`home.faq.${i}.q`));
    put(`faq.${i}.a`, pair(`home.faq.${i}.a`));
  }

  const title = TITLE;
  const description = fill(DESCRIPTION, "de");
  if (title.length > MAX_TITLE) throw new Error(`home: title has ${title.length} chars (max ${MAX_TITLE}): ${title}`);
  if (description.length > MAX_DESCRIPTION) throw new Error(`home: description has ${description.length} chars (max ${MAX_DESCRIPTION})`);
  const waHref = esc(waLink(site, tx("wa.greeting")));

  const ratingStars = starRow(reviews.rating);
  const trust = render(partials.trust, { t: strings.de, trust: { stars: ratingStars, rating: own.de["page.rating"], reviews: own.de["page.reviews"] } }, partials);
  const hero = `<section class="hero">
  <div class="wrap hero__inner">
    <div class="hero__copy">
      <p class="promo">${icon("tag")}${pt("span", "page.promo")}</p>
      ${tr("h1", "home.h1", ' class="h1"')}
      ${tr("p", "home.lede", ' class="lede"')}
      <div class="home__cta">
        <a class="btn btn--primary" href="#preise">${icon("search")}${tr("span", "home.cta.price")}</a>
        <a class="btn btn--ghost" href="${esc(site.phoneHref)}">${icon("phone")}${tr("span", "cta.call")}</a>
      </div>
      ${trust}
    </div>
    <figure class="hero__photo">
      <img src="/assets/img/storefront.jpg" width="1400" height="1050" fetchpriority="high" alt="${esc(tx("home.photo.shop"))}" data-i18n-attr="alt:home.photo.shop">
    </figure>
  </div>
</section>`;

  const services = `${tr("h2", "home.svc.title", ' class="h2"')}
${tr("p", "home.svc.lede", ' class="lede"')}
<ul class="tiles tiles--svc">
  ${SERVICES.map((s) => `<li><a class="tile tile--svc" href="${s.url}">${icon(s.icon)}<span>${tr("strong", s.title)}${tr("small", s.text)}</span></a></li>`).join("\n  ")}
</ul>`;

  const prices = `${tr("h2", "home.prices.title", ' class="h2"')}
${tr("p", "home.prices.lede", ' class="lede"')}
${render(partials.picker, { site, t: strings.de, picker: { idAttr: ' id="preise"', type: "", brand: "" } }, partials)}
<div class="cta-box home__promo">
  <div>
    <p class="promo">${icon("tag")}${tr("span", "home.promo.tag")}</p>
    ${pt("p", "page.promo", ' class="h3"')}
    ${tr("p", "home.promo.text")}
  </div>
  <a class="btn btn--wa" href="${waHref}" target="_blank" rel="noopener">${icon("whatsapp")}${tr("span", "cta.whatsapp")}</a>
</div>`;

  const steps = `${tr("h2", "home.how.title", ' class="h2"')}
<ol class="steps">
  ${[1, 2, 3].map((n) => `<li class="step">${tr("h3", `home.how.${n}.title`)}${tr("p", `home.how.${n}.text`)}</li>`).join("\n  ")}
</ol>`;

  const quotes = QUOTES.map(
    (q) => `<figure class="review">
  ${FIVE_STARS}
  <blockquote><p>${esc(q.text)}</p></blockquote>
  <figcaption><cite>${esc(q.name)}</cite> · ${tr("span", "home.rev.src")}</figcaption>
</figure>`,
  );
  const reviewsHtml = `<h2 class="h2">${pt("span", "page.rev.title")} ${ratingStars}</h2>
${pt("p", "page.rev.lede", ' class="lede"')}
<div class="reviews">
${quotes.join("\n")}
</div>
${tr("p", "home.rev.note", ' class="prose__note"')}
<p><a class="btn btn--ghost" href="${esc(site.mapsUrl)}" target="_blank" rel="noopener">${tr("span", "home.rev.all")}</a></p>`;

  const faq = `${tr("h2", "model.faq.title", ' class="h2"')}
<div class="faq">
${Array.from({ length: FAQ_COUNT }, (_, i) => `<details>${pt("summary", `faq.${i}.q`)}${pt("p", `faq.${i}.a`)}</details>`).join("\n")}
</div>`;

  const contact = `${contactHtml(site, strings)}
<div class="home__cta">
  <a class="btn btn--wa" href="${waHref}" target="_blank" rel="noopener">${icon("whatsapp")}${tr("span", "cta.whatsapp")}</a>
  <a class="btn btn--ghost" href="${esc(site.mapsUrl)}" target="_blank" rel="noopener">${icon("pin")}${tr("span", "home.contact.maps")}</a>
</div>
<div class="home__media">
  <img src="/assets/img/interior.jpg" width="591" height="1050" loading="lazy" alt="${esc(tx("home.photo.inside"))}" data-i18n-attr="alt:home.photo.inside">
  <div class="map" id="mapHolder" data-map-src="${esc(site.mapEmbed)}">
    <button id="mapLoad" type="button">${icon("pin")}${tr("strong", "home.map.load")}${tr("small", "home.map.note")}</button>
  </div>
</div>`;

  const body = `${hero}
${sectionsHtml(
  [
    { id: "leistungen", html: services },
    prices,
    { id: "ablauf", html: steps },
    { id: "bewertungen", html: reviewsHtml },
    faq,
    { id: "kontakt", html: contact },
  ],
  "home",
)}`;

  const business = {
    "@context": "https://schema.org",
    "@type": "MobilePhoneStore",
    "@id": `${site.origin}/#business`,
    name: site.name,
    image: `${site.origin}/assets/img/storefront.jpg`,
    url: `${site.origin}/`,
    telephone: site.phoneHref.replace(/^tel:/, ""),
    priceRange: "€€",
    currenciesAccepted: "EUR",
    address: { "@type": "PostalAddress", streetAddress: site.street, postalCode: site.zip, addressLocality: site.city, addressCountry: "DE" },
    geo: GEO,
    aggregateRating: { "@type": "AggregateRating", ratingValue: rating.en, reviewCount: String(reviews.count) },
    openingHoursSpecification: site.hours.map((h) => {
      if (!Object.hasOwn(DAYS, h.days.en)) throw new Error(`home: no schema.org days for opening hours "${h.days.en}"`);
      return { "@type": "OpeningHoursSpecification", dayOfWeek: DAYS[h.days.en], opens: h.open, closes: h.close };
    }),
  };

  return [
    {
      rec: { path: "/", file: "index.html", indexable: true, title, description, h1: tx("home.h1") },
      html: page({ site, strings, partials, versions: ctx.versions, path: "/", title, description, body, jsonld: [business], pageStrings: own, picker: true }),
    },
  ];
}
