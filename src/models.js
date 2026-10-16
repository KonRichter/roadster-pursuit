// Procedural low-poly models. Geometry and materials are shared; clone() the
// templates to get cheap instances.
import * as THREE from 'three';

const mats = {};
function std(key, o) { return mats[key] || (mats[key] = new THREE.MeshStandardMaterial(o)); }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const mesh = (geo, mat, x = 0, y = 0, z = 0, shadow = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  return m;
};

export const flash = {
  red: new THREE.MeshStandardMaterial({ color: 0x330008, emissive: 0xff1030, emissiveIntensity: 4 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x000a33, emissive: 0x2a5cff, emissiveIntensity: 4 }),
  amber: new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xff8a00, emissiveIntensity: 4 }),
};
export function updateFlash(t) {
  const a = Math.sin(t * 18) > 0;
  flash.red.emissiveIntensity = a ? 6 : 0.2;
  flash.blue.emissiveIntensity = a ? 0.2 : 6;
  flash.amber.emissiveIntensity = Math.sin(t * 9) > 0 ? 5 : 0.3;
}

export function radialTexture(inner = 'rgba(255,255,255,1)', size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.4, inner.replace(/[\d.]+\)$/, '0.45)'));
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 18).rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.32, 10).rotateZ(Math.PI / 2);
function addWheels(root, x, zs, y = 0.36) {
  const tire = std('tire', { color: 0x0b0b0d, roughness: 0.9 });
  const rim = std('rim', { color: 0x9aa3ad, roughness: 0.3, metalness: 0.8 });
  for (const z of zs) for (const sx of [-1, 1]) {
    root.add(mesh(wheelGeo, tire, sx * x, y, z, false));
    root.add(mesh(rimGeo, rim, sx * x, y, z, false));
  }
}

function extrudeProfile(points, width, bevel = 0.07) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2); // profile x (length) -> +Z, extrusion -> X
  return geo;
}

// Pivot helper: outer group sits on the ground, `inner` pivots around the
// body's centre so flips and spins look right.
function pivoted(pivotY) {
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  const root = new THREE.Group();
  inner.position.y = pivotY;
  root.position.y = -pivotY;
  inner.add(root);
  outer.add(inner);
  return { outer, root };
}

// ---------------------------------------------------------------- Roadster
// The body is lofted from cross-sections along the car: a rounded
// superellipse per station whose width, floor and roof follow keyframed
// curves. That gives the SR-71-style wedge, flared haunches over the wheels,
// a tucked-under lower body (so the wheels show) and a fighter-jet canopy.
function keyed(keys) {
  return (z) => {
    if (z <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [z1, v1] = keys[i];
      if (z <= z1) {
        const [z0, v0] = keys[i - 1];
        const t = (z - z0) / (z1 - z0);
        return v0 + (v1 - v0) * t * t * (3 - 2 * t);
      }
    }
    return keys[keys.length - 1][1];
  };
}

