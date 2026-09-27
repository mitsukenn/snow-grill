'use strict';

// ============================================================
//  村（ステージ）とストーリー
//  村ごとに「○人救えば開拓完了」。白クマの強さ・雪・地面の色・値段が変わる
//  お金と強化レベルは全部の村で共通（主人公の成長）、設備は村ごと
// ============================================================

// 会話に出てくる人（img は img/ の画像名）
const CHARS = {
  narr: { name: '', img: null },
  hero: { name: 'ユキト', img: 'hero_idle' },
  chief: { name: '村長ボルグ', img: 'helper_cook' },
  rina: { name: 'ハンターのリナ', img: 'helper_hunter' },
  mira: { name: '湖の村のミラ', img: 'villager_f' },
  kid: { name: '峠の子ども', img: 'villager_child' },
  sailor: { name: '船乗りガンツ', img: 'villager_m' },
  happy: { name: '王都の人々', img: 'villager_happy' },
  // レベル2
  oba: { name: '湯の里のおばば', img: 'villager_old_f' },
  garu: { name: '豪傑ガルド', img: 'brute_idle' },
  dwan: { name: '鉱山のドワン', img: 'villager_old_m' },
  noel: { name: '森の少女ノエル', img: 'villager_girl' },
  captain: { name: '砦の隊長', img: 'swordsman' },
};

