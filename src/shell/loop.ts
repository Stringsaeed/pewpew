import { greedyBot } from '../bot';
import { FRAME_TIMING } from '../frameTiming';
import type { Run } from '../flow';
import { COAST, RAPID_TICKS, STEP, TICKS_PER_SEC, createWorld, dragInput, hudOf, step, type EventOf, type Hud, type Input, type SimEvent, type World } from '../sim';

export const MAX_STEPS_PER_FRAME = 4;
export const LOSS_HOLD_MS = 1000;
export const WIN_HOLD_MS = 1400;
const SLOW_MOTION = 0.3;

export interface Hold {
  kind: 'won' | 'lost';
  /** Milliseconds of real time left before `ended`. Whole milliseconds, so the beat does not drift. */
  leftMs: number;
  ev: EventOf<'won'> | EventOf<'lost'>;
}

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
  /** Set on won or lost. The world stays up until this runs out. */
  hold: Hold | null;
}

/** Render, then audio, then one `ended` per event, then `hud` only when the visible hud object changes. Keep this object stable: `advance` must not allocate. */
export interface Sinks {
  render(world: World | null, events: readonly SimEvent[], alpha: number, dt: number): void;
  audio(events: readonly SimEvent[]): void;
  ended(ev: SimEvent): void;
  hud(next: Hud): void;
  /** Once, the frame won or lost is seen. The screen waits; the save does not. */
  terminal?(ev: EventOf<'won'> | EventOf<'lost'>): void;
  hold?(kind: 'won' | 'lost', seconds: number): void;
}

const runKey = (run: Run | null) => (run === null ? null : `${run.level}:${run.attempt}`);

export function createLoop(): Loop {
  return {
    world: null, key: null, playing: false, input: COAST, auto: false, botOnly: true,
    events: [], acc: 0, last: 0, hud: null, anchorX: 0, fx: 0, hold: null,
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
  loop.hold = null;
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

/** Full rapid-fire window in milliseconds. The HUD chip drains across this. */
export const RAPID_WINDOW_MS = (RAPID_TICKS / TICKS_PER_SEC) * 1000;

/** Fraction of the rapid window still left, 0 when the pickup is inactive. Read at React render time; the chip animates the rest. */
export function rapidRemaining(world: World | null): number {
  if (world === null) return 0;
  const left = world.player.rapidUntilTick - world.tick;
  if (left <= 0) return 0;
  return Math.min(1, left / RAPID_TICKS);
}

/** One rendered frame. `dt` is clamped to 0.1 s, and at most `MAX_STEPS_PER_FRAME` steps run before a leftover accumulator is dropped. */
export function advance(loop: Loop, now: number, sinks: Sinks): void {
  const dtMs = Math.min(now - loop.last, 100);
  const dt = dtMs / 1000;
  loop.last = now;
  const world = loop.world;

  let finished: Hold | null = null;
  if (loop.hold) {
    loop.hold.leftMs -= dtMs;
    if (loop.hold.leftMs <= 0) {
      finished = loop.hold;
      loop.hold = null;
    }
  }

  if (loop.playing && loop.hold === null && finished === null && world) {
    loop.acc += dt;
    let steps = 0;
    const timing = FRAME_TIMING;
    while (loop.acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
      if (!loop.auto) loop.botOnly = false;
      let mark = timing.on ? performance.now() : 0;
      const input = loop.auto ? greedyBot(world) : loop.input;
      if (timing.on) {
        const now = performance.now();
        timing.bot += now - mark;
        mark = now;
      }
      step(world, input, loop.events);
      if (timing.on) timing.step += performance.now() - mark;
      loop.acc -= STEP;
      steps += 1;
    }
    if (loop.acc >= STEP) loop.acc = 0;
  }

  let started: EventOf<'won'> | EventOf<'lost'> | null = null;
  if (loop.hold === null && finished === null) {
    for (const ev of loop.events) {
      if (ev.e === 'won' || ev.e === 'lost') { started = ev; break; }
    }
  }
  const slow = loop.hold !== null || finished !== null || started !== null;
  sinks.render(world, loop.events, loop.acc / STEP, slow ? dt * SLOW_MOTION : dt);
  sinks.audio(loop.events);
  if (finished) sinks.ended(finished.ev);
  for (const ev of loop.events) {
    if (ev.e === 'won' || ev.e === 'lost') continue;
    sinks.ended(ev);
  }
  if (started) {
    const totalMs = started.e === 'lost' ? LOSS_HOLD_MS : WIN_HOLD_MS;
    setPlaying(loop, false);
    // The renderer counts the hold in the dt it receives, which is already slowed, so the seconds are scaled too.
    sinks.hold?.(started.e, (totalMs / 1000) * SLOW_MOTION);
    sinks.terminal?.(started);
    const leftMs = totalMs - dtMs;
    if (leftMs <= 0) sinks.ended(started);
    else loop.hold = { kind: started.e, leftMs, ev: started };
  }
  loop.events.length = 0;
  if (world) {
    const next = hudOf(world, loop.hud);
    if (next !== loop.hud) {
      loop.hud = next;
      sinks.hud(next);
    }
  }
}