function loft({ z0, z1, rings = 40, segs = 36, W, B, T, n = 3.2, tumble = 0.12, tuck = 0.8, caps = true }) {
  const pos = [], idx = [];
  const ring = [];
  for (let i = 0; i <= rings; i++) {
    const z = z0 + ((z1 - z0) * (1 - Math.cos((Math.PI * i) / rings))) / 2; // denser at the ends
    const w = W(z), b = B(z), t = T(z);
    const yc = (b + t) / 2, hy = (t - b) / 2;
    const r = [];
    for (let j = 0; j < segs; j++) {
      const a = (2 * Math.PI * j) / segs;
      const c = Math.cos(a), sn = Math.sin(a);
      let x = w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const y = yc + hy * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
      x *= sn > 0 ? 1 - tumble * sn : 1 - (1 - tuck) * -sn; // tumblehome on top, tuck underneath
      r.push(pos.length / 3);
      pos.push(x, y, z);
    }
    ring.push(r);
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % segs;
      const a = ring[i][j], b = ring[i][j2], c = ring[i + 1][j], d = ring[i + 1][j2];
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (!caps) return geo;
  // flat end caps as their own geometry so they get crisp normals
  const cap = (ri, front) => {
    const cp = [], ci = [];
    let cx = 0, cy = 0, cz = 0;
    for (const k of ring[ri]) { cx += pos[k * 3]; cy += pos[k * 3 + 1]; cz += pos[k * 3 + 2]; }
    const m = ring[ri].length;
    cp.push(cx / m, cy / m, cz / m);
    for (const k of ring[ri]) cp.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      if (front) ci.push(0, j + 1, j2 + 1); else ci.push(0, j2 + 1, j + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    g.setIndex(ci);
    g.computeVertexNormals();
    return g;
  };
  return { body: geo, back: cap(0, false), front: cap(rings, true) };
}

const carMats = [];
function physical(key, o) {
  if (!mats[key]) { mats[key] = new THREE.MeshPhysicalMaterial(o); carMats.push(mats[key]); }
  return mats[key];
}

// Neon-city reflections for the car paint, glass and rims (built once).
export function applyCarEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial({ color: 0x070910, side: THREE.BackSide })));
  const strip = (color, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    env.add(m);
  };
  strip(0xbfe8ff, 60, 1.2, 4, 0, 40, 0);       // sky glow overhead
  strip(0x37e0ff, 2, 14, 80, 46, 8, 0);        // cyan neon right
  strip(0xff3d9a, 2, 10, 80, -46, 4, 0);       // magenta neon left
  strip(0xffb04a, 70, 2, 2, 0, 10, -46);       // sodium lamps ahead
  strip(0x2a3a66, 90, 30, 2, 0, -5, 46);       // dim city behind
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  for (const m of carMats) { m.envMap = tex; m.needsUpdate = true; }
  return tex;
}

function makeWheel(side) {
  const g = new THREE.Group();
  const tire = std('tire', { color: 0x0b0b0d, roughness: 0.92 });
  const rim = physical('rimGun', { color: 0x3a4048, roughness: 0.28, metalness: 0.9, envMapIntensity: 0.9 });
  const capMat = physical('rimCap', { color: 0xd9dee4, roughness: 0.2, metalness: 1, envMapIntensity: 1 });
  g.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.32, 28).rotateZ(Math.PI / 2), tire, 0, 0, 0, false));
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.335, 24).rotateZ(Math.PI / 2), rim, 0, 0, 0, false));
  // turbine-style aero spokes on the outer face
  for (let k = 0; k < 6; k++) {
    const sp = mesh(box(0.03, 0.27, 0.07), capMat, side * 0.17, 0, 0, false);
    sp.geometry = sp.geometry.clone().translate(0, 0.13, 0);
    sp.rotation.x = (k / 6) * Math.PI * 2 + 0.25;
    g.add(sp);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 12).rotateZ(Math.PI / 2), capMat, 0, 0, 0, false));
  return g;
}