// level: レベル（全体マップのタブ）。書いていなければ 1
// map: 全体マップ上の位置（%）
// bearHp: 白クマの体力の倍率、meatBonus: 1頭から落ちる肉の追加、extraBears: 同時に出る白クマの追加
// priceMul: 設備の値段の倍率、want: お客さんが欲しがる肉の数、snow: 雪の量、tint: 地面に重ねる色
const VILLAGES = [
  {
    id: 'camp', name: 'はじまりの雪原キャンプ', goal: 40,
    map: { x: 28, y: 84 }, bearHp: 1, meatBonus: 0, extraBears: 0, priceMul: 1, want: [1, 3], snow: 60, tint: null,
    intro: [
      ['narr', '百年に一度の大寒波が、北の大地をおそった――'],
      ['narr', '食べ物は凍りつき、人々は寒さにふるえている…'],
      ['chief', '旅の人…！ この村はもう限界じゃ。せめて、あたたかい食べ物があれば…'],
      ['hero', 'まかせてください！ この斧で白クマを狩って、みんなに焼いた肉を届けます！'],
      ['chief', 'おお…！ グリルはこっちじゃ。頼んだぞ、若いの！'],
    ],
    outro: [
      ['chief', '村のみんなに笑顔が戻った！ 本当にありがとう、ユキト！'],
      ['rina', 'あんたが噂の肉焼き勇者ね。私はリナ。湖の村から助けを求める手紙が届いたの。'],
      ['hero', '湖の村か…よし、次はそこへ行こう！'],
    ],
  },
  {
    id: 'lake', name: '凍った湖の村', goal: 70,
    map: { x: 70, y: 68 }, bearHp: 1.4, meatBonus: 1, extraBears: 0, priceMul: 1.4, want: [1, 3], snow: 80, tint: 'rgba(110,170,255,.12)',
    intro: [
      ['mira', '湖が凍って、魚が一匹もとれないの…みんなおなかをすかせてる。'],
      ['hero', '大丈夫。ここにもグリルを立てよう！'],
      ['rina', 'このあたりの白クマは少しタフよ。気をつけて！'],
    ],
    outro: [
      ['mira', 'あったかい…！ ユキトさん、ありがとう！'],
      ['mira', '峠の向こうの村とは、吹雪で連絡がとれなくなっているの。'],
      ['hero', '吹雪の峠か…行ってみよう！'],
    ],
  },
  {
    id: 'battle1', name: '白い峡谷の決戦', battle: true, icon: 'giant_idle',
    map: { x: 50, y: 59 }, bearHp: 1.5, meatBonus: 1, extraBears: 0, priceMul: 1.5, want: [1, 3], snow: 110, tint: 'rgba(170,190,230,.16)',
    giant: { name: '雪の巨人', hpMul: 1, dmgMul: 1, tint: null },
    intro: [
      ['rina', 'ユキト、大変！ 峠へ続く峡谷を、白クマの群れがふさいでいるの！'],
      ['narr', '群れの奥から、地ひびきのような足音が聞こえる…'],
      ['rina', '群れを率いているのは「雪の巨人」…！ 援軍を連れてきたわ。バリケードを守りながら戦って！'],
      ['hero', '肉を焼いてお金をかせいで、強化しながら迎え撃つ！'],
    ],
    outro: [
      ['rina', 'やった…！ 雪の巨人をたおしたわ！'],
      ['hero', 'これで峠への道がひらけた。先を急ごう！'],
    ],
  },
  {
    id: 'pass', name: '吹雪の峠', goal: 110,
    map: { x: 30, y: 50 }, bearHp: 1.8, meatBonus: 1, extraBears: 1, priceMul: 1.9, want: [2, 4], snow: 170, tint: 'rgba(200,215,240,.18)',
    intro: [
      ['narr', '吹雪がやまない峠。前も見えないほどの雪が降っている…'],
      ['kid', 'おにいちゃん…さむいよ…'],
      ['hero', 'すぐにあったかい肉を焼いてあげるからな！'],
      ['rina', 'ここの白クマは群れで出るわ。強化も忘れずにね！'],
    ],
    outro: [
      ['kid', 'おいしかった！ おにいちゃん、かっこいい！'],
      ['rina', '港町から船乗りが来たわ。港にも大勢の人が取り残されてるって。'],
      ['hero', 'よし、港町へ急ごう！'],
    ],
  },
  {
    id: 'port', name: '氷河の港町', goal: 160,
    map: { x: 70, y: 32 }, bearHp: 2.3, meatBonus: 2, extraBears: 1, priceMul: 2.5, want: [2, 4], snow: 100, tint: 'rgba(90,150,220,.14)',
    boss: true,
    intro: [
      ['sailor', '海も凍っちまって、船が出せねえ！ おまけにデカい白クマまでうろついてやがる！'],
      ['hero', 'ボス白クマか…！ でも肉もたくさん取れるはず！'],
      ['sailor', 'あんたなら頼りになりそうだ。港のみんなを頼む！'],
    ],
    outro: [
      ['sailor', 'がっはっは！ 港に活気が戻ったぜ！'],
      ['sailor', 'だが、この寒波の元は北の果ての王都にあるらしい…「氷の大白クマ」が目を覚ましたとか。'],
      ['hero', '王都へ行こう。寒波を終わらせるんだ！'],
    ],
  },
  {
    id: 'battle2', name: '氷河の大巨人', battle: true, icon: 'giant_idle',
    map: { x: 60, y: 21 }, bearHp: 2.4, meatBonus: 2, extraBears: 1, priceMul: 2.7, want: [2, 4], snow: 140, tint: 'rgba(120,170,240,.18)',
    giant: { name: '氷の大巨人', hpMul: 2.6, dmgMul: 1.6, tint: 'hue-rotate(185deg) saturate(1.6) brightness(1.05)' },
    intro: [
      ['sailor', 'おい、王都へ続く氷河に、とんでもねえデカブツがいやがる！'],
      ['rina', '「氷の大巨人」…雪の巨人よりずっと強いわ。強化はしっかりしてきた？'],
      ['hero', 'みんなの力を合わせれば、きっと勝てる！'],
    ],
    outro: [
      ['sailor', 'がっはっは！ あの大巨人をやっつけちまうとはな！'],
      ['rina', 'この先が王都よ。寒波の元をたちに行きましょう！'],
    ],
  },
  {
    id: 'capital', name: '北の果ての王都', goal: 240,
    map: { x: 42, y: 13 }, bearHp: 3, meatBonus: 3, extraBears: 2, priceMul: 3.2, want: [2, 5], snow: 130, tint: 'rgba(150,130,220,.12)',
    boss: true,
    intro: [
      ['narr', '北の果ての王都。凍りついた城のまわりで、人々が肩を寄せ合っている…'],
      ['rina', 'ここが最後の場所ね。ユキト、今までの力を全部ぶつけて！'],
      ['hero', 'みんなのために…最後まで肉を焼き続ける！'],
    ],
    outro: [
      ['happy', 'ありがとう、肉焼きの勇者さま！'],
      ['narr', '人々のあたたかい笑顔が集まったとき、大寒波はゆっくりと去っていった――'],
      ['narr', '北の大地に、春がやってきた。'],
      ['rina', 'やったわね、ユキト！ …でも、グリルの火はまだ消さないでしょ？'],
      ['hero', 'もちろん！ おなかをすかせた人がいる限り、焼き続けるさ！'],
      ['narr', '～ レベル1 おしまい ～'],
      ['narr', '…ところが、北の山脈の向こうから、もっと冷たい風が吹きはじめた。'],
      ['rina', '山の向こうにも村があるの。寒波の本当の元は、あっちかもしれない…！'],
      ['narr', 'レベル2「氷の果て」がひらいた！　全体マップのタブから行けます'],
    ],
  },
  // =================== レベル2「氷の果て」：敵が強い。豪傑（大きな斧の助っ人）が1〜2人来てくれる ===================
  {
    id: 'onsen', level: 2, icon: 'campfire', name: '湯けむりの雪の里', goal: 280,
    map: { x: 26, y: 86 }, bearHp: 3.4, meatBonus: 3, extraBears: 2, priceMul: 3.6, want: [2, 5], snow: 90, tint: 'rgba(255,200,170,.08)',
    intro: [
      ['narr', '山脈をこえると、湯けむりの立つ里があった。けれど温泉まで凍りはじめている…'],
      ['oba', 'おや、旅の人かい。この寒さじゃ、湯も肉もあったまらないねえ…'],
      ['hero', 'まかせてください！ あったかい肉を焼いて、里を元気にします！'],
      ['rina', 'このあたりの白クマは、レベル1よりずっと手ごわいわ。強化を忘れずにね！'],
    ],
    outro: [
      ['oba', '湯もみんなの心も、ぽかぽかになったよ。ありがとうねえ。'],
      ['oba', 'そうそう、里には大斧をかついだ豪快な男がいてねえ。あんたの肉の噂をしていたよ。'],
      ['hero', '大斧の男…？ よし、次は山の上の鉱山町だ！'],
    ],
  },
  {
    id: 'mine', level: 2, icon: 'ice_rock', name: '氷晶の鉱山町', goal: 330,
    map: { x: 70, y: 74 }, bearHp: 3.8, meatBonus: 3, extraBears: 2, priceMul: 4.1, want: [2, 5], snow: 110, tint: 'rgba(120,200,255,.10)',
    intro: [
      ['dwan', '坑道が氷の結晶でうまっちまって、仕事にならんのじゃ。腹もへったわい…'],
      ['hero', 'まずはあったかい肉で元気を出してもらおう！'],
      ['rina', 'ここの白クマは硬いわ。囲まれないように気をつけて！'],
    ],
    outro: [
      ['dwan', 'これで坑道にもどれるわい！ 礼じゃ、この先の谷は気をつけろよ。'],
      ['dwan', '雪崩の谷に、山のようにでかい巨人が居すわっておるんじゃ…'],
    ],
  },
  {
    id: 'battle3', level: 2, name: '雪崩の谷の決戦', battle: true, icon: 'giant_idle',
    map: { x: 48, y: 62 }, bearHp: 4, meatBonus: 3, extraBears: 2, priceMul: 4.4, want: [2, 5], snow: 190, tint: 'rgba(200,210,235,.18)',
    giant: { name: '雪崩の巨人', hpMul: 3.6, dmgMul: 2, tint: 'saturate(.7) brightness(1.08)', debut: true },   // debut：ピンチに豪傑ガルドが初登場
    intro: [
      ['rina', '谷の奥から雪崩のような足音…！ 群れを連れて巨人が来るわ！'],
      ['hero', 'バリケードを守りながら、みんなで迎え撃とう！'],
    ],
    outro: [
      ['garu', 'どうだ見たか！ 雪崩もわしらの勢いには勝てんかったな！'],
      ['rina', 'この先は樹氷の森。道に迷わないようにね。'],
    ],
  },
  {
    id: 'forest', level: 2, icon: 'pine', name: '樹氷の森の村', goal: 400,
    map: { x: 24, y: 48 }, bearHp: 4.5, meatBonus: 4, extraBears: 2, priceMul: 4.8, want: [3, 5], snow: 120, tint: 'rgba(170,230,210,.10)',
    intro: [
      ['noel', '森の木がみんな凍って、木の実もとれないの…。村のみんな、ふるえてる。'],
      ['hero', 'ノエル、もう大丈夫。ここにもグリルを立てよう！'],
      ['garu', 'ちびすけ、腹いっぱい食わせてやるからな！'],
    ],
    outro: [
      ['noel', 'あったかい…！ ユキトさん、ガルドさん、ありがとう！'],
      ['noel', '森をぬけた先に、氷の壁でかこまれた砦があるの。兵隊さんたちが寒さで動けないって…'],
    ],
  },
  {
    id: 'fortress', level: 2, icon: 'watchtower', name: '氷壁の砦', goal: 460,
    map: { x: 68, y: 38 }, bearHp: 5, meatBonus: 4, extraBears: 3, priceMul: 5.4, want: [3, 6], snow: 140, tint: 'rgba(150,170,220,.12)',
    boss: true,
    intro: [
      ['captain', '砦の兵はみな凍えて、剣も持てぬ…。そのうえ大白クマまでうろついている。'],
      ['hero', '肉を焼いて、みんなの力をとりもどそう！'],
      ['garu', '大白クマか。相手にとって不足なしだわい！'],
    ],
    outro: [
      ['captain', '兵たちが立ち上がった！ 恩にきるぞ、肉焼きの勇者たち！'],
      ['captain', 'だが極光の氷原に、とてつもない大巨人がいる。気をつけて進め！'],
    ],
  },
  {
    id: 'battle4', level: 2, name: '極光の大巨人', battle: true, icon: 'giant_idle',
    map: { x: 44, y: 24 }, bearHp: 5.2, meatBonus: 4, extraBears: 3, priceMul: 5.8, want: [3, 6], snow: 150, tint: 'rgba(170,140,240,.16)',
    giant: { name: '極光の大巨人', hpMul: 5.2, dmgMul: 2.6, tint: 'hue-rotate(230deg) saturate(1.5) brightness(1.05)' },
    intro: [
      ['narr', '空にゆらめくオーロラの下、見上げるほどの大巨人が立ちはだかる…！'],
      ['rina', 'これまでで一番強い相手よ。強化はしっかりしてきた？'],
      ['garu', 'ガッハッハ！ わしら全員でかかれば、どんな巨人も倒せるわい！'],
    ],
    outro: [
      ['rina', 'やった…！ 極光の大巨人をたおしたわ！'],
      ['hero', 'この先が、白熊王の氷の城…！'],
    ],
  },
  {
    id: 'throne', level: 2, icon: 'bear_boss', name: '白熊王の氷の城', goal: 560,
    map: { x: 60, y: 10 }, bearHp: 6, meatBonus: 5, extraBears: 3, priceMul: 6.5, want: [3, 6], snow: 160, tint: 'rgba(140,160,240,.14)',
    boss: true,
    intro: [
      ['narr', '氷でできた城。玉座のまわりを、巨大な白クマたちが守っている…'],
      ['rina', 'ここが寒波の本当の元…！ ユキト、ガルド、行くわよ！'],
      ['garu', '最後の大仕事だ！ 腹いっぱいの肉で、城ごとあっためてやるわい！'],
    ],
    outro: [
      ['narr', '城に集まった人々の笑顔が、氷の城をゆっくりととかしていった――'],
      ['garu', 'ガッハッハ！ やったな相棒！ 最高の肉だったわい！'],
      ['rina', 'これで北の果ての寒波もおしまい…かしら？'],
      ['hero', 'また寒い日が来ても、グリルの火があればきっと大丈夫さ！'],
      ['narr', '～ レベル2 おしまい ～　（このあとも自由に遊べます）'],
    ],
  },
];

