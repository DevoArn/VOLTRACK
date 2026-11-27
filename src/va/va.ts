import '../fonts';
import '../styles.css';
import '../acid/acid.css';
import './va.css';

import type { ParamSpec } from '../core/types';
import { ALL, DEFAULTS, DELAY_SYNC, FX_IDS, ROWS, TIPS } from './params';
import { type Control, createKnob, createSwitch, createToggle, formatValue, installKnobDefs } from '../ui/controls';
import { installTooltips, setTip } from '../ui/tooltip';
import { PROGRAMS } from './presets';

const STORE_KEY = 'voltrack.va.v1';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

interface State {
  params: Record<string, number>;
  program: number;
}

function loadState(): State {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      return { params: { ...DEFAULTS, ...s.params }, program: s.program ?? 0 };
    }
  } catch {
    /* ignore */
  }
  return { params: { ...DEFAULTS, ...PROGRAMS[1].values }, program: 1 };
}

let toastTimer = 0;
function toast(msg: string): void {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2000);
}

function shell(): void {
  document.querySelector('#va-app')!.innerHTML = `
    <header class="topbar acid-top">
      <a class="tb-btn back-btn" href="./" title="Machine select\nBack to the start page">◄ MACHINES</a>
      <div class="brand"><span class="logo">HALCYON</span><span class="tagline">VA-8 virtual analog synthesizer</span></div>
      <div class="tb-group">
        <span class="tb-label">PROGRAM</span>
        <button class="tb-btn tb-icon" id="prog-prev" title="Previous program">◄</button>
        <select class="tb-select" id="program" title="Programs\nFactory sounds — choosing one replaces the current settings"></select>
        <button class="tb-btn tb-icon" id="prog-next" title="Next program">►</button>
        <button class="tb-btn" id="panic" title="Panic\nStop all notes">PANIC</button>
      </div>
      <div class="tb-group tb-right">
        <span class="lcd tb-lcd" id="midi-status" title="Web MIDI status\nConnected keyboards play the synth with velocity">MIDI: off</span>
        <button class="power-btn" id="btn-power" title="Power\nStart / suspend the audio engine"><span class="power-led"></span>POWER</button>
      </div>
    </header>
    <main class="acid-main">
      <section class="unit va-unit">
        <div class="unit-body">
          <div class="va-display-row">
            <div class="lcd va-lcd" id="va-lcd" title="Display\nProgram name, last edited parameter and active voices">
              <div id="lcd-1">HALCYON VA-8</div>
              <div id="lcd-2">READY</div>
            </div>
            <div class="crt acid-crt"><canvas id="scope"></canvas></div>
          </div>
          <div id="va-rows"></div>
          <div class="va-keys" id="va-keys" title="Keyboard\nClick to play · computer keys A–K · , . shift the OCTAVE knob"></div>
        </div>
      </section>
      <div class="acid-help">
        <span><b>KEYS</b> A W S E D F T G Y H U J K play · , . octave</span>
        <span><b>STACK</b> on OSC 1 for wide supersaw-style leads and pads</span>
        <span><b>ARP</b> + HOLD latches chords</span>
      </div>
    </main>
    <div class="power-overlay" id="power-overlay">
      <div class="power-card" data-title="HALCYON VA-8 - Audio Engine">
        <div class="logo logo-xl">HALCYON</div>
        <div class="power-sub">VA-8 virtual analog synthesizer</div>
        <button class="power-big" id="btn-power-big"><span class="power-led"></span>POWER ON</button>
        <div class="power-hint" id="power-hint">Click to start the audio engine</div>
      </div>
    </div>
    <div class="toast" id="toast"></div>`;
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
  await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/va-synth.js`);
  await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/acid-fx.js`);
  const synth = new AudioWorkletNode(ctx, 'va-synth', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  const stereo = { channelCount: 2, channelCountMode: 'explicit' as const };
  const dist = new AudioWorkletNode(ctx, 'acid-dist', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    ...stereo,
  });
  const modfx = new AudioWorkletNode(ctx, 'acid-modfx', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    ...stereo,
  });
  const FX_NODE: Record<string, [AudioWorkletNode, string]> = {
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

  const preDelay = ctx.createGain();
  const delaySend = ctx.createGain();
  const delay = ctx.createDelay(4);
  const dTone = ctx.createBiquadFilter();
  dTone.type = 'lowpass';
  const fb = ctx.createGain();
  const dWet = ctx.createGain();
  const postDelay = ctx.createGain();
  const revDry = ctx.createGain();
  const revDamp = ctx.createBiquadFilter();
  revDamp.type = 'lowpass';
  const conv = ctx.createConvolver();
  const revWet = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;

  synth.connect(dist).connect(modfx).connect(preDelay);
  preDelay.connect(postDelay);
  preDelay.connect(delaySend).connect(delay);
  delay.connect(dTone).connect(fb).connect(delay);
  dTone.connect(dWet).connect(postDelay);
  postDelay.connect(revDry).connect(limiter);
  postDelay.connect(revDamp).connect(conv).connect(revWet).connect(limiter);
  limiter.connect(analyser).connect(ctx.destination);

  const smooth = (p: AudioParam, v: number, tc = 0.01) => {
    p.cancelScheduledValues(ctx.currentTime);
    p.setTargetAtTime(v, ctx.currentTime, tc);
  };
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

  const applyFx = (id: string, v: number) => {
    const P = state.params;
    const node = FX_NODE[id];
    if (node) smooth(node[0].parameters.get(node[1])!, v, id.endsWith('On') || id.endsWith('Type') ? 0.001 : 0.01);
    if (id === 'dOn' || id === 'dmix') {
      smooth(delaySend.gain, P.dOn > 0.5 ? 1 : 0, 0.02);
      smooth(dWet.gain, P.dOn > 0.5 ? P.dmix : 0, 0.02);
    }
    if (id === 'dfb') smooth(fb.gain, v);
    if (id === 'dtone') smooth(dTone.frequency, v);
    if (id === 'dsync' || id === 'tempo')
      smooth(delay.delayTime, (60 / P.tempo) * (DELAY_SYNC[Math.round(P.dsync)] ?? 0.75), 0.05);
    if (id === 'rOn' || id === 'rMix') {
      const m = P.rOn > 0.5 ? P.rMix : 0;
      smooth(revDry.gain, Math.cos((m * Math.PI) / 2), 0.02);
      smooth(revWet.gain, Math.sin((m * Math.PI) / 2), 0.02);
    }
    if (id === 'rDamp') smooth(revDamp.frequency, v);
    if (id === 'rSize' && Math.abs(v - lastSize) > 1e-3) {
      lastSize = v;
      window.clearTimeout(revTimer);
      revTimer = window.setTimeout(() => (conv.buffer = makeImpulse(v)), 120);
    }
  };

  let pending: Record<string, number> = {};
  let flushQueued = false;
  const sendSynth = (id: string, v: number) => {
    pending[id] = v;
    if (flushQueued) return;
    flushQueued = true;
    queueMicrotask(() => {
      synth.port.postMessage({ type: 'params', values: pending });
      pending = {};
      flushQueued = false;
    });
  };

  let saveTimer = 0;
  const save = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => localStorage.setItem(STORE_KEY, JSON.stringify(state)), 300);
  };

  /* ------------------------------------------------------- display */
  const lcd1 = $('#lcd-1');
  const lcd2 = $('#lcd-2');
  let voices = 0;
  const showProgram = () =>
    (lcd1.textContent = `${String(state.program + 1).padStart(2, '0')} ${PROGRAMS[state.program]?.name ?? 'User'}`);

  /* ------------------------------------------------------ controls */
  const controls = new Map<string, Control>();
  const groupEls: { el: HTMLElement; onId?: string }[] = [];
  const setParam = (p: ParamSpec, v: number, quiet = false) => {
    state.params[p.id] = v;
    if (FX_IDS.has(p.id)) applyFx(p.id, v);
    if (!FX_IDS.has(p.id) || p.id === 'tempo') sendSynth(p.id, v);
    if (p.id === 'tempo') applyFx('tempo', v);
    if (!quiet) {
      lcd2.textContent = `${p.label} = ${p.control === 'toggle' ? (v > 0.5 ? 'ON' : 'OFF') : formatValue(p, v)}`;
      syncGroups();
      save();
    }
  };
  const mount = (host: HTMLElement, p: ParamSpec) => {
    const onChange = (v: number) => setParam(p, v);
    const v = state.params[p.id];
    const c =
      p.control === 'switch'
        ? createSwitch(p, v, onChange)
        : p.control === 'toggle'
          ? createToggle(p, v, onChange)
          : createKnob(p, v, onChange);
    const how =
      p.control === 'switch'
        ? 'Click = next · Right-click = previous'
        : p.control === 'toggle'
          ? 'Click to toggle'
          : 'Drag ↕ · Shift = fine · Wheel · Double-click = reset';
    const value = () =>
      p.control === 'toggle' ? (state.params[p.id] > 0.5 ? 'ON' : 'OFF') : formatValue(p, state.params[p.id]);
    setTip(c.el, () => `${p.label}  ·  ${value()}\n${TIPS[p.id] ?? ''}\n${how}`.replace('\n\n', '\n'));
    controls.set(p.id, c);
    host.append(c.el);
  };

  const rowsHost = $('#va-rows');
  ROWS.forEach((row, ri) => {
    const r = document.createElement('div');
    r.className = `va-row va-row-${ri}`;
    for (const g of row) {
      const box = document.createElement('div');
      box.className = 'bank-group fx-group';
      const cap = document.createElement('div');
      cap.className = 'group-label';
      const knobs = document.createElement('div');
      knobs.className = 'knobs';
      const onParam = g.params.find((p) => p.control === 'toggle' && p.label === 'ON');
      if (onParam) mount(cap, onParam);
      cap.append(document.createTextNode(g.title));
      for (const p of g.params) if (p !== onParam) mount(knobs, p);
      box.append(cap, knobs);
      r.append(box);
      groupEls.push({ el: box, onId: onParam?.id });
    }
    rowsHost.append(r);
  });
  function syncGroups(): void {
    for (const g of groupEls) if (g.onId) g.el.classList.toggle('off', state.params[g.onId] < 0.5);
  }

  const applyAll = () => {
    for (const p of ALL) {
      setParam(p, state.params[p.id], true);
      controls.get(p.id)?.set(state.params[p.id]);
    }
    syncGroups();
  };

  /* ------------------------------------------------------ programs */
  const progSel = $<HTMLSelectElement>('#program');
  progSel.innerHTML = PROGRAMS.map(
    (p, i) => `<option value="${i}">${String(i + 1).padStart(2, '0')} ${p.name}</option>`,
  ).join('');
  const loadProgram = (i: number) => {
    const n = (i + PROGRAMS.length) % PROGRAMS.length;
    state.program = n;
    state.params = { ...DEFAULTS, ...PROGRAMS[n].values };
    progSel.value = String(n);
    synth.port.postMessage({ type: 'allOff' });
    applyAll();
    showProgram();
    lcd2.textContent = 'PROGRAM LOADED';
    save();
  };
  progSel.addEventListener('change', () => loadProgram(Number(progSel.value)));
  $('#prog-prev').addEventListener('click', () => loadProgram(state.program - 1));
  $('#prog-next').addEventListener('click', () => loadProgram(state.program + 1));
  $('#panic').addEventListener('click', () => {
    synth.port.postMessage({ type: 'allOff' });
    toast('All notes off');
  });
  progSel.value = String(state.program);
  applyAll();
  showProgram();

  /* ------------------------------------------------------ keyboard */
  const keysHost = $('#va-keys');
  const keyEls = new Map<number, HTMLElement>();
  const down = new Set<number>();
  const FIRST = 36;
  const LAST = 84; // C2 … C6
  const whites = [0, 2, 4, 5, 7, 9, 11];
  const nWhite = Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i).filter((n) =>
    whites.includes(n % 12),
  ).length;
  let wi = 0;
  const noteOn = (n: number, vel = 0.8) => {
    if (ctx.state !== 'running') return;
    down.add(n);
    synth.port.postMessage({ type: 'noteOn', note: n, vel });
    keyEls.get(n)?.classList.add('down');
  };
  const noteOff = (n: number) => {
    down.delete(n);
    synth.port.postMessage({ type: 'noteOff', note: n });
    keyEls.get(n)?.classList.remove('down');
  };
  for (let n = FIRST; n <= LAST; n++) {
    const white = whites.includes(n % 12);
    const k = document.createElement('div');
    k.className = `key ${white ? 'white' : 'black'}`;
    const w = 100 / nWhite;
    k.style.left = `${white ? wi * w : wi * w - w * 0.31}%`;
    k.style.width = `${white ? w : w * 0.62}%`;
    if (white) wi++;
    k.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      k.setPointerCapture(e.pointerId);
      const r = k.getBoundingClientRect();
      noteOn(n, 0.4 + 0.6 * Math.min(1, (e.clientY - r.top) / r.height));
    });
    k.addEventListener('pointerup', () => noteOff(n));
    k.addEventListener('pointercancel', () => noteOff(n));
    keyEls.set(n, k);
    keysHost.append(k);
  }

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
  const held = new Map<string, number>();
  const octSpec = ALL.find((p) => p.id === 'octave')!;
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLSelectElement) return;
    const key = e.key.toLowerCase();
    if (key === ',' || key === '.') {
      const v = Math.max(-3, Math.min(3, state.params.octave + (key === ',' ? -1 : 1)));
      setParam(octSpec, v);
      controls.get('octave')?.set(v);
      return;
    }
    const off = KEY_MAP[key];
    if (off === undefined || held.has(key)) return;
    held.set(key, 60 + off);
    noteOn(60 + off, 0.8);
  });
  window.addEventListener('keyup', (e) => {
    const n = held.get(e.key.toLowerCase());
    if (n === undefined) return;
    held.delete(e.key.toLowerCase());
    noteOff(n);
  });
  window.addEventListener('blur', () => {
    held.clear();
    [...down].forEach(noteOff);
  });

  synth.port.onmessage = (e: MessageEvent) => {
    if (e.data?.type === 'status') voices = e.data.voices;
  };

  /* ---------------------------------------------------------- MIDI */
  const initMidi = async () => {
    const status = $('#midi-status');
    if (!('requestMIDIAccess' in navigator)) return void (status.textContent = 'MIDI: n/a');
    try {
      const access = await navigator.requestMIDIAccess();
      const handler = (ev: MIDIMessageEvent) => {
        const d = ev.data;
        if (!d || d.length < 3) return;
        const cmd = d[0] & 0xf0;
        if (cmd === 0x90 && d[2] > 0) noteOn(d[1], d[2] / 127);
        else if (cmd === 0x80 || cmd === 0x90) noteOff(d[1]);
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
  const W = 260;
  const H = 58;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  const buf = new Float32Array(analyser.fftSize);
  const voicesEl = document.createElement('div');
  voicesEl.id = 'lcd-3';
  $('#va-lcd').append(voicesEl);
  const frame = () => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#003300';
    g.beginPath();
    g.moveTo(0, H / 2);
    g.lineTo(W, H / 2);
    g.stroke();
    analyser.getFloatTimeDomainData(buf);
    let start = 0;
    for (let i = 1; i < buf.length / 2; i++) {
      if (buf[i - 1] < 0 && buf[i] >= 0) {
        start = i;
        break;
      }
    }
    g.strokeStyle = '#00ff00';
    g.beginPath();
    for (let i = 0; i < 900; i += 2) {
      const x = (i / 900) * W;
      const y = H / 2 - Math.max(-1, Math.min(1, buf[start + i] * 2)) * (H / 2.1);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    voicesEl.textContent = `VOICES ${voices}/8${state.params.arpOn > 0.5 ? '  ARP' : ''}`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  /* --------------------------------------------------------- power */
  const overlay = $('#power-overlay');
  const powerBtn = $('#btn-power');
  let midiStarted = false;
  const syncPower = () => powerBtn.classList.toggle('on', ctx.state === 'running');
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
  $('#btn-power-big').addEventListener('click', powerOn);
  powerBtn.addEventListener('click', async () => {
    if (ctx.state === 'running') {
      synth.port.postMessage({ type: 'allOff' });
      await ctx.suspend();
    } else await powerOn();
  });
  syncPower();
}

main();
