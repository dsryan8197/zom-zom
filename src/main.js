import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { PhysicsWorld } from './physics.js';
import { buildTown, NAV_CELL, NAV_HALF, NAV_N } from './town.js';
import { Effects } from './effects.js';
import { ZombieManager } from './zombies.js';
import { WeaponSystem, WEAPONS } from './weapons.js';
import { Player } from './player.js';
import { Pickups, SupplyDrops, Specials } from './items.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { initAudio, setListener, sfx } from './audio.js';

// Each round gets its own atmosphere, like the reference shots: dusty orange, cold blue mist, white-out fog, night.
const ATMOS = [
  { name: 'dust', fog: 0xa98058, density: 0.0125, sky: 0xffcf9a, ground: 0x4a3424, hemi: 1.1, sun: 0xffb070, sunI: 2.6, exposure: 1.0, tint: [1.06, 0.98, 0.88] },
  { name: 'mist', fog: 0x6f8496, density: 0.015, sky: 0xbcd4ea, ground: 0x2a3036, hemi: 1.0, sun: 0xcfe0ff, sunI: 1.5, exposure: 1.0, tint: [0.92, 0.98, 1.08] },
  { name: 'white', fog: 0xc2c8cc, density: 0.018, sky: 0xffffff, ground: 0x6a6a68, hemi: 1.3, sun: 0xffffff, sunI: 1.6, exposure: 1.05, tint: [1.0, 1.0, 1.02] },
  { name: 'night', fog: 0x0e151e, density: 0.02, sky: 0x324a6a, ground: 0x0a0a10, hemi: 0.55, sun: 0x7090c0, sunI: 0.5, exposure: 1.1, tint: [0.88, 0.95, 1.12], flashlight: true },
];

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, damage: { value: 0 }, tint: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float damage; uniform vec3 tint; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5;
      float ca = 0.0015 + damage * 0.006;
      vec3 col = vec3(texture2D(tDiffuse, uv + c*ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c*ca).b);
      col *= tint;
      float l = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(l), col, 0.88);           // slightly desaturated, gritty
      col = (col - 0.5) * 1.06 + 0.5;          // a bit of contrast
      float vig = smoothstep(0.85, 0.25, length(c * vec2(1.0, 0.8)));
      col *= mix(0.6, 1.0, vig);
      col += (hash(uv * 800.0 + time) - 0.5) * 0.035;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

