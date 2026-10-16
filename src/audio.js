// Tiny WebAudio synth: electric motor whine, cold-gas thrust hiss, fan whir,
// sirens and one-shot effects. Everything is generated, no audio files.
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

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
  // Dark cyberpunk loop in A minor at 100 BPM: four-on-the-floor kick, gated
  // saw bass on 16ths, detuned pad chords, a delayed minor arpeggio and hats.
  // Scheduled with a lookahead timer so timing stays tight.
  startMusic() {
    if (!this.ctx) return;
    if (this.musicTimer) { this.setMusicLevel(0.75); return; }
    const ctx = this.ctx;
    if (!this.musicBus) {
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      comp.connect(this.musicBus);
      this.mIn = comp;
      // dark feedback delay for the lead and pads
      this.delay = ctx.createDelay(1);
      this.delay.delayTime.value = (60 / 100) * 0.75;
      const fb = ctx.createGain(); fb.gain.value = 0.42;
      const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 1800;
      this.delay.connect(dlp); dlp.connect(fb); fb.connect(this.delay);
      dlp.connect(comp);
      this.delayIn = ctx.createGain(); this.delayIn.gain.value = 0.5;
      this.delayIn.connect(this.delay);
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
    const sixteenth = 60 / 100 / 4;
    while (this.nextNote < this.ctx.currentTime + 0.15) {
      this.playStep(this.step16, this.nextNote, sixteenth);
      this.nextNote += sixteenth;
      this.step16++;
    }
  }

  playStep(n, t, len) {
    const bar = Math.floor(n / 16) % 16;   // 16-bar form
    const st = n % 16;
    // Am  F  Dm  E  (the major E keeps it tense)
    const prog = [
      { bass: 33, pad: [57, 60, 64], arp: [69, 72, 76, 79] },
      { bass: 29, pad: [53, 57, 60], arp: [65, 69, 72, 77] },
      { bass: 26, pad: [50, 53, 57], arp: [62, 65, 69, 74] },
      { bass: 28, pad: [52, 56, 59], arp: [64, 68, 71, 76] },
    ];
    const ch = prog[Math.floor(bar / 2) % 4];
    const intro = bar < 2;
    const lead = bar >= 8;

    if (!intro && st % 4 === 0) this.mKick(t);
    if (!intro && (st === 4 || st === 12)) this.mSnare(t);
    if (st % 2 === 1 || (lead && st % 4 === 2)) this.mHat(t, st % 4 === 2 ? 0.05 : 0.035);
    // bass: root with octave pops, slightly varied every other bar
    const pat = bar % 2 ? [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 10, 12] : [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 12, 0, 7];
    this.mBass(t, ch.bass + pat[st], len * 0.9, bar);
    if (st === 0 && bar % 2 === 0) for (const p of ch.pad) this.mPad(t, p, len * 32);
    if (lead && st % 2 === 0) {
      const order = [0, 1, 2, 3, 2, 1, 3, 2];
      if (bar % 4 !== 3 || st < 8) this.mLead(t, ch.arp[order[(st / 2) % 8]], len * 1.6);
    }
  }

  mKick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g); g.connect(this.mIn); o.start(t); o.stop(t + 0.42);
  }

  mSnare(t) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    n.connect(f); f.connect(g); g.connect(this.mIn); g.connect(this.delayIn);
    n.start(t, Math.random()); n.stop(t + 0.25);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(190, t);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.25, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og); og.connect(this.mIn); o.start(t); o.stop(t + 0.12);
  }

  mHat(t, vol) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(f); f.connect(g); g.connect(this.mIn);
    n.start(t, Math.random()); n.stop(t + 0.06);
  }

  mBass(t, midi, dur, bar) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 7;
    const open = 380 + 260 * Math.sin(bar * 0.7) ** 2;
    f.frequency.setValueAtTime(open * 2.6, t); f.frequency.exponentialRampToValueAtTime(open * 0.5, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    f.connect(g); g.connect(this.mIn);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = midiHz(midi); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.02);
    }
  }

  mPad(t, midi, dur) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + 1.2);
    g.gain.setValueAtTime(0.045, t + dur - 1); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(this.mIn); g.connect(this.delayIn);
    for (const det of [-12, 0, 12]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = midiHz(midi - 12); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  mLead(t, midi, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = midiHz(midi);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.mIn); g.connect(this.delayIn);
    o.start(t); o.stop(t + dur + 0.02);
  }

  boom(big = 1) { this.noise(1.6 * big, 900, 0.9 * big); this.blip(70, 0.8, 'sine', 0.5 * big, -40); }
  crash() { this.noise(0.6, 3000, 0.6, 'bandpass'); this.blip(110, 0.35, 'sawtooth', 0.25, -60); }
  hop() { this.noise(0.35, 2400, 0.45, 'bandpass'); }
  whoosh() { this.noise(0.3, 1600, 0.25, 'bandpass'); }
  warn() { this.blip(980, 0.1, 'square', 0.12); setTimeout(() => this.blip(980, 0.1, 'square', 0.12), 160); setTimeout(() => this.blip(980, 0.14, 'square', 0.12), 320); }
  score() { this.blip(1320, 0.09, 'triangle', 0.12, 400); }
  jet() { this.noise(3.5, 5000, 0.5, 'bandpass'); this.blip(900, 3.2, 'sawtooth', 0.05, -700); }
  rumble() { this.noise(2.2, 280, 0.7); }
  count(go) { this.blip(go ? 1320 : 660, go ? 0.4 : 0.18, 'triangle', 0.2); }
}
