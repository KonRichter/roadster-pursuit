import * as THREE from 'three';
import { Track, makeFrame, wrapU } from './track.js';
import { City } from './city.js';
import { makeRoadster, updateFlash, applyCarEnvironment } from './models.js';
import { Car } from './car.js';
import { Director, INFO } from './events.js';
import { Police } from './police.js';
import { Traffic } from './traffic.js';
import { FX } from './fx.js';
import { Sound } from './audio.js';
import { HUD } from './hud.js';
import { input, bindTouch, bindSteer } from './input.js';
import { IS_TOUCH, QUALITY, ASSIST } from './platform.js';
import { loadInto, renderBoard, submitScore } from './leaderboard.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY.antialias, powerPreference: 'high-performance' });
let pixelRatio = QUALITY.pixelRatio;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = QUALITY.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const SKY = 0x0b1226;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 70, QUALITY.fogFar);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1600);

scene.add(new THREE.HemisphereLight(0x6f8cc8, 0x1a1420, 1.25));
const moon = new THREE.DirectionalLight(0xb8c8ff, 1.5);
moon.castShadow = QUALITY.shadows;
moon.shadow.mapSize.set(1024, 1024);
Object.assign(moon.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 160 });
moon.shadow.bias = -0.0006;
moon.shadow.normalBias = 0.04;
scene.add(moon, moon.target);

// ------------------------------------------------------------------ world
const track = new Track(scene, renderer);
const city = new City(scene, track);
const fx = new FX(scene, QUALITY.particles);
const sound = new Sound();
const hud = new HUD();
const car = new Car();
const carMesh = makeRoadster();
applyCarEnvironment(renderer);
scene.add(carMesh);
const headlight = new THREE.SpotLight(0xe6efff, 420, 150, 0.5, 0.6, 1.3);
headlight.position.set(0, 0.8, 2.2);
headlight.target.position.set(0, 0, 40);
carMesh.add(headlight, headlight.target);

const game = {
  scene, track, fx, sound, hud, car,
  state: 'title', heat: 1, score: 0, timeScale: 1, shake: 0, time: 0,
  stats: null, best: 0, overT: 0, countT: 0,
};
game.director = new Director(game);
game.police = new Police(game);
game.traffic = new Traffic(game);
const { director, police, traffic } = game;

try { game.best = Number(localStorage.getItem('roadster-pursuit-best')) || 0; } catch { game.best = 0; }

// ------------------------------------------------------------------ scoring & callbacks
function award(points, label, cls = '') {
  const pts = Math.round(points * (1 + (game.heat - 1) * 0.25));
  game.score += pts;
  hud.popup(`+${pts}`, cls); // keep it tiny: the road ahead matters more
}
const addPressure = (n) => { car.pressure = Math.min(100, car.pressure + n); };

