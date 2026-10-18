/* ============================================================
   Mtech3land — site chrome
   Nav drawer, header shadow on scroll, sticky bar, click-to-load map.
   ============================================================ */
(function () {
  "use strict";

  var root = document.documentElement;
  var desktop = window.matchMedia("(min-width: 1080px)");

  /* ---------- sticky bar: out of the way while the drawer is open or the keyboard is up ---------- */
  var TEXT_INPUT = /^(?:text|search|email|tel|url|number|password)$/;
  function isTyping(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA" || el.isContentEditable) return true;
    return el.tagName === "INPUT" && TEXT_INPUT.test(el.type);
  }
  function syncBar() {
    var bar = document.querySelector(".stickybar");
    if (bar) bar.classList.toggle("is-hidden", root.classList.contains("nav-open") || isTyping(document.activeElement));
  }
  function wireStickybar() {
    document.addEventListener("focusin", syncBar);
    // activeElement is only updated after focusout has fired
    document.addEventListener("focusout", function () { setTimeout(syncBar, 0); });
  }

  /* ---------- nav drawer (below 1080 px) ---------- */
  function wireNav() {
    var header = document.querySelector(".site-header");
    var toggle = document.getElementById("menuToggle");
    var nav = document.getElementById("nav");
    if (!header || !toggle || !nav) return;

    function isOpen() { return toggle.getAttribute("aria-expanded") === "true"; }
    function setOpen(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      header.classList.toggle("is-open", open);
      root.classList.toggle("nav-open", open);
      syncBar();
    }

    toggle.addEventListener("click", function () { setOpen(!isOpen()); });
    // Escape closes the drawer and hands focus back to the button
    document.addEventListener("keydown", function (e) {
      if ((e.key === "Escape" || e.key === "Esc") && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });
    // following a link (e.g. /#preise on the home page) closes the drawer
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
    // so does a click outside the header or tabbing out of it
    document.addEventListener("click", function (e) { if (isOpen() && !header.contains(e.target)) setOpen(false); });
    header.addEventListener("focusout", function (e) {
      if (isOpen() && e.relatedTarget && !header.contains(e.relatedTarget)) setOpen(false);
    });
    function onWide(e) { if (e.matches) setOpen(false); }
    if (desktop.addEventListener) desktop.addEventListener("change", onWide);
    else if (desktop.addListener) desktop.addListener(onWide);
  }

  /* ---------- header shadow once the page scrolls ---------- */
  function wireHeaderShadow() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    function update() { header.classList.toggle("is-scrolled", window.scrollY > 4); }
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  /* ---------- click-to-load map (no request to Google before the click) ---------- */
  function wireMap() {
    var btn = document.getElementById("mapLoad");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var holder = document.getElementById("mapHolder");
      var src = holder && holder.getAttribute("data-map-src");
      if (!src) return;
      var frame = document.createElement("iframe");
      frame.title = "Karte Mtech3land";
      frame.loading = "lazy";
      frame.src = src;
      frame.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
      holder.innerHTML = "";
      holder.appendChild(frame);
      // the button that had focus is gone; keep keyboard users on the map
      frame.focus();
    });
  }

  function boot() {
    wireNav();
    wireHeaderShadow();
    wireStickybar();
    wireMap();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
