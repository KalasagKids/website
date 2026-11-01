/**
 * dashboard.js — the Home page (Profile + Dashboard merged).
 *
 * Everything is computed fresh from state.js on load and whenever progress
 * changes, so a first visit naturally shows 0 states and "Start Learning".
 * Story Mode isn't built yet, so "Jump back in" follows the last hazard
 * opened on the Learn page; it will switch to the journey map later.
 * Home stays the overview hub: the games get one compact card (stars, rank, Continue,
 * and today's Daily Challenge), never an arcade (KALASAG O9).
 */

import { getHazardIndex, esc, sceneUrl } from "../core/data.js";
import { t, pick } from "../core/i18n.js";
import * as state from "../core/state.js";
import * as mascot from "../core/mascot.js";
import * as hotlines from "../ui/hotline-panel.js";
import { hazardIconImg, hazardUrl } from "../ui/hazard-card.js";
import { loadGames, gameById, dailyToday, gameThumb } from "../core/games.js";

const GREETING_MS = 15000;
const TICKER_MS = 9000;

let index = null;

export async function init() {
  [index] = await Promise.all([getHazardIndex(), loadGames()]);

  renderAll();
  hotlines.render(document.querySelector("[data-hotlines]"));
  startGreeting();
  startTickerRotation();
  wireReset();

  window.addEventListener("kalasag:languagechange", renderAll);
  window.addEventListener("kalasag:statechange", () => {
    renderStatsCard();
    renderGamesCard();
  });
}

function renderAll() {
  renderJumpBackIn();
  renderGamesCard();
  renderInfographics();
  renderStatsCard();
}

// ---------- Greeting bubble ----------
async function renderGreeting(bubble) {
  bubble.textContent = await mascot.getRandomTip(bubble.textContent);
}

function startGreeting() {
  const bubble = document.querySelector("[data-greeting]");
  renderGreeting(bubble);
  setInterval(() => !document.hidden && renderGreeting(bubble), GREETING_MS);
  // Tapping the bubble shows another tip right away.
  bubble.addEventListener("click", () => {
    renderGreeting(bubble);
    mascot.setExpression("happy");
  });
  window.addEventListener("kalasag:languagechange", () => renderGreeting(bubble));
}

// ---------- Jump back in ----------
function renderJumpBackIn() {
  const box = document.querySelector("[data-jump-back]");
  const last = index.byId.get(state.getLastHazard());
  const category = last && index.categoryById.get(last.category);

  const kicker = last ? pick(category?.name) : t("dash.startLabel");
  const title = last ? pick(last.name) : t("dash.startTitle");
  const text = last ? pick(last.blurb) : t("dash.startText");
  const href = last ? hazardUrl(last.id) : "courses.html";
  const button = last ? t("dash.continueButton") : t("dash.startButton");
  // A hazard picks up where you left off; a first visit shows the first slideshow scene.
  const scene = last?.image || sceneUrl("volcano-lake");

  box.innerHTML = `
    <article class="card jump" ${last ? `data-category="${esc(last.category)}"` : ""}>
      <img class="jump__bg" src="${esc(scene)}" alt="">
      <div class="jump__body">
        <span class="label-kicker jump__kicker">${esc(kicker)}</span>
        <h3 class="jump__title">${esc(title)}</h3>
        <p class="jump__text">${esc(text)}</p>
        <div class="jump__actions">
          <a class="btn btn--secondary" href="${href}">${esc(button)}</a>
          ${last ? `<a class="jump__all" href="courses.html">${esc(t("dash.viewAll"))}</a>` : ""}
        </div>
      </div>
    </article>`;
}

