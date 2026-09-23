'use strict';

// ============================================================
//  決戦ステージ：白クマの群れが波のように攻めてくる → 最後に「雪の巨人」
//  肉を焼いて配るいつもの流れでお金を稼ぎ、強化・助っ人で戦う
//  VILLAGES の battle: true の村で使う。数値は CONFIG.battle と村ごとの giant
// ============================================================

const fenceY = () => CONFIG.hunt.y + CONFIG.hunt.h + 20;   // 柵の位置は狩り場を広げても変わらない
// バリケードが立っているか（決戦ではこわされることがある）
const fenceUp = () => G.barricade && G.fenceHp > 0;

function setupBattle() {
  const B = CONFIG.battle;
  G.battle = { t: B.firstWaveSec, wave: 0, giant: null, won: false };
  // 決戦ははじめからバリケードと見張り台がある
  G.barricade = true;
  G.fenceHp = G.fenceMax = B.fenceHp;
  G.tower = { ...CONFIG.helper.archer.post, pop: 1 };
  // はじめて来たときは、援軍（斧の助っ人2人と弓使い）が一緒に来てくれる
  if (!G.vs.crew.length) {
    B.startCrew.forEach(type => G.vs.crew.push({ type }));   // 助っ人は enterVillage の仲間の読み込みで出てくる
  }
}

function banner(text, sub = '', sec = 2.6) {
  G.banner = { text, sub, t: sec, life: sec };
}

function updateBattle(dt) {
  const Bt = G.battle, B = CONFIG.battle;
  if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
  if (Bt.won) return;
  Bt.t -= dt;
  if (Bt.t <= 0) {
    Bt.wave++;
    const n = B.waveBase + Bt.wave + G.v.extraBears;
    for (let i = 0; i < n; i++) spawnRaider();
    updateHud();
    Bt.t = Bt.giant ? B.waveEvery * 1.4 : B.waveEvery;
    if (Bt.wave === B.giantAfter && !Bt.giant) {
      Bt.t = 3;   // 巨人は群れのすぐあとに
      Bt.giantNext = true;
    } else {
      banner(`第${Bt.wave}波`, '白クマの群れが攻めてきた！');
      Sound.sfx.roar();
    }
  }
  if (Bt.giantNext && Bt.t <= 0.05) {
    Bt.giantNext = false;
    spawnGiant();
    Bt.t = B.waveEvery * 1.4;
  }
}

// 狩り場の奥から、バリケードめがけて来る白クマ
function spawnRaider() {
  const a = G.hunt;
  const hp = Math.round(CONFIG.bear.hp * G.v.bearHp);
  G.bears.push({
    x: rand(a.x + 40, a.x + a.w - 40), y: a.y + rand(10, 60), hp, maxHp: hp, boss: false, raid: true,
    tx: 0, ty: 0, t: 0, hitT: 0, face: 1, state: 'wander', deadT: 0, pop: 0, walk: 0,
  });
}

function spawnGiant() {
  const g = G.v.giant, B = CONFIG.battle.giantBase;
  const hp = Math.round(B.hp * g.hpMul);
  const b = {
    giant: true, x: 360, y: CONFIG.hunt.y + 20, hp, maxHp: hp, face: 1, state: 'walk', cd: 2.5,
    hitT: 0, deadT: 0, pop: 0, walk: 0, boss: true, rocks: [],
  };
  G.bears.push(b);
  G.battle.giant = b;
  updateHud();
  banner(g.name + ' あらわる！', '強い攻撃は赤い円でわかる。よけながら戦おう', 3.2);
  Sound.sfx.roar();
  later(0.35, () => Sound.sfx.roar());
  G.shake = 16;
}

// バリケードへのダメージ
function damageFence(dmg) {
  if (!fenceUp()) return;
  G.fenceHp = Math.max(0, G.fenceHp - dmg);
  G.fenceHitT = 0.25;
  G.shake = Math.max(G.shake, 4);
  if (G.fenceHp <= 0) {
    banner('バリケードがこわされた！', '柵の前に立つと、お金で修理できる');
    Sound.sfx.bearDown();
    sparks(360, fenceY() - 20, 30, ['#8a5a2b', '#c48a52', '#fff']);
  }
}