export function makeRoadster() {
  const { outer, root } = pivoted(0.6);
  const ano = physical('anoWhite', {
    color: 0xe8ebee, roughness: 0.34, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.75,
  });
  const visor = physical('visorGlass', {
    color: 0x070b12, roughness: 0.04, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4,
  });
  const carbon = physical('carbonFiber', { color: 0x15181d, roughness: 0.42, metalness: 0.5, clearcoat: 0.6, envMapIntensity: 0.5 });
  const dark = std('trimDark', { color: 0x0c0e12, roughness: 0.7, metalness: 0.2 });

  // ---- body
  const body = loft({
    z0: -2.32, z1: 2.36, rings: 44, segs: 40, n: 3.4, tumble: 0.14, tuck: 0.78,
    W: keyed([[-2.32, 0.84], [-2.12, 0.95], [-1.5, 1.04], [-0.95, 0.97], [-0.2, 0.92], [0.6, 0.95], [1.4, 1.03], [1.92, 0.9], [2.2, 0.68], [2.36, 0.4]]),
    B: keyed([[-2.32, 0.25], [-2.05, 0.17], [2.05, 0.17], [2.36, 0.21]]),
    T: keyed([[-2.32, 0.67], [-2.0, 0.76], [-1.4, 0.8], [-0.6, 0.8], [0.4, 0.75], [1.1, 0.64], [1.7, 0.54], [2.12, 0.43], [2.36, 0.3]]),
  });
  for (const g of [body.body, body.back, body.front]) { const m = mesh(g, ano); m.receiveShadow = true; root.add(m); }

  // ---- canopy: tinted visor bubble sitting in the body
  const canopyT = keyed([[-1.5, 0.83], [-0.85, 1.04], [-0.2, 1.12], [0.4, 1.07], [0.85, 0.9], [1.08, 0.72]]);
  const bodyT = keyed([[-2.32, 0.67], [-2.0, 0.76], [-1.4, 0.8], [-0.6, 0.8], [0.4, 0.75], [1.1, 0.64], [1.7, 0.54]]);
  const canopy = loft({
    z0: -1.5, z1: 1.08, rings: 30, segs: 32, n: 2.5, tumble: 0.34, tuck: 1,
    W: keyed([[-1.5, 0.3], [-0.9, 0.6], [-0.15, 0.66], [0.55, 0.56], [1.08, 0.18]]),
    B: (z) => bodyT(z) - 0.1,
    T: canopyT,
  });
  for (const g of [canopy.body, canopy.back, canopy.front]) root.add(mesh(g, visor));
  // thin carbon spine over the canopy (F-35 like frame line)
  const spine = loft({
    z0: -1.3, z1: 0.9, rings: 20, segs: 10, n: 2, tumble: 0, tuck: 1, caps: false,
    W: () => 0.03, B: (z) => canopyT(z) - 0.01, T: (z) => canopyT(z) + 0.012,
  });
  root.add(mesh(spine, carbon, 0, 0, 0, false));

  // ---- wheels (spin with speed)
  const wheels = [];
  for (const z of [1.42, -1.44]) for (const side of [-1, 1]) {
    const w = makeWheel(side);
    w.position.set(side * 0.9, 0.38, z);
    root.add(w);
    wheels.push(w);
  }

  // ---- lights: hidden headlight strip, wrap-around rear light bar
  const head = new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0xeaf6ff, emissiveIntensity: 3.2 });
  root.add(mesh(box(1.22, 0.025, 0.05), head, 0, 0.42, 2.22, false));
  for (const sx of [-1, 1]) {
    const dl = mesh(box(0.34, 0.02, 0.04), head, sx * 0.72, 0.4, 2.02, false);
    dl.rotation.y = sx * 0.55;
    root.add(dl);
  }
  const tail = new THREE.MeshStandardMaterial({ color: 0x300006, emissive: 0xff1a2e, emissiveIntensity: 4.2 });
  root.add(mesh(box(1.66, 0.05, 0.04), tail, 0, 0.6, -2.335, false));
  for (const sx of [-1, 1]) {
    const wrap = mesh(box(0.04, 0.05, 0.42), tail, sx * 0.87, 0.6, -2.12, false);
    wrap.rotation.y = -sx * 0.5;
    root.add(wrap);
  }

  // ---- aero: splitter, diffuser with fins, side intakes, mirror cams
  root.add(mesh(box(1.5, 0.035, 0.32), carbon, 0, 0.18, 2.12, false));
  root.add(mesh(box(1.5, 0.14, 0.3), carbon, 0, 0.24, -2.2, false));
  for (let x = -0.6; x <= 0.61; x += 0.3) root.add(mesh(box(0.025, 0.16, 0.32), carbon, x, 0.22, -2.21, false));
  for (const sx of [-1, 1]) {
    const intake = mesh(box(0.06, 0.15, 0.62), dark, sx * 0.93, 0.44, 0.62, false);
    intake.rotation.y = sx * 0.08;
    root.add(intake);
    const cam = mesh(box(0.14, 0.035, 0.07), carbon, sx * 0.7, 0.78, 0.62, false);
    cam.rotation.y = sx * 0.3;
    root.add(cam);
  }

  // ---- suction fans: underbody discs + glowing side vents
  const fanMat = new THREE.MeshStandardMaterial({ color: 0x021016, emissive: 0x30e8ff, emissiveIntensity: 0.6 });
  const fanGeo = new THREE.CircleGeometry(0.34, 24).rotateX(Math.PI / 2);
  for (const x of [-0.46, 0.46]) root.add(mesh(fanGeo, fanMat, x, 0.14, -0.85, false));
  for (const sx of [-1, 1]) root.add(mesh(box(0.025, 0.05, 0.9), fanMat, sx * 0.86, 0.27, -0.55, false));

  // ---- cold-gas thruster nozzles in the diffuser
  const nozzle = new THREE.CylinderGeometry(0.075, 0.1, 0.16, 14).rotateX(Math.PI / 2);
  const nozzleGlow = new THREE.MeshStandardMaterial({ color: 0x0b1420, emissive: 0xbfe6ff, emissiveIntensity: 0.6 });
  for (const x of [-0.5, 0.5]) {
    root.add(mesh(nozzle, carbon, x, 0.4, -2.34, false));
    root.add(mesh(new THREE.CircleGeometry(0.06, 12).rotateY(Math.PI), nozzleGlow, x, 0.4, -2.425, false));
  }

  // ---- active rear wing (rises in suction / track mode)
  const wing = new THREE.Group();
  wing.add(mesh(box(1.72, 0.035, 0.34), carbon, 0, 0, 0));
  for (const x of [-0.86, 0.86]) wing.add(mesh(box(0.025, 0.14, 0.38), carbon, x, -0.04, 0, false));
  for (const x of [-0.5, 0.5]) wing.add(mesh(box(0.035, 0.2, 0.08), carbon, x, -0.1, 0.06, false));
  wing.position.set(0, 0.86, -1.98);
  root.add(wing);

  const aura = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 6.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: radialTexture('rgba(60,230,255,1)'), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  aura.position.y = 0.05;
  outer.add(aura);

  outer.userData.inner = outer.children[0];
  outer.userData.fanMat = fanMat;
  outer.userData.nozzleGlow = nozzleGlow;
  outer.userData.aura = aura;
  outer.userData.wing = wing;
  outer.userData.wheels = wheels;
  outer.userData.nozzlesRear = [new THREE.Vector3(-0.5, 0.4, -2.45), new THREE.Vector3(0.5, 0.4, -2.45)];
  outer.userData.nozzlesDown = [
    new THREE.Vector3(-0.85, 0.15, 1.3), new THREE.Vector3(0.85, 0.15, 1.3),
    new THREE.Vector3(-0.85, 0.15, -1.4), new THREE.Vector3(0.85, 0.15, -1.4),
  ];
  return outer;
}

