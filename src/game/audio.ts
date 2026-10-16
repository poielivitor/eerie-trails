// Procedural Web Audio engine (recreated from the original game) + scripted scare sounds.
export class GameAudio {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
  timers: number[] = [];
  ended = false;

  constructor() {
    this.ctx = new AudioContext();
    this.ctx.resume();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.wind();
    this.drone();
    this.scheduleCracks();
  }

  wind() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 500;
    const g = this.ctx.createGain();
    g.gain.value = 0.12;
    const l1 = this.ctx.createOscillator();
    l1.frequency.value = 0.08;
    const l1g = this.ctx.createGain();
    l1g.gain.value = 0.08;
    l1.connect(l1g).connect(g.gain);
    const l2 = this.ctx.createOscillator();
    l2.frequency.value = 0.13;
    const l2g = this.ctx.createGain();
    l2g.gain.value = 250;
    l2.connect(l2g).connect(f.frequency);
    s.connect(f).connect(g).connect(this.master);
    s.start();
    l1.start();
    l2.start();
  }

  drone() {
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 180;
    [41, 41.6, 61.5].forEach((fr) => {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = fr;
      o.connect(f);
      o.start();
    });
    f.connect(g).connect(this.master);
  }

  scheduleCracks() {
    const next = () => {
      const t = window.setTimeout(() => {
        this.crack();
        next();
      }, 6000 + Math.random() * 14000);
      this.timers.push(t);
    };
    next();
  }

  crack() {
    const now = this.ctx.currentTime;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.random() * 2 - 1;
    for (let i = 0; i < 3; i++) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 900 + Math.random() * 1200;
      const g = this.ctx.createGain();
      const t = now + i * (0.04 + Math.random() * 0.08);
      g.gain.setValueAtTime(1e-4, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.005);
      g.gain.exponentialRampToValueAtTime(1e-4, t + 0.06);
      s.connect(f).connect(g).connect(p);
      s.start(t, Math.random());
      s.stop(t + 0.1);
    }
    p.connect(this.master);
  }

  step() {
    const e = this.ctx.currentTime;
    const t = this.ctx.createBufferSource();
    t.buffer = this.noise;
    const n = this.ctx.createBiquadFilter();
    n.type = "bandpass";
    n.frequency.value = 350 + Math.random() * 300;
    n.Q.value = 0.8;
    const r = this.ctx.createGain();
    r.gain.setValueAtTime(1e-4, e);
    r.gain.exponentialRampToValueAtTime(0.35, e + 0.01);
    r.gain.exponentialRampToValueAtTime(1e-4, e + 0.18);
    t.connect(n).connect(r).connect(this.master);
    t.start(e, Math.random());
    t.stop(e + 0.2);
    const i = this.ctx.createBufferSource();
    i.buffer = this.noise;
    const a = this.ctx.createBiquadFilter();
    a.type = "highpass";
    a.frequency.value = 3000;
    const o = this.ctx.createGain();
    o.gain.setValueAtTime(1e-4, e);
    o.gain.exponentialRampToValueAtTime(0.06, e + 0.02);
    o.gain.exponentialRampToValueAtTime(1e-4, e + 0.12);
    i.connect(a).connect(o).connect(this.master);
    i.start(e + 0.01, Math.random());
    i.stop(e + 0.15);
  }

  creak() {
    const e = this.ctx.currentTime;
    const t = this.ctx.createOscillator();
    t.type = "square";
    t.frequency.setValueAtTime(900, e);
    t.frequency.linearRampToValueAtTime(700, e + 0.25);
    const n = this.ctx.createBiquadFilter();
    n.type = "bandpass";
    n.frequency.value = 1500;
    n.Q.value = 8;
    const r = this.ctx.createGain();
    r.gain.setValueAtTime(1e-4, e);
    r.gain.exponentialRampToValueAtTime(0.012, e + 0.05);
    r.gain.exponentialRampToValueAtTime(1e-4, e + 0.3);
    t.connect(n).connect(r).connect(this.master);
    t.start(e);
    t.stop(e + 0.32);
  }

  pickup() {
    const e = this.ctx.currentTime;
    const t = this.ctx.createOscillator();
    t.type = "triangle";
    t.frequency.setValueAtTime(300, e);
    t.frequency.exponentialRampToValueAtTime(600, e + 0.2);
    const n = this.ctx.createGain();
    n.gain.setValueAtTime(0.08, e);
    n.gain.exponentialRampToValueAtTime(1e-4, e + 0.4);
    t.connect(n).connect(this.master);
    t.start(e);
    t.stop(e + 0.45);
  }

  /** Echo bus: feedback delay that makes a sound ring out through the forest. */
  private echoBus(delay = 0.32, feedback = 0.5, wet = 0.6) {
    const input = this.ctx.createGain();
    const d = this.ctx.createDelay(2);
    d.delayTime.value = delay;
    const fb = this.ctx.createGain();
    fb.gain.value = feedback;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    const w = this.ctx.createGain();
    w.gain.value = wet;
    input.connect(this.master);
    input.connect(d);
    d.connect(lp).connect(fb).connect(d);
    lp.connect(w).connect(this.master);
    return input;
  }

  private noiseBurst(
    out: AudioNode,
    t: number,
    dur: number,
    type: BiquadFilterType,
    freq: number,
    q: number,
    peak: number,
    attack = 0.03,
  ) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
    return f;
  }

  /** Whispered "psiu" close to the ear. */
  whisper(pan = 0.6) {
    const t = this.ctx.currentTime;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.master);
    // "p" – tiny plosive
    this.noiseBurst(p, t, 0.05, "lowpass", 900, 0.7, 0.25, 0.004);
    // "ssss"
    this.noiseBurst(p, t + 0.04, 0.42, "highpass", 4500, 0.7, 0.35, 0.06);
    // "iu" – whispered vowel glide (unvoiced formants)
    const t2 = t + 0.44;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(1e-4, t2);
    g.gain.exponentialRampToValueAtTime(0.5, t2 + 0.05);
    g.gain.exponentialRampToValueAtTime(1e-4, t2 + 0.38);
    [
      [2600, 750],
      [320, 350],
    ].forEach(([a, b]) => {
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 9;
      f.frequency.setValueAtTime(a, t2);
      f.frequency.exponentialRampToValueAtTime(b, t2 + 0.3);
      s.connect(f).connect(g);
    });
    g.connect(p);
    s.start(t2, Math.random());
    s.stop(t2 + 0.45);
  }

  /** Bat wing flutter + squeaks, panned across the head. */
  bat() {
    const t = this.ctx.currentTime;
    const p = this.ctx.createStereoPanner();
    p.pan.setValueAtTime(-1, t);
    p.pan.linearRampToValueAtTime(1, t + 1.2);
    p.connect(this.master);
    for (let i = 0; i < 14; i++)
      this.noiseBurst(p, t + i * 0.08, 0.05, "bandpass", 500, 1.5, 0.18, 0.005);
    for (let i = 0; i < 4; i++) {
      const tt = t + 0.15 + i * 0.22;
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(6500, tt);
      o.frequency.exponentialRampToValueAtTime(4200, tt + 0.05);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(1e-4, tt);
      g.gain.exponentialRampToValueAtTime(0.04, tt + 0.008);
      g.gain.exponentialRampToValueAtTime(1e-4, tt + 0.06);
      o.connect(g).connect(p);
      o.start(tt);
      o.stop(tt + 0.07);
    }
  }

  /** Fast footsteps rushing past and away. */
  rush(pan = 0.8) {
    const t = this.ctx.currentTime;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.02, t + 3);
    p.connect(g).connect(this.master);
    for (let i = 0; i < 16; i++)
      this.noiseBurst(p, t + i * 0.18, 0.12, "bandpass", 420, 0.9, 0.3, 0.01);
  }

  /** Lantern sputter when it goes out / re-lights. */
  sputter() {
    const t = this.ctx.currentTime;
    this.noiseBurst(this.master, t, 0.35, "bandpass", 1800, 1.2, 0.12, 0.01);
  }

  /** Scream with formant filters, a voice source and an echo tail. */
  private voice(opts: {
    t: number;
    dur: number;
    pitch: [number, number][]; // [time offset, Hz]
    formants: [number, number][][]; // per formant: [time offset, Hz]
    gain: number;
    pan: number;
    distance: number; // 0 near .. 1 far (lowpass)
    echo: [number, number, number];
  }) {
    const { t, dur } = opts;
    const bus = this.echoBus(...opts.echo);
    const p = this.ctx.createStereoPanner();
    p.pan.value = opts.pan;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6000 - opts.distance * 4000;
    p.connect(lp).connect(bus);

    const src = this.ctx.createOscillator();
    src.type = "sawtooth";
    opts.pitch.forEach(([o, f], i) =>
      i === 0
        ? src.frequency.setValueAtTime(f, t + o)
        : src.frequency.exponentialRampToValueAtTime(f, t + o),
    );
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 7;
    const vg = this.ctx.createGain();
    vg.gain.value = 18;
    vib.connect(vg).connect(src.frequency);
    const breath = this.ctx.createBufferSource();
    breath.buffer = this.noise;
    breath.loop = true;
    const bg = this.ctx.createGain();
    bg.gain.value = 0.18;
    const mix = this.ctx.createGain();
    src.connect(mix);
    breath.connect(bg).connect(mix);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(1e-4, t);
    env.gain.exponentialRampToValueAtTime(opts.gain, t + 0.08);
    env.gain.setValueAtTime(opts.gain * 0.85, t + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    opts.formants.forEach((curve, i) => {
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 5 + i * 2;
      curve.forEach(([o, hz], j) =>
        j === 0
          ? f.frequency.setValueAtTime(hz, t + o)
          : f.frequency.exponentialRampToValueAtTime(hz, t + o),
      );
      const g = this.ctx.createGain();
      g.gain.value = [1, 0.6, 0.25][i] ?? 0.2;
      mix.connect(f).connect(g).connect(env);
    });
    env.connect(p);
    [src, vib, breath].forEach((n) => {
      n.start(t);
      n.stop(t + dur + 0.05);
    });
  }

  /** Distant panic scream echoing for ~2 seconds. */
  panicScream() {
    const t = this.ctx.currentTime + 0.05;
    this.voice({
      t,
      dur: 1.4,
      pitch: [
        [0, 420],
        [0.2, 780],
        [0.9, 690],
        [1.4, 380],
      ],
      formants: [
        [
          [0, 850],
          [1.4, 700],
        ],
        [
          [0, 1250],
          [1.4, 1100],
        ],
        [
          [0, 2800],
          [1.4, 2600],
        ],
      ],
      gain: 0.5,
      pan: -0.5,
      distance: 0.5,
      echo: [0.28, 0.45, 0.7],
    });
  }

  /** A scary shouted "Hey" echoing through the trees. */
  hey() {
    const t = this.ctx.currentTime + 0.05;
    // "H" breath
    const bus = this.echoBus(0.35, 0.45, 0.65);
    this.noiseBurst(bus, t, 0.12, "bandpass", 1600, 0.8, 0.25, 0.03);
    // "ey" diphthong e → i, rough low male shout
    this.voice({
      t: t + 0.08,
      dur: 0.75,
      pitch: [
        [0, 210],
        [0.1, 260],
        [0.75, 170],
      ],
      formants: [
        [
          [0, 600],
          [0.35, 520],
          [0.7, 320],
        ],
        [
          [0, 1800],
          [0.35, 1950],
          [0.7, 2300],
        ],
        [
          [0, 2600],
          [0.7, 3000],
        ],
      ],
      gain: 0.7,
      pan: 0.3,
      distance: 0.3,
      echo: [0.35, 0.45, 0.65],
    });
  }

  /** Small rustle in the leaves (squirrel). */
  rustle() {
    const t = this.ctx.currentTime;
    const p = this.ctx.createStereoPanner();
    p.pan.setValueAtTime(-0.8, t);
    p.pan.linearRampToValueAtTime(0.8, t + 0.9);
    p.connect(this.master);
    for (let i = 0; i < 10; i++)
      this.noiseBurst(p, t + i * 0.09, 0.06, "highpass", 2500, 0.7, 0.12, 0.005);
  }

  despair() {
    if (this.ended) return;
    this.ended = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const e = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(e);
    this.master.gain.setTargetAtTime(0, e, 0.025);
    const t = e + 0.25,
      n = 2.8;
    const r = this.ctx.createOscillator();
    r.type = "sawtooth";
    r.frequency.setValueAtTime(240, t);
    r.frequency.exponentialRampToValueAtTime(530, t + 0.28);
    r.frequency.exponentialRampToValueAtTime(390, t + 1.5);
    r.frequency.exponentialRampToValueAtTime(160, t + n);
    const i = this.ctx.createOscillator(),
      a = this.ctx.createGain();
    i.frequency.value = 9;
    a.gain.value = 28;
    i.connect(a).connect(r.frequency);
    const o = this.ctx.createBufferSource();
    o.buffer = this.noise;
    o.loop = true;
    const s = this.ctx.createGain();
    s.gain.value = 0.14;
    const c = this.ctx.createGain();
    r.connect(c);
    o.connect(s).connect(c);
    const l = this.ctx.createGain();
    l.gain.setValueAtTime(0, t);
    l.gain.linearRampToValueAtTime(0.65, t + 0.12);
    l.gain.setValueAtTime(0.55, t + 1.3);
    l.gain.exponentialRampToValueAtTime(0.001, t + n);
    [850, 1250, 2800].forEach((fr, idx) => {
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = fr;
      f.Q.value = 4 + idx;
      const g = this.ctx.createGain();
      g.gain.value = [0.8, 0.55, 0.2][idx];
      c.connect(f).connect(g).connect(l);
    });
    const u = this.ctx.createDynamicsCompressor();
    u.threshold.value = -12;
    u.ratio.value = 8;
    l.connect(u).connect(this.ctx.destination);
    const d = this.ctx.createDelay(1);
    d.delayTime.value = 0.3;
    const f = this.ctx.createGain();
    f.gain.value = 0.28;
    l.connect(d).connect(f).connect(u);
    [r, o, i].forEach((x) => {
      x.start(t);
      x.stop(t + n);
    });
  }

  close() {
    this.timers.forEach(clearTimeout);
    this.ctx.close();
  }
}
