/**
 * Runs the shipped AudioWorklet files (public/worklets/*.js) inside a Node vm sandbox
 * with a minimal AudioWorkletGlobalScope, so DSP code can be tested without a browser.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const SR = 48000;
export const BLOCK = 128;

export class FakePort {
  sent: unknown[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage(m: unknown): void {
    this.sent.push(m);
  }
  /** Deliver a message from the "main thread" to the processor. */
  deliver(data: unknown): void {
    this.onmessage?.({ data });
  }
  close(): void {}
}

export interface Descriptor {
  name: string;
  defaultValue: number;
  minValue?: number;
  maxValue?: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- processors are untyped JS under test */
export interface Processor {
  port: FakePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean;
  [key: string]: any;
}
export interface ProcessorClass {
  new (): Processor;
  parameterDescriptors?: Descriptor[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function loadWorklet(file: string): Record<string, ProcessorClass> {
  const path = new URL(`../../public/worklets/${file}`, import.meta.url);
  const registry: Record<string, ProcessorClass> = {};
  class AudioWorkletProcessor {
    port = new FakePort();
  }
  const context = vm.createContext({
    AudioWorkletProcessor,
    registerProcessor: (name: string, cls: ProcessorClass) => {
      registry[name] = cls;
    },
    sampleRate: SR,
    currentTime: 0,
    console,
  });
  vm.runInContext(readFileSync(path, 'utf8'), context, { filename: file });
  return registry;
}

/** k-rate parameter arrays from the descriptors, with overrides. */
export function params(cls: ProcessorClass, overrides: Record<string, number> = {}): Record<string, Float32Array> {
  const out: Record<string, Float32Array> = {};
  for (const d of cls.parameterDescriptors ?? []) out[d.name] = new Float32Array([overrides[d.name] ?? d.defaultValue]);
  for (const [k, v] of Object.entries(overrides)) out[k] ??= new Float32Array([v]);
  return out;
}

export function setParam(p: Record<string, Float32Array>, name: string, value: number): void {
  p[name] = new Float32Array([value]);
}

/** A block-sized constant input signal. */
export const dc = (v: number): Float32Array => new Float32Array(BLOCK).fill(v);

export interface RunOptions {
  blocks: number;
  /** Output channel count per output. */
  outputs: number[];
  /** Inputs for block b: one entry per input, each a list of channels ([] = unpatched). */
  inputs?: (b: number) => Float32Array[][];
  params: Record<string, Float32Array>;
  onBlock?: (b: number) => void;
}

/** Render `blocks` render quanta; returns the concatenated signal for every output channel. */
export function render(proc: Processor, o: RunOptions): Float32Array[][] {
  const outs = o.outputs.map((n) => Array.from({ length: n }, () => new Float32Array(BLOCK)));
  const result = o.outputs.map((n) => Array.from({ length: n }, () => new Float32Array(BLOCK * o.blocks)));
  for (let b = 0; b < o.blocks; b++) {
    o.onBlock?.(b);
    const keepAlive = proc.process(o.inputs ? o.inputs(b) : [], outs, o.params);
    if (!keepAlive) throw new Error('processor returned false (would be garbage-collected)');
    outs.forEach((chs, i) => chs.forEach((ch, c) => result[i][c].set(ch, b * BLOCK)));
  }
  return result;
}

export const blocksFor = (seconds: number): number => Math.ceil((seconds * SR) / BLOCK);

/* ------------------------------------------------------------ analysis */
export const peak = (x: Float32Array): number => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
export const allFinite = (x: Float32Array): boolean => x.every((v) => Number.isFinite(v));
export const rms = (x: Float32Array): number => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

export function risingEdges(x: Float32Array, threshold: number): number {
  let n = 0;
  let prev = 0;
  for (const v of x) {
    if (v > threshold && prev <= threshold) n++;
    prev = v;
  }
  return n;
}

/** Fundamental estimate from the span between the first and last rising zero crossings. */
export function frequency(x: Float32Array): number {
  let first = -1;
  let last = -1;
  let n = 0;
  for (let i = 1; i < x.length; i++) {
    if (x[i - 1] < 0 && x[i] >= 0) {
      if (first < 0) first = i;
      last = i;
      n++;
    }
  }
  return n < 2 ? 0 : ((n - 1) * SR) / (last - first);
}

export function sine(freq: number, amp: number, startSample: number): Float32Array {
  const b = new Float32Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) b[i] = amp * Math.sin((2 * Math.PI * freq * (startSample + i)) / SR);
  return b;
}
