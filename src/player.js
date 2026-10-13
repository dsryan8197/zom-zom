import * as THREE from 'three';
import { sfx } from './audio.js';

export const SPECIALS = {
  grapple: { name: 'GRAPPLING HOOK', desc: 'aim at a roof & press E' },
  jetpack: { name: 'JETPACK', desc: 'hold E to fly' },
  skateboard: { name: 'SKATEBOARD', desc: 'E to ride (fast!)' },
  turret: { name: 'SENTRY TURRET', desc: 'E to deploy', charges: 1 },
  bait: { name: 'ZOMBIE BAIT', desc: 'E to throw a screaming speaker', charges: 3 },
};

const RUN = 8.6, SKATE = 14, ADS_SPEED = 6, JUMP = 8.2, GRAV = 24;

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(4, 0, 4);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI * 0.75; this.pitch = 0;
    this.r = 0.4; this.h = 1.8; this.eye = 1.65;
    this.health = 100; this.dead = false;
    this.onGround = false;
    this.res = {};
    this.lastHurt = -10;
    this.special = { id: 'grapple' };
    this.jetFuel = 100;
    this.skating = false;
    this.zip = null; this.grapple = null; this.chute = false; this.climbing = false;
    this.camRoll = 0; this.landDip = 0;

    // rope for the grapple
    this.rope = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    this.rope.visible = false; game.scene.add(this.rope);
    // parachute canopy (world-space, follows player)
    this.canopy = new THREE.Group();
    const cmat = new THREE.MeshStandardMaterial({ color: 0xb03028, roughness: 0.8, side: THREE.DoubleSide });
    const cmat2 = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.8, side: THREE.DoubleSide });
    for (let i = -3; i <= 3; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.15, 3), i % 2 ? cmat : cmat2);
      seg.position.set(i * 1.05, 3.2 - Math.abs(i) * 0.28, 0); seg.rotation.z = -i * 0.12;
      this.canopy.add(seg);
    }
    this.canopy.visible = false; game.scene.add(this.canopy);
    // skateboard viewmodel (visible when looking down)
    this.board = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 0.9), new THREE.MeshStandardMaterial({ color: 0x8a2a8a }));
    this.board.add(deck);
    for (const z of [-0.3, 0.3]) for (const x of [-0.1, 0.1]) { const wh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: 0xeeeeee })); wh.position.set(x, -0.05, z); this.board.add(wh); }
    this.board.visible = false; game.scene.add(this.board);
  }

  reset() {
    this.pos.set(4, 0, 4); this.vel.set(0, 0, 0); this.yaw = Math.PI * 0.75; this.pitch = 0;
    this.health = 100; this.dead = false; this.special = { id: 'grapple' }; this.jetFuel = 100;
    this.skating = false; this.zip = null; this.grapple = null; this.chute = false;
  }

  setSpecial(id) {
    this.skating = false; this.grapple = null;
    this.special = { id, charges: SPECIALS[id].charges };
    this.jetFuel = 100;
  }

  useSpecial(pressed, held, dt) {
    const s = this.special; if (!s) return;
    const game = this.game;
    switch (s.id) {
      case 'grapple':
        if (pressed && !this.grapple && (s.cd || 0) <= 0) {
          const o = game.camera.getWorldPosition(new THREE.Vector3()), d = game.camera.getWorldDirection(new THREE.Vector3());
          const hit = game.physics.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 80);
          if (hit && hit.box) {
            this.grapple = { point: o.clone().addScaledVector(d, hit.dist), t: 0 };
            this.zip = null; sfx.grapple(); s.cd = 0.8;
          } else { game.hud.toast('NOTHING TO HOOK'); }
        } else if (pressed && this.grapple) this.grapple = null;
        s.cd = (s.cd || 0) - dt;
        break;
      case 'jetpack':
        if (held && this.jetFuel > 0) {
          this.jetFuel -= dt * 28;
          this.vel.y = Math.min(this.vel.y + 48 * dt, 9);
          this.chute = false;
          s.sndT = (s.sndT || 0) - dt;
          if (s.sndT <= 0) { s.sndT = 0.1; sfx.jet(); }
          const p = this.pos.clone(); p.y += 0.6;
          game.effects.glow.spawn({ pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 2, -8, (Math.random() - 0.5) * 2), size: 0.15, life: 0.25, g: 0, color: 0x80c0ff });
        } else if (this.onGround) this.jetFuel = Math.min(100, this.jetFuel + dt * 22);
        break;
      case 'skateboard':
        if (pressed) { this.skating = !this.skating; game.hud.toast(this.skating ? 'SKATING' : 'ON FOOT'); }
        break;
      case 'turret':
        if (pressed && s.charges > 0) { if (game.specials.deployTurret()) { s.charges--; if (s.charges <= 0) this.special = null; } }
        break;
      case 'bait':
        if (pressed && s.charges > 0) {
          const d = game.camera.getWorldDirection(new THREE.Vector3());
          const p = game.camera.getWorldPosition(new THREE.Vector3()).addScaledVector(d, 0.6);
          game.weapons.spawnProjectile('bait', p, d.multiplyScalar(18).add(new THREE.Vector3(0, 5, 0)));
          s.charges--; if (s.charges <= 0) this.special = null;
        }
        break;
    }
  }

  surface() {
    const b = this.game.buildingAt(this.pos.x, this.pos.z);
    if (b) return this.pos.y > 0.5 || /House|Farm|Store|Church|Apart/.test(b.name) ? 'wood' : 'concrete';
    if (this.pos.y > 0.5 || Math.abs(this.pos.x) < 9.5 || Math.abs(this.pos.z) < 9.5) return 'concrete';
    return 'grass';
  }

  update(dt, input) {
    const game = this.game;
    if (this.dead) return;
    // look
    const aimK = game.weapons.ads > 0.5 ? (game.weapons.w?.def.zoom ? 0.28 : 0.6) : 1;
    this.yaw -= input.lookDX * input.sensitivity * aimK;
    this.pitch -= input.lookDY * input.sensitivity * aimK;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));

    // wish direction
    const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const s = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wish = new THREE.Vector3(-sin * f + cos * s, 0, -cos * f - sin * s);
    if (wish.lengthSq() > 0) wish.normalize();

    this.useSpecial(input.hit('KeyE'), input.down('KeyE'), dt);

    // ---- zipline ----
    if (this.zip) {
      const z = this.zip;
      const len = z.line.a.distanceTo(z.line.b);
      z.speed = Math.min(24, z.speed + dt * 18);
      z.t += (z.speed * dt) / len;
      const dir = z.line.b.clone().sub(z.line.a).normalize();
      if (z.t >= 1 || input.hit('Space')) {
        this.zip = null;
        this.vel.copy(dir.multiplyScalar(z.t >= 1 ? 6 : z.speed * 0.8)); this.vel.y = Math.max(this.vel.y, 2);
      } else {
        const p = z.line.a.clone().lerp(z.line.b, z.t);
        this.pos.set(p.x, p.y - 2.2, p.z);
        this.vel.copy(dir.multiplyScalar(z.speed));
        z.snd = (z.snd || 0) - dt; if (z.snd <= 0) { z.snd = 0.12; sfx.zip(); }
        this.onGround = false;
        this.camRoll += (0.05 - this.camRoll) * dt * 4;
        return;
      }
    }
    // ---- grapple ----
    if (this.grapple) {
      const g = this.grapple;
      g.t += dt;
      const eye = this.pos.clone(); eye.y += this.eye;
      const to = g.point.clone().sub(eye);
      const d = to.length();
      if (d < 1.8 || g.t > 2.8 || input.hit('Space')) {
        this.grapple = null;
        if (d < 1.8 || g.t > 2.8) this.vel.y = Math.max(this.vel.y, 7); // pop up over the ledge
      } else {
        to.normalize();
        const pull = Math.min(34, 10 + g.t * 40);
        this.vel.lerp(to.multiplyScalar(pull), Math.min(1, dt * 6));
        this.vel.addScaledVector(wish, 6 * dt);
      }
    }

    // ---- ladders ----
    this.climbing = false;
    for (const l of game.town.ladders) {
      if (this.pos.x + this.r > l.x0 && this.pos.x - this.r < l.x1 && this.pos.z + this.r > l.z0 && this.pos.z - this.r < l.z1 && this.pos.y < l.y1 && this.pos.y + this.h > l.y0) {
        if (f !== 0 || !this.onGround) this.climbing = true;
      }
    }

    // ---- ground / air movement ----
    const ads = game.weapons.ads > 0.5;
    const maxSpeed = this.skating ? SKATE : ads ? ADS_SPEED : RUN;
    if (!this.grapple) {
      const accel = this.onGround ? (this.skating ? 5 : 14) : this.chute ? 3 : 2.5;
      const targetX = wish.x * maxSpeed, targetZ = wish.z * maxSpeed;
      if (this.onGround || wish.lengthSq() > 0) {
        this.vel.x += (targetX - this.vel.x) * Math.min(1, accel * dt);
        this.vel.z += (targetZ - this.vel.z) * Math.min(1, accel * dt);
      }
    }
    if (this.climbing) {
      this.vel.y = f > 0 ? 5 : f < 0 ? -5 : 0;
      this.vel.x *= 0.5; this.vel.z *= 0.5;
      if (f > 0) { this.vel.x += -sin * 1.5; this.vel.z += -cos * 1.5; }
    } else if (!this.grapple) {
      this.vel.y -= GRAV * dt;
    }
    if (input.hit('Space') && (this.onGround || this.climbing) && !this.grapple) {
      this.vel.y = JUMP; this.onGround = false;
      if (this.climbing) { this.vel.x += sin * 4; this.vel.z += cos * 4; }
    }
    // ---- parachute ----
    if (!this.onGround && this.vel.y < -7 && input.down('Space') && !this.grapple) this.chute = true;
    if (this.chute) {
      if (!input.down('Space') || this.onGround) this.chute = false;
      else {
        this.vel.y = Math.max(this.vel.y, -3.2);
        const hs = Math.hypot(this.vel.x, this.vel.z);
        if (hs < 12) { this.vel.x += wish.x * 10 * dt; this.vel.z += wish.z * 10 * dt; }
      }
    }
    this.canopy.visible = this.chute;
    if (this.chute) { this.canopy.position.set(this.pos.x, this.pos.y + 2.2, this.pos.z); this.canopy.rotation.y = this.yaw; }

    const wasGround = this.onGround, fallV = this.vel.y;
    game.physics.move(this.pos, this.vel, dt, this.r, this.h, 0.65, this.res);
    this.onGround = this.res.onGround;
    if (this.onGround && !wasGround && fallV < -10) this.landDip = Math.min(0.35, -fallV * 0.015);
    // footsteps: surface depends on where you are (wood/tile indoors, pavement on the streets, grass/dirt elsewhere)
    if (this.onGround && !wasGround && fallV < -4) sfx.step(this.surface(), Math.min(2, -fallV / 8));
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && !this.skating && hs > 1) {
      this.stepDist = (this.stepDist || 0) + hs * dt;
      if (this.stepDist > 2.3) { this.stepDist = 0; sfx.step(this.surface()); }
    }
    if (this.res.hitCeil && this.grapple) this.grapple = null;
    if (this.pos.y < -20) this.pos.set(4, 1, 4);

    // ---- zipline attach ----
    game.nearZip = null;
    for (const line of game.town.ziplines) {
      const anchor = line.a.clone(); anchor.y -= 2.2;
      if (anchor.distanceTo(this.pos) < 2.6) {
        game.nearZip = line;
        if (input.hit('KeyX')) { this.zip = { line, t: 0, speed: 6 }; this.grapple = null; this.chute = false; }
      }
    }

    // rope / board visuals
    this.rope.visible = !!this.grapple;
    if (this.grapple) {
      const hand = this.pos.clone(); hand.y += 1.2;
      this.rope.position.copy(hand); this.rope.lookAt(this.grapple.point);
      this.rope.scale.z = hand.distanceTo(this.grapple.point);
    }
    this.board.visible = this.skating;
    if (this.skating) { this.board.position.set(this.pos.x - Math.sin(this.yaw) * 0.15, this.pos.y + 0.08, this.pos.z - Math.cos(this.yaw) * 0.15); this.board.rotation.y = this.yaw; }

    // health regen
    if (game.time - this.lastHurt > 4 && this.health < 100) this.health = Math.min(100, this.health + dt * 25);
    this.landDip = Math.max(0, this.landDip - dt * 1.5);
    const targetRoll = -s * 0.025 + (this.skating ? -s * 0.04 : 0);
    this.camRoll += (targetRoll - this.camRoll) * Math.min(1, dt * 6);
  }

  applyCamera(cam, t) {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const bob = this.onGround && !this.skating ? Math.sin(t * 13) * 0.045 * Math.min(1, speed / 8) : 0;
    cam.position.set(this.pos.x, this.pos.y + this.eye + bob - this.landDip, this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, this.camRoll, 'YXZ');
  }
}
