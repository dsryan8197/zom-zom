import * as THREE from 'three';

// World surfaces use CC0 PBR texture sets from Poly Haven (colour + OpenGL normal + packed
// AO/roughness/metal "ARM" map), on blocky geometry. A few small things (zombie skin, windows,
// leaves) are still painted procedurally for the chunky look.

const loader = new THREE.TextureLoader();
const cache = {};

function finish(tex, pixel = true) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (pixel) tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = 4;
  return tex;
}

let seed = 1337;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function canvasTex(size, paint, pixel = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  paint(g, size);
  return finish(new THREE.CanvasTexture(c), pixel);
}

function noiseFill(g, s, base, vary, px = 1) {
  const [r, gg, b] = base;
  for (let y = 0; y < s; y += px) for (let x = 0; x < s; x += px) {
    const n = (rnd() - 0.5) * vary;
    g.fillStyle = `rgb(${r + n | 0},${gg + n | 0},${b + n | 0})`;
    g.fillRect(x, y, px, px);
  }
}

function grime(g, s, count, color, maxR) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = color;
    g.globalAlpha = 0.05 + rnd() * 0.15;
    const r = 1 + rnd() * maxR;
    g.fillRect(rnd() * s, rnd() * s, r * (0.5 + rnd()), r);
  }
  g.globalAlpha = 1;
}

