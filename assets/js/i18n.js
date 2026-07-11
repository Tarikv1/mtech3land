/* ============================================================
   Mtech3land — i18n (DE default · EN toggle)
   Static strings. Dynamic blocks (services, prices) read MT.lang
   and re-render on the 'mt:lang' event dispatched here.
   ============================================================ */
(function () {
  "use strict";

  var STR = {
    de: {
      "nav.services": "Leistungen",
      "nav.prices": "Preise",
      "nav.how": "Ablauf",
      "nav.reviews": "Bewertungen",
      "nav.contact": "Kontakt",

      "cta.whatsapp": "WhatsApp",
      "cta.whatsappBook": "Per WhatsApp anfragen",
      "cta.request": "Reparatur anfragen",
      "cta.call": "Anrufen",

      "promo.tag": "Aktion",
      "hero.promo": "Panzerglas wechseln <b>9,99 €</b> · Handyreinigung gratis",
      "hero.t1": "Handy kaputt?",
      "hero.t2": "Express repariert",
      "hero.t3": "im Dreiland.",
      "hero.sub": "Display, Akku, Wasserschaden & mehr — für iPhone, Samsung, iPad, Laptop & Konsole. Faire Festpreise, oft in unter 30 Minuten, mit Garantie. Direkt an der Grenze Basel / Weil am Rhein.",

      "trust.reviews": "Google-Bewertungen",
      "trust.express": "Express-Service",
      "trust.warranty": "Garantie auf Reparaturen",
      "trust.women": "Inhabergeführt · frauengeführt",

      "services.kicker": "Was wir reparieren",
      "services.title": "Alles mit Akku und Bildschirm.",
      "services.lede": "Von zersprungenem Display bis Wasserschaden — Originalqualität, transparente Preise, schnelle Bearbeitung.",
      "plinks.kicker": "Direkt zur Reparatur",
      "plinks.title": "Wähl dein Gerät.",

      "prices.kicker": "Preise",
      "prices.title": "Faire Festpreise. Keine Überraschungen.",
      "prices.lede": "Beliebte Reparaturen auf einen Blick — die vollständige Preisliste findest du darunter, durchsuchbar nach Gerät.",
      "prices.search": "Gerät suchen — z. B. iPhone 13, Galaxy S22…",
      "prices.hint": "Preise inkl. MwSt. · „Anfrage“ = Preis auf Anfrage · seitwärts wischen für mehr Reparaturen.",
      "prices.more": "Mehr Geräte anzeigen",
      "prices.from": "ab",
      "prices.devices": "Geräte",
      "prices.onreq": "auf Anfrage",
      "prices.empty": "Kein Gerät gefunden",
      "prices.emptyHint": "Schreib uns kurz per WhatsApp — wir haben Ersatzteile für fast alles.",

      "how.kicker": "So einfach geht's",
      "how.title": "In drei Schritten repariert.",
      "how.s1t": "Anfragen",
      "how.s1p": "Schick uns Gerät & Problem per WhatsApp oder Formular. Du bekommst schnell einen Festpreis.",
      "how.s2t": "Vorbeibringen",
      "how.s2p": "Bring dein Gerät in den Laden in Weil am Rhein — oder schick es ein. Die meisten Reparaturen: sofort.",
      "how.s3t": "Abholen",
      "how.s3p": "Wie neu, mit Garantie. Zahlung erst, wenn du zufrieden bist.",

      "form.kicker": "Reparatur anfragen",
      "form.title": "Sag uns, was los ist.",
      "form.lede": "Wähl dein Gerät und das Problem — wir melden uns mit Festpreis und Termin. Kein Konto, kein Warten.",
      "form.perk1": "Antwort meist innerhalb weniger Minuten",
      "form.perk2": "Unverbindlicher Festpreis vorab",
      "form.perk3": "Express möglich — oft noch am selben Tag",
      "form.device": "Gerät",
      "form.devicePh": "iPhone 13, Galaxy S22, PS5…",
      "form.issue": "Problem",
      "form.issuePh": "Bitte wählen…",
      "form.name": "Name",
      "form.namePh": "Vorname",
      "form.contact": "Telefon / E-Mail",
      "form.contactPh": "Für Rückmeldung",
      "form.note": "Notiz (optional)",
      "form.notePh": "z. B. Modellfarbe, seit wann, schon mal repariert…",
      "form.submit": "Anfrage per WhatsApp senden",
      "form.alt": "Lieber anrufen? <a href=\"tel:+4915753815179\">+49 1575 3815179</a>",
      "form.needDevice": "Bitte Gerät und Problem angeben.",
      "form.waIntro": "Hallo Mtech3land, ich möchte eine Reparatur anfragen:",

      "rep.display": "Display / Glas gebrochen",
      "rep.akku": "Akku schwach",
      "rep.charge": "Lädt nicht / Ladebuchse",
      "rep.water": "Wasserschaden",
      "rep.cam": "Kamera",
      "rep.back": "Rückseite / Backcover",
      "rep.diag": "Weiß nicht — bitte Diagnose",

      "rev.kicker": "Bewertungen",
      "rev.title": "5,0 von 5 auf Google.",
      "rev.lede": "18 Bewertungen, alle 5 Sterne. Ein paar Stimmen unserer Kundschaft.",
      "rev.q1": "„Sehr freundlich, kompetent und zuverlässig. Mein Handy wurde schnell und professionell repariert. Klare Empfehlung!“",
      "rev.q2": "„Ausgezeichneter Service! Schnelle und zuverlässige Hilfe, sehr freundlich und kompetent. Absolut empfehlenswert.“",
      "rev.q3": "„Superschnelle Reparatur. Sehr freundlicher Inhaber. Daumen hoch! 👍“",
      "rev.all": "Alle Bewertungen auf Google ansehen →",

      "contact.kicker": "Standort & Öffnungszeiten",
      "contact.title": "Komm vorbei im Dreiland.",
      "contact.callwa": "Anruf & WhatsApp",
      "contact.hours": "Öffnungszeiten",
      "contact.closed": "geschlossen",
      "contact.directions": "Route planen",

      "day.mo": "Montag", "day.tu": "Dienstag", "day.we": "Mittwoch", "day.th": "Donnerstag",
      "day.fr": "Freitag", "day.sa": "Samstag", "day.so": "Sonntag",

      "foot.tag": "Express Handy- & Elektronik-Reparatur im Dreiländereck Basel · Weil am Rhein · St. Louis.",
      "foot.nav": "Navigation",
      "foot.legal": "Rechtliches",
      "foot.imprint": "Impressum",
      "foot.privacy": "Datenschutz",
      "foot.note": "Impressum & Datenschutz noch ergänzen.",
      "foot.contact": "Kontakt",
      "foot.rights": "Alle Preise inkl. MwSt. · Änderungen vorbehalten."
    },

    en: {
      "nav.services": "Services",
      "nav.prices": "Prices",
      "nav.how": "How it works",
      "nav.reviews": "Reviews",
      "nav.contact": "Contact",

      "cta.whatsapp": "WhatsApp",
      "cta.whatsappBook": "Ask via WhatsApp",
      "cta.request": "Request a repair",
      "cta.call": "Call",

      "promo.tag": "Deal",
      "hero.promo": "Screen protector swap <b>€9.99</b> · phone cleaning free",
      "hero.t1": "Phone broken?",
      "hero.t2": "Fixed fast",
      "hero.t3": "in the Dreiland.",
      "hero.sub": "Screen, battery, water damage & more — for iPhone, Samsung, iPad, laptop & console. Fair fixed prices, often under 30 minutes, with warranty. Right on the Basel / Weil am Rhein border.",

      "trust.reviews": "Google reviews",
      "trust.express": "Express service",
      "trust.warranty": "Warranty on repairs",
      "trust.women": "Owner-run · women-owned",

      "services.kicker": "What we fix",
      "services.title": "Anything with a battery and a screen.",
      "services.lede": "From a cracked display to water damage — original-grade parts, transparent prices, quick turnaround.",
      "plinks.kicker": "Straight to the repair",
      "plinks.title": "Pick your device.",

      "prices.kicker": "Prices",
      "prices.title": "Fair fixed prices. No surprises.",
      "prices.lede": "Popular repairs at a glance — the full price list is below, searchable by device.",
      "prices.search": "Search device — e.g. iPhone 13, Galaxy S22…",
      "prices.hint": "Prices incl. VAT · “ask” = price on request · swipe sideways for more repairs.",
      "prices.more": "Show more devices",
      "prices.from": "from",
      "prices.devices": "devices",
      "prices.onreq": "on request",
      "prices.empty": "No device found",
      "prices.emptyHint": "Drop us a WhatsApp — we stock parts for almost everything.",

      "how.kicker": "It's this easy",
      "how.title": "Repaired in three steps.",
      "how.s1t": "Ask",
      "how.s1p": "Send us the device & the issue via WhatsApp or the form. You get a fixed price fast.",
      "how.s2t": "Drop off",
      "how.s2p": "Bring your device to the shop in Weil am Rhein — or mail it in. Most repairs: on the spot.",
      "how.s3t": "Pick up",
      "how.s3p": "Good as new, with warranty. You pay only when you're happy.",

      "form.kicker": "Request a repair",
      "form.title": "Tell us what's wrong.",
      "form.lede": "Pick your device and the problem — we'll reply with a fixed price and a slot. No account, no waiting.",
      "form.perk1": "Reply usually within minutes",
      "form.perk2": "Non-binding fixed price upfront",
      "form.perk3": "Express possible — often same day",
      "form.device": "Device",
      "form.devicePh": "iPhone 13, Galaxy S22, PS5…",
      "form.issue": "Problem",
      "form.issuePh": "Please choose…",
      "form.name": "Name",
      "form.namePh": "First name",
      "form.contact": "Phone / email",
      "form.contactPh": "So we can reply",
      "form.note": "Note (optional)",
      "form.notePh": "e.g. model colour, since when, repaired before…",
      "form.submit": "Send request via WhatsApp",
      "form.alt": "Rather call? <a href=\"tel:+4915753815179\">+49 1575 3815179</a>",
      "form.needDevice": "Please enter device and problem.",
      "form.waIntro": "Hi Mtech3land, I'd like to request a repair:",

      "rep.display": "Display / glass broken",
      "rep.akku": "Weak battery",
      "rep.charge": "Won't charge / charging port",
      "rep.water": "Water damage",
      "rep.cam": "Camera",
      "rep.back": "Back / back cover",
      "rep.diag": "Not sure — please diagnose",

      "rev.kicker": "Reviews",
      "rev.title": "5.0 out of 5 on Google.",
      "rev.lede": "18 reviews, all 5 stars. A few words from our customers.",
      "rev.q1": "“Very friendly, competent and reliable. My phone was repaired quickly and professionally. Highly recommended!”",
      "rev.q2": "“Excellent service! Quick and reliable help, very friendly and competent. Absolutely recommended.”",
      "rev.q3": "“Super fast repair. Very friendly owner. Thumbs up! 👍”",
      "rev.all": "See all reviews on Google →",

      "contact.kicker": "Location & hours",
      "contact.title": "Come by in the Dreiland.",
      "contact.callwa": "Call & WhatsApp",
      "contact.hours": "Opening hours",
      "contact.closed": "closed",
      "contact.directions": "Get directions",

      "day.mo": "Monday", "day.tu": "Tuesday", "day.we": "Wednesday", "day.th": "Thursday",
      "day.fr": "Friday", "day.sa": "Saturday", "day.so": "Sunday",

      "foot.tag": "Express phone & electronics repair in the Basel tri-border — Weil am Rhein · St. Louis.",
      "foot.nav": "Navigation",
      "foot.legal": "Legal",
      "foot.imprint": "Imprint",
      "foot.privacy": "Privacy",
      "foot.note": "Imprint & privacy policy still to be added.",
      "foot.contact": "Contact",
      "foot.rights": "All prices incl. VAT · subject to change."
    }
  };

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

  function setLang(l) {
    if (l !== "de" && l !== "en") l = "de";
    state.lang = l;
    try { localStorage.setItem("mt_lang", l); } catch (e) {}
    document.querySelectorAll(".lang__opt").forEach(function (o) {
      o.classList.toggle("is-on", o.getAttribute("data-lang") === l);
    });
    applyStatic();
    window.dispatchEvent(new CustomEvent("mt:lang", { detail: l }));
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
    setLang(saved);

    var toggle = document.getElementById("langToggle");
    if (toggle) toggle.addEventListener("click", function () {
      setLang(state.lang === "de" ? "en" : "de");
    });
  });
})();
