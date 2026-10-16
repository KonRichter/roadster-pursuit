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
window.addEventListener('blur', () => { held.clear(); touchHeld.clear(); });

export function bindTouch(root) {
  for (const btn of root.querySelectorAll('button[data-action]')) {
    const a = btn.dataset.action;
    const on = (e) => { e.preventDefault(); touchHeld.add(a); hits.add(a); btn.classList.add('active'); btn.setPointerCapture?.(e.pointerId); };
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
  steer() { return (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0); },
  endFrame() { hits.clear(); },
};