class Game {
  constructor() {
    this.container = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.03, 900);
    this.scene.add(this.camera);
    this.baseFov = 78;

    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.hemi);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 300;
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.flashlight = new THREE.SpotLight(0xfff2d8, 0, 60, 0.45, 0.5, 1.2);
    this.flashlight.position.set(0, 0, -0.7); // in front of the viewmodel so the gun isn't blown out
    this.camera.add(this.flashlight); this.camera.add(this.flashlight.target);
    this.flashlight.target.position.set(0, 0, -1);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.015);

    // post
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.physics = new PhysicsWorld();
    this.town = buildTown(this.scene, this.physics);
    this.effects = new Effects(this.scene, this.physics);
    this.input = new Input(this.renderer.domElement);
    this.player = new Player(this);
    this.weapons = new WeaponSystem(this);
    this.zombies = new ZombieManager(this);
    this.pickups = new Pickups(this);
    this.drops = new SupplyDrops(this);
    this.specials = new Specials(this);
    this.hud = new HUD(this);
    this.weaponsDefs = WEAPONS;
    this.pickups.populate(this.town);

    this.time = 0; this.dt = 0;
    this.state = 'menu';
    this.atmos = { ...ATMOS[0] };
    this.applyAtmos(ATMOS[0], 1);
    this.resetRun();

    addEventListener('resize', () => this.resize());
    document.getElementById('play').onclick = () => this.start();
    document.getElementById('restart').onclick = () => { this.resetRun(true); this.start(); };
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
    };
    this.showBest();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  showBest() {
    const best = +(localStorage.getItem('zomzom-best') || 0), bestR = +(localStorage.getItem('zomzom-best-round') || 0);
    document.getElementById('best').textContent = best ? `Best: ${best.toLocaleString()} pts — round ${bestR}` : '';
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight);
  }

  start() {
    initAudio();
    this.input.lock();
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameover').classList.add('hidden');
    this.hud.show(true);
    if (this.state === 'menu' && this.round === 0) this.nextRound();
    this.state = 'playing';
  }

  pause() {
    this.state = 'paused';
    const m = document.getElementById('menu');
    m.classList.remove('hidden');
    document.getElementById('play').textContent = 'RESUME';
    this.input.onLockChange = (locked) => { if (!locked && this.state === 'playing') this.pause(); };
    document.getElementById('play').onclick = () => this.start();
  }

  resetRun(full = false) {
    this.round = 0; this.score = 0; this.kills = 0; this.headshots = 0; this.bestCombo = 0;
    this.combo = 0; this.comboT = 0;
    this.roundTotal = 0; this.spawned = 0; this.killedThisRound = 0;
    this.intermission = 0; this.spawnT = 0; this.brutesLeft = 0;
    this.campAnchor = new THREE.Vector3(); this.campT = 0; this.camping = false;
    this.slowmo = 1; this.lastThreat = 0; this.shake = 0;
    if (full) {
      this.targetAtmos = ATMOS[0];
      this.zombies.clear(); this.effects.clear(); this.specials.clear(); this.drops.clear(); this.pickups.clear();
      this.player.reset(); this.weapons.reset(); this.pickups.populate(this.town);
      this.hud.slotsDirty();
      this.state = 'menu';
    }
  }

  // ---------- atmosphere ----------
  applyAtmos(a, k) {
    const cur = this.atmos;
    const lerpC = (from, to) => new THREE.Color(from).lerp(new THREE.Color(to), k).getHex();
    cur.fog = lerpC(cur.fog, a.fog); cur.sky = lerpC(cur.sky, a.sky); cur.ground = lerpC(cur.ground, a.ground); cur.sun = lerpC(cur.sun, a.sun);
    cur.density += (a.density - cur.density) * k; cur.hemi += (a.hemi - cur.hemi) * k; cur.sunI += (a.sunI - cur.sunI) * k;
    cur.exposure += (a.exposure - cur.exposure) * k;
    cur.tint = cur.tint.map((v, i) => v + (a.tint[i] - v) * k);
    this.scene.fog.color.set(cur.fog); this.scene.fog.density = cur.density;
    this.scene.background = new THREE.Color(cur.fog);
    this.hemi.color.set(cur.sky); this.hemi.groundColor.set(cur.ground); this.hemi.intensity = cur.hemi;
    this.sun.color.set(cur.sun); this.sun.intensity = cur.sunI;
    this.renderer.toneMappingExposure = cur.exposure;
    this.grade.uniforms.tint.value.set(...cur.tint);
    this.flashlight.intensity += ((a.flashlight ? 40 : 0) - this.flashlight.intensity) * k;
  }

  // ---------- rounds ----------
  nextRound() {
    this.round++;
    const r = this.round;
    this.roundTotal = 8 + r * 5 + Math.floor(r * r * 0.3);
    this.spawned = 0; this.killedThisRound = 0;
    this.maxAlive = Math.min(10 + r * 3, 56);
    this.brutesLeft = r >= 5 ? Math.floor((r - 3) / 2) : 0;
    if (r === 5) this.hud.feed('JUGGERNAUTS INCOMING', 'head');
    this.targetAtmos = r <= ATMOS.length ? ATMOS[(r - 1) % ATMOS.length] : ATMOS[Math.floor(Math.random() * ATMOS.length)];
    const poi = this.drops.spawn(r);
    this.pickups.refreshGuns(r);
    this.hud.banner(`ROUND ${r}`, `Supply drop inbound — ${poi.name.toUpperCase()}`, 4);
    sfx.round();
    this.spawnT = 2.5;
  }

  pickType() {
    const r = this.round;
    if (this.brutesLeft > 0 && this.spawned > this.roundTotal * 0.3 && Math.random() < 0.08) { this.brutesLeft--; return 'brute'; }
    const x = Math.random();
    const runnerP = (r >= 3 ? Math.min(0.35, 0.07 * (r - 2)) : 0) + (this.camping ? 0.3 : 0);
    const exploderP = r >= 4 ? 0.07 : 0;
    if (x < runnerP) return 'runner';
    if (x < runnerP + exploderP) return 'exploder';
    return 'walker';
  }

  // Find a spawn point in a ring around (cx,cz). Returns Vector3 or null.
  findSpawn(cx, cz, minR, maxR, allowIndoor = false) {
    const nav = this.town.nav;
    const p = this.player.pos;
    for (let tries = 0; tries < 25; tries++) {
      const a = Math.random() * Math.PI * 2, d = minR + Math.random() * (maxR - minR);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (Math.abs(x) > 168 || Math.abs(z) > 168) continue;
      const i = this.zombies.cellOf(x, z);
      if (nav.blocked[i] || (!allowIndoor && nav.indoor[i])) continue;
      if (Math.hypot(x - p.x, z - p.z) < 12) continue;
      if (!this.zombies.reachable(x, z, this.time)) continue;
      const cxx = -NAV_HALF + ((i % NAV_N) + 0.5) * NAV_CELL, czz = -NAV_HALF + (((i / NAV_N) | 0) + 0.5) * NAV_CELL;
      return new THREE.Vector3(cxx, 0, czz);
    }
    return null;
  }

  director(dt) {
    if (this.intermission > 0) {
      this.intermission -= dt;
      if (this.intermission <= 0) this.nextRound();
      return;
    }
    const alive = this.zombies.list.filter((z) => !z.dead).length;
    // anti-camping: staying in one small area too long ramps up pressure
    const p = this.player.pos;
    if (Math.hypot(p.x - this.campAnchor.x, p.z - this.campAnchor.z) > 16) { this.campAnchor.copy(p); this.campT = 0; }
    else this.campT += dt;
    const wasCamping = this.camping;
    this.camping = this.campT > 22;
    if (this.camping && !wasCamping) this.hud.banner('THEY SMELL YOU', 'Stop camping — keep moving!', 2.5);

    this.spawnT -= dt;
    const toSpawn = this.roundTotal - this.spawned;
    if (this.spawnT <= 0 && toSpawn > 0 && alive < this.maxAlive) {
      this.spawnT = Math.max(0.18, 1.1 - this.round * 0.07) * (this.camping ? 0.5 : 1);
      const burst = 1 + (Math.random() < 0.25 ? Math.floor(Math.random() * 3) : 0);
      for (let b = 0; b < burst && this.spawned < this.roundTotal; b++) {
        let pos;
        const drop = this.drops.drop;
        const roll = Math.random();
        if (drop && drop.landed && !drop.opened && roll < 0.25 && Math.hypot(drop.x - p.x, drop.z - p.z) > 25) pos = this.findSpawn(drop.x, drop.z, 4, 16);
        else if (this.camping || roll < 0.55) pos = this.findSpawn(p.x, p.z, this.camping ? 13 : 18, this.camping ? 28 : 36);
        else {
          // ahead of where the player is running, so routes are never safe
          const v = this.player.vel, sp = Math.hypot(v.x, v.z);
          const ax = sp > 2 ? p.x + (v.x / sp) * 40 : p.x, az = sp > 2 ? p.z + (v.z / sp) * 40 : p.z;
          pos = this.findSpawn(ax, az, 6, 30);
        }
        if (!pos) pos = this.findSpawn(p.x, p.z, 20, 60);
        if (!pos) break;
        const type = this.pickType();
        const near = Math.hypot(pos.x - p.x, pos.z - p.z) < 45;
        this.zombies.spawn(type, pos.x, pos.z, 0, near);
        this.spawned++;
      }
    }
    // nobody can reach the player on their perch for a while: some climb up onto it
    if (this.time - (this.lastThreat || 0) > 20 && p.y > 2.5 && alive > 0) {
      this.lastThreat = this.time;
      let n = 0;
      for (let tries = 0; tries < 30 && n < 3 + Math.floor(this.round / 3); tries++) {
        const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 6;
        const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
        const gy = this.physics.groundHeight(x, z, p.y + 0.7, 0.4);
        if (Math.abs(gy - p.y) > 0.8 || this.physics.overlaps(x - 0.4, gy + 0.05, z - 0.4, x + 0.4, gy + 1.9, z + 0.4)) continue;
        this.zombies.spawn('runner', x, z, gy, true); n++;
        this.roundTotal++; this.spawned++;
      }
      if (n) this.hud.banner('THEY\'RE CLIMBING UP!', 'No perch is safe', 2);
    }
    // stragglers get angry
    if (this.spawned >= this.roundTotal && alive > 0 && alive <= 3) {
      for (const z of this.zombies.list) if (!z.angry && z.type === 'walker') { z.angry = true; z.speed *= 1.6; }
    }
    if (this.spawned >= this.roundTotal && alive === 0) {
      this.intermission = 8;
      this.addScore(100 * this.round, `ROUND ${this.round} SURVIVED +${100 * this.round}`, 'combo');
      this.hud.banner('ROUND COMPLETE', 'Grab ammo. Find guns. Breathe.', 3);
    }
  }

  // supply-drop landing attracts a small horde
  dropHorde(d) {
    const n = Math.min(4 + this.round, 12);
    for (let i = 0; i < n; i++) {
      const pos = this.findSpawn(d.x, d.z, 5, 18, true);
      if (pos) this.zombies.spawn(i < 2 && this.round >= 3 ? 'runner' : 'walker', pos.x, pos.z, 0, true);
    }
    this.roundTotal += n; this.spawned += n;
  }

  dropActive() { return false; }

  buildingAt(x, z) {
    for (const b of this.town.buildings) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b;
    return null;
  }

  activeBait() {
    let best = null;
    for (const p of this.weapons.projectiles) if (p.type === 'bait' && !p.dead) best = p;
    return best;
  }

  // ---------- combat ----------
  hitscan(origin, dir, range, dmg, opts = {}) {
    const wall = this.physics.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
    const maxD = wall ? wall.dist : range;
    let hitsLeft = 1 + (opts.pierce || 0);
    let o = origin.clone(), travelled = 0, end = null;
    const hitZ = new Set();
    while (hitsLeft > 0) {
      const zh = this.zombies.raycast(o, dir, maxD - travelled);
      if (!zh || hitZ.has(zh.zombie)) break;
      hitZ.add(zh.zombie);
      this.damageZombie(zh.zombie, zh.part, dmg, dir, opts);
      hitsLeft--;
      travelled += zh.dist + 0.3;
      o = zh.point.clone().addScaledVector(dir, 0.3);
      end = zh.point.clone();
      dmg *= 0.75;
    }
    if (hitsLeft > 0 || !end) {
      end = origin.clone().addScaledVector(dir, maxD);
      if (wall) this.effects.dust(end.clone().addScaledVector(dir, -0.05), new THREE.Vector3(wall.nx, wall.ny, wall.nz), 0x8a8478, 4);
    }
    if (opts.tracer && opts.tracerFrom) {
      const from = opts.tracerFrom.clone();
      if (from.distanceTo(end) > 2) this.effects.tracer(from.addScaledVector(dir, 1.2), end, opts.turret ? 0xffe090 : 0xffe2a0);
    }
  }

  damageZombie(z, part, dmg, dir, opts = {}) {
    const res = this.zombies.damage(z, part, dmg, dir, opts);
    if (!opts.turret && !opts.fromZombie) {
      this.hud.hitmarker(res.headshot && res.killed);
      if (res.headshot) sfx.headshot(); else sfx.hit();
    }
    return res;
  }

  explode(pos, radius, dmg, opts = {}) {
    this.effects.explosion(pos, radius * (opts.small ? 0.5 : 1));
    if (opts.color) this.effects.sparks(pos, 30, opts.color, 10);
    sfx.explosion(pos, opts.small ? 0.4 : 1);
    for (const z of this.zombies.list) {
      if (z.dead) continue;
      const c = z.pos.clone(); c.y += 1;
      const d = c.distanceTo(pos);
      if (d > radius + z.r) continue;
      const fall = 1 - Math.min(1, d / (radius + z.r));
      const dir = c.sub(pos).normalize(); dir.y += 0.5; dir.normalize();
      const res = this.zombies.damage(z, 'torso', dmg * (0.35 + fall * 0.65), dir, { explosive: true, fromZombie: opts.fromZombie, noDismember: false });
      if (!res.killed && fall > 0.3) z.vel.addScaledVector(dir, 8 * fall);
    }
    // player
    const pp = this.player.pos.clone(); pp.y += 1;
    const pd = pp.distanceTo(pos);
    if (pd < radius) {
      const fall = 1 - pd / radius;
      const self = opts.fromZombie ? 40 : 28;
      this.hurtPlayer(self * fall, pos);
      const push = pp.sub(pos).normalize().multiplyScalar(12 * fall); push.y = Math.max(push.y, 4 * fall);
      this.player.vel.add(push);
    }
    // walls
    for (const w of this.specials.walls) if (!w.dead && w.mesh.position.distanceTo(pos) < radius) this.specials.damageWall(w.box, dmg * 0.5);
    // camera shake
    this.shake = Math.min(1, (this.shake || 0) + Math.max(0, 1 - pd / (radius * 4)));
  }

  damageWall(box, amount) { this.specials.damageWall(box, amount); }

  batHit() {
    const cam = this.camera, P = this.player;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const eye = cam.getWorldPosition(new THREE.Vector3());
    let n = 0;
    const sorted = this.zombies.list.filter((z) => !z.dead).sort((a, b) => a.pos.distanceToSquared(P.pos) - b.pos.distanceToSquared(P.pos));
    for (const z of sorted) {
      const c = z.pos.clone(); c.y += 1.2 * z.scale;
      const to = c.clone().sub(eye); const d = to.length();
      if (d > 3.2 + z.r) break;
      to.normalize();
      if (to.dot(fwd) < 0.35) continue;
      const head = c.y + 0.6 * z.scale - eye.y > -0.2 && to.dot(fwd) > 0.85 && fwd.y > -0.2;
      const dir = fwd.clone(); dir.y = 0.4; dir.normalize();
      this.damageZombie(z, head ? 'head' : 'torso', 170, dir, { melee: true });
      z.vel.addScaledVector(dir, 10);
      this.effects.blood(c, dir, 14, 7);
      n++;
      if (n >= 4) break;
    }
    if (n) { sfx.bonk(P.pos); this.shake = Math.min(1, (this.shake || 0) + 0.25); }
  }

  hurtPlayer(amount, from) {
    const P = this.player;
    if (P.dead) return;
    P.health -= amount;
    P.lastHurt = this.time;
    this.hud.damage(amount);
    sfx.hurt();
    this.shake = Math.min(1, (this.shake || 0) + amount / 60);
    if (from) { const push = P.pos.clone().sub(from); push.y = 0; push.normalize().multiplyScalar(4); P.vel.add(push); }
    if (P.health <= 0) this.die();
  }

  die() {
    const P = this.player;
    P.dead = true; P.health = 0;
    this.state = 'dead';
    this.slowmo = 0.25;
    const best = +(localStorage.getItem('zomzom-best') || 0);
    if (this.score > best) { localStorage.setItem('zomzom-best', this.score); localStorage.setItem('zomzom-best-round', this.round); }
    setTimeout(() => {
      document.exitPointerLock?.();
      document.getElementById('go-stats').innerHTML =
        `Survived to <b>ROUND ${this.round}</b><br>Score <b>${this.score.toLocaleString()}</b><br>Kills <b>${this.kills}</b> · Headshots <b>${this.headshots}</b> · Best combo <b>x${this.bestCombo}</b>` +
        (this.score > best ? '<br><b style="color:#ff5050">NEW BEST!</b>' : '');
      document.getElementById('gameover').classList.remove('hidden');
      this.hud.show(false);
      this.showBest();
    }, 1800);
  }

  addScore(pts, text, cls) {
    this.score += Math.round(pts);
    if (text) this.hud.feed(text, cls);
  }

  onZombieKilled(z, opts) {
    this.kills++;
    this.killedThisRound++;
    if (opts.turret) { this.addScore(z.def.score * 0.5); return; }
    if (opts.fromZombie && !opts.explosive) return;
    // combo
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 2.2;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = 1 + Math.min(this.combo - 1, 25) * 0.1;
    let pts = z.def.score, label = z.type === 'brute' ? 'JUGGERNAUT' : 'KILL';
    if (opts.headshot) { pts += 50; label = 'HEADSHOT'; this.headshots++; }
    if (opts.melee) { pts += 40; label = opts.headshot ? 'HOME RUN' : 'BAT KILL'; }
    if (opts.explosive) { pts += 20; if (!opts.headshot) label = opts.wall ? 'WALLED' : 'BOOM'; }
    if (opts.tesla) label = 'ZAPPED';
    const total = Math.round(pts * mult);
    this.addScore(total, `+${total} ${label}`, opts.headshot ? 'head' : '');
    if (this.combo >= 2 && this.combo % 5 === 0) this.hud.feed(`x${this.combo} COMBO!`, 'combo');
    // occasional drops
    const r = Math.random();
    if (r < 0.1) this.pickups.add('ammo', new THREE.Vector3(z.pos.x, z.pos.y, z.pos.z), {});
    else if (r < 0.13) this.pickups.add('grenades', new THREE.Vector3(z.pos.x, z.pos.y, z.pos.z), {});
    else if (z.type === 'brute') this.pickups.add('gun', new THREE.Vector3(z.pos.x, z.pos.y, z.pos.z), { id: this.pickups.randomGun(this.round + 2, 3) });
  }

  // ---------- main loop ----------
  frame() {
    const rawDt = Math.min(0.05, this.clock.getDelta());
    const input = this.input;
    if (this.state === 'playing' || this.state === 'dead') {
      if (this.state === 'dead') this.slowmo = Math.min(1, this.slowmo + rawDt * 0.2);
      const dt = rawDt * this.slowmo;
      this.dt = dt; this.time += dt;
      this.update(dt, input);
    }
    // atmosphere easing
    if (this.targetAtmos) this.applyAtmos(this.targetAtmos, Math.min(1, rawDt * 0.6));

    // camera
    this.player.applyCamera(this.camera, this.time);
    if (this.player.dead) {
      this.deathT = (this.deathT || 0) + rawDt;
      this.camera.position.y -= Math.min(1.3, this.deathT * 1.2);
      this.camera.rotation.z += Math.min(1.2, this.deathT) * 0.8;
    } else this.deathT = 0;
    if (this.shake > 0) {
      const s = this.shake * 0.08;
      this.camera.position.x += (Math.random() - 0.5) * s; this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.rotation.z += (Math.random() - 0.5) * s * 0.3;
      this.shake = Math.max(0, this.shake - rawDt * 2.5);
    }
    const targetFov = this.baseFov - this.weapons.ads * 18 + (this.player.skating ? 6 : 0) + (this.player.zip || this.player.grapple ? 8 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) { this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, rawDt * 10); this.camera.updateProjectionMatrix(); }

    // shadow camera follows the player
    const p = this.player.pos;
    this.sun.position.set(p.x + 40, p.y + 80, p.z + 25);
    this.sun.target.position.set(p.x, p.y, p.z);

    this.grade.uniforms.time.value = this.time;
    this.grade.uniforms.damage.value = this.hud.dmgT;
    this.composer.render();
    input.endFrame();
  }

  update(dt, input) {
    const P = this.player, W = this.weapons;
    P.update(dt, input);
    P.applyCamera(this.camera, this.time);
    this.camera.updateMatrixWorld(true);
    if (this.state === 'playing' && !P.dead) {
      if (input.hit('KeyQ') || input.wheel > 0) W.cycle(1);
      if (input.wheel < 0) W.cycle(-1);
      for (let i = 0; i < 4; i++) if (input.hit(`Digit${i + 1}`)) W.select(i);
      if (input.hit('KeyR')) W.reload();
      if (input.hit('KeyV')) W.swingBat();
      if (input.hit('KeyG')) W.throwGrenade();
      W.tryFire(input.mouse[0], input.mousePressed[0]);
    }
    W.update(dt, { ads: input.mouse[2] && !P.dead, lookDX: input.lookDX, lookDY: input.lookDY });
    this.zombies.update(dt, this.time);
    this.effects.update(dt, this.camera);
    if (!P.dead) {
      this.pickups.update(dt);
      this.specials.update(dt);
      this.director(dt);
    }
    this.drops.update(dt);
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    setListener(this.camera.position, P.yaw);
    this.hud.update(dt);
  }
}

window.game = new Game();
