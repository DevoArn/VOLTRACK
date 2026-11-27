import { disconnectAll, workletModule } from '../core/audio-utils';
import type { ModuleSpec, ParamSpec } from '../core/types';
import { el, led, setLed } from './ui-bits';

/* ----------------------------------------------------------------- CLOCK */
export const CLOCK: ModuleSpec = {
  type: 'clock',
  name: 'CLOCK',
  category: 'Sequencing',
  description: 'Master clock with multiplied/divided gate outputs, swing and a reset pulse on start.',
  hp: 12,
  params: [
    { id: 'bpm', label: 'BPM', min: 20, max: 300, default: 120, step: 1, size: 'lg' },
    { id: 'swing', label: 'SWING', min: 0, max: 0.5, default: 0, size: 'sm' },
    { id: 'run', label: 'RUN', min: 0, max: 1, default: 1, step: 1, control: 'toggle' },
  ],
  inputs: [],
  outputs: [
    { id: 'x1', label: '1/4', kind: 'gate' },
    { id: 'x2', label: '1/8', kind: 'gate' },
    { id: 'x4', label: '1/16', kind: 'gate' },
    { id: 'd2', label: '1/2', kind: 'gate' },
    { id: 'd4', label: '1/1', kind: 'gate' },
    { id: 'rst', label: 'RST', kind: 'gate' },
  ],
  create: (ctx, sink) =>
    workletModule(ctx, sink, 'clock', [], ['x1', 'x2', 'x4', 'd2', 'd4', 'rst'], { discrete: ['bpm', 'run', 'swing'] }),
  ui(body, inst) {
    const lcd = el('div', 'lcd lcd-big');
    const beat = led('#ff5a4f');
    const wrap = el('div', 'ui-row clock-display');
    wrap.append(lcd, beat);
    body.append(wrap);
    let flash = 0;
    if (inst.audio.port) inst.audio.port.onmessage = () => (flash = 1);
    return {
      frame() {
        lcd.textContent = `${Math.round(inst.params.bpm)} BPM`;
        flash *= 0.85;
        setLed(beat, inst.params.run > 0.5 ? flash : 0);
      },
    };
  },
};

/* ------------------------------------------------------------- SEQUENCER */
const STEPS = 8;
const seqParams: ParamSpec[] = [{ id: 'steps', label: 'LENGTH', min: 1, max: STEPS, default: 8, step: 1, size: 'sm' }];
for (let i = 0; i < STEPS; i++) {
  seqParams.push({
    id: `p${i}`,
    label: `${i + 1}`,
    min: -24,
    max: 24,
    default: 0,
    step: 1,
    unit: 'st',
    size: 'sm',
    custom: true,
  });
  seqParams.push({ id: `g${i}`, label: 'GATE', min: 0, max: 1, default: 1, step: 1, control: 'toggle', custom: true });
}

export const SEQ: ModuleSpec = {
  type: 'seq',
  name: 'STEP SEQUENCER',
  category: 'Sequencing',
  description: '8-step pitch/gate sequencer. Knobs set semitones; clock in advances, reset returns to step 1.',
  hp: 28,
  params: seqParams,
  inputs: [
    { id: 'clock', label: 'CLK', kind: 'gate' },
    { id: 'reset', label: 'RST', kind: 'gate' },
    { id: 'transpose', label: 'TRANS', kind: 'cv' },
  ],
  outputs: [
    { id: 'cv', label: 'CV', kind: 'cv' },
    { id: 'gate', label: 'GATE', kind: 'gate' },
    { id: 'eoc', label: 'EOC', kind: 'gate' },
  ],
  create: (ctx, sink) =>
    workletModule(ctx, sink, 'sequencer', ['clock', 'reset', 'transpose'], ['cv', 'gate', 'eoc'], {
      discrete: seqParams.map((p) => p.id),
    }),
  uiPosition: 'after',
  ui(body, inst, h) {
    const grid = el('div', 'seq-grid');
    const leds: HTMLDivElement[] = [];
    for (let i = 0; i < STEPS; i++) {
      const col = el('div', 'seq-col');
      const l = led('#ff5fa2');
      leds.push(l);
      col.append(l, h.knob(`p${i}`, 'sm'), h.toggle(`g${i}`));
      grid.append(col);
    }
    body.append(grid);
    let current = -1;
    if (inst.audio.port) {
      inst.audio.port.onmessage = (e: MessageEvent) => {
        if (e.data && typeof e.data.step === 'number') current = e.data.step;
      };
    }
    return {
      frame() {
        const len = Math.round(inst.params.steps);
        leds.forEach((l, i) => {
          setLed(l, i === current ? 1 : 0);
          l.parentElement!.classList.toggle('inactive', i >= len);
        });
      },
    };
  },
};

