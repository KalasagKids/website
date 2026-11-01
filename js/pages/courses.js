/**
 * courses.js — the Learn page. One page, two views:
 *   courses.html                 → catalog (Learning Journeys rows + All Hazards grid)
 *   courses.html?hazard=<id>     → hazard learning view (video gate, six beats, quiz,
 *                                  Mini-game section, safety poster, subject strip)
 * The Mini-game section's routes (#game, #play/<w>-<l>, #daily) belong to js/ui/game-host.js,
 * the quiz (#quiz) to js/ui/quiz.js.
 * An unknown or missing id falls back to the catalog.
 */

import { getHazardIndex, fetchJSON, esc, PLACEHOLDER_IMG } from "../core/data.js";
import { t, pick } from "../core/i18n.js";
import * as state from "../core/state.js";
import * as mascot from "../core/mascot.js";
import { watchHazardVideo } from "../ui/hazard-video.js";
import { mountSaveButton } from "../ui/offline-ui.js";
import * as offline from "../core/offline.js";
import { loadGames } from "../core/games.js";
import * as gameHost from "../ui/game-host.js";
import * as quiz from "../ui/quiz.js";
import { hazardCard, hazardIconImg, hazardUrl } from "../ui/hazard-card.js";

const BEATS = ["what", "signs", "before", "during", "after", "signoff"];

const main = () => document.getElementById("main");

// Catalog filters survive a language switch re-render.
const filters = { category: "all", query: "" };

export async function init() {
  // The registry tells the catalog which hazards already have a playable game (🎮 tag).
  const [index] = await Promise.all([getHazardIndex(), loadGames()]);
  const id = new URLSearchParams(location.search).get("hazard");
  const hazard = id && index.byId.get(id);

  const render = hazard ? () => renderHazardView(hazard, index) : () => renderCatalog(index);
  await render();
  window.addEventListener("kalasag:languagechange", render);

  if (hazard) {
    state.markHazardExplored(hazard.id);
    state.setLastHazard(hazard.id);
    // Offline, the gate waits for a visit with internet instead of opening on an unplayable video.
    const playable = hazard.video && (navigator.onLine || (await offline.isSaved(hazard.video)));
    // A link straight into a game (#play/…, #daily) skips the gate; it opens on the next plain visit.
    const gameRoute = /^#(play\/|daily)/.test(location.hash);
    if (playable && !gameRoute && !state.hasSeenVideoGate(hazard.id)) {
      state.markVideoGateSeen(hazard.id);
      playVideo(hazard, index, { autoplay: true });
    }
  }
}

// =============================================================
// Catalog view
// =============================================================

function journeyRow(category, index) {
  const hazards = index.hazards.filter((h) => h.category === category.id);
  const videos = hazards.filter((h) => h.video).length;
  const stats = [`${hazards.length} ${t(hazards.length === 1 ? "common.hazard" : "common.hazards")}`];
  if (videos) stats.push(`${videos} ${t(videos === 1 ? "common.video" : "common.videos")}`);

  return `
    <section class="journey" data-category="${esc(category.id)}">
      <div class="journey__head">
        <div>
          <h3 class="journey__title">${esc(pick(category.name))}</h3>
          <p class="journey__blurb">${esc(pick(category.blurb))}</p>
          <p class="journey__stats">${esc(stats.join(" · "))}</p>
        </div>
        <div class="journey__arrows">
          <button type="button" class="icon-btn" data-scroll="-1" aria-label="${esc(t("common.scrollLeft"))}">‹</button>
          <button type="button" class="icon-btn" data-scroll="1" aria-label="${esc(t("common.scrollRight"))}">›</button>
        </div>
      </div>
      <div class="scroller">${hazards.map((h) => hazardCard(h, index)).join("")}</div>
    </section>`;
}

function matches(hazard) {
  if (filters.category !== "all" && hazard.category !== filters.category) return false;
  const q = filters.query.trim().toLowerCase();
  if (!q) return true;
  // Search both languages so a pupil can type "lindol" or "earthquake".
  return [hazard.name.en, hazard.name.fil, hazard.blurb.en, hazard.blurb.fil].some((s) => s?.toLowerCase().includes(q));
}

