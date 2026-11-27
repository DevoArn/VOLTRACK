import { describe, expect, it } from 'vitest';
import {
  BLOCK,
  SR,
  allFinite,
  blocksFor,
  dc,
  frequency,
  loadWorklet,
  params,
  peak,
  render,
  risingEdges,
  rms,
  setParam,
  sine,
} from '../helpers/worklet';

const P = loadWorklet('synth-processors.js');
const C4 = 261.6255653;
const GATE = 10;

describe('worklet registry', () => {
  it('registers every Eurorack processor', () => {
    expect(Object.keys(P).sort()).toEqual(
      ['adsr', 'clock', 'lfo', 'noise', 'quantizer', 'samplehold', 'sequencer', 'shaper', 'slew', 'vcf', 'vco'].sort(),
    );
  });
});

describe('VCO', () => {
  const run = (pitchV: number, overrides: Record<string, number> = {}) => {
    const proc = new P.vco();
    const pitch = dc(pitchV);
    return render(proc, {
      blocks: blocksFor(1),
      outputs: [1, 1, 1, 1],
      inputs: () => [[pitch], [], [], []],
      params: params(P.vco, overrides),
    });
  };

  it('tracks 1V/oct with 0V = C4', () => {
    expect(frequency(run(0)[0][0])).toBeCloseTo(C4, -1);
    expect(frequency(run(1)[0][0])).toBeCloseTo(C4 * 2, -1);
    expect(frequency(run(-2)[0][0])).toBeCloseTo(C4 / 4, -1);
  });

  it('applies the octave and tune knobs', () => {
    expect(frequency(run(0, { octave: 1 })[0][0])).toBeCloseTo(C4 * 2, -1);
    expect(frequency(run(0, { tune: 7 })[0][0])).toBeCloseTo(C4 * Math.pow(2, 7 / 12), -1);
  });

  it('outputs all four waveforms at Eurorack audio level (±5V) without NaN', () => {
    for (const [out] of run(0)) {
      expect(allFinite(out)).toBe(true);
      expect(peak(out)).toBeGreaterThan(4.5);
      expect(peak(out)).toBeLessThan(6);
    }
  });
});

describe('VCF', () => {
  const through = (freq: number, cutoff: number, res = 0) => {
    const proc = new P.vcf();
    const out = render(proc, {
      blocks: blocksFor(0.5),
      outputs: [1, 1, 1],
      inputs: (b) => [[sine(freq, 1, b * BLOCK)], [], []],
      params: params(P.vcf, { cutoff, res, drive: 1 }),
    });
    return out.map(([ch]) => rms(ch.subarray(SR * 0.1)));
  };

  it('low-pass passes low frequencies and attenuates high ones (≥ 12 dB/oct)', () => {
    const [passLP] = through(100, 2000);
    const [stopLP] = through(8000, 2000);
    const inputRms = (5 * Math.tanh(0.2)) / Math.SQRT2; // drive stage scales ±1V into the tanh
    expect(passLP / inputRms).toBeGreaterThan(0.9);
    expect(stopLP / passLP).toBeLessThan(0.1);
  });

  it('high-pass does the opposite', () => {
    const [, , hpLow] = through(100, 2000);
    const [, , hpHigh] = through(8000, 2000);
    expect(hpLow / hpHigh).toBeLessThan(0.1);
  });

  it('stays bounded and finite at maximum resonance with a cutoff sweep', () => {
    const proc = new P.vcf();
    const p = params(P.vcf, { res: 1, drive: 10 });
    const out = render(proc, {
      blocks: blocksFor(1),
      outputs: [1, 1, 1],
      inputs: () => [[Float32Array.from({ length: BLOCK }, () => (Math.random() * 2 - 1) * 5)], [], []],
      params: p,
      onBlock: (b) => setParam(p, 'cutoff', 20 * Math.pow(1000, (b % 100) / 100)),
    });
    for (const [ch] of out) {
      expect(allFinite(ch)).toBe(true);
      expect(peak(ch)).toBeLessThan(500);
    }
  });
});

