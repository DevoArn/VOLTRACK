import { describe, expect, it } from 'vitest';
import { ALL, DEFAULTS, FX_IDS } from '../../src/va/params';
import { PROGRAMS } from '../../src/va/presets';
import { type Processor, allFinite, blocksFor, loadWorklet, peak, render, rms } from '../helpers/worklet';

const W = loadWorklet('va-synth.js');
const Synth = W['va-synth'];

function synth(values: Record<string, number> = {}): Processor {
  const proc = new Synth();
  proc.port.deliver({ type: 'params', values: { ...DEFAULTS, ...values } });
  return proc;
}
const play = (proc: Processor, seconds: number) =>
  render(proc, { blocks: blocksFor(seconds), outputs: [2], params: {} })[0];
const activeVoices = (proc: Processor) => (proc.voices as { active: boolean }[]).filter((v) => v.active).length;

describe('HALCYON parameter schema', () => {
  const ids = new Set(ALL.map((p) => p.id));
  const engineIds = new Set(Object.keys(new Synth().p));

  it('has unique parameter ids with valid defaults', () => {
    expect(ids.size).toBe(ALL.length);
    for (const p of ALL) {
      expect(p.default, p.id).toBeGreaterThanOrEqual(p.min);
      expect(p.default, p.id).toBeLessThanOrEqual(p.max);
      if (p.curve === 'exp') expect(p.min, p.id).toBeGreaterThan(0);
      if (p.options) expect(p.options.length, p.id).toBe(p.max - p.min + 1);
    }
  });

  it('every synth control maps to an engine parameter and vice versa', () => {
    for (const p of ALL) if (!FX_IDS.has(p.id)) expect(engineIds, `UI param ${p.id}`).toContain(p.id);
    for (const id of engineIds) expect(ids, `engine param ${id} has no control`).toContain(id);
  });

  it.each(PROGRAMS.map((p) => [p.name, p] as const))('program "%s" only uses known, in-range values', (_n, prog) => {
    for (const [id, v] of Object.entries(prog.values)) {
      const spec = ALL.find((p) => p.id === id);
      expect(spec, `unknown param ${id}`).toBeDefined();
      expect(v, id).toBeGreaterThanOrEqual(spec!.min);
      expect(v, id).toBeLessThanOrEqual(spec!.max);
    }
  });
});

describe('HALCYON engine', () => {
  it.each(PROGRAMS.map((p) => [p.name, p] as const))('program "%s" renders a chord cleanly', (_n, prog) => {
    const proc = synth(prog.values);
    for (const note of [60, 64, 67]) proc.port.deliver({ type: 'noteOn', note, vel: 0.9 });
    const [l, r] = play(proc, 1.5);
    expect(allFinite(l) && allFinite(r)).toBe(true);
    expect(Math.max(peak(l), peak(r))).toBeGreaterThan(0.01);
    expect(Math.max(peak(l), peak(r))).toBeLessThanOrEqual(1); // soft-clipped output
  });

  it('limits polyphony to 8 voices and steals the oldest', () => {
    const proc = synth({ aR: 5 });
    for (let n = 48; n < 60; n++) proc.port.deliver({ type: 'noteOn', note: n, vel: 0.8 });
    play(proc, 0.1);
    expect(activeVoices(proc)).toBe(8);
    const notes = (proc.voices as { note: number }[]).map((v) => v.note).sort((a, b) => a - b);
    expect(notes).toEqual([52, 53, 54, 55, 56, 57, 58, 59]);
  });

  it('releases voices after note-off', () => {
    const proc = synth({ aR: 0.05 });
    proc.port.deliver({ type: 'noteOn', note: 60, vel: 0.8 });
    play(proc, 0.1);
    proc.port.deliver({ type: 'noteOff', note: 60 });
    const [l] = play(proc, 0.5);
    expect(activeVoices(proc)).toBe(0);
    expect(peak(l.subarray(l.length - 1000))).toBeLessThan(1e-4);
  });

  it('MONO mode uses a single voice', () => {
    const proc = synth({ voiceMode: 1 });
    for (const note of [60, 64, 67]) proc.port.deliver({ type: 'noteOn', note, vel: 0.8 });
    play(proc, 0.1);
    expect(activeVoices(proc)).toBe(1);
    expect(proc.voices[0].note).toBe(67); // last-note priority
  });

  it('arpeggiates held notes in UP order at the set rate', () => {
    const proc = synth({ arpOn: 1, arpMode: 0, arpRate: 3, arpOct: 1, tempo: 120 });
    for (const note of [67, 60, 64]) proc.port.deliver({ type: 'noteOn', note, vel: 0.8 });
    const seen: number[] = [];
    render(proc, {
      blocks: blocksFor(1),
      outputs: [2],
      params: {},
      onBlock: () => {
        const n = proc.arpNote as number;
        if (n >= 0 && seen[seen.length - 1] !== n) seen.push(n);
      },
    });
    // 1/16 at 120 BPM = 8 steps per second
    expect(seen.slice(0, 6)).toEqual([60, 64, 67, 60, 64, 67]);
    expect(seen.length).toBeGreaterThanOrEqual(7);
  });

  it('STACK spreads saws across the stereo field', () => {
    const width = (spread: number) => {
      const proc = synth({ o1Wave: 4, o1Spread: spread, o1Detune: 0.5, mixO1: 1, routing: 2, cutoff: 18000 });
      proc.port.deliver({ type: 'noteOn', note: 60, vel: 1 });
      const [l, r] = play(proc, 0.3);
      const side = l.map((v, i) => v - r[i]);
      return rms(side) / rms(l);
    };
    expect(width(0)).toBeLessThan(1e-6);
    expect(width(1)).toBeGreaterThan(0.2);
  });
});
