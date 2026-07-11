/* ============================================================
   Mtech3land — app logic
   Loads prices.json → services, featured, and a clear price MATRIX
   (device rows × repair columns), wires the WhatsApp form, motion.
   ============================================================ */
(function () {
  "use strict";

  var PHONE = "4915753815179";
  var WA = "https://wa.me/" + PHONE;
  var T = function (k) { return window.MT ? MT.tr(k) : k; };
  var lang = function () { return window.MT ? MT.lang : "de"; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var DATA = [];
  var GROUP_ORDER = [];
  var activeGroup = "iPhone";

  /* ---------- inline icons ---------- */
  var ICON = {
    phone: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
    tablet: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M10.5 17.5h3"/></svg>',
    laptop: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20l-1.5-2H3.5z"/></svg>',
    console: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 8h10a4 4 0 014 4.5l-.6 4.2A2.5 2.5 0 0116 18l-1.5-2h-5L8 18a2.5 2.5 0 01-4.4-1.3L3 12.5A4 4 0 017 8z"/><path d="M6.5 11.5v2M5.5 12.5h2M15.5 11.5h.01M17.5 13.5h.01"/></svg>',
    shield: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    data: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/></svg>'
  };

  /* ---------- services ---------- */
  var SERVICES = [
    { icon: "phone", t: { de: "Smartphone", en: "Smartphone" },
      d: { de: "Display, Akku, Ladebuchse, Kamera, Wasserschaden — iPhone, Samsung, Google, Huawei & mehr.",
           en: "Screen, battery, charging port, camera, water damage — iPhone, Samsung, Google, Huawei & more." },
      tags: ["Display", "Akku", "Ladebuchse"] },
    { icon: "tablet", t: { de: "Tablet & iPad", en: "Tablet & iPad" },
      d: { de: "Gebrochenes Glas, LCD, Akku und Anschlüsse für iPad & Android-Tablets.",
           en: "Cracked glass, LCD, battery and ports for iPad & Android tablets." },
      tags: ["Glas", "LCD", "Akku"] },
    { icon: "laptop", t: { de: "Laptop & PC", en: "Laptop & PC" },
      d: { de: "MacBook & Notebooks: Display, Tastatur, Akku, SSD-Upgrade, Reinigung.",
           en: "MacBook & notebooks: display, keyboard, battery, SSD upgrade, cleaning." },
      tags: ["Display", "Tastatur", "SSD"] },
    { icon: "console", t: { de: "Spielekonsole", en: "Game console" },
      d: { de: "PlayStation 4 & 5: HDMI-Anschluss, Laufwerk, Lüfter und Netzteil.",
           en: "PlayStation 4 & 5: HDMI port, drive, fan and power supply." },
      tags: ["PS5", "PS4", "HDMI"] },
    { icon: "shield", t: { de: "Panzerglas & Zubehör", en: "Protector & accessories" },
      d: { de: "Schutzglas ab 9,99 € inkl. gratis Reinigung — dazu Hüllen, Kabel & Ladegeräte.",
           en: "Protector from €9.99 incl. free cleaning — plus cases, cables & chargers." },
      tags: ["9,99 €", "Hüllen", "Kabel"] },
    { icon: "data", t: { de: "Datenrettung", en: "Data recovery" },
      d: { de: "Fotos & Daten von defekten Geräten retten — diskret und sicher.",
           en: "Recover photos & data from dead devices — discreet and safe." },
      tags: ["Fotos", "Backup"] }
  ];

  /* ---------- group labels ---------- */
  var GROUPS = {
    "iPhone": { de: "iPhone", en: "iPhone" },
    "Samsung": { de: "Samsung", en: "Samsung" },
    "iPad": { de: "iPad", en: "iPad" },
    "MacBook": { de: "MacBook", en: "MacBook" },
    "Notebook": { de: "Notebook / PC", en: "Notebook / PC" },
    "Google": { de: "Google Pixel", en: "Google Pixel" },
    "Huawei": { de: "Huawei", en: "Huawei" },
    "Spielekonsole": { de: "Konsole", en: "Console" },
    "Watch": { de: "Apple Watch", en: "Apple Watch" }
  };
  function gkey(g) { return (g || "").trim(); }
  function glabel(g) { var e = GROUPS[gkey(g)]; return e ? (e[lang()] || e.de) : gkey(g); }

  /* ---------- repair canonicalisation (slug -> column) ---------- */
  // Merges variants (e.g. display + display-original-irp) into one comparable column.
  var CANON = {
    "display": "Display", "display-original-irp": "Display",
    "lcd": "LCD", "displayglas": "Displayglas", "digitizer-glas": "Displayglas",
    "akku": "Akku", "akku-original-irp": "Akku",
    "ladebuchse": "Ladebuchse",
    "main-kamera": "Rückkamera", "front-kamera": "Frontkamera", "kameraglas": "Kameraglas",
    "backcover": "Backcover", "wasserschaden": "Wasserschaden",
    "hoermuschel": "Hörmuschel", "hörmuschel": "Hörmuschel",
    "tastatur": "Tastatur", "trackpad": "Trackpad", "touchbar": "Touchbar",
    "hdmi-anschluss": "HDMI", "netzteil": "Netzteil",
    "grundreinigung": "Reinigung", "fehleranalyse": "Diagnose"
  };
  var COL_PRI = {
    "Display": 1, "LCD": 2, "Displayglas": 3, "Akku": 4, "Ladebuchse": 5,
    "Rückkamera": 6, "Frontkamera": 7, "Kameraglas": 8, "Backcover": 9,
    "Wasserschaden": 10, "Tastatur": 11, "Trackpad": 12, "Touchbar": 13,
    "HDMI": 14, "Netzteil": 15, "Hörmuschel": 16, "Reinigung": 17, "Diagnose": 30
  };
  var COL_LABEL = {
    "Display": { de: "Display", en: "Screen" }, "LCD": { de: "LCD", en: "LCD" },
    "Displayglas": { de: "Displayglas", en: "Display glass" }, "Akku": { de: "Akku", en: "Battery" },
    "Ladebuchse": { de: "Ladebuchse", en: "Charging port" }, "Rückkamera": { de: "Rückkamera", en: "Rear camera" },
    "Frontkamera": { de: "Frontkamera", en: "Front camera" }, "Kameraglas": { de: "Kameraglas", en: "Camera glass" },
    "Backcover": { de: "Backcover", en: "Back glass" }, "Wasserschaden": { de: "Wasserschaden", en: "Water damage" },
    "Tastatur": { de: "Tastatur", en: "Keyboard" }, "Trackpad": { de: "Trackpad", en: "Trackpad" },
    "Touchbar": { de: "Touchbar", en: "Touch Bar" }, "HDMI": { de: "HDMI", en: "HDMI" },
    "Netzteil": { de: "Netzteil", en: "Power" }, "Hörmuschel": { de: "Hörmuschel", en: "Earpiece" },
    "Reinigung": { de: "Reinigung", en: "Cleaning" }, "Diagnose": { de: "Diagnose", en: "Diagnostics" }
  };
  function canonKey(slug, name) { return CANON[slug] || (name || slug); }
  function colLabel(key) { var e = COL_LABEL[key]; return e ? (e[lang()] || e.de) : key; }
  function colPri(key) { return COL_PRI[key] != null ? COL_PRI[key] : 20; }

  /* ---------- helpers ---------- */
  function eur(n) { return n + " €"; }
  function minForSlug(slug) {
    var m = Infinity;
    DATA.forEach(function (d) { d.repairs.forEach(function (r) {
      if (r.slug === slug && r.price != null && r.price < m) m = r.price;
    }); });
    return isFinite(m) ? m : null;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- services ---------- */
  function renderServices() {
    var g = $("#servicesGrid"); if (!g) return;
    g.innerHTML = SERVICES.map(function (s) {
      return '<article class="card reveal">' +
        '<div class="card__ico">' + ICON[s.icon] + '</div>' +
        '<h3 class="card__t">' + esc(s.t[lang()] || s.t.de) + '</h3>' +
        '<p class="card__d">' + esc(s.d[lang()] || s.d.de) + '</p>' +
        '<ul class="card__list">' + s.tags.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ul>' +
        '</article>';
    }).join("");
    observeReveal(g);
  }

  /* ---------- featured ---------- */
  function renderFeatured() {
    var host = $("#featured"); if (!host) return;
    var disp = minForSlug("display"), akku = minForSlug("akku"), diag = minForSlug("fehleranalyse");
    var tiles = [
      { promo: true, k: (lang() === "de" ? "Aktion" : "Deal"), p: "9,99 €",
        note: (lang() === "de" ? "Panzerglas inkl. gratis Reinigung" : "Screen protector incl. free cleaning"),
        badge: (lang() === "de" ? "BELIEBT" : "POPULAR") },
      { k: (lang() === "de" ? "Display-Wechsel" : "Screen replacement"), p: disp },
      { k: (lang() === "de" ? "Akku-Wechsel" : "Battery swap"), p: akku },
      { k: (lang() === "de" ? "Diagnose" : "Diagnostics"), p: diag }
    ];
    host.innerHTML = tiles.map(function (t) {
      if (t.promo) {
        return '<div class="ftile ftile--promo reveal"><span class="ftile__badge">' + t.badge + '</span>' +
          '<div class="ftile__k">' + t.k + '</div><div class="ftile__p">' + t.p + '</div>' +
          '<div class="ftile__note">' + esc(t.note) + '</div></div>';
      }
      var val = t.p != null ? '<small>' + T("prices.from") + '</small> ' + eur(t.p) : "—";
      return '<div class="ftile reveal"><div class="ftile__k">' + esc(t.k) + '</div>' +
        '<div class="ftile__p">' + val + '</div>' +
        '<div class="ftile__note">' + (lang() === "de" ? "je nach Modell" : "depending on model") + '</div></div>';
    }).join("");
    observeReveal(host);
  }

  /* ---------- brand chips ---------- */
  function buildChips() {
    var host = $("#brandChips"); if (!host) return;
    host.innerHTML = GROUP_ORDER.map(function (g) {
      return '<button class="chip-btn' + (activeGroup === g ? " is-on" : "") + '" data-g="' + esc(g) + '">' + esc(glabel(g)) + "</button>";
    }).join("");
    host.querySelectorAll(".chip-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        activeGroup = b.getAttribute("data-g");
        var s = $("#deviceSearch"); if (s) s.value = "";
        buildChips(); renderMatrix();
      });
    });
  }

  /* ---------- price matrix ---------- */
  function currentRows() {
    var q = ($("#deviceSearch") ? $("#deviceSearch").value : "").trim().toLowerCase();
    if (q) return DATA.filter(function (d) { return d.device.toLowerCase().indexOf(q) !== -1; });
    return DATA.filter(function (d) { return d.group === activeGroup; });
  }
  function columnsFor(rows) {
    var set = {};
    rows.forEach(function (d) { d.repairs.forEach(function (r) { set[canonKey(r.slug, r.name)] = true; }); });
    return Object.keys(set).sort(function (a, b) {
      var pa = colPri(a), pb = colPri(b);
      return pa !== pb ? pa - pb : a.localeCompare(b);
    });
  }
  function cell(device, key) {
    var cands = device.repairs.filter(function (r) { return canonKey(r.slug, r.name) === key; });
    if (!cands.length) return '<td class="mc mc--na">—</td>';
    var priced = cands.filter(function (r) { return r.price != null; });
    if (priced.length) {
      var m = Math.min.apply(null, priced.map(function (r) { return r.price; }));
      return '<td class="mc"><span class="mc__p">' + eur(m) + "</span></td>";
    }
    return '<td class="mc mc--req">' + (lang() === "de" ? "Anfrage" : "ask") + "</td>";
  }
  function renderMatrix() {
    var host = $("#matrix"); if (!host) return;
    var rows = currentRows();
    var count = $("#resultCount");
    if (count) count.textContent = rows.length + " " + T("prices.devices");
    if (!rows.length) {
      host.innerHTML = '<tbody><tr><td class="pricetable__empty"><b>' + T("prices.empty") +
        "</b><br>" + T("prices.emptyHint") + "</td></tr></tbody>";
      return;
    }
    var cols = columnsFor(rows);
    var thead = '<thead><tr><th class="mh mh--dev">' + (lang() === "de" ? "Gerät" : "Device") + "</th>" +
      cols.map(function (c) { return '<th class="mh">' + esc(colLabel(c)) + "</th>"; }).join("") + "</tr></thead>";
    var body = "<tbody>" + rows.map(function (d) {
      return '<tr><th class="mrow"><span class="mrow__grp">' + esc(glabel(d.group)) + "</span>" +
        '<span class="mrow__name">' + esc(d.device) + "</span></th>" +
        cols.map(function (c) { return cell(d, c); }).join("") + "</tr>";
    }).join("") + "</tbody>";
    host.innerHTML = thead + body;
  }

  /* ---------- form datalist ---------- */
  function fillDatalist() {
    var dl = $("#deviceOptions"); if (!dl) return;
    dl.innerHTML = DATA.map(function (d) { return '<option value="' + esc(d.device) + '">'; }).join("");
  }

  /* ---------- request form -> WhatsApp ---------- */
  function wireForm() {
    var form = $("#repairForm"); if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var device = $("#fDevice").value.trim();
      var issueSel = $("#fIssue");
      var issue = issueSel.options[issueSel.selectedIndex] ? issueSel.options[issueSel.selectedIndex].text : "";
      var name = $("#fName").value.trim();
      var contact = $("#fContact").value.trim();
      var note = $("#fNote").value.trim();
      if (!device || !issueSel.value) { alert(T("form.needDevice")); return; }
      var L = lang();
      var lines = [T("form.waIntro"), "",
        (L === "de" ? "Gerät" : "Device") + ": " + device,
        (L === "de" ? "Problem" : "Issue") + ": " + issue];
      if (name) lines.push("Name: " + name);
      if (contact) lines.push((L === "de" ? "Kontakt" : "Contact") + ": " + contact);
      if (note) lines.push((L === "de" ? "Notiz" : "Note") + ": " + note);
      window.open(WA + "?text=" + encodeURIComponent(lines.join("\n")), "_blank", "noopener");
    });
  }

  /* ---------- marquee ---------- */
  function buildMarquee() {
    var m = $("#marquee"); if (!m) return;
    var brands = ["Apple", "iPhone", "Samsung", "Google Pixel", "Huawei", "iPad", "MacBook", "PlayStation", "Xbox", "Nintendo", "Microsoft Surface"];
    var run = "<span>" + brands.join("</span><span>") + "</span>";
    m.innerHTML = run + run;
  }

  /* ---------- reveal ---------- */
  var io;
  function observeReveal(scope) {
    if (!("IntersectionObserver" in window)) {
      (scope || document).querySelectorAll(".reveal").forEach(function (n) { n.classList.add("is-in"); });
      return;
    }
    if (!io) io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    (scope || document).querySelectorAll(".reveal:not(.is-in)").forEach(function (n) { io.observe(n); });
  }
  function markReveal() {
    document.querySelectorAll(".shead, .step, .review, .pricetable, .contact__info, .contact__media").forEach(function (n) {
      n.classList.add("reveal");
    });
    observeReveal(document);
  }

  /* ---------- nav scroll state ---------- */
  function wireNav() {
    var nav = $("#nav");
    function on() { if (nav) nav.classList.toggle("is-scrolled", window.scrollY > 8); }
    on(); window.addEventListener("scroll", on, { passive: true });
  }

  /* ---------- boot ---------- */
  function boot() {
    var y = $("#year"); if (y) y.textContent = new Date().getFullYear();
    buildMarquee(); wireNav(); wireForm(); markReveal();

    var search = $("#deviceSearch");
    if (search) search.addEventListener("input", renderMatrix);

    fetch("assets/data/prices.json").then(function (r) { return r.json(); }).then(function (data) {
      DATA = (data.devices || []).map(function (d) {
        return { group: gkey(d.group), device: d.device, repairs: d.repairs || [] };
      });
      var pref = ["iPhone", "Samsung", "iPad", "MacBook", "Notebook", "Google", "Huawei", "Spielekonsole", "Watch"];
      var seen = {};
      DATA.forEach(function (d) { seen[d.group] = true; });
      GROUP_ORDER = pref.filter(function (g) { return seen[g]; });
      Object.keys(seen).forEach(function (g) { if (GROUP_ORDER.indexOf(g) === -1) GROUP_ORDER.push(g); });
      if (GROUP_ORDER.indexOf(activeGroup) === -1) activeGroup = GROUP_ORDER[0];

      var rank = {}; GROUP_ORDER.forEach(function (g, i) { rank[g] = i; });
      DATA.sort(function (a, b) {
        var ra = (a.group in rank) ? rank[a.group] : 99, rb = (b.group in rank) ? rank[b.group] : 99;
        return ra !== rb ? ra - rb : a.device.localeCompare(b.device);
      });

      renderServices(); renderFeatured(); buildChips(); renderMatrix(); fillDatalist();
    }).catch(function () {
      renderServices(); renderFeatured();
      var host = $("#matrix");
      if (host) host.innerHTML = '<tbody><tr><td class="pricetable__empty"><b>' + T("prices.empty") +
        "</b><br>" + T("prices.emptyHint") + "</td></tr></tbody>";
    });

    window.addEventListener("mt:lang", function () {
      renderServices(); renderFeatured(); buildChips(); renderMatrix();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