// ---------- Games card + Daily Challenge ----------
function renderGamesCard() {
  const box = document.querySelector("[data-games-card]");
  if (!box || !index) return;
  const summary = state.getGamesSummary();
  const lastGame = summary.last && gameById(summary.last.gameId);
  const daily = dailyToday();
  const dailyHazard = daily && index.byId.get(daily.hazardId);

  const continueRow = lastGame
    ? `<a class="btn btn--secondary" href="${hazardUrl(summary.last.hazardId)}#game">▶ ${esc(t("dash.gamesContinue", { game: pick(lastGame.title) }))}</a>`
    : `<p class="games-card__text">${esc(t("dash.gamesText"))}</p>
       <a class="btn btn--ghost" href="courses.html#all">${esc(t("dash.gamesStart"))}</a>`;

  const dailyBanner = dailyHazard
    ? `<a class="daily-banner" href="${hazardUrl(dailyHazard.id)}#${daily.built ? "daily" : "game"}" data-category="${esc(dailyHazard.category)}">
         <img class="daily-banner__thumb" src="${esc(gameThumb(daily.id))}" alt="" width="160" height="90" loading="lazy">
         <span class="daily-banner__text">
           <span class="label-kicker">☀ ${esc(t("dash.daily"))}</span>
           <strong>${esc(t("dash.dailyText", { game: pick(daily.title) }))}</strong>
           <span class="daily-banner__cta">
             ${daily.built ? esc(t("dash.dailyPlay")) + " ›" : `<span class="tag">${esc(t("common.comingSoon"))}</span>`}
           </span>
         </span>
       </a>`
    : "";

  box.innerHTML = `
    <article class="card games-card">
      <dl class="games-card__stats">
        <div><dt>${esc(t("dash.gamesStars"))}</dt><dd>⭐ ${summary.totalStars}</dd></div>
        <div><dt>${esc(t("dash.gamesRank"))}</dt><dd>${esc(pick(summary.rank.name))}</dd></div>
      </dl>
      <div class="games-card__continue">${continueRow}</div>
      ${dailyBanner}
    </article>`;
}

// ---------- Safety posters (infographics) ----------
function renderInfographics() {
  document.querySelector("[data-posters]").innerHTML = index.hazards
    .map(
      (h) => `
      <li>
        <a class="poster-tile" href="${hazardUrl(h.id)}#infographic" data-category="${esc(h.category)}">
          ${hazardIconImg(h)}
          <span class="poster-tile__name">${esc(pick(h.name))}</span>
        </a>
      </li>`
    )
    .join("");
}

// ---------- Stats card ----------
function renderStatsCard() {
  if (!index) return;
  const quizzes = index.hazards.filter((h) => h.quizDataPath);
  const passed = quizzes.filter((h) => state.hasPassedQuiz(h.id)).length;
  const stats = [
    { icon: "⭐", value: state.getXP(), label: t("dash.stats.xp") },
    { icon: "🔥", value: state.getStreak().count, label: t("dash.stats.streak") },
    { icon: "▶", value: `${state.getWatchedCount()}/${index.hazards.length}`, label: t("dash.stats.watched") },
    { icon: "❓", value: `${passed}/${quizzes.length}`, label: t("dash.stats.quizzes") },
    // Hazard badges plus the badges earned in the mini-games.
    { icon: "🏅", value: state.getBadgeCount() + state.getGamesSummary().badges, label: t("dash.stats.badges") },
  ];

  document.querySelector("[data-stats]").innerHTML = `
    <div class="stats__who">
      <img class="sprite stats__avatar" src="assets/icons/favicon-64.png" alt="" width="48" height="48">
      <div>
        <p class="stats__name">${esc(t("dash.stats.player"))}</p>
        <p class="stats__sub">Kalasag Kids</p>
      </div>
    </div>
    <dl class="stats__grid">
      ${stats
        .map(
          (s) => `
        <div class="stat">
          <span class="stat__icon" aria-hidden="true">${s.icon}</span>
          <dt class="stat__label">${esc(s.label)}</dt>
          <dd class="stat__value">${esc(s.value)}</dd>
        </div>`
        )
        .join("")}
    </dl>`;
}

// ---------- "Did you know?" ticker ----------
function startTickerRotation() {
  const el = document.querySelector("[data-ticker]");
  const next = async () => {
    const tip = await mascot.getRandomTip(el.textContent);
    el.classList.remove("is-in");
    void el.offsetWidth;
    el.textContent = tip;
    el.classList.add("is-in");
  };
  next();
  setInterval(() => !document.hidden && next(), TICKER_MS);
  window.addEventListener("kalasag:languagechange", next);
}

// ---------- Reset progress (shared school devices) ----------
function wireReset() {
  const dialog = document.querySelector("[data-reset-dialog]");
  document.querySelector("[data-reset]").addEventListener("click", () => dialog.showModal());
  dialog.addEventListener("close", () => {
    if (dialog.returnValue !== "confirm") return;
    state.resetAllProgress();
    renderAll();
    mascot.setExpression("cheer");
    toast(t("dash.resetDone"));
  });
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
