/**
 * layout.js — the header (nav, Settings menu, Emergency button) and footer
 * shared by every page. Pages only provide empty placeholders:
 *   <header class="site-header" data-site-header></header>
 *   <footer class="site-footer" data-site-footer></footer>
 * so the nav exists in exactly one place.
 */

import { fetchJSON, esc } from "./data.js";
import { t, getLanguage, setLanguage, applyToPage } from "./i18n.js";
import * as theme from "./theme.js";
import * as state from "./state.js";
import { mountSettings as mountOfflineSettings } from "../ui/offline-ui.js";

// 16x16 pixel icons, drawn with whole-pixel paths so they stay crisp.
const ICONS = {
  home: "M7 1h2v1h1v1h1v1h1v1h1v1h1v1h-2v7h-3v-4h-2v4h-3v-7h-2v-1h1v-1h1v-1h1v-1h1v-1h1v-1z",
  learn: "M1 3h6v1h2v-1h6v11h-6v1h-2v-1h-6z M2 4v9h5v-9z M9 4v9h5v-9z M3 6h3v1h-3z M3 9h3v1h-3z M10 6h3v1h-3z M10 9h3v1h-3z",
  collection: "M7 1h2v4h5v2h-1v1h-1v1h-1v2h1v3h-2v-1h-4v1h-2v-3h1v-2h-1v-1h-1v-1h-1v-2h5z",
  subject: "M1 2h6v6h-6z M2 3v4h4v-4z M9 8h6v6h-6z M10 9v4h4v-4z M3 8h2v3h4v2h-6z",
  settings:
    "M6 1h4v1h-4zM2 2h2v1h-2zM6 2h4v1h-4zM12 2h2v1h-2zM2 3h12v1h-12zM3 4h10v1h-10zM3 5h4v1h-4zM9 5h4v1h-4zM1 6h5v1h-5zM10 6h5v1h-5zM1 7h4v1h-4zM11 7h4v1h-4zM1 8h4v1h-4zM11 8h4v1h-4zM1 9h5v1h-5zM10 9h5v1h-5zM3 10h4v1h-4zM9 10h4v1h-4zM3 11h10v1h-10zM2 12h12v1h-12zM2 13h2v1h-2zM6 13h4v1h-4zM12 13h2v1h-2zM6 14h4v1h-4z",
};

const NAV = [
  { page: "dashboard", href: "dashboard.html", key: "nav.home", icon: "home" },
  { page: "courses", href: "courses.html", key: "nav.learn", icon: "learn" },
  { page: "collection", href: "collection.html", key: "nav.collection", icon: "collection" },
  { page: "subject", href: "subject-connect.html", key: "nav.subject", icon: "subject" },
];

export function pixelIcon(name, className = "pixel-icon") {
  return `<svg class="${className}" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" fill-rule="evenodd" d="${ICONS[name]}"/></svg>`;
}

// Pages that show no nav bar: just the corner controls (Settings + Emergency must stay
// one tap away on every page), floating over the page's own hero.
const BARE_HEADER_PAGES = new Set(["welcome"]);

function headerMarkup(currentPage) {
  const bare = BARE_HEADER_PAGES.has(currentPage);
  const links = NAV.map(
    (item) => `
      <a class="main-nav__link" href="${item.href}"${item.page === currentPage ? ' aria-current="page"' : ""}>
        ${pixelIcon(item.icon, "main-nav__icon")}
        <span data-i18n="${item.key}"></span>
      </a>`
  ).join("");

  return `
    <a class="skip-link" href="#main" data-i18n="site.skip"></a>
    <div class="site-header__inner">
      ${
        bare
          ? ""
          : `<a class="brand" href="index.html">
               <img class="brand__icon sprite" src="assets/icons/favicon-64.png" width="32" height="32" alt="">
               <span class="brand__name" data-i18n="site.name"></span>
             </a>
             <nav class="main-nav" data-i18n-attr="aria-label:nav.main">${links}</nav>`
      }
      <div class="site-header__actions">
        <div class="settings" data-settings>
          <button type="button" class="settings__toggle" aria-expanded="false" aria-controls="settings-panel" data-settings-toggle>
            ${pixelIcon("settings", "settings__icon")}
            <span class="settings__label" data-i18n="settings.title"></span>
          </button>
          <div class="settings__panel" id="settings-panel" role="dialog" data-i18n-attr="aria-label:settings.title" hidden>
            ${settingsPanelMarkup()}
          </div>
        </div>
        <button type="button" class="btn btn--emergency" data-open-hotlines>
          <span aria-hidden="true">🚨</span><span class="btn--emergency__text" data-i18n="emergency.button"></span>
        </button>
      </div>
    </div>`;
}

