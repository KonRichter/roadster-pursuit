// Track: an endless elevated highway described in (s, u, h) coordinates.
//   s = distance along the road, u = lateral offset (arc length across the
//   surface), h = height above the surface along its normal.
// Tunnel zones swap the flat cross-section for a stadium-shaped tube so the
// car can ride the walls and ceiling with its suction fans.
import * as THREE from 'three';

export const ROAD_HALF = 8;
export const TUN_FLOOR = 6;          // half-width of the flat tunnel floor
export const TUN_R = 7;              // radius of the tunnel walls
export const TUN_HALF = 2 * TUN_FLOOR + Math.PI * TUN_R; // half perimeter
export const CHUNK = 40;
export const GROUND_Y = -12;
const ROW = 4;
const VIEW_AHEAD = 520;
const KEEP_BEHIND = 40;

export const centerX = (s) => 38 * Math.sin(s / 310) + 16 * Math.sin(s / 113 + 1.3);
const centerDX = (s) => (38 / 310) * Math.cos(s / 310) + (16 / 113) * Math.cos(s / 113 + 1.3);

export function wrapU(u) {
  const P = 2 * TUN_HALF;
  return ((((u + TUN_HALF) % P) + P) % P) - TUN_HALF;
}

// Angle of the surface relative to the floor (0 = floor, PI/2 = wall, PI = ceiling).
export function arcAngle(u) {
  const a = Math.abs(wrapU(u));
  if (a <= TUN_FLOOR) return 0;
  if (a <= TUN_FLOOR + Math.PI * TUN_R) return (a - TUN_FLOOR) / TUN_R;
  return Math.PI;
}

function profile(tunnel, u, o) {
  if (!tunnel) {
    o.x = u; o.y = 0; o.nx = 0; o.ny = 1;
    return o;
  }
  u = wrapU(u);
  const sg = u < 0 ? -1 : 1;
  const a = Math.abs(u);
  if (a <= TUN_FLOOR) {
    o.x = u; o.y = 0; o.nx = 0; o.ny = 1;
  } else if (a <= TUN_FLOOR + Math.PI * TUN_R) {
    const t = (a - TUN_FLOOR) / TUN_R;
    o.x = sg * (TUN_FLOOR + TUN_R * Math.sin(t));
    o.y = TUN_R * (1 - Math.cos(t));
    o.nx = -sg * Math.sin(t);
    o.ny = Math.cos(t);
  } else {
    const c = a - TUN_FLOOR - Math.PI * TUN_R;
    o.x = sg * (TUN_FLOOR - c); o.y = 2 * TUN_R; o.nx = 0; o.ny = -1;
  }
  return o;
}

function tubeUs() {
  const us = [];
  const arc0 = TUN_FLOOR, arc1 = TUN_FLOOR + Math.PI * TUN_R;
  const push = (a, b, n) => { for (let i = 0; i < n; i++) us.push(a + ((b - a) * i) / n); };
  push(-TUN_HALF, -arc1, 2);
  push(-arc1, -arc0, 16);
  push(-arc0, arc0, 4);
  push(arc0, arc1, 16);
  push(arc1, TUN_HALF, 2);
  us.push(TUN_HALF);
  return us;
}
const TUBE_US = tubeUs();

export function makeFrame() {
  return {
    pos: new THREE.Vector3(), up: new THREE.Vector3(),
    fwd: new THREE.Vector3(), right: new THREE.Vector3(), tunnel: false,
  };
}

const _p = { x: 0, y: 0, nx: 0, ny: 1 };
const _F = makeFrame();
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function pushQuad(arr, a, b, c, d) {
  arr.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
  arr.push(c.x, c.y, c.z, d.x, d.y, d.z, b.x, b.y, b.z);
}
function pushUV(arr, ua, va, ub, vb, uc, vc, ud, vd) {
  arr.push(ua, va, uc, vc, ub, vb);
  arr.push(uc, vc, ud, vd, ub, vb);
}

export class Track {
  constructor(scene, renderer) {
    this.scene = scene;
    this.zones = [];
    this.chunks = new Map();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.makeMaterials(renderer);
  }

