/**
 * HALCYON VA-8 parameter schema: panel layout, ranges, defaults and help text.
 * Kept free of DOM code so it can be unit-tested and shared with the UI.
 */
import type { ParamSpec } from '../core/types';

export const DELAY_SYNC = [0.25, 0.5, 0.75, 1, 1.5];

export type Group = { title: string; params: ParamSpec[]; tip?: string };
const sw = (id: string, label: string, options: string[], def = 0): ParamSpec => ({
  id,
  label,
  min: 0,
  max: options.length - 1,
  default: def,
  step: 1,
  control: 'switch',
  options,
});
const tg = (id: string, label: string, def = 0): ParamSpec => ({
  id,
  label,
  min: 0,
  max: 1,
  default: def,
  step: 1,
  control: 'toggle',
});
const kn = (
  id: string,
  label: string,
  min: number,
  max: number,
  def: number,
  extra: Partial<ParamSpec> = {},
): ParamSpec => ({
  id,
  label,
  min,
  max,
  default: def,
  size: 'sm',
  ...extra,
});
const sec = (id: string, label: string, min: number, max: number, def: number) =>
  kn(id, label, min, max, def, { curve: 'exp', unit: 's' });

const WAVES = ['SAW', 'SQUARE', 'TRI', 'SINE'];
const LFO_SHAPES = ['SINE', 'TRI', 'SAW', 'SQUARE', 'S&H'];

