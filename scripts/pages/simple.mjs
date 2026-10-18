import path from "node:path";
import { esc, page, readText, render } from "../html.mjs";

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// "/x/" -> "x/index.html"; "/404.html" -> "404.html"
export const fileOf = (urlPath) => (urlPath.endsWith("/") ? `${urlPath.slice(1)}index.html` : urlPath.slice(1));

const plain = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const h1Of = (html) => plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");

const LEGAL = [
  { path: "/impressum/", source: "impressum", label: "Impressum", describe: (s) => `Impressum von ${s.name}, ${s.street}, ${s.zip} ${s.city}.` },
  { path: "/datenschutz/", source: "datenschutz", label: "Datenschutzerklärung", describe: (s) => `Datenschutzerklärung von ${s.name}, ${s.city}.` },
];

const STUBS = [
  { path: "/macbook-laptop-reparatur/", target: "/laptop-reparatur/" },
  { path: "/konsolen-reparatur/", target: "/playstation-reparatur/" },
];

const STUB_BODY = `<section class="section">
  <div class="wrap prose">
    <h1 data-i18n="stub.title">{{{t.stub.title}}}</h1>
    <p><span data-i18n="stub.text">{{{t.stub.text}}}</span> <a href="{{target}}" data-i18n="stub.link">{{{t.stub.link}}}</a></p>
  </div>
</section>`;

// ctx: {root, site, strings, partials, versions} -> [{rec: PageRec, html}]
export function simplePages(ctx) {
  const { root, site, strings } = ctx;
  const t = strings.de;
  const base = { site, strings, partials: ctx.partials, versions: ctx.versions };
  const out = [];
  const add = (rec, html) => out.push({ rec, html });

  for (const legal of LEGAL) {
    const body = readText(path.join(root, "src", "pages", `${legal.source}.html`)).replace(/\n+$/, "");
    const title = `${legal.label} – ${site.name}`;
    const description = legal.describe(site);
    add(
      { path: legal.path, file: fileOf(legal.path), indexable: true, title, description, h1: h1Of(body) },
      page({ ...base, path: legal.path, title, description, body }),
    );
  }

  {
    const body = render(readText(path.join(root, "src", "pages", "404.html")).replace(/\n+$/, ""), { t }, {});
    const title = `${t["err404.title"]} – ${site.name}`;
    add(
      { path: "/404.html", file: "404.html", indexable: false, title, description: t["err404.text"], h1: h1Of(body) },
      page({ ...base, path: "/404.html", title, description: t["err404.text"], body, noindex: true }),
    );
  }

  // Redirect stubs: the page is rendered with the target as its canonical path.
  for (const stub of STUBS) {
    const body = render(STUB_BODY, { t, target: stub.target }, {});
    const title = `${t["stub.title"]} – ${site.name}`;
    const extraHead = `<meta http-equiv="refresh" content="0; url=${esc(stub.target)}">\n<script>location.replace(${JSON.stringify(stub.target)})</script>`;
    add(
      { path: stub.path, file: fileOf(stub.path), indexable: false, title, description: t["stub.text"], h1: h1Of(body) },
      page({ ...base, path: stub.target, title, description: t["stub.text"], body, noindex: true, extraHead }),
    );
  }

  return out;
}

export const robotsTxt = (site) =>
  ["User-agent: *", "Allow: /", "", `Sitemap: ${site.origin}/sitemap.xml`, ""].join("\n");

export function sitemapXml(site, pages) {
  const paths = pages.filter((p) => p.indexable).map((p) => p.path).sort(cmp);
  const urls = paths.map((p) => `  <url><loc>${esc(site.origin + p)}</loc></url>\n`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}</urlset>\n`;
}
