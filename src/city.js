// Night-city scenery: instanced buildings, street lamps, highway pillars,
// ground grid and stars. Instances are recycled as the car moves forward.
import * as THREE from 'three';
import { centerX, GROUND_Y, makeFrame } from './track.js';

const B_PER_SIDE = 60, B_STEP = 10;
const LAMPS = 40, L_STEP = 16;
const PILLARS = 16, P_STEP = 40;

function windowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128);
  const tints = ['#ffd9a0', '#ffe8c4', '#9fdcff', '#c8f0ff', '#ffb0d8'];
  for (let y = 2; y < 128; y += 5) for (let x = 2; x < 64; x += 6) {
    if (Math.random() < 0.38) {
      g.fillStyle = tints[(Math.random() * tints.length) | 0];
      g.globalAlpha = 0.4 + Math.random() * 0.6;
      g.fillRect(x, y, 3, 3);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function gridTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#07090f'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,170,60,0.55)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.moveTo(128, 0); g.lineTo(128, 256); g.stroke();
  g.strokeStyle = 'rgba(55,160,255,0.18)'; g.lineWidth = 1;
  for (let i = 0; i <= 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,220,150,0.6)'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  return t;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _F = makeFrame();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

export class City {
  constructor(scene, track) {
    this.track = track;

    const gtex = gridTexture();
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: gtex, emissiveMap: gtex, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 1 }),
    );
    this.ground.position.y = GROUND_Y;
    scene.add(this.ground);

    const wtex = windowTexture();
    const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const bMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: null, emissiveMap: wtex, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.8, metalness: 0.2 });
    this.buildings = new THREE.InstancedMesh(bGeo, bMat, B_PER_SIDE * 2);
    this.buildings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.buildings.frustumCulled = false;
    scene.add(this.buildings);
    this.bSlots = [];
    for (let i = 0; i < B_PER_SIDE * 2; i++) this.bSlots.push({ s: 0, side: i % 2 ? 1 : -1 });

    const poleGeo = new THREE.BoxGeometry(0.22, 1, 0.22).translate(0, 0.5, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a303a, roughness: 0.6, metalness: 0.5 });
    this.poles = new THREE.InstancedMesh(poleGeo, poleMat, LAMPS);
    const headGeo = new THREE.BoxGeometry(2.2, 0.16, 0.6);
    this.heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), LAMPS);
    for (const m of [this.poles, this.heads]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
    this.lSlots = [];
    for (let i = 0; i < LAMPS; i++) this.lSlots.push({ s: 0, side: i % 2 ? 1 : -1 });

    const pilGeo = new THREE.BoxGeometry(3.4, 1, 3.4).translate(0, 0.5, 0);
    this.pillars = new THREE.InstancedMesh(pilGeo, new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.9 }), PILLARS);
    this.pillars.frustumCulled = false;
    this.pillars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.pillars);
    this.pSlots = [];
    for (let i = 0; i < PILLARS; i++) this.pSlots.push({ s: 0 });

    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 700; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.08 + Math.random() * 1.3;
      sp.push(Math.cos(a) * Math.cos(e) * 900, Math.sin(e) * 900, Math.sin(a) * Math.cos(e) * 900);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe3ff, size: 1.6, sizeAttenuation: false, fog: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);
  }

  reset(carS) {
    const base = carS - 40;
    this.bSlots.forEach((b, i) => { b.s = base + Math.floor(i / 2) * B_STEP + Math.random() * 4; this.placeBuilding(i); });
    this.lSlots.forEach((l, i) => { l.s = base + i * L_STEP; this.placeLamp(i); });
    this.pSlots.forEach((p, i) => { p.s = Math.ceil(base / P_STEP) * P_STEP + i * P_STEP; this.placePillar(i); });
    this.buildings.instanceMatrix.needsUpdate = true;
    if (this.buildings.instanceColor) this.buildings.instanceColor.needsUpdate = true;
    this.poles.instanceMatrix.needsUpdate = this.heads.instanceMatrix.needsUpdate = true;
    this.pillars.instanceMatrix.needsUpdate = true;
  }

  placeBuilding(i) {
    const b = this.bSlots[i];
    const w = 10 + Math.random() * 18, d = 10 + Math.random() * 16;
    const off = 30 + Math.random() * 50 + w / 2;
    const h = 14 + Math.random() * Math.random() * 110;
    _p.set(centerX(b.s) + b.side * off, GROUND_Y, -b.s);
    _q.identity();
    _s.set(w, h - GROUND_Y, d);
    _m.compose(_p, _q, _s);
    this.buildings.setMatrixAt(i, _m);
    const k = Math.random();
    _c.setHSL(0.6 + k * 0.08, 0.25, 0.08 + k * 0.1);
    this.buildings.setColorAt(i, _c);
  }

  placeLamp(i) {
    const l = this.lSlots[i];
    if (this.track.zoneAt(l.s)) {
      this.poles.setMatrixAt(i, HIDE); this.heads.setMatrixAt(i, HIDE);
      return;
    }
    this.track.frame(l.s, l.side * 8.75, 0, _F, false);
    _p.copy(_F.pos); _p.y = -1.8;
    _q.identity();
    _s.set(1, 9.4, 1);
    _m.compose(_p, _q, _s);
    this.poles.setMatrixAt(i, _m);
    this.track.frame(l.s, l.side * 7.8, 0, _F, false);
    _p.copy(_F.pos); _p.y = 7.5;
    _s.set(1, 1, 1);
    _m.compose(_p, _q, _s);
    this.heads.setMatrixAt(i, _m);
  }

  placePillar(i) {
    const p = this.pSlots[i];
    if (this.track.gapAt(p.s)) { this.pillars.setMatrixAt(i, HIDE); return; }
    _p.set(centerX(p.s), GROUND_Y, -p.s);
    _q.identity();
    _s.set(1, -1.8 - GROUND_Y, 1);
    _m.compose(_p, _q, _s);
    this.pillars.setMatrixAt(i, _m);
  }

  update(carS, camera) {
    const behind = carS - 40;
    let bd = false, ld = false, pd = false;
    for (let i = 0; i < this.bSlots.length; i++) {
      if (this.bSlots[i].s < behind) { this.bSlots[i].s += B_PER_SIDE * B_STEP; this.placeBuilding(i); bd = true; }
    }
    for (let i = 0; i < this.lSlots.length; i++) {
      if (this.lSlots[i].s < behind) { this.lSlots[i].s += LAMPS * L_STEP; this.placeLamp(i); ld = true; }
    }
    for (let i = 0; i < this.pSlots.length; i++) {
      if (this.pSlots[i].s < behind) { this.pSlots[i].s += PILLARS * P_STEP; this.placePillar(i); pd = true; }
    }
    if (bd) { this.buildings.instanceMatrix.needsUpdate = true; this.buildings.instanceColor.needsUpdate = true; }
    if (ld) { this.poles.instanceMatrix.needsUpdate = true; this.heads.instanceMatrix.needsUpdate = true; }
    if (pd) this.pillars.instanceMatrix.needsUpdate = true;

    this.ground.position.x = Math.round(camera.position.x / 50) * 50;
    this.ground.position.z = Math.round(camera.position.z / 50) * 50;
    this.stars.position.copy(camera.position);
  }
}