// 豪傑ガルドの初登場（レベル2最初の決戦で、ピンチになったとき。1回だけ）
const GARU_DEBUT = [
  ['narr', '谷じゅうにひびく笑い声とともに、大斧の男が空から降ってきた！'],
  ['garu', 'ガッハッハ！ 待たせたな、肉焼きの勇者！'],
  ['hero', 'あ、あなたは…！？'],
  ['garu', 'わしは豪傑ガルド！ 湯けむりの里で、おぬしのうまい肉の噂を聞いてな。'],
  ['garu', '礼にひと暴れさせてもらうぞ！ 巨人なんぞ、この大斧で叩き割ってくれるわ！'],
  ['rina', 'すごい助っ人が来たわ…！ ユキト、いまのうちに立て直して！'],
];

const LEVELS = [
  { n: 1, name: '北の大地' },
  { n: 2, name: '氷の果て' },
];
const levelOf = v => v.level || 1;

const villageById = id => VILLAGES.find(v => v.id === id) || VILLAGES[0];

// ============================================================
//  会話シーン：タップで次へ。最後まで読んだら onDone
// ============================================================
function showStory(lines, onDone) {
  const box = $('story');
  let i = 0;
  const show = () => {
    const [who, text] = lines[i];
    const c = CHARS[who] || CHARS.narr;
    const face = $('story-face');
    face.classList.toggle('hidden', !c.img);
    if (c.img) face.src = IMG(c.img);
    $('story-name').textContent = c.name;
    $('story-name').classList.toggle('hidden', !c.name);
    $('story-box').classList.toggle('narr', !c.name);
    // 1文字ずつ表示
    const el = $('story-text');
    el.textContent = '';
    let n = 0;
    clearInterval(showStory.timer);
    showStory.timer = setInterval(() => {
      el.textContent = text.slice(0, ++n);
      if (n >= text.length) clearInterval(showStory.timer);
    }, 28);
    box.dataset.full = text;
    Sound.sfx.click();
  };
  box.onclick = () => {
    const el = $('story-text');
    if (el.textContent !== box.dataset.full) {   // 表示途中ならまず全文を出す
      clearInterval(showStory.timer);
      el.textContent = box.dataset.full;
      return;
    }
    if (++i < lines.length) show();
    else {
      box.classList.add('hidden');
      G.paused = G.mapOpen;
      if (onDone) onDone();
    }
  };
  G.paused = true;
  G.joy = null;
  G.touch = null;
  G.moveTo = null;
  box.classList.remove('hidden');
  show();
}

