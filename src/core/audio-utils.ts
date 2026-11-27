import type { ModuleAudio } from './types';

/** Set an AudioParam with a short smoothing ramp (or instantly). */
export function setAP(ctx: BaseAudioContext, p: AudioParam, v: number, immediate = false, tc = 0.01): void {
  const t = ctx.currentTime;
  p.cancelScheduledValues(t);
  if (immediate) {
    p.setValueAtTime(v, t);
  } else {
    p.setValueAtTime(p.value, t);
    p.setTargetAtTime(v, t, tc);
  }
}

export interface WorkletModule extends ModuleAudio {
  node: AudioWorkletNode;
}

/**
 * Build a ModuleAudio around a single AudioWorkletNode where every named
 * input/output maps to an input/output index of the node.
 */
export function workletModule(
  ctx: AudioContext,
  sink: AudioNode,
  name: string,
  ins: string[],
  outs: string[],
  opts: { discrete?: string[] } = {},
): WorkletModule {
  const node = new AudioWorkletNode(ctx, name, {
    numberOfInputs: ins.length,
    numberOfOutputs: outs.length,
    outputChannelCount: outs.map(() => 1),
    channelCount: 1,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
  });
  // Keep the node pulled by the render graph even when nothing is patched downstream.
  outs.forEach((_, i) => node.connect(sink, i));
  const discrete = new Set(opts.discrete ?? []);
  return {
    node,
    port: node.port,
    inputs: Object.fromEntries(ins.map((id, i) => [id, { node, index: i }])),
    outputs: Object.fromEntries(outs.map((id, i) => [id, { node, index: i }])),
    setParam(id, v, immediate) {
      const p = node.parameters.get(id);
      if (p) setAP(ctx, p, v, immediate || discrete.has(id));
    },
    dispose() {
      node.port.onmessage = null;
      node.disconnect();
    },
  };
}

export function disconnectAll(...nodes: AudioNode[]): void {
  for (const n of nodes) {
    try {
      n.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}