game.onHop = () => {
  sound.hop();
  const F = track.frame(car.s, car.u, 0, _F);
  for (let i = 0; i < 30; i++) {
    fx.vapor.spawn(F.pos.x + (Math.random() - 0.5) * 3, F.pos.y + 0.2, F.pos.z + (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 14, Math.random() * 2, (Math.random() - 0.5) * 14, 0.6 + Math.random() * 0.4, 0.75, 0.82, 0.95, 2.5);
  }
};
game.onLand = (air, trickDone) => {
  if (air > 0.5 && trickDone) {
    game.stats.tricks++;
    award(air > 1.4 ? 450 : 250, car.trickFlip ? 'KICKFLIP' : '360 SPIN', 'gold');
    addPressure(6);
  }
  game.shake = Math.max(game.shake, 0.15);
};
game.onNearMiss = (label) => {
  game.stats.nearMisses++;
  award(label === 'OVER THE TOP' ? 200 : 120, label);
  addPressure(14);
  sound.whoosh();
};
game.onWarn = (type) => {
  const info = INFO[type];
  // touch players have buttons, not keys
  const hint = IS_TOUCH
    ? info.hint.replace('SPACE + HOLD', 'HOLD JUMP').replace('SPACE:', 'TAP JUMP:').replace(/SPACE/g, 'JUMP').replace(/SHIFT/g, 'SUCTION')
    : info.hint;
  hud.warn(info.title, hint, type === 'swoop' ? 4 : 2.6);
  sound.warn();
};
game.onEscape = (type) => {
  game.stats.escapes++;
  const label = { roadblock: 'ROADBLOCK CLEARED', tanker: 'BLAST SURVIVED', overpass: 'COLLAPSE DODGED', gap: 'GAP JUMPED', tunnel: 'WALL RIDE ESCAPE', tower: 'TOWER JUMPED', twist: 'HEAD-OVER!' }[type] || 'ESCAPED';
  award(500, label, 'good');
  addPressure(15);
  sound.score();
  hud.clearWarn();
};
game.onPlanted = () => {
  award(300, 'SUCTION PLANTED', 'good');
  game.shake = Math.max(game.shake, 0.6);
};
game.onTakedown = (why) => {
  game.stats.takedowns++;
  award(400, why === 'fall' ? 'COP OVER THE EDGE' : 'TAKEDOWN', 'gold');
  addPressure(8);
};
game.onHeliDown = () => {
  game.stats.takedowns++;
  award(1500, 'CHOPPER DOWN!', 'gold');
  addPressure(30);
  car.fan = Math.min(100, car.fan + 30);
  game.shake = Math.max(game.shake, 1);
};
game.onPursuitEnd = (w) => {
  if (w.lost > 0 && w.wrecked < w.total) { award(400, 'PURSUIT EVADED', 'good'); }
};
game.blast = (s, r, u = null, ur = 99) => {
  police.wreckNear(s, r, u, ur);
  traffic.wreckNear(s, r, u, ur);
};
game.damage = (kind) => {
  if (car.invuln > 0 || game.state !== 'play') return;
  car.hull -= 1;
  car.invuln = 2.4;
  car.v *= 0.5;
  if (car.grounded && !car.falling) { car.vh = 5; car.grounded = false; car.trick = null; }
  game.stats.hits++;
  game.stats.log.push(`${kind}@${car.s | 0}`);
  director.markHit(car.s);
  const F = track.frame(car.s, car.u, 0.6, _F);
  fx.explode(F.pos, 0.45);
  sound.crash();
  hud.flash(0.35);
  game.shake = 1;
  game.timeScale = kind === 'blast' ? 0.75 : 0.35; // keep the blow-off snappy
  hud.popup(kind === 'fall' ? 'FELL!' : kind === 'blast' ? 'BLOWN OFF!' : 'WRECKED', 'bad');
  if (car.hull <= 0) {
    game.state = 'dying';
    game.overT = 1.4;
    hud.clearWarn();
  }
};
game.onRespawn = () => {
  camU = 0;
  if (game.state === 'play') hud.popup('BACK!', 'good');
};
game.onTwistFall = () => {
  // lost grip upside down: spark burst, then respawn after the loop like a gap fall
  const F = track.frame(car.s, car.u, 0.5, _F);
  fx.explode(F.pos, 0.5);
  game.onFall();
};
game.onFall = () => {
  const gap = track.zoneAt(car.s) || { s1: car.s };
  car.falling = false;
  car.grounded = true;
  car.h = 0; car.vh = 0; car.u = 0; car.vu = 0;
  car.trick = null;
  car.s = Math.max(car.s, gap.s1) + 8;
  car.v = Math.max(car.v, 40);
  camS = car.s - 9.5; camU = 0; camH = 3.3;
  game.damage('fall');
  car.h = 0; car.vh = 0; car.grounded = true;
};

// ------------------------------------------------------------------ state
function resetRun() {
  director.reset();
  police.reset();
  traffic.reset();
  track.reset();
  fx.clear();
  hud.reset();
  car.reset();
  game.heat = 1; game.score = 0; game.timeScale = 1; game.shake = 0;
  game.stats = { escapes: 0, takedowns: 0, nearMisses: 0, tricks: 0, hits: 0, log: [] };
  game.nextRepair = 2500;
  game.lateAnnounced = false;
  director.plan(0);
  track.update(0);
  city.reset(0);
  camS = -9.5; camU = 0; camH = 3.3;
  camPos.set(0, 4, 12);
}

function startRun() {
  goFullscreen();
  sound.init();
  resetRun();
  sound.startMusic();
  game.state = 'countdown';
  game.countT = 3.2;
  game.lastCount = 4;
  showScreen(null);
  hud.show(true);
  showTouch(true);
}

function endRun() {
  game.state = 'over';
  showTouch(false);
  sound.setMusicLevel(0.3);
  hud.show(false);
  const score = Math.floor(game.score);
  const newBest = score > game.best;
  if (newBest) {
    game.best = score;
    try { localStorage.setItem('roadster-pursuit-best', String(score)); } catch { /* storage unavailable */ }
  }
  $('over-title').textContent = car.hull <= 0 ? 'BUSTED' : 'RUN OVER';
  $('over-score').textContent = score.toLocaleString();
  $('over-best').textContent = newBest ? 'NEW BEST!' : `Best: ${game.best.toLocaleString()}`;
  $('st-dist').textContent = (car.s / 1000).toFixed(2);
  $('st-escapes').textContent = game.stats.escapes;
  $('st-takedowns').textContent = game.stats.takedowns;
  $('st-near').textContent = game.stats.nearMisses;
  game.lastRun = { score, distance: +(car.s / 1000).toFixed(2) };
  const form = $('submit-form');
  form.classList.toggle('hidden', score <= 0);
  form.querySelector('.submit-row').classList.remove('hidden');
  $('submit-msg').textContent = '';
  $('submit-msg').className = 'submit-msg';
  try { $('nick').value = localStorage.getItem('roadster-pursuit-nick') || ''; } catch { /* storage unavailable */ }
  loadInto($('board-over'));
  showScreen('screen-over');
}

function showScreen(id) {
  for (const s of ['screen-title', 'screen-pause', 'screen-over']) $(s).classList.toggle('hidden', s !== id);
}

function setPaused(p) {
  if (p && game.state === 'play') { game.state = 'paused'; showScreen('screen-pause'); sound.setMusicLevel(0.25); input.releaseTouch(); }
  else if (!p && game.state === 'paused') { game.state = 'play'; showScreen(null); sound.setMusicLevel(0.75); }
}

$('btn-start').addEventListener('click', startRun);
$('btn-skip').addEventListener('click', () => $('submit-form').classList.add('hidden'));
$('submit-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const name = $('nick').value.trim().replace(/\s+/g, ' ');
  const msg = $('submit-msg');
  if (!/^[\p{L}\p{N} ._-]{2,16}$/u.test(name)) {
    msg.textContent = 'Nickname: 2–16 letters, numbers, space, . _ -';
    msg.className = 'submit-msg err';
    return;
  }
  msg.textContent = 'Submitting…'; msg.className = 'submit-msg';
  try {
    const res = await submitScore(name, game.lastRun.score, game.lastRun.distance);
    try { localStorage.setItem('roadster-pursuit-nick', name); } catch { /* storage unavailable */ }
    $('submit-form').querySelector('.submit-row').classList.add('hidden');
    msg.textContent = `You're #${res.rank} on the leaderboard!`;
    msg.className = 'submit-msg ok';
    renderBoard($('board-over'), res.entries, { name, score: game.lastRun.score });
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'submit-msg err';
  }
});
$('btn-restart').addEventListener('click', startRun);
$('btn-resume').addEventListener('click', () => setPaused(false));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
bindTouch($('touch'));
bindSteer($('steer-zone'), $('stick-base'), $('stick-knob'));
function showTouch(on) {
  if (!IS_TOUCH) return;
  $('touch').classList.toggle('hidden', !on);
  if (!on) input.releaseTouch();
}
if (IS_TOUCH) {
  // touch instructions instead of keyboard ones
  document.querySelector('#screen-title .howto').innerHTML = `
    <div class="how"><div class="keys"><span class="tk">&#9664; &#9654;</span></div><div class="or">drag lower screen</div><b>Steer</b></div>
    <div class="how jump"><div class="keys"><span class="tk round">JUMP</span></div><div class="or">hold = fly</div><b>Thrust jump</b></div>
    <div class="how suck"><div class="keys"><span class="tk round">SUCTION</span></div><div class="or">hold</div><b>Suction</b></div>`;
}
// Phones/tablets are portrait-only: sideways shows a rotate prompt and pauses.
function isLandscape() {
  const t = screen.orientation && screen.orientation.type;
  if (t) return t.startsWith('landscape');
  if (typeof window.orientation === 'number') return Math.abs(window.orientation) === 90;
  return window.innerWidth > window.innerHeight;
}
function checkOrientation() {
  if (!IS_TOUCH) return;
  const land = isLandscape();
  document.documentElement.classList.toggle('landscape', land);
  if (land) setPaused(true);
}
screen.orientation?.addEventListener?.('change', checkOrientation);
window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 100));
checkOrientation();

