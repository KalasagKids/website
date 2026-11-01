/**
 * quiz.js — a hazard's quiz, in the #quiz section of its Learn page.
 *
 * Three items are drawn at random from the hazard's nine (js/data/quizzes/<id>.json, made from
 * the AGILA Hazard Quiz by kalasag-dev/tools/import_quizzes.py) and asked one at a time, in
 * their original order (basic → preparedness → response). All three right is a pass: it is kept
 * for good in state.js ("kalasag:quizzes") and gives no XP. Every new round, after a pass or a
 * miss, draws a fresh three, avoiding the three just shown.
 *
 * Nine formats, graded like the AGILA quiz: choices (mc, sit, scene, tf), typed answers (id, fill:
 * forgiving about case, accents and punctuation), matching, enumeration (keywords) and ordering
 * (up/down buttons, so it works by keyboard and touch).
 *
 * The page re-renders on a language switch, so each hazard's round lives in this module and
 * attach() just draws it again.
 */

import { fetchJSON, esc } from "../core/data.js";
import { t, pick, getLanguage } from "../core/i18n.js";
import * as state from "../core/state.js";
import * as mascot from "../core/mascot.js";

const PER_ROUND = 3;
const GOOD = ["quiz.good1", "quiz.good2", "quiz.good3", "quiz.good4"];
const CHOICE_TYPES = ["mc", "sit", "scene"];
const CHECK_TYPES = ["id", "fill", "enum", "match", "order"];

const rounds = new Map(); // hazardId → { screen, picks, pos, results, ui, last }
let quizTotal = 0; // hazards with a quiz, for "Quizzes passed: n / total"

const shuffle = (list) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const range = (n) => [...Array(n).keys()];

// ---------- grading ----------
const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "the aftershocks" matches "aftershocks": equal, or containing it as whole words. */
function textOk(value, accept) {
  const n = norm(value);
  if (!n) return false;
  return accept.some((a) => {
    const na = norm(a);
    return n === na || ` ${n} `.includes(` ${na} `);
  });
}

/** Enumeration: each answer may claim one pool item it has a keyword for (bipartite matching). */
function enumMatch(values, pool) {
  const inputs = [];
  const seen = new Set();
  values.forEach((v, i) => {
    const n = norm(v);
    if (n && !seen.has(n)) {
      seen.add(n);
      inputs.push({ i, n });
    }
  });
  const adj = inputs.map((x) => pool.map((kws, j) => (kws.some((k) => x.n.includes(norm(k))) ? j : -1)).filter((j) => j >= 0));
  const owner = new Array(pool.length).fill(-1);
  const augment = (u, seenItems) => {
    for (const j of adj[u]) {
      if (seenItems[j]) continue;
      seenItems[j] = true;
      if (owner[j] < 0 || augment(owner[j], seenItems)) {
        owner[j] = u;
        return true;
      }
    }
    return false;
  };
  inputs.forEach((_, u) => augment(u, new Array(pool.length).fill(false)));
  const ok = new Array(values.length).fill(false);
  owner.forEach((u) => u >= 0 && (ok[inputs[u].i] = true));
  return ok;
}

// ---------- rounds ----------
function newRound(quiz, last = []) {
  const all = range(quiz.items.length);
  const fresh = all.filter((i) => !last.includes(i));
  const from = fresh.length >= PER_ROUND ? fresh : all;
  const picks = shuffle(from).slice(0, PER_ROUND).sort((a, b) => a - b);
  return { screen: "question", picks, pos: 0, results: [], ui: null, last: picks };
}

function prepItem(item) {
  const ui = { answered: false, hint: "" };
  if (item.choices) ui.perm = shuffle(range(item.choices.length));
  if (item.type === "order") {
    let o;
    do o = shuffle(range(item.steps.length));
    while (o.every((v, i) => v === i));
    ui.ord = o;
  }
  if (item.type === "match") {
    ui.mperm = shuffle(range(item.pairs.length));
    ui.msel = item.pairs.map(() => "");
  }
  if (item.type === "enum") ui.vals = new Array(item.count).fill("");
  if (item.type === "id" || item.type === "fill") ui.val = "";
  return ui;
}