function settingsPanelMarkup() {
  const themes = theme.THEMES.map(
    (th) => `
      <button type="button" class="theme-option" data-theme-option="${th.id}">
        <span class="theme-option__swatch" aria-hidden="true">
          ${th.swatch.map((c) => `<i style="background:${c}"></i>`).join("")}
        </span>
        <span class="theme-option__text">
          <span class="theme-option__name" data-i18n="theme.${th.id}"></span>
          <span class="theme-option__mode" data-i18n="theme.mode.${th.mode}"></span>
        </span>
      </button>`
  ).join("");

  return `
    <h2 class="settings__title" data-i18n="settings.title"></h2>
    <fieldset class="settings__group">
      <legend class="settings__legend" data-i18n="settings.language"></legend>
      <div class="segmented">
        <button type="button" class="segmented__btn" data-lang-option="en" lang="en">English</button>
        <button type="button" class="segmented__btn" data-lang-option="fil" lang="fil">Filipino</button>
      </div>
    </fieldset>
    <fieldset class="settings__group">
      <legend class="settings__legend" data-i18n="settings.theme"></legend>
      <div class="theme-options">${themes}</div>
    </fieldset>
    <fieldset class="settings__group">
      <legend class="settings__legend" data-i18n="settings.sound"></legend>
      <label class="switch-row"><input type="checkbox" data-sound-option="sfx"> <span data-i18n="settings.sfx"></span></label>
      <label class="switch-row"><input type="checkbox" data-sound-option="music"> <span data-i18n="settings.music"></span></label>
    </fieldset>
    <fieldset class="settings__group">
      <legend class="settings__legend" data-i18n="settings.help"></legend>
      <button type="button" class="btn btn--ghost btn--block settings__tour" data-tour-start data-i18n="settings.tour"></button>
    </fieldset>
    <fieldset class="settings__group offline-settings" data-offline-settings hidden>
      <legend class="settings__legend" data-i18n="settings.offline"></legend>
      <div data-offline-body></div>
    </fieldset>`;
}

function syncSettings(header) {
  const lang = getLanguage();
  header.querySelectorAll("[data-lang-option]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.langOption === lang));
  });
  const current = theme.getTheme();
  header.querySelectorAll("[data-theme-option]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.themeOption === current));
  });
  const sound = state.getSound();
  header.querySelectorAll("[data-sound-option]").forEach((box) => {
    box.checked = Boolean(sound[box.dataset.soundOption]);
  });
}

/** Gear button + dropdown panel: opens on click, closes on outside click or Escape. */
function wireSettings(header) {
  const root = header.querySelector("[data-settings]");
  const toggle = root.querySelector("[data-settings-toggle]");
  const panel = root.querySelector(".settings__panel");
  const offlineSettings = mountOfflineSettings(panel.querySelector("[data-offline-settings]"));

  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      syncSettings(header);
      offlineSettings.refresh();
    }
  };

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  document.addEventListener("click", (e) => {
    // composedPath, not contains(): a clicked button may already have been re-rendered away.
    if (!panel.hidden && !e.composedPath().includes(root)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });

  panel.addEventListener("click", (e) => {
    // data-lang-option, not data-lang: <html data-lang> (the first-paint hint) is an ancestor of everything.
    const langBtn = e.target.closest("[data-lang-option]");
    if (langBtn) setLanguage(langBtn.dataset.langOption);
    const themeBtn = e.target.closest("[data-theme-option]");
    if (themeBtn) theme.setTheme(themeBtn.dataset.themeOption);
    syncSettings(header);
    if (e.target.closest("[data-tour-start]")) startTour(() => setOpen(false), toggle);
  });
  // Sound effects and game music (the games read these through js/ui/game-host.js).
  panel.addEventListener("change", (e) => {
    const box = e.target.closest("[data-sound-option]");
    if (box) state.setSound({ [box.dataset.soundOption]: box.checked });
  });
}

/** Agila's tour points at the nav, so a page without one (Welcome) opens it on Home instead. */
function startTour(closeSettings, toggle) {
  if (!document.querySelector(".main-nav")) {
    location.href = "dashboard.html#tour";
    return;
  }
  closeSettings();
  import("../ui/tour.js").then((tour) => tour.start({ focusAfter: toggle }));
}

async function renderFooter(footer) {
  footer.innerHTML = `
    <div class="site-footer__inner">
      <button type="button" class="emergency-chip" data-open-hotlines>
        <span aria-hidden="true">🚨</span> <span data-i18n="emergency.chip"></span>
      </button>
      <div class="site-footer__brand">
        <img class="sprite" src="assets/icons/favicon-64.png" width="32" height="32" alt="">
        <span class="brand__name" data-i18n="site.name"></span>
      </div>
      <p class="site-footer__tagline" data-i18n="site.tagline"></p>
      <div class="site-footer__credits" data-credits></div>
      <p class="site-footer__small">© ${new Date().getFullYear()} Kalasag Kids · <span data-i18n="footer.offline"></span></p>
      <p class="site-footer__small" data-i18n="footer.fonts"></p>
    </div>`;
  applyToPage(footer);

  try {
    const site = await fetchJSON("js/data/site.json");
    // Skip anything left empty so the footer never shows a dangling label or separator.
    const people = [site.school, (site.proponents || []).filter(Boolean).join(", ")].filter(Boolean);
    footer.querySelector("[data-credits]").innerHTML = [
      site.thesisTitle &&
        `<p><span data-i18n="footer.thesis">${esc(t("footer.thesis"))}</span>: <cite>${esc(site.thesisTitle)}</cite></p>`,
      people.length && `<p>${people.map(esc).join(" · ")}</p>`,
    ]
      .filter(Boolean)
      .join("");
  } catch {
    // Credits are optional; the footer still works without them.
  }
}

export function render() {
  const page = document.body.dataset.page;

  const header = document.querySelector("[data-site-header]");
  if (header) {
    const bare = BARE_HEADER_PAGES.has(page);
    header.classList.toggle("site-header--bare", bare);
    // The phone tab bar needs room at the bottom of the page; bare pages have none.
    document.body.classList.toggle("has-tabbar", !bare);
    header.innerHTML = headerMarkup(page);
    wireSettings(header);
    syncSettings(header);
    window.addEventListener("kalasag:languagechange", () => syncSettings(header));
  }

  const footer = document.querySelector("[data-site-footer]");
  if (footer) renderFooter(footer);
}