function goFullscreen() {
  if (!IS_TOUCH || document.fullscreenElement) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  Promise.resolve(req.call(el, { navigationUI: 'hide' }))
    .then(() => screen.orientation?.lock?.('portrait'))
    .catch(() => { /* not supported (e.g. iPhone Safari): play in the browser UI */ });
}

// ------------------------------------------------------------------ simulation
const ctrl = { steer: 0, suction: false, hopReq: false, hopHeld: false };

function step(dt) {
  car.update(dt, ctrl, track, game);
  ctrl.hopReq = false;
  director.update(dt);
  police.update(dt);
  traffic.update(dt);

  if (game.state === 'play' && car.invuln <= 0 && !car.falling) {
    for (const o of director.obstacles) {
      if (!o.active) continue;
      if (Math.abs(car.s - o.s) < o.hs + 2.2 && Math.abs(wrapU(car.u - o.u)) < o.hu + ASSIST.carHalfWidth && car.h < o.hgt * 0.85) {
        game.damage(o.kind);
        if (o.kind === 'roadblock' || o.kind === 'debris') o.active = false;
        o.onHit?.();
        break;
      }
    }
  }

  if (game.state === 'play') {
    game.score += car.v * dt * 0.5;
    game.heat = Math.min(5, 1 + Math.floor(car.s / 1500));
    if (!game.lateAnnounced && car.s > director.tutorialEnd) {
      game.lateAnnounced = true;
      hud.popup('RUSH HOUR', 'gold');
      sound.warn();
    }
    if (car.s > game.nextRepair) {
      game.nextRepair += 2500;
      if (car.hull < 3) { car.hull++; hud.popup('+1 \u2764', 'good'); }
    }
  }
}

