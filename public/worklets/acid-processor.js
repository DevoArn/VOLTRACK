/*
 * ACIDLINE BL-1 — monophonic acid bassline voice + 16-step sequencer.
 *
 * Signal path: polyBLEP saw/square → 4-pole nonlinear ladder low-pass (2× oversampled)
 * → VCA → optional overdrive. Filter is swept by a decaying envelope (ENV MOD / DECAY)
 * and an "accent" circuit: accented notes get a short fixed decay, a volume boost and a
 * lagged extra cutoff sweep that builds up over consecutive accents. Slide holds the gate
 * into the next step and glides the pitch instead of retriggering.
 *
 * Messages in : {type:'pattern', pattern:{length, steps:[{note,oct,acc,slide,gate}]}}
 *               {type:'noteOn', note, acc}  {type:'noteOff', note}  {type:'allOff'}
 * Messages out: {type:'step', step}
 */

function polyblep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

const BASE_NOTE = 36; // C2

class AcidVoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const k = (name, defaultValue, minValue, maxValue) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: 'k-rate',
    });
    return [
      k('tune', 0, -12, 12),
      k('transpose', 0, -24, 24),
      k('cutoff', 500, 20, 10000),
      k('res', 0.6, 0, 1),
      k('envmod', 0.5, 0, 1),
      k('decay', 0.6, 0.05, 4),
      k('accent', 0.6, 0, 1),
      k('wave', 0, 0, 1),
      k('drive', 0, 0, 1),
      k('tempo', 124, 20, 320),
      k('run', 0, 0, 1),
      k('swing', 0, 0, 0.45),
      // Amp envelope: 0 = classic gate envelope, 1 = ADSR
      k('ampMode', 0, 0, 1),
      k('ampA', 0.003, 0.0005, 5),
      k('ampD', 0.3, 0.005, 5),
      k('ampS', 0.7, 0, 1),
      k('ampR', 0.05, 0.003, 8),
    ];
  }

  constructor() {
    super();
    const sr = sampleRate;
    this.pattern = { length: 16, steps: [] };
    this.running = false;
    this.step = -1;
    this.counter = 0;
    this.gateCount = 0;
    this.prev = null;
    this.held = [];

    this.phase = 0;
    this.pitch = BASE_NOTE;
    this.target = BASE_NOTE;
    this.glide = false;
    this.gate = false;
    this.accentOn = false;
    this.menv = 0;
    this.amp = 0;
    this.accCap = 0;
    this.ampStage = 0; // ADSR: 0 idle, 1 attack, 2 decay/sustain, 3 release
    this.prevGate = false;
    this.y1 = this.y2 = this.y3 = this.y4 = 0;

    this.glideCoef = 1 - Math.exp(-1 / (0.022 * sr));
    this.atkCoef = 1 - Math.exp(-1 / (0.0025 * sr));
    this.relCoef = Math.exp(-1 / (0.007 * sr));
    this.accCharge = 1 - Math.exp(-1 / (0.02 * sr));
    this.accDischarge = 1 - Math.exp(-1 / (0.25 * sr));

    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    if (!m) return;
    if (m.type === 'pattern') this.pattern = m.pattern;
    else if (m.type === 'noteOn') {
      const legato = this.held.length > 0;
      this.held = this.held.filter((n) => n !== m.note);
      this.held.push(m.note);
      this.target = m.note;
      this.accentOn = !!m.acc;
      if (legato) this.glide = true;
      else {
        this.glide = false;
        this.pitch = m.note;
        this.trigger();
      }
      this.gate = true;
      this.gateCount = 0;
    } else if (m.type === 'noteOff') {
      this.held = this.held.filter((n) => n !== m.note);
      if (this.held.length) {
        this.target = this.held[this.held.length - 1];
        this.glide = true;
      } else this.gate = false;
    } else if (m.type === 'allOff') {
      this.held = [];
      this.gate = false;
    }
  }

  trigger() {
    this.menv = 1;
    this.ampStage = 1;
  }

  advance(base, swing) {
    const steps = this.pattern.steps;
    const len = Math.max(1, Math.min(16, this.pattern.length | 0));
    this.step = (this.step + 1) % len;
    const s = steps[this.step] || { gate: 0 };
    const stepLen = Math.max(1, Math.round(base * (this.step % 2 === 0 ? 1 + swing : 1 - swing)));
    this.counter = stepLen;
    this.port.postMessage({ type: 'step', step: this.step });

    if (this.held.length) {
      this.prev = s; // live playing overrides the sequencer voice
      return;
    }
    const sliding = this.prev && this.prev.gate && this.prev.slide && this.gate;
    if (s.gate) {
      const note = BASE_NOTE + s.note + 12 * s.oct;
      this.target = note;
      this.accentOn = !!s.acc;
      if (sliding) this.glide = true;
      else {
        this.glide = false;
        this.pitch = note;
        this.trigger();
      }
      this.gate = true;
      // Slide steps hold the gate into the next step; normal steps gate for half a step.
      this.gateCount = s.slide ? 0 : Math.max(1, Math.round(stepLen * 0.5));
    } else {
      this.gate = false;
      this.gateCount = 0;
    }
    this.prev = s;
  }

  process(_inputs, outputs, P) {
    const out = outputs[0][0];
    const n = out.length;
    const sr = sampleRate;

    const run = P.run[0] > 0.5;
    if (run && !this.running) {
      this.step = -1;
      this.counter = 0;
      this.prev = null;
    }
    if (!run && this.running) {
      if (!this.held.length) this.gate = false;
      this.port.postMessage({ type: 'step', step: -1 });
    }
    this.running = run;

    const base = (sr * 60) / P.tempo[0] / 4; // samples per 16th
    const swing = P.swing[0];
    const detune = P.tune[0] + P.transpose[0];
    const cutoff = P.cutoff[0];
    const res = P.res[0];
    const envmod = P.envmod[0];
    const accAmt = P.accent[0];
    const square = P.wave[0] > 0.5;
    const drive = P.drive[0];
    const menvN = Math.exp(-4.6 / (P.decay[0] * sr));
    const menvA = Math.exp(-4.6 / (0.2 * sr));
    const k = res * 4.15;
    const nyq = Math.min(sr * 0.45, 20000);
    const driveGain = 1 + drive * 14;
    const driveNorm = drive > 0.001 ? (1 - drive * 0.35) / Math.tanh(driveGain) : 1;
    const adsr = P.ampMode[0] > 0.5;
    const aInc = 1 / (P.ampA[0] * sr);
    const dCoef = Math.exp(-4.6 / (P.ampD[0] * sr));
    const sLvl = P.ampS[0];
    const rCoef = Math.exp(-4.6 / (P.ampR[0] * sr));

    for (let i = 0; i < n; i++) {
      if (run) {
        if (this.counter <= 0) this.advance(base, swing);
        this.counter--;
        if (this.gateCount > 0 && --this.gateCount === 0) this.gate = false;
      }

      // --- pitch / oscillator
      if (this.glide) this.pitch += (this.target - this.pitch) * this.glideCoef;
      else this.pitch = this.target;
      const f = 440 * Math.pow(2, (this.pitch + detune - 69) / 12);
      const dt = Math.min(f / sr, 0.45);
      const t = this.phase;
      let osc;
      if (square) {
        osc = t < 0.5 ? 1 : -1;
        osc += polyblep(t, dt);
        osc -= polyblep((t + 0.5) % 1, dt);
      } else {
        osc = 2 * t - 1 - polyblep(t, dt);
      }
      this.phase += dt;
      if (this.phase >= 1) this.phase -= 1;

      // --- envelopes
      this.menv *= this.accentOn ? menvA : menvN;
      if (adsr) {
        if (this.gate && !this.prevGate && this.ampStage !== 1) this.ampStage = 1;
        else if (!this.gate && this.prevGate) this.ampStage = 3;
        if (this.ampStage === 1) {
          this.amp += aInc;
          if (this.amp >= 1) {
            this.amp = 1;
            this.ampStage = 2;
          }
        } else if (this.ampStage === 2) this.amp = sLvl + (this.amp - sLvl) * dCoef;
        else if (this.ampStage === 3) {
          this.amp *= rCoef;
          if (this.amp < 1e-5) {
            this.amp = 0;
            this.ampStage = 0;
          }
        }
      } else if (this.gate) this.amp += (1 - this.amp) * this.atkCoef;
      else this.amp *= this.relCoef;
      this.prevGate = this.gate;
      const accIn = this.gate && this.accentOn ? this.menv : 0;
      this.accCap += (accIn - this.accCap) * (accIn > this.accCap ? this.accCharge : this.accDischarge);

      // --- filter cutoff: env mod lowers the base and adds a sweep; accent adds a lagged bump
      const oct = envmod * (this.menv * 4.5 - 1) + accAmt * this.accCap * (1.5 + res * 2);
      let fc = cutoff * Math.pow(2, oct);
      if (fc < 20) fc = 20;
      else if (fc > nyq) fc = nyq;
      const g = 1 - Math.exp((-2 * Math.PI * fc) / (2 * sr));

      // --- 4-pole ladder, 2× oversampled, tanh-saturated feedback
      for (let o = 0; o < 2; o++) {
        const x = Math.tanh(osc * 0.9 - k * this.y4);
        this.y1 += g * (x - this.y1);
        this.y2 += g * (this.y1 - this.y2);
        this.y3 += g * (this.y2 - this.y3);
        this.y4 += g * (this.y3 - this.y4);
      }
      let y = this.y4 * (1 + k * 0.35);

      // --- VCA with accent boost, then overdrive
      y *= this.amp * (1 + (this.accentOn ? accAmt * 0.8 : 0));
      if (drive > 0.001) y = Math.tanh(y * driveGain) * driveNorm;
      out[i] = y * 0.55;
    }
    if (!Number.isFinite(this.y4)) this.y1 = this.y2 = this.y3 = this.y4 = 0;
    return true;
  }
}

registerProcessor('acid-voice', AcidVoiceProcessor);
