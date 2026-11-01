/**
 * service-worker.js
 * -------------------------------------------------------------
 * Three cache tiers, because not everything should be treated the same way:
 *
 * 1. SHELL_CACHE   — HTML/CSS/JS/fonts/icons/sprites. Precached on install
 *                    (cache-first), so the whole interface works offline.
 *
 * 2. DATA_CACHE    — hazard, lesson, and other content JSON. Precached on
 *                    install, then served "stale-while-revalidate": cached copy
 *                    instantly, fresh copy fetched in the background for next
 *                    time. Content can be updated after deploy without
 *                    breaking offline use.
 *
 * 3. SAVED_CACHE   — videos and big pictures the visitor chose to "Save for
 *                    offline" (one video, or everything from Settings). Written
 *                    by js/core/offline.js, never by this file. NOT versioned:
 *                    it survives CACHE_VERSION bumps so nobody has to download
 *                    100 MB again after an update. Video players ask for byte
 *                    ranges; serveMedia() cuts them from the saved full file.
 *
 * Some files are named only inside the content JSON, so they're read from it on
 * install (adding a hazard, lesson, quiz or slide needs no change here): each hazard's
 * icon, card thumbnail, safety-poster thumbnails (both languages), lesson and quiz from hazards.json, and the first OFFLINE_SCENES
 * slides in scenes.json so the welcome slideshow works offline (the rest only
 * once someone saves everything).
 *
 * All paths are relative to this file, so the site also works from a
 * sub-folder (e.g. a GitHub Pages project site).
 *
 * Bump CACHE_VERSION whenever you change any file listed below and deploy —
 * this clears the old caches.
 * -------------------------------------------------------------
 */

const CACHE_VERSION = "v42";
const SHELL_CACHE = `kalasag-shell-${CACHE_VERSION}`;
const DATA_CACHE = `kalasag-data-${CACHE_VERSION}`;
const SAVED_CACHE = "kalasag-saved-v1"; // same name as in js/core/offline.js

const OFFLINE_SCENES = 3;

const BASE = new URL("./", self.location).pathname; // e.g. "/" or "/kalasag-kids/"

const SPRITES = [
  "expr_wink_geared", "gear_on_full", "pose_alert_geared", "pose_closed_wings_geared",
  "pose_duck_cover_geared", "pose_head_flip_1_geared", "pose_head_flip_2_geared",
  "pose_idle_geared", "pose_point_geared", "pose_run_flap_1_geared", "pose_run_flap_2_geared",
  "pose_stop_wing_geared", "prop_on_face_mask_geared", "prop_on_magnifier_geared",
  "prop_on_sign_geared", "prop_on_sweat_drop_geared",
].map((name) => `assets/pixel-eagle-sprites/png/1x/${name}.png`);

