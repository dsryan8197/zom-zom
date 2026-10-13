import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HeightFog, patchFogShaders, makeSky, AtmospherePass, AtmosEnvironment, placeSun, makeLightCone } from './render.js';
import { fx } from './effects.js';
import { loadModels } from './models.js';
import { PhysicsWorld } from './physics.js';
import { buildTown, NAV_CELL, NAV_HALF, NAV_N } from './town.js';
import { Effects } from './effects.js';
import { ZombieManager } from './zombies.js';
import { WeaponSystem, WEAPONS } from './weapons.js';
import { Player } from './player.js';
import { Pickups, SupplyDrops, Specials, Workbenches } from './items.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Settings } from './settings.js';
import { initAudio, loadSounds, setListener, sfx, ambience } from './audio.js';

patchFogShaders();

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

// Each round gets its own atmosphere, like the reference shots: dusty orange, cold blue mist, white-out fog, night.
const ATMOS = [
  { name: 'dust', fog: 0xb08458, density: 0.0105, sky: 0xffd2a0, ground: 0x4a3424, hemi: 0.95, sun: 0xffb070, sunI: 3.2, exposure: 1.0, tint: [1.07, 0.98, 0.86], shafts: 1.25, skyTop: 0xc89a6c, ao: 1.0 },
  { name: 'mist', fog: 0x5c7590, density: 0.0135, sky: 0xa8c4e0, ground: 0x22282e, hemi: 0.9, sun: 0xc4dcff, sunI: 1.8, exposure: 1.0, tint: [0.9, 0.98, 1.1], shafts: 1.0, skyTop: 0x7890aa, ao: 1.0 },
  { name: 'white', fog: 0xc6cacc, density: 0.0165, sky: 0xffffff, ground: 0x6a6a68, hemi: 1.25, sun: 0xffffff, sunI: 1.6, exposure: 1.02, tint: [1.0, 1.0, 1.02], shafts: 0.6, skyTop: 0xe2e6ea, ao: 0.85 },
  { name: 'night', fog: 0x16222f, density: 0.0145, sky: 0x4a6a90, ground: 0x10121a, hemi: 0.75, sun: 0x8aa8e0, sunI: 0.8, exposure: 1.15, tint: [0.88, 0.96, 1.12], flashlight: true, shafts: 0.9, skyTop: 0x0e1824, ao: 1.0 },
];
// direction the sunlight comes from (low enough to throw long shadows and visible shafts)
const SUN_OFFSET = new THREE.Vector3(58, 62, 34);

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
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); // MSAA covers the rest
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // crisp edges, 4K map
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
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera; sc.left = -58; sc.right = 58; sc.top = 58; sc.bottom = -58; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.flashlight = new THREE.SpotLight(0xfff2d8, 0, 70, 0.42, 0.55, 1.1);
    this.flashlight.position.set(0, 0, -0.7); // in front of the viewmodel so the gun isn't blown out
    this.camera.add(this.flashlight); this.camera.add(this.flashlight.target);
    this.flashlight.target.position.set(0, 0, -1);
    this.scene.fog = new HeightFog(0x000000, 0.012);
    this.sky = makeSky(); this.scene.add(this.sky);
    this.envGen = new AtmosEnvironment(this.renderer);

    // post
    // HDR, 4x MSAA target with a depth texture the atmosphere pass can read
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    rt.depthTexture = new THREE.DepthTexture(innerWidth, innerHeight, THREE.UnsignedIntType);
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new GTAOPass(this.scene, this.camera, innerWidth / 2, innerHeight / 2);
    this.ao.output = GTAOPass.OUTPUT.Off; // only computes the AO map; the atmosphere pass composites it
    this.ao.needsSwap = false;
    this.ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: 8 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, samples: 8 });
    const aoSize = this.ao.setSize.bind(this.ao);
    this.ao.setSize = (w, h) => aoSize(Math.ceil(w / 2), Math.ceil(h / 2)); // half-res AO
    // Reuse the main pass's depth buffer (normals reconstructed from depth) instead of letting GTAO
    // draw the whole scene a second time: with a big horde that second draw was the expensive part.
    const ao = this.ao;
    ao._renderGBuffer = false;
    for (const m of [ao.gtaoMaterial, ao.pdMaterial]) {
      m.defines.NORMAL_VECTOR_TYPE = 0; m.defines.DEPTH_SWIZZLING = 'x'; m.uniforms.tNormal.value = null; m.needsUpdate = true;
    }
    const aoRender = ao.render.bind(ao);
    ao.render = (renderer, writeBuffer, readBuffer, ...rest) => {
      ao.gtaoMaterial.uniforms.tDepth.value = readBuffer.depthTexture;
      ao.pdMaterial.uniforms.tDepth.value = readBuffer.depthTexture;
      aoRender(renderer, writeBuffer, readBuffer, ...rest);
    };
    this.composer.addPass(this.ao);
    this.atmosPass = new AtmospherePass(this.camera, this.sun);
    this.atmosPass.aoPass = this.ao;
    this.composer.addPass(this.atmosPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.setSize(innerWidth, innerHeight); // sizes the custom render targets for the pixel ratio

    this.physics = new PhysicsWorld();
    this.town = buildTown(this.scene, this.physics);
    this.effects = new Effects(this.scene, this.physics);
    this.input = new Input(this.renderer.domElement);
    this.settings = new Settings(this.input);
    this.player = new Player(this);
    this.weapons = new WeaponSystem(this);
    this.zombies = new ZombieManager(this);
    this.pickups = new Pickups(this);
    this.drops = new SupplyDrops(this);
    this.specials = new Specials(this);
    this.benches = new Workbenches(this);
    this.hud = new HUD(this);
    this.weaponsDefs = WEAPONS;
    this.pickups.populate(this.town);
    this.buildLampFx();
    this.buildEmitters();

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

  // Street lamps: a halo, a cone of light through the fog and a warm pool on the ground.
  buildLampFx() {
    this.lampFx = [];
    const halo = new THREE.SpriteMaterial({ map: fx('circle_05'), color: 0xffd090, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false });
    const pool = new THREE.MeshBasicMaterial({ map: fx('circle_05'), color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const pools = [];
    let coneMat = null;
    for (const p of this.town.lamps) {
      const cone = makeLightCone(1, 0.47, 0xffc880); // unit cone scaled to the lamp height, so one material fits all
      if (coneMat) cone.material = coneMat; else { coneMat = cone.material; this.lampFx.push(cone); }
      cone.position.set(p.x, p.y, p.z); cone.scale.setScalar(p.y + 0.2);
      this.scene.add(cone);
      const h = new THREE.Sprite(halo); h.position.set(p.x, p.y - 0.1, p.z); h.scale.setScalar(3.2); h.renderOrder = 5; this.scene.add(h);
      pools.push(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2).translate(p.x, p.groundY ?? 0.08, p.z));
    }
    const poolMesh = new THREE.Mesh(mergeGeometries(pools, false), pool); poolMesh.renderOrder = 1; this.scene.add(poolMesh);
    this.lampHalo = halo; this.lampPool = pool;
  }

  // Burning wrecks, smoking cars and the radio tower's beacon.
  buildEmitters() {
    for (const e of this.town.emitters) {
      e.t = Math.random();
      if (e.kind === 'beacon') {
        e.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx('circle_05'), color: 0xff2010, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
        e.sprite.position.set(e.x, e.y, e.z); e.sprite.scale.setScalar(6);
        this.scene.add(e.sprite);
      }
    }
  }

  updateEmitters(dt) {
    const p = this.player.pos, E = this.effects;
    for (const e of this.town.emitters) {
      e.t += dt;
      if (e.kind === 'beacon') { e.sprite.material.opacity = Math.sin(e.t * 3) > 0.2 ? 1 : 0.08; continue; }
      if (Math.abs(e.x - p.x) > 95 || Math.abs(e.z - p.z) > 95) continue;
      e.fireT = (e.fireT || 0) - dt; e.smokeT = (e.smokeT || 0) - dt;
      if (e.kind === 'fire' && e.fireT <= 0) {
        e.fireT = 0.11;
        E.smoke(new THREE.Vector3(e.x + (Math.random() - 0.5) * 1.4, e.y + Math.random() * 0.4, e.z + (Math.random() - 0.5) * 1.4), { size: e.size * (0.6 + Math.random() * 0.5), life: 0.6 + Math.random() * 0.3, fire: true, opacity: 0.8, grow: 0.8, vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.4) });
        if (Math.random() < 0.15) E.glow.spawn({ pos: new THREE.Vector3(e.x, e.y + 1, e.z), vel: new THREE.Vector3((Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 2), size: 0.05, life: 1.2, g: -0.05, color: 0xff8030, floor: -10 });
      }
      if (e.smokeT <= 0) {
        e.smokeT = 0.3;
        E.smoke(new THREE.Vector3(e.x, e.y + 1.6, e.z), { size: e.size * 1.6, life: 5 + Math.random() * 2, color: 0x1e1a18, opacity: 0.55, grow: 2.6, vel: new THREE.Vector3(0.4 + Math.random() * 0.4, 2.2 + Math.random(), (Math.random() - 0.5) * 0.4) });
      }
    }
  }

  showBest() {
    const best = +(store.get('zomzom-best') || 0), bestR = +(store.get('zomzom-best-round') || 0);
    document.getElementById('best').textContent = best ? `Best: ${best.toLocaleString()} pts — round ${bestR}` : '';
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight);
  }

  start() {
    initAudio();
    ambience.start();
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
    this.round = 0; this.score = 0; this.earned = 0; this.kills = 0; this.headshots = 0; this.bestCombo = 0;
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
    cur.skyTop = lerpC(cur.skyTop, a.skyTop); cur.shafts += (a.shafts - cur.shafts) * k; cur.ao += (a.ao - cur.ao) * k;
    cur.tint = cur.tint.map((v, i) => v + (a.tint[i] - v) * k);
    this.scene.fog.color.set(cur.fog); this.scene.fog.density = cur.density;
    this.scene.background = this.scene.fog.color;
    const su = this.sky.material.uniforms;
    su.horizon.value.set(cur.fog); su.zenith.value.set(cur.skyTop); su.sunColor.value.set(cur.sun).multiplyScalar(cur.sunI * 0.35);
    const au = this.atmosPass.material.uniforms;
    au.density.value = cur.density; au.shafts.value = cur.shafts; au.aoStrength.value = cur.ao;
    (this.atmosPass.sunColor ||= new THREE.Color()).set(cur.sun).multiplyScalar(cur.sunI * 0.32);
    // re-bake the reflection environment now and then while the atmosphere eases over
    this.envT = (this.envT || 0) - 1;
    const envKey = `${cur.skyTop}|${cur.fog}|${cur.ground}`;
    if (envKey !== this.envKey && (k >= 1 || this.envT <= 0)) {
      this.envT = 30; this.envKey = envKey;
      this.scene.environment = this.envGen.update(cur.skyTop, cur.fog, cur.ground, 0.55 + cur.hemi * 0.25);
      this.scene.environmentIntensity = 0.7;
    }
    this.hemi.color.set(cur.sky); this.hemi.groundColor.set(cur.ground); this.hemi.intensity = cur.hemi;
    this.sun.color.set(cur.sun); this.sun.intensity = cur.sunI;
    this.renderer.toneMappingExposure = cur.exposure;
    this.grade.uniforms.tint.value.set(...cur.tint);
    this.flashlight.intensity += ((a.flashlight ? 140 : 0) - this.flashlight.intensity) * k;
    cur.night = (cur.night || 0) + ((a.flashlight ? 1 : 0) - (cur.night || 0)) * k;
    this.atmosPass.shaftMat.uniforms.torch.value = cur.night * 0.22; // flashlight scattering in the fog
    if (this.lampFx) {
      for (const c of this.lampFx) c.material.uniforms.intensity.value = 0.05 + cur.night * 0.3;
      this.lampHalo.opacity = 0.25 + cur.night * 0.75;
      this.lampPool.opacity = cur.night * 0.55;
    }
    // smoke and dust pick up the ambient light colour so they don't glow in the dark
    if (this.effects) this.effects.tint.set(cur.fog).lerp(new THREE.Color(cur.sky), 0.5).multiplyScalar(0.55 + cur.hemi * 0.45).lerp(new THREE.Color(1, 1, 1), 0.25);
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
    let bounce = null;
    if (hitsLeft > 0 || !end) {
      end = origin.clone().addScaledVector(dir, maxD);
      if (wall) {
        const n = new THREE.Vector3(wall.nx, wall.ny, wall.nz);
        this.effects.impact(end.clone().addScaledVector(dir, -0.05), n, dir);
        if (!opts.turret || Math.random() < 0.3) sfx.impact(end, Math.random() < 0.15 || opts.bounces ? 'metal' : 'hard');
        if (wall.box?.explosive) this.detonate(wall.box.explosive);
        // ricochet rounds bounce off walls and floors
        if (opts.bounces > 0) bounce = { from: end.clone().addScaledVector(n, 0.05), dir: dir.clone().reflect(n) };
      }
    }
    if (opts.tracer && opts.tracerFrom) {
      const from = opts.tracerFrom.clone();
      if (opts.tracerExact) this.effects.tracer(from, end, opts.tracerColor ?? 0xffe2a0);
      else if (from.distanceTo(end) > 2) this.effects.tracer(from.addScaledVector(dir, 1.2), end, opts.tracerColor ?? (opts.turret ? 0xffe090 : 0xffe2a0));
    }
    if (bounce) {
      this.effects.sparks(bounce.from, 5, 0xffc060, 7);
      this.hitscan(bounce.from, bounce.dir, range * 0.7, dmg * 0.9, { ...opts, bounces: opts.bounces - 1, tracerFrom: bounce.from, tracerExact: true, tracer: true });
    }
  }

  // Shootable explosive barrels (and anything else flagged explosive in the town).
  detonate(ex) {
    if (ex.done) return;
    ex.done = true;
    this.physics.removeBox(ex.box);
    ex.handle?.layer.hide(ex.handle);
    setTimeout(() => this.explode(ex.pos.clone(), 6.5, 450, { barrel: true }), 40);
  }

  damageZombie(z, part, dmg, dir, opts = {}) {
    const res = this.zombies.damage(z, part, dmg, dir, opts);
    if (!opts.turret && !opts.fromZombie && !opts.quiet) {
      this.hud.hitmarker(res.headshot && res.killed);
      if (res.headshot) sfx.headshot(); else sfx.hit();
      if (!opts.melee) sfx.flesh(z.pos);
    } else if (opts.quiet && Math.random() < 0.1) this.hud.hitmarker(false);
    if (opts.knock && !res.killed && dir) z.vel.addScaledVector(dir, opts.knock * 0.5);
    if (opts.element) this.applyElement(z, opts.element, dmg, res, opts);
    return res;
  }

  // Elemental rounds from MK III upgrades (and the flamethrower / cryo blaster).
  applyElement(z, el, dmg, res, opts) {
    if (el === 'fire') { if (!res.killed) this.zombies.ignite(z, opts.flame ? 3 : 4); }
    else if (el === 'cryo') {
      if (!res.killed) { z.chill = (z.chill || 0) + (opts.flame ? 0.3 : 1); if (z.chill >= 3) this.zombies.freeze(z, 4); }
    } else if (el === 'blast') {
      if (res.killed) this.explode(z.pos.clone().add(new THREE.Vector3(0, 1, 0)), 3.5, Math.max(120, dmg), { small: true, noSelf: true, chainKill: true });
    } else if (el === 'shock') {
      if (this.time - (z.shockT || -1) < 0.25) return;
      z.shockT = this.time;
      // arc to the two nearest zombies
      const from = z.pos.clone(); from.y += 1.2 * z.scale;
      const near = this.zombies.list.filter((o) => !o.dead && o !== z && o.pos.distanceToSquared(z.pos) < 64)
        .sort((a, b) => a.pos.distanceToSquared(z.pos) - b.pos.distanceToSquared(z.pos)).slice(0, 2);
      for (const o of near) {
        const to = o.pos.clone(); to.y += 1.2 * o.scale;
        this.weapons.bolt(from, to);
        o.shockT = this.time;
        this.zombies.damage(o, 'torso', dmg * 0.5, to.clone().sub(from).normalize(), { tesla: true });
      }
    }
  }

  explode(pos, radius, dmg, opts = {}) {
    this.effects.explosion(pos, radius * (opts.small ? 0.5 : 1));
    // set off any explosive barrels caught in the blast
    for (const ex of this.town.explosives) if (!ex.done && ex.pos.distanceTo(pos) < radius * 0.9) this.detonate(ex);
    if (opts.color) this.effects.sparks(pos, 30, opts.color, 10);
    sfx.explosion(pos, opts.small ? 0.4 : 1);
    for (const z of this.zombies.list) {
      if (z.dead) continue;
      const c = z.pos.clone(); c.y += 1;
      const d = c.distanceTo(pos);
      if (d > radius + z.r) continue;
      const fall = 1 - Math.min(1, d / (radius + z.r));
      const dir = c.sub(pos).normalize(); dir.y += 0.5; dir.normalize();
      const res = this.zombies.damage(z, 'torso', dmg * (0.35 + fall * 0.65), dir, { explosive: true, fromZombie: opts.fromZombie, noDismember: false, barrel: opts.barrel, label: opts.label });
      if (!res.killed && fall > 0.3) z.vel.addScaledVector(dir, 8 * fall);
      if (!res.killed && opts.element === 'fire') this.zombies.ignite(z, 4);
      if (!res.killed && opts.element === 'cryo') this.zombies.freeze(z, 3);
    }
    // player
    const pp = this.player.pos.clone(); pp.y += 1;
    const pd = pp.distanceTo(pos);
    if (pd < radius && !opts.noSelf) {
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
    const best = +(store.get('zomzom-best') || 0);
    if (this.earned > best) { store.set('zomzom-best', this.earned); store.set('zomzom-best-round', this.round); }
    setTimeout(() => {
      document.exitPointerLock?.();
      document.getElementById('go-stats').innerHTML =
        `Survived to <b>ROUND ${this.round}</b><br>Score <b>${this.earned.toLocaleString()}</b><br>Kills <b>${this.kills}</b> · Headshots <b>${this.headshots}</b> · Best combo <b>x${this.bestCombo}</b>` +
        (this.earned > best ? '<br><b style="color:#ff5050">NEW BEST!</b>' : '');
      document.getElementById('gameover').classList.remove('hidden');
      this.hud.show(false);
      this.showBest();
    }, 1800);
  }

  // score is also your wallet for workbench upgrades; `earned` is the total for the leaderboard
  addScore(pts, text, cls) {
    this.score += Math.round(pts);
    if (pts > 0) this.earned += Math.round(pts);
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
    if (opts.fire) label = 'TOASTED';
    if (opts.shatter) label = 'SHATTERED';
    if (opts.saw) label = 'SLICED';
    if (opts.bolt) label = 'SKEWERED';
    if (opts.barrel) label = 'KABOOM';
    if (opts.label) label = opts.label;
    const total = Math.round(pts * mult);
    this.addScore(total, `+${total} ${label}`, opts.headshot ? 'head' : '');
    if (this.combo >= 2 && this.combo % 5 === 0) this.hud.feed(`x${this.combo} COMBO!`, 'combo');
    // occasional drops
    const r = Math.random();
    if (r < 0.05) this.pickups.add('ammo', new THREE.Vector3(z.pos.x, z.pos.y, z.pos.z), {});
    else if (r < 0.08) this.pickups.add('grenades', new THREE.Vector3(z.pos.x, z.pos.y, z.pos.z), {});
    else if (z.type === 'brute') this.pickups.add('gun', new THREE.Vector3(z.pos.x, z.pos.y, z.pos.z), { id: this.pickups.randomGun(this.round + 2, 3) });
  }

  // ---------- adaptive quality ----------
  // If the game can't hold ~45 fps for a few seconds, step down: first render resolution,
  // then AO, then half-size shadow maps. Never steps back up within a session.
  watchPerf(rawDt) {
    if (this.state !== 'playing' || document.hidden) { this.perfT = this.perfN = 0; return; }
    this.perfT = (this.perfT || 0) + rawDt; this.perfN = (this.perfN || 0) + 1;
    if (this.perfT < 4) return;
    const avg = this.perfT / this.perfN;
    this.perfT = this.perfN = 0;
    if (avg < 1 / 45 || (this.quality ?? 3) <= 0) return;
    this.quality = (this.quality ?? 3) - 1;
    if (this.quality === 2) { this.renderer.setPixelRatio(1); this.composer.setPixelRatio(1); this.resize(); }
    else if (this.quality === 1) this.ao.enabled = false;
    else if (this.quality === 0) { this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    console.info(`[zom-zom] lowering graphics quality to ${this.quality} (avg frame ${(avg * 1000).toFixed(1)} ms)`);
  }

  // ---------- main loop ----------
  frame() {
    const rawDt = Math.min(0.05, this.clock.getDelta());
    this.clockT = (this.clockT || 0) + rawDt * 0.25; // keeps fog drifting on the menu too
    this.watchPerf(rawDt);
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
    const targetFov = this.baseFov - this.weapons.ads * (this.weapons.w?.def.zoom ? 58 : 18) + (this.player.skating ? 6 : 0) + (this.player.zip || this.player.grapple ? 8 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) { this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, rawDt * 10); this.camera.updateProjectionMatrix(); }

    // shadow camera follows the player
    const p = this.player.pos;
    placeSun(this.sun, p, SUN_OFFSET);
    this.sun.target.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.sunDir.value.copy(SUN_OFFSET).normalize();
    this.scene.fog.time = this.time + this.clockT;
    this.atmosPass.material.uniforms.time.value = this.scene.fog.time;

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
    this.updateEmitters(dt);
    if (!P.dead) {
      this.pickups.update(dt);
      this.benches.update(dt);
      this.specials.update(dt);
      this.director(dt);
    }
    this.drops.update(dt);
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    setListener(this.camera.position, P.yaw);
    ambience.update(this.time, this.targetAtmos?.flashlight ? 1 : 0);
    this.hud.update(dt);
  }
}

// Models must be ready before the town is built; sounds stream in alongside.
const playBtn = document.getElementById('play');
playBtn.disabled = true;
playBtn.textContent = 'LOADING…';
loadSounds();
loadModels((f) => { playBtn.textContent = `LOADING ${Math.round(f * 100)}%`; }).then(() => {
  window.game = new Game();
  playBtn.disabled = false;
  playBtn.textContent = 'CLICK TO PLAY';
});
