import * as THREE from 'three';

// Particles (instanced cubes), flying gibs, tracers, blood decals, smoke and explosion flashes.

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
    this.smokeTex = radialTex('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)');
    this.fireTex = radialTex('rgba(255,220,150,1)', 'rgba(255,80,0,0)');
    const tracerGeo = new THREE.BoxGeometry(1, 1, 1); tracerGeo.translate(0, 0, 0.5);
    this.tracerGeo = tracerGeo;
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false, transparent: true });
    // shared lights for flashes
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 30, 1.6);
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

  smoke(pos, { size = 3, life = 2.5, color = 0x888888, vel, opacity = 0.5, grow = 1.5, fire = false } = {}) {
    let s = this.smokes.find((x) => !x.sprite.visible);
    if (!s) {
      if (this.smokes.length > 160) return;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false }));
      this.scene.add(sprite); s = { sprite }; this.smokes.push(s);
    }
    s.sprite.material.map = fire ? this.fireTex : this.smokeTex;
    s.sprite.material.blending = fire ? THREE.AdditiveBlending : THREE.NormalBlending;
    s.sprite.material.color.set(color); s.sprite.material.opacity = opacity;
    s.sprite.position.copy(pos); s.sprite.scale.setScalar(size); s.sprite.visible = true;
    s.vel = vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5), 1 + Math.random(), (Math.random() - 0.5));
    s.life = s.max = life; s.size = size; s.grow = grow; s.op = opacity;
  }

  explosion(pos, radius = 6) {
    this.flashLight(pos, 0xff9040, 60, 0.35, radius * 6);
    for (let i = 0; i < 6; i++) this.smoke(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)), { size: radius * 0.9, life: 0.35, fire: true, color: 0xffffff, opacity: 1, grow: 2, vel: new THREE.Vector3(0, 2, 0) });
    for (let i = 0; i < 10; i++) this.smoke(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)), { size: radius, life: 3 + Math.random() * 2, color: 0x3a3632, opacity: 0.6, grow: 1.8 });
    this.sparks(pos, 30, 0xffa040, 18);
    const floor = this.floorAt(pos.x, pos.y + 0.5, pos.z);
    for (let i = 0; i < 18; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 16, 4 + Math.random() * 12, (Math.random() - 0.5) * 16);
      this.solid.spawn({ pos, vel: v, size: 0.1 + Math.random() * 0.25, life: 2 + Math.random() * 2, floor, color: new THREE.Color().setHSL(0.08, 0.2, 0.1 + Math.random() * 0.2) });
    }
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
      s.sprite.scale.setScalar(s.size * (1 + k * s.grow));
      s.sprite.material.opacity = s.op * Math.min(1, (1 - k) * 2) * Math.min(1, k * 8 + 0.3);
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
  }
}
