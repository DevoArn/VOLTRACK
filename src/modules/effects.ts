import { disconnectAll, setAP, workletModule } from '../core/audio-utils';
import type { ModuleSpec } from '../core/types';

export const SHAPER: ModuleSpec = {
  type: 'shaper',
  name: 'WAVESHAPER',
  category: 'Effects',
  description:
    'Seven distortion types: soft clip, hard clip, wavefolder, bit crusher, tube, fuzz and rectifier. DRIVE CV adds harmonics dynamically.',
  hp: 10,
  params: [
    {
      id: 'mode',
      label: 'MODE',
      min: 0,
      max: 6,
      default: 0,
      step: 1,
      control: 'switch',
      options: ['SOFT', 'HARD', 'FOLD', 'CRUSH', 'TUBE', 'FUZZ', 'RECTIFY'],
    },
    { id: 'drive', label: 'DRIVE', min: 1, max: 40, default: 3, curve: 'exp', size: 'lg' },
    { id: 'mix', label: 'MIX', min: 0, max: 1, default: 1 },
  ],
  inputs: [
    { id: 'in', label: 'IN', kind: 'audio' },
    { id: 'cv', label: 'DRV', kind: 'cv' },
  ],
  outputs: [{ id: 'out', label: 'OUT', kind: 'audio' }],
  create: (ctx, sink) => workletModule(ctx, sink, 'shaper', ['in', 'cv'], ['out'], { discrete: ['mode'] }),
};

export const DELAY: ModuleSpec = {
  type: 'delay',
  name: 'TAPE DELAY',
  category: 'Effects',
  description: 'Feedback delay with a darkening tone filter in the loop and time CV for tape-style warble.',
  hp: 12,
  params: [
    { id: 'time', label: 'TIME', min: 0.01, max: 2, default: 0.35, curve: 'exp', unit: 's', size: 'lg' },
    { id: 'feedback', label: 'FDBK', min: 0, max: 0.95, default: 0.4, size: 'lg' },
    { id: 'tone', label: 'TONE', min: 300, max: 16000, default: 4000, curve: 'exp', unit: 'Hz', size: 'sm' },
    { id: 'mix', label: 'MIX', min: 0, max: 1, default: 0.35, size: 'sm' },
  ],
  inputs: [
    { id: 'in', label: 'IN', kind: 'audio' },
    { id: 'time', label: 'TIME', kind: 'cv' },
  ],
  outputs: [{ id: 'out', label: 'OUT', kind: 'audio' }],
  create(ctx) {
    const input = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const out = ctx.createGain();
    const delay = ctx.createDelay(3);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    const fb = ctx.createGain();
    const timeCv = ctx.createGain();
    timeCv.gain.value = 0.004; // 4 ms per volt
    timeCv.connect(delay.delayTime);

    input.connect(dry).connect(out);
    input.connect(delay);
    delay.connect(tone);
    tone.connect(fb).connect(delay);
    tone.connect(wet).connect(out);
    return {
      inputs: { in: { node: input }, time: { node: timeCv } },
      outputs: { out: { node: out } },
      setParam(id, v, imm) {
        if (id === 'time') setAP(ctx, delay.delayTime, v, imm, 0.08);
        else if (id === 'feedback') setAP(ctx, fb.gain, v, imm);
        else if (id === 'tone') setAP(ctx, tone.frequency, v, imm);
        else if (id === 'mix') {
          setAP(ctx, dry.gain, Math.cos((v * Math.PI) / 2), imm);
          setAP(ctx, wet.gain, Math.sin((v * Math.PI) / 2), imm);
        }
      },
      dispose: () => disconnectAll(input, dry, wet, out, delay, tone, fb, timeCv),
    };
  },
};

