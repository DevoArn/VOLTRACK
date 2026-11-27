import { disconnectAll, setAP, workletModule } from '../core/audio-utils';
import type { ModuleSpec } from '../core/types';

export const VCF: ModuleSpec = {
  type: 'vcf',
  name: 'VCF',
  category: 'Filters',
  description:
    'Resonant 12dB state-variable filter with simultaneous LP/BP/HP outputs. CV is 1V/oct × CV AMT; V/OCT input tracks exactly.',
  hp: 12,
  params: [
    { id: 'cutoff', label: 'CUTOFF', min: 20, max: 20000, default: 1200, curve: 'exp', unit: 'Hz', size: 'lg' },
    { id: 'res', label: 'RES', min: 0, max: 1, default: 0.2, size: 'lg' },
    { id: 'amt', label: 'CV AMT', min: -1, max: 1, default: 0.5, size: 'sm' },
    { id: 'drive', label: 'DRIVE', min: 0.5, max: 10, default: 1, curve: 'exp', size: 'sm' },
  ],
  inputs: [
    { id: 'in', label: 'IN', kind: 'audio' },
    { id: 'cv', label: 'CV', kind: 'cv' },
    { id: 'track', label: 'V/OCT', kind: 'cv' },
  ],
  outputs: [
    { id: 'lp', label: 'LP', kind: 'audio' },
    { id: 'bp', label: 'BP', kind: 'audio' },
    { id: 'hp', label: 'HP', kind: 'audio' },
  ],
  create: (ctx, sink) => workletModule(ctx, sink, 'vcf', ['in', 'cv', 'track'], ['lp', 'bp', 'hp']),
};

export const VCA: ModuleSpec = {
  type: 'vca',
  name: 'VCA',
  category: 'Amps & Mixers',
  description: 'Linear voltage-controlled amplifier. Unity gain at +10V CV. Output = IN × (BIAS + CV/10 × AMT).',
  hp: 8,
  params: [
    { id: 'bias', label: 'BIAS', min: 0, max: 1.5, default: 0 },
    { id: 'amt', label: 'CV AMT', min: 0, max: 1.5, default: 1 },
  ],
  inputs: [
    { id: 'in', label: 'IN', kind: 'audio' },
    { id: 'cv', label: 'CV', kind: 'cv' },
  ],
  outputs: [{ id: 'out', label: 'OUT', kind: 'audio' }],
  create(ctx) {
    const vca = ctx.createGain();
    vca.gain.value = 0;
    const cvAmt = ctx.createGain();
    cvAmt.connect(vca.gain);
    return {
      inputs: { in: { node: vca }, cv: { node: cvAmt } },
      outputs: { out: { node: vca } },
      setParam(id, v, imm) {
        if (id === 'bias') setAP(ctx, vca.gain, v, imm);
        if (id === 'amt') setAP(ctx, cvAmt.gain, v / 10, imm);
      },
      dispose: () => disconnectAll(vca, cvAmt),
    };
  },
};

export const MIXER: ModuleSpec = {
  type: 'mixer',
  name: 'MIXER',
  category: 'Amps & Mixers',
  description: 'Four-channel DC-coupled mixer — mixes audio or CV.',
  hp: 12,
  params: [
    { id: 'l1', label: 'CH1', min: 0, max: 1.5, default: 0.8, size: 'sm' },
    { id: 'l2', label: 'CH2', min: 0, max: 1.5, default: 0.8, size: 'sm' },
    { id: 'l3', label: 'CH3', min: 0, max: 1.5, default: 0.8, size: 'sm' },
    { id: 'l4', label: 'CH4', min: 0, max: 1.5, default: 0.8, size: 'sm' },
    { id: 'master', label: 'MAIN', min: 0, max: 2, default: 1, size: 'md' },
  ],
  inputs: [
    { id: 'in1', label: '1', kind: 'audio' },
    { id: 'in2', label: '2', kind: 'audio' },
    { id: 'in3', label: '3', kind: 'audio' },
    { id: 'in4', label: '4', kind: 'audio' },
  ],
  outputs: [
    { id: 'out', label: 'OUT', kind: 'audio' },
    { id: 'inv', label: 'INV', kind: 'audio' },
  ],
  create(ctx) {
    const ch = [0, 1, 2, 3].map(() => ctx.createGain());
    const master = ctx.createGain();
    const inv = ctx.createGain();
    inv.gain.value = -1;
    ch.forEach((g) => g.connect(master));
    master.connect(inv);
    return {
      inputs: { in1: { node: ch[0] }, in2: { node: ch[1] }, in3: { node: ch[2] }, in4: { node: ch[3] } },
      outputs: { out: { node: master }, inv: { node: inv } },
      setParam(id, v, imm) {
        if (id === 'master') setAP(ctx, master.gain, v, imm);
        else {
          const i = Number(id.slice(1)) - 1;
          if (ch[i]) setAP(ctx, ch[i].gain, v, imm);
        }
      },
      dispose: () => disconnectAll(...ch, master, inv),
    };
  },
};

export const RING: ModuleSpec = {
  type: 'ring',
  name: 'RING',
  category: 'Amps & Mixers',
  description: 'Ring modulator — four-quadrant multiplier: OUT = A × B / 5V.',
  hp: 6,
  params: [{ id: 'level', label: 'LEVEL', min: 0, max: 2, default: 1 }],
  inputs: [
    { id: 'a', label: 'A', kind: 'audio' },
    { id: 'b', label: 'B', kind: 'audio' },
  ],
  outputs: [{ id: 'out', label: 'OUT', kind: 'audio' }],
  create(ctx) {
    const mult = ctx.createGain();
    mult.gain.value = 0;
    const level = ctx.createGain();
    mult.connect(level);
    return {
      inputs: { a: { node: mult }, b: { param: mult.gain } },
      outputs: { out: { node: level } },
      setParam(id, v, imm) {
        if (id === 'level') setAP(ctx, level.gain, v / 5, imm);
      },
      dispose: () => disconnectAll(mult, level),
    };
  },
};