// ---------- markup ----------
function questionText(item) {
  const q = esc(pick(item.question));
  if (item.type === "fill") return q.replace("____", `<span class="quiz__blank" aria-label="${esc(t("quiz.blank"))}"></span>`);
  if (item.type === "tf") return `${esc(t("quiz.trueOrFalse"))} ${q}`;
  return q;
}

function correctHTML(item) {
  switch (item.type) {
    case "mc":
    case "sit":
    case "scene":
      return esc(pick(item.choices[item.answer]));
    case "tf":
      return esc(t(item.answer ? "quiz.true" : "quiz.false"));
    case "id":
    case "fill":
      return esc(pick(item.show));
    case "enum":
      return esc(t("quiz.anyOf", { n: item.count, list: pick(item.show) }));
    case "match":
      return `<ul>${item.pairs.map(([l, r]) => `<li>${esc(pick(l))} → ${esc(pick(r))}</li>`).join("")}</ul>`;
    case "order":
      return `<ol>${item.steps.map((s) => `<li>${esc(pick(s))}</li>`).join("")}</ol>`;
  }
  return "";
}

function pipsHTML(round) {
  return `<ol class="quiz__pips" aria-hidden="true">${range(PER_ROUND)
    .map((i) => {
      const r = round?.results[i];
      const cls = r === true ? "is-ok" : r === false ? "is-miss" : round && i === round.pos && round.screen === "question" ? "is-current" : "";
      return `<li class="quiz__pip ${cls}">${r === true ? "✓" : r === false ? "✗" : ""}</li>`;
    })
    .join("")}</ol>`;
}

function agila(rest) {
  return `<img class="sprite quiz__agila" data-mascot data-rest="${rest}" src="${mascot.spriteUrl("pose_idle_geared")}" alt="" width="80" height="80">`;
}

function introHTML(hazard, passed) {
  return `
    <div class="quiz__head">
      ${agila("idle")}
      <div>
        <h3 class="quiz__title">${esc(t("quiz.introTitle"))}</h3>
        <p class="quiz__lead">${esc(t("quiz.introText", { hazard: pick(hazard.name) }))}</p>
        <div class="quiz__tags">
          <span class="tag">${esc(t("quiz.nQuestions", { n: PER_ROUND }))}</span>
          <span class="tag">${esc(t("quiz.passMark", { n: PER_ROUND }))}</span>
          ${passed ? `<span class="tag tag--done">✓ ${esc(t("quiz.passedTag"))}</span>` : ""}
        </div>
      </div>
    </div>
    ${pipsHTML(null)}
    <div class="quiz__actions">
      <button type="button" class="btn btn--primary" data-quiz="start">${esc(t(passed ? "quiz.playAgain" : "quiz.start"))}</button>
    </div>`;
}

