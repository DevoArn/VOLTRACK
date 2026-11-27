import { disconnectAll, setAP } from '../core/audio-utils';
import type { ModuleSpec } from '../core/types';

export const ATTN: ModuleSpec = {
  type: 'attn',
  name: 'ATT·OFFSET',
  category: 'Utilities',
  description:
    'Two channels of attenuversion (−1…+1) and offset (±10V). With nothing patched, outputs a constant voltage.',
  hp: 10,
  params: [
    { id: 'amt1', label: 'SCALE 1', min: -1, max: 1, default: 1, size: 'sm' },
    { id: 'off1', label: 'OFFS 1', min: -10, max: 10, default: 0, unit: 'V', size: 'sm' },
    { id: 'amt2', label: 'SCALE 2', min: -1, max: 1, default: 1, size: 'sm' },
    { id: 'off2', label: 'OFFS 2', min: -10, max: 10, default: 0, unit: 'V', size: 'sm' },
  ],
  inputs: [
    { id: 'in1', label: 'IN 1', kind: 'cv' },
    { id: 'in2', label: 'IN 2', kind: 'cv' },
  ],
  outputs: [
    { id: 'out1', label: 'OUT 1', kind: 'cv' },
    { id: 'out2', label: 'OUT 2', kind: 'cv' },
  ],
  create(ctx) {
    const make = () => {
      const scale = ctx.createGain();
      const sum = ctx.createGain();
      const offset = ctx.createConstantSource();
      offset.offset.value = 0;
      offset.start();
      scale.connect(sum);
      offset.connect(sum);
      return { scale, sum, offset };
    };
    const a = make();
    const b = make();
    return {
      inputs: { in1: { node: a.scale }, in2: { node: b.scale } },
      outputs: { out1: { node: a.sum }, out2: { node: b.sum } },
      setParam(id, v, imm) {
        const ch = id.endsWith('1') ? a : b;
        if (id.startsWith('amt')) setAP(ctx, ch.scale.gain, v, imm);
        else setAP(ctx, ch.offset.offset, v, imm);
      },
      dispose() {
        a.offset.stop();
        b.offset.stop();
        disconnectAll(a.scale, a.sum, a.offset, b.scale, b.sum, b.offset);
      },
    };
  },
};

export const MULT: ModuleSpec = {
  type: 'mult',
  name: 'MULT',
  category: 'Utilities',
  description: 'Buffered multiple — copies one signal to four outputs.',
  hp: 6,
  params: [],
  inputs: [{ id: 'in', label: 'IN', kind: 'audio' }],
  outputs: [
    { id: 'o1', label: '1', kind: 'audio' },
    { id: 'o2', label: '2', kind: 'audio' },
    { id: 'o3', label: '3', kind: 'audio' },
    { id: 'o4', label: '4', kind: 'audio' },
  ],
  create(ctx) {
    const buf = ctx.createGain();
    const outs = [0, 1, 2, 3].map(() => {
      const g = ctx.createGain();
      buf.connect(g);
      return g;
    });
    return {
      inputs: { in: { node: buf } },
      outputs: { o1: { node: outs[0] }, o2: { node: outs[1] }, o3: { node: outs[2] }, o4: { node: outs[3] } },
      setParam() {},
      dispose: () => disconnectAll(buf, ...outs),
    };
  },
};
