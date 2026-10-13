import * as THREE from 'three';
import { pbrMaps } from './textures.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Blocky but detailed gun models, built from boxes. A part is
// [w, h, d, x, y, z, material, rx, ry, rz]; guns point down -z with the receiver at the origin.

const M = {};
export function gm() {
  if (M.metal) return M;
  // worn gunmetal: scratched normal + roughness from a Poly Haven metal set
  const rust = pbrMaps('rusty_metal_02'), wood = pbrMaps('weathered_planks');
  const worn = { normalMap: rust.normalMap, roughnessMap: rust.roughnessMap, normalScale: new THREE.Vector2(0.6, 0.6) };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  M.metal = std({ color: 0x45484e, roughness: 0.7, metalness: 0.6, ...worn });
  M.poly = std({ color: 0x2a2c30, roughness: 0.85, metalness: 0.25, ...worn, normalScale: new THREE.Vector2(0.3, 0.3) });
  M.steel = std({ color: 0x80858c, roughness: 0.45, metalness: 0.85, ...worn });
  M.chrome = std({ color: 0xd0d4d8, roughness: 0.2, metalness: 1 });
  M.white = std({ color: 0xd8dde0, roughness: 0.5, metalness: 0.3, ...worn });
  M.rubber = std({ color: 0x151515, roughness: 0.95 });
  M.wood = std({ map: wood.map, normalMap: wood.normalMap, roughnessMap: wood.roughnessMap, color: 0xb07a50, roughness: 1 });
  M.olive = std({ color: 0x4a5236, roughness: 0.9, metalness: 0.15, ...worn });
  M.tan = std({ color: 0x8c7b5a, roughness: 0.9, metalness: 0.1, ...worn });
  M.red = std({ color: 0x9a1a14, roughness: 0.6, metalness: 0.3 });
  M.yellow = std({ color: 0xd8a820, roughness: 0.6 });
  M.teal = std({ color: 0x2a8a8a, roughness: 0.4, metalness: 0.6 });
  M.copper = std({ color: 0xb8683a, roughness: 0.35, metalness: 0.9 });
  M.glass = std({ color: 0x1a2a3a, roughness: 0.05, metalness: 0.9, emissive: 0x081420 });
  M.black = M.poly; M.dark = M.metal; M.gray = M.steel; // older names
  M.dot = glow(0xff2020);
  M.green = glow(0x40ff70);
  M.blue = glow(0x60c8ff);
  M.orange = glow(0xffa040);
  M.purple = glow(0xb060ff);
  M.ice = glow(0x9ae8ff);
  M.lamp = glow(0xfff0d0);
  M.bat = std({ map: wood.map, normalMap: wood.normalMap, color: 0xe0b080, roughness: 0.75 });
  M.tape = std({ color: 0x1a1a1a, roughness: 0.9 });
  M.nail = std({ color: 0x999999, metalness: 0.9, roughness: 0.3 });
  return M;
}

export function build(parts) {
  const g = new THREE.Group();
  for (const [w, h, d, x, y, z, mat, rx = 0, ry = 0, rz = 0] of parts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    g.add(m);
  }
  return g;
}

// ---------- shared bits ----------
const P = (w, h, d, x, y, z, mat, rx = 0, ry = 0, rz = 0) => [w, h, d, x, y, z, mat, rx, ry, rz];

// picatinny rail with teeth
function rail(y, z0, z1, x = 0, w = 0.026) {
  const m = gm(), out = [P(w, 0.008, z1 - z0, x, y, (z0 + z1) / 2, m.poly)];
  for (let z = z0 + 0.01; z < z1; z += 0.022) out.push(P(w + 0.004, 0.006, 0.009, x, y + 0.007, z, m.metal));
  return out;
}

// open red-dot: a frame you look through with a dot floating in the middle (dot at height y)
function redDot(y, z, size = 0.05) {
  const m = gm(), h = size / 2, t = 0.006;
  return [P(t, size, 0.014, -h, y, z, m.poly), P(t, size, 0.014, h, y, z, m.poly), P(size + t, t, 0.014, 0, y + h, z, m.poly),
    P(size + 0.012, 0.014, 0.055, 0, y - h - 0.005, z + 0.01, m.poly), P(0.014, 0.012, 0.02, h + 0.008, y - h + 0.006, z + 0.02, m.metal),
    P(0.006, 0.006, 0.002, 0, y, z - 0.004, m.dot)];
}

