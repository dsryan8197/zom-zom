// Sampled sound (CC0 recordings in public/audio, see CREDITS.md) layered with a little WebAudio
// synthesis for punch. Every sound still has a synthesized fallback, so nothing breaks if a
// sample fails to load.

let ctx, master, noiseBuf, reverb, reverbSend;
let volume = 0.8; // user setting, 0..1

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = 0.75 * volume;
}
const listener = { x: 0, y: 0, z: 0, yaw: 0 };

// sample name -> number of variants (files are ./audio/<name>_<i>.mp3)
const SAMPLES = {
  gun_rifle: 3, gun_revolver: 3, gun_smg: 3, gun_ar: 3, gun_shotgun: 3, gun_autoshotgun: 3, gun_lmg: 3,
  gun_minigun: 3, gun_sniper: 3, gun_distant: 3,
  boom: 4, boomlow: 2,
  z_moan: 3, z_ghoul: 8, z_growl: 3, z_scream: 1, z_brute: 4,
  step_concrete: 5, step_grass: 5, step_wood: 5,
  hit_flesh: 4, splat: 4, ric_metal: 4, ric_hard: 4, ric_wood: 3, shell: 3, wall: 3,
  click: 1, latch: 1, mag: 2, swing: 2, cloth: 2, laser: 3, zap: 2, thrust: 2,
};
const raw = {}; // name -> [ArrayBuffer promise]
const bank = {}; // name -> [AudioBuffer]
const lastIdx = {};

