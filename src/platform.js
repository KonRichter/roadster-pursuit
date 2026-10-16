// Device detection plus the per-platform quality preset and touch assists.
// ?touch=1 / ?touch=0 in the URL forces either mode (handy for testing).
const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const detected = coarse || (navigator.maxTouchPoints > 0 && !fine);

export const IS_TOUCH = params.has('touch') ? params.get('touch') !== '0' : detected;
export const IS_MOBILE = IS_TOUCH && Math.min(screen.width, screen.height) < 900;

const dpr = window.devicePixelRatio || 1;
export const QUALITY = IS_MOBILE
  ? { pixelRatio: Math.min(dpr, 1.3), antialias: false, shadows: false, fogFar: 380, particles: 0.55 }
  : { pixelRatio: Math.min(dpr, 1.5), antialias: true, shadows: true, fogFar: 470, particles: 1 };

// Thumbs are less precise than keys: slightly more forgiving timing and hitboxes.
export const ASSIST = IS_TOUCH
  ? { hopBuffer: 0.32, carHalfWidth: 0.72, warnBonus: 0.45 }
  : { hopBuffer: 0.2, carHalfWidth: 0.9, warnBonus: 0 };

if (IS_TOUCH) document.documentElement.classList.add('touch');