function answerHTML(item, ui) {
  const locked = ui.answered;
  const dis = locked ? " disabled" : "";
  if (CHOICE_TYPES.includes(item.type) || item.type === "tf") {
    const options = item.type === "tf" ? [true, false] : ui.perm;
    return `<div class="quiz__choices${item.type === "tf" ? " quiz__choices--two" : ""}">${options
      .map((v, k) => {
        let cls = "";
        if (locked) cls = v === item.answer ? " is-right" : v === ui.pick ? " is-wrong" : " is-dim";
        const label = item.type === "tf" ? esc(t(v ? "quiz.true" : "quiz.false")) : `<b>${"ABCDEF"[k]}.</b> ${esc(pick(item.choices[v]))}`;
        const mark = locked && v === item.answer ? "✓ " : locked && v === ui.pick ? "✗ " : "";
        return `<button type="button" class="quiz__choice${cls}" data-quiz="choose" data-v="${v}"${dis}>${mark}${label}</button>`;
      })
      .join("")}</div>`;
  }
  if (item.type === "id" || item.type === "fill") {
    const cls = locked ? (ui.ok ? " is-right" : " is-wrong") : "";
    return `
      <label class="quiz__label" for="quiz-ans">${esc(t("quiz.yourAnswer"))}</label>
      <input id="quiz-ans" class="quiz__field${cls}" data-quiz-input="val" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(ui.val)}" placeholder="${esc(t("quiz.typeHere"))}"${dis}>`;
  }
  if (item.type === "enum") {
    return `
      <p class="quiz__help">${esc(t("quiz.enumHint", { n: item.count }))}</p>
      <div class="quiz__stack">${ui.vals
        .map((v, i) => {
          const cls = locked ? (ui.acc[i] ? " is-right" : " is-wrong") : "";
          const label = esc(t("quiz.answerN", { n: i + 1 }));
          return `<input class="quiz__field${cls}" data-quiz-input="vals" data-i="${i}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${label}" placeholder="${label}" value="${esc(v)}"${dis}>`;
        })
        .join("")}</div>`;
  }
  if (item.type === "match") {
    return `
      <p class="quiz__help">${esc(t("quiz.matchHint"))}</p>
      <div class="quiz__stack">${item.pairs
        .map(([left], i) => {
          const cls = locked ? (Number(ui.msel[i]) === i ? " is-right" : " is-wrong") : "";
          const options =
            `<option value="">${esc(t("quiz.choose"))}</option>` +
            ui.mperm.map((j) => `<option value="${j}"${String(ui.msel[i]) === String(j) ? " selected" : ""}>${esc(pick(item.pairs[j][1]))}</option>`).join("");
          return `
            <div class="quiz__match${cls}">
              <label for="quiz-m${i}">${esc(pick(left))}</label>
              <select id="quiz-m${i}" data-quiz-input="msel" data-i="${i}"${dis}>${options}</select>
            </div>`;
        })
        .join("")}</div>`;
  }
  if (item.type === "order") {
    const last = ui.ord.length - 1;
    return `
      <p class="quiz__help">${esc(t("quiz.orderHint"))}</p>
      <ol class="quiz__stack quiz__order">${ui.ord
        .map((si, pos) => {
          const cls = locked ? (si === pos ? " is-right" : " is-wrong") : "";
          const moves = locked
            ? ""
            : `<span class="quiz__moves">
                 <button type="button" class="icon-btn" data-quiz="up" data-i="${pos}" aria-label="${esc(t("quiz.moveUp"))}"${pos === 0 ? " disabled" : ""}>↑</button>
                 <button type="button" class="icon-btn" data-quiz="down" data-i="${pos}" aria-label="${esc(t("quiz.moveDown"))}"${pos === last ? " disabled" : ""}>↓</button>
               </span>`;
          return `<li class="quiz__step${cls}"><span class="quiz__stepnum" aria-hidden="true">${pos + 1}</span><span>${esc(pick(item.steps[si]))}</span>${moves}</li>`;
        })
        .join("")}</ol>`;
  }
  return "";
}

function feedbackHTML(item, ui, isLast) {
  const extra = item.type === "enum" ? `<p>${esc(t("quiz.enumCount", { n: ui.count, need: item.count }))}</p>` : "";
  const answer =
    ui.ok && item.type !== "enum"
      ? ""
      : `<div class="quiz__answer"><b>${esc(t(ui.ok ? "quiz.acceptedAnswers" : "quiz.correctAnswer"))}:</b> ${correctHTML(item)}</div>`;
  return `
    <div class="quiz__feedback ${ui.ok ? "is-ok" : "is-miss"}" id="quiz-fb" tabindex="-1" role="status">
      ${agila("idle")}
      <div>
        <p class="quiz__verdict">${ui.ok ? "✓" : "✗"} ${esc(t(ui.msg))}</p>
        ${extra}
        ${answer}
        <p>${esc(pick(item.explain))}</p>
        <div class="quiz__actions">
          <button type="button" class="btn btn--primary" data-quiz="next">${esc(t(isLast ? "quiz.seeResult" : "quiz.next"))}</button>
        </div>
      </div>
    </div>`;
}

function questionHTML(quiz, round) {
  const item = quiz.items[round.picks[round.pos]];
  const ui = round.ui;
  const englishOnly = getLanguage() === "fil" && !item.question.fil;
  return `
    <div class="quiz__bar">
      <span class="label-kicker">${esc(t("quiz.type." + item.type))}</span>
      <span class="quiz__count">${esc(t("quiz.questionOf", { n: round.pos + 1, total: PER_ROUND }))}</span>
    </div>
    ${pipsHTML(round)}
    ${
      item.scene
        ? `<div class="quiz__scene">${agila("thinking")}<div><p class="label-kicker">${esc(t("quiz.pictureThis"))}</p><p>${esc(pick(item.scene))}</p></div></div>`
        : ""
    }
    <p class="quiz__question" id="quiz-q" tabindex="-1" data-item="${round.picks[round.pos]}">${questionText(item)}</p>
    ${answerHTML(item, ui)}
    ${
      ui.answered
        ? feedbackHTML(item, ui, round.pos === PER_ROUND - 1)
        : `<p class="quiz__hint" role="alert">${esc(ui.hint ? t(ui.hint) : "")}</p>
           ${CHECK_TYPES.includes(item.type) ? `<div class="quiz__actions"><button type="button" class="btn btn--primary" data-quiz="check">${esc(t("quiz.check"))}</button></div>` : ""}`
    }
    ${englishOnly ? `<p class="quiz__note">${esc(t("quiz.englishOnly"))}</p>` : ""}`;
}