describe('ADSR', () => {
  it('attacks to +10V, decays to sustain and releases to zero', () => {
    const proc = new P.adsr();
    const gateOnBlocks = blocksFor(0.5);
    const [[env], [inv]] = render(proc, {
      blocks: blocksFor(1.5),
      outputs: [1, 1],
      inputs: (b) => [[dc(b < gateOnBlocks ? GATE : 0)], []],
      params: params(P.adsr, { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.1 }),
    });
    expect(peak(env)).toBeCloseTo(10, 1);
    expect(env[gateOnBlocks * BLOCK - 1]).toBeCloseTo(6, 1); // sustain = 0.6 × 10V
    expect(env[env.length - 1]).toBeLessThan(0.01);
    expect(inv[1000]).toBeCloseTo(-env[1000], 5);
  });

  it('ignores gates below the +1V threshold', () => {
    const proc = new P.adsr();
    const [[env]] = render(proc, {
      blocks: 50,
      outputs: [1, 1],
      inputs: () => [[dc(0.8)], []],
      params: params(P.adsr),
    });
    expect(peak(env)).toBe(0);
  });
});

describe('CLOCK', () => {
  it('produces divisions and multiplications of the tempo', () => {
    const proc = new P.clock();
    const outs = render(proc, {
      blocks: blocksFor(2),
      outputs: [1, 1, 1, 1, 1, 1],
      params: params(P.clock, { bpm: 120 }),
    });
    const [x1, x2, x4, d2, d4, rst] = outs.map(([ch]) => risingEdges(ch.subarray(0, 2 * SR), 1));
    expect(x1).toBe(4); // quarter notes at 120 BPM for 2 s
    expect(x2).toBe(8);
    expect(x4).toBe(16);
    expect(d2).toBe(2);
    expect(d4).toBe(1);
    expect(rst).toBe(1); // reset pulse when the clock starts
  });

  it('outputs nothing while stopped', () => {
    const proc = new P.clock();
    const outs = render(proc, { blocks: 100, outputs: [1, 1, 1, 1, 1, 1], params: params(P.clock, { run: 0 }) });
    for (const [ch] of outs) expect(peak(ch)).toBe(0);
  });
});

describe('STEP SEQUENCER', () => {
  const notes = [0, 2, 4, 5, 7, 9, 11, 12];
  const seqParams = () => {
    const o: Record<string, number> = { steps: 8 };
    notes.forEach((n, i) => (o[`p${i}`] = n));
    o.g2 = 0; // step 3 is a rest
    return params(P.sequencer, o);
  };
  // 10 Hz clock: 4800-sample period, high for the first half
  const clock = (b: number) =>
    Float32Array.from({ length: BLOCK }, (_, i) => ((b * BLOCK + i) % 4800 < 2400 ? GATE : 0));

  it('advances one step per clock and outputs 1V/oct pitch', () => {
    const proc = new P.sequencer();
    const [[cv], [gate]] = render(proc, {
      blocks: Math.ceil((4800 * 10) / BLOCK),
      outputs: [1, 1, 1],
      inputs: (b) => [[clock(b)], [], []],
      params: seqParams(),
    });
    const steps = proc.port.sent.map((m) => (m as { step: number }).step);
    expect(steps.slice(0, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1]);
    expect(cv[4800 * 3 + 100]).toBeCloseTo(5 / 12, 5); // step 4 = +5 semitones
    expect(gate[4800 * 2 + 100]).toBe(0); // gated-off step
    expect(gate[4800 * 3 + 100]).toBe(GATE);
  });

  it('jumps back to step 1 on reset', () => {
    const proc = new P.sequencer();
    render(proc, {
      blocks: Math.ceil((4800 * 5) / BLOCK),
      outputs: [1, 1, 1],
      // reset pulse just before the 4th clock edge
      inputs: (b) => [[clock(b)], [dc(b === Math.floor((4800 * 3 - 200) / BLOCK) ? GATE : 0)], []],
      params: seqParams(),
    });
    const steps = proc.port.sent.map((m) => (m as { step: number }).step);
    expect(steps.slice(0, 5)).toEqual([0, 1, 2, 0, 1]);
  });
});

