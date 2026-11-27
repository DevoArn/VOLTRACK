import { describe, expect, it } from 'vitest';
import type { ParamSpec } from '../../src/core/types';
import { formatValue, fromNorm, toNorm } from '../../src/ui/controls';

const spec = (o: Partial<ParamSpec>): ParamSpec => ({ id: 'x', label: 'X', min: 0, max: 1, default: 0, ...o });

describe('knob value mapping', () => {
  it('linear params round-trip', () => {
    const p = spec({ min: -10, max: 10 });
    for (const v of [-10, -2.5, 0, 7.25, 10]) expect(fromNorm(p, toNorm(p, v))).toBeCloseTo(v, 9);
    expect(toNorm(p, 0)).toBe(0.5);
  });

  it('exponential params put the geometric mean at the centre', () => {
    const p = spec({ min: 20, max: 20000, curve: 'exp' });
    expect(fromNorm(p, 0.5)).toBeCloseTo(Math.sqrt(20 * 20000), 6);
    for (const v of [20, 440, 1000, 20000]) expect(fromNorm(p, toNorm(p, v))).toBeCloseTo(v, 6);
  });

  it('stepped params snap to whole steps', () => {
    const p = spec({ min: -4, max: 4, step: 1 });
    expect(fromNorm(p, 0.53)).toBe(0);
    expect(fromNorm(p, 0.95)).toBe(4);
  });

  it('clamps out-of-range positions', () => {
    const p = spec({ min: 0, max: 1 });
    expect(fromNorm(p, -1)).toBe(0);
    expect(fromNorm(p, 2)).toBe(1);
  });
});

describe('value formatting', () => {
  it('frequencies', () => {
    const hz = spec({ unit: 'Hz', min: 20, max: 20000 });
    expect(formatValue(hz, 440)).toBe('440Hz');
    expect(formatValue(hz, 1200)).toBe('1.20k');
    expect(formatValue(hz, 12000)).toBe('12.0k');
    expect(formatValue(hz, 5.5)).toBe('5.50Hz');
  });

  it('times', () => {
    const s = spec({ unit: 's', min: 0.001, max: 10 });
    expect(formatValue(s, 0.25)).toBe('250ms');
    expect(formatValue(s, 2.5)).toBe('2.50s');
  });

  it('signed semitones and option lists', () => {
    expect(formatValue(spec({ min: -12, max: 12, step: 1, unit: 'st' }), 7)).toBe('+7st');
    expect(formatValue(spec({ min: 0, max: 2, options: ['A', 'B', 'C'] }), 2)).toBe('C');
  });
});