// ---------------------------------------------------------------- Police
let copTemplate;
export function makeCop() {
  if (!copTemplate) {
    const { outer, root } = pivoted(0.7);
    const black = std('copBlack', { color: 0x0d0f14, roughness: 0.35, metalness: 0.5 });
    const white = std('copWhite', { color: 0xf2f4f6, roughness: 0.35, metalness: 0.3 });
    const glass = std('glass', { color: 0x0a1018, roughness: 0.1, metalness: 0.8 });
    root.add(mesh(box(1.9, 0.6, 4.7), black, 0, 0.56, 0));
    root.add(mesh(box(1.94, 0.36, 1.9), white, 0, 0.6, 0.1, false));
    root.add(mesh(box(1.7, 0.5, 2.3), glass, 0, 1.1, -0.25));
    root.add(mesh(box(0.72, 0.14, 0.32), flash.red, -0.4, 1.42, -0.2, false));
    root.add(mesh(box(0.72, 0.14, 0.32), flash.blue, 0.4, 1.42, -0.2, false));
    root.add(mesh(box(1.6, 0.1, 0.05), flash.red, 0, 0.62, -2.37, false));
    addWheels(root, 0.88, [1.5, -1.5]);
    copTemplate = outer;
  }
  const c = copTemplate.clone();
  c.userData.inner = c.children[0];
  return c;
}

