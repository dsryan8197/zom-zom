import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { worldMat } from './textures.js';
import { PropLayer } from './models.js';
import { addLandmarks } from './landmarks.js';

// Builds the whole town out of boxes: render geometry is merged per material,
// and every solid box is also registered with the physics world.

const T = 0.4; // wall thickness
const FH = 4; // floor height

let seed = 99;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

class Builder {
  constructor(physics) {
    this.physics = physics;
    this.groups = new Map(); // material -> geometries
    this.props = new PropLayer();
  }

  // A solid box rendered with a GLB model fitted into it (falls back to a textured box).
  prop(model, x0, y0, z0, x1, y1, z1, mat, opts = {}) {
    if (!this.props.place(model, x0, y0, z0, x1, y1, z1, opts)) return this.box(x0, y0, z0, x1, y1, z1, mat, opts);
    if (opts.collide === false) return null;
    return this.physics.addBox(x0, y0, z0, x1, y1, z1, { walkable: !!opts.walkable, noGround: !!opts.noGround });
  }

  box(x0, y0, z0, x1, y1, z1, mat, opts = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    if (w <= 0.001 || h <= 0.001 || d <= 0.001) return null;
    if (mat) {
      const material = typeof mat === 'string' ? worldMat(mat) : mat;
      const g = new THREE.BoxGeometry(w, h, d);
      const s = material.userData.scale || 3;
      const uv = g.attributes.uv;
      // Faces: +x, -x, +y, -y, +z, -z (4 verts each). Scale UVs to world units.
      const dims = [[d, h, z0, y0], [d, h, z0, y0], [w, d, x0, z0], [w, d, x0, z0], [w, h, x0, y0], [w, h, x0, y0]];
      for (let f = 0; f < 6; f++) {
        const [uw, vh, uo, vo] = dims[f];
        for (let v = 0; v < 4; v++) {
          const i = f * 4 + v;
          uv.setXY(i, (uv.getX(i) * uw + uo) / s, (uv.getY(i) * vh + vo) / s);
        }
      }
      g.translate(x0 + w / 2, y0 + h / 2, z0 + d / 2);
      if (!this.groups.has(material)) this.groups.set(material, []);
      this.groups.get(material).push(g);
    }
    if (opts.collide !== false) {
      return this.physics.addBox(x0, y0, z0, x1, y1, z1, { walkable: !!opts.walkable, noGround: !!opts.noGround });
    }
    return null;
  }

  finish(scene) {
    for (const [mat, geos] of this.groups) {
      const merged = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !mat.userData.noShadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      geos.forEach((g) => g.dispose());
    }
    this.props.finish(scene);
  }
}

// A wall running along `axis` ('x' or 'z') at fixed coordinate range [f0,f1] on the other axis,
// spanning [a0,a1] along the axis and [y0,y1] vertically, with rectangular openings.
function wall(B, axis, f0, f1, a0, a1, y0, y1, mat, openings = []) {
  const ops = openings.filter((o) => o.a1 > a0 && o.a0 < a1).sort((p, q) => p.a0 - q.a0);
  const put = (s0, s1, yy0, yy1) => {
    if (axis === 'x') B.box(s0, yy0, f0, s1, yy1, f1, mat);
    else B.box(f0, yy0, s0, f1, yy1, s1, mat);
  };
  let cur = a0;
  for (const o of ops) {
    const oa0 = Math.max(o.a0, a0), oa1 = Math.min(o.a1, a1);
    put(cur, oa0, y0, y1);
    put(oa0, oa1, y0, Math.max(y0, o.y0));
    put(oa0, oa1, Math.min(y1, o.y1), y1);
    cur = oa1;
  }
  put(cur, a1, y0, y1);
}

// Floor slab with an optional rectangular hole.
function slab(B, x0, z0, x1, z1, y0, y1, mat, hole) {
  if (!hole) { B.box(x0, y0, z0, x1, y1, z1, mat); return; }
  B.box(x0, y0, z0, x1, y1, hole.z0, mat);
  B.box(x0, y0, hole.z1, x1, y1, z1, mat);
  B.box(x0, y0, hole.z0, hole.x0, y1, hole.z1, mat);
  B.box(hole.x1, y0, hole.z0, x1, y1, hole.z1, mat);
}