export function loadSounds() {
  for (const [name, n] of Object.entries(SAMPLES)) {
    raw[name] = [];
    for (let i = 0; i < n; i++) {
      raw[name].push(fetch(`./audio/${name}_${i}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
    }
  }
}

async function decodeAll() {
  for (const [name, list] of Object.entries(raw)) {
    for (const p of list) {
      const data = await p;
      if (!data) continue;
      try { (bank[name] ||= []).push(await ctx.decodeAudioData(data)); } catch { /* keep the synth fallback */ }
    }
  }
}

// Short synthetic "outdoor" impulse: a few early reflections off buildings, then a dark tail.
function makeImpulse(seconds = 2.2) {
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3.2) * 0.5 * Math.min(1, t * 60);
    }
    for (const [t, a] of [[0.045, 0.5], [0.09, 0.35], [0.16, 0.28], [0.27, 0.18]]) {
      const i0 = Math.floor((t + ch * 0.007) * rate);
      for (let k = 0; k < 300; k++) d[i0 + k] += (Math.random() * 2 - 1) * a * Math.exp(-k / 60);
    }
    // darken: one-pole lowpass
    let y = 0;
    for (let i = 0; i < len; i++) { y += (d[i] - y) * 0.18; d[i] = y; }
  }
  return buf;
}

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.75 * volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.2;
  master.connect(comp).connect(ctx.destination);
  reverb = ctx.createConvolver(); reverb.buffer = makeImpulse();
  reverbSend = ctx.createGain(); reverbSend.gain.value = 0.55;
  reverbSend.connect(reverb).connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (!Object.keys(raw).length) loadSounds();
  decodeAll();
}

// For debugging: how many variants of each sample have been decoded.
export function soundStatus() {
  return { context: ctx?.state, decoded: Object.fromEntries(Object.keys(SAMPLES).map((k) => [k, bank[k]?.length || 0])) };
}

export function setListener(pos, yaw) { listener.x = pos.x; listener.y = pos.y; listener.z = pos.z; listener.yaw = yaw; }

// Returns an output node with distance attenuation, air absorption + stereo panning, or null when inaudible.
function out(pos, vol = 1, range = 60, wet = 0.15) {
  if (!ctx) return null;
  const g = ctx.createGain();
  let gain = vol, dist = 0;
  let dest = master;
  if (pos) {
    const dx = pos.x - listener.x, dz = pos.z - listener.z, dy = pos.y - listener.y;
    dist = Math.hypot(dx, dy, dz);
    gain *= Math.max(0, 1 - dist / range) ** 1.6;
    if (gain < 0.01) return null;
    const p = ctx.createStereoPanner();
    const rx = Math.cos(listener.yaw), rz = -Math.sin(listener.yaw);
    p.pan.value = dist > 0.1 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist)) * 0.8 : 0;
    p.connect(master);
    dest = p;
    if (dist > 6) { // distant sounds lose their highs
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.value = Math.max(700, 16000 * Math.exp(-dist / 35));
      f.connect(p); dest = f;
    }
  }
  g.connect(dest);
  if (wet > 0) {
    const w = ctx.createGain(); w.gain.value = wet * (1 + Math.min(1.5, dist / 30));
    g.connect(w).connect(reverbSend);
  }
  g.gain.value = gain;
  return g;
}

// Play a random variant of a sample (never the same one twice in a row). Returns false if not loaded.
function sample(name, dest, { rate = 1, vol = 1, when = 0, jitter = 0.04 } = {}) {
  const list = bank[name];
  if (!list || !list.length || !dest) return false;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastIdx[name]) i = (i + 1) % list.length;
  lastIdx[name] = i;
  const s = ctx.createBufferSource(); s.buffer = list[i];
  s.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 2 * jitter);
  let node = s;
  if (vol !== 1) { const g = ctx.createGain(); g.gain.value = vol; s.connect(g); node = g; }
  node.connect(dest);
  s.start(ctx.currentTime + when);
  return true;
}

function noise(dest, t0, dur, { type = 'lowpass', freq = 2000, q = 0.7, attack = 0.002, sweepTo, vol = 1 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
}

function tone(dest, t0, dur, { type = 'sine', freq = 200, to, vol = 1, attack = 0.003 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

const SHOT = {
  rifle: [2600, 0.22, 110], revolver: [1800, 0.35, 80], smg: [3200, 0.12, 140], ar: [2400, 0.16, 100],
  shotgun: [1400, 0.45, 60], lmg: [2000, 0.2, 90], minigun: [3000, 0.09, 130], turret: [2800, 0.1, 120],
  sniper: [1500, 0.5, 70], autoshotgun: [1400, 0.4, 60],
};
const SHOT_SAMPLE = { turret: 'gun_lmg', autoshotgun: 'gun_autoshotgun' };
const rateLimit = {};
const allow = (key, gap) => {
  const t = ctx ? ctx.currentTime : 0;
  if (t - (rateLimit[key] || -1) < gap) return false;
  rateLimit[key] = t; return true;
};

export const sfx = {
  shot(kind = 'rifle', pos = null, vol = 1) {
    const o = out(pos, vol * 0.9, 160, 0.3); if (!o) return;
    const t = ctx.currentTime;
    const p = SHOT[kind] || SHOT.rifle;
    const name = SHOT_SAMPLE[kind] || `gun_${kind}`;
    if (sample(name, o, { vol: 1.0, jitter: 0.035 })) {
      tone(o, t, p[1] * 0.7, { freq: p[2] * 1.4, to: p[2] * 0.4, vol: 0.55, type: 'sine' }); // sub-thump for weight
      if (!pos) sample('gun_distant', o, { vol: 0.25, when: 0.06, rate: 0.9 }); // echo off the town
      return;
    }
    noise(o, t, p[1], { freq: p[0], sweepTo: 300 });
    tone(o, t, p[1] * 0.8, { freq: p[2] * 1.6, to: p[2] * 0.5, vol: 0.9, type: 'triangle' });
    noise(o, t, 0.03, { type: 'highpass', freq: 4000 });
  },
  laser(pos, pitch = 1) {
    const o = out(pos, 0.55, 80); if (!o) return;
    if (sample('laser', o, { rate: pitch, vol: 0.8 })) return;
    const t = ctx.currentTime;
    tone(o, t, 0.25, { type: 'sawtooth', freq: 1400 * pitch, to: 180 * pitch, vol: 0.5 });
    tone(o, t, 0.2, { type: 'square', freq: 900 * pitch, to: 300 * pitch, vol: 0.25 });
  },
  zap(pos) {
    const o = out(pos, 0.6, 80); if (!o) return;
    const t = ctx.currentTime;
    sample('zap', o, { vol: 0.9 });
    noise(o, t, 0.3, { type: 'bandpass', freq: 3000, q: 4, sweepTo: 800, vol: 0.6 });
    tone(o, t, 0.3, { type: 'sawtooth', freq: 120, to: 60, vol: 0.5 });
  },
  rocket(pos) {
    const o = out(pos, 0.8, 100, 0.3); if (!o) return;
    if (!sample('thrust', o, { vol: 0.9, rate: 1.3 })) noise(o, ctx.currentTime, 0.6, { freq: 900, sweepTo: 200, attack: 0.02 });
    sample('gun_shotgun', o, { vol: 0.5, rate: 0.7 });
  },
  explosion(pos, big = 1) {
    const o = out(pos, 1.1 * big, 260, 0.45); if (!o) return;
    const t = ctx.currentTime;
    const ok = sample('boom', o, { vol: 1, jitter: 0.08, rate: big < 0.6 ? 1.25 : 0.95 });
    if (big >= 0.6) sample('boomlow', o, { vol: 0.9 });
    tone(o, t, 1.1, { freq: 70, to: 22, vol: ok ? 0.8 : 1, type: 'sine' });
    if (!ok) {
      noise(o, t, 1.4, { freq: 1200, sweepTo: 60, attack: 0.005 });
      noise(o, t + 0.05, 0.6, { type: 'highpass', freq: 2000, sweepTo: 600 });
    } else noise(o, t + 0.15, 1.6, { freq: 500, sweepTo: 80, attack: 0.2, vol: 0.35 }); // debris rumble
  },
  dry(pos) {
    const o = out(pos, 0.5, 30, 0); if (!o) return;
    if (!sample('click', o, { rate: 1.4 })) tone(o, ctx.currentTime, 0.05, { type: 'square', freq: 1800, vol: 0.3 });
  },
  reload() {
    const o = out(null, 0.5, 30, 0.05); if (!o) return;
    if (sample('mag', o, { vol: 0.9 })) { sample('latch', o, { when: 0.35, vol: 0.8 }); sample('click', o, { when: 0.6, vol: 0.6 }); return; }
    const t = ctx.currentTime;
    noise(o, t, 0.06, { type: 'bandpass', freq: 2500, q: 3 });
    noise(o, t + 0.25, 0.08, { type: 'bandpass', freq: 1800, q: 3 });
  },
  pump() {
    const o = out(null, 0.55, 30, 0.05); if (!o) return;
    if (sample('latch', o, { rate: 0.8 })) { sample('latch', o, { when: 0.13, rate: 1.0 }); return; }
    const t = ctx.currentTime;
    noise(o, t, 0.07, { type: 'bandpass', freq: 1200, q: 2 });
    noise(o, t + 0.12, 0.07, { type: 'bandpass', freq: 1600, q: 2 });
  },
  swing() {
    const o = out(null, 0.5, 30, 0); if (!o) return;
    sample('swing', o, { vol: 0.7, rate: 0.8 });
    noise(o, ctx.currentTime, 0.2, { type: 'bandpass', freq: 600, q: 1, sweepTo: 2000, attack: 0.05, vol: 0.7 });
  },
  bonk(pos) {
    const o = out(pos, 1.0, 40); if (!o) return;
    const t = ctx.currentTime;
    if (sample('hit_flesh', o, { vol: 1 })) { sample('ric_wood', o, { vol: 0.6 }); return; }
    tone(o, t, 0.15, { type: 'triangle', freq: 420, to: 180, vol: 0.9 });
    noise(o, t, 0.12, { freq: 900 });
  },
  splat(pos) {
    if (!allow('splat', 0.05)) return;
    const o = out(pos, 0.8, 50); if (!o) return;
    if (sample('splat', o, { vol: 1, jitter: 0.1 })) return;
    noise(o, ctx.currentTime, 0.25, { freq: 700, sweepTo: 150, attack: 0.004 });
  },
  // bullet hitting the world; kind: 'hard' | 'metal' | 'wood'
  impact(pos, kind = 'hard') {
    if (!allow('ric', 0.035)) return;
    const o = out(pos, 0.35, 45, 0.1); if (!o) return;
    sample(`ric_${kind}`, o, { jitter: 0.12 });
  },
  flesh(pos) {
    if (!allow('flesh', 0.04)) return;
    const o = out(pos, 0.45, 50, 0.05); if (!o) return;
    sample('splat', o, { vol: 0.7, rate: 1.3, jitter: 0.1 });
  },
  shell(pos) {
    if (!allow('shell', 0.07)) return;
    const o = out(pos, 0.12, 20, 0); if (!o) return;
    sample('shell', o, { rate: 1.6, jitter: 0.15, when: 0.35 + Math.random() * 0.2 });
  },
  step(surface = 'concrete', vol = 1) {
    const o = out(null, 0.32 * vol, 20, 0.02); if (!o) return;
    sample(`step_${surface}`, o, { jitter: 0.08 });
  },
  flame() {
    if (!allow('flame', 0.14)) return;
    const o = out(null, 0.35, 30, 0.1); if (!o) return;
    if (!sample('thrust', o, { vol: 0.9, rate: 0.75, jitter: 0.1 })) noise(o, ctx.currentTime, 0.2, { freq: 700, attack: 0.03 });
  },
  hit() { const o = out(null, 0.22, 60, 0); if (!o) return; tone(o, ctx.currentTime, 0.05, { type: 'square', freq: 1400, vol: 0.4 }); },
  headshot() {
    const o = out(null, 0.35, 60, 0); if (!o) return;
    const t = ctx.currentTime;
    tone(o, t, 0.12, { type: 'sine', freq: 2100, vol: 0.6 }); tone(o, t + 0.04, 0.15, { type: 'sine', freq: 3200, vol: 0.4 });
  },
  pickup() {
    const o = out(null, 0.35, 60, 0); if (!o) return;
    const t = ctx.currentTime;
    sample('cloth', o, { vol: 0.8 });
    tone(o, t, 0.08, { type: 'square', freq: 660, vol: 0.18 }); tone(o, t + 0.07, 0.12, { type: 'square', freq: 990, vol: 0.18 });
  },
  bigPickup() {
    const o = out(null, 0.45, 60, 0.1); if (!o) return;
    const t = ctx.currentTime;
    sample('latch', o, { vol: 0.8 });
    [523, 659, 784, 1046].forEach((f, i) => tone(o, t + i * 0.07, 0.2, { type: 'square', freq: f, vol: 0.2 }));
  },
  hurt() {
    const o = out(null, 0.7, 60, 0.05); if (!o) return;
    const t = ctx.currentTime;
    if (sample('hit_flesh', o, { vol: 0.9, rate: 0.85 })) { tone(o, t, 0.25, { type: 'sine', freq: 90, to: 50, vol: 0.5 }); return; }
    noise(o, t, 0.2, { freq: 500 }); tone(o, t, 0.2, { type: 'sawtooth', freq: 160, to: 90, vol: 0.4 });
  },
  groan(pos, pitch = 1) {
    const o = out(pos, 0.55, 40, 0.25); if (!o) return;
    const name = pitch < 0.8 ? 'z_brute' : pitch > 1.2 ? (Math.random() < 0.5 ? 'z_scream' : 'z_growl') : (Math.random() < 0.4 ? 'z_moan' : Math.random() < 0.7 ? 'z_ghoul' : 'z_growl');
    if (sample(name, o, { rate: (pitch > 1.2 ? 1.1 : pitch < 0.8 ? 1 : 0.92) * (0.9 + Math.random() * 0.2), jitter: 0.06 })) return;
    const t = ctx.currentTime, dur = 0.6 + Math.random() * 0.8;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const base = (70 + Math.random() * 40) * pitch;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * (0.7 + Math.random() * 0.5), t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 5;
    f.frequency.setValueAtTime(500 + Math.random() * 300, t);
    f.frequency.linearRampToValueAtTime(300 + Math.random() * 400, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f).connect(g).connect(o); osc.start(t); osc.stop(t + dur + 0.05);
  },
  wall() {
    const o = out(null, 0.7, 60, 0.2); if (!o) return;
    const t = ctx.currentTime;
    sample('wall', o, { rate: 0.7 });
    noise(o, t, 0.5, { freq: 300, sweepTo: 80, attack: 0.01 }); tone(o, t, 0.4, { freq: 60, to: 40, vol: 0.8 });
  },
  round() {
    const o = out(null, 0.5, 60, 0.6); if (!o) return;
    const t = ctx.currentTime;
    [110, 104, 98].forEach((f, i) => tone(o, t + i * 0.45, 1.2, { type: 'sawtooth', freq: f, vol: 0.3, attack: 0.05 }));
    noise(o, t, 1.6, { freq: 200, attack: 0.3 });
    sample('z_brute', o, { vol: 0.6, rate: 0.8, when: 0.4 });
  },
  plane() {
    const o = out(null, 0.25, 60, 0.4); if (!o) return;
    const t = ctx.currentTime;
    tone(o, t, 4, { type: 'sawtooth', freq: 55, to: 48, vol: 0.4, attack: 1.2 });
  },
  beep(pos) { const o = out(pos, 0.5, 70, 0.1); if (!o) return; tone(o, ctx.currentTime, 0.1, { type: 'square', freq: 1500, vol: 0.4 }); },
  jet() {
    const o = out(null, 0.15, 60, 0); if (!o) return;
    if (!allow('jet', 0.3) || !sample('thrust', o, { vol: 0.6 })) noise(o, ctx.currentTime, 0.12, { freq: 800, attack: 0.02 });
  },
  zip() { const o = out(null, 0.2, 60, 0); if (!o) return; noise(o, ctx.currentTime, 0.15, { type: 'bandpass', freq: 3000, q: 6 }); },
  grapple() { const o = out(null, 0.4, 60, 0); if (!o) return; const t = ctx.currentTime; tone(o, t, 0.3, { type: 'square', freq: 300, to: 1200, vol: 0.2 }); noise(o, t, 0.1, { type: 'highpass', freq: 3000 }); },
};

// Looping wind bed plus the occasional far-off moan or gunshot echo. strength 0..1.
export const ambience = {
  started: false, nextT: 0,
  start() {
    if (!ctx || this.started) return;
    this.started = true;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = 0.5;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.06;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 180;
    lfo.connect(lfoAmt).connect(f.frequency);
    src.connect(f).connect(this.windGain).connect(master);
    src.start(); lfo.start();
    this.windFilter = f;
  },
  update(time, nightness = 0) {
    if (!this.started) return;
    this.windGain.gain.setTargetAtTime(0.05 + nightness * 0.03, ctx.currentTime, 2);
    if (time < this.nextT) return;
    this.nextT = time + 5 + Math.random() * 9;
    const a = Math.random() * Math.PI * 2, d = 45 + Math.random() * 40;
    const pos = { x: listener.x + Math.cos(a) * d, y: 0, z: listener.z + Math.sin(a) * d };
    const o = out(pos, 0.45, 200, 1.2); if (!o) return;
    if (Math.random() < 0.75) sample(Math.random() < 0.5 ? 'z_moan' : 'z_ghoul', o, { rate: 0.8 + Math.random() * 0.2 });
    else sample('gun_distant', o, { rate: 0.85 });
  },
};