function resultHTML(hazard, quiz, round) {
  const score = round.results.filter(Boolean).length;
  const passed = score === PER_ROUND;
  const list = round.picks
    .map((idx, i) => {
      const item = quiz.items[idx];
      const ok = round.results[i];
      return `
        <li class="quiz__review-item">
          <span class="quiz__mark ${ok ? "is-ok" : "is-miss"}" aria-label="${esc(t(ok ? "quiz.correct" : "quiz.incorrect"))}">${ok ? "✓" : "✗"}</span>
          <div>
            <p>${item.scene ? esc(pick(item.scene)) + " " : ""}${questionText(item)}</p>
            ${ok ? "" : `<div class="quiz__answer"><b>${esc(t("quiz.correctAnswer"))}:</b> ${correctHTML(item)}</div>`}
          </div>
        </li>`;
    })
    .join("");
  const actions = passed
    ? `${hazard.game ? `<a class="btn btn--primary" href="#game">🎮 ${esc(t("learn.playGame"))}</a>` : ""}
       <button type="button" class="btn btn--ghost" data-quiz="again">${esc(t("quiz.playAgain"))}</button>`
    : `<button type="button" class="btn btn--primary" data-quiz="again">${esc(t("quiz.tryAgain"))}</button>`;
  return `
    <div class="quiz__head quiz__result" id="quiz-result" tabindex="-1">
      ${agila(passed ? "point" : "idle")}
      <div>
        <p class="quiz__score">${score}<small>/${PER_ROUND}</small></p>
        <h3 class="quiz__title">${esc(t(passed ? "quiz.passTitle" : "quiz.failTitle"))}</h3>
        <p class="quiz__lead">${esc(passed ? t("quiz.passText", { hazard: pick(hazard.name) }) : t("quiz.failText", { n: score, total: PER_ROUND }))}</p>
        <p class="quiz__progress">${esc(t("quiz.progress", { n: state.getPassedQuizCount(), total: quizTotal }))}</p>
      </div>
    </div>
    ${pipsHTML(round)}
    <div class="quiz__actions">${actions}</div>
    <h4 class="quiz__subhead">${esc(t("quiz.yourAnswers"))}</h4>
    <ul class="quiz__review">${list}</ul>
    ${
      quiz.lessons?.length
        ? `<h4 class="quiz__subhead">${esc(t("quiz.lessons"))}</h4><ul class="quiz__lessons">${quiz.lessons.map((l) => `<li>${esc(pick(l))}</li>`).join("")}</ul>`
        : ""
    }`;
}

// ---------- mount ----------

/**
 * Draws the quiz for a hazard into its slot. Call again after every page re-render: an
 * unfinished round carries on. onPass runs the first time this hazard's quiz is passed.
 */
