// Civilian traffic: slower cars to weave through. Near misses refill the
// thruster tank, like drafting/drifting fills the meter in Split/Second.
import * as Models from './models.js';
import { wrapU } from './track.js';
import { ASSIST } from './platform.js';

const LANES = [-6, -2, 2, 6];

export class Traffic {
  constructor(game) {
    this.g = game;
    this.cars = [];
    this.timer = 1.5;
  }

  reset() {
    for (const t of this.cars) this.g.scene.remove(t.mesh);
    this.cars = [];
    this.timer = 1.5;
  }

  trySpawn() {
    const g = this.g, carS = g.car.s;
    const s = carS + 330 + Math.random() * 70;
    // the head-over loop must stay empty: you can't dodge anything up there
    if (this.nearLoop(s) || g.track.gapAt(s) || (g.track.tunnelAt(s) && s < g.director.tutorialEnd) || !g.director.isClear(s, s > g.director.tutorialEnd ? 25 : 70)) return;
    const u = LANES[(Math.random() * LANES.length) | 0];
    for (const t of this.cars) if (Math.abs(t.s - s) < 30 && Math.abs(t.u - u) < 3) return;
    const mesh = Models.makeCivilian();
    g.scene.add(mesh);
    const cruise = 26 + Math.random() * 10;
    this.cars.push({ s, u, v: cruise, cruise, h: 0, vh: 0, state: 'drive', mesh, spin: 0, spinV: 0, rel: carS - s, missed: false });
  }

  update(dt) {
    const g = this.g, car = g.car;
    this.timer -= dt;
    if (this.timer <= 0 && car.s > 120) {
      const km = car.s / 1000;
      const late = Math.max(0, car.s - g.director.tutorialEnd) / 1000;
      if (late > 0) {
        // late game: dense traffic that keeps getting denser
        this.timer = Math.max(0.12, 0.45 - late * 0.06) + Math.random() * 0.25;
        if (this.cars.length < Math.min(24, 12 + Math.floor(late * 3))) { this.trySpawn(); this.trySpawn(); }
      } else {
        this.timer = Math.max(0.3, 1.6 - km * 0.15) + Math.random() * Math.max(0.4, 1.2 - km * 0.08);
        if (this.cars.length < Math.min(16, 7 + Math.floor(km * 1.5))) this.trySpawn();
      }
    }
    for (const t of this.cars) {
      if (t.state === 'drive') {
        // heading into the loop: pull off the road instead of driving (or queueing) into it
        if (this.nearLoop(t.s)) { t.gone = true; continue; }
        const blocked = g.director.blockedAhead(t.s, t.u, 40) || g.track.gapAt(t.s + 28) || !g.director.isClear(t.s + 30, 30);
        // far ahead in the haze: quietly take the exit instead of jamming the hazard
        const late = car.s > g.director.tutorialEnd;
        if (blocked && !late && t.s - car.s > 110) { t.gone = true; continue; }
        const target = blocked ? 0 : t.cruise;
        t.v += (target - t.v) * Math.min(1, dt * (blocked ? 2.5 : 1));
        t.s += t.v * dt;

        const ds = car.s - t.s;
        const du = Math.abs(wrapU(car.u - t.u));
        if (!car.falling && Math.abs(ds) < 4.4 && du < 0.95 + ASSIST.carHalfWidth && car.h < 1.25) {
          if (car.invuln <= 0) g.damage('traffic');
          this.wreck(t);
          continue;
        }
        if (t.rel < 0 && ds >= 0 && !t.missed) {
          t.missed = true;
          if (car.h >= 1.25 && du < 2.4) g.onNearMiss('OVER THE TOP');
          else if (du < 3.4 && !car.falling) g.onNearMiss('NEAR MISS');
        }
        t.rel = ds;
      } else {
        t.v *= 1 - 2 * dt;
        t.s += t.v * dt;
        t.vh -= 26 * dt; t.h = Math.max(0, t.h + t.vh * dt);
        t.spin += t.spinV * dt; t.spinV *= 1 - 1.5 * dt;
      }
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const t = this.cars[i];
      if (t.gone || car.s - t.s > 60 || t.s - car.s > 800) { g.scene.remove(t.mesh); this.cars.splice(i, 1); }
    }
  }

  nearLoop(s) {
    const T = this.g.track;
    return !!(T.twistAt(s) || T.twistAt(s + 40) || T.twistAt(s + 80));
  }

  wreck(t) {
    if (t.state !== 'drive') return;
    t.state = 'wrecked';
    t.vh = 6;
    t.spinV = (Math.random() < 0.5 ? -1 : 1) * 6;
  }

  wreckNear(s, r, u = null, ur = 99) {
    for (const t of this.cars) if (t.state === 'drive' && Math.abs(t.s - s) < r && (u === null || Math.abs(t.u - u) < ur)) this.wreck(t);
  }

  sync() {
    for (const t of this.cars) this.g.track.place(t.mesh, t.s, t.u, t.h, t.spin);
  }
}
