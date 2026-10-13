import { greedyBot } from '../bot';
import type { Run } from '../flow';
import { COAST, STEP, createWorld, dragInput, hudOf, step, type Hud, type Input, type SimEvent, type World } from '../sim';

export const MAX_STEPS_PER_FRAME = 4;

/** Everything the rAF tick reads and writes. Mutable on purpose: nothing here may cost a React render per frame. */
export interface Loop {
  world: World | null;
  key: string | null;
  playing: boolean;
  input: Input;
  /** Dev only: greedyBot drives every step instead of touch. */
  auto: boolean;
  /** Every step of this world so far came from the bot, so its final hash is comparable with the verifier's. */
  botOnly: boolean;
  readonly events: SimEvent[];
  acc: number;
  last: number;
  hud: Hud | null;
  /** Rocket x and finger x when the finger went down. Touch updates these; the frame loop does not. */
  anchorX: number;
  fx: number;
}

/** Render, then audio, then one `ended` per event, then `hud` only when the visible hud object changes. Keep this object stable: `advance` must not allocate. */
export interface Sinks {
  render(world: World | null, events: readonly SimEvent[], alpha: number, dt: number): void;
  audio(events: readonly SimEvent[]): void;
  ended(ev: SimEvent): void;
  hud(next: Hud): void;
}

const runKey = (run: Run | null) => (run === null ? null : `${run.level}:${run.attempt}`);

export function createLoop(): Loop {
  return {
    world: null, key: null, playing: false, input: COAST, auto: false, botOnly: true,
    events: [], acc: 0, last: 0, hud: null, anchorX: 0, fx: 0,
  };
}

/** Sole writer of `loop.playing`. */
export function setPlaying(loop: Loop, playing: boolean): void {
  loop.playing = playing;
}

/**
 * Coasts on every call, and rebuilds the world when the run key changes.
 * Returns true when the world was replaced, so the caller can drop the React hud.
 */
export function resetRun(loop: Loop, run: Run | null): boolean {
  loop.input = COAST;
  const key = runKey(run);
  if (key === loop.key) return false;
  loop.key = key;
  loop.world = run === null ? null : createWorld(run.level);
  loop.botOnly = true;
  loop.acc = 0;
  loop.events.length = 0;
  loop.hud = null;
  return true;
}

export function press(loop: Loop, pageX: number): void {
  loop.anchorX = loop.world?.player.x ?? 0;
  loop.fx = pageX;
  loop.input = dragInput(loop.anchorX, 0);
}

export function drag(loop: Loop, pageX: number, width: number): void {
  loop.input = dragInput(loop.anchorX, (pageX - loop.fx) / width);
}

export function release(loop: Loop): void {
  loop.input = COAST;
}

/** One rendered frame. `dt` is clamped to 0.1 s, and at most `MAX_STEPS_PER_FRAME` steps run before a leftover accumulator is dropped. */
export function advance(loop: Loop, now: number, sinks: Sinks): void {
  const dt = Math.min((now - loop.last) / 1000, 0.1);
  loop.last = now;
  const world = loop.world;
  if (loop.playing && world) {
    loop.acc += dt;
    let steps = 0;
    while (loop.acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
      if (!loop.auto) loop.botOnly = false;
      step(world, loop.auto ? greedyBot(world) : loop.input, loop.events);
      loop.acc -= STEP;
      steps += 1;
    }
    if (loop.acc >= STEP) loop.acc = 0;
  }
  sinks.render(world, loop.events, loop.acc / STEP, dt);
  sinks.audio(loop.events);
  for (const ev of loop.events) sinks.ended(ev);
  loop.events.length = 0;
  if (world) {
    const next = hudOf(world, loop.hud);
    if (next !== loop.hud) {
      loop.hud = next;
      sinks.hud(next);
    }
  }
}
