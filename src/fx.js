// Pooled particle systems, shockwaves and explosion flashes.
import * as THREE from 'three';
import { radialTexture } from './models.js';

export class Particles {
  constructor(scene, max, size, texture) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.i = 0;
    this.live = 0;
    this.pos.fill(-9999);
    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('color', this.colAttr);
    this.mat = new THREE.PointsMaterial({
      size, map: texture, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, r, g, b, drag = 1, grav = 0) {
    const i = this.i;
    this.i = (i + 1) % this.max;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.base[k] = r; this.base[k + 1] = g; this.base[k + 2] = b;
    this.life[i] = life; this.maxLife[i] = life;
    this.drag[i] = drag; this.grav[i] = grav;
    this.live = this.max;
  }

  update(dt) {
    if (!this.live) return;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.col[k] = this.col[k + 1] = this.col[k + 2] = 0;
        this.pos[k + 1] = -9999;
        continue;
      }
      alive++;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.col[k] = this.base[k] * f; this.col[k + 1] = this.base[k + 1] * f; this.col[k + 2] = this.base[k + 2] * f;
    }
    this.live = alive;
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  clear() {
    this.life.fill(0); this.col.fill(0);
    for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -9999;
    this.posAttr.needsUpdate = this.colAttr.needsUpdate = true;
  }
}

const rand = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor(scene, scale = 1) {
    const tex = radialTexture('rgba(255,255,255,1)', 64);
    this.vapor = new Particles(scene, Math.round(900 * scale), 1.1, tex);
    this.fire = new Particles(scene, Math.round(700 * scale), 2.6, tex);
    this.spark = new Particles(scene, Math.round(400 * scale), 0.35, tex);

    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffd2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
      }));
      m.visible = false;
      scene.add(m);
      this.rings.push({ m, t: 1, size: 1 });
    }
    this.light = new THREE.PointLight(0xff9a40, 0, 120, 1.4);
    scene.add(this.light);
    this.lightT = 0;
  }

  explode(pos, size = 1) {
    const n = Math.round(70 * size);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, sp = rand(4, 16) * size;
      const hot = Math.random();
      this.fire.spawn(pos.x, pos.y + 1, pos.z,
        Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 3, Math.sin(a) * Math.cos(e) * sp,
        rand(0.5, 1.3), 1, 0.35 + hot * 0.4, 0.08 + hot * 0.1, 2.2, -2);
    }
    for (let i = 0; i < 40 * size; i++) {
      this.spark.spawn(pos.x, pos.y + 1, pos.z, rand(-22, 22), rand(4, 24), rand(-22, 22), rand(0.4, 1), 1, 0.85, 0.4, 0.5, 26);
    }
    const r = this.rings.find((x) => x.t >= 1) || this.rings[0];
    r.t = 0; r.size = 26 * size;
    r.m.position.copy(pos); r.m.position.y += 0.3;
    r.m.visible = true;
    this.light.position.copy(pos); this.light.position.y += 3;
    this.lightT = 1;
    this.lightPower = 9000 * size;
  }

  sparks(pos, dirX, dirZ, n = 4) {
    for (let i = 0; i < n; i++) {
      this.spark.spawn(pos.x, pos.y + 0.3, pos.z, dirX * rand(4, 12) + rand(-3, 3), rand(1, 6), dirZ * rand(4, 12) + rand(-3, 3), rand(0.2, 0.5), 1, 0.8, 0.35, 1, 20);
    }
  }

  burn(pos, spread = 4) {
    this.fire.spawn(pos.x + rand(-spread, spread), pos.y + rand(0, 2), pos.z + rand(-spread, spread),
      rand(-1, 1), rand(3, 7), rand(-1, 1), rand(0.4, 0.9), 1, 0.4, 0.08, 0.5, -3);
  }

  dust(pos, spread = 6, n = 10) {
    for (let i = 0; i < n; i++) {
      this.vapor.spawn(pos.x + rand(-spread, spread), pos.y + rand(0, 2), pos.z + rand(-spread, spread),
        rand(-3, 3), rand(1, 5), rand(-3, 3), rand(0.6, 1.4), 0.35, 0.32, 0.28, 1.5, 1);
    }
  }

  update(dt) {
    this.vapor.update(dt);
    this.fire.update(dt);
    this.spark.update(dt);
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt * 1.8);
      const s = 1 + r.size * r.t;
      r.m.scale.set(s, 1, s);
      r.m.material.opacity = (1 - r.t) * 0.9;
      if (r.t >= 1) r.m.visible = false;
    }
    if (this.lightT > 0) {
      this.lightT = Math.max(0, this.lightT - dt * 2.2);
      this.light.intensity = this.lightPower * this.lightT * this.lightT;
    }
  }

  clear() {
    this.vapor.clear(); this.fire.clear(); this.spark.clear();
    for (const r of this.rings) { r.t = 1; r.m.visible = false; }
    this.lightT = 0; this.light.intensity = 0;
  }
}
