import '../fonts';
import '../styles.css';
import './acid.css';

import type { ParamSpec } from '../core/types';
import { type Control, createKnob, createSwitch, createToggle, formatValue, installKnobDefs } from '../ui/controls';
import { installTooltips, setTip } from '../ui/tooltip';
import { NOTE_NAMES, type Pattern, STEPS, emptyPattern, factoryPatterns, randomPattern } from './patterns';

const STORE_KEY = 'voltrack.acid.v1';
const BANK = 'ABCDEFGH';
const DELAY_SYNC = [0.25, 0.5, 0.75, 1, 1.5];

/* ------------------------------------------------------------ params */
const SYNTH: ParamSpec[] = [
  { id: 'wave', label: 'WAVE', min: 0, max: 1, default: 0, step: 1, control: 'switch', options: ['SAW', 'SQUARE'] },
  { id: 'tune', label: 'TUNE', min: -12, max: 12, default: 0, unit: 'st' },
  { id: 'cutoff', label: 'CUTOFF', min: 40, max: 6000, default: 420, curve: 'exp', unit: 'Hz', size: 'lg' },
  { id: 'res', label: 'RESO', min: 0, max: 1, default: 0.72, size: 'lg' },
  { id: 'envmod', label: 'ENV MOD', min: 0, max: 1, default: 0.55, size: 'lg' },
  { id: 'decay', label: 'DECAY', min: 0.08, max: 3, default: 0.5, curve: 'exp', unit: 's', size: 'lg' },
  { id: 'accent', label: 'ACCENT', min: 0, max: 1, default: 0.65, size: 'lg' },
];
const OUT: ParamSpec[] = [{ id: 'volume', label: 'VOLUME', min: 0, max: 1, default: 0.7, size: 'lg' }];

const DIST_TYPES = ['OVERDRIVE', 'TUBE', 'FUZZ', 'HARD CLIP', 'FOLDBACK', 'RECTIFY', 'BITCRUSH'];
const MODFX_TYPES = ['CHORUS', 'FLANGER', 'PHASER'];

/** Post-effect chain, in signal order. Each group has an ON checkbox. */
const FX_GROUPS: { title: string; params: ParamSpec[] }[] = [
  {
    title: 'AMP ENV',
    params: [
      {
        id: 'ampMode',
        label: 'MODE',
        min: 0,
        max: 1,
        default: 0,
        step: 1,
        control: 'switch',
        options: ['CLASSIC', 'ADSR'],
      },
      { id: 'ampA', label: 'ATTACK', min: 0.001, max: 3, default: 0.003, curve: 'exp', unit: 's', size: 'sm' },
      { id: 'ampD', label: 'DECAY', min: 0.01, max: 4, default: 0.3, curve: 'exp', unit: 's', size: 'sm' },
      { id: 'ampS', label: 'SUSTAIN', min: 0, max: 1, default: 0.7, size: 'sm' },
      { id: 'ampR', label: 'RELEASE', min: 0.005, max: 6, default: 0.08, curve: 'exp', unit: 's', size: 'sm' },
    ],
  },
  {
    title: 'DISTORTION',
    params: [
      { id: 'distOn', label: 'ON', min: 0, max: 1, default: 1, step: 1, control: 'toggle' },
      { id: 'distType', label: 'TYPE', min: 0, max: 6, default: 0, step: 1, control: 'switch', options: DIST_TYPES },
      { id: 'distDrive', label: 'DRIVE', min: 1, max: 60, default: 2.5, curve: 'exp', size: 'sm' },
      { id: 'distTone', label: 'TONE', min: 200, max: 18000, default: 9000, curve: 'exp', unit: 'Hz', size: 'sm' },
      { id: 'distMix', label: 'MIX', min: 0, max: 1, default: 1, size: 'sm' },
    ],
  },
  {
    title: 'MOD FX',
    params: [
      { id: 'modOn', label: 'ON', min: 0, max: 1, default: 0, step: 1, control: 'toggle' },
      { id: 'modType', label: 'TYPE', min: 0, max: 2, default: 0, step: 1, control: 'switch', options: MODFX_TYPES },
      { id: 'modRate', label: 'RATE', min: 0.02, max: 10, default: 0.4, curve: 'exp', unit: 'Hz', size: 'sm' },
      { id: 'modDepth', label: 'DEPTH', min: 0, max: 1, default: 0.6, size: 'sm' },
      { id: 'modFb', label: 'FDBK', min: 0, max: 0.92, default: 0.4, size: 'sm' },
      { id: 'modMix', label: 'MIX', min: 0, max: 1, default: 0.5, size: 'sm' },
    ],
  },
  {
    title: 'DELAY',
    params: [
      { id: 'dOn', label: 'ON', min: 0, max: 1, default: 1, step: 1, control: 'toggle' },
      {
        id: 'dsync',
        label: 'TIME',
        min: 0,
        max: 4,
        default: 2,
        step: 1,
        control: 'switch',
        options: ['1/16', '1/8', '3/16', '1/4', '3/8'],
      },
      { id: 'dfb', label: 'FDBK', min: 0, max: 0.9, default: 0.4, size: 'sm' },
      { id: 'dtone', label: 'TONE', min: 400, max: 12000, default: 2600, curve: 'exp', unit: 'Hz', size: 'sm' },
      { id: 'dmix', label: 'MIX', min: 0, max: 1, default: 0.22, size: 'sm' },
    ],
  },
  {
    title: 'REVERB',
    params: [
      { id: 'rOn', label: 'ON', min: 0, max: 1, default: 0, step: 1, control: 'toggle' },
      { id: 'rSize', label: 'SIZE', min: 0.3, max: 10, default: 2.2, curve: 'exp', unit: 's', size: 'sm' },
      { id: 'rDamp', label: 'DAMP', min: 800, max: 16000, default: 6000, curve: 'exp', unit: 'Hz', size: 'sm' },
      { id: 'rMix', label: 'MIX', min: 0, max: 1, default: 0.25, size: 'sm' },
    ],
  },
];
const FX = FX_GROUPS.flatMap((g) => g.params);
const SEQ: ParamSpec[] = [
  { id: 'tempo', label: 'TEMPO', min: 40, max: 240, default: 126, step: 1, unit: '', size: 'lg' },
  { id: 'swing', label: 'SWING', min: 0, max: 0.4, default: 0.08 },
  { id: 'transpose', label: 'TRANSP', min: -12, max: 12, default: 0, step: 1, unit: 'st' },
  { id: 'length', label: 'LENGTH', min: 1, max: 16, default: 16, step: 1 },
];
const ALL = [...SYNTH, ...OUT, ...FX, ...SEQ];

