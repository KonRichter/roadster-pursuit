// DOM HUD. Writes only when values change to keep layout work minimal.
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), speed: $('speed'),
      pressure: $('m-pressure'), fan: $('m-fan'),
      hull: [...$('hull').children],
      warning: $('warning'), warnTitle: $('warn-title'), warnHint: $('warn-hint'),
      center: $('center-msg'), popups: $('popups'), flash: $('flash'),
      hopBtn: document.querySelector('#touch .t-hop'), suckBtn: document.querySelector('#touch .t-suction'),
    };
    this.cache = {};
    this.warnT = 0;
    this.centerT = 0;
    this.flashV = 0;
  }

  set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  update(dt, car, game) {
    const e = this.el;
    this.set('speed', Math.round(car.v * 2.237), (v) => (e.speed.textContent = v));
    this.set('pressure', Math.round(car.pressure), (v) => {
      e.pressure.style.transform = `scaleX(${v / 100})`;
      e.pressure.parentElement.classList.toggle('low', v < 15);
      // touch: the ring around JUMP is the pressure tank
      e.hopBtn.style.setProperty('--fill', v / 100);
      e.hopBtn.classList.toggle('low', v < 22);
    });
    this.set('fan', Math.round(car.fan), (v) => {
      e.fan.style.transform = `scaleX(${v / 100})`;
      e.fan.parentElement.classList.toggle('low', v < 15);
      e.suckBtn.style.setProperty('--fill', v / 100);
      e.suckBtn.classList.toggle('low', v < 15);
    });
    this.set('hull', car.hull, (v) => e.hull.forEach((n, i) => n.classList.toggle('off', i >= v)));

    if (this.warnT > 0) {
      this.warnT -= dt;
      if (this.warnT <= 0) e.warning.classList.add('hidden');
    }
    if (this.centerT > 0) {
      this.centerT -= dt;
      if (this.centerT <= 0) e.center.classList.remove('show');
    }
    if (this.flashV > 0) {
      this.flashV = Math.max(0, this.flashV - dt * 3);
      e.flash.style.opacity = this.flashV.toFixed(3);
    }
  }

  warn(title, hint, dur = 2.6) {
    const e = this.el;
    e.warnTitle.textContent = title;
    e.warnHint.textContent = hint;
    e.warnHint.classList.toggle('hidden', !hint);
    e.warning.classList.remove('hidden');
    // restart CSS animation
    e.warning.style.animation = 'none';
    void e.warning.offsetWidth;
    e.warning.style.animation = '';
    this.warnT = dur;
  }

  clearWarn() { this.warnT = 0; this.el.warning.classList.add('hidden'); }

  center(text, dur = 0.9, sub = false) {
    const c = this.el.center;
    c.textContent = text;
    c.classList.toggle('sub', sub);
    c.classList.remove('show');
    void c.offsetWidth;
    c.classList.add('show');
    this.centerT = dur;
  }

  popup(text, cls = '') {
    const p = document.createElement('div');
    p.className = 'popup ' + cls;
    p.textContent = text;
    this.el.popups.appendChild(p);
    while (this.el.popups.children.length > 3) this.el.popups.firstChild.remove();
    setTimeout(() => p.remove(), 1400);
  }

  flash(v = 0.6) { this.flashV = Math.max(this.flashV, v); }

  reset() {
    this.cache = {};
    this.clearWarn();
    this.el.popups.innerHTML = '';
    this.el.center.classList.remove('show');
    this.flashV = 0;
    this.el.flash.style.opacity = 0;
  }
}
