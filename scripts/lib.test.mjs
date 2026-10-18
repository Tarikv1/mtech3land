import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeEntities, normalizeGroup, displayName, modelCodes, baseSlug, resolveSlugs,
  loadJson, buildDevices, priceOf, cheapest, displayFrom,
} from "./lib.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const prices = loadJson(root, "assets/data/prices.json");
const categories = loadJson(root, "src/categories.json");
const strings = loadJson(root, "src/strings.json");
const devices = buildDevices(prices, categories, strings, {});
const dev = (name) => devices.find((d) => d.device === name);

test("decodes entities and trims groups", () => {
  assert.equal(decodeEntities("13,3&#8243; Pro &amp; Max"), "13,3″ Pro & Max");
  assert.equal(decodeEntities("&amp;#8243;"), "&#8243;");
  assert.equal(normalizeGroup("MacBook "), "MacBook");
});

test("decodes and escapes names", () => {
  assert.equal(displayName("Apple MacBook Air 13,3&#8243; (A1369)"), "MacBook Air 13,3″");
  assert.equal(displayName("Apple iPad 10.2 (2019) (A2197 / A2198 / A2200 / iPad 7)"), "iPad 10.2 (2019)");
  assert.equal(displayName("Apple Watch"), "Apple Watch");
  assert.equal(displayName("Playstation 4 Slim"), "PlayStation 4 Slim");
  assert.deepEqual(modelCodes("Huawei P30 Lite (MAR-LX1A)"), ["MAR-LX1A"]);
});

test("only 19xx/20xx groups are release years", () => {
  assert.equal(displayName("Microsoft Surface Pro 7 (1866)"), "Microsoft Surface Pro 7");
  assert.deepEqual(modelCodes("Microsoft Surface Pro 7 (1866)"), ["1866"]);
  assert.deepEqual(modelCodes("Apple iPad 10.2 (2019) (A2197 / A2198)"), ["A2197", "A2198"]);
  assert.throws(() => resolveSlugs([{ device: "Surface Pro 7 (1866)" }, { device: "Surface Pro 7 (1876)" }]), /slug collision: surface-pro-7/);
});

test("base slugs", () => {
  assert.equal(baseSlug("Apple iPhone 13 Pro"), "iphone-13-pro");
  assert.equal(baseSlug("Samsung Galaxy S22 Ultra"), "galaxy-s22-ultra");
  assert.equal(baseSlug("Google Pixel 4a (G025J  / G025N)"), "pixel-4a");
  assert.equal(baseSlug("Playstation 5"), "ps5");
  assert.equal(baseSlug("Microsoft Surface Pro 7 (1866)"), "surface-pro-7");
  assert.equal(baseSlug("Huawei P30"), "huawei-p30");
});

test("resolves all collisions in real data", () => {
  const m = resolveSlugs(prices.devices);
  assert.equal(new Set(m.values()).size, prices.devices.length);
  assert.equal(m.get("Apple iPad 10.2 (2019) (A2197 / A2198 / A2200 / iPad 7)"), "ipad-10-2-2019");
  assert.equal(m.get("Apple MacBook Pro 13&#8243; (A2338)"), "macbook-pro-13-a2338");
  assert.equal(m.get("Apple MacBook Air 13,3&#8243; (A1369)"), "macbook-air-13-3-a1369");
  assert.equal(m.get("Apple MacBook Air 11,6&#8243; (A1465)"), "macbook-air-11-6");
});

test("colliding slug without year or A-code throws", () => {
  assert.throws(() => resolveSlugs([{ device: "Foo 1" }, { device: "Foo 1 (X)" }]), /slug collision: foo-1/);
});

test("every group and repair slug is mapped", () => {
  assert.equal(buildDevices(prices, categories, strings, {}).length, prices.devices.length);
});

test("device names are unique", () => {
  assert.equal(new Set(devices.map((d) => d.name)).size, devices.length);
  assert.equal(dev("Apple MacBook Pro 13&#8243; (A2338)").name, "MacBook Pro 13″ (A2338)");
  assert.equal(dev("Apple MacBook Air 11,6&#8243; (A1465)").name, "MacBook Air 11,6″");
  assert.equal(dev("Apple iPad 10.2 (2019) (A2197 / A2198 / A2200 / iPad 7)").name, "iPad 10.2 (2019)");
});

test("watch uses its own page url", () => {
  assert.equal(dev("Apple Watch").url, "/apple-watch-reparatur/");
});

test("device urls use the parent url and slug", () => {
  assert.equal(dev("Apple iPhone 14 Pro").url, "/iphone-reparatur/iphone-14-pro/");
  assert.equal(dev("Apple iPhone 14 Pro").group, "iPhone");
  assert.equal(dev("Apple MacBook Pro 13&#8243; (A2338)").group, "MacBook");
});

