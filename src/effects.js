import * as THREE from 'three';

// Particles (instanced cubes), flying gibs, tracers, blood/scorch/bullet-hole decals, sprite smoke,
// fireballs and explosion flashes. Smoke, fire and flash sprites are Kenney's CC0 Particle Pack.

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();

function radialTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function splatTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const r = 3 + Math.random() * 8, a = Math.random() * Math.PI * 2, d = Math.random() * 18;
    g.fillStyle = `rgba(${90 + Math.random() * 40 | 0},${5 + Math.random() * 10 | 0},5,${0.7 + Math.random() * 0.3})`;
    g.fillRect(32 + Math.cos(a) * d - r / 2, 32 + Math.sin(a) * d - r / 2, r, r);
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const fxLoader = new THREE.TextureLoader();
const fxCache = {};
export function fx(name) {
  if (!fxCache[name]) {
    const t = fxLoader.load(`./textures/fx/${name}.png`);
    t.colorSpace = THREE.SRGBColorSpace;
    fxCache[name] = t;
  }
  return fxCache[name];
}
const SMOKE = ['smoke_01', 'smoke_02', 'smoke_04', 'smoke_05', 'smoke_07', 'smoke_08'];
const FIRE = ['fire_01', 'fire_02', 'smoke_04', 'smoke_07', 'smoke_08']; // dense puffs read better as a fireball than the wispy flames
const pickOf = (a) => a[Math.floor(Math.random() * a.length)];