const TIPS: Record<string, string> = {
  wave: 'Oscillator waveform: bright sawtooth or hollow square',
  tune: 'Fine tuning of the oscillator in semitones',
  cutoff: 'Base cutoff of the resonant 4-pole low-pass filter',
  res: 'Filter resonance — high settings give the classic squelch',
  envmod: 'How far the filter envelope sweeps the cutoff on each note',
  decay: 'Filter envelope decay time (accented notes always use a short decay)',
  accent: 'Strength of accented steps: louder, brighter, with a sweep that builds on consecutive accents',
  ampMode: 'CLASSIC = fixed gate envelope like the original style; ADSR = use the four knobs below',
  ampA: 'ADSR attack time (ADSR mode only)',
  ampD: 'ADSR decay time (ADSR mode only)',
  ampS: 'ADSR sustain level (ADSR mode only)',
  ampR: 'ADSR release time (ADSR mode only)',
  distOn: 'Switch the distortion stage on or off',
  distType:
    'OVERDRIVE smooth · TUBE warm & asymmetric · FUZZ squared-off · HARD CLIP digital · FOLDBACK wavefolder · RECTIFY octave-up grit · BITCRUSH lo-fi',
  distDrive: 'Amount of distortion (bit depth / sample rate for BITCRUSH)',
  distTone: 'Low-pass tone control after the distortion',
  distMix: 'Blend between the clean and distorted signal',
  modOn: 'Switch the modulation effect on or off',
  modType: 'CHORUS widens · FLANGER jet sweep · PHASER swirling notches',
  modRate: 'LFO speed of the modulation',
  modDepth: 'How far the modulation sweeps',
  modFb: 'Feedback for FLANGER and PHASER (more resonant)',
  modMix: 'Wet level of the modulation effect',
  dOn: 'Switch the delay on or off',
  dsync: 'Tempo-synced delay time',
  dfb: 'Delay feedback (repeats)',
  dtone: 'Darkens each repeat',
  dmix: 'Delay wet level',
  rOn: 'Switch the reverb on or off',
  rSize: 'Reverb decay time',
  rDamp: 'High-frequency damping of the reverb tail',
  rMix: 'Reverb wet level',
  volume: 'Master output level',
  tempo: 'Sequencer tempo in BPM',
  swing: 'Delays every second 16th note for a shuffled groove',
  transpose: 'Transpose the whole pattern in semitones',
  length: 'Number of steps the current pattern plays',
};

