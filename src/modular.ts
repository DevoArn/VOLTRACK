import './fonts';
import './styles.css';

import { Engine } from './core/engine';
import type { PatchData } from './core/types';
import { initMidi } from './midi';
import { CATEGORY_COLORS, CATEGORY_ORDER, MODULES } from './modules';
import { PRESETS } from './presets';
import { installKnobDefs } from './ui/controls';
import { Rack } from './ui/rack';
import { installTooltips, setTip } from './ui/tooltip';

const AUTOSAVE_KEY = 'voltrack.autosave.v2';
const USER_SLOT_KEY = 'voltrack.user.v2';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

function buildShell(): void {
  document.querySelector('#app')!.innerHTML = `
    <header class="topbar">
      <a class="tb-btn back-btn" href="./" title="Machine select
Back to the start page">◄ MACHINES</a>
      <div class="brand">
        <span class="logo">VOLTRACK</span>
        <span class="tagline">eurorack modular</span>
      </div>
      <div class="tb-group">
        <label class="tb-label" for="preset">PATCH</label>
        <select id="preset" class="tb-select" title="Factory patches
Loading one replaces the current rack"></select>
        <button class="tb-btn" id="btn-new" title="Clear the rack">NEW</button>
        <button class="tb-btn" id="btn-save" title="Store patch in this browser">STORE</button>
        <button class="tb-btn" id="btn-recall" title="Recall stored patch">RECALL</button>
        <button class="tb-btn" id="btn-export" title="Download patch as JSON">EXPORT</button>
        <button class="tb-btn" id="btn-import" title="Load patch from JSON">IMPORT</button>
        <input type="file" id="file-import" accept="application/json,.json" hidden />
      </div>
      <div class="tb-group">
        <label class="tb-label">CASE</label>
        <button class="tb-btn tb-icon" id="row-del" title="Remove last (empty) 3U row">−</button>
        <span class="lcd tb-lcd" id="rows-lcd" title="Case size
Number of 3U rows (126HP each)">3U×3</span>
        <button class="tb-btn tb-icon" id="row-add" title="Add a 3U row">+</button>
        <label class="tb-label">ZOOM</label>
        <button class="tb-btn tb-icon" id="zoom-out" title="Zoom out (Ctrl+wheel)">−</button>
        <span class="lcd tb-lcd" id="zoom-lcd" title="Zoom level
Click to reset to 100%">100%</span>
        <button class="tb-btn tb-icon" id="zoom-in" title="Zoom in (Ctrl+wheel)">+</button>
        <button class="tb-btn" id="zoom-fit" title="Fit case width">FIT</button>
        <label class="tb-label" for="cable-op">CABLES</label>
        <input type="range" id="cable-op" min="0.15" max="1" step="0.05" value="0.9" title="Cable opacity
Fade cables to see the panels underneath" />
      </div>
      <div class="tb-group tb-right">
        <span class="lcd tb-lcd" id="midi-status" title="Web MIDI status
Connected MIDI keyboards play every KEYBOARD module">MIDI: off</span>
        <button class="power-btn" id="btn-power" title="Power
Start / suspend the audio engine"><span class="power-led"></span>POWER</button>
      </div>
    </header>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-title">MODULES</div>
      <div id="module-list"></div>
      <div class="help">
        <div class="help-title">PATCHING</div>
        <p>Drag from a jack to a jack to patch.<br/>Drag a patched input to re-route or drop it in empty space to unplug.<br/>Right-click a jack to remove its cables.</p>
        <div class="help-title">CONTROLS</div>
        <p>Drag knobs vertically (Shift = fine), scroll wheel, double-click to reset.<br/>Drag a panel's header to re-rack it — it snaps to the HP grid and free rail space. Drag the background to pan, Ctrl+wheel to zoom.</p>
        <div class="help-title">VOLTAGES</div>
        <p>Audio ±5V · pitch 1V/oct (0V = C4) · gates +10V (trigger &gt; 1V) · envelopes 0–10V · LFOs ±5V.</p>
        <div class="help-title">KEYBOARD</div>
        <p>A W S E D F T G Y H U J K play notes · , . shift octave · Web MIDI supported.</p>
      </div>
    </aside>
    <main class="viewport" id="viewport"></main>
    <div class="power-overlay" id="power-overlay">
      <div class="power-card" data-title="VOLTRACK - Audio Engine">
        <div class="logo logo-xl">VOLTRACK</div>
        <div class="power-sub">eurorack modular in your browser</div>
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
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2200);
}

function isPatch(x: unknown): x is PatchData {
  const p = x as PatchData;
  return !!p && Array.isArray(p.modules) && Array.isArray(p.cables);
}

async function main(): Promise<void> {
  buildShell();
  installKnobDefs();
  installTooltips(1000);

  const engine = new Engine();
  try {
    await engine.init();
  } catch (err) {
    $('#power-hint').textContent = String((err as Error).message ?? err);
    $('#btn-power-big').setAttribute('disabled', 'true');
    return;
  }

  const viewport = $('#viewport');
  const rack = new Rack(engine, viewport);

  /* ---------------------------------------------------- module palette */
  const list = $('#module-list');
  for (const cat of CATEGORY_ORDER) {
    const mods = MODULES.filter((m) => m.category === cat);
    if (!mods.length) continue;
    const sec = document.createElement('div');
    sec.className = 'cat';
    sec.style.setProperty('--accent', CATEGORY_COLORS[cat]);
    const h = document.createElement('div');
    h.className = 'cat-title';
    h.textContent = cat.toUpperCase();
    sec.append(h);
    for (const m of mods) {
      const b = document.createElement('button');
      b.className = 'mod-btn';
      b.type = 'button';
      setTip(b, `${m.name}  ·  ${m.hp}HP\n${m.description}\nClick to rack it in the first free slot`);
      b.innerHTML = `<span class="mod-dot"></span><span class="mod-name">${m.name}</span><span class="mod-hp">${m.hp}HP</span>`;
      b.addEventListener('click', () => {
        let slot = rack.findSlot(m.hp, rack.visibleRow());
        if (!slot && engine.rows < 8) {
          engine.setRows(engine.rows + 1);
          slot = rack.findSlot(m.hp, engine.rows - 1);
        }
        if (!slot) return toast(`No room for ${m.hp}HP — the case is full`);
        engine.addModule(m.type, slot.row, slot.hp);
        toast(`${m.name} racked in row ${slot.row + 1} at ${slot.hp}HP`);
      });
      sec.append(b);
    }
    list.append(sec);
  }

  /* ------------------------------------------------------------ patches */
  const select = $<HTMLSelectElement>('#preset');
  select.innerHTML =
    '<option value="" disabled>— choose —</option>' +
    PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');

  let currentName = 'Untitled';
  const loadPatch = (p: PatchData) => {
    engine.load(p);
    currentName = p.name ?? 'Untitled';
    requestAnimationFrame(() => rack.updateAllCables());
  };

  select.addEventListener('change', () => {
    const p = PRESETS[Number(select.value)];
    if (p) {
      loadPatch(p);
      toast(`Loaded “${p.name}”`);
    }
  });

  $('#btn-new').addEventListener('click', () => {
    loadPatch(PRESETS[PRESETS.length - 1]);
    select.value = '';
    toast('New rack');
  });
  $('#btn-save').addEventListener('click', () => {
    localStorage.setItem(USER_SLOT_KEY, JSON.stringify(engine.serialize(currentName)));
    toast('Patch stored in browser');
  });
  $('#btn-recall').addEventListener('click', () => {
    const raw = localStorage.getItem(USER_SLOT_KEY);
    if (!raw) return toast('No stored patch yet');
    loadPatch(JSON.parse(raw));
    toast('Stored patch recalled');
  });
  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(engine.serialize(currentName), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${currentName.replace(/[^\w-]+/g, '_') || 'patch'}.voltrack.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  const fileInput = $<HTMLInputElement>('#file-import');
  $('#btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!isPatch(data)) throw new Error('bad');
      loadPatch(data);
      toast(`Imported ${f.name}`);
    } catch {
      toast('Not a valid patch file');
    }
  });

  /* --------------------------------------------------------- zoom/cables */
  const zoomLcd = $('#zoom-lcd');
  viewport.addEventListener('zoomchange', () => (zoomLcd.textContent = `${Math.round(rack.zoom * 100)}%`));
  $('#zoom-in').addEventListener('click', () => rack.setZoom(rack.zoom * 1.15));
  $('#zoom-out').addEventListener('click', () => rack.setZoom(rack.zoom / 1.15));
  zoomLcd.addEventListener('click', () => rack.setZoom(1));
  $('#zoom-fit').addEventListener('click', () => rack.fitWidth());

  const rowsLcd = $('#rows-lcd');
  const syncRows = () => (rowsLcd.textContent = `3U×${engine.rows}`);
  engine.on((e) => {
    if (e.type === 'case') syncRows();
  });
  $('#row-add').addEventListener('click', () => {
    if (engine.rows >= 8) return toast('Maximum 8 rows');
    engine.setRows(engine.rows + 1);
  });
  $('#row-del').addEventListener('click', () => {
    if (engine.rows <= 1) return;
    if (!rack.rowIsEmpty(engine.rows - 1)) return toast(`Row ${engine.rows} is not empty`);
    engine.setRows(engine.rows - 1);
  });
  syncRows();
  const op = $<HTMLInputElement>('#cable-op');
  op.addEventListener('input', () => rack.setCableOpacity(Number(op.value)));
  rack.setCableOpacity(Number(op.value));

  /* ------------------------------------------------------------ autosave */
  let saveTimer = 0;
  engine.on((e) => {
    if (e.type === 'loaded') return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(
      () => localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(engine.serialize(currentName))),
      400,
    );
  });

  const saved = localStorage.getItem(AUTOSAVE_KEY);
  let restored = false;
  if (saved) {
    try {
      const p = JSON.parse(saved);
      if (isPatch(p) && p.modules.length) {
        loadPatch(p);
        restored = true;
      }
    } catch {
      /* ignore corrupt autosave */
    }
  }
  if (!restored) {
    loadPatch(PRESETS[0]);
    select.value = '0';
  }
  requestAnimationFrame(() => rack.fitWidth());

  /* --------------------------------------------------------------- power */
  const overlay = $('#power-overlay');
  const powerBtn = $('#btn-power');
  let midiStarted = false;
  const syncPower = () => {
    const on = engine.ctx.state === 'running';
    powerBtn.classList.toggle('on', on);
    document.body.classList.toggle('powered', on);
  };
  engine.ctx.addEventListener('statechange', syncPower);

  const powerOn = async () => {
    await engine.ctx.resume();
    overlay.classList.add('hidden');
    if (!midiStarted) {
      midiStarted = true;
      initMidi((s) => ($('#midi-status').textContent = s));
    }
    syncPower();
  };
  $('#btn-power-big').addEventListener('click', powerOn);
  powerBtn.addEventListener('click', async () => {
    if (engine.ctx.state === 'running') await engine.ctx.suspend();
    else await powerOn();
    syncPower();
  });
  syncPower();
}

main();
