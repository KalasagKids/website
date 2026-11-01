/**
 * certificate.js — the course-completion certificate on Home (the very last roadmap item).
 *
 * It appears once EVERY hazard has its video watched and its quiz passed (games and
 * lessons don't count). The pupil types a name, sees it on a live preview, and downloads
 * a PNG or prints it. The name is typed each time and never saved (guardrail 8).
 *
 * The owner's design (Web/cert.png) is redrawn on a <canvas> rather than used as a
 * background image: Agila fills the left frame, the text is bilingual and covers the whole
 * course, and the teacher/coordinator lines are left out. Pixel shapes are drawn on a
 * coarse grid (pixelFill) so they match the site's pixel look at any print size.
 *
 * Debug: dashboard.html?debug=cert shows the card without finishing every course.
 */

import { esc } from "../core/data.js";
import { t, getLanguage } from "../core/i18n.js";
import * as state from "../core/state.js";
import { spriteUrl } from "../core/mascot.js";

// US Letter landscape at 150 dpi: the same shape as the owner's design (600 × 464).
const W = 1650;
const H = 1275;
const NAME_MAX = 30;
const SPRITE = "expr_wink_geared";

const C = {
  bg: "#10142e",
  panel: "#171d42",
  gold: "#ffc21a",
  goldLight: "#ffe27a",
  goldDark: "#b37b00",
  shadow: "#6e4a00",
  white: "#f4f2ff",
  dim: "#7d81a8",
  ink: "#1d1838",
};
const PIXEL = '"Pixelify Sans", "Courier New", monospace';
const BODY = '"Nunito", system-ui, sans-serif';

let assets = null;
let shown = null; // the language the card was last built in, or null when hidden

/** True when every hazard's video is watched and its quiz passed. */
export function isEarned(hazards) {
  return hazards.length > 0 && hazards.every((h) => state.hasWatchedVideo(h.id) && state.hasPassedQuiz(h.id));
}

/**
 * Shows or hides the certificate card in `section`. Returns true the first time the
 * pupil ever earns it on this device, so the page can celebrate.
 */
export function render(section, hazards, { force = false } = {}) {
  const earned = isEarned(hazards);
  if (!earned && !force) {
    section.hidden = true;
    section.innerHTML = "";
    shown = null;
    return false;
  }
  if (shown === getLanguage()) return false;

  const name = section.querySelector("[data-cert-name]")?.value || "";
  build(section, hazards.length, name);
  shown = getLanguage();
  return earned && state.markCertificateSeen();
}

function build(section, total, name) {
  section.hidden = false;
  section.innerHTML = `
    <h2 class="section-title">${esc(t("cert.title"))}</h2>
    <article class="card card--pad cert-card">
      <canvas class="cert-card__preview" width="${W}" height="${H}" role="img" aria-label="${esc(t("cert.previewAlt"))}" data-cert-canvas></canvas>
      <div class="cert-card__form">
        <p class="cert-card__text">${esc(t("cert.text", { n: total }))}</p>
        <label class="cert-card__label" for="cert-name">${esc(t("cert.nameLabel"))}</label>
        <input id="cert-name" class="cert-card__field" data-cert-name maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" placeholder="${esc(t("cert.namePlaceholder"))}" value="${esc(name)}">
        <p class="cert-card__hint" data-cert-hint aria-live="polite"></p>
        <div class="cert-card__actions">
          <button type="button" class="btn btn--primary" data-cert-download>⬇ ${esc(t("cert.download"))}</button>
          <button type="button" class="btn btn--ghost" data-cert-print>🖨 ${esc(t("common.print"))}</button>
        </div>
        <p class="cert-card__privacy">${esc(t("cert.privacy"))}</p>
      </div>
    </article>`;

  const canvas = section.querySelector("[data-cert-canvas]");
  const input = section.querySelector("[data-cert-name]");
  const hint = section.querySelector("[data-cert-hint]");
  const typed = () => input.value.trim().replace(/\s+/g, " ");

  let queued = false;
  const redraw = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(async () => {
      queued = false;
      await draw(canvas, { name: typed(), total });
    });
  };
  redraw();

  input.addEventListener("input", () => {
    hint.textContent = "";
    redraw();
  });

  // Both buttons draw once more first, so the file always carries today's date and name.
  const withName = async (action) => {
    if (!typed()) {
      hint.textContent = t("cert.needName");
      input.focus();
      return;
    }
    await draw(canvas, { name: typed(), total });
    action(canvas, typed());
  };
  section.querySelector("[data-cert-download]").addEventListener("click", () => withName(download));
  section.querySelector("[data-cert-print]").addEventListener("click", () => withName(print));
}

