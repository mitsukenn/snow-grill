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
  [...Object.keys(CONFIG.sprites), 'ground'].forEach(name => {
    const im = new Image();
    im.onload = () => { images[name] = im; if (name === 'ground') groundPattern = null; };
    im.src = IMG(name);
  });
}

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
const SAVE_KEY = 'snowGrill.v1';
function loadSave() {
  if (new URLSearchParams(location.search).has('reset')) localStorage.removeItem(SAVE_KEY);
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; }
}
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: G.money, rescued: G.rescued, unlockIdx: G.unlockIdx, kills: G.kills, muted: G.muted,
    }));
  } catch (e) { /* 保存できない環境では無視 */ }
}

// ============================================================
//  ゲームの状態
// ============================================================
let canvas, ctx, groundPattern = null;
const G = {
  money: 0, rescued: 0, unlockIdx: 0, kills: 0, muted: false,
  maxBears: CONFIG.bear.max, bossOn: false, fire: false,
  player: null, bears: [], drops: [], grills: [], counters: [], customers: [], helpers: [],
  flyers: [], texts: [], parts: [], snow: [], steps: [],
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
function makeHelper(type) {
  const s = type === 'hunter' ? { x: 330, y: 640 } : { x: 330, y: 930 };
  return { type, x: s.x, y: s.y, stack: [], atkT: 0, face: 1, t: 0, walk: 0, pop: 1, attackT: 0 };
}

// 解放したときの効果（ロード時にも順番に当て直す）
function applyUnlock(id, fromSave) {
  const u = CONFIG.unlocks.find(x => x.id === id);
  let made = null;   // 新しく置いた設備・助っ人（ポンと出てくる演出用）
  switch (id) {
    case 'grill2': made = makeGrill(CONFIG.grills[1]); G.grills.push(made); break;
    case 'backpack': G.player.cap += 6; break;
    case 'backpack2': G.player.cap += 8; break;
    case 'hunter': made = makeHelper('hunter'); G.helpers.push(made); break;
    case 'carrier': made = makeHelper('carrier'); G.helpers.push(made); break;
    case 'axe': G.player.damage = 2; break;
    case 'counter2': made = makeCounter(CONFIG.counters[1]); G.counters.push(made); break;
    case 'fire': G.fire = true; G.firePos = { x: u.x, y: u.y }; break;
    case 'huntArea': G.maxBears = 5; G.bossOn = true; break;
  }
  if (made && !fromSave) made.pop = 0;
}

function nextPad() {
  const u = CONFIG.unlocks[G.unlockIdx];
  G.pad = u ? { ...u, paid: 0, payT: 0, pulse: 0 } : null;
}

function init() {
  canvas = $('game');
  ctx = canvas.getContext('2d');
  loadImages();
  const s = loadSave();
  G.muted = !!s.muted;
  Sound.setMuted(G.muted);
  G.player = {
    x: CONFIG.playerStart.x, y: CONFIG.playerStart.y, vx: 0, vy: 0, face: 1, stack: [],
    cap: CONFIG.player.cap, damage: CONFIG.player.damage, atkT: 0, attackT: 0, xferT: 0, walk: 0,
  };
  G.grills.push(makeGrill(CONFIG.grills[0]));
  G.counters.push(makeCounter(CONFIG.counters[0]));
  G.money = s.money || 0;
  G.rescued = s.rescued || 0;
  G.kills = s.kills || 0;
  G.unlockIdx = Math.min(s.unlockIdx || 0, CONFIG.unlocks.length);
  for (let i = 0; i < G.unlockIdx; i++) applyUnlock(CONFIG.unlocks[i].id, true);
  nextPad();
  for (let i = 0; i < G.maxBears; i++) spawnBear(false);
  for (let i = 0; i < 70; i++) G.snow.push({ x: Math.random(), y: Math.random(), s: rand(1, 3), v: rand(20, 50) });

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
  $('start').onclick = () => {
    $('start').classList.add('hidden');
    Sound.startBgm();
    Sound.sfx.click();
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
function setupInput() {
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    G.joy = { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, id: e.pointerId };
    Sound.startBgm();
  });
  canvas.addEventListener('pointermove', e => {
    if (G.joy && e.pointerId === G.joy.id) { G.joy.x = e.clientX; G.joy.y = e.clientY; }
  });
  const end = e => { if (G.joy && e.pointerId === G.joy.id) G.joy = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  window.addEventListener('keydown', e => { G.keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', e => { G.keys[e.key.toLowerCase()] = false; });
}

function inputDir() {
  let dx = 0, dy = 0, mag = 0;
  if (G.joy) {
    dx = G.joy.x - G.joy.sx;
    dy = G.joy.y - G.joy.sy;
    const len = Math.hypot(dx, dy);
    if (len > 6) { mag = Math.min(1, len / 45); dx /= len; dy /= len; } else { dx = dy = 0; }
  }
  const k = G.keys;
  const kx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
  const ky = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0);
  if (kx || ky) { const l = Math.hypot(kx, ky); dx = kx / l; dy = ky / l; mag = 1; }
  return { dx, dy, mag };
}

// ============================================================
//  白クマ
// ============================================================
function spawnBear(boss) {
  const a = CONFIG.hunt;
  let x, y, tries = 0;
  do {
    x = rand(a.x + 40, a.x + a.w - 40);
    y = rand(a.y + 40, a.y + a.h - 40);
  } while (G.player && dist({ x, y }, G.player) < 220 && ++tries < 20);
  const hp = boss ? CONFIG.bossBear.hp : CONFIG.bear.hp;
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
  const ang = Math.atan2(b.y - from.y, b.x - from.x);
  b.x += Math.cos(ang) * 10;
  b.y += Math.sin(ang) * 6;
  Sound.sfx.hit();
  sparks(b.x, b.y - 40, 8, ['#fff', '#cfe8ff', '#ffe066']);
  floatText(b.x + rand(-10, 10), b.y - (b.boss ? 130 : 85), '-' + dmg, '#fff', 22);
  G.shake = Math.max(G.shake, b.boss ? 6 : 3);
  if (b.hp <= 0) {
    b.state = 'dead';
    b.deadT = 0.7;
    G.kills++;
    Sound.sfx.bearDown();
    const n = b.boss ? CONFIG.bossBear.meat : CONFIG.bear.meat;
    for (let i = 0; i < n; i++) dropMeat(b.x, b.y - 20);
    sparks(b.x, b.y - 30, b.boss ? 30 : 14, ['#fff', '#e8f4ff', '#ffb3b3']);
    if (G.bossOn && !b.boss && G.kills % CONFIG.bossBear.everyKills === 0 && !G.bears.some(x => x.boss && x.state !== 'dead')) {
      setTimeout(() => spawnBear(true), 900);
    }
  }
}

function updateBears(dt) {
  const a = CONFIG.hunt;
  G.bears.forEach(b => {
    b.pop = Math.min(1, b.pop + dt * 3);
    b.hitT = Math.max(0, b.hitT - dt);
    if (b.state === 'dead') { b.deadT -= dt; return; }
    const near = dist(b, G.player) < 150;
    b.state = near ? 'stand' : 'wander';
    if (near) { b.face = G.player.x > b.x ? 1 : -1; return; }
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
  });
  G.bears = G.bears.filter(b => b.state !== 'dead' || b.deadT > 0);
  const alive = G.bears.filter(b => !b.boss).length;
  if (alive < G.maxBears) {
    G.bearT -= dt;
    if (G.bearT <= 0) { spawnBear(false); G.bearT = CONFIG.bear.respawnSec; }
  }
}

// ============================================================
//  肉（落ちる → 地面 → 吸い寄せられて背中へ）
// ============================================================
function dropMeat(x, y) {
  const ang = rand(0, Math.PI * 2), sp = rand(60, 150);
  G.drops.push({ x, y, z: 30, vz: rand(180, 260), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.6, state: 'pop', holder: null, t: 0 });
}

function canCarry(who, kind, cap) {
  return who.stack.length < cap && (!who.stack.length || who.stack[0] === kind);
}

function updateDrops(dt) {
  G.drops.forEach(m => {
    if (m.state === 'pop') {
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.vz -= 700 * dt;
      if (m.z <= 0) { m.z = 0; m.vz = 0; m.state = 'ground'; m.t = 0.25; }
    } else if (m.state === 'ground') {
      m.t -= dt;
      if (m.t > 0) return;
      // 近くにいる人（プレイヤー・ハンター）が拾う
      const takers = [{ o: G.player, cap: G.player.cap, r: CONFIG.player.pickupRange }]
        .concat(G.helpers.filter(h => h.type === 'hunter').map(h => ({ o: h, cap: CONFIG.helper.hunter.cap, r: 50 })));
      for (const tk of takers) {
        const reserved = G.drops.filter(d => d.state === 'fly' && d.holder === tk.o).length;
        if (dist(m, tk.o) < tk.r && tk.o.stack.length + reserved < tk.cap && (!tk.o.stack.length || tk.o.stack[0] === 'raw')) {
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
  const { dx, dy, mag } = inputDir();
  const sp = CONFIG.player.speed * mag;
  P.vx = dx * sp; P.vy = dy * sp;
  P.x = clamp(P.x + P.vx * dt, 20, CONFIG.world.w - 20);
  P.y = clamp(P.y + P.vy * dt, 60, CONFIG.world.h - 20);
  if (Math.abs(P.vx) > 5) P.face = P.vx > 0 ? 1 : -1;
  if (mag > 0.1) {
    P.walk += dt * 10;
    if (Math.random() < dt * 8) G.steps.push({ x: P.x + rand(-6, 6), y: P.y, t: 3 });
  }
  P.atkT -= dt;
  P.attackT = Math.max(0, P.attackT - dt);

  // 自動攻撃：いちばん近い白クマ
  let target = null, best = CONFIG.player.attackRange;
  G.bears.forEach(b => {
    if (b.state === 'dead') return;
    const d = dist(b, P) - (b.boss ? 30 : 0);
    if (d < best) { best = d; target = b; }
  });
  if (target && P.atkT <= 0) {
    P.atkT = CONFIG.player.attackCd;
    P.attackT = 0.18;
    P.face = target.x > P.x ? 1 : -1;
    Sound.sfx.swing();
    setTimeout(() => hitBear(target, P.damage, P), 90);
  }

  interactStations(P, dt, CONFIG.player.transferSec, P.cap, true);

  // お金を拾う
  G.counters.forEach(c => {
    if (c.cash > 0 && dist(P, c.cashPos) < 60) {
      const n = Math.min(12, Math.ceil(c.cash / 5));
      for (let i = 0; i < n; i++) {
        setTimeout(() => { G.coinFly.push({ x: c.cashPos.x + rand(-15, 15), y: c.cashPos.y - 10, t: 0 }); Sound.sfx.coin(i); }, i * 30);
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
  for (const g of G.grills) {
    // 生肉をグリルに置く
    if (who.stack[0] === 'raw' && g.raw < CONFIG.grill.inCap && dist(who, g.inPad) < 48) {
      who.stack.pop();
      g.raw++;
      who.xferT = rate;
      fly('meat_raw', { x: who.x, y: who.y - 50 }, { x: g.inPad.x, y: g.inPad.y - 10 });
      if (isPlayer) Sound.sfx.drop(g.raw);
      return;
    }
    // 焼けた肉を取る
    if (g.cooked > 0 && canCarry(who, 'cooked', cap) && dist(who, g.outPad) < 48) {
      g.cooked--;
      who.stack.push('cooked');
      who.xferT = rate;
      fly('meat_cooked', { x: g.outPad.x, y: g.outPad.y - 10 }, { x: who.x, y: who.y - 50 });
      if (isPlayer) Sound.sfx.pick(who.stack.length);
      return;
    }
  }
  for (const c of G.counters) {
    // 焼けた肉を配給台に置く
    if (who.stack[0] === 'cooked' && c.stock < CONFIG.counter.cap && dist(who, c.servePad) < 48) {
      who.stack.pop();
      c.stock++;
      who.xferT = rate;
      fly('meat_cooked', { x: who.x, y: who.y - 50 }, { x: c.x, y: c.y - 40 });
      if (isPlayer) Sound.sfx.drop(c.stock);
      return;
    }
  }
}

// ============================================================
//  グリル・配給台・お客さん
// ============================================================
function updateGrills(dt) {
  G.grills.forEach(g => {
    g.pop = Math.min(1, g.pop + dt * 2.5);
    if (g.raw > 0 && g.cooked < CONFIG.grill.outCap) {
      g.t += dt;
      if (Math.random() < dt * 6) G.parts.push({ x: g.x + rand(-20, 20), y: g.y - 60, vx: rand(-8, 8), vy: rand(-40, -25), t: 1.2, life: 1.2, kind: 'smoke' });
      if (g.t >= CONFIG.grill.cookSec) {
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
  G.spawnT -= dt;
  const counter = G.counters.slice().sort((a, b) => a.queue.length - b.queue.length)[0];
  if (G.spawnT <= 0 && counter.queue.length < C.maxQueue) {
    G.spawnT = rand(...C.spawnSec);
    const kinds = ['villager_m', 'villager_f', 'villager_child'];
    const cu = {
      x: counter.x + rand(-30, 30), y: CONFIG.world.h + 40, want: randInt(...C.want), got: 0,
      kind: kinds[randInt(0, 2)], state: 'queue', counter, walk: 0, face: 1, pop: 1,
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
          const pay = front.want * (C.price + (G.fire ? 2 : 0));
          c.cash += pay;
          for (let i = 0; i < Math.min(6, front.want * 2); i++) {
            fly('coin', { x: front.x, y: front.y - 40 }, { x: c.cashPos.x + rand(-12, 12), y: c.cashPos.y - 6 }, 16, 0.35);
          }
          Sound.sfx.pay();
          Sound.sfx.happy();
          floatText(front.x, front.y - 90, 'ありがとう！', '#fff', 20);
          front.state = 'leave';
          front.kind = 'villager_happy';
          front.exit = { x: Math.random() < 0.5 ? -60 : CONFIG.world.w + 60, y: rand(1150, 1350) };
          c.queue.shift();
          G.rescued++;
          updateHud();
        }
      }
    }
  });
  G.customers.forEach(cu => {
    const target = cu.state === 'leave' ? cu.exit : cu.slot;
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
    if (h.type === 'hunter') {
      const H = CONFIG.helper.hunter;
      const bears = G.bears.filter(b => b.state !== 'dead');
      const loose = G.drops.filter(m => m.state === 'ground' && m.y < 640);
      if (h.stack.length >= H.cap || (h.stack.length && !bears.length && !loose.length)) {
        const g = G.grills.slice().sort((a, b) => dist(h, a.inPad) - dist(h, b.inPad))[0];
        if (moveTo(h, g.inPad, H.speed, dt) || dist(h, g.inPad) < 40) interactStations(h, dt, 0.12, H.cap, false);
      } else if (loose.length) {
        moveTo(h, loose.sort((a, b) => dist(h, a) - dist(h, b))[0], H.speed, dt);
      } else if (bears.length) {
        const b = bears.sort((a, c) => dist(h, a) - dist(h, c))[0];
        if (dist(h, b) > 70) moveTo(h, b, H.speed, dt);
        else if (h.atkT <= 0) {
          h.atkT = H.attackCd;
          h.attackT = 0.2;
          h.face = b.x > h.x ? 1 : -1;
          hitBear(b, H.damage, h);
        }
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
  G.flyers.forEach(f => { f.t += dt; if (f.t >= f.dur && f.onDone) f.onDone(); });
  G.flyers = G.flyers.filter(f => f.t < f.dur);
  G.texts.forEach(t => { t.t += dt; t.y -= 40 * dt; });
  G.texts = G.texts.filter(t => t.t < t.life);
  G.parts.forEach(p => { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind === 'spark') p.vy += 400 * dt; });
  G.parts = G.parts.filter(p => p.t > 0);
  G.steps.forEach(s => { s.t -= dt; });
  G.steps = G.steps.filter(s => s.t > 0);
  G.coinFly.forEach(c => { c.t += dt; });
  G.coinFly = G.coinFly.filter(c => c.t < 0.6);
  G.snow.forEach(s => { s.y += s.v * dt / 800; s.x += Math.sin(G.time + s.v) * dt * 0.01; if (s.y > 1) { s.y = 0; s.x = Math.random(); } });
  G.shake = Math.max(0, G.shake - dt * 40);
  if (G.pad) G.pad.pulse += dt;
}
G.coinFly = [];

// ============================================================
//  次にやること（ガイドの矢印）
// ============================================================
function currentGoal() {
  const P = G.player;
  const tutorial = G.unlockIdx < 2;
  const pad = G.pad;
  if (pad && G.money >= Math.min(pad.price - pad.paid, 10) && (!tutorial || G.money >= pad.price - pad.paid)) {
    return { x: pad.x, y: pad.y, text: `💰 ${pad.label} を解放しよう` };
  }
  const cash = G.counters.find(c => c.cash > 0);
  if (cash) return { x: cash.cashPos.x, y: cash.cashPos.y, text: '💰 お金を拾おう' };
  if (P.stack[0] === 'cooked') return { x: G.counters[0].servePad.x, y: G.counters[0].servePad.y, text: '🍖 凍えた人に肉を配ろう' };
  // 背中がいっぱい・肉が落ちていない・もうグリルの近くにいる → 置きに行く（置き終わるまで）
  const grill = G.grills.slice().sort((a, b) => dist(P, a.inPad) - dist(P, b.inPad))[0];
  if (P.stack[0] === 'raw' && (P.stack.length >= P.cap || !G.drops.length || dist(P, grill.inPad) < 110)) {
    return { x: grill.inPad.x, y: grill.inPad.y, text: '🔥 グリルに肉を置こう' };
  }
  const g = G.grills.find(x => x.cooked > 0);
  if (g && !P.stack.length) return { x: g.outPad.x, y: g.outPad.y, text: '🍖 焼けた肉を取ろう' };
  const b = G.bears.filter(x => x.state !== 'dead').sort((a, c) => dist(P, a) - dist(P, c))[0];
  if (b) return { x: b.x, y: b.y, text: '🐻‍❄️ 白クマを倒して肉を集めよう' };
  return null;
}

// ============================================================
//  更新
// ============================================================
function update(dt) {
  G.time += dt;
  updatePlayer(dt);
  updateBears(dt);
  updateDrops(dt);
  updateGrills(dt);
  updateCustomers(dt);
  updateHelpers(dt);
  updateFx(dt);
  // カメラ：プレイヤーを追う
  const cam = G.cam;
  const tx = clamp(G.player.x - G.viewW / 2, 0, CONFIG.world.w - G.viewW);
  const ty = clamp(G.player.y - G.viewH * 0.55, 0, Math.max(0, CONFIG.world.h - G.viewH));
  cam.x += (tx - cam.x) * Math.min(1, dt * 6);
  cam.y += (ty - cam.y) * Math.min(1, dt * 6);
  const goal = currentGoal();
  const guide = $('guide');
  guide.textContent = goal ? goal.text : '';
  guide.classList.toggle('hidden', !goal);
  G.goal = goal;
}

function updateHud() {
  $('money').textContent = fmt(G.money);
  $('rescued').textContent = fmt(G.rescued);
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
  drawGoalArrow();

  // 画面に固定するもの（雪・ジョイスティック・お金の飛ぶ演出）
  ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  const W = canvas.width / G.dpr, H = canvas.height / G.dpr;
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  G.snow.forEach(f => { ctx.beginPath(); ctx.arc(f.x * W, f.y * H, f.s, 0, Math.PI * 2); ctx.fill(); });
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
  const a = CONFIG.hunt;
  ctx.fillStyle = 'rgba(120,170,220,.12)';
  roundRect(a.x, a.y, a.w, a.h, 40);
  ctx.fill();
  ctx.strokeStyle = 'rgba(110,80,50,.8)';
  ctx.lineWidth = 5;
  ctx.setLineDash([2, 22]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y + a.h + 20);
  ctx.lineTo(a.x + a.w, a.y + a.h + 20);
  ctx.stroke();
  ctx.setLineDash([]);
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
  ctx.fillStyle = color.replace('A', '.18');
  ctx.strokeStyle = color.replace('A', '.9');
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.setLineDash([]);
  if (icon) drawSprite(icon, x, y + 6, 22, { alpha: 0.55 });
  if (label) {
    ctx.font = '900 13px "Hiragino Sans","Yu Gothic UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = color.replace('A', '1');
    ctx.fillText(label, x, y + r * 0.55 + 16);
  }
  ctx.restore();
}

function drawDecals() {
  G.grills.forEach(g => {
    ring(g.inPad.x, g.inPad.y, 34, 'rgba(230,90,70,A)', null, '生肉を置く');
    ring(g.outPad.x, g.outPad.y, 34, 'rgba(240,160,40,A)', null, '焼けた肉');
  });
  G.counters.forEach(c => {
    ring(c.servePad.x, c.servePad.y, 36, 'rgba(60,160,90,A)', null, '配る');
    if (c.cash > 0) ring(c.cashPos.x, c.cashPos.y, 30, 'rgba(230,180,20,A)');
  });
  const pad = G.pad;
  if (pad) {
    const pulse = 1 + Math.sin(pad.pulse * 4) * 0.04;
    ctx.save();
    ctx.translate(pad.x, pad.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(40,90,160,.35)';
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 26, 0, 0, Math.PI * 2); ctx.fill();
    // 払った分だけ金色に
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 26, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pad.paid / pad.price)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 26, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '900 14px "Hiragino Sans","Yu Gothic UI",sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20,40,80,.85)';
    ctx.strokeText(pad.label, pad.x, pad.y - 36);
    ctx.fillStyle = '#fff';
    ctx.fillText(pad.label, pad.x, pad.y - 36);
    drawSprite('coin', pad.x - 26, pad.y + 9, 20);
    ctx.font = '900 17px "Hiragino Sans","Yu Gothic UI",sans-serif';
    const left = fmt(pad.price - pad.paid);
    ctx.strokeText(left, pad.x + 8, pad.y + 6);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(left, pad.x + 8, pad.y + 6);
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
  // 置いてある生肉・焼けた肉の山
  pileAt('meat_raw', g.inPad.x, g.inPad.y, g.raw);
  pileAt('meat_cooked', g.outPad.x, g.outPad.y, g.cooked);
  if (g.raw > 0) {
    // 焼き具合のゲージ
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    roundRect(g.x - 30, g.y - 104, 60, 8, 4); ctx.fill();
    ctx.fillStyle = '#ff9a3b';
    roundRect(g.x - 30, g.y - 104, 60 * (g.t / CONFIG.grill.cookSec), 8, 4); ctx.fill();
  }
}

function pileAt(name, x, y, n) {
  if (!n) return;
  const shown = Math.min(n, 12);
  for (let i = 0; i < shown; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    drawSprite(name, x - 14 + col * 14, y + 4 - row * 9, 24);
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
  const cold = cu.state !== 'leave';
  const jx = cold ? Math.sin(G.time * 40 + cu.x) * 1.2 : 0;
  const bob = Math.abs(Math.sin(cu.walk)) * 3;
  shadow(cu.x, cu.y, 18);
  drawSprite(cu.kind, cu.x + jx, cu.y - bob, cu.kind === 'villager_child' ? 56 : 70, { flip: cu.face < 0 });
  // 吹き出し：あと何個ほしいか
  if (cold && cu.slot && dist(cu, cu.slot) < 30) {
    const left = cu.want - cu.got;
    const bx = cu.x, by = cu.y - 92;
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    roundRect(bx - 26, by - 22, 52, 28, 12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx - 5, by + 6); ctx.lineTo(bx, by + 13); ctx.lineTo(bx + 5, by + 6); ctx.fill();
    drawSprite('meat_cooked', bx - 10, by + 3, 22);
    ctx.font = '900 14px "Hiragino Sans",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c0392b';
    ctx.fillText('×' + left, bx + 2, by - 2);
  }
}

function drawBear(b) {
  const h = b.boss ? 140 : 84;
  const k = b.pop;
  shadow(b.x, b.y, h * 0.42);
  if (b.state === 'dead') {
    drawSprite('bear_down', b.x, b.y, h * 0.75, { alpha: clamp(b.deadT / 0.7, 0, 1), flip: b.face < 0 });
    return;
  }
  const name = b.boss ? 'bear_boss' : (b.state === 'stand' ? 'bear_stand' : 'bear_walk');
  const bob = b.state === 'wander' ? Math.abs(Math.sin(b.walk)) * 3 : 0;
  drawSprite(name, b.x, b.y - bob, h * (b.state === 'stand' && !b.boss ? 1.15 : 1) * (0.4 + 0.6 * k), { flip: b.face < 0, flash: b.hitT > 0 });
  if (b.hp < b.maxHp) {
    const w = b.boss ? 90 : 56;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    roundRect(b.x - w / 2, b.y - h - 16, w, 8, 4); ctx.fill();
    ctx.fillStyle = b.boss ? '#ff4d4d' : '#ff7a7a';
    roundRect(b.x - w / 2, b.y - h - 16, w * (b.hp / b.maxHp), 8, 4); ctx.fill();
  }
}

function drawDrop(m) {
  shadow(m.x, m.y, 10);
  drawSprite('meat_raw', m.x, m.y - m.z, 28, { rot: m.state === 'pop' ? G.time * 12 : 0 });
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
  const moving = Math.hypot(P.vx, P.vy) > 10;
  const bob = moving ? Math.abs(Math.sin(P.walk)) * 4 : Math.sin(G.time * 3) * 1;
  shadow(P.x, P.y, 22);
  const name = P.attackT > 0 ? 'hero_attack' : (moving ? 'hero_walk' : 'hero_idle');
  drawStack(P, P.y - 48 - bob);
  drawSprite(name, P.x, P.y - bob, 82, { flip: P.face < 0 && name !== 'hero_idle' });
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

function drawHelper(h) {
  const moving = true;
  const bob = moving ? Math.abs(Math.sin(h.walk)) * 3 : 0;
  shadow(h.x, h.y, 18);
  ctx.save();
  ctx.translate(h.x, h.y);
  const sc = popScale(h);
  ctx.scale(sc, sc);
  ctx.translate(-h.x, -h.y);
  drawStack(h, h.y - 44 - bob);
  drawSprite(h.type === 'hunter' ? 'helper_hunter' : 'helper_cook', h.x, h.y - bob, 72, { flip: h.face < 0, squash: h.attackT > 0 ? 0.08 : 0 });
  ctx.restore();
}

function drawFire() {
  const f = G.firePos;
  shadow(f.x, f.y, 40);
  const flick = 1 + Math.sin(G.time * 14) * 0.04;
  drawSprite('campfire', f.x, f.y, 80 * flick);
  ctx.fillStyle = 'rgba(255,170,60,.12)';
  ctx.beginPath(); ctx.ellipse(f.x, f.y - 20, 110, 70, 0, 0, Math.PI * 2); ctx.fill();
}

// 次の目的地を指す矢印（画面外なら画面の端に）
function drawGoalArrow() {
  const g = G.goal;
  if (!g) return;
  const cam = G.cam;
  const inView = g.x > cam.x + 20 && g.x < cam.x + G.viewW - 20 && g.y > cam.y + 90 && g.y < cam.y + G.viewH - 20;
  const bounce = Math.sin(G.time * 6) * 8;
  ctx.save();
  if (inView) {
    ctx.translate(g.x, g.y - 70 + bounce);
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
  const target = { x: 40, y: 32 };
  G.coinFly.forEach(c => {
    const k = Math.min(1, c.t / 0.6);
    const sx = (c.x - cam.x) * cam.scale, sy = (c.y - cam.y) * cam.scale;
    const x = sx + (target.x - sx) * k * k, y = sy + (target.y - sy) * k * k - Math.sin(k * Math.PI) * 60;
    const im = images.coin;
    if (im) ctx.drawImage(im, x - 11, y - 11, 22, 22);
    else { ctx.font = '20px serif'; ctx.fillText('🪙', x - 10, y + 8); }
  });
}

window.addEventListener('load', init);
