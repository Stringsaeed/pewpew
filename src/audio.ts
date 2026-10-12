import type { SimEvent } from './sim';

const NI = (): never => { throw new Error('not implemented'); };

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
export function createAudio(): AudioEngine { return NI(); }
