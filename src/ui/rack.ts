import type { Engine } from '../core/engine';
import type { Cable, ModuleInstance, PortSpec, UIHelpers, UIHooks } from '../core/types';
import { CATEGORY_COLORS } from '../modules';
import { type Control, createKnob, createSwitch, createToggle } from './controls';
import { setTip } from './tooltip';

/** Human description of the signal type carried by a jack. */
function signalInfo(p: PortSpec): string {
  if (p.label.includes('V/OCT')) return 'Pitch CV · 1V/oct (0V = C4)';
  if (p.kind === 'audio') return 'Audio · ±5V';
  if (p.kind === 'gate') return 'Gate/trigger · 0 / +10V (threshold +1V)';
  return 'Control voltage · LFO ±5V, envelope 0–10V';
}

/* ------------------------------------------------------------------
 * Eurorack geometry (scaled: 1 HP = 5.08 mm → 15 px, 3U = 128.5 mm → 380 px)
 * ------------------------------------------------------------------ */
export const HP_PX = 15;
export const U3_PX = 380;
export const RAIL_PX = 14;
export const CASE_HP = 126;
const ROW_GAP = 18;
const CHEEK = 30;
const FRAME = 16;
const CASE_X = 60;
const CASE_Y = 50;
const ROW_PITCH = U3_PX + ROW_GAP;

const SVG = 'http://www.w3.org/2000/svg';

interface CableView {
  g: SVGGElement;
  shadow: SVGPathElement;
  path: SVGPathElement;
  shine: SVGPathElement;
  a: SVGCircleElement;
  b: SVGCircleElement;
}

type Pt = { x: number; y: number };

function cablePath(p1: Pt, p2: Pt): string {
  const dx = p2.x - p1.x;
  const dist = Math.hypot(dx, p2.y - p1.y);
  const sag = Math.min(40 + dist * 0.3, 260);
  return `M ${p1.x} ${p1.y} C ${p1.x + dx * 0.15} ${p1.y + sag}, ${p2.x - dx * 0.15} ${p2.y + sag}, ${p2.x} ${p2.y}`;
}

const rowTop = (row: number) => CASE_Y + FRAME + row * ROW_PITCH;
const hpLeft = (hp: number) => CASE_X + CHEEK + hp * HP_PX;

export class Rack {
  readonly sizer: HTMLDivElement;
  readonly canvas: HTMLDivElement;
  readonly svg: SVGSVGElement;
  readonly caseEl: HTMLDivElement;
  zoom = 1;

  private canvasW = 0;
  private canvasH = 0;
  private elements = new Map<string, HTMLElement>();
  private hooks = new Map<string, UIHooks>();
  private controls = new Map<string, Map<string, Control>>();
  private cableViews = new Map<string, CableView>();
  private zTop = 10;
  private resizeObs: ResizeObserver;

