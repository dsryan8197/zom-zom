import * as THREE from 'three';
import { sfx } from './audio.js';
import { fx } from './effects.js';
import { gm, build, gunModel as makeGunModel, ELEMENTS } from './gunmodels.js';

export { ELEMENTS };

// tier: 1 starter, 2 common, 3 rare, 4 crazy
export const WEAPONS = {
  rifle: { name: 'M1 RIFLE', tier: 1, auto: false, rate: 5.5, dmg: 64, mag: 20, reserve: 160, spread: 0.006, recoil: 0.022, sound: 'rifle', reload: 1.5, pierce: 1 },
  revolver: { name: '.44 REVOLVER', tier: 1, auto: false, rate: 3.2, dmg: 130, mag: 6, reserve: 60, spread: 0.007, recoil: 0.06, sound: 'revolver', reload: 1.7, pierce: 2 },
  smg: { name: 'SMG', tier: 2, auto: true, rate: 14, dmg: 30, mag: 40, reserve: 360, spread: 0.022, recoil: 0.007, sound: 'smg', reload: 1.3 },
  ar: { name: 'ASSAULT RIFLE', tier: 2, auto: true, rate: 10, dmg: 46, mag: 30, reserve: 300, spread: 0.012, recoil: 0.011, sound: 'ar', reload: 1.6, pierce: 1 },
  burst: { name: 'BURST RIFLE', tier: 2, auto: false, burst: 3, burstGap: 0.065, rate: 3.2, dmg: 50, mag: 30, reserve: 240, spread: 0.007, recoil: 0.01, sound: 'ar', reload: 1.7, pierce: 1 },
  shotgun: { name: 'PUMP SHOTGUN', tier: 2, auto: false, rate: 1.4, dmg: 32, pellets: 9, mag: 6, reserve: 60, spread: 0.075, recoil: 0.07, sound: 'shotgun', reload: 2.0, pump: true },
  doublebarrel: { name: 'DOUBLE BARREL', tier: 2, auto: false, rate: 5, dmg: 34, pellets: 12, mag: 2, reserve: 40, spread: 0.11, recoil: 0.13, sound: 'shotgun', reload: 1.5, knock: 12 },
  autoshotgun: { name: 'AUTO SHOTGUN', tier: 3, auto: true, rate: 4, dmg: 28, pellets: 8, mag: 16, reserve: 128, spread: 0.08, recoil: 0.05, sound: 'autoshotgun', reload: 2.2 },
  lmg: { name: 'LMG', tier: 3, auto: true, rate: 12, dmg: 54, mag: 100, reserve: 500, spread: 0.016, recoil: 0.01, sound: 'lmg', reload: 3.0, pierce: 2 },
  sniper: { name: 'SNIPER RIFLE', tier: 3, auto: false, rate: 1.1, dmg: 520, mag: 5, reserve: 40, spread: 0.0004, hipSpread: 0.03, recoil: 0.09, sound: 'sniper', reload: 2.4, pierce: 6, zoom: true },
  crossbow: { name: 'CROSSBOW', tier: 3, auto: false, rate: 1.4, dmg: 300, mag: 1, reserve: 30, spread: 0.001, recoil: 0.03, reload: 0.9, projectile: 'bolt', speed: 90 },
  flamethrower: { name: 'FLAMETHROWER', tier: 3, auto: true, rate: 24, dmg: 11, mag: 150, reserve: 450, spread: 0, recoil: 0.002, reload: 2.4, flame: true, range: 11, element: 'fire' },
  launcher: { name: 'GRENADE LAUNCHER', tier: 3, auto: false, rate: 1.6, dmg: 380, mag: 6, reserve: 36, spread: 0.004, recoil: 0.06, reload: 2.6, projectile: 'gl', speed: 30 },
  ricochet: { name: 'RICOCHET SMG', tier: 3, auto: true, rate: 13, dmg: 34, mag: 45, reserve: 360, spread: 0.02, recoil: 0.007, sound: 'smg', reload: 1.4, bounces: 3 },
  minigun: { name: 'MINIGUN', tier: 4, auto: true, rate: 26, dmg: 42, mag: 300, reserve: 900, spread: 0.028, recoil: 0.004, sound: 'minigun', reload: 3.2, spinup: 0.45, pierce: 1 },
  rocket: { name: 'ROCKET LAUNCHER', tier: 4, auto: false, rate: 1.3, dmg: 400, mag: 1, reserve: 20, spread: 0.002, recoil: 0.08, reload: 1.3, projectile: 'rocket', speed: 48 },
  raygun: { name: 'RAY GUN', tier: 4, auto: false, rate: 4.5, dmg: 260, mag: 20, reserve: 200, spread: 0.004, recoil: 0.02, reload: 1.8, projectile: 'plasma', speed: 75 },
  tesla: { name: 'TESLA CANNON', tier: 4, auto: false, rate: 2.4, dmg: 320, mag: 12, reserve: 96, spread: 0, recoil: 0.04, reload: 2.2, chain: 7 },
  sawblade: { name: 'BUZZSAW LAUNCHER', tier: 4, auto: false, rate: 1.5, dmg: 240, mag: 4, reserve: 32, spread: 0.002, recoil: 0.05, reload: 2.0, projectile: 'saw', speed: 34 },
  blackhole: { name: 'BLACK HOLE GUN', tier: 4, auto: false, rate: 0.8, dmg: 900, mag: 2, reserve: 12, spread: 0.002, recoil: 0.06, reload: 2.8, projectile: 'vortex', speed: 28 },
  cryo: { name: 'CRYO BLASTER', tier: 4, auto: true, rate: 9, dmg: 30, mag: 60, reserve: 300, spread: 0.01, recoil: 0.006, reload: 1.9, element: 'cryo', tracerColor: 0x9ae8ff, cryoSound: true },
};
export const TIER_COLORS = [0, 0xdddddd, 0x4ab0ff, 0xb070ff, 0xff9a2a];

