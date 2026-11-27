import { workletModule } from '../core/audio-utils';
import type { ModuleSpec } from '../core/types';

export const VCO: ModuleSpec = {
  type: 'vco',
  name: 'VCO',
  category: 'Sources',
  description:
    'Voltage-controlled oscillator. Band-limited saw & pulse, triangle and sine. 1V/oct pitch, linear FM, PWM and hard sync.',
  hp: 12,
  params: [
    { id: 'octave', label: 'OCT', min: -4, max: 4, default: 0, step: 1, size: 'lg' },
    { id: 'tune', label: 'TUNE', min: -12, max: 12, default: 0, unit: 'st', size: 'lg' },
    { id: 'fm', label: 'FM', min: 0, max: 1, default: 0, size: 'sm' },
    { id: 'pw', label: 'PW', min: 0.02, max: 0.98, default: 0.5, size: 'sm' },
    { id: 'pwm', label: 'PWM', min: 0, max: 0.5, default: 0, size: 'sm' },
  ],
  inputs: [
    { id: 'pitch', label: 'V/OCT', kind: 'cv' },
    { id: 'fm', label: 'FM', kind: 'cv' },
    { id: 'pwm', label: 'PWM', kind: 'cv' },
    { id: 'sync', label: 'SYNC', kind: 'gate' },
  ],
  outputs: [
    { id: 'sine', label: 'SIN', kind: 'audio' },
    { id: 'tri', label: 'TRI', kind: 'audio' },
    { id: 'saw', label: 'SAW', kind: 'audio' },
    { id: 'pulse', label: 'PLS', kind: 'audio' },
  ],
  create: (ctx, sink) =>
    workletModule(ctx, sink, 'vco', ['pitch', 'fm', 'pwm', 'sync'], ['sine', 'tri', 'saw', 'pulse'], {
      discrete: ['octave'],
    }),
};

export const NOISE: ModuleSpec = {
  type: 'noise',
  name: 'NOISE',
  category: 'Sources',
  description: 'White, pink and brown noise source.',
  hp: 6,
  params: [],
  inputs: [],
  outputs: [
    { id: 'white', label: 'WHT', kind: 'audio' },
    { id: 'pink', label: 'PNK', kind: 'audio' },
    { id: 'brown', label: 'BRN', kind: 'audio' },
  ],
  create: (ctx, sink) => workletModule(ctx, sink, 'noise', [], ['white', 'pink', 'brown']),
};
