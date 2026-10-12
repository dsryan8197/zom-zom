import * as THREE from 'three';
import { WEAPONS, TIER_COLORS, gunModel } from './weapons.js';
import { SPECIALS } from './player.js';
import { sfx } from './audio.js';
import { tex } from './textures.js';

const beamGeo = new THREE.CylinderGeometry(0.25, 0.25, 1, 6, 1, true).translate(0, 0.5, 0);

function beamMat(color, opacity = 0.35) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false });
}

const pickRand = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- Pickups (ammo, guns, specials, grenades) ----------
export class Pickups {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.ammoGeo = new THREE.BoxGeometry(0.7, 0.45, 0.45);
    this.ammoMat = new THREE.MeshStandardMaterial({ color: 0x4a6a32, roughness: 0.7 });
    this.ammoStripe = new THREE.MeshBasicMaterial({ color: 0xffd040, toneMapped: false });
    this.specialMat = new THREE.MeshStandardMaterial({ color: 0x2ab89a, emissive: 0x0a5040, roughness: 0.4 });
    this.grenadeMat = new THREE.MeshStandardMaterial({ color: 0x4a5236 });
  }

  makeAmmoMesh() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(this.ammoGeo, this.ammoMat); b.castShadow = true; g.add(b);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.47), this.ammoStripe); g.add(s);
    return g;
  }

  add(kind, pos, data = {}) {
    let mesh;
    const g = new THREE.Group();
    if (kind === 'ammo') { mesh = this.makeAmmoMesh(); }
    else if (kind === 'gun') {
      mesh = gunModel(data.id); mesh.scale.setScalar(1.7);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 24), beamMat(TIER_COLORS[WEAPONS[data.id].tier], 0.7));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -0.85; g.add(ring);
      const beam = new THREE.Mesh(beamGeo, beamMat(TIER_COLORS[WEAPONS[data.id].tier], 0.12)); beam.scale.set(0.5, 3.2, 0.5); beam.position.y = -0.85; g.add(beam); g.userData.beam = beam;
    } else if (kind === 'special') {
      mesh = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), this.specialMat); mesh.add(b);
      const q = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.62), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); mesh.add(q);
      const beam = new THREE.Mesh(beamGeo, beamMat(0x40ffc0, 0.1)); beam.scale.set(0.5, 3, 0.5); beam.position.y = -0.85; g.add(beam); g.userData.beam = beam;
    } else if (kind === 'grenades') {
      mesh = new THREE.Group();
      for (let i = 0; i < 3; i++) { const n = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.14), this.grenadeMat); n.position.x = (i - 1) * 0.18; mesh.add(n); }
    }
    g.add(mesh);
    g.position.copy(pos); g.position.y += 0.9;
    this.game.scene.add(g);
    const it = { kind, group: g, mesh, pos: g.position, base: g.position.y, data, alive: true, respawn: data.respawn ?? 0, spot: data.spot, t: Math.random() * 6 };
    this.items.push(it);
    return it;
  }

  remove(it) { it.alive = false; this.game.scene.remove(it.group); }

  populate(town) {
    for (const s of town.ammoSpots) this.add('ammo', new THREE.Vector3(s.x, s.y, s.z), { respawn: 25, spot: s });
    this.refreshGuns(1);
    for (const s of town.specialSpots) if (Math.random() < 0.5) this.add('special', new THREE.Vector3(s.x, s.y, s.z), { id: this.randomSpecial() });
  }

  randomSpecial() { return pickRand(['grapple', 'jetpack', 'skateboard', 'turret', 'bait', 'bait', 'turret']); }

  randomGun(round, minTier = 2) {
    const pool = Object.entries(WEAPONS).filter(([, d]) => d.tier >= minTier);
    const weights = pool.map(([, d]) => (d.tier === 2 ? 10 : d.tier === 3 ? 3 + round * 0.6 : round >= 3 ? 0.6 + round * 0.4 : 0.2));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i][0]; }
    return pool[0][0];
  }

  refreshGuns(round) {
    const town = this.game.town;
    for (const s of town.gunSpots) {
      if (this.items.some((it) => it.alive && it.kind === 'gun' && it.spot === s)) continue;
      if (Math.random() < 0.55) this.add('gun', new THREE.Vector3(s.x, s.y, s.z), { id: this.randomGun(round), spot: s, mag: null });
    }
    for (const s of town.specialSpots) {
      if (this.items.some((it) => it.alive && it.kind === 'special' && it.spot === s)) continue;
      if (Math.random() < 0.2) this.add('special', new THREE.Vector3(s.x, s.y, s.z), { id: this.randomSpecial(), spot: s });
    }
  }

  update(dt) {
    const game = this.game, p = game.player.pos;
    let prompt = null, best = 99;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it.alive) {
        if (it.respawn > 0 && it.spot) {
          it.respawnT = (it.respawnT ?? it.respawn) - dt;
          if (it.respawnT <= 0) { this.items.splice(i, 1); this.add(it.kind, new THREE.Vector3(it.spot.x, it.spot.y, it.spot.z), { ...it.data, respawn: it.respawn, spot: it.spot }); }
        } else this.items.splice(i, 1);
        continue;
      }
      it.t += dt;
      it.mesh.rotation.y += dt * 1.8;
      it.mesh.position.y = Math.sin(it.t * 2.5) * 0.12;
      const dx = it.pos.x - p.x, dz = it.pos.z - p.z, dy = it.pos.y - 0.9 - p.y;
      const d = Math.hypot(dx, dz);
      if (it.group.userData.beam) it.group.userData.beam.visible = d > 4;
      if (d > 1.8 || Math.abs(dy) > 1.6) continue;
      if (it.kind === 'ammo') {
        game.weapons.addAmmo(0.45); sfx.pickup(); game.hud.feed('+AMMO', ''); this.remove(it);
      } else if (it.kind === 'grenades') {
        game.weapons.grenades = Math.min(8, game.weapons.grenades + 3); sfx.pickup(); game.hud.feed('+3 GRENADES', ''); this.remove(it);
      } else if (it.kind === 'gun') {
        const W = game.weapons;
        const id = it.data.id;
        const owned = W.slots.find((s) => s && s.id === id);
        if (owned) { owned.reserve = owned.def.reserve; owned.mag = owned.def.mag; sfx.pickup(); game.hud.feed(`${WEAPONS[id].name} AMMO MAXED`, ''); this.remove(it); continue; }
        if (W.freeSlot() >= 0) {
          const slot = W.freeSlot();
          W.give(id, slot); if (it.data.mag != null) { W.slots[slot].mag = it.data.mag; W.slots[slot].reserve = it.data.reserve; }
          W.select(slot);
          sfx.bigPickup(); game.hud.feed(`GOT ${WEAPONS[id].name}`, 'combo'); this.remove(it);
        } else if (d < best) {
          best = d; prompt = { it, text: `<kbd>X</kbd> swap ${W.w.def.name} for <b style="color:#${TIER_COLORS[WEAPONS[id].tier].toString(16)}">${WEAPONS[id].name}</b>` };
        }
      } else if (it.kind === 'special') {
        const pl = game.player, id = it.data.id;
        if (!pl.special) { pl.setSpecial(id); sfx.bigPickup(); game.hud.feed(`GOT ${SPECIALS[id].name}`, 'combo'); this.remove(it); }
        else if (pl.special.id === id && SPECIALS[id].charges) { pl.special.charges += SPECIALS[id].charges; sfx.pickup(); game.hud.feed(`+${SPECIALS[id].name}`, ''); this.remove(it); }
        else if (pl.special.id !== id && d < best) { best = d; prompt = { it, text: `<kbd>X</kbd> swap for <b style="color:#7cf3c9">${SPECIALS[id].name}</b>` }; }
      }
    }
    if (game.nearZip && !prompt) game.hud.prompt('<kbd>X</kbd> ride zipline');
    else game.hud.prompt(prompt?.text);
    if (prompt && game.input.hit('KeyX')) this.swap(prompt.it);
  }

  swap(it) {
    const game = this.game;
    if (it.kind === 'gun') {
      const W = game.weapons, cur = W.w;
      const pos = it.pos.clone(); pos.y -= 0.9;
      this.remove(it);
      W.give(it.data.id, W.cur);
      if (it.data.mag != null) { W.w.mag = it.data.mag; W.w.reserve = it.data.reserve; }
      // drop the old gun where the new one was
      const drop = this.add('gun', pos.add(new THREE.Vector3(0.8, 0, 0)), { id: cur.id, mag: cur.mag, reserve: cur.reserve });
      sfx.bigPickup(); game.hud.feed(`GOT ${WEAPONS[it.data.id].name}`, 'combo');
    } else if (it.kind === 'special') {
      const pl = game.player, old = pl.special?.id;
      const pos = it.pos.clone(); pos.y -= 0.9;
      this.remove(it);
      pl.setSpecial(it.data.id);
      if (old) this.add('special', pos.add(new THREE.Vector3(0.8, 0, 0)), { id: old });
      sfx.bigPickup(); game.hud.feed(`GOT ${SPECIALS[it.data.id].name}`, 'combo');
    }
  }

  clear() { for (const it of this.items) this.game.scene.remove(it.group); this.items.length = 0; }
}

