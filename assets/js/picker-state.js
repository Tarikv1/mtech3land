/* ============================================================
   Mtech3land — price picker: state, URL hash, search
   Pure functions, no DOM. A plain script in the browser (window.MTPicker),
   a CommonJS module in the tests. `index` is assets/data/picker.json.
   ============================================================ */
(function () {
  "use strict";

  var FIELDS = ["t", "b", "m"]; // type, brand, model slug
  var MAX_RESULTS = 12;
  // "meine Apple Watch", "meine PlayStation"; mirrors FEMININE_TYPES in scripts/pages/model.mjs (a test compares both)
  var FEMININE = { smartwatch: true, playstation: true };
  var cache = new WeakMap();

  /* ---------- index access ---------- */
  function brandsFor(index, t) {
    var types = (index && index.types) || [];
    for (var i = 0; i < types.length; i++) if (types[i].id === t) return types[i].brands.slice();
    return [];
  }

  function devicesFor(index, t, b) {
    return ((index && index.d) || []).filter(function (d) { return d.t === t && d.b === b; });
  }

  // per index: devices by slug and the normalised search text of each device
  function lookup(index) {
    var c = cache.get(index);
    if (c) return c;
    c = { slug: Object.create(null), hay: [], name: [] };
    index.d.forEach(function (d, i) {
      c.slug[d.s] = d;
      c.name[i] = normalizeQuery(d.n);
      c.hay[i] = normalizeQuery(d.n + " " + d.c);
    });
    cache.set(index, c);
    return c;
  }

  function findDevice(index, slug) {
    if (!index || !index.d || typeof slug !== "string") return null;
    return lookup(index).slug[slug] || null;
  }

  function deviceUrl(index, d) {
    return d.p >= 0 ? index.parents[d.p] + d.s + "/" : d.u;
  }

  /* ---------- state <-> URL hash ---------- */
  // Keeps each field only while it is valid under the ones before it: an unknown value empties that field and the rest.
  function clean(index, state) {
    var out = { t: null, b: null, m: null };
    if (!index || !state) return out;
    var t = state.t;
    if (typeof t !== "string" || !brandsFor(index, t).length) return out;
    out.t = t;
    var b = state.b;
    if (typeof b !== "string" || brandsFor(index, t).indexOf(b) < 0) return out;
    out.b = b;
    var d = findDevice(index, state.m);
    if (d && d.t === t && d.b === b) out.m = d.s;
    return out;
  }

  function fieldsOf(hash) {
    var out = { t: null, b: null, m: null };
    if (typeof hash !== "string") return out;
    hash.replace(/^#/, "").split("&").forEach(function (pair) {
      var eq = pair.indexOf("=");
      var key = pair.slice(0, eq);
      if (eq < 1 || FIELDS.indexOf(key) < 0 || out[key] !== null) return; // the first occurrence wins
      try { out[key] = decodeURIComponent(pair.slice(eq + 1)) || null; } catch (e) { /* malformed escape: field stays empty */ }
    });
    return out;
  }

  function parseHash(hash, index) {
    return clean(index, fieldsOf(hash));
  }

  function toHash(state) {
    var parts = [];
    FIELDS.forEach(function (k) {
      var v = state && state[k];
      if (typeof v === "string" && v) parts.push(k + "=" + encodeURIComponent(v));
    });
    return parts.length ? "#" + parts.join("&") : "";
  }

  /* ---------- search ---------- */
  function normalizeQuery(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/,/g, ".")
      .replace(/[″"']/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Every word of the query must occur in the name or the model codes. An exact name comes first, then names that
  // start with the query, then the rest; each group keeps the order of the index (newest first).
  function search(index, q) {
    var query = normalizeQuery(q);
    if (!query || !index || !index.d) return [];
    var words = query.split(" ");
    var c = lookup(index);
    var tiers = [[], [], []];
    index.d.forEach(function (d, i) {
      var hay = c.hay[i];
      for (var k = 0; k < words.length; k++) if (hay.indexOf(words[k]) < 0) return;
      tiers[c.name[i] === query ? 0 : c.name[i].indexOf(query) === 0 ? 1 : 2].push(d);
    });
    return tiers[0].concat(tiers[1], tiers[2]).slice(0, MAX_RESULTS);
  }

  /* ---------- result card ---------- */
  // "Modellnummern: A2696, A2757, A2777, iPad 10": the line of the model page; d.c already holds the codes joined by ", "
  function modelNumbers(label, d) {
    return d.c ? label + " " + d.c : "";
  }

  // scrollIntoView options for a shared link: smooth unless the visitor asks for reduced motion
  function revealOptions(reduceMotion) {
    return { block: "start", behavior: reduceMotion ? "auto" : "smooth" };
  }

  /* ---------- WhatsApp (same text and link as the model pages) ---------- */
  function isFeminine(type) {
    return FEMININE[type] === true;
  }

  function waMessage(name, type) {
    return "Hallo, ich brauche eine Reparatur für " + (isFeminine(type) ? "meine" : "mein") + " " + name + ".";
  }

  function waUrl(number, text) {
    return "https://wa.me/" + number + "?text=" + encodeURIComponent(text);
  }

  var API = {
    parseHash: parseHash,
    toHash: toHash,
    clean: clean,
    normalizeQuery: normalizeQuery,
    search: search,
    brandsFor: brandsFor,
    devicesFor: devicesFor,
    findDevice: findDevice,
    deviceUrl: deviceUrl,
    modelNumbers: modelNumbers,
    revealOptions: revealOptions,
    isFeminine: isFeminine,
    waMessage: waMessage,
    waUrl: waUrl
  };

  if (typeof module !== "undefined") module.exports = API;
  else window.MTPicker = API;
})();