  constructor(
    private engine: Engine,
    readonly viewport: HTMLElement,
  ) {
    this.sizer = document.createElement('div');
    this.sizer.className = 'canvas-sizer';
    this.canvas = document.createElement('div');
    this.canvas.className = 'rack-canvas';
    this.caseEl = document.createElement('div');
    this.caseEl.className = 'case';
    this.svg = document.createElementNS(SVG, 'svg');
    this.svg.classList.add('cables');
    this.canvas.append(this.caseEl, this.svg);
    this.sizer.append(this.canvas);
    viewport.append(this.sizer);
    this.renderCase();

    this.resizeObs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.id;
        if (id) this.updateCablesFor(id);
      }
    });

    engine.on((e) => {
      switch (e.type) {
        case 'moduleAdded':
          this.mountModule(e.inst);
          break;
        case 'moduleRemoved':
          this.unmountModule(e.id);
          break;
        case 'cableAdded':
          this.addCableView(e.cable);
          break;
        case 'cableRemoved':
          this.removeCableView(e.cable.id);
          break;
        case 'param':
          this.controls.get(e.id)?.get(e.param)?.set(e.value);
          break;
        case 'case':
          this.renderCase();
          break;
        default:
          break;
      }
    });

    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('contextmenu', (e) => this.onContextMenu(e));
    viewport.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY);
      },
      { passive: false },
    );

    const loop = () => {
      for (const h of this.hooks.values()) h.frame?.();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    document.fonts?.ready.then(() => this.updateAllCables());
  }

  /* -------------------------------------------------------------- case */
  private renderCase(): void {
    const rows = this.engine.rows;
    const w = CHEEK * 2 + CASE_HP * HP_PX;
    const h = FRAME * 2 + rows * U3_PX + (rows - 1) * ROW_GAP;
    const c = this.caseEl;
    c.style.left = `${CASE_X}px`;
    c.style.top = `${CASE_Y}px`;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    c.innerHTML = '';
    for (let r = 0; r < rows; r++) {
      const row = document.createElement('div');
      row.className = 'case-row';
      row.style.top = `${FRAME + r * ROW_PITCH}px`;
      row.style.left = `${CHEEK}px`;
      row.style.width = `${CASE_HP * HP_PX}px`;
      row.style.height = `${U3_PX}px`;
      row.innerHTML = `<div class="rail rail-top"></div><div class="rail rail-bottom"></div><span class="row-label">ROW ${r + 1} · ${CASE_HP}HP</span>`;
      c.append(row);
    }
    const cheekL = document.createElement('div');
    cheekL.className = 'cheek cheek-l';
    const cheekR = document.createElement('div');
    cheekR.className = 'cheek cheek-r';
    const badge = document.createElement('div');
    badge.className = 'case-badge';
    badge.textContent = `EURORACK · ${rows} × 3U · ${CASE_HP}HP`;
    c.append(cheekL, cheekR, badge);

    this.canvasW = CASE_X * 2 + w;
    this.canvasH = CASE_Y + h + 300; // room for hanging cables
    this.canvas.style.width = `${this.canvasW}px`;
    this.canvas.style.height = `${this.canvasH}px`;
    this.svg.setAttribute('width', String(this.canvasW));
    this.svg.setAttribute('height', String(this.canvasH));
    this.applyZoom();
    requestAnimationFrame(() => this.updateAllCables());
  }

  /** True if a module of width `w` HP fits at row/hp without overlapping (ignores `except`). */
  fits(row: number, hp: number, w: number, except?: string): boolean {
    if (row < 0 || row >= this.engine.rows || hp < 0 || hp + w > CASE_HP) return false;
    for (const m of this.engine.modules.values()) {
      if (m.id === except || m.row !== row) continue;
      if (hp < m.hp + m.spec.hp && m.hp < hp + w) return false;
    }
    return true;
  }

  /** First free slot (row-major) wide enough for `w` HP, preferring rows near `preferRow`. */
  findSlot(w: number, preferRow = 0): { row: number; hp: number } | null {
    const rows = [...Array(this.engine.rows).keys()].sort((a, b) => Math.abs(a - preferRow) - Math.abs(b - preferRow));
    for (const r of rows) {
      for (let hp = 0; hp + w <= CASE_HP; hp++) if (this.fits(r, hp, w)) return { row: r, hp };
    }
    return null;
  }

  rowIsEmpty(row: number): boolean {
    for (const m of this.engine.modules.values()) if (m.row === row) return false;
    return true;
  }

  /** Row currently nearest the middle of the viewport. */
  visibleRow(): number {
    const midY = (this.viewport.scrollTop + this.viewport.clientHeight / 2) / this.zoom;
    return Math.max(0, Math.min(this.engine.rows - 1, Math.floor((midY - rowTop(0)) / ROW_PITCH)));
  }

  /* -------------------------------------------------------------- zoom */
  setZoom(z: number, clientX?: number, clientY?: number): void {
    z = Math.min(2, Math.max(0.3, z));
    const vr = this.viewport.getBoundingClientRect();
    const cx = clientX ?? vr.left + vr.width / 2;
    const cy = clientY ?? vr.top + vr.height / 2;
    const worldX = (this.viewport.scrollLeft + cx - vr.left) / this.zoom;
    const worldY = (this.viewport.scrollTop + cy - vr.top) / this.zoom;
    this.zoom = z;
    this.applyZoom();
    this.viewport.scrollLeft = worldX * z - (cx - vr.left);
    this.viewport.scrollTop = worldY * z - (cy - vr.top);
    this.viewport.dispatchEvent(new CustomEvent('zoomchange', { detail: z }));
  }

  /** Zoom so the full case width fits the viewport. */
  fitWidth(): void {
    const z = (this.viewport.clientWidth - 20) / this.canvasW;
    this.setZoom(Math.min(1, z));
    this.viewport.scrollLeft = 0;
    this.viewport.scrollTop = 0;
  }

  private applyZoom(): void {
    this.canvas.style.transform = `scale(${this.zoom})`;
    this.sizer.style.width = `${this.canvasW * this.zoom}px`;
    this.sizer.style.height = `${this.canvasH * this.zoom}px`;
  }

  setCableOpacity(o: number): void {
    this.svg.style.setProperty('--cable-opacity', String(o));
  }

  private toWorld(clientX: number, clientY: number): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / this.zoom, y: (clientY - r.top) / this.zoom };
  }

  /* ----------------------------------------------------------- modules */
  private place(inst: ModuleInstance, el: HTMLElement): void {
    el.style.left = `${hpLeft(inst.hp)}px`;
    el.style.top = `${rowTop(inst.row)}px`;
  }

  private mountModule(inst: ModuleInstance): void {
    const spec = inst.spec;
    const root = document.createElement('div');
    root.className = 'module';
    root.dataset.id = inst.id;
    root.dataset.type = spec.type;
    root.style.width = `${spec.hp * HP_PX - 1}px`;
    root.style.height = `${U3_PX}px`;
    root.style.zIndex = String(++this.zTop);
    root.style.setProperty('--accent', CATEGORY_COLORS[spec.category]);
    this.place(inst, root);

    const head = document.createElement('div');
    head.className = 'module-head';
    setTip(
      head,
      `${spec.name}  ·  ${spec.hp}HP\n${spec.description}\nDrag the header to re-rack · × removes the module`,
    );
    const title = document.createElement('span');
    title.className = 'module-title';
    title.textContent = spec.name;
    const del = document.createElement('button');
    del.className = 'module-del';
    del.type = 'button';
    setTip(del, `Remove ${spec.name}\nUnplugs all of its cables`);
    del.textContent = '×';
    del.addEventListener('pointerdown', (e) => e.stopPropagation());
    del.addEventListener('click', () => this.engine.removeModule(inst.id));
    head.append(title, del);

    const body = document.createElement('div');
    body.className = 'module-body';

    const ctlMap = new Map<string, Control>();
    this.controls.set(inst.id, ctlMap);
    const set = (pid: string, v: number) => this.engine.setParam(inst.id, pid, v);
    const make = (pid: string, kind: 'knob' | 'toggle' | 'switch', size?: 'sm' | 'md' | 'lg') => {
      const p = spec.params.find((x) => x.id === pid);
      if (!p) throw new Error(`No param ${pid} on ${spec.type}`);
      const v = inst.params[pid];
      const c =
        kind === 'toggle'
          ? createToggle(p, v, (nv) => set(pid, nv))
          : kind === 'switch'
            ? createSwitch(p, v, (nv) => set(pid, nv))
            : createKnob(p, v, (nv) => set(pid, nv), size ?? p.size);
      ctlMap.set(pid, c);
      return c.el;
    };
    const helpers: UIHelpers = {
      knob: (pid, size) => make(pid, 'knob', size),
      toggle: (pid) => make(pid, 'toggle'),
      switcher: (pid) => make(pid, 'switch'),
      setParam: set,
    };

    const params = document.createElement('div');
    params.className = 'params';
    for (const p of spec.params) {
      if (p.custom) continue;
      params.append(make(p.id, p.control ?? 'knob'));
    }

    const custom = document.createElement('div');
    custom.className = 'custom-ui';
    let hooks: UIHooks | void = undefined;
    if (spec.ui) hooks = spec.ui(custom, inst, helpers);

    if (spec.uiPosition === 'after') body.append(params, custom);
    else body.append(custom, params);
    if (!params.childElementCount) params.remove();
    if (!custom.childElementCount) custom.remove();

    const ports = document.createElement('div');
    ports.className = 'ports';
    if (spec.inputs.length) ports.append(this.portGroup(inst.id, spec.inputs, 'in'));
    if (spec.outputs.length) ports.append(this.portGroup(inst.id, spec.outputs, 'out'));
    body.append(ports);

    const foot = document.createElement('div');
    foot.className = 'module-foot';
    foot.textContent = `${spec.hp}HP`;

    // Eurorack mounting screws sit in the rail zone; narrow panels use two.
    const screwPos = spec.hp < 10 ? ['tl', 'br'] : ['tl', 'tr', 'bl', 'br'];
    const screws = screwPos.map((pos) => {
      const s = document.createElement('span');
      s.className = `screw screw-${pos}`;
      return s;
    });
    root.append(head, body, foot, ...screws);
    this.canvas.append(root);
    this.elements.set(inst.id, root);
    if (hooks) this.hooks.set(inst.id, hooks);
    this.resizeObs.observe(root);
  }

  private portGroup(modId: string, ports: PortSpec[], dir: 'in' | 'out'): HTMLElement {
    const g = document.createElement('div');
    g.className = `port-group port-${dir}`;
    const cap = document.createElement('div');
    cap.className = 'port-caption';
    cap.textContent = dir === 'in' ? 'IN' : 'OUT';
    const jacks = document.createElement('div');
    jacks.className = 'jacks';
    for (const p of ports) {
      const j = document.createElement('div');
      j.className = `jack kind-${p.kind}`;
      j.dataset.mod = modId;
      j.dataset.port = p.id;
      j.dataset.dir = dir;
      setTip(j, () => this.jackTip(modId, p, dir));
      const sock = document.createElement('div');
      sock.className = 'jack-socket';
      const lab = document.createElement('span');
      lab.className = 'jack-label';
      lab.textContent = p.label;
      j.append(sock, lab);
      jacks.append(j);
    }
    g.append(cap, jacks);
    return g;
  }

  /** Live tooltip for a jack: signal type plus what it is currently patched to. */
  private jackTip(modId: string, p: PortSpec, dir: 'in' | 'out'): string {
    const name = (m: string) => this.engine.modules.get(m)?.spec.name ?? m;
    const portLabel = (m: string, port: string, d: 'in' | 'out') => {
      const s = this.engine.modules.get(m)?.spec;
      return (d === 'in' ? s?.inputs : s?.outputs)?.find((x) => x.id === port)?.label ?? port;
    };
    const lines = [`${p.label}  ·  ${dir === 'in' ? 'INPUT' : 'OUTPUT'}`, signalInfo(p)];
    const cables = this.engine.cablesAt(modId, p.id, dir);
    if (!cables.length) lines.push('Not patched — drag to another jack to connect');
    for (const c of cables) {
      lines.push(
        dir === 'in'
          ? `◄ from ${name(c.from.module)} › ${portLabel(c.from.module, c.from.port, 'out')}`
          : `► to ${name(c.to.module)} › ${portLabel(c.to.module, c.to.port, 'in')}`,
      );
    }
    if (cables.length) {
      lines.push(
        dir === 'in'
          ? 'Drag to re-route · Right-click to unplug'
          : 'Drag for another cable · Right-click to unplug all',
      );
    }
    return lines.join('\n');
  }

  private unmountModule(id: string): void {
    const el = this.elements.get(id);
    if (el) {
      this.resizeObs.unobserve(el);
      el.remove();
    }
    this.hooks.get(id)?.dispose?.();
    this.hooks.delete(id);
    this.elements.delete(id);
    this.controls.delete(id);
  }

  /* ------------------------------------------------------------ cables */
  private jackEl(mod: string, port: string, dir: 'in' | 'out'): HTMLElement | null {
    return (
      this.elements.get(mod)?.querySelector<HTMLElement>(`.jack[data-port="${CSS.escape(port)}"][data-dir="${dir}"]`) ??
      null
    );
  }

  private jackPos(jack: HTMLElement): Pt {
    const s = jack.querySelector('.jack-socket')!.getBoundingClientRect();
    return this.toWorld(s.left + s.width / 2, s.top + s.height / 2);
  }

  private makeCableView(color: string): CableView {
    const g = document.createElementNS(SVG, 'g');
    g.classList.add('cable');
    g.style.setProperty('--cable', color);
    const shadow = document.createElementNS(SVG, 'path');
    shadow.classList.add('cable-shadow');
    const path = document.createElementNS(SVG, 'path');
    path.classList.add('cable-body');
    const shine = document.createElementNS(SVG, 'path');
    shine.classList.add('cable-shine');
    const a = document.createElementNS(SVG, 'circle');
    const b = document.createElementNS(SVG, 'circle');
    for (const c of [a, b]) {
      c.classList.add('cable-plug');
      c.setAttribute('r', '7');
    }
    g.append(shadow, path, shine, a, b);
    this.svg.append(g);
    return { g, shadow, path, shine, a, b };
  }

  private drawCable(v: CableView, p1: Pt, p2: Pt): void {
    const d = cablePath(p1, p2);
    v.shadow.setAttribute('d', cablePath({ x: p1.x + 3, y: p1.y + 6 }, { x: p2.x + 3, y: p2.y + 6 }));
    v.path.setAttribute('d', d);
    v.shine.setAttribute('d', d);
    v.a.setAttribute('cx', String(p1.x));
    v.a.setAttribute('cy', String(p1.y));
    v.b.setAttribute('cx', String(p2.x));
    v.b.setAttribute('cy', String(p2.y));
  }

  private addCableView(c: Cable): void {
    const v = this.makeCableView(c.color);
    v.g.dataset.id = c.id;
    this.cableViews.set(c.id, v);
    this.jackEl(c.from.module, c.from.port, 'out')?.classList.add('patched');
    this.jackEl(c.to.module, c.to.port, 'in')?.classList.add('patched');
    this.updateCable(c);
  }

  private removeCableView(id: string): void {
    this.cableViews.get(id)?.g.remove();
    this.cableViews.delete(id);
    this.canvas.querySelectorAll('.jack.patched').forEach((j) => j.classList.remove('patched'));
    for (const c of this.engine.cables.values()) {
      this.jackEl(c.from.module, c.from.port, 'out')?.classList.add('patched');
      this.jackEl(c.to.module, c.to.port, 'in')?.classList.add('patched');
    }
  }

  private updateCable(c: Cable): void {
    const v = this.cableViews.get(c.id);
    const ja = this.jackEl(c.from.module, c.from.port, 'out');
    const jb = this.jackEl(c.to.module, c.to.port, 'in');
    if (!v || !ja || !jb) return;
    this.drawCable(v, this.jackPos(ja), this.jackPos(jb));
  }

  updateCablesFor(modId: string): void {
    for (const c of this.engine.cables.values()) {
      if (c.from.module === modId || c.to.module === modId) this.updateCable(c);
    }
  }

  updateAllCables(): void {
    for (const c of this.engine.cables.values()) this.updateCable(c);
  }

  /* ----------------------------------------------------------- pointer */
  private onContextMenu(e: MouseEvent): void {
    const jack = (e.target as HTMLElement).closest<HTMLElement>('.jack');
    if (!jack) return;
    e.preventDefault();
    const { mod, port, dir } = jack.dataset as { mod: string; port: string; dir: 'in' | 'out' };
    for (const c of this.engine.cablesAt(mod, port, dir)) this.engine.disconnect(c.id);
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 1) return;
    const target = e.target as HTMLElement;
    const jack = target.closest<HTMLElement>('.jack');
    if (jack && e.button === 0) return this.startCableDrag(e, jack);
    const head = target.closest<HTMLElement>('.module-head');
    if (head && e.button === 0) return this.startModuleDrag(e, head.parentElement as HTMLElement);
    if (e.button === 1 || !target.closest('.module')) return this.startPan(e);
  }

  private startPan(e: PointerEvent): void {
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const sl = this.viewport.scrollLeft;
    const st = this.viewport.scrollTop;
    this.viewport.classList.add('panning');
    const move = (ev: PointerEvent) => {
      this.viewport.scrollLeft = sl - (ev.clientX - sx);
      this.viewport.scrollTop = st - (ev.clientY - sy);
    };
    const up = () => {
      this.viewport.classList.remove('panning');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Drag a panel along the rails: snaps to whole HP and rows, never overlaps another module. */
  private startModuleDrag(e: PointerEvent, el: HTMLElement): void {
    e.preventDefault();
    const id = el.dataset.id!;
    const inst = this.engine.modules.get(id);
    if (!inst) return;
    el.style.zIndex = String(++this.zTop);
    el.classList.add('dragging');
    const start = this.toWorld(e.clientX, e.clientY);
    const grabX = start.x - hpLeft(inst.hp);
    const grabY = start.y - rowTop(inst.row);
    const ghost = document.createElement('div');
    ghost.className = 'slot-ghost';
    ghost.style.width = `${inst.spec.hp * HP_PX}px`;
    ghost.style.height = `${U3_PX}px`;
    this.canvas.append(ghost);
    const showGhost = (row: number, hp: number, ok: boolean) => {
      ghost.style.left = `${hpLeft(hp)}px`;
      ghost.style.top = `${rowTop(row)}px`;
      ghost.classList.toggle('blocked', !ok);
    };
    showGhost(inst.row, inst.hp, true);

    const move = (ev: PointerEvent) => {
      const p = this.toWorld(ev.clientX, ev.clientY);
      const row = Math.round((p.y - grabY - rowTop(0)) / ROW_PITCH);
      const hp = Math.round((p.x - grabX - hpLeft(0)) / HP_PX);
      const r = Math.max(0, Math.min(this.engine.rows - 1, row));
      const h = Math.max(0, Math.min(CASE_HP - inst.spec.hp, hp));
      const ok = this.fits(r, h, inst.spec.hp, id);
      showGhost(r, h, ok);
      if (ok && (r !== inst.row || h !== inst.hp)) {
        inst.row = r;
        inst.hp = h;
        this.place(inst, el);
        this.updateCablesFor(id);
      }
    };
    const up = () => {
      el.classList.remove('dragging');
      ghost.remove();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.engine.moved(id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private startCableDrag(e: PointerEvent, jack: HTMLElement): void {
    e.preventDefault();
    e.stopPropagation();
    let { mod, port, dir } = jack.dataset as { mod: string; port: string; dir: 'in' | 'out' };
    let color: string | undefined;

    // Grabbing a patched input picks its cable up (re-route or drop to delete).
    if (dir === 'in') {
      const existing = this.engine.cableAtInput(mod, port);
      if (existing) {
        color = existing.color;
        this.engine.disconnect(existing.id);
        mod = existing.from.module;
        port = existing.from.port;
        dir = 'out';
      }
    }
    color ??= this.engine.nextColor();
    const fixedJack = this.jackEl(mod, port, dir);
    if (!fixedJack) return;
    const fixedPos = this.jackPos(fixedJack);

    const temp = this.makeCableView(color);
    temp.g.classList.add('cable-temp');
    this.canvas.classList.add(dir === 'out' ? 'seek-in' : 'seek-out');
    let hover: HTMLElement | null = null;

    const valid = (j: HTMLElement | null): j is HTMLElement => !!j && j.dataset.dir !== dir;
    const draw = (ev: PointerEvent) => {
      const p = this.toWorld(ev.clientX, ev.clientY);
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.jack') ?? null;
      hover?.classList.remove('hover-target');
      hover = valid(under) ? under : null;
      hover?.classList.add('hover-target');
      const end = hover ? this.jackPos(hover) : p;
      if (dir === 'out') this.drawCable(temp, fixedPos, end);
      else this.drawCable(temp, end, fixedPos);
    };
    draw(e);

    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', draw);
      window.removeEventListener('pointerup', up);
      this.canvas.classList.remove('seek-in', 'seek-out');
      hover?.classList.remove('hover-target');
      temp.g.remove();
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.jack') ?? null;
      if (!valid(under)) return;
      const other = under.dataset as { mod: string; port: string };
      if (dir === 'out') this.engine.connect(mod, port, other.mod, other.port, color);
      else this.engine.connect(other.mod, other.port, mod, port, color);
    };
    window.addEventListener('pointermove', draw);
    window.addEventListener('pointerup', up);
  }
}