// ---------- Supply drops ----------
export class SupplyDrops {
  constructor(game) {
    this.game = game;
    this.drop = null;
    this.lastPoi = null;
    this.crateMat = new THREE.MeshStandardMaterial({ map: tex('crate'), color: 0x9aa070, roughness: 0.8 });
  }

  spawn(round) {
    this.clear();
    const game = this.game, p = game.player.pos;
    const pois = game.town.pois.filter((q) => q !== this.lastPoi && Math.hypot(q.x - p.x, q.z - p.z) > 70);
    const poi = pickRand(pois.length ? pois : game.town.pois);
    this.lastPoi = poi;
    const x = poi.x + (Math.random() - 0.5) * 6, z = poi.z + (Math.random() - 0.5) * 6;
    const ground = game.physics.groundHeight(x, z, 200, 0.8);
    const g = new THREE.Group();
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), this.crateMat); crate.position.y = 0.6; crate.castShadow = true; g.add(crate);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.15, 1.65), new THREE.MeshStandardMaterial({ color: 0xc03020 })); strap.position.y = 0.6; g.add(strap);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false })); lamp.position.y = 1.3; g.add(lamp);
    // chute
    const chute = new THREE.Group();
    for (let i = -2; i <= 2; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 4), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xd8d0c0 : 0x6a7a4a, side: THREE.DoubleSide }));
      seg.position.set(i * 1.35, 6 - Math.abs(i) * 0.4, 0); seg.rotation.z = -i * 0.18; chute.add(seg);
    }
    g.add(chute);
    g.position.set(x, ground + 110, z);
    game.scene.add(g);
    // beacon beam (visible through fog)
    const beam = new THREE.Mesh(beamGeo, beamMat(0xff3020, 0.35)); beam.scale.set(3, 300, 3); beam.position.set(x, ground, z);
    game.scene.add(beam);
    this.drop = { poi, group: g, chute, beam, lamp, x, z, ground, landed: false, opened: false, t: 0, smokeT: 0 };
    sfx.plane();
    return poi;
  }

  update(dt) {
    const d = this.drop; if (!d) return;
    const game = this.game;
    d.t += dt;
    d.beam.material.opacity = 0.25 + Math.sin(d.t * 4) * 0.1;
    d.lamp.visible = Math.sin(d.t * 10) > 0;
    if (!d.landed) {
      d.group.position.y -= dt * 8.5;
      d.group.rotation.y += dt * 0.3;
      d.group.rotation.z = Math.sin(d.t * 1.5) * 0.08;
      if (d.group.position.y <= d.ground) {
        d.group.position.y = d.ground; d.landed = true; d.group.rotation.z = 0;
        d.group.remove(d.chute);
        game.effects.dust(new THREE.Vector3(d.x, d.ground + 0.2, d.z), new THREE.Vector3(0, 1, 0), 0x8a7a60, 30);
        for (let i = 0; i < 6; i++) game.effects.smoke(new THREE.Vector3(d.x + (Math.random() - 0.5) * 3, d.ground + 0.5, d.z + (Math.random() - 0.5) * 3), { size: 3, life: 2, color: 0x9a8a70, opacity: 0.4 });
        sfx.explosion(new THREE.Vector3(d.x, d.ground, d.z), 0.4);
        game.hud.feed('SUPPLY DROP LANDED', 'combo');
        game.dropHorde(d);
      }
      return;
    }
    // red smoke column
    d.smokeT -= dt;
    if (d.smokeT <= 0 && !d.opened) {
      d.smokeT = 0.12;
      game.effects.smoke(new THREE.Vector3(d.x, d.ground + 1.4, d.z), { size: 2, life: 4.5, color: 0xd03a2a, opacity: 0.45, grow: 2.5, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 3 + Math.random(), (Math.random() - 0.5) * 0.6) });
    }
    const p = game.player.pos;
    if (!d.opened && Math.hypot(p.x - d.x, p.z - d.z) < 2.6 && Math.abs(p.y - d.ground) < 2) this.open();
  }

  open() {
    const d = this.drop, game = this.game;
    d.opened = true;
    game.scene.remove(d.beam);
    sfx.bigPickup();
    const at = (ox, oz) => new THREE.Vector3(d.x + ox, d.ground, d.z + oz);
    const P = game.pickups;
    P.add('gun', at(2.2, 0), { id: P.randomGun(game.round + 3, 3) });
    P.add('gun', at(-2.2, 0), { id: P.randomGun(game.round + 1, 2) });
    P.add('special', at(0, 2.2), { id: P.randomSpecial() });
    P.add('grenades', at(0, -2.2));
    game.weapons.addAmmo(1);
    game.player.health = 100;
    game.addScore(250, 'SUPPLY DROP +250', 'combo');
    // lid pops off
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 1.6), this.crateMat);
    lid.position.set(d.x, d.ground + 1.3, d.z);
    game.scene.add(lid);
    game.effects.gibs.push({ mesh: lid, vel: new THREE.Vector3(2, 9, 1), spin: new THREE.Vector3(4, 2, 3), life: 10, half: 0.1, rest: false, bled: true });
  }

  clear() {
    if (!this.drop) return;
    this.game.scene.remove(this.drop.group); this.game.scene.remove(this.drop.beam);
    this.drop = null;
  }
}

