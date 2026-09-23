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

  // BGM：のんびりした雪原のループ
  const BPM = 100, STEP = 60 / BPM / 2;
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // Am F C G
  const melody = [76, 0, 74, 72, 0, 69, 72, 0, 74, 0, 76, 79, 76, 0, 74, 0];
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  let step = 0, nextTime = 0;

  function schedule() {
    while (nextTime < ctx.currentTime + 0.2) {
      const chord = chords[Math.floor(step / 8) % chords.length];
      const at = nextTime - ctx.currentTime;
      if (step % 4 === 0) tone(midi(chord[0] - 12), STEP * 3500, 'triangle', 0.05, at);
      tone(midi(chord[step % 3] + 12), STEP * 900, 'sine', 0.018, at);
      const m = melody[step % melody.length];
      if (m && Math.floor(step / 16) % 2 === 1) tone(midi(m), STEP * 1600, 'triangle', 0.025, at);
      if (step % 2 === 1) tone(midi(96 + (step % 5)), 40, 'sine', 0.006, at);   // 雪のきらめき
      nextTime += STEP;
      step++;
    }
  }

  function startBgm() {
    if (bgmTimer || !ensure()) return;
    nextTime = ctx.currentTime + 0.05;
    bgmTimer = setInterval(schedule, 60);
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 1;
  }

  return { sfx, startBgm, setMuted };
})();
