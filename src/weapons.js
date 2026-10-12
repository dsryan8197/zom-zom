import * as THREE from 'three';
import { sfx } from './audio.js';
import { tex } from './textures.js';

// tier: 1 starter, 2 common, 3 rare, 4 crazy
export const WEAPONS = {
  rifle: { name: 'M1 RIFLE', tier: 1, auto: false, rate: 5.5, dmg: 64, mag: 20, reserve: 160, spread: 0.006, recoil: 0.022, sound: 'rifle', reload: 1.5, pierce: 1 },
  revolver: { name: '.44 REVOLVER', tier: 1, auto: false, rate: 3.2, dmg: 130, mag: 6, reserve: 60, spread: 0.007, recoil: 0.06, sound: 'revolver', reload: 1.7, pierce: 2 },
  smg: { name: 'SMG', tier: 2, auto: true, rate: 14, dmg: 30, mag: 40, reserve: 360, spread: 0.022, recoil: 0.007, sound: 'smg', reload: 1.3 },
  ar: { name: 'ASSAULT RIFLE', tier: 2, auto: true, rate: 10, dmg: 46, mag: 30, reserve: 300, spread: 0.012, recoil: 0.011, sound: 'ar', reload: 1.6, pierce: 1 },
  shotgun: { name: 'PUMP SHOTGUN', tier: 2, auto: false, rate: 1.4, dmg: 32, pellets: 9, mag: 6, reserve: 60, spread: 0.075, recoil: 0.07, sound: 'shotgun', reload: 2.0, pump: true },
  autoshotgun: { name: 'AUTO SHOTGUN', tier: 3, auto: true, rate: 4, dmg: 28, pellets: 8, mag: 16, reserve: 128, spread: 0.08, recoil: 0.05, sound: 'shotgun', reload: 2.2 },
  lmg: { name: 'LMG', tier: 3, auto: true, rate: 12, dmg: 54, mag: 100, reserve: 500, spread: 0.016, recoil: 0.01, sound: 'lmg', reload: 3.0, pierce: 2 },
  minigun: { name: 'MINIGUN', tier: 4, auto: true, rate: 26, dmg: 42, mag: 300, reserve: 900, spread: 0.028, recoil: 0.004, sound: 'minigun', reload: 3.2, spinup: 0.45, pierce: 1 },
  rocket: { name: 'ROCKET LAUNCHER', tier: 4, auto: false, rate: 1.3, dmg: 400, mag: 1, reserve: 20, spread: 0.002, recoil: 0.08, reload: 1.3, projectile: 'rocket' },
  raygun: { name: 'RAY GUN', tier: 4, auto: false, rate: 4.5, dmg: 260, mag: 20, reserve: 200, spread: 0.004, recoil: 0.02, reload: 1.8, projectile: 'plasma' },
  tesla: { name: 'TESLA CANNON', tier: 4, auto: false, rate: 2.4, dmg: 320, mag: 12, reserve: 96, spread: 0, recoil: 0.04, reload: 2.2, chain: 7 },
};
export const TIER_COLORS = [0, 0xdddddd, 0x4ab0ff, 0xb070ff, 0xff9a2a];

// ---------- blocky gun models ----------
const M = {};
function gm() {
  if (M.dark) return M;
  M.dark = new THREE.MeshStandardMaterial({ color: 0x50555c, roughness: 0.55, metalness: 0.15 });
  M.black = new THREE.MeshStandardMaterial({ color: 0x383a3f, roughness: 0.6, metalness: 0.1 });
  M.gray = new THREE.MeshStandardMaterial({ color: 0x5a5e64, roughness: 0.45, metalness: 0.3 });
  M.wood = new THREE.MeshStandardMaterial({ map: tex('wood'), color: 0x9a6a40, roughness: 0.8 });
  M.olive = new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.8 });
  M.red = new THREE.MeshStandardMaterial({ color: 0x9a1a14, roughness: 0.6 });
  M.teal = new THREE.MeshStandardMaterial({ color: 0x2a8a8a, roughness: 0.4, metalness: 0.6 });
  M.copper = new THREE.MeshStandardMaterial({ color: 0xb8683a, roughness: 0.35, metalness: 0.9 });
  M.dot = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
  M.green = new THREE.MeshBasicMaterial({ color: 0x40ff70, toneMapped: false });
  M.blue = new THREE.MeshBasicMaterial({ color: 0x60c8ff, toneMapped: false });
  M.bat = new THREE.MeshStandardMaterial({ map: tex('wood'), color: 0xc89a60, roughness: 0.7 });
  M.tape = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  M.nail = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.3 });
  return M;
}