// ---------- upgrades (workbenches) ----------
// MK II: more damage, bigger mags, faster reloads. MK III: all of that again plus an elemental round.
export const UPGRADE_COST = (def, level) => (level === 1 ? 1500 + def.tier * 500 : 4000 + def.tier * 1000);
const ELEMENT_KEYS = Object.keys(ELEMENTS);
export function randomElement(id) {
  const base = WEAPONS[id].element;
  const pool = ELEMENT_KEYS.filter((e) => e !== base);
  return pool[Math.floor(Math.random() * pool.length)];
}
export function weaponDef(id, level = 1, element = null) {
  const b = WEAPONS[id];
  if (level <= 1) return b;
  const k = level === 2 ? { dmg: 1.6, mag: 1.5, reserve: 1.5, reload: 0.75, rate: 1.15 } : { dmg: 2.3, mag: 2, reserve: 2, reload: 0.6, rate: 1.3 };
  return {
    ...b,
    dmg: b.dmg * k.dmg, mag: Math.ceil(b.mag * k.mag), reserve: Math.ceil(b.reserve * k.reserve), reload: b.reload * k.reload, rate: b.rate * k.rate,
    pierce: (b.pierce || 0) + level - 1,
    element: level >= 3 ? element || b.element : b.element,
    name: `${b.name} ${level === 2 ? 'MK II' : 'MK III'}${level >= 3 && element ? ' · ' + ELEMENTS[element].name : ''}`,
    level, upgraded: true,
  };
}

export function gunModel(id, level = 1, element = null) { return makeGunModel(id, level, element); }

// Muzzle flash: two crossed flame cards along the barrel plus a star facing the shooter (Kenney CC0 sprites).
const MUZZLE = ['muzzle_01', 'muzzle_02', 'muzzle_03', 'muzzle_04', 'muzzle_05'];
function buildFlash() {
  const mk = (map, color) => new THREE.MeshBasicMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false });
  const g = new THREE.Group();
  const side = mk(fx(MUZZLE[0]), 0xffd8a0);
  const cardGeo = new THREE.PlaneGeometry(0.34, 0.7).translate(0, 0.32, 0); // flame base at the muzzle
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Mesh(cardGeo, side);
    p.rotation.set(-Math.PI / 2, 0, i * Math.PI / 2, 'ZXY'); // lay along the barrel, then spin about it
    g.add(p);
  }
  const star = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.48), mk(fx("scorch_01"), 0xffc070));
  g.add(star);
  const core = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), mk(fx("circle_05"), 0xfff2d0));
  g.add(core);
  g.renderOrder = 11;
  g.traverse((o) => { o.renderOrder = 11; });
  g.userData = { side, star: star.material };
  return g;
}