const painters = {
  concrete: (g, s) => {
    noiseFill(g, s, [128, 126, 120], 18, 2);
    grime(g, s, 160, '#000', 6);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, s - 1, s / 2 - 1); g.strokeRect(0.5, s / 2 + 0.5, s - 1, s / 2 - 1);
  },
  darkConcrete: (g, s) => {
    noiseFill(g, s, [78, 80, 84], 14, 2);
    grime(g, s, 120, '#000', 5);
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.strokeRect(0.5, 0.5, s - 1, s - 1);
  },
  plaster: (g, s) => { noiseFill(g, s, [196, 188, 170], 12, 2); grime(g, s, 100, '#3a2a1a', 7); },
  whiteTile: (g, s) => {
    noiseFill(g, s, [214, 218, 220], 8, 2);
    g.fillStyle = 'rgba(80,90,100,.55)';
    for (let i = 0; i <= s; i += s / 4) { g.fillRect(i, 0, 1, s); g.fillRect(0, i, s, 1); }
    grime(g, s, 40, '#203040', 4);
  },
  asphalt: (g, s) => { noiseFill(g, s, [58, 58, 60], 16, 2); grime(g, s, 60, '#000', 8); },
  road: (g, s) => {
    noiseFill(g, s, [56, 56, 58], 16, 2); grime(g, s, 50, '#000', 8);
    g.fillStyle = '#c9a63a';
    g.fillRect(s / 2 - 2, 0, 4, s * 0.45);
  },
  dirt: (g, s) => { noiseFill(g, s, [112, 88, 60], 26, 4); grime(g, s, 80, '#2a1a0a', 6); },
  field: (g, s) => {
    noiseFill(g, s, [92, 70, 44], 22, 4);
    g.fillStyle = 'rgba(40,25,10,.5)';
    for (let i = 0; i < s; i += 8) g.fillRect(0, i, s, 3);
  },
  metal: (g, s) => {
    noiseFill(g, s, [104, 110, 116], 10, 2);
    g.fillStyle = 'rgba(0,0,0,.3)';
    for (let i = 0; i < s; i += 8) g.fillRect(i, 0, 2, s);
    grime(g, s, 50, '#5a3010', 5);
  },
  redMetal: (g, s) => {
    noiseFill(g, s, [140, 40, 34], 14, 2);
    g.fillStyle = 'rgba(0,0,0,.3)';
    for (let i = 0; i < s; i += 8) g.fillRect(i, 0, 2, s);
    grime(g, s, 60, '#200', 6);
  },
  barnWood: (g, s) => {
    noiseFill(g, s, [128, 40, 32], 18, 2);
    g.fillStyle = 'rgba(0,0,0,.45)';
    for (let i = 0; i < s; i += 8) g.fillRect(i, 0, 1, s);
    grime(g, s, 70, '#100', 6);
  },
  roof: (g, s) => {
    noiseFill(g, s, [60, 52, 50], 14, 2);
    g.fillStyle = 'rgba(0,0,0,.4)';
    for (let i = 0; i < s; i += 6) g.fillRect(0, i, s, 1);
  },
  siding: (g, s) => {
    noiseFill(g, s, [150, 162, 168], 10, 2);
    g.fillStyle = 'rgba(0,0,0,.25)';
    for (let i = 0; i < s; i += 6) g.fillRect(0, i, s, 1);
    grime(g, s, 50, '#203020', 5);
  },
  yellowSiding: (g, s) => {
    noiseFill(g, s, [190, 168, 110], 10, 2);
    g.fillStyle = 'rgba(0,0,0,.25)';
    for (let i = 0; i < s; i += 6) g.fillRect(0, i, s, 1);
    grime(g, s, 60, '#302010', 5);
  },
  hay: (g, s) => { noiseFill(g, s, [196, 164, 80], 40, 2); },
  leaves: (g, s) => { noiseFill(g, s, [52, 74, 40], 30, 4); },
  bark: (g, s) => { noiseFill(g, s, [70, 52, 36], 20, 2); },
  window: (g, s) => {
    g.fillStyle = '#121820'; g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(160,190,210,.15)'; g.fillRect(4, 4, s / 2 - 6, s - 8); g.fillRect(s / 2 + 2, 4, s / 2 - 6, s - 8);
  },
  sidewalk: (g, s) => {
    noiseFill(g, s, [150, 148, 142], 12, 2);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 0, s, 1); g.fillRect(0, 0, 1, s);
    grime(g, s, 40, '#000', 4);
  },
  // Zombie skins: atlas-free, just grimey cloth/skin.
  zSkin: (g, s) => {
    noiseFill(g, s, [210, 204, 186], 22, 2);
    grime(g, s, 60, '#3a3020', 4); // dirt
    for (let i = 0; i < 10; i++) { // dried blood and bruises
      g.fillStyle = `rgba(${70 + rnd() * 50 | 0},${8 + rnd() * 12 | 0},8,${0.35 + rnd() * 0.45})`;
      g.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 8, 2 + rnd() * 6);
    }
  },
  zCloth: (g, s) => {
    noiseFill(g, s, [170, 170, 172], 30, 2);
    g.fillStyle = 'rgba(0,0,0,.12)'; // weave
    for (let i = 0; i < s; i += 4) { g.fillRect(i, 0, 1, s); g.fillRect(0, i, s, 1); }
    grime(g, s, 90, '#20180c', 6);
    for (let i = 0; i < 22; i++) { g.fillStyle = `rgba(${90 + rnd() * 60 | 0},8,8,${0.5 + rnd() * 0.4})`; g.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 9, 1 + rnd() * 5); }
    g.fillStyle = 'rgba(0,0,0,.35)'; // torn holes
    for (let i = 0; i < 6; i++) g.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 3, 2 + rnd() * 3);
  },
};

