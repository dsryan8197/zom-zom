import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// CC0 GLB props (Poly Haven) and blocky cars (Kenney Car Kit). They are loaded once up front, then
// placed as InstancedMeshes; collision stays box-based, so a model is always fitted to a box.

export const MODEL_FILES = {
  barrel: 'models/Barrel_01.glb',
  crate: 'models/wooden_crate_02.glb',
  rack: 'models/worn_metal_rack.glb',
  table: 'models/WoodenTable_01.glb',
  trash: 'models/metal_trash_can.glb',
  coveredCar: 'models/covered_car.glb',
  utility: 'models/utility_box_01.glb',
  utility2: 'models/utility_box_02.glb',
  ammoBox: 'models/ammo_box.glb',
  sandbag: 'models/cement_bag.glb',
  barrier: 'models/concrete_road_barrier_02.glb',
  milCrate: 'models/old_military_crate.glb',
  jerrycan: 'models/metal_jerrycan_green.glb',
  propane: 'models/propane_tank.glb',
  trashbag: 'models/trashbag.glb',
  bench: 'models/painted_wooden_bench.glb',
  picnic: 'models/wooden_picnic_table.glb',
  generator: 'models/portable_generator.glb',
  plasticCrate: 'models/plastic_crate_02.glb',
  desk: 'models/metal_office_desk.glb',
  wetSign: 'models/WetFloorSign_01.glb',
  medBox: 'models/medical_box.glb',
  firePit: 'models/stone_fire_pit.glb',
  barrel2: 'models/Barrel_02.glb',
  floodlight: 'models/security_light.glb',
  sedan: 'models/cars/sedan.glb',
  police: 'models/cars/police.glb',
  van: 'models/cars/van.glb',
  suv: 'models/cars/suv.glb',
  truck: 'models/cars/truck.glb',
  taxi: 'models/cars/taxi.glb',
  hatchback: 'models/cars/hatchback-sports.glb',
  delivery: 'models/cars/delivery.glb',
  ambulance: 'models/cars/ambulance.glb',
};
const KENNEY = new Set(['sedan', 'police', 'van', 'suv', 'truck', 'taxi', 'hatchback', 'delivery', 'ambulance']);

const models = {}; // name -> { parts: [{ geometry, material }], size: Vector3 }

// Flatten a loaded scene into one merged geometry per material, normalised so the model's
// bounding box is centred on x/z with its base at y=0.
function flatten(name, root) {
  root.updateMatrixWorld(true);
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const mat = mats[0];
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(g.index ? g.toNonIndexed() : g);
  });
  const box = new THREE.Box3();
  const parts = [];
  for (const [mat, geos] of byMat) {
    const g = mergeGeometries(geos, false);
    g.computeBoundingBox(); box.union(g.boundingBox);
    parts.push({ geometry: g, material: tuneMaterial(name, mat) });
  }
  const c = box.getCenter(new THREE.Vector3());
  for (const p of parts) p.geometry.translate(-c.x, -box.min.y, -c.z);
  return { parts, size: box.getSize(new THREE.Vector3()) };
}

function tuneMaterial(name, mat) {
  const m = mat.clone();
  m.side = THREE.FrontSide;
  if (KENNEY.has(name)) {
    // Kenney's flat toy colours, dirtied down to sit in a grim town
    m.color = new THREE.Color(0.62, 0.6, 0.58);
    m.roughness = 0.55; m.metalness = 0.35;
    if (m.map) { m.map.magFilter = THREE.NearestFilter; m.map.colorSpace = THREE.SRGBColorSpace; }
  }
  if (m.map) m.map.anisotropy = 8;
  return m;
}

export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  const names = Object.keys(MODEL_FILES);
  let done = 0;
  await Promise.all(names.map(async (name) => {
    try {
      const gltf = await loader.loadAsync(`./${MODEL_FILES[name]}`);
      models[name] = flatten(name, gltf.scene);
    } catch (e) {
      console.warn(`model ${name} failed to load, falling back to boxes`, e);
    }
    onProgress?.(++done / names.length);
  }));
  return models;
}