// ------------------------------------------------------------------ visuals
const _F = makeFrame();
const CF = makeFrame();
const _x = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 4, 12);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const camUp = new THREE.Vector3(0, 1, 0);
const look = new THREE.Vector3();
let camS = -9.5, camU = 0, camH = 3.3, fov = 68;

function syncCar(dt) {
  const F = track.frame(car.s, car.u, Math.max(car.h, -14), _F, car.falling || car.thrown > 0 ? false : undefined);
  _x.crossVectors(F.up, F.fwd);
  _m4.makeBasis(_x, F.up, F.fwd);
  carMesh.position.copy(F.pos);
  carMesh.quaternion.setFromRotationMatrix(_m4);
  const yaw = -Math.atan2(car.vu, Math.max(car.v, 15)) * 0.9;
  _q.setFromAxisAngle(Y_AXIS, yaw);
  carMesh.quaternion.multiply(_q);

  const inner = carMesh.userData.inner;
  const ang = car.trickAngle();
  const kick = car.trick && car.trick.kind === 'kickflip';
  const pitch = car.grounded ? 0 : THREE.MathUtils.clamp(-car.vh * 0.015, -0.3, 0.3);
  _e.set(pitch, kick ? 0 : ang, (kick ? ang : 0) - car.steer * 0.05, 'YXZ');
  inner.rotation.copy(_e);

  const ud = carMesh.userData;
  const suck = car.suction ? 1 : 0;
  ud.fanMat.emissiveIntensity += ((0.6 + suck * 4) - ud.fanMat.emissiveIntensity) * Math.min(1, dt * 10);
  ud.aura.material.opacity += ((car.grounded ? suck * 0.75 : 0) - ud.aura.material.opacity) * Math.min(1, dt * 10);
  ud.wing.position.y += ((car.suction ? 1.1 : 0.86) - ud.wing.position.y) * Math.min(1, dt * 8);
  const spin = (car.v * dt) / 0.38;
  for (const w of ud.wheels) w.rotation.x += spin;
  const thrusting = car.boosting || car.hovering || car.hopBurst > 0;
  ud.nozzleGlow.emissiveIntensity += ((thrusting ? 6 : 0.6) - ud.nozzleGlow.emissiveIntensity) * Math.min(1, dt * 12);
  carMesh.visible = car.invuln <= 0 || Math.floor(game.time * 16) % 2 === 0 || game.state !== 'play';
  carMesh.updateMatrixWorld();

  // thruster plumes (cold gas = white vapour)
  if (game.state === 'play' || game.state === 'dying') {
    if (car.boosting) {
      _d.set(0, 0, -1).transformDirection(carMesh.matrixWorld);
      for (const n of ud.nozzlesRear) {
        _v.copy(n).applyMatrix4(carMesh.matrixWorld);
        for (let i = 0; i < 10; i++) {
          // spread spawns along the jet so it reads as one continuous plume
          const o = Math.random() * 2.5, sp = 14 + Math.random() * 18;
          fx.vapor.spawn(_v.x + _d.x * o, _v.y + _d.y * o, _v.z + _d.z * o,
            _d.x * sp + (Math.random() - 0.5) * 5, _d.y * sp + Math.random() * 2, _d.z * sp + (Math.random() - 0.5) * 5,
            0.25 + Math.random() * 0.35, 0.55, 0.62, 0.75, 3);
        }
      }
    }
    if (car.hovering || car.hopBurst > 0) {
      _d.set(0, -1, 0).transformDirection(carMesh.matrixWorld);
      for (const n of ud.nozzlesDown) {
        _v.copy(n).applyMatrix4(carMesh.matrixWorld);
        fx.vapor.spawn(_v.x, _v.y, _v.z, _d.x * 18, _d.y * 18, _d.z * 18, 0.3 + Math.random() * 0.2, 0.75, 0.85, 1, 2);
      }
    }
    if (car.scrape > 0) {
      const F2 = track.frame(car.s, car.u + Math.sign(car.u) * 1, 0, _F);
      fx.sparks(F2.pos, -Math.sign(car.u) * 0.3, 1, 3);
    }
  }
}