// Poly Haven texture sets in public/textures/pbr/<id>_{col,nrm,arm}.jpg.
// tint multiplies the colour map; scale = metres per texture repeat (UVs are in world units).
const PBR = {
  concrete: { id: 'concrete_wall_006', scale: 4, tint: 0xd8d4cc },
  darkConcrete: { id: 'concrete_floor_worn_001', scale: 4, tint: 0x8a8c90 },
  plaster: { id: 'worn_plaster_wall', scale: 4, tint: 0xe8e0d0 },
  whiteTile: { id: 'long_white_tiles', scale: 2.5, tint: 0xe4e6e6 },
  tiles: { id: 'worn_tile_floor', scale: 3, tint: 0xd8d8d8 },
  asphalt: { id: 'asphalt_02', scale: 6, tint: 0x9a9a9a },
  road: { id: 'asphalt_02', scale: 6, tint: 0x9a9a9a },
  sidewalk: { id: 'concrete_pavement', scale: 3, tint: 0xc8c4bc },
  dirt: { id: 'dirt_floor', scale: 5, tint: 0x9a8a74 },
  field: { id: 'raked_dirt', scale: 4, tint: 0x8a7a64 },
  grass: { id: 'sparse_grass', scale: 6, tint: 0xa8a090 },
  metal: { id: 'rusty_metal_02', scale: 3, tint: 0x8c9094, metal: 0.6 },
  redMetal: { id: 'rusty_metal_02', scale: 3, tint: 0xa8382c, metal: 0.4 },
  corrugated: { id: 'worn_corrugated_iron', scale: 3, tint: 0xc0c4c8, metal: 0.7 },
  plate: { id: 'metal_plate', scale: 2, tint: 0x9a9a9a, metal: 0.8 },
  siding: { id: 'weathered_plank_siding', scale: 3, tint: 0x9aa8b0 },
  yellowSiding: { id: 'weathered_plank_siding', scale: 3, tint: 0xd8c08a },
  barnWood: { id: 'weathered_plank_siding', scale: 3, tint: 0xa8483a },
  wood: { id: 'weathered_planks', scale: 3, tint: 0xc8b8a8 },
  roof: { id: 'roof_07', scale: 3, tint: 0x9a948e },
  flatRoof: { id: 'asphalt_02', scale: 4, tint: 0x6e6a66 }, // tar
  canvas: { id: 'denim_fabric', scale: 1.5, tint: 0x8a8a6a }, // tents, cots
  bark: { id: 'bark_brown_02', scale: 2, tint: 0xb0a090 },
  hay: { id: 'reed_roof_03', scale: 1.5, tint: 0xe8d090 },
  brick: { id: 'red_bricks_04', scale: 3, tint: 0xd0c4bc },
};

function loadMap(url, srgb) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

const pbrCache = {};
export function pbrMaps(id) {
  if (!pbrCache[id]) {
    const base = `./textures/pbr/${id}`;
    const arm = loadMap(`${base}_arm.jpg`, false);
    pbrCache[id] = { map: loadMap(`${base}_col.jpg`, true), normalMap: loadMap(`${base}_nrm.jpg`, false), aoMap: arm, roughnessMap: arm, metalnessMap: arm };
  }
  return pbrCache[id];
}

export function tex(name) {
  if (!cache[name]) {
    if (['crate'].includes(name) || (window.__TEX?.[name] && !PBR[name])) {
      cache[name] = finish(loader.load(window.__TEX?.[name] || `./textures/${name}.png`), false);
    } else if (PBR[name]) {
      cache[name] = pbrMaps(PBR[name].id).map;
    } else {
      cache[name] = canvasTex(64, painters[name]);
    }
  }
  return cache[name];
}

const matCache = {};
// World materials. `scale` = metres per texture repeat; geometry UVs are generated in world units.
export const MATS = {
  concrete: 4, darkConcrete: 4, plaster: 3, whiteTile: 2, asphalt: 6, road: 12, dirt: 6, field: 4,
  metal: 3, redMetal: 3, barnWood: 3, roof: 3, siding: 3, yellowSiding: 3, hay: 1.2, leaves: 2,
  bark: 1.5, window: 2, sidewalk: 3, brick: 3, wood: 3, crate: 1, grass: 6, tiles: 3,
};

export function worldMat(name, opts = {}) {
  const key = name + JSON.stringify(opts);
  if (!matCache[key]) {
    const def = PBR[name];
    let m;
    if (def) {
      // ARM map: R = ambient occlusion, G = roughness, B = metalness
      m = new THREE.MeshStandardMaterial({
        ...pbrMaps(def.id), color: def.tint, roughness: 1, metalness: def.metal ? 1 : 0,
        normalScale: new THREE.Vector2(1.2, 1.2), aoMapIntensity: 1, ...opts,
      });
      if (!def.metal) m.metalnessMap = null;
      else m.metalness = def.metal;
      m.userData.scale = def.scale;
    } else {
      m = new THREE.MeshStandardMaterial({
        map: tex(name), roughness: 0.92, metalness: name.includes('etal') ? 0.35 : 0.0, ...opts,
      });
      m.userData.scale = MATS[name] || 3;
    }
    matCache[key] = m;
  }
  return matCache[key];
}
