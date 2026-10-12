import { Kind } from './levels';
import type { EventName, EventOf } from './sim';

export type Wave = 'square' | 'sawtooth' | 'triangle' | 'sine' | 'noise';
export interface Env { readonly a: number; readonly d: number; readonly s: number; readonly r: number } // seconds; s is level 0..1
export interface Patch {
  readonly wave: Wave; readonly gain: number; readonly env: Env;
  readonly detune?: number;                                    // cents; adds a second oscillator
  readonly filter?: { readonly type: 'lowpass' | 'highpass' | 'bandpass'; readonly hz: number; readonly q: number; readonly envHz?: number };
  readonly sweep?: { readonly semis: number; readonly time: number }; // pitch drop for lasers and kicks
}
export const PATCHES = {
  lead: { wave: 'square', gain: 0.18, env: { a: 0.005, d: 0.08, s: 0.5, r: 0.06 }, detune: 7 },
  bass: { wave: 'sawtooth', gain: 0.22, env: { a: 0.005, d: 0.1, s: 0.6, r: 0.05 }, filter: { type: 'lowpass', hz: 600, q: 4, envHz: 900 } },
  kick: { wave: 'sine', gain: 0.6, env: { a: 0.001, d: 0.18, s: 0, r: 0.02 }, sweep: { semis: -24, time: 0.08 } },
  hat: { wave: 'noise', gain: 0.12, env: { a: 0.001, d: 0.04, s: 0, r: 0.01 }, filter: { type: 'highpass', hz: 7000, q: 1 } },
  zap: { wave: 'square', gain: 0.15, env: { a: 0.001, d: 0.07, s: 0, r: 0.02 }, sweep: { semis: -18, time: 0.07 } },
  boom: { wave: 'noise', gain: 0.5, env: { a: 0.001, d: 0.45, s: 0, r: 0.1 }, filter: { type: 'lowpass', hz: 1200, q: 1, envHz: -1000 } },
  chime: { wave: 'triangle', gain: 0.25, env: { a: 0.002, d: 0.2, s: 0.2, r: 0.2 } },
} as const satisfies Record<string, Patch>;
export type PatchId = keyof typeof PATCHES;

export interface SfxNote { readonly at: number; readonly midi: number; readonly dur: number }
/** maxVoices caps concurrent instances, so rapid fire cannot pile up audio nodes. */
export interface Sfx { readonly patch: PatchId; readonly notes: readonly SfxNote[]; readonly maxVoices: number }
export type SfxId = 'laser' | 'hit' | 'explode' | 'pickup' | 'shield' | 'complete' | 'gameover' | 'tap';
export const SFX: { readonly [S in SfxId]: Sfx } = {
  laser: { patch: 'zap', notes: [{ at: 0, midi: 84, dur: 0.07 }], maxVoices: 4 },
  hit: { patch: 'zap', notes: [{ at: 0, midi: 60, dur: 0.05 }], maxVoices: 4 },
  explode: { patch: 'boom', notes: [{ at: 0, midi: 36, dur: 0.4 }], maxVoices: 3 },
  pickup: { patch: 'chime', notes: [{ at: 0, midi: 79, dur: 0.15 }], maxVoices: 2 },
  shield: { patch: 'chime', notes: [{ at: 0, midi: 67, dur: 0.2 }], maxVoices: 1 },
  complete: { patch: 'lead', notes: [{ at: 0, midi: 72, dur: 0.4 }], maxVoices: 1 },
  gameover: { patch: 'lead', notes: [{ at: 0, midi: 48, dur: 0.5 }], maxVoices: 1 },
  tap: { patch: 'hat', notes: [{ at: 0, midi: 96, dur: 0.03 }], maxVoices: 2 },
};

export type MusicId = 'tier1' | 'tier2' | 'tier3' | 'boss';
/** One token per 16th note: "C4" strike, "-" hold, "." rest. All voices of a song have equal token counts. */
export interface Voice { readonly patch: PatchId; readonly steps: string }
export interface Song { readonly bpm: number; readonly voices: readonly Voice[] }
export const SONGS: { readonly [M in MusicId]: Song } = {
  tier1: { bpm: 120, voices: [{ patch: 'bass', steps: 'C2 - . . C2 - . .' }] },
  tier2: { bpm: 128, voices: [{ patch: 'bass', steps: 'D2 - . . D2 - . .' }] },
  tier3: { bpm: 136, voices: [{ patch: 'bass', steps: 'E2 - . . E2 - . .' }] },
  boss: { bpm: 144, voices: [{ patch: 'bass', steps: 'A1 - . . A1 - . .' }] },
};

/** Exhaustive over SimEvent. Adding an event fails the build here until it is given a sound or null. */
export const EVENT_SFX: { readonly [E in EventName]: (ev: EventOf<E>) => SfxId | null } = {
  start: () => null, fire: () => 'laser', enemyFire: () => null, hit: () => 'hit', destroy: () => 'explode',
  pickup: (ev) => (ev.kind === Kind.Shield ? 'shield' : 'pickup'), shieldBlock: () => 'shield', playerHit: () => 'explode',
  bossEnter: () => null, wormholeOpen: () => 'pickup', won: () => 'complete', lost: () => 'gameover',
};