function download(canvas, name) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const slug = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Kalasag-Kids-Certificate${slug ? "-" + slug : ""}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }, "image/png");
}

async function print(canvas) {
  let box = document.querySelector(".cert-print");
  if (!box) {
    box = document.createElement("div");
    box.className = "cert-print";
    box.innerHTML = `<img alt="">`;
    document.body.appendChild(box);
  }
  const img = box.querySelector("img");
  img.src = canvas.toDataURL("image/png");
  await img.decode().catch(() => {});
  document.body.classList.add("is-printing-cert");
  window.addEventListener("afterprint", () => document.body.classList.remove("is-printing-cert"), { once: true });
  window.print();
}

// ---------- Drawing ----------

function loadAssets() {
  if (!assets) {
    const img = new Image();
    img.src = spriteUrl(SPRITE);
    assets = Promise.all([
      img.decode().then(() => img, () => null),
      ...[`700 40px ${PIXEL}`, `400 40px ${PIXEL}`, `700 40px ${BODY}`, `800 40px ${BODY}`].map((f) =>
        document.fonts.load(f).catch(() => {})
      ),
    ]).then(([sprite]) => ({ sprite }));
  }
  return assets;
}

function formatDate(date) {
  const opts = { year: "numeric", month: "long", day: "numeric" };
  try {
    return date.toLocaleDateString(getLanguage() === "fil" ? "fil-PH" : "en-PH", opts);
  } catch {
    return date.toLocaleDateString("en", opts);
  }
}

/** Draws the whole certificate. An empty name shows a dimmed placeholder (preview only). */
export async function draw(canvas, { name, total }) {
  const { sprite } = await loadAssets();
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  drawBackground(ctx);
  drawCorners(ctx);

  text(ctx, "KALASAG KIDS", W / 2, 118, { font: PIXEL, size: 46, color: C.gold, spacing: 6 });
  title(ctx, t("cert.c.title1"), 212);
  title(ctx, t("cert.c.title2"), 322);
  ribbon(ctx, t("cert.c.ribbon"), 440);

  drawAgila(ctx, sprite);
  drawMedal(ctx, 1405, 600);

  text(ctx, t("cert.c.presented"), W / 2, 560, { font: BODY, weight: 800, size: 36, color: C.white, max: 780 });
  text(ctx, name || t("cert.c.name"), W / 2, 650, {
    font: BODY,
    weight: 800,
    size: 80,
    color: name ? C.white : C.dim,
    max: 780,
  });
  divider(ctx, 728);
  paragraph(ctx, t("cert.c.body", { n: total }), W / 2, 788, { size: 30, lineHeight: 42, max: 840 });

  const boxes = [
    [t("cert.c.videos"), `${total} / ${total}`],
    [t("cert.c.quizzes"), `${total} / ${total}`],
    [t("cert.c.date"), formatDate(new Date())],
  ];
  const bw = 310;
  const gap = 34;
  const left = (W - (bw * 3 + gap * 2)) / 2;
  boxes.forEach(([label, value], i) => infoBox(ctx, left + i * (bw + gap), 915, bw, 128, label, value));

  // Where the design had the teacher and coordinator lines: the site's tagline.
  const tagY = 1122;
  text(ctx, t("site.tagline"), W / 2, tagY, { font: BODY, weight: 700, size: 28, color: C.goldLight, max: 820 });
  ctx.font = `700 28px ${BODY}`;
  const half = Math.min(ctx.measureText(t("site.tagline")).width, 820) / 2;
  ctx.fillStyle = C.gold;
  ctx.fillRect(W / 2 - half - 130, tagY - 3, 100, 6);
  ctx.fillRect(W / 2 + half + 30, tagY - 3, 100, 6);
}

function drawBackground(ctx) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // Faint pixel speckles, seeded so every draw looks the same.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
  for (let i = 0; i < 700; i++) ctx.fillRect(Math.floor(rand() * W / 6) * 6, Math.floor(rand() * H / 6) * 6, 6, 6);

  frame(ctx, 16, 16, W - 32, H - 32, 14, C.gold);
  frame(ctx, 48, 48, W - 96, H - 96, 5, C.goldDark);
  frame(ctx, 60, 60, W - 120, H - 120, 4, C.gold);
}

