// Axis-aligned box world with a uniform XZ grid for fast queries.
// Everything solid in the town (walls, floors, stairs, props, player-built walls) is a box.

const CELL = 8;
const HALF = 260; // world spans [-HALF, HALF] on X and Z
const N = Math.ceil((HALF * 2) / CELL);

export class PhysicsWorld {
  constructor() {
    this.cells = new Array(N * N);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    this.boxes = new Set();
    this.stamp = 1;
  }

  cellIndex(cx, cz) { return cz * N + cx; }
  toCell(v) { return Math.max(0, Math.min(N - 1, Math.floor((v + HALF) / CELL))); }

  addBox(minX, minY, minZ, maxX, maxY, maxZ, opts = {}) {
    const b = { minX, minY, minZ, maxX, maxY, maxZ, _s: 0, cells: [], ...opts };
    const x0 = this.toCell(minX), x1 = this.toCell(maxX), z0 = this.toCell(minZ), z1 = this.toCell(maxZ);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const i = this.cellIndex(cx, cz);
      this.cells[i].push(b); b.cells.push(i);
    }
    this.boxes.add(b);
    return b;
  }

  removeBox(b) {
    for (const i of b.cells) {
      const arr = this.cells[i]; const k = arr.indexOf(b);
      if (k >= 0) arr.splice(k, 1);
    }
    this.boxes.delete(b);
  }

  query(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const s = ++this.stamp;
    const x0 = this.toCell(minX), x1 = this.toCell(maxX), z0 = this.toCell(minZ), z1 = this.toCell(maxZ);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      for (const b of this.cells[this.cellIndex(cx, cz)]) {
        if (b._s !== s) { b._s = s; out.push(b); }
      }
    }
    return out;
  }

  // Highest surface top at (x,z) that is at or below yTop.
  groundHeight(x, z, yTop, r = 0) {
    let h = 0;
    for (const b of this.query(x - r, z - r, x + r, z + r, this._tmpQ || (this._tmpQ = []))) {
      if (b.noGround) continue;
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ && b.maxY <= yTop + 0.001 && b.maxY > h) h = b.maxY;
    }
    return h;
  }

  overlaps(minX, minY, minZ, maxX, maxY, maxZ, ignore) {
    for (const b of this.query(minX, minZ, maxX, maxZ, this._tmpO || (this._tmpO = []))) {
      if (b === ignore || b.ghost) continue;
      if (maxX > b.minX && minX < b.maxX && maxY > b.minY && minY < b.maxY && maxZ > b.minZ && minZ < b.maxZ) return b;
    }
    return null;
  }

  // Moves a vertical box-shaped body (feet at pos.y). Mutates pos and vel.
  move(pos, vel, dt, r, h, stepUp = 0.6, res = {}) {
    res.onGround = false; res.hitWall = null; res.hitCeil = false; res.stepped = false;
    const near = this.query(pos.x - r - 4, pos.z - r - 4, pos.x + r + 4, pos.z + r + 4, this._tmpM || (this._tmpM = []));
    const solid = (b) => !b.ghost;

    // Horizontal, axis by axis.
    for (const axis of ['x', 'z']) {
      const d = vel[axis] * dt;
      if (d === 0) continue;
      pos[axis] += d;
      for (const b of near) {
        if (!solid(b)) continue;
        const minX = pos.x - r, maxX = pos.x + r, minZ = pos.z - r, maxZ = pos.z + r;
        if (!(maxX > b.minX && minX < b.maxX && pos.y + h > b.minY && pos.y < b.maxY && maxZ > b.minZ && minZ < b.maxZ)) continue;
        // Step up onto low obstacles (stairs, curbs).
        const rise = b.maxY - pos.y;
        if (rise > 0 && rise <= stepUp && !this.overlaps(pos.x - r, b.maxY + 0.01, pos.z - r, pos.x + r, b.maxY + h, pos.z + r)) {
          pos.y = b.maxY; res.stepped = true; continue;
        }
        if (axis === 'x') pos.x = d > 0 ? b.minX - r - 1e-4 : b.maxX + r + 1e-4;
        else pos.z = d > 0 ? b.minZ - r - 1e-4 : b.maxZ + r + 1e-4;
        res.hitWall = b;
        res.wallAxis = axis;
      }
    }

    // Vertical.
    const dy = vel.y * dt;
    pos.y += dy;
    for (const b of near) {
      if (!solid(b)) continue;
      if (!(pos.x + r > b.minX && pos.x - r < b.maxX && pos.z + r > b.minZ && pos.z - r < b.maxZ)) continue;
      if (!(pos.y + h > b.minY && pos.y < b.maxY)) continue;
      if (dy <= 0) { pos.y = b.maxY; vel.y = 0; res.onGround = true; res.ground = b; }
      else { pos.y = b.minY - h - 1e-4; vel.y = 0; res.hitCeil = true; }
    }
    if (pos.y <= 0) { pos.y = 0; if (vel.y < 0) vel.y = 0; res.onGround = true; res.ground = null; }
    // Probe for ground just below so walking down stairs stays grounded.
    if (!res.onGround && vel.y <= 0) {
      const g = this.groundHeight(pos.x, pos.z, pos.y + 0.01, r * 0.9);
      if (pos.y - g < 0.05) { pos.y = g; res.onGround = true; }
    }
    return res;
  }

  // Ray vs boxes. Returns {dist, box, nx, ny, nz} or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter) {
    let best = null, bestT = maxDist;
    // Walk the grid along the ray in 2D.
    let cx = this.toCell(ox), cz = this.toCell(oz);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const nextBX = (cx + (dx > 0 ? 1 : 0)) * CELL - HALF, nextBZ = (cz + (dz > 0 ? 1 : 0)) * CELL - HALF;
    let tMaxX = dx !== 0 ? (nextBX - ox) / dx : Infinity, tMaxZ = dz !== 0 ? (nextBZ - oz) / dz : Infinity;
    const tDX = dx !== 0 ? CELL / Math.abs(dx) : Infinity, tDZ = dz !== 0 ? CELL / Math.abs(dz) : Infinity;
    const s = ++this.stamp;
    let tCell = 0;
    for (let iter = 0; iter < 200; iter++) {
      if (cx < 0 || cz < 0 || cx >= N || cz >= N) break;
      for (const b of this.cells[this.cellIndex(cx, cz)]) {
        if (b._s === s) continue; b._s = s;
        if (b.ghost || (filter && !filter(b))) continue;
        const hit = rayBox(ox, oy, oz, dx, dy, dz, b);
        if (hit && hit.t < bestT && hit.t >= 0) { bestT = hit.t; best = { dist: hit.t, box: b, nx: hit.nx, ny: hit.ny, nz: hit.nz }; }
      }
      if (best && bestT <= Math.min(tMaxX, tMaxZ)) break;
      tCell = Math.min(tMaxX, tMaxZ);
      if (tCell > bestT) break;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDX; } else { cz += stepZ; tMaxZ += tDZ; }
    }
    // Ground plane.
    if (dy < 0) {
      const t = -oy / dy;
      if (t >= 0 && t < bestT) best = { dist: t, box: null, nx: 0, ny: 1, nz: 0 };
    }
    return best;
  }
}

export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0, nz = 0;
  const axes = [[ox, dx, b.minX, b.maxX, 0], [oy, dy, b.minY, b.maxY, 1], [oz, dz, b.minZ, b.maxZ, 2]];
  for (const [o, d, mn, mx, a] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return null; continue; }
    let t1 = (mn - o) / d, t2 = (mx - o) / d, sgn = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sgn = 1; }
    if (t1 > tmin) { tmin = t1; nx = a === 0 ? sgn : 0; ny = a === 1 ? sgn : 0; nz = a === 2 ? sgn : 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(tmin, 0), nx, ny, nz };
}

export const WORLD_HALF = HALF;