// ---------------------------------------------------------------- Civilian traffic
const civColors = [0x7a1e24, 0x2b4f7a, 0x3d3f45, 0xb8b9bc, 0x1f5a45, 0x8a6a2a, 0x4b2d6e];
const civTemplates = [];
export function makeCivilian() {
  if (!civTemplates.length) {
    const glass = std('glass', { color: 0x0a1018, roughness: 0.1, metalness: 0.8 });
    const tl = std('civTail', { color: 0x300006, emissive: 0xff2030, emissiveIntensity: 2.5 });
    for (const col of civColors) {
      const { outer, root } = pivoted(0.7);
      const paint = std('civ' + col, { color: col, roughness: 0.4, metalness: 0.4 });
      const tall = col === 0x3d3f45 || col === 0x1f5a45;
      root.add(mesh(box(1.86, tall ? 1.0 : 0.7, 4.4), paint, 0, tall ? 0.75 : 0.6, 0));
      root.add(mesh(box(1.66, 0.55, tall ? 3.0 : 2.2), glass, 0, tall ? 1.5 : 1.18, -0.2));
      for (const x of [-0.7, 0.7]) root.add(mesh(box(0.4, 0.12, 0.05), tl, x, 0.7, -2.22, false));
      addWheels(root, 0.86, [1.4, -1.4]);
      civTemplates.push(outer);
    }
  }
  const c = civTemplates[(Math.random() * civTemplates.length) | 0].clone();
  c.userData.inner = c.children[0];
  return c;
}

// ---------------------------------------------------------------- Tanker
let tankerTemplate;
export function makeTanker() {
  if (!tankerTemplate) {
    const g = new THREE.Group();
    const cab = std('cab', { color: 0x9c1b1b, roughness: 0.45, metalness: 0.4 });
    const chrome = std('chrome', { color: 0xc9cfd6, roughness: 0.2, metalness: 0.9 });
    const glass = std('glass', { color: 0x0a1018, roughness: 0.1, metalness: 0.8 });
    g.add(mesh(box(2.5, 2.5, 2.4), cab, 0, 1.55, 4.6));
    g.add(mesh(box(2.3, 0.8, 0.1), glass, 0, 2.2, 5.81, false));
    const tank = mesh(new THREE.CylinderGeometry(1.3, 1.3, 8.4, 20).rotateX(Math.PI / 2), chrome, 0, 2.05, -0.9);
    g.add(tank);
    const stripe = flash.amber;
    for (const z of [-4.2, -0.9, 2.4]) {
      g.add(mesh(new THREE.CylinderGeometry(1.33, 1.33, 0.35, 20).rotateX(Math.PI / 2), stripe, 0, 2.05, z, false));
    }
    g.add(mesh(box(2.2, 0.4, 11), std('carbon', {}), 0, 0.55, 0, false));
    addWheels(g, 1.05, [4.6, 2.2, -3.2, -4.6], 0.42);
    tankerTemplate = g;
  }
  return tankerTemplate.clone();
}

// ---------------------------------------------------------------- Static props
const concrete = () => std('concrete', { color: 0x8a8d92, roughness: 0.95 });

export function makeSlab() {
  return mesh(box(3.7, 1.2, 5.2), concrete());
}

