import { createRequire } from 'node:module';
import type { SimEvent } from './sim';
import { tierOf } from './levels';
import {
  EVENT_SFX, SFX, SONGS, patchOf,
  type Env, type MusicId, type Patch, type PatchId, type Sfx, type SfxId, type Song,
} from './sound';

const requireRn = createRequire(import.meta.url);

/** exponentialRampToValueAtTime rejects 0. The envelope uses this floor instead of silence. */
export const AMP_FLOOR = 0.0001;
const AHEAD = 0.12;
const TICK_MS = 25;

const TIER_SONG = { 1: 'tier1', 2: 'tier2', 3: 'tier3' } as const;

export interface ParamLike {
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  exponentialRampToValueAtTime(value: number, endTime: number): void;
}
export interface NodeLike { connect(dest: NodeLike): void }
export interface ScheduledLike extends NodeLike {
  start(when?: number): void;
  stop(when?: number): void;
}
export interface OscLike extends ScheduledLike {
  type: string;
  readonly frequency: ParamLike;
}
export interface BufferDataLike { getChannelData(channel: number): Float32Array }
export interface BufferLike extends ScheduledLike {
  buffer: BufferDataLike | null;
  loop: boolean;
}
export interface GainLike extends NodeLike { readonly gain: ParamLike }
export interface FilterLike extends NodeLike {
  type: string;
  readonly frequency: ParamLike;
  readonly Q: ParamLike;
}
export interface BaseAudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: NodeLike;
  createOscillator(): OscLike;
  createGain(): GainLike;
  createBiquadFilter(): FilterLike;
  createBufferSource(): BufferLike;
  createBuffer(channels: number, length: number, sampleRate: number): BufferDataLike;
  suspend(): void | Promise<void>;
  resume(): void | Promise<void>;
}
export interface AudioFactory {
  createContext(): BaseAudioContextLike;
  configureSession(): void;
}

export interface Cell { readonly patch: PatchId; readonly midi: number; readonly dur: number }
export interface Hit { readonly patch: PatchId; readonly midi: number; readonly when: number; readonly dur: number }