// ---------- weapon system (owned by the player) ----------
const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.slots = [null, null, null, null];
    this.cur = 0;
    this.grenades = 3;
    this.cool = 0; this.reloadT = 0; this.switchT = 0; this.batT = 0; this.spin = 0; this.pumpT = 0;
    this.kick = 0; this.ads = 0; this.bobT = 0; this.flashT = 0; this.burstLeft = 0; this.burstT = 0;
    this.projectiles = [];
    this.holder = new THREE.Group(); // attached to the camera
    game.camera.add(this.holder);
    this.batModel = gunModel('bat'); this.batModel.visible = false; this.batModel.scale.setScalar(0.7);
    this.holder.add(this.batModel);
    this.flash = buildFlash();
    this.flash.visible = false;
    this.models = {};
    this.give('rifle'); this.give('revolver');
    this.select(0, true);
  }

  get w() { return this.slots[this.cur]; }

  give(id, slotHint, { level = 1, element = null } = {}) {
    const def = weaponDef(id, level, element);
    const inst = { id, level, element, def, mag: def.mag, reserve: def.reserve };
    let slot = slotHint ?? this.slots.findIndex((s) => !s);
    if (slot < 0) slot = this.cur;
    const old = this.slots[slot];
    this.slots[slot] = inst;
    if (slot === this.cur) this.select(slot, true);
    return old;
  }

  // Workbench upgrade of the gun in hand: MK II, then MK III with a random elemental round.
  upgrade() {
    const w = this.w;
    if (!w || w.level >= 3) return false;
    w.level++;
    if (w.level === 3) w.element = randomElement(w.id);
    w.def = weaponDef(w.id, w.level, w.element);
    w.mag = w.def.mag; w.reserve = w.def.reserve;
    this.reloadT = 0;
    this.select(this.cur, true);
    return true;
  }

  has(id) { return this.slots.some((s) => s && s.id === id); }
  freeSlot() { return this.slots.findIndex((s) => !s); }

  modelFor(inst) {
    const key = `${inst.id}:${inst.level || 1}:${inst.element || ''}`;
    if (!this.models[key]) {
      const gmod = gunModel(inst.id, inst.level, inst.element); gmod.scale.setScalar(0.62);
      gmod.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 10; } });
      gmod.visible = false;
      this.models[key] = gmod; this.holder.add(gmod);
    }
    return this.models[key];
  }

  select(i, force = false) {
    if (!this.slots[i] || (i === this.cur && !force)) return;
    this.cur = i;
    this.reloadT = 0; this.spin = 0; this.burstLeft = 0;
    this.switchT = force ? 0.15 : 0.28;
    for (const m of Object.values(this.models)) m.visible = false;
    const model = this.modelFor(this.w);
    model.visible = true;
    this.model = model;
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
    this.burstLeft = 0;
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
    const m = gm();
    let mesh;
    if (type === 'grenade') mesh = build([[0.12, 0.16, 0.12, 0, 0, 0, m.olive], [0.05, 0.05, 0.05, 0, 0.1, 0, m.steel]]);
    else if (type === 'gl') mesh = build([[0.09, 0.09, 0.14, 0, 0, 0, m.olive], [0.092, 0.092, 0.03, 0, 0, -0.06, m.yellow], [0.06, 0.06, 0.04, 0, 0, -0.09, m.copper]]);
    else if (type === 'bait') mesh = build([[0.3, 0.35, 0.25, 0, 0, 0, m.metal], [0.2, 0.2, 0.02, 0, 0, 0.13, m.steel], [0.06, 0.06, 0.06, 0, 0.2, 0, m.dot]]);
    else if (type === 'rocket') mesh = build([[0.09, 0.09, 0.5, 0, 0, 0, m.olive], [0.07, 0.07, 0.1, 0, 0, -0.28, m.red]]);
    else if (type === 'plasma') mesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), m.green);
    else if (type === 'bolt') mesh = build([[0.02, 0.02, 0.6, 0, 0, 0, m.steel], [0.035, 0.035, 0.06, 0, 0, -0.3, m.red], [0.06, 0.002, 0.08, 0, 0, 0.26, m.red], [0.002, 0.06, 0.08, 0, 0, 0.26, m.red]]);
    else if (type === 'saw') {
      const parts = [[0.7, 0.02, 0.7, 0, 0, 0, m.chrome], [0.12, 0.04, 0.12, 0, 0, 0, m.metal]];
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; parts.push([0.12, 0.02, 0.05, Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36, m.steel, 0, -a, 0]); }
      mesh = build(parts);
    } else if (type === 'vortex') {
      mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0x050008 })));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx('circle_05'), color: 0xb060ff, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
      halo.scale.setScalar(1.6); mesh.add(halo); mesh.userData.halo = halo;
    }
    mesh.position.copy(pos);
    mesh.traverse((o) => { o.castShadow = true; });
    this.game.scene.add(mesh);
    const life = { grenade: 2.2, gl: 1.6, bait: 9, bolt: 6, saw: 3.5, vortex: 1.1 }[type] ?? 4;
    const p = { type, mesh, pos: mesh.position, vel, life, hits: new Map(), bounces: 0, ...opts };
    this.projectiles.push(p);
    return p;
  }

  explodeProjectile(p) {
    p.dead = true; this.game.scene.remove(p.mesh);
    const dmg = p.def?.dmg, el = p.def?.element;
    if (p.type === 'grenade') this.game.explode(p.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 7.5, 420, {});
    else if (p.type === 'gl') this.game.explode(p.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), 6, dmg, { element: el });
    else if (p.type === 'rocket') this.game.explode(p.pos.clone(), 6.5, dmg, { element: el });
    else if (p.type === 'plasma') this.game.explode(p.pos.clone(), 3, dmg, { color: 0x40ff70, small: true, element: el });
    else if (p.type === 'bait') this.game.explode(p.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 8, 500, {});
  }

  updateProjectiles(dt) {
    const game = this.game, physics = game.physics;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.dead) { this.projectiles.splice(i, 1); continue; }
      p.life -= dt;
      if (p.type === 'grenade' || p.type === 'bait' || p.type === 'gl') {
        if (!p.landed) p.vel.y -= 22 * dt;
        const step = p.vel.length() * dt;
        if (step > 0) {
          const dir = p.vel.clone().normalize();
          const hit = physics.raycast(p.pos.x, p.pos.y, p.pos.z, dir.x, dir.y, dir.z, step + 0.1);
          if (hit) {
            p.pos.addScaledVector(dir, Math.max(0, hit.dist - 0.1));
            const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
            p.vel.reflect(n).multiplyScalar(p.type === 'gl' ? 0.6 : 0.45);
            if (hit.ny > 0.5 && p.vel.length() < 2.5) { p.vel.set(0, 0, 0); p.landed = true; }
          } else p.pos.addScaledVector(p.vel, dt);
        }
        p.mesh.rotation.x += p.vel.length() * dt * 2;
        if (p.type === 'gl') {
          // launcher grenades go off on contact with a zombie
          if (game.zombies.list.some((z) => !z.dead && z.pos.distanceToSquared(_v.copy(p.pos).setY(z.pos.y + 1)) < 1.6)) { this.explodeProjectile(p); continue; }
          game.effects.glow.spawn({ pos: p.pos.clone(), vel: new THREE.Vector3(), size: 0.06, life: 0.15, g: 0, color: 0xffd040 });
        }
        if (p.type === 'bait') {
          p.beepT = (p.beepT || 0) - dt;
          if (p.beepT <= 0) { p.beepT = 0.5; sfx.beep(p.pos); game.effects.glow.spawn({ pos: p.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), vel: new THREE.Vector3(), size: 0.25, life: 0.15, g: 0, color: 0xff3030 }); }
        }
        if (p.life <= 0) this.explodeProjectile(p);
        continue;
      }
      if (p.type === 'bolt') { this.updateBolt(p, dt); continue; }
      if (p.type === 'saw') { this.updateSaw(p, dt); continue; }
      if (p.type === 'vortex') { this.updateVortex(p, dt); continue; }
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

  // Crossbow bolt: fast, slight drop, punches through every zombie in its path, sticks in walls.
  updateBolt(p, dt) {
    const game = this.game;
    if (p.stuck) { if (p.life <= 0) { p.dead = true; game.scene.remove(p.mesh); } return; }
    p.vel.y -= 4 * dt;
    const step = p.vel.length() * dt, dir = _d.copy(p.vel).normalize();
    const wall = game.physics.raycast(p.pos.x, p.pos.y, p.pos.z, dir.x, dir.y, dir.z, step);
    const reach = wall ? wall.dist : step;
    let o = p.pos.clone(), left = reach;
    for (let k = 0; k < 6; k++) {
      const zh = game.zombies.raycast(o, dir, left);
      if (!zh) break;
      if (!p.hits.has(zh.zombie)) { p.hits.set(zh.zombie, 1); game.damageZombie(zh.zombie, zh.part, p.def.dmg, dir.clone(), { element: p.def.element, bolt: true }); }
      const adv = zh.dist + 0.4; o.addScaledVector(dir, adv); left -= adv;
      if (left <= 0) break;
    }
    if (wall) {
      p.pos.addScaledVector(dir, wall.dist - 0.25);
      p.stuck = true; p.life = 8;
      game.effects.impact(p.pos.clone(), new THREE.Vector3(wall.nx, wall.ny, wall.nz), dir);
      sfx.impact(p.pos, 'wood');
      if (p.def.element === 'blast') game.explode(p.pos.clone(), 4, 200, { noSelf: true, small: true });
      return;
    }
    p.pos.addScaledVector(p.vel, dt);
    p.mesh.lookAt(_v.copy(p.pos).add(dir));
    if (p.life <= 0) { p.dead = true; game.scene.remove(p.mesh); }
  }

  // Buzzsaw: flies flat, ricochets off walls, carves limbs off anything it touches.
  updateSaw(p, dt) {
    const game = this.game;
    const step = p.vel.length() * dt, dir = _d.copy(p.vel).normalize();
    const hit = game.physics.raycast(p.pos.x, p.pos.y, p.pos.z, dir.x, dir.y, dir.z, step + 0.35);
    if (hit) {
      p.vel.reflect(new THREE.Vector3(hit.nx, hit.ny, hit.nz));
      if (hit.ny > 0.5) p.vel.y = Math.abs(p.vel.y) * 0.3 + 1;
      p.bounces++;
      game.effects.sparks(p.pos, 10, 0xffd080, 9);
      sfx.impact(p.pos, 'metal');
    } else p.pos.addScaledVector(p.vel, dt);
    p.vel.y -= 2 * dt;
    p.mesh.rotation.y += dt * 40;
    for (const z of game.zombies.list) {
      if (z.dead) continue;
      const c = _v.copy(z.pos); c.y += 1.1 * z.scale;
      if (c.distanceToSquared(p.pos) > (0.9 + z.r) ** 2) continue;
      const last = p.hits.get(z) || -1;
      if (game.time - last < 0.35) continue;
      p.hits.set(z, game.time);
      const limbs = ['armL', 'armR', 'legL', 'legR', 'head', 'torso'];
      const part = limbs[Math.floor(Math.random() * limbs.length)];
      game.damageZombie(z, part, p.def.dmg, dir.clone(), { element: p.def.element, saw: true });
      if (!z.dead && part !== 'torso' && part !== 'head') game.zombies.detach(z, part, dir.clone());
      game.effects.blood(c, dir, 14, 7);
    }
    if (p.life <= 0 || p.bounces > 7) { p.dead = true; game.scene.remove(p.mesh); game.effects.sparks(p.pos, 16, 0xffd080, 6); }
  }

  // Black hole: an orb that flies until it hits something, then opens a singularity that drags the
  // horde in, spins them round, and implodes.
  updateVortex(p, dt) {
    const game = this.game;
    const halo = p.mesh.userData.halo;
    halo.material.rotation += dt * 6;
    if (!p.open) {
      const step = p.vel.length() * dt, dir = _d.copy(p.vel).normalize();
      const hit = game.physics.raycast(p.pos.x, p.pos.y, p.pos.z, dir.x, dir.y, dir.z, step + 0.3);
      const zh = game.zombies.raycast(p.pos, dir, step + 0.5);
      if (hit || zh || p.life <= 0) {
        if (hit) p.pos.addScaledVector(dir, Math.max(0, hit.dist - 0.6));
        p.pos.y = Math.max(p.pos.y, game.physics.groundHeight(p.pos.x, p.pos.z, p.pos.y + 1) + 1.6);
        p.open = true; p.life = 3.4; p.t = 0;
        game.effects.flashLight(p.pos, 0xb060ff, 30, 0.5, 30);
        sfx.zap(p.pos);
      } else p.pos.addScaledVector(p.vel, dt);
      return;
    }
    p.t += dt;
    halo.scale.setScalar(2.5 + Math.sin(p.t * 20) * 0.3 + Math.min(1, p.t) * 2);
    p.mesh.children[0].scale.setScalar(1 + Math.min(1, p.t) * 1.5);
    // swirl of debris streaming inward
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 8;
      const from = new THREE.Vector3(p.pos.x + Math.cos(a) * r, p.pos.y + (Math.random() - 0.5) * 4, p.pos.z + Math.sin(a) * r);
      const v = p.pos.clone().sub(from).multiplyScalar(2.2).add(new THREE.Vector3(-Math.sin(a) * 6, 0, Math.cos(a) * 6));
      game.effects.glow.spawn({ pos: from, vel: v, size: 0.08, life: 0.45, g: 0, color: k % 2 ? 0xb060ff : 0x40206a, floor: -10 });
    }
    for (const z of game.zombies.list) {
      if (z.dead || z.pos.distanceTo(p.pos) > 16) continue;
      z.vortex = p;
    }
    if (p.life <= 0) {
      p.dead = true; game.scene.remove(p.mesh);
      for (const z of game.zombies.list) if (z.vortex === p) z.vortex = null;
      game.explode(p.pos.clone(), 7, p.def.dmg, { color: 0xb060ff, noSelf: true, element: p.def.element, label: 'SPAGHETTIFIED' });
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
    if (this.cool > 0 || this.burstLeft > 0) return;
    if (!(def.auto ? triggerHeld : triggerPressed)) return;
    if (this.reloadT > 0) {
      // allow interrupting a shotgun/revolver reload if there's ammo in the mag
      if (w.mag > 0 && (def.pump || def.mag <= 6)) this.reloadT = 0; else return;
    }
    if (w.mag <= 0) { if (triggerPressed) sfx.dry(); this.reload(); return; }
    w.mag--;
    this.cool = 1 / def.rate;
    this.fire(def);
    if (def.burst) { this.burstLeft = Math.min(def.burst - 1, w.mag); this.burstT = def.burstGap; }
    if (w.mag === 0 && !this.burstLeft) setTimeout(() => this.reload(), 180);
  }

  fire(def) {
    const game = this.game, cam = game.camera;
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const muzzle = this.model.userData.muzzle.getWorldPosition(new THREE.Vector3());
    const spreadMul = this.ads > 0.5 ? 0.35 : 1;
    this.kick = Math.min(1.2, this.kick + (def.flame ? 0.03 : 0.35 + def.recoil * 4));
    game.player.pitch += def.recoil * (this.ads > 0.5 ? 0.6 : 1);
    game.player.yaw += (Math.random() - 0.5) * def.recoil * 0.5;
    if (def.knock) game.player.vel.addScaledVector(fwd, -def.knock * 0.4);

    if (def.flame) { this.fireFlame(origin, fwd, muzzle, def); return; }

    this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
    const fu = this.flash.userData;
    const fcol = def.projectile === 'plasma' ? 0x60ff90 : def.chain ? 0x80d8ff : def.projectile === 'vortex' ? 0xc080ff : def.element === 'cryo' ? 0xa0f0ff : 0xffd8a0;
    fu.side.map = fx(MUZZLE[Math.floor(Math.random() * MUZZLE.length)]);
    fu.side.color.set(fcol); fu.star.color.set(fcol).multiplyScalar(0.85);
    const big = def.pellets ? 1.5 : def.sound === 'smg' || def.sound === 'minigun' ? 0.8 : def.projectile === 'bolt' ? 0.3 : 1.1;
    this.flash.scale.setScalar(big * (0.8 + Math.random() * 0.45));
    game.effects.flashLight(muzzle, new THREE.Color(fcol).getHex(), 16 * big, 0.07, 16);

    if (def.projectile) {
      const dir = fwd.clone();
      const sp = def.spread * spreadMul;
      dir.x += (Math.random() - 0.5) * 2 * sp; dir.y += (Math.random() - 0.5) * 2 * sp; dir.normalize();
      const vel = dir.multiplyScalar(def.speed || 60);
      if (def.projectile === 'gl') vel.y += 3;
      this.spawnProjectile(def.projectile, def.projectile === 'bolt' ? origin.clone().addScaledVector(fwd, 0.5) : muzzle.clone(), vel, { def });
      if (def.projectile === 'rocket') sfx.rocket(null);
      else if (def.projectile === 'bolt') { sfx.swing(); sfx.dry(); }
      else if (def.projectile === 'gl' || def.projectile === 'saw') { sfx.shot('shotgun', null, 0.45); sfx.pump(); }
      else if (def.projectile === 'vortex') { sfx.zap(null); sfx.laser(null, 0.5); }
      else sfx.laser(null);
      return;
    }
    if (def.chain) { this.fireTesla(origin, fwd, muzzle, def); return; }

    if (def.cryoSound) sfx.laser(null, 1.6); else sfx.shot(def.sound);
    game.effects.muzzleSmoke(muzzle, fwd, def.pellets ? 1 : def.auto ? 0.35 : 0.8);
    // eject casing
    const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
    if (!def.cryoSound) {
      game.effects.casing(muzzle.clone().addScaledVector(fwd, -0.3), right.clone().multiplyScalar(3 + Math.random() * 2).add(new THREE.Vector3(0, 3, 0)), !!def.pellets);
      sfx.shell(game.player.pos);
    }
    if (def.pump) { this.pumpT = 0.45; setTimeout(() => sfx.pump(), 250); }
    const pellets = def.pellets || 1;
    const spread = (def.zoom && this.ads < 0.8 ? def.hipSpread : def.spread) * spreadMul;
    for (let i = 0; i < pellets; i++) {
      const d = fwd.clone();
      d.x += (Math.random() - 0.5) * 2 * spread; d.y += (Math.random() - 0.5) * 2 * spread; d.z += (Math.random() - 0.5) * 2 * spread;
      d.normalize();
      game.hitscan(origin, d, 300, def.dmg, {
        pierce: def.pierce || 0, tracerFrom: muzzle, tracer: pellets === 1 || i % 3 === 0, element: def.element, bounces: def.bounces || 0,
        knock: def.knock, tracerColor: def.tracerColor ?? (def.bounces ? 0xffb050 : undefined),
      });
    }
  }

  // Flamethrower: a short cone that sets everything in it on fire.
  fireFlame(origin, fwd, muzzle, def) {
    const game = this.game;
    sfx.flame?.();
    for (let k = 0; k < 2; k++) {
      const v = fwd.clone().multiplyScalar(14 + Math.random() * 6).add(new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2 + 0.8, (Math.random() - 0.5) * 2.5));
      game.effects.smoke(muzzle.clone().addScaledVector(fwd, 0.3), { size: 0.35, life: 0.55 + Math.random() * 0.2, fire: true, opacity: 0.85, grow: 6, vel: v, spin: 3 });
    }
    if (Math.random() < 0.3) game.effects.smoke(muzzle.clone().addScaledVector(fwd, 4), { size: 1.2, life: 1.4, color: 0x2a2624, opacity: 0.35, grow: 2, vel: fwd.clone().multiplyScalar(2).add(new THREE.Vector3(0, 1.5, 0)) });
    if (Math.random() < 0.5) game.effects.flashLight(muzzle.clone().addScaledVector(fwd, 2), 0xff7a30, 10, 0.1, 14);
    const range = def.range;
    for (const z of game.zombies.list) {
      if (z.dead) continue;
      const c = _v.copy(z.pos); c.y += 1.1 * z.scale;
      const to = c.clone().sub(origin); const d = to.length();
      if (d > range + z.r) continue;
      to.normalize();
      if (to.dot(fwd) < 0.86) continue;
      const wall = game.physics.raycast(origin.x, origin.y, origin.z, to.x, to.y, to.z, d);
      if (wall && wall.dist < d - 0.5) continue;
      game.damageZombie(z, 'torso', def.dmg, to, { element: 'fire', flame: true, noDismember: true, quiet: true });
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
    // burst fire: the rest of the burst follows on its own
    if (this.burstLeft > 0 && this.w) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        if (this.w.mag > 0 && this.reloadT <= 0) { this.w.mag--; this.fire(this.w.def); }
        this.burstLeft--; this.burstT = this.w.def.burstGap || 0.07;
        if (!this.burstLeft && this.w.mag === 0) setTimeout(() => this.reload(), 180);
      }
    }
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
    const model = this.model;
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
      if (model.userData.spin) model.userData.spin.rotation.z += this.spin * dt * 60; // spin the barrels
      // sniper: hide the gun once you're looking through the scope
      model.visible = !(model.userData.scope && this.ads > 0.85);
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
