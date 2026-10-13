import { Kind } from '../levels';
import type { EventName, EventOf } from '../sim';

export type Wave = 'square' | 'sawtooth' | 'triangle' | 'sine' | 'noise';
export interface Env { readonly a: number; readonly d: number; readonly s: number; readonly r: number } // seconds; s is level 0..1
export interface Patch {
  readonly wave: Wave; readonly gain: number; readonly env: Env;
  readonly detune?: number;                                    // cents; adds a second oscillator
  readonly filter?: { readonly type: 'lowpass' | 'highpass' | 'bandpass'; readonly hz: number; readonly q: number; readonly envHz?: number };
  readonly sweep?: { readonly semis: number; readonly time: number }; // pitch drop for lasers and kicks
}
export const PATCHES = {
  lead: { wave: 'square', gain: 0.14, env: { a: 0.005, d: 0.09, s: 0.45, r: 0.08 }, detune: 7 },
  bass: { wave: 'sawtooth', gain: 0.22, env: { a: 0.005, d: 0.12, s: 0.55, r: 0.06 }, filter: { type: 'lowpass', hz: 480, q: 3.2, envHz: 820 } },
  kick: { wave: 'sine', gain: 0.55, env: { a: 0.001, d: 0.16, s: 0, r: 0.02 }, sweep: { semis: -24, time: 0.09 } },
  hat: { wave: 'noise', gain: 0.14, env: { a: 0.001, d: 0.035, s: 0, r: 0.012 }, filter: { type: 'highpass', hz: 7000, q: 0.8 } },
  zap: { wave: 'square', gain: 0.16, env: { a: 0.001, d: 0.06, s: 0, r: 0.02 }, sweep: { semis: -18, time: 0.07 } },
  boom: { wave: 'noise', gain: 0.42, env: { a: 0.002, d: 0.38, s: 0, r: 0.12 }, filter: { type: 'lowpass', hz: 1200, q: 0.7, envHz: -1000 } },
  chime: { wave: 'triangle', gain: 0.25, env: { a: 0.002, d: 0.2, s: 0.2, r: 0.2 } },
} as const satisfies Record<string, Patch>;
export type PatchId = keyof typeof PATCHES;

/** Indexing the const table yields a union that hides optional fields. Callers need Patch. */
export function patchOf(id: PatchId): Patch {
  return PATCHES[id];
}

export interface SfxNote { readonly at: number; readonly midi: number; readonly dur: number }
/** maxVoices caps concurrent instances, so rapid fire cannot pile up audio nodes. */
export interface Sfx { readonly patch: PatchId; readonly notes: readonly SfxNote[]; readonly maxVoices: number }
export type SfxId = 'laser' | 'hit' | 'explode' | 'pickup' | 'shield' | 'complete' | 'gameover' | 'tap';
export const SFX: { readonly [S in SfxId]: Sfx } = {
  laser: { patch: 'zap', notes: [{ at: 0, midi: 84, dur: 0.07 }, { at: 0.045, midi: 76, dur: 0.06 }], maxVoices: 4 },
  hit: { patch: 'zap', notes: [{ at: 0, midi: 50, dur: 0.08 }, { at: 0.03, midi: 38, dur: 0.07 }], maxVoices: 4 },
  explode: { patch: 'boom', notes: [{ at: 0, midi: 40, dur: 0.42 }, { at: 0.04, midi: 28, dur: 0.36 }], maxVoices: 3 },
  pickup: {
    patch: 'chime',
    notes: [{ at: 0, midi: 76, dur: 0.1 }, { at: 0.08, midi: 79, dur: 0.12 }, { at: 0.16, midi: 84, dur: 0.2 }],
    maxVoices: 2,
  },
  shield: { patch: 'chime', notes: [{ at: 0, midi: 72, dur: 0.5 }], maxVoices: 1 },
  complete: {
    patch: 'lead',
    notes: [
      { at: 0, midi: 72, dur: 0.16 },
      { at: 0.14, midi: 76, dur: 0.16 },
      { at: 0.28, midi: 79, dur: 0.18 },
      { at: 0.44, midi: 84, dur: 0.55 },
    ],
    maxVoices: 1,
  },
  gameover: {
    patch: 'lead',
    notes: [
      { at: 0, midi: 68, dur: 0.22 },
      { at: 0.18, midi: 65, dur: 0.22 },
      { at: 0.36, midi: 61, dur: 0.24 },
      { at: 0.56, midi: 54, dur: 0.7 },
    ],
    maxVoices: 1,
  },
  tap: { patch: 'hat', notes: [{ at: 0, midi: 96, dur: 0.03 }], maxVoices: 2 },
};

