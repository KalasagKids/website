/**
 * offline.js — "Save for offline": keeps whole videos and pictures on this device.
 *
 * The service worker saves the site itself on the first visit. Videos are too big for
 * that, and players stream them in pieces the browser can't store, so they're saved
 * here instead, when asked: one video from its lesson page, or everything from Settings.
 *
 * Saved files live in their own cache, SAVED_CACHE, which survives site updates
 * (CACHE_VERSION bumps). service-worker.js serves them, including the byte ranges
 * video players ask for. Keep SAVED_CACHE the same in both files.
 *
 * Events on window:
 *   kalasag:offlineprogress  { url, loaded, total }  while a file downloads
 *   kalasag:offlinechange                            after files are saved or removed
 */

import { fetchJSON, getHazardIndex, sceneUrl } from "./data.js";
import { builtGameFiles } from "./games.js";

export const SAVED_CACHE = "kalasag-saved-v1";

const supported = "caches" in window && "ReadableStream" in window;
const downloads = new Map(); // url -> promise, so two buttons never fetch the same file twice
const sizes = new Map(); // url -> bytes, from HEAD requests
let saveAllJob = null; // { controller, loaded, total } while "Save everything" runs

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function isSupported() {
  return supported;
}

export async function isSaved(url) {
  if (!supported || !url) return false;
  try {
    return Boolean(await (await caches.open(SAVED_CACHE)).match(url));
  } catch {
    return false;
  }
}

export function isSaving(url) {
  return downloads.has(url);
}

/** Downloads one file in full and saves it. Resolves when it's saved. */
export function saveFile(url, { signal, onProgress } = {}) {
  if (!downloads.has(url)) {
    downloads.set(
      url,
      download(url, signal, onProgress).finally(() => downloads.delete(url))
    );
  }
  return downloads.get(url);
}

async function download(url, signal, onProgress) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const total = Number(res.headers.get("Content-Length")) || sizes.get(url) || 0;
  const type = res.headers.get("Content-Type") || "application/octet-stream";

  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded);
    emit("kalasag:offlineprogress", { url, loaded, total });
  }

  const blob = new Blob(chunks, { type });
  const cache = await caches.open(SAVED_CACHE);
  await cache.put(url, new Response(blob, { headers: { "Content-Type": type, "Content-Length": String(blob.size) } }));
  // Ask the browser not to clear saved files when the device runs low on space.
  navigator.storage?.persist?.().catch(() => {});
  emit("kalasag:offlinechange");
}

/** Everything "Save everything" covers: every video, hazard page picture, safety poster (both languages) and slideshow scene,
 *  plus every built mini-game's scripts, art and sounds (KALASAG O8). */
async function allFiles() {
  const [{ hazards }, { slides }, games] = await Promise.all([
    getHazardIndex(),
    fetchJSON("js/data/scenes.json"),
    builtGameFiles().catch(() => []),
  ]);
  return [
    ...new Set([...hazards.flatMap((h) => [h.video, h.image, h.infographic?.en, h.infographic?.fil]), ...slides.map((s) => sceneUrl(s.id)), ...games].filter(Boolean)),
  ];
}

async function sizeOf(url) {
  if (!sizes.has(url)) {
    if (!navigator.onLine) return 0;
    try {
      const res = await fetch(url, { method: "HEAD" });
      sizes.set(url, Number(res.headers.get("Content-Length")) || 0);
    } catch {
      return 0; // offline: size unknown, try again next time
    }
  }
  return sizes.get(url);
}

/** What "Save everything" would still download: { files: [{ url, size }], bytes }. */
export async function plan() {
  const cache = await caches.open(SAVED_CACHE);
  const missing = [];
  for (const url of await allFiles()) {
    if (!(await cache.match(url))) missing.push(url);
  }
  const files = await Promise.all(missing.map(async (url) => ({ url, size: await sizeOf(url) })));
  return { files, bytes: files.reduce((sum, f) => sum + f.size, 0) };
}

/** True if the device has room for this many more bytes (or can't tell). */
export async function hasRoomFor(bytes) {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    return quota - usage > bytes * 1.1;
  } catch {
    return true;
  }
}

/**
 * Saves every file in a plan(), one at a time. Resolves with how many files failed;
 * rejects with an AbortError if stopped.
 */
export async function saveAll({ files, bytes }) {
  if (saveAllJob) return 0;
  const job = { controller: new AbortController(), loaded: 0, total: bytes };
  saveAllJob = job;
  let failed = 0;
  try {
    for (const file of files) {
      const before = job.loaded;
      try {
        await saveFile(file.url, {
          signal: job.controller.signal,
          onProgress: (loaded) => (job.loaded = before + loaded),
        });
      } catch (err) {
        if (job.controller.signal.aborted) throw err;
        failed++; // one missing file shouldn't stop the rest
      }
      job.loaded = before + file.size;
    }
    return failed;
  } finally {
    saveAllJob = null;
    emit("kalasag:offlinechange");
  }
}

/** { loaded, total } while "Save everything" runs, otherwise null. */
export function saveAllProgress() {
  return saveAllJob && { loaded: saveAllJob.loaded, total: saveAllJob.total };
}

export function stopSaveAll() {
  saveAllJob?.controller.abort();
}

/** Bytes of saved files on this device. */
export async function savedBytes() {
  const cache = await caches.open(SAVED_CACHE);
  let sum = 0;
  for (const request of await cache.keys()) {
    sum += Number((await cache.match(request))?.headers.get("Content-Length")) || 0;
  }
  return sum;
}

export async function removeAll() {
  stopSaveAll();
  await caches.delete(SAVED_CACHE);
  emit("kalasag:offlinechange");
}

/** 15728640 -> "15 MB" */
export function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${Math.max(mb, 0.1).toFixed(1)} MB`;
}
