/* 失眠夜行 · 网页版（按 网页尺寸大小.ai 的版面）
 * 想改数值：改 SETTINGS。想改 TIPS 的英文或效果：改 EVENTS（编号 = 格子图片编号）。
 */
(() => {
"use strict";

// ───────────── 可调设置 ─────────────
const SETTINGS = {
  startWake: 5,      // 开局分数（清醒值）
  maxWake: 10,       // 分数上限
  winWake: 2,        // 到 06:00 时分数 ≤ 这个数才算睡着
  shortcutJump: 12,  // 做梦捷径一次飞几格
  shortcutWake: -1,  // 做梦捷径的分数变化
  bumpWake: 1,       // 停到别人格子上，对方分数变化
  failWake: -2,      // 到终点没睡着、退回 03:00 时的分数变化
  laneWake: -2,      // 走进自己颜色的通道（闭上眼睛）时的分数变化，每次进通道一次
  stepMs: 200,       // 棋子每走一格的时间（毫秒）
};

// ───────────── TIPS 卡片：事件格 ─────────────
// title 标题（建议 15 个字母以内）  desc 说明（3 行以内）
// move 前进(+)/后退(−)  wake 分数变化  skip 停几轮  again 再掷一次  flip 翻身判定
const EVENTS = {
  4:  { title: "DREAM GALLOP",    desc: "Galloping through a dream, the night rushes by", move: 3 },
  5:  { title: "ENDLESS SCROLL",  desc: "Just one more video before bed", move: 3, wake: 2 },
  6:  { title: "TOSS AND TURN",   desc: "Rolling over again. Odd roll: wake -1. Even roll: wake +1", flip: true },
  7:  { title: "LATE COFFEE",     desc: "The afternoon coffee finally kicks in", move: 2, wake: 2 },
  8:  { title: "DEADLINE ALERT",  desc: "Suddenly remembering the assignment is due tomorrow", wake: 2 },
  9:  { title: "MILK TEA",        desc: "A late-night bubble tea, full of caffeine", move: 1, wake: 2 },
  10: { title: "RAIN NOISE",      desc: "Rain on the window, the perfect white noise", wake: -1 },
  11: { title: "QUICK REPLY",     desc: "Just one reply, then straight to sleep", move: 1, wake: 1 },
  13: { title: "SUDDEN BANG",     desc: "Something crashes somewhere downstairs", move: -3, wake: 2 },
  14: { title: "AUTOPLAY",        desc: "The next episode starts on its own", wake: 1, again: true },
  16: { title: "MOONLIGHT",       desc: "Soft moonlight, heavy eyelids", move: 1, wake: -1 },
  17: { title: "LIE FLAT",        desc: "Thinking about nothing at all", wake: -1, skip: 1 },
  18: { title: "CRINGE MEMORY",   desc: "That awkward moment from three years ago comes back", wake: 2 },
  19: { title: "COUNTING SHEEP",  desc: "One sheep, two sheep, three sheep...", wake: -1 },
  20: { title: "TO-DO LIST"     , desc: "Mentally writing tomorrow's to-do list", wake: 1 },
  22: { title: "HYPNOTIC VORTEX", desc: "Staring at the ceiling, consciousness slowly falls asleep", wake: -2, skip: 1 },
  23: { title: "ZZZ",             desc: "Finally, a little drowsy", wake: -2 },
  24: { title: "FALLING JOLT",    desc: "A sudden jolt just as you drift off", move: -2 },
  25: { title: "MELATONIN",       desc: "One small pill, one slow wave of sleep", wake: -2 },
  26: { title: "ASMR",            desc: "Soft whispers through the headphones", wake: -1 },
  27: { title: "NIGHTMARE",       desc: "Startled awake by a bad dream", move: -3, wake: 1 },
  28: { title: "ENERGY DRINK",    desc: "Fully charged and wide awake", move: 4, wake: 3 },
  29: { title: "CLOCK CHECK",     desc: "Checking the time only makes it worse", move: -1, wake: 1 },
};

// ───────────── 棋盘结构 ─────────────
const B = window.BOARD;
const RING = 52, LANE = 5, GOAL = RING + LANE + 1, HALFWAY = Math.round(GOAL / 2);  // 58 步 = 06:00，29 步 = 03:00
const HEX = { blue: "#0073C1", red: "#E35E40", teal: "#009B8A", yellow: "#F0D600" };
// 玩家 1–4 对应分数面板的颜色
const PLAYERS = [
  { name: "PLAYER 1", color: "blue" },
  { name: "PLAYER 2", color: "red" },
  { name: "PLAYER 3", color: "teal" },
  { name: "PLAYER 4", color: "yellow" },
];
const LANE_KEY = { blue: "blue", red: "red", teal: "green", yellow: "yellow" };
const ENTRY = { red: 3, blue: 16, teal: 29, yellow: 42 };            // 进入自家通道前的最后一格（外圈编号）
const SHORTCUTS = { 9: [49, "teal"], 48: [36, "blue"], 35: [23, "red"], 22: [10, "yellow"] };  // 虚线起点 → 终点
const ringIndex = (color, step) => (((ENTRY[color] - step) % RING) + RING) % RING;

// ───────────── 状态 ─────────────
let state, busy = false, gen = 0;
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function newGame() {
  gen++; busy = false;
  state = {
    players: PLAYERS.map((p) => ({ ...p, step: 0, wake: SETTINGS.startWake, skip: 0, done: false })),
    turn: 0, over: false, winner: null,
  };
  buildPieces();
  showDie(6);
  showCard({ img: "51.png", color: "red", title: "GOOD NIGHT",
    desc: "Reach 06:00 with a wake score of 2 or less to fall asleep", fx: "Click MY TURN to roll" });
  render();
}

// ───────────── 画面缩放 ─────────────
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  const st = $("stage");
  st.style.transform = `scale(${s})`;
  st.style.left = (innerWidth - 1920 * s) / 2 + "px";
  st.style.top = (innerHeight - 1080 * s) / 2 + "px";
}

// ───────────── 分数面板 ─────────────
const ROW_BASE = [295.82, 389.8, 475.24, 560.67], LINE = 29.67, ASC = 0.77 * 29.06;
function buildScores() {
  $("scoreText").innerHTML = PLAYERS.map((p, i) => {
    const y1 = ROW_BASE[i] - ASC, y2 = ROW_BASE[i] + LINE - ASC;
    return `<div class="t lbl" style="left:1348.2px;top:${y1}px;color:${HEX[p.color]}">${p.name}</div>
      <div class="t lbl" style="left:1348.2px;top:${y2}px;color:${HEX[p.color]}">SCORE</div>
      <div class="t num" id="score${i}" style="right:${1920 - 1679.8}px;top:${y2}px;color:${HEX[p.color]}"></div>`;
  }).join("");
}

// ───────────── MY TURN 点数 ─────────────
const PIP_X = { 0: 0, c: 9.55, 1: 19.1 }, PIP_Y = (r) => r * 18.65;
const FACES = {
  1: [["c", 1, 1]],
  2: [[0, 0.5], [1, 1.5]],
  3: [["c", 0], ["c", 1], ["c", 2]],
  4: [[0, 0], [1, 0], [0, 2], [1, 2]],
  5: [[0, 0], [1, 0], ["c", 1, 1], [0, 2], [1, 2]],
  6: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]],
};
function showDie(v) {
  $("digit").textContent = v;
  $("pips").innerHTML = FACES[v].map(([c, r, sp]) =>
    `<i class="${sp ? "sp" : ""}" style="left:${PIP_X[c]}px;top:${PIP_Y(r)}px"></i>`).join("");
}
async function rollDie() {
  let v = 1;
  for (let k = 0; k < 8; k++) { v = 1 + Math.floor(Math.random() * 6); showDie(v); await sleep(60); }
  return v;
}

