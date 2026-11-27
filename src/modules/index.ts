import type { Category, ModuleSpec } from '../core/types';
import { CHORUS, DELAY, REVERB, SHAPER } from './effects';
import { MIXER, RING, VCA, VCF } from './filters-amps';
import { OUTPUT, SCOPE } from './io';
import { ADSR, LFO, SH, SLEW } from './modulation';
import { CLOCK, KEYS, QUANT, SEQ } from './sequencing';
import { NOISE, VCO } from './sources';
import { ATTN, MULT } from './utilities';

export const MODULES: ModuleSpec[] = [
  VCO,
  NOISE,
  VCF,
  VCA,
  MIXER,
  RING,
  LFO,
  ADSR,
  SH,
  SLEW,
  CLOCK,
  SEQ,
  QUANT,
  KEYS,
  SHAPER,
  DELAY,
  CHORUS,
  REVERB,
  ATTN,
  MULT,
  OUTPUT,
  SCOPE,
];

export const REGISTRY = new Map(MODULES.map((m) => [m.type, m]));

export const CATEGORY_ORDER: Category[] = [
  'Sources',
  'Filters',
  'Amps & Mixers',
  'Modulation',
  'Sequencing',
  'Effects',
  'Utilities',
  'I/O',
];

export const CATEGORY_COLORS: Record<Category, string> = {
  Sources: '#ff6600',
  Filters: '#ffcc00',
  'Amps & Mixers': '#00cc00',
  Modulation: '#00cccc',
  Sequencing: '#ff00ff',
  Effects: '#9933ff',
  Utilities: '#3366ff',
  'I/O': '#ffffff',
};