/* ------------------------------------------------------------- QUANTIZER */
export const QUANT: ModuleSpec = {
  type: 'quant',
  name: 'QUANTIZER',
  category: 'Sequencing',
  description: 'Snaps incoming pitch CV to the nearest note of a scale. TRIG fires whenever the note changes.',
  hp: 10,
  params: [
    {
      id: 'scale',
      label: 'SCALE',
      min: 0,
      max: 7,
      default: 1,
      step: 1,
      control: 'switch',
      options: ['CHROM', 'MAJOR', 'MINOR', 'DORIAN', 'PENT+', 'PENT-', 'BLUES', 'WHOLE'],
    },
    {
      id: 'root',
      label: 'ROOT',
      min: 0,
      max: 11,
      default: 0,
      step: 1,
      control: 'switch',
      options: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    },
  ],
  inputs: [{ id: 'in', label: 'IN', kind: 'cv' }],
  outputs: [
    { id: 'out', label: 'OUT', kind: 'cv' },
    { id: 'trig', label: 'TRIG', kind: 'gate' },
  ],
  create: (ctx, sink) =>
    workletModule(ctx, sink, 'quantizer', ['in'], ['out', 'trig'], { discrete: ['scale', 'root'] }),
};

/* -------------------------------------------------------------- KEYBOARD */
export interface KeysApi {
  noteOn(note: number, velocity?: number): void;
  noteOff(note: number): void;
  allOff(): void;
  active(): number[];
}

interface KeyboardTarget {
  api: KeysApi;
  shiftOctave(delta: number): void;
}

/** All mounted keyboard modules receive computer-keyboard and MIDI notes. */
export const keyboardTargets = new Set<KeyboardTarget>();

const KEY_MAP: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  z: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ';': 16,
};
// 'z' is the German-layout position of 'y'; octave shift uses '-' / '=' and ',' / '.'
let keyboardInstalled = false;
function installComputerKeyboard(): void {
  if (keyboardInstalled) return;
  keyboardInstalled = true;
  const held = new Map<string, number>();
  const isTyping = (t: EventTarget | null) =>
    t instanceof HTMLElement &&
    (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === ',' || k === '-') return keyboardTargets.forEach((t) => t.shiftOctave(-1));
    if (k === '.' || k === '=') return keyboardTargets.forEach((t) => t.shiftOctave(1));
    const off = KEY_MAP[k];
    if (off === undefined || held.has(k)) return;
    const note = 60 + off;
    held.set(k, note);
    keyboardTargets.forEach((t) => t.api.noteOn(note, 0.8));
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    const note = held.get(k);
    if (note === undefined) return;
    held.delete(k);
    keyboardTargets.forEach((t) => t.api.noteOff(note));
  });
  window.addEventListener('blur', () => {
    held.clear();
    keyboardTargets.forEach((t) => t.api.allOff());
  });
}

