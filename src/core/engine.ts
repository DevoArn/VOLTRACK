import { REGISTRY } from '../modules';
import type { Cable, InputTarget, ModuleInstance, OutputSource, PatchData } from './types';

export type EngineEvent =
  | { type: 'moduleAdded'; inst: ModuleInstance }
  | { type: 'moduleRemoved'; id: string }
  | { type: 'cableAdded'; cable: Cable }
  | { type: 'cableRemoved'; cable: Cable }
  | { type: 'param'; id: string; param: string; value: number }
  | { type: 'moved'; id: string }
  | { type: 'case'; rows: number }
  | { type: 'loaded' };

type Listener = (e: EngineEvent) => void;

export const CABLE_COLORS = ['#ff0000', '#0000ff', '#00aa00', '#ff00ff', '#ff9900', '#00cccc', '#cccc00', '#800080'];

function wire(src: OutputSource, dst: InputTarget): void {
  if ('param' in dst) src.node.connect(dst.param, src.index ?? 0);
  else src.node.connect(dst.node, src.index ?? 0, dst.index ?? 0);
}

function unwire(src: OutputSource, dst: InputTarget): void {
  try {
    if ('param' in dst) src.node.disconnect(dst.param, src.index ?? 0);
    else src.node.disconnect(dst.node, src.index ?? 0, dst.index ?? 0);
  } catch {
    /* not connected */
  }
}

export class Engine {
  ctx!: AudioContext;
  sink!: GainNode;
  readonly modules = new Map<string, ModuleInstance>();
  readonly cables = new Map<string, Cable>();
  private listeners = new Set<Listener>();
  private nextId = 1;
  private colorIdx = 0;
  /** Number of 3U rows in the virtual Eurorack case. */
  rows = 3;

  async init(): Promise<void> {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    if (!this.ctx.audioWorklet) {
      throw new Error(
        'AudioWorklet is unavailable. Open the app via http://localhost or HTTPS (secure context required).',
      );
    }
    await this.ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/synth-processors.js`);
    // Silent sink that keeps unpatched nodes processing.
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.sink.connect(this.ctx.destination);
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: EngineEvent): void {
    for (const l of this.listeners) l(e);
  }

  private genId(prefix: string): string {
    return `${prefix}${this.nextId++}`;
  }

  nextColor(): string {
    const c = CABLE_COLORS[this.colorIdx % CABLE_COLORS.length];
    this.colorIdx++;
    return c;
  }

  setRows(n: number): void {
    this.rows = Math.max(1, Math.min(8, Math.round(n)));
    this.emit({ type: 'case', rows: this.rows });
  }

  addModule(type: string, row: number, hp: number, params: Record<string, number> = {}, id?: string): ModuleInstance {
    const spec = REGISTRY.get(type);
    if (!spec) throw new Error(`Unknown module type: ${type}`);
    const audio = spec.create(this.ctx, this.sink);
    const values: Record<string, number> = {};
    for (const p of spec.params) {
      const v = params[p.id];
      values[p.id] = typeof v === 'number' && Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
      audio.setParam(p.id, values[p.id], true);
    }
    const inst: ModuleInstance = { id: id ?? this.genId('m'), type, spec, audio, params: values, row, hp };
    this.modules.set(inst.id, inst);
    this.emit({ type: 'moduleAdded', inst });
    return inst;
  }

  removeModule(id: string): void {
    const inst = this.modules.get(id);
    if (!inst) return;
    for (const c of [...this.cables.values()]) {
      if (c.from.module === id || c.to.module === id) this.disconnect(c.id);
    }
    inst.audio.dispose();
    this.modules.delete(id);
    this.emit({ type: 'moduleRemoved', id });
  }

  setParam(modId: string, param: string, value: number): void {
    const inst = this.modules.get(modId);
    if (!inst) return;
    inst.params[param] = value;
    inst.audio.setParam(param, value);
    this.emit({ type: 'param', id: modId, param, value });
  }

  moved(modId: string): void {
    this.emit({ type: 'moved', id: modId });
  }

  cableAtInput(mod: string, port: string): Cable | undefined {
    for (const c of this.cables.values()) if (c.to.module === mod && c.to.port === port) return c;
    return undefined;
  }

  cablesAt(mod: string, port: string, dir: 'in' | 'out'): Cable[] {
    return [...this.cables.values()].filter((c) =>
      dir === 'in' ? c.to.module === mod && c.to.port === port : c.from.module === mod && c.from.port === port,
    );
  }

  connect(fromMod: string, fromPort: string, toMod: string, toPort: string, color?: string): Cable | null {
    const a = this.modules.get(fromMod);
    const b = this.modules.get(toMod);
    const src = a?.audio.outputs[fromPort];
    const dst = b?.audio.inputs[toPort];
    if (!a || !b || !src || !dst) return null;
    const existing = this.cableAtInput(toMod, toPort);
    if (existing) {
      if (existing.from.module === fromMod && existing.from.port === fromPort) return existing;
      this.disconnect(existing.id);
    }
    wire(src, dst);
    const cable: Cable = {
      id: this.genId('c'),
      from: { module: fromMod, port: fromPort },
      to: { module: toMod, port: toPort },
      color: color ?? this.nextColor(),
    };
    this.cables.set(cable.id, cable);
    b.audio.onPatch?.(toPort, true);
    this.emit({ type: 'cableAdded', cable });
    return cable;
  }

  disconnect(cableId: string): void {
    const c = this.cables.get(cableId);
    if (!c) return;
    const a = this.modules.get(c.from.module);
    const b = this.modules.get(c.to.module);
    const src = a?.audio.outputs[c.from.port];
    const dst = b?.audio.inputs[c.to.port];
    if (src && dst) unwire(src, dst);
    this.cables.delete(cableId);
    b?.audio.onPatch?.(c.to.port, false);
    this.emit({ type: 'cableRemoved', cable: c });
  }

  clear(): void {
    for (const id of [...this.modules.keys()]) this.removeModule(id);
  }

  serialize(name?: string): PatchData {
    return {
      version: 1,
      name,
      rows: this.rows,
      modules: [...this.modules.values()].map((m) => ({
        id: m.id,
        type: m.type,
        row: m.row,
        hp: m.hp,
        params: { ...m.params },
      })),
      cables: [...this.cables.values()].map((c) => ({ from: { ...c.from }, to: { ...c.to }, color: c.color })),
    };
  }

  load(patch: PatchData): void {
    this.clear();
    const needRows = Math.max(0, ...patch.modules.map((m) => (m.row ?? 0) + 1));
    this.setRows(Math.max(patch.rows ?? 3, needRows));
    let maxId = 0;
    for (const m of patch.modules) {
      const n = Number.parseInt(m.id.replace(/\D/g, ''), 10);
      if (Number.isFinite(n)) maxId = Math.max(maxId, n);
    }
    this.nextId = Math.max(this.nextId, maxId + 1);
    for (const m of patch.modules) {
      if (!REGISTRY.has(m.type)) continue;
      this.addModule(m.type, m.row ?? 0, m.hp ?? 0, m.params ?? {}, m.id);
    }
    for (const c of patch.cables) this.connect(c.from.module, c.from.port, c.to.module, c.to.port, c.color);
    this.emit({ type: 'loaded' });
  }
}