function renderGrid(index) {
  const list = index.hazards.filter(matches);
  const grid = main().querySelector("[data-grid]");
  grid.innerHTML = list.map((h) => hazardCard(h, index)).join("");
  main().querySelector("[data-empty]").hidden = list.length > 0;
}

function renderCatalog(index) {
  document.title = `${t("learn.title")} · Kalasag Kids`;
  const chips = [{ id: "all", name: null }, ...index.categories]
    .map(
      (c) =>
        `<button type="button" class="chip" data-filter="${esc(c.id)}"${c.id === "all" ? "" : ` data-category="${esc(c.id)}"`} aria-pressed="${filters.category === c.id}">${esc(c.name ? pick(c.name) : t("common.all"))}</button>`
    )
    .join("");

  main().innerHTML = `
    <div class="page-hero">
      <img class="mascot mascot--3x" data-mascot data-rest="thinking" src="${mascot.spriteUrl("prop_on_magnifier_geared")}" alt="" width="120" height="120">
      <div>
        <h1 class="page-hero__title">${esc(t("learn.title"))}</h1>
        <p class="page-hero__sub">${esc(t("learn.subtitle"))}</p>
      </div>
    </div>

    <section class="section">
      <h2 class="section-title">${esc(t("learn.journeys"))}</h2>
      <p class="section-sub">${esc(t("learn.journeysText"))}</p>
      <div class="journeys">${index.categories.map((c) => journeyRow(c, index)).join("")}</div>
    </section>

    <section class="section" id="all">
      <h2 class="section-title">${esc(t("learn.allHazards"))}</h2>
      <p class="section-sub">${esc(t("learn.allHazardsText"))}</p>
      <div class="catalog-toolbar">
        <label class="search">
          <span aria-hidden="true">🔍</span>
          <span class="visually-hidden">${esc(t("common.search"))}</span>
          <input type="search" data-search placeholder="${esc(t("learn.searchPlaceholder"))}" value="${esc(filters.query)}">
        </label>
        <div class="chip-row">${chips}</div>
      </div>
      <div class="card-grid" data-grid></div>
      <div class="pending" data-empty hidden>
        <img class="sprite" src="${mascot.spriteUrl("prop_on_sweat_drop_geared")}" alt="" width="80" height="80">
        <p>${esc(t("learn.noResults"))}</p>
      </div>
    </section>`;

  renderGrid(index);
  mascot.init(main());

  main().querySelectorAll("[data-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const scroller = btn.closest(".journey").querySelector(".scroller");
      scroller.scrollBy({ left: Number(btn.dataset.scroll) * scroller.clientWidth * 0.9, behavior: "smooth" });
    });
  });

  main().querySelector("[data-search]").addEventListener("input", (e) => {
    filters.query = e.target.value;
    renderGrid(index);
  });

  main().querySelector(".chip-row").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-filter]");
    if (!chip) return;
    filters.category = chip.dataset.filter;
    main().querySelectorAll("[data-filter]").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
    renderGrid(index);
  });
}

// =============================================================
// Hazard learning view
// =============================================================

async function loadLesson(hazard) {
  if (!hazard.lesson) return null;
  try {
    return await fetchJSON(hazard.lesson);
  } catch {
    return null;
  }
}

function beatsMarkup(lesson) {
  if (!lesson) {
    return `
      <div class="pending">
        <img class="sprite" src="${mascot.spriteUrl("prop_on_magnifier_geared")}" alt="" width="80" height="80">
        <p>${esc(t("learn.lessonPending"))}</p>
      </div>`;
  }
  return `<ol class="beats">${BEATS.map((key, i) => {
    const beat = lesson.beats?.[key];
    if (!beat) return "";
    return `
      <li class="card beat beat--${key}">
        <span class="beat__num" aria-hidden="true">${i + 1}</span>
        <img class="sprite beat__sprite" src="${mascot.spriteUrl(beat.sprite || "pose_idle_geared")}" alt="" width="80" height="80" loading="lazy">
        <div>
          <h3 class="beat__title">${esc(t("learn.beat." + key))}</h3>
          <p>${esc(pick(beat))}</p>
        </div>
      </li>`;
  }).join("")}</ol>`;
}

