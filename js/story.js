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
};

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
      ['narr', '～ おしまい ～　（このあとも自由に遊べます）'],
    ],
  },
];

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
  box.classList.remove('hidden');
  show();
}

// ============================================================
//  全体マップ
// ============================================================
function villageUnlocked(i) {
  return i === 0 || !!(SAVE.villages[VILLAGES[i - 1].id] || {}).done;
}

function openMap(open = true) {
  G.mapOpen = open;
  G.paused = open;
  G.joy = null;
  $('map').classList.toggle('hidden', !open);
  if (!open) return;
  Sound.sfx.click();
  const nodes = $('map-nodes');
  nodes.innerHTML = '';
  // 村と村をつなぐ道
  const path = VILLAGES.map(v => `${v.map.x},${v.map.y}`).join(' ');
  const done = VILLAGES.filter((v, i) => villageUnlocked(i)).map(v => `${v.map.x},${v.map.y}`).join(' ');
  $('map-path').innerHTML = `<polyline points="${path}" class="road"/><polyline points="${done}" class="road open"/>`;
  VILLAGES.forEach((v, i) => {
    const st = SAVE.villages[v.id] || {};
    const unlocked = villageUnlocked(i);
    const b = document.createElement('button');
    b.className = 'map-node' + (st.done ? ' done' : '') + (!unlocked ? ' locked' : '') + (v.id === G.cur ? ' current' : '');
    b.style.left = v.map.x + '%';
    b.style.top = v.map.y + '%';
    const icon = ['tent', 'igloo', 'campfire', 'logs', 'counter'][i] || 'tent';
    b.innerHTML = `<img src="${IMG(icon)}" alt=""><span class="map-name">${v.name}</span>
      <span class="map-state">${st.done ? '★ 開拓完了' : unlocked ? `${st.rescued || 0} / ${v.goal}人` : '🔒'}</span>`;
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