test("rows sorted, originals after standard", () => {
  const slugs = dev("Apple iPhone 14 Pro").repairs.map((r) => r.slug);
  const pri = dev("Apple iPhone 14 Pro").repairs.map((r) => r.priority);
  for (let i = 1; i < pri.length; i++) assert.ok(pri[i] >= pri[i - 1]);
  const akku = slugs.indexOf("akku");
  assert.ok(akku >= 0);
  assert.equal(slugs.indexOf("akku-original-irp"), akku + 1);
  assert.ok(slugs.indexOf("ladebuchse") > akku + 1);
  assert.equal(slugs.at(-1), "fehleranalyse");
  const orig = dev("Apple iPhone 14 Pro").repairs.find((r) => r.slug === "akku-original-irp");
  assert.equal(orig.original, true);
  assert.equal(orig.priority, 4.5);
  assert.equal(orig.labelKey, "repair.akku-original-irp");
});

test("type extras are appended as unpriced rows", () => {
  const ps = devices.find((d) => d.type === "playstation");
  assert.deepEqual(ps.extras.map((r) => r.slug), ["laufwerk", "luefter"]);
  assert.ok(ps.extras.every((r) => r.price === null && r.priority === 40));
  assert.deepEqual(devices.find((d) => d.type === "laptop").extras.map((r) => r.slug), ["komponentenwechsel"]);
  assert.deepEqual(dev("Apple iPhone 14 Pro").extras, []);
});

test("price helpers", () => {
  const d = dev("Apple iPhone 14 Pro");
  assert.equal(priceOf(d, "display"), null);
  assert.equal(priceOf(d, "display-original-irp"), 405);
  assert.equal(priceOf(d, "nope"), null);
  assert.equal(cheapest(d).price, Math.min(...d.repairs.filter((r) => r.price != null).map((r) => r.price)));
  assert.equal(cheapest({ repairs: [{ slug: "x", price: null }] }), null);
});

test("display from takes original when standard missing", () => {
  assert.equal(displayFrom(dev("Apple iPhone 14 Pro")), 405);
  assert.equal(displayFrom({ repairs: [] }), null);
});

test("devices follow order within a group, rest alphabetical at the end", () => {
  const all = buildDevices(prices, categories, strings, {}).filter((d) => d.group === "iPhone").map((d) => d.slug);
  const pick = all[all.length - 1];
  const ordered = buildDevices(prices, categories, strings, { iPhone: [pick, "iphone-14-pro"] }).filter((d) => d.group === "iPhone").map((d) => d.slug);
  assert.deepEqual(ordered.slice(0, 2), [pick, "iphone-14-pro"]);
  const rest = ordered.slice(2);
  assert.deepEqual(rest, all.filter((s) => s !== pick && s !== "iphone-14-pro"));
});

test("unknown group throws", () => {
  assert.throws(() => buildDevices({ devices: [{ group: "Toaster", device: "X", repairs: [] }] }, categories, strings, {}), /unmapped group: Toaster/);
});

test("unmapped repair throws", () => {
  const p = { devices: [{ group: "iPhone", device: "Apple iPhone 99", repairs: [{ slug: "zauber", price: 1 }] }] };
  assert.throws(() => buildDevices(p, categories, strings, {}), /unmapped repair: zauber/);
});

test("every repair slug has a DE and EN label", () => {
  for (const slug of Object.keys(categories.repairPriority)) {
    assert.ok(strings.de[`repair.${slug}`], `de repair.${slug}`);
    assert.ok(strings.en[`repair.${slug}`], `en repair.${slug}`);
  }
});

test("plus sign becomes a word in slugs but stays in display names", () => {
  assert.equal(baseSlug("Samsung Galaxy S23+"), "galaxy-s23-plus");
  assert.equal(baseSlug("Samsung Galaxy S10 Plus (G975F)"), "galaxy-s10-plus");
  assert.equal(displayName("Samsung Galaxy S23+ (SM-S916B)"), "Samsung Galaxy S23+");
});

test("N/A code tokens are ignored", () => {
  assert.deepEqual(modelCodes("Google Pixel 3 (N/A)"), []);
  assert.deepEqual(modelCodes("Google Pixel 5a 5G (n/a, G1F8F)"), ["G1F8F"]);
  assert.equal(displayName("Google Pixel 3 (N/A)"), "Google Pixel 3");
});

test("four-digit groups beyond 20xx are model codes, not years", () => {
  assert.equal(displayName("Microsoft Surface Pro 9 (2038)"), "Microsoft Surface Pro 9");
  assert.deepEqual(modelCodes("Microsoft Surface Pro 9 (2038)"), ["2038"]);
  assert.equal(displayName("Microsoft Surface Go 4 (2067)"), "Microsoft Surface Go 4");
  assert.equal(displayName("Apple iPad 10.2 (2019) (A2197)"), "iPad 10.2 (2019)");
  assert.deepEqual(modelCodes("Apple iPad 10.2 (2019) (A2197)"), ["A2197"]);
  assert.equal(displayName("Apple iPad Air 13 (2029)"), "iPad Air 13 (2029)");
});
