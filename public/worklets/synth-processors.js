/*
 * VOLTRACK — AudioWorklet DSP processors.
 *
 * Eurorack voltage conventions — one sample unit == one volt:
 *   audio  : ±5 V (10 Vpp)
 *   pitch  : 1 V/oct, 0 V = C4 (261.63 Hz)
 *   gate   : 0 V low / +10 V high, inputs trigger above +1 V
 *   cv     : LFO ±5 V, envelopes 0 .. +10 V
 */

const TAU = Math.PI * 2;
const C4 = 261.6255653;
const AUDIO_V = 5; // audio peak voltage
const GATE_V = 10; // gate high voltage
const GATE_TH = 1; // gate threshold

/** First channel of input `i`, or null if nothing is patched into it. */
function inp(inputs, i) {
  const x = inputs[i];
  return x && x.length ? x[0] : null;
}
/** Read an a-rate or k-rate AudioParam array. */
function prm(p, i) {
  return p.length > 1 ? p[i] : p[0];
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
/** PolyBLEP residual for band-limited discontinuities. */
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

/* ------------------------------------------------------------------ VCO */
class VCOProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'octave', defaultValue: 0, minValue: -5, maxValue: 5, automationRate: 'k-rate' },
      { name: 'tune', defaultValue: 0, minValue: -24, maxValue: 24 },
      { name: 'fm', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'pw', defaultValue: 0.5, minValue: 0.02, maxValue: 0.98 },
      { name: 'pwm', defaultValue: 0, minValue: 0, maxValue: 0.5 },
    ];
  }
  constructor() {
    super();
    this.phase = 0;
    this.lastSync = 0;
  }
  process(inputs, outputs, params) {
    const pitch = inp(inputs, 0);
    const fmIn = inp(inputs, 1);
    const pwmIn = inp(inputs, 2);
    const sync = inp(inputs, 3);
    const oSin = outputs[0][0];
    const oTri = outputs[1][0];
    const oSaw = outputs[2][0];
    const oPul = outputs[3][0];
    const n = oSin.length;
    const oct = params.octave[0];
    const nyq = sampleRate * 0.45;

    for (let i = 0; i < n; i++) {
      const v = oct + prm(params.tune, i) / 12 + (pitch ? pitch[i] : 0);
      let f = C4 * Math.pow(2, v);
      if (fmIn) f += (fmIn[i] / AUDIO_V) * prm(params.fm, i) * f * 4; // linear (through-zero) FM
      f = clamp(f, -nyq, nyq);
      const dt = f / sampleRate;
      const adt = Math.abs(dt) || 1e-9;

      if (sync) {
        const s = sync[i];
        if (s > GATE_TH && this.lastSync <= GATE_TH) this.phase = 0;
        this.lastSync = s;
      }

      const t = this.phase;
      oSin[i] = AUDIO_V * Math.sin(TAU * t);
      oTri[i] = AUDIO_V * (1 - 4 * Math.abs(t - 0.5));
      oSaw[i] = AUDIO_V * (2 * t - 1 - polyblep(t, adt));

      const pw = clamp(prm(params.pw, i) + (pwmIn ? (pwmIn[i] / AUDIO_V) * prm(params.pwm, i) : 0), 0.02, 0.98);
      let pul = t < pw ? 1 : -1;
      pul += polyblep(t, adt);
      pul -= polyblep((t - pw + 1) % 1, adt);
      oPul[i] = AUDIO_V * pul;

      this.phase += dt;
      if (this.phase >= 1) this.phase -= Math.floor(this.phase);
      else if (this.phase < 0) this.phase -= Math.floor(this.phase);
    }
    return true;
  }
}

