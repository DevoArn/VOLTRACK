import { describe, expect, it } from 'vitest';
import { emptyPattern, factoryPatterns, parsePattern } from '../../src/acid/patterns';
import { BLOCK, allFinite, blocksFor, loadWorklet, params, peak, render, rms, sine } from '../helpers/worklet';

const V = loadWorklet('acid-processor.js');
const FX = loadWorklet('acid-fx.js');

function voice(overrides: Record<string, number> = {}) {
  const proc = new V['acid-voice']();
  return { proc, p: params(V['acid-voice'], overrides) };
}
const steps = (proc: { port: { sent: unknown[] } }) =>
  proc.port.sent.filter((m) => (m as { type: string }).type === 'step').map((m) => (m as { step: number }).step);

describe('ACIDLINE voice + sequencer', () => {
  it('plays 16th notes at the set tempo', () => {
    const { proc, p } = voice({ run: 1, tempo: 120, swing: 0 });
    proc.port.deliver({ type: 'pattern', pattern: factoryPatterns()[0] });
    const [[out]] = render(proc, { blocks: blocksFor(2), outputs: [1], params: p });
    // 120 BPM → 8 sixteenths per second
    expect(steps(proc).length).toBe(16);
    expect(steps(proc).slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(allFinite(out)).toBe(true);
    expect(peak(out)).toBeGreaterThan(0.05);
    expect(peak(out)).toBeLessThan(1.5);
  });

  it('honours the pattern length', () => {
    const { proc, p } = voice({ run: 1, tempo: 120 });
    proc.port.deliver({ type: 'pattern', pattern: { ...factoryPatterns()[0], length: 5 } });
    render(proc, { blocks: blocksFor(1.5), outputs: [1], params: p });
    expect(steps(proc).slice(0, 8)).toEqual([0, 1, 2, 3, 4, 0, 1, 2]);
  });

  it('is silent for a pattern of rests', () => {
    const { proc, p } = voice({ run: 1 });
    proc.port.deliver({ type: 'pattern', pattern: emptyPattern() });
    const [[out]] = render(proc, { blocks: blocksFor(1), outputs: [1], params: p });
    expect(peak(out)).toBeLessThan(1e-3);
  });

  it('slides into the next note without retriggering', () => {
    const { proc, p } = voice({ run: 1, tempo: 120 });
    proc.port.deliver({ type: 'pattern', pattern: parsePattern(['Cs', 'C+', '--', '--'], 4) });
    const stepLen = (48000 * 60) / 120 / 4;
    render(proc, { blocks: Math.ceil((stepLen * 1.2) / BLOCK), outputs: [1], params: p });
    expect(proc.glide).toBe(true);
    expect(proc.target).toBe(48); // C2 + 12
    expect(proc.pitch).toBeGreaterThan(36);
    expect(proc.pitch).toBeLessThan(48);
  });

  it('keeps a long tail in ADSR mode versus the classic gate envelope', () => {
    const tail = (ampMode: number) => {
      const { proc, p } = voice({ ampMode, ampR: 1.5, ampS: 1 });
      proc.port.deliver({ type: 'noteOn', note: 48, acc: 0 });
      render(proc, { blocks: blocksFor(0.2), outputs: [1], params: p });
      proc.port.deliver({ type: 'noteOff', note: 48 });
      const [[out]] = render(proc, { blocks: blocksFor(0.3), outputs: [1], params: p });
      return rms(out.subarray(Math.floor(out.length / 2)));
    };
    expect(tail(1)).toBeGreaterThan(tail(0) * 20);
  });

  it('accented notes are louder', () => {
    const level = (acc: number) => {
      const { proc, p } = voice({ accent: 1 });
      proc.port.deliver({ type: 'noteOn', note: 48, acc });
      const [[out]] = render(proc, { blocks: blocksFor(0.1), outputs: [1], params: p });
      return rms(out);
    };
    expect(level(1)).toBeGreaterThan(level(0) * 1.3);
  });
});

describe('post-FX: distortion', () => {
  const D = FX['acid-dist'];

  it.each([0, 1, 2, 3, 4, 5, 6])('type %i is finite, bounded and audible', (type) => {
    const [[out]] = render(new D(), {
      blocks: 200,
      outputs: [1],
      inputs: (b) => [[sine(110, 0.5, b * BLOCK)]],
      params: params(D, { on: 1, type, drive: 20, mix: 1 }),
    });
    expect(allFinite(out)).toBe(true);
    expect(peak(out)).toBeLessThan(2);
    expect(rms(out)).toBeGreaterThan(0.01);
  });

  it('passes audio through untouched when switched off', () => {
    const input = sine(220, 0.4, 0);
    const [[out]] = render(new D(), { blocks: 1, outputs: [1], inputs: () => [[input]], params: params(D, { on: 0 }) });
    expect(Array.from(out)).toEqual(Array.from(input));
  });

  it('processes stereo channels independently', () => {
    const [[l, r]] = render(new D(), {
      blocks: 10,
      outputs: [2],
      inputs: (b) => [[sine(110, 0.5, b * BLOCK), sine(330, 0.5, b * BLOCK)]],
      params: params(D, { on: 1, type: 0, drive: 5 }),
    });
    expect(rms(l)).toBeGreaterThan(0);
    expect(Array.from(l)).not.toEqual(Array.from(r));
  });
});

describe('post-FX: mod FX', () => {
  const M = FX['acid-modfx'];

  it.each([
    [0, 'chorus'],
    [1, 'flanger'],
    [2, 'phaser'],
  ])('type %i (%s) is finite and stereo', (type) => {
    const [[l, r]] = render(new M(), {
      blocks: 400,
      outputs: [2],
      inputs: (b) => [[sine(220, 0.5, b * BLOCK)]],
      params: params(M, { on: 1, type, depth: 1, feedback: 0.9, mix: 1 }),
    });
    expect(allFinite(l) && allFinite(r)).toBe(true);
    expect(peak(l)).toBeLessThan(5);
    expect(Array.from(l)).not.toEqual(Array.from(r)); // L/R LFOs are in quadrature
  });

  it('is transparent when switched off (stereo preserved)', () => {
    const a = sine(220, 0.4, 0);
    const b = sine(330, 0.4, 0);
    const [[l, r]] = render(new M(), { blocks: 1, outputs: [2], inputs: () => [[a, b]], params: params(M, { on: 0 }) });
    expect(Array.from(l)).toEqual(Array.from(a));
    expect(Array.from(r)).toEqual(Array.from(b));
  });
});
