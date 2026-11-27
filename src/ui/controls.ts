import type { ParamSpec } from '../core/types';
import { setTip } from './tooltip';

export interface Control {
  el: HTMLElement;
  set(v: number): void;
}

const SVG = 'http://www.w3.org/2000/svg';
const SWEEP = 135;

export function toNorm(p: ParamSpec, v: number): number {
  if (p.curve === 'exp') return Math.log(v / p.min) / Math.log(p.max / p.min);
  return (v - p.min) / (p.max - p.min);
}

export function fromNorm(p: ParamSpec, n: number): number {
  n = Math.min(1, Math.max(0, n));
  let v = p.curve === 'exp' ? p.min * Math.pow(p.max / p.min, n) : p.min + n * (p.max - p.min);
  if (p.step) v = Math.round((v - p.min) / p.step) * p.step + p.min;
  return Math.min(p.max, Math.max(p.min, v));
}

export function formatValue(p: ParamSpec, v: number): string {
  if (p.options) return p.options[Math.round(v)] ?? '';
  const u = p.unit ?? '';
  if (u === 'Hz') {
    if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k`;
    return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)}Hz`;
  }
  if (u === 's') return v < 1 ? `${(v * 1000).toFixed(v < 0.01 ? 1 : 0)}ms` : `${v.toFixed(2)}s`;
  if (u === 'ms') return `${v.toFixed(v >= 10 ? 0 : 1)}ms`;
  const sign = p.min < 0 && v > 0 ? '+' : '';
  if (p.step && p.step >= 1) return `${sign}${Math.round(v)}${u}`;
  const a = Math.abs(v);
  return `${sign}${v.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2)}${u}`;
}

function arc(r: number, a0: number, a1: number): string {
  if (a1 < a0) [a0, a1] = [a1, a0];
  if (a1 - a0 < 0.5) return '';
  const pt = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${(50 + r * Math.cos(rad)).toFixed(2)} ${(50 + r * Math.sin(rad)).toFixed(2)}`;
  };
  return `M ${pt(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(a1)}`;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Shared gradient defs used by all knobs (inserted once into the document). */
export function installKnobDefs(): void {
  if (document.getElementById('knob-defs')) return;
  const svg = svgEl('svg', { id: 'knob-defs', width: 0, height: 0, style: 'position:absolute' });
  svg.innerHTML = `
    <defs></defs>`;
  document.body.prepend(svg);
}

export function createKnob(p: ParamSpec, value: number, onChange: (v: number) => void, size = p.size ?? 'md'): Control {
  const root = document.createElement('div');
  root.className = `ctl knob knob-${size}`;

  // Flat dial: name above, thin ring with value arc + needle, value readout below.
  const label = document.createElement('div');
  label.className = 'ctl-label';
  label.textContent = p.label;

  const svg = svgEl('svg', { viewBox: '0 0 100 100' });
  const track = svgEl('path', { class: 'knob-track', d: arc(40, -SWEEP, SWEEP) });
  const val = svgEl('path', { class: 'knob-value' });
  const ind = svgEl('g', {});
  ind.append(svgEl('line', { x1: 50, y1: 50, x2: 50, y2: 14, class: 'knob-needle' }));
  svg.append(track, val, ind);

  const readout = document.createElement('div');
  readout.className = 'ctl-value';
  root.append(label, svg, readout);

  let current = value;
  const bipolar = p.min < 0 && p.max > 0 && p.curve !== 'exp';
  const render = () => {
    const n = toNorm(p, current);
    const ang = -SWEEP + n * SWEEP * 2;
    const origin = bipolar ? -SWEEP + toNorm(p, 0) * SWEEP * 2 : -SWEEP;
    val.setAttribute('d', arc(40, origin, ang));
    ind.setAttribute('transform', `rotate(${ang.toFixed(2)} 50 50)`);
    readout.textContent = formatValue(p, current);
  };

  const commit = (v: number) => {
    if (v === current) return;
    current = v;
    render();
    onChange(v);
  };

  let startY = 0;
  let startN = 0;
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    root.setPointerCapture(e.pointerId);
    root.classList.add('active');
    startY = e.clientY;
    startN = toNorm(p, current);
  });
  root.addEventListener('pointermove', (e) => {
    if (!root.hasPointerCapture(e.pointerId)) return;
    const range = e.shiftKey ? 900 : 180;
    const n = startN + (startY - e.clientY) / range;
    commit(fromNorm(p, n));
    if (e.shiftKey) {
      startY = e.clientY;
      startN = toNorm(p, current);
    }
  });
  const end = (e: PointerEvent) => {
    if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
    root.classList.remove('active');
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dir = e.deltaY < 0 ? 1 : -1;
      if (p.step) commit(Math.min(p.max, Math.max(p.min, current + dir * p.step)));
      else commit(fromNorm(p, toNorm(p, current) + dir * (e.shiftKey ? 0.004 : 0.02)));
    },
    { passive: false },
  );
  root.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    commit(p.default);
  });

  render();
  setTip(
    root,
    () =>
      `${p.label}  ·  ${formatValue(p, current)}
` +
      `Range ${formatValue(p, p.min)} … ${formatValue(p, p.max)}${p.curve === 'exp' ? ' (log)' : ''}
` +
      `Drag ↕ to turn · Shift = fine · Wheel = nudge
` +
      `Double-click = reset to ${formatValue(p, p.default)}`,
  );
  return {
    el: root,
    set(v) {
      current = v;
      render();
    },
  };
}

export function createToggle(p: ParamSpec, value: number, onChange: (v: number) => void): Control {
  const root = document.createElement('button');
  root.className = 'ctl toggle';
  root.type = 'button';
  const led = document.createElement('span');
  led.className = 'toggle-led';
  const label = document.createElement('span');
  label.className = 'ctl-label';
  label.textContent = p.label;
  root.append(led, label);
  let current = value;
  const render = () => root.classList.toggle('on', current > 0.5);
  setTip(
    root,
    () => `${p.label}  ·  ${current > 0.5 ? 'ON' : 'OFF'}
Click to toggle`,
  );
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('click', () => {
    current = current > 0.5 ? 0 : 1;
    render();
    onChange(current);
  });
  render();
  return {
    el: root,
    set(v) {
      current = v;
      render();
    },
  };
}

export function createSwitch(p: ParamSpec, value: number, onChange: (v: number) => void): Control {
  const root = document.createElement('div');
  root.className = 'ctl switch';
  const lcd = document.createElement('div');
  lcd.className = 'lcd';
  const label = document.createElement('div');
  label.className = 'ctl-label';
  label.textContent = p.label;
  root.append(lcd, label);
  const count = p.options?.length ?? Math.round(p.max - p.min + 1);
  let current = value;
  const render = () => (lcd.textContent = formatValue(p, current));
  setTip(
    root,
    () =>
      `${p.label}  ·  ${formatValue(p, current)}
` +
      (p.options
        ? `Options: ${p.options.join(' · ')}
`
        : '') +
      'Click = next · Right-click = previous',
  );
  const cycle = (d: number) => {
    current = p.min + ((Math.round(current - p.min) + d + count) % count);
    render();
    onChange(current);
  };
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('click', () => cycle(1));
  root.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    cycle(-1);
  });
  render();
  return {
    el: root,
    set(v) {
      current = v;
      render();
    },
  };
}
