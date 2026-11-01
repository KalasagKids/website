/**
 * hotline-panel.js — the emergency hotlines, one tap away on every page.
 *
 * Two forms share the same list:
 *   - a dialog opened by any [data-open-hotlines] button (header, footer chip)
 *   - an always-visible inline panel: render(container)  (Home sidebar)
 *
 * National numbers are fixed here (verified 2026). The local BFP numbers come
 * from js/data/local-hotlines.json, one entry per city/municipality chosen
 * from a dropdown (remembered on this device).
 *
 * Numbers are shown as plain text, not tap-to-call links: shared school
 * computers can't place calls, and a pupil should read the number to an adult.
 */

import { fetchJSON, esc } from "../core/data.js";
import { t, pick } from "../core/i18n.js";
import { getHotlineArea, setHotlineArea } from "../core/state.js";

const NATIONAL = [
  { labelKey: "emergency.national", number: "911", primary: true },
  { labelKey: "emergency.ndrrmc", number: "(02) 8911-1406" },
  { labelKey: "emergency.redcross", number: "143" },
  { labelKey: "emergency.pnp", number: "117" },
];

let localPromise = null;
function getLocalNumbers() {
  localPromise ??= fetchJSON("js/data/local-hotlines.json").catch(() => ({}));
  return localPromise;
}

async function listMarkup() {
  const local = await getLocalNumbers();
  const areas = local.areas || [];
  const area = areas.find((a) => a.id === getHotlineArea());
  const rows = NATIONAL.map((n) => ({ label: t(n.labelKey), numbers: [{ number: n.number }], primary: n.primary }));
  if (area) {
    // One row per station, however many numbers it has. An entry is either
    // "number" or { number, note } (e.g. a substation).
    const numbers = area.numbers.map((n) => (typeof n === "string" ? { number: n } : n));
    rows.push({ label: pick(local.bfp.label), sub: area.name, numbers });
  }

  return rows
    .map((row) => {
      const numbers = row.numbers.length
        ? row.numbers
            .map(
              (n) => `<span class="hotline__entry">
                        <span class="hotline__number">${esc(n.number)}</span>
                        ${n.note ? `<span class="hotline__note">${esc(n.note)}</span>` : ""}
                      </span>`
            )
            .join("")
        : `<span class="hotline__missing">${esc(t("emergency.missing"))}</span>`;
      const sub = row.sub ? `<span class="hotline__sub">${esc(row.sub)}</span>` : "";
      return `<li class="hotline${row.primary ? " hotline--primary" : ""}">
                <span class="hotline__label">${esc(row.label)}${sub}</span>
                <span class="hotline__numbers">${numbers}</span>
              </li>`;
    })
    .join("");
}

async function areaMarkup() {
  const local = await getLocalNumbers();
  const current = getHotlineArea();
  const choices = [{ id: "", name: t("emergency.areaPick") }, ...(local.areas || [])];
  const chosen = choices.find((a) => a.id === current) || choices[0];
  const labelId = `hotline-area-${++pickerSeq}`;
  const options = choices
    .map(
      (a) => `<li role="option" tabindex="-1" class="hotline-area__option" data-value="${esc(a.id)}"
                  aria-selected="${a.id === chosen.id}">${esc(a.name)}</li>`
    )
    .join("");
  return `<span class="hotline-area__label" id="${labelId}">${esc(t("emergency.area"))}</span>
          <div class="hotline-area__picker">
            <button type="button" class="hotline-area__select" data-area-toggle
                    aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${labelId}">${esc(chosen.name)}</button>
            <ul class="hotline-area__list" role="listbox" aria-labelledby="${labelId}" data-area-list hidden>${options}</ul>
          </div>`;
}

async function fill(panel) {
  panel.querySelector("[data-hotline-title]").textContent = t("emergency.title");
  panel.querySelector("[data-hotline-intro]").textContent = t("emergency.intro");
  const [area, list] = await Promise.all([areaMarkup(), listMarkup()]);
  panel.querySelector("[data-hotline-areabox]").innerHTML = area;
  panel.querySelector("[data-hotline-list]").innerHTML = list;
}

function panelMarkup(headingTag) {
  return `
    <${headingTag} class="hotline-panel__title"><span aria-hidden="true">🚨</span> <span data-hotline-title></span></${headingTag}>
    <p class="hotline-panel__intro" data-hotline-intro></p>
    <div class="hotline-area" data-hotline-areabox></div>
    <ul class="hotline-list" data-hotline-list></ul>`;
}