function build(parts) {
  const g = new THREE.Group();
  for (const [w, h, d, x, y, z, mat, rx = 0] of parts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.x = rx;
    g.add(m);
  }
  return g;
}

// hollow holo/red-dot sight: a frame you look through with a glowing dot in the middle
function sight(y, z, size = 0.05) {
  const m = gm(), h = size / 2, t = 0.006;
  return [[t, size, 0.012, -h, y, z, m.black], [t, size, 0.012, h, y, z, m.black], [size + t, t, 0.012, 0, y + h, z, m.black],
    [size + 0.01, 0.014, 0.05, 0, y - h - 0.004, z + 0.01, m.black], [0.006, 0.006, 0.002, 0, y, z - 0.004, m.dot]];
}

export function gunModel(id) {
  const m = gm();
  let parts, muzzleZ = -0.5, sightY = 0.07;
  switch (id) {
    case 'rifle':
      parts = [[0.055, 0.09, 0.26, 0, -0.01, 0.24, m.wood], [0.06, 0.08, 0.42, 0, 0, -0.02, m.dark], [0.03, 0.03, 0.36, 0, 0.015, -0.4, m.black],
        [0.05, 0.05, 0.3, 0, -0.02, -0.25, m.wood], [0.04, 0.13, 0.06, 0, -0.1, -0.02, m.black], [0.02, 0.05, 0.02, 0, 0.045, -0.56, m.black],
        ...sight(0.075, 0.02)];
      muzzleZ = -0.58; sightY = 0.075; break;
    case 'revolver':
      parts = [[0.04, 0.12, 0.055, 0, -0.08, 0.07, m.wood, -0.35], [0.045, 0.065, 0.13, 0, 0, 0.0, m.gray], [0.065, 0.065, 0.07, 0, 0.002, -0.02, m.dark],
        [0.028, 0.034, 0.2, 0, 0.012, -0.16, m.gray], [0.01, 0.025, 0.012, 0, 0.04, -0.25, m.black], [0.02, 0.02, 0.03, 0, -0.04, 0.02, m.black]];
      muzzleZ = -0.27; sightY = 0.045; break;
    case 'smg':
      parts = [[0.055, 0.09, 0.3, 0, 0, -0.02, m.black], [0.03, 0.03, 0.12, 0, 0.01, -0.22, m.dark], [0.035, 0.2, 0.05, 0, -0.14, -0.04, m.dark],
        [0.04, 0.1, 0.05, 0, -0.08, 0.1, m.black, -0.3], [0.02, 0.05, 0.22, 0, 0.0, 0.24, m.gray], ...sight(0.075, 0.0)];
      muzzleZ = -0.3; sightY = 0.075; break;
    case 'ar':
      parts = [[0.06, 0.1, 0.4, 0, 0, 0, m.black], [0.065, 0.08, 0.24, 0, 0.0, -0.3, m.dark], [0.028, 0.028, 0.2, 0, 0.01, -0.5, m.black],
        [0.045, 0.16, 0.07, 0, -0.12, -0.08, m.dark, 0.25], [0.04, 0.1, 0.05, 0, -0.08, 0.1, m.black, -0.3], [0.05, 0.09, 0.22, 0, -0.01, 0.3, m.black],
        ...sight(0.088, -0.02, 0.055)];
      muzzleZ = -0.62; sightY = 0.088; break;
    case 'shotgun':
      parts = [[0.06, 0.09, 0.28, 0, -0.02, 0.28, m.wood], [0.065, 0.08, 0.26, 0, 0, 0, m.dark], [0.035, 0.035, 0.6, 0, 0.02, -0.4, m.gray],
        [0.03, 0.03, 0.5, 0, -0.025, -0.35, m.black], [0.06, 0.06, 0.18, 0, -0.03, -0.32, m.wood], [0.015, 0.015, 0.015, 0, 0.045, -0.68, m.dot]];
      muzzleZ = -0.7; sightY = 0.045; break;
    case 'autoshotgun':
      parts = [[0.07, 0.11, 0.42, 0, 0, 0, m.olive], [0.04, 0.04, 0.4, 0, 0.02, -0.38, m.black], [0.12, 0.12, 0.1, 0, -0.12, -0.08, m.black],
        [0.05, 0.1, 0.05, 0, -0.09, 0.12, m.black, -0.3], [0.06, 0.09, 0.2, 0, 0, 0.3, m.olive], ...sight(0.088, -0.02)];
      muzzleZ = -0.6; sightY = 0.088; break;
    case 'lmg':
      parts = [[0.08, 0.12, 0.5, 0, 0, 0, m.olive], [0.04, 0.04, 0.5, 0, 0.02, -0.45, m.black], [0.12, 0.12, 0.12, 0.06, -0.1, -0.05, m.olive],
        [0.05, 0.11, 0.06, 0, -0.1, 0.14, m.black, -0.3], [0.06, 0.1, 0.24, 0, -0.01, 0.36, m.black], [0.01, 0.15, 0.01, 0.03, -0.08, -0.55, m.black, 0.5],
        [0.01, 0.15, 0.01, -0.03, -0.08, -0.55, m.black, 0.5], ...sight(0.098, 0)];
      muzzleZ = -0.72; sightY = 0.098; break;
    case 'minigun': {
      parts = [[0.14, 0.14, 0.3, 0, 0, 0.05, m.dark], [0.05, 0.14, 0.05, 0, 0.12, 0.05, m.black], [0.04, 0.12, 0.05, 0, -0.12, 0.12, m.black]];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push([0.025, 0.025, 0.6, Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.35, m.gray]);
      }
      parts.push([0.12, 0.12, 0.03, 0, 0, -0.55, m.black], [0.12, 0.12, 0.03, 0, 0, -0.2, m.black]);
      muzzleZ = -0.68; sightY = 0.16; break;
    }
    case 'rocket':
      parts = [[0.13, 0.13, 0.95, 0, 0.02, -0.12, m.olive], [0.15, 0.15, 0.06, 0, 0.02, -0.6, m.black], [0.15, 0.15, 0.06, 0, 0.02, 0.36, m.black],
        [0.04, 0.12, 0.05, 0, -0.1, 0.0, m.black], [0.04, 0.1, 0.05, 0, -0.1, -0.22, m.black], [0.06, 0.06, 0.1, -0.09, 0.08, -0.1, m.black],
        [0.06, 0.06, 0.1, 0, 0.02, -0.66, m.red]];
      muzzleZ = -0.7; sightY = 0.08; break;
    case 'raygun':
      parts = [[0.07, 0.1, 0.2, 0, 0, 0, m.teal], [0.05, 0.12, 0.06, 0, -0.1, 0.06, m.dark, -0.3], [0.04, 0.04, 0.2, 0, 0.01, -0.18, m.gray],
        [0.1, 0.1, 0.02, 0, 0.01, -0.12, m.green], [0.1, 0.1, 0.02, 0, 0.01, -0.2, m.green], [0.07, 0.07, 0.04, 0, 0.01, -0.29, m.red],
        [0.05, 0.05, 0.06, 0, 0.08, -0.02, m.green]];
      muzzleZ = -0.32; sightY = 0.06; break;
    case 'tesla':
      parts = [[0.09, 0.11, 0.36, 0, 0, 0, m.dark], [0.05, 0.12, 0.06, 0, -0.1, 0.1, m.black, -0.3]];
      for (let i = 0; i < 4; i++) parts.push([0.09, 0.09, 0.035, 0, 0.01, -0.22 - i * 0.07, m.copper]);
      parts.push([0.03, 0.03, 0.34, 0, 0.01, -0.3, m.gray], [0.08, 0.08, 0.08, 0, 0.01, -0.5, m.blue], [0.06, 0.06, 0.06, 0, 0.1, 0.05, m.blue]);
      muzzleZ = -0.55; sightY = 0.07; break;
    case 'bat':
      parts = [[0.045, 0.045, 0.3, 0, 0, 0.0, m.tape], [0.06, 0.06, 0.4, 0, 0, -0.34, m.bat], [0.08, 0.08, 0.3, 0, 0, -0.68, m.bat],
        [0.12, 0.01, 0.01, 0, 0.01, -0.7, m.nail], [0.01, 0.12, 0.01, 0, 0, -0.62, m.nail], [0.12, 0.01, 0.01, 0, -0.02, -0.76, m.nail]];
      muzzleZ = -0.8; break;
  }
  const g = build(parts);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.015, muzzleZ); g.add(muzzle);
  g.userData.muzzle = muzzle; g.userData.sightY = sightY;
  return g;
}

function flashTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,0.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = i % 2 ? 12 : 32;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.fill();
  return new THREE.CanvasTexture(c);
}

// ---------- weapon system (owned by the player) ----------
export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.slots = [null, null, null, null];
    this.cur = 0;
    this.grenades = 3;
    this.cool = 0; this.reloadT = 0; this.switchT = 0; this.batT = 0; this.spin = 0; this.pumpT = 0;
    this.kick = 0; this.ads = 0; this.bobT = 0; this.flashT = 0;
    this.projectiles = [];
    this.holder = new THREE.Group(); // attached to the camera
    game.camera.add(this.holder);
    this.batModel = gunModel('bat'); this.batModel.visible = false; this.batModel.scale.setScalar(0.7);
    this.holder.add(this.batModel);
    const fmat = new THREE.MeshBasicMaterial({ map: flashTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.flash = new THREE.Group();
    for (let i = 0; i < 2; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), fmat); p.rotation.y = i * Math.PI / 2; this.flash.add(p); }
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), fmat); this.flash.add(front);
    this.flash.visible = false;
    this.models = {};
    this.give('rifle'); this.give('revolver');
    this.select(0, true);
  }

  get w() { return this.slots[this.cur]; }

  give(id, slotHint) {
    const def = WEAPONS[id];
    const inst = { id, def, mag: def.mag, reserve: def.reserve };
    let slot = slotHint ?? this.slots.findIndex((s) => !s);
    if (slot < 0) slot = this.cur;
    const old = this.slots[slot];
    this.slots[slot] = inst;
    if (slot === this.cur) this.select(slot, true);
    return old;
  }

  has(id) { return this.slots.some((s) => s && s.id === id); }
  freeSlot() { return this.slots.findIndex((s) => !s); }

  select(i, force = false) {
    if (!this.slots[i] || (i === this.cur && !force)) return;
    this.cur = i;
    this.reloadT = 0; this.spin = 0;
    this.switchT = force ? 0.15 : 0.28;
    for (const m of Object.values(this.models)) m.visible = false;
    const id = this.w.id;
    if (!this.models[id]) {
      const gmod = gunModel(id); gmod.scale.setScalar(0.62);
      gmod.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 10; } });
      this.models[id] = gmod; this.holder.add(gmod);
    }
    const model = this.models[id];
    model.visible = true;
    model.userData.muzzle.add(this.flash);
    this.game.hud?.slotsDirty();
  }

  cycle(dir = 1) {
    for (let k = 1; k <= 4; k++) {
      const i = (this.cur + dir * k + 8) % 4;
      if (this.slots[i]) { this.select(i); sfx.reload(); return; }
    }
  }

  reload() {
    const w = this.w;
    if (!w || this.reloadT > 0 || w.mag >= w.def.mag || w.reserve <= 0 || this.batT > 0) return;
    this.reloadT = w.def.reload;
    sfx.reload();
  }

  addAmmo(frac) {
    for (const s of this.slots) if (s) s.reserve = Math.min(s.def.reserve, s.reserve + Math.ceil(s.def.reserve * (s.def.tier >= 4 ? frac * 0.6 : frac)));
  }

  swingBat() {
    if (this.batT > 0) return;
    this.batT = 0.5; this.batHit = false; this.reloadT = 0;
    sfx.swing();
  }

  throwGrenade() {
    if (this.grenades <= 0 || this.batT > 0) return;
    this.grenades--;
    const cam = this.game.camera;
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const pos = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 0.6);
    const vel = dir.multiplyScalar(22).add(new THREE.Vector3(0, 4, 0)).add(this.game.player.vel.clone().multiplyScalar(0.5));
    this.spawnProjectile('grenade', pos, vel);
    sfx.swing();
  }

  spawnProjectile(type, pos, vel, opts = {}) {
    let mesh;
    if (type === 'grenade') mesh = build([[0.12, 0.16, 0.12, 0, 0, 0, gm().olive], [0.05, 0.05, 0.05, 0, 0.1, 0, gm().gray]]);
    else if (type === 'bait') mesh = build([[0.3, 0.35, 0.25, 0, 0, 0, gm().dark], [0.2, 0.2, 0.02, 0, 0, 0.13, gm().gray], [0.06, 0.06, 0.06, 0, 0.2, 0, gm().dot]]);
    else if (type === 'rocket') mesh = build([[0.09, 0.09, 0.5, 0, 0, 0, gm().olive], [0.07, 0.07, 0.1, 0, 0, -0.28, gm().red]]);
    else if (type === 'plasma') { mesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), gm().green); }
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    const p = { type, mesh, pos: mesh.position, vel, life: type === 'grenade' ? 2.2 : type === 'bait' ? 9 : 4, ...opts };
    this.projectiles.push(p);
    return p;
  }

  explodeProjectile(p) {
    p.dead = true; this.game.scene.remove(p.mesh);
    if (p.type === 'grenade') this.game.explode(p.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 7.5, 420, {});
    else if (p.type === 'rocket') this.game.explode(p.pos.clone(), 6.5, WEAPONS.rocket.dmg, {});
    else if (p.type === 'plasma') {
      this.game.explode(p.pos.clone(), 3, WEAPONS.raygun.dmg, { color: 0x40ff70, small: true });
    } else if (p.type === 'bait') this.game.explode(p.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 8, 500, {});
  }

  updateProjectiles(dt) {
    const game = this.game, physics = game.physics;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.dead) { this.projectiles.splice(i, 1); continue; }
      p.life -= dt;
      if (p.type === 'grenade' || p.type === 'bait') {
        if (!p.landed) p.vel.y -= 22 * dt;
        const step = p.vel.length() * dt;
        if (step > 0) {
          const dir = p.vel.clone().normalize();
          const hit = physics.raycast(p.pos.x, p.pos.y, p.pos.z, dir.x, dir.y, dir.z, step + 0.1);
          if (hit) {
            p.pos.addScaledVector(dir, Math.max(0, hit.dist - 0.1));
            const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
            p.vel.reflect(n).multiplyScalar(0.45);
            if (hit.ny > 0.5 && p.vel.length() < 2.5) { p.vel.set(0, 0, 0); p.landed = true; }
          } else p.pos.addScaledVector(p.vel, dt);
        }
        p.mesh.rotation.x += p.vel.length() * dt * 2;
        if (p.type === 'bait') {
          p.beepT = (p.beepT || 0) - dt;
          if (p.beepT <= 0) { p.beepT = 0.5; sfx.beep(p.pos); game.effects.glow.spawn({ pos: p.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), vel: new THREE.Vector3(), size: 0.25, life: 0.15, g: 0, color: 0xff3030 }); }
        }
        if (p.life <= 0) this.explodeProjectile(p);
        continue;
      }
      // rockets & plasma: straight, explode on contact
      const step = p.vel.length() * dt;
      const dir = p.vel.clone().normalize();
      const hit = physics.raycast(p.pos.x, p.pos.y, p.pos.z, dir.x, dir.y, dir.z, step);
      const zh = game.zombies.raycast(p.pos, dir, step + 0.3);
      if (hit || zh || p.life <= 0) {
        if (zh && (!hit || zh.dist < hit.dist)) p.pos.addScaledVector(dir, zh.dist);
        else if (hit) p.pos.addScaledVector(dir, hit.dist - 0.05);
        this.explodeProjectile(p);
        continue;
      }
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.lookAt(p.pos.clone().add(dir));
      if (p.type === 'rocket') {
        game.effects.smoke(p.pos.clone(), { size: 0.8, life: 1.2, color: 0x999999, opacity: 0.5, grow: 2, vel: new THREE.Vector3(0, 0.3, 0) });
        game.effects.glow.spawn({ pos: p.pos.clone(), vel: dir.clone().multiplyScalar(-4), size: 0.15, life: 0.12, g: 0, color: 0xffa040 });
      } else {
        game.effects.glow.spawn({ pos: p.pos.clone(), vel: new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)), size: 0.12, life: 0.2, g: 0, color: 0x60ff80 });
      }
    }
  }

  tryFire(triggerHeld, triggerPressed) {
    const w = this.w;
    if (!w || this.switchT > 0 || this.batT > 0) return;
    const def = w.def;
    if (def.spinup) {
      this.spin = triggerHeld ? Math.min(def.spinup, this.spin + this.game.dt) : Math.max(0, this.spin - this.game.dt * 2);
      if (this.spin < def.spinup) return;
    }
    if (this.cool > 0) return;
    if (!(def.auto ? triggerHeld : triggerPressed)) return;
    if (this.reloadT > 0) {
      // allow interrupting a shotgun/revolver reload if there's ammo in the mag
      if (w.mag > 0 && (def.pump || def.mag <= 6)) this.reloadT = 0; else return;
    }
    if (w.mag <= 0) { if (triggerPressed) sfx.dry(); this.reload(); return; }
    w.mag--;
    this.cool = 1 / def.rate;
    this.fire(def);
    if (w.mag === 0) setTimeout(() => this.reload(), 180);
  }

  fire(def) {
    const game = this.game, cam = game.camera;
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const muzzle = this.models[this.w.id].userData.muzzle.getWorldPosition(new THREE.Vector3());
    const spreadMul = this.ads > 0.5 ? 0.35 : 1;
    this.kick = Math.min(1.2, this.kick + 0.35 + def.recoil * 4);
    game.player.pitch += def.recoil * (this.ads > 0.5 ? 0.6 : 1);
    game.player.yaw += (Math.random() - 0.5) * def.recoil * 0.5;
    this.flashT = 0.045;
    this.flash.rotation.z = Math.random() * Math.PI;
    game.effects.flashLight(muzzle, def.projectile === 'plasma' ? 0x40ff70 : def.chain ? 0x60c8ff : 0xffb050, 6, 0.06, 12);

    if (def.projectile) {
      const dir = fwd.clone();
      const vel = dir.multiplyScalar(def.projectile === 'rocket' ? 48 : 75);
      this.spawnProjectile(def.projectile, muzzle.clone(), vel);
      if (def.projectile === 'rocket') sfx.rocket(null); else sfx.laser(null);
      return;
    }
    if (def.chain) { this.fireTesla(origin, fwd, muzzle, def); return; }

    sfx.shot(def.sound);
    // eject casing
    const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
    game.effects.casing(muzzle.clone().addScaledVector(fwd, -0.3), right.clone().multiplyScalar(3 + Math.random() * 2).add(new THREE.Vector3(0, 3, 0)), !!def.pellets);
    if (def.pump) { this.pumpT = 0.45; setTimeout(() => sfx.pump(), 250); }
    const pellets = def.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const d = fwd.clone();
      const sp = def.spread * spreadMul;
      d.x += (Math.random() - 0.5) * 2 * sp; d.y += (Math.random() - 0.5) * 2 * sp; d.z += (Math.random() - 0.5) * 2 * sp;
      d.normalize();
      game.hitscan(origin, d, 300, def.dmg, { pierce: def.pierce || 0, tracerFrom: muzzle, tracer: pellets === 1 || i % 3 === 0 });
    }
  }

  fireTesla(origin, fwd, muzzle, def) {
    const game = this.game;
    sfx.zap(null);
    const hits = new Set();
    let from = muzzle.clone();
    let cur = game.zombies.raycast(origin, fwd, 120);
    const wall = game.physics.raycast(origin.x, origin.y, origin.z, fwd.x, fwd.y, fwd.z, 120);
    if (cur && wall && wall.dist < cur.dist) cur = null;
    if (!cur) {
      const end = origin.clone().addScaledVector(fwd, wall ? wall.dist : 60);
      this.bolt(from, end); game.effects.sparks(end, 10, 0x80d0ff);
      return;
    }
    let z = cur.zombie;
    for (let n = 0; n < def.chain && z; n++) {
      hits.add(z);
      const to = z.pos.clone(); to.y += 1.2 * z.scale;
      this.bolt(from, to);
      game.effects.sparks(to, 8, 0x80d0ff);
      game.damageZombie(z, 'torso', def.dmg, to.clone().sub(from).normalize(), { tesla: true });
      from = to;
      // next nearest
      let best = null, bd = 14 * 14;
      for (const o of game.zombies.list) {
        if (o.dead || hits.has(o)) continue;
        const d2 = o.pos.distanceToSquared(z.pos);
        if (d2 < bd) { bd = d2; best = o; }
      }
      z = best;
    }
  }

  bolt(a, b) {
    const segs = 6;
    let prev = a.clone();
    for (let i = 1; i <= segs; i++) {
      const p = a.clone().lerp(b, i / segs);
      if (i < segs) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
      this.game.effects.tracer(prev, p, 0x9ad8ff, 0.06);
      prev = p;
    }
    this.game.effects.flashLight(b, 0x60c8ff, 10, 0.15, 14);
  }

  update(dt, input) {
    const game = this.game, player = game.player;
    this.cool -= dt; this.switchT = Math.max(0, this.switchT - dt); this.pumpT = Math.max(0, this.pumpT - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const w = this.w;
        const need = w.def.mag - w.mag, take = Math.min(need, w.reserve);
        w.mag += take; w.reserve -= take;
        sfx.reload();
      }
    }
    // bat swing
    if (this.batT > 0) {
      this.batT -= dt;
      if (!this.batHit && this.batT < 0.33) { this.batHit = true; game.batHit(); }
    }
    this.updateProjectiles(dt);

    // ---- viewmodel animation ----
    const targetAds = input.ads && this.batT <= 0 && this.reloadT <= 0 ? 1 : 0;
    this.ads += (targetAds - this.ads) * Math.min(1, dt * 12);
    this.kick = Math.max(0, this.kick - dt * 8);
    const speed = Math.hypot(player.vel.x, player.vel.z);
    if (player.onGround) this.bobT += dt * speed * 1.1;
    const bobAmt = (1 - this.ads * 0.85) * Math.min(1, speed / 8);
    const bx = Math.sin(this.bobT) * 0.018 * bobAmt, by = -Math.abs(Math.cos(this.bobT)) * 0.016 * bobAmt;
    const model = this.models[this.w?.id];
    if (model) {
      const sightY = model.userData.sightY;
      const hip = new THREE.Vector3(0.15, -0.15, -0.36), aim = new THREE.Vector3(0, -sightY * 0.62, -0.26);
      const p = hip.lerp(aim, this.ads);
      p.x += bx + input.lookDX * -0.0004; p.y += by + input.lookDY * 0.0004;
      p.z += this.kick * 0.06;
      p.y -= this.switchT * 1.2;
      let rx = this.kick * 0.12, rz = 0;
      if (this.reloadT > 0) { const k = Math.sin(Math.min(1, 1 - this.reloadT / this.w.def.reload) * Math.PI); p.y -= k * 0.12; rx -= k * 0.5; rz = k * 0.6; }
      if (this.pumpT > 0) p.z += Math.sin((1 - this.pumpT / 0.45) * Math.PI) * 0.04;
      if (this.batT > 0) p.y -= 0.4;
      model.position.lerp(p, Math.min(1, dt * 30));
      model.rotation.set(rx, 0, rz);
      if (this.w.def.spinup) {
        // spin barrels
        model.children.slice(3, 9).forEach((c, i) => { const a = (i / 6) * Math.PI * 2 + this.spinAngle; c.position.x = Math.cos(a) * 0.045; c.position.y = Math.sin(a) * 0.045; });
        this.spinAngle = (this.spinAngle || 0) + this.spin * dt * 60;
      }
    }
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    // bat
    this.batModel.visible = this.batT > 0;
    if (this.batT > 0) {
      const k = 1 - this.batT / 0.5; // 0..1
      const sw = Math.min(1, k * 2.2);
      this.batModel.position.set(0.35 - sw * 0.6, -0.15 + Math.sin(sw * Math.PI) * 0.1, -0.35);
      this.batModel.rotation.set(0.3, 1.2 - sw * 2.6, -0.9 + sw * 0.4);
    }
    return this.ads;
  }

  reset() {
    for (const p of this.projectiles) this.game.scene.remove(p.mesh);
    this.projectiles.length = 0;
    this.slots = [null, null, null, null];
    this.cur = 0; this.grenades = 3;
    this.give('rifle', 0); this.give('revolver', 1);
    this.select(0, true);
  }
}