interface State {
  params: Record<string, number>;
  patterns: Pattern[];
  current: number;
}

function loadState(): State {
  const defaults: State = {
    params: Object.fromEntries(ALL.map((p) => [p.id, p.default])),
    patterns: factoryPatterns(),
    current: 0,
  };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaults;
    const s = JSON.parse(raw) as State;
    if (!Array.isArray(s.patterns) || s.patterns.length !== 8) return defaults;
    return { params: { ...defaults.params, ...s.params }, patterns: s.patterns, current: s.current ?? 0 };
  } catch {
    return defaults;
  }
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

function shell(): void {
  document.querySelector('#acid-app')!.innerHTML = `
    <header class="topbar acid-top">
      <a class="tb-btn back-btn" href="./" title="Machine select\nBack to the start page">◄ MACHINES</a>
      <div class="brand">
        <span class="logo">ACIDLINE</span>
        <span class="tagline">BL-1 bassline synthesizer</span>
      </div>
      <div class="tb-group">
        <button class="tb-btn play-btn" id="play" title="Play / Stop\nShortcut: Space">▶ PLAY</button>
        <span class="lcd tb-lcd" id="bpm-lcd" title="Tempo\nChange it with the TEMPO knob">126 BPM</span>
      </div>
      <div class="tb-group bank" id="bank" title="Pattern bank\nClick a slot to edit and play it — dotted slots contain notes"></div>
      <div class="tb-group tb-right">
        <span class="lcd tb-lcd" id="midi-status" title="Web MIDI status\nConnected keyboards play the synth (velocity > 100 = accent)">MIDI: off</span>
        <button class="power-btn" id="btn-power" title="Power\nStart / suspend the audio engine"><span class="power-led"></span>POWER</button>
      </div>
    </header>
    <main class="acid-main">
      <section class="unit">
        <div class="unit-cheek left"></div>
        <div class="unit-body">
          <div class="unit-row">
            <div class="bank-group synth-bank">
              <div class="group-label">VOICE</div>
              <div class="knobs" id="synth-knobs"></div>
            </div>
            <div class="screen-group">
              <div class="crt acid-crt"><canvas id="scope"></canvas></div>
              <div class="lcd status-lcd" id="status">PAT A · STEP --/16</div>
            </div>
            <div class="bank-group out-bank">
              <div class="group-label">OUTPUT</div>
              <div class="knobs" id="out-knobs"></div>
            </div>
          </div>
          <div class="fx-row" id="fx-row" title="Post-effects chain\nSignal flows left to right: amp envelope → distortion → mod FX → delay → reverb"></div>
          <div class="seq-panel">
            <div class="seq-head">
              <div class="group-label">SEQUENCER</div>
              <div class="knobs" id="seq-knobs"></div>
              <div class="seq-tools">
                <button class="tb-btn" id="shift-l" title="Shift left\nRotate the pattern one step earlier">◄</button>
                <button class="tb-btn" id="shift-r" title="Shift right\nRotate the pattern one step later">►</button>
                <button class="tb-btn" id="rand" title="Random\nGenerate a new minor-pentatonic acid line">RANDOM</button>
                <button class="tb-btn" id="clear" title="Clear\nTurn every step into a rest">CLEAR</button>
                <button class="tb-btn" id="copy" title="Copy\nCopy this pattern">COPY</button>
                <button class="tb-btn" id="paste" title="Paste\nPaste the copied pattern here">PASTE</button>
              </div>
            </div>
            <div class="roll" id="roll"></div>
          </div>
        </div>
        <div class="unit-cheek right"></div>
      </section>
      <div class="acid-help">
        <span><b>CLICK</b> a cell to set a note, click again for a rest · drag to paint</span>
        <span><b>OCT / ACC / SLIDE</b> rows: click to toggle per step</span>
        <span><b>KEYS</b> A W S E D F T G Y H U J K play live · Shift = accent · , . octave · Space = play</span>
      </div>
    </main>
    <div class="power-overlay" id="power-overlay">
      <div class="power-card" data-title="ACIDLINE BL-1 - Audio Engine">
        <div class="logo logo-xl">ACIDLINE</div>
        <div class="power-sub">BL-1 bassline synthesizer</div>
        <button class="power-big" id="btn-power-big"><span class="power-led"></span>POWER ON</button>
        <div class="power-hint" id="power-hint">Click to start the audio engine</div>
      </div>
    </div>
    <div class="toast" id="toast"></div>
  `;
}