/* Rows of group boxes, in panel order. */
export const ROWS: Group[][] = [
  [
    {
      title: 'OSC 1',
      params: [
        sw('o1Wave', 'WAVE', [...WAVES, 'STACK'], 4),
        kn('o1Semi', 'SEMI', -24, 24, 0, { step: 1, unit: 'st' }),
        kn('o1Detune', 'DETUNE', 0, 1, 0.35),
        kn('o1Spread', 'SPREAD', 0, 1, 0.7),
        kn('o1PW', 'PW', 0.05, 0.95, 0.5),
      ],
    },
    {
      title: 'OSC 2',
      params: [
        sw('o2Wave', 'WAVE', WAVES, 0),
        kn('o2Semi', 'SEMI', -24, 24, 7, { step: 1, unit: 'st' }),
        kn('o2Fine', 'FINE', -50, 50, 0, { unit: 'ct' }),
        tg('o2Sync', 'SYNC'),
        kn('o2FM', 'FM', 0, 1, 0),
      ],
    },
    {
      title: 'MIXER',
      params: [
        kn('mixO1', 'OSC 1', 0, 1, 0.8),
        kn('mixO2', 'OSC 2', 0, 1, 0),
        kn('mixSub', 'SUB', 0, 1, 0),
        kn('mixNoise', 'NOISE', 0, 1, 0),
        kn('mixRing', 'RING', 0, 1, 0),
        kn('drive', 'DRIVE', 0.5, 6, 1, { curve: 'exp' }),
      ],
    },
  ],
  [
    {
      title: 'FILTER 1',
      params: [
        sw('f1Mode', 'MODE', ['LP 24', 'LP 12', 'BP', 'HP']),
        kn('cutoff', 'CUTOFF', 20, 18000, 3000, { curve: 'exp', unit: 'Hz', size: 'lg' }),
        kn('res', 'RESO', 0, 1, 0.25, { size: 'lg' }),
        kn('envAmt', 'ENV AMT', -1, 1, 0.3),
        kn('keyTrack', 'KEY TRK', 0, 1, 0.5),
      ],
    },
    {
      title: 'FILTER 2',
      params: [
        sw('routing', 'ROUTING', ['SERIAL', 'PARALLEL', 'F1 ONLY'], 2),
        sw('f2Mode', 'MODE', ['LP', 'BP', 'HP']),
        kn('f2Offset', 'OFFSET', -48, 48, 0, { step: 1, unit: 'st' }),
        kn('f2Res', 'RESO', 0, 1, 0.2),
      ],
    },
    {
      title: 'FILTER ENV',
      params: [
        sec('fA', 'ATTACK', 0.001, 8, 0.01),
        sec('fD', 'DECAY', 0.005, 8, 0.6),
        kn('fS', 'SUSTAIN', 0, 1, 0.3),
        sec('fR', 'RELEASE', 0.005, 10, 0.6),
      ],
    },
    {
      title: 'AMP ENV',
      params: [
        sec('aA', 'ATTACK', 0.001, 8, 0.005),
        sec('aD', 'DECAY', 0.005, 8, 0.5),
        kn('aS', 'SUSTAIN', 0, 1, 0.8),
        sec('aR', 'RELEASE', 0.005, 10, 0.6),
        kn('velAmp', 'VEL', 0, 1, 0.5),
      ],
    },
  ],
  [
    {
      title: 'LFO 1',
      params: [
        sw('l1Shape', 'SHAPE', LFO_SHAPES),
        kn('l1Rate', 'RATE', 0.02, 20, 5, { curve: 'exp', unit: 'Hz' }),
        kn('l1Pitch', '→PITCH', 0, 2, 0, { unit: 'st' }),
        kn('l1Cut', '→CUTOFF', -1, 1, 0),
      ],
    },
    {
      title: 'LFO 2',
      params: [
        sw('l2Shape', 'SHAPE', LFO_SHAPES, 1),
        kn('l2Rate', 'RATE', 0.02, 20, 0.3, { curve: 'exp', unit: 'Hz' }),
        kn('l2PW', '→PW', 0, 0.45, 0),
        kn('l2Amp', '→AMP', 0, 1, 0),
        kn('l2Pan', '→PAN', 0, 1, 0),
      ],
    },
    {
      title: 'VOICE',
      params: [
        sw('voiceMode', 'MODE', ['POLY', 'MONO', 'LEGATO']),
        kn('glide', 'GLIDE', 0, 1, 0, { unit: 's' }),
        kn('octave', 'OCTAVE', -3, 3, 0, { step: 1 }),
      ],
    },
    {
      title: 'ARPEGGIATOR',
      params: [
        tg('arpOn', 'ON'),
        sw('arpMode', 'MODE', ['UP', 'DOWN', 'UP/DOWN', 'RANDOM', 'ORDER']),
        sw('arpRate', 'RATE', ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'], 3),
        kn('arpOct', 'OCTAVES', 1, 4, 1, { step: 1 }),
        kn('arpGate', 'GATE', 0.05, 1, 0.6),
        tg('arpHold', 'HOLD'),
        kn('tempo', 'TEMPO', 40, 240, 128, { step: 1 }),
      ],
    },
  ],
  [
    {
      title: 'DISTORTION',
      params: [
        tg('distOn', 'ON'),
        sw('distType', 'TYPE', ['OVERDRIVE', 'TUBE', 'FUZZ', 'HARD CLIP', 'FOLDBACK', 'RECTIFY', 'BITCRUSH']),
        kn('distDrive', 'DRIVE', 1, 60, 2.5, { curve: 'exp' }),
        kn('distTone', 'TONE', 200, 18000, 9000, { curve: 'exp', unit: 'Hz' }),
        kn('distMix', 'MIX', 0, 1, 1),
      ],
    },
    {
      title: 'MOD FX',
      params: [
        tg('modOn', 'ON'),
        sw('modType', 'TYPE', ['CHORUS', 'FLANGER', 'PHASER']),
        kn('modRate', 'RATE', 0.02, 10, 0.4, { curve: 'exp', unit: 'Hz' }),
        kn('modDepth', 'DEPTH', 0, 1, 0.6),
        kn('modFb', 'FDBK', 0, 0.92, 0.4),
        kn('modMix', 'MIX', 0, 1, 0.5),
      ],
    },
    {
      title: 'DELAY',
      params: [
        tg('dOn', 'ON', 1),
        sw('dsync', 'TIME', ['1/16', '1/8', '3/16', '1/4', '3/8'], 2),
        kn('dfb', 'FDBK', 0, 0.9, 0.35),
        kn('dtone', 'TONE', 400, 12000, 3500, { curve: 'exp', unit: 'Hz' }),
        kn('dmix', 'MIX', 0, 1, 0.2),
      ],
    },
    {
      title: 'REVERB',
      params: [
        tg('rOn', 'ON', 1),
        kn('rSize', 'SIZE', 0.3, 10, 2.5, { curve: 'exp', unit: 's' }),
        kn('rDamp', 'DAMP', 800, 16000, 6000, { curve: 'exp', unit: 'Hz' }),
        kn('rMix', 'MIX', 0, 1, 0.2),
      ],
    },
    { title: 'OUTPUT', params: [kn('volume', 'VOLUME', 0, 1, 0.7, { size: 'lg' })] },
  ],
];
export const ALL = ROWS.flat().flatMap((g) => g.params);
export const DEFAULTS = Object.fromEntries(ALL.map((p) => [p.id, p.default]));
export const FX_IDS = new Set([
  'distOn',
  'distType',
  'distDrive',
  'distTone',
  'distMix',
  'modOn',
  'modType',
  'modRate',
  'modDepth',
  'modFb',
  'modMix',
  'dOn',
  'dsync',
  'dfb',
  'dtone',
  'dmix',
  'rOn',
  'rSize',
  'rDamp',
  'rMix',
]);

export const TIPS: Record<string, string> = {
  o1Wave: 'STACK = seven detuned saws spread across the stereo field for huge leads and pads',
  o1Detune: 'Detune between the STACK saws',
  o1Spread: 'Stereo width of the STACK saws',
  o1PW: 'Pulse width of the SQUARE wave',
  o2Semi: 'Interval of OSC 2 relative to OSC 1',
  o2Sync: 'Hard-sync OSC 2 to OSC 1 — sweep SEMI for classic sync leads',
  o2FM: 'Frequency modulation of OSC 2 by OSC 1',
  mixRing: 'Ring modulation OSC 1 × OSC 2 (metallic tones)',
  drive: 'Saturation into the filters',
  f1Mode: 'Filter 1 type: 24 dB or 12 dB low-pass, band-pass or high-pass',
  envAmt: 'Filter envelope amount (negative = inverted sweep)',
  keyTrack: 'How much the cutoff follows the played note',
  routing: 'SERIAL = F1 into F2 · PARALLEL = both mixed · F1 ONLY = bypass filter 2',
  f2Offset: 'Filter 2 cutoff relative to filter 1 (semitones)',
  velAmp: 'How strongly velocity affects loudness',
  l1Pitch: 'Vibrato depth',
  l1Cut: 'Filter wobble depth',
  l2PW: 'Pulse-width modulation of OSC 1 SQUARE',
  l2Amp: 'Tremolo depth',
  l2Pan: 'Auto-pan depth',
  voiceMode: 'POLY = 8 voices · MONO = single voice, retrigger · LEGATO = single voice, glide without retrigger',
  glide: 'Portamento time between notes',
  arpOn: 'Arpeggiate held notes',
  arpHold: 'Latch: notes keep playing after you release the keys',
  arpOrder: 'ORDER plays notes in the order you pressed them',
  tempo: 'Tempo for arpeggiator and delay',
  distType:
    'OVERDRIVE smooth · TUBE warm & asymmetric · FUZZ squared-off · HARD CLIP digital · FOLDBACK wavefolder · RECTIFY octave-up grit · BITCRUSH lo-fi',
  modType: 'CHORUS widens · FLANGER jet sweep · PHASER swirling notches',
};
