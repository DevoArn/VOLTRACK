/**
 * Minimal Web Audio graph fake: records connections so patching logic can be asserted
 * without a browser. Unknown properties resolve to AudioParam-like objects.
 */
export interface FakeParam {
  value: number;
  setValueAtTime(v: number, t: number): void;
  setTargetAtTime(v: number, t: number, tc: number): void;
  cancelScheduledValues(t: number): void;
}

export function fakeParam(): FakeParam {
  const p: FakeParam = {
    value: 0,
    setValueAtTime: (v) => void (p.value = v),
    setTargetAtTime: (v) => void (p.value = v),
    cancelScheduledValues: () => undefined,
  };
  return p;
}

export interface Connection {
  target: unknown;
  output: number;
  input?: number;
}

export class FakeNode {
  connections: Connection[] = [];
  connect<T>(target: T, output = 0, input?: number): T {
    this.connections.push({ target, output, input });
    return target;
  }
  disconnect(target?: unknown, output?: number, input?: number): void {
    if (target === undefined) {
      this.connections = [];
      return;
    }
    const i = this.connections.findIndex(
      (c) =>
        c.target === target &&
        (output === undefined || c.output === output) &&
        (input === undefined || c.input === input),
    );
    if (i < 0) throw new Error('InvalidAccessError: not connected');
    this.connections.splice(i, 1);
  }
  start(): void {}
  stop(): void {}
}

/** A node whose unknown properties (gain, frequency, offset, delayTime…) are lazily created params. */
export function fakeNode(): FakeNode {
  return new Proxy(new FakeNode(), {
    get(target, key, receiver) {
      if (key in target || typeof key === 'symbol') return Reflect.get(target, key, receiver);
      const p = fakeParam();
      Reflect.set(target, key, p);
      return p;
    },
  });
}

export class FakeWorkletNode extends FakeNode {
  readonly params: Record<string, FakeParam> = {};
  readonly parameters = { get: (name: string) => (this.params[name] ??= fakeParam()) };
  readonly port = { postMessage: (): void => undefined, onmessage: null as unknown, close: (): void => undefined };
  constructor(
    _ctx: unknown,
    readonly processorName: string,
    readonly options: unknown,
  ) {
    super();
  }
}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state = 'running';
  destination = fakeNode();
  createGain = fakeNode;
  createConstantSource = fakeNode;
  createDelay = (): FakeNode => fakeNode();
  createBiquadFilter = fakeNode;
  createOscillator = fakeNode;
  createConvolver = fakeNode;
  createChannelSplitter = (): FakeNode => fakeNode();
  createChannelMerger = (): FakeNode => fakeNode();
  createDynamicsCompressor = fakeNode;
  createAnalyser = fakeNode;
  createBuffer(channels: number, length: number, sampleRate: number) {
    return { numberOfChannels: channels, length, sampleRate, getChannelData: () => new Float32Array(length) };
  }
}