  makeMaterials(renderer) {
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const road = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#23262c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const v = 28 + Math.random() * 22;
        g.fillStyle = `rgb(${v},${v},${v + 4})`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      g.fillStyle = '#e8eef4';
      g.fillRect(6, 0, 5, h); g.fillRect(w - 11, 0, 5, h);
      g.fillStyle = 'rgba(235,240,245,0.85)';
      for (const x of [64, 128, 192]) g.fillRect(x - 2, 0, 4, 128);
      g.fillStyle = 'rgba(55,224,255,0.25)';
      g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
    });
    road.anisotropy = aniso;

    const tubeDraw = (emissive) => (g, w, h) => {
      g.fillStyle = emissive ? '#000' : '#5a626e'; g.fillRect(0, 0, w, h);
      const fx0 = w * (0.5 - TUN_FLOOR / (2 * TUN_HALF)), fx1 = w * (0.5 + TUN_FLOOR / (2 * TUN_HALF));
      if (!emissive) {
        g.fillStyle = '#2a2d33'; g.fillRect(fx0, 0, fx1 - fx0, h);
        g.fillStyle = '#d8dde3';
        g.fillRect(w / 2 - 2, 0, 4, h / 2);
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
        for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(fx0, y); g.moveTo(fx1, y); g.lineTo(w, y); g.stroke(); }
        for (let x = 0; x < w; x += 40) { if (x > fx0 && x < fx1) continue; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      }
      const strip = (x, col, wd) => { g.fillStyle = col; g.fillRect(x - wd / 2, 0, wd, h); };
      strip(w * 0.25, '#bff6ff', 10); strip(w * 0.75, '#bff6ff', 10);
      strip(2, '#fff2c8', 6); strip(w - 2, '#fff2c8', 6);
      g.fillStyle = emissive ? '#ff2d4a' : '#ff6070';
      for (let y = 20; y < h; y += 128) { g.fillRect(fx0 - 12, y, 6, 14); g.fillRect(fx1 + 6, y, 6, 14); }
    };
    const tube = canvasTex(1024, 256, tubeDraw(false));
    const tubeEm = canvasTex(1024, 256, tubeDraw(true));
    tube.anisotropy = aniso;

    this.mat = {
      road: new THREE.MeshStandardMaterial({ map: road, roughness: 0.85, metalness: 0.05 }),
      tube: new THREE.MeshStandardMaterial({
        map: tube, emissiveMap: tubeEm, emissive: 0xffffff, emissiveIntensity: 1.4,
        roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide,
      }),
      rail: new THREE.MeshStandardMaterial({ color: 0x39404c, roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide }),
      glow: new THREE.MeshBasicMaterial({ color: 0x37e0ff, side: THREE.DoubleSide }),
    };
  }

  reset() {
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
    this.zones = [];
  }

  addZone(z) {
    this.zones.push(z);
    this.zones.sort((a, b) => a.s0 - b.s0);
  }
  zoneAt(s) {
    for (const z of this.zones) if (s >= z.s0 && s < z.s1) return z;
    return null;
  }
  tunnelAt(s) { const z = this.zoneAt(s); return z && z.type === 'tunnel' ? z : null; }
  gapAt(s) { const z = this.zoneAt(s); return z && z.type === 'gap' ? z : null; }

  // mode: undefined = auto-detect tunnel, true = force tunnel, false = force flat
  frame(s, u, h, o, mode) {
    const tun = mode === undefined ? !!this.tunnelAt(s) : mode;
    profile(tun, u, _p);
    const dx = centerDX(s);
    const inv = 1 / Math.hypot(dx, 1);
    const tx = dx * inv, tz = -inv;
    const rx = -tz, rz = tx;
    const cx = centerX(s), cz = -s;
    const nx = rx * _p.nx, ny = _p.ny, nz = rz * _p.nx;
    o.pos.set(cx + rx * _p.x + nx * h, _p.y + ny * h, cz + rz * _p.x + nz * h);
    o.up.set(nx, ny, nz);
    o.fwd.set(tx, 0, tz);
    o.right.set(rx, 0, rz);
    o.tunnel = tun;
    return o;
  }

  // Orient an object on the surface: local +Z = forward, +Y = surface normal.
  place(obj, s, u, h = 0, yaw = 0, mode) {
    const F = this.frame(s, u, h, _F, mode);
    _x.crossVectors(F.up, F.fwd);
    _m.makeBasis(_x, F.up, F.fwd);
    obj.position.copy(F.pos);
    obj.quaternion.setFromRotationMatrix(_m);
    if (yaw) { _q.setFromAxisAngle(_Y, yaw); obj.quaternion.multiply(_q); }
  }

  update(carS) {
    const first = Math.floor((carS - KEEP_BEHIND) / CHUNK);
    const last = Math.floor((carS + VIEW_AHEAD) / CHUNK);
    for (let i = first; i <= last; i++) {
      if (!this.chunks.has(i)) this.chunks.set(i, this.buildChunk(i));
    }
    for (const [i, c] of this.chunks) {
      if (i < first) { this.disposeChunk(c); this.chunks.delete(i); }
    }
    if (this.zones.length && this.zones[0].s1 < carS - 300) {
      this.zones = this.zones.filter((z) => z.s1 > carS - 300);
    }
  }

  pt(s, u, mode, out, yOff = 0) {
    this.frame(s, u, 0, _F, mode);
    out.copy(_F.pos);
    out.y += yOff;
    return out;
  }

  buildChunk(i) {
    const s0 = i * CHUNK;
    const road = [], roadUV = [], tube = [], tubeUV = [], rail = [], glow = [];
    for (let s = s0; s < s0 + CHUNK - 0.01; s += ROW) {
      const z = this.zoneAt(s + ROW / 2);
      const type = z ? z.type : 'road';
      if (type === 'gap') continue;
      const sB = s + ROW;
      if (type === 'tunnel') {
        for (let j = 0; j < TUBE_US.length - 1; j++) {
          const u0 = TUBE_US[j], u1 = TUBE_US[j + 1];
          pushQuad(tube, this.pt(s, u0, true, _a), this.pt(sB, u0, true, _b), this.pt(s, u1, true, _c), this.pt(sB, u1, true, _d));
          const x0 = (u0 + TUN_HALF) / (2 * TUN_HALF), x1 = (u1 + TUN_HALF) / (2 * TUN_HALF);
          pushUV(tubeUV, x0, s / 12, x0, sB / 12, x1, s / 12, x1, sB / 12);
        }
      } else {
        const u0 = -ROAD_HALF - 0.1, u1 = ROAD_HALF + 0.1;
        pushQuad(road, this.pt(s, u0, false, _a), this.pt(sB, u0, false, _b), this.pt(s, u1, false, _c), this.pt(sB, u1, false, _d));
        pushUV(roadUV, 0, s / 16, 0, sB / 16, 1, s / 16, 1, sB / 16);
        for (const side of [-1, 1]) {
          const ui = side * (ROAD_HALF + 0.1), uo = side * (ROAD_HALF + 0.45);
          pushQuad(rail, this.pt(s, ui, false, _a), this.pt(sB, ui, false, _b), this.pt(s, ui, false, _c, 0.9), this.pt(sB, ui, false, _d, 0.9));
          pushQuad(rail, this.pt(s, uo, false, _a, -1.8), this.pt(sB, uo, false, _b, -1.8), this.pt(s, uo, false, _c, 0.9), this.pt(sB, uo, false, _d, 0.9));
          pushQuad(glow, this.pt(s, ui, false, _a, 0.92), this.pt(sB, ui, false, _b, 0.92), this.pt(s, uo, false, _c, 0.92), this.pt(sB, uo, false, _d, 0.92));
        }
      }
    }
    const meshes = [];
    const add = (pos, uv, mat, receive) => {
      if (!pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = receive;
      m.matrixAutoUpdate = false;
      this.group.add(m);
      meshes.push(m);
    };
    add(road, roadUV, this.mat.road, true);
    add(tube, tubeUV, this.mat.tube, true);
    add(rail, null, this.mat.rail, false);
    add(glow, null, this.mat.glow, false);
    return { meshes };
  }

  disposeChunk(c) {
    for (const m of c.meshes) { this.group.remove(m); m.geometry.dispose(); }
  }
}
