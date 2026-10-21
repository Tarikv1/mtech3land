/* ============================================================
   Mtech3land — i18n (DE default · EN toggle)
   Static strings. Dynamic blocks (services, prices) read MT.lang
   and re-render on the 'mt:lang' event dispatched here.
   ============================================================ */
(function () {
  "use strict";

  // Static strings (DE + EN) come from window.MT_STR, emitted by scripts/build.mjs as assets/js/strings.js
  // from src/strings.json. strings.js must be loaded before this file.
  var STR = window.MT_STR || { de: {}, en: {} };

  // landing pages inject their own strings via window.MT_PAGE_STRINGS (defined before this script)
  if (window.MT_PAGE_STRINGS) {
    ["de", "en"].forEach(function (L) {
      var extra = window.MT_PAGE_STRINGS[L];
      if (extra) for (var k in extra) STR[L][k] = extra[k];
    });
  }

  var state = { lang: "de" };

  function tr(key) {
    var d = STR[state.lang] || STR.de;
    return (key in d) ? d[key] : (STR.de[key] != null ? STR.de[key] : key);
  }

  function applyStatic() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.innerHTML = tr(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      var spec = el.getAttribute("data-i18n-attr").split(":");
      if (spec.length === 2) el.setAttribute(spec[0], tr(spec[1]));
    });
    document.documentElement.setAttribute("lang", state.lang);
  }

  // shows language l; nothing is stored (page load)
  function applyLang(l) {
    if (l !== "de" && l !== "en") l = "de";
    state.lang = l;
    document.querySelectorAll(".lang__opt").forEach(function (o) {
      o.classList.toggle("is-on", o.getAttribute("data-lang") === l);
    });
    applyStatic();
    window.dispatchEvent(new CustomEvent("mt:lang", { detail: l }));
  }

  // the visitor chose a language: show it and remember it (Datenschutz section 6)
  function setLang(l) {
    applyLang(l);
    try { localStorage.setItem("mt_lang", state.lang); } catch (e) {}
  }

  window.MT = {
    tr: tr,
    setLang: setLang,
    get lang() { return state.lang; }
  };

  document.addEventListener("DOMContentLoaded", function () {
    var saved;
    try { saved = localStorage.getItem("mt_lang"); } catch (e) {}
    if (saved !== "de" && saved !== "en") saved = "de"; // German market → DE default
    applyLang(saved);

    var toggle = document.getElementById("langToggle");
    if (toggle) toggle.addEventListener("click", function () {
      setLang(state.lang === "de" ? "en" : "de");
    });
  });
})();
