'use strict';

// ============================================================
//  スノーグリル
//  白クマを倒す → 肉を背負う → グリルで焼く → 凍えた人に配る → お金で設備を解放
// ============================================================
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.floor(n));
}

// ============================================================
//  画像（読み込めたものは画像、まだ無いものは絵文字で描く）
// ============================================================
const images = {};
function loadImages() {
  [...Object.keys(CONFIG.sprites), 'ground', 'ui/slash', 'ui/explosion', 'ui/sparkle'].forEach(name => {
    const im = new Image();
    im.onload = () => { images[name] = im; if (name === 'ground') groundPattern = null; };
    im.src = IMG(name);
  });
}

// 画像がまだ無いときは、後ろの名前の画像で代用する
const pick = (...names) => names.find(n => images[n]) || names[names.length - 1];

// 足元（x, y）を基準に、高さ h で描く
function drawSprite(name, x, y, h, o = {}) {
  const im = images[name];
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  if (o.flip) ctx.scale(-1, 1);
  if (o.squash) ctx.scale(1 + o.squash, 1 - o.squash);
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  if (o.flash) ctx.filter = 'brightness(3)';
  else if (o.tint) ctx.filter = o.tint;
  if (im) {
    const w = h * im.width / im.height;
    ctx.drawImage(im, -w / 2, -h, w, h);
  } else {
    ctx.font = `${Math.round(h * 0.85)}px serif`;
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(CONFIG.sprites[name] || '?', 0, 0);
  }
  ctx.restore();
}