// ============================================================
//  全体マップ
// ============================================================
function villageUnlocked(i) {
  return i === 0 || !!(SAVE.villages[VILLAGES[i - 1].id] || {}).done;
}

// レベルがひらいている＝そのレベルの最初の村に行ける
function levelUnlocked(n) {
  const i = VILLAGES.findIndex(v => levelOf(v) === n);
  return i >= 0 && villageUnlocked(i);
}

function openMap(open = true, level) {
  G.mapOpen = open;
  G.paused = open;
  G.joy = null;
  G.touch = null;
  G.moveTo = null;
  $('map').classList.toggle('hidden', !open);
  if (!open) return;
  Sound.sfx.click();
  // 見せるレベル（はじめは今いる村のレベル）。タブで切りかえる
  G.mapLevel = level || levelOf(G.v);
  const lv = LEVELS.find(l => l.n === G.mapLevel) || LEVELS[0];
  $('map-title').textContent = `🗺 レベル${lv.n}　${lv.name}`;
  $('map-tabs').innerHTML = '';
  LEVELS.forEach(l => {
    const t = document.createElement('button');
    const ok = levelUnlocked(l.n);
    t.className = 'map-tab' + (l.n === G.mapLevel ? ' on' : '');
    t.textContent = ok ? `レベル${l.n}` : `🔒 レベル${l.n}`;
    t.disabled = !ok;
    t.onclick = () => openMap(true, l.n);
    $('map-tabs').appendChild(t);
  });
  const nodes = $('map-nodes');
  nodes.innerHTML = '';
  // 村と村をつなぐ道（このレベルの村だけ）
  const here = VILLAGES.map((v, i) => ({ v, i })).filter(o => levelOf(o.v) === G.mapLevel);
  const path = here.map(o => `${o.v.map.x},${o.v.map.y}`).join(' ');
  const done = here.filter(o => villageUnlocked(o.i)).map(o => `${o.v.map.x},${o.v.map.y}`).join(' ');
  $('map-path').innerHTML = `<polyline points="${path}" class="road"/><polyline points="${done}" class="road open"/>`;
  here.forEach(({ v, i }) => {
    const st = SAVE.villages[v.id] || {};
    const unlocked = villageUnlocked(i);
    const b = document.createElement('button');
    b.className = 'map-node' + (v.battle ? ' battle' : '') + (st.done ? ' done' : '') + (!unlocked ? ' locked' : '') + (v.id === G.cur ? ' current' : '');
    b.style.left = v.map.x + '%';
    b.style.top = v.map.y + '%';
    const icon = v.icon || ['tent', 'igloo', 'campfire', 'logs', 'counter'][i % 5];
    b.innerHTML = `<img src="${IMG(icon)}" alt=""><span class="map-name">${v.name}</span>
      <span class="map-state">${st.done ? (v.battle ? '★ 撃破' : '★ 開拓完了') : !unlocked ? '🔒' : v.battle ? '⚔ 決戦' : `${st.rescued || 0} / ${v.goal}人`}</span>`;
    b.disabled = !unlocked;
    b.onclick = () => {
      openMap(false);
      if (v.id !== G.cur) enterVillage(v.id);
      if (!SAVE.seen['intro_' + v.id]) {
        SAVE.seen['intro_' + v.id] = true;
        persist();
        showStory(v.intro);
      }
    };
    nodes.appendChild(b);
  });
}