// AGILA Safety Games: the small shared core (KALASAG O8). Keep in step with CORE_SCRIPTS in
// js/ui/game-host.js. Game art, audio and each game's own scripts are NOT precached: they
// cache as they're played, or with "Save game for offline" (kalasag-saved-v1).
const GAME_CORE = [
  "minigames/css/ag.css",
  "minigames/js/core/base.js", "minigames/js/data/strings.js", "minigames/js/data/icons.js",
  "minigames/js/core/store.js", "minigames/js/core/assets.js", "minigames/js/core/sound.js",
  "minigames/js/core/ui.js", "minigames/js/core/dnd.js", "minigames/js/core/input.js",
  "minigames/js/core/pixelicon.js", "minigames/js/core/chars.js", "minigames/js/core/rig.js",
  "minigames/js/core/canvas.js", "minigames/js/core/kit.js", "minigames/js/data/dialogue-data.js",
  "minigames/js/core/dialogue.js", "minigames/js/core/registry.js", "minigames/js/core/router.js",
  "minigames/js/core/progress.js", "minigames/js/core/app.js",
  "minigames/js/data/registry.json",
  // E6 cards engine: the scripts in registry.json engines.cards, plus its stylesheet
  "minigames/css/cards.css",
  "minigames/js/logic/cards/onet.js", "minigames/js/logic/cards/letters.js",
  "minigames/js/logic/cards/swipe.js", "minigames/js/logic/cards/memory.js",
  "minigames/js/engines/cards/cards.js", "minigames/js/engines/cards/letter-tiles.js",
  "minigames/js/engines/cards/swipe-stack.js", "minigames/js/engines/cards/onet-view.js",
  "minigames/js/engines/cards/widgets.js",
  // E1 grid engine: the scripts in registry.json engines.grid, plus its stylesheet
  "minigames/css/grid.css",
  "minigames/js/logic/grid/path.js", "minigames/js/logic/grid/procgen.js",
  "minigames/js/logic/grid/select.js", "minigames/js/logic/grid/undo.js",
  "minigames/js/engines/grid/tilemap.js", "minigames/js/engines/grid/camera.js",
  "minigames/js/engines/grid/darkness.js", "minigames/js/engines/grid/mover.js",
  "minigames/js/engines/grid/cursor.js",
  // E5 pieces engine: the scripts in registry.json engines.pieces (undo.js is above), plus its stylesheet
  "minigames/css/pieces.css",
  "minigames/js/logic/pieces/shape.js", "minigames/js/logic/pieces/jigsaw.js",
  "minigames/js/logic/pieces/sliding.js",
  "minigames/js/engines/pieces/piece.js", "minigames/js/engines/pieces/tray.js",
  "minigames/js/engines/pieces/grid-board.js", "minigames/js/engines/pieces/slot-board.js",
  "minigames/js/engines/pieces/play.js", "minigames/js/engines/pieces/cutter.js",
  "minigames/js/engines/pieces/sliding-board.js",
  // E2 scene-tap engine: the scripts in registry.json engines.scenetap (darkness.js is above), plus its stylesheet
  "minigames/css/scenetap.css",
  "minigames/js/logic/scenetap/zones.js", "minigames/js/logic/scenetap/camera.js",
  "minigames/js/engines/scenetap/scene-view.js", "minigames/js/engines/scenetap/objects.js",
  "minigames/js/engines/scenetap/lens.js", "minigames/js/engines/scenetap/paired.js",
  "minigames/js/engines/scenetap/scenario-card.js",
  // E4 falling engine: the scripts in registry.json engines.falling
  "minigames/js/logic/falling/spawner.js", "minigames/js/logic/falling/rules.js",
  "minigames/js/engines/falling/mover.js", "minigames/js/engines/falling/field.js",
  // E3 side-scroll engine: the scripts in registry.json engines.sidescroll (darkness.js is above)
  "minigames/js/logic/sidescroll/jump.js", "minigames/js/logic/sidescroll/chunks.js",
  "minigames/js/engines/sidescroll/world.js", "minigames/js/engines/sidescroll/runner.js",
  "minigames/js/engines/sidescroll/chaser.js", "minigames/js/engines/sidescroll/course.js",
  // E7 simulation engine: the scripts in registry.json engines.sim
  "minigames/js/logic/sim/core.js", "minigames/js/logic/sim/timeline.js",
  "minigames/js/logic/sim/graph.js", "minigames/js/logic/sim/tasks.js",
  "minigames/js/logic/sim/spatial.js", "minigames/js/logic/sim/flow.js",
  "minigames/js/logic/sim/crowd.js", "minigames/js/logic/sim/followers.js",
  "minigames/js/logic/sim/meter.js", "minigames/js/engines/sim/walker.js",
  "minigames/js/engines/sim/draw.js", "minigames/js/engines/sim/views.js",
  "minigames/js/engines/sim/bubbles.js", "minigames/js/engines/sim/slots.js",
  "minigames/assets/asset-manifest.json",
];

// Small files only: everything here downloads on install.
const SHELL_FILES = [
  "./",
  "index.html",
  "dashboard.html",
  "courses.html",
  "collection.html",
  "subject-connect.html",
  "offline.html",
  "manifest.json",

  "css/variables.css",
  "css/components.css",
  "css/welcome.css",
  "css/dashboard.css",
  "css/courses.css",
  "css/collection.css",

  "js/main.js",
  "js/core/state.js",
  "js/core/i18n.js",
  "js/core/data.js",
  "js/core/layout.js",
  "js/core/theme.js",
  "js/core/mascot.js",
  "js/core/offline.js",
  "js/pages/welcome.js",
  "js/pages/dashboard.js",
  "js/pages/courses.js",
  "js/pages/collection.js",
  "js/pages/subject-connect.js",
  "js/ui/hazard-card.js",
  "js/ui/hotline-panel.js",
  "js/ui/video-modal.js",
  "js/ui/offline-ui.js",
  "js/ui/game-host.js",
  "js/ui/hazard-video.js",
  "js/ui/quiz.js",
  "js/core/games.js",

  "vendor/pixel-pencil-cursor/pencil-cursor.css",
  "vendor/pixel-pencil-cursor/pencil-cursor.js",

  "assets/fonts/pixelify-sans-400.woff2",
  "assets/fonts/pixelify-sans-700.woff2",
  "assets/fonts/nunito-400.woff2",
  "assets/fonts/nunito-700.woff2",
  "assets/fonts/nunito-800.woff2",

  "assets/icons/favicon-64.png",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/images/Blank.jpg",

  ...SPRITES,
  ...GAME_CORE,
];

