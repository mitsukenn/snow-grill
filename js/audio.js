'use strict';

// ============================================================
//  サウンド：WebAudio で効果音と BGM をその場で作る（音声ファイル不要）
// ============================================================
const Sound = (() => {
  let ctx = null, master = null, bgmTimer = null, muted = false;

  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 1;
        master.connect(ctx.destination);
      } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, ms = 90, type = 'square', vol = 0.05, at = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + ms / 1000);
  }

  function noise(ms = 150, vol = 0.1, freq = 1200, at = 0, sweepTo = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + at;
    const len = Math.floor(ctx.sampleRate * ms / 1000);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + ms / 1000);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    src.connect(f).connect(g).connect(master);
    src.start(t);
  }

  // 同じ音が一度に鳴りすぎないように間引く
  const last = {};
  const throttle = (key, ms, fn) => (...a) => {
    const now = performance.now();
    if (now - (last[key] || 0) < ms) return;
    last[key] = now;
    fn(...a);
  };

  const sfx = {
    swing: throttle('swing', 80, () => noise(120, 0.08, 700, 0, 2600)),
    hit: throttle('hit', 60, () => { noise(90, 0.18, 900); tone(110, 120, 'sine', 0.15); }),
    bearDown: () => { tone(160, 250, 'sawtooth', 0.06); tone(90, 350, 'sine', 0.15, 0.05); },
    pick: throttle('pick', 45, i => tone(700 + (i % 8) * 60, 50, 'triangle', 0.04)),
    drop: throttle('drop', 45, i => tone(520 - (i % 8) * 30, 45, 'triangle', 0.035)),
    cook: throttle('cook', 400, () => noise(260, 0.03, 3000)),
    coin: throttle('coin', 35, i => tone(1300 + (i % 5) * 120, 60, 'square', 0.03)),
    pay: throttle('pay', 60, () => { tone(988, 80, 'square', 0.04); tone(1319, 120, 'square', 0.04, 0.07); }),
    unlock: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 160, 'triangle', 0.06, i * 0.07)),
    click: () => tone(900, 40, 'square', 0.03),
    happy: throttle('happy', 150, () => [784, 988].forEach((f, i) => tone(f, 90, 'sine', 0.05, i * 0.06))),
    roar: () => { noise(500, 0.2, 300, 0, 120); tone(70, 500, 'sawtooth', 0.08); },
    growl: throttle('growl', 300, () => { noise(300, 0.1, 250, 0, 90); tone(90, 300, 'sawtooth', 0.05); }),
    claw: throttle('claw', 100, () => noise(160, 0.16, 1200, 0, 400)),
    hurt: throttle('hurt', 150, () => { tone(300, 160, 'square', 0.06); tone(180, 200, 'square', 0.05, 0.05); }),
    arrow: throttle('arrow', 80, () => noise(90, 0.06, 2500, 0, 5000)),
  };

  // ---- BGM：村ごとに2曲を交互に流す（1曲を3回まわしたら次の曲へ）。巨人が出ている間は決戦の曲 ----
  // 1曲は 8分音符 32 個（4小節）。chords＝小節ごとの和音（MIDI）、mel＝32 個の旋律（0 は休み）
  // bass：calm（ゆったり）/ drive（刻む）/ bounce（はずむ）、drum：none / soft / march、melEvery：2 なら1回おきに旋律
  const C = {
    Am: [57, 60, 64], F: [53, 57, 60], C: [48, 52, 55], G: [55, 59, 62], D: [50, 54, 57], Bm: [47, 50, 54],
    A: [45, 49, 52], Em: [52, 55, 59], Em7: [52, 55, 59, 62], Cmaj7: [48, 52, 55, 59], E: [52, 56, 59],
    Dm: [50, 53, 57], Bb: [46, 50, 53], Fmaj7: [53, 57, 60, 64], Dm7: [50, 53, 57, 60],
  };
  const SONGS = {
    yukimichi: { bpm: 100, bass: 'calm', drum: 'none', lead: 'triangle', sparkle: true, melEvery: 2, chords: [C.Am, C.F, C.C, C.G],
      mel: [76, 0, 74, 72, 0, 69, 72, 0, 74, 0, 76, 79, 76, 0, 74, 0, 76, 0, 74, 72, 0, 69, 72, 0, 74, 0, 72, 71, 69, 0, 0, 0] },
    danro: { bpm: 92, bass: 'calm', drum: 'soft', lead: 'triangle', sparkle: false, melEvery: 1, chords: [C.C, C.Am, C.F, C.G],
      mel: [72, 0, 76, 0, 79, 0, 76, 0, 81, 0, 79, 0, 76, 0, 72, 0, 77, 0, 76, 0, 74, 0, 72, 0, 74, 0, 0, 0, 79, 0, 0, 0] },
    kosui: { bpm: 84, bass: 'calm', drum: 'none', lead: 'sine', sparkle: true, melEvery: 1, chords: [C.D, C.Bm, C.G, C.A],
      mel: [78, 0, 0, 81, 0, 0, 78, 76, 74, 0, 0, 78, 0, 0, 76, 0, 74, 0, 0, 71, 0, 74, 76, 0, 73, 0, 0, 76, 0, 0, 0, 0] },
    hyomen: { bpm: 90, bass: 'calm', drum: 'soft', lead: 'sine', sparkle: true, melEvery: 1, chords: [C.Em7, C.Cmaj7, C.G, C.D],
      mel: [71, 0, 74, 0, 76, 0, 74, 71, 72, 0, 71, 0, 67, 0, 0, 0, 67, 0, 71, 0, 74, 0, 79, 0, 78, 0, 76, 0, 74, 0, 0, 0] },
    fubuki: { bpm: 116, bass: 'drive', drum: 'soft', lead: 'square', sparkle: false, wind: true, melEvery: 1, chords: [C.Em, C.C, C.D, C.Bm],
      mel: [76, 0, 76, 79, 0, 76, 74, 0, 72, 0, 72, 76, 0, 72, 71, 0, 74, 0, 74, 78, 0, 74, 72, 0, 71, 0, 0, 0, 74, 0, 78, 0] },
    toge: { bpm: 108, bass: 'drive', drum: 'soft', lead: 'triangle', sparkle: false, wind: true, melEvery: 1, chords: [C.Am, C.G, C.F, C.E],
      mel: [69, 0, 72, 0, 76, 0, 74, 72, 71, 0, 74, 0, 79, 0, 77, 76, 77, 0, 76, 0, 74, 0, 72, 0, 71, 0, 68, 0, 71, 0, 0, 0] },
    minato: { bpm: 124, bass: 'bounce', drum: 'soft', lead: 'square', sparkle: false, melEvery: 1, chords: [C.G, C.C, C.D, C.G],
      mel: [79, 0, 79, 81, 83, 0, 81, 79, 76, 0, 76, 79, 81, 0, 79, 76, 74, 0, 78, 0, 81, 0, 78, 74, 79, 0, 0, 0, 74, 0, 79, 0] },
    yuyake: { bpm: 96, bass: 'bounce', drum: 'none', lead: 'triangle', sparkle: false, melEvery: 1, chords: [C.C, C.Em, C.F, C.G],
      mel: [76, 0, 0, 79, 77, 0, 76, 74, 71, 0, 0, 74, 72, 0, 71, 69, 72, 0, 0, 77, 76, 0, 74, 72, 74, 0, 0, 0, 0, 0, 0, 0] },
    outo: { bpm: 94, bass: 'calm', drum: 'march', lead: 'triangle', sparkle: true, melEvery: 1, chords: [C.Dm, C.Bb, C.F, C.C],
      mel: [74, 0, 0, 77, 0, 0, 81, 0, 82, 0, 0, 81, 0, 0, 77, 0, 77, 0, 0, 81, 0, 0, 84, 0, 79, 0, 0, 0, 76, 0, 0, 0] },
    aurora: { bpm: 80, bass: 'calm', drum: 'none', lead: 'sine', sparkle: true, melEvery: 1, chords: [C.Fmaj7, C.Em7, C.Dm7, C.C],
      mel: [81, 0, 0, 0, 79, 0, 77, 0, 76, 0, 0, 0, 74, 0, 72, 0, 74, 0, 0, 77, 0, 0, 81, 0, 79, 0, 0, 0, 0, 0, 0, 0] },
    kessen: { bpm: 138, bass: 'drive', drum: 'march', lead: 'square', sparkle: false, melEvery: 1, chords: [C.Am, C.Am, C.F, C.G],
      mel: [81, 0, 81, 0, 79, 0, 76, 0, 81, 0, 0, 84, 0, 83, 81, 0, 77, 0, 77, 0, 76, 0, 74, 0, 76, 0, 0, 79, 0, 83, 0, 0] },
    kyojin: { bpm: 132, bass: 'drive', drum: 'march', lead: 'sawtooth', sparkle: false, melEvery: 1, chords: [C.Dm, C.Dm, C.Bb, C.C],
      mel: [74, 0, 74, 77, 0, 74, 72, 0, 74, 0, 0, 0, 81, 0, 79, 77, 77, 0, 77, 79, 0, 77, 74, 0, 72, 0, 0, 0, 76, 0, 79, 0] },
  };
  // 村の id → 流す曲（2曲を交互に）。giant は巨人が出ている間
  const PLAYLIST = {
    camp: ['yukimichi', 'danro'], lake: ['kosui', 'hyomen'], pass: ['fubuki', 'toge'], port: ['minato', 'yuyake'],
    capital: ['outo', 'aurora'], battle1: ['toge', 'fubuki'], battle2: ['hyomen', 'toge'], giant: ['kessen', 'kyojin'],
    // レベル2
    onsen: ['danro', 'yuyake'], mine: ['toge', 'hyomen'], battle3: ['fubuki', 'toge'], forest: ['kosui', 'aurora'],
    fortress: ['outo', 'fubuki'], battle4: ['aurora', 'hyomen'], throne: ['outo', 'aurora'],
  };
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  let list = PLAYLIST.camp, song = SONGS[list[0]], songIdx = 0, loops = 0, step = 0, nextTime = 0;

  function playStep(S, i, at) {
    const st = 60 / S.bpm / 2, chord = S.chords[Math.floor(i / 8) % 4], k = i % 8;
    // ベース
    if (S.bass === 'calm') { if (k % 4 === 0) tone(midi(chord[0] - 12), st * 3500, 'triangle', 0.05, at); }
    else if (S.bass === 'drive') tone(midi(chord[0] - 12), st * 800, k % 2 ? 'triangle' : 'sawtooth', k % 2 ? 0.03 : 0.028, at);
    else if (k === 0 || k === 4 || k === 6) tone(midi((k === 4 ? chord[2] : chord[0]) - 12), st * 900, 'triangle', 0.055, at);
    // 分散和音
    tone(midi(chord[i % chord.length] + 12), st * 900, S.bass === 'bounce' ? 'square' : 'sine', S.bass === 'bounce' ? 0.008 : 0.018, at);
    // 旋律
    const m = S.mel[i % 32];
    if (m && Math.floor(i / 32) % S.melEvery === 0) tone(midi(m), st * 1600, S.lead, S.lead === 'square' || S.lead === 'sawtooth' ? 0.016 : 0.028, at);
    // 太鼓
    if (S.drum === 'soft' && k === 0) tone(70, 160, 'sine', 0.09, at);
    if (S.drum === 'march') {
      if (k % 4 === 0) tone(62, 150, 'sine', 0.13, at);
      if (k === 4) noise(110, 0.05, 1800, at);
      if (k % 2 === 1) noise(30, 0.012, 7000, at);
    }
    if (S.sparkle && k % 2 === 1) tone(midi(96 + (i % 5)), 40, 'sine', 0.006, at);   // 雪のきらめき
    if (S.wind && i % 32 === 0) noise(2200, 0.02, 500, at, 1500);                        // 吹雪の風
  }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.2) {
      playStep(song, step + loops * 32, nextTime - ctx.currentTime);   // loops も渡す（旋律を1回おきにする曲のため）
      nextTime += 60 / song.bpm / 2;
      if (++step >= 32) {                             // 1曲まわった
        step = 0;
        if (++loops >= 3) { loops = 0; songIdx = (songIdx + 1) % list.length; song = SONGS[list[songIdx]]; }
      }
    }
  }

  // ---- Suno で作った曲（bgm/<名前>.mp3、切れ目なくループするよう加工ずみ）----
  // 村の id（と 'giant'）→ 曲。読み込めるまでと、読めなかったときは上のピコピコ（SONGS）を鳴らす
  const FILES = {
    camp: 'sg_camp', lake: 'sg_lake', pass: 'sg_pass', port: 'sg_port', capital: 'sg_capital',
    battle1: 'sg_pass', battle2: 'sg_pass', giant: 'sg_giant',
    onsen: 'sg_onsen', mine: 'sg_pass', battle3: 'sg_pass', forest: 'sg_lake', fortress: 'sg_capital', battle4: 'sg_throne', throne: 'sg_throne',
  };
  const FILE_VOL = 0.38;
  const bufs = {}, loading = {};
  let bgmKey = 'camp', started = false, preloaded = false, src = null, srcGain = null, srcName = null;
  function loadFile(name) {
    if (!ctx || !name || bufs[name] || loading[name]) return;
    loading[name] = fetch(`bgm/${name}.mp3`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => new Promise((ok, ng) => ctx.decodeAudioData(b, ok, ng)))
      .then(buf => { bufs[name] = buf; if (started && FILES[bgmKey] === name) playFile(); })
      .catch(() => {});
  }
  function stopFile() {
    if (!src) return;
    const s = src, g = srcGain;
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    setTimeout(() => { try { s.stop(); } catch (e) {} s.disconnect(); g.disconnect(); }, 800);
    src = srcGain = srcName = null;
  }
  // いまの村の曲が読めていれば流す（ピコピコは止める）。流せたら true
  function playFile() {
    const name = FILES[bgmKey], buf = bufs[name];
    if (!buf) return false;
    if (src && srcName === name) return true;
    stopFile();
    clearInterval(bgmTimer); bgmTimer = null;
    srcGain = ctx.createGain(); srcGain.gain.value = 0.0001; srcGain.connect(master);
    src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(srcGain); src.start();
    srcGain.gain.setTargetAtTime(FILE_VOL, ctx.currentTime, 0.3);
    srcName = name;
    return true;
  }
  function startSynth() {
    if (bgmTimer) return;
    nextTime = ctx.currentTime + 0.05;
    bgmTimer = setInterval(schedule, 60);
  }

  function startBgm() {
    if (started || !ensure()) return;
    started = true;
    if (!playFile()) { loadFile(FILES[bgmKey]); startSynth(); }
    // ほかの村の曲も、少したってから裏で読んでおく
    if (!preloaded) { preloaded = true; setTimeout(() => Object.values(FILES).forEach(loadFile), 8000); }
  }

  // 曲を切りかえる（村の id か 'giant'）。同じなら何もしない
  function setBgm(key) {
    bgmKey = FILES[key] ? key : 'camp';
    const l = PLAYLIST[key] || PLAYLIST.camp;
    if (l !== list) { list = l; songIdx = 0; loops = 0; step = 0; song = SONGS[list[0]]; }
    if (!started) return;
    if (!playFile()) { stopFile(); loadFile(FILES[bgmKey]); startSynth(); }
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 1;
  }

  // nowPlaying：いま流れている曲（ファイル名／'synth'＝ピコピコ）。動作確認用
  return { sfx, startBgm, setBgm, setMuted, get nowPlaying() { return srcName || (bgmTimer ? 'synth' : null); } };
})();
