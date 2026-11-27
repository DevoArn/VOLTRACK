import { workletModule } from '../core/audio-utils';
import type { ModuleSpec } from '../core/types';
import { led, setLed } from './ui-bits';

/** Attach a LED that follows level messages posted by the worklet. */
function levelLed(bipolar: boolean): ModuleSpec['ui'] {
  return (body, inst) => {
    const d = led();
    d.classList.add('led-corner');
    body.append(d);
    let level = 0;
    if (inst.audio.port) {
      inst.audio.port.onmessage = (e: MessageEvent) => {
        if (typeof e.data === 'number') level = bipolar ? (e.data + 1) / 2 : e.data;
      };
    }
    return { frame: () => setLed(d, level) };
  };
}

export const LFO: ModuleSpec = {
  type: 'lfo',
  name: 'LFO',
  category: 'Modulation',
  description: 'Low-frequency oscillator with four simultaneous shapes, exponential rate CV and reset.',
  hp: 8,
  params: [{ id: 'rate', label: 'RATE', min: 0.01, max: 40, default: 1, curve: 'exp', unit: 'Hz', size: 'lg' }],
  inputs: [
    { id: 'rate', label: 'RATE', kind: 'cv' },
    { id: 'reset', label: 'RST', kind: 'gate' },
  ],
  outputs: [
    { id: 'sine', label: 'SIN', kind: 'cv' },
    { id: 'tri', label: 'TRI', kind: 'cv' },
    { id: 'saw', label: 'SAW', kind: 'cv' },
    { id: 'square', label: 'SQR', kind: 'cv' },
  ],
  create: (ctx, sink) => workletModule(ctx, sink, 'lfo', ['rate', 'reset'], ['sine', 'tri', 'saw', 'square']),
  ui: levelLed(true),
};

export const ADSR: ModuleSpec = {
  type: 'adsr',
  name: 'ADSR',
  category: 'Modulation',
  description: 'Envelope generator. Linear attack, exponential decay/release. Gate in, retrigger in.',
  hp: 12,
  params: [
    { id: 'attack', label: 'A', min: 0.001, max: 10, default: 0.01, curve: 'exp', unit: 's' },
    { id: 'decay', label: 'D', min: 0.005, max: 10, default: 0.3, curve: 'exp', unit: 's' },
    { id: 'sustain', label: 'S', min: 0, max: 1, default: 0.6 },
    { id: 'release', label: 'R', min: 0.005, max: 15, default: 0.5, curve: 'exp', unit: 's' },
  ],
  inputs: [
    { id: 'gate', label: 'GATE', kind: 'gate' },
    { id: 'retrig', label: 'RTRG', kind: 'gate' },
  ],
  outputs: [
    { id: 'env', label: 'ENV', kind: 'cv' },
    { id: 'inv', label: 'INV', kind: 'cv' },
  ],
  create: (ctx, sink) => workletModule(ctx, sink, 'adsr', ['gate', 'retrig'], ['env', 'inv']),
  ui: levelLed(false),
};

export const SH: ModuleSpec = {
  type: 'sh',
  name: 'S&H',
  category: 'Modulation',
  description: 'Sample & hold. Samples IN on each trigger; with nothing patched to IN it samples internal noise.',
  hp: 6,
  params: [],
  inputs: [
    { id: 'in', label: 'IN', kind: 'cv' },
    { id: 'trig', label: 'TRIG', kind: 'gate' },
  ],
  outputs: [{ id: 'out', label: 'OUT', kind: 'cv' }],
  create: (ctx, sink) => workletModule(ctx, sink, 'samplehold', ['in', 'trig'], ['out']),
};

export const SLEW: ModuleSpec = {
  type: 'slew',
  name: 'SLEW',
  category: 'Modulation',
  description: 'Slew limiter / lag processor with independent rise and fall times. Use for portamento or smoothing.',
  hp: 8,
  params: [
    { id: 'rise', label: 'RISE', min: 0.0005, max: 5, default: 0.1, curve: 'exp', unit: 's' },
    { id: 'fall', label: 'FALL', min: 0.0005, max: 5, default: 0.1, curve: 'exp', unit: 's' },
  ],
  inputs: [{ id: 'in', label: 'IN', kind: 'cv' }],
  outputs: [{ id: 'out', label: 'OUT', kind: 'cv' }],
  create: (ctx, sink) => workletModule(ctx, sink, 'slew', ['in'], ['out']),
};
