import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Engine, type EngineEvent } from '../../src/core/engine';
import { PRESETS } from '../../src/presets';
import { type FakeNode, FakeAudioContext, FakeWorkletNode, fakeNode } from '../helpers/fake-audio';

vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
vi.stubGlobal('window', globalThis); // reverb uses window.setTimeout for impulse regeneration

function engine() {
  const e = new Engine();
  e.ctx = new FakeAudioContext() as unknown as AudioContext;
  e.sink = fakeNode() as unknown as GainNode;
  const events: EngineEvent[] = [];
  e.on((ev) => events.push(ev));
  return { e, events };
}

describe('Engine', () => {
  let e: Engine;
  let events: EngineEvent[];
  beforeEach(() => ({ e, events } = engine()));

  it.each(PRESETS.map((p) => [p.name, p] as const))('loads preset "%s" and serialises it back', (_n, preset) => {
    e.load(preset);
    expect(e.modules.size).toBe(preset.modules.length);
    expect(e.cables.size).toBe(preset.cables.length);
    const out = e.serialize(preset.name);
    expect(out.modules.map((m) => [m.id, m.type, m.row, m.hp])).toEqual(
      preset.modules.map((m) => [m.id, m.type, m.row, m.hp]),
    );
    const ends = (c: { from: { module: string; port: string }; to: { module: string; port: string } }) =>
      `${c.from.module}.${c.from.port}>${c.to.module}.${c.to.port}`;
    expect(out.cables.map(ends).sort()).toEqual(preset.cables.map(ends).sort());

    // a reload of the serialised patch is identical
    const { e: e2 } = engine();
    e2.load(out);
    expect(e2.serialize(preset.name)).toEqual(out);
  });

  it('clamps out-of-range params and ignores unknown ones', () => {
    const m = e.addModule('vcf', 0, 0, { cutoff: 999999, nonsense: 1 });
    expect(m.params.cutoff).toBe(20000);
    expect(m.params).not.toHaveProperty('nonsense');
  });

  it('patches one cable per input: a new cable replaces the old one', () => {
    const a = e.addModule('vco', 0, 0);
    const b = e.addModule('vco', 0, 12);
    const f = e.addModule('vcf', 0, 24);
    const c1 = e.connect(a.id, 'saw', f.id, 'in')!;
    const c2 = e.connect(b.id, 'saw', f.id, 'in')!;
    expect(e.cables.size).toBe(1);
    expect(e.cables.has(c1.id)).toBe(false);
    expect(e.cableAtInput(f.id, 'in')?.id).toBe(c2.id);
    // the first oscillator is really disconnected from the filter node
    const src = a.audio.outputs.saw.node as unknown as FakeNode;
    expect(src.connections.some((c) => c.target === (f.audio.inputs.in as { node: unknown }).node)).toBe(false);
  });

  it('outputs fan out to many inputs', () => {
    const lfo = e.addModule('lfo', 0, 0);
    const v1 = e.addModule('vco', 0, 8);
    const v2 = e.addModule('vco', 0, 20);
    e.connect(lfo.id, 'sine', v1.id, 'fm');
    e.connect(lfo.id, 'sine', v2.id, 'fm');
    expect(e.cablesAt(lfo.id, 'sine', 'out')).toHaveLength(2);
  });

  it('rejects unknown ports', () => {
    const a = e.addModule('vco', 0, 0);
    const b = e.addModule('vcf', 0, 12);
    expect(e.connect(a.id, 'nope', b.id, 'in')).toBeNull();
    expect(e.connect(a.id, 'saw', b.id, 'nope')).toBeNull();
    expect(e.cables.size).toBe(0);
  });

  it('removing a module unplugs its cables', () => {
    const a = e.addModule('vco', 0, 0);
    const b = e.addModule('vcf', 0, 12);
    const c = e.addModule('vca', 0, 24);
    e.connect(a.id, 'saw', b.id, 'in');
    e.connect(b.id, 'lp', c.id, 'in');
    e.removeModule(b.id);
    expect(e.cables.size).toBe(0);
    expect(events.filter((ev) => ev.type === 'cableRemoved')).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: 'moduleRemoved', id: b.id });
  });

  it('OUTPUT normals L to R until R is patched', () => {
    const vco = e.addModule('vco', 0, 0);
    const out = e.addModule('output', 0, 12);
    const inL = (out.audio.inputs.l as unknown as { node: FakeNode }).node;
    const toRight = () => inL.connections.filter((c) => c.input === 1).length;
    expect(toRight()).toBe(1);
    e.connect(vco.id, 'saw', out.id, 'r');
    expect(toRight()).toBe(0);
    e.disconnect(e.cableAtInput(out.id, 'r')!.id);
    expect(toRight()).toBe(1);
  });

  it('setParam updates state and notifies listeners', () => {
    const m = e.addModule('vcf', 0, 0);
    e.setParam(m.id, 'res', 0.9);
    expect(m.params.res).toBe(0.9);
    expect(events.at(-1)).toEqual({ type: 'param', id: m.id, param: 'res', value: 0.9 });
  });

  it('case rows are clamped to 1–8', () => {
    e.setRows(0);
    expect(e.rows).toBe(1);
    e.setRows(20);
    expect(e.rows).toBe(8);
  });
});
