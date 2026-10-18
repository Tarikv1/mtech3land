/* ============================================================
   Mtech3land — price picker (Gerät → Marke → Modell, or search)
   Upgrades the server-rendered section[data-picker] (src/partials/picker.html).
   Fetches /assets/data/picker.json on first interaction or when the section nears the viewport,
   then draws steps, tiles and the result card. Needs picker-state.js (window.MTPicker) and
   i18n.js (window.MT). Without JS, or if the fetch fails, the tiles stay plain links to the hubs.
   ============================================================ */
(function () {
  "use strict";

  var P = window.MTPicker;
  var INDEX_URL = "/assets/data/picker.json";
  var SVG_NS = "http://www.w3.org/2000/svg";

  function tr(key) { return window.MT ? window.MT.tr(key) : key; }
  function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] == null ? m : vars[k]; });
  }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function icon(href) {
    var svg = document.createElementNS(SVG_NS, "svg");
    var use = document.createElementNS(SVG_NS, "use");
    svg.setAttribute("class", "ic");
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", href);
    svg.appendChild(use);
    return svg;
  }
  function hasPickerHash() { return /[#&][tbm]=/.test(window.location.hash); }

  function boot() {
    var root = document.querySelector("[data-picker]");
    if (!root || !P || !window.fetch) return;
    var tools = root.querySelector("[data-picker-tools]");
    var input = root.querySelector("[data-picker-search]");
    var panel = root.querySelector("[data-picker-panel]");
    var status = root.querySelector("[data-picker-status]");
    if (!tools || !input || !panel || !status) return;

    var wa = root.getAttribute("data-wa") || "";
    var preset = { t: root.getAttribute("data-type") || null, b: root.getAttribute("data-brand") || null, m: null };

    // what the script reuses from the server-rendered tiles: the type icons and the link to the diagnosis page
    var icons = {};
    var diagnose = null;
    Array.prototype.forEach.call(panel.querySelectorAll("a.tile[data-key]"), function (a) {
      var key = a.getAttribute("data-key");
      var use = a.querySelector("use");
      if (key === "diagnose") diagnose = a.parentNode.cloneNode(true);
      else if (use) icons[key] = use.getAttribute("href");
    });

    var index = null;
    var loading = null;
    var started = false;
    var state = { t: null, b: null, m: null };
    var view = null; // step the visitor went back to; null follows the state
    var query = "";
    var steps = null;

    /* ---------- state ---------- */
    // a type with one brand has no brand step
    function settle(s) {
      var brands = s.t ? P.brandsFor(index, s.t) : [];
      if (s.t && !s.b && brands.length === 1) s.b = brands[0];
      return s;
    }
    function autoStep() { return !state.t ? 1 : !state.b ? 2 : !state.m ? 3 : 4; }
    function current() { return view || autoStep(); }
    function modelName() {
      var d = P.findDevice(index, state.m);
      return d ? d.n : "";
    }

    // a shared link opens below the fold: bring the picker into view (smooth unless reduced motion is asked for)
    function reveal() {
      var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      root.scrollIntoView(P.revealOptions(calm));
    }

    /* ---------- pieces ---------- */
    function heading(text) {
      var h = el("h3", "h3", text);
      h.tabIndex = -1;
      return h;
    }
    function tile(act, val, label, opts) {
      var li = el("li");
      var b = el("button", "tile");
      b.type = "button";
      b.setAttribute("data-act", act);
      b.setAttribute("data-val", val);
      b.setAttribute("data-key", act + ":" + val);
      b.setAttribute("aria-pressed", opts.pressed ? "true" : "false");
      if (opts.icon) b.appendChild(icon(opts.icon));
      b.appendChild(el("span", null, label));
      if (opts.sub) b.appendChild(el("small", null, opts.sub));
      li.appendChild(b);
      return li;
    }
    function tiles(items) {
      var ul = el("ul", "tiles");
      items.forEach(function (li) { ul.appendChild(li); });
      return ul;
    }
    function waButton(text) {
      var a = el("a", "btn btn--wa");
      a.href = P.waUrl(wa, text);
      a.target = "_blank";
      a.rel = "noopener";
      a.appendChild(icon("#i-whatsapp"));
      a.appendChild(el("span", null, tr("model.cta")));
      return a;
    }

    /* ---------- drawing ---------- */
    function renderSteps() {
      if (!steps) {
        steps = el("ol", "picker__steps");
        root.insertBefore(steps, panel);
      }
      steps.setAttribute("aria-label", tr("picker.steps"));
      steps.textContent = "";
      steps.hidden = !!P.normalizeQuery(query); // the results replace the steps, and the results come next in tab order
      var cur = current();
      var values = [state.t && tr("type." + state.t), state.b && tr("brand." + state.b), state.m && modelName()];
      var skipsBrand = state.t && P.brandsFor(index, state.t).length === 1;
      for (var n = 1; n <= 3; n++) {
        var li = el("li");
        var label = tr("picker.step." + n);
        var value = values[n - 1];
        var active = n === cur;
        if (active) {
          li.className = "is-active";
          li.setAttribute("aria-current", "step");
        } else if (value) {
          li.className = "is-done";
        }
        if (value && !active && !(n === 2 && skipsBrand)) {
          var b = el("button", null, value);
          b.type = "button";
          b.setAttribute("data-act", "s");
          b.setAttribute("data-val", String(n));
          b.setAttribute("data-key", "s:" + n);
          b.setAttribute("aria-label", fill(tr("picker.step.change"), { step: label, value: value }));
          li.appendChild(b);
        } else {
          li.appendChild(document.createTextNode(value && !active ? value : label));
        }
        steps.appendChild(li);
      }
    }

    function listPanel(title, items) {
      var h = heading(title);
      panel.appendChild(h);
      panel.appendChild(tiles(items));
      return h;
    }

    function renderTypes() {
      var items = index.types.map(function (type) {
        return tile("t", type.id, tr("type." + type.id), { pressed: state.t === type.id, icon: icons["t:" + type.id] });
      });
      if (diagnose) {
        var li = diagnose.cloneNode(true);
        var label = li.querySelector("[data-i18n]");
        if (label) label.textContent = tr(label.getAttribute("data-i18n"));
        items.push(li);
      }
      return listPanel(tr("picker.heading.1"), items);
    }

    function renderBrands() {
      var items = P.brandsFor(index, state.t).map(function (id) {
        return tile("b", id, tr("brand." + id), { pressed: state.b === id });
      });
      return listPanel(tr("picker.heading.2"), items);
    }

    function renderModels() {
      var items = P.devicesFor(index, state.t, state.b).map(function (d) {
        return tile("m", d.s, d.n, { pressed: state.m === d.s });
      });
      return listPanel(tr("picker.heading.3"), items);
    }

    function renderSearch(hits) {
      if (!hits.length) {
        var none = el("div", "picker__result");
        none.appendChild(el("p", null, tr("picker.none")));
        none.appendChild(waButton(P.waMessage(query.trim(), null)));
        panel.appendChild(none);
        return none;
      }
      var h = heading(tr("picker.heading.search"));
      panel.appendChild(h);
      panel.appendChild(tiles(hits.map(function (d) {
        return tile("m", d.s, d.n, { sub: tr("type." + d.t) + " · " + tr("brand." + d.b) });
      })));
      return h;
    }

    function renderResult() {
      var d = P.findDevice(index, state.m);
      var card = el("div", "picker__result");
      var h = heading(d.n);
      card.appendChild(h);
      var numbers = P.modelNumbers(tr("model.codes"), d);
      if (numbers) card.appendChild(el("p", "prose__note", numbers));
      var list = el("ul", "pricelist");
      d.r.forEach(function (row) {
        var li = el("li", "pricelist__row");
        li.appendChild(el("span", "pricelist__label", tr("repair." + index.keys[row[0]])));
        li.appendChild(el("span", "pricelist__price", row[1] == null ? tr("price.request") : row[1] + " €"));
        list.appendChild(li);
      });
      card.appendChild(list);
      card.appendChild(waButton(P.waMessage(d.n, d.t)));
      var more = el("a", "btn btn--ghost", fill(tr(P.isFeminine(d.t) ? "picker.more.f" : "picker.more"), { name: d.n }));
      more.href = P.deviceUrl(index, d);
      card.appendChild(more);
      panel.appendChild(card);
      return h;
    }

    // opts.focus: move focus to the new panel's heading (a choice was made); opts.say: announce it;
    // opts.reveal: scroll the picker into view (a shared link, never a click inside the picker)
    function render(opts) {
      opts = opts || {};
      var kept = null;
      var active = document.activeElement;
      if (!opts.focus && active && root.contains(active)) kept = active.getAttribute("data-key");

      renderSteps();
      panel.textContent = "";
      var searching = !!P.normalizeQuery(query);
      var hits = searching ? P.search(index, query) : null;
      var step = current();
      var target;
      if (searching) target = renderSearch(hits);
      else if (step === 1) target = renderTypes();
      else if (step === 2) target = renderBrands();
      else if (step === 3) target = renderModels();
      else target = renderResult();

      if (opts.say) {
        if (searching) {
          status.textContent = !hits.length ? tr("picker.status.none") : hits.length === 1 ? tr("picker.status.one") : fill(tr("picker.status.many"), { n: hits.length });
        } else if (step === 4) {
          status.textContent = fill(tr("picker.status.result"), { name: modelName() });
        } else {
          status.textContent = fill(tr("picker.status.step"), { n: step, label: tr("picker.step." + step) });
        }
      }

      if (opts.focus) {
        target.focus(opts.reveal ? { preventScroll: true } : undefined);
      } else if (kept) {
        var nodes = root.querySelectorAll("[data-key]");
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].getAttribute("data-key") === kept) {
            nodes[i].focus();
            break;
          }
        }
      }
      if (opts.reveal) reveal();
    }

    /* ---------- actions ---------- */
    function commit() {
      view = null;
      query = "";
      input.value = "";
      try {
        window.history.replaceState(null, "", P.toHash(state) || window.location.pathname + window.location.search);
      } catch (e) { /* no history API access (file://, sandbox): the state just is not shareable */ }
      render({ focus: true, say: true });
    }

    function onClick(e) {
      var btn = e.target.closest ? e.target.closest("button[data-act]") : null;
      if (!btn || !root.contains(btn)) return;
      var act = btn.getAttribute("data-act");
      var val = btn.getAttribute("data-val");
      if (act === "s") {
        view = Number(val);
        query = "";
        input.value = "";
        render({ focus: true, say: true });
        return;
      }
      if (act === "t") {
        if (state.t !== val) state = settle({ t: val, b: null, m: null });
      } else if (act === "b") {
        if (state.b !== val) state = { t: state.t, b: val, m: null };
      } else {
        var d = P.findDevice(index, val);
        if (!d) return;
        state = { t: d.t, b: d.b, m: d.s };
      }
      commit();
    }

    function onInput() {
      query = input.value;
      render({ say: true });
    }

    function onHashChange() {
      if (!hasPickerHash()) return;
      if (!started) return go(); // start() reads the hash
      state = settle(P.parseHash(window.location.hash, index));
      view = null;
      query = "";
      input.value = "";
      render({ focus: true, say: true, reveal: !!state.t });
    }

    /* ---------- loading ---------- */
    function start() {
      started = true;
      tools.hidden = false;
      var fromHash = hasPickerHash() ? P.parseHash(window.location.hash, index) : null;
      var shared = !!(fromHash && fromHash.t);
      state = settle(shared ? fromHash : P.clean(index, preset));
      root.addEventListener("click", onClick);
      input.addEventListener("input", onInput);
      render({ reveal: shared });
    }

    function go() {
      if (started || loading) return;
      loading = fetch(INDEX_URL, { credentials: "same-origin" })
        .then(function (res) {
          if (!res.ok) throw new Error("picker.json " + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!data || data.v !== 1 || !data.d) throw new Error("picker.json format");
          return data;
        });
      loading.then(function (data) {
        index = data;
        start();
      }, function () {
        loading = null; // the server-rendered links keep working; a later interaction retries
      });
    }

    ["pointerover", "focusin", "touchstart"].forEach(function (name) {
      root.addEventListener(name, go, { passive: true });
    });
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) {
          io.disconnect();
          go();
        }
      }, { rootMargin: "300px 0px" });
      io.observe(root);
    } else {
      go();
    }
    if (hasPickerHash()) go();

    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("mt:lang", function () { if (started) render({}); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