const rockGeos = [new THREE.DodecahedronGeometry(1, 0), new THREE.IcosahedronGeometry(1, 0), new THREE.BoxGeometry(1.6, 1.2, 1.4)];
export function makeRock(size) {
  const m = mesh(rockGeos[(Math.random() * rockGeos.length) | 0], std('rock', { color: 0x6c6862, roughness: 1 }));
  m.scale.setScalar(size);
  m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  return m;
}

export function makeOverpass() {
  const g = new THREE.Group();
  const deck = new THREE.Group();
  deck.add(mesh(box(40, 1.6, 9), concrete(), 0, 7.6, 0));
  deck.add(mesh(box(40, 0.9, 0.3), std('rail', { color: 0x39404c, metalness: 0.5, roughness: 0.5 }), 0, 8.8, 4.4, false));
  deck.add(mesh(box(40, 0.9, 0.3), std('rail', {}), 0, 8.8, -4.4, false));
  deck.add(mesh(box(40, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xffb02e }), 0, 6.75, 4.5, false));
  g.add(deck);
  for (const x of [-12, 12]) g.add(mesh(box(1.8, 21, 1.8), concrete(), x, -2.6, 0));
  g.userData.deck = deck;
  return g;
}

export function makeSpikeStrip() {
  const g = new THREE.Group();
  g.add(mesh(box(15.6, 0.08, 0.7), std('carbon', {}), 0, 0.04, 0, false));
  for (let x = -7.5; x <= 7.5; x += 0.75) {
    g.add(mesh(box(0.08, 0.22, 0.08), std('spike', { color: 0xd8dde3, metalness: 0.9, roughness: 0.2 }), x, 0.15, 0, false));
  }
  g.add(mesh(box(15.6, 0.02, 0.18), flash.amber, 0, 0.09, 0.3, false));
  return g;
}

export function makeWarnLight() {
  const g = new THREE.Group();
  g.add(mesh(box(0.15, 1.6, 0.15), std('rail', {}), 0, 0.8, 0, false));
  g.add(mesh(box(0.5, 0.35, 0.35), flash.red, 0, 1.75, 0, false));
  return g;
}

export function makePortal() {
  const g = new THREE.Group();
  const wall = std('portal', { color: 0x2b3240, roughness: 0.8, metalness: 0.2 });
  g.add(mesh(box(18, 26, 3), wall, -23, 4, 0, false));
  g.add(mesh(box(18, 26, 3), wall, 23, 4, 0, false));
  g.add(mesh(box(64, 8, 3), wall, 0, 18, 0, false));
  const neon = new THREE.MeshBasicMaterial({ color: 0x37e0ff });
  g.add(mesh(box(28, 0.3, 0.3), neon, 0, 14.2, 1.6, false));
  for (const x of [-14, 14]) g.add(mesh(box(0.3, 14.2, 0.3), neon, x, 7.1, 1.6, false));
  return g;
}

export function makeRiver(length) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(220, length).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x061a2c, emissive: 0x0a3550, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.6 }),
  );
  return m;
}