function posterMarkup(hazard, lesson) {
  const info = lesson?.infographic;
  if (!info) {
    return `<img class="poster-placeholder" src="${PLACEHOLDER_IMG}" alt="">`;
  }
  const list = (items, mark) => items.map((item) => `<li><span aria-hidden="true">${mark}</span> ${esc(pick(item))}</li>`).join("");
  return `
    <article class="poster" data-category="${esc(hazard.category)}">
      <header class="poster__head">
        ${hazardIconImg(hazard, "hazard-icon--lg")}
        <h3 class="poster__title">${esc(pick(hazard.name))}</h3>
      </header>
      <div class="poster__cols">
        <section class="poster__col poster__col--signs">
          <h4>⚠️ ${esc(t("learn.signs"))}</h4>
          <ul>${list(info.signs || [], "•")}</ul>
        </section>
        <section class="poster__col poster__col--dos">
          <h4>✅ ${esc(t("learn.dos"))}</h4>
          <ul>${list(info.dos || [], "✓")}</ul>
        </section>
        <section class="poster__col poster__col--donts">
          <h4>❌ ${esc(t("learn.donts"))}</h4>
          <ul>${list(info.donts || [], "✗")}</ul>
        </section>
      </div>
      <footer class="poster__foot">🚨 ${esc(t("learn.hotlineReminder"))} · Red Cross 143 · PNP 117</footer>
    </article>`;
}

async function subjectsMarkup(hazard, lesson) {
  let subjects = [];
  try {
    subjects = (await fetchJSON("js/data/subjects.json")).subjects;
  } catch {
    // Without subject names there's nothing useful to show.
  }
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const links = lesson?.subjectLinks?.length
    ? lesson.subjectLinks
    : (hazard.subjects || []).map((subject) => ({ subject }));
  if (!links.length) return `<p class="section-sub">${esc(t("learn.subjectsPending"))}</p>`;

  return `<ul class="subject-strip">${links
    .map((link) => {
      const subject = byId.get(link.subject);
      if (!subject) return "";
      const text = link.en ? pick(link) : pick(subject.blurb);
      return `
        <li>
          <a class="card subject-link" href="subject-connect.html?subject=${esc(subject.id)}">
            <span class="subject-link__name">${esc(pick(subject.name))}</span>
            <span class="subject-link__text">${esc(text)}</span>
          </a>
        </li>`;
    })
    .join("")}</ul>`;
}

function neighbors(hazard, index) {
  const i = index.hazards.indexOf(hazard);
  const prev = index.hazards[(i - 1 + index.hazards.length) % index.hazards.length];
  const next = index.hazards[(i + 1) % index.hazards.length];
  return `
    <nav class="hazard-pager" aria-label="${esc(t("learn.allHazards"))}">
      <a class="btn btn--ghost" href="${hazardUrl(prev.id)}">‹ ${esc(pick(prev.name))}</a>
      <a class="btn btn--ghost" href="${hazardUrl(next.id)}">${esc(pick(next.name))} ›</a>
    </nav>`;
}

