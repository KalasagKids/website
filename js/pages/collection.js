/**
 * collection.js — the Collections page: everything a pupil can watch, play and print.
 *
 * A sticky aside (a scrollable tab row on phones) organizes the groups:
 *   All · Videos · Games · Safety posters · Quizzes
 * with deep links collection.html#videos, #games, #posters, #quizzes. "All" shows each
 * group's first few items with a "See all" link. Category chips filter every group.
 * Videos play in the same modal as the lesson page and count as watched the same way.
 */

import { getHazardIndex, fetchJSON, esc, hazardBanner } from "../core/data.js";
import { t, pick } from "../core/i18n.js";
import * as state from "../core/state.js";
import * as mascot from "../core/mascot.js";
import * as offline from "../core/offline.js";
import { loadGames, gameById, gameThumb, STARS_PER_GAME } from "../core/games.js";
import { hazardIconImg, hazardUrl } from "../ui/hazard-card.js";
import { watchHazardVideo } from "../ui/hazard-video.js";

const GROUPS = [
  { id: "videos", key: "collection.videos", icon: "▶" },
  { id: "games", key: "collection.games", icon: "🎮" },
  { id: "posters", key: "collection.posters", icon: "📋" },
  { id: "quizzes", key: "collection.quizzes", icon: "❓" },
];
const PREVIEW = 4; // items per group on "All"

let index = null;
const posters = new Map(); // hazardId → true when its lesson has a safety poster
let category = "all"; // survives re-renders

export async function init() {
  [index] = await Promise.all([getHazardIndex(), loadGames()]);
  await loadPosters();
  render();
  window.addEventListener("kalasag:languagechange", render);
  window.addEventListener("hashchange", () => render({ focusMain: true }));
  window.addEventListener("kalasag:offlinechange", markSaved);
}

async function loadPosters() {
  const withLesson = index.hazards.filter((h) => h.lesson);
  const lessons = await Promise.all(withLesson.map((h) => fetchJSON(h.lesson).catch(() => null)));
  withLesson.forEach((h, i) => lessons[i]?.infographic && posters.set(h.id, true));
}

const currentGroup = () => {
  const id = location.hash.replace("#", "");
  return GROUPS.some((g) => g.id === id) ? id : "all";
};
const inCategory = (hazard) => category === "all" || hazard.category === category;

/* ---------- items per group ---------- */
function videoItems() {
  // Hazards with a video first; the rest stay visible, dimmed, as "coming soon".
  const list = index.hazards.filter(inCategory);
  return [...list.filter((h) => h.video), ...list.filter((h) => !h.video)];
}
function gameItems() {
  return index.hazards.filter((h) => inCategory(h) && gameById(h.game));
}
function posterItems() {
  return index.hazards.filter((h) => inCategory(h) && posters.has(h.id));
}
function quizItems() {
  return index.hazards.filter((h) => inCategory(h) && h.quizDataPath);
}
function count(groupId) {
  if (groupId === "videos") return videoItems().filter((h) => h.video).length;
  if (groupId === "games") return gameItems().length;
  if (groupId === "posters") return posterItems().length;
  if (groupId === "quizzes") return quizItems().length;
  return 0;
}

/* ---------- cards ---------- */
function videoCard(h) {
  const cat = index.categoryById.get(h.category);
  if (!h.video) {
    return `
      <li class="card c-card is-soon" data-category="${esc(h.category)}">
        <div class="c-card__media"><img class="c-card__img" src="${esc(hazardBanner(h))}" alt="" loading="lazy"></div>
        <div class="c-card__body">
          <span class="label-kicker">${esc(pick(cat?.name))}</span>
          <h3 class="c-card__title">${esc(pick(h.name))}</h3>
          <div class="c-card__tags"><span class="tag">${esc(t("common.comingSoon"))}</span></div>
        </div>
      </li>`;
  }
  const watched = state.hasWatchedVideo(h.id);
  return `
    <li class="card c-card" data-category="${esc(h.category)}">
      <button type="button" class="c-card__media c-card__hit" data-play-video="${esc(h.id)}" aria-label="${esc(t("collection.watch"))}: ${esc(pick(h.name))}">
        <img class="c-card__img" src="${esc(hazardBanner(h))}" alt="" loading="lazy">
        <span class="c-card__play" aria-hidden="true">▶</span>
      </button>
      <div class="c-card__body">
        <span class="label-kicker">${esc(pick(cat?.name))}</span>
        <h3 class="c-card__title">${esc(pick(h.name))}</h3>
        <div class="c-card__tags" data-video-tags="${esc(h.video)}">
          ${watched ? `<span class="tag tag--done">✓ ${esc(t("learn.watched"))}</span>` : ""}
        </div>
      </div>
    </li>`;
}