let toastTimer = 0;
function toast(msg: string): void {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 1800);
}

async function main(): Promise<void> {
  shell();
  installKnobDefs();
  installTooltips(1000);
  const state = loadState();

  /* ---------------------------------------------------------- audio */
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  if (!ctx.audioWorklet) {
    $('#power-hint').textContent = 'AudioWorklet is unavailable. Open the app via http://localhost or HTTPS.';
    return;
  }
  await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/acid-processor.js`);
  await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/acid-fx.js`);
  const voice = new AudioWorkletNode(ctx, 'acid-voice', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  // Post-FX chain: voice → distortion → mod FX (stereo) → delay → reverb → master
  const dist = new AudioWorkletNode(ctx, 'acid-dist', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: 'explicit',
  });
  const modfx = new AudioWorkletNode(ctx, 'acid-modfx', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 1,
    channelCountMode: 'explicit',
  });
  const FX_NODE_PARAMS: Record<string, [AudioWorkletNode, string]> = {
    distOn: [dist, 'on'],
    distType: [dist, 'type'],
    distDrive: [dist, 'drive'],
    distTone: [dist, 'tone'],
    distMix: [dist, 'mix'],
    modOn: [modfx, 'on'],
    modType: [modfx, 'type'],
    modRate: [modfx, 'rate'],
    modDepth: [modfx, 'depth'],
    modFb: [modfx, 'feedback'],
    modMix: [modfx, 'mix'],
  };
  voice.parameters.get('drive')!.value = 0; // replaced by the distortion stage

  const preDelay = ctx.createGain();
  const delaySend = ctx.createGain();
  const delay = ctx.createDelay(4);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2600;
  const fb = ctx.createGain();
  const wet = ctx.createGain();
  const postDelay = ctx.createGain();
  const revDry = ctx.createGain();
  const revDamp = ctx.createBiquadFilter();
  revDamp.type = 'lowpass';
  const conv = ctx.createConvolver();
  const revWet = ctx.createGain();
  const master = ctx.createGain();

  voice.connect(dist).connect(modfx).connect(preDelay);
  preDelay.connect(postDelay);
  preDelay.connect(delaySend).connect(delay);
  delay.connect(tone).connect(fb).connect(delay);
  tone.connect(wet).connect(postDelay);
  postDelay.connect(revDry).connect(master);
  postDelay.connect(revDamp).connect(conv).connect(revWet).connect(master);

  const makeImpulse = (seconds: number) => {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  };
  let revTimer = 0;
  let lastSize = -1;
  const applyReverbSize = (v: number) => {
    if (Math.abs(v - lastSize) < 1e-3) return;
    lastSize = v;
    window.clearTimeout(revTimer);
    revTimer = window.setTimeout(() => (conv.buffer = makeImpulse(v)), 120);
  };
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  master.connect(limiter).connect(analyser).connect(ctx.destination);

  const smooth = (p: AudioParam, v: number, tc = 0.01) => {
    p.cancelScheduledValues(ctx.currentTime);
    p.setTargetAtTime(v, ctx.currentTime, tc);
  };
  const applyDelayTime = () => {
    const beats = DELAY_SYNC[Math.round(state.params.dsync)] ?? 0.75;
    smooth(delay.delayTime, (60 / state.params.tempo) * beats, 0.05);
  };
  const applyDelayMix = () => {
    const on = state.params.dOn > 0.5;
    smooth(delaySend.gain, on ? 1 : 0, 0.02);
    smooth(wet.gain, on ? state.params.dmix : 0, 0.02);
  };
  const applyReverbMix = () => {
    const m = state.params.rOn > 0.5 ? state.params.rMix : 0;
    smooth(revDry.gain, Math.cos((m * Math.PI) / 2), 0.02);
    smooth(revWet.gain, Math.sin((m * Math.PI) / 2), 0.02);
  };
  const apply = (id: string, v: number) => {
    const ap = voice.parameters.get(id);
    if (ap && id !== 'drive') smooth(ap, v, id === 'tempo' || id === 'wave' || id === 'ampMode' ? 0.001 : 0.01);
    const fx = FX_NODE_PARAMS[id];
    if (fx) {
      const discrete = id.endsWith('On') || id.endsWith('Type');
      smooth(fx[0].parameters.get(fx[1])!, v, discrete ? 0.001 : 0.01);
    }
    if (id === 'dfb') smooth(fb.gain, v);
    if (id === 'dtone') smooth(tone.frequency, v);
    if (id === 'dOn' || id === 'dmix') applyDelayMix();
    if (id === 'rOn' || id === 'rMix') applyReverbMix();
    if (id === 'rSize') applyReverbSize(v);
    if (id === 'rDamp') smooth(revDamp.frequency, v);
    if (id === 'volume') smooth(master.gain, v * v);
    if (FX_GROUPS.some((g) => g.params.some((p) => p.id === id))) syncGroupStates();
    if (id === 'tempo' || id === 'dsync') applyDelayTime();
    if (id === 'length') {
      currentPattern().length = v;
      sendPattern();
    }
  };

  const currentPattern = () => state.patterns[state.current];
  const sendPattern = () => voice.port.postMessage({ type: 'pattern', pattern: currentPattern() });

  let saveTimer = 0;
  const save = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => localStorage.setItem(STORE_KEY, JSON.stringify(state)), 300);
  };

  /* --------------------------------------------------------- knobs */
  const controls = new Map<string, Control>();
  const mountKnobs = (host: HTMLElement, specs: ParamSpec[]) => {
    for (const p of specs) {
      const onChange = (v: number) => {
        state.params[p.id] = v;
        apply(p.id, v);
        save();
      };
      const c =
        p.control === 'switch'
          ? createSwitch(p, state.params[p.id], onChange)
          : p.control === 'toggle'
            ? createToggle(p, state.params[p.id], onChange)
            : createKnob(p, state.params[p.id], onChange);
      // Machine-specific tooltip: current value, what it does, how to use it.
      const base = c.el;
      const how =
        p.control === 'switch'
          ? 'Click = next · Right-click = previous'
          : p.control === 'toggle'
            ? 'Click to toggle'
            : 'Drag ↕ · Shift = fine · Wheel · Double-click = reset';
      const value = () =>
        p.control === 'toggle' ? (state.params[p.id] > 0.5 ? 'ON' : 'OFF') : formatValue(p, state.params[p.id]);
      setTip(base, () => `${p.label}  ·  ${value()}\n${TIPS[p.id] ?? ''}\n${how}`);
      controls.set(p.id, c);
      host.append(base);
    }
  };
  mountKnobs($('#synth-knobs'), SYNTH);
  mountKnobs($('#out-knobs'), OUT);
  mountKnobs($('#seq-knobs'), SEQ);

  // Post-FX group boxes; the ON checkbox sits in the group's caption.
  const fxRow = $('#fx-row');
  const groupEls: { el: HTMLElement; onId?: string; adsr?: boolean }[] = [];
  for (const g of FX_GROUPS) {
    const box = document.createElement('div');
    box.className = 'bank-group fx-group';
    const cap = document.createElement('div');
    cap.className = 'group-label';
    const knobs = document.createElement('div');
    knobs.className = 'knobs';
    const onParam = g.params.find((p) => p.control === 'toggle');
    if (onParam) mountKnobs(cap, [onParam]);
    cap.append(document.createTextNode(g.title));
    mountKnobs(
      knobs,
      g.params.filter((p) => p !== onParam),
    );
    box.append(cap, knobs);
    fxRow.append(box);
    groupEls.push({ el: box, onId: onParam?.id, adsr: g.title === 'AMP ENV' });
  }
  function syncGroupStates(): void {
    for (const g of groupEls) {
      if (g.onId) g.el.classList.toggle('off', state.params[g.onId] < 0.5);
      if (g.adsr) g.el.classList.toggle('classic', state.params.ampMode < 0.5);
    }
  }
  for (const p of ALL) apply(p.id, state.params[p.id]);

  /* ------------------------------------------------------ piano roll */
  const roll = $('#roll');
  const NOTE_ROWS = 13;
  const noteCells: HTMLElement[][] = [];
  const octCells: HTMLElement[] = [];
  const accCells: HTMLElement[] = [];
  const slideCells: HTMLElement[] = [];
  const stepHeads: HTMLElement[] = [];
  let playStep = -1;

  const label = (text: string, cls = '') => {
    const l = document.createElement('div');
    l.className = `roll-label ${cls}`;
    l.textContent = text;
    return l;
  };

  // header row with step numbers
  roll.append(label(''));
  for (let s = 0; s < STEPS; s++) {
    const h = document.createElement('div');
    h.className = 'roll-step-head';
    h.textContent = String(s + 1);
    setTip(h, `Step ${s + 1}\nThe light follows the playhead`);
    stepHeads.push(h);
    roll.append(h);
  }

  let painting: null | ((s: number, row?: number) => void) = null;
  window.addEventListener('pointerup', () => (painting = null));

  for (let r = NOTE_ROWS - 1; r >= 0; r--) {
    const black = [1, 3, 6, 8, 10].includes(r);
    roll.append(label(NOTE_NAMES[r], black ? 'black' : ''));
    const row: HTMLElement[] = [];
    for (let s = 0; s < STEPS; s++) {
      const c = document.createElement('div');
      c.className = `cell note-cell${black ? ' black' : ''}${s % 4 === 0 ? ' beat' : ''}`;
      const setNote = (on: boolean) => {
        const st = currentPattern().steps[s];
        if (on) {
          st.note = r;
          st.gate = 1;
        } else if (st.note === r) st.gate = 0;
      };
      c.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const st = currentPattern().steps[s];
        const turnOn = !(st.gate && st.note === r);
        painting = (ps, pr) => {
          if (pr === undefined) return;
          const t = currentPattern().steps[ps];
          if (turnOn) {
            t.note = pr;
            t.gate = 1;
          } else if (t.note === pr) t.gate = 0;
        };
        setNote(turnOn);
        changed();
        if (turnOn && !running) previewNote(s);
      });
      c.addEventListener('pointerenter', () => {
        if (!painting) return;
        painting(s, r);
        changed();
      });
      row[s] = c;
      roll.append(c);
    }
    noteCells[r] = row;
  }

  const flagRow = (name: string, cells: HTMLElement[], key: 'acc' | 'slide' | 'oct', tip: string) => {
    roll.append(label(name, 'flag'));
    for (let s = 0; s < STEPS; s++) {
      const c = document.createElement('div');
      c.className = `cell flag-cell flag-${key}${s % 4 === 0 ? ' beat' : ''}`;
      setTip(c, () => {
        const st = currentPattern().steps[s];
        const v = key === 'oct' ? (st.oct > 0 ? 'UP' : st.oct < 0 ? 'DOWN' : 'NORMAL') : st[key] ? 'ON' : 'OFF';
        return `${name} · step ${s + 1}  ·  ${v}\n${tip}`;
      });
      c.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const st = currentPattern().steps[s];
        if (key === 'oct') {
          st.oct = st.oct === 0 ? 1 : st.oct === 1 ? -1 : 0;
          changed();
          return;
        }
        const v = st[key] ? 0 : 1;
        st[key] = v;
        painting = (ps) => (currentPattern().steps[ps][key] = v);
        changed();
      });
      c.addEventListener('pointerenter', () => {
        if (!painting || key === 'oct') return;
        painting(s);
        changed();
      });
      cells.push(c);
      roll.append(c);
    }
  };
  flagRow('OCT', octCells, 'oct', 'Click to cycle: normal → up an octave → down an octave');
  flagRow('ACC', accCells, 'acc', 'Accent: louder, brighter note with a short filter decay');
  flagRow('SLIDE', slideCells, 'slide', 'Slide: hold this note and glide into the next one without retriggering');

  const renderRoll = () => {
    const p = currentPattern();
    for (let s = 0; s < STEPS; s++) {
      const st = p.steps[s];
      const inactive = s >= p.length;
      for (let r = 0; r < NOTE_ROWS; r++) {
        const c = noteCells[r][s];
        c.classList.toggle('on', !!st.gate && st.note === r);
        c.classList.toggle('acc', !!st.gate && st.note === r && !!st.acc);
        c.classList.toggle('inactive', inactive);
        c.classList.toggle('playing', s === playStep);
      }
      octCells[s].textContent = st.oct > 0 ? '▲' : st.oct < 0 ? '▼' : '·';
      octCells[s].classList.toggle('on', st.oct !== 0);
      accCells[s].classList.toggle('on', !!st.acc);
      slideCells[s].classList.toggle('on', !!st.slide);
      slideCells[s].classList.toggle('linked', !!st.slide && !!st.gate && !!p.steps[(s + 1) % p.length]?.gate);
      for (const c of [octCells[s], accCells[s], slideCells[s]]) {
        c.classList.toggle('inactive', inactive);
        c.classList.toggle('playing', s === playStep);
      }
      stepHeads[s].classList.toggle('playing', s === playStep);
      stepHeads[s].classList.toggle('inactive', inactive);
    }
  };

  /* -------------------------------------------------------- pattern bank */
  const bank = $('#bank');
  const bankBtns: HTMLButtonElement[] = [];
  for (let i = 0; i < 8; i++) {
    const b = document.createElement('button');
    b.className = 'tb-btn bank-btn';
    b.textContent = BANK[i];
    setTip(
      b,
      () =>
        `Pattern ${BANK[i]}\n${state.patterns[i].steps.some((s) => s.gate) ? 'Contains notes' : 'Empty'} · ${state.patterns[i].length} steps\nClick to select`,
    );
    b.addEventListener('click', () => {
      state.current = i;
      controls.get('length')?.set(currentPattern().length);
      state.params.length = currentPattern().length;
      sendPattern();
      renderAll();
      save();
    });
    bankBtns.push(b);
    bank.append(b);
  }
  const renderBank = () =>
    bankBtns.forEach((b, i) => {
      b.classList.toggle('active', i === state.current);
      b.classList.toggle(
        'filled',
        state.patterns[i].steps.some((s) => s.gate),
      );
    });

  const renderAll = () => {
    renderRoll();
    renderBank();
  };
  const changed = () => {
    sendPattern();
    renderAll();
    save();
  };

  /* --------------------------------------------------------- tools */
  let clipboard: Pattern | null = null;
  const clone = (p: Pattern): Pattern => JSON.parse(JSON.stringify(p));
  const rotate = (d: number) => {
    const p = currentPattern();
    const len = p.length;
    const head = p.steps.slice(0, len);
    const rot = head.map((_, i) => head[(i - d + len) % len]);
    p.steps.splice(0, len, ...rot);
    changed();
  };
  $('#shift-l').addEventListener('click', () => rotate(-1));
  $('#shift-r').addEventListener('click', () => rotate(1));
  $('#rand').addEventListener('click', () => {
    state.patterns[state.current] = randomPattern(currentPattern().length);
    changed();
    toast(`Pattern ${BANK[state.current]} randomised`);
  });
  $('#clear').addEventListener('click', () => {
    const len = currentPattern().length;
    state.patterns[state.current] = emptyPattern();
    currentPattern().length = len;
    changed();
  });
  $('#copy').addEventListener('click', () => {
    clipboard = clone(currentPattern());
    toast(`Pattern ${BANK[state.current]} copied`);
  });
  $('#paste').addEventListener('click', () => {
    if (!clipboard) return toast('Nothing copied yet');
    state.patterns[state.current] = clone(clipboard);
    state.params.length = currentPattern().length;
    controls.get('length')?.set(currentPattern().length);
    changed();
    toast(`Pasted into ${BANK[state.current]}`);
  });

  /* ------------------------------------------------------- transport */
  let running = false;
  const playBtn = $('#play');
  const setRunning = (on: boolean) => {
    running = on;
    const p = voice.parameters.get('run')!;
    p.cancelScheduledValues(ctx.currentTime);
    p.setValueAtTime(on ? 1 : 0, ctx.currentTime);
    playBtn.textContent = on ? '■ STOP' : '▶ PLAY';
    playBtn.classList.toggle('on', on);
    if (!on) {
      playStep = -1;
      renderRoll();
    }
  };
  playBtn.addEventListener('click', async () => {
    if (ctx.state !== 'running') await powerOn();
    setRunning(!running);
  });
  voice.port.onmessage = (e: MessageEvent) => {
    if (e.data?.type === 'step') {
      playStep = e.data.step;
      renderRoll();
    }
  };

  // Audition a step when it is drawn while stopped.
  const previewNote = (s: number) => {
    if (ctx.state !== 'running') return;
    const st = currentPattern().steps[s];
    const note = 36 + st.note + 12 * st.oct + state.params.transpose;
    voice.port.postMessage({ type: 'noteOn', note, acc: st.acc });
    window.setTimeout(() => voice.port.postMessage({ type: 'noteOff', note }), 160);
  };

  /* ------------------------------------------------------ live keys */
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
  let kbOct = 0;
  const held = new Map<string, number>();
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) playBtn.click();
      return;
    }
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === ',' || k === '<') return void ((kbOct = Math.max(-2, kbOct - 1)), toast(`Keyboard octave ${kbOct}`));
    if (k === '.' || k === '>') return void ((kbOct = Math.min(2, kbOct + 1)), toast(`Keyboard octave ${kbOct}`));
    const off = KEY_MAP[k];
    if (off === undefined || held.has(k) || ctx.state !== 'running') return;
    const note = 36 + 12 * kbOct + off + state.params.transpose;
    held.set(k, note);
    voice.port.postMessage({ type: 'noteOn', note, acc: e.shiftKey });
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    const note = held.get(k);
    if (note === undefined) return;
    held.delete(k);
    voice.port.postMessage({ type: 'noteOff', note });
  });
  window.addEventListener('blur', () => {
    held.clear();
    voice.port.postMessage({ type: 'allOff' });
  });

  const initMidi = async () => {
    const status = $('#midi-status');
    if (!('requestMIDIAccess' in navigator)) return void (status.textContent = 'MIDI: n/a');
    try {
      const access = await navigator.requestMIDIAccess();
      const handler = (e: MIDIMessageEvent) => {
        const d = e.data;
        if (!d || d.length < 3) return;
        const cmd = d[0] & 0xf0;
        if (cmd === 0x90 && d[2] > 0) voice.port.postMessage({ type: 'noteOn', note: d[1], acc: d[2] > 100 });
        else if (cmd === 0x80 || cmd === 0x90) voice.port.postMessage({ type: 'noteOff', note: d[1] });
      };
      const attach = () => {
        let n = 0;
        access.inputs.forEach((i) => {
          i.onmidimessage = handler;
          n++;
        });
        status.textContent = n ? `MIDI: ${n} in` : 'MIDI: no device';
      };
      access.onstatechange = attach;
      attach();
    } catch {
      status.textContent = 'MIDI: blocked';
    }
  };

  /* --------------------------------------------------------- scope */
  const canvas = $<HTMLCanvasElement>('#scope');
  const W = 300;
  const H = 120;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  const buf = new Float32Array(analyser.fftSize);
  const status = $('#status');
  const bpmLcd = $('#bpm-lcd');
  const frame = () => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#003300';
    g.lineWidth = 1;
    for (let x = 0; x <= 10; x++) {
      g.beginPath();
      g.moveTo((x * W) / 10, 0);
      g.lineTo((x * W) / 10, H);
      g.stroke();
    }
    for (let y = 0; y <= 4; y++) {
      g.beginPath();
      g.moveTo(0, (y * H) / 4);
      g.lineTo(W, (y * H) / 4);
      g.stroke();
    }
    analyser.getFloatTimeDomainData(buf);
    const len = 1400;
    let start = 0;
    for (let i = 1; i < buf.length - len; i++) {
      if (buf[i - 1] < 0 && buf[i] >= 0) {
        start = i;
        break;
      }
    }
    g.strokeStyle = '#00ff00';
    g.lineWidth = 1.6;
    g.beginPath();
    for (let i = 0; i < len; i += 2) {
      const x = (i / len) * W;
      const y = H / 2 - buf[start + i] * (H / 2.2);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    const p = currentPattern();
    status.textContent = `PAT ${BANK[state.current]} · STEP ${playStep >= 0 ? String(playStep + 1).padStart(2, '0') : '--'}/${String(p.length).padStart(2, '0')}`;
    bpmLcd.textContent = `${Math.round(state.params.tempo)} BPM`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  /* --------------------------------------------------------- power */
  const overlay = $('#power-overlay');
  const powerBtn = $('#btn-power');
  let midiStarted = false;
  const syncPower = () => {
    const on = ctx.state === 'running';
    powerBtn.classList.toggle('on', on);
    document.body.classList.toggle('powered', on);
  };
  ctx.addEventListener('statechange', syncPower);
  const powerOn = async () => {
    await ctx.resume();
    overlay.classList.add('hidden');
    if (!midiStarted) {
      midiStarted = true;
      initMidi();
    }
    syncPower();
  };
  $('#btn-power-big').addEventListener('click', async () => {
    await powerOn();
    setRunning(true);
  });
  powerBtn.addEventListener('click', async () => {
    if (ctx.state === 'running') {
      setRunning(false);
      await ctx.suspend();
    } else await powerOn();
  });

  state.params.length = currentPattern().length;
  controls.get('length')?.set(currentPattern().length);
  sendPattern();
  renderAll();
  syncPower();
}

main();
