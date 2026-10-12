import type { AudioFactory, BaseAudioContextLike, BufferDataLike, BufferLike, FilterLike, GainLike, NodeLike, OscLike, ParamLike } from '../audio';

export interface ParamEvent { readonly op: 'set' | 'lin' | 'exp'; readonly value: number; readonly time: number }

export class FakeParam implements ParamLike {
  readonly events: ParamEvent[] = [];
  setValueAtTime(value: number, time: number): void { this.events.push({ op: 'set', value, time }); }
  linearRampToValueAtTime(value: number, time: number): void { this.events.push({ op: 'lin', value, time }); }
  exponentialRampToValueAtTime(value: number, time: number): void { this.events.push({ op: 'exp', value, time }); }
}

export class FakeBufferData implements BufferDataLike {
  readonly channels: Float32Array[];
  constructor(channels: number, readonly length: number, readonly sampleRate: number) {
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(channel: number): Float32Array { return this.channels[channel]!; }
}

class FakeBase {
  readonly outs: FakeNode[] = [];
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  connect(dest: NodeLike): void { this.outs.push(dest as FakeNode); }
  start(when = 0): void { this.starts.push(when); }
  stop(when = 0): void { this.stops.push(when); }
}

export class FakeOsc extends FakeBase implements OscLike {
  readonly kind = 'osc' as const;
  type = 'sine';
  readonly frequency = new FakeParam();
}

export class FakeGain extends FakeBase implements GainLike {
  readonly kind = 'gain' as const;
  readonly gain = new FakeParam();
}

export class FakeFilter extends FakeBase implements FilterLike {
  readonly kind = 'filter' as const;
  type = 'lowpass';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

export class FakeBufferSource extends FakeBase implements BufferLike {
  readonly kind = 'buffer' as const;
  buffer: BufferDataLike | null = null;
  loop = false;
}

export class FakeDest extends FakeBase {
  readonly kind = 'dest' as const;
}

export type FakeNode = FakeOsc | FakeGain | FakeFilter | FakeBufferSource | FakeDest;

export class FakeContext implements BaseAudioContextLike {
  readonly sampleRate = 44100;
  readonly destination = new FakeDest();
  readonly nodes: FakeNode[] = [];
  suspends = 0;
  resumes = 0;
  constructor(readonly clock: { t: number }) {}
  get currentTime(): number { return this.clock.t; }
  suspend(): void { this.suspends += 1; }
  resume(): void { this.resumes += 1; }
  createOscillator(): FakeOsc {
    const node = new FakeOsc();
    this.nodes.push(node);
    return node;
  }
  createGain(): FakeGain {
    const node = new FakeGain();
    this.nodes.push(node);
    return node;
  }
  createBiquadFilter(): FakeFilter {
    const node = new FakeFilter();
    this.nodes.push(node);
    return node;
  }
  createBufferSource(): FakeBufferSource {
    const node = new FakeBufferSource();
    this.nodes.push(node);
    return node;
  }
  createBuffer(channels: number, length: number, sampleRate: number): FakeBufferData {
    return new FakeBufferData(channels, length, sampleRate);
  }
}

export function createFakeAudio(): { clock: { t: number }; ctx: FakeContext; factory: AudioFactory; order: string[] } {
  const clock = { t: 0 };
  const ctx = new FakeContext(clock);
  const order: string[] = [];
  const factory: AudioFactory = {
    configureSession() { order.push('session'); },
    createContext() { order.push('context'); return ctx; },
  };
  return { clock, ctx, factory, order };
}