function gameCard(h) {
  const game = gameById(h.game);
  const stars = state.getGamesSummary().stars[game.id] || 0;
  return `
    <li class="card c-card${game.built ? "" : " is-soon"}" data-category="${esc(h.category)}">
      <a class="c-card__media" href="${hazardUrl(h.id)}#game" tabindex="-1" aria-hidden="true">
        <img class="c-card__img c-card__img--pixel" src="${esc(gameThumb(game.id))}" alt="" loading="lazy" width="320" height="180">
      </a>
      <div class="c-card__body">
        <span class="label-kicker">${esc(pick(h.name))}</span>
        <h3 class="c-card__title"><a href="${hazardUrl(h.id)}#game">${esc(pick(game.title))}</a></h3>
        <div class="c-card__tags">
          ${
            game.built
              ? `<span class="tag">⭐ ${esc(t("collection.stars", { n: stars, max: STARS_PER_GAME }))}</span>
                 <a class="btn btn--primary c-card__btn" href="${hazardUrl(h.id)}#game">${esc(t("collection.play"))}</a>`
              : `<span class="tag">${esc(t("common.comingSoon"))}</span>`
          }
        </div>
      </div>
    </li>`;
}

function posterCard(h) {
  return `
    <li class="card c-card c-card--poster" data-category="${esc(h.category)}">
      <a class="c-card__poster" href="${hazardUrl(h.id)}#infographic">
        ${hazardIconImg(h, "hazard-icon--lg")}
        <span>
          <span class="label-kicker">${esc(t("learn.infographic"))}</span>
          <span class="c-card__title">${esc(pick(h.name))}</span>
        </span>
      </a>
      <div class="c-card__tags">
        <a class="btn btn--ghost c-card__btn" href="${hazardUrl(h.id)}#infographic">${esc(t("collection.open"))}</a>
        <a class="btn btn--ghost c-card__btn" href="courses.html?hazard=${encodeURIComponent(h.id)}&amp;print=1#infographic">🖨 ${esc(t("common.print"))}</a>
      </div>
    </li>`;
}

function quizCard(h) {
  const cat = index.categoryById.get(h.category);
  const passed = state.hasPassedQuiz(h.id);
  const href = `${hazardUrl(h.id)}#quiz`;
  return `
    <li class="card c-card" data-category="${esc(h.category)}">
      <a class="c-card__media" href="${href}" tabindex="-1" aria-hidden="true">
        <img class="c-card__img" src="${esc(hazardBanner(h))}" alt="" loading="lazy">
      </a>
      <div class="c-card__body">
        <span class="label-kicker">${esc(pick(cat?.name))}</span>
        <h3 class="c-card__title"><a href="${href}">${esc(pick(h.name))}</a></h3>
        <div class="c-card__tags">
          ${
            passed
              ? `<span class="tag tag--done">✓ ${esc(t("quiz.passedTag"))}</span>`
              : `<span class="tag">${esc(t("collection.quizNotYet"))}</span>`
          }
          <a class="btn ${passed ? "btn--ghost" : "btn--primary"} c-card__btn" href="${href}">${esc(t(passed ? "quiz.playAgain" : "collection.takeQuiz"))}</a>
        </div>
      </div>
    </li>`;
}

/** "Quizzes passed: n / 19" above the quiz cards (always over every hazard, not the filter). */
function quizProgress() {
  const total = index.hazards.filter((h) => h.quizDataPath).length;
  const passed = index.hazards.filter((h) => h.quizDataPath && state.hasPassedQuiz(h.id)).length;
  return `
    <div class="quiz-progress">
      <p class="section-sub">${esc(t("collection.quizzesText"))}</p>
      <div class="quiz-progress__bar">
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${passed}" aria-label="${esc(t("dash.stats.quizzes"))}">
          <div class="progress__fill" style="--value:${total ? Math.round((passed / total) * 100) : 0}%"></div>
        </div>
        <span>${esc(t("quiz.progress", { n: passed, total }))}</span>
      </div>
    </div>`;
}

const ITEMS = { videos: videoItems, games: gameItems, posters: posterItems, quizzes: quizItems };
const CARDS = { videos: videoCard, games: gameCard, posters: posterCard, quizzes: quizCard };