const DATA_FILES = [
  "js/data/hazards.json",
  "js/data/scenes.json",
  "js/data/tips.json",
  "js/data/subjects.json",
  "js/data/site.json",
  "js/data/local-hotlines.json",
];

// File-type helpers so routing logic below stays readable.
const isMediaRequest = (url) =>
  url.pathname.startsWith(BASE + "assets/videos/");

const isDataRequest = (url) => url.pathname.startsWith(BASE + "js/data/") && url.pathname.endsWith(".json");

// ---------- INSTALL: precache the app shell and content data ----------
self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)),
      caches.open(DATA_CACHE).then((cache) => cache.addAll(DATA_FILES)).then(precacheFromContent),
    ]).then(() => self.skipWaiting())
  );
});

// Files named in the content JSON (see the top of this file). Each is saved on its own, so one
// mistyped path in hazards.json only loses that file offline instead of failing the whole install.
async function precacheFromContent() {
  const read = async (path) => (await caches.match(path)).json();
  const [{ hazards }, { slides }] = await Promise.all([read("js/data/hazards.json"), read("js/data/scenes.json")]);
  const art = hazards.flatMap((h) => [h.icon, h.banner]); // Home posters, Collections, Learn cards: ~0.5 MB
  // Collections poster thumbnails (~0.4 MB). Full posters (~10 MB) cache when opened, or with "Save everything".
  const posters = hazards.flatMap((h) =>
    h.infographic ? [h.infographic.en, h.infographic.fil].map((src) => src.replace(/\.webp$/, "-thumb.webp")) : []
  );
  const scenes = slides.slice(0, OFFLINE_SCENES).map((slide) => `assets/images/scenes/${slide.id}.webp`);
  const content = hazards.flatMap((h) => [h.lesson, h.quizDataPath]); // ~0.1 MB in all
  await Promise.all([addEach(SHELL_CACHE, [...art, ...posters, ...scenes]), addEach(DATA_CACHE, content)]);
}

async function addEach(cacheName, urls) {
  const cache = await caches.open(cacheName);
  await Promise.all(
    urls.filter(Boolean).map((url) => cache.add(url).catch(() => console.warn("Not saved for offline:", url)))
  );
}

// ---------- ACTIVATE: clear out old cache versions ----------
self.addEventListener("activate", (event) => {
  const keepCaches = [SHELL_CACHE, DATA_CACHE, SAVED_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !keepCaches.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// ---------- FETCH: route each request to the right strategy ----------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests; let everything else pass through.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  if (isMediaRequest(url)) {
    event.respondWith(serveMedia(event.request));
    return;
  }

  if (isDataRequest(url)) {
    event.respondWith(staleWhileRevalidate(event.request, DATA_CACHE));
    return;
  }

  // Default: app shell files and page navigations — cache first, network fallback,
  // with the offline page for navigations that fail entirely.
  event.respondWith(
    cacheFirstIfPresent(event.request, SHELL_CACHE).catch(() => {
      if (event.request.mode === "navigate") return caches.match(BASE + "offline.html");
      return Response.error();
    })
  );
});

// ---------- Strategies ----------

// Serve from cache if present; otherwise fetch from network and store a copy.
async function cacheFirstIfPresent(request, cacheName) {
  // Page navigations ignore the query string so courses.html?hazard=<id> matches the cached courses.html.
  const cached = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
  if (cached) return cached;

  const response = await fetch(request);
  // Only full 200 responses can be cached (not 206 partial video ranges).
  if (response && response.status === 200) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

// Videos: from the saved copy if the visitor saved it, otherwise straight from the network
// (not cached: players fetch byte ranges, which can't be stored).
async function serveMedia(request) {
  const saved = await caches.match(request.url); // a plain URL, so the Range header doesn't matter
  if (!saved) return fetch(request);

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("Range") || "");
  if (!range) return saved;

  const blob = await saved.blob();
  let start = Number(range[1]);
  let end = range[2] ? Math.min(Number(range[2]), blob.size - 1) : blob.size - 1;
  if (!range[1]) {
    start = Math.max(blob.size - Number(range[2]), 0); // "bytes=-500": the last 500 bytes
    end = blob.size - 1;
  }
  if (start > end || start >= blob.size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${blob.size}` } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": saved.headers.get("Content-Type") || "video/mp4",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${blob.size}`,
      "Accept-Ranges": "bytes",
    },
  });
}

// Serve cache instantly if we have it, then refresh it in the background.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => cached || Response.error()); // offline and nothing cached

  return cached || networkFetch;
}