async function renderHazardView(hazard, index) {
  const category = index.categoryById.get(hazard.category);
  const lesson = await loadLesson(hazard);
  document.title = `${pick(hazard.name)} · Kalasag Kids`;

  const watchBtn = hazard.video
    ? `<button type="button" class="btn btn--secondary" data-watch>▶ ${esc(t("learn.watchVideo"))}</button>
       <button type="button" class="btn btn--ghost save-offline" data-save-video hidden></button>`
    : `<button type="button" class="btn btn--ghost" disabled>${esc(t("learn.noVideo"))}</button>`;
  const watchedTag = state.hasWatchedVideo(hazard.id) ? `<span class="tag tag--done">✓ ${esc(t("learn.watched"))}</span>` : "";
  const quizTag = () => (state.hasPassedQuiz(hazard.id) ? `<span class="tag tag--done">✓ ${esc(t("quiz.passedTag"))}</span>` : "");

  main().innerHTML = `
    <a class="back-link" href="courses.html">‹ ${esc(t("learn.backToAll"))}</a>

    <header class="card hazard-hero" data-category="${esc(hazard.category)}">
      <img class="hazard-hero__banner" src="${esc(hazard.image || PLACEHOLDER_IMG)}" alt="">
      <div class="hazard-hero__body">
        ${hazardIconImg(hazard, "hazard-icon--lg")}
        <div class="hazard-hero__text">
          <div class="hazard-hero__tags">
            <span class="tag tag--cat">${esc(pick(category?.name))}</span>
            ${watchedTag}
            <span data-quiz-tag>${quizTag()}</span>
          </div>
          <h1 class="hazard-hero__title">${esc(pick(hazard.name))}</h1>
          <p class="hazard-hero__blurb">${esc(pick(hazard.blurb))}</p>
        </div>
        <div class="hazard-hero__actions">
          ${watchBtn}
          ${hazard.quizDataPath ? `<a class="btn btn--ghost" href="#quiz">❓ ${esc(t("learn.takeQuiz"))}</a>` : ""}
          ${hazard.game ? `<a class="btn btn--primary" href="#game">🎮 ${esc(t("learn.playGame"))}</a>` : ""}
        </div>
      </div>
    </header>

    <section class="section">
      <h2 class="section-title">${esc(t("learn.lessonTitle"))}</h2>
      ${beatsMarkup(lesson)}
    </section>

    ${
      hazard.quizDataPath
        ? `<section class="section quiz-section" id="quiz" aria-labelledby="quiz-title">
             <h2 class="section-title" id="quiz-title">❓ ${esc(t("quiz.title"))}</h2>
             <div class="card quiz" data-category="${esc(hazard.category)}" data-quiz-slot></div>
           </section>`
        : ""
    }

    ${
      hazard.game
        ? `<section class="section game-section" id="game" aria-labelledby="game-title">
             <h2 class="section-title" id="game-title">🎮 ${esc(t("learn.game"))}</h2>
             <div class="game-slot" data-game-slot><p class="game-slot__loading">${esc(t("learn.gameLoading"))}</p></div>
           </section>`
        : ""
    }

    <section class="section" id="infographic">
      <div class="section-head">
        <h2 class="section-title">${esc(t("learn.infographic"))}</h2>
        ${lesson?.infographic ? `<button type="button" class="btn btn--ghost no-print" data-print>🖨 ${esc(t("common.print"))}</button>` : ""}
      </div>
      ${posterMarkup(hazard, lesson)}
    </section>

    <section class="section">
      <h2 class="section-title">🔗 ${esc(t("learn.subjects"))}</h2>
      ${await subjectsMarkup(hazard, lesson)}
    </section>

    ${neighbors(hazard, index)}`;

  main().querySelector("[data-watch]")?.addEventListener("click", () => playVideo(hazard, index, { autoplay: true }));
  const saveBtn = main().querySelector("[data-save-video]");
  if (saveBtn) mountSaveButton(saveBtn, hazard.video);
  main().querySelector("[data-print]")?.addEventListener("click", () => window.print());
  if (location.hash === "#infographic" || location.hash === "#quiz") main().querySelector(location.hash)?.scrollIntoView();
  // Collections' print button opens the poster with ?print=1.
  if (new URLSearchParams(location.search).get("print") === "1" && lesson?.infographic && !printed) {
    printed = true;
    setTimeout(() => window.print(), 400);
  }

  const quizSlot = main().querySelector("[data-quiz-slot]");
  if (quizSlot) {
    quiz.attach(quizSlot, hazard, {
      total: index.hazards.filter((h) => h.quizDataPath).length,
      onPass: () => (main().querySelector("[data-quiz-tag]").innerHTML = quizTag()),
    });
  }

  const slot = main().querySelector("[data-game-slot]");
  if (slot) gameHost.attach(slot, hazard);
}

let printed = false;

async function playVideo(hazard, index, { autoplay }) {
  const { firstTime } = await watchHazardVideo(hazard, { autoplay });
  if (firstTime) await renderHazardView(hazard, index);
}