const inlinePanels = new Set();

// ---------- Area picker ----------
// A custom listbox instead of a <select>: a native dropdown's open list can't
// be given a scroll height, so 16 places ran down the whole screen.
// Delegated listeners cover every panel; a pick re-fills them all so they stay in sync.
let pickerSeq = 0;

function openList(toggle) {
  const list = toggle.nextElementSibling;
  list.hidden = false;
  toggle.setAttribute("aria-expanded", "true");
  (list.querySelector('[aria-selected="true"]') || list.firstElementChild).focus();
}

function closeList(toggle, refocus = true) {
  toggle.nextElementSibling.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
  if (refocus) toggle.focus();
}

async function choose(option) {
  const panel = option.closest(".hotline-panel");
  setHotlineArea(option.dataset.value);
  await Promise.all([...inlinePanels, dialog].filter(Boolean).map(fill));
  panel.querySelector("[data-area-toggle]")?.focus();
}

document.addEventListener("click", (e) => {
  const toggle = e.target.closest("[data-area-toggle]");
  const option = e.target.closest(".hotline-area__option");
  document.querySelectorAll('[data-area-toggle][aria-expanded="true"]').forEach((open) => {
    if (open !== toggle) closeList(open, false);
  });
  if (toggle) {
    if (toggle.getAttribute("aria-expanded") === "true") closeList(toggle);
    else openList(toggle);
  } else if (option) {
    choose(option);
  }
});

document.addEventListener("keydown", (e) => {
  const toggle = e.target.closest?.("[data-area-toggle]");
  if (toggle && ["ArrowDown", "ArrowUp"].includes(e.key)) {
    e.preventDefault();
    openList(toggle);
    return;
  }
  const option = e.target.closest?.(".hotline-area__option");
  if (!option) return;
  const list = option.parentElement;
  const options = [...list.children];
  const i = options.indexOf(option);
  const move = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: options.length - 1, PageDown: i + 5, PageUp: i - 5 };
  if (e.key in move) {
    e.preventDefault();
    options[Math.max(0, Math.min(options.length - 1, move[e.key]))].focus();
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    choose(option);
  } else if (e.key === "Escape" || e.key === "Tab") {
    // Escape closes only the list: a cancelled keydown keeps the dialog open.
    if (e.key === "Escape") e.preventDefault();
    closeList(list.previousElementSibling, e.key === "Escape");
  } else if (e.key.length === 1) {
    // Type a letter to jump to the next place starting with it.
    const key = e.key.toLowerCase();
    const after = [...options.slice(i + 1), ...options.slice(0, i + 1)];
    after.find((o) => o.dataset.value && o.textContent.trim().toLowerCase().startsWith(key))?.focus();
  }
});

/** Mounts an always-visible hotline panel inside container. */
export function render(container) {
  container.classList.add("hotline-panel");
  container.innerHTML = panelMarkup("h2");
  inlinePanels.add(container);
  fill(container);
}

// ---------- Dialog form ----------
let dialog = null;

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.className = "modal hotline-dialog";
  dialog.setAttribute("aria-labelledby", "hotline-dialog-title");
  dialog.innerHTML = `
    <div class="modal__box hotline-panel">
      <button type="button" class="modal__close" data-close aria-label="${esc(t("common.close"))}">✕</button>
      ${panelMarkup("h2").replace("<h2 ", '<h2 id="hotline-dialog-title" ')}
    </div>`;
  dialog.addEventListener("click", (e) => {
    // Clicking the backdrop (the dialog itself, outside the box) closes it.
    if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
  });
  document.body.appendChild(dialog);
  return dialog;
}

export async function openDialog() {
  const d = ensureDialog();
  await fill(d);
  d.querySelector("[data-close]").setAttribute("aria-label", t("common.close"));
  if (!d.open) d.showModal();
}

export function toggleExpanded() {
  if (dialog?.open) dialog.close();
  else openDialog();
}

/** Called once per page by main.js: any [data-open-hotlines] opens the dialog. */
export function mountSiteWide() {
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-open-hotlines]")) {
      e.preventDefault();
      openDialog();
    }
  });
  window.addEventListener("kalasag:languagechange", () => {
    inlinePanels.forEach(fill);
    if (dialog?.open) fill(dialog);
  });
}