// boxy holographic sight with a hood and battery housing
function holo(y, z) {
  const m = gm(), w = 0.064, hh = 0.046;
  return [P(0.006, hh, 0.05, -w / 2, y, z, m.poly), P(0.006, hh, 0.05, w / 2, y, z, m.poly), P(w + 0.006, 0.008, 0.05, 0, y + hh / 2, z, m.poly),
    P(w + 0.01, 0.018, 0.08, 0, y - hh / 2 - 0.006, z + 0.01, m.poly), P(0.03, 0.016, 0.03, 0, y - hh / 2 - 0.004, z + 0.06, m.metal),
    P(0.007, 0.007, 0.002, 0, y, z - 0.02, m.dot), P(0.002, 0.016, 0.002, 0, y + 0.015, z - 0.02, m.dot), P(0.002, 0.016, 0.002, 0, y - 0.015, z - 0.02, m.dot),
    P(0.016, 0.002, 0.002, 0.016, y, z - 0.02, m.dot), P(0.016, 0.002, 0.002, -0.016, y, z - 0.02, m.dot)];
}

// telescopic scope: tube, bells, turrets, rings and a glinting lens
function scope(y, z, len = 0.3) {
  const m = gm();
  return [P(0.036, 0.036, len, 0, y, z, m.poly), P(0.054, 0.054, 0.08, 0, y, z - len / 2, m.poly), P(0.048, 0.048, 0.06, 0, y, z + len / 2, m.poly),
    P(0.048, 0.048, 0.002, 0, y, z - len / 2 - 0.041, m.glass), P(0.02, 0.024, 0.02, 0, y + 0.028, z, m.metal), P(0.024, 0.02, 0.02, 0.028, y, z, m.metal),
    P(0.046, 0.016, 0.014, 0, y - 0.004, z - len * 0.28, m.metal), P(0.046, 0.016, 0.014, 0, y - 0.004, z + len * 0.28, m.metal),
    P(0.012, 0.03, 0.014, 0, y - 0.03, z - len * 0.28, m.metal), P(0.012, 0.03, 0.014, 0, y - 0.03, z + len * 0.28, m.metal)];
}

function grip(y, z, mat, rx = -0.3) {
  const m = gm();
  return [P(0.034, 0.105, 0.046, 0, y, z, mat || m.poly, rx), P(0.036, 0.012, 0.05, 0, y - 0.05, z + 0.015, m.metal, rx)];
}

function guard(y, z, len = 0.06) {
  const m = gm();
  return [P(0.006, 0.006, len, 0, y - 0.03, z, m.metal), P(0.006, 0.03, 0.006, 0, y - 0.015, z - len / 2, m.metal), P(0.004, 0.022, 0.006, 0, y - 0.012, z + 0.004, m.steel, 0.2)];
}

function mag(x, y, z, w, h, d, rx = 0, mat) {
  const m = gm();
  return [P(w, h, d, x, y, z, mat || m.metal, rx), P(w * 1.18, 0.014, d * 1.15, x, y - (h / 2) * Math.cos(rx) - 0.004, z + (h / 2) * Math.sin(rx), m.poly, rx)];
}

function brake(y, z, r = 0.034) {
  const m = gm();
  return [P(r, r, 0.055, 0, y, z, m.metal), P(r + 0.003, 0.009, 0.012, 0, y + r * 0.25, z - 0.008, m.poly), P(r + 0.003, 0.009, 0.012, 0, y + r * 0.25, z + 0.012, m.poly)];
}