type Token = { readonly k: 'note'; readonly midi: number } | { readonly k: 'hold' } | { readonly k: 'rest' };

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function parseToken(tok: string): Token {
  if (tok === '-') return { k: 'hold' };
  if (tok === '.') return { k: 'rest' };
  const m = /^([A-G])(#|b)?([0-8])$/.exec(tok);
  if (!m) throw new Error(`bad token ${tok}`);
  let semi = SEMI[m[1]!]!;
  if (m[2] === '#') semi += 1;
  else if (m[2] === 'b') semi -= 1;
  return { k: 'note', midi: (Number(m[3]) + 1) * 12 + semi };
}

export function parseSteps(steps: string): Token[] {
  return steps.trim().split(/\s+/).filter((tok) => tok.length > 0).map(parseToken);
}

function spansOf(steps: readonly Token[]): { index: number; midi: number; durSteps: number }[] {
  const out: { index: number; midi: number; durSteps: number }[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (step.k !== 'note') continue;
    let durSteps = 1;
    while (i + durSteps < steps.length && steps[i + durSteps]!.k === 'hold') durSteps += 1;
    out.push({ index: i, midi: step.midi, durSteps });
  }
  return out;
}

export function songColumns(song: Song): Cell[][] {
  const parsed = song.voices.map((voice) => parseSteps(voice.steps));
  const n = parsed[0]?.length ?? 0;
  if (n === 0 || parsed.some((steps) => steps.length !== n)) throw new Error(`unequal voices in song at ${song.bpm} bpm`);
  const stepDur = 60 / song.bpm / 4;
  const cols: Cell[][] = Array.from({ length: n }, () => []);
  parsed.forEach((steps, vi) => {
    const patch = song.voices[vi]!.patch;
    for (const span of spansOf(steps)) {
      cols[span.index]!.push({ patch, midi: span.midi, dur: span.durSteps * stepDur });
    }
  });
  return cols;
}

export function songHits(song: Song): Hit[] {
  const stepDur = 60 / song.bpm / 4;
  const hits: Hit[] = [];
  songColumns(song).forEach((col, index) => {
    for (const cell of col) hits.push({ patch: cell.patch, midi: cell.midi, when: index * stepDur, dur: cell.dur });
  });
  return hits;
}

export function sfxHits(sfx: Sfx): Hit[] {
  return sfx.notes.map((note) => ({ patch: sfx.patch, midi: note.midi, when: note.at, dur: note.dur }));
}

interface EnvelopePlan {
  readonly floor: number; readonly top: number; readonly sus: number;
  readonly t0: number; readonly tA: number; readonly tD: number; readonly tEnd: number; readonly tR: number;
}

export function envelopePlan(when: number, dur: number, env: Env, peak: number): EnvelopePlan {
  const floor = AMP_FLOOR;
  const top = Math.max(peak, floor);
  const sus = Math.max(env.s * peak, floor);
  const t0 = when;
  const tEnd = when + Math.max(dur, 0.001);
  const tA = Math.min(t0 + env.a, tEnd);
  const tD = Math.min(tA + env.d, tEnd);
  const tR = tEnd + Math.max(env.r, 0.001);
  return { floor, top, sus, t0, tA, tD, tEnd, tR };
}

export function ampAt(t: number, dur: number, env: Env, peak: number): number {
  const p = envelopePlan(0, dur, env, peak);
  if (t < 0 || t >= p.tR) return 0;
  if (t < p.tA && p.tA > p.t0) return p.floor * (p.top / p.floor) ** (t / p.tA);
  if (t < p.tD && p.tD > p.tA) return p.top * (p.sus / p.top) ** ((t - p.tA) / (p.tD - p.tA));
  if (t < p.tEnd) return p.sus;
  return p.sus * (p.floor / p.sus) ** ((t - p.tEnd) / (p.tR - p.tEnd));
}

export function pitchAt(t: number, midi: number, sweep: Patch['sweep'], cents = 0): number {
  const f0 = midiHz(midi) * 2 ** (cents / 1200);
  if (!sweep || sweep.time <= 0) return f0;
  const f1 = f0 * 2 ** (sweep.semis / 12);
  const u = Math.min(Math.max(t, 0) / sweep.time, 1);
  return f0 * (f1 / f0) ** u;
}

export function cutoffAt(t: number, filter: NonNullable<Patch['filter']>, env: Env): number {
  const f0 = Math.max(20, filter.hz);
  if (filter.envHz === undefined) return f0;
  const f1 = Math.max(20, filter.hz + filter.envHz);
  const span = Math.max(env.a + env.d, 0.001);
  const u = Math.min(Math.max(t, 0), span) / span;
  return f0 * (f1 / f0) ** u;
}

function applyEnvelope(param: ParamLike, plan: EnvelopePlan): void {
  param.setValueAtTime(plan.floor, plan.t0);
  if (plan.tA > plan.t0) param.exponentialRampToValueAtTime(plan.top, plan.tA);
  if (plan.tD > plan.tA) param.exponentialRampToValueAtTime(plan.sus, plan.tD);
  if (plan.tEnd > plan.tD) param.setValueAtTime(plan.sus, plan.tEnd);
  param.exponentialRampToValueAtTime(plan.floor, plan.tR);
}

function schedulePitch(param: ParamLike, midi: number, when: number, sweep: Patch['sweep'], cents = 0): void {
  const f0 = midiHz(midi) * 2 ** (cents / 1200);
  param.setValueAtTime(f0, when);
  if (!sweep || sweep.time <= 0) return;
  const f1 = f0 * 2 ** (sweep.semis / 12);
  const at = when + sweep.time;
  if (at > when && f1 > 0) param.exponentialRampToValueAtTime(f1, at);
}

function sfxIdFor(ev: SimEvent): SfxId | null {
  switch (ev.e) {
    case 'start': return EVENT_SFX.start(ev);
    case 'fire': return EVENT_SFX.fire(ev);
    case 'enemyFire': return EVENT_SFX.enemyFire(ev);
    case 'hit': return EVENT_SFX.hit(ev);
    case 'destroy': return EVENT_SFX.destroy(ev);
    case 'pickup': return EVENT_SFX.pickup(ev);
    case 'shieldBlock': return EVENT_SFX.shieldBlock(ev);
    case 'playerHit': return EVENT_SFX.playerHit(ev);
    case 'bossEnter': return EVENT_SFX.bossEnter(ev);
    case 'wormholeOpen': return EVENT_SFX.wormholeOpen(ev);
    case 'won': return EVENT_SFX.won(ev);
    case 'lost': return EVENT_SFX.lost(ev);
    default: {
      const neverEv: never = ev;
      return neverEv;
    }
  }
}

interface Voice { until: number; stop(t: number): void }
interface Play {
  origin: number;
  index: number;
  stepDur: number;
  cols: Cell[][];
  voices: Voice[];
}

function loadRn(): typeof import('react-native-audio-api') {
  return requireRn('react-native-audio-api') as typeof import('react-native-audio-api');
}

function defaultFactory(): AudioFactory {
  return {
    configureSession() {
      loadRn().AudioManager.setAudioSessionOptions({ iosCategory: 'playback', iosMode: 'default' });
    },
    createContext() {
      return new (loadRn().AudioContext)();
    },
  };
}

function writeNoise(buffer: BufferDataLike): void {
  const data = buffer.getChannelData(0);
  let s = 0x6d2b79f5;
  for (let i = 0; i < data.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    data[i] = (s / 4294967296) * 2 - 1;
  }
}

/**
 * The one synth engine and the single owner of music state. It owns the AudioContext, a noise buffer, voice caps,
 * and a 25 ms lookahead sequencer that schedules 120 ms ahead on ctx.currentTime.
 */
export interface AudioEngine {
  /** Every SimEvent of the frame. SFX come from EVENT_SFX. start picks the tier song, bossEnter picks the boss song, and won or lost stops music. */
  events(evs: readonly SimEvent[]): void;
  /** Out-of-run cues from menus. */
  ui(cue: 'tap' | 'menu-music' | 'silence'): void;
  mix(m: { readonly music: boolean; readonly sfx: boolean }): void;
  /** Pause or app background. Suspends the context and the sequencer clock together. */
  active(on: boolean): void;
}

/** Sets AudioManager session options before new AudioContext(), so sound plays with the mute switch on. */
export function createAudio(factory: AudioFactory = defaultFactory()): AudioEngine {
  factory.configureSession();
  const ctx = factory.createContext();
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  writeNoise(noise);
  const musicGain = ctx.createGain();
  const sfxGain = ctx.createGain();
  musicGain.connect(ctx.destination);
  sfxGain.connect(ctx.destination);
  musicGain.gain.setValueAtTime(1, ctx.currentTime);
  sfxGain.gain.setValueAtTime(1, ctx.currentTime);

  const capped = new Map<SfxId, Voice[]>();
  let music: Play | null = null;
  let awake = true;
  let timer: ReturnType<typeof setInterval> | null = null;

  function playCell(cell: Cell, when: number, bus: GainLike): Voice {
    const patch = patchOf(cell.patch);
    const gain = ctx.createGain();
    const plan = envelopePlan(when, cell.dur, patch.env, patch.gain);
    applyEnvelope(gain.gain, plan);
    let tail: NodeLike = gain;
    if (patch.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = patch.filter.type;
      filter.Q.setValueAtTime(patch.filter.q, when);
      const startHz = Math.max(20, patch.filter.hz);
      filter.frequency.setValueAtTime(startHz, when);
      if (patch.filter.envHz !== undefined) {
        const targetHz = Math.max(20, patch.filter.hz + patch.filter.envHz);
        const at = when + Math.max(patch.env.a + patch.env.d, 0.001);
        if (targetHz !== startHz) filter.frequency.exponentialRampToValueAtTime(targetHz, at);
      }
      filter.connect(gain);
      tail = filter;
    }
    const sources: ScheduledLike[] = [];
    const arm = (src: ScheduledLike) => {
      src.connect(tail);
      src.start(when);
      src.stop(plan.tR);
      sources.push(src);
    };
    if (patch.wave === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      arm(src);
    } else {
      const osc = ctx.createOscillator();
      osc.type = patch.wave;
      schedulePitch(osc.frequency, cell.midi, when, patch.sweep);
      arm(osc);
      if (patch.detune !== undefined) {
        const second = ctx.createOscillator();
        second.type = patch.wave;
        schedulePitch(second.frequency, cell.midi, when, patch.sweep, patch.detune);
        arm(second);
      }
    }
    gain.connect(bus);
    return {
      until: plan.tR,
      // A later stop() overwrites stopTime_ in react-native-audio-api, which is how a voice cap cuts a note.
      stop(t: number) { for (const src of sources) src.stop(t); },
    };
  }

  function playSfx(id: SfxId, when: number): void {
    const sfx = SFX[id];
    const list = (capped.get(id) ?? []).filter((voice) => voice.until > when);
    while (list.length >= sfx.maxVoices) list.shift()!.stop(when);
    let until = when;
    const stops: Array<(t: number) => void> = [];
    for (const note of sfx.notes) {
      const voice = playCell({ patch: sfx.patch, midi: note.midi, dur: note.dur }, when + note.at, sfxGain);
      until = Math.max(until, voice.until);
      stops.push(voice.stop);
    }
    list.push({ until, stop(t) { for (const stop of stops) stop(t); } });
    capped.set(id, list);
  }

  function stopMusic(t: number): void {
    const play = music;
    music = null;
    if (!play) return;
    for (const voice of play.voices) voice.stop(t);
  }

  function pump(): void {
    const play = music;
    if (!play || !awake) return;
    const now = ctx.currentTime;
    play.voices = play.voices.filter((voice) => voice.until > now);
    const horizon = now + AHEAD;
    const n = play.cols.length;
    while (play.origin + play.index * play.stepDur < horizon) {
      const when = play.origin + play.index * play.stepDur;
      for (const cell of play.cols[play.index % n] ?? []) play.voices.push(playCell(cell, when, musicGain));
      play.index += 1;
    }
  }

  function begin(id: MusicId): void {
    const t = ctx.currentTime;
    stopMusic(t);
    const song = SONGS[id];
    music = { origin: t, index: 0, stepDur: 60 / song.bpm / 4, cols: songColumns(song), voices: [] };
    pump();
  }

  function arm(): void {
    if (timer !== null) return;
    timer = setInterval(() => pump(), TICK_MS);
  }
  function disarm(): void {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  arm();
  return {
    events(evs) {
      for (const ev of evs) {
        const id = sfxIdFor(ev);
        if (id) playSfx(id, ctx.currentTime);
        if (ev.e === 'start') begin(TIER_SONG[tierOf(ev.level)]);
        else if (ev.e === 'bossEnter') begin('boss');
        else if (ev.e === 'won' || ev.e === 'lost') stopMusic(ctx.currentTime);
      }
    },
    ui(cue) {
      if (cue === 'tap') playSfx('tap', ctx.currentTime);
      else if (cue === 'menu-music') begin('tier1');
      else stopMusic(ctx.currentTime);
    },
    mix(m) {
      const t = ctx.currentTime;
      musicGain.gain.setValueAtTime(m.music ? 1 : 0, t);
      sfxGain.gain.setValueAtTime(m.sfx ? 1 : 0, t);
    },
    active(on) {
      awake = on;
      if (on) {
        void ctx.resume();
        arm();
        pump();
      } else {
        disarm();
        void ctx.suspend();
      }
    },
  };
}