export const CHORUS: ModuleSpec = {
  type: 'chorus',
  name: 'CHORUS',
  category: 'Effects',
  description: 'Stereo chorus: two modulated delay lines in quadrature create a wide, lush image.',
  hp: 10,
  params: [
    { id: 'rate', label: 'RATE', min: 0.05, max: 8, default: 0.6, curve: 'exp', unit: 'Hz' },
    { id: 'depth', label: 'DEPTH', min: 0, max: 1, default: 0.5 },
    { id: 'mix', label: 'MIX', min: 0, max: 1, default: 0.5 },
  ],
  inputs: [{ id: 'in', label: 'IN', kind: 'audio' }],
  outputs: [
    { id: 'l', label: 'L', kind: 'audio' },
    { id: 'r', label: 'R', kind: 'audio' },
  ],
  create(ctx) {
    const input = ctx.createGain();
    const dry = ctx.createGain();
    const outL = ctx.createGain();
    const outR = ctx.createGain();
    const wetL = ctx.createGain();
    const wetR = ctx.createGain();
    const d1 = ctx.createDelay(0.1);
    const d2 = ctx.createDelay(0.1);
    d1.delayTime.value = 0.015;
    d2.delayTime.value = 0.018;
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    const invert = ctx.createGain();
    invert.gain.value = -1;
    lfo.connect(depth);
    depth.connect(d1.delayTime);
    depth.connect(invert).connect(d2.delayTime);
    lfo.start();

    input.connect(dry);
    dry.connect(outL);
    dry.connect(outR);
    input.connect(d1).connect(wetL).connect(outL);
    input.connect(d2).connect(wetR).connect(outR);
    return {
      inputs: { in: { node: input } },
      outputs: { l: { node: outL }, r: { node: outR } },
      setParam(id, v, imm) {
        if (id === 'rate') setAP(ctx, lfo.frequency, v, imm);
        else if (id === 'depth') setAP(ctx, depth.gain, v * 0.007, imm);
        else if (id === 'mix') {
          setAP(ctx, dry.gain, Math.cos((v * Math.PI) / 2), imm);
          setAP(ctx, wetL.gain, Math.sin((v * Math.PI) / 2), imm);
          setAP(ctx, wetR.gain, Math.sin((v * Math.PI) / 2), imm);
        }
      },
      dispose() {
        lfo.stop();
        disconnectAll(input, dry, outL, outR, wetL, wetR, d1, d2, lfo, depth, invert);
      },
    };
  },
};

function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
  }
  return buf;
}

export const REVERB: ModuleSpec = {
  type: 'reverb',
  name: 'REVERB',
  category: 'Effects',
  description: 'Stereo convolution reverb using a generated diffuse impulse. Mono in, stereo out.',
  hp: 10,
  params: [
    { id: 'decay', label: 'DECAY', min: 0.3, max: 12, default: 3, curve: 'exp', unit: 's', size: 'lg' },
    { id: 'damp', label: 'DAMP', min: 800, max: 18000, default: 7000, curve: 'exp', unit: 'Hz', size: 'sm' },
    { id: 'mix', label: 'MIX', min: 0, max: 1, default: 0.3, size: 'sm' },
  ],
  inputs: [{ id: 'in', label: 'IN', kind: 'audio' }],
  outputs: [
    { id: 'l', label: 'L', kind: 'audio' },
    { id: 'r', label: 'R', kind: 'audio' },
  ],
  create(ctx) {
    const input = ctx.createGain();
    const dry = ctx.createGain();
    const conv = ctx.createConvolver();
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    const split = ctx.createChannelSplitter(2);
    const wetL = ctx.createGain();
    const wetR = ctx.createGain();
    const outL = ctx.createGain();
    const outR = ctx.createGain();
    conv.buffer = makeImpulse(ctx, 3);

    input.connect(dry);
    dry.connect(outL);
    dry.connect(outR);
    input.connect(damp).connect(conv).connect(split);
    split.connect(wetL, 0);
    split.connect(wetR, 1);
    wetL.connect(outL);
    wetR.connect(outR);

    let timer: number | undefined;
    let lastDecay = 3;
    return {
      inputs: { in: { node: input } },
      outputs: { l: { node: outL }, r: { node: outR } },
      setParam(id, v, imm) {
        if (id === 'decay') {
          if (Math.abs(v - lastDecay) < 1e-3) return;
          lastDecay = v;
          window.clearTimeout(timer);
          timer = window.setTimeout(() => (conv.buffer = makeImpulse(ctx, v)), 120);
        } else if (id === 'damp') setAP(ctx, damp.frequency, v, imm);
        else if (id === 'mix') {
          setAP(ctx, dry.gain, Math.cos((v * Math.PI) / 2), imm);
          setAP(ctx, wetL.gain, Math.sin((v * Math.PI) / 2), imm);
          setAP(ctx, wetR.gain, Math.sin((v * Math.PI) / 2), imm);
        }
      },
      dispose() {
        window.clearTimeout(timer);
        disconnectAll(input, dry, conv, damp, split, wetL, wetR, outL, outR);
      },
    };
  },
};