// ───────────── TIPS 卡片 ─────────────
function showCard({ img, color, title, desc, fx }) {
  const c = HEX[color] || HEX.red;
  const text = color === "yellow" ? HEX.red : c;
  $("card").style.borderColor = c;
  $("card").style.color = text;
  if (img) { $("cardImg").src = img; $("cardImg").hidden = false; $("cardBlock").hidden = true; }
  else { $("cardImg").hidden = true; $("cardBlock").hidden = false; $("cardBlock").style.background = c; }
  $("cardTitle").textContent = title;
  $("cardDesc").textContent = desc;
  $("cardFx").textContent = fx || "";
}
function fxText(ev, wakeOverride) {
  const out = [];
  if (ev.move) out.push(ev.move > 0 ? `Move +${ev.move}` : `Back ${-ev.move}`);
  const w = wakeOverride ?? ev.wake;
  if (w) out.push(`Wake ${w > 0 ? "+" : ""}${w}`);
  if (ev.skip) out.push(`Skip ${ev.skip} turn`);
  if (ev.again) out.push("Roll again");
  return out.join("   ");
}

// ───────────── 棋子 ─────────────
function posOf(p) {
  if (p.step <= 0) return B.bases[LANE_KEY[p.color]];
  if (p.step <= RING) { const c = B.ring[ringIndex(p.color, p.step)]; return [c.x, c.y]; }
  if (p.step < GOAL) return B.lanes[LANE_KEY[p.color]][p.step - RING - 1];
  return B.goal[LANE_KEY[p.color]];
}
function buildPieces() {
  $("pieces").innerHTML = state.players.map((p, i) =>
    `<div class="piece ${p.color}" id="pc${i}" style="background:${HEX[p.color]}">${i + 1}</div>`).join("");
}
function placePieces() {
  const groups = {};
  state.players.forEach((p, i) => (groups[posOf(p).join()] ||= []).push(i));
  state.players.forEach((p, i) => {
    let [x, y] = posOf(p);
    const g = groups[[x, y].join()];
    if (g.length > 1) { const a = (g.indexOf(i) / g.length) * Math.PI * 2 - Math.PI / 4; x += Math.cos(a) * 15; y += Math.sin(a) * 15; }
    const el = $("pc" + i);
    el.style.left = x + "px"; el.style.top = y + "px";
    el.classList.toggle("now", !state.over && i === state.turn);
  });
}
function pop(p, text) {
  const [x, y] = posOf(p);
  const el = document.createElement("div");
  el.className = "pop"; el.textContent = text;
  el.style.left = x + "px"; el.style.top = (y - 24) + "px";
  $("stage").appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

function render() {
  state.players.forEach((p, i) => { $("score" + i).textContent = p.wake; });
  const cur = state.players[state.turn];
  const color = state.over ? state.winner.color : cur.color;
  const box = $("turn");
  box.style.background = HEX[color];
  box.style.color = color === "yellow" ? HEX.red : "var(--light)";
  box.style.setProperty("--sp", color === "red" ? HEX.yellow : color === "yellow" ? HEX.blue : HEX.red);
  $("turnLabel").textContent = state.over ? "PLAY AGAIN" : "MY TURN";
  box.setAttribute("aria-label", state.over ? "再来一局" : `${cur.name} 掷骰子`);
  box.disabled = busy;
  placePieces();
}

// ───────────── 回合 ─────────────
async function onTurnClick() {
  if (busy) return;
  if (state.over) { newGame(); return; }
  const g = gen;
  busy = true; render();
  const p = state.players[state.turn];
  const v = await rollDie();
  await walk(p, v);
  const again = await resolve(p, true);
  if (g !== gen) return;
  busy = false;
  if (state.over) return render();
  if (!again) nextPlayer();
  render();
}

function nextPlayer() {
  for (let k = 0; k < 8; k++) {
    state.turn = (state.turn + 1) % state.players.length;
    const p = state.players[state.turn];
    if (p.skip > 0) { p.skip--; pop(p, "Skip"); continue; }
    return;
  }
}

async function walk(p, n) {
  const dir = Math.sign(n);
  for (let k = 0; k < Math.abs(n); k++) {
    if (dir > 0 && p.step >= GOAL) break;
    if (dir < 0 && p.step <= 1) break;
    p.step += dir; render();
    if (dir > 0 && p.step === RING + 1 && !p.inLane) { p.inLane = true; changeWake(p, SETTINGS.laneWake); }
    await sleep(SETTINGS.stepMs);
  }
}
function changeWake(p, d) {
  if (!d) return;
  p.wake = clamp(p.wake + d, 0, SETTINGS.maxWake);
  pop(p, `Wake ${d > 0 ? "+" : ""}${d}`);
}

// 返回 true = 同一个人再掷一次
async function resolve(p, byDice) {
  if (p.step >= GOAL) return finish(p);
  if (p.step > RING) { bump(p); return false; }
  const idx = ringIndex(p.color, p.step);
  const cell = B.ring[idx];

  if (byDice && SHORTCUTS[idx] && p.step + SETTINGS.shortcutJump <= RING) {
    showCard({ color: SHORTCUTS[idx][1], title: "DREAM JUMP", desc: "Dozing off, you drift straight across the board",
      fx: `Move +${SETTINGS.shortcutJump}   Wake ${SETTINGS.shortcutWake}` });
    await sleep(500);
    p.step += SETTINGS.shortcutJump; render(); await sleep(350);
    changeWake(p, SETTINGS.shortcutWake);
    bump(p); return false;
  }

  const ev = cell.tile && EVENTS[cell.tile];
  if (!ev) { bump(p); return false; }

  const img = `${String(idx).padStart(2, "0")}.png`;
  let wake = ev.wake || 0;
  if (ev.flip) {
    showCard({ img, color: cell.color, title: ev.title, desc: ev.desc, fx: "Rolling..." });
    await sleep(400);
    const f = await rollDie();
    wake = f % 2 ? -1 : 1;
    showCard({ img, color: cell.color, title: ev.title, desc: ev.desc, fx: `Rolled ${f}   Wake ${wake > 0 ? "+1" : "-1"}` });
  } else {
    showCard({ img, color: cell.color, title: ev.title, desc: ev.desc, fx: fxText(ev) });
  }
  await sleep(450);
  changeWake(p, wake);
  if (ev.move) await walk(p, ev.move);
  if (ev.skip) p.skip += ev.skip;
  render();
  if (p.step >= GOAL) return finish(p);
  bump(p);
  return !!ev.again;
}

function bump(p) {
  if (p.step < 1 || p.step > RING) return;
  const idx = ringIndex(p.color, p.step);
  state.players.forEach((q) => {
    if (q !== p && q.step >= 1 && q.step <= RING && ringIndex(q.color, q.step) === idx) changeWake(q, SETTINGS.bumpWake);
  });
  render();
}

async function finish(p) {
  p.step = GOAL; render();
  if (p.wake <= SETTINGS.winWake) {
    state.over = true; state.winner = p;
    showCard({ color: p.color, title: "DEEP SLEEP", desc: `${p.name} reached 06:00 and finally fell asleep`, fx: `Score ${p.wake}` });
    return false;
  }
  showCard({ color: p.color, title: "STILL AWAKE", desc: `06:00 already, but the mind is still racing. Back to 03:00`,
    fx: `Score ${p.wake}   Wake ${SETTINGS.failWake}` });
  await sleep(700);
  p.step = HALFWAY; p.inLane = false; render(); await sleep(300);
  changeWake(p, SETTINGS.failWake);
  bump(p);
  return false;
}

// ───────────── 启动 ─────────────
buildScores();
fit();
addEventListener("resize", fit);
$("turn").addEventListener("click", onTurnClick);
addEventListener("keydown", (e) => { if (e.code === "Space" && e.target.id !== "turn") { e.preventDefault(); onTurnClick(); } });
newGame();
})();
