// Pursuit cruisers: they chase, try to ram or box the Roadster in, and get
// wrecked by hazards, gaps and traffic. Also the police helicopter that
// drops mines into the Roadster's lane.
import * as THREE from 'three';
import * as Models from './models.js';
import { wrapU, makeFrame } from './track.js';
import { ASSIST } from './platform.js';

const _F = makeFrame();
const _a = new THREE.Vector3();
const _dir = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Police {
  constructor(game) {
    this.g = game;
    this.cops = [];
    this.wave = null;
    this.ambient = { total: 0, wrecked: 0, lost: 0 };
    this.ambientT = 8;
    this.heli = null;
    this.heliMesh = Models.makeHeli();
    this.heliMesh.visible = false;
    game.scene.add(this.heliMesh);
    this.cone = this.heliMesh.userData.cone;
    this.cone.visible = false;
    game.scene.add(this.cone);
    // permanent light (intensity 0 when idle) so shaders never recompile mid-run
    this.spot = new THREE.SpotLight(0xdfeeff, 0, 90, 0.32, 0.5, 1.1);
    game.scene.add(this.spot, this.spot.target);
  }

  reset() {
    for (const c of this.cops) this.g.scene.remove(c.mesh);
    this.cops = [];
    this.wave = null;
    this.ambientT = 8;
    this.heli = null;
    this.heliMesh.visible = false;
    this.cone.visible = false;
    this.spot.intensity = 0;
  }

  addCop(s, u, wave) {
    const mesh = Models.makeCop();
    this.g.scene.add(mesh);
    this.cops.push({
      s, u, h: 0, vh: 0, v: this.g.car.v + 6, state: 'chase', mesh,
      tail: 0, spin: 0, spinV: 0, roll: 0, t: 0, wave,
    });
  }

  spawnWave(n, carS) {
    this.wave = { total: n, wrecked: 0, lost: 0 };
    for (let i = 0; i < n; i++) this.addCop(carS - 70 - i * 16, (i % 2 ? 1 : -1) * (1.5 + Math.random() * 4), this.wave);
  }

  spawnHeli(drops) {
    const car = this.g.car;
    this.heli = { s: car.s - 140, u: 0, h: 34, phase: 'arrive', drops, dropT: 1.2, t: 0, pass: 0, swoops: 0, spin: 0, vh: 0 };
    this.heliMesh.visible = true;
    this.cone.visible = true;
  }

  updateHeli(dt) {
    const g = this.g, car = g.car, T = g.track, H = this.heli;
    if (!H) return;
    const km = car.s / 1000;
    const LEAD = 135; // mines drop far enough ahead to read and react
    H.t += dt;
    if (H.phase === 'arrive' || H.phase === 'return') {
      H.s += (car.v + 45) * dt;
      H.h += (16 - H.h) * Math.min(1, dt * 1.2);
      if (H.s > car.s + LEAD) { H.phase = 'hunt'; H.pass = 0; }
    } else if (H.phase === 'hunt') {
      H.s = car.s + LEAD + Math.sin(H.t * 0.8) * 6;
      H.h += (15 - H.h) * Math.min(1, dt * 2);
      H.u += (THREE.MathUtils.clamp(car.u, -6, 6) - H.u) * Math.min(1, dt * 1.5);
      H.dropT -= dt;
      if (H.dropT <= 0 && H.drops > 0) {
        H.dropT = Math.max(0.9, 1.8 - km * 0.08);
        if (!T.zoneAt(H.s) && !T.zoneAt(H.s + 10)) { this.dropMine(H); H.drops--; H.pass++; }
      }
      // after a few mines it swoops low: the chance to ram it with thrust flight
      const clear = !T.zoneAt(H.s) && !T.zoneAt(H.s - 60);
      if (H.pass >= 3 && H.swoops < 2 && clear && H.dropT > 0.4) {
        H.phase = 'swoop'; H.swoops++;
        g.onWarn('swoop');
      } else if (H.drops <= 0 && H.dropT <= -1.5) H.phase = 'leave';
    } else if (H.phase === 'swoop') {
      H.s += (car.v - 34) * dt;
      H.h += (7 - H.h) * Math.min(1, dt * 2.5);
      H.u += (THREE.MathUtils.clamp(car.u, -6, 6) - H.u) * Math.min(1, dt * 1.2);
      if (Math.abs(car.s - H.s) < 5.5 && Math.abs(car.u - H.u) < 4.5 && car.h > H.h - 3.6 && car.h < H.h + 1.8) {
        this.downHeli();
      } else if (H.s < car.s - 30) {
        H.phase = H.drops > 0 ? 'return' : 'leave';
      }
    } else if (H.phase === 'down') {
      H.vh -= 22 * dt;
      H.h += H.vh * dt;
      H.s += car.v * 0.75 * dt;
      H.spin += dt * 7;
      g.track.frame(H.s, H.u, Math.max(H.h, 0) + 1, _F, false);
      g.fx.burn(_F.pos, 1.2);
      if (H.h <= 0.5) {
        g.fx.explode(_F.pos, 1.6);
        g.sound.boom(1.3);
        g.shake = Math.max(g.shake, 0.9);
        g.blast(H.s, 30);
        this.hideHeli();
        return;
      }
    } else {
      H.s += (car.v - 25) * dt;
      H.h += 22 * dt;
      if (H.h > 90) { this.hideHeli(); return; }
    }
    const m = this.heliMesh;
    T.place(m, H.s, H.u, H.h, Math.PI + Math.sin(H.t) * 0.15 + (H.spin || 0), false); // faces the Roadster
    m.rotateX(H.phase === 'swoop' ? -0.25 : -0.12);
    m.userData.rotor.rotation.y += dt * 38;
    m.userData.tailRotor.rotation.x += dt * 50;
    // searchlight onto the car
    T.frame(car.s, car.u, 0, _F);
    _dir.copy(_F.pos).sub(m.position);
    const dist = _dir.length();
    _dir.divideScalar(dist);
    const lit = H.phase !== 'leave' && H.phase !== 'down';
    this.cone.visible = lit && dist > 4;
    this.cone.position.copy(m.position);
    this.cone.quaternion.setFromUnitVectors(DOWN, _dir);
    this.cone.scale.set(dist / 18, dist, dist / 18);
    this.spot.position.copy(m.position);
    this.spot.target.position.copy(_F.pos);
    this.spot.intensity = lit ? 900 : 0;
  }

  downHeli() {
    const g = this.g, H = this.heli;
    H.phase = 'down'; H.vh = 4; H.spin = 0;
    g.track.frame(H.s, H.u, H.h, _F, false);
    g.fx.explode(_F.pos, 1.1);
    g.sound.boom(1);
    g.hud.flash(0.5);
    g.onHeliDown();
  }

  hideHeli() {
    this.heli = null;
    this.heliMesh.visible = false;
    this.cone.visible = false;
    this.spot.intensity = 0;
  }

  dropMine(H) {
    const g = this.g;
    const mesh = Models.makeMine();
    const u = THREE.MathUtils.clamp(g.car.u + (Math.random() - 0.5) * 2.4, -6.5, 6.5);
    const o = g.director.addLoose(mesh, { s: H.s, u, hs: 1.1, hu: 1.1, hgt: 0.9, kind: 'mine', active: false });
    o.h = H.h; o.vh = 0; o.mesh = mesh;
    o.onHit = () => {
      if (o.dead) return;
      o.dead = true; o.active = false; mesh.visible = false;
      g.track.frame(o.s, o.u, 0.5, _F);
      g.fx.explode(_F.pos, 0.7);
      g.sound.boom(0.6);
    };
    this.mines = this.mines || [];
    this.mines.push(o);
    g.sound.blip(1500, 0.08, 'square', 0.08);
  }

  updateMines(dt) {
    if (!this.mines) return;
    const T = this.g.track;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const o = this.mines[i];
      if (o.dead || !this.g.director.loose.some((l) => l.o === o)) { this.mines.splice(i, 1); continue; }
      if (o.h <= 0) continue;
      o.vh -= 26 * dt; o.h = Math.max(0, o.h + o.vh * dt);
      o.active = o.h < 1.2;
      T.place(o.mesh, o.s, o.u, o.h);
      if (o.h === 0) { T.frame(o.s, o.u, 0, _F); this.g.fx.sparks(_F.pos, 0, 0, 6); }
    }
  }

  ambientCops(dt) {
    const g = this.g, car = g.car;
    const km = car.s / 1000;
    if (km < 0.3) return;
    this.ambientT -= dt;
    if (this.ambientT > 0) return;
    this.ambientT = Math.max(4, 15 - km * 1.6) + Math.random() * 4;
    const maxCops = Math.min(9, 1 + Math.floor(km * 1.2));
    if (this.chasing().length >= maxCops) return;
    this.ambient.total++;
    this.addCop(car.s - 90, (Math.random() - 0.5) * 10, this.ambient);
  }

  chasing() { return this.cops.filter((c) => c.state === 'chase'); }

  update(dt) {
    const g = this.g, car = g.car, T = g.track;
    this.ambientCops(dt);
    this.updateHeli(dt);
    this.updateMines(dt);
    for (const c of this.cops) {
      c.t += dt;
      if (c.state === 'chase') {
        const ds = car.s - c.s;
        let target = ds > 12 ? car.v + 12 : ds > -6 ? car.v + 3 : car.v - 10;
        // telegraph the ram: a cop must sit on the tail briefly before contact hurts
        if (ds > 0 && ds < 14) {
          if (c.tail === 0) g.hud.popup('COP BEHIND!', 'bad');
          c.tail += dt;
        } else c.tail = Math.max(0, c.tail - dt);
        if (ds > 0 && c.tail < 0.9) target = Math.min(target, car.v + 1);
        target = clamp(target, 20, 96);
        c.v += (target - c.v) * Math.min(1, dt * 1.8);
        const tun = T.tunnelAt(c.s);
        const lim = tun ? 5.2 : 6.8;
        const tu = clamp(tun ? wrapU(car.u) : car.u, -lim, lim);
        c.u += clamp(tu - c.u, -7 * dt, 7 * dt);
        c.u = clamp(c.u, -lim, lim);
        c.s += c.v * dt;

        if (T.gapAt(c.s)) { this.wreck(c, 'fall'); continue; }
        if (T.twistAt(c.s) && Math.cos(T.rollAt(c.s)) < 0.25) { this.wreck(c, 'fall'); c.mesh.visible = false; continue; }
        for (const o of g.director.obstacles) {
          if (o.active && Math.abs(c.s - o.s) < o.hs + 2.3 && Math.abs(c.u - o.u) < o.hu + 0.95) { o.onHit?.(); this.wreck(c, 'crash'); break; }
        }
        if (c.state !== 'chase') continue;
        for (const t of g.traffic.cars) {
          if (t.state === 'drive' && Math.abs(t.s - c.s) < 4.4 && Math.abs(t.u - c.u) < 1.9) {
            g.traffic.wreck(t); this.wreck(c, 'crash'); break;
          }
        }
        if (c.state !== 'chase') continue;
        if (!car.falling && Math.abs(car.s - c.s) < 4.5 && Math.abs(wrapU(car.u - c.u)) < 1.0 + ASSIST.carHalfWidth && car.h < 1.3) {
          if (car.invuln <= 0) g.damage('police');
          c.v = car.v - 25;
          c.tail = 0;
          c.s = Math.min(c.s, car.s - 4.6);
        }
        if (ds > 240) { c.state = 'lost'; c.wave.lost++; }
      } else if (c.state === 'wrecked' || c.state === 'falling') {
        c.v *= 1 - 1.8 * dt;
        c.s += c.v * dt;
        c.vh -= 26 * dt;
        c.h += c.vh * dt;
        const floor = c.state === 'falling' ? -14 : 0;
        if (c.h < floor) { c.h = floor; c.vh = 0; }
        c.spin += c.spinV * dt;
        c.roll += c.spinV * 0.6 * dt;
        c.spinV *= 1 - 1.2 * dt;
      }
    }
    // cleanup
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i];
      if (c.state === 'lost' || car.s - c.s > 160 || c.s - car.s > 700) {
        g.scene.remove(c.mesh);
        this.cops.splice(i, 1);
      }
    }
    if (this.wave && !this.cops.some((c) => c.state === 'chase' && c.wave === this.wave)) {
      const w = this.wave;
      this.wave = null;
      g.onPursuitEnd(w);
    }
  }

  wreck(c, why) {
    if (c.state !== 'chase') return;
    const g = this.g;
    c.state = why === 'fall' ? 'falling' : 'wrecked';
    c.vh = why === 'fall' ? 0 : 9;
    c.spinV = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 5);
    c.wave.wrecked++;
    g.track.frame(c.s, c.u, 0.5, _F);
    if (why !== 'fall') g.fx.explode(_F.pos, 0.6);
    g.sound.crash();
    g.onTakedown(why);
  }

  wreckNear(s, r, u = null, ur = 99) {
    for (const c of this.cops) {
      if (c.state === 'chase' && Math.abs(c.s - s) < r && (u === null || Math.abs(c.u - u) < ur)) this.wreck(c, 'blast');
    }
  }

  nearest(carS) {
    let best = Infinity;
    for (const c of this.cops) if (c.state === 'chase') best = Math.min(best, Math.abs(c.s - carS));
    return best;
  }

  sync() {
    const T = this.g.track;
    for (const c of this.cops) {
      T.place(c.mesh, c.s, c.u, Math.max(c.h, -14), c.spin);
      c.mesh.userData.inner.rotation.z = c.roll;
    }
  }
}
