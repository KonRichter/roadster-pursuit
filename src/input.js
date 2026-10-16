// Keyboard + touch input mapped to game actions.
const BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  hop: ['Space'],
  suction: ['ShiftLeft', 'ShiftRight', 'KeyF'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  start: ['Enter', 'NumpadEnter'],
};
const codeToAction = {};
for (const [action, codes] of Object.entries(BINDINGS)) for (const c of codes) codeToAction[c] = action;

const held = new Set();
// floating joystick: put a thumb down anywhere in the steer zone and slide
const stick = { id: null, x0: 0, value: 0 };
const STICK_R = 56;
const hits = new Set();
const touchHeld = new Set();

const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');

window.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  const a = codeToAction[e.code];
  if (!a) return;
  e.preventDefault();
  if (!e.repeat) hits.add(a);
  held.add(e.code);
});
window.addEventListener('keyup', (e) => { held.delete(e.code); });
window.addEventListener('blur', () => { held.clear(); touchHeld.clear(); stick.id = null; stick.value = 0; });

export function bindSteer(zone, base, knob) {
  const place = (x, y) => { base.style.transform = `translate(${x}px, ${y}px)`; };
  const setKnob = (dx) => { knob.style.transform = `translateX(${dx}px)`; };
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (stick.id !== null) return;
    stick.id = e.pointerId;
    stick.x0 = e.clientX;
    stick.value = 0;
    try { zone.setPointerCapture(e.pointerId); } catch { /* capture unsupported */ }
    place(e.clientX, e.clientY);
    setKnob(0);
    zone.classList.add('active', 'used');
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stick.id) return;
    e.preventDefault();
    let dx = e.clientX - stick.x0;
    // drag past the rim drags the stick along, so reversing is instant
    if (Math.abs(dx) > STICK_R) {
      stick.x0 += dx - Math.sign(dx) * STICK_R;
      place(stick.x0, e.clientY);
      dx = Math.sign(dx) * STICK_R;
    }
    const v = dx / STICK_R;
    stick.value = Math.abs(v) < 0.08 ? 0 : v;
    setKnob(dx);
  });
  const end = (e) => {
    if (e.pointerId !== stick.id) return;
    stick.id = null;
    stick.value = 0;
    zone.classList.remove('active');
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  zone.addEventListener('lostpointercapture', end);
}

export function bindTouch(root) {
  for (const btn of root.querySelectorAll('button[data-action]')) {
    const a = btn.dataset.action;
    const on = (e) => { e.preventDefault(); touchHeld.add(a); hits.add(a); btn.classList.add('active'); try { btn.setPointerCapture(e.pointerId); } catch { /* capture unsupported */ } };
    const off = (e) => { e.preventDefault(); touchHeld.delete(a); btn.classList.remove('active'); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('lostpointercapture', off);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

export const input = {
  down(action) {
    if (touchHeld.has(action)) return true;
    for (const c of BINDINGS[action]) if (held.has(c)) return true;
    return false;
  },
  hit(action) { return hits.has(action); },
  steer() {
    if (stick.id !== null) return stick.value;
    return (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
  },
  releaseTouch() { touchHeld.clear(); stick.id = null; stick.value = 0; },
  endFrame() { hits.clear(); },
};
