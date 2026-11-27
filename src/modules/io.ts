import { disconnectAll, setAP } from '../core/audio-utils';
import type { ModuleSpec } from '../core/types';
import { el, hiDpiCanvas } from './ui-bits';

/* ---------------------------------------------------------------- OUTPUT */
export const OUTPUT: ModuleSpec = {
  type: 'output',
  name: 'OUTPUT',
  category: 'I/O',
  description:
    'Stereo master output: converts ±5V modular level to line level, with a brick-wall limiter. Patch only L for mono.',
  hp: 10,
  params: [{ id: 'volume', label: 'VOLUME', min: 0, max: 1, default: 0.6, size: 'lg' }],
  inputs: [
    { id: 'l', label: 'L/MONO', kind: 'audio' },
    { id: 'r', label: 'R', kind: 'audio' },
  ],
  outputs: [],
  create(ctx) {
    const inL = ctx.createGain();
    const inR = ctx.createGain();
    inL.gain.value = 0.2; // ±5V → ±1.0 full scale
    inR.gain.value = 0.2;
    const merger = ctx.createChannelMerger(2);
    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    const split = ctx.createChannelSplitter(2);
    const meterL = ctx.createAnalyser();
    const meterR = ctx.createAnalyser();
    meterL.fftSize = 1024;
    meterR.fftSize = 1024;

    inL.connect(merger, 0, 0);
    inL.connect(merger, 0, 1); // normalled: L feeds R until R is patched
    inR.connect(merger, 0, 1);
    merger.connect(master).connect(limiter).connect(ctx.destination);
    limiter.connect(split);
    split.connect(meterL, 0);
    split.connect(meterR, 1);

    return {
      inputs: { l: { node: inL }, r: { node: inR } },
      outputs: {},
      extras: { meterL, meterR },
      setParam(id, v, imm) {
        if (id === 'volume') setAP(ctx, master.gain, v * v, imm);
      },
      onPatch(id, connected) {
        if (id !== 'r') return;
        if (connected) {
          try {
            inL.disconnect(merger, 0, 1);
          } catch {
            /* noop */
          }
        } else inL.connect(merger, 0, 1);
      },
      dispose: () => disconnectAll(inL, inR, merger, master, limiter, split, meterL, meterR),
    };
  },
  ui(body, inst) {
    const { canvas, g } = hiDpiCanvas(110, 70, 'meter');
    body.append(canvas);
    const { meterL, meterR } = inst.audio.extras as { meterL: AnalyserNode; meterR: AnalyserNode };
    const buf = new Float32Array(meterL.fftSize);
    const peaks = [0, 0];
    const SEG = 14;
    const peakOf = (a: AnalyserNode) => {
      a.getFloatTimeDomainData(buf);
      let m = 0;
      for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
      return m;
    };
    return {
      frame() {
        const levels = [peakOf(meterL), peakOf(meterR)];
        g.clearRect(0, 0, 110, 70);
        levels.forEach((lv, ch) => {
          peaks[ch] = Math.max(lv, peaks[ch] * 0.93);
          const db = 20 * Math.log10(peaks[ch] + 1e-6);
          const lit = Math.round(((db + 48) / 48) * SEG);
          for (let s = 0; s < SEG; s++) {
            const x = 8 + s * 7;
            const y = ch === 0 ? 14 : 42;
            const hue = s < SEG * 0.65 ? '#00ff00' : s < SEG * 0.88 ? '#ffff00' : '#ff0000';
            g.fillStyle = s < lit ? hue : '#202020';
            g.fillRect(x, y, 5, 14);
          }
          g.shadowBlur = 0;
          g.fillStyle = '#c0c0c0';
          g.font = 'bold 9px Tahoma, sans-serif';
          g.fillText(ch === 0 ? 'L' : 'R', 0, ch === 0 ? 25 : 53);
        });
      },
    };
  },
};