class CubePool {
  constructor(scene, max, material) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Vector3(), spin: new THREE.Vector3(), size: 0.1, life: 0, maxLife: 1, g: 1, floor: 0, color: new THREE.Color(), shrink: true, drag: 0 });
    this.next = 0;
    this.mesh.setColorAt(0, new THREE.Color());
  }
  spawn(o) {
    const p = this.p[this.next]; this.next = (this.next + 1) % this.max;
    p.alive = true; p.pos.copy(o.pos); p.vel.copy(o.vel); p.size = o.size; p.life = p.maxLife = o.life;
    p.g = o.g ?? 1; p.floor = o.floor ?? 0; p.color.set(o.color); p.shrink = o.shrink ?? true; p.drag = o.drag ?? 0;
    p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    return p;
  }
  update(dt) {
    let n = 0;
    for (const p of this.p) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vel.y -= 22 * p.g * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.floor + p.size / 2) {
        p.pos.y = p.floor + p.size / 2;
        p.vel.y *= -0.3; p.vel.x *= 0.6; p.vel.z *= 0.6; p.spin.multiplyScalar(0.5);
      }
      p.rot.addScaledVector(p.spin, dt);
      const s = p.shrink ? p.size * Math.min(1, p.life / (p.maxLife * 0.4)) : p.size;
      tmpE.set(p.rot.x, p.rot.y, p.rot.z);
      tmpM.compose(p.pos, tmpQ.setFromEuler(tmpE), tmpS.set(s, s, s));
      this.mesh.setMatrixAt(n, tmpM);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, physics) {
    this.scene = scene; this.physics = physics;
    this.solid = new CubePool(scene, 1800, new THREE.MeshStandardMaterial({ roughness: 0.8 }));
    this.glow = new CubePool(scene, 900, new THREE.MeshBasicMaterial({ toneMapped: false }));
    this.gibs = [];
    this.decals = [];
    this.tracers = [];
    this.smokes = [];
    this.flashes = [];
    this.splatMat = new THREE.MeshBasicMaterial({ map: splatTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.smokeTex = radialTex('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'); // fallback / soft puff
    this.smokeTexs = SMOKE.map(fx); this.fireTexs = FIRE.map(fx);
    this.tint = new THREE.Color(1, 1, 1); // ambient light colour, so smoke sits in the scene's lighting
    // scorch marks and bullet holes
    this.scorchMat = new THREE.MeshBasicMaterial({ map: fx('scorch_02'), color: 0x000000, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    this.holeMat = new THREE.MeshBasicMaterial({ map: fx('scorch_03'), color: 0x0a0806, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.holeGeo = new THREE.PlaneGeometry(1, 1);
    this.scorches = []; this.holes = [];
    // explosion shockwave rings
    this.ringMat = new THREE.MeshBasicMaterial({ map: fx('circle_05'), color: 0xffc080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.rings = [];
    const tracerGeo = new THREE.BoxGeometry(1, 1, 1); tracerGeo.translate(0, 0, 0.5);
    this.tracerGeo = tracerGeo;
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    // shared lights for flashes
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 30, 1.6);
      l.castShadow = false;
      l.visible = false; scene.add(l); this.lights.push({ l, t: 0, max: 0 });
    }
    this.lightIdx = 0;
  }

  floorAt(x, y, z) { return this.physics.groundHeight(x, z, y); }

  flashLight(pos, color, intensity, dur, range = 30) {
    const L = this.lights[this.lightIdx]; this.lightIdx = (this.lightIdx + 1) % this.lights.length;
    L.l.position.copy(pos); L.l.color.set(color); L.l.distance = range; L.l.intensity = intensity; L.l.visible = true;
    L.t = dur; L.max = dur; L.base = intensity;
  }

  blood(pos, dir, count = 10, power = 6) {
    const floor = this.floorAt(pos.x, pos.y, pos.z);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * power, Math.random() * power * 0.8, (Math.random() - 0.5) * power);
      if (dir) v.addScaledVector(dir, power * 0.5);
      const shade = 0.35 + Math.random() * 0.35;
      this.solid.spawn({ pos, vel: v, size: 0.08 + Math.random() * 0.16, life: 1.5 + Math.random() * 2.5, floor, color: new THREE.Color(shade, 0.02, 0.02) });
    }
  }

  dust(pos, normal, color = 0x8a8478, count = 6) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(normal.x * 3 + (Math.random() - 0.5) * 3, normal.y * 3 + Math.random() * 3, normal.z * 3 + (Math.random() - 0.5) * 3);
      this.solid.spawn({ pos, vel: v, size: 0.05 + Math.random() * 0.07, life: 0.4 + Math.random() * 0.5, floor: this.floorAt(pos.x, pos.y, pos.z), color });
    }
    this.glow.spawn({ pos, vel: new THREE.Vector3(), size: 0.12, life: 0.05, g: 0, color: 0xffd080 });
  }

  sparks(pos, count = 6, color = 0xffc060, speed = 8) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random(), (Math.random() - 0.5)).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      this.glow.spawn({ pos, vel: v, size: 0.05 + Math.random() * 0.05, life: 0.2 + Math.random() * 0.3, g: 0.6, color, floor: -10 });
    }
  }

  casing(pos, vel, shell = false) {
    this.solid.spawn({ pos, vel, size: shell ? 0.07 : 0.04, life: 2.5, floor: this.floorAt(pos.x, pos.y, pos.z), color: shell ? 0xb02020 : 0xc8a040, shrink: false });
  }

  decal(x, y, z, size = 1.5) {
    let d;
    if (this.decals.length > 90) d = this.decals.shift();
    else { d = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.splatMat); d.rotation.x = -Math.PI / 2; d.receiveShadow = true; this.scene.add(d); }
    d.visible = true; d.position.set(x, y + 0.03, z); d.rotation.z = Math.random() * Math.PI * 2; d.scale.setScalar(size * (0.7 + Math.random() * 0.6));
    this.decals.push(d);
  }

  tracer(from, to, color = 0xffe2a0, width = 0.025) {
    let t = this.tracers.find((x) => !x.mesh.visible);
    if (!t) {
      if (this.tracers.length > 60) return;
      const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
      this.scene.add(mesh); t = { mesh, life: 0 }; this.tracers.push(t);
    }
    const len = from.distanceTo(to);
    t.mesh.position.copy(from); t.mesh.lookAt(to);
    t.mesh.scale.set(width, width, len);
    t.mesh.material.color.set(color); t.mesh.material.opacity = 1;
    t.mesh.visible = true; t.life = 0.07; t.max = 0.07;
  }

  smoke(pos, { size = 3, life = 2.5, color = 0x888888, vel, opacity = 0.5, grow = 1.5, fire = false, lit = true, spin } = {}) {
    let s = this.smokes.find((x) => !x.sprite.visible);
    if (!s) {
      if (this.smokes.length > 420) return;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false }));
      this.scene.add(sprite); s = { sprite }; this.smokes.push(s);
    }
    const m = s.sprite.material;
    m.map = fire ? pickOf(this.fireTexs) : pickOf(this.smokeTexs);
    m.blending = fire ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.toneMapped = !fire;
    m.color.set(color); if (lit && !fire) m.color.multiply(this.tint);
    m.opacity = opacity; m.rotation = Math.random() * Math.PI * 2;
    s.sprite.position.copy(pos); s.sprite.scale.setScalar(size); s.sprite.visible = true;
    s.sprite.renderOrder = fire ? 3 : 2;
    s.vel = vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5), 1 + Math.random(), (Math.random() - 0.5));
    s.life = s.max = life; s.size = size; s.grow = grow; s.op = opacity; s.fire = fire;
    s.spin = spin ?? (Math.random() - 0.5) * 0.8;
  }

  // Bullet hitting the world: dust puff, chips, the odd spark, and a bullet hole on the surface.
  impact(pos, normal, dir) {
    this.dust(pos, normal, 0x8a8478, 5);
    if (Math.random() < 0.35) this.sparks(pos, 3, 0xffd090, 6);
    this.smoke(pos.clone().addScaledVector(normal, 0.15), { size: 0.5 + Math.random() * 0.4, life: 0.7 + Math.random() * 0.5, color: 0xb0a898, opacity: 0.45, grow: 2.2, vel: normal.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.4, 0)) });
    let h;
    if (this.holes.length > 140) h = this.holes.shift();
    else { h = new THREE.Mesh(this.holeGeo, this.holeMat); h.renderOrder = 1; this.scene.add(h); }
    h.position.copy(pos).addScaledVector(normal, 0.02);
    h.lookAt(tmpP.copy(h.position).add(normal));
    h.rotateZ(Math.random() * Math.PI * 2);
    h.scale.setScalar(0.14 + Math.random() * 0.08);
    h.visible = true;
    this.holes.push(h);
  }

  // Wisps of gun smoke curling off the muzzle.
  muzzleSmoke(pos, dir, amount = 1) {
    if (Math.random() > amount) return;
    this.smoke(pos.clone().addScaledVector(dir, 0.2), { size: 0.35 + Math.random() * 0.25, life: 0.9 + Math.random() * 0.6, color: 0xd0ccc4, opacity: 0.22, grow: 3.5, vel: dir.clone().multiplyScalar(1.5).add(new THREE.Vector3(0, 0.6, 0)) });
  }

  scorch(x, y, z, size) {
    let d;
    if (this.scorches.length > 30) d = this.scorches.shift();
    else { d = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.scorchMat); d.rotation.x = -Math.PI / 2; d.renderOrder = 1; this.scene.add(d); }
    d.visible = true; d.position.set(x, y + 0.035, z); d.rotation.z = Math.random() * Math.PI * 2; d.scale.setScalar(size);
    this.scorches.push(d);
  }

  explosion(pos, radius = 6) {
    const R = radius;
    this.flashLight(pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff9040, 90, 0.45, R * 7);
    // fireball: additive flame sprites that bloom out fast and die
    for (let i = 0; i < 10; i++) {
      const o = new THREE.Vector3((Math.random() - 0.5) * R * 0.6, Math.random() * R * 0.4, (Math.random() - 0.5) * R * 0.6);
      this.smoke(pos.clone().add(o), { size: R * (0.45 + Math.random() * 0.45), life: 0.45 + Math.random() * 0.45, fire: true, opacity: 0.75, grow: 1.4, vel: o.clone().multiplyScalar(2.5).add(new THREE.Vector3(0, 3.5, 0)) });
    }
    // rolling black smoke column, then a lighter dust skirt along the ground
    for (let i = 0; i < 12; i++) {
      const o = new THREE.Vector3((Math.random() - 0.5) * R * 0.6, Math.random() * R * 0.4, (Math.random() - 0.5) * R * 0.6);
      this.smoke(pos.clone().add(o), { size: R * (0.6 + Math.random() * 0.4), life: 4 + Math.random() * 3, color: 0x221e1c, opacity: 0.85, grow: 2.2, vel: new THREE.Vector3(o.x * 0.4, 2.2 + Math.random() * 2.2, o.z * 0.4) });
    }
    const floor = this.floorAt(pos.x, pos.y + 0.5, pos.z);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.smoke(new THREE.Vector3(pos.x + Math.cos(a) * R * 0.3, floor + 0.4, pos.z + Math.sin(a) * R * 0.3), { size: R * 0.5, life: 2.5 + Math.random() * 1.5, color: 0x9a8a74, opacity: 0.45, grow: 2.5, vel: new THREE.Vector3(Math.cos(a) * R * 1.4, 0.4, Math.sin(a) * R * 1.4) });
    }
    // ground shockwave
    let ring = this.rings.find((r) => !r.mesh.visible);
    if (!ring) { ring = { mesh: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ringMat.clone()) }; ring.mesh.rotation.x = -Math.PI / 2; this.scene.add(ring.mesh); this.rings.push(ring); }
    ring.mesh.position.set(pos.x, floor + 0.15, pos.z); ring.mesh.visible = true; ring.t = 0; ring.R = R;
    this.sparks(pos, 40, 0xffa040, 20);
    for (let i = 0; i < 22; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 16, 4 + Math.random() * 12, (Math.random() - 0.5) * 16);
      this.solid.spawn({ pos, vel: v, size: 0.1 + Math.random() * 0.25, life: 2 + Math.random() * 2, floor, color: new THREE.Color().setHSL(0.08, 0.2, 0.08 + Math.random() * 0.2) });
    }
    // embers that drift up out of the smoke
    for (let i = 0; i < 10; i++) {
      this.glow.spawn({ pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * R, Math.random() * R * 0.5, (Math.random() - 0.5) * R)), vel: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 4, (Math.random() - 0.5) * 3), size: 0.06, life: 1 + Math.random() * 1.5, g: -0.05, color: 0xff8030, floor: -10 });
    }
    if (pos.y - floor < 1.5) this.scorch(pos.x, floor, pos.z, R * 0.9);
  }

  // Detach a zombie body part and send it flying.
  gib(mesh, vel, scene) {
    mesh.updateWorldMatrix(true, false);
    mesh.matrixWorld.decompose(tmpP, tmpQ, tmpS);
    if (mesh.parent) mesh.parent.remove(mesh);
    mesh.position.copy(tmpP); mesh.quaternion.copy(tmpQ); mesh.scale.copy(tmpS);
    scene.add(mesh);
    mesh.castShadow = true;
    const half = (mesh.geometry.parameters?.height || 0.4) * tmpS.y * 0.3;
    this.gibs.push({ mesh, vel: vel.clone(), spin: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16), life: 14, half, rest: false, bled: false });
    if (this.gibs.length > 160) {
      const g = this.gibs.shift(); g.mesh.parent?.remove(g.mesh);
    }
  }

  update(dt, camera) {
    this.solid.update(dt); this.glow.update(dt);
    for (const L of this.lights) {
      if (!L.l.visible) continue;
      L.t -= dt; L.l.intensity = L.base * Math.max(0, L.t / L.max);
      if (L.t <= 0) L.l.visible = false;
    }
    for (const t of this.tracers) {
      if (!t.mesh.visible) continue;
      t.life -= dt; t.mesh.material.opacity = Math.max(0, t.life / t.max);
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const s of this.smokes) {
      if (!s.sprite.visible) continue;
      s.life -= dt;
      if (s.life <= 0) { s.sprite.visible = false; continue; }
      const k = 1 - s.life / s.max;
      s.sprite.position.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(Math.max(0, 1 - dt * (s.fire ? 2.5 : 0.9))); // smoke billows out then hangs
      s.vel.y += dt * (s.fire ? 1.5 : 0.35); // and keeps rising a little
      s.sprite.scale.setScalar(s.size * (1 + (1 - (1 - k) * (1 - k)) * s.grow));
      s.sprite.material.rotation += s.spin * dt;
      s.sprite.material.opacity = s.op * Math.min(1, (1 - k) * 2) * Math.min(1, k * 8 + 0.3);
      if (s.fire) s.sprite.material.color.setRGB(1.9 - k * 1.2, 1.05 - k * 0.85, 0.45 - k * 0.42); // HDR: hot yellow to deep orange
    }
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / 0.5;
      if (k >= 1) { r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(r.R * (0.5 + k * 3.5));
      r.mesh.material.opacity = (1 - k) * 0.9;
    }
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i];
      g.life -= dt;
      if (g.life <= 0) { g.mesh.parent?.remove(g.mesh); this.gibs.splice(i, 1); continue; }
      if (g.life < 1.5) g.mesh.scale.multiplyScalar(1 - dt * 1.2);
      if (g.rest) continue;
      g.vel.y -= 22 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt;
      // bounce off walls a little
      const p = g.mesh.position;
      const hitWall = this.physics.overlaps(p.x - 0.1, p.y - 0.05, p.z - 0.1, p.x + 0.1, p.y + 0.05, p.z + 0.1);
      if (hitWall && hitWall.maxY - p.y > 0.3) { g.vel.x *= -0.4; g.vel.z *= -0.4; p.addScaledVector(g.vel, dt * 2); }
      const floor = this.floorAt(p.x, p.y + 0.3, p.z);
      if (p.y < floor + g.half) {
        p.y = floor + g.half;
        if (!g.bled) { g.bled = true; if (Math.random() < 0.6) this.decal(p.x, floor, p.z, 1.2); }
        g.vel.y *= -0.25; g.vel.x *= 0.55; g.vel.z *= 0.55; g.spin.multiplyScalar(0.4);
        if (g.vel.lengthSq() < 0.5) {
          g.rest = true;
          // settle flat-ish
          g.mesh.rotation.x = Math.round(g.mesh.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
          g.mesh.rotation.z = Math.round(g.mesh.rotation.z / (Math.PI / 2)) * (Math.PI / 2);
        }
      }
    }
  }

  clear() {
    for (const g of this.gibs) g.mesh.parent?.remove(g.mesh);
    this.gibs.length = 0;
    for (const d of this.decals) d.visible = false;
    for (const d of this.scorches) d.visible = false;
    for (const h of this.holes) h.visible = false;
  }
}