export function buildTown(scene, physics) {
  const B = new Builder(physics);
  const town = {
    buildings: [], pois: [], ammoSpots: [], gunSpots: [], specialSpots: [], ladders: [], ziplines: [],
    lamps: [], explosives: [], benches: [], emitters: [],
  };

  // ---------- Ground & roads ----------
  const groundMat = worldMat('grass');
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
  ground.geometry.attributes.uv.array.forEach((v, i, a) => (a[i] = v * 100));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const flat = (x0, z0, x1, z1, mat, y = 0.02) => B.box(x0, -0.2, z0, x1, y, z1, mat, { collide: false });
  // Main street (N-S) and Cross street (E-W)
  flat(-6, -175, 6, 175, 'asphalt', 0.03);
  flat(-175, -6, 175, 6, 'asphalt', 0.035);
  flat(-0.15, -175, 0.15, 175, worldMat('plaster', { color: 0xc9a63a }), 0.04);
  flat(-175, -0.15, 175, 0.15, worldMat('plaster', { color: 0xc9a63a }), 0.045);
  // sidewalks
  flat(-9, -175, -6, 175, 'sidewalk', 0.06); flat(6, -175, 9, 175, 'sidewalk', 0.06);
  flat(-175, -9, 175, -6, 'sidewalk', 0.065); flat(-175, 6, 175, 9, 'sidewalk', 0.065);
  // dirt road to the farm
  flat(-80, -110, -72, -6, 'dirt', 0.025);
  flat(-160, -114, -72, -106, 'dirt', 0.028);
  // gas station lot, warehouse lot, church yard
  flat(-24, 96, 34, 134, 'asphalt', 0.04);
  flat(54, -46, 112, 22, 'darkConcrete', 0.04);
  flat(-160, -100, -90, -56, 'field', 0.03);

  // ---------- Building generator ----------
  function building(o) {
    const { x0, z0, w, d, floors } = o;
    const fh = o.fh || FH;
    const x1 = x0 + w, z1 = z0 + d;
    const wallMat = o.wall, inMat = o.inner || o.wall, floorMat = o.floor || 'wood';
    const roofAccess = o.roofAccess;
    const info = { name: o.name, x0, z0, x1, z1, floors, fh, flights: [], roofY: floors * fh, roofAccess };
    // stairwell lanes along the north wall
    const xs = x0 + T + 2.0, L = 6;
    const laneA = [z0 + T, z0 + T + 2], laneB = [z0 + T + 2, z0 + T + 4];
    const nFlights = floors - 1 + (roofAccess ? 1 : 0);

    for (let k = 0; k < floors; k++) {
      const fy = k * fh;
      // floor
      if (k === 0) B.box(x0 + T, 0, z0 + T, x1 - T, 0.05, z1 - T, floorMat, { collide: false });
      const winOps = (len, a0, skipDoors) => {
        const ops = [];
        const n = Math.floor(len / 5);
        for (let i = 0; i < n; i++) {
          const c = a0 + (i + 0.5) * (len / n);
          ops.push({ a0: c - 0.9, a1: c + 0.9, y0: fy + 1.2, y1: fy + 2.7 });
        }
        return ops.filter((op) => !skipDoors.some((dd) => op.a1 > dd.a0 - 0.5 && op.a0 < dd.a1 + 0.5));
      };
      const doorOps = (side) => (k === 0 ? (o.doors || []).filter((dd) => dd.side === side).map((dd) => {
        const base = side === 'n' || side === 's' ? x0 : z0;
        const dw = dd.w || 3;
        return { a0: base + dd.at - dw / 2, a1: base + dd.at + dw / 2, y0: 0, y1: dd.h || 3.2 };
      }) : []);
      const sides = {
        n: { axis: 'x', f: [z0, z0 + T], a: [x0, x1] },
        s: { axis: 'x', f: [z1 - T, z1], a: [x0, x1] },
        w: { axis: 'z', f: [x0, x0 + T], a: [z0 + T, z1 - T] },
        e: { axis: 'z', f: [x1 - T, x1], a: [z0 + T, z1 - T] },
      };
      for (const [side, sdef] of Object.entries(sides)) {
        const doors = doorOps(side);
        let wins = o.windows === false ? [] : winOps(sdef.a[1] - sdef.a[0], sdef.a[0], doors);
        if (side === 'n') wins = wins.filter((op) => op.a0 > xs + L + 1 || k === floors); // keep stair wall solid
        wall(B, sdef.axis, sdef.f[0], sdef.f[1], sdef.a[0], sdef.a[1], fy, fy + fh, wallMat, [...doors, ...wins]);
      }
      // slab above this floor (ceiling / next floor), with stairwell hole if a flight leads up
      const hasFlight = k < nFlights;
      const lane = k % 2 === 0 ? laneA : laneB;
      const hole = hasFlight ? { x0: xs - 0.2, x1: xs + L + 0.2, z0: lane[0], z1: lane[1] } : null;
      const top = k === floors - 1;
      slab(B, x0, z0, x1, z1, fy + fh - 0.3, fy + fh, top ? (o.roof || 'flatRoof') : floorMat, hole);

      // stairs
      if (hasFlight) {
        const up = k % 2 === 0;
        const steps = 10, run = L / steps, rise = fh / steps;
        for (let i = 1; i <= steps; i++) {
          const sx0 = up ? xs + (i - 1) * run : xs + L - i * run;
          B.box(sx0, fy, lane[0], sx0 + run, fy + i * rise, lane[1], 'darkConcrete', { walkable: true });
        }
        const zc = (lane[0] + lane[1]) / 2;
        info.flights.push({
          k,
          bottom: { x: up ? xs - 1.0 : xs + L + 0.9, z: zc },
          top: { x: up ? xs + L + 0.8 : xs - 0.8, z: zc },
        });
      }

      // interior props + spawn spots (keep the stair band and door lanes clear)
      const iz0 = z0 + T + 5, iz1 = z1 - T - 1.5, ix0 = x0 + T + 1.5, ix1 = x1 - T - 1.5;
      if (iz1 - iz0 > 3 && ix1 - ix0 > 3) {
        const nProps = 2 + Math.floor(rnd() * 3);
        for (let p = 0; p < nProps; p++) {
          const px = ix0 + rnd() * (ix1 - ix0 - 2), pz = iz0 + rnd() * (iz1 - iz0 - 2);
          const kind = rnd();
          const special = o.props && rnd() < 0.7 ? pick(o.props) : null;
          if (special === 'desk') B.prop('desk', px, fy, pz, px + 1.6, fy + 0.8, pz + 0.8, 'metal', { rotY: rnd() < 0.5 ? 0 : Math.PI });
          else if (special === 'plasticCrate') { for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) B.prop('plasticCrate', px, fy + k * 0.32, pz, px + 0.6, fy + (k + 1) * 0.32, pz + 0.42, 'crate'); }
          else if (special === 'milCrate') B.prop('milCrate', px, fy, pz, px + 1.2, fy + 0.6, pz + 0.6, 'crate');
          else if (special === 'medBox') B.prop('medBox', px, fy, pz, px + 0.6, fy + 0.35, pz + 0.4, 'crate', { collide: false });
          else if (special === 'wetSign') B.prop('wetSign', px, fy, pz, px + 0.45, fy + 0.65, pz + 0.3, null, { collide: false });
          else if (special === 'jerrycan') B.prop('jerrycan', px, fy, pz, px + 0.45, fy + 0.5, pz + 0.2, null, { collide: false });
          else if (kind < 0.4) B.prop('crate', px, fy, pz, px + 1.2, fy + 1.2, pz + 1.2, 'crate');
          else if (kind < 0.7) { // table: model for looks, a thin top slab for collision
            if (B.props.place('table', px, fy, pz, px + 2.2, fy + 1.0, pz + 1.2)) B.box(px, fy + 0.85, pz, px + 2.2, fy + 1.0, pz + 1.2, null);
            else {
              B.box(px, fy + 0.85, pz, px + 2.2, fy + 1.0, pz + 1.2, 'wood');
              B.box(px + 0.1, fy, pz + 0.1, px + 0.3, fy + 0.85, pz + 0.3, 'wood', { collide: false });
              B.box(px + 1.9, fy, pz + 0.9, px + 2.1, fy + 0.85, pz + 1.1, 'wood', { collide: false });
            }
          } else B.prop('rack', px, fy, pz, px + 0.6, fy + 2.2, pz + 2.4, 'metal', { rotY: Math.PI / 2 }); // shelf
        }
        const cx = (ix0 + ix1) / 2, cz = (iz0 + iz1) / 2;
        town.gunSpots.push({ x: cx + (rnd() - 0.5) * 3, y: fy, z: cz + (rnd() - 0.5) * 3 });
        town.ammoSpots.push({ x: ix0 + 0.5, y: fy, z: iz1 - 0.5 });
        if (k > 0 || rnd() < 0.5) town.specialSpots.push({ x: ix1 - 0.5, y: fy, z: iz0 + 0.5 });
      }
    }
    // roof parapet
    const ry = floors * fh;
    const ph = o.parapet ?? 1.0;
    if (ph > 0) {
      B.box(x0, ry, z0, x1, ry + ph, z0 + 0.3, wallMat);
      B.box(x0, ry, z1 - 0.3, x1, ry + ph, z1, wallMat);
      B.box(x0, ry, z0 + 0.3, x0 + 0.3, ry + ph, z1 - 0.3, wallMat);
      B.box(x1 - 0.3, ry, z0 + 0.3, x1, ry + ph, z1 - 0.3, wallMat);
    }
    if (roofAccess) {
      town.ammoSpots.push({ x: x1 - 2, y: ry, z: z1 - 2 });
      town.gunSpots.push({ x: (x0 + x1) / 2, y: ry, z: (z0 + z1) / 2 + 3 });
    }
    // trim band under each floor line for visual interest
    for (let k = 1; k <= floors; k++) {
      B.box(x0 - 0.15, k * fh - 0.35, z0 - 0.15, x1 + 0.15, k * fh - 0.05, z1 + 0.15, 'darkConcrete', { collide: false });
    }
    town.buildings.push(info);
    return info;
  }

  // ---------- Buildings ----------
  const tower = building({ name: 'Apartments', x0: 14, z0: -48, w: 22, d: 22, floors: 5, wall: 'brick', floor: 'wood', roofAccess: true, props: ['plasticCrate', 'medBox'],
    doors: [{ side: 'w', at: 15 }, { side: 's', at: 11 }] });
  const clinic = building({ name: 'Clinic', x0: 14, z0: 16, w: 30, d: 24, floors: 3, wall: 'whiteTile', floor: 'tiles', roofAccess: true, props: ['medBox', 'wetSign', 'desk', 'medBox'],
    doors: [{ side: 'w', at: 12, w: 4 }, { side: 'e', at: 12 }, { side: 'n', at: 20 }] });
  building({ name: 'General Store', x0: -38, z0: -42, w: 24, d: 24, floors: 2, wall: 'yellowSiding', floor: 'wood', roofAccess: true, props: ['plasticCrate', 'jerrycan', 'plasticCrate'],
    doors: [{ side: 'e', at: 14, w: 4 }, { side: 's', at: 6 }] });
  const diner = building({ name: 'Diner', x0: -36, z0: 14, w: 22, d: 16, floors: 1, wall: 'plaster', floor: 'tiles', roof: 'redMetal',
    doors: [{ side: 'e', at: 8, w: 3.4 }, { side: 'w', at: 8 }] });
  building({ name: 'Police Station', x0: -38, z0: -84, w: 24, d: 26, floors: 2, wall: 'darkConcrete', floor: 'tiles', roofAccess: true, props: ['desk', 'desk', 'milCrate'],
    doors: [{ side: 'e', at: 13, w: 3.4 }, { side: 'n', at: 12 }] });
  const church = building({ name: 'Church', x0: -62, z0: 36, w: 18, d: 34, floors: 1, fh: 8, wall: 'brick', floor: 'wood', roof: 'roof',
    doors: [{ side: 'n', at: 9, w: 3.4, h: 4.5 }, { side: 'e', at: 26 }], parapet: 0.6 });
  // steeple
  B.box(-57, 8, 36, -49, 18, 42, 'brick');
  B.box(-56, 18, 37, -50, 22, 41, 'roof');
  B.box(-53.4, 22, 38.6, -52.6, 26, 39.4, 'metal');
  B.box(-55, 24, 38.6, -51, 24.8, 39.4, 'metal');
  const warehouse = building({ name: 'Warehouse', x0: 60, z0: -40, w: 40, d: 34, floors: 1, fh: 9, wall: 'corrugated', floor: 'darkConcrete', roof: 'corrugated',
    doors: [{ side: 'w', at: 17, w: 7, h: 6 }, { side: 's', at: 10 }, { side: 'n', at: 30, w: 6, h: 6 }], parapet: 0.5 });
  // warehouse crate stacks
  for (let i = 0; i < 9; i++) {
    const cx = 66 + rnd() * 26, cz = -30 + rnd() * 20, hgt = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < hgt; k++) B.prop('crate', cx, k * 1.4, cz, cx + 2, (k + 1) * 1.4, cz + 2, 'crate', { rotY: rnd() < 0.5 ? 0 : Math.PI / 2 });
  }
  // gas station store
  building({ name: 'Gas Mart', x0: 16, z0: 104, w: 14, d: 16, floors: 1, wall: 'siding', floor: 'tiles', roof: 'roof',
    doors: [{ side: 'w', at: 8, w: 3 }] });
  // houses
  building({ name: 'House', x0: 60, z0: 48, w: 14, d: 12, floors: 2, wall: 'siding', floor: 'wood', doors: [{ side: 'w', at: 6 }, { side: 's', at: 7 }] });
  building({ name: 'House', x0: 84, z0: 48, w: 14, d: 12, floors: 1, wall: 'yellowSiding', floor: 'wood', doors: [{ side: 'w', at: 6 }, { side: 'n', at: 7 }] });
  building({ name: 'House', x0: 60, z0: 78, w: 14, d: 12, floors: 1, wall: 'plaster', floor: 'wood', doors: [{ side: 'n', at: 7 }, { side: 'e', at: 6 }] });
  building({ name: 'House', x0: -100, z0: 20, w: 14, d: 12, floors: 2, wall: 'siding', floor: 'wood', doors: [{ side: 'e', at: 6 }, { side: 'n', at: 4 }] });
  // pitched roofs (stepped blocks) on the 1-floor houses
  const pitched = (x0, z0, w, d, y, mat) => {
    for (let i = 0; i < 4; i++) B.box(x0 - 0.5 + i * 0.9, y + i * 0.7, z0 - 0.5, x0 + w + 0.5 - i * 0.9, y + (i + 1) * 0.7, z0 + d + 0.5, mat);
  };
  pitched(84, 48, 14, 12, 4, 'roof');
  pitched(60, 78, 14, 12, 4, 'roof');

  // ---------- Farm ----------
  building({ name: 'Farmhouse', x0: -148, z0: -138, w: 16, d: 14, floors: 2, wall: 'plaster', floor: 'wood', roofAccess: true,
    doors: [{ side: 'e', at: 7 }, { side: 's', at: 8 }] });
  const barn = building({ name: 'Barn', x0: -122, z0: -160, w: 26, d: 30, floors: 1, fh: 9, wall: 'barnWood', floor: 'dirt', roof: 'redMetal',
    doors: [{ side: 's', at: 13, w: 7, h: 6 }, { side: 'e', at: 22 }], windows: false, parapet: 0.6 });
  // hayloft
  B.box(-121.6, 4.5, -159.6, -96.4, 4.8, -148, 'wood');
  for (let i = 0; i < 6; i++) B.box(-118 + i * 3.6, 4.8, -158, -116 + i * 3.6, 6, -156.5, 'hay');
  for (let i = 0; i < 8; i++) { const hx = -118 + rnd() * 18, hz = -144 + rnd() * 10; B.box(hx, 0, hz, hx + 2, 1.2, hz + 1.4, 'hay'); }
  town.ladders.push({ x0: -110.5, z0: -147.8, x1: -109.5, z1: -147.2, y0: 0, y1: 5.2 });
  B.box(-110.5, 0, -147.6, -109.5, 4.8, -147.4, 'wood', { collide: false });
  town.gunSpots.push({ x: -108, y: 4.8, z: -153 });
  // silo
  B.box(-90, 0, -158, -82, 16, -150, 'metal');
  B.box(-89, 16, -157, -83, 17.5, -151, 'metal');
  // crops (visual only, low)
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 6; c++) {
      const cx = -158 + c * 11.5, cz = -98 + r * 3.5;
      B.box(cx, 0, cz, cx + 9, 0.7 + rnd() * 0.5, cz + 0.8, worldMat('leaves', { color: 0xa8b860 }), { collide: false });
    }
  }
  // fences around farm
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 2.5);
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      B.box(px - 0.12, 0, pz - 0.12, px + 0.12, 1.3, pz + 0.12, 'wood');
    }
    if (x0 === x1) { B.box(x0 - 0.05, 0.6, Math.min(z0, z1), x0 + 0.05, 0.8, Math.max(z0, z1), 'wood', { collide: false }); B.box(x0 - 0.05, 1.0, Math.min(z0, z1), x0 + 0.05, 1.15, Math.max(z0, z1), 'wood', { collide: false }); }
    else { B.box(Math.min(x0, x1), 0.6, z0 - 0.05, Math.max(x0, x1), 0.8, z0 + 0.05, 'wood', { collide: false }); B.box(Math.min(x0, x1), 1.0, z0 - 0.05, Math.max(x0, x1), 1.15, z0 + 0.05, 'wood', { collide: false }); }
  };
  fence(-162, -102, -90, -102); fence(-162, -54, -96, -54); fence(-162, -102, -162, -54);

  // ---------- Gas station ----------
  B.box(-12, 5, 100, 12, 5.6, 124, 'redMetal', { noGround: false });
  B.box(-12, 5.6, 100, 12, 6.0, 100.3, 'redMetal'); B.box(-12, 5.6, 123.7, 12, 6.0, 124, 'redMetal');
  for (const [px, pz] of [[-9, 103], [9, 103], [-9, 121], [9, 121]]) B.box(px - 0.4, 0, pz - 0.4, px + 0.4, 5, pz + 0.4, 'metal');
  for (const [px, pz] of [[-5, 108], [5, 108], [-5, 116], [5, 116]]) {
    B.box(px - 0.6, 0, pz - 1.2, px + 0.6, 0.3, pz + 1.2, 'darkConcrete');
    B.box(px - 0.4, 0.3, pz - 0.5, px + 0.4, 2.0, pz + 0.5, worldMat('redMetal', { color: 0xdddddd }));
  }
  B.prop('trash', -22, 0, 126, -20.8, 1.1, 127.2, 'redMetal'); // bins behind the gas mart
  B.prop('trash', -20.6, 0, 126, -19.4, 1.1, 127.2, 'redMetal');
  B.prop('utility', 30.2, 0, 112, 31.2, 1.6, 113.2, 'metal', { rotY: Math.PI / 2 });
  // sign
  B.box(-20.3, 0, 100, -19.7, 9, 100.6, 'metal');
  B.box(-22, 9, 99.8, -18, 11.5, 100.8, worldMat('plaster', { color: 0xd04020, emissive: 0x401000 }));
  town.ladders.push({ x0: 8.5, z0: 124.1, x1: 9.5, z1: 124.6, y0: 0, y1: 6.3 });
  B.box(8.5, 0, 124.1, 9.5, 6.0, 124.2, 'metal', { collide: false });

  // ---------- Water tower ----------
  const wtx = 48, wtz = 124;
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) B.box(wtx + dx - 0.35, 0, wtz + dz - 0.35, wtx + dx + 0.35, 13, wtz + dz + 0.35, 'metal');
  B.box(wtx - 4.5, 13, wtz - 4.5, wtx + 4.5, 13.4, wtz + 4.5, 'metal');
  B.box(wtx - 3.5, 13.4, wtz - 3.5, wtx + 3.5, 19, wtz + 3.5, worldMat('metal', { color: 0xb0c4cc }));
  B.box(wtx - 3, 19, wtz - 3, wtx + 3, 20, wtz + 3, 'metal');
  B.box(wtx - 4.5, 13.4, wtz - 4.5, wtx + 4.5, 14.3, wtz - 4.4, 'metal', { collide: false });
  town.ladders.push({ x0: wtx + 2.6, z0: wtz + 4.6, x1: wtx + 3.6, z1: wtz + 5.2, y0: 0, y1: 13.7 });
  B.box(wtx + 2.6, 0, wtz + 4.6, wtx + 3.6, 13.4, wtz + 4.7, 'metal', { collide: false });
  town.gunSpots.push({ x: wtx, y: 13.4, z: wtz - 4 });

  // ladders onto roofs
  town.ladders.push({ x0: -24.5, z0: 30, x1: -23.5, z1: 30.6, y0: 0, y1: 5.3 }); // diner back
  B.box(-24.5, 0, 30, -23.5, 5.0, 30.1, 'metal', { collide: false });
  town.ladders.push({ x0: 100, z0: -20.5, x1: 100.6, z1: -19.5, y0: 0, y1: 9.8 }); // warehouse
  B.box(100, 0, -20.5, 100.1, 9.2, -19.5, 'metal', { collide: false });

  // ---------- Town square statue ----------
  B.box(-2.5, 0, -2.5, 2.5, 1, 2.5, 'concrete');
  B.box(-1, 1, -1, 1, 4, 1, 'darkConcrete');
  B.box(-0.6, 4, -0.6, 0.6, 5.2, 0.6, 'metal');

  // ---------- Props: cars, barrels, trees, lamps ----------
  const carColors = [0x6a2a24, 0x2b3d52, 0x4d4d48, 0x6b6a3a, 0x30442f, 0x8a8a84];
  const carModels = ['sedan', 'police', 'van', 'suv', 'truck', 'taxi', 'hatchback', 'delivery', 'ambulance', 'coveredCar', 'sedan', 'suv'];
  const car = (x, z, alongZ, color) => {
    const model = pick(carModels);
    const [w, l] = alongZ ? [2.0, 4.4] : [4.4, 2.0];
    // collision is the same body + cabin boxes as before; the model just has to fit inside them
    if (B.props.place(model, x - w / 2, 0, z - l / 2, x + w / 2, 2.0, z + l / 2, { rotY: (alongZ ? 0 : Math.PI / 2) + (rnd() < 0.5 ? Math.PI : 0), fit: 'uniform' })) {
      const [cw, cl] = alongZ ? [1.8, 2.4] : [2.4, 1.8];
      B.box(x - w / 2, 0.3, z - l / 2, x + w / 2, 1.2, z + l / 2, null);
      B.box(x - cw / 2, 1.2, z - cl / 2, x + cw / 2, 1.95, z + cl / 2, null);
      return;
    }
    const m = worldMat('metal', { color });
    B.box(x - w / 2, 0.3, z - l / 2, x + w / 2, 1.2, z + l / 2, m);
    const [cw, cl] = alongZ ? [1.8, 2.4] : [2.4, 1.8];
    B.box(x - cw / 2, 1.2, z - cl / 2, x + cw / 2, 1.95, z + cl / 2, worldMat('window'));
    B.box(x - w / 2 + 0.1, 0, z - l / 2 + 0.3, x + w / 2 - 0.1, 0.5, z + l / 2 - 0.3, worldMat('darkConcrete', { color: 0x222222 }), { collide: false });
  };
  const carSpots = [[-3, -60, true], [3, 40, true], [-3, 75, true], [3, -110, true], [30, -3, false], [-50, 3, false], [110, -3, false],
    [62, -44, false], [70, -44, false], [86, -44, false], [-16, 110, true], [26, 128, false], [-120, -110, false], [-80, 3, false], [3, 150, true]];
  for (const [x, z, a] of carSpots) car(x, z, a, pick(carColors));
  // school bus blocking part of main street
  B.box(-4.5, 0.4, -140, -1.5, 3.2, -128, worldMat('yellowSiding', { color: 0xffcc40 }));
  addLandmarks(B, town, physics, scene, rnd);

  // barrels & barricades (the red ones explode when shot)
  for (let i = 0; i < 26; i++) {
    const bx = (rnd() - 0.5) * 300, bz = (rnd() - 0.5) * 300;
    if (Math.abs(bx) < 10 || Math.abs(bz) < 10) continue;
    if (physics.overlaps(bx - 1, 0.1, bz - 1, bx + 1, 2, bz + 1)) continue;
    const r = rnd();
    if (r < 0.4) {
      const handle = B.props.place('barrel', bx - 0.45, 0, bz - 0.45, bx + 0.45, 1.2, bz + 0.45, { rotY: rnd() * 6.28 });
      const box = handle ? physics.addBox(bx - 0.45, 0, bz - 0.45, bx + 0.45, 1.2, bz + 0.45) : B.box(bx - 0.45, 0, bz - 0.45, bx + 0.45, 1.2, bz + 0.45, 'redMetal');
      const ex = { box, handle: handle || null, pos: new THREE.Vector3(bx, 0.6, bz) };
      box.explosive = ex; town.explosives.push(ex);
    } else if (r < 0.7) B.prop('barrel2', bx - 0.45, 0, bz - 0.45, bx + 0.45, 1.2, bz + 0.45, 'metal', { rotY: rnd() * 6.28 });
    else B.prop('trash', bx - 0.4, 0, bz - 0.4, bx + 0.4, 1.0, bz + 0.4, 'metal', { rotY: rnd() * 6.28 });
  }
  for (const [x0, z0, x1, z1] of [[-6, 60, -2, 60.8], [2, -80, 6, -79.2], [40, -6, 40.8, -2], [-120, 2, -119.2, 6]]) {
    B.box(x0, 0, z0, x1, 1.1, z1, worldMat('concrete', { color: 0xcfcfc4 }));
  }
  // lamp posts along main street
  for (let z = -160; z <= 160; z += 32) {
    for (const x of [-7.5, 7.5]) {
      B.box(x - 0.15, 0, z - 0.15, x + 0.15, 7, z + 0.15, 'metal');
      B.box(x - 0.4, 7, z - 0.4, x + 0.4, 7.3, z + 0.4, worldMat('plaster', { color: 0xfff0c0, emissive: 0xffd890, emissiveIntensity: 2 }), { collide: false });
      town.lamps.push(new THREE.Vector3(x, 7, z));
    }
  }
  // trees
  const tree = (x, z, s = 1) => {
    B.box(x - 0.35 * s, 0, z - 0.35 * s, x + 0.35 * s, 4 * s, z + 0.35 * s, 'bark');
    B.box(x - 2 * s, 3 * s, z - 2 * s, x + 2 * s, 5.5 * s, z + 2 * s, 'leaves', { collide: false });
    B.box(x - 1.3 * s, 5.5 * s, z - 1.3 * s, x + 1.3 * s, 7 * s, z + 1.3 * s, 'leaves', { collide: false });
  };
  for (let i = 0; i < 70; i++) {
    const x = (rnd() - 0.5) * 330, z = (rnd() - 0.5) * 330;
    if (Math.abs(x) < 12 || Math.abs(z) < 12) continue;
    if (physics.overlaps(x - 3, 0, z - 3, x + 3, 6, z + 3)) continue;
    if (x < -88 && x > -164 && z > -104 && z < -52) continue; // fields
    tree(x, z, 0.8 + rnd() * 0.5);
  }
  // dense tree line + boundary wall
  for (let a = -176; a <= 176; a += 9) {
    for (const [x, z] of [[a, -176], [a, 176], [-176, a], [176, a]]) tree(x + (rnd() - 0.5) * 3, z + (rnd() - 0.5) * 3, 1.2 + rnd() * 0.6);
  }
  physics.addBox(-200, 0, -200, 200, 40, -172); physics.addBox(-200, 0, 172, 200, 40, 200);
  physics.addBox(-200, 0, -172, -172, 40, 172); physics.addBox(172, 0, -172, 200, 40, 172);

  // ---------- Ziplines ----------
  const zl = (ax, ay, az, bx, by, bz) => town.ziplines.push({ a: new THREE.Vector3(ax, ay, az), b: new THREE.Vector3(bx, by, bz) });
  zl(34.5, tower.roofY + 2.4, -26.5, 42.5, clinic.roofY + 2.4, 18.5); // tower roof -> clinic roof
  zl(15.5, tower.roofY + 2.4, -46.5, -74, 2.5, -96);               // tower roof -> farm road
  zl(wtx - 3.5, 15.6, wtz - 4.2, 0, 7.9, 112);                     // water tower -> gas canopy
  zl(-15, 10.2, -40.5, -60, 10.2 + 0.1, 36.5 + 0.1);               // store roof -> church roof
  for (const z of town.ziplines) {
    for (const p of [z.a, z.b]) {
      B.box(p.x - 0.15, p.y - 2.4, p.z - 0.15, p.x + 0.15, p.y + 0.3, p.z + 0.15, 'metal', { collide: false });
    }
    const len = z.a.distanceTo(z.b);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    cable.position.copy(z.a).add(z.b).multiplyScalar(0.5);
    cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), z.b.clone().sub(z.a).normalize());
    scene.add(cable);
  }

  // ---------- Points of interest (supply drop sites) ----------
  town.pois.push(...[
    { name: 'Town Square', x: 12, z: 12 },
    { name: 'Gas Station', x: 0, z: 132 },
    { name: 'The Farm', x: -130, z: -110 },
    { name: 'Barn', x: -108, z: -118 },
    { name: 'Church', x: -40, z: 76 },
    { name: 'Warehouse Lot', x: 82, z: 14 },
    { name: 'Water Tower', x: 60, z: 136 },
    { name: 'Apartments', x: 46, z: -52 },
    { name: 'Clinic', x: 30, z: 48 },
    { name: 'Police Station', x: -50, z: -70 },
    { name: 'East Houses', x: 106, z: 70 },
    { name: 'West Fields', x: -130, z: -45 },
    { name: 'North Road', x: 14, z: -150 },
    { name: 'Diner', x: -25, z: 40 },
  ]);

  // outdoor ammo spots scattered around roads
  for (let i = 0; i < 40; i++) {
    const along = (rnd() - 0.5) * 320, side = (rnd() < 0.5 ? -1 : 1) * (8 + rnd() * 8);
    town.ammoSpots.push(rnd() < 0.5 ? { x: side, y: 0, z: along } : { x: along, y: 0, z: side });
  }
  for (const p of town.pois) town.ammoSpots.push({ x: p.x + 3, y: 0, z: p.z - 3 });

  B.finish(scene);
  town.nav = buildNavGrid(physics);
  return town;
}

// 2m grid used for zombie flow-field pathing at ground level.
export const NAV_CELL = 1;
export const NAV_HALF = 176;
export const NAV_N = Math.ceil((NAV_HALF * 2) / NAV_CELL);

function buildNavGrid(physics) {
  const blocked = new Uint8Array(NAV_N * NAV_N);
  const indoor = new Uint8Array(NAV_N * NAV_N);
  for (let z = 0; z < NAV_N; z++) for (let x = 0; x < NAV_N; x++) {
    const wx = -NAV_HALF + x * NAV_CELL, wz = -NAV_HALF + z * NAV_CELL;
    const i = z * NAV_N + x;
    for (const b of physics.query(wx, wz, wx + NAV_CELL, wz + NAV_CELL)) {
      if (!(wx + NAV_CELL - 0.15 > b.minX && wx + 0.15 < b.maxX && wz + NAV_CELL - 0.15 > b.minZ && wz + 0.15 < b.maxZ)) continue;
      if (b.minY < 1.6 && b.maxY > 0.5 && !b.walkable) blocked[i] = 1;
      if (b.minY > 2) indoor[i] = 1;
    }
  }
  return { blocked, indoor };
}
