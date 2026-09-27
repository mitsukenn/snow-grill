'use strict';

// ============================================================
//  村ごとの景色（どこも雪の村のまま、ひと目で別の村とわかるように）
//  ground：地面に描く目印（under＝ぼかしの下、over＝ぼかし・柵の上）
//  decor：置き物（'@' で始まる名前はここで絵を描く）、edge：ふちの木を置きかえる
//  light：画面全体の光（時間帯）。王都は夜でオーロラと灯り
// ============================================================

// はじまりのキャンプの置き物（CONFIG.decor）はそのまま。ほかの村はここで決める
const SCENES = {
  camp: {
    light: [['rgba(255,214,170,.07)', 'rgba(255,214,170,.04)']],
  },
  lake: {
    ground: { field: 'lake_ice', camp: 'shore', veil: 'rgba(235,248,255,.35)' },
    under: (a) => lakeIce(a),
    decor: [
      ['pine', 20, 60, 110], ['pine', 700, 90, 120], ['ice_rock', 30, 330, 60], ['pine', 700, 380, 110],
      ['@fishrack', 55, 700, 80], ['@fishrack', 668, 640, 80],
      ['tent_lake', 60, 1270, 110], ['tent_lake', 660, 1300, 110], ['@fishrack', 70, 1170, 80], ['@boat', 650, 1180, 70],
      ['logs', 300, 1330, 50], ['igloo', 80, 1385, 80],
    ],
    light: [['rgba(130,205,255,.13)', 'rgba(190,235,255,.05)']],
  },
  pass: {
    ground: { field: 'pass_rock', camp: 'wind' },
    over: () => cliffs('#8795ab', '#5f6c82'),
    wind: true,
    decor: [
      ['rock', 110, 170, 60], ['ice_rock', 620, 230, 70], ['snowdrift', 300, 120, 60], ['rock', 560, 520, 55],
      ['rock', 105, 620, 55], ['snowdrift', 620, 610, 60],
      ['tent', 60, 1270, 100], ['snowdrift', 660, 1300, 70], ['@sign', 95, 1150, 80], ['rock', 640, 1180, 60],
      ['logs', 300, 1330, 50], ['snowdrift', 90, 1380, 70],
    ],
    edge: { pine: 'rock', bush: 'snowdrift' },
    light: [['rgba(70,82,105,.30)', 'rgba(90,100,120,.12)']],
  },
  port: {
    ground: { field: 'port_frozen', camp: 'port_dock', campVeil: 'rgba(240,246,255,.28)', fieldSize: 600 },
    over: () => harbor(),
    decor: [
      ['pine', 20, 60, 100], ['@crate', 690, 120, 50], ['@crate', 40, 330, 50], ['@boat', 690, 400, 90],
      ['@post', 110, 610, 50], ['@post', 620, 620, 50],
      ['@crate', 60, 1150, 55], ['@crate', 95, 1185, 45], ['@boat', 660, 1200, 100], ['lumber', 300, 1300, 50],
      ['@post', 40, 1260, 50],
    ],
    edge: { bush: '@crate' },
    light: [['rgba(255,140,60,.22)', 'rgba(150,80,140,.10)']],
  },
  capital: {
    ground: { field: 'fluffy', camp: 'capital_stone' },
    over: () => castleWall(),
    decor: [
      ['@banner', 150, 140, 110], ['@banner', 570, 140, 110], ['pine', 700, 380, 110], ['pine', 25, 380, 105],
      ['@lantern', 110, 620, 80], ['@lantern', 615, 620, 80],
      ['@lantern', 100, 850, 80], ['@lantern', 640, 850, 80], ['@lantern', 100, 1100, 80], ['@lantern', 660, 1120, 80],
      ['tent', 60, 1290, 100], ['tent', 660, 1300, 100], ['@lantern', 320, 1360, 80],
    ],
    lights: [[110, 620], [615, 620], [100, 850], [640, 850], [100, 1100], [660, 1120], [320, 1360]],
    night: true,
    light: [['rgba(18,18,70,.40)', 'rgba(35,25,80,.30)']],
  },
  battle1: {
    ground: { field: 'canyon_rock', camp: 'powder' },
    over: () => cliffs('#9a9aa6', '#6e6c7a'),
    decor: [['rock', 120, 170, 60], ['rock', 600, 140, 55], ['snowdrift', 330, 110, 60], ['rock', 110, 620, 50], ['rock', 610, 620, 55],
      ['tent', 60, 1270, 110], ['tent', 660, 1300, 110], ['igloo', 70, 1380, 90], ['logs', 300, 1330, 50],
    ],
    light: [['rgba(95,105,135,.16)', 'rgba(95,105,135,.08)']],
  },
  battle2: {
    ground: { field: 'glacier_ice', camp: 'powder', veil: 'rgba(235,248,255,.3)' },
    over: () => cliffs('#9fd6f2', '#5aa7d6', true),
    decor: [['ice_rock', 120, 170, 80], ['ice_rock', 600, 140, 90], ['ice_rock', 330, 110, 60], ['ice_rock', 110, 620, 70], ['ice_rock', 610, 620, 75],
      ['tent', 60, 1270, 110], ['tent', 660, 1300, 110], ['igloo', 70, 1380, 90], ['logs', 300, 1330, 50],
    ],
    light: [['rgba(80,175,235,.18)', 'rgba(150,215,255,.08)']],
  },
};
const scene = () => (G.v && SCENES[G.v.id]) || SCENES.camp;