/* ----------------------------------------------------------------- SCOPE */
export const SCOPE: ModuleSpec = {
  type: 'scope',
  name: 'SCOPE',
  category: 'I/O',
  description:
    'Dual-channel phosphor oscilloscope (±10V screen, 2V/div) with zero-cross trigger, plus spectrum analyser mode.',
  hp: 20,
  params: [
    { id: 'time', label: 'TIME', min: 1, max: 150, default: 20, curve: 'exp', unit: 'ms', size: 'sm' },
    { id: 'gain', label: 'GAIN', min: 0.1, max: 10, default: 1, curve: 'exp', unit: 'x', size: 'sm' },
    { id: 'mode', label: 'MODE', min: 0, max: 1, default: 0, step: 1, control: 'switch', options: ['WAVE', 'FFT'] },
  ],
  inputs: [
    { id: 'a', label: 'CH A', kind: 'audio' },
    { id: 'b', label: 'CH B', kind: 'audio' },
  ],
  outputs: [],
  create(ctx, sink) {
    const mk = () => {
      const a = ctx.createAnalyser();
      a.fftSize = 16384;
      a.smoothingTimeConstant = 0.75;
      a.connect(sink);
      return a;
    };
    const a = mk();
    const b = mk();
    const connected = { a: false, b: false };
    return {
      inputs: { a: { node: a }, b: { node: b } },
      outputs: {},
      extras: { a, b, connected, sampleRate: ctx.sampleRate },
      setParam() {},
      onPatch(id, c) {
        connected[id as 'a' | 'b'] = c;
      },
      dispose: () => disconnectAll(a, b),
    };
  },
  ui(body, inst) {
    const W = 276;
    const H = 150;
    const { canvas, g } = hiDpiCanvas(W, H, 'scope-screen');
    const screen = el('div', 'crt');
    screen.append(canvas);
    body.append(screen);
    const ex = inst.audio.extras as {
      a: AnalyserNode;
      b: AnalyserNode;
      connected: { a: boolean; b: boolean };
      sampleRate: number;
    };
    const bufA = new Float32Array(ex.a.fftSize);
    const bufB = new Float32Array(ex.b.fftSize);
    const freq = new Float32Array(ex.a.frequencyBinCount);

    const grid = () => {
      g.fillStyle = '#000000';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#003300';
      g.lineWidth = 1;
      for (let x = 0; x <= 10; x++) {
        g.beginPath();
        g.moveTo((x * W) / 10, 0);
        g.lineTo((x * W) / 10, H);
        g.stroke();
      }
      for (let y = 0; y <= 10; y++) {
        g.beginPath();
        g.moveTo(0, (y * H) / 10);
        g.lineTo(W, (y * H) / 10);
        g.stroke();
      }
      g.strokeStyle = '#006600';
      g.beginPath();
      g.moveTo(0, H / 2);
      g.lineTo(W, H / 2);
      g.stroke();
    };

    const trace = (buf: Float32Array, start: number, len: number, color: string, gain: number) => {
      g.strokeStyle = color;
      g.lineWidth = 1.6;
      g.beginPath();
      const step = Math.max(1, Math.floor(len / (W * 2)));
      for (let i = 0; i < len; i += step) {
        const x = (i / len) * W;
        const y = H / 2 - (buf[start + i] / 10) * gain * (H / 2); // ±10V full screen
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.shadowBlur = 0;
    };

    const spectrum = (an: AnalyserNode, color: string) => {
      an.getFloatFrequencyData(freq);
      g.strokeStyle = color;
      g.lineWidth = 1.4;
      g.beginPath();
      const nyq = ex.sampleRate / 2;
      const fMin = 20;
      for (let x = 0; x < W; x++) {
        const f = fMin * Math.pow(nyq / fMin, x / W);
        const bin = Math.min(freq.length - 1, Math.round((f / nyq) * freq.length));
        const db = freq[bin];
        const y = H - ((db + 80) / 100) * H;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.shadowBlur = 0;
    };

    return {
      frame() {
        grid();
        const gain = inst.params.gain;
        if (Math.round(inst.params.mode) === 1) {
          if (ex.connected.a) spectrum(ex.a, '#00ff00');
          if (ex.connected.b) spectrum(ex.b, '#ffff00');
          return;
        }
        const len = Math.min(Math.floor((inst.params.time / 1000) * ex.sampleRate), bufA.length / 2);
        ex.a.getFloatTimeDomainData(bufA);
        ex.b.getFloatTimeDomainData(bufB);
        // Rising zero-cross trigger on channel A (or B if A is empty)
        const trigBuf = ex.connected.a ? bufA : bufB;
        let start = 0;
        const searchEnd = bufA.length - len - 1;
        for (let i = 1; i < searchEnd; i++) {
          if (trigBuf[i - 1] < 0 && trigBuf[i] >= 0) {
            start = i;
            break;
          }
        }
        if (ex.connected.a) trace(bufA, start, len, '#00ff00', gain);
        if (ex.connected.b) trace(bufB, start, len, '#ffff00', gain);
      },
    };
  },
};