export type MusicId = 'tier1' | 'tier2' | 'tier3' | 'boss';
/** One token per 16th note: "C4" strike, "-" hold, "." rest. All voices of a song have equal token counts. */
export interface Voice { readonly patch: PatchId; readonly steps: string }
export interface Song { readonly bpm: number; readonly voices: readonly Voice[] }

function bar(
  a: string, b: string, c: string, d: string,
  e: string, f: string, g: string, h: string,
  i: string, j: string, k: string, l: string,
  m: string, n: string, o: string, p: string,
): string {
  return [a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p].join(' ');
}

function track(
  a: string, b: string, c: string, d: string,
  e: string, f: string, g: string, h: string,
): string {
  return [a, b, c, d, e, f, g, h].join(' ');
}

const floor = bar('C2', '.', '.', '.', 'C2', '.', '.', '.', 'C2', '.', '.', '.', 'C2', '.', '.', '.');
const hat8 = bar('C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.');

export const SONGS: { readonly [M in MusicId]: Song } = {
  tier1: {
    bpm: 120,
    voices: [
      { patch: 'lead', steps: track(
        bar('E4', '.', 'G4', '.', 'C5', '.', '.', '.', 'E5', '.', 'D5', '.', 'C5', '.', '.', '.'),
        bar('D5', '.', '.', '.', 'C5', '.', '.', '.', 'B4', '.', '.', '.', 'G4', '.', '.', '.'),
        bar('E4', '.', 'G4', '.', 'C5', '.', 'E5', '.', 'D5', '.', 'C5', '.', 'B4', '.', 'G4', '.'),
        bar('C5', '.', '.', '.', 'G4', '.', '.', '.', 'E4', '.', '.', '.', 'C4', '.', '.', '.'),
        bar('G4', '.', 'A4', '.', 'C5', '.', '.', '.', 'E5', '.', 'D5', '.', 'C5', '.', '.', '.'),
        bar('D5', '.', 'C5', '.', 'B4', '.', 'A4', '.', 'G4', '.', 'E4', '.', 'D4', '.', 'C4', '.'),
        bar('E4', '.', 'G4', '.', 'C5', '.', '.', '.', 'D5', '.', 'B4', '.', 'C5', '.', '.', '.'),
        bar('E4', '.', 'D4', '.', 'C4', '.', '.', '.', 'C4', '.', '.', '.', 'C4', '.', '.', '.'),
      ) },
      { patch: 'bass', steps: track(
        bar('C2', '.', '.', '.', 'C2', '.', '.', '.', 'G2', '.', '.', '.', 'G2', '.', '.', '.'),
        bar('A2', '.', '.', '.', 'A2', '.', '.', '.', 'E2', '.', '.', '.', 'E2', '.', '.', '.'),
        bar('F2', '.', '.', '.', 'F2', '.', '.', '.', 'C2', '.', '.', '.', 'G2', '.', '.', '.'),
        bar('C2', '.', '.', '.', 'E2', '.', '.', '.', 'G2', '.', '.', '.', 'C2', '.', '.', '.'),
        bar('C2', '.', '.', '.', 'C2', '.', '.', '.', 'G2', '.', '.', '.', 'E2', '.', '.', '.'),
        bar('F2', '.', '.', '.', 'F2', '.', '.', '.', 'C2', '.', '.', '.', 'G2', '.', '.', '.'),
        bar('A2', '.', '.', '.', 'F2', '.', '.', '.', 'G2', '.', '.', '.', 'E2', '.', '.', '.'),
        bar('C2', '.', '.', '.', 'G2', '.', '.', '.', 'C2', '.', '.', '.', 'C2', '.', '.', '.'),
      ) },
      { patch: 'kick', steps: track(
        floor, floor, floor,
        bar('C2', '.', '.', '.', 'C2', '.', 'C2', '.', 'C2', '.', '.', '.', 'C2', '.', '.', '.'),
        floor, floor, floor,
        bar('C2', '.', '.', '.', 'C2', '.', 'C2', '.', 'C2', '.', '.', '.', 'C2', '.', '.', '.'),
      ) },
      { patch: 'hat', steps: track(
        hat8, hat8, hat8,
        bar('C6', '.', 'C6', '.', 'C6', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', '.'),
        hat8, hat8, hat8,
        bar('C6', '.', 'C6', '.', 'C6', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', '.'),
      ) },
    ],
  },
  tier2: {
    bpm: 132,
    voices: [
      { patch: 'lead', steps: track(
        bar('A4', 'C5', '.', 'A4', 'E5', '.', '.', 'D5', 'C5', '.', 'A4', '.', 'E5', '.', 'D5', 'C5'),
        bar('E5', '.', 'D5', 'C5', 'A4', '.', 'C5', '.', 'E5', '.', 'D5', '.', 'C5', 'A4', '.', '.'),
        bar('A4', '.', 'C5', 'E5', 'A4', '.', 'C5', '.', 'D5', '.', 'E5', '.', 'C5', '.', 'A4', '.'),
        bar('E5', 'D5', 'C5', '.', 'A4', '.', '.', '.', 'E4', '.', 'A4', '.', 'C5', '.', 'A4', '.'),
        bar('C5', '.', 'A4', '.', 'E5', '.', 'D5', 'C5', 'A4', '.', 'C5', '.', 'E5', '.', 'D5', '.'),
        bar('E5', '.', 'E5', '.', 'D5', 'C5', 'A4', '.', 'G4', '.', 'A4', '.', 'C5', '.', 'D5', '.'),
        bar('A4', 'C5', 'D5', 'E5', 'A5', '.', 'E5', '.', 'D5', 'C5', 'A4', '.', 'E5', '.', 'C5', '.'),
        bar('E5', '.', 'D5', '.', 'C5', '.', 'A4', '.', 'A4', '.', '.', '.', 'A4', '.', '.', '.'),
      ) },
      { patch: 'bass', steps: track(
        bar('A1', '.', 'A1', '.', 'A1', '.', 'A1', '.', 'C2', '.', 'C2', '.', 'C2', '.', 'C2', '.'),
        bar('D2', '.', 'D2', '.', 'D2', '.', 'D2', '.', 'E2', '.', 'E2', '.', 'E2', '.', 'E2', '.'),
        bar('A1', '.', 'A1', '.', 'C2', '.', 'C2', '.', 'D2', '.', 'D2', '.', 'E2', '.', 'E2', '.'),
        bar('A1', '.', 'A1', '.', 'G1', '.', 'G1', '.', 'A1', '.', '.', '.', 'A1', '.', '.', '.'),
        bar('A1', '.', 'A1', '.', 'A1', '.', 'A1', '.', 'F2', '.', 'F2', '.', 'E2', '.', 'E2', '.'),
        bar('D2', '.', 'D2', '.', 'C2', '.', 'C2', '.', 'D2', '.', 'D2', '.', 'E2', '.', 'E2', '.'),
        bar('A1', '.', 'C2', '.', 'D2', '.', 'E2', '.', 'A2', '.', 'C2', '.', 'E2', '.', 'D2', '.'),
        bar('A1', '.', 'A1', '.', 'E2', '.', 'E2', '.', 'A1', '.', '.', '.', 'A1', '.', '.', '.'),
      ) },
      { patch: 'kick', steps: track(
        bar('C2', '.', '.', 'C2', '.', '.', 'C2', '.', '.', 'C2', '.', 'C2', '.', '.', '.', '.'),
        bar('C2', '.', '.', 'C2', '.', '.', 'C2', '.', '.', 'C2', '.', 'C2', '.', '.', '.', '.'),
        bar('C2', '.', '.', 'C2', '.', '.', 'C2', '.', '.', 'C2', '.', 'C2', '.', '.', '.', '.'),
        bar('C2', '.', 'C2', '.', 'C2', '.', 'C2', '.', 'C2', '.', '.', 'C2', 'C2', '.', '.', '.'),
        bar('C2', '.', '.', 'C2', '.', '.', 'C2', '.', '.', 'C2', '.', 'C2', '.', '.', '.', '.'),
        bar('C2', '.', '.', 'C2', '.', '.', 'C2', '.', '.', 'C2', '.', 'C2', '.', '.', '.', '.'),
        bar('C2', '.', '.', 'C2', '.', '.', 'C2', '.', '.', 'C2', '.', 'C2', '.', '.', '.', '.'),
        bar('C2', '.', 'C2', '.', 'C2', '.', 'C2', '.', 'C2', '.', '.', 'C2', 'C2', '.', '.', '.'),
      ) },
      { patch: 'hat', steps: track(
        bar('.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6'),
        bar('.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6'),
        bar('.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6'),
        bar('.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6'),
        bar('.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6'),
        bar('.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6'),
        bar('.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6'),
        bar('C6', 'C6', '.', 'C6', '.', 'C6', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', '.', '.'),
      ) },
    ],
  },
  tier3: {
    bpm: 144,
    voices: [
      { patch: 'lead', steps: track(
        bar('.', 'F#4', '.', 'A4', '.', '.', 'C#5', '.', '.', 'E5', '.', 'C#5', '.', 'A4', '.', '.'),
        bar('.', '.', 'F#4', '.', 'A4', '.', 'C#5', '.', 'E5', '.', '.', 'D5', '.', 'C#5', '.', '.'),
        bar('F#4', '.', '.', 'A4', '.', 'C#5', '.', '.', 'E5', '.', 'F#5', '.', 'E5', '.', 'C#5', '.'),
        bar('.', 'C#5', '.', 'A4', '.', 'F#4', '.', '.', 'E4', '.', 'F#4', '.', '.', '.', '.', '.'),
        bar('.', 'F#4', 'A4', '.', 'C#5', '.', '.', 'E5', '.', '.', 'F#5', '.', 'E5', '.', '.', '.'),
        bar('G#4', '.', 'A4', '.', 'C#5', '.', 'B4', '.', 'A4', '.', 'G#4', '.', 'F#4', '.', '.', '.'),
        bar('.', 'F#5', '.', 'E5', '.', 'C#5', '.', 'A4', '.', 'F#4', '.', 'E4', '.', 'F#4', '.', '.'),
        bar('F#4', '.', '.', '.', 'C#5', '.', '.', '.', 'F#4', '.', '.', '.', 'F#4', '.', '.', '.'),
      ) },
      { patch: 'bass', steps: track(
        bar('F#1', '.', '.', 'F#1', '.', '.', 'C#2', '.', '.', '.', 'F#1', '.', 'G#1', '.', '.', '.'),
        bar('.', 'C#2', '.', '.', 'F#1', '.', '.', 'G#1', '.', 'A1', '.', '.', 'F#1', '.', '.', '.'),
        bar('F#1', '.', 'F#1', '.', '.', 'C#2', '.', '.', 'E2', '.', '.', 'C#2', '.', '.', '.', '.'),
        bar('.', '.', 'F#1', '.', 'C#2', '.', '.', 'F#1', '.', '.', 'G#1', '.', 'F#1', '.', '.', '.'),
        bar('F#1', '.', '.', '.', 'C#2', '.', 'F#1', '.', '.', 'A1', '.', 'G#1', '.', 'F#1', '.', '.'),
        bar('G#1', '.', '.', 'A1', '.', '.', 'E1', '.', '.', 'F#1', '.', '.', 'C#2', '.', '.', '.'),
        bar('.', 'F#1', '.', 'C#2', '.', '.', 'E2', '.', '.', 'D2', '.', 'C#2', '.', 'F#1', '.', '.'),
        bar('F#1', '.', '.', 'F#1', '.', '.', 'C#1', '.', '.', '.', 'F#1', '.', '.', '.', '.', '.'),
      ) },
      { patch: 'kick', steps: track(
        bar('C2', '.', '.', '.', '.', 'C2', '.', '.', 'C2', '.', '.', '.', '.', 'C2', '.', '.'),
        bar('.', '.', 'C2', '.', '.', '.', 'C2', '.', 'C2', '.', '.', 'C2', '.', '.', '.', '.'),
        bar('C2', '.', '.', 'C2', '.', '.', '.', 'C2', '.', '.', 'C2', '.', '.', '.', '.', '.'),
        bar('.', 'C2', '.', '.', 'C2', '.', 'C2', '.', '.', '.', 'C2', '.', 'C2', '.', '.', '.'),
        bar('C2', '.', '.', '.', '.', 'C2', '.', 'C2', '.', '.', '.', 'C2', '.', '.', '.', '.'),
        bar('.', '.', 'C2', '.', 'C2', '.', '.', 'C2', '.', 'C2', '.', '.', '.', 'C2', '.', '.'),
        bar('C2', '.', '.', '.', 'C2', '.', '.', '.', '.', 'C2', '.', 'C2', '.', '.', '.', '.'),
        bar('.', 'C2', '.', '.', 'C2', '.', 'C2', '.', 'C2', '.', '.', 'C2', '.', 'C2', '.', '.'),
      ) },
      { patch: 'hat', steps: track(
        bar('.', '.', 'C6', '.', '.', '.', 'C6', '.', '.', 'C6', '.', '.', '.', 'C6', '.', '.'),
        bar('.', 'C6', '.', '.', 'C6', '.', '.', 'C6', '.', '.', 'C6', '.', '.', 'C6', '.', '.'),
        bar('.', '.', 'C6', '.', '.', '.', 'C6', '.', '.', 'C6', '.', '.', '.', 'C6', '.', '.'),
        bar('.', 'C6', '.', 'C6', 'C6', '.', '.', 'C6', '.', 'C6', '.', '.', 'C6', '.', 'C6', '.'),
        bar('.', '.', 'C6', '.', '.', '.', 'C6', '.', '.', 'C6', '.', '.', '.', 'C6', '.', '.'),
        bar('.', 'C6', '.', '.', 'C6', '.', '.', 'C6', '.', '.', 'C6', '.', '.', 'C6', '.', '.'),
        bar('.', '.', 'C6', '.', 'C6', '.', '.', 'C6', '.', 'C6', '.', '.', 'C6', '.', 'C6', '.'),
        bar('.', 'C6', '.', 'C6', 'C6', '.', '.', 'C6', '.', 'C6', '.', '.', 'C6', '.', 'C6', '.'),
      ) },
    ],
  },
  boss: {
    bpm: 160,
    voices: [
      { patch: 'lead', steps: track(
        bar('D4', '.', 'F4', '.', 'A4', '.', '.', '.', 'D5', '.', '.', 'C5', '.', 'A4', '.', '.'),
        bar('D5', '.', '.', 'A4', '.', 'F4', '.', 'D4', '.', '.', '.', 'C4', '.', 'D4', '.', '.'),
        bar('F4', '.', '.', 'G4', '.', 'A4', '.', '.', 'C5', '.', 'D5', '.', 'A4', '.', 'F4', '.'),
        bar('D4', '.', '.', '.', 'A4', '.', '.', '.', 'D5', '.', '.', '.', 'D4', '.', '.', '.'),
        bar('D4', 'F4', '.', 'A4', 'D5', '.', '.', 'C5', 'A4', '.', 'F4', '.', 'D4', '.', 'A4', '.'),
        bar('C5', '.', 'Bb4', '.', 'A4', '.', 'G4', '.', 'F4', '.', 'E4', '.', 'D4', '.', 'C4', '.'),
        bar('D5', '.', 'A4', '.', 'F4', '.', 'D4', '.', 'A3', '.', 'D4', '.', 'F4', '.', 'A4', '.'),
        bar('D4', '.', '.', '.', 'C4', '.', '.', '.', 'D4', '.', '.', '.', 'D4', '.', '.', '.'),
      ) },
      { patch: 'bass', steps: track(
        bar('D1', '.', '.', '.', 'D1', '.', '.', '.', 'A1', '.', '.', '.', 'D1', '.', '.', '.'),
        bar('D1', '.', 'D1', '.', 'F1', '.', '.', '.', 'G1', '.', '.', '.', 'A1', '.', '.', '.'),
        bar('D1', '.', '.', 'D1', '.', '.', 'A1', '.', '.', 'D1', '.', '.', 'C2', '.', '.', '.'),
        bar('D1', '.', '.', '.', 'A1', '.', '.', '.', 'D1', '.', '.', '.', 'D1', '.', '.', '.'),
        bar('D1', '.', 'D1', '.', 'D1', '.', 'F1', '.', 'E1', '.', 'D1', '.', 'C1', '.', 'D1', '.'),
        bar('Bb1', '.', '.', 'A1', '.', '.', 'G1', '.', '.', 'F1', '.', '.', 'E1', '.', 'D1', '.'),
        bar('D1', '.', '.', '.', 'D2', '.', '.', '.', 'A1', '.', '.', '.', 'D1', '.', 'A1', '.'),
        bar('D1', '.', '.', 'D1', '.', '.', 'D1', '.', 'A1', '.', 'D1', '.', 'D1', '.', '.', '.'),
      ) },
      { patch: 'kick', steps: track(
        bar('C2', '.', '.', 'C2', 'C2', '.', '.', 'C2', 'C2', '.', '.', 'C2', 'C2', '.', '.', 'C2'),
        bar('C2', '.', '.', 'C2', 'C2', '.', '.', 'C2', 'C2', '.', '.', 'C2', 'C2', '.', '.', 'C2'),
        bar('C2', '.', '.', 'C2', 'C2', '.', '.', 'C2', 'C2', '.', '.', 'C2', 'C2', '.', '.', 'C2'),
        bar('C2', 'C2', '.', 'C2', 'C2', '.', 'C2', '.', 'C2', '.', 'C2', 'C2', '.', 'C2', '.', '.'),
        bar('C2', '.', '.', 'C2', 'C2', '.', '.', 'C2', 'C2', '.', '.', 'C2', 'C2', '.', '.', 'C2'),
        bar('C2', '.', '.', 'C2', 'C2', '.', '.', 'C2', 'C2', '.', '.', 'C2', 'C2', '.', '.', 'C2'),
        bar('C2', '.', '.', 'C2', 'C2', '.', '.', 'C2', 'C2', '.', '.', 'C2', 'C2', '.', '.', 'C2'),
        bar('C2', 'C2', '.', 'C2', 'C2', '.', 'C2', '.', 'C2', '.', 'C2', 'C2', '.', 'C2', '.', '.'),
      ) },
      { patch: 'hat', steps: track(
        bar('C6', '.', 'C6', '.', 'C6', '.', 'C6', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6'),
        bar('C6', '.', 'C6', '.', 'C6', '.', 'C6', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6'),
        bar('C6', '.', 'C6', '.', 'C6', '.', 'C6', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6'),
        bar('C6', 'C6', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', 'C6', '.', 'C6', '.', 'C6', '.', '.'),
        bar('C6', '.', 'C6', '.', 'C6', '.', 'C6', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6'),
        bar('C6', '.', 'C6', '.', 'C6', '.', 'C6', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6'),
        bar('C6', '.', 'C6', '.', 'C6', '.', 'C6', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', '.', 'C6'),
        bar('C6', 'C6', 'C6', '.', 'C6', '.', 'C6', '.', 'C6', 'C6', '.', 'C6', '.', 'C6', '.', '.'),
      ) },
    ],
  },
};

/** Exhaustive over SimEvent. Adding an event fails the build here until it is given a sound or null. */
export const EVENT_SFX: { readonly [E in EventName]: (ev: EventOf<E>) => SfxId | null } = {
  start: () => null, fire: () => 'laser', enemyFire: () => null, hit: () => 'hit', destroy: () => 'explode',
  pickup: (ev) => (ev.kind === Kind.Shield ? 'shield' : 'pickup'), shieldBlock: () => 'shield', playerHit: () => 'explode',
  bossEnter: () => null, wormholeOpen: () => 'pickup', won: () => 'complete', lost: () => 'gameover',
};