function syncCamera(dt) {
  const tun = !!track.tunnelAt(car.s);
  const k = 1 - Math.exp(-dt * 7);
  const portrait = camera.aspect < 1;
  // phone held upright: high chase cam that looks far down the road, car stays big and centred
  const tall = portrait && IS_TOUCH;
  camS = car.s - (tall ? 8.5 : portrait ? 13 : IS_TOUCH ? 7.2 : 9.5) - (car.boosting ? 3 : 0);
  const du = tun ? wrapU(car.u - camU) : car.u - camU;
  camU += du * (1 - Math.exp(-dt * 6));
  if (tun) camU = wrapU(camU); else camU = THREE.MathUtils.clamp(camU, -9, 9);
  camH += ((tall ? 6 : portrait ? 5.4 : IS_TOUCH ? 2.7 : 3.3) + Math.max(car.h, -6) * 0.6 - camH) * k;
  const C = track.frame(camS, camU * (tall ? 1 : 0.85), camH, CF, car.falling ? false : undefined);
  camPos.lerp(C.pos, 1 - Math.exp(-dt * 14));
  const F = track.frame(car.s, car.u, Math.max(car.h, -14), _F, car.falling ? false : undefined);
  camUp.lerp(C.up, 1 - Math.exp(-dt * 5)).normalize();

  camera.position.copy(camPos);
  if (game.shake > 0) {
    const a = game.shake * 0.5;
    camera.position.x += (Math.random() - 0.5) * a;
    camera.position.y += (Math.random() - 0.5) * a;
    game.shake = Math.max(0, game.shake - dt * 2.2);
  }
  camera.up.copy(camUp);
  look.copy(F.pos).addScaledVector(F.fwd, tall ? 17 : 12).addScaledVector(camUp, tall ? 0.2 : 1.1);
  camera.lookAt(look);

  // keep about 72 degrees of horizontal view in portrait
  const baseFov = tall ? 74 : portrait ? Math.min(100, 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(36)) / camera.aspect))) : (IS_TOUCH ? 60 : 66);
  const fovT = baseFov + (car.boosting ? 16 : 0) + Math.max(0, car.v - 55) * 0.12;
  fov += (fovT - fov) * (1 - Math.exp(-dt * 4));
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }

  moon.position.set(carMesh.position.x - 30, carMesh.position.y + 60, carMesh.position.z + 10);
  moon.target.position.copy(carMesh.position);
}

