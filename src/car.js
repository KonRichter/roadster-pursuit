// Roadster physics in track space (s, u, h).
import { ROAD_HALF, TUN_FLOOR, TUN_HALF, arcAngle, wrapU } from './track.js';

const GRAVITY = 26;
const HOP_V = 12.5;
const HOP_COST = 15;

export class Car {
  constructor() { this.reset(); }

  reset() {
    this.s = 0; this.u = 0; this.h = 0;
    this.v = 0; this.vu = 0; this.vh = 0;
    this.grounded = true; this.falling = false;
    this.pressure = 100; this.fan = 100;
    this.suction = false; this.boosting = false; this.accelerating = false; this.hovering = false;
    this.hull = 3; this.invuln = 0;
    this.trick = null; this.trickFlip = false; this.airTime = 0;
    this.launch = 0; this.launchFx = 0; this.frozen = true;
    this.scrape = 0; this.hopBuffer = 0; this.steer = 0; this.hopBurst = 0;
  }

  onWall(track) {
    return !!track.tunnelAt(this.s) && Math.abs(wrapU(this.u)) > TUN_FLOOR + 0.5;
  }

  update(dt, c, track, game) {
    if (this.frozen) return;
    const tz = track.tunnelAt(this.s);
    const gap = track.gapAt(this.s);
    this.steer += (c.steer - this.steer) * Math.min(1, dt * 10);

    // --- suction fans (2 G of downforce in the real car)
    this.suction = c.suction && this.fan > 1 && !this.falling;
    if (this.suction) this.fan = Math.max(0, this.fan - 20 * dt);
    else this.fan = Math.min(100, this.fan + 13 * dt);

    // --- longitudinal
    // standard speed creeps up the longer you survive (134 mph -> ~220 mph)
    const cruise = 60 + Math.min(38, (this.s / 1000) * 3);
    const target = c.brake ? 30 : cruise;
    // rear cold-gas thrusters only fire for the launch at the start of a run
    this.boosting = this.launchFx > 0;
    if (this.launchFx > 0) this.launchFx -= dt;
    this.accelerating = c.boost && !this.falling && this.launch <= 0;
    if (this.launch > 0) {
      this.launch -= dt;
      this.v += 46 * dt;
    } else if (this.accelerating) {
      this.v = Math.min(cruise + 26, this.v + 18 * dt);
    } else {
      const k = this.v > target ? 0.9 : 1.6;
      this.v += (target - this.v) * Math.min(1, k * dt);
    }
    if (this.falling) this.v *= 1 - 1.2 * dt;
    this.s += this.v * dt;

    // --- thrust hop (buffered for forgiving timing)
    if (c.hopReq) this.hopBuffer = 0.2;
    if (this.hopBuffer > 0) {
      this.hopBuffer -= dt;
      if (this.grounded && !this.falling && !this.onWall(track) && this.pressure >= HOP_COST) {
        this.vh = HOP_V; this.grounded = false; this.hopBuffer = 0;
        this.pressure -= HOP_COST; this.airTime = 0; this.hopBurst = 0.18;
        this.trickFlip = !this.trickFlip;
        this.trick = { t: 0, dur: 0.95, kind: this.trickFlip ? 'kickflip' : 'spin' };
        game.onHop();
      }
    }
    if (this.hopBurst > 0) this.hopBurst -= dt;

    // --- lateral
    const grip = this.grounded ? (this.suction ? 1.4 : 1) : 0.45;
    let targetVu = this.steer * (12 + this.v * 0.05);
    let grav = 0;
    if (tz && this.grounded) {
      const uu = wrapU(this.u);
      const a = arcAngle(uu);
      const sg = Math.sign(uu);
      if (a > 0.02 && !this.suction) {
        // without suction the tyres can't hold the wall: slide back to the floor
        grav = -sg * (32 * Math.sin(Math.min(a, Math.PI / 2)) + (a > 1.5 ? 18 : 0));
        if (a > 0.45 && Math.sign(this.steer) === sg) targetVu = 0;
      }
    }
    this.vu += (targetVu - this.vu) * Math.min(1, dt * 6 * grip) + grav * dt;
    this.u += this.vu * dt;

    if (tz) {
      const dIn = this.s - tz.s0, dOut = tz.s1 - this.s;
      const lim = Math.min(7.4 + dIn * 1.5, 7.4 + Math.max(0, dOut - 8) * 0.55);
      if (lim < TUN_HALF) {
        if (Math.abs(this.u) > lim) { this.u = Math.sign(this.u) * lim; this.vu = 0; }
      } else {
        this.u = wrapU(this.u);
      }
    } else {
      const lim = ROAD_HALF - 1.0;
      if (Math.abs(this.u) > lim) {
        if (Math.abs(this.vu) > 3) this.scrape = 0.25;
        this.u = Math.sign(this.u) * lim;
        this.vu *= -0.2;
        this.v -= 8 * dt;
      }
    }
    if (this.scrape > 0) this.scrape -= dt;

    // --- vertical
    if (this.grounded && gap) {
      this.grounded = false; this.falling = true; this.vh = 0;
    }
    if (!this.grounded) {
      this.airTime += dt;
      this.hovering = c.hopHeld && this.pressure > 0.5 && !this.falling && this.hopBurst <= 0;
      if (this.hovering) {
        this.vh += 21 * dt;
        this.pressure = Math.max(0, this.pressure - 20 * dt);
      }
      this.vh -= GRAVITY * dt;
      this.h += this.vh * dt;
      if (this.trick) this.trick.t += dt;

      if (this.h <= 0 && !this.falling) {
        if (gap) {
          this.falling = true;
        } else {
          this.land(game);
        }
      }
      if (this.falling) {
        if (!gap && this.h > -1.0) {
          this.falling = false; // caught the lip
          this.land(game);
        } else if (this.h < -10) {
          game.onFall();
        }
      }
    } else {
      this.hovering = false;
    }

    if (!this.boosting && !this.hovering) this.pressure = Math.min(100, this.pressure + 2.5 * dt);
    if (this.invuln > 0) this.invuln -= dt;
  }

  land(game) {
    const air = this.airTime;
    const done = this.trick && this.trick.t >= this.trick.dur * 0.8;
    this.h = 0; this.vh = 0; this.grounded = true; this.hovering = false;
    this.trick = null; this.airTime = 0;
    game.onLand(air, done);
  }

  trickAngle() {
    if (!this.trick) return 0;
    const p = Math.min(1, this.trick.t / this.trick.dur);
    return p * p * (3 - 2 * p) * Math.PI * 2;
  }
}