// ---------------------------------------------------------------- Police helicopter
export function makeHeli() {
  const g = new THREE.Group();
  const paint = std('heliPaint', { color: 0x10141c, roughness: 0.35, metalness: 0.6 });
  const white = std('copWhite', { color: 0xf2f4f6, roughness: 0.35, metalness: 0.3 });
  const glass = std('glass', { color: 0x0a1018, roughness: 0.1, metalness: 0.8 });
  const cab = mesh(new THREE.SphereGeometry(1, 16, 12), paint, 0, 0, 0.6);
  cab.scale.set(1.5, 1.4, 2.6);
  g.add(cab);
  const win = mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), glass, 0, 0.15, 1.9);
  win.scale.set(1.3, 1.1, 1.2); win.rotation.x = Math.PI / 2.6;
  g.add(win);
  g.add(mesh(box(3.05, 0.35, 2.2), white, 0, -0.2, 0.4, false));
  g.add(mesh(box(0.5, 0.5, 6), paint, 0, 0.3, -4.2));
  g.add(mesh(box(0.15, 1.6, 0.9), paint, 0, 1.0, -7.1));
  for (const x of [-1.1, 1.1]) g.add(mesh(box(0.12, 0.12, 4.2), std('rail', {}), x, -1.55, 0.5, false));
  const rotor = new THREE.Group();
  for (const r of [0, Math.PI / 2]) {
    const blade = mesh(box(0.35, 0.06, 11), std('carbon', {}), 0, 0, 0, false);
    blade.rotation.y = r;
    rotor.add(blade);
  }
  rotor.position.y = 1.55;
  g.add(rotor);
  const tailRotor = new THREE.Group();
  tailRotor.add(mesh(box(0.06, 2.0, 0.22), std('carbon', {}), 0, 0, 0, false));
  tailRotor.position.set(0.25, 1.0, -7.1);
  g.add(tailRotor);
  g.add(mesh(box(0.3, 0.2, 0.3), flash.red, -0.6, -1.25, -0.4, false));
  g.add(mesh(box(0.3, 0.2, 0.3), flash.blue, 0.6, -1.25, -0.4, false));
  // fake volumetric searchlight cone, apex at the nose
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(4.5, 1, 24, 1, true).translate(0, -0.5, 0),
    new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  g.userData.rotor = rotor;
  g.userData.tailRotor = tailRotor;
  g.userData.cone = cone;
  return g;
}

let mineTemplate;
export function makeMine() {
  if (!mineTemplate) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.3, 14), std('carbon', {}), 0, 0.15, 0, false));
    g.add(mesh(new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), flash.red, 0, 0.3, 0, false));
    mineTemplate = g;
  }
  return mineTemplate.clone();
}

// ---------------------------------------------------------------- Radio tower (falls across the road)
export function makeTower() {
  const g = new THREE.Group();
  const steel = std('towerSteel', { color: 0xc4ccd6, roughness: 0.45, metalness: 0.6, emissive: 0x2a3340, emissiveIntensity: 1 });
  const red = std('towerRed', { color: 0xd8302a, roughness: 0.6, metalness: 0.3, emissive: 0xff2a1a, emissiveIntensity: 0.9 });
  // pedestal from the ground up to deck level (doesn't fall)
  g.add(mesh(box(4, 12, 4), concrete(), 0, -6, 0, false));
  const mast = new THREE.Group();
  const H = 36, W = 2.8;
  for (const x of [-W / 2, W / 2]) for (const z of [-W / 2, W / 2]) mast.add(mesh(box(0.36, H, 0.36), steel, x, H / 2, z));
  for (let y = 4; y < H; y += 6) for (const z of [-W / 2, W / 2]) mast.add(mesh(box(0.45, 0.45, 0.45), flash.red, -W / 2, y, z, false));
  for (let y = 2; y < H; y += 3) {
    const mat = (y / 3) % 2 < 1 ? red : steel;
    mast.add(mesh(box(W, 0.3, 0.3), mat, 0, y, W / 2, false));
    mast.add(mesh(box(W, 0.3, 0.3), mat, 0, y, -W / 2, false));
    mast.add(mesh(box(0.3, 0.3, W), mat, W / 2, y, 0, false));
    mast.add(mesh(box(0.3, 0.3, W), mat, -W / 2, y, 0, false));
    const brace = mesh(box(0.12, 3.6, 0.12), steel, 0, y + 1.5, W / 2, false);
    brace.rotation.z = 0.6;
    mast.add(brace);
  }
  mast.add(mesh(box(0.15, 5, 0.15), steel, 0, H + 2.5, 0, false));
  mast.add(mesh(box(0.5, 0.5, 0.5), flash.red, 0, H + 5, 0, false));
  mast.add(mesh(box(0.4, 0.4, 0.4), flash.red, W / 2, H * 0.6, W / 2, false));
  g.add(mast);
  g.userData.mast = mast;
  return g;
}
