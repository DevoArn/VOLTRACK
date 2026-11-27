/*
 * Shared post-effects (used by ACIDLINE and HALCYON). Mono or stereo in.
 *
 *  acid-dist  : multi-mode distortion, processes each channel independently
 *               0 OVERDRIVE  smooth tanh saturation
 *               1 TUBE       asymmetric soft clip, adds even harmonics
 *               2 FUZZ       heavily squared fuzz
 *               3 HARD CLIP  digital brick-wall clipper
 *               4 FOLDBACK   triangle wavefolder
 *               5 RECTIFY    full-wave rectifier (octave-up grit)
 *               6 BITCRUSH   bit depth + sample-rate reduction
 *             → DC blocker → tone low-pass → dry/wet mix
 *
 *  acid-modfx : modulation effect → stereo out
 *               0 CHORUS   LFO-swept delay taps (L/R in quadrature)
 *               1 FLANGER  short swept delay with feedback
 *               2 PHASER   6-stage allpass sweep with feedback
 */

const TAU = Math.PI * 2;
const k = (name, defaultValue, minValue, maxValue) => ({
  name,
  defaultValue,
  minValue,
  maxValue,
  automationRate: 'k-rate',
});

class DistortionProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [k('on', 1, 0, 1), k('type', 0, 0, 6), k('drive', 4, 1, 60), k('tone', 8000, 200, 18000), k('mix', 1, 0, 1)];
  }
  constructor() {
    super();
    this.st = [0, 1].map(() => ({ dcX: 0, dcY: 0, lp: 0, hold: 0, holdCount: 0 }));
  }
  shape(type, x, v, st, steps, factor) {
    switch (type) {
      case 0:
        return Math.tanh(v);
      case 1:
        return v >= 0 ? 1 - Math.exp(-v) : -(1 - Math.exp(v * 0.6)) * 0.8;
      case 2:
        return Math.sign(v) * Math.pow(Math.min(1, Math.abs(v)), 0.25);
      case 3:
        return v > 1 ? 1 : v < -1 ? -1 : v;
      case 4: {
        let t = (v + 1) * 0.25;
        t -= Math.floor(t);
        return 1 - 4 * Math.abs(t - 0.5);
      }
      case 5:
        return Math.tanh(Math.abs(v)) * 1.4 - 0.5;
      default:
        if (st.holdCount <= 0) {
          st.hold = Math.round(x * steps) / steps;
          st.holdCount = factor;
        }
        st.holdCount--;
        return st.hold;
    }
  }
  process(inputs, outputs, P) {
    const inCh = inputs[0] || [];
    const outCh = outputs[0];
    const on = P.on[0] > 0.5;
    const type = Math.round(P.type[0]);
    const d = P.drive[0];
    const mix = P.mix[0];
    const lpC = 1 - Math.exp((-TAU * P.tone[0]) / sampleRate);
    const dcR = 1 - (TAU * 20) / sampleRate;
    const bits = 16 - ((d - 1) / 59) * 13;
    const steps = Math.pow(2, bits) / 2;
    const factor = 1 + Math.floor((d - 1) / 4);
    const makeup = type === 6 ? 1 : 1 / (0.6 + 0.4 * Math.tanh(d / 6));

    for (let c = 0; c < outCh.length; c++) {
      const out = outCh[c];
      const input = inCh[c] || inCh[0];
      if (!input) {
        out.fill(0);
        continue;
      }
      if (!on) {
        out.set(input);
        continue;
      }
      const st = this.st[c] || this.st[0];
      for (let i = 0; i < out.length; i++) {
        const x = input[i] * 1.6;
        const y = this.shape(type, x, x * d, st, steps, factor);
        const dc = y - st.dcX + dcR * st.dcY;
        st.dcX = y;
        st.dcY = dc;
        st.lp += (dc - st.lp) * lpC;
        out[i] = input[i] * (1 - mix) + st.lp * 0.55 * makeup * mix;
      }
    }
    return true;
  }
}

class ModFxProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      k('on', 1, 0, 1),
      k('type', 0, 0, 2),
      k('rate', 0.5, 0.02, 10),
      k('depth', 0.5, 0, 1),
      k('feedback', 0.3, 0, 0.92),
      k('mix', 0.5, 0, 1),
    ];
  }
  constructor() {
    super();
    this.size = Math.ceil(sampleRate * 0.06);
    this.bufL = new Float32Array(this.size);
    this.bufR = new Float32Array(this.size);
    this.w = 0;
    this.phase = 0;
    this.fbL = 0;
    this.fbR = 0;
    this.apL = new Float32Array(6);
    this.apR = new Float32Array(6);
  }
  read(buf, delaySamples) {
    let r = this.w - delaySamples;
    while (r < 0) r += this.size;
    const i0 = Math.floor(r);
    const i1 = (i0 + 1) % this.size;
    const f = r - i0;
    return buf[i0] * (1 - f) + buf[i1] * f;
  }
  allpassChain(x, a, z) {
    for (let s = 0; s < 6; s++) {
      const y = a * x + z[s];
      z[s] = x - a * y;
      x = y;
    }
    return x;
  }
  process(inputs, outputs, P) {
    const inCh = inputs[0] || [];
    const inL = inCh[0];
    const inR = inCh[1] || inCh[0];
    const L = outputs[0][0];
    const R = outputs[0][1];
    if (!inL) {
      L.fill(0);
      R.fill(0);
      return true;
    }
    if (P.on[0] < 0.5) {
      L.set(inL);
      R.set(inR);
      return true;
    }
    const type = Math.round(P.type[0]);
    const inc = P.rate[0] / sampleRate;
    const depth = P.depth[0];
    const fb = P.feedback[0];
    const mix = P.mix[0];
    const sr = sampleRate;

    for (let i = 0; i < inL.length; i++) {
      const xl = inL[i];
      const xr = inR[i];
      const lfoL = Math.sin(TAU * this.phase);
      const lfoR = Math.sin(TAU * (this.phase + 0.25));
      this.phase += inc;
      if (this.phase >= 1) this.phase -= 1;
      let wl;
      let wr;
      if (type === 2) {
        const fL = 150 * Math.pow(2, (lfoL * 0.5 + 0.5) * (1 + depth * 4.5));
        const fR = 150 * Math.pow(2, (lfoR * 0.5 + 0.5) * (1 + depth * 4.5));
        const tL = Math.tan((Math.PI * fL) / sr);
        const tR = Math.tan((Math.PI * fR) / sr);
        wl = this.allpassChain(xl + this.fbL * fb, (tL - 1) / (tL + 1), this.apL);
        wr = this.allpassChain(xr + this.fbR * fb, (tR - 1) / (tR + 1), this.apR);
      } else {
        const flanger = type === 1;
        const base = flanger ? 0.0012 : 0.014;
        const swing = flanger ? 0.0035 * depth : 0.007 * depth;
        this.bufL[this.w] = xl + (flanger ? this.fbL * fb : 0);
        this.bufR[this.w] = xr + (flanger ? this.fbR * fb : 0);
        wl = this.read(this.bufL, (base + swing * (0.5 + 0.5 * lfoL)) * sr);
        wr = this.read(this.bufR, (base + swing * (0.5 + 0.5 * lfoR)) * sr);
        this.w = (this.w + 1) % this.size;
      }
      this.fbL = wl;
      this.fbR = wr;
      L[i] = xl * (1 - mix * 0.5) + wl * mix;
      R[i] = xr * (1 - mix * 0.5) + wr * mix;
    }
    if (!Number.isFinite(this.fbL) || !Number.isFinite(this.fbR)) {
      this.fbL = this.fbR = 0;
      this.apL.fill(0);
      this.apR.fill(0);
    }
    return true;
  }
}

registerProcessor('acid-dist', DistortionProcessor);
registerProcessor('acid-modfx', ModFxProcessor);
