// Split/Second-style event director: schedules hazards ahead of the car,
// telegraphs them, triggers them and owns the obstacle list used for collisions.
import * as THREE from 'three';
import * as Models from './models.js';
import { makeFrame } from './track.js';

const PRE = { roadblock: 0, tanker: 0, overpass: 0, gap: 0, tunnel: 150, pursuit: 0, heli: 0, tower: 0 };
const POST = { roadblock: 30, tanker: 30, overpass: 40, gap: 40, tunnel: 140, pursuit: 40, heli: 60, tower: 30 };
const GAP_LEN = 36;
export const INFO = {
  roadblock: { title: 'POLICE ROADBLOCK', hint: 'SPACE: thrust hop over it' },
  tanker: { title: 'TANKER DETONATION', hint: 'HOLD SHIFT: suction keeps you planted' },
  overpass: { title: 'OVERPASS COLLAPSE', hint: 'Steer for the open lane or hop the debris' },
  gap: { title: 'BRIDGE OUT', hint: 'SPACE + HOLD: thrust jump & hover across' },
  tunnel: { title: 'TUNNEL CAVE-IN', hint: 'HOLD SHIFT + steer up the wall' },
  pursuit: { title: 'POLICE INBOUND – WATCH OUT!', hint: '' },
  heli: { title: 'POLICE CHOPPER', hint: 'Dodge the mines · ram it when it swoops low' },
  tower: { title: 'TOWER COLLAPSE', hint: 'SPACE: jump over it!' },
  swoop: { title: 'RAM THE HELI!', hint: 'Hold SPACE to fly up into it' },
};
const TUTORIAL = ['pursuit', 'tower', 'roadblock', 'tanker', 'heli', 'gap', 'tunnel', 'overpass'];
const align4 = (s) => Math.round(s / 4) * 4;
const rand = (a, b) => a + Math.random() * (b - a);
const _F = makeFrame();
const _v = new THREE.Vector3();

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export class Director {
  constructor(game) {
    this.g = game;
    this.events = [];
    this.obstacles = [];
    this.reset();
  }

  reset() {
    for (const e of this.events) this.despawn(e);
    this.events = [];
    for (const l of this.loose || []) this.g.scene.remove(l.mesh);
    this.loose = [];
    this.obstacles = [];
    this.cursor = 160;
    this.tutorialEnd = Infinity;
    this.count = 0;
    this.bag = [];
    this.last = null;
  }

  pickType() {
    if (this.count < TUTORIAL.length) return TUTORIAL[this.count];
    if (!this.bag.length) {
      const pool = ['roadblock', 'tanker', 'overpass', 'gap', 'tunnel', 'pursuit', 'heli', 'tower'];
      if (this.g.heat >= 2) pool.push('roadblock', 'pursuit', 'tanker', 'heli', 'tower');
      if (this.g.heat >= 3) pool.push('overpass', 'gap');
      if (this.g.heat >= 4) pool.push('pursuit', 'heli', 'roadblock');
      this.bag = shuffle(pool);
      if (this.bag[this.bag.length - 1] === this.last) this.bag.unshift(this.bag.pop());
    }
    return this.bag.pop();
  }

  plan(carS) {
    while (this.cursor < carS + 820) {
      const type = this.pickType();
      this.count++;
      this.last = type;
      const s = align4(this.cursor + PRE[type]);
      const e = { type, s, spawned: false, warned: false, triggered: false, done: false, hit: false, meshes: [], obs: [], anim: [] };
      if (type === 'gap') { e.zone = { type: 'gap', s0: s, s1: s + GAP_LEN }; this.g.track.addZone(e.zone); }
      if (type === 'tunnel') { e.zone = { type: 'tunnel', s0: s - PRE.tunnel, s1: s + POST.tunnel - 10 }; this.g.track.addZone(e.zone); }
      e.clear = type === 'gap' ? GAP_LEN + 4 : type === 'tunnel' ? 12 : 8;
      this.events.push(e);
      if (this.count === TUTORIAL.length) this.tutorialEnd = s + POST[type];
      // events come faster the further you get
      const km = this.g.car.s / 1000;
      const spacing = Math.max(110, 330 - km * 28) + Math.random() * Math.max(30, 90 - km * 8);
      this.cursor = s + POST[type] + spacing;
    }
  }

  addObs(e, o) {
    o.e = e;
    if (o.active === undefined) o.active = true;
    e.obs.push(o);
    this.obstacles.push(o);
    return o;
  }

  addMesh(e, m) { this.g.scene.add(m); e.meshes.push(m); return m; }

  // ------------------------------------------------------------------ spawn
  spawn(e) {
    e.spawned = true;
    const T = this.g.track;
    const s = e.s;
    if (e.type === 'roadblock') {
      const lanes = [-5.4, -1.8, 1.8, 5.4];
      for (const u of lanes) {
        const cop = this.addMesh(e, Models.makeCop());
        const yaw = Math.PI / 2 + rand(-0.12, 0.12);
        T.place(cop, s + rand(-0.6, 0.6), u, 0, yaw);
        this.addObs(e, { s, u, hs: 1.3, hu: 2.05, hgt: 1.6, kind: 'roadblock', mesh: cop });
      }
      const strip = this.addMesh(e, Models.makeSpikeStrip());
      T.place(strip, s - 9, 0, 0);
      this.addObs(e, { s: s - 9, u: 0, hs: 0.5, hu: 8, hgt: 0.4, kind: 'spikes', mesh: strip });
      for (const side of [-1, 1]) T.place(this.addMesh(e, Models.makeWarnLight()), s - 40, side * 8.2, 0);
    } else if (e.type === 'tanker') {
      e.side = Math.random() < 0.5 ? -1 : 1;
      e.u = e.side * 5.6;
      const tk = this.addMesh(e, Models.makeTanker());
      T.place(tk, s, e.u, 0);
      e.tanker = tk;
      e.tankObs = this.addObs(e, { s, u: e.u, hs: 5.7, hu: 1.35, hgt: 3.2, kind: 'tanker', mesh: tk });
    } else if (e.type === 'overpass') {
      const op = this.addMesh(e, Models.makeOverpass());
      T.place(op, s, 0, 0, 0, false);
      e.overpass = op;
    } else if (e.type === 'gap') {
      const river = this.addMesh(e, Models.makeRiver(GAP_LEN + 30));
      T.frame(s + GAP_LEN / 2, 0, 0, _F, false);
      river.position.set(_F.pos.x, -11.6, _F.pos.z);
      for (const ls of [s, s + GAP_LEN]) {
        for (let k = 0; k < 5; k++) {
          const r = this.addMesh(e, Models.makeRock(rand(0.6, 1.2)));
          T.frame(ls + (ls === s ? 1 : -1), rand(-7.5, 7.5), -0.8, _F, false);
          r.position.copy(_F.pos);
        }
      }
      for (const side of [-1, 1]) {
        T.place(this.addMesh(e, Models.makeWarnLight()), s - 30, side * 8.2, 0, 0, false);
        T.place(this.addMesh(e, Models.makeWarnLight()), s - 4, side * 8.2, 0, 0, false);
      }
    } else if (e.type === 'tunnel') {
      for (const ps of [e.zone.s0, e.zone.s1]) T.place(this.addMesh(e, Models.makePortal()), ps, 0, 0, 0, false);
      // rubble pile across the floor and lower walls; the clear lane is high on a wall
      for (let k = 0; k < 18; k++) {
        const u = -10.2 + (20.4 * k) / 17 + rand(-0.5, 0.5);
        const size = rand(1.1, 2.0);
        const rock = this.addMesh(e, Models.makeRock(size));
        const ds = rand(-5, 5);
        T.place(rock, s + ds, u, size * 0.6, 0, true);
        e.anim.push({ m: rock, s: s + ds, u, h: size * 0.6 + 9, h0: size * 0.6, vh: 0, mode: true });
        if (Math.abs(u) < 7) {
          const top = this.addMesh(e, Models.makeRock(size * 0.9));
          e.anim.push({ m: top, s: s + ds + rand(-2, 2), u: u + rand(-1, 1), h: size * 1.8 + 11, h0: size * 1.8, vh: 0, mode: true });
        }
      }
      this.addObs(e, { s, u: 0, hs: 6.5, hu: 10.2, hgt: 6, kind: 'rubble' });
      for (const a of e.anim) T.place(a.m, a.s, a.u, a.h, 0, a.mode);
    } else if (e.type === 'tower') {
      e.side = Math.random() < 0.5 ? -1 : 1;
      e.tower = this.addMesh(e, Models.makeTower());
      T.place(e.tower, s, e.side * 16, 0, 0, false);
      e.ang = 0; e.angV = 0;
      // lies across every lane once down: jump it
      e.towerObs = this.addObs(e, { s, u: 0, hs: 1.3, hu: 9, hgt: 2.4, kind: 'tower', active: false });
    }
  }

  updateTower(e, d, dt) {
    const g = this.g;
    if (!e.triggered && d < 230) {
      e.triggered = true; e.warned = true;
      g.onWarn('tower');
      g.sound.rumble();
      e.angV = 0.05;
    }
    if (!e.triggered || e.landed) return;
    e.angV += 1.9 * dt;
    e.ang = Math.min(Math.PI / 2, e.ang + e.angV * dt);
    e.tower.userData.mast.rotation.z = -e.side * e.ang;
    if (e.ang >= Math.PI / 2) {
      e.landed = true;
      e.towerObs.active = true;
      g.shake = Math.max(g.shake, 1);
      g.sound.boom(0.9);
      g.blast(e.s, 5);
      for (let u = -8; u <= 8; u += 4) { g.track.frame(e.s, u, 0.5, _F, false); g.fx.dust(_F.pos, 2, 10); g.fx.sparks(_F.pos, 0, 1, 6); }
    }
  }

  // Loose obstacles (helicopter mines) that don't belong to a scheduled event.
  addLoose(mesh, o) {
    o.e = null;
    if (o.active === undefined) o.active = true;
    this.g.scene.add(mesh);
    this.loose.push({ mesh, o });
    this.obstacles.push(o);
    return o;
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const g = this.g, car = g.car, T = g.track;
    this.plan(car.s);
    for (const e of this.events) {
      const d = e.s - car.s;
      if (!e.spawned && d < 470 && e.type !== 'pursuit' && e.type !== 'heli') this.spawn(e);

      const warnTime = e.type === 'tunnel' ? 3.4 : 2.7;
      if (!e.warned && e.type !== 'pursuit' && e.type !== 'heli' && e.type !== 'tower' && d < Math.max(car.v, 25) * warnTime) {
        e.warned = true;
        g.onWarn(e.type);
      }

      if (e.type === 'tanker' && e.spawned) this.updateTanker(e, d, dt);
      if (e.type === 'tower' && e.spawned) this.updateTower(e, d, dt);
      if (e.type === 'overpass' && e.spawned) this.updateOverpass(e, d, dt);
      if (e.type === 'tunnel' && e.spawned && !e.triggered && d < 150) {
        e.triggered = true;
        for (const a of e.anim) a.falling = true;
        g.sound.rumble();
        g.shake = Math.max(g.shake, 0.5);
      }
      if (e.type === 'pursuit' && !e.triggered && d < 0) {
        e.triggered = true; e.done = true;
        g.onWarn('pursuit');
        g.police.spawnWave(2 + Math.min(6, Math.floor(car.s / 1200)), car.s);
      }
      if (e.type === 'heli' && !e.triggered && d < 0) {
        e.triggered = true; e.done = true;
        g.onWarn('heli');
        g.police.spawnHeli(5 + Math.min(8, Math.floor(car.s / 1000)));
      }

      for (const a of e.anim) {
        if (!a.falling) continue;
        a.vh -= 30 * dt; a.h += a.vh * dt;
        if (a.h <= a.h0) { a.h = a.h0; a.falling = false; }
        T.place(a.m, a.s, a.u, a.h, a.yaw || 0, a.mode);
        if (!a.falling && e.type === 'tunnel') { T.frame(a.s, a.u, 0, _F, true); g.fx.dust(_F.pos, 1.5, 3); }
      }

      if (!e.done && e.type !== 'pursuit' && e.type !== 'heli' && car.s > e.s + e.clear) {
        e.done = true;
        if (!e.hit) g.onEscape(e.type);
      }
    }
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const l = this.loose[i];
      if (car.s > l.o.s + 60) {
        g.scene.remove(l.mesh);
        this.loose.splice(i, 1);
        const k = this.obstacles.indexOf(l.o);
        if (k >= 0) this.obstacles.splice(k, 1);
      }
    }
    // despawn passed events
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (car.s > e.s + POST[e.type] + 150) { this.despawn(e); this.events.splice(i, 1); }
    }
  }

  updateTanker(e, d, dt) {
    const g = this.g, car = g.car;
    if (!e.triggered && d < 26) {
      e.triggered = true;
      e.blastT = 0.5;
      e.burnT = 4;
      e.tanker.visible = false;
      e.tankObs.active = false;
      g.track.frame(e.s, e.u, 1.5, _F);
      g.fx.explode(_F.pos, 1.4);
      g.sound.boom(1.2);
      g.hud.flash(0.55);
      g.shake = Math.max(g.shake, 1.1);
      g.blast(e.s, 40);
    }
    if (e.blastT > 0) {
      e.blastT -= dt;
      const near = Math.abs(car.s - e.s) < 32 && !car.falling;
      if (near && car.suction && !e.planted) { e.planted = true; g.onPlanted(); }
      if (e.blastT <= 0 && !e.planted && Math.abs(car.s - e.s) < 45) {
        g.damage('blast');
        car.throwOff(-e.side);
      }
    }
    if (e.burnT > 0) {
      e.burnT -= dt;
      g.track.frame(e.s + rand(-5, 5), e.u, 0.5, _F);
      g.fx.burn(_F.pos, 1.5);
    }
  }

  updateOverpass(e, d, dt) {
    const g = this.g;
    if (!e.triggered && d < 115) {
      e.triggered = true;
      e.overpass.userData.deck.visible = false;
      g.sound.rumble();
      g.shake = Math.max(g.shake, 0.6);
      const lanes = shuffle([-6, -2, 2, 6]);
      lanes.pop(); // one lane always stays open
      for (const u of lanes) {
        const off = rand(-7, 7);
        const slab = this.addMesh(e, Models.makeSlab());
        const a = { m: slab, s: e.s + off, u, h: 7.6, h0: 0.6, vh: 0, falling: true, obs: null, yaw: rand(-0.25, 0.25), mode: false };
        a.obs = this.addObs(e, { s: a.s, u, hs: 2.7, hu: 1.8, hgt: 1.4, kind: 'debris', active: false, mesh: slab });
        e.anim.push(a);
      }
      g.track.frame(e.s, 0, 7, _F, false);
      g.fx.dust(_F.pos, 14, 40);
    }
    for (const a of e.anim) {
      if (a.obs) a.obs.active = a.h < 2.6;
      if (!a.falling && !a.dusted) {
        a.dusted = true;
        g.track.frame(a.s, a.u, 0, _F);
        g.fx.dust(_F.pos, 3, 14);
        g.blast(a.s, 4, a.u, 3);
      }
    }
  }

  // Traffic uses this to stop before hazards instead of driving into them.
  blockedAhead(s, u, dist) {
    for (const o of this.obstacles) {
      if (!o.active) continue;
      const ds = o.s - s;
      if (ds > 0 && ds < dist && Math.abs(o.u - u) < o.hu + 1.2) return true;
    }
    return false;
  }

  isClear(s, margin) {
    for (const e of this.events) if (Math.abs(e.s - s) < margin) return false;
    return true;
  }

  markHit(carS) {
    for (const e of this.events) if (!e.done && Math.abs(carS - e.s) < 160) e.hit = true;
  }

  despawn(e) {
    for (const m of e.meshes) this.g.scene.remove(m);
    e.meshes = [];
    if (e.obs.length) this.obstacles = this.obstacles.filter((o) => o.e !== e);
    e.obs = [];
  }

  nearestRoadblock(carS) {
    let best = Infinity;
    for (const e of this.events) {
      if (e.type !== 'roadblock' || !e.spawned) continue;
      const d = Math.abs(e.s - carS);
      if (d < best) best = d;
    }
    return best;
  }
}