// ---------- the guns ----------
const RECIPES = {
  rifle: () => {
    const m = gm();
    return { muzzleZ: -0.68, sightY: 0.078, parts: [
      P(0.05, 0.095, 0.24, 0, -0.03, 0.27, m.wood, -0.12), P(0.052, 0.1, 0.012, 0, -0.045, 0.39, m.metal, -0.12),
      P(0.045, 0.06, 0.1, 0, -0.01, 0.12, m.wood, 0.15), P(0.05, 0.065, 0.22, 0, 0.01, -0.01, m.metal),
      P(0.02, 0.015, 0.08, 0.026, 0.03, -0.02, m.steel), P(0.05, 0.05, 0.36, 0, -0.005, -0.29, m.wood), P(0.036, 0.02, 0.22, 0, 0.03, -0.27, m.wood),
      P(0.022, 0.022, 0.22, 0, 0.018, -0.56, m.steel), P(0.054, 0.056, 0.014, 0, 0, -0.22, m.metal), P(0.054, 0.056, 0.014, 0, 0, -0.46, m.metal),
      P(0.006, 0.032, 0.006, 0, 0.042, -0.64, m.metal), P(0.022, 0.012, 0.008, 0, 0.032, -0.64, m.metal), P(0.03, 0.03, 0.04, 0, 0.0, -0.64, m.metal),
      P(0.03, 0.045, 0.07, 0, -0.05, 0.04, m.metal), P(0.006, 0.02, 0.02, 0, -0.055, -0.4, m.metal),
      ...guard(-0.045, 0.05), ...rail(0.046, -0.09, 0.07), ...redDot(0.078, 0.0)] };
  },
  revolver: () => {
    const m = gm();
    return { muzzleZ: -0.27, sightY: 0.046, parts: [
      P(0.04, 0.12, 0.055, 0, -0.08, 0.075, m.wood, -0.35), P(0.042, 0.015, 0.05, 0, -0.137, 0.097, m.metal, -0.35),
      P(0.045, 0.065, 0.12, 0, 0, 0.0, m.metal), P(0.062, 0.062, 0.07, 0, 0.002, -0.02, m.steel),
      P(0.066, 0.01, 0.05, 0, 0.014, -0.02, m.metal), P(0.066, 0.01, 0.05, 0, -0.01, -0.02, m.metal),
      P(0.028, 0.034, 0.2, 0, 0.014, -0.16, m.steel), P(0.016, 0.016, 0.14, 0, -0.012, -0.13, m.steel), P(0.012, 0.008, 0.2, 0, 0.035, -0.16, m.metal),
      P(0.008, 0.022, 0.012, 0, 0.046, -0.25, m.metal), P(0.004, 0.006, 0.002, 0, 0.056, -0.256, m.dot), P(0.014, 0.03, 0.02, 0, 0.04, 0.06, m.metal, 0.4),
      P(0.02, 0.008, 0.012, 0, 0.04, 0.035, m.metal), ...guard(-0.03, 0.02, 0.05)] };
  },
  smg: () => {
    const m = gm();
    return { muzzleZ: -0.38, sightY: 0.08, parts: [
      P(0.055, 0.085, 0.3, 0, 0, -0.02, m.poly), P(0.05, 0.02, 0.26, 0, 0.05, -0.02, m.metal), P(0.06, 0.06, 0.12, 0, -0.01, -0.2, m.poly),
      P(0.062, 0.008, 0.1, 0, 0.0, -0.2, m.metal), P(0.024, 0.024, 0.1, 0, 0.012, -0.3, m.steel), P(0.032, 0.032, 0.04, 0, 0.012, -0.36, m.metal),
      P(0.03, 0.12, 0.045, 0, -0.11, -0.06, m.metal, 0.15), P(0.03, 0.08, 0.045, 0, -0.2, -0.085, m.metal, 0.35),
      ...grip(-0.08, 0.1), ...guard(-0.045, 0.05), P(0.008, 0.008, 0.18, 0.02, 0.01, 0.22, m.steel), P(0.008, 0.008, 0.18, -0.02, 0.01, 0.22, m.steel),
      P(0.05, 0.08, 0.02, 0, -0.005, 0.31, m.rubber), P(0.01, 0.012, 0.04, -0.03, 0.035, -0.15, m.metal),
      ...rail(0.062, -0.12, 0.08), ...redDot(0.08, 0.0)] };
  },
  ar: () => {
    const m = gm();
    return { muzzleZ: -0.6, sightY: 0.09, parts: [
      P(0.05, 0.06, 0.2, 0, -0.02, 0.0, m.metal), P(0.055, 0.05, 0.22, 0, 0.035, -0.01, m.metal), P(0.002, 0.018, 0.04, 0.028, 0.035, -0.01, m.rubber),
      P(0.06, 0.06, 0.26, 0, 0.02, -0.25, m.poly), P(0.006, 0.02, 0.24, 0.033, 0.02, -0.25, m.metal), P(0.006, 0.02, 0.24, -0.033, 0.02, -0.25, m.metal),
      P(0.03, 0.08, 0.03, 0, -0.04, -0.28, m.poly), P(0.022, 0.022, 0.14, 0, 0.022, -0.45, m.steel), P(0.03, 0.03, 0.025, 0, 0.03, -0.39, m.metal),
      ...brake(0.022, -0.55, 0.03), ...mag(0, -0.11, -0.06, 0.032, 0.14, 0.05, 0.18), ...grip(-0.09, 0.09), ...guard(-0.05, 0.05),
      P(0.03, 0.03, 0.14, 0, 0.02, 0.18, m.metal), P(0.05, 0.08, 0.13, 0, 0.0, 0.28, m.poly), P(0.04, 0.02, 0.1, 0, 0.05, 0.27, m.poly),
      P(0.052, 0.09, 0.012, 0, -0.005, 0.35, m.rubber), P(0.04, 0.012, 0.02, 0, 0.06, 0.1, m.metal),
      P(0.022, 0.022, 0.07, -0.042, 0.02, -0.3, m.poly), P(0.018, 0.018, 0.002, -0.042, 0.02, -0.336, m.lamp),
      ...rail(0.062, -0.37, 0.1), ...holo(0.09, -0.02)] };
  },
  shotgun: () => {
    const m = gm();
    const ridges = [0, 1, 2, 3].map((i) => P(0.064, 0.006, 0.008, 0, -0.015, -0.24 - i * 0.04, m.poly));
    return { muzzleZ: -0.72, sightY: 0.052, parts: [
      P(0.055, 0.09, 0.26, 0, -0.03, 0.28, m.wood, -0.1), P(0.057, 0.1, 0.02, 0, -0.044, 0.41, m.rubber, -0.1),
      P(0.06, 0.075, 0.22, 0, 0, 0, m.metal), P(0.002, 0.02, 0.05, 0.031, 0.01, -0.02, m.rubber),
      P(0.032, 0.032, 0.6, 0, 0.025, -0.42, m.steel), P(0.012, 0.006, 0.58, 0, 0.044, -0.42, m.metal), P(0.008, 0.008, 0.008, 0, 0.051, -0.71, m.chrome),
      P(0.03, 0.03, 0.48, 0, -0.012, -0.36, m.metal), P(0.034, 0.034, 0.02, 0, -0.012, -0.6, m.steel),
      P(0.06, 0.055, 0.17, 0, -0.015, -0.3, m.wood), ...ridges, ...guard(-0.04, 0.05)] };
  },
  autoshotgun: () => {
    const m = gm();
    const vents = [0, 1, 2, 3].map((i) => P(0.052, 0.014, 0.022, 0, 0.015, -0.24 - i * 0.05, m.rubber));
    return { muzzleZ: -0.52, sightY: 0.13, parts: [
      P(0.07, 0.1, 0.44, 0, 0, 0, m.olive), P(0.05, 0.05, 0.24, 0, 0.015, -0.32, m.metal), ...vents, P(0.034, 0.034, 0.06, 0, 0.015, -0.47, m.steel),
      P(0.13, 0.13, 0.08, 0, -0.13, -0.08, m.poly), P(0.04, 0.04, 0.084, 0, -0.13, -0.08, m.metal),
      P(0.02, 0.02, 0.22, 0, 0.09, -0.02, m.poly), P(0.02, 0.04, 0.02, 0, 0.065, -0.11, m.poly), P(0.02, 0.04, 0.02, 0, 0.065, 0.07, m.poly),
      ...grip(-0.09, 0.12), ...guard(-0.05, 0.09), P(0.06, 0.09, 0.2, 0, -0.01, 0.3, m.olive), P(0.062, 0.095, 0.02, 0, -0.01, 0.41, m.rubber),
      ...redDot(0.13, -0.02, 0.046)] };
  },
  lmg: () => {
    const m = gm();
    return { muzzleZ: -0.68, sightY: 0.11, parts: [
      P(0.08, 0.11, 0.4, 0, 0, 0, m.olive), P(0.085, 0.03, 0.14, 0, 0.07, -0.02, m.metal), P(0.12, 0.12, 0.13, 0.07, -0.1, -0.04, m.olive),
      P(0.02, 0.022, 0.06, 0.03, 0.0, -0.04, m.copper), P(0.035, 0.035, 0.42, 0, 0.02, -0.42, m.steel), P(0.045, 0.022, 0.3, 0, 0.045, -0.36, m.metal),
      P(0.012, 0.05, 0.1, -0.045, 0.06, -0.3, m.poly), P(0.01, 0.01, 0.2, 0.03, -0.02, -0.5, m.metal), P(0.01, 0.01, 0.2, -0.03, -0.02, -0.5, m.metal),
      ...brake(0.02, -0.64), ...grip(-0.1, 0.14), ...guard(-0.06, 0.12), P(0.06, 0.1, 0.24, 0, -0.01, 0.34, m.poly), P(0.062, 0.105, 0.02, 0, -0.01, 0.47, m.rubber),
      ...rail(0.088, -0.08, 0.08), ...holo(0.112, 0)] };
  },
  minigun: () => {
    const m = gm();
    const spin = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; spin.push(P(0.022, 0.022, 0.6, Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.35, m.steel)); }
    spin.push(P(0.13, 0.13, 0.025, 0, 0, -0.2, m.poly), P(0.13, 0.13, 0.025, 0, 0, -0.6, m.poly), P(0.03, 0.03, 0.64, 0, 0, -0.35, m.metal));
    return { muzzleZ: -0.68, sightY: 0.16, spin, parts: [
      P(0.14, 0.14, 0.3, 0, 0, 0.05, m.metal), P(0.04, 0.03, 0.18, 0, 0.12, 0.05, m.poly), P(0.02, 0.05, 0.02, 0, 0.09, -0.03, m.poly), P(0.02, 0.05, 0.02, 0, 0.09, 0.13, m.poly),
      P(0.04, 0.12, 0.05, 0, -0.12, 0.12, m.poly), P(0.08, 0.08, 0.1, 0.09, 0, 0.1, m.metal), P(0.04, 0.04, 0.22, -0.09, -0.06, 0.05, m.copper, 0, 0, 0.3),
      P(0.144, 0.02, 0.304, 0, 0.0, 0.05, m.yellow)] };
  },
  rocket: () => {
    const m = gm();
    return { muzzleZ: -0.78, sightY: 0.085, parts: [
      P(0.12, 0.12, 0.95, 0, 0.02, -0.12, m.olive), P(0.15, 0.15, 0.08, 0, 0.02, 0.38, m.metal), P(0.14, 0.14, 0.05, 0, 0.02, -0.6, m.metal),
      P(0.09, 0.09, 0.12, 0, 0.02, -0.66, m.olive), P(0.05, 0.05, 0.06, 0, 0.02, -0.74, m.red), P(0.125, 0.04, 0.3, 0, 0.02, -0.1, m.wood),
      ...grip(-0.09, 0.0), ...grip(-0.09, -0.22), P(0.04, 0.05, 0.12, -0.085, 0.07, -0.1, m.poly), P(0.034, 0.034, 0.002, -0.085, 0.07, -0.161, m.glass),
      P(0.008, 0.03, 0.008, 0, 0.1, -0.45, m.metal), P(0.03, 0.008, 0.008, 0, 0.11, -0.45, m.metal), P(0.006, 0.006, 0.002, 0, 0.085, -0.46, m.dot)] };
  },
  raygun: () => {
    const m = gm();
    return { muzzleZ: -0.34, sightY: 0.065, parts: [
      P(0.07, 0.1, 0.2, 0, 0, 0, m.teal), P(0.05, 0.12, 0.06, 0, -0.1, 0.06, m.metal, -0.3), P(0.04, 0.04, 0.2, 0, 0.01, -0.18, m.chrome),
      P(0.11, 0.11, 0.02, 0, 0.01, -0.12, m.green), P(0.1, 0.1, 0.02, 0, 0.01, -0.2, m.green), P(0.08, 0.08, 0.02, 0, 0.01, -0.26, m.green),
      P(0.08, 0.08, 0.03, 0, 0.01, -0.3, m.red), P(0.03, 0.03, 0.03, 0, 0.01, -0.33, m.green),
      P(0.05, 0.05, 0.07, 0, 0.08, -0.02, m.green), P(0.054, 0.012, 0.074, 0, 0.11, -0.02, m.chrome), P(0.02, 0.02, 0.1, 0, 0.055, 0.08, m.chrome),
      P(0.075, 0.02, 0.05, 0, -0.045, 0.1, m.chrome), ...guard(-0.05, 0.03, 0.05)] };
  },
  tesla: () => {
    const m = gm();
    const coils = [0, 1, 2, 3].map((i) => P(0.09, 0.09, 0.035, 0, 0.01, -0.22 - i * 0.07, m.copper));
    return { muzzleZ: -0.56, sightY: 0.08, parts: [
      P(0.09, 0.11, 0.36, 0, 0, 0, m.metal), ...grip(-0.1, 0.1), ...coils, P(0.03, 0.03, 0.34, 0, 0.01, -0.3, m.steel),
      P(0.08, 0.08, 0.08, 0, 0.01, -0.5, m.blue), P(0.06, 0.06, 0.06, 0, 0.1, 0.05, m.blue), P(0.064, 0.01, 0.064, 0, 0.135, 0.05, m.chrome),
      P(0.01, 0.06, 0.01, 0.03, 0.08, -0.12, m.copper), P(0.01, 0.06, 0.01, -0.03, 0.08, -0.12, m.copper), ...guard(-0.055, 0.04)] };
  },
  // ----- new guns -----
  burst: () => {
    const m = gm();
    return { muzzleZ: -0.4, sightY: 0.135, parts: [
      P(0.06, 0.1, 0.5, 0, 0, 0.05, m.poly), P(0.062, 0.03, 0.2, 0, 0.02, -0.12, m.metal), P(0.02, 0.05, 0.32, 0, 0.08, -0.02, m.poly),
      P(0.02, 0.04, 0.02, 0, 0.06, -0.16, m.poly), P(0.022, 0.022, 0.12, 0, 0.0, -0.26, m.steel), ...brake(0.0, -0.35, 0.028),
      ...mag(0, -0.1, 0.16, 0.03, 0.12, 0.05, 0.12), ...grip(-0.09, -0.06), ...guard(-0.05, -0.08), P(0.05, 0.03, 0.12, 0, 0.06, 0.18, m.poly),
      P(0.062, 0.105, 0.02, 0, -0.005, 0.31, m.rubber), P(0.034, 0.012, 0.06, 0.03, 0.03, 0.02, m.metal), ...redDot(0.135, -0.04, 0.046)] };
  },
  doublebarrel: () => {
    const m = gm();
    return { muzzleZ: -0.72, sightY: 0.048, parts: [
      P(0.055, 0.09, 0.26, 0, -0.035, 0.27, m.wood, -0.14), P(0.057, 0.1, 0.02, 0, -0.052, 0.4, m.rubber, -0.14),
      P(0.06, 0.07, 0.14, 0, -0.01, 0.02, m.metal), P(0.062, 0.04, 0.05, 0, -0.005, -0.075, m.steel),
      P(0.03, 0.03, 0.62, 0.017, 0.02, -0.4, m.steel), P(0.03, 0.03, 0.62, -0.017, 0.02, -0.4, m.steel), P(0.01, 0.008, 0.6, 0, 0.038, -0.4, m.metal),
      P(0.008, 0.008, 0.008, 0, 0.046, -0.7, m.chrome), P(0.064, 0.045, 0.2, 0, -0.012, -0.24, m.wood),
      P(0.01, 0.026, 0.015, 0.02, 0.04, 0.05, m.metal, 0.4), P(0.01, 0.026, 0.015, -0.02, 0.04, 0.05, m.metal, 0.4),
      ...guard(-0.045, 0.05), P(0.004, 0.02, 0.006, 0, -0.06, 0.03, m.steel, 0.2)] };
  },
  sniper: () => {
    const m = gm();
    return { muzzleZ: -0.8, sightY: 0.09, scope: true, parts: [
      P(0.06, 0.07, 0.36, 0, 0, 0, m.tan), P(0.026, 0.026, 0.52, 0, 0.015, -0.46, m.metal), P(0.028, 0.006, 0.4, 0, 0.026, -0.44, m.poly),
      ...brake(0.015, -0.74, 0.042), P(0.06, 0.012, 0.012, 0.04, 0.03, 0.08, m.steel), P(0.022, 0.022, 0.022, 0.072, 0.03, 0.08, m.steel),
      ...mag(0, -0.06, 0.0, 0.04, 0.07, 0.08, 0, m.poly), ...grip(-0.08, 0.12), ...guard(-0.04, 0.1),
      P(0.05, 0.03, 0.24, 0, 0.0, 0.3, m.tan), P(0.05, 0.03, 0.22, 0, -0.07, 0.31, m.tan), P(0.05, 0.12, 0.03, 0, -0.035, 0.43, m.rubber),
      P(0.04, 0.03, 0.1, 0, 0.035, 0.28, m.poly), P(0.01, 0.01, 0.2, 0.03, -0.03, -0.25, m.metal), P(0.01, 0.01, 0.2, -0.03, -0.03, -0.25, m.metal),
      ...rail(0.04, -0.15, 0.1), ...scope(0.09, -0.02, 0.32)] };
  },
  crossbow: () => {
    const m = gm();
    return { muzzleZ: -0.42, sightY: 0.1, parts: [
      P(0.05, 0.07, 0.5, 0, 0, 0.05, m.poly), P(0.03, 0.02, 0.4, 0, 0.04, -0.12, m.metal),
      P(0.27, 0.03, 0.04, 0.13, 0.02, -0.3, m.metal, 0, -0.35, 0), P(0.27, 0.03, 0.04, -0.13, 0.02, -0.3, m.metal, 0, 0.35, 0),
      P(0.004, 0.004, 0.26, 0.11, 0.04, -0.16, m.tan, 0, -1.05, 0), P(0.004, 0.004, 0.26, -0.11, 0.04, -0.16, m.tan, 0, 1.05, 0),
      P(0.012, 0.012, 0.42, 0, 0.055, -0.22, m.steel), P(0.02, 0.02, 0.04, 0, 0.055, -0.44, m.red), P(0.03, 0.002, 0.05, 0, 0.065, -0.03, m.red),
      P(0.06, 0.03, 0.03, 0, 0.0, -0.33, m.metal), P(0.01, 0.06, 0.04, 0, -0.03, -0.36, m.metal),
      ...grip(-0.08, 0.1), ...guard(-0.04, 0.08), P(0.052, 0.1, 0.02, 0, -0.005, 0.31, m.rubber), ...redDot(0.1, 0.02, 0.044)] };
  },
  flamethrower: () => {
    const m = gm();
    return { muzzleZ: -0.52, sightY: 0.075, parts: [
      P(0.07, 0.07, 0.22, 0.04, -0.08, 0.06, m.red), P(0.07, 0.07, 0.22, -0.04, -0.08, 0.06, m.red), P(0.03, 0.03, 0.03, 0.04, -0.08, -0.06, m.metal),
      P(0.03, 0.03, 0.03, -0.04, -0.08, -0.06, m.metal), P(0.06, 0.07, 0.3, 0, 0.01, 0, m.metal), P(0.03, 0.03, 0.3, 0, 0.01, -0.3, m.steel),
      P(0.05, 0.05, 0.04, 0, 0.01, -0.28, m.metal), P(0.05, 0.05, 0.04, 0, 0.01, -0.38, m.metal), P(0.045, 0.045, 0.06, 0, 0.01, -0.48, m.metal),
      P(0.012, 0.012, 0.012, 0, -0.018, -0.51, m.orange), P(0.02, 0.02, 0.2, 0.05, -0.03, -0.12, m.rubber, 0, 0.2, 0),
      ...grip(-0.08, 0.12), ...grip(-0.07, -0.18, m.poly, 0.1), ...guard(-0.045, 0.1), P(0.008, 0.03, 0.008, 0, 0.06, -0.2, m.metal)] };
  },
  launcher: () => {
    const m = gm();
    const holes = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; holes.push(P(0.03, 0.03, 0.142, Math.cos(a) * 0.042, -0.01 + Math.sin(a) * 0.042, -0.04, m.rubber)); }
    return { muzzleZ: -0.4, sightY: 0.11, parts: [
      P(0.13, 0.13, 0.14, 0, -0.01, -0.04, m.olive), ...holes, P(0.06, 0.06, 0.24, 0, 0.01, -0.24, m.metal), P(0.07, 0.07, 0.03, 0, 0.01, -0.37, m.poly),
      P(0.06, 0.07, 0.12, 0, 0.02, 0.1, m.metal), ...grip(-0.07, 0.12), ...grip(-0.06, -0.24, m.poly, 0.1), ...guard(-0.035, 0.1),
      P(0.05, 0.08, 0.2, 0, 0.0, 0.26, m.poly), P(0.052, 0.085, 0.02, 0, 0.0, 0.37, m.rubber), ...rail(0.065, -0.3, -0.14), ...holo(0.11, -0.2)] };
  },
  ricochet: () => {
    const m = gm();
    return { muzzleZ: -0.32, sightY: 0.1, parts: [
      P(0.06, 0.08, 0.26, 0, 0.02, 0, m.poly), P(0.06, 0.13, 0.12, 0, -0.03, -0.1, m.poly), P(0.022, 0.022, 0.12, 0, 0.03, -0.22, m.steel),
      P(0.034, 0.034, 0.03, 0, 0.03, -0.29, m.orange), ...mag(0, -0.14, -0.11, 0.03, 0.12, 0.045, 0.05), ...grip(-0.06, 0.06),
      P(0.064, 0.012, 0.2, 0, 0.035, -0.02, m.orange), P(0.01, 0.01, 0.16, 0.02, 0.03, 0.2, m.steel), P(0.01, 0.01, 0.16, -0.02, 0.03, 0.2, m.steel),
      P(0.05, 0.07, 0.02, 0, 0.01, 0.28, m.rubber), ...rail(0.064, -0.12, 0.08), ...redDot(0.1, -0.02, 0.046)] };
  },
  sawblade: () => {
    const m = gm();
    const teeth = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; teeth.push(P(0.03, 0.006, 0.014, Math.cos(a) * 0.08, 0.075, -0.18 + Math.sin(a) * 0.08, m.steel, 0, -a, 0)); }
    return { muzzleZ: -0.3, sightY: 0.12, parts: [
      P(0.1, 0.1, 0.34, 0, 0, 0, m.metal), P(0.102, 0.022, 0.05, 0, 0.0, -0.1, m.yellow), P(0.102, 0.022, 0.05, 0, 0.0, 0.0, m.rubber),
      P(0.102, 0.022, 0.05, 0, 0.0, 0.1, m.yellow), P(0.16, 0.006, 0.16, 0, 0.068, -0.18, m.chrome), ...teeth, P(0.03, 0.02, 0.03, 0, 0.075, -0.18, m.metal),
      P(0.06, 0.06, 0.08, 0, -0.04, 0.12, m.metal), P(0.012, 0.04, 0.012, 0.045, 0.06, -0.05, m.metal), P(0.012, 0.04, 0.012, -0.045, 0.06, -0.05, m.metal),
      ...grip(-0.1, 0.1), ...guard(-0.06, 0.08), ...redDot(0.12, 0.08, 0.044)] };
  },
  blackhole: () => {
    const m = gm();
    const prongs = [0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2 + 0.5; return P(0.012, 0.012, 0.14, Math.cos(a) * 0.05, 0.01 + Math.sin(a) * 0.05, -0.3, m.chrome); });
    return { muzzleZ: -0.36, sightY: 0.09, parts: [
      P(0.08, 0.1, 0.28, 0, 0, 0, m.poly), P(0.11, 0.11, 0.015, 0, 0.01, -0.08, m.purple), P(0.1, 0.1, 0.015, 0, 0.01, -0.15, m.purple),
      P(0.09, 0.09, 0.015, 0, 0.01, -0.21, m.purple), P(0.05, 0.05, 0.22, 0, 0.01, -0.15, m.chrome), P(0.06, 0.06, 0.06, 0, 0.01, -0.29, m.purple), ...prongs,
      P(0.05, 0.05, 0.08, 0, 0.08, 0.02, m.purple), P(0.056, 0.012, 0.086, 0, 0.11, 0.02, m.chrome), ...grip(-0.09, 0.08), ...guard(-0.05, 0.06),
      P(0.06, 0.08, 0.12, 0, 0.0, 0.18, m.metal)] };
  },
  cryo: () => {
    const m = gm();
    return { muzzleZ: -0.42, sightY: 0.1, parts: [
      P(0.07, 0.09, 0.3, 0, 0, 0, m.white), P(0.05, 0.05, 0.12, 0, 0.08, 0.0, m.ice), P(0.056, 0.012, 0.126, 0, 0.11, 0.0, m.chrome),
      P(0.035, 0.035, 0.22, 0, 0.01, -0.25, m.steel), P(0.06, 0.06, 0.02, 0, 0.01, -0.2, m.ice), P(0.06, 0.06, 0.02, 0, 0.01, -0.28, m.ice),
      P(0.04, 0.04, 0.04, 0, 0.01, -0.38, m.ice, 0.78, 0.78, 0), P(0.072, 0.02, 0.2, 0, -0.03, 0.0, m.metal),
      ...grip(-0.08, 0.1), ...guard(-0.045, 0.08), P(0.06, 0.08, 0.14, 0, 0.0, 0.2, m.white), P(0.062, 0.085, 0.02, 0, 0.0, 0.28, m.rubber)] };
  },
  bat: () => {
    const m = gm();
    return { muzzleZ: -0.8, sightY: 0.07, parts: [
      P(0.045, 0.045, 0.3, 0, 0, 0.0, m.tape), P(0.06, 0.06, 0.4, 0, 0, -0.34, m.bat), P(0.08, 0.08, 0.3, 0, 0, -0.68, m.bat),
      P(0.12, 0.01, 0.01, 0, 0.01, -0.7, m.nail), P(0.01, 0.12, 0.01, 0, 0, -0.62, m.nail), P(0.12, 0.01, 0.01, 0, -0.02, -0.76, m.nail)] };
  },
};