function shadow(x, y, w) {
  ctx.fillStyle = 'rgba(40, 70, 110, .22)';
  ctx.beginPath();
  ctx.ellipse(x, y, w, w * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ============================================================
//  セーブ
// ============================================================
const SAVE_KEY = 'snowGrill.v2';
let SAVE = null;
// セーブ：お金・強化・今いる村・村ごとの進み具合（設備・救った人数・開拓完了）・読んだ会話
function loadSave() {
  if (new URLSearchParams(location.search).has('reset')) {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem('snowGrill.v1');
  }
  let s = null, old = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { /* 読めなければ新規 */ }
  if (!s) {
    // 前のバージョン（村が1つだけ）のセーブを、最初の村の進み具合として引き継ぐ
    try { old = JSON.parse(localStorage.getItem('snowGrill.v1')); } catch (e) { /* 無し */ }
    s = { money: 0, up: {}, cur: 'camp', villages: {}, seen: {} };
    if (old) {
      Object.assign(s, { money: old.money || 0, up: old.up || {}, muted: old.muted });
      s.villages.camp = { unlockIdx: Math.min(old.unlockIdx || 0, CONFIG.unlocks.length), rescued: old.rescued || 0, kills: old.kills || 0 };
      s.seen.intro_camp = true;
    }
  }
  s.villages = s.villages || {};
  s.seen = s.seen || {};
  s.up = s.up || {};
  return s;
}
function persist() {
  if (!SAVE) return;
  Object.assign(SAVE, { money: G.money, up: G.up, muted: G.muted, cur: G.cur });
  if (G.vs) Object.assign(G.vs, { unlockIdx: G.unlockIdx, rescued: G.rescued, kills: G.kills });
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* 保存できない環境では無視 */ }
}

// ============================================================
//  ゲームの状態
// ============================================================
let canvas, ctx, groundPattern = null;
const G = {
  money: 0, rescued: 0, unlockIdx: 0, kills: 0, muted: false,
  maxBears: CONFIG.bear.max, bossOn: false, fire: false, barricade: false, up: {}, paused: false,
  player: null, bears: [], drops: [], grills: [], counters: [], customers: [], helpers: [],
  flyers: [], texts: [], parts: [], snow: [], steps: [], fx: [], arrows: [], flash: 0, timers: [],
  pad: null, spawnT: 0, bearT: 0, shake: 0, time: 0,
  cam: { x: 0, y: 0, scale: 1 },
  joy: null, keys: {},
};

function makeGrill(p) {
  return { x: p.x, y: p.y, raw: 0, cooked: 0, t: 0, pop: 1, inPad: { x: p.x - 62, y: p.y + 58 }, outPad: { x: p.x + 64, y: p.y + 58 } };
}
function makeCounter(p) {
  return {
    x: p.x, y: p.y, stock: 0, queue: [], t: 0, pop: 1, cash: 0,
    servePad: { x: p.x, y: p.y - 62 }, cashPos: { x: p.x - 78, y: p.y + 48 },
  };
}
// type: 'sword'（剣士）/ 'archer'（弓使い）/ 'carrier'（運び係）
function makeHelper(type) {
  const H = CONFIG.helper;
  const n = G.helpers.filter(h => h.type === type).length;   // 何人目か（見た目の色違い・立ち位置に使う）
  const s = type === 'sword' ? { x: 290 + n * 40, y: 650 } : type === 'archer' ? H.archer.post : { x: 330, y: 930 };
  const hp = (H[type] && H[type].hp) || 0;
  return { type, n, x: s.x, y: s.y, idleT: 0, stack: [], atkT: 0, face: 1, t: 0, walk: 0, pop: 1, attackT: 0, hp, maxHp: hp, downT: 0, hurtT: 0 };
}

// 解放したときの効果（ロード時にも順番に当て直す）
// i 番目の解放。リストの後は「何度でも買える強化」を順番に繰り返し、値段はだんだん上がる
function unlockAt(i) {
  const list = G.v && G.v.battle ? CONFIG.unlocks.filter(u => u.id !== 'barricade' && u.id !== 'tower') : CONFIG.unlocks;
  const mul = G.v ? G.v.priceMul : 1;
  if (i < list.length) return { ...list[i], price: Math.round(list[i].price * mul) };
  const rep = CONFIG.repeatUnlocks;
  const n = i - list.length;
  const r = rep[n % rep.length];
  const lv = Math.floor(n / rep.length);
  return { ...r, label: `${r.label} Lv${lv + 1}`, price: Math.round(r.base * mul * Math.pow(CONFIG.repeatGrowth, lv)) };
}

function applyUnlock(id, fromSave) {
  const u = CONFIG.unlocks.find(x => x.id === id) || CONFIG.repeatUnlocks.find(x => x.id === id);
  let made = null;   // 新しく置いた設備・助っ人（ポンと出てくる演出用）
  switch (id) {
    case 'moreBears': G.maxBears = Math.min(8, G.maxBears + 1); break;
    case 'grill2': made = makeGrill(CONFIG.grills[1]); G.grills.push(made); break;
    case 'hunter':   // 斧の助っ人を2人（id はセーブ互換のため hunter のまま）
      made = makeHelper('sword'); G.helpers.push(made);
      G.helpers.push(makeHelper('sword'));
      if (!fromSave) G.helpers[G.helpers.length - 1].pop = 0;
      break;
    case 'moreAxe':
      if (G.helpers.filter(h => h.type === 'sword').length < CONFIG.helper.sword.max) { made = makeHelper('sword'); G.helpers.push(made); }
      break;
    case 'barricade': G.barricade = true; G.fenceHp = G.fenceMax = CONFIG.raid.fenceHp; if (!fromSave) G.fencePop = 0; break;
    case 'tower':
      G.tower = { ...CONFIG.helper.archer.post, pop: fromSave ? 1 : 0 };
      if (!fromSave && !G.helpers.some(h => h.type === 'archer')) {
        const m = (G.vs.crew || []).find(c => (c.type || c) === 'archer');
        if (m) { const h = makeHelper('archer'); h.kind = m.kind; G.helpers.push(h); }
      }
      break;
    case 'archer': made = makeHelper('archer'); G.helpers.push(made); break;
    case 'carrier': made = makeHelper('carrier'); G.helpers.push(made); break;
    case 'counter2': made = makeCounter(CONFIG.counters[1]); G.counters.push(made); break;
    case 'fire': G.fire = true; G.firePos = { x: u.x, y: u.y }; break;
    case 'huntArea': G.maxBears += 2; G.bossOn = true; G.huntBig = true; break;
  }
  if (made && !fromSave) made.pop = 0;
}

// ============================================================
//  レベルアップ（強化画面）：レベルから今の能力値を計算する
// ============================================================
const upDef = id => CONFIG.upgrades.find(u => u.id === id);
const upLv = id => G.up[id] || 0;
function stat(id) {
  const u = upDef(id);
  return +(u.base + u.step * upLv(id)).toFixed(2);
}
const upCost = id => { const u = upDef(id); return Math.round(u.cost[0] * Math.pow(u.cost[1], upLv(id))); };
const upMaxed = id => upLv(id) >= upDef(id).max;
// 背中の容量・攻撃力をプレイヤーに反映
function applyUpgrades() {
  const P = G.player;
  P.cap = stat('cap');
  P.damage = stat('damage');
  P.maxHp = stat('hp');
  P.hp = P.hp == null ? P.maxHp : Math.min(P.maxHp, P.hp);
}
// 武器レベルに合った斧 [必要Lv, アイコン名, 名前]
function weaponLook() {
  let look = CONFIG.weaponLooks[0];
  CONFIG.weaponLooks.forEach(w => { if (upLv('damage') + 1 >= w[0]) look = w; });
  return look;
}
const canAffordAnyUpgrade = () => CONFIG.upgrades.some(u => !upMaxed(u.id) && G.money >= upCost(u.id));

function buyUpgrade(id) {
  if (upMaxed(id) || G.money < upCost(id)) return;
  G.money -= upCost(id);
  G.up[id] = upLv(id) + 1;
  applyUpgrades();
  if (id === 'hp') G.player.hp = G.player.maxHp;   // 体力を上げたら全回復
  Sound.sfx.unlock();
  floatText(G.player.x, G.player.y - 110, upDef(id).label + ' UP!', '#ffd23f', 24);
  sparks(G.player.x, G.player.y - 50, 20, ['#ffd23f', '#fff', '#7fe0ff']);
  persist();
  updateHud();
  renderUpgrades();
}

function fmtStat(u, v) {
  return (u.id === 'cook' ? v.toFixed(2) : fmt(v)) + u.unit;
}

function renderUpgrades() {
  const list = $('up-list');
  list.innerHTML = '';
  $('up-money').textContent = fmt(G.money);
  CONFIG.upgrades.forEach(u => {
    const lv = upLv(u.id), maxed = upMaxed(u.id), cost = upCost(u.id);
    const row = document.createElement('div');
    row.className = 'up-row';
    const next = maxed ? '' : ` → <b>${fmtStat(u, u.base + u.step * (lv + 1))}</b>`;
    const icon = u.id === 'damage' ? weaponLook()[1] : u.icon;
    const label = u.id === 'damage' ? `武器：${weaponLook()[2]}` : u.label;
    row.innerHTML = `<img src="${IMG(icon)}" alt="">
      <div class="up-info"><div class="up-name">${label}<span>Lv ${lv + 1}${maxed ? ' (MAX)' : ''}</span></div>
      <div class="up-val">${fmtStat(u, stat(u.id))}${next}</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'up-buy';
    btn.innerHTML = maxed ? 'MAX' : `<img src="img/coin.webp" alt="">${fmt(cost)}`;
    btn.disabled = maxed || G.money < cost;
    btn.onclick = () => buyUpgrade(u.id);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

function openUpgrades(open) {
  G.paused = open;
  G.moveTo = null;
  G.joy = null;
  G.touch = null;
  G.keys = {};
  $('upgrades').classList.toggle('hidden', !open);
  if (open) { renderUpgrades(); Sound.sfx.click(); }
}

// ============================================================
//  村に入る：設備・白クマ・お客さんを村ごとに作り直す
// ============================================================
function enterVillage(id) {
  if (G.vs) persist();
  G.cur = id;
  G.v = villageById(id);
  G.vs = SAVE.villages[id] = SAVE.villages[id] || { unlockIdx: 0, rescued: 0, kills: 0, done: false };
  Object.assign(G, {
    bears: [], drops: [], customers: [], helpers: [], flyers: [], texts: [], parts: [], steps: [], fx: [], arrows: [],
    fire: false, barricade: false, huntBig: false, bounds: null, boundsT: null, tower: null, volunteer: null, bossOn: !!G.v.boss, maxBears: CONFIG.bear.max + G.v.extraBears, spawnT: 0, bearT: 0, moveTo: null,
  });
  G.grills = [makeGrill(CONFIG.grills[0])];
  G.counters = [makeCounter(CONFIG.counters[0])];
  Object.assign(G.player, { x: CONFIG.playerStart.x, y: CONFIG.playerStart.y, vx: 0, vy: 0, stack: [] });
  G.rescued = G.vs.rescued || 0;
  G.kills = G.vs.kills || 0;
  G.unlockIdx = G.vs.unlockIdx || 0;
  for (let i = 0; i < G.unlockIdx; i++) applyUnlock(unlockAt(i).id, true);
  G.vs.crew = G.vs.crew || [];
  G.timers = [];
  G.volTurn = false;
  G.lastRaid = G.rescued;
  G.raids = 0;
  G.player.pendingHit = null;
  G.fenceHp = G.fenceMax = G.barricade ? CONFIG.raid.fenceHp : 0;
  G.battle = null;
  G.banner = null;
  if (G.v.battle) setupBattle();
  G.vs.crew.forEach(c => {
    const m = typeof c === 'string' ? { type: c } : c;
    if (m.type === 'archer' && !G.tower) return;   // 弓使いは見張り台があるときだけ
    const h = makeHelper(m.type);
    h.kind = m.kind;
    G.helpers.push(h);
  });
  nextPad();
  for (let i = 0; i < 80; i++) updateCustomers(0.25);   // 村に着いたときから、肉を待つ人の列は満員
  for (let i = 0; i < G.maxBears; i++) spawnBear(false);
  if (G.battle && G.vs.done) G.battle.won = true;   // 撃破ずみの決戦は、ふつうに遊べる
  // はじめての村では、すぐ目の前に白クマを置いて、いきなり戦えるように
  if (!G.unlockIdx && !G.rescued) Object.assign(G.bears[0], { x: CONFIG.firstBear.x, y: CONFIG.firstBear.y, tx: CONFIG.firstBear.x, ty: CONFIG.firstBear.y, t: 4 });
  G.snow = [];
  for (let i = 0; i < G.v.snow; i++) G.snow.push({ x: Math.random(), y: Math.random(), s: rand(1, 3), v: rand(20, 50) * (G.v.snow > 120 ? 2.2 : 1) });
  if (G.viewW) {
    G.cam.x = clamp(G.player.x - G.viewW / 2, 0, CONFIG.world.w - G.viewW);
    G.cam.y = clamp(G.player.y - G.viewH * 0.55, 0, Math.max(0, CONFIG.world.h - G.viewH));
  }
  $('village-name').textContent = G.v.name;
  updateHud();
  persist();
}

// 村の目標を達成：お祝い → 会話 → 全体マップ
// 少しあとに実行（ゲーム内時間で数えるので、一時停止中は進まない。村を移ると取り消される）
function later(sec, fn) { G.timers.push({ t: sec, fn }); }
// 主人公のまわりからコインがどっと出て、所持金へ飛んでいく
function coinBurst(n) {
  for (let i = 0; i < n; i++) later(i * 0.04, () => { G.coinFly.push({ x: G.player.x + rand(-30, 30), y: G.player.y - 60 + rand(-20, 20), t: 0 }); Sound.sfx.coin(i); });
}
function updateTimers(dt) {
  const due = [];
  G.timers.forEach(t => { t.t -= dt; if (t.t <= 0) due.push(t); });
  if (!due.length) return;
  G.timers = G.timers.filter(t => t.t > 0);
  due.forEach(t => t.fn());
}

function villageClear() {
  G.vs.done = true;
  persist();
  Sound.sfx.unlock();
  floatText(G.player.x, G.player.y - 140, '開拓完了！', '#ffd23f', 42);
  sparks(G.player.x, G.player.y - 60, 60, ['#ffd23f', '#fff', '#7fe0ff', '#ff9ad5']);
  G.shake = 10;
  // クリアのごほうび
  if (!G.v.battle) {
    const bonus = Math.round(G.v.goal * CONFIG.clearBonus * G.v.priceMul);
    G.money += bonus;
    floatText(G.player.x, G.player.y - 190, `ごほうび +${bonus}`, '#ffd23f', 30);
    coinBurst(16);
    updateHud();
  }
  const v = G.v;
  later(1.6, () => showStory(v.outro, () => openMap(true)));
}

function nextPad() {
  G.pad = { ...unlockAt(G.unlockIdx), paid: 0, payT: 0, pulse: 0 };
  updateTerritory();
}

// ============================================================
//  領地：解放した設備と次の解放パッドのまわりまで広がる
// ============================================================
function territoryTarget() {
  const T = CONFIG.territory, W = CONFIG.world;
  if (G.v && G.v.battle) return { x0: 20, y0: 60, x1: W.w - 20, y1: W.h - 20 };   // 決戦は最初から全部
  const r = { ...T.base };
  const add = (x, y, m) => {
    r.x0 = Math.min(r.x0, x - m); r.x1 = Math.max(r.x1, x + m);
    r.y0 = Math.min(r.y0, y - m); r.y1 = Math.max(r.y1, y + m);
  };
  for (let i = 0; i < G.unlockIdx; i++) {
    const u = unlockAt(i);
    add(u.x, u.y, T.margin);
    if (u.id === 'counter2') add(CONFIG.counters[1].x + 30, CONFIG.counters[1].y, T.margin);
    if (u.id === 'huntArea') { add(CONFIG.hunt.x, CONFIG.hunt.y, 0); add(CONFIG.hunt.x + CONFIG.hunt.w, CONFIG.hunt.y, 0); }
  }
  if (G.pad) add(G.pad.x, G.pad.y, 55);
  return { x0: Math.max(20, r.x0), y0: Math.max(60, r.y0), x1: Math.min(W.w - 20, r.x1), y1: Math.min(W.h - 20, r.y1) };
}

function updateTerritory(instant) {
  const t = territoryTarget();
  const big = G.huntBig || (G.v && G.v.battle);
  G.hunt = big ? { ...CONFIG.hunt } : { ...CONFIG.territory.hunt0 };
  if (instant || !G.bounds) { G.bounds = { ...t }; G.boundsTo = t; return; }
  const grew = (G.bounds.x0 - t.x0) + (t.x1 - G.bounds.x1) + (G.bounds.y0 - t.y0) + (t.y1 - G.bounds.y1);
  G.boundsTo = t;
  if (grew > 20) {
    G.boundsFrom = { ...G.bounds };
    G.boundsT = 0;
    // ガコン！と広がる
    later(0.35, () => {
      G.shake = Math.max(G.shake, 10);
      Sound.sfx.bearDown();
      floatText(G.player.x, G.player.y - 140, 'エリアが広がった！', '#7fe0ff', 28);
    }, 350);
  }
}

// 広がるアニメーション（ぐっとためてから一気に）
function animateTerritory(dt) {
  if (G.boundsT == null) return;
  G.boundsT += dt / 0.8;
  const k = Math.min(1, G.boundsT);
  const e = k < 0.4 ? 0 : 1 - Math.pow(1 - (k - 0.4) / 0.6, 3);
  ['x0', 'y0', 'x1', 'y1'].forEach(p => { G.bounds[p] = G.boundsFrom[p] + (G.boundsTo[p] - G.boundsFrom[p]) * e; });
  if (k >= 1) G.boundsT = null;
}

// 領地の外は、雪に埋もれた未開拓の土地（少し暗く）
function drawTerritory() {
  const b = G.bounds, W = CONFIG.world.w, H = CONFIG.world.h;
  const pad = 26;
  ctx.save();
  ctx.fillStyle = 'rgba(35,55,90,.45)';
  ctx.beginPath();
  ctx.rect(-200, -200, W + 400, H + 400);
  roundRectPath(b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + pad * 2, b.y1 - b.y0 + pad * 2, 40);
  ctx.fill('evenodd');
  // さかいめの雪の土手（影 → 白い帯 → ハイライト）
  const edge = () => { ctx.beginPath(); roundRectPath(b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + pad * 2, b.y1 - b.y0 + pad * 2, 40); };
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(60,90,130,.28)'; ctx.lineWidth = 18; ctx.translate(0, 5); edge(); ctx.stroke(); ctx.translate(0, -5);
  ctx.strokeStyle = '#f4f9ff'; ctx.lineWidth = 14; edge(); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,220,245,.9)'; ctx.lineWidth = 3; ctx.setLineDash([10, 16]); edge(); ctx.stroke();
  ctx.restore();
}
function roundRectPath(x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function init() {
  canvas = $('game');
  ctx = canvas.getContext('2d');
  loadImages();
  SAVE = loadSave();
  G.muted = !!SAVE.muted;
  Sound.setMuted(G.muted);
  G.player = {
    x: CONFIG.playerStart.x, y: CONFIG.playerStart.y, vx: 0, vy: 0, face: 1, stack: [],
    cap: CONFIG.player.cap, damage: CONFIG.player.damage, atkT: 0, attackT: 0, xferT: 0, walk: 0,
  };
  G.money = SAVE.money || 0;
  G.up = SAVE.up || {};
  applyUpgrades();
  enterVillage(SAVE.cur || 'camp');

  setupInput();
  window.addEventListener('resize', resize);
  resize();
  updateHud();
  $('mute-btn').textContent = G.muted ? '🔇' : '🔊';
  $('mute-btn').onclick = () => {
    G.muted = !G.muted;
    Sound.setMuted(G.muted);
    $('mute-btn').textContent = G.muted ? '🔇' : '🔊';
    persist();
  };
  $('up-btn').onclick = () => openUpgrades(true);
  $('map-btn').onclick = () => openMap(true);
  $('map-close').onclick = () => openMap(false);
  $('up-close').onclick = () => openUpgrades(false);
  $('upgrades').addEventListener('click', e => { if (e.target.id === 'upgrades') openUpgrades(false); });
  $('map').addEventListener('click', e => { if (e.target.id === 'map' || e.target.classList.contains('map-area')) openMap(false); });
  $('start').onclick = () => {
    $('start').classList.add('hidden');
    Sound.startBgm();
    Sound.sfx.click();
    // はじめてその村に来たときは、村の会話から
    if (!SAVE.seen['intro_' + G.cur]) {
      SAVE.seen['intro_' + G.cur] = true;
      persist();
      showStory(G.v.intro);
    }
  };
  setInterval(persist, 3000);
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  G.dpr = dpr;
  G.cam.scale = r.width / CONFIG.viewWidth;
  G.viewW = CONFIG.viewWidth;
  G.viewH = r.height / G.cam.scale;
}

// ============================================================
//  入力：画面のどこでも押してドラッグ → その方向に歩く（バーチャルジョイスティック）
// ============================================================
// ・ドラッグ … その方向に歩き続ける（指を離すと止まる）
// ・タップ（すぐ離す）… タップした場所まで自動で歩く
function setupInput() {
  // タッチした場所へ向かう（パッドや台の近くなら、その真ん中に吸いつく）。
  // 指をつけたまま動かすと指についていき、はなすとその場で止まる
  canvas.addEventListener('pointerdown', e => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 取れなくても操作は続ける */ }
    G.touch = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    G.moveTo = snapTarget(touchTarget());
    Sound.startBgm();
  });
  canvas.addEventListener('pointermove', e => {
    if (!G.touch || e.pointerId !== G.touch.id) return;
    G.touch.x = e.clientX; G.touch.y = e.clientY;
    if (Math.hypot(G.touch.x - G.touch.sx, G.touch.y - G.touch.sy) > 12) G.touch.moved = true;
  });
  const end = e => {
    if (!G.touch || e.pointerId !== G.touch.id) return;
    if (G.touch.moved) G.moveTo = null;   // なぞったあとは、はなした所で止まる
    G.touch = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  window.addEventListener('keydown', e => { G.keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', e => { G.keys[e.key.toLowerCase()] = false; });
}

// 指の下にあるワールド座標（カメラが動いても毎フレーム計算し直す）
// follow が true のときは、主人公が指で隠れないよう少し上を目指す
function touchTarget(follow) {
  const r = canvas.getBoundingClientRect();
  const t = G.touch;
  return {
    x: G.cam.x + (t.x - r.left) / G.cam.scale,
    y: G.cam.y + (t.y - r.top) / G.cam.scale - (follow ? 55 : 0),
    t: 0,
  };
}

// パッドや台の近くをタップしたら、その真ん中で止まる
function snapTarget(p) {
  const spots = [];
  if (G.pad) spots.push(G.pad);
  G.grills.forEach(g => spots.push(g.inPad, g.outPad));
  G.counters.forEach(c => { spots.push(c.servePad); if (c.cash > 0) spots.push(c.cashPos); });
  if (G.barricade && G.fenceMax && G.fenceHp < G.fenceMax) spots.push(repairSpot());
  let best = null, bd = 60;
  spots.forEach(s => { const d = dist(s, p); if (d < bd) { bd = d; best = s; } });
  return best ? { x: best.x, y: best.y, t: 0 } : p;
}

function inputDir() {
  if (G.touch && G.touch.moved && !G.paused) { const t = touchTarget(true); t.t = G.moveTo ? G.moveTo.t : 0; G.moveTo = t; }
  let dx = 0, dy = 0, mag = 0;
  if (G.joy) {
    dx = G.joy.x - G.joy.sx;
    dy = G.joy.y - G.joy.sy;
    const len = Math.hypot(dx, dy);
    if (len > 6) { mag = Math.min(1, len / 45); dx /= len; dy /= len; } else { dx = dy = 0; }
  }
  // タップした場所へ向かう（ドラッグやキーを使ったら取り消し）
  if (G.moveTo && !(G.joy && G.joy.moved)) {
    const bd = G.bounds;   // 領地の外をさわったら、ふちまで行く
    const ox = G.moveTo.x, oy = G.moveTo.y;
    G.moveTo.x = clamp(ox, bd.x0, bd.x1);
    G.moveTo.y = clamp(oy, bd.y0, bd.y1);
    if (Math.hypot(ox - G.moveTo.x, oy - G.moveTo.y) > 60 && G.time - (G.edgeTipT || -9) > 4) {
      G.edgeTipT = G.time;
      floatText(G.moveTo.x, G.moveTo.y - 60, '設備を解放すると広がるよ', '#fff', 18);
    }
    const tdx = G.moveTo.x - G.player.x, tdy = G.moveTo.y - G.player.y;
    const len = Math.hypot(tdx, tdy);
    if (len < 8) G.moveTo = null;
    else { dx = tdx / len; dy = tdy / len; mag = len < 12 ? len / 12 : 1; }   // 最後の少しだけ減速
  }
  const k = G.keys;
  const kx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
  const ky = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0);
  if (kx || ky) { const l = Math.hypot(kx, ky); dx = kx / l; dy = ky / l; mag = 1; G.moveTo = null; }
  return { dx, dy, mag };
}

// ============================================================
//  白クマ
// ============================================================
function spawnBear(boss) {
  const a = G.hunt;
  let x, y, tries = 0;
  do {
    x = rand(a.x + 40, a.x + a.w - 40);
    y = rand(a.y + 40, a.y + a.h - 40);
  } while (G.player && dist({ x, y }, G.player) < 220 && ++tries < 20);
  const hp = Math.round((boss ? CONFIG.bossBear.hp : CONFIG.bear.hp) * G.v.bearHp);
  G.bears.push({ x, y, hp, maxHp: hp, boss, tx: x, ty: y, t: rand(0, 2), hitT: 0, face: 1, state: 'wander', deadT: 0, pop: 0, walk: 0 });
  if (boss) {
    Sound.sfx.roar();
    floatText(x, y - 150, 'ボス白クマ出現！', '#ff4d4d', 34);
    G.shake = 12;
  }
}

function hitBear(b, dmg, from) {
  if (b.state === 'dead') return;
  b.hp -= dmg;
  b.hitT = 0.16;
  if (b.giant) {
    // 巨人はのけぞらない
    Sound.sfx.hit();
    sparks(b.x + rand(-30, 30), b.y - rand(60, 160), 6, ['#fff', '#cfe8ff', '#ffe066']);
    floatText(b.x + rand(-30, 30), b.y - 250, '-' + dmg, '#ffe066', 30);
    if (b.hp <= 0) { b.state = 'dead'; giantDefeated(b); }
    updateHud();
    return;
  }
  b.angryT = CONFIG.combat.angrySec;
  const ang = Math.atan2(b.y - from.y, b.x - from.x);
  b.x += Math.cos(ang) * 10;
  b.y += Math.sin(ang) * 6;
  Sound.sfx.hit();
  sparks(b.x, b.y - 40, 8, ['#fff', '#cfe8ff', '#ffe066']);
  floatText(b.x + rand(-10, 10), b.y - (b.boss ? 130 : 85), '-' + dmg, '#ffe066', b.boss ? 32 : 28);
  G.shake = Math.max(G.shake, b.boss ? 6 : 3);
  if (b.hp <= 0) {
    b.state = 'dead';
    b.deadT = 0.7;
    G.kills++;
    Sound.sfx.bearDown();
    const n = (b.boss ? CONFIG.bossBear.meat : CONFIG.bear.meat) + G.v.meatBonus;
    for (let i = 0; i < n; i++) dropMeat(b.x, b.y - 20);
    sparks(b.x, b.y - 30, b.boss ? 30 : 14, ['#fff', '#e8f4ff', '#ffb3b3']);
    fxAt('ui/explosion', b.x, b.y - 30, b.boss ? 200 : 120);
    fxAt('ui/sparkle', b.x, b.y - 60, b.boss ? 140 : 90);
    G.shake = Math.max(G.shake, b.boss ? 14 : 6);
    if (G.bossOn && !b.boss && G.kills % CONFIG.bossBear.everyKills === 0 && !G.bears.some(x => x.boss && x.state !== 'dead')) {
      later(0.9, () => spawnBear(true));
    }
  }
}

// 白クマが狙う相手：倒れていない主人公・剣士・弓使い
function bearTargets() {
  const list = G.player.downT > 0 ? [] : [G.player];
  G.helpers.forEach(h => { if (h.type === 'sword' && !h.downT) list.push(h); });   // 弓使いは見張り台の上なので安全
  return list;
}

// 白クマ：うろうろ → 近づくと追いかける → 「ため」（足元に赤い円）→ ひっかき → 少し休む
function updateBears(dt) {
  const a = G.hunt, C = CONFIG.combat;
  G.bears.forEach(b => {
    b.pop = Math.min(1, b.pop + dt * 3);
    b.hitT = Math.max(0, b.hitT - dt);
    b.cd = Math.max(0, (b.cd || 0) - dt);
    if (b.state === 'dead') { b.deadT -= dt; return; }
    const reach = b.boss ? C.boss.reach : C.reach;
    if (b.giant) { updateGiant(b, dt); return; }
    b.angryT = Math.max(0, (b.angryT || 0) - dt);
    if (b.state === 'windup') {
      b.wt -= b.hitT > 0 ? dt * 0.7 : dt;   // 攻撃を当てている間は「ため」が遅くなる（攻めれば少し安全）
      if (b.target) b.face = b.target.x > b.x ? 1 : -1;
      if (b.wt <= 0) {
        // 攻撃！ 赤い円の中にいたらダメージ（ためている間に逃げればよけられる）
        b.state = 'strike';
        b.st = 0.3;
        const dmg = Math.round(C.damage * G.v.bearHp * (b.boss ? C.boss.damageMul : 1));
        Sound.sfx.claw();
        fxAt('ui/slash', b.x + b.face * 30, b.y - 40, b.boss ? 150 : 90, b.face > 0 ? 0.6 : Math.PI - 0.6);
        bearTargets().forEach(t => { if (Math.hypot(t.x - b.x, (t.y - b.y) / 0.55) < reach + 6) damageUnit(t, dmg, b); });
        if (b.target && b.target.fence) damageFence(dmg * 1.5);   // バリケードをひっかく
        if (b.boss) G.shake = Math.max(G.shake, 10);
      }
      return;
    }
    if (b.state === 'strike') {
      b.st -= dt;
      if (b.st <= 0) { b.state = 'wander'; b.cd = C.cooldown; }
      return;
    }
    // いちばん近い相手を追いかける
    let tgt = null, best = b.angryT > 0 ? C.angryAggro : C.aggro;
    bearTargets().forEach(t => { const d = dist(t, b); if (d < best) { best = d; tgt = t; } });
    if (tgt) {
      b.state = 'chase';
      b.face = tgt.x > b.x ? 1 : -1;
      if (best > reach * 0.7) {
        const sp = C.chaseSpeed * (b.boss ? 0.75 : 1);
        b.x += (tgt.x - b.x) / best * sp * dt;
        b.y += (tgt.y - b.y) / best * sp * dt;
        b.walk += dt * 10;
      } else b.walk += dt * 3;
      if (best < reach && b.cd <= 0) {
        b.state = 'windup';
        b.wt = b.wtMax = b.boss ? C.boss.windup : C.windup;
        b.target = tgt;
        Sound.sfx.growl();
        if (tgt === G.player && !SAVE.seen.dodgeTip) {   // はじめての攻撃のときだけヒント
          SAVE.seen.dodgeTip = true;
          floatText(G.player.x, G.player.y - 130, '赤い円から逃げろ！', '#ff5a5a', 26);
        }
      }
    } else if (b.raid) {
      // 攻めてくる白クマ：バリケードへまっすぐ。こわれていたらキャンプの中へ
      b.state = 'chase';
      const up = fenceUp();
      const loot = G.grills.filter(g => g.raw + g.cooked > 0).sort((p, q) => dist(b, p) - dist(b, q))[0];
      const goal = up ? { x: clamp(b.x, 60, CONFIG.world.w - 60), y: fenceY() - 12 } : loot ? { x: loot.x + 40, y: loot.y + 30 } : { x: 330, y: 900 };
      if (!up && loot && dist(b, goal) < 30 && b.cd <= 0) {
        // グリルの肉を奪う！
        const n = Math.min(4, loot.raw + loot.cooked);
        const fromCooked = Math.min(loot.cooked, n);
        loot.cooked -= fromCooked;
        loot.raw -= n - fromCooked;
        b.cd = 2.5;
        floatText(loot.x, loot.y - 110, `肉を${n}個とられた！`, '#ff5a5a', 22);
        Sound.sfx.growl();
      }
      const d = dist(goal, b);
      if (d > 8) {
        b.x += (goal.x - b.x) / d * C.chaseSpeed * dt;
        b.y += (goal.y - b.y) / d * C.chaseSpeed * dt;
        b.walk += dt * 10;
        b.face = goal.x > b.x ? 1 : b.x > goal.x + 1 ? -1 : b.face;
      } else if (up && b.cd <= 0) {
        b.state = 'windup';
        b.wt = b.wtMax = C.windup;
        b.target = { fence: true, x: b.x, y: fenceY() };
      }
    } else {
      b.state = 'wander';
      b.t -= dt;
      if (b.t <= 0 || Math.hypot(b.tx - b.x, b.ty - b.y) < 8) {
        b.tx = rand(a.x + 40, a.x + a.w - 40);
        b.ty = rand(a.y + 40, a.y + a.h - 40);
        b.t = rand(2, 5);
      }
      const sp = CONFIG.bear.speed * (b.boss ? 0.8 : 1);
      const d = Math.hypot(b.tx - b.x, b.ty - b.y) || 1;
      b.x += (b.tx - b.x) / d * sp * dt;
      b.y += (b.ty - b.y) / d * sp * dt;
      b.face = b.tx > b.x ? 1 : -1;
      b.walk += dt * 6;
    }
    // バリケードがあれば白クマは柵を越えられない。無いと追いかけてキャンプまで入ってくる
    b.x = clamp(b.x, a.x + 20, a.x + a.w - 20);
    b.y = clamp(b.y, a.y + 20, a.y + a.h + (fenceUp() ? 5 : b.raid ? 420 : 280));
  });
  G.bears = G.bears.filter(b => b.state !== 'dead' || b.deadT > 0);
  const alive = G.bears.filter(b => !b.boss && !b.raid).length;
  if (alive < G.maxBears) {
    G.bearT -= dt;
    if (G.bearT <= 0) { spawnBear(false); G.bearT = CONFIG.bear.respawnSec; }
  }
}

// 主人公・助っ人がダメージを受ける
function damageUnit(u, dmg, from) {
  if (u.downT > 0 || u.invT > 0) return;
  u.hp -= dmg;
  u.hurtT = 0.3;
  const ang = Math.atan2(u.y - from.y, u.x - from.x);
  u.x += Math.cos(ang) * 20;
  u.y += Math.sin(ang) * 14;
  floatText(u.x, u.y - 100, '-' + dmg, '#ff5a5a', 26);
  sparks(u.x, u.y - 40, 10, ['#ff5a5a', '#fff', '#ffb3b3']);
  if (u === G.player) {
    u.calmT = CONFIG.combat.regenDelay;
    G.flash = 0.35;
    G.shake = Math.max(G.shake, 8);
    Sound.sfx.hurt();
    if (u.hp <= 0) playerDown();
  } else if (u.hp <= 0) {
    // 助っ人は体力がなくなると「疲れちゃった…」とテントへ帰って休む（休んだらまた戻ってくる）
    u.hp = 0;
    u.downT = CONFIG.helper.downSec;
    u.resting = false;
    u.stack.forEach(() => dropMeat(u.x, u.y - 20));
    u.stack = [];
    say(u, TIRED_LINES[volVoice(u.kind || '')][randInt(0, 1)], 3);
  }
}

// 主人公が倒れた：背負っていた肉を落として、少ししてキャンプで起き上がる
function playerDown() {
  const P = G.player;
  P.hp = 0;
  P.downT = CONFIG.combat.downSec;
  P.stack.forEach(() => dropMeat(P.x, P.y - 20));
  P.stack = [];
  G.moveTo = null;
  Sound.sfx.bearDown();
  floatText(P.x, P.y - 120, 'たおれた…', '#ff5a5a', 30);
}

// ============================================================
//  肉（落ちる → 地面 → 吸い寄せられて背中へ）
// ============================================================
function dropMeat(x, y) {
  const ang = rand(0, Math.PI * 2), sp = rand(60, 150);
  G.drops.push({ x, y, z: 30, vz: rand(180, 260), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.6, state: 'pop', holder: null, t: 0, age: 0 });
  // 地面の肉が多すぎたら古いものから消す
  const ground = G.drops.filter(d => d.state === 'ground');
  if (ground.length > CONFIG.dropMax) ground.slice(0, ground.length - CONFIG.dropMax).forEach(d => { d.state = 'done'; });
}

// 生肉と焼けた肉はいっしょに持てる（合計が cap まで）
function canCarry(who, kind, cap) {
  return who.stack.length < cap;
}
// 背中から指定の種類を1つ取り出す（上に積んだものから）
function takeFromStack(who, kind) {
  const i = who.stack.lastIndexOf(kind);
  if (i < 0) return false;
  who.stack.splice(i, 1);
  return true;
}

function updateDrops(dt) {
  G.drops.forEach(m => {
    if (m.state === 'pop') {
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.vz -= 700 * dt;
      if (m.z <= 0) { m.z = 0; m.vz = 0; m.state = 'ground'; m.t = 0.25; }
    } else if (m.state === 'ground') {
      m.t -= dt;
      m.age += dt;
      if (m.age > CONFIG.dropLife) { m.state = 'done'; return; }   // 拾われない肉は消える
      if (m.t > 0) return;
      // 近くにいる人（プレイヤー・ハンター）が拾う
      const takers = (G.player.downT > 0 ? [] : [{ o: G.player, cap: G.player.cap, r: CONFIG.player.pickupRange }])
        .concat(G.helpers.filter(h => h.type === 'sword' && !h.downT).map(h => ({ o: h, cap: CONFIG.helper.sword.cap, r: CONFIG.helper.sword.pickup })));
      for (const tk of takers) {
        const reserved = G.drops.filter(d => d.state === 'fly' && d.holder === tk.o).length;
        if (dist(m, tk.o) < tk.r && tk.o.stack.length + reserved < tk.cap) {
          m.state = 'fly'; m.holder = tk.o; break;
        }
      }
    } else if (m.state === 'fly') {
      const h = m.holder;
      const tx = h.x, ty = h.y - 40;
      const d = Math.hypot(tx - m.x, ty - m.y);
      const sp = 700 * dt;
      if (d < sp + 6) {
        m.state = 'done';
        h.stack.push('raw');
        if (h === G.player) Sound.sfx.pick(h.stack.length);
      } else {
        m.x += (tx - m.x) / d * sp; m.y += (ty - m.y) / d * sp;
        m.z = Math.max(0, m.z + (20 - m.z) * dt * 8);
      }
    }
  });
  G.drops = G.drops.filter(m => m.state !== 'done');
}

// 見た目だけの「飛んでいくアイテム」（受け渡しの演出）
function fly(name, from, to, h = 26, dur = 0.28, onDone) {
  G.flyers.push({ name, fx: from.x, fy: from.y, tx: to.x, ty: to.y, h, t: 0, dur, onDone });
}

// ============================================================
//  プレイヤー
// ============================================================
function updatePlayer(dt) {
  const P = G.player;
  P.hurtT = Math.max(0, (P.hurtT || 0) - dt);
  P.invT = Math.max(0, (P.invT || 0) - dt);
  if (P.downT > 0) {
    P.downT -= dt;
    P.vx = P.vy = 0;
    if (P.downT <= 0) {
      // キャンプで起き上がる（少しの間は無敵）
      P.downT = 0;
      P.x = CONFIG.playerStart.x;
      P.y = CONFIG.playerStart.y + 90;
      P.hp = P.maxHp;
      P.invT = 1.5;
      floatText(P.x, P.y - 110, '回復！', '#7fe0ff', 24);
    }
    return;
  }
  // 自然回復：攻撃を受けてから少し経つと回復していく
  if (P.calmT > 0) P.calmT -= dt;
  else P.hp = Math.min(P.maxHp, P.hp + stat('regen') * dt);
  const { dx, dy, mag } = inputDir();
  const sp = stat('speed') * mag;
  P.vx = dx * sp; P.vy = dy * sp;
  const bd = G.bounds;
  P.x = clamp(P.x + P.vx * dt, bd.x0, bd.x1);
  P.y = clamp(P.y + P.vy * dt, bd.y0, bd.y1);
  if (Math.abs(P.vx) > 5) P.face = P.vx > 0 ? 1 : -1;
  if (mag > 0.1) {
    P.walk += dt * 10;
    if (Math.random() < dt * 8) G.steps.push({ x: P.x + rand(-6, 6), y: P.y, t: 3 });
  }
  P.atkT -= dt;
  P.attackT = Math.max(0, P.attackT - dt);
  if (P.pendingHit && (P.pendingHit.t -= dt) <= 0) { hitBear(P.pendingHit.target, P.damage, P); P.pendingHit = null; }

  // 自動攻撃：いちばん近い白クマ
  let target = null, best = CONFIG.player.attackRange;
  G.bears.forEach(b => {
    if (b.state === 'dead') return;
    const d = dist(b, P) - (b.giant ? 75 : b.boss ? 30 : 0);
    if (d < best) { best = d; target = b; }
  });
  if (target && P.atkT <= 0) {
    P.atkT = CONFIG.player.attackCd;
    P.attackT = 0.18;
    P.face = target.x > P.x ? 1 : -1;
    Sound.sfx.swing();
    fxAt('ui/slash', target.x, target.y - (target.boss ? 70 : 45), target.boss ? 120 : 80, P.face > 0 ? -0.3 : 0.3 + Math.PI);
    P.pendingHit = { target, t: 0.09 };   // 斧が当たるのは少しあと（ゲーム内時間で数える）
  }

  interactStations(P, dt, CONFIG.player.transferSec, P.cap, true);

  // お金を拾う
  G.counters.forEach(c => {
    if (c.cash > 0 && dist(P, c.cashPos) < 60) {
      const n = Math.min(12, Math.ceil(c.cash / 5));
      for (let i = 0; i < n; i++) {
        later(i * 0.03, () => { G.coinFly.push({ x: c.cashPos.x + rand(-15, 15), y: c.cashPos.y - 10, t: 0 }); Sound.sfx.coin(i); });
      }
      G.money += c.cash;
      floatText(c.cashPos.x, c.cashPos.y - 50, '+' + fmt(c.cash), '#ffd23f', 26);
      c.cash = 0;
      updateHud();
    }
  });

  // 解放パッドにお金を払う
  const pad = G.pad;
  if (pad && dist(P, pad) < 48 && G.money > 0 && mag < 0.2) {
    pad.payT -= dt;
    if (pad.payT <= 0) {
      pad.payT = 0.03;
      const step = Math.min(G.money, pad.price - pad.paid, Math.max(1, Math.ceil(pad.price / 40)));
      G.money -= step;
      pad.paid += step;
      G.coinFly2 = (G.coinFly2 || 0) + 1;
      fly('coin', { x: P.x, y: P.y - 60 }, { x: pad.x, y: pad.y }, 18, 0.2);
      Sound.sfx.coin(G.coinFly2);
      updateHud();
      if (pad.paid >= pad.price) unlockPad();
    }
  }
}

function unlockPad() {
  const pad = G.pad;
  applyUnlock(pad.id, false);
  G.unlockIdx++;
  Sound.sfx.unlock();
  sparks(pad.x, pad.y - 20, 40, ['#ffd23f', '#fff', '#7fe0ff', '#ff9ad5']);
  floatText(pad.x, pad.y - 80, pad.label + '！', '#ffd23f', 30);
  G.shake = 6;
  nextPad();
  persist();
  updateHud();
}

// グリル・配給台での受け渡し（プレイヤーと運び係で共通）
function interactStations(who, dt, rate, cap, isPlayer) {
  who.xferT = (who.xferT || 0) - dt;
  if (who.xferT > 0) return;
  if (!isPlayer) {
    // 助っ人は台に乗ったら、置ける分・持てる分をまとめて一気に受け渡す
    let n = 0;
    while (n < 60 && transferOnce(who, cap, false)) n++;
    if (n) who.xferT = 0.3;
    return;
  }
  if (transferOnce(who, cap, true)) who.xferT = rate;
}

// 1個だけ受け渡す。受け渡したら true
function transferOnce(who, cap, isPlayer) {
  for (const g of G.grills) {
    // 生肉をグリルに置く
    if (who.stack.includes('raw') && g.raw < stat('grillCap') && dist(who, g.inPad) < 48) {
      takeFromStack(who, 'raw');
      g.raw++;
      fly('meat_raw', { x: who.x, y: who.y - 50 }, { x: g.inPad.x, y: g.inPad.y - 10 });
      if (isPlayer) Sound.sfx.drop(g.raw);
      return true;
    }
    // 焼けた肉を取る
    if (g.cooked > 0 && canCarry(who, 'cooked', cap) && dist(who, g.outPad) < 48) {
      g.cooked--;
      who.stack.push('cooked');
      fly('meat_cooked', { x: g.outPad.x, y: g.outPad.y - 10 }, { x: who.x, y: who.y - 50 });
      if (isPlayer) Sound.sfx.pick(who.stack.length);
      return true;
    }
  }
  for (const c of G.counters) {
    // 焼けた肉を配給台に置く
    if (who.stack.includes('cooked') && c.stock < stat('counterCap') && dist(who, c.servePad) < 48) {
      takeFromStack(who, 'cooked');
      c.stock++;
      fly('meat_cooked', { x: who.x, y: who.y - 50 }, { x: c.x, y: c.y - 40 });
      if (isPlayer) Sound.sfx.drop(c.stock);
      return true;
    }
  }
  return false;
}

// ============================================================
//  グリル・配給台・お客さん
// ============================================================
function updateGrills(dt) {
  G.grills.forEach(g => {
    g.pop = Math.min(1, g.pop + dt * 2.5);
    if (g.raw > 0 && g.cooked < stat('grillCap')) {
      g.t += dt;
      if (Math.random() < dt * 6) G.parts.push({ x: g.x + rand(-20, 20), y: g.y - 60, vx: rand(-8, 8), vy: rand(-40, -25), t: 1.2, life: 1.2, kind: 'smoke' });
      if (g.t >= stat('cook')) {
        g.t = 0;
        g.raw--;
        g.cooked++;
        Sound.sfx.cook();
        fly('meat_cooked', { x: g.x, y: g.y - 40 }, { x: g.outPad.x, y: g.outPad.y - 10 }, 26, 0.3);
      }
    } else {
      g.t = 0;
    }
  });
}

function updateCustomers(dt) {
  const C = CONFIG.customer;
  // 新しいお客さん
  // 列はいつも満員：空きができたら、すぐ次の人が並びに来る
  G.spawnT -= dt;
  const counter = G.counters.slice().sort((a, b) => a.queue.length - b.queue.length)[0];
  if (G.spawnT <= 0 && counter.queue.length < C.maxQueue) {
    G.spawnT = 0.25;
    // 村人の見た目：画像が届いている種類からランダム
    let kinds = CONFIG.villagers.filter(k => images[k] && k !== 'villager_child');
    if (!kinds.length || Math.random() < CONFIG.childRate) kinds = ['villager_child'];
    const cu = {
      x: counter.x + rand(-30, 30), y: CONFIG.world.h + 40, want: randInt(...G.v.want), got: 0,
      kind: kinds[randInt(0, kinds.length - 1)], state: 'queue', counter, walk: 0, face: 1, pop: 1,
    };
    counter.queue.push(cu);
    G.customers.push(cu);
  }
  G.counters.forEach(c => {
    c.pop = Math.min(1, c.pop + dt * 2.5);
    c.queue.forEach((cu, i) => {
      cu.slot = { x: c.x, y: c.y + 72 + i * 44 };
    });
    const front = c.queue[0];
    if (front && dist(front, front.slot) < 6 && c.stock > 0 && front.got < front.want) {
      c.t += dt;
      if (c.t >= CONFIG.counter.takeSec) {
        c.t = 0;
        c.stock--;
        front.got++;
        fly('meat_cooked', { x: c.x, y: c.y - 40 }, { x: front.x, y: front.y - 50 }, 24, 0.22);
        if (front.got >= front.want) {
          // お金を払って、笑顔で帰る
          const pay = front.want * (stat('pay') + (G.fire ? 2 : 0));
          c.cash += pay;
          for (let i = 0; i < Math.min(6, front.want * 2); i++) {
            fly('coin', { x: front.x, y: front.y - 40 }, { x: c.cashPos.x + rand(-12, 12), y: c.cashPos.y - 6 }, 16, 0.35);
          }
          Sound.sfx.pay();
          Sound.sfx.happy();
          floatText(front.x, front.y - 92, '❤', '#ff5a7a', 28);
          front.state = 'leave';
          front.baseKind = front.kind;
          if (images[front.kind + '_happy']) front.kind += '_happy';   // 笑顔の絵がある人は笑顔に（無ければハートを出す）
          front.happy = true;
          front.exit = { x: Math.random() < 0.5 ? -60 : CONFIG.world.w + 60, y: rand(1150, 1350) };
          c.queue.shift();
          G.rescued++;
          const M = CONFIG.milestone;
          if (G.rescued % M.every === 0) {
            const bonus = Math.round(M.bonus * G.v.priceMul);
            c.cash += bonus;
            floatText(c.cashPos.x, c.cashPos.y - 90, `${G.rescued}人達成！ +${bonus}`, '#ffd23f', 24);
            Sound.sfx.unlock();
          }
          checkRaid();
          maybeVolunteer(front);
          updateHud();
          if (!G.vs.done && !G.v.battle && G.rescued >= G.v.goal) villageClear();
        }
      }
    }
  });
  G.customers.forEach(cu => {
    const target = cu.state === 'leave' ? cu.exit : cu.state === 'volunteer' ? CONFIG.volunteer.spot : cu.slot;
    if (!target) return;
    const d = Math.hypot(target.x - cu.x, target.y - cu.y);
    const sp = C.speed * (cu.state === 'leave' ? 1.3 : 1) * dt;
    if (d > 2) {
      const step = Math.min(sp, d);
      cu.x += (target.x - cu.x) / d * step;
      cu.y += (target.y - cu.y) / d * step;
      cu.walk += dt * 8;
      if (Math.abs(target.x - cu.x) > 2) cu.face = target.x > cu.x ? 1 : -1;
    }
    if (cu.state === 'leave' && d < 4) cu.gone = true;
  });
  G.customers = G.customers.filter(cu => !cu.gone);
}

// ============================================================
//  志願者：肉をもらった村人がときどき「手伝わせて！」と残ってくれる
// ============================================================
const VOL_LINES = {
  boy: ['ぼくも手伝いたい！ 何をすればいい？', 'おいしかった！ ぼくにも何かやらせて！'],
  man: ['助かったぜ！ おれにも何か手伝わせてくれ！', 'この恩は返す。おれは何をすればいい？'],
  woman: ['ありがとう！ わたしにも何かできることはある？', 'あったまったわ。わたしは何をしましょうか？'],
};
const TIRED_LINES = {
  boy: ['ごめん、ちょっと疲れちゃった…', 'もうヘトヘト…休んでくるね'],
  man: ['わりぃ、もう腕が上がらねえ…', 'ちょっと休ませてくれ…'],
  woman: ['ごめんなさい、少し休ませて…', 'もう戦えないわ…ひと休みするね'],
};
const BACK_LINES = ['おまたせ！ また頑張るよ！', 'ふう、元気になった！', 'よし、もうひと働きだ！'];
// 助っ人のひとこと（頭の上の吹き出し）
function say(o, text, sec = 2.5) { o.say = { text, t: sec }; }

// 役割ごとの申し出のことば
const OFFER_LINES = {
  sword: { boy: '力なら負けない！ 白クマ退治を手伝わせて！', man: '腕っぷしには自信があるんだ。白クマ退治は任せてくれ！', woman: '力仕事は得意なの。白クマ退治、手伝うわ！' },
  carrier: { boy: 'ぼく、運ぶのは得意だよ！', man: '戦うのは苦手だが、肉を運ぶくらいならできるぞ。', woman: '焼けたお肉、みんなに配るのを手伝うわね！' },
  archer: { boy: '弓なら得意なんだ！ 見張りは任せて！', man: '目には自信がある。見張り台から弓で守ろう。', woman: '弓なら任せて。見張り台から守ってあげる！' },
};

const volVoice = kind => /child|girl/.test(kind) ? 'boy' : /_f|mother|_yf|_of/.test(kind) ? 'woman' : 'man';
const ROLES = [
  { type: 'sword', icon: 'mob_axe', label: 'お願い！ 一緒に戦って！', note: '斧で戦って、生肉をグリルへ運ぶ',
    reply: { boy: 'まかせて！ 斧ならつかえるよ！', man: 'おう！ 白クマなんざ怖くねえ！', woman: 'わかったわ、斧を持ってくる！' } },
  { type: 'carrier', icon: 'helper_cook', label: 'お願い！ 焼けた肉を運んで！', note: 'グリルの肉を配給台へ運ぶ',
    reply: { boy: 'うん！ いっぱい運ぶね！', man: 'よし、運ぶのはまかせろ！', woman: 'みんなに届けるわね！' } },
  { type: 'archer', icon: 'archer_aim', label: 'お願い！ 見張り台を守って！', note: '高い所から矢で白クマをうつ',
    reply: { boy: '高いところ、好き！', man: '目には自信があるんだ。まかせな！', woman: '弓なら得意よ。見張りはまかせて！' } },
];

function crewCount(type) { return G.helpers.filter(h => h.type === type).length; }
function roleOpen(type) {
  if (type === 'archer') return !!G.tower && crewCount('archer') < 1;
  return crewCount(type) < CONFIG.volunteer.max[type];
}

function maybeVolunteer(cu) {
  const V = CONFIG.volunteer;
  if (G.volunteer) return;
  // 決まった人数ごとに「志願者の番」が来て、その番のあとで役割に空きのある人が申し出る
  if (G.rescued === V.first || (G.rescued - V.first) % V.every === 0) G.volTurn = true;
  const role = CONFIG.villagerRole[cu.baseKind];
  if (!G.volTurn || !role || !roleOpen(role)) return;   // 子どもや、役割がもういっぱいの人は申し出ない
  cu.role = role;
  G.volTurn = false;
  cu.state = 'volunteer';
  cu.kind = cu.baseKind;
  G.volunteer = cu;
  cu.asked = false;
  floatText(cu.x, cu.y - 110, '手伝わせて！', '#ffd23f', 22);
}

// 志願者のところまで行ったら、役割を選ぶ
function updateVolunteer() {
  const cu = G.volunteer;
  if (!cu) return;
  const d = dist(G.player, cu);
  if (d > 110) cu.asked = false;
  const still = !G.touch && Math.hypot(G.player.vx, G.player.vy) < 20;
  if (!cu.asked && d < 75 && still && dist(cu, CONFIG.volunteer.spot) < 20 && !G.paused) {
    cu.asked = true;
    openRecruit(cu);
  }
}

function openRecruit(cu) {
  const voice = volVoice(cu.kind);
  G.paused = true;
  G.joy = null;
  G.touch = null;
  G.moveTo = null;
  $('recruit-face').src = IMG(cu.kind);
  $('recruit-text').textContent = VOL_LINES[voice][randInt(0, VOL_LINES[voice].length - 1)];
  const box = $('recruit-choices');
  box.innerHTML = '';
  // 手伝いたいことは、その人ごとに決まっている（仲間になると役割の服装に変わる）
  const r = ROLES.find(x => x.type === cu.role);
  $('recruit-text').textContent = OFFER_LINES[r.type][voice];
  {
    const b = document.createElement('button');
    b.innerHTML = `<img src="${IMG(r.icon)}" alt=""><span>${r.label}<small>${r.note}</small></span>`;
    b.onclick = () => {
      $('recruit-text').textContent = r.reply[voice];
      box.innerHTML = '';
      Sound.sfx.unlock();
      setTimeout(() => { closeRecruit(); recruit(cu, r.type); }, 900);
    };
    box.appendChild(b);
  }
  const later = document.createElement('button');
  later.className = 'later';
  later.textContent = 'あとで';
  later.onclick = closeRecruit;
  box.appendChild(later);
  Sound.sfx.click();
  $('recruit').classList.remove('hidden');
}

function closeRecruit() {
  $('recruit').classList.add('hidden');
  G.paused = G.mapOpen || !$('upgrades').classList.contains('hidden');
}

function recruit(cu, type) {
  const h = makeHelper(type);
  if (type !== 'archer') { h.x = cu.x; h.y = cu.y; }
  h.pop = 0;
  G.helpers.push(h);   // 見た目は役割ごとの服装になる（斧の戦士・運び係・弓使い）
  G.vs.crew.push({ type });
  cu.gone = true;
  G.volunteer = null;
  sparks(h.x, h.y - 40, 24, ['#ffd23f', '#fff', '#7fe0ff']);
  floatText(h.x, h.y - 130, '仲間になった！', '#ffd23f', 26);
  say(h, 'がんばるぞ！', 2);
  persist();
}

// ============================================================
//  助っ人（ハンター：白クマを倒して肉をグリルへ / 運び係：焼けた肉を配給台へ）
// ============================================================
function moveTo(o, t, speed, dt) {
  const d = Math.hypot(t.x - o.x, t.y - o.y);
  if (d < 4) return true;
  const s = Math.min(speed * dt, d);
  o.x += (t.x - o.x) / d * s;
  o.y += (t.y - o.y) / d * s;
  o.walk += dt * 10;
  if (Math.abs(t.x - o.x) > 3) o.face = t.x > o.x ? 1 : -1;
  return d < 4;
}

function updateHelpers(dt) {
  G.helpers.forEach(h => {
    h.pop = Math.min(1, h.pop + dt * 2.5);
    h.atkT -= dt;
    h.attackT = Math.max(0, h.attackT - dt);
    h.hurtT = Math.max(0, (h.hurtT || 0) - dt);
    if (h.say) { h.say.t -= dt; if (h.say.t <= 0) h.say = null; }
    if (h.downT > 0) {
      // テントまで歩いて帰り、中で休む
      const home = CONFIG.helper.home;
      if (!h.resting) {
        moveTo(h, home, 90, dt);
        if (dist(h, home) < 8) h.resting = true;
        return;
      }
      h.downT -= dt;
      if (h.downT <= 0) {
        h.downT = 0;
        h.resting = false;
        h.hp = h.maxHp;
        say(h, BACK_LINES[randInt(0, BACK_LINES.length - 1)], 2.5);
      }
      return;
    }
    if (h.maxHp) h.hp = Math.min(h.maxHp, h.hp + 3 * dt);
    if (h.type === 'sword') {
      // 斧の助っ人：白クマを囲んで何度も斬る → 落ちた肉をまとめて拾う → 背中がいっぱいになったらグリルへ
      const H = CONFIG.helper.sword;
      const bears = G.bears.filter(b => b.state !== 'dead');
      const loose = G.drops.filter(m => m.state === 'ground' && m.y < 700);
      h.idleT = !bears.length && !loose.length ? h.idleT + dt : 0;
      if (h.stack.length >= H.cap || (h.stack.length && h.idleT > 2.5)) {
        // 空きのあるグリルを優先（近い順）
        const full = g => g.raw >= stat('grillCap');
        const g = G.grills.slice().sort((a, b) => full(a) - full(b) || dist(h, a.inPad) - dist(h, b.inPad))[0];
        if (moveTo(h, g.inPad, H.speed, dt) || dist(h, g.inPad) < 40) interactStations(h, dt, 0.08, H.cap, false);
      } else if (loose.length && (!bears.length || h.stack.length === 0 && dist(h, loose[0]) < 120)) {
        moveTo(h, loose.sort((a, b) => dist(h, a) - dist(h, b))[0], H.speed, dt);
      } else if (bears.length) {
        // いちばん近い白クマ。みんなで同じ場所に重ならないよう、まわりを囲む（近くの肉は拾う範囲が広いので戦いながら集まる）
        const b = bears.sort((a, c) => dist(h, a) - dist(h, c))[0];
        const ang = h.n * 2.4 + 0.6;
        const spot = { x: b.x + Math.cos(ang) * 60, y: b.y + Math.sin(ang) * 30 };
        if (dist(h, b) > H.reach + (b.giant ? 70 : 0)) moveTo(h, b.giant ? { x: b.x + Math.cos(ang) * 110, y: b.y + Math.sin(ang) * 50 } : spot, H.speed, dt);
        else {
          h.face = b.x > h.x ? 1 : -1;
          if (h.atkT <= 0) {
            h.atkT = H.attackCd * rand(0.9, 1.1);
            h.attackT = 0.2;
            fxAt('ui/slash', b.x - h.face * 10, b.y - 45, 60, h.face > 0 ? -0.3 : 0.3 + Math.PI);
            hitBear(b, H.damage, h);
          }
        }
      } else {
        moveTo(h, { x: 200 + h.n * 55, y: 300 }, H.speed * 0.5, dt);   // 狩り場で次の白クマを待つ
      }
    } else if (h.type === 'archer') {
      // 弓使い：柵のそばから動かず、届く白クマに矢を射る
      const A = CONFIG.helper.archer;
      h.x = A.post.x; h.y = A.post.y;
      let tgt = null, best = A.range;
      G.bears.forEach(b => { if (b.state !== 'dead' && dist(b, h) < best) { best = dist(b, h); tgt = b; } });
      if (tgt) h.face = tgt.x > h.x ? 1 : -1;
      if (tgt && h.atkT <= 0) {
        h.atkT = A.attackCd;
        h.attackT = 0.3;
        G.arrows.push({ x: h.x + h.face * 14, y: h.y - 150, target: tgt, from: h, ang: 0 });
        Sound.sfx.arrow();
      }
    } else {
      const K = CONFIG.helper.carrier;
      if (h.stack.length) {
        const c = G.counters.slice().sort((a, b) => a.stock - b.stock)[0];
        if (moveTo(h, c.servePad, K.speed, dt) || dist(h, c.servePad) < 40) interactStations(h, dt, 0.1, K.cap, false);
      } else {
        const g = G.grills.slice().sort((a, b) => b.cooked - a.cooked)[0];
        if (g.cooked > 0) {
          if (moveTo(h, g.outPad, K.speed, dt) || dist(h, g.outPad) < 40) interactStations(h, dt, 0.1, K.cap, false);
        } else {
          moveTo(h, { x: 320, y: 930 }, K.speed * 0.5, dt);
        }
      }
    }
  });
  // 飛んでいる矢
  G.arrows.forEach(ar => {
    const t = ar.target;
    if (t.state === 'dead') { ar.done = true; return; }
    const tx = t.x, ty = t.y - 40;
    const d = Math.hypot(tx - ar.x, ty - ar.y);
    const step = 600 * dt;
    ar.ang = Math.atan2(ty - ar.y, tx - ar.x);
    if (d < step + 8) { ar.done = true; hitBear(t, CONFIG.helper.archer.damage, ar.from); return; }
    ar.x += (tx - ar.x) / d * step;
    ar.y += (ty - ar.y) / d * step;
  });
  G.arrows = G.arrows.filter(ar => !ar.done);
}

// ============================================================
//  演出（文字・粒・雪）
// ============================================================
function floatText(x, y, text, color, size = 22) {
  G.texts.push({ x, y, text, color, size, t: 0, life: 1.1 });
}
function sparks(x, y, n, colors) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(60, 220);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, t: rand(0.4, 0.8), life: 0.8, color: colors[i % colors.length], kind: 'spark' });
  }
}

function updateFx(dt) {
  G.fx.forEach(f => { f.t += dt; });
  G.fx = G.fx.filter(f => f.t < f.life);
  G.flyers.forEach(f => { f.t += dt; if (f.t >= f.dur && f.onDone) f.onDone(); });
  G.flyers = G.flyers.filter(f => f.t < f.dur);
  G.texts.forEach(t => { t.t += dt; t.y -= 40 * dt; });
  G.texts = G.texts.filter(t => t.t < t.life);
  G.parts.forEach(p => { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind === 'spark') p.vy += 400 * dt; });
  G.parts = G.parts.filter(p => p.t > 0);
  G.steps.forEach(s => { s.t -= dt; });
  G.steps = G.steps.filter(s => s.t > 0);
  G.coinFly.forEach(c => { c.t += dt; });
  if (G.coinFly.some(c => c.t >= 0.6)) bumpChip('money');   // 着いたらチップがぴょこっと
  G.coinFly = G.coinFly.filter(c => c.t < 0.6);
  // 所持金の数字は、少しずつ数え上がる
  if (G.moneyShown !== G.money) {
    G.moneyShown = G.moneyShown == null ? G.money : G.moneyShown + (G.money - G.moneyShown) * Math.min(1, dt * 7);
    if (Math.abs(G.money - G.moneyShown) < 0.6) G.moneyShown = G.money;
    $('money').textContent = fmt(Math.round(G.moneyShown));
  }
  G.snow.forEach(s => { s.y += s.v * dt / 800; s.x += Math.sin(G.time + s.v) * dt * 0.01; if (s.y > 1) { s.y = 0; s.x = Math.random(); } });
  G.shake = Math.max(0, G.shake - dt * 40);
  G.flash = Math.max(0, G.flash - dt);
  G.fenceHitT = Math.max(0, (G.fenceHitT || 0) - dt);
  G.guideT = (G.guideT || 0) - dt;
  if (G.pad) G.pad.pulse += dt;
}
G.coinFly = [];

// 画像エフェクト（斬撃・爆発・キラキラ）：少し大きくなりながら消える
function fxAt(name, x, y, size, rot = 0) {
  G.fx.push({ name, x, y, size, rot, t: 0, life: 0.35 });
}

// 狩り場の柵：木の杭とロープ。真ん中は門（通り道）
function drawFence(a) {
  const y = a.y + a.h + 20;
  if (G.barricade) { drawBarricade(a, y); drawFenceHp(); return; }
  const gate = [a.x + a.w / 2 - 60, a.x + a.w / 2 + 60];
  const posts = [];
  for (let x = a.x; x <= a.x + a.w; x += 46) if (x < gate[0] || x > gate[1]) posts.push(x);
  posts.push(gate[0], gate[1]);
  posts.sort((p, q) => p - q);
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 4;
  for (let i = 0; i < posts.length - 1; i++) {
    if (posts[i] === gate[0]) continue;   // 門のところはロープなし
    [-20, -8].forEach(dy => {
      ctx.beginPath();
      ctx.moveTo(posts[i], y + dy);
      ctx.quadraticCurveTo((posts[i] + posts[i + 1]) / 2, y + dy + 5, posts[i + 1], y + dy);
      ctx.stroke();
    });
  }
  posts.forEach(x => {
    const big = x === gate[0] || x === gate[1];
    ctx.fillStyle = 'rgba(40,70,110,.18)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a4a22';
    roundRect(x - (big ? 6 : 4), y - (big ? 44 : 30), big ? 12 : 8, big ? 46 : 32, 3); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(x, y - (big ? 44 : 30), big ? 8 : 6, 4, 0, 0, Math.PI * 2); ctx.fill();
  });
}

// バリケード：とがった丸太を並べた壁（白クマはここを越えられない）
function drawBarricade(a, y) {
  G.fencePop = Math.min(1, (G.fencePop == null ? 1 : G.fencePop) + 1 / 40);
  const k = G.fencePop;
  const gate = [a.x + a.w / 2 - 60, a.x + a.w / 2 + 60];
  const broken = G.battle && G.fenceHp <= 0;
  if (images.barricade) {
    const w = 70;   // 1枚の横幅（高さ58のとき）。少し重ねて隙間なく並べる
    for (let x = a.x - 10; x < a.x + a.w + 10; x += w - 12) {
      if (Math.abs(x + w / 2 - (gate[0] + gate[1]) / 2) < 40) continue;   // 門のところは空ける
      drawSprite(broken ? pick('barricade_broken', 'barricade') : 'barricade', x + w / 2, y + 8, 58 * k, { flash: G.fenceHitT > 0.12 });
    }
    drawSprite(pick('gate_open', 'barricade'), (gate[0] + gate[1]) / 2, y + 8, 64 * k);
    return;
  }
  for (let x = a.x; x <= a.x + a.w; x += 16) {
    if (x > gate[0] && x < gate[1]) continue;
    const hgt = (40 + (x * 7 % 11)) * k;
    ctx.fillStyle = 'rgba(40,70,110,.18)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = x % 32 ? '#8a5a2b' : '#7a4a22';
    ctx.beginPath();
    ctx.moveTo(x - 7, y); ctx.lineTo(x - 7, y - hgt); ctx.lineTo(x, y - hgt - 12); ctx.lineTo(x + 7, y - hgt); ctx.lineTo(x + 7, y);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(x, y - hgt + 2, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#5e3a1a'; ctx.lineWidth = 6;
  [[a.x, gate[0]], [gate[1], a.x + a.w]].forEach(([x0, x1]) => {
    ctx.beginPath(); ctx.moveTo(x0, y - 14 * k); ctx.lineTo(x1, y - 14 * k); ctx.stroke();
  });
  [gate[0], gate[1]].forEach(x => { ctx.fillStyle = '#6b4020'; roundRect(x - 7, y - 60 * k, 14, 60 * k, 4); ctx.fill(); });
}

// ============================================================
//  次にやること（ガイドの矢印）
// ============================================================
// ガイドの文の先頭の絵文字 → アイコン画像
const GUIDE_ICONS = { '🔨': 'barricade', '⚔️': 'giant_idle', '💰': 'coins_pile', '🙋': 'villager_happy', '🍖': 'meat_cooked', '🔥': 'grill_on', '🐻‍❄️': 'bear_walk' };

function currentGoal() {
  const P = G.player;
  const tutorial = G.unlockIdx < 2;
  const pad = G.pad;
  const left = pad ? pad.price - pad.paid : 0;
  if (pad && (G.money >= left || (!tutorial && G.money >= left * 0.5))) {
    return { x: pad.x, y: pad.y, text: `💰 ${pad.label} を解放しよう` };
  }
  const cash = G.counters.find(c => c.cash > 0);
  if (cash) return { x: cash.cashPos.x, y: cash.cashPos.y, text: '💰 お金を拾おう' };
  if (G.volunteer && dist(G.volunteer, CONFIG.volunteer.spot) < 20) return { x: G.volunteer.x, y: G.volunteer.y, text: '🙋 村人が手伝いたいみたい！ 話しかけよう' };
  if (P.stack.includes('cooked')) {
    const c = G.counters.slice().sort((p, q) => (p.stock >= stat('counterCap')) - (q.stock >= stat('counterCap')) || dist(P, p.servePad) - dist(P, q.servePad))[0];
    return { x: c.servePad.x, y: c.servePad.y, text: '🍖 凍えた人に肉を配ろう' };
  }
  // 背中がいっぱい・肉が落ちていない・もうグリルの近くにいる → 置きに行く（置き終わるまで）
  const grill = G.grills.slice().sort((a, b) => dist(P, a.inPad) - dist(P, b.inPad))[0];
  if (P.stack.includes('raw') && (P.stack.length >= P.cap || !G.drops.length || dist(P, grill.inPad) < 110)) {
    return { x: grill.inPad.x, y: grill.inPad.y, text: '🔥 グリルに肉を置こう' };
  }
  const g = G.grills.find(x => x.cooked > 0);
  if (g && !P.stack.length) return { x: g.outPad.x, y: g.outPad.y, text: '🍖 焼けた肉を取ろう' };
  if (G.barricade && G.fenceMax && G.fenceHp < G.fenceMax * 0.5 && G.money > 5) {
    const r = repairSpot();
    return { x: r.x, y: r.y, text: '🔨 バリケードを修理しよう' };
  }
  const gi = G.battle && G.battle.giant;
  if (gi && gi.state !== 'dead' && !P.stack.length) return { x: gi.x, y: gi.y, h: 230, text: `⚔️ ${G.v.giant.name}をたおそう` };
  const b = G.bears.filter(x => x.state !== 'dead').sort((a, c) => dist(P, a) - dist(P, c))[0];
  if (b) return { x: b.x, y: b.y, h: b.boss ? 140 : 84, text: '🐻‍❄️ 白クマを倒して肉を集めよう' };
  return null;
}

// ============================================================
//  更新
// ============================================================
function update(dt) {
  if (G.paused) return;
  G.time += dt;
  updateTimers(dt);
  animateTerritory(dt);
  updatePlayer(dt);
  updateBears(dt);
  if (G.battle) { updateBattle(dt); battleHud(); }
  else if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
  updateRepair(dt);
  updateDrops(dt);
  updateGrills(dt);
  updateCustomers(dt);
  updateHelpers(dt);
  updateVolunteer();
  updateFx(dt);
  // カメラ：プレイヤーを追う
  const cam = G.cam;
  // 歩いている方向を少し先まで映す（ルックアヘッド）
  const look = G.touch && G.touch.moved ? 0 : 1;
  G.lookX = (G.lookX || 0) + (G.player.vx * 0.35 * look - (G.lookX || 0)) * Math.min(1, dt * 2.5);
  G.lookY = (G.lookY || 0) + (G.player.vy * 0.45 * look - (G.lookY || 0)) * Math.min(1, dt * 2.5);
  const tx = clamp(G.player.x + G.lookX - G.viewW / 2, 0, CONFIG.world.w - G.viewW);
  const ty = clamp(G.player.y + G.lookY - G.viewH * 0.55, 0, Math.max(0, CONFIG.world.h - G.viewH));
  cam.x += (tx - cam.x) * Math.min(1, dt * 6);
  cam.y += (ty - cam.y) * Math.min(1, dt * 6);
  const goal = currentGoal();
  const guide = $('guide');
  const text = goal ? goal.text : '';
  if (guide.dataset.text !== text) {
    guide.dataset.text = text;
    // 同じ指示はしばらく出さない（慣れた作業の指示がずっと出ていると邪魔なので）。最初の解放までは毎回出す
    G.guideSeen = G.guideSeen || {};
    const last = G.guideSeen[text];
    if (G.unlockIdx < 1 || last == null || G.time - last > 60) { G.guideT = 3.5; G.guideSeen[text] = G.time; }
    const m = text.match(/^(\S+)\s+(.*)$/);
    const icon = m && GUIDE_ICONS[m[1]];
    guide.innerHTML = icon ? `<span class="g-ico"><img src="${IMG(icon)}" alt=""></span><span class="g-txt">${m[2]}</span>` : `<span class="g-txt">${text}</span>`;
    guide.classList.remove('pop');
    void guide.offsetWidth;
    guide.classList.add('pop');
  }
  guide.classList.toggle('hidden', !goal || !(G.guideT > 0));
  G.goal = goal;
}

function bumpChip(id) {
  const chip = $(id).closest('.chip');
  chip.classList.remove('bump');
  void chip.offsetWidth;
  chip.classList.add('bump');
}

function updateHud() {
  const bump = (id, v) => {
    const el = $(id);
    if (el.dataset.v !== undefined && +el.dataset.v < v) {
      const chip = el.closest('.chip');
      chip.classList.remove('bump');
      void chip.offsetWidth;
      chip.classList.add('bump');
    }
    el.dataset.v = v;
    el.textContent = fmt(v);
  };
  // 使ったときはすぐ減らす（増えるときは数え上げ）
  if (G.moneyShown == null || G.money < G.moneyShown) { G.moneyShown = G.money; $('money').textContent = fmt(G.money); }
  $('up-btn').classList.toggle('ready', canAffordAnyUpgrade());
  bump('rescued', G.rescued);
  if (G.battle) battleHud();
  else if (G.v) {
    $('goal-num').textContent = `${Math.min(G.rescued, G.v.goal)} / ${G.v.goal}`;
    $('goal-bar').style.width = Math.min(100, G.rescued / G.v.goal * 100) + '%';
    $('goal').classList.toggle('done', !!(G.vs && G.vs.done));
  }
}

// ============================================================
//  描画
// ============================================================
function render() {
  const { cam } = G;
  const s = cam.scale * G.dpr;
  const shx = G.shake ? rand(-G.shake, G.shake) : 0, shy = G.shake ? rand(-G.shake, G.shake) : 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#eaf4fb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(s, 0, 0, s, (-cam.x + shx) * s, (-cam.y + shy) * s);

  drawGround();
  drawDecals();

  // 奥（y が小さい）から順に描く
  const list = [];
  CONFIG.decor.forEach(([name, x, y, h]) => list.push({ y, draw: () => { shadow(x, y, h * 0.3); drawSprite(name, x, y, h); } }));
  if (G.fire) list.push({ y: G.firePos.y, draw: drawFire });
  G.grills.forEach(g => list.push({ y: g.y, draw: () => drawGrill(g) }));
  G.counters.forEach(c => list.push({ y: c.y, draw: () => drawCounter(c) }));
  G.customers.forEach(cu => list.push({ y: cu.y, draw: () => drawCustomer(cu) }));
  G.bears.forEach(b => list.push({ y: b.y, draw: () => drawBear(b) }));
  G.helpers.forEach(h => list.push({ y: h.y, draw: () => drawHelper(h) }));
  if (G.tower && !G.helpers.some(h => h.type === 'archer')) list.push({ y: G.tower.y, draw: () => drawTower(null) });
  G.drops.forEach(m => list.push({ y: m.y, draw: () => drawDrop(m) }));
  list.push({ y: G.player.y, draw: drawPlayer });
  list.sort((a, b) => a.y - b.y).forEach(o => o.draw());

  // 飛んでいるアイテム
  G.flyers.forEach(f => {
    const k = Math.min(1, f.t / f.dur);
    const x = f.fx + (f.tx - f.fx) * k;
    const y = f.fy + (f.ty - f.fy) * k - Math.sin(k * Math.PI) * 50;
    drawSprite(f.name, x, y + f.h / 2, f.h);
  });
  drawRocks();
  // 弓使いの矢
  G.arrows.forEach(ar => {
    ctx.save();
    ctx.translate(ar.x, ar.y);
    ctx.rotate(ar.ang);
    ctx.strokeStyle = '#6b4423'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(8, 0); ctx.stroke();
    ctx.fillStyle = '#e8eef5';
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(6, -4.5); ctx.lineTo(6, 4.5); ctx.fill();
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(-19, -3, 6, 6);
    ctx.restore();
  });
  // 画像エフェクト
  G.fx.forEach(f => {
    const im = images[f.name];
    if (!im) return;
    const k = f.t / f.life;
    ctx.save();
    ctx.globalAlpha = 1 - k * k;
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    const sz = f.size * (0.6 + k * 0.6);
    ctx.drawImage(im, -sz / 2, -sz / 2, sz, sz);
    ctx.restore();
  });
  // 粒
  G.parts.forEach(p => {
    const a = clamp(p.t / p.life, 0, 1);
    if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(120,120,130,${a * 0.35})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 10 + (1 - a) * 14, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  });
  // 文字
  G.texts.forEach(t => {
    const a = 1 - t.t / t.life;
    const sc = t.t < 0.12 ? 0.6 + t.t / 0.12 * 0.5 : 1.1 - Math.min(0.1, (t.t - 0.12));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(t.x, t.y);
    ctx.scale(sc, sc);
    ctx.font = `900 ${t.size}px "Hiragino Sans","Yu Gothic UI",sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(20,40,80,.8)';
    ctx.strokeText(t.text, 0, 0);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
  });
  drawMoveTarget();
  drawGoalArrow();

  // 画面に固定するもの（雪・ジョイスティック・お金の飛ぶ演出）
  ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  const W = canvas.width / G.dpr, H = canvas.height / G.dpr;
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  G.snow.forEach(f => { ctx.beginPath(); ctx.arc(f.x * W, f.y * H, f.s, 0, Math.PI * 2); ctx.fill(); });
  if (G.flash > 0) {   // 攻撃を受けたときの赤いフラッシュ
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(255,0,0,${G.flash * 1.4})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // 体力が少ないときは画面のふちが赤く脈打つ
  const P = G.player;
  if (P.maxHp && P.hp / P.maxHp < 0.3 && !P.downT) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(255,0,0,${0.18 + Math.sin(G.time * 6) * 0.1})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  drawBanner(W, H);
  drawJoystick();
  drawCoinFly(W);
}

function drawGround() {
  const W = CONFIG.world.w, H = CONFIG.world.h;
  if (images.ground) {
    if (!groundPattern) groundPattern = ctx.createPattern(images.ground, 'repeat');
    ctx.save();
    ctx.fillStyle = groundPattern;
    const k = 420 / images.ground.width;   // 地面タイル1枚をワールド420単位で敷く
    ctx.scale(k, k);
    ctx.fillRect(0, 0, W / k, H / k);
    ctx.restore();
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#dbeefa');
    g.addColorStop(1, '#f4f9fd');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // 狩り場（少し青い氷原）と柵
  const a = G.hunt;
  ctx.fillStyle = 'rgba(120,170,220,.12)';
  roundRect(a.x, a.y, a.w, a.h, 40);
  ctx.fill();
  if (G.v.tint) { ctx.fillStyle = G.v.tint; ctx.fillRect(0, 0, W, H); }
  drawTerritory();
  drawFence(a);
  // キャンプ側は少しあたたかい色（踏み固められた雪）
  const cg = ctx.createLinearGradient(0, a.y + a.h + 60, 0, H);
  cg.addColorStop(0, 'rgba(255,225,190,0)');
  cg.addColorStop(0.25, 'rgba(255,225,190,.22)');
  cg.addColorStop(1, 'rgba(255,215,170,.3)');
  ctx.fillStyle = cg;
  ctx.fillRect(0, a.y + a.h + 60, W, H);
  // 足あと
  G.steps.forEach(s => {
    ctx.fillStyle = `rgba(150,180,210,${Math.min(0.35, s.t / 3)})`;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  });
  // 配給台に並ぶ道
  G.counters.forEach(c => {
    ctx.fillStyle = 'rgba(160,190,215,.25)';
    roundRect(c.x - 32, c.y + 40, 64, H - c.y, 20);
    ctx.fill();
  });
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 地面の丸いエリア（置く場所・取る場所・お金・解放パッド）
function ring(x, y, r, color, icon, label) {
  ctx.save();
  ctx.fillStyle = color.replace('A', '.28');
  ctx.strokeStyle = color.replace('A', '1');
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.8)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, r - 5, r * 0.55 - 4, 0, 0, Math.PI * 2); ctx.stroke();
  if (icon) drawSprite(icon, x, y + 6, 28, { alpha: 0.9 });
  if (label) {
    ctx.font = '900 13px "Hiragino Sans","Yu Gothic UI",sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(label).width + 14;
    const ly = y + r * 0.55 + 6;
    ctx.fillStyle = color.replace('A', '1');
    roundRect(x - w / 2, ly, w, 19, 9.5); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, ly + 14);
  }
  ctx.restore();
}

function drawDecals() {
  G.grills.forEach(g => {
    ring(g.inPad.x, g.inPad.y, 36, 'rgba(232,88,74,A)', null, '生肉を置く');
    ring(g.outPad.x, g.outPad.y, 36, 'rgba(255,154,59,A)', null, '焼けた肉');
  });
  G.counters.forEach(c => {
    ring(c.servePad.x, c.servePad.y, 38, 'rgba(60,170,95,A)', null, '配る');
    if (c.cash > 0) ring(c.cashPos.x, c.cashPos.y, 32, 'rgba(240,190,30,A)');
  });
  const pad = G.pad;
  if (pad) {
    const left = pad.price - pad.paid;
    const can = G.money >= left;
    const pulse = 1 + Math.sin(pad.pulse * 5) * (can ? 0.08 : 0.03);
    ctx.save();
    ctx.translate(pad.x, pad.y);
    ctx.scale(pulse, pulse);
    if (can) { ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 18; }
    // 台座（下の厚み → 上の面）
    ctx.fillStyle = '#b9791f';
    ctx.beginPath(); ctx.ellipse(0, 5, 56, 32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    const gr = ctx.createLinearGradient(0, -32, 0, 32);
    gr.addColorStop(0, can ? '#ffe680' : '#e8eef5');
    gr.addColorStop(1, can ? '#ff9a3b' : '#aab8c8');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(0, 0, 56, 32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.stroke();
    // 払った分だけ、ふちが金色に
    ctx.strokeStyle = '#2fbf5a';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.ellipse(0, 0, 56, 32, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pad.paid / pad.price)); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    // 名前の札
    ctx.font = '900 16px "Hiragino Sans","Yu Gothic UI",sans-serif';
    const w = ctx.measureText(pad.label).width + 22;
    ctx.fillStyle = 'rgba(29,58,95,.92)';
    roundRect(pad.x - w / 2, pad.y - 70, w, 26, 13); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    roundRect(pad.x - w / 2, pad.y - 70, w, 26, 13); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(pad.label, pad.x, pad.y - 51);
    // 値段（足りないときは赤）
    drawSprite('coin', pad.x - 30, pad.y + 14, 28);
    ctx.font = '900 24px "Hiragino Sans","Yu Gothic UI",sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(90,50,0,.85)';
    ctx.strokeText(fmt(left), pad.x + 10, pad.y + 9);
    ctx.fillStyle = can ? '#fff' : '#ffb3b3';
    ctx.fillText(fmt(left), pad.x + 10, pad.y + 9);
    ctx.restore();
  }
}

function popScale(o) {
  const k = o.pop == null ? 1 : o.pop;
  return k >= 1 ? 1 : 1 + Math.sin(k * Math.PI) * 0.3 - (1 - k) * 0.6;
}

function drawGrill(g) {
  const sc = popScale(g);
  shadow(g.x, g.y, 46);
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.scale(sc, sc);
  drawSprite(g.raw > 0 ? 'grill_on' : 'grill_off', 0, 0, 92);
  ctx.restore();
  // 置いてある生肉・焼けた肉の山（生肉はまな板、焼けた肉は大皿の上）
  drawBoard(g.inPad.x, g.inPad.y);
  drawPlatter(g.outPad.x, g.outPad.y);
  pileAt('meat_raw', g.inPad.x, g.inPad.y, g.raw);
  pileAt('meat_cooked', g.outPad.x, g.outPad.y, g.cooked);
  if (g.raw > 0) {
    // 焼き具合のゲージ
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    roundRect(g.x - 30, g.y - 104, 60, 8, 4); ctx.fill();
    ctx.fillStyle = '#ff9a3b';
    roundRect(g.x - 30, g.y - 104, 60 * (g.t / stat('cook')), 8, 4); ctx.fill();
  }
}

// 生肉を置く木のまな板（丸太の脚つき）
function drawBoard(x, y) {
  ctx.save();
  ctx.fillStyle = 'rgba(40,70,110,.22)';
  ctx.beginPath(); ctx.ellipse(x, y + 12, 36, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6b4020';
  [-22, 22].forEach(dx => { roundRect(x + dx - 5, y - 2, 10, 14, 3); ctx.fill(); });
  ctx.fillStyle = '#8a5a2b';
  roundRect(x - 34, y - 8, 68, 12, 5); ctx.fill();
  ctx.fillStyle = '#c48a52';
  roundRect(x - 34, y - 14, 68, 10, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(110,60,20,.35)'; ctx.lineWidth = 1;
  [-12, 10].forEach(dx => { ctx.beginPath(); ctx.moveTo(x + dx, y - 13); ctx.lineTo(x + dx + 4, y - 5); ctx.stroke(); });
  ctx.fillStyle = '#fff';
  roundRect(x - 30, y - 16, 16, 4, 2); ctx.fill();
  ctx.restore();
}

// 焼けた肉をのせる大皿（銅のトレー）
function drawPlatter(x, y) {
  ctx.save();
  ctx.fillStyle = 'rgba(40,70,110,.22)';
  ctx.beginPath(); ctx.ellipse(x, y + 8, 38, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9c5a2a';
  ctx.beginPath(); ctx.ellipse(x, y - 2, 36, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e0a15e';
  ctx.beginPath(); ctx.ellipse(x, y - 5, 33, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f3c27f';
  ctx.beginPath(); ctx.ellipse(x, y - 5, 25, 7.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath(); ctx.ellipse(x - 14, y - 9, 8, 2.5, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function pileAt(name, x, y, n) {
  if (!n) return;
  const shown = Math.min(n, 12);
  for (let i = 0; i < shown; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    drawSprite(name, x - 14 + col * 14, y - 6 - row * 9, 24);
  }
  if (n > 1) {
    ctx.font = '900 14px "Hiragino Sans",sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20,40,80,.85)';
    ctx.strokeText(n, x, y - Math.ceil(shown / 3) * 9 - 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(n, x, y - Math.ceil(shown / 3) * 9 - 22);
  }
}

function drawCounter(c) {
  const sc = popScale(c);
  shadow(c.x, c.y, 50);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(sc, sc);
  drawSprite('counter', 0, 0, 70);
  ctx.restore();
  pileAt('meat_cooked', c.x, c.y - 44, c.stock);
  if (c.cash > 0) {
    shadow(c.cashPos.x, c.cashPos.y, 22);
    drawSprite('coins_pile', c.cashPos.x, c.cashPos.y, clamp(20 + c.cash / 4, 24, 60));
  }
}

function drawCustomer(cu) {
  const cold = cu.state === 'queue';
  const jx = cold ? Math.sin(G.time * 40 + cu.x) * 1.2 : 0;
  const bob = Math.abs(Math.sin(cu.walk)) * 3;
  shadow(cu.x, cu.y, 18);
  drawSprite(cu.kind, cu.x + jx, cu.y - bob, cu.kind === 'villager_child' ? 56 : 70, { flip: cu.face < 0 });
  if (cu.state === 'leave' && cu.happy && !cu.kind.endsWith('_happy')) {
    ctx.font = '18px serif';
    ctx.textAlign = 'center';
    ctx.fillText('❤️', cu.x, cu.y - 78 - Math.abs(Math.sin(G.time * 5)) * 6);
  }
  if (cu.state === 'volunteer') {
    const k = Math.abs(Math.sin(G.time * 4)) * 6;
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = 'rgba(120,60,0,.8)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cu.x, cu.y - 96 - k, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = '900 20px "Hiragino Sans",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7a3c00';
    ctx.fillText('！', cu.x, cu.y - 89 - k);
    return;
  }
  // 吹き出し：あと何個ほしいか
  // 顔が隠れないように、吹き出しは村人の横に出す（列の先頭4人まで）
  if (cold && cu.slot && dist(cu, cu.slot) < 30 && cu.counter.queue.indexOf(cu) < 4) {
    const left = cu.want - cu.got;
    const side = cu.x > CONFIG.world.w - 90 ? -1 : 1;   // 右端の列は左側に出す
    const bx = cu.x + side * 56, by = cu.y - 34;
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    roundRect(bx - 26, by - 22, 52, 28, 12); ctx.fill();
    const ex = bx - side * 26;
    ctx.beginPath(); ctx.moveTo(ex, by - 14); ctx.lineTo(ex - side * 9, by - 8); ctx.lineTo(ex, by - 2); ctx.fill();
    drawSprite('meat_cooked', bx - 10, by + 3, 22);
    ctx.font = '900 14px "Hiragino Sans",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c0392b';
    ctx.fillText('×' + left, bx + 2, by - 2);
  }
}

function drawBear(b) {
  if (b.giant) { drawGiant(b); return; }
  const h = b.boss ? 140 : 84;
  const k = b.pop;
  const C = CONFIG.combat;
  // 攻撃の「ため」：足元の赤い円がだんだん埋まる（この中にいると攻撃を受ける）
  if (b.state === 'windup') {
    const reach = b.boss ? C.boss.reach : C.reach;
    const p = 1 - b.wt / b.wtMax;
    ctx.save();
    ctx.fillStyle = 'rgba(255,40,40,.14)';
    ctx.strokeStyle = 'rgba(255,40,40,.85)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(b.x, b.y, reach, reach * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,40,40,.35)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y, reach * p, reach * 0.55 * p, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  shadow(b.x, b.y, h * 0.42);
  if (b.state === 'dead') {
    drawSprite('bear_down', b.x, b.y, h * 0.75, { alpha: clamp(b.deadT / 0.7, 0, 1), flip: b.face < 0 });
    return;
  }
  const step = Math.sin(b.walk) > 0;
  let name;
  if (b.boss) name = b.state === 'windup' ? pick('bear_roar', 'bear_boss') : 'bear_boss';
  else if (b.hitT > 0) name = pick('bear_hurt', 'bear_walk');
  else if (b.state === 'windup') name = pick('bear_claw_up', 'bear_stand');
  else if (b.state === 'strike') name = pick('bear_claw', 'bear_stand');
  else if (b.state === 'chase') name = step ? pick('bear_run', 'bear_walk') : pick('bear_walk2', 'bear_walk');
  else name = step ? 'bear_walk' : pick('bear_walk2', 'bear_walk');
  if (b.boss && name !== 'bear_boss') name = 'bear_boss';   // ボスは専用の絵のまま
  const bob = b.state === 'wander' || b.state === 'chase' ? Math.abs(Math.sin(b.walk)) * 3 : 0;
  const big = b.state === 'windup' ? 1.08 + Math.sin(G.time * 30) * 0.02 : b.state === 'strike' ? 1.12 : 1;
  const lunge = b.state === 'strike' ? b.face * 10 : 0;
  drawSprite(name, b.x + lunge, b.y - bob, h * big * (0.4 + 0.6 * k), { flip: b.face < 0, flash: b.hitT > 0.08, tint: b.state === 'windup' && Math.sin(G.time * 24) > 0 ? 'rgba(255,60,60,.35)' : null });
  if (b.hp < b.maxHp) {
    const w = b.boss ? 90 : 56;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    roundRect(b.x - w / 2, b.y - h - 16, w, 8, 4); ctx.fill();
    ctx.fillStyle = b.boss ? '#ff4d4d' : '#ff7a7a';
    roundRect(b.x - w / 2, b.y - h - 16, w * (b.hp / b.maxHp), 8, 4); ctx.fill();
  }
}

// 体力ゲージ（減っているときだけ出す）
function hpBar(o, y, w = 50) {
  if (!o.maxHp) return;
  const r = Math.max(0, o.hp / o.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  roundRect(o.x - w / 2 - 1, y - 1, w + 2, 9, 4.5); ctx.fill();
  ctx.fillStyle = r > 0.5 ? '#4fd46a' : r > 0.25 ? '#ffb020' : '#ff4040';
  roundRect(o.x - w / 2, y, w * r, 7, 3.5); ctx.fill();
}

// 倒れているときに頭の上を回る星
function dizzy(x, y) {
  ctx.font = '14px serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23f';
  for (let i = 0; i < 3; i++) {
    const a = G.time * 4 + i * 2.1;
    ctx.fillText('★', x + Math.cos(a) * 16, y + Math.sin(a) * 5);
  }
}

function drawDrop(m) {
  shadow(m.x, m.y, 10);
  // 消える前の3秒は点滅しながら薄くなる
  const left = CONFIG.dropLife - (m.age || 0);
  const alpha = left < 3 ? (0.35 + 0.65 * (left / 3)) * (Math.sin(G.time * 16) > 0 ? 1 : 0.6) : 1;
  drawSprite('meat_raw', m.x, m.y - m.z, 28, { rot: m.state === 'pop' ? G.time * 12 : 0, alpha });
}

function drawStack(o, baseY) {
  // 背中に積んだ肉。動くと少し揺れる
  const sway = clamp((o.vx || 0) * -0.004, -0.5, 0.5);
  o.stack.forEach((kind, i) => {
    drawSprite(kind === 'raw' ? 'meat_raw' : 'meat_cooked', o.x - (o.face || 1) * 12 + sway * i * 4, baseY - i * 10, 26);
  });
}

function drawPlayer() {
  const P = G.player;
  if (P.downT > 0) {
    shadow(P.x, P.y, 26);
    drawSprite(pick('hero_hurt', 'hero_idle'), P.x, P.y, 70, { rot: Math.PI / 2 * 0.9, alpha: 0.9 });
    dizzy(P.x, P.y - 40);
    return;
  }
  const moving = Math.hypot(P.vx, P.vy) > 10;
  const bob = moving ? Math.abs(Math.sin(P.walk)) * 4 : Math.sin(G.time * 3) * 1;
  shadow(P.x, P.y, 22);
  let name = P.attackT > 0 ? 'hero_attack' : (moving ? 'hero_walk' : 'hero_idle');
  if (P.hurtT > 0) name = pick('hero_hurt', name);
  drawStack(P, P.y - 48 - bob);
  const blink = P.invT > 0 && Math.sin(G.time * 30) > 0 ? 0.4 : 1;
  drawSprite(name, P.x, P.y - bob, 82, { flip: P.face < 0 && name !== 'hero_idle', flash: P.hurtT > 0.15, alpha: blink });
  hpBar(P, P.y - 100, 56);
  if (P.stack.length >= P.cap) {
    ctx.font = '900 13px "Hiragino Sans",sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(120,0,0,.8)';
    const ty = P.y - 60 - P.stack.length * 10;
    ctx.strokeText('MAX', P.x, ty);
    ctx.fillStyle = '#ffdf5b';
    ctx.fillText('MAX', P.x, ty);
  }
}

// 志願した村人の見た目（あれば役割ごとの専用の絵、無ければ村人の絵に持ち物を重ねる）
function helperLook(h) {
  const k = h.kind;
  if (h.type === 'sword') return { name: pick(k + '_axe', k), tool: images[k + '_axe'] ? null : 'axe' };
  if (h.type === 'archer') return { name: pick(k + '_bow', k), tool: images[k + '_bow'] ? null : 'bow' };
  return { name: k, tool: null };
}
const helperH = h => /child|girl/.test(h.kind || '') ? 56 : 66;

// 手に持った斧・弓（村人の絵に重ねる）
function drawTool(h, tool, x, y) {
  const f = h.face < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(x + f * 16, y - helperH(h) * 0.42);
  ctx.scale(f, 1);
  if (tool === 'axe') {
    const swing = h.attackT > 0 ? 1.6 - (h.attackT / 0.2) * 2.4 : -0.5;
    ctx.rotate(swing);
    const im = images.axe_wood;
    if (im) ctx.drawImage(im, -8, -40, 36, 36 * im.height / im.width);
  } else if (tool === 'bow') {
    ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(-4, 0, 16, -1.2, 1.2); ctx.stroke();
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 1.2;
    const pull = h.attackT > 0 ? 0 : 6;
    ctx.beginPath(); ctx.moveTo(Math.cos(-1.2) * 16 - 4, Math.sin(-1.2) * 16); ctx.lineTo(-pull, 0); ctx.lineTo(Math.cos(1.2) * 16 - 4, Math.sin(1.2) * 16); ctx.stroke();
  }
  ctx.restore();
}

// 頭の上の吹き出し
function drawSay(o, y) {
  if (!o.say) return;
  ctx.font = '900 13px "Hiragino Sans",sans-serif';
  const w = ctx.measureText(o.say.text).width + 18;
  const a = Math.min(1, o.say.t * 3);
  const cx = clamp(o.x, w / 2 + 4, CONFIG.world.w - w / 2 - 4);   // 画面の端からはみ出さない
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(255,255,255,.96)';
  roundRect(cx - w / 2, y - 26, w, 26, 12); ctx.fill();
  ctx.beginPath(); ctx.moveTo(o.x - 6, y); ctx.lineTo(o.x, y + 8); ctx.lineTo(o.x + 6, y); ctx.fill();
  ctx.fillStyle = '#1d3a5f';
  ctx.textAlign = 'center';
  ctx.fillText(o.say.text, cx, y - 8);
  ctx.restore();
}

function drawHelper(h) {
  const down = h.downT > 0;
  if (down && h.resting) return;   // テントの中で休んでいる
  const bob = h.type === 'archer' ? 0 : Math.abs(Math.sin(h.walk)) * (down ? 1.5 : 3);
  if (h.type === 'archer') { if (G.tower) drawTower(h); return; }
  shadow(h.x, h.y, 18);
  if (h.kind) {
    const look = helperLook(h);
    const hh = helperH(h);
    ctx.save();
    ctx.translate(h.x, h.y);
    const sc = popScale(h);
    ctx.scale(sc, sc);
    ctx.translate(-h.x, -h.y);
    drawStack(h, h.y - hh * 0.62 - bob);
    drawSprite(look.name, h.x, h.y - bob, hh, { flip: h.face < 0, squash: h.attackT > 0 ? 0.06 : 0, flash: h.hurtT > 0.15, alpha: down ? 0.8 : 1 });
    if (look.tool && !down) drawTool(h, look.tool, h.x, h.y - bob);
    ctx.restore();
    if (down) { ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.fillText('💦', h.x + 20, h.y - hh + 4); }
    if (h.maxHp) hpBar(h, h.y - hh - 12, 40);
    drawSay(h, h.y - hh - (h.maxHp ? 18 : 8));
    return;
  }
  let name, downImg = false;
  if (h.type === 'sword') {
    // モブの斧の助っ人：3色の色違い（攻撃・ダウンの絵は共通）
    const base = pick(['mob_axe', 'mob_axe_g', 'mob_axe_r'][h.n % 3], 'mob_axe', 'swordsman', 'helper_hunter');
    if (down) { name = pick('mob_axe_down', 'swordsman_down', 'helper_hunter'); downImg = name.endsWith('_down'); }
    else if (h.attackT > 0 && h.n % 3 === 0) name = pick('mob_axe_attack', 'swordsman_attack', base);
    else name = base;
  } else name = 'helper_cook';
  ctx.save();
  ctx.translate(h.x, h.y);
  const sc = popScale(h);
  ctx.scale(sc, sc);
  ctx.translate(-h.x, -h.y);
  drawStack(h, h.y - 44 - bob);
  drawSprite(name, h.x, h.y - bob, h.type === 'sword' ? 64 : 72, {
    flip: h.face < 0, squash: h.attackT > 0 ? 0.08 : 0, flash: h.hurtT > 0.15,
    rot: down && !downImg ? Math.PI / 2 * 0.9 : 0, alpha: down ? 0.85 : 1,
  });
  ctx.restore();
  if (h.maxHp) hpBar(h, h.y - 80, 40);
  drawSay(h, h.y - 88);
}

// 見張り台と、その上の弓使い
// h が null なら、まだ誰も上っていない見張り台だけを描く
function drawTower(h) {
  const T = G.tower;
  T.pop = Math.min(1, (T.pop == null ? 1 : T.pop) + 1 / 40);
  const x = T.x, y = T.y, sc = popScale(T);
  ctx.save();
  ctx.translate(x, y); ctx.scale(sc, sc); ctx.translate(-x, -y);
  const top = 118;   // 足場の高さ
  if (images.watchtower) {
    shadow(x, y, 50);
    drawSprite('watchtower', x, y + 6, 175);
  } else {
    shadow(x, y, 46);
    ctx.fillStyle = '#7a4a22';
    [-30, 30].forEach(dx => { roundRect(x + dx - 5, y - top, 10, top, 3); ctx.fill(); });
    ctx.strokeStyle = '#6b4020'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x - 30, y - 20); ctx.lineTo(x + 30, y - top + 20); ctx.moveTo(x + 30, y - 20); ctx.lineTo(x - 30, y - top + 20); ctx.stroke();
    ctx.fillStyle = '#9b6a3a';
    roundRect(x - 44, y - top - 8, 88, 16, 4); ctx.fill();
    ctx.fillStyle = '#fff';
    roundRect(x - 44, y - top - 11, 88, 6, 3); ctx.fill();
  }
  const bob = Math.sin(G.time * 2);
  if (h && h.kind) {
    const look = helperLook(h);
    drawSprite(look.name, x, y - top + 4 + bob, helperH(h) * 0.92, { flip: h.face < 0 });
    if (look.tool) drawTool(h, look.tool, x, y - top + 4 + bob);
  } else if (h) drawSprite(pick('archer_aim', 'helper_hunter'), x, y - top + 4 + bob, 62, { flip: h.face < 0, squash: h.attackT > 0 ? 0.06 : 0 });
  ctx.restore();
  if (h) drawSay(h, y - top - 70);
}

function drawFire() {
  const f = G.firePos;
  shadow(f.x, f.y, 40);
  const flick = 1 + Math.sin(G.time * 14) * 0.04;
  drawSprite('campfire', f.x, f.y, 80 * flick);
  ctx.fillStyle = 'rgba(255,170,60,.12)';
  ctx.beginPath(); ctx.ellipse(f.x, f.y - 20, 110, 70, 0, 0, Math.PI * 2); ctx.fill();
}

// タップした目的地のマーカー（輪が縮みながら点滅）
function drawMoveTarget() {
  const m = G.moveTo;
  if (!m) return;
  m.t += 1 / 60;
  const k = (G.time * 2) % 1;
  ctx.save();
  ctx.strokeStyle = `rgba(90,169,230,${0.9 - k * 0.6})`;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(m.x, m.y, 26 - k * 12, (26 - k * 12) * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(90,169,230,.25)';
  ctx.beginPath(); ctx.ellipse(m.x, m.y, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 次の目的地を指す矢印（画面外なら画面の端に）
function drawGoalArrow() {
  const g = G.goal;
  if (!g) return;
  const cam = G.cam;
  const inView = g.x > cam.x + 20 && g.x < cam.x + G.viewW - 20 && g.y > cam.y + 90 && g.y < cam.y + G.viewH - 20;
  const bounce = Math.sin(G.time * 6) * 8;
  if (inView) {
    // 足元の光る円（広がって消える波紋）
    const k = (G.time * 1.2) % 1;
    ctx.save();
    ctx.strokeStyle = `rgba(255,210,63,${1 - k})`;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(g.x, g.y, 30 + k * 30, (30 + k * 30) * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  if (inView) {
    ctx.translate(g.x, g.y - (g.h || 40) - 34 + bounce);
    ctx.scale(1.3, 1.3);
  } else {
    const cx = clamp(g.x, cam.x + 30, cam.x + G.viewW - 30);
    const cy = clamp(g.y, cam.y + 110, cam.y + G.viewH - 40);
    const ang = Math.atan2(g.y - cy, g.x - cx);
    ctx.translate(cx, cy);
    ctx.rotate(ang - Math.PI / 2);
  }
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#8a5a00';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 18); ctx.lineTo(-16, -2); ctx.lineTo(-7, -2); ctx.lineTo(-7, -20); ctx.lineTo(7, -20); ctx.lineTo(7, -2); ctx.lineTo(16, -2);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawJoystick() {
  const j = G.joy;
  if (!j) return;
  const r = canvas.getBoundingClientRect();
  const sx = j.sx - r.left, sy = j.sy - r.top;
  let dx = j.x - j.sx, dy = j.y - j.sy;
  const len = Math.hypot(dx, dy);
  if (len > 45) { dx = dx / len * 45; dy = dy / len * 45; }
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.strokeStyle = 'rgba(255,255,255,.7)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(sx, sy, 50, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.arc(sx + dx, sy + dy, 22, 0, Math.PI * 2); ctx.fill();
}

// お金を拾ったとき、コインが画面左上の所持金へ飛んでいく
function drawCoinFly(W) {
  const cam = G.cam;
  // 飛んでいく先は、画面上の所持金のコイン
  if (!G.coinTarget || G.time - (G.coinTargetT || 0) > 1) {
    const r = canvas.getBoundingClientRect(), e = document.querySelector('.chip.money img').getBoundingClientRect();
    G.coinTarget = { x: e.left - r.left + e.width / 2, y: e.top - r.top + e.height / 2 };
    G.coinTargetT = G.time;
  }
  const target = G.coinTarget;
  G.coinFly.forEach(c => {
    const k = Math.min(1, c.t / 0.6);
    const sx = (c.x - cam.x) * cam.scale, sy = (c.y - cam.y) * cam.scale;
    const x = sx + (target.x - sx) * k * k, y = sy + (target.y - sy) * k * k - Math.sin(k * Math.PI) * 60;
    const im = images.coin;
    const sz = 26 * (1.2 - 0.4 * k);
    if (im) ctx.drawImage(im, x - sz / 2, y - sz / 2, sz, sz);
    else { ctx.font = '20px serif'; ctx.fillText('🪙', x - 10, y + 8); }
  });
}

window.addEventListener('load', init);
