import { listedRows } from "./pages/model.mjs";

// Slim index for the price picker (assets/data/picker.json), devices in model order.
//   keys    repair slugs; a row is [index into keys, price | null]
//   parents model page parent urls; a device url is parents[p] + slug + "/", or `u` when it has no parent (p = -1)
//   types   {id, brands}: brand ids per device type, in the order of categories.groups
//   d       {s: slug, n: name, c: model codes joined by ", " (as the model page prints them), t: type, b: brand, p, u?, r: rows}
// The rows are the ones the model page lists (listedRows), so picker and page show the same prices.
export function pickerIndex(devices, categories, strings) {
  const keys = [];
  const keyAt = new Map();
  const parents = [];
  const parentAt = new Map();
  const at = (list, map, value) => {
    if (!map.has(value)) {
      map.set(value, list.length);
      list.push(value);
    }
    return map.get(value);
  };

  const d = devices.map((dev) => {
    const parentUrl = dev.parentId ? categories.parents[dev.parentId]?.url : null;
    const p = parentUrl && dev.url === `${parentUrl}${dev.slug}/` ? at(parents, parentAt, parentUrl) : -1;
    return {
      s: dev.slug,
      n: dev.name,
      c: dev.codes.join(", "),
      t: dev.type,
      b: dev.brand,
      p,
      ...(p < 0 ? { u: dev.url } : {}),
      r: listedRows(dev, categories, strings).map((row) => [at(keys, keyAt, row.slug), row.price]),
    };
  });

  const brands = new Map();
  for (const g of Object.values(categories.groups)) {
    if (!devices.some((dev) => dev.type === g.type && dev.brand === g.brand)) continue;
    const list = brands.get(g.type) ?? [];
    if (!list.includes(g.brand)) list.push(g.brand);
    brands.set(g.type, list);
  }
  const types = Object.keys(categories.types)
    .filter((id) => brands.has(id))
    .map((id) => ({ id, brands: brands.get(id) }));

  return { v: 1, keys, parents, types, d };
}
