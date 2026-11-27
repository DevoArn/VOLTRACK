/** Small DOM helpers shared by custom module UIs. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function led(color = 'var(--accent)'): HTMLDivElement {
  const d = el('div', 'led');
  d.style.setProperty('--led', color);
  return d;
}

export function setLed(d: HTMLElement, level: number): void {
  d.style.setProperty('--lvl', Math.max(0, Math.min(1, level)).toFixed(3));
}

export function row(cls = '', ...children: HTMLElement[]): HTMLDivElement {
  const r = el('div', `ui-row ${cls}`.trim());
  r.append(...children);
  return r;
}

/** Create a canvas sized for the device pixel ratio. */
export function hiDpiCanvas(
  w: number,
  h: number,
  cls = '',
): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = el('canvas', cls);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  return { canvas, g };
}
