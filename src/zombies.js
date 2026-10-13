import * as THREE from 'three';
import { tex } from './textures.js';
import { NAV_CELL, NAV_HALF, NAV_N } from './town.js';
import { sfx } from './audio.js';

// ---------- shared geometry / materials ----------
const G = {
  leg: new THREE.BoxGeometry(0.28, 0.9, 0.28).translate(0, -0.45, 0),
  torso: new THREE.BoxGeometry(0.64, 0.8, 0.36),
  head: new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(0, 0.25, 0),
  arm: new THREE.BoxGeometry(0.22, 0.8, 0.22).translate(0, -0.36, 0),
  eye: new THREE.BoxGeometry(0.11, 0.06, 0.02),
  belly: new THREE.BoxGeometry(0.5, 0.45, 0.1),
};
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false });
const eyeMatRed = new THREE.MeshBasicMaterial({ color: 0xff5040, toneMapped: false });
const glowBelly = new THREE.MeshBasicMaterial({ color: 0xff7a20, toneMapped: false });
const iceMat = new THREE.MeshStandardMaterial({ color: 0xa8e4ff, roughness: 0.15, metalness: 0.1, emissive: 0x1a4a6a, transparent: true, opacity: 0.88 });
const charMat = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 1 });
const skinTints = [0xd8cfae, 0xb8b49a, 0xa8b090, 0xc9b28c, 0x9e9a8a, 0xe0d8c0];
const clothTints = [0x5a5a5e, 0x6a5440, 0x46505e, 0x807a72, 0x46523e, 0x8a3a30, 0x5a6478, 0x38383c];
let skinMats, clothMats, pantsMats;
function mats() {
  if (skinMats) return;
  skinMats = skinTints.map((c) => new THREE.MeshStandardMaterial({ map: tex('zSkin'), color: c, roughness: 0.9 }));
  clothMats = clothTints.map((c) => new THREE.MeshStandardMaterial({ map: tex('zCloth'), color: c, roughness: 0.95 }));
  pantsMats = [0x3e3e44, 0x544a3a, 0x3a4256, 0x6a645a].map((c) => new THREE.MeshStandardMaterial({ map: tex('zCloth'), color: c, roughness: 0.95 }));
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const ZTYPES = {
  walker: { hp: 1, speed: 1, dmg: 20, scale: 1, score: 50 },
  runner: { hp: 0.7, speed: 2.3, dmg: 14, scale: 0.95, score: 60 },
  brute: { hp: 11, speed: 1.15, dmg: 45, scale: 1.85, score: 300, armor: 0.6 },
  exploder: { hp: 1.2, speed: 1.3, dmg: 30, scale: 1.1, score: 80 },
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ray = new THREE.Raycaster();

export class ZombieManager {
  constructor(game) {
    mats();
    this.game = game;
    this.list = [];
    this.fields = new Map(); // target cell -> { dist, t }
    this.groanBudget = 0;
    this.hash = new Map();
  }

  // ---------- flow fields ----------
  cellOf(x, z) {
    const cx = Math.max(0, Math.min(NAV_N - 1, Math.floor((x + NAV_HALF) / NAV_CELL)));
    const cz = Math.max(0, Math.min(NAV_N - 1, Math.floor((z + NAV_HALF) / NAV_CELL)));
    return cz * NAV_N + cx;
  }

  field(x, z, now) {
    let c = this.cellOf(x, z);
    const nav = this.game.town.nav;
    if (nav.blocked[c]) { // snap target to nearest open cell
      const cx = c % NAV_N, cz = (c / NAV_N) | 0;
      let bestD = Infinity, bestC = c;
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= NAV_N || nz >= NAV_N) continue;
        const d = dx * dx + dz * dz;
        if (!nav.blocked[nz * NAV_N + nx] && d < bestD) { bestD = d; bestC = nz * NAV_N + nx; }
      }
      c = bestC;
    }
    let f = this.fields.get(c);
    if (f && now - f.t < 0.6) return f.dist;
    const dist = f ? f.dist : new Uint16Array(NAV_N * NAV_N);
    dist.fill(65535);
    const q = this.q || (this.q = new Int32Array(NAV_N * NAV_N));
    let head = 0, tail = 0;
    dist[c] = 0; q[tail++] = c;
    const blocked = nav.blocked;
    while (head < tail) {
      const i = q[head++];
      const cx = i % NAV_N, cz = (i / NAV_N) | 0, d = dist[i] + 1;
      if (cx > 0 && !blocked[i - 1] && dist[i - 1] > d) { dist[i - 1] = d; q[tail++] = i - 1; }
      if (cx < NAV_N - 1 && !blocked[i + 1] && dist[i + 1] > d) { dist[i + 1] = d; q[tail++] = i + 1; }
      if (cz > 0 && !blocked[i - NAV_N] && dist[i - NAV_N] > d) { dist[i - NAV_N] = d; q[tail++] = i - NAV_N; }
      if (cz < NAV_N - 1 && !blocked[i + NAV_N] && dist[i + NAV_N] > d) { dist[i + NAV_N] = d; q[tail++] = i + NAV_N; }
    }
    this.fields.set(c, { dist, t: now });
    if (this.fields.size > 10) { // drop oldest
      let oldK, oldT = Infinity;
      for (const [k, v] of this.fields) if (v.t < oldT) { oldT = v.t; oldK = k; }
      this.fields.delete(oldK);
    }
    return dist;
  }

  // Direction (into out) to follow the field from (x,z). Returns false if unreachable.
  flowDir(dist, x, z, out) {
    const nav = this.game.town.nav;
    const c = this.cellOf(x, z);
    const cx = c % NAV_N, cz = (c / NAV_N) | 0;
    let best = dist[c], bx = 0, bz = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= NAV_N || nz >= NAV_N) continue;
      const ni = nz * NAV_N + nx;
      if (nav.blocked[ni]) continue;
      if (dx && dz && (nav.blocked[cz * NAV_N + nx] || nav.blocked[nz * NAV_N + cx])) continue; // no corner cutting
      const d = dist[ni] + (dx && dz ? 0.4 : 0);
      if (d < best) { best = d; bx = dx; bz = dz; }
    }
    if (best >= 65535) return false;
    if (!bx && !bz) return false;
    // steer toward the centre of the chosen neighbour cell
    const tx = -NAV_HALF + (cx + bx + 0.5) * NAV_CELL, tz = -NAV_HALF + (cz + bz + 0.5) * NAV_CELL;
    out.set(tx - x, 0, tz - z).normalize();
    return true;
  }

  reachable(x, z, now) {
    const p = this.game.player.pos;
    const d = this.field(p.x, p.z, now);
    return d[this.cellOf(x, z)] < 65535;
  }

  // ---------- spawning ----------
  spawn(type, x, z, y = 0, rising = true) {
    const def = ZTYPES[type];
    const round = this.game.round;
    const s = def.scale * (0.92 + Math.random() * 0.16);
    const root = new THREE.Group();
    const body = new THREE.Group(); // animated offset (rising / crawling)
    root.add(body);
    const skin = pick(skinMats), cloth = pick(clothMats), pants = pick(pantsMats);
    const mk = (geo, mat, part) => {
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.userData.part = part; return m;
    };
    const hips = new THREE.Group(); hips.position.y = 0.9; body.add(hips);
    const legL = new THREE.Group(); legL.position.set(-0.16, 0, 0); hips.add(legL);
    const legR = new THREE.Group(); legR.position.set(0.16, 0, 0); hips.add(legR);
    const legLm = mk(G.leg, pants, 'legL'), legRm = mk(G.leg, pants, 'legR');
    legL.add(legLm); legR.add(legRm);
    const torso = mk(G.torso, cloth, 'torso'); torso.position.y = 0.4; hips.add(torso);
    const neck = new THREE.Group(); neck.position.y = 0.4; torso.add(neck);
    const head = mk(G.head, skin, 'head'); neck.add(head);
    const eMat = type === 'runner' || type === 'brute' ? eyeMatRed : eyeMat;
    for (const ex of [-0.12, 0.12]) { const e = new THREE.Mesh(G.eye, eMat); e.position.set(ex, 0.3, 0.255); head.add(e); }
    const armL = new THREE.Group(); armL.position.set(-0.43, 0.32, 0); torso.add(armL);
    const armR = new THREE.Group(); armR.position.set(0.43, 0.32, 0); torso.add(armR);
    const armMat = Math.random() < 0.5 ? skin : cloth;
    const armLm = mk(G.arm, armMat, 'armL'), armRm = mk(G.arm, armMat, 'armR');
    armL.add(armLm); armR.add(armRm);
    if (type === 'exploder') { const b = new THREE.Mesh(G.belly, glowBelly); b.position.set(0, -0.05, 0.19); torso.add(b); torso.scale.set(1.25, 1, 1.4); }
    root.scale.setScalar(s);
    root.position.set(x, y, z);
    this.game.scene.add(root);

    const hpBase = (40 + round * 9) * def.hp;
    const speedBase = Math.min(4.6, 2.3 + round * 0.13 + Math.random() * 0.5);
    const zb = {
      type, def, root, body, hips, legL, legR, torso, neck, head, armL, armR,
      parts: [legLm, legRm, torso, head, armLm, armRm],
      pos: root.position, vel: new THREE.Vector3(), yaw: Math.random() * 6,
      hp: hpBase, maxHp: hpBase, speed: type === 'runner' ? Math.min(7.4, 5.4 + round * 0.1) : speedBase * def.speed,
      r: 0.34 * s, h: 1.95 * s, scale: s,
      phase: Math.random() * 10, attackCd: 0, windup: 0, rise: rising ? 1.1 : 0,
      lostLegs: false, lostArms: 0, dead: false,
      flank: (Math.random() - 0.5) * 2, // lateral offset preference
      lead: Math.random() < 0.5 ? 0.6 + Math.random() * 0.8 : 0, // how much they predict where you are going
      groanT: Math.random() * 6, stuckT: 0, lastPos: new THREE.Vector3(x, y, z), climbing: false, res: {},
      wallHitT: 0,
    };
    for (const p of zb.parts) p.userData.zombie = zb;
    if (rising) {
      body.position.y = -2.0;
      this.game.effects.dust(new THREE.Vector3(x, y + 0.1, z), new THREE.Vector3(0, 1, 0), 0x4a3a28, 14);
    }
    this.list.push(zb);
    return zb;
  }

  // ---------- damage ----------
  damage(z, part, amount, dir, opts = {}) {
    if (z.dead) return { killed: false };
    let mult = 1;
    const head = part === 'head';
    if (head) mult = 2.6;
    else if (part && part !== 'torso') mult = 0.85;
    if (z.def.armor && !head && !opts.explosive) mult *= z.def.armor;
    if (z.frozenT > 0) mult *= 2; // frozen zombies are brittle
    const dmg = amount * mult;
    z.hp -= dmg;
    const pos = _v.copy(z.pos); pos.y += (head ? 2 : 1.2) * z.scale;
    if (z.frozenT > 0) this.game.effects.sparks(pos, 4, 0xc8f0ff, 4);
    else if (!opts.flame) this.game.effects.blood(pos, dir, head ? 10 : 6, 5);
    // knockback/stagger
    if (dir) z.vel.addScaledVector(dir, Math.min(6, amount * 0.04) / (z.type === 'brute' ? 4 : 1));
    // dismemberment
    if (z.hp > 0 && !opts.noDismember) {
      if ((part === 'armL' || part === 'armR') && dmg > 25 && Math.random() < 0.6) this.detach(z, part, dir);
      if ((part === 'legL' || part === 'legR') && dmg > 25 && Math.random() < 0.45 && z.type !== 'brute') this.detach(z, part, dir);
    }
    if (z.hp <= 0) { this.kill(z, dir, { ...opts, headshot: head }); return { killed: true, headshot: head }; }
    return { killed: false, headshot: head };
  }

  detach(z, part, dir) {
    const idx = z.parts.findIndex((p) => p.userData.part === part);
    if (idx < 0) return;
    const mesh = z.parts[idx];
    z.parts.splice(idx, 1);
    const v = (dir ? dir.clone().multiplyScalar(5) : new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3));
    this.game.effects.gib(mesh, v, this.game.scene);
    this.game.effects.blood(mesh.position, dir, 12, 5);
    if (part.startsWith('arm')) z.lostArms++;
    if (part.startsWith('leg') && !z.lostLegs) {
      z.lostLegs = true; // becomes a crawler: drop the other leg too
      const other = z.parts.find((p) => p.userData.part.startsWith('leg'));
      if (other) { z.parts.splice(z.parts.indexOf(other), 1); this.game.effects.gib(other, v.clone().multiplyScalar(0.5), this.game.scene); }
      z.speed *= 0.5;
    }
  }

  // ---------- status effects ----------
  ignite(z, dur = 3.5) {
    if (z.dead || z.frozenT > 0) return;
    z.burnT = Math.max(z.burnT || 0, dur);
  }

  freeze(z, dur = 4) {
    if (z.dead) return;
    z.burnT = 0;
    if (!(z.frozenT > 0)) for (const m of z.parts) { m.userData.mat = m.material; m.material = iceMat; }
    z.frozenT = Math.max(z.frozenT || 0, dur);
  }

  thaw(z) {
    z.frozenT = 0; z.chill = 0;
    for (const m of z.parts) if (m.userData.mat) { m.material = m.userData.mat; m.userData.mat = null; }
  }

  // Burning, frozen and black-hole states. Returns true if the zombie's normal AI should be skipped.
  status(z, dt) {
    const fx = this.game.effects;
    if (z.vortex) {
      const v = z.vortex;
      if (v.dead) { z.vortex = null; return false; }
      const to = _v.copy(v.pos).sub(z.pos); to.y -= 1;
      const d = to.length();
      const pull = Math.min(d, (5 + Math.max(0, 16 - d) * 1.2) * dt);
      z.pos.addScaledVector(to.normalize(), pull);
      z.vel.set(0, 0, 0);
      z.root.rotation.y += dt * 9; z.root.rotation.z = Math.sin(this.game.time * 7 + z.phase) * 0.6;
      this.animate(z, dt, 6);
      return true;
    }
    if (z.root.rotation.z) z.root.rotation.z *= 0.8;
    if (z.frozenT > 0) {
      z.frozenT -= dt;
      z.vel.x = 0; z.vel.z = 0; z.vel.y -= 22 * dt;
      this.game.physics.move(z.pos, z.vel, dt, z.r, z.h, 0.65 * z.scale, z.res);
      if (Math.random() < dt * 3) fx.glow.spawn({ pos: _v.set(z.pos.x + (Math.random() - 0.5), z.pos.y + Math.random() * 2 * z.scale, z.pos.z + (Math.random() - 0.5)), vel: _v2.set(0, 0.3, 0), size: 0.05, life: 0.6, g: 0, color: 0xc8f0ff });
      if (z.frozenT <= 0) this.thaw(z);
      return true;
    }
    if (z.burnT > 0) {
      z.burnT -= dt;
      z.burnFx = (z.burnFx || 0) - dt;
      if (z.burnFx <= 0) {
        z.burnFx = 0.09;
        fx.smoke(_v.set(z.pos.x + (Math.random() - 0.5) * 0.5, z.pos.y + (0.6 + Math.random() * 1.2) * z.scale, z.pos.z + (Math.random() - 0.5) * 0.5), { size: 0.7 * z.scale, life: 0.5, fire: true, opacity: 0.8, grow: 1.2, vel: _v2.set(0, 2.5, 0) });
        if (Math.random() < 0.3) fx.smoke(_v.set(z.pos.x, z.pos.y + 2 * z.scale, z.pos.z), { size: 1, life: 1.6, color: 0x2a2624, opacity: 0.35, grow: 2, vel: _v2.set(0, 2, 0) });
      }
      const dps = (25 + this.game.round * 4) * (z.type === 'brute' ? 2.5 : 1);
      z.hp -= dps * dt;
      if (z.hp <= 0) {
        for (const m of z.parts) m.material = charMat;
        this.kill(z, null, { fire: true, explosive: true });
        return true;
      }
    }
    return false;
  }

  kill(z, dir, opts = {}) {
    if (z.dead) return;
    z.dead = true;
    if (z.frozenT > 0) {
      // shatter into ice
      const c = _v2.copy(z.pos); c.y += 1.1 * z.scale;
      for (let i = 0; i < 26; i++) this.game.effects.solid.spawn({ pos: c, vel: new THREE.Vector3((Math.random() - 0.5) * 10, 2 + Math.random() * 7, (Math.random() - 0.5) * 10), size: 0.1 + Math.random() * 0.22, life: 3 + Math.random() * 2, floor: this.game.effects.floorAt(c.x, c.y, c.z), color: 0xa8e4ff });
      opts = { ...opts, shatter: true };
    }
    const power = opts.explosive ? 14 : opts.melee ? 9 : 5 + Math.random() * 3;
    const center = _v2.copy(z.pos); center.y += 1.2 * z.scale;
    const d = dir ? dir.clone() : new THREE.Vector3(0, 0, 0);
    for (const p of z.parts) {
      if (opts.headshot && p.userData.part === 'head') {
        // head pops into blocks
        p.updateWorldMatrix(true, false);
        const hp = new THREE.Vector3().setFromMatrixPosition(p.matrixWorld);
        this.game.effects.blood(hp, d, 22, 7);
        for (let i = 0; i < 6; i++) this.game.effects.solid.spawn({ pos: hp, vel: new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 6).addScaledVector(d, 4), size: 0.12 + Math.random() * 0.1, life: 4, floor: this.game.effects.floorAt(hp.x, hp.y, hp.z), color: p.material.color.clone().multiply(new THREE.Color(0.8, 0.8, 0.8)) });
        p.parent.remove(p);
        continue;
      }
      p.updateWorldMatrix(true, false);
      const wp = new THREE.Vector3().setFromMatrixPosition(p.matrixWorld);
      const away = wp.sub(center).normalize();
      const v = d.clone().multiplyScalar(power).addScaledVector(away, power * 0.6).add(new THREE.Vector3(0, 3 + Math.random() * power * 0.5, 0));
      this.game.effects.gib(p, v, this.game.scene);
    }
    // extra chunks so they visibly "explode"
    const chunkColors = [0x7a1010, 0x5a0a0a, z.parts[0]?.material?.color?.getHex?.() ?? 0x444444];
    for (let i = 0; i < (opts.explosive ? 16 : 8); i++) {
      this.game.effects.solid.spawn({ pos: center, vel: new THREE.Vector3((Math.random() - 0.5) * power, 2 + Math.random() * power, (Math.random() - 0.5) * power).addScaledVector(d, power * 0.4), size: 0.1 + Math.random() * 0.15, life: 3 + Math.random() * 3, floor: this.game.effects.floorAt(center.x, center.y, center.z), color: pick(chunkColors) });
    }
    this.game.effects.blood(center, d, 26, 8);
    this.game.effects.decal(z.pos.x, this.game.effects.floorAt(z.pos.x, z.pos.y + 0.5, z.pos.z), z.pos.z, 2.2);
    sfx.splat(z.pos);
    this.game.scene.remove(z.root);
    if (z.type === 'exploder') {
      const p = z.pos.clone(); p.y += 1;
      setTimeout(() => this.game.explode(p, 6, 160, { fromZombie: true }), 60);
    }
    this.game.onZombieKilled(z, opts);
  }

  // Returns {zombie, part, dist, point} for the nearest zombie hit along a ray.
  raycast(origin, dir, maxDist) {
    const cands = [];
    for (const z of this.list) {
      if (z.dead) continue;
      _v.copy(z.pos); _v.y += 1.1 * z.scale;
      _v.sub(origin);
      const t = _v.dot(dir);
      if (t < -1 || t > maxDist + 2) continue;
      const perp = _v.addScaledVector(dir, -t).lengthSq();
      if (perp > (1.6 * z.scale) ** 2) continue;
      z.root.updateMatrixWorld(true);
      for (const p of z.parts) cands.push(p);
    }
    if (!cands.length) return null;
    _ray.set(origin, dir); _ray.far = maxDist;
    const hits = _ray.intersectObjects(cands, false);
    if (!hits.length) return null;
    const h = hits[0];
    return { zombie: h.object.userData.zombie, part: h.object.userData.part, dist: h.distance, point: h.point };
  }

  // ---------- update ----------
  update(dt, now) {
    const game = this.game, player = game.player, physics = game.physics;
    const pp = player.pos;
    // where the player is, in terms of building/floor
    const pb = game.buildingAt(pp.x, pp.z);
    const pFloor = pb ? Math.floor((pp.y + 0.5) / pb.fh) : 0;
    const playerField = this.field(pp.x, pp.z, now);
    this.groanBudget = Math.min(3, this.groanBudget + dt * 1.2);

    // spatial hash for separation
    this.hash.clear();
    for (const z of this.list) {
      if (z.dead) continue;
      const k = ((z.pos.x / 2) | 0) * 1000 + ((z.pos.z / 2) | 0);
      let arr = this.hash.get(k); if (!arr) this.hash.set(k, (arr = [])); arr.push(z);
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i];
      if (z.dead) { this.list.splice(i, 1); continue; }

      // rising out of the ground
      if (z.rise > 0) {
        z.rise -= dt;
        z.body.position.y = -2.0 * Math.max(0, z.rise / 1.1);
        if (Math.random() < 0.3) game.effects.solid.spawn({ pos: _v.set(z.pos.x + (Math.random() - 0.5), z.pos.y + 0.1, z.pos.z + (Math.random() - 0.5)), vel: _v2.set((Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2), size: 0.12, life: 0.8, floor: z.pos.y, color: 0x4a3a28 });
        this.animate(z, dt, 0.2);
        continue;
      }

      if (this.status(z, dt)) continue;
      const burning = z.burnT > 0;

      // ---- choose a goal ----
      let goal = null, goalY = pp.y, direct = false;
      const bait = game.activeBait();
      if (bait && bait.pos.distanceTo(z.pos) < 55) { goal = bait.pos; goalY = bait.pos.y; }
      const toP = _v.set(pp.x - z.pos.x, 0, pp.z - z.pos.z);
      const distP = toP.length();
      const dy = pp.y - z.pos.y;
      let tx = pp.x, tz = pp.z;
      if (!goal) {
        // predictive chase so running in circles doesn't shake them
        if (z.lead && distP > 4) {
          const k = Math.min(1.4, distP / 9) * z.lead;
          tx += player.vel.x * k; tz += player.vel.z * k;
        }
        // flank offsets when at mid range
        if (distP > 6 && distP < 30) {
          const px = -toP.z / distP, pz = toP.x / distP;
          tx += px * z.flank * Math.min(6, distP * 0.3); tz += pz * z.flank * Math.min(6, distP * 0.3);
        }
      } else { tx = goal.x; tz = goal.z; }

      // player on a roof/floor with no stairs: go to the outside wall nearest the zombie and climb it
      if (!goal && pb && pFloor > 0 && pb.flights.length < pFloor) {
        const cx = Math.max(pb.x0, Math.min(pb.x1, pp.x)), cz = Math.max(pb.z0, Math.min(pb.z1, pp.z));
        const sides = [[pb.x0 - 1.2, cz], [pb.x1 + 1.2, cz], [cx, pb.z0 - 1.2], [cx, pb.z1 + 1.2]];
        let bs = null, bd = Infinity;
        for (const sd of sides) { const d = (sd[0] - z.pos.x) ** 2 + (sd[1] - z.pos.z) ** 2; if (d < bd) { bd = d; bs = sd; } }
        if (bd > 4) { tx = bs[0]; tz = bs[1]; goal = { x: tx, z: tz }; goalY = pp.y; }
        else { // at the wall: push into it toward the player (climb)
          tx = pp.x; tz = pp.z;
        }
      }
      const zb = game.buildingAt(z.pos.x, z.pos.z);
      const zFloor = zb ? Math.floor((z.pos.y + 0.5) / zb.fh) : 0;
      const desired = _v2.set(0, 0, 0);
      let usedStairs = false;
      if (!goal && pb && pFloor > 0 && pb.flights.length >= pFloor) {
        // player upstairs in a building with stairs: route via the stairwell
        if (zb === pb && zFloor >= pFloor) direct = true;
        else if (zb === pb) {
          const fl = pb.flights[zFloor];
          const onSteps = z.pos.y > zFloor * pb.fh + 0.25 || Math.hypot(z.pos.x - fl.bottom.x, z.pos.z - fl.bottom.z) < 1.1;
          const t = onSteps ? fl.top : fl.bottom;
          if (zFloor === 0 && !onSteps) {
            const f = this.field(t.x, t.z, now);
            if (!this.flowDir(f, z.pos.x, z.pos.z, desired)) desired.set(t.x - z.pos.x, 0, t.z - z.pos.z).normalize();
          } else desired.set(t.x - z.pos.x, 0, t.z - z.pos.z).normalize();
          usedStairs = true;
        } else {
          const t = pb.flights[0].bottom;
          const f = this.field(t.x, t.z, now);
          if (!this.flowDir(f, z.pos.x, z.pos.z, desired)) desired.set(t.x - z.pos.x, 0, t.z - z.pos.z).normalize();
          usedStairs = true;
        }
      }
      if (!usedStairs && !direct) {
        const gd = Math.hypot(tx - z.pos.x, tz - z.pos.z);
        if (z.pos.y > 1.5 || gd < 7) direct = true; // upstairs / close: go straight
        else {
          const f = goal ? this.field(tx, tz, now) : (Math.abs(tx - pp.x) + Math.abs(tz - pp.z) > 4 ? this.field(tx, tz, now) : playerField);
          if (!this.flowDir(f, z.pos.x, z.pos.z, desired)) direct = true;
        }
      }
      if (direct) desired.set(tx - z.pos.x, 0, tz - z.pos.z).normalize();

      // separation
      const kx = (z.pos.x / 2) | 0, kz = (z.pos.z / 2) | 0;
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const arr = this.hash.get((kx + ox) * 1000 + (kz + oz)); if (!arr) continue;
        for (const o of arr) {
          if (o === z) continue;
          const sx = z.pos.x - o.pos.x, sz = z.pos.z - o.pos.z, d2 = sx * sx + sz * sz;
          const minD = (z.r + o.r) * 1.6;
          if (d2 < minD * minD && d2 > 1e-4 && Math.abs(z.pos.y - o.pos.y) < 1.5) {
            const d = Math.sqrt(d2); desired.x += (sx / d) * (1 - d / minD) * 1.4; desired.z += (sz / d) * (1 - d / minD) * 1.4;
          }
        }
      }

      // ---- move ----
      const attacking = z.windup > 0;
      let speed = z.speed * (attacking ? 0.35 : 1) * (burning ? 1.25 : 1);
      if (distP < 1.0 * z.scale && Math.abs(dy) < 1.5) speed = 0;
      const len = Math.hypot(desired.x, desired.z) || 1;
      const ax = (desired.x / len) * speed, az = (desired.z / len) * speed;
      const accel = Math.min(1, dt * (z.type === 'runner' ? 6 : 4));
      z.vel.x += (ax - z.vel.x) * accel;
      z.vel.z += (az - z.vel.z) * accel;
      if (!z.climbing) z.vel.y -= 22 * dt;
      physics.move(z.pos, z.vel, dt, z.r, z.h, 0.65 * z.scale, z.res);

      // climbing walls when the target is above them (kills rooftop camping)
      const res = z.res;
      const higher = (goal ? goalY : pp.y) - z.pos.y > (z.climbing ? -1.3 : 1.0); // keep climbing until over the parapet
      if (distP < 4 && Math.abs(dy) < 2) game.lastThreat = game.time;
      const wasClimbing = z.climbing;
      z.climbing = false;
      if (res.hitWall && !res.hitWall.walkable) {
        if (res.hitWall.playerWall) {
          z.wallHitT -= dt;
          if (z.wallHitT <= 0) { z.wallHitT = 0.8; game.damageWall(res.hitWall, z.type === 'brute' ? 220 : 35); z.windup = 0.01; }
        } else if (higher && distP < 16 && (wasClimbing || pp.y - z.pos.y > 1.0)) {
          z.climbing = true; z.vel.y = 2.6 + (z.type === 'runner' ? 1.5 : 0);
        }
      }
      if (res.hitCeil) z.climbing = false;

      // unstick: if barely moving for a while, hop and jitter sideways
      z.stuckT += dt;
      if (z.stuckT > 1.2) {
        if (z.lastPos.distanceToSquared(z.pos) < 0.5 && distP > 2.5 && !attacking) {
          z.vel.x += (Math.random() - 0.5) * 6; z.vel.z += (Math.random() - 0.5) * 6;
          if (res.onGround) z.vel.y = 5;
        }
        z.stuckT = 0; z.lastPos.copy(z.pos);
      }

      // face movement / player
      const faceX = distP < 4 ? pp.x - z.pos.x : z.vel.x, faceZ = distP < 4 ? pp.z - z.pos.z : z.vel.z;
      if (faceX * faceX + faceZ * faceZ > 0.01) {
        const targetYaw = Math.atan2(faceX, faceZ);
        let dyaw = targetYaw - z.yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        z.yaw += dyaw * Math.min(1, dt * 8);
      }
      z.root.rotation.y = z.yaw;

      // ---- attack ----
      z.attackCd -= dt;
      const reach = 1.5 * z.scale;
      const d3 = Math.hypot(distP, dy - 0.2);
      if (z.windup > 0) {
        z.windup -= dt;
        if (z.windup <= 0 && d3 < reach + 0.5 && !player.dead) {
          game.hurtPlayer(z.def.dmg * (1 + game.round * 0.03), z.pos);
          if (z.type === 'exploder') this.kill(z, null, { suicide: true });
        }
      } else if (d3 < reach && z.attackCd <= 0 && !player.dead) {
        z.windup = z.type === 'runner' ? 0.25 : 0.4; z.attackCd = 1.1;
      }

      // groans
      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = 3 + Math.random() * 6;
        if (distP < 35 && this.groanBudget >= 1) { this.groanBudget -= 1; sfx.groan(z.pos, z.type === 'brute' ? 0.6 : z.type === 'runner' ? 1.3 : 1); }
      }

      this.animate(z, dt, Math.hypot(z.vel.x, z.vel.z));
      // fell out of the world / too far: recycle
      if (distP > 150 && !game.dropActive(z)) { game.scene.remove(z.root); z.dead = true; game.spawned--; }
    }
  }

  animate(z, dt, speed) {
    z.phase += dt * (2 + speed * 1.6);
    const s = Math.sin(z.phase), c = Math.cos(z.phase);
    const amp = Math.min(0.9, 0.25 + speed * 0.12);
    if (z.lostLegs) {
      z.hips.position.y = 0.15; z.hips.rotation.x = 1.3;
      z.armL.rotation.x = -2.6 + s * 0.7; z.armR.rotation.x = -2.6 - s * 0.7;
      return;
    }
    z.legL.rotation.x = s * amp; z.legR.rotation.x = -s * amp;
    z.hips.position.y = 0.9 + Math.abs(c) * 0.06;
    const lean = z.type === 'runner' ? 0.45 : z.type === 'brute' ? 0.15 : 0.1;
    z.hips.rotation.x = lean;
    z.torso.rotation.z = s * 0.06;
    z.neck.rotation.z = Math.sin(z.phase * 0.5) * 0.25;
    z.neck.rotation.x = -lean * 0.6;
    if (z.windup > 0) {
      const k = z.windup;
      z.armL.rotation.x = -2.6 + k * 2; z.armR.rotation.x = -2.6 + k * 2;
    } else if (z.climbing) {
      z.armL.rotation.x = -2.8 + s; z.armR.rotation.x = -2.8 - s;
    } else {
      const base = z.type === 'runner' ? -0.6 : -1.45;
      z.armL.rotation.x = base + s * 0.25; z.armR.rotation.x = base - s * 0.25;
      z.armL.rotation.z = -0.1; z.armR.rotation.z = 0.1;
    }
  }

  clear() {
    for (const z of this.list) this.game.scene.remove(z.root);
    this.list.length = 0;
  }
}