// ---------------- 巨人 ----------------
function updateGiant(b, dt) {
  const B = CONFIG.battle.giantBase, g = G.v.giant, a = G.hunt;
  b.pop = Math.min(1, b.pop + dt * 2);
  b.hitT = Math.max(0, b.hitT - dt);
  // 投げた氷の岩
  b.rocks.forEach(r => {
    r.t += dt;
    if (r.t >= r.dur && !r.done) {
      r.done = true;
      Sound.sfx.hit();
      G.shake = Math.max(G.shake, 7);
      sparks(r.tx, r.ty - 10, 16, ['#dff4ff', '#9fd7ff', '#fff']);
      fxAt('ui/explosion', r.tx, r.ty - 20, 110);
      const dmg = Math.round(B.throwDmg * g.dmgMul);
      bearTargets().forEach(t => { if (Math.hypot(t.x - r.tx, (t.y - r.ty) / 0.55) < B.throwR + 8) damageUnit(t, dmg, { x: r.tx, y: r.ty - 1 }); });
    }
  });
  b.rocks = b.rocks.filter(r => !r.done || r.t < r.dur + 0.3);
  if (b.state === 'dead') { b.deadT -= dt; return; }

  if (b.state === 'windup') {
    b.wt -= b.hitT > 0 ? dt * 0.85 : dt;
    if (b.wt <= 0) {
      b.state = 'smash';
      b.st = 0.5;
      const dmg = Math.round(B.smashDmg * g.dmgMul);
      Sound.sfx.bearDown();
      Sound.sfx.claw();
      G.shake = 18;
      fxAt('ui/explosion', b.x, b.y - 10, 260);
      sparks(b.x, b.y - 10, 40, ['#dff4ff', '#9fd7ff', '#fff']);
      bearTargets().forEach(t => { if (Math.hypot(t.x - b.x, (t.y - b.y) / 0.55) < B.smashR + 8) damageUnit(t, dmg, b); });
      if (b.y > fenceY() - B.smashR * 0.6) damageFence(B.fenceDmg * g.dmgMul);
    }
    return;
  }
  if (b.state === 'smash' || b.state === 'throw' || b.state === 'roar') {
    b.st -= dt;
    if (b.st <= 0) { b.state = 'walk'; b.cd = B.cooldown * rand(0.8, 1.2); }
    return;
  }

  // 歩く：近くに相手がいればそちらへ、いなければバリケードへ
  b.cd -= dt;
  const targets = bearTargets();
  let tgt = null, best = 330;
  targets.forEach(t => { const d = dist(t, b); if (d < best) { best = d; tgt = t; } });
  const goal = tgt || { x: 360, y: fenceUp() ? fenceY() - 30 : 900 };
  const d = dist(goal, b);
  if (d > (tgt ? B.smashR * 0.6 : 10)) {
    const sp = B.speed * dt;
    b.x += (goal.x - b.x) / d * sp;
    b.y += (goal.y - b.y) / d * sp;
    b.walk += dt * 4;
  }
  b.face = goal.x > b.x ? 1 : -1;
  b.x = clamp(b.x, a.x + 40, a.x + a.w - 40);
  b.y = clamp(b.y, a.y + 20, a.y + a.h + (fenceUp() ? -10 : 380));

  if (b.cd <= 0) {
    const nearFence = fenceUp() && b.y > fenceY() - B.smashR * 0.8;
    if ((tgt && best < B.smashR) || nearFence) {
      b.state = 'windup';
      b.wt = b.wtMax = B.windup;
      Sound.sfx.growl();
    } else if (G.player.downT <= 0 && dist(G.player, b) < B.throwRange) {
      // 主人公に氷の岩を投げる（落ちる場所に円が出る）
      b.state = 'throw';
      b.st = 0.6;
      b.face = G.player.x > b.x ? 1 : -1;
      b.rocks.push({ fx: b.x + b.face * 40, fy: b.y - 170, tx: G.player.x, ty: G.player.y, t: 0, dur: B.throwTime });
      Sound.sfx.swing();
    } else b.cd = 0.5;
  }
}

function giantDefeated(b) {
  const B = CONFIG.battle.giantBase, g = G.v.giant;
  G.battle.won = true;
  b.deadT = 2.2;
  G.shake = 22;
  Sound.sfx.bearDown();
  for (let i = 0; i < B.meat; i++) dropMeat(b.x + rand(-40, 40), b.y - 30);
  const reward = Math.round(B.reward * G.v.priceMul);
  G.money += reward;
  floatText(b.x, b.y - 240, `+${reward}`, '#ffd23f', 40);
  sparks(b.x, b.y - 80, 70, ['#ffd23f', '#fff', '#7fe0ff', '#ff9ad5']);
  fxAt('ui/explosion', b.x, b.y - 60, 320);
  fxAt('ui/sparkle', b.x, b.y - 120, 220);
  // 残っている白クマは逃げていく
  G.bears.forEach(x => { if (x !== b && x.state !== 'dead') { x.state = 'dead'; x.deadT = 0.7; } });
  banner(g.name + 'をたおした！', '北の大地に平和が近づいた', 3);
  updateHud();
  later(1.4, () => { if (!G.vs.done) villageClear(); });
}

