export interface Step {
  /** Semitone above the pattern root, 0..12 */
  note: number;
  /** Octave shift −1 / 0 / +1 */
  oct: number;
  acc: number;
  slide: number;
  /** 1 = note, 0 = rest */
  gate: number;
}

export interface Pattern {
  length: number;
  steps: Step[];
}

export const STEPS = 16;
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', "C'"];

export const rest = (): Step => ({ note: 0, oct: 0, acc: 0, slide: 0, gate: 0 });

export function emptyPattern(): Pattern {
  return { length: 16, steps: Array.from({ length: STEPS }, rest) };
}

/**
 * Compact pattern notation, one token per step:
 *   "--"          rest
 *   "C" "D#"      note
 *   suffix "+"/"-" octave up/down, "a" accent, "s" slide   e.g. "G#-as"
 */
export function parsePattern(tokens: string[], length = tokens.length): Pattern {
  const p = emptyPattern();
  p.length = length;
  tokens.slice(0, STEPS).forEach((tok, i) => {
    const m = /^([A-G]#?)([+-]?)([as]*)$/.exec(tok);
    if (!m) return;
    p.steps[i] = {
      note: NOTE_NAMES.indexOf(m[1]),
      oct: m[2] === '+' ? 1 : m[2] === '-' ? -1 : 0,
      acc: m[3].includes('a') ? 1 : 0,
      slide: m[3].includes('s') ? 1 : 0,
      gate: 1,
    };
  });
  return p;
}

/** Musical random pattern: minor-pentatonic notes, sparse accents and slides. */
export function randomPattern(length = 16): Pattern {
  const scale = [0, 0, 3, 5, 7, 7, 10, 12];
  const p = emptyPattern();
  p.length = length;
  for (let i = 0; i < STEPS; i++) {
    if (Math.random() < 0.22 && i % 4 !== 0) continue; // rests, never on the downbeat
    const r = Math.random();
    p.steps[i] = {
      note: scale[Math.floor(Math.random() * scale.length)],
      oct: r < 0.15 ? 1 : r < 0.27 ? -1 : 0,
      acc: Math.random() < (i % 4 === 0 ? 0.45 : 0.18) ? 1 : 0,
      slide: Math.random() < 0.2 ? 1 : 0,
      gate: 1,
    };
  }
  return p;
}

/** Factory bank — original lines written for this instrument. */
export function factoryPatterns(): Pattern[] {
  const bank = [
    parsePattern(['C', 'C', 'C+', 'Ca', '--', 'D#', 'C', 'G-s', 'A#-', 'C', 'C+a', '--', 'C', 'F', 'Gs', 'D#a']),
    parsePattern(['A-a', 'A-', '--', 'A', 'A-s', 'C', '--', 'A-a', 'E', 'A-', 'G', 'A-as', 'A-', '--', 'C+', 'A-']),
    parsePattern(['F-a', 'F-', 'F', '--', 'F-s', 'G#-', 'F-', 'C', 'F-a', '--', 'D#', 'F-s', 'F', 'F-', 'G#-a', 'C']),
    parsePattern(['Ca', 'Cs', 'C+', 'C', 'D#a', 'Ds', 'C', 'C-', 'Ca', 'Cs', 'G', 'F', 'D#a', 'Ds', 'C', 'A#-s'], 16),
  ];
  while (bank.length < 8) bank.push(emptyPattern());
  return bank;
}
