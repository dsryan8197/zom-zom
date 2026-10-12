// All sound is synthesized with WebAudio so the game has no audio asset dependencies.

let ctx, master, noiseBuf;
const listener = { x: 0, y: 0, z: 0, yaw: 0 };

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 6;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setListener(pos, yaw) { listener.x = pos.x; listener.y = pos.y; listener.z = pos.z; listener.yaw = yaw; }

// Returns an output node with distance attenuation + stereo panning, or null when inaudible.
function out(pos, vol = 1, range = 60) {
  if (!ctx) return null;
  const g = ctx.createGain();
  let gain = vol;
  if (pos) {
    const dx = pos.x - listener.x, dz = pos.z - listener.z, dy = pos.y - listener.y;
    const dist = Math.hypot(dx, dy, dz);
    gain *= Math.max(0, 1 - dist / range) ** 1.6;
    if (gain < 0.01) return null;
    const p = ctx.createStereoPanner();
    // right vector of the listener
    const rx = Math.cos(listener.yaw), rz = -Math.sin(listener.yaw);
    p.pan.value = dist > 0.1 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist)) * 0.8 : 0;
    g.connect(p).connect(master);
  } else g.connect(master);
  g.gain.value = gain;
  return g;
}

function noise(dest, t0, dur, { type = 'lowpass', freq = 2000, q = 0.7, attack = 0.002, sweepTo } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(1, t0 + attack);
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

export const sfx = {
  shot(kind = 'rifle', pos = null, vol = 1) {
    const o = out(pos, vol * 0.9, 120); if (!o) return;
    const t = ctx.currentTime;
    const p = {
      rifle: [2600, 0.22, 110], revolver: [1800, 0.35, 80], smg: [3200, 0.12, 140], ar: [2400, 0.16, 100],
      shotgun: [1400, 0.45, 60], lmg: [2000, 0.2, 90], minigun: [3000, 0.09, 130], turret: [2800, 0.1, 120],
      sniper: [1500, 0.5, 70],
    }[kind] || [2400, 0.2, 100];
    noise(o, t, p[1], { freq: p[0], sweepTo: 300 });
    tone(o, t, p[1] * 0.8, { freq: p[2] * 1.6, to: p[2] * 0.5, vol: 0.9, type: 'triangle' });
    noise(o, t, 0.03, { type: 'highpass', freq: 4000 });
  },
  laser(pos, pitch = 1) {
    const o = out(pos, 0.5, 80); if (!o) return;
    const t = ctx.currentTime;
    tone(o, t, 0.25, { type: 'sawtooth', freq: 1400 * pitch, to: 180 * pitch, vol: 0.5 });
    tone(o, t, 0.2, { type: 'square', freq: 900 * pitch, to: 300 * pitch, vol: 0.25 });
  },
  zap(pos) {
    const o = out(pos, 0.5, 80); if (!o) return;
    const t = ctx.currentTime;
    noise(o, t, 0.3, { type: 'bandpass', freq: 3000, q: 4, sweepTo: 800 });
    tone(o, t, 0.3, { type: 'sawtooth', freq: 120, to: 60, vol: 0.6 });
  },
  rocket(pos) {
    const o = out(pos, 0.7, 100); if (!o) return;
    const t = ctx.currentTime;
    noise(o, t, 0.6, { freq: 900, sweepTo: 200, attack: 0.02 });
  },
  explosion(pos, big = 1) {
    const o = out(pos, 1.0 * big, 200); if (!o) return;
    const t = ctx.currentTime;
    noise(o, t, 1.4, { freq: 1200, sweepTo: 60, attack: 0.005 });
    tone(o, t, 0.9, { freq: 90, to: 25, vol: 1, type: 'sine' });
    noise(o, t + 0.05, 0.6, { type: 'highpass', freq: 2000, sweepTo: 600 });
  },
  dry(pos) { const o = out(pos, 0.4); if (!o) return; tone(o, ctx.currentTime, 0.05, { type: 'square', freq: 1800, vol: 0.3 }); },
  reload() {
    const o = out(null, 0.35); if (!o) return;
    const t = ctx.currentTime;
    noise(o, t, 0.06, { type: 'bandpass', freq: 2500, q: 3 });
    noise(o, t + 0.25, 0.08, { type: 'bandpass', freq: 1800, q: 3 });
  },
  pump() {
    const o = out(null, 0.4); if (!o) return;
    const t = ctx.currentTime;
    noise(o, t, 0.07, { type: 'bandpass', freq: 1200, q: 2 });
    noise(o, t + 0.12, 0.07, { type: 'bandpass', freq: 1600, q: 2 });
  },
  swing() { const o = out(null, 0.5); if (!o) return; noise(o, ctx.currentTime, 0.2, { type: 'bandpass', freq: 600, q: 1, sweepTo: 2000, attack: 0.05 }); },
  bonk(pos) {
    const o = out(pos, 0.9); if (!o) return;
    const t = ctx.currentTime;
    tone(o, t, 0.15, { type: 'triangle', freq: 420, to: 180, vol: 0.9 });
    noise(o, t, 0.12, { freq: 900 });
  },
  splat(pos) {
    const o = out(pos, 0.6, 50); if (!o) return;
    const t = ctx.currentTime;
    noise(o, t, 0.25, { freq: 700, sweepTo: 150, attack: 0.004 });
  },
  hit() { const o = out(null, 0.25); if (!o) return; tone(o, ctx.currentTime, 0.05, { type: 'square', freq: 1400, vol: 0.4 }); },
  headshot() {
    const o = out(null, 0.35); if (!o) return;
    const t = ctx.currentTime;
    tone(o, t, 0.12, { type: 'sine', freq: 2100, vol: 0.6 }); tone(o, t + 0.04, 0.15, { type: 'sine', freq: 3200, vol: 0.4 });
  },
  pickup() {
    const o = out(null, 0.35); if (!o) return;
    const t = ctx.currentTime;
    tone(o, t, 0.08, { type: 'square', freq: 660, vol: 0.25 }); tone(o, t + 0.07, 0.12, { type: 'square', freq: 990, vol: 0.25 });
  },
  bigPickup() {
    const o = out(null, 0.45); if (!o) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => tone(o, t + i * 0.07, 0.2, { type: 'square', freq: f, vol: 0.22 }));
  },
  hurt() {
    const o = out(null, 0.6); if (!o) return;
    const t = ctx.currentTime;
    noise(o, t, 0.2, { freq: 500 }); tone(o, t, 0.2, { type: 'sawtooth', freq: 160, to: 90, vol: 0.4 });
  },
  groan(pos, pitch = 1) {
    const o = out(pos, 0.35, 35); if (!o) return;
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
    const o = out(null, 0.6); if (!o) return;
    const t = ctx.currentTime;
    noise(o, t, 0.5, { freq: 300, sweepTo: 80, attack: 0.01 }); tone(o, t, 0.4, { freq: 60, to: 40, vol: 0.8 });
  },
  round() {
    const o = out(null, 0.5); if (!o) return;
    const t = ctx.currentTime;
    [110, 104, 98].forEach((f, i) => tone(o, t + i * 0.45, 1.2, { type: 'sawtooth', freq: f, vol: 0.35, attack: 0.05 }));
    noise(o, t, 1.6, { freq: 200, attack: 0.3 });
  },
  plane() {
    const o = out(null, 0.25); if (!o) return;
    const t = ctx.currentTime;
    tone(o, t, 4, { type: 'sawtooth', freq: 55, to: 48, vol: 0.4, attack: 1.2 });
  },
  beep(pos) { const o = out(pos, 0.5, 70); if (!o) return; tone(o, ctx.currentTime, 0.1, { type: 'square', freq: 1500, vol: 0.4 }); },
  jet() { const o = out(null, 0.15); if (!o) return; noise(o, ctx.currentTime, 0.12, { freq: 800, attack: 0.02 }); },
  zip() { const o = out(null, 0.2); if (!o) return; noise(o, ctx.currentTime, 0.15, { type: 'bandpass', freq: 3000, q: 6 }); },
  grapple() { const o = out(null, 0.4); if (!o) return; const t = ctx.currentTime; tone(o, t, 0.3, { type: 'square', freq: 300, to: 1200, vol: 0.2 }); noise(o, t, 0.1, { type: 'highpass', freq: 3000 }); },
};