export async function attach(slot, hazard, { total = 0, onPass } = {}) {
  quizTotal = total;
  let quiz;
  try {
    quiz = await fetchJSON(hazard.quizDataPath);
  } catch {
    slot.innerHTML = `<p class="quiz__note">${esc(t("quiz.loadError"))}</p>`;
    return;
  }
  if (!slot.isConnected) return;

  const round = () => rounds.get(hazard.id);
  const item = () => quiz.items[round().picks[round().pos]];

  const draw = ({ focus } = {}) => {
    const r = round();
    slot.innerHTML =
      !r || r.screen === "intro"
        ? introHTML(hazard, state.hasPassedQuiz(hazard.id))
        : r.screen === "question"
          ? questionHTML(quiz, r)
          : resultHTML(hazard, quiz, r);
    mascot.init(slot);
    if (focus) {
      const el = slot.querySelector(focus);
      el?.focus({ preventScroll: true });
      const section = slot.closest("section") || slot;
      if (section.getBoundingClientRect().top < 0) section.scrollIntoView({ block: "start" });
      else el?.scrollIntoView({ block: "nearest" });
    }
  };

  const start = () => {
    const r = newRound(quiz, round()?.last);
    r.ui = prepItem(quiz.items[r.picks[0]]);
    rounds.set(hazard.id, r);
    draw({ focus: "#quiz-q" });
  };

  const finish = (ok, extra) => {
    const r = round();
    Object.assign(r.ui, extra, { answered: true, ok, msg: ok ? GOOD[Math.floor(Math.random() * GOOD.length)] : "quiz.miss" });
    r.results[r.pos] = ok;
    draw({ focus: "#quiz-fb" });
    const agilaEl = slot.querySelector(".quiz__feedback [data-mascot]");
    if (agilaEl) mascot.reactToAnswer(ok, agilaEl);
  };

  const hint = (key) => {
    round().ui.hint = key;
    const el = slot.querySelector(".quiz__hint");
    if (el) el.textContent = key ? t(key) : "";
  };

  const check = () => {
    const it = item();
    const ui = round().ui;
    if (it.type === "id" || it.type === "fill") {
      if (!ui.val.trim()) return hint("quiz.needText");
      finish(textOk(ui.val, it.accept));
    } else if (it.type === "enum") {
      if (!ui.vals.some((v) => v.trim())) return hint("quiz.needOne");
      const acc = enumMatch(ui.vals, it.pool);
      const count = acc.filter(Boolean).length;
      finish(count >= it.count, { acc, count });
    } else if (it.type === "match") {
      if (ui.msel.some((v) => v === "")) return hint("quiz.needAll");
      if (new Set(ui.msel).size < ui.msel.length) return hint("quiz.needUnique");
      finish(ui.msel.every((v, i) => Number(v) === i));
    } else if (it.type === "order") {
      finish(ui.ord.every((v, i) => v === i));
    }
  };

  const next = () => {
    const r = round();
    if (r.pos < PER_ROUND - 1) {
      r.pos++;
      r.ui = prepItem(item());
      draw({ focus: "#quiz-q" });
      return;
    }
    r.screen = "result";
    const passed = r.results.every(Boolean);
    state.bumpStreakIfNewDay();
    const first = passed && state.markQuizPassed(hazard.id);
    draw({ focus: "#quiz-result" });
    const agilaEl = slot.querySelector("[data-mascot]");
    if (agilaEl) mascot.setExpression(passed ? "cheer" : "happy", agilaEl);
    if (first) onPass?.();
  };

  slot.onclick = (e) => {
    const btn = e.target.closest("[data-quiz]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.quiz;
    if (act === "start" || act === "again") start();
    else if (act === "choose") {
      const it = item();
      const v = it.type === "tf" ? btn.dataset.v === "true" : Number(btn.dataset.v);
      finish(v === it.answer, { pick: v });
    } else if (act === "check") check();
    else if (act === "next") next();
    else if (act === "up" || act === "down") {
      const i = Number(btn.dataset.i);
      const j = act === "up" ? i - 1 : i + 1;
      const o = round().ui.ord;
      [o[i], o[j]] = [o[j], o[i]];
      draw();
      // Keep the focus on the step that moved, or on its other arrow at the ends.
      const same = slot.querySelector(`[data-quiz="${act}"][data-i="${j}"]`);
      (same && !same.disabled ? same : slot.querySelector(`[data-i="${j}"]:not([disabled])`))?.focus();
    }
  };
  // Typed and chosen answers are kept in the round, so a language switch doesn't lose them.
  const keep = (e) => {
    const el = e.target.closest("[data-quiz-input]");
    const ui = round()?.ui;
    if (!el || !ui) return;
    const key = el.dataset.quizInput;
    if (key === "val") ui.val = el.value;
    else ui[key][Number(el.dataset.i)] = el.value;
    if (ui.hint) hint("");
  };
  slot.oninput = keep;
  slot.onchange = keep;
  slot.onkeydown = (e) => {
    if (e.key === "Enter" && e.target.matches(".quiz__field") && !round()?.ui?.answered) {
      e.preventDefault();
      check();
    }
  };

  draw();
}