/* ------------------------------------------------------------------ LFO */
class LFOProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'rate', defaultValue: 1, minValue: 0.001, maxValue: 200 }];
  }
  constructor() {
    super();
    this.phase = 0;
    this.lastReset = 0;
    this.count = 0;
  }
  process(inputs, outputs, params) {
    const rcv = inp(inputs, 0);
    const rst = inp(inputs, 1);
    const oSin = outputs[0][0];
    const oTri = outputs[1][0];
    const oSaw = outputs[2][0];
    const oSq = outputs[3][0];
    const n = oSin.length;
    for (let i = 0; i < n; i++) {
      let r = prm(params.rate, i);
      if (rcv) r *= Math.pow(2, rcv[i]);
      if (rst) {
        if (rst[i] > GATE_TH && this.lastReset <= GATE_TH) this.phase = 0;
        this.lastReset = rst[i];
      }
      const t = this.phase;
      oSin[i] = AUDIO_V * Math.sin(TAU * t);
      oTri[i] = AUDIO_V * (1 - 4 * Math.abs(t - 0.5));
      oSaw[i] = AUDIO_V * (2 * t - 1);
      oSq[i] = t < 0.5 ? AUDIO_V : -AUDIO_V;
      this.phase += r / sampleRate;
      if (this.phase >= 1) this.phase -= Math.floor(this.phase);
    }
    this.count += n;
    if (this.count >= 1024) {
      this.count = 0;
      this.port.postMessage(oSin[n - 1] / AUDIO_V);
    }
    return true;
  }
}

/* ---------------------------------------------------------------- NOISE */
class NoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.b = [0, 0, 0, 0, 0, 0, 0];
    this.brown = 0;
  }
  process(_inputs, outputs) {
    const oW = outputs[0][0];
    const oP = outputs[1][0];
    const oB = outputs[2][0];
    const b = this.b;
    for (let i = 0; i < oW.length; i++) {
      const w = Math.random() * 2 - 1;
      // Paul Kellet's pink noise filter
      b[0] = 0.99886 * b[0] + w * 0.0555179;
      b[1] = 0.99332 * b[1] + w * 0.0750759;
      b[2] = 0.969 * b[2] + w * 0.153852;
      b[3] = 0.8665 * b[3] + w * 0.3104856;
      b[4] = 0.55 * b[4] + w * 0.5329522;
      b[5] = -0.7616 * b[5] - w * 0.016898;
      const pink = (b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362) * 0.11;
      b[6] = w * 0.115926;
      this.brown = (this.brown + 0.02 * w) / 1.02;
      oW[i] = w * 0.8 * AUDIO_V;
      oP[i] = pink * AUDIO_V;
      oB[i] = this.brown * 3.5 * AUDIO_V;
    }
    return true;
  }
}

/* ----------------------------------------------------------------- ADSR */
class ADSRProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'attack', defaultValue: 0.01, minValue: 0.0005, maxValue: 20, automationRate: 'k-rate' },
      { name: 'decay', defaultValue: 0.2, minValue: 0.001, maxValue: 20, automationRate: 'k-rate' },
      { name: 'sustain', defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.4, minValue: 0.001, maxValue: 30, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.stage = 0; // 0 idle, 1 attack, 2 decay/sustain, 3 release
    this.level = 0;
    this.gateHigh = false;
    this.count = 0;
  }
  process(inputs, outputs, params) {
    const gate = inp(inputs, 0);
    const retrig = inp(inputs, 1);
    const out = outputs[0][0];
    const inv = outputs[1][0];
    const n = out.length;
    const aInc = 1 / (Math.max(params.attack[0], 0.0005) * sampleRate);
    const dCoef = Math.exp(-4.6 / (Math.max(params.decay[0], 0.001) * sampleRate));
    const rCoef = Math.exp(-4.6 / (Math.max(params.release[0], 0.001) * sampleRate));
    const s = params.sustain[0];

    for (let i = 0; i < n; i++) {
      const high = gate ? gate[i] > GATE_TH : false;
      if (high && !this.gateHigh) this.stage = 1;
      else if (!high && this.gateHigh) this.stage = 3;
      this.gateHigh = high;
      if (retrig && high) {
        const r = retrig[i] > GATE_TH;
        if (r && !this.rHigh) this.stage = 1;
        this.rHigh = r;
      }

      switch (this.stage) {
        case 1:
          this.level += aInc;
          if (this.level >= 1) {
            this.level = 1;
            this.stage = 2;
          }
          break;
        case 2:
          this.level = s + (this.level - s) * dCoef;
          break;
        case 3:
          this.level *= rCoef;
          if (this.level < 1e-5) {
            this.level = 0;
            this.stage = 0;
          }
          break;
        default:
          break;
      }
      out[i] = this.level * 10;
      inv[i] = -this.level * 10;
    }
    this.count += n;
    if (this.count >= 1024) {
      this.count = 0;
      this.port.postMessage(this.level);
    }
    return true;
  }
}