function groupSection(group, preview) {
  const items = ITEMS[group.id]();
  const card = CARDS[group.id];
  const shown = preview ? items.slice(0, PREVIEW) : items;
  return `
    <section class="collection-group" data-group="${group.id}" aria-labelledby="cg-${group.id}">
      <div class="section-head">
        <h2 class="section-title" id="cg-${group.id}">${group.icon} ${esc(t(group.key))}</h2>
        ${preview && items.length > PREVIEW ? `<a class="section-link" href="#${group.id}">${esc(t("collection.seeAll"))} (${items.length}) ›</a>` : ""}
      </div>
      ${group.id === "quizzes" ? quizProgress() : ""}
      ${
        shown.length
          ? `<ul class="collection-grid${group.id === "posters" ? " collection-grid--posters" : ""}">${shown.map(card).join("")}</ul>`
          : `<p class="section-sub">${esc(t("collection.empty"))}</p>`
      }
    </section>`;
}

/* ---------- page ---------- */
function render({ focusMain = false } = {}) {
  const main = document.getElementById("main");
  const group = currentGroup();
  document.title = `${t("collection.title")} · Kalasag Kids`;

  const tabs = [{ id: "all", key: "collection.all", icon: "★" }, ...GROUPS]
    .map((g) => {
      const n = g.id === "all" ? GROUPS.reduce((sum, x) => sum + count(x.id), 0) : count(g.id);
      const badge = `<span class="collection__count">${n}</span>`;
      return `
        <li>
          <a class="collection__tab" href="#${g.id}"${g.id === group ? ' aria-current="page"' : ""}>
            <span class="collection__icon" aria-hidden="true">${g.icon}</span>
            <span class="collection__label">${esc(t(g.key))}</span>
            ${badge}
          </a>
        </li>`;
    })
    .join("");

  const chips = [{ id: "all", name: null }, ...index.categories]
    .map(
      (c) =>
        `<button type="button" class="chip" data-filter="${esc(c.id)}"${c.id === "all" ? "" : ` data-category="${esc(c.id)}"`} aria-pressed="${category === c.id}">${esc(c.name ? pick(c.name) : t("common.all"))}</button>`
    )
    .join("");

  const sections = group === "all" ? GROUPS.map((g) => groupSection(g, true)).join("") : groupSection(GROUPS.find((g) => g.id === group), false);

  main.innerHTML = `
    <div class="page-hero">
      <img class="mascot mascot--3x" data-mascot data-rest="idle" src="${mascot.spriteUrl("pose_run_flap_1_geared")}" alt="" width="120" height="120">
      <div>
        <h1 class="page-hero__title">${esc(t("collection.title"))}</h1>
        <p class="page-hero__sub">${esc(t("collection.subtitle"))}</p>
      </div>
    </div>

    <div class="collection">
      <nav class="collection__aside" aria-label="${esc(t("collection.sections"))}">
        <ul class="collection__tabs">${tabs}</ul>
      </nav>
      <div class="collection__main" id="collection-main" tabindex="-1">
        <div class="chip-row collection__filters" role="group" aria-label="${esc(t("learn.allHazards"))}">${chips}</div>
        ${sections}
      </div>
    </div>`;

  mascot.init(main);
  wire(main);
  markSaved();
  // On phones the aside is a scrolling tab row: bring the current tab into view without
  // scrolling the page itself.
  const aside = main.querySelector(".collection__aside");
  const tab = main.querySelector('.collection__tab[aria-current="page"]');
  if (aside && tab && aside.scrollWidth > aside.clientWidth) {
    const left = tab.getBoundingClientRect().left - aside.getBoundingClientRect().left + aside.scrollLeft;
    aside.scrollLeft = left - (aside.clientWidth - tab.offsetWidth) / 2;
  }
  if (focusMain) main.querySelector("#collection-main")?.focus({ preventScroll: true });
}

function wire(main) {
  main.querySelector(".collection__filters").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-filter]");
    if (!chip) return;
    category = chip.dataset.filter;
    render();
    document.querySelector(`[data-filter="${CSS.escape(category)}"]`)?.focus();
  });
  main.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-play-video]");
    if (!btn) return;
    const hazard = index.byId.get(btn.dataset.playVideo);
    const { firstTime } = await watchHazardVideo(hazard);
    if (firstTime) render();
  });
}

/** Adds "📥 Saved" to videos this device has saved for offline. */
async function markSaved() {
  if (!offline.isSupported()) return;
  for (const box of document.querySelectorAll("[data-video-tags]")) {
    const saved = await offline.isSaved(box.dataset.videoTags);
    box.querySelector(".tag--saved")?.remove();
    if (saved) box.insertAdjacentHTML("beforeend", `<span class="tag tag--saved">📥 ${esc(t("collection.saved"))}</span>`);
  }
}