// ---------- upgrade looks ----------
export const ELEMENTS = {
  fire: { name: 'INFERNO', color: 0xff5a20 },
  shock: { name: 'VOLT', color: 0x60c8ff },
  blast: { name: 'BOOM', color: 0xffb030 },
  cryo: { name: 'FROST', color: 0x9ae8ff },
};

let camoTex;
function camo() {
  if (camoTex) return camoTex;
  // wavy two-tone stripes, like a custom weapon skin
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1b1e'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#d8dce0'; g.lineWidth = 7;
  for (let k = -2; k < 9; k++) {
    g.beginPath();
    for (let x = 0; x <= 128; x += 4) { const y = k * 16 + Math.sin((x / 128) * Math.PI * 4 + k) * 6; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  camoTex = new THREE.CanvasTexture(c); camoTex.colorSpace = THREE.SRGBColorSpace; camoTex.magFilter = THREE.NearestFilter;
  camoTex.wrapS = camoTex.wrapT = THREE.RepeatWrapping;
  return camoTex;
}

const skinCache = {};
function skin(base, tint) {
  const key = `${base.uuid}|${tint}`;
  if (!skinCache[key]) {
    const m = base.clone();
    m.map = camo(); m.color = new THREE.Color(tint); m.metalness = Math.min(base.metalness, 0.4);
    skinCache[key] = m;
  }
  return skinCache[key];
}

export function gunModel(id, level = 1, element = null) {
  const m = gm();
  const r = (RECIPES[id] || RECIPES.rifle)();
  let parts = r.parts, spin = r.spin;
  if (level >= 2) {
    // upgraded guns get a striped skin, tinted with the element colour at MK III
    const tint = level >= 3 && element ? new THREE.Color(ELEMENTS[element].color).lerp(new THREE.Color(1, 1, 1), 0.45).getHex() : 0xb8bcc8;
    const swap = (p) => { const q = p.slice(); if ([m.metal, m.poly, m.olive, m.tan, m.white].includes(q[6])) q[6] = skin(q[6], tint); return q; };
    parts = parts.map(swap); if (spin) spin = spin.map(swap);
  }
  const g = build(parts);
  if (spin) { const sg = build(spin); sg.position.z = 0; g.add(sg); g.userData.spin = sg; }
  if (level >= 2) {
    // glowing accent strips down both sides of the receiver
    const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const glow = new THREE.MeshBasicMaterial({ color: level >= 3 && element ? ELEMENTS[element].color : 0xb070ff, toneMapped: false });
    for (const sx of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.01, size.z * 0.45), glow);
      strip.position.set(sx * Math.min(0.045, size.x / 2 + 0.002), Math.min(c.y, 0.01), c.z * 0.5);
      g.add(strip);
    }
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.015, r.muzzleZ); g.add(muzzle);
  g.userData.muzzle = muzzle; g.userData.sightY = r.sightY; g.userData.scope = !!r.scope;
  return g;
}

// Bake a gun into one mesh per material (for world pickups, where dozens can be on screen).
export function mergedGunModel(id, level = 1, element = null) {
  return mergeByMaterial(gunModel(id, level, element));
}

// Collapse a group of boxes into one mesh per material.
export function mergeByMaterial(src) {
  src.updateMatrixWorld(true);
  const byMat = new Map();
  src.traverse((o) => {
    if (!o.isMesh) return;
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(o.geometry.clone().applyMatrix4(o.matrixWorld));
  });
  const g = new THREE.Group();
  for (const [mat, geos] of byMat) g.add(new THREE.Mesh(mergeGeometries(geos, false), mat));
  g.userData = src.userData;
  return g;
}