export const KEYS: ModuleSpec = {
  type: 'keys',
  name: 'KEYBOARD',
  category: 'Sequencing',
  description:
    'Monophonic keyboard controller (last-note priority) — play with mouse, computer keys (A–L row) or Web MIDI.',
  hp: 22,
  params: [
    { id: 'octave', label: 'OCT', min: -3, max: 3, default: 0, step: 1, size: 'sm' },
    { id: 'glide', label: 'GLIDE', min: 0, max: 1, default: 0, unit: 's', size: 'sm' },
  ],
  inputs: [],
  outputs: [
    { id: 'cv', label: 'V/OCT', kind: 'cv' },
    { id: 'gate', label: 'GATE', kind: 'gate' },
    { id: 'vel', label: 'VEL', kind: 'cv' },
  ],
  uiPosition: 'after',
  create(ctx) {
    const cv = ctx.createConstantSource();
    const gate = ctx.createConstantSource();
    const vel = ctx.createConstantSource();
    cv.offset.value = 0;
    gate.offset.value = 0;
    vel.offset.value = 0;
    cv.start();
    gate.start();
    vel.start();
    let octave = 0;
    let glide = 0;
    const stack: number[] = [];

    const setPitch = (note: number) => {
      const t = ctx.currentTime;
      const v = (note - 60) / 12 + octave;
      cv.offset.cancelScheduledValues(t);
      if (glide > 0.001) {
        cv.offset.setValueAtTime(cv.offset.value, t);
        cv.offset.setTargetAtTime(v, t, glide / 3);
      } else cv.offset.setValueAtTime(v, t);
    };

    const api: KeysApi = {
      noteOn(note, velocity = 0.8) {
        const t = ctx.currentTime;
        const i = stack.indexOf(note);
        if (i >= 0) stack.splice(i, 1);
        stack.push(note);
        setPitch(note);
        vel.offset.setValueAtTime(velocity * 10, t);
        gate.offset.cancelScheduledValues(t);
        // brief low pulse so envelopes retrigger on every key press
        gate.offset.setValueAtTime(0, t);
        gate.offset.setValueAtTime(10, t + 0.003);
      },
      noteOff(note) {
        const i = stack.indexOf(note);
        if (i >= 0) stack.splice(i, 1);
        if (stack.length) setPitch(stack[stack.length - 1]);
        else {
          const t = ctx.currentTime;
          gate.offset.cancelScheduledValues(t);
          gate.offset.setValueAtTime(0, t + 0.004);
        }
      },
      allOff() {
        stack.length = 0;
        const t = ctx.currentTime;
        gate.offset.cancelScheduledValues(t);
        gate.offset.setValueAtTime(0, t);
      },
      active: () => [...stack],
    };

    return {
      inputs: {},
      outputs: { cv: { node: cv }, gate: { node: gate }, vel: { node: vel } },
      api,
      setParam(id, v) {
        if (id === 'octave') {
          octave = v;
          if (stack.length) setPitch(stack[stack.length - 1]);
        } else if (id === 'glide') glide = v;
      },
      dispose() {
        cv.stop();
        gate.stop();
        vel.stop();
        disconnectAll(cv, gate, vel);
      },
    };
  },
  ui(body, inst, h) {
    installComputerKeyboard();
    const api = inst.audio.api as KeysApi;
    const kb = el('div', 'mini-keys');
    const keyEls = new Map<number, HTMLElement>();
    const whitePattern = [0, 2, 4, 5, 7, 9, 11];
    const start = 48; // C3 .. C5
    let whiteIdx = 0;
    for (let n = start; n <= start + 24; n++) {
      const pc = n % 12;
      const isWhite = whitePattern.includes(pc);
      const k = el('div', isWhite ? 'key white' : 'key black');
      if (isWhite) {
        k.style.left = `${whiteIdx * (100 / 15)}%`;
        whiteIdx++;
      } else {
        k.style.left = `${whiteIdx * (100 / 15) - 100 / 15 / 3}%`;
      }
      k.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        k.setPointerCapture(e.pointerId);
        api.noteOn(n, 0.9);
      });
      const up = () => api.noteOff(n);
      k.addEventListener('pointerup', up);
      k.addEventListener('pointercancel', up);
      keyEls.set(n, k);
      kb.append(k);
    }
    const hint = el('div', 'hint', 'KEYS: A W S E D F T G Y H U J K · OCT: , .');
    body.append(kb, hint);

    const target: KeyboardTarget = {
      api,
      shiftOctave: (d) => h.setParam('octave', Math.max(-3, Math.min(3, inst.params.octave + d))),
    };
    keyboardTargets.add(target);
    return {
      frame() {
        const act = new Set(api.active());
        keyEls.forEach((k, n) => k.classList.toggle('down', act.has(n)));
      },
      dispose() {
        keyboardTargets.delete(target);
      },
    };
  },
};
