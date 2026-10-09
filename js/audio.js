/* あいち電鉄 — 効果音（WebAudio で合成。音声ファイルは使わない） */
(function (root) {
  'use strict';
  const A = (root.Aichi = root.Aichi || {});

  let ctx = null;
  let enabled = true;

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      const C = root.AudioContext || root.webkitAudioContext;
      if (!C) return null;
      try { ctx = new C(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type, gain, slideTo) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + start;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.15, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  function noise(start, dur, gain) {
    const c = ensure();
    if (!c) return;
    const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1800;
    g.gain.value = gain || 0.08;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(c.currentTime + start);
  }

  const SFX = {
    click: () => tone(660, 0, 0.07, 'triangle', 0.12),
    dice: () => { for (let i = 0; i < 6; i++) noise(i * 0.09, 0.06, 0.07); tone(300, 0.55, 0.12, 'square', 0.06); },
    step: () => tone(520 + Math.random() * 60, 0, 0.06, 'triangle', 0.09),
    coin: () => { tone(988, 0, 0.09, 'square', 0.08); tone(1319, 0.08, 0.16, 'square', 0.08); },
    bad: () => { tone(330, 0, 0.14, 'sawtooth', 0.09, 220); tone(220, 0.14, 0.22, 'sawtooth', 0.09, 150); },
    card: () => { tone(784, 0, 0.08, 'triangle', 0.12); tone(1047, 0.08, 0.1, 'triangle', 0.12); tone(1568, 0.16, 0.16, 'triangle', 0.1); },
    buy: () => { tone(523, 0, 0.09, 'triangle', 0.14); tone(659, 0.09, 0.09, 'triangle', 0.14); tone(784, 0.18, 0.18, 'triangle', 0.14); },
    fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.2, 'square', 0.09)); tone(1047, 0.46, 0.5, 'triangle', 0.14); },
    god: () => { tone(196, 0, 0.3, 'sawtooth', 0.08, 130); tone(147, 0.28, 0.4, 'sawtooth', 0.08, 98); },
    warp: () => tone(300, 0, 0.5, 'sine', 0.14, 1400),
    turn: () => { tone(880, 0, 0.08, 'sine', 0.1); tone(1175, 0.09, 0.12, 'sine', 0.1); },
    settle: () => { [392, 494, 587, 784].forEach((f, i) => tone(f, i * 0.12, 0.24, 'triangle', 0.12)); },
  };

  Object.assign(A, {
    Audio: {
      play(name) { try { if (enabled && SFX[name]) SFX[name](); } catch (e) { /* 音が出なくてもゲームは続ける */ } },
      setEnabled(v) { enabled = !!v; }, // AudioContext は最初の操作(unlock/再生)まで作らない
      isEnabled: () => enabled,
      unlock: () => ensure(),
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
