import '../fonts';
import '../styles.css';
import './start.css';

import { installTooltips } from '../ui/tooltip';

interface Machine {
  key: string;
  href: string;
  name: string;
  model: string;
  isNew?: boolean;
  blurb: string;
  features: string[];
  preview: string;
}

const knobs = (n: number) => Array.from({ length: n }, () => '<span class="pv-knob"></span>').join('');
const leds = (n: number) =>
  Array.from({ length: n }, (_, i) => `<span class="pv-led" style="--i:${i}"></span>`).join('');

const MACHINES: Machine[] = [
  {
    key: '1',
    href: './modular.html',
    name: 'VOLTRACK Eurorack Modular',
    model: '126HP case · 22 modules',
    blurb:
      'Build your own synthesizer! Mount modules on the rails of a Eurorack case and connect them with patch cables.',
    features: [
      'VCO, VCF, VCA, ADSR, LFO, S&amp;H, sequencer, effects...',
      'Real HP sizes and Eurorack voltages',
      'Drag-and-drop patch cables',
      'Presets, autosave and JSON export',
    ],
    preview: `
      <div class="pv-rack">
        <div class="pv-rail"></div>
        <div class="pv-row">
          <div class="pv-panel" style="--w:12">${knobs(3)}</div>
          <div class="pv-panel" style="--w:12">${knobs(2)}</div>
          <div class="pv-panel" style="--w:8">${knobs(2)}</div>
          <div class="pv-panel" style="--w:16">${knobs(4)}</div>
          <div class="pv-panel" style="--w:10">${knobs(2)}</div>
        </div>
        <div class="pv-rail"></div>
        <svg class="pv-cables" viewBox="0 0 300 130" preserveAspectRatio="none">
          <path d="M30 100 C 50 150, 90 150, 110 95" stroke="#ff0000"/>
          <path d="M70 98 C 110 160, 170 150, 190 96" stroke="#0000ff"/>
          <path d="M150 100 C 180 145, 230 150, 255 98" stroke="#00aa00"/>
        </svg>
      </div>`,
  },
  {
    key: '2',
    href: './acid.html',
    name: 'ACIDLINE BL-1',
    model: 'bassline synthesizer',
    isNew: true,
    blurb: 'A squelchy monophonic bass synth with a resonant filter and a 16-step sequencer with slide and accent.',
    features: [
      'Saw / square oscillator and resonant ladder filter',
      'Env mod, decay, accent and overdrive',
      '16-step grid sequencer with slide and accent',
      '8 pattern memories, synced delay, MIDI',
    ],
    preview: `
      <div class="pv-box">
        <div class="pv-box-knobs">${knobs(7)}</div>
        <div class="pv-screen"><svg viewBox="0 0 100 30" preserveAspectRatio="none"><path d="M0 15 L10 4 L10 26 L20 6 L20 25 L30 8 L30 22 L40 12 L40 18 L50 15 L60 3 L60 27 L70 5 L70 25 L80 8 L80 22 L90 11 L90 19 L100 15"/></svg></div>
        <div class="pv-steps">${leds(16)}</div>
      </div>`,
  },
  {
    key: '3',
    href: './va.html',
    name: 'HALCYON VA-8',
    model: 'virtual analog polysynth',
    isNew: true,
    blurb: 'An 8-voice virtual analog synthesizer for huge stacked-saw leads, lush pads, plucks and basses.',
    features: [
      'STACK oscillator: 7 detuned saws in stereo',
      'Dual multimode filters, serial / parallel',
      '2 LFOs, glide, mono / legato, arpeggiator',
      '7 distortions, chorus / flanger / phaser, delay, reverb',
    ],
    preview: `
      <div class="pv-box">
        <div class="pv-screen pv-lcd">01 Starlight Lead</div>
        <div class="pv-box-knobs">${knobs(9)}</div>
        <div class="pv-keys">${Array.from({ length: 21 }, () => '<span></span>').join('')}</div>
      </div>`,
  },
];

/** Classic hit counter — counts this browser's visits. */
function visitorNumber(): string {
  const key = 'voltrack.visits';
  const n = (Number(localStorage.getItem(key)) || 0) + 1;
  localStorage.setItem(key, String(n));
  return String(n).padStart(6, '0');
}

function render(): void {
  const root = document.querySelector('#start-app')!;
  root.innerHTML = `
    <div class="page">
      <h1 class="title">Welcome to VOLTRACK!</h1>
      <div class="subtitle">~ Free synthesizers for your web browser ~</div>
      <marquee class="ticker" scrollamount="4">*** Three synthesizers that run right in your browser! No plug-ins, no downloads! *** NEW: the HALCYON VA-8 polysynth! *** Press 1, 2 or 3 on your keyboard to jump straight in! ***</marquee>
      <hr />
      <p class="intro">Please choose a machine below. Click <b>POWER ON</b> once it loads to switch on the sound.</p>
      <table class="machines" cellspacing="0">
        <tr>
          ${MACHINES.map(
            (m) => `
            <td class="machine">
              <h2><a href="${m.href}" title="${m.name}\nShortcut: press ${m.key}">${m.name}</a>${m.isNew ? ' <span class="new">NEW!</span>' : ''}</h2>
              <div class="model">${m.model}</div>
              <a class="shot" href="${m.href}" tabindex="-1" title="${m.name}\nClick to open">${m.preview}</a>
              <p>${m.blurb}</p>
              <ul>${m.features.map((f) => `<li>${f}</li>`).join('')}</ul>
              <p class="enter"><a href="${m.href}">[ Enter ${m.name.split(' ')[0]} &gt;&gt; ]</a> <span class="keyhint">(key ${m.key})</span></p>
            </td>`,
          ).join('')}
        </tr>
      </table>
      <hr />
      <div class="counter-row">
        <span>You are visitor No.</span>
        <span class="counter" title="Hit counter\nCounts visits from this browser">${visitorNumber()}</span>
      </div>
      <div class="construction" title="This site is always being improved">
        <span class="stripes"></span><b>UNDER CONSTRUCTION</b> — more machines coming soon!<span class="stripes"></span>
      </div>
      <hr />
      <div class="footer">
        Best viewed at 800x600 or higher with a browser that supports Web Audio.<br />
        Made with Notepad and the Web Audio API · Last updated: November 24, 2026<br />
        <span class="build" title="Build info
Version and git commit this page was built from — see /version.json">v${__APP_VERSION__} · build ${__GIT_SHA__.slice(0, 7)}</span>
      </div>
    </div>`;
}

render();
installTooltips(1000);
window.addEventListener('keydown', (e) => {
  const m = MACHINES.find((x) => x.key === e.key);
  if (m) window.location.href = m.href;
});