// 村ごとの設備の絵（ChatGPT で作った img/<名前>_<村の id>.webp）。無い村・読めないときはいつもの絵
const FACILITY_SETS = {
  lake: ['grill_off', 'grill_on', 'counter', 'station_raw', 'station_cooked', 'tent'],
};
Object.entries(FACILITY_SETS).forEach(([v, names]) => names.forEach(n => { CONFIG.sprites[`${n}_${v}`] = CONFIG.sprites[n] || '?'; }));
function fac(name) {
  const set = G.v && FACILITY_SETS[G.v.id], own = `${name}_${G.v && G.v.id}`;
  return set && set.includes(name) && images[own] ? own : name;
}

// ---------------- 置き物 ----------------
function sceneDecor() {
  const list = scene().decor || CONFIG.decor;
  return list.map(([name, x, y, h]) => ({ name, x, y, h }));
}
function edgeName(name) {
  const e = scene().edge;
  return (e && e[name]) || name;
}
function drawDecorItem(d) {
  shadow(d.x, d.y, d.h * 0.3);
  if (d.name[0] === '@') PROPS[d.name.slice(1)](d.x, d.y, d.h);
  else drawSprite(d.name, d.x, d.y, d.h);
}

// ここで描く置き物（足元が (x, y)、高さ h）
const PROPS = {
  fishrack(x, y, h) {   // 魚を干す棚
    const w = h * 0.9;
    ctx.save();
    ctx.strokeStyle = '#7a4f2a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 2, y - h); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y - h);
    ctx.moveTo(x - w / 2 - 6, y - h + 6); ctx.lineTo(x + w / 2 + 6, y - h + 6); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const fx = x - w / 3 + i * w / 3, fy = y - h + 26;
      ctx.fillStyle = i === 1 ? '#8fa9c4' : '#a9bfd6';
      ctx.beginPath(); ctx.ellipse(fx, fy, 6, 15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(fx, fy + 12); ctx.lineTo(fx - 7, fy + 24); ctx.lineTo(fx + 7, fy + 24); ctx.fill();
      ctx.strokeStyle = '#5b3a1d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fx, y - h + 6); ctx.lineTo(fx, fy - 14); ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    roundRect(x - w / 2 - 8, y - h + 1, w + 16, 6, 3); ctx.fill();   // 棚に積もった雪
    ctx.restore();
  },
  boat(x, y, h) {       // 氷に閉じこめられた小舟
    const w = h * 1.5;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.08);
    ctx.fillStyle = '#6b4526';
    ctx.beginPath(); ctx.moveTo(-w / 2, -h * 0.42); ctx.lineTo(w / 2, -h * 0.48); ctx.quadraticCurveTo(w * 0.42, 0, 0, 0); ctx.quadraticCurveTo(-w * 0.42, 0, -w / 2, -h * 0.42); ctx.fill();
    ctx.fillStyle = '#8a5a32'; ctx.fillRect(-w / 2 + 6, -h * 0.44, w - 12, 6);
    ctx.strokeStyle = '#4a2f18'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -h * 0.44); ctx.lineTo(0, -h * 1.25); ctx.stroke();
    ctx.fillStyle = '#e9e2d0';                       // たたんだ帆
    ctx.beginPath(); ctx.moveTo(2, -h * 1.2); ctx.lineTo(w * 0.34, -h * 0.62); ctx.lineTo(2, -h * 0.62); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-w * 0.15, -h * 0.46, w * 0.3, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  crate(x, y, h) {      // 港の積み荷
    ctx.save();
    ctx.fillStyle = '#9a6a3a'; ctx.fillRect(x - h / 2, y - h, h, h);
    ctx.strokeStyle = '#6b4526'; ctx.lineWidth = 3;
    ctx.strokeRect(x - h / 2 + 1.5, y - h + 1.5, h - 3, h - 3);
    ctx.beginPath(); ctx.moveTo(x - h / 2, y - h); ctx.lineTo(x + h / 2, y); ctx.stroke();
    ctx.fillStyle = '#fff'; roundRect(x - h / 2 - 2, y - h - 4, h + 4, 8, 4); ctx.fill();
    ctx.restore();
  },
  post(x, y, h) {       // 船をつなぐ杭
    ctx.save();
    ctx.fillStyle = '#5b3a1d'; roundRect(x - 8, y - h, 16, h, 5); ctx.fill();
    ctx.strokeStyle = '#c9a36a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 8, y - h * 0.6); ctx.lineTo(x + 8, y - h * 0.55); ctx.moveTo(x - 8, y - h * 0.45); ctx.lineTo(x + 8, y - h * 0.4); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y - h, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  sign(x, y, h) {       // 峠の道しるべ（画像があればそれを使う）
    drawSprite(pick('signpost', 'rock'), x, y, h);
  },
  lantern(x, y, h) {    // 王都の街灯
    const on = 0.85 + Math.sin(G.time * 3 + x) * 0.08;
    ctx.save();
    ctx.fillStyle = '#2d2f45'; ctx.fillRect(x - 3, y - h, 6, h);
    ctx.fillRect(x - 9, y - 4, 18, 6);
    ctx.fillStyle = `rgba(255,214,110,${on})`;
    roundRect(x - 10, y - h - 20, 20, 24, 5); ctx.fill();
    ctx.strokeStyle = '#2d2f45'; ctx.lineWidth = 3; roundRect(x - 10, y - h - 20, 20, 24, 5); ctx.stroke();
    ctx.fillStyle = '#2d2f45';
    ctx.beginPath(); ctx.moveTo(x - 14, y - h - 20); ctx.lineTo(x, y - h - 32); ctx.lineTo(x + 14, y - h - 20); ctx.fill();
    ctx.restore();
  },
  banner(x, y, h) {     // 王家の旗
    const wave = Math.sin(G.time * 2.4 + x) * 5;
    ctx.save();
    ctx.fillStyle = '#3a3550'; ctx.fillRect(x - 3, y - h, 6, h);
    ctx.fillStyle = '#e8c35a'; ctx.beginPath(); ctx.arc(x, y - h, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6a3fb0';
    ctx.beginPath(); ctx.moveTo(x + 3, y - h + 6); ctx.lineTo(x + 46, y - h + 10 + wave); ctx.lineTo(x + 40, y - h + 34 + wave); ctx.lineTo(x + 46, y - h + 58 + wave); ctx.lineTo(x + 3, y - h + 52); ctx.fill();
    ctx.fillStyle = '#e8c35a';
    ctx.beginPath(); ctx.arc(x + 22, y - h + 31 + wave * 0.5, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
};

// ---------------- 地面（ChatGPT で作った村ごとのタイル。img/ground_<名前>.webp） ----------------
// field＝狩り場、camp＝柵より手前。veil / campVeil は絵をやわらげる白いもや。画像がまだ読めていなければ、いつもの雪の地面のまま
const groundImgs = {}, groundPats = {};
function groundPattern_(name) {
  if (!name) return null;
  if (!groundImgs[name]) {
    const im = new Image();
    im.src = `img/ground_${name}.webp`;
    groundImgs[name] = im;
  }
  const im = groundImgs[name];
  if (!im.complete || !im.naturalWidth) return null;
  return groundPats[name] || (groundPats[name] = ctx.createPattern(im, 'repeat'));
}
// 村に入ってすぐ描けるよう、はじめに全部読み込んでおく
Object.values(SCENES).forEach(sc => sc.ground && [sc.ground.field, sc.ground.camp].forEach(n => {
  if (!groundImgs[n]) { groundImgs[n] = new Image(); groundImgs[n].src = `img/ground_${n}.webp`; }
}));
// 村の地面を描けたら true（描けなければ呼び出し側がいつもの地面を描く）
function drawSceneBase(W, H) {
  const gr = scene().ground;
  if (!gr) return false;
  const camp = groundPattern_(gr.camp), field = groundPattern_(gr.field);
  if (!camp || !field) return false;
  // タイル1枚（512px）をワールド420単位で敷く（いつもの地面と同じ細かさ）。fieldSize で狩り場だけ大きくできる
  const fill = (pat, size = 420) => { const k = size / 512; ctx.save(); ctx.scale(k, k); ctx.fillStyle = pat; ctx.fillRect(-60 / k, -60 / k, (W + 120) / k, (H + 120) / k); ctx.restore(); };
  fill(camp);
  if (gr.campVeil) { ctx.fillStyle = gr.campVeil; ctx.fillRect(0, 0, W, H); }
  const a = G.hunt;
  ctx.save();
  roundRect(a.x, a.y - 200, a.w, a.h + 200, 40); ctx.clip();   // 狩り場（奥は画面の上まで）
  fill(field, gr.fieldSize);
  if (gr.veil) { ctx.fillStyle = gr.veil; ctx.fillRect(0, 0, W, H); }   // 濃すぎる絵をやわらげる
  ctx.restore();
  return true;
}

// ---------------- 地面の目印 ----------------
function drawSceneGround(layer) {
  const f = scene()[layer];
  if (f) { ctx.save(); f(G.hunt); ctx.restore(); }
}

// 凍った湖：氷の地面（ground）のふちに雪の縁どり、氷に開けた釣りの穴
function lakeIce(a) {
  roundRect(a.x, a.y - 200, a.w, a.h + 200, 40);   // drawSceneBase の狩り場と同じ形
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 12; ctx.stroke();
  [[a.x + 80, a.y + a.h - 80], [a.x + a.w - 90, a.y + 130], [a.x + 90, a.y + 150]].forEach(([x, y]) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(x, y, 26, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f4e7a';
    ctx.beginPath(); ctx.ellipse(x, y + 1, 19, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6b4526'; ctx.lineWidth = 3;           // 釣りざお
    ctx.beginPath(); ctx.moveTo(x + 24, y + 4); ctx.lineTo(x + 6, y - 30); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,40,40,.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 6, y - 30); ctx.lineTo(x + 2, y); ctx.stroke();
  });
}

// 両側の崖（峠・峡谷。ice なら氷河の氷の壁）。キャンプの置き物と重ならないよう、狩り場のまわりだけ
function cliffs(light, dark, ice) {
  const H = CONFIG.hunt.y + CONFIG.hunt.h + 140, W = CONFIG.world.w;
  [[0, 1], [W, -1]].forEach(([x0, dir]) => {
    ctx.beginPath();
    ctx.moveTo(x0, -40);
    for (let y = -40; y <= H + 40; y += 55) {
      const k = hash(y * 0.37 + dir * 11);
      ctx.lineTo(x0 + dir * (50 + k * 42), y);
      ctx.lineTo(x0 + dir * (38 + hash(y * 0.91 + dir) * 30), y + 28);
    }
    ctx.lineTo(x0, H + 40); ctx.closePath();
    const g = ctx.createLinearGradient(x0, 0, x0 + dir * 95, 0);
    g.addColorStop(0, dark); g.addColorStop(1, light);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = ice ? 'rgba(255,255,255,.85)' : 'rgba(40,45,60,.35)'; ctx.lineWidth = 3; ctx.stroke();
    // 岩の出っぱりに積もった雪（氷河は光る結晶）
    for (let y = 0; y < H; y += 110) {
      const k = hash(y * 1.3 + dir * 5);
      const x = x0 + dir * (30 + k * 40);
      if (ice) {
        ctx.fillStyle = 'rgba(235,250,255,.9)';
        ctx.beginPath(); ctx.moveTo(x - 10, y + 30); ctx.lineTo(x, y - 18 - k * 20); ctx.lineTo(x + 10, y + 30); ctx.fill();
        ctx.fillStyle = 'rgba(160,220,250,.9)';
        ctx.beginPath(); ctx.moveTo(x + 4, y + 30); ctx.lineTo(x + 14, y - k * 14); ctx.lineTo(x + 22, y + 30); ctx.fill();
      } else {
        ctx.fillStyle = '#f4f8fc';
        ctx.beginPath(); ctx.ellipse(x, y, 26 + k * 14, 9, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  });
}

// 港：狩り場の奥の海も凍っている（暗い水面にすると、落ちそうに見えるので）
function harbor() {
  const W = CONFIG.world.w, a = G.hunt;
  const g = ctx.createLinearGradient(0, 0, 0, a.y);
  g.addColorStop(0, '#a9d2ec'); g.addColorStop(1, '#c6e3f4');
  ctx.fillStyle = g; ctx.fillRect(-40, -40, W + 80, a.y + 50);
  ctx.fillStyle = 'rgba(240,248,255,.95)';
  for (let i = 0; i < 9; i++) {
    const x = 30 + i * 80 + hash(i * 3.7) * 30, y = 12 + hash(i * 1.9) * (a.y - 30);
    ctx.beginPath(); ctx.ellipse(x, y, 26 + hash(i) * 18, 9 + hash(i * 2) * 5, hash(i * 5) - 0.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#f7fbff';                                 // 岸の雪
  ctx.beginPath(); ctx.moveTo(-40, a.y + 10);
  for (let x = -40; x <= W + 40; x += 40) ctx.lineTo(x, a.y - 4 + hash(x) * 18);
  ctx.lineTo(W + 40, a.y + 30); ctx.lineTo(-40, a.y + 30); ctx.fill();
}

// 王都：狩り場の奥に城壁と塔
function castleWall() {
  const W = CONFIG.world.w, a = G.hunt, base = a.y - 5;
  ctx.fillStyle = '#8c88a8'; ctx.fillRect(-40, -40, W + 80, base + 40);
  ctx.fillStyle = '#a7a3c2';
  for (let x = -20; x < W + 40; x += 44) ctx.fillRect(x, base - 16, 26, 18);     // 胸壁
  ctx.strokeStyle = 'rgba(60,55,90,.35)'; ctx.lineWidth = 2;
  for (let y = -10, r = 0; y < base; y += 22, r++) {
    ctx.beginPath(); ctx.moveTo(-40, y); ctx.lineTo(W + 40, y); ctx.stroke();
    for (let x = (r % 2) * 28; x < W; x += 56) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 22); ctx.stroke(); }
  }
  ctx.fillStyle = '#fff'; ctx.fillRect(-40, base, W + 80, 7);            // 壁の上の雪
  [[70, 1], [W - 70, 1], [W / 2, 1.25]].forEach(([x, s]) => {           // 塔
    const w = 70 * s, top = base - 150 * s;
    ctx.fillStyle = '#9894b6'; ctx.fillRect(x - w / 2, top, w, base - top + 8);
    ctx.fillStyle = '#5b3f9e';
    ctx.beginPath(); ctx.moveTo(x - w / 2 - 8, top); ctx.lineTo(x, top - 60 * s); ctx.lineTo(x + w / 2 + 8, top); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(x - 12, top - 36 * s); ctx.lineTo(x, top - 60 * s); ctx.lineTo(x + 12, top - 36 * s); ctx.fill();
    ctx.fillStyle = 'rgba(255,214,110,.95)';
    roundRect(x - 8, top + 30 * s, 16, 24, 8); ctx.fill();               // 灯りのともる窓
  });
}

// ---------------- 光（画面に重ねる。W, H は画面の大きさ） ----------------
function drawSceneLight(W, H) {
  const sc = scene();
  if (sc.light) {
    const [top, bottom] = sc.light[0];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (sc.wind) {                                        // 峠：横なぐりの吹雪
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const sp = 0.6 + hash(i * 2.9) * 0.8;
      const x = ((hash(i * 7.3) + G.time * sp) % 1.2 - 0.1) * W, y = ((hash(i * 4.1) + G.time * sp * 0.35) % 1) * H;
      ctx.lineWidth = 1 + hash(i) * 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 40 - hash(i * 3) * 40, y - 14); ctx.stroke();
    }
    ctx.restore();
  }
  if (!sc.night) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 星
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  for (let i = 0; i < 26; i++) {
    const tw = 0.5 + 0.5 * Math.sin(G.time * 2 + i * 1.7);
    ctx.globalAlpha = 0.3 + tw * 0.5;
    ctx.beginPath(); ctx.arc(hash(i * 3.3) * W, H * 0.1 + hash(i * 5.1) * H * 0.3, 1 + hash(i) * 1.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // オーロラ（画面の上をゆっくり揺れる光の帯）
  [['rgba(80,255,170,.16)', 0], ['rgba(120,200,255,.12)', 1.3], ['rgba(190,120,255,.11)', 2.6]].forEach(([c, ph], i) => {
    ctx.strokeStyle = c; ctx.lineWidth = 34 - i * 6; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let x = -20; x <= W + 20; x += 16) {
      const y = H * (0.17 + i * 0.045) + Math.sin(x * 0.012 + G.time * 0.5 + ph) * 18 + Math.sin(x * 0.031 + G.time * 0.3) * 8;
      if (x < 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
  // 街灯・グリル・焚き火のまわりのあたたかい灯り
  const cam = G.cam, pts = (sc.lights || []).map(([x, y]) => [x, y - 95, 110]);
  G.grills.forEach(gr => pts.push([gr.x, gr.y - 30, 120]));
  if (G.fire) pts.push([G.firePos.x, G.firePos.y - 30, 170]);
  pts.forEach(([x, y, r]) => {
    const sx = (x - cam.x) * cam.scale, sy = (y - cam.y) * cam.scale, sr = r * cam.scale;
    if (sx < -sr || sx > W + sr || sy < -sr || sy > H + sr) return;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    g.addColorStop(0, 'rgba(255,190,90,.35)'); g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = g; ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  });
  ctx.restore();
}
