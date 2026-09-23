'use strict';

// ============================================================
//  スノーグリル：調整用パラメータ（ブラッシュアップはまずここから）
//  座標は「ワールド座標」（左上が 0,0。y が大きいほど画面の下＝手前）
// ============================================================
const IMG = name => `img/${name}.webp`;

const CONFIG = {
  world: { w: 720, h: 1400 },
  viewWidth: 440,            // 画面の横幅に何ワールド単位を映すか（小さいほどズーム）

  player: {
    speed: 240,              // 移動の速さ
    cap: 8,                  // 背中に積める肉の数（バックパック強化で増える）
    attackRange: 80,         // この距離に白クマがいたら自動で攻撃
    attackCd: 0.42,          // 攻撃の間隔（秒）
    damage: 1,
    pickupRange: 80,         // 落ちている肉を吸い寄せる距離
    transferSec: 0.07,       // グリルや配給台に1個置く間隔
  },

  bear: {
    hp: 3, speed: 38, meat: 4, radius: 36,
    max: 3,                  // 同時に出る白クマの数（狩り場拡張で増える）
    respawnSec: 3.5,
  },
  bossBear: { hp: 14, meat: 12, everyKills: 6 },   // 何頭倒すごとにボス白クマが出るか（狩り場拡張後）

  grill: { cookSec: 0.9, inCap: 30, outCap: 40 },
  counter: { cap: 40, takeSec: 0.28 },

  customer: {
    spawnSec: [2.5, 5],      // 次のお客さんが来るまでの秒数
    maxQueue: 7,
    want: [1, 3],            // 1人が欲しがる肉の数
    price: 6,                // 肉1個あたりの支払い
    speed: 95,
  },

  helper: {
    hunter: { speed: 150, damage: 1, attackCd: 0.7, cap: 5 },
    carrier: { speed: 170, cap: 6 },
  },

  // ---- マップ ----
  hunt: { x: 40, y: 80, w: 640, h: 500 },           // 白クマが歩き回る狩り場
  bossHunt: { x: 40, y: 80, w: 640, h: 500 },
  playerStart: { x: 330, y: 640 },                   // 狩り場のすぐ手前から始める
  firstBear: { x: 330, y: 545 },                     // 最初の白クマはすぐ近くに
  dropLife: 25,              // 拾われなかった肉が消えるまでの秒数
  dropMax: 40,               // 地面に落ちている肉の最大数（超えたら古いものから消える）
  grills: [{ x: 205, y: 860 }, { x: 205, y: 1060 }],
  counters: [{ x: 470, y: 980 }, { x: 610, y: 980 }],

  // ---- 解放（お金を払うと設備が増える）。上から順に1つずつ現れる ----
  unlocks: [
    { id: 'grill2', label: 'グリル2台目', price: 25, x: 205, y: 1060 },
    { id: 'hunter', label: '助っ人ハンター', price: 90, x: 330, y: 680 },
    { id: 'carrier', label: '運び係', price: 140, x: 330, y: 930 },
    { id: 'counter2', label: '配給台2つ目', price: 280, x: 610, y: 980 },
    { id: 'fire', label: 'キャンプファイヤー', price: 380, x: 330, y: 1270 },
    { id: 'huntArea', label: '狩り場拡張（ボス出現）', price: 500, x: 560, y: 660 },
  ],
  // ---- レベルアップ（強化画面）：お金でいつでも強化できる。値段 = cost[0] × cost[1]^レベル ----
  upgrades: [
    { id: 'cap', label: '背中に積める肉', icon: 'meat_raw', unit: '個', base: 8, step: 3, max: 12, cost: [15, 1.45] },
    { id: 'grillCap', label: 'グリルに置ける肉', icon: 'grill_on', unit: '個', base: 10, step: 5, max: 10, cost: [25, 1.5] },
    { id: 'counterCap', label: '配給台に置ける肉', icon: 'counter', unit: '個', base: 10, step: 5, max: 10, cost: [25, 1.5] },
    { id: 'damage', label: '斧の攻撃力', icon: 'hero_attack', unit: '', base: 1, step: 1, max: 8, cost: [40, 1.7] },
    { id: 'speed', label: '移動の速さ', icon: 'hero_walk', unit: '', base: 240, step: 15, max: 8, cost: [30, 1.55] },
    { id: 'cook', label: '焼く速さ', icon: 'meat_cooked', unit: '秒', base: 0.9, step: -0.08, max: 7, cost: [35, 1.6] },
    { id: 'pay', label: '肉1個の支払い', icon: 'coins_pile', unit: '', base: 6, step: 1, max: 15, cost: [50, 1.45] },
  ],

  // リストを全部解放したあとは、何度でも買える強化が順番に出てくる（値段はだんだん上がる）
  repeatUnlocks: [
    { id: 'moreBears', label: '白クマ +1', base: 700, x: 330, y: 680 },
  ],
  repeatGrowth: 1.35,        // 買うたびに値段が何倍になるか

  // ---- 見た目（ChatGPT で作った素材。無ければ絵文字で表示） ----
  sprites: {
    hero_idle: '🧔', hero_walk: '🧔', hero_attack: '🧔',
    helper_hunter: '🏹', helper_cook: '🧑‍🍳',
    villager_m: '🥶', villager_f: '🥶', villager_child: '🥶', villager_happy: '😋',
    bear_walk: '🐻‍❄️', bear_stand: '🐻‍❄️', bear_down: '😵', bear_boss: '🐻‍❄️',
    meat_raw: '🥩', meat_cooked: '🍖', pile_cooked: '🍖', pile_raw: '🥩', coins_pile: '💰',
    grill_off: '🔥', grill_on: '🔥', counter: '🪵', tent: '⛺', campfire: '🔥',
    logs: '🪵', igloo: '🛖', pine: '🌲', rock: '🪨',
    coin: '🪙', hand: '👆',
  },

  // 飾り（木・岩・テントなど）の配置 [名前, x, y, 高さ]
  decor: [
    ['pine', 20, 60, 110], ['pine', 700, 90, 120], ['pine', 30, 330, 100], ['pine', 700, 380, 110],
    ['pine', 690, 600, 100], ['pine', 25, 610, 105], ['rock', 120, 610, 45], ['rock', 620, 620, 50],
    ['tent', 60, 1270, 110], ['tent', 660, 1300, 110], ['igloo', 70, 1380, 90], ['logs', 300, 1330, 50],
    ['pine', 20, 1150, 100], ['pine', 705, 1180, 100],
  ],
};