/** A rectangle outline of thickness `th` with stepped (pixel-rounded) corners. */
function frame(ctx, x, y, w, h, th, color, fill) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x + th, y + th, w - 2 * th, h - 2 * th);
  }
  ctx.fillStyle = color;
  ctx.fillRect(x + 2 * th, y, w - 4 * th, th);
  ctx.fillRect(x + 2 * th, y + h - th, w - 4 * th, th);
  ctx.fillRect(x, y + 2 * th, th, h - 4 * th);
  ctx.fillRect(x + w - th, y + 2 * th, th, h - 4 * th);
  for (const [cx, cy] of [[x + th, y + th], [x + w - 2 * th, y + th], [x + th, y + h - 2 * th], [x + w - 2 * th, y + h - 2 * th]]) {
    ctx.fillRect(cx, cy, th, th);
  }
}

/** Fills every grid cell (of size u) whose centre lies inside `path`: crisp pixel shapes. */
function pixelFill(ctx, path, [x0, y0, x1, y1], u, color) {
  ctx.fillStyle = color;
  for (let y = Math.floor(y0 / u) * u; y < y1; y += u) {
    for (let x = Math.floor(x0 / u) * u; x < x1; x += u) {
      if (ctx.isPointInPath(path, x + u / 2, y + u / 2)) ctx.fillRect(x, y, u, u);
    }
  }
}