/* ------------------------------------------------------------------ VCF */
/* Zero-delay-feedback state variable filter (Cytomic / A. Simper). */
class VCFProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff', defaultValue: 1000, minValue: 10, maxValue: 22000 },
      { name: 'res', defaultValue: 0.2, minValue: 0, maxValue: 1 },
      { name: 'amt', defaultValue: 0.5, minValue: -1, maxValue: 1 },
      { name: 'drive', defaultValue: 1, minValue: 0.1, maxValue: 20 },
    ];
  }
  constructor() {
    super();
    this.ic1 = 0;
    this.ic2 = 0;
  }
  process(inputs, outputs, params) {
    const x = inp(inputs, 0);
    const cv = inp(inputs, 1);
    const track = inp(inputs, 2);
    const oLP = outputs[0][0];
    const oBP = outputs[1][0];
    const oHP = outputs[2][0];
    const n = oLP.length;
    const maxF = sampleRate * 0.45;
    for (let i = 0; i < n; i++) {
      let oct = 0;
      if (cv) oct += cv[i] * prm(params.amt, i); // 1 V/oct at full amount
      if (track) oct += track[i];
      const fc = clamp(prm(params.cutoff, i) * Math.pow(2, oct), 15, maxF);
      const g = Math.tan((Math.PI * fc) / sampleRate);
      const k = 2 - 1.98 * prm(params.res, i);
      const a1 = 1 / (1 + g * (g + k));
      const a2 = g * a1;
      const a3 = g * a2;

      const drive = prm(params.drive, i);
      const v0 = x ? Math.tanh((x[i] / AUDIO_V) * drive) : 0;
      const v3 = v0 - this.ic2;
      const v1 = a1 * this.ic1 + a2 * v3;
      const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
      this.ic1 = 2 * v1 - this.ic1;
      this.ic2 = 2 * v2 - this.ic2;

      oLP[i] = v2 * AUDIO_V;
      oBP[i] = v1 * AUDIO_V;
      oHP[i] = (v0 - k * v1 - v2) * AUDIO_V;
    }
    // Denormal / blow-up guard
    if (!Number.isFinite(this.ic1) || !Number.isFinite(this.ic2)) {
      this.ic1 = 0;
      this.ic2 = 0;
    }
    return true;
  }
}

/* -------------------------------------------------------------- SHAPER */
class ShaperProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'drive', defaultValue: 2, minValue: 1, maxValue: 40 },
      { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 6, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 1, minValue: 0, maxValue: 1 },
    ];
  }
  constructor() {
    super();
    this.hold = 0;
    this.holdCount = 0;
  }
  process(inputs, outputs, params) {
    const x = inp(inputs, 0);
    const cv = inp(inputs, 1);
    const out = outputs[0][0];
    const mode = Math.round(params.mode[0]);
    for (let i = 0; i < out.length; i++) {
      const dry = x ? x[i] / AUDIO_V : 0;
      const drive = clamp(prm(params.drive, i) + (cv ? cv[i] * 2 : 0), 1, 60);
      let y;
      if (mode === 0) {
        y = Math.tanh(dry * drive);
      } else if (mode === 1) {
        y = clamp(dry * drive, -1, 1);
      } else if (mode === 2) {
        y = Math.sin(dry * drive * 1.5707963); // smooth wavefolder
      } else if (mode === 4) {
        const v = dry * drive; // tube: asymmetric soft clip
        y = v >= 0 ? 1 - Math.exp(-v) : -(1 - Math.exp(v * 0.6)) * 0.8;
      } else if (mode === 5) {
        const v = dry * drive; // fuzz
        y = Math.sign(v) * Math.pow(Math.min(1, Math.abs(v)), 0.25);
      } else if (mode === 6) {
        y = Math.tanh(Math.abs(dry * drive)) * 1.4 - 0.5; // full-wave rectifier
      } else {
        // bit crush + sample-rate reduction
        const bits = clamp(16 - ((drive - 1) / 39) * 14, 2, 16);
        const steps = Math.pow(2, bits) / 2;
        const factor = 1 + Math.floor((drive - 1) / 2);
        if (this.holdCount <= 0) {
          this.hold = Math.round(dry * steps) / steps;
          this.holdCount = factor;
        }
        this.holdCount--;
        y = this.hold;
      }
      const m = prm(params.mix, i);
      out[i] = (dry * (1 - m) + y * m) * AUDIO_V;
    }
    return true;
  }
}