export const hasModel = (name) => !!models[name];
export const modelSize = (name) => models[name]?.size;

// A standalone (non-instanced) copy of a model, fitted uniformly inside a box of `size` metres.
export function modelGroup(name, size) {
  const m = models[name];
  if (!m) return null;
  const g = new THREE.Group();
  const k = Math.min(size / m.size.x, size / m.size.y, size / m.size.z);
  for (const part of m.parts) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.castShadow = true; mesh.scale.setScalar(k); mesh.position.y = -m.size.y * k / 2;
    g.add(mesh);
  }
  return g;
}

// Collects placements, then builds one InstancedMesh per model part.
export class PropLayer {
  constructor() { this.items = new Map(); this.meshes = new Map(); }

  // Fit model `name` into the box [x0..x1, y0..y1, z0..z1]. rotY turns the model around its base.
  // fit: 'stretch' scales each axis to the box, 'uniform' keeps proportions (fits inside).
  // tint multiplies the model's colours (e.g. charred wrecks). Returns a handle that can hide() it later.
  place(name, x0, y0, z0, x1, y1, z1, { rotY = 0, fit = 'stretch', tint = null, tilt = 0 } = {}) {
    const m = models[name];
    if (!m) return false;
    const key = tint == null ? name : `${name}|${tint}`;
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const turned = Math.abs(Math.sin(rotY)) > 0.7;
    const sx0 = turned ? m.size.z : m.size.x, sz0 = turned ? m.size.x : m.size.z;
    let sx = w / sx0, sy = h / m.size.y, sz = d / sz0;
    if (fit === 'uniform') sx = sy = sz = Math.min(sx, sy, sz);
    const mat = new THREE.Matrix4().compose(
      new THREE.Vector3((x0 + x1) / 2, y0, (z0 + z1) / 2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, rotY, tilt * 0.5, 'YXZ')),
      turned ? new THREE.Vector3(sz, sy, sx) : new THREE.Vector3(sx, sy, sz),
    );
    if (!this.items.has(key)) this.items.set(key, { name, tint, mats: [] });
    const list = this.items.get(key).mats;
    list.push(mat);
    return { key, index: list.length - 1, layer: this };
  }

  hide(handle) {
    const slot = this.slots.get(handle.key)?.[handle.index];
    if (!slot) return;
    for (const im of slot.meshes) { im.setMatrixAt(slot.i, new THREE.Matrix4().makeScale(0, 0, 0)); im.instanceMatrix.needsUpdate = true; }
  }

  // One InstancedMesh per model part *per 60 m chunk*, so off-screen chunks are culled (and the
  // shadow pass only draws what's near you).
  finish(scene) {
    const CH = 60;
    this.slots = new Map();
    for (const [key, { name, tint, mats }] of this.items) {
      const materials = models[name].parts.map((part) => {
        if (tint == null) return part.material;
        const m = part.material.clone(); m.color.multiply(new THREE.Color(tint)); return m;
      });
      const chunks = new Map();
      const slots = [];
      mats.forEach((m, idx) => {
        const x = m.elements[12], z = m.elements[14];
        const ck = `${Math.floor(x / CH)},${Math.floor(z / CH)}`;
        if (!chunks.has(ck)) chunks.set(ck, []);
        const list = chunks.get(ck);
        slots[idx] = { chunk: ck, i: list.length };
        list.push(m);
      });
      const chunkMeshes = new Map();
      for (const [ck, list] of chunks) {
        const ims = models[name].parts.map((part, pi) => {
          const im = new THREE.InstancedMesh(part.geometry, materials[pi], list.length);
          list.forEach((m, i) => im.setMatrixAt(i, m));
          im.castShadow = true; im.receiveShadow = true;
          im.computeBoundingSphere();
          scene.add(im);
          return im;
        });
        chunkMeshes.set(ck, ims);
      }
      this.slots.set(key, slots.map((sl) => ({ i: sl.i, meshes: chunkMeshes.get(sl.chunk) })));
    }
  }
}
