export type Category =
  'Sources' | 'Filters' | 'Amps & Mixers' | 'Modulation' | 'Sequencing' | 'Effects' | 'Utilities' | 'I/O';

export type PortKind = 'audio' | 'cv' | 'gate';

export interface PortSpec {
  id: string;
  label: string;
  kind: PortKind;
}

export interface ParamSpec {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
  /** 'exp' maps the knob logarithmically (min must be > 0). */
  curve?: 'lin' | 'exp';
  step?: number;
  unit?: string;
  control?: 'knob' | 'switch' | 'toggle';
  options?: string[];
  size?: 'sm' | 'md' | 'lg';
  /** Rendered by the module's custom UI instead of the generic param grid. */
  custom?: boolean;
}

export type InputTarget = { node: AudioNode; index?: number } | { param: AudioParam };

export interface OutputSource {
  node: AudioNode;
  index?: number;
}

export interface ModuleAudio {
  inputs: Record<string, InputTarget>;
  outputs: Record<string, OutputSource>;
  setParam(id: string, value: number, immediate?: boolean): void;
  /** Called when a cable is (un)plugged from one of this module's inputs. */
  onPatch?(inputId: string, connected: boolean): void;
  port?: MessagePort;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extras?: any;
  dispose(): void;
}

export interface UIHooks {
  /** Called every animation frame while the module exists. */
  frame?(): void;
  dispose?(): void;
}

export interface UIHelpers {
  knob(paramId: string, size?: 'sm' | 'md' | 'lg'): HTMLElement;
  toggle(paramId: string): HTMLElement;
  switcher(paramId: string): HTMLElement;
  setParam(paramId: string, value: number): void;
}

export interface ModuleSpec {
  type: string;
  name: string;
  category: Category;
  description: string;
  /** Panel width in Eurorack HP (1 HP = 5.08 mm). All panels are 3U tall. */
  hp: number;
  inputs: PortSpec[];
  outputs: PortSpec[];
  params: ParamSpec[];
  create(ctx: AudioContext, sink: AudioNode): ModuleAudio;
  ui?(body: HTMLElement, inst: ModuleInstance, h: UIHelpers): UIHooks | void;
  uiPosition?: 'before' | 'after';
}

export interface ModuleInstance {
  id: string;
  type: string;
  spec: ModuleSpec;
  audio: ModuleAudio;
  params: Record<string, number>;
  /** Case row (0-based) the module is mounted in. */
  row: number;
  /** Horizontal position in HP from the left rail end. */
  hp: number;
}

export interface CableEnd {
  module: string;
  port: string;
}

export interface Cable {
  id: string;
  from: CableEnd;
  to: CableEnd;
  color: string;
}

export interface PatchData {
  version: 1;
  name?: string;
  /** Number of 3U rows in the case. */
  rows?: number;
  modules: { id: string; type: string; row: number; hp: number; params?: Record<string, number> }[];
  cables: { from: CableEnd; to: CableEnd; color?: string }[];
}