/* ---------------------------------------------------------------- CLOCK */
class ClockProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bpm', defaultValue: 120, minValue: 10, maxValue: 400, automationRate: 'k-rate' },
      { name: 'run', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'swing', defaultValue: 0, minValue: 0, maxValue: 0.5, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.phase = 0;
    this.lastBeat = -1;
    this.wasRunning = false;
    this.rstCount = 0;
  }
  process(_inputs, outputs, params) {
    const o = outputs.map((x) => x[0]); // x1 x2 x4 d2 d4 rst
    const n = o[0].length;
    const run = params.run[0] > 0.5;
    if (run && !this.wasRunning) {
      this.phase = 0;
      this.lastBeat = -1;
      this.rstCount = Math.floor(0.005 * sampleRate);
    }
    this.wasRunning = run;
    const inc = params.bpm[0] / 60 / sampleRate;
    const swing = params.swing[0];

    for (let i = 0; i < n; i++) {
      if (!run) {
        for (let k = 0; k < 6; k++) o[k][i] = 0;
        continue;
      }
      const p = this.phase;
      // swing delays every second 8th note
      const e = (p * 2) % 2;
      const sw = e < 1 ? e < 0.5 : e - 1 >= swing * 0.5 && e - 1 < 0.5 + swing * 0.5;
      o[0][i] = p % 1 < 0.5 ? GATE_V : 0;
      o[1][i] = sw ? GATE_V : 0;
      o[2][i] = (p * 4) % 1 < 0.5 ? GATE_V : 0;
      o[3][i] = (p / 2) % 1 < 0.5 ? GATE_V : 0;
      o[4][i] = (p / 4) % 1 < 0.5 ? GATE_V : 0;
      o[5][i] = this.rstCount > 0 ? GATE_V : 0;
      if (this.rstCount > 0) this.rstCount--;

      const beat = Math.floor(p);
      if (beat !== this.lastBeat) {
        this.lastBeat = beat;
        this.port.postMessage({ beat });
      }
      this.phase += inc;
      if (this.phase >= 4) this.phase -= 4;
    }
    return true;
  }
}

/* ------------------------------------------------------------ SEQUENCER */
const SEQ_STEPS = 8;
class SequencerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const d = [{ name: 'steps', defaultValue: 8, minValue: 1, maxValue: SEQ_STEPS, automationRate: 'k-rate' }];
    for (let i = 0; i < SEQ_STEPS; i++) {
      d.push({ name: `p${i}`, defaultValue: 0, minValue: -48, maxValue: 48, automationRate: 'k-rate' });
      d.push({ name: `g${i}`, defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' });
    }
    return d;
  }
  constructor() {
    super();
    this.step = -1;
    this.clkHigh = false;
    this.lastRst = 0;
    this.eoc = 0;
  }
  process(inputs, outputs, params) {
    const clk = inp(inputs, 0);
    const rst = inp(inputs, 1);
    const tr = inp(inputs, 2);
    const oCv = outputs[0][0];
    const oGate = outputs[1][0];
    const oEoc = outputs[2][0];
    const steps = clamp(Math.round(params.steps[0]), 1, SEQ_STEPS);
    for (let i = 0; i < oCv.length; i++) {
      if (rst) {
        const r = rst[i];
        if (r > GATE_TH && this.lastRst <= GATE_TH) this.step = -1;
        this.lastRst = r;
      }
      const high = clk ? clk[i] > GATE_TH : false;
      if (high && !this.clkHigh) {
        this.step = (this.step + 1) % steps;
        if (this.step === 0) this.eoc = Math.floor(0.005 * sampleRate);
        this.port.postMessage({ step: this.step });
      }
      this.clkHigh = high;
      const s = this.step < 0 ? 0 : this.step % steps;
      oCv[i] = params[`p${s}`][0] / 12 + (tr ? tr[i] : 0);
      oGate[i] = high && this.step >= 0 && params[`g${s}`][0] > 0.5 ? GATE_V : 0;
      oEoc[i] = this.eoc > 0 ? GATE_V : 0;
      if (this.eoc > 0) this.eoc--;
    }
    return true;
  }
}