// ---------------- 描画 ----------------
function drawGiant(b) {
  const B = CONFIG.battle.giantBase, g = G.v.giant;
  const h = 230 * (0.5 + 0.5 * b.pop);
  // 地面たたきの予告（赤い円がだんだん埋まる）
  if (b.state === 'windup') {
    const p = 1 - b.wt / b.wtMax;
    ctx.save();
    ctx.fillStyle = 'rgba(255,40,40,.14)';
    ctx.strokeStyle = 'rgba(255,40,40,.9)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(b.x, b.y, B.smashR, B.smashR * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,40,40,.32)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y, B.smashR * p, B.smashR * 0.55 * p, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // 氷の岩が落ちる場所
  b.rocks.forEach(r => {
    if (r.done) return;
    const p = r.t / r.dur;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,60,60,.9)'; ctx.lineWidth = 3;
    ctx.fillStyle = `rgba(255,40,40,${0.12 + p * 0.25})`;
    ctx.beginPath(); ctx.ellipse(r.tx, r.ty, B.throwR, B.throwR * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  });
  shadow(b.x, b.y, 90);
  if (b.state === 'dead') {
    drawSprite(pick('giant_down', 'giant_idle', 'bear_boss'), b.x, b.y, h * 0.7, { alpha: clamp(b.deadT / 1.2, 0, 1), flip: b.face < 0, tint: g.tint });
    return;
  }
  let name;
  if (b.hitT > 0.05 && b.state === 'walk') name = pick('giant_hurt', 'giant_idle', 'bear_boss');
  else if (b.state === 'windup') name = pick('giant_windup', 'giant_roar', 'bear_boss');
  else if (b.state === 'smash') name = pick('giant_smash', 'giant_idle', 'bear_boss');
  else if (b.state === 'throw') name = pick('giant_throw', 'giant_idle', 'bear_boss');
  else name = Math.sin(b.walk) > 0 ? pick('giant_walk', 'giant_idle', 'bear_boss') : pick('giant_idle', 'bear_boss');
  const bob = b.state === 'walk' ? Math.abs(Math.sin(b.walk)) * 4 : 0;
  const big = b.state === 'windup' ? 1.05 + Math.sin(G.time * 30) * 0.015 : 1;
  drawSprite(name, b.x, b.y - bob, h * big, { flip: b.face < 0, flash: b.hitT > 0.1, tint: g.tint });
  // 体力ゲージ（大きめ）
  const w = 130;
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  roundRect(b.x - w / 2 - 2, b.y - h - 22, w + 4, 14, 7); ctx.fill();
  ctx.fillStyle = '#ff3d3d';
  roundRect(b.x - w / 2, b.y - h - 20, w * Math.max(0, b.hp / b.maxHp), 10, 5); ctx.fill();
}

// 飛んでいる氷の岩（いちばん手前に描く）
function drawRocks() {
  const b = G.battle && G.battle.giant;
  if (!b) return;
  b.rocks.forEach(r => {
    if (r.done) return;
    const k = r.t / r.dur;
    const x = r.fx + (r.tx - r.fx) * k;
    const y = r.fy + (r.ty - r.fy) * k - Math.sin(k * Math.PI) * 160;
    drawSprite(pick('ice_rock', 'rock'), x, y + 30, 56, { rot: k * 6 });
  });
}

// 決戦中のバリケードの耐久ゲージ
function drawFenceHp() {
  if (!G.barricade || !G.fenceMax) return;
  if (!G.battle && G.fenceHp >= G.fenceMax) return;   // ふつうの村では減ったときだけ
  drawRepairSpot();
  const y = fenceY() + 16, w = 160, x = 360;
  const r = G.fenceHp / G.fenceMax;
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  roundRect(x - w / 2 - 2, y - 2, w + 4, 12, 6); ctx.fill();
  ctx.fillStyle = r > 0.5 ? '#c48a52' : r > 0.25 ? '#ffb020' : '#ff4040';
  roundRect(x - w / 2, y, w * r, 8, 4); ctx.fill();
  ctx.font = '900 11px "Hiragino Sans",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(40,20,0,.8)'; ctx.lineWidth = 3;
  const label = G.fenceHp > 0 ? 'バリケード' : 'こわされた！';
  ctx.strokeText(label, x, y - 5); ctx.fillText(label, x, y - 5);
}

// 画面の真ん中に出る大きな文字（第○波・巨人あらわる など）
function drawBanner(W, H) {
  const bn = G.banner;
  if (!bn) return;
  const age = bn.life - bn.t;
  const a = Math.min(1, age * 4, bn.t * 2);
  const s = 1 + Math.max(0, 0.25 - age) * 1.6;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(W / 2, H * 0.3);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(15,30,60,.72)';
  ctx.fillRect(-W / 2, -38, W, bn.sub ? 76 : 56);
  ctx.textAlign = 'center';
  ctx.font = '900 30px "Hiragino Sans",sans-serif';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(120,0,0,.9)';
  ctx.strokeText(bn.text, 0, 0);
  ctx.fillStyle = '#ffdf5b';
  ctx.fillText(bn.text, 0, 0);
  if (bn.sub) {
    ctx.font = '800 14px "Hiragino Sans",sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(bn.sub, 0, 26);
  }
  ctx.restore();
}

// 目標バー：巨人が出るまでは「第○波」、出たら巨人の体力
function battleHud() {
  const Bt = G.battle, B = CONFIG.battle;
  if (Bt.giant) {
    const hp = Math.max(0, Bt.giant.hp);
    $('goal-num').textContent = Bt.won ? '撃破！' : `${G.v.giant.name}  ${Math.ceil(hp / Bt.giant.maxHp * 100)}%`;
    $('goal-bar').style.width = (Bt.won ? 100 : 100 - hp / Bt.giant.maxHp * 100) + '%';
  } else {
    $('goal-num').textContent = Bt.giantNext ? '巨人が来る…！' : `第${Bt.wave}/${B.giantAfter}波・あと${Math.ceil(Math.max(0, Bt.t))}秒`;
    $('goal-bar').style.width = Math.min(100, Bt.wave / B.giantAfter * 100) + '%';
  }
  $('goal').classList.toggle('done', !!(G.vs && G.vs.done));
}

// ============================================================
//  ふつうの村の襲撃と、バリケードの修理（決戦と共通）
// ============================================================
function repairSpot() { return { x: 360, y: fenceY() + 48 }; }

// 柵の前に立つと、お金を払って少しずつ直る
function updateRepair(dt) {
  if (!G.barricade || !G.fenceMax || G.fenceHp >= G.fenceMax) return;
  const P = G.player, R = CONFIG.raid;
  if (P.downT > 0 || dist(P, repairSpot()) > 55 || G.money <= 0) return;
  const was = G.fenceHp;
  G.fenceHp = Math.min(G.fenceMax, G.fenceHp + R.repairSpeed * dt);
  G.repairPaid = (G.repairPaid || 0) + (G.fenceHp - was) / R.repairPerCoin;
  if (G.repairPaid >= 1) {
    const n = Math.floor(G.repairPaid);
    G.money = Math.max(0, G.money - n);
    G.repairPaid -= n;
    updateHud();
  }
  G.repairFx = (G.repairFx || 0) - dt;
  if (G.repairFx <= 0) {
    G.repairFx = 0.25;
    Sound.sfx.drop(3);
    sparks(repairSpot().x + rand(-60, 60), fenceY() - 20, 3, ['#c48a52', '#fff']);
  }
  if (was <= 0 && G.fenceHp > 0) floatText(P.x, P.y - 120, 'バリケード復活！', '#7fe0ff', 24);
}

// ふつうの村：何人か救うごとに、白クマの群れが攻めてくる
function checkRaid() {
  if (G.battle || G.vs.done) return;
  const R = CONFIG.raid;
  if (G.rescued < R.first || (G.rescued - R.first) % R.every !== 0 || G.lastRaid === G.rescued) return;
  G.lastRaid = G.rescued;
  G.raids = (G.raids || 0) + 1;
  const n = R.base + G.raids;
  for (let i = 0; i < n; i++) spawnRaider();
  banner('白クマの群れが来た！', G.barricade ? 'バリケードを守ろう' : 'バリケードを建てると守れる');
  Sound.sfx.roar();
}

// 修理する場所の目印（こわれかけのときだけ）
function drawRepairSpot() {
  if (!G.barricade || !G.fenceMax || G.fenceHp >= G.fenceMax * 0.95) return;
  const s = repairSpot();
  const k = 1 + Math.sin(G.time * 6) * 0.06;
  ctx.save();
  ctx.fillStyle = 'rgba(255,170,40,.25)';
  ctx.strokeStyle = '#ff9a3b';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(s.x, s.y, 44 * k, 24 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.font = '900 14px "Hiragino Sans",sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(90,40,0,.85)';
  ctx.strokeText('🔨 修理', s.x, s.y + 5); ctx.fillStyle = '#fff'; ctx.fillText('🔨 修理', s.x, s.y + 5);
  ctx.restore();
}