// title-screen attract camera
function titleCamera(t) {
  const F = track.frame(car.s, 0, 0, _F);
  const r = game.titleRadius || 9;
  camera.position.set(F.pos.x + Math.sin(t * 0.25) * r, r * 0.27, F.pos.z + Math.cos(t * 0.25) * r);
  camera.up.set(0, 1, 0);
  camera.lookAt(F.pos.x, 0.7, F.pos.z);
  moon.position.set(F.pos.x - 30, 60, F.pos.z + 10);
  moon.target.position.copy(F.pos);
}

// ------------------------------------------------------------------ loop
let last = performance.now();
let perfAcc = 0, perfN = 0, quality = 2;

function adaptQuality(dt) {
  perfAcc += dt; perfN++;
  if (perfAcc < 2.5) return;
  const avg = perfAcc / perfN;
  perfAcc = 0; perfN = 0;
  if (avg > 0.021 && quality > 0) {
    quality--;
    if (quality === 1) { pixelRatio = Math.min(pixelRatio, 1); renderer.setPixelRatio(pixelRatio); }
    if (quality === 0) {
      renderer.shadowMap.enabled = false; moon.castShadow = false;
      if (IS_TOUCH) { pixelRatio = 0.8; renderer.setPixelRatio(pixelRatio); }
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.time += rawDt;

  if (input.hit('mute')) sound.setMuted(!sound.muted);
  if (input.hit('pause')) setPaused(game.state === 'play');
  if ((game.state === 'title' || game.state === 'over') && input.hit('start')) startRun();

  if (game.state === 'countdown' || game.state === 'play' || game.state === 'dying') {
    if (game.state !== 'dying') adaptQuality(rawDt);
    game.timeScale += (1 - game.timeScale) * Math.min(1, rawDt * 1.6);
    const sdt = rawDt * (game.state === 'dying' ? 0.3 : game.timeScale);

    if (game.state === 'countdown') {
      game.countT -= rawDt;
      const n = Math.ceil(game.countT - 0.2);
      if (n !== game.lastCount && n >= 0) {
        game.lastCount = n;
        if (n > 0) { hud.center(String(n), 0.8); sound.count(false); }
        else {
          hud.center('GO!', 0.7); sound.count(true);
          game.state = 'play';
          car.frozen = false; car.launch = 0.81; car.launchFx = 1.6;
          game.shake = 0.7;
          hud.flash(0.25);
          setTimeout(() => game.state === 'play' && hud.popup('0–60 MPH IN 0.81 s', 'gold'), 650);
        }
      }
    }

    ctrl.steer = input.steer();
    ctrl.suction = input.down('suction');
    ctrl.hopHeld = input.down('hop');
    if (input.hit('hop')) ctrl.hopReq = true;

    const steps = Math.max(1, Math.ceil(sdt / (1 / 120)));
    const h = sdt / steps;
    for (let i = 0; i < steps; i++) step(h);

    if (game.state === 'dying') {
      game.overT -= rawDt;
      if (game.overT <= 0) endRun();
    }
    track.update(car.s);
    syncCar(rawDt);
    police.sync();
    traffic.sync();
    syncCamera(rawDt);
    hud.update(rawDt, car, game);
  } else if (game.state === 'title') {
    syncCar(rawDt);
    titleCamera(game.time);
  }

  city.update(car.s, camera);
  updateFlash(game.time);
  fx.update(game.state === 'paused' ? 0 : rawDt * (game.state === 'dying' ? 0.3 : 1));
  sound.update({
    running: game.state === 'play' || game.state === 'dying',
    speed: car.v,
    thrust: car.boosting || car.hovering || car.hopBurst > 0,
    suction: car.suction,
    siren: Math.max(0, 1 - Math.min(police.nearest(car.s), director.nearestRoadblock(car.s)) / 200),
    rotor: police.heli ? Math.max(0, 1 - Math.abs(police.heli.s - car.s) / 250) : 0,
  });

  renderer.render(scene, camera);
  input.endFrame();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
window.visualViewport?.addEventListener('resize', onResize);
window.addEventListener('resize', onResize);

// boot
resetRun();
showScreen('screen-title');
if (params.has('auto')) startRun();
requestAnimationFrame(frame);

// debug handle for automated checks
window.__game = game;
game.camera = camera;
game.carMesh = carMesh;
