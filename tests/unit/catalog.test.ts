/** Static integrity checks for the module catalogue and factory content. */
import { describe, expect, it } from 'vitest';
import { NOTE_NAMES, STEPS, emptyPattern, factoryPatterns, parsePattern, randomPattern } from '../../src/acid/patterns';
import { MODULES, REGISTRY } from '../../src/modules';
import { PRESETS } from '../../src/presets';
import { CASE_HP } from '../../src/ui/rack';

describe('module catalogue', () => {
  it('has unique types', () => {
    expect(REGISTRY.size).toBe(MODULES.length);
  });

  it.each(MODULES.map((m) => [m.type, m] as const))('%s has a valid spec', (_t, spec) => {
    expect(Number.isInteger(spec.hp)).toBe(true);
    expect(spec.hp).toBeGreaterThanOrEqual(4);
    expect(spec.hp).toBeLessThanOrEqual(CASE_HP);
    const ids = spec.params.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(spec.inputs.map((p) => p.id)).size).toBe(spec.inputs.length);
    expect(new Set(spec.outputs.map((p) => p.id)).size).toBe(spec.outputs.length);
    for (const p of spec.params) {
      expect(p.default, p.id).toBeGreaterThanOrEqual(p.min);
      expect(p.default, p.id).toBeLessThanOrEqual(p.max);
      if (p.curve === 'exp') expect(p.min, p.id).toBeGreaterThan(0);
      if (p.options) expect(p.options.length, p.id).toBe(p.max - p.min + 1);
    }
  });
});

describe('modular presets', () => {
  it.each(PRESETS.map((p) => [p.name, p] as const))('"%s" is a valid, racked patch', (_n, preset) => {
    const byId = new Map(preset.modules.map((m) => [m.id, m]));
    expect(byId.size).toBe(preset.modules.length);

    for (const m of preset.modules) {
      const spec = REGISTRY.get(m.type);
      expect(spec, m.type).toBeDefined();
      expect(m.row).toBeLessThan(preset.rows ?? 3);
      expect(m.hp + spec!.hp, `${m.id} overflows the ${CASE_HP}HP rail`).toBeLessThanOrEqual(CASE_HP);
      for (const [k, v] of Object.entries(m.params ?? {})) {
        const p = spec!.params.find((x) => x.id === k);
        expect(p, `${m.id}.${k}`).toBeDefined();
        expect(v).toBeGreaterThanOrEqual(p!.min);
        expect(v).toBeLessThanOrEqual(p!.max);
      }
    }

    // no two panels overlap on the same row
    for (const a of preset.modules)
      for (const b of preset.modules) {
        if (a === b || a.row !== b.row) continue;
        const wa = REGISTRY.get(a.type)!.hp;
        const wb = REGISTRY.get(b.type)!.hp;
        expect(a.hp + wa <= b.hp || b.hp + wb <= a.hp, `${a.id} overlaps ${b.id}`).toBe(true);
      }

    const inputsUsed = new Set<string>();
    for (const c of preset.cables) {
      const from = REGISTRY.get(byId.get(c.from.module)!.type)!;
      const to = REGISTRY.get(byId.get(c.to.module)!.type)!;
      expect(
        from.outputs.map((p) => p.id),
        `${c.from.module}.${c.from.port}`,
      ).toContain(c.from.port);
      expect(
        to.inputs.map((p) => p.id),
        `${c.to.module}.${c.to.port}`,
      ).toContain(c.to.port);
      const key = `${c.to.module}.${c.to.port}`;
      expect(inputsUsed.has(key), `two cables into ${key}`).toBe(false);
      inputsUsed.add(key);
    }
  });
});

describe('ACIDLINE patterns', () => {
  it('parses the compact notation', () => {
    const p = parsePattern(['C', 'D#-a', 'G+s', '--', 'bad']);
    expect(p.length).toBe(5);
    expect(p.steps[0]).toEqual({ note: 0, oct: 0, acc: 0, slide: 0, gate: 1 });
    expect(p.steps[1]).toEqual({ note: 3, oct: -1, acc: 1, slide: 0, gate: 1 });
    expect(p.steps[2]).toEqual({ note: 7, oct: 1, acc: 0, slide: 1, gate: 1 });
    expect(p.steps[3].gate).toBe(0);
    expect(p.steps[4].gate).toBe(0); // invalid token → rest
  });

  it('always stores 16 steps', () => {
    expect(emptyPattern().steps).toHaveLength(STEPS);
    expect(parsePattern(['C'], 1).steps).toHaveLength(STEPS);
  });

  it('random patterns are musical: in-scale notes and a note on every downbeat', () => {
    const scale = new Set([0, 3, 5, 7, 10, 12]);
    for (let i = 0; i < 50; i++) {
      const p = randomPattern(12);
      expect(p.length).toBe(12);
      p.steps.forEach((s, idx) => {
        if (idx % 4 === 0) expect(s.gate).toBe(1);
        if (s.gate) expect(scale.has(s.note)).toBe(true);
        expect([-1, 0, 1]).toContain(s.oct);
      });
    }
  });

  it('ships a full bank with four factory lines', () => {
    const bank = factoryPatterns();
    expect(bank).toHaveLength(8);
    expect(bank.filter((p) => p.steps.some((s) => s.gate))).toHaveLength(4);
    expect(NOTE_NAMES).toHaveLength(13);
  });
});
