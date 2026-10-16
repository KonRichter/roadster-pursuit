// Tiny WebAudio synth: electric motor whine, cold-gas thrust hiss, fan whir,
// sirens and one-shot effects. Everything is generated, no audio files.
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const BPM = 84;

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const loopNoise = () => {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf; n.loop = true; n.start();
      return n;
    };
    const gain = (v, dest = this.master) => { const g = ctx.createGain(); g.gain.value = v; g.connect(dest); return g; };

    // motor whine
    this.engGain = gain(0);
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass'; engFilter.frequency.value = 1400; engFilter.Q.value = 2;
    engFilter.connect(this.engGain);
    this.eng1 = ctx.createOscillator(); this.eng1.type = 'sawtooth';
    this.eng2 = ctx.createOscillator(); this.eng2.type = 'sine';
    const e1g = gain(0.25, engFilter), e2g = gain(0.6, engFilter);
    this.eng1.connect(e1g); this.eng2.connect(e2g);
    this.eng1.start(); this.eng2.start();
    this.engFilter = engFilter;

    // cold-gas thrust
    this.thrustGain = gain(0);
    const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 900; tf.Q.value = 0.5;
    tf.connect(this.thrustGain);
    loopNoise().connect(tf);

    // suction fans
    this.fanGain = gain(0);
    const ff = ctx.createBiquadFilter(); ff.type = 'highpass'; ff.frequency.value = 2600;
    ff.connect(this.fanGain);
    loopNoise().connect(ff);
    const fo = ctx.createOscillator(); fo.type = 'triangle'; fo.frequency.value = 610;
    const fog = gain(0.08, this.fanGain); fo.connect(fog); fo.start();

    // wind
    this.windGain = gain(0);
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 500;
    wf.connect(this.windGain);
    loopNoise().connect(wf);

    // helicopter rotor: low noise chopped by a 13 Hz LFO
    this.rotorGain = gain(0);
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 320;
    const chop = ctx.createGain(); chop.gain.value = 0.5;
    rf.connect(chop); chop.connect(this.rotorGain);
    loopNoise().connect(rf);
    const rl = ctx.createOscillator(); rl.frequency.value = 13;
    const rla = ctx.createGain(); rla.gain.value = 0.5;
    rl.connect(rla); rla.connect(chop.gain); rl.start();

    // siren
    this.sirenGain = gain(0);
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2000;
    sf.connect(this.sirenGain);
    const so = ctx.createOscillator(); so.type = 'square'; so.frequency.value = 760;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.55;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt); lfoAmt.connect(so.frequency);
    const sog = gain(0.12, sf); so.connect(sog);
    so.start(); lfo.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  update(st) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = st.speed;
    this.eng1.frequency.setTargetAtTime(60 + sp * 4.2, t, 0.05);
    this.eng2.frequency.setTargetAtTime(120 + sp * 8.4, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(500 + sp * 18, t, 0.1);
    this.engGain.gain.setTargetAtTime(st.running ? 0.05 + Math.min(sp, 110) * 0.0009 : 0, t, 0.1);
    this.thrustGain.gain.setTargetAtTime(st.running && st.thrust ? 0.55 : 0, t, st.thrust ? 0.02 : 0.12);
    this.fanGain.gain.setTargetAtTime(st.running && st.suction ? 0.22 : 0, t, 0.06);
    this.windGain.gain.setTargetAtTime(st.running ? Math.min(sp, 110) * 0.0035 : 0, t, 0.2);
    this.sirenGain.gain.setTargetAtTime(st.running ? st.siren * 0.5 : 0, t, 0.2);
    this.rotorGain.gain.setTargetAtTime(st.running ? st.rotor * 0.9 : 0, t, 0.3);
  }

  blip(freq = 880, dur = 0.12, type = 'square', vol = 0.15, slide = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, freq, vol, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.15), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.master);
    n.start(t, Math.random()); n.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ music
  // Dark cyberpunk loop in A Phrygian at 88 BPM with a half-time feel:
  // distorted kick, distorted saw bass, sub drone, low pads, a slow lead
  // drowned in delay, and a noise riser every 8 bars. Am - Bb - Fm - Eb:
  // the flat second and the tritone root keep it menacing.
  startMusic() {
    if (!this.ctx) return;
    if (this.musicTimer) { this.setMusicLevel(0.75); return; }
    const ctx = this.ctx;
    if (!this.musicBus) {
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.ratio.value = 5;
      comp.connect(this.musicBus);
      this.mIn = comp;
      // long dark feedback delay, dotted eighth
      this.delay = ctx.createDelay(2);
      this.delay.delayTime.value = (60 / BPM) * 0.75;
      const fb = ctx.createGain(); fb.gain.value = 0.55;
      const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 1100;
      this.delay.connect(dlp); dlp.connect(fb); fb.connect(this.delay);
      dlp.connect(comp);
      this.delayIn = ctx.createGain(); this.delayIn.gain.value = 0.6;
      this.delayIn.connect(this.delay);
      this.drive = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(x * 3.2); }
      this.drive.curve = curve;
      this.drive.connect(comp);
    }
    this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(0.75, ctx.currentTime, 0.8);
    this.step16 = 0;
    this.nextNote = ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 25);
  }

  stopMusic(fade = 1.2) {
    if (!this.ctx || !this.musicTimer) return;
    this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  setMusicLevel(v) {
    if (this.musicBus && this.musicTimer) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
  }

  scheduleMusic() {
    const sixteenth = 60 / BPM / 4;
    while (this.nextNote < this.ctx.currentTime + 0.15) {
      this.playStep(this.step16, this.nextNote, sixteenth);
      this.nextNote += sixteenth;
      this.step16++;
    }
  }

  playStep(n, t, len) {
    const bar = Math.floor(n / 16) % 16;   // 16-bar form
    const st = n % 16;
    // Am - Bb - Fm - Eb: flat second and tritone roots
    const prog = [
      { root: 33, pad: [57, 60, 64], mel: [69, 72, 70, 64] },
      { root: 34, pad: [58, 62, 65], mel: [70, 69, 65, 62] },
      { root: 29, pad: [56, 60, 65], mel: [68, 67, 65, 60] },
      { root: 27, pad: [55, 58, 63], mel: [67, 63, 66, 64] },
    ];
    const ch = prog[Math.floor(bar / 2) % 4];
    const intro = bar < 2;
    const arp = bar >= 4;
    const lead = bar >= 8;

    if (st === 0) this.mDrone(t, ch.root - 12, len * 16);
    if (st === 0) this.mReese(t, ch.root, len * 16);
    if (st === 0 && bar % 4 === 0) this.mBell(t, ch.root + 24);
    // syncopated industrial beat, half-time snare
    if (!intro && (st === 0 || st === 6 || st === 10 || (bar % 2 && st === 14))) this.mKick(t);
    if (!intro && st === 8) this.mSnare(t);
    if (!intro && (st === 3 || st === 11 || (bar % 2 && st === 15))) this.mClank(t);
    if (!intro) this.mHat(t, st % 4 === 2 ? 0.028 : 0.012);
    // gated distorted bass on 16ths: root, octave pops, flat-second grind
    const pat = [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 13, bar % 2 ? 1 : 12];
    if (!intro) this.mBass(t, ch.root + pat[st], len * 0.7, bar);
    // evil tritone stab on the bar
    if (!intro && st === 0) this.mStab(t, ch.root + 12);
    if (st === 0 && bar % 2 === 0) for (const p of ch.pad) this.mChoir(t, p - 12, len * 32);
    // dissonant arpeggio: root, minor third, tritone, flat second
    if (arp) {
      const seq = [0, 3, 6, 12, 1, 6, 3, 13, 0, 3, 6, 15, 1, 6, 12, 18];
      this.mArp(t, ch.root + 36 + seq[st], len * 0.9, bar);
    }
    if (lead && st % 4 === 0 && !(bar % 4 === 3 && st >= 8)) this.mLead(t, ch.mel[st / 4] - 12, len * 3.5);
    if (bar % 8 === 7 && st === 0) this.mRiser(t, len * 16);
  }

  mClank(t) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3400; f.Q.value = 12;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.connect(f); f.connect(g); g.connect(this.mIn); g.connect(this.delayIn);
    n.start(t, Math.random()); n.stop(t + 0.14);
  }

  mReese(t, midi, dur) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(110, t); f.frequency.linearRampToValueAtTime(320, t + dur * 0.5); f.frequency.linearRampToValueAtTime(110, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1, t + 0.15);
    g.gain.setValueAtTime(0.1, t + dur - 0.15); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(this.drive);
    for (const det of [-22, 22]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(midi); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  mStab(t, midi) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(220, t + 0.45);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.11, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    f.connect(g); g.connect(this.drive); g.connect(this.delayIn);
    for (const iv of [0, 6, 12, 13]) { // root, tritone, octave, flat ninth
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(midi + iv); o.detune.value = (Math.random() - 0.5) * 16;
      o.connect(f); o.start(t); o.stop(t + 0.55);
    }
  }

  mBell(t, midi) {
    // FM church-bell toll, inharmonic ratio for an ominous ring
    const ctx = this.ctx, f0 = midiHz(midi);
    const car = ctx.createOscillator(); car.frequency.value = f0;
    const mod = ctx.createOscillator(); mod.frequency.value = f0 * 1.41;
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f0 * 2.5, t); mg.gain.exponentialRampToValueAtTime(f0 * 0.1, t + 4);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    car.connect(g); g.connect(this.mIn); g.connect(this.delayIn);
    car.start(t); mod.start(t); car.stop(t + 5.1); mod.stop(t + 5.1);
  }

  mChoir(t, midi, dur) {
    // dark "aah" pad: detuned saws through two vowel formants
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 2.2);
    g.gain.setValueAtTime(0.06, t + dur - 1.2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(this.mIn); g.connect(this.delayIn);
    const mix = ctx.createGain(); mix.gain.value = 1;
    for (const [fq, q] of [[650, 6], [1050, 8], [300, 3]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = q;
      mix.connect(bp); bp.connect(g);
    }
    for (const det of [-16, -6, 6, 16]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(midi); o.detune.value = det;
      o.connect(mix); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  mArp(t, midi, dur, bar) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = midiHz(midi);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 5;
    const open = 900 + 900 * (bar % 4) / 3;
    f.frequency.setValueAtTime(open, t); f.frequency.exponentialRampToValueAtTime(300, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.mIn); g.connect(this.delayIn);
    o.start(t); o.stop(t + dur + 0.02);
  }

  mKick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.16);
    const g = ctx.createGain(); g.gain.setValueAtTime(1.0, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g); g.connect(this.drive); o.start(t); o.stop(t + 0.6);
  }

  mSnare(t) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 950; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    n.connect(f); f.connect(g); g.connect(this.mIn); g.connect(this.delayIn);
    n.start(t, Math.random()); n.stop(t + 0.45);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(og); og.connect(this.mIn); o.start(t); o.stop(t + 0.17);
  }

  mHat(t, vol) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 9000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    n.connect(f); f.connect(g); g.connect(this.mIn);
    n.start(t, Math.random()); n.stop(t + 0.05);
  }

  mBass(t, midi, dur, bar) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 9;
    const open = 180 + 140 * Math.sin(bar * 0.6) ** 2;
    f.frequency.setValueAtTime(open * 3, t); f.frequency.exponentialRampToValueAtTime(open * 0.6, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    f.connect(g); g.connect(this.drive);
    for (const det of [-10, 10]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = midiHz(midi); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.02);
    }
  }

  mDrone(t, midi, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midiHz(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.3);
    g.gain.setValueAtTime(0.16, t + dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.mIn); o.start(t); o.stop(t + dur + 0.05);
  }

  mLead(t, midi, dur) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(380, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    f.connect(g); g.connect(this.mIn); g.connect(this.delayIn);
    for (const det of [-8, 8]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(midiHz(midi + 1), t);           // slide in from a semitone above
      o.frequency.exponentialRampToValueAtTime(midiHz(midi), t + 0.08);
      o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.02);
    }
  }

  mRiser(t, dur) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(3200, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.95); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.mIn); g.connect(this.delayIn);
    n.start(t); n.stop(t + dur + 0.05);
  }

  boom(big = 1) { this.noise(1.6 * big, 900, 0.9 * big); this.blip(70, 0.8, 'sine', 0.5 * big, -40); }
  crash() { this.noise(0.6, 3000, 0.6, 'bandpass'); this.blip(110, 0.35, 'sawtooth', 0.25, -60); }
  hop() { this.noise(0.35, 2400, 0.45, 'bandpass'); }
  whoosh() { this.noise(0.3, 1600, 0.25, 'bandpass'); }
  warn() { this.blip(980, 0.1, 'square', 0.12); setTimeout(() => this.blip(980, 0.1, 'square', 0.12), 160); setTimeout(() => this.blip(980, 0.14, 'square', 0.12), 320); }
  score() { this.blip(1320, 0.09, 'triangle', 0.12, 400); }
  rumble() { this.noise(2.2, 280, 0.7); }
  count(go) { this.blip(go ? 1320 : 660, go ? 0.4 : 0.18, 'triangle', 0.2); }
}