/* -------------------------------------------------------- SAMPLE & HOLD */
class SampleHoldProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.held = 0;
    this.last = 0;
  }
  process(inputs, outputs) {
    const sig = inp(inputs, 0);
    const trig = inp(inputs, 1);
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      const t = trig ? trig[i] : 0;
      if (t > GATE_TH && this.last <= GATE_TH) {
        // No signal patched → sample internal white noise (classic random voltage)
        this.held = sig ? sig[i] : (Math.random() * 2 - 1) * AUDIO_V;
      }
      this.last = t;
      out[i] = this.held;
    }
    return true;
  }
}

/* ----------------------------------------------------------------- SLEW */
class SlewProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rise', defaultValue: 0.1, minValue: 0.0001, maxValue: 10, automationRate: 'k-rate' },
      { name: 'fall', defaultValue: 0.1, minValue: 0.0001, maxValue: 10, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.y = 0;
  }
  process(inputs, outputs, params) {
    const x = inp(inputs, 0);
    const out = outputs[0][0];
    const cr = 1 - Math.exp(-1 / (params.rise[0] * sampleRate * 0.25));
    const cf = 1 - Math.exp(-1 / (params.fall[0] * sampleRate * 0.25));
    for (let i = 0; i < out.length; i++) {
      const v = x ? x[i] : 0;
      this.y += (v - this.y) * (v > this.y ? cr : cf);
      out[i] = this.y;
    }
    return true;
  }
}

/* ------------------------------------------------------------ QUANTIZER */
const SCALES = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // chromatic
  [0, 2, 4, 5, 7, 9, 11], // major
  [0, 2, 3, 5, 7, 8, 10], // minor
  [0, 2, 3, 5, 7, 9, 10], // dorian
  [0, 2, 4, 7, 9], // major pentatonic
  [0, 3, 5, 7, 10], // minor pentatonic
  [0, 3, 5, 6, 7, 10], // blues
  [0, 2, 4, 6, 8, 10], // whole tone
];
class QuantizerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'scale', defaultValue: 1, minValue: 0, maxValue: SCALES.length - 1, automationRate: 'k-rate' },
      { name: 'root', defaultValue: 0, minValue: 0, maxValue: 11, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.last = 0;
    this.trig = 0;
  }
  process(inputs, outputs, params) {
    const x = inp(inputs, 0);
    const out = outputs[0][0];
    const oTrig = outputs[1][0];
    const scale = SCALES[clamp(Math.round(params.scale[0]), 0, SCALES.length - 1)];
    const root = Math.round(params.root[0]);
    for (let i = 0; i < out.length; i++) {
      const semis = (x ? x[i] : 0) * 12 - root;
      const oct = Math.floor(semis / 12);
      const rem = semis - oct * 12;
      let best = scale[0];
      let bestD = 99;
      for (let k = 0; k <= scale.length; k++) {
        const deg = k === scale.length ? scale[0] + 12 : scale[k];
        const d = Math.abs(rem - deg);
        if (d < bestD) {
          bestD = d;
          best = deg;
        }
      }
      const q = (oct * 12 + best + root) / 12;
      if (q !== this.last) {
        this.trig = Math.floor(0.005 * sampleRate);
        this.last = q;
      }
      out[i] = q;
      oTrig[i] = this.trig > 0 ? GATE_V : 0;
      if (this.trig > 0) this.trig--;
    }
    return true;
  }
}

registerProcessor('vco', VCOProcessor);
registerProcessor('lfo', LFOProcessor);
registerProcessor('noise', NoiseProcessor);
registerProcessor('adsr', ADSRProcessor);
registerProcessor('vcf', VCFProcessor);
registerProcessor('shaper', ShaperProcessor);
registerProcessor('clock', ClockProcessor);
registerProcessor('sequencer', SequencerProcessor);
registerProcessor('samplehold', SampleHoldProcessor);
registerProcessor('slew', SlewProcessor);
registerProcessor('quantizer', QuantizerProcessor);
