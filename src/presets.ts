import type { PatchData } from './core/types';
import { REGISTRY } from './modules';

type ModDef = [id: string, type: string, params?: Record<string, number>];
type CableDef = [from: string, to: string];

/**
 * Build a patch from rows of modules. Each row is racked left-to-right,
 * butted together HP by HP like a real Eurorack case.
 */
function patch(name: string, rows: ModDef[][], cables: CableDef[], caseRows = 3): PatchData {
  const modules: PatchData['modules'] = [];
  rows.forEach((defs, row) => {
    let hp = 0;
    for (const [id, type, params] of defs) {
      modules.push({ id, type, row, hp, params });
      hp += REGISTRY.get(type)!.hp;
    }
  });
  return {
    version: 1,
    name,
    rows: caseRows,
    modules,
    cables: cables.map(([a, b]) => {
      const [fm, fp] = a.split('.');
      const [tm, tp] = b.split('.');
      return { from: { module: fm, port: fp }, to: { module: tm, port: tp } };
    }),
  };
}

const seqNotes = (notes: number[], gates: number[]) => {
  const o: Record<string, number> = {};
  notes.forEach((n, i) => (o[`p${i}`] = n));
  gates.forEach((g, i) => (o[`g${i}`] = g));
  return o;
};

export const PRESETS: PatchData[] = [
  patch(
    'Acid Sequence',
    [
      [
        ['clk', 'clock', { bpm: 124, swing: 0.15, run: 1 }],
        ['seq', 'seq', { steps: 8, ...seqNotes([0, 0, 12, 0, 3, 0, 15, 10], [1, 1, 1, 0, 1, 1, 1, 1]) }],
        ['vco', 'vco', { octave: -2, tune: 0 }],
        ['vcf', 'vcf', { cutoff: 260, res: 0.78, amt: 0.45, drive: 2.2 }],
        ['env', 'adsr', { attack: 0.002, decay: 0.22, sustain: 0, release: 0.12 }],
        ['vca', 'vca', { bias: 0, amt: 1 }],
        ['sh', 'sh'],
        ['slew', 'slew', { rise: 0.25, fall: 0.25 }],
        ['attn', 'attn', { amt1: 0.2, off1: 0, amt2: 1, off2: 0 }],
      ],
      [
        ['dly', 'delay', { time: 0.36, feedback: 0.45, tone: 3200, mix: 0.28 }],
        ['rev', 'reverb', { decay: 2.8, damp: 6000, mix: 0.25 }],
        ['scope', 'scope', { time: 25, gain: 1, mode: 0 }],
        ['out', 'output', { volume: 0.65 }],
      ],
    ],
    [
      ['clk.x2', 'seq.clock'],
      ['clk.rst', 'seq.reset'],
      ['seq.cv', 'vco.pitch'],
      ['seq.gate', 'env.gate'],
      ['vco.saw', 'vcf.in'],
      ['vcf.lp', 'vca.in'],
      ['env.env', 'vca.cv'],
      ['env.env', 'vcf.cv'],
      ['clk.x1', 'sh.trig'],
      ['sh.out', 'slew.in'],
      ['slew.out', 'attn.in1'],
      ['attn.out1', 'vcf.track'],
      ['vca.out', 'dly.in'],
      ['dly.out', 'rev.in'],
      ['rev.l', 'out.l'],
      ['rev.r', 'out.r'],
      ['vca.out', 'scope.a'],
      ['env.env', 'scope.b'],
    ],
  ),
  patch(
    'Dual-VCO Keys',
    [
      [
        ['kb', 'keys', { octave: -1, glide: 0.04 }],
        ['o1', 'vco', { octave: 0 }],
        ['o2', 'vco', { octave: 0, tune: 0.08, pw: 0.35, pwm: 0.25 }],
        ['mix', 'mixer', { l1: 0.7, l2: 0.6, l3: 0, l4: 0, master: 1 }],
        ['vcf', 'vcf', { cutoff: 700, res: 0.35, amt: 0.4 }],
        ['fenv', 'adsr', { attack: 0.005, decay: 0.4, sustain: 0.25, release: 0.4 }],
        ['aenv', 'adsr', { attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.35 }],
        ['vca', 'vca', { bias: 0, amt: 1 }],
        ['lfo', 'lfo', { rate: 0.4 }],
      ],
      [
        ['ch', 'chorus', { rate: 0.5, depth: 0.6, mix: 0.45 }],
        ['scope', 'scope', { time: 12, gain: 1, mode: 0 }],
        ['out', 'output', { volume: 0.6 }],
      ],
    ],
    [
      ['kb.cv', 'o1.pitch'],
      ['kb.cv', 'o2.pitch'],
      ['kb.cv', 'vcf.track'],
      ['kb.gate', 'fenv.gate'],
      ['kb.gate', 'aenv.gate'],
      ['o1.saw', 'mix.in1'],
      ['o2.pulse', 'mix.in2'],
      ['lfo.tri', 'o2.pwm'],
      ['mix.out', 'vcf.in'],
      ['fenv.env', 'vcf.cv'],
      ['vcf.lp', 'vca.in'],
      ['aenv.env', 'vca.cv'],
      ['vca.out', 'ch.in'],
      ['ch.l', 'out.l'],
      ['ch.r', 'out.r'],
      ['vca.out', 'scope.a'],
    ],
  ),
  patch(
    'Ambient Drone',
    [
      [
        ['o1', 'vco', { octave: -1, tune: 0 }],
        ['o2', 'vco', { octave: -1, tune: 7.05, fm: 0.01 }],
        ['n', 'noise'],
        ['mix', 'mixer', { l1: 0.5, l2: 0.45, l3: 0.12, l4: 0, master: 1 }],
        ['vcf', 'vcf', { cutoff: 500, res: 0.55, amt: 0.3, drive: 1.5 }],
        ['l1', 'lfo', { rate: 0.05 }],
        ['l2', 'lfo', { rate: 0.21 }],
        ['vca', 'vca', { bias: 0.7, amt: 0 }],
      ],
      [
        ['ch', 'chorus', { rate: 0.25, depth: 0.8, mix: 0.5 }],
        ['revL', 'reverb', { decay: 8, damp: 5000, mix: 0.55 }],
        ['revR', 'reverb', { decay: 9, damp: 5000, mix: 0.55 }],
        ['scope', 'scope', { time: 120, gain: 1.5, mode: 1 }],
        ['out', 'output', { volume: 0.55 }],
      ],
    ],
    [
      ['o1.saw', 'mix.in1'],
      ['o2.saw', 'mix.in2'],
      ['n.pink', 'mix.in3'],
      ['mix.out', 'vcf.in'],
      ['l1.sine', 'vcf.cv'],
      ['l2.sine', 'o2.fm'],
      ['vcf.lp', 'vca.in'],
      ['vca.out', 'ch.in'],
      ['ch.l', 'revL.in'],
      ['ch.r', 'revR.in'],
      ['revL.l', 'out.l'],
      ['revR.r', 'out.r'],
      ['vca.out', 'scope.a'],
    ],
  ),
  {
    version: 1,
    name: 'Empty Case',
    rows: 3,
    modules: [{ id: 'out', type: 'output', row: 0, hp: 116, params: { volume: 0.6 } }],
    cables: [],
  },
];