describe('QUANTIZER', () => {
  const quantize = (volts: number, scale: number, root = 0) => {
    const proc = new P.quantizer();
    const [[out]] = render(proc, {
      blocks: 2,
      outputs: [1, 1],
      inputs: () => [[dc(volts)]],
      params: params(P.quantizer, { scale, root }),
    });
    return out[BLOCK + 10] * 12;
  };

  it('snaps to the nearest note of the selected scale', () => {
    expect(quantize(4.4 / 12, 0)).toBeCloseTo(4, 5); // chromatic
    expect(quantize(4.4 / 12, 1)).toBeCloseTo(4, 5); // major has E
    expect(quantize(4.4 / 12, 2)).toBeCloseTo(5, 5); // minor: D# or F → F is closer
    expect(quantize(1.4, 4)).toBeCloseTo(16, 5); // major pentatonic, octave up: 16.8 → E (16)
  });

  it('respects the root note', () => {
    expect(quantize(5.3 / 12, 1, 0)).toBeCloseTo(5, 5); // C major: nearest is F
    expect(quantize(5.3 / 12, 1, 2)).toBeCloseTo(6, 5); // D major has F#, not F
    expect(quantize(1 / 12, 1, 2)).toBeCloseTo(1, 5); // C# is in D major → unchanged
  });
});

describe('SAMPLE & HOLD', () => {
  it('holds the input value at each trigger', () => {
    const proc = new P.samplehold();
    const [[out]] = render(proc, {
      blocks: 30,
      outputs: [1],
      inputs: (b) => [[dc(b)], [dc(b % 10 === 0 ? GATE : 0)]],
      params: {},
    });
    expect(out[5 * BLOCK]).toBe(0);
    expect(out[15 * BLOCK]).toBe(10);
    expect(out[25 * BLOCK]).toBe(20);
  });

  it('samples internal noise when nothing is patched', () => {
    const proc = new P.samplehold();
    const [[out]] = render(proc, { blocks: 20, outputs: [1], inputs: (b) => [[], [dc(b % 2 ? GATE : 0)]], params: {} });
    expect(new Set(out).size).toBeGreaterThan(5);
    expect(peak(out)).toBeLessThanOrEqual(5);
  });
});

describe('NOISE, LFO, SLEW, WAVESHAPER', () => {
  it('noise colours are finite and within ±5V', () => {
    const outs = render(new P.noise(), { blocks: 200, outputs: [1, 1, 1], params: {} });
    for (const [ch] of outs) {
      expect(allFinite(ch)).toBe(true);
      expect(peak(ch)).toBeLessThan(8);
      expect(rms(ch)).toBeGreaterThan(0.1);
    }
  });

  it('LFO runs at the set rate', () => {
    const [[sin]] = render(new P.lfo(), {
      blocks: blocksFor(2),
      outputs: [1, 1, 1, 1],
      params: params(P.lfo, { rate: 5 }),
    });
    expect(frequency(sin)).toBeCloseTo(5, 0);
    expect(peak(sin)).toBeCloseTo(5, 1);
  });

  it('slew limiter smooths a step', () => {
    const [[out]] = render(new P.slew(), {
      blocks: blocksFor(0.2),
      outputs: [1],
      inputs: () => [[dc(5)]],
      params: params(P.slew, { rise: 0.1 }),
    });
    expect(out[10]).toBeLessThan(0.5);
    expect(out[out.length - 1]).toBeGreaterThan(4.5);
  });

  it('all seven waveshaper modes stay finite and bounded', () => {
    for (let mode = 0; mode <= 6; mode++) {
      const [[out]] = render(new P.shaper(), {
        blocks: 100,
        outputs: [1],
        inputs: (b) => [[sine(220, 5, b * BLOCK)], []],
        params: params(P.shaper, { mode, drive: 30, mix: 1 }),
      });
      expect(allFinite(out), `mode ${mode}`).toBe(true);
      expect(peak(out), `mode ${mode}`).toBeLessThan(8);
      expect(peak(out), `mode ${mode}`).toBeGreaterThan(0.5);
    }
  });
});
