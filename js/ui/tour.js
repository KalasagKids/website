/**
 * tour.js — Agila's tour: a short popup walk through the site's navigation.
 *
 * Opens by itself the first time Home loads on a device (and again after "Reset my
 * progress"), or from Settings → "Show Agila's tour" on any page. Each step dims the
 * page, lights up one part of it (the nav links, Settings, Emergency, the certificate
 * card) and Agila explains it in a speech bubble, with Back / Next / Skip.
 *
 * A step whose target isn't on the page (the certificate before it's earned, the nav
 * on a bare page) is shown in the middle of the screen instead, so the same steps work
 * everywhere and on the phone tab bar. Seen-ness lives in state.js ("kalasag:tutorial").
 */

import { t } from "../core/i18n.js";
import * as state from "../core/state.js";
import * as mascot from "../core/mascot.js";

// target: where the spotlight goes (none = centred). pose: Agila's expression (mascot.js).
// shownKey: the text to use instead when the target IS on the page (the earned certificate).
const STEPS = [
  { key: "hello", pose: "greet" },
  { key: "home", target: '.main-nav__link[href="dashboard.html"]', pose: "point" },
  { key: "learn", target: '.main-nav__link[href="courses.html"]', pose: "point" },
  { key: "collection", target: '.main-nav__link[href="collection.html"]', pose: "point" },
  { key: "subject", target: '.main-nav__link[href="subject-connect.html"]', pose: "point" },
  { key: "settings", target: "[data-settings-toggle]", pose: "thinking" },
  { key: "emergency", target: ".site-header [data-open-hotlines]", pose: "alert" },
  { key: "cert", target: "[data-cert]:not([hidden])", pose: "cheer", shownKey: "certShown" },
];

const SPOT_PAD = 6; // px of breathing room around the lit-up element
const EDGE = 12; // px kept free at the screen edges
const GAP = 14; // px between the spotlight and the card

let dialog = null;
let index = 0;
let returnFocus = null;

/** Starts the tour on its own the first time Home loads (or when opened as dashboard.html#tour). */
export function autoStart() {
  const asked = location.hash === "#tour";
  if (asked) history.replaceState(null, "", location.pathname + location.search);
  if (asked || !state.hasSeenTour()) setTimeout(() => start(), asked ? 0 : 600);
}

/** Opens the tour at its first step. `focusAfter` gets the focus back when it closes. */
export function start({ focusAfter = null } = {}) {
  if (dialog?.open) return;
  dialog ??= build();
  returnFocus = focusAfter || document.activeElement;
  index = 0;
  dialog.showModal();
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, { passive: true });
  show();
}

function build() {
  const el = document.createElement("dialog");
  el.className = "tour";
  el.setAttribute("aria-labelledby", "tour-title");
  el.setAttribute("aria-describedby", "tour-text");
  el.innerHTML = `
    <div class="tour__spot" aria-hidden="true"></div>
    <div class="tour__card">
      <div class="tour__talk">
        <img class="mascot tour__agila" src="${mascot.spriteUrl("pose_idle_geared")}" alt="" width="80" height="80" draggable="false">
        <div class="bubble tour__bubble" aria-live="polite">
          <p class="label-kicker tour__count"></p>
          <h2 class="tour__title" id="tour-title"></h2>
          <p class="tour__text" id="tour-text"></p>
        </div>
      </div>
      <div class="tour__actions">
        <button type="button" class="tour__skip" data-tour="skip"></button>
        <button type="button" class="btn btn--ghost" data-tour="back"></button>
        <button type="button" class="btn btn--primary" data-tour="next"></button>
      </div>
    </div>`;
  document.body.appendChild(el);

  el.addEventListener("click", (e) => {
    const action = e.target.closest("[data-tour]")?.dataset.tour;
    if (action === "next") go(1);
    else if (action === "back") go(-1);
    else if (action === "skip") el.close();
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
  });
  // Every way out (Done, Skip, Escape) ends here.
  el.addEventListener("close", () => {
    state.markTourSeen();
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place);
    returnFocus?.focus?.();
  });
  return el;
}

function go(delta) {
  const next = index + delta;
  if (next < 0) return;
  if (next >= STEPS.length) {
    dialog.close();
    return;
  }
  index = next;
  show();
}

function show() {
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const q = (sel) => dialog.querySelector(sel);
  const target = findTarget(step);
  const key = target && step.shownKey ? step.shownKey : step.key;

  q(".tour__count").textContent = t("tour.count", { n: index + 1, total: STEPS.length });
  q(".tour__title").textContent = t(`tour.${key}.title`);
  q(".tour__text").textContent = t(`tour.${key}.text`);
  const back = q('[data-tour="back"]');
  const next = q('[data-tour="next"]');
  const skip = q('[data-tour="skip"]');
  back.textContent = t("tour.back");
  next.textContent = last ? t("tour.done") : t("tour.next");
  skip.textContent = t("tour.skip");
  back.hidden = index === 0;
  skip.hidden = last;

  // An element below the fold (the certificate card) is scrolled into view first.
  const r = target?.getBoundingClientRect();
  if (r && (r.top < 0 || r.bottom > window.innerHeight)) target.scrollIntoView({ block: "center" });

  mascot.setExpression(step.pose, q(".tour__agila"));
  place();
  next.focus();
}

/** The step's element, if it's on the page and showing. */
function findTarget(step) {
  const el = step.target && document.querySelector(step.target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? el : null;
}

/** Puts the spotlight over the target and the card beside it (below or above, whichever fits). */
function place() {
  if (!dialog?.open) return;
  const spot = dialog.querySelector(".tour__spot");
  const card = dialog.querySelector(".tour__card");
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const target = findTarget(STEPS[index]);

  dialog.classList.toggle("tour--center", !target);
  if (!target) {
    card.style.left = `${Math.max(EDGE, (vw - cw) / 2)}px`;
    card.style.top = `${Math.max(EDGE, (vh - ch) / 2)}px`;
    return;
  }

  const r = target.getBoundingClientRect();
  const x = Math.max(EDGE / 2, r.left - SPOT_PAD);
  const y = Math.max(EDGE / 2, r.top - SPOT_PAD);
  const w = Math.min(vw - EDGE / 2, r.right + SPOT_PAD) - x;
  const h = Math.min(vh - EDGE / 2, r.bottom + SPOT_PAD) - y;
  Object.assign(spot.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });

  let top;
  if (vh - (y + h) >= ch + GAP + EDGE) top = y + h + GAP;
  else if (y >= ch + GAP + EDGE) top = y - GAP - ch;
  else top = vh - ch - EDGE; // a target taller than the screen: the card sits over its bottom
  const left = Math.min(Math.max(EDGE, x + w / 2 - cw / 2), vw - cw - EDGE);
  card.style.left = `${Math.max(EDGE, left)}px`;
  card.style.top = `${Math.max(EDGE, top)}px`;
}
