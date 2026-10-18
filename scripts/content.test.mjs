import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = () => fs.readFileSync(path.join(root, "assets/css/styles.css"), "utf8");

const made = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

// Innermost rules of the stylesheet: [{selectors: [...], body}]. @media wrappers fall away
// because a rule body never contains braces.
function rules(text) {
  const out = [];
  for (const m of text.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selectors: m[1].split(",").map((s) => s.trim()).filter(Boolean), body: m[2] });
  }
  return out;
}

function htmlFiles(dir, rel = "") {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...htmlFiles(dir, r));
    else if (r.endsWith(".html")) out.push(r);
  }
  return out.sort();
}

test("no retired dark tokens", () => {
  const text = css().toLowerCase();
  for (const token of ["#0B0B0D", "#111116", "#16161C", "#1D1D24", "rgba(255,255,255,.08)"]) {
    assert.ok(!text.includes(token.toLowerCase()), `styles.css still uses ${token}`);
  }
});

test("headings not uppercase", () => {
  const heading = /(?:^|[^\w-])\.?h[12](?![\w-])/;
  const bad = rules(css())
    .filter((r) => r.selectors.some((s) => heading.test(s)) && /text-transform\s*:\s*uppercase/i.test(r.body))
    .map((r) => r.selectors.join(", "));
  assert.deepEqual(bad, []);
});

test("only footer is dark", () => {
  const dark = /background(-color)?:\s*var\(--ink\)/;
  const all = rules(css());
  const bad = all.filter((r) => dark.test(r.body) && !r.selectors.every((s) => s.startsWith(".foot"))).map((r) => r.selectors.join(", "));
  assert.deepEqual(bad, []);
  assert.ok(all.some((r) => dark.test(r.body)), "the footer should use the dark --ink background");
});

test("no third-party resources", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-content-"));
  made.push(dir);
  const { errors } = build({ root, outDir: dir, quiet: true });
  assert.deepEqual(errors, []);
  const files = htmlFiles(dir);
  assert.ok(files.length >= 5, files.join(", "));
  for (const file of files) {
    const html = fs.readFileSync(path.join(dir, file), "utf8");
    assert.doesNotMatch(html, /\ssrc="https?:/i, `${file}: external src`);
    for (const link of html.match(/<link\b[^>]*>/gi) ?? []) {
      if (/\srel="canonical"/i.test(link)) continue;
      assert.doesNotMatch(link, /\shref="https?:/i, `${file}: external ${link}`);
    }
    assert.doesNotMatch(html, /<iframe\b[^>]*\ssrc=/i, `${file}: iframe loads on page load`);
  }
});

test("no mono font left", () => {
  assert.ok(!/jetbrains/i.test(css()), "styles.css still mentions JetBrains");
  const fonts = fs.readdirSync(path.join(root, "assets/fonts"));
  assert.deepEqual(fonts.filter((f) => /^jetbrains/i.test(f)), []);
});

// WCAG 2 relative luminance of "#rgb" or "#rrggbb".
function luminance(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  assert.ok(m, `not a hex colour: ${hex}`);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Custom properties declared on :root (first declaration wins), with var() references resolved.
function tokens(text) {
  const raw = {};
  for (const r of rules(text)) {
    if (!r.selectors.includes(":root")) continue;
    for (const m of r.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) raw[m[1]] ??= m[2].trim();
  }
  const resolve = (value, depth = 0) => {
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    return ref && depth < 5 ? resolve(raw[ref[1]], depth + 1) : value;
  };
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, resolve(v)]));
}

const PAGE_BACKGROUNDS = ["#ffffff", "#faf7f5"]; // --bg, --bg-warm

test("input border token has 3:1 contrast", () => {
  const value = tokens(css())["--line-input"];
  assert.ok(value, "styles.css needs a --line-input token");
  for (const bg of PAGE_BACKGROUNDS) {
    const ratio = contrast(value, bg);
    assert.ok(ratio >= 3, `--line-input ${value} on ${bg} is ${ratio.toFixed(2)}:1`);
  }
});

test("form-control borders have 3:1 contrast", () => {
  const text = css();
  const tok = tokens(text);
  const control = /(?:^|[^\w-])(?:input|select|textarea)(?![\w-])/;
  const checked = [];
  for (const r of rules(text)) {
    if (!r.selectors.some((s) => control.test(s))) continue;
    for (const m of r.body.matchAll(/border(?:-color)?\s*:\s*([^;]+)/g)) {
      const colour = m[1].match(/var\(--[\w-]+\)|#[0-9a-f]{3,6}\b/i)?.[0];
      if (!colour) continue; // border:0
      const hex = colour.startsWith("var(") ? tok[colour.slice(4, -1)] : colour;
      for (const bg of PAGE_BACKGROUNDS) {
        const ratio = contrast(hex, bg);
        assert.ok(ratio >= 3, `${r.selectors.join(", ")}: border ${colour} on ${bg} is ${ratio.toFixed(2)}:1`);
      }
      checked.push(r.selectors.join(", "));
    }
  }
  assert.ok(checked.length > 0, "no form-control border found");
});

// Runs app.js against a minimal fake DOM that only has the map holder and its button, then clicks the button.
function clickMapLoader(mapSrc) {
  const handlers = {};
  const appended = [];
  let focused = null;
  const button = { addEventListener: (type, fn) => (handlers[type] = fn) };
  const holder = {
    innerHTML: "<button>",
    getAttribute: (name) => (name === "data-map-src" ? mapSrc : null),
    appendChild: (el) => appended.push(el),
  };
  const document = {
    readyState: "complete",
    documentElement: { classList: { contains: () => false, toggle() {} } },
    getElementById: (id) => ({ mapLoad: button, mapHolder: holder })[id] ?? null,
    querySelector: () => null,
    addEventListener() {},
    createElement: (tag) => ({
      tag,
      attrs: {},
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
      focus() {
        focused = this;
      },
    }),
  };
  const window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8"), { window, document, setTimeout });
  assert.equal(typeof handlers.click, "function", "map button has no click handler");
  handlers.click();
  return { appended, holder, focused: () => focused };
}

test("map loader ignores a missing map source", () => {
  for (const src of [null, ""]) {
    const { appended, holder } = clickMapLoader(src);
    assert.equal(appended.length, 0, `iframe injected for data-map-src=${JSON.stringify(src)}`);
    assert.equal(holder.innerHTML, "<button>", "the load button must stay");
  }
});

test("map loader moves focus to the map", () => {
  const { appended, holder, focused } = clickMapLoader("https://maps.example/embed");
  assert.equal(appended.length, 1);
  assert.equal(appended[0].tag, "iframe");
  assert.equal(appended[0].src, "https://maps.example/embed");
  assert.equal(holder.innerHTML, "");
  assert.equal(focused(), appended[0], "keyboard focus must land on the iframe");
});