function polygon(points) {
  const p = new Path2D();
  points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

function starPoints(cx, cy, outer, inner, n = 5, turn = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = turn + (i * Math.PI) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function circle(cx, cy, r) {
  const p = new Path2D();
  p.arc(cx, cy, r, 0, Math.PI * 2);
  return p;
}

/** A four-point pixel sparkle: arms of `arm` cells around a centre cell. */
function sparkle(ctx, cx, cy, u, arm, color = C.goldLight) {
  ctx.fillStyle = color;
  ctx.fillRect(cx - u / 2, cy - u / 2 - arm * u, u, (arm * 2 + 1) * u);
  ctx.fillRect(cx - u / 2 - arm * u, cy - u / 2, (arm * 2 + 1) * u, u);
  if (arm > 2) ctx.fillRect(cx - 1.5 * u, cy - 1.5 * u, 3 * u, 3 * u);
}

function drawCorners(ctx) {
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const px = (v) => (sx > 0 ? v : W - v);
    const py = (v) => (sy > 0 ? v : H - v);
    sparkle(ctx, px(150), py(150), 8, 5);
    sparkle(ctx, px(245), py(112), 6, 2, C.gold);
    sparkle(ctx, px(112), py(250), 6, 2, C.gold);
    ctx.fillStyle = C.gold;
    ctx.fillRect(px(205) - 4, py(205) - 4, 8, 8);
    ctx.fillRect(px(108) - 4, py(108) - 4, 8, 8);
  }
}

function setFont(ctx, { font, weight = 700, size }) {
  ctx.font = `${weight} ${size}px ${font}`;
}

/** Centred text, shrunk to fit `max` px when needed. Returns the size used. */
function text(ctx, str, x, y, { font, weight = 700, size, color, max = W - 260, spacing = 0, shadow }) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
  setFont(ctx, { font, weight, size });
  const width = ctx.measureText(str).width;
  if (width > max) {
    size = Math.floor((size * max) / width);
    setFont(ctx, { font, weight, size });
  }
  if (shadow) {
    ctx.fillStyle = shadow.color;
    ctx.fillText(str, x, y + shadow.dy);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  return size;
}

function title(ctx, str, y) {
  text(ctx, str, W / 2, y, { font: PIXEL, size: 128, color: C.gold, max: 1080, spacing: 4, shadow: { color: C.shadow, dy: 8 } });
}

function ribbon(ctx, str, y) {
  setFont(ctx, { font: PIXEL, size: 42 });
  const tw = Math.min(ctx.measureText(str).width, 600);
  const w = Math.max(560, tw + 120);
  const h = 74;
  const x = (W - w) / 2;
  // The folded tails behind each end, with a pixel notch.
  for (const side of [-1, 1]) {
    const tx = side < 0 ? x - 70 : x + w - 20;
    ctx.fillStyle = C.goldDark;
    ctx.fillRect(tx, y - h / 2 + 18, 90, h);
    ctx.fillStyle = C.bg;
    const nx = side < 0 ? tx : tx + 90 - 16;
    ctx.fillRect(nx, y + 18 - 8, 16, 16);
  }
  ctx.fillStyle = C.gold;
  ctx.fillRect(x, y - h / 2, w, h);
  ctx.fillStyle = C.goldLight;
  ctx.fillRect(x, y - h / 2, w, 8);
  ctx.fillStyle = C.goldDark;
  ctx.fillRect(x, y + h / 2 - 8, w, 8);
  text(ctx, str, W / 2, y + 2, { font: PIXEL, size: 42, color: C.ink, max: 600, spacing: 2 });
}

function divider(ctx, y) {
  const x0 = 470;
  const x1 = W - 470;
  ctx.fillStyle = C.gold;
  ctx.fillRect(x0, y - 3, W / 2 - 80 - x0, 6);
  ctx.fillRect(W / 2 + 80, y - 3, x1 - W / 2 - 80, 6);
  ctx.fillRect(x0 - 6, y - 9, 12, 18);
  ctx.fillRect(x1 - 6, y - 9, 12, 18);
  for (const [dx, r] of [[-42, 14], [0, 20], [42, 14]]) {
    const cx = W / 2 + dx;
    pixelFill(ctx, polygon([[cx, y - r], [cx + r, y], [cx, y + r], [cx - r, y]]), [cx - r, y - r, cx + r, y + r], 4, C.goldLight);
  }
}

function paragraph(ctx, str, x, y, { size, lineHeight, max }) {
  setFont(ctx, { font: BODY, weight: 700, size });
  const lines = [];
  let line = "";
  for (const word of str.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  ctx.fillStyle = C.white;
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

function infoBox(ctx, x, y, w, h, label, value) {
  frame(ctx, x, y, w, h, 6, C.gold, C.panel);
  frame(ctx, x + 12, y + 12, w - 24, h - 24, 2, C.goldDark);
  text(ctx, label, x + w / 2, y + 44, { font: PIXEL, size: 28, color: C.gold, max: w - 50, spacing: 1 });
  text(ctx, value, x + w / 2, y + 88, { font: BODY, weight: 800, size: 32, color: C.white, max: w - 50 });
}

function drawAgila(ctx, sprite) {
  const x = 112;
  const y = 450;
  const w = 270;
  const h = 330;
  frame(ctx, x, y, w, h, 12, C.gold, C.panel);
  frame(ctx, x + 24, y + 24, w - 48, h - 48, 4, C.goldDark);
  if (!sprite) return;
  const size = sprite.naturalWidth * 5; // 40 px sprite → 200 px, whole-number scale stays crisp
  ctx.drawImage(sprite, x + (w - size) / 2, y + (h - size) / 2 + 6, size, size);
}

function drawMedal(ctx, cx, cy) {
  const u = 7;
  const box = (r) => [cx - r, cy - r, cx + r, cy + r];
  // Ribbon tails first, so the medal sits on top of them.
  for (const s of [-1, 1]) {
    const tail = polygon([
      [cx + s * 30, cy + 70],
      [cx + s * 95, cy + 95],
      [cx + s * 118, cy + 225],
      [cx + s * 92, cy + 200],
      [cx + s * 62, cy + 228],
    ]);
    pixelFill(ctx, tail, [cx - 130, cy + 60, cx + 130, cy + 240], u, s < 0 ? C.gold : C.goldDark);
  }
  pixelFill(ctx, polygon(starPoints(cx, cy, 142, 126, 18)), box(142), u, C.goldDark);
  pixelFill(ctx, circle(cx, cy, 124), box(124), u, C.gold);
  pixelFill(ctx, circle(cx, cy, 108), box(108), u, C.goldDark);
  pixelFill(ctx, circle(cx, cy, 98), box(98), u, C.panel);

  const shield = (inset) =>
    polygon([
      [cx - 56 + inset, cy - 60 + inset],
      [cx + 56 - inset, cy - 60 + inset],
      [cx + 56 - inset, cy + 6],
      [cx + 30 - inset * 0.6, cy + 46 - inset * 0.4],
      [cx, cy + 68 - inset],
      [cx - 30 + inset * 0.6, cy + 46 - inset * 0.4],
      [cx - 56 + inset, cy + 6],
    ]);
  pixelFill(ctx, shield(0), box(72), u, C.gold);
  pixelFill(ctx, shield(12), box(72), u, "#2a3474");
  pixelFill(ctx, polygon(starPoints(cx, cy + 2, 36, 15)), box(40), u, C.goldLight);
}