// ---------- Instant walls & turrets ----------
export class Specials {
  constructor(game) {
    this.game = game;
    this.walls = [];
    this.turrets = [];
    this.maxWalls = 3;
    this.wallCharges = 3;
    this.wallRecharge = 0;
    this.RECHARGE = 20; // seconds per wall => 3 per minute
    this.wallMat = new THREE.MeshStandardMaterial({ map: tex('concrete'), color: 0xb8bcc0, roughness: 0.9 });
    this.wallMat.map = tex('concrete').clone(); this.wallMat.map.repeat.set(1.3, 0.8); this.wallMat.map.needsUpdate = true;
    this.edgeMat = new THREE.MeshBasicMaterial({ color: 0x60b0ff, toneMapped: false });
  }

  placeWall() {
    const game = this.game;
    if (this.wallCharges < 1) { game.hud.toast('WALL RECHARGING'); return; }
    const p = game.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const alongX = Math.abs(fz) > Math.abs(fx); // facing mostly along z => wall spans x
    const W = 5.2, H = 3.2, D = 0.7;
    let cx = p.pos.x + fx * 3, cz = p.pos.z + fz * 3;
    const gy = game.physics.groundHeight(cx, cz, p.pos.y + 1.0, 0.3);
    const [hx, hz] = alongX ? [W / 2, D / 2] : [D / 2, W / 2];
    // keep player out of it
    if (Math.abs(p.pos.x - cx) < hx + p.r && Math.abs(p.pos.z - cz) < hz + p.r) { cx += fx * 1.5; cz += fz * 1.5; }
    const box = game.physics.addBox(cx - hx, gy, cz - hz, cx + hx, gy + H, cz + hz, { playerWall: true, hp: 900 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, H, hz * 2), this.wallMat);
    mesh.castShadow = mesh.receiveShadow = true;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 + 0.04, 0.12, hz * 2 + 0.04), this.edgeMat); edge.position.y = H / 2 - 0.1; mesh.add(edge);
    mesh.position.set(cx, gy - H / 2, cz);
    game.scene.add(mesh);
    const wall = { box, mesh, targetY: gy + H / 2, life: 45, rising: true };
    box.wall = wall;
    this.walls.push(wall);
    this.wallCharges--;
    if (this.wallCharges < this.maxWalls && this.wallRecharge <= 0) this.wallRecharge = this.RECHARGE;
    game.effects.dust(new THREE.Vector3(cx, gy + 0.1, cz), new THREE.Vector3(0, 1, 0), 0x777777, 20);
    for (let i = 0; i < 4; i++) game.effects.smoke(new THREE.Vector3(cx + (Math.random() - 0.5) * hx * 2, gy + 0.3, cz + (Math.random() - 0.5) * hz * 2), { size: 2, life: 1.2, color: 0x888888, opacity: 0.4 });
    // zombies caught by the wall get launched
    for (const z of game.zombies.list) {
      if (z.dead) continue;
      if (Math.abs(z.pos.x - cx) < hx + z.r && Math.abs(z.pos.z - cz) < hz + z.r && Math.abs(z.pos.y - gy) < 2) {
        game.zombies.damage(z, 'torso', 9999, new THREE.Vector3(0, 1, 0), { explosive: true, wall: true });
      }
    }
    sfx.wall();
  }

  damageWall(box, amount) {
    const w = box.wall; if (!w) return;
    box.hp -= amount;
    this.game.effects.dust(new THREE.Vector3(w.mesh.position.x, w.mesh.position.y, w.mesh.position.z), new THREE.Vector3(0, 1, 0), 0x999999, 3);
    if (box.hp <= 0) this.breakWall(w);
  }

  breakWall(w) {
    if (w.dead) return;
    w.dead = true;
    this.game.physics.removeBox(w.box);
    const p = w.mesh.position;
    for (let i = 0; i < 20; i++) this.game.effects.solid.spawn({ pos: new THREE.Vector3(p.x + (Math.random() - 0.5) * 3, p.y + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 3), vel: new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6), size: 0.2 + Math.random() * 0.3, life: 3, floor: this.game.physics.groundHeight(p.x, p.z, p.y), color: 0x9a9a98 });
    this.game.scene.remove(w.mesh);
  }

  deployTurret() {
    const game = this.game, p = game.player;
    if (this.turrets.length >= 3) { const old = this.turrets.shift(); game.scene.remove(old.group); }
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const x = p.pos.x + fx * 2, z = p.pos.z + fz * 2;
    const y = game.physics.groundHeight(x, z, p.pos.y + 1, 0.2);
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.5, roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), dark);
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.35, 0.55, Math.sin(a) * 0.35); leg.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
      g.add(leg);
    }
    const head = new THREE.Group(); head.position.y = 1.15; g.add(head);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.6), dark); head.add(body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.8), dark); barrel.position.set(0, 0.03, -0.6); head.add(barrel);
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0x40ff60, toneMapped: false })); light.position.set(0.12, 0.08, -0.31); head.add(light);
    g.traverse((m) => { m.castShadow = true; });
    g.position.set(x, y, z);
    game.scene.add(g);
    this.turrets.push({ group: g, head, light, cool: 0, life: 50, ammo: 450, target: null, retarget: 0 });
    game.hud.feed('TURRET DEPLOYED', 'combo');
    return true;
  }

  update(dt) {
    const game = this.game;
    // wall charges
    if (this.wallCharges < this.maxWalls) {
      this.wallRecharge -= dt;
      if (this.wallRecharge <= 0) { this.wallCharges++; if (this.wallCharges < this.maxWalls) this.wallRecharge = this.RECHARGE; }
    }
    if (game.input.hit('KeyF')) this.placeWall();
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i];
      if (w.dead) { this.walls.splice(i, 1); continue; }
      w.life -= dt;
      const ty = w.life > 0 ? w.targetY : w.targetY - 3.4;
      w.mesh.position.y += (ty - w.mesh.position.y) * Math.min(1, dt * (w.life > 0 ? 18 : 3));
      if (w.life < 0 && !w.sunk) { w.sunk = true; game.physics.removeBox(w.box); }
      if (w.life < -1.5) { game.scene.remove(w.mesh); this.walls.splice(i, 1); }
    }
    // turrets
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.life -= dt;
      if (t.life <= 0 || t.ammo <= 0) {
        game.effects.explosion(t.group.position.clone().add(new THREE.Vector3(0, 1, 0)), 2);
        game.scene.remove(t.group); this.turrets.splice(i, 1); continue;
      }
      t.light.visible = t.life > 8 || Math.sin(t.life * 12) > 0;
      const hp = t.group.position.clone(); hp.y += 1.2;
      t.retarget -= dt;
      if (t.retarget <= 0 || (t.target && t.target.dead)) {
        t.retarget = 0.3; t.target = null;
        let bd = 42 * 42;
        for (const z of game.zombies.list) {
          if (z.dead || z.rise > 0) continue;
          const d2 = z.pos.distanceToSquared(hp);
          if (d2 >= bd) continue;
          const to = z.pos.clone(); to.y += 1.2 * z.scale; to.sub(hp);
          const dist = to.length(); to.normalize();
          const wall = game.physics.raycast(hp.x, hp.y, hp.z, to.x, to.y, to.z, dist);
          if (wall && wall.dist < dist - 0.5) continue;
          bd = d2; t.target = z;
        }
      }
      if (t.target) {
        const aim = t.target.pos.clone(); aim.y += 1.3 * t.target.scale;
        const yaw = Math.atan2(hp.x - aim.x, hp.z - aim.z);
        t.head.rotation.y += (((yaw - t.head.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 12);
        t.cool -= dt;
        if (t.cool <= 0) {
          t.cool = 0.11; t.ammo--;
          const dir = aim.sub(hp).normalize();
          dir.x += (Math.random() - 0.5) * 0.03; dir.y += (Math.random() - 0.5) * 0.03; dir.normalize();
          const muzzle = hp.clone().addScaledVector(dir, 1);
          game.hitscan(hp, dir, 60, 48, { tracerFrom: muzzle, tracer: true, turret: true, pierce: 1 });
          game.effects.glow.spawn({ pos: muzzle, vel: new THREE.Vector3(), size: 0.25, life: 0.04, g: 0, color: 0xffd080 });
          sfx.shot('turret', hp, 0.6);
        }
      }
    }
  }

  clear() {
    for (const w of this.walls) { this.game.scene.remove(w.mesh); if (!w.sunk && !w.dead) this.game.physics.removeBox(w.box); }
    for (const t of this.turrets) this.game.scene.remove(t.group);
    this.walls.length = 0; this.turrets.length = 0;
    this.wallCharges = 3; this.wallRecharge = 0;
  }
}
