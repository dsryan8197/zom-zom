import * as THREE from 'three';
import { worldMat } from './textures.js';
import { modelSize } from './models.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Extra places and clutter so the town feels lived-in (and died-in): a military checkpoint, a
// junkyard, a park, a field hospital, burning wrecks, power lines, dumpsters, a radio tower and
// upgrade workbenches. Everything solid is registered with physics like the rest of the town.

export function addLandmarks(B, town, physics, scene, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  // Place a GLB model by its long side: `long` metres along x (alongX) or z. Returns the physics box.
  const put = (name, cx, y, cz, long, alongX, opts = {}) => {
    const s = modelSize(name);
    if (!s) { // model missing: a plain box stands in
      const h = opts.h || 1;
      const [w, d] = alongX ? [long, long * 0.5] : [long * 0.5, long];
      return opts.fallback === false ? null : B.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2, opts.mat || 'metal', opts);
    }
    const longIsX = s.x >= s.z;
    const k = long / Math.max(s.x, s.z), short = Math.min(s.x, s.z) * k, h = s.y * k;
    const [w, d] = alongX ? [long, short] : [short, long];
    let rotY = longIsX === alongX ? 0 : Math.PI / 2;
    if (opts.flip ?? rnd() < 0.5) rotY += Math.PI;
    if (opts.rotJitter) rotY += (rnd() - 0.5) * opts.rotJitter;
    const handle = B.props.place(name, cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2, { rotY, tint: opts.tint, tilt: opts.tilt || 0 });
    let box = null;
    if (opts.collide !== false) box = physics.addBox(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h * (opts.colH || 1), cz + d / 2, { walkable: !!opts.walkable });
    if (opts.explosive && box) {
      const ex = { box, handle, pos: new THREE.Vector3(cx, y + h / 2, cz) };
      box.explosive = ex; town.explosives.push(ex);
    }
    return box;
  };
  const free = (x0, z0, x1, z1, y0 = 0.05, y1 = 2) => !physics.overlaps(x0, y0, z0, x1, y1, z1);

  // ---------- reusable bits ----------
  const sandbags = (x0, z0, x1, z1, h = 1.1) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const layers = Math.max(1, Math.round(h / 0.27)), per = Math.max(1, Math.round(len / 0.85));
    for (let l = 0; l < layers; l++) {
      for (let i = 0; i < per - (l % 2); i++) {
        const t = (i + 0.5 + (l % 2) * 0.5) / per;
        const cx = alongX ? Math.min(x0, x1) + t * len : x0, cz = alongX ? z0 : Math.min(z0, z1) + t * len;
        put('sandbag', cx, l * 0.27, cz, 0.85, alongX, { collide: false, fallback: false, rotJitter: 0.25 });
      }
    }
    const t = 0.32;
    if (alongX) physics.addBox(Math.min(x0, x1), 0, z0 - t, Math.max(x0, x1), layers * 0.27, z0 + t);
    else physics.addBox(x0 - t, 0, Math.min(z0, z1), x0 + t, layers * 0.27, Math.max(z0, z1));
    if (!modelSize('sandbag')) B.box(alongX ? Math.min(x0, x1) : x0 - t, 0, alongX ? z0 - t : Math.min(z0, z1), alongX ? Math.max(x0, x1) : x0 + t, layers * 0.27, alongX ? z0 + t : Math.max(z0, z1), 'dirt', { collide: false });
  };

  // Canvas tent with an open front. open: which side is open ('n','s','e','w').
  const tent = (x0, z0, x1, z1, mat, open = 'w', cross = false) => {
    const h = 2.6, ridge = 3.4, T = 0.08, m = worldMat('canvas', { color: mat });
    const pole = 'metal';
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) B.box(px - 0.06, 0, pz - 0.06, px + 0.06, h, pz + 0.06, pole, { collide: false });
    if (open !== 'n') B.box(x0, 0, z0, x1, h, z0 + T, m);
    if (open !== 's') B.box(x0, 0, z1 - T, x1, h, z1, m);
    if (open !== 'w') B.box(x0, 0, z0, x0 + T, h, z1, m);
    if (open !== 'e') B.box(x1 - T, 0, z0, x1, h, z1, m);
    // stepped roof
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const k = i / steps, inset = (Math.min(x1 - x0, z1 - z0) / 2) * k * 0.9;
      const along = x1 - x0 > z1 - z0;
      if (along) B.box(x0 - 0.15, h + (ridge - h) * k, z0 + inset - 0.15, x1 + 0.15, h + (ridge - h) * (k + 1 / steps), z1 - inset + 0.15, m, { collide: false });
      else B.box(x0 + inset - 0.15, h + (ridge - h) * k, z0 - 0.15, x1 - inset + 0.15, h + (ridge - h) * (k + 1 / steps), z1 + 0.15, m, { collide: false });
    }
    physics.addBox(x0, h, z0, x1, ridge, z1); // roof you can stand on
    if (cross) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, red = worldMat('plaster', { color: 0xb02020 });
      B.box(cx - 0.9, ridge, cz - 0.25, cx + 0.9, ridge + 0.06, cz + 0.25, red, { collide: false });
      B.box(cx - 0.25, ridge, cz - 0.9, cx + 0.25, ridge + 0.06, cz + 0.9, red, { collide: false });
    }
  };

  const cot = (x0, z0, alongX) => {
    const [w, d] = alongX ? [2, 0.8] : [0.8, 2];
    B.box(x0, 0.45, z0, x0 + w, 0.55, z0 + d, worldMat('canvas', { color: 0x7a7a5a }));
    for (const [a, b] of [[0, 0], [w - 0.08, 0], [0, d - 0.08], [w - 0.08, d - 0.08]]) B.box(x0 + a, 0, z0 + b, x0 + a + 0.08, 0.45, z0 + b + 0.08, 'metal', { collide: false });
  };

  const container = (x0, y0, z0, alongX, color) => {
    const [w, d] = alongX ? [6.1, 2.44] : [2.44, 6.1], h = 2.6, m = worldMat('corrugated', { color });
    B.box(x0, y0, z0, x0 + w, y0 + h, z0 + d, m, { walkable: false });
    // door bars on one end
    const bars = worldMat('metal', { color: 0x3a3a3a });
    for (let i = 0; i < 4; i++) {
      if (alongX) B.box(x0 + w, y0 + 0.1, z0 + 0.3 + i * 0.6, x0 + w + 0.05, y0 + h - 0.1, z0 + 0.36 + i * 0.6, bars, { collide: false });
      else B.box(x0 + 0.3 + i * 0.6, y0 + 0.1, z0 + d, x0 + 0.36 + i * 0.6, y0 + h - 0.1, z0 + d + 0.05, bars, { collide: false });
    }
  };

  const ladder = (x0, z0, x1, z1, y0, y1, faceX) => {
    town.ladders.push({ x0, z0, x1, z1, y0, y1: y1 + 0.3 });
    const m = 'metal';
    if (faceX) { B.box(x0, y0, z0, x1, y1, z0 + 0.06, m, { collide: false }); B.box(x0, y0, z1 - 0.06, x1, y1, z1, m, { collide: false }); }
    else { B.box(x0, y0, z0, x0 + 0.06, y1, z1, m, { collide: false }); B.box(x1 - 0.06, y0, z0, x1, y1, z1, m, { collide: false }); }
    for (let y = y0 + 0.3; y < y1; y += 0.35) {
      if (faceX) B.box(x0, y, z0, x1, y + 0.04, z1, m, { collide: false });
      else B.box(x0, y, z0, x1, y + 0.04, z1, m, { collide: false });
    }
  };

  // Upgrade workbench spot (built and animated by Workbenches in items.js). rot: which way the pegboard faces.
  const bench = (x, z, rot, y = 0) => {
    const along = Math.abs(Math.sin(rot)) < 0.5; // pegboard faces ±z => bench runs along x
    const [hw, hd] = along ? [1.25, 0.55] : [0.55, 1.25];
    physics.addBox(x - hw, y, z - hd, x + hw, y + 1.0, z + hd);
    town.benches.push({ x, y, z, rot });
  };

  const wreck = (x, z, alongZ, burning = true) => {
    const model = pick(['sedan', 'suv', 'van', 'police', 'taxi', 'hatchback', 'truck']);
    const [w, l] = alongZ ? [2.0, 4.4] : [4.4, 2.0];
    const tilt = (rnd() - 0.5) * 0.12;
    if (!B.props.place(model, x - w / 2, 0, z - l / 2, x + w / 2, 1.9, z + l / 2, { rotY: (alongZ ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.5, fit: 'uniform', tint: 0x2a2421, tilt })) {
      B.box(x - w / 2, 0.3, z - l / 2, x + w / 2, 1.2, z + l / 2, worldMat('metal', { color: 0x2a2421 }), { collide: false });
    }
    physics.addBox(x - w / 2, 0, z - l / 2, x + w / 2, 1.3, z + l / 2);
    // scorched road and scattered debris
    B.box(x - w / 2 - 1.5, 0.045, z - l / 2 - 1.5, x + w / 2 + 1.5, 0.05, z + l / 2 + 1.5, worldMat('asphalt', { color: 0x141210 }), { collide: false });
    for (let i = 0; i < 6; i++) {
      const dx = (rnd() - 0.5) * (w + 4), dz = (rnd() - 0.5) * (l + 4), s = 0.15 + rnd() * 0.35;
      B.box(x + dx, 0.05, z + dz, x + dx + s, 0.05 + s * 0.4, z + dz + s * 1.3, worldMat('metal', { color: 0x2a2624 }), { collide: false });
    }
    if (burning) town.emitters.push({ x, y: 1.0, z, kind: 'fire', size: 1.6 });
    else town.emitters.push({ x, y: 1.2, z, kind: 'smoke', size: 1.2 });
  };

  const dumpster = (x0, z0, alongX) => {
    const [w, d] = alongX ? [2.2, 1.3] : [1.3, 2.2];
    const m = worldMat('metal', { color: pick([0x2e4a32, 0x2a3a5a, 0x5a3a20]) });
    B.box(x0, 0.1, z0, x0 + w, 1.3, z0 + d, m);
    B.box(x0 - 0.05, 1.3, z0 - 0.05, x0 + w + 0.05, 1.42, z0 + d + 0.05, worldMat('metal', { color: 0x222222 }));
    for (let i = 0; i < 3; i++) put('trashbag', x0 + (alongX ? rnd() * w : -0.5 - rnd() * 0.6), 0, z0 + (alongX ? -0.5 - rnd() * 0.6 : rnd() * d), 0.8, rnd() < 0.5, { collide: false, fallback: false });
  };

  const hedge = (x0, z0, x1, z1) => B.box(x0, 0, z0, x1, 0.9, z1, worldMat('leaves', { color: 0x6a8a4a }));

  // ---------- A. Military checkpoint on the north road ----------
  sandbags(-9, -97, -3, -97, 1.3); sandbags(3, -97, 9, -97, 1.3);
  sandbags(-9, -113, -3.5, -113, 1.1); sandbags(3.5, -113, 9, -113, 1.1);
  sandbags(-9.5, -110, -9.5, -100, 1.1);
  put('barrier', -1.6, 0, -90, 3, true); put('barrier', 2, 0, -84, 3, true); put('barrier', -2, 0, -120, 3, true);
  tent(12, -106, 19, -99, 0x5a6040, 'w');
  tent(12, -117, 19, -110, 0x5a6040, 'w');
  bench(17.8, -102.5, -Math.PI / 2);
  for (let i = 0; i < 3; i++) cot(12.6 + i * 2.1, -116.4, false);
  put('medBox', 18, 0, -111, 0.6, true, { collide: false });
  put('milCrate', 14, 0, -108.2, 1.2, true); put('milCrate', 21.5, 0, -100, 1.2, false); put('milCrate', 21.5, 0.0, -102, 1.2, false);
  put('generator', 21.5, 0, -106, 1.2, true); put('jerrycan', 21.3, 0, -108, 0.45, true, { collide: false });
  put('barrel', 21.5, 0, -110, 0.9, true, { explosive: true }); put('barrel', 22.4, 0, -110.6, 0.9, true, { explosive: true });
  // watchtower
  const tw = { x0: -16.5, z0: -104.5, x1: -12.5, z1: -100.5, top: 6 };
  for (const [px, pz] of [[tw.x0, tw.z0], [tw.x1 - 0.3, tw.z0], [tw.x0, tw.z1 - 0.3], [tw.x1 - 0.3, tw.z1 - 0.3]]) B.box(px, 0, pz, px + 0.3, tw.top + 3, pz + 0.3, 'wood');
  B.box(tw.x0 - 0.2, tw.top - 0.2, tw.z0 - 0.2, tw.x1 + 0.2, tw.top, tw.z1 + 0.2, 'wood', { walkable: true });
  B.box(tw.x0 - 0.2, tw.top, tw.z0 - 0.2, tw.x1 + 0.2, tw.top + 1.1, tw.z0, 'wood');
  B.box(tw.x0 - 0.2, tw.top, tw.z1, tw.x1 + 0.2, tw.top + 1.1, tw.z1 + 0.2, 'wood');
  B.box(tw.x0 - 0.2, tw.top, tw.z0, tw.x0, tw.top + 1.1, tw.z1, 'wood');
  B.box(tw.x0 - 0.5, tw.top + 3, tw.z0 - 0.5, tw.x1 + 0.5, tw.top + 3.2, tw.z1 + 0.5, worldMat('corrugated', { color: 0x6a7050 }), { collide: false });
  ladder(tw.x1 + 0.2, -103.2, tw.x1 + 0.7, -101.8, 0, tw.top, false);
  put('floodlight', -14.5, tw.top, -101.2, 0.7, true, { collide: false, fallback: false });
  town.gunSpots.push({ x: -14.5, y: tw.top, z: -102.5 });
  town.ammoSpots.push({ x: 15, y: 0, z: -101 }, { x: -6, y: 0, z: -105 });
  town.lamps.push(new THREE.Vector3(-14.5, tw.top + 2.6, -102.5));
  town.pois.push({ name: 'Checkpoint', x: 0, z: -105 });

  // ---------- B. Junkyard (east) ----------
  const J = { x0: 112, z0: -152, x1: 162, z1: -100 }, rust = worldMat('corrugated', { color: 0x9a7a62 });
  B.box(J.x0, 0, J.z0, J.x1, 3, J.z0 + 0.2, rust); B.box(J.x0, 0, J.z1 - 0.2, J.x1, 3, J.z1, rust);
  B.box(J.x1 - 0.2, 0, J.z0, J.x1, 3, J.z1, rust);
  B.box(J.x0, 0, J.z0, J.x0 + 0.2, 3, -131, rust); B.box(J.x0, 0, -121, J.x0 + 0.2, 3, J.z1, rust); // gate gap on the west
  B.box(J.x0 - 0.1, 0, -131.3, J.x0 + 0.3, 4, -131, 'metal'); B.box(J.x0 - 0.1, 0, -121, J.x0 + 0.3, 4, -120.7, 'metal');
  B.box(J.x0 - 10, -0.2, -129, J.x0, 0.03, -123, 'dirt', { collide: false }); // track to the gate
  B.box(J.x0, -0.2, J.z0, J.x1, 0.025, J.z1, 'dirt', { collide: false });
  // crushed car stacks
  const carModels = ['sedan', 'suv', 'van', 'taxi', 'hatchback', 'police', 'delivery'];
  for (const [cx, cz, n] of [[120, -146, 3], [126, -146, 2], [132, -146, 3], [154, -140, 3], [154, -133, 2], [154, -112, 3], [120, -106, 2]]) {
    for (let k = 0; k < n; k++) {
      const tint = pick([0x6a5446, 0x5a4a40, 0x4a3e36, 0x7a6050]);
      if (!B.props.place(pick(carModels), cx - 2.2, k * 1.05, cz - 1.0, cx + 2.2, (k + 1) * 1.05, cz + 1.0, { rotY: Math.PI / 2 + (rnd() - 0.5) * 0.3, tint }))
        B.box(cx - 2.2, k * 1.05, cz - 1, cx + 2.2, (k + 1) * 1.05, cz + 1, worldMat('metal', { color: tint }), { collide: false });
    }
    physics.addBox(cx - 2.2, 0, cz - 1.0, cx + 2.2, n * 1.05, cz + 1.0);
  }
  // tyre piles and scrap heaps
  const rubber = worldMat('asphalt', { color: 0x262626 });
  for (const [tx, tz] of [[140, -146], [144, -146], [128, -112], [146, -104]]) {
    for (let k = 0; k < 4 + Math.floor(rnd() * 3); k++) { const ox = (rnd() - 0.5) * 0.3, oz = (rnd() - 0.5) * 0.3; B.box(tx - 0.45 + ox, k * 0.3, tz - 0.45 + oz, tx + 0.45 + ox, k * 0.3 + 0.3, tz + 0.45 + oz, rubber, { collide: k === 0 }); }
  }
  for (const [sx, sz] of [[138, -128], [128, -122], [146, -122]]) {
    for (let k = 0; k < 14; k++) {
      const w = 0.4 + rnd() * 1.4, h = 0.2 + rnd() * 0.8, ox = (rnd() - 0.5) * 3.5, oz = (rnd() - 0.5) * 3.5, y = rnd() * 0.8;
      B.box(sx + ox, y, sz + oz, sx + ox + w, y + h, sz + oz + w * (0.4 + rnd()), rnd() < 0.5 ? rust : worldMat('metal', { color: 0x5a4a3a }), { collide: y < 0.3 });
    }
  }
  // shipping containers, one stacked so you can climb it
  container(140, 0, -112, true, 0x8a3a2a); container(140, 2.6, -112, true, 0x2a4a6a); container(146.3, 0, -112, true, 0x3a5a3a);
  ladder(139.4, -110.6, 139.9, -109.4, 0, 5.2, false);
  town.gunSpots.push({ x: 143, y: 5.2, z: -110.8 });
  // crane: a tall tower + boom that reads great in the fog
  for (const [px, pz] of [[150, -128], [151.6, -128], [150, -126.4], [151.6, -126.4]]) B.box(px, 0, pz, px + 0.35, 16, pz + 0.35, worldMat('metal', { color: 0xb08a20 }));
  for (let y = 2; y < 16; y += 3) B.box(149.9, y, -128.1, 152.05, y + 0.2, -126, worldMat('metal', { color: 0xb08a20 }), { collide: false });
  B.box(141, 16, -127.6, 156, 16.6, -126.8, worldMat('metal', { color: 0xb08a20 }), { collide: false });
  B.box(149.5, 14.5, -128.5, 152.5, 16, -125.9, worldMat('metal', { color: 0x3a3a3a }), { collide: false });
  B.box(142.4, 9, -127.3, 142.5, 16, -127.2, 'metal', { collide: false });
  B.box(141.9, 8.4, -127.8, 143, 9, -126.7, worldMat('metal', { color: 0x333333 }), { collide: false });
  bench(130, -137, 0);
  put('generator', 134, 0, -137.5, 1.3, true);
  for (let i = 0; i < 4; i++) put('barrel', 157 + (i % 2) * 1.1, 0, -122 + Math.floor(i / 2) * 1.1, 0.9, true, { explosive: true });
  put('jerrycan', 156.5, 0, -119.4, 0.45, true, { collide: false }); put('propane', 158.5, 0, -119.4, 0.6, false);
  town.ammoSpots.push({ x: 125, y: 0, z: -130 });
  town.pois.push({ name: 'Junkyard', x: 136, z: -128 });

  // ---------- C. Park (west of the store) ----------
  const PK = { x0: -72, z0: -52, x1: -44, z1: -13 };
  B.box(PK.x0, -0.2, -33.5, PK.x1, 0.035, -31.5, 'sidewalk', { collide: false });
  B.box(-59, -0.2, PK.z0, -57, 0.036, PK.z1, 'sidewalk', { collide: false });
  hedge(PK.x0, PK.z0, -61, PK.z0 + 0.8); hedge(-55, PK.z0, PK.x1, PK.z0 + 0.8);
  hedge(PK.x0, PK.z1 - 0.8, -61, PK.z1); hedge(-55, PK.z1 - 0.8, PK.x1, PK.z1);
  hedge(PK.x0, PK.z0, PK.x0 + 0.8, -35); hedge(PK.x0, -30, PK.x0 + 0.8, PK.z1);
  // gazebo
  const gz = { x0: -61, z0: -35.5, x1: -55, z1: -29.5 };
  B.box(gz.x0 - 0.3, 0, gz.z0 - 0.3, gz.x1 + 0.3, 0.3, gz.z1 + 0.3, 'wood', { walkable: true });
  for (const [px, pz] of [[gz.x0, gz.z0], [gz.x1 - 0.25, gz.z0], [gz.x0, gz.z1 - 0.25], [gz.x1 - 0.25, gz.z1 - 0.25]]) B.box(px, 0.3, pz, px + 0.25, 3.2, pz + 0.25, worldMat('plaster', { color: 0xe8e4d8 }));
  for (let i = 0; i < 4; i++) B.box(gz.x0 - 0.6 + i * 0.75, 3.2 + i * 0.45, gz.z0 - 0.6 + i * 0.75, gz.x1 + 0.6 - i * 0.75, 3.65 + i * 0.45, gz.z1 + 0.6 - i * 0.75, 'roof');
  for (const [bx, bz, ax] of [[-66, -36, true], [-50, -36, true], [-66, -28.5, true], [-50, -28.5, true], [-61.5, -45, false], [-61.5, -20, false]]) put('bench', bx, 0, bz, 1.8, ax);
  put('picnic', -66, 0, -45, 2.2, true); put('picnic', -50, 0, -45, 2.2, true); put('picnic', -66, 0, -20, 2.2, false); put('picnic', -50, 0, -19, 2.2, true);
  put('firePit', -50.5, 0, -40.5, 1.3, true, { colH: 0.4 });
  put('trash', -54.5, 0, -33.9, 0.7, true); put('trash', -61.6, 0, -30.9, 0.7, true);
  for (const [lx, lz] of [[-60.5, -40], [-55.5, -24]]) {
    B.box(lx - 0.12, 0, lz - 0.12, lx + 0.12, 5, lz + 0.12, 'metal');
    B.box(lx - 0.35, 5, lz - 0.35, lx + 0.35, 5.25, lz + 0.35, worldMat('plaster', { color: 0xfff0c0, emissive: 0xffd890, emissiveIntensity: 2 }), { collide: false });
    town.lamps.push(new THREE.Vector3(lx, 5, lz));
  }
  town.ammoSpots.push({ x: -58, y: 0.3, z: -32.5 });
  town.pois.push({ name: 'The Park', x: -66, z: -40 });

  // ---------- D. Field hospital beside the clinic ----------
  tent(47, 24, 54, 33, 0xd8d4c8, 'w', true);
  tent(47, 36, 54, 45, 0xd8d4c8, 'w', true);
  for (let i = 0; i < 3; i++) { cot(49 + i * 1.6, 24.6, false); cot(49 + i * 1.6, 42.4, false); }
  put('medBox', 52.5, 0.55, 31, 0.5, true, { collide: false }); put('medBox', 48, 0, 37, 0.6, false, { collide: false });
  put('wetSign', 45.6, 0, 27, 0.5, true, { collide: false }); put('generator', 56, 0, 34.5, 1.2, false);
  sandbags(57.5, 23, 57.5, 30, 1.0);
  town.ammoSpots.push({ x: 50, y: 0, z: 40 });

  // ---------- E. Burning wrecks ----------
  wreck(4, 66, true); wreck(4, -20, true); wreck(60, 3, false, false); wreck(-110, -3, false); wreck(130, 4, false); wreck(-4, -160, true, false);
  wreck(-60, 4, false, false);

  // ---------- F. Street clutter ----------
  dumpster(-31, 31.4, true); dumpster(-29, -17.4, true); dumpster(-31, -56.6, true); dumpster(36.6, -33, false);
  dumpster(31, 121, false);
  for (const [x, z] of [[9.3, -40], [-9.6, 52], [9.3, 88], [-9.6, -120], [44, -9.3], [-85, 9.3]]) put('trash', x, 0, z, 0.7, true);
  for (const [x, z, ax] of [[12, 9.6, true], [-14, -9.6, true], [9.6, -12, false]]) put('barrier', x, 0, z, 3, ax);
  sandbags(-12, 11, -6.5, 11, 1.0);
  // power lines along both streets
  const inBuilding = (x, z) => town.buildings.some((bd) => x > bd.x0 - 1 && x < bd.x1 + 1 && z > bd.z0 - 1 && z < bd.z1 + 1);
  const poleAt = (x, z, wiresAlongX) => {
    if (inBuilding(x, z) || !free(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0.05, 8)) return null;
    B.box(x - 0.14, 0, z - 0.14, x + 0.14, 9, z + 0.14, worldMat('bark', { color: 0x6a5a48 }));
    if (wiresAlongX) B.box(x - 0.08, 8.2, z - 1.1, x + 0.08, 8.36, z + 1.1, 'wood', { collide: false });
    else B.box(x - 1.1, 8.2, z - 0.08, x + 1.1, 8.36, z + 0.08, 'wood', { collide: false });
    return new THREE.Vector3(x, 8.4, z);
  };
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x151515 });
  const string = (list, alongX) => {
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1];
      if (!a || !b) continue;
      for (const off of [-0.9, 0, 0.9]) {
        const pa = a.clone(), pb = b.clone();
        if (alongX) { pa.z += off; pb.z += off; } else { pa.x += off; pb.x += off; }
        const len = pa.distanceTo(pb);
        const geo = new THREE.CylinderGeometry(0.02, 0.02, len, 3);
        const mid = pa.clone().add(pb).multiplyScalar(0.5); mid.y -= 0.35; // a little sag
        geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pb.clone().sub(pa).normalize()));
        geo.translate(mid.x, mid.y, mid.z);
        wires.push(geo);
      }
    }
  };
  const wires = [];
  const ew = [], ns = [];
  for (let x = -160; x <= 160; x += 30) ew.push(poleAt(x + 3, -10.6, true));
  for (let z = -160; z <= 160; z += 30) ns.push(poleAt(10.6, z + 9, false));
  string(ew, true); string(ns, false);
  if (wires.length) scene.add(new THREE.Mesh(mergeGeometries(wires, false), wireMat)); // one draw call for every wire
  // gas station: fuel cans, a propane cage and a couple of very tempting red barrels
  put('barrel', -10.5, 0, 111.5, 0.9, true, { explosive: true }); put('barrel', -10.6, 0, 112.6, 0.9, true, { explosive: true });
  put('barrel', 10.6, 0, 115, 0.9, true, { explosive: true });
  put('jerrycan', -4.2, 0, 109.6, 0.45, true, { collide: false }); put('jerrycan', 5.8, 0, 117.6, 0.45, false, { collide: false });
  for (let i = 0; i < 3; i++) put('propane', 31.4 + i * 0.7, 0, 106.8, 0.55, false, { explosive: true });
  B.box(31, 0, 106.3, 33.4, 1.6, 106.36, worldMat('metal', { color: 0x777777 }), { collide: false });
  // containers by the warehouse lot
  container(104, 0, 1, false, 0x8a3a2a); container(107, 0, 1, false, 0x2a4a6a); container(104, 2.6, 1, false, 0x6a6a6a);
  ladder(103.4, 2.4, 103.9, 3.6, 0, 5.2, false);
  town.gunSpots.push({ x: 105.2, y: 5.2, z: 4 });
  // backyard stuff at the houses
  put('picnic', 67, 0, 64, 2, true); put('picnic', 91, 0, 64, 2, true);
  for (const [x, z] of [[58.6, 50], [82.6, 50], [58.6, 80]]) B.box(x, 0, z, x + 0.5, 1.1, z + 0.5, worldMat('metal', { color: 0x3a4a6a })); // mailboxes
  // warehouse workbench
  let wz = -26;
  while (wz < -12 && !free(97.2, wz - 1.3, 99.4, wz + 1.3, 0.05, 1.5)) wz += 2.5;
  bench(98.6, wz, -Math.PI / 2);

  // ---------- G. Radio tower ----------
  const RT = { x0: 128, z0: 108, x1: 134, z1: 114, top: 34, deck: 26 };
  const red = worldMat('metal', { color: 0x9a2a20 }), white = worldMat('metal', { color: 0xd8d8d0 });
  for (const [px, pz] of [[RT.x0, RT.z0], [RT.x1 - 0.3, RT.z0], [RT.x0, RT.z1 - 0.3], [RT.x1 - 0.3, RT.z1 - 0.3]]) {
    for (let y = 0; y < RT.top; y += 4) B.box(px, y, pz, px + 0.3, Math.min(RT.top, y + 4), pz + 0.3, (y / 4) % 2 ? white : red, { collide: true });
  }
  for (let y = 3; y < RT.top; y += 4) {
    B.box(RT.x0, y, RT.z0, RT.x1, y + 0.15, RT.z0 + 0.15, 'metal', { collide: false }); B.box(RT.x0, y, RT.z1 - 0.15, RT.x1, y + 0.15, RT.z1, 'metal', { collide: false });
    B.box(RT.x0, y, RT.z0, RT.x0 + 0.15, y + 0.15, RT.z1, 'metal', { collide: false }); B.box(RT.x1 - 0.15, y, RT.z0, RT.x1, y + 0.15, RT.z1, 'metal', { collide: false });
  }
  B.box(RT.x0 - 0.8, RT.deck - 0.2, RT.z0 - 0.8, RT.x1 + 0.8, RT.deck, RT.z1 + 0.8, 'plate', { walkable: true });
  B.box(RT.x0 - 0.8, RT.deck, RT.z0 - 0.8, RT.x1 + 0.8, RT.deck + 1.0, RT.z0 - 0.7, 'metal'); B.box(RT.x0 - 0.8, RT.deck, RT.z1 + 0.7, RT.x1 + 0.8, RT.deck + 1.0, RT.z1 + 0.8, 'metal');
  B.box(RT.x1 + 0.7, RT.deck, RT.z0 - 0.8, RT.x1 + 0.8, RT.deck + 1.0, RT.z1 + 0.8, 'metal');
  B.box(RT.x0 + 2.6, RT.top, RT.z0 + 2.6, RT.x1 - 2.6, RT.top + 6, RT.z1 - 2.6, white, { collide: false });
  for (const [ax, ay, az] of [[RT.x0 - 0.1, 30, RT.z0 + 1], [RT.x1 - 0.1, 22, RT.z1 - 1.6]]) B.box(ax, ay, az, ax + 0.4, ay + 1.4, az + 0.8, white, { collide: false }); // dishes
  B.box(RT.x0 + 2.75, RT.top + 6, RT.z0 + 2.75, RT.x1 - 2.75, RT.top + 6.5, RT.z1 - 2.75, worldMat('plaster', { color: 0xff2010, emissive: 0xff1000, emissiveIntensity: 3 }), { collide: false });
  ladder(RT.x0 - 0.7, 110.4, RT.x0 - 0.2, 111.6, 0, RT.deck, false);
  town.gunSpots.push({ x: 131, y: RT.deck, z: 111 });
  town.emitters.push({ x: 131, y: RT.top + 6.3, z: 111, kind: 'beacon' });
  town.ziplines.push({ a: new THREE.Vector3(RT.x0 - 0.6, RT.deck + 2.4, 112.5), b: new THREE.Vector3(72.5, 10.4, 58) });
  town.pois.push({ name: 'Radio Tower', x: 124, z: 104 });
}
