/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COAST, dragInput } from '../sim';
import { RAPID_TICKS } from '../sim/rules';
import {
  MAX_STEPS_PER_FRAME, advance, createLoop, drag, press, rapidRemaining, release, resetRun, setPlaying,
  type Loop, type Sinks,
} from './loop';

function quiet(): Sinks {
  return { render() {}, audio() {}, ended() {}, hud() {} };
}

function armed(auto: boolean): Loop {
  const loop = createLoop();
  resetRun(loop, { level: 1, attempt: 0 });
  setPlaying(loop, true);
  loop.auto = auto;
  loop.last = 0;
  return loop;
}

test('dt is clamped to 0.1 s', () => {
  const loop = createLoop();
  const seen: number[] = [];
  const sinks: Sinks = { ...quiet(), render(_w, _e, _a, dt) { seen.push(dt); } };
  loop.last = 50_000;
  advance(loop, 50_016, sinks);
  advance(loop, loop.last + 10_000, sinks);
  assert.equal(seen[0], 0.016);
  assert.equal(seen[1], 0.1);
});

test('at most MAX_STEPS_PER_FRAME steps, then the accumulator drops', () => {
  const loop = armed(true);
  advance(loop, 100, quiet());
  assert.equal(loop.world?.tick, MAX_STEPS_PER_FRAME);
  assert.equal(loop.acc, 0);
});

test('events reach render and audio before they are cleared', () => {
  const loop = armed(true);
  const order: string[] = [];
  advance(loop, 100, {
    render(_w, events) {
      assert.ok(events.length > 0);
      order.push('render');
    },
    audio(events) {
      assert.ok(events.length > 0);
      order.push('audio');
    },
    ended(ev) { order.push(ev.e); },
    hud() { order.push('hud'); },
  });
  assert.equal(loop.events.length, 0);
  assert.deepEqual(order.slice(0, 2), ['render', 'audio']);
  assert.ok(order.includes('start'));
  assert.equal(order.at(-1), 'hud');
});

function pump(loop: Loop, sinks: Sinks, frames: number): void {
  let now = loop.last;
  for (let i = 0; i < frames; i++) {
    now += 100;
    advance(loop, now, sinks);
  }
}

test('won reaches ended exactly once', () => {
  const loop = armed(true);
  const world = loop.world;
  assert.ok(world);
  world.player.y = world.wormholeY ?? world.spec.length;
  const won: string[] = [];
  const sinks: Sinks = {
    ...quiet(),
    ended(ev) { if (ev.e === 'won') won.push('ended'); },
    terminal(ev) { if (ev.e === 'won') won.push('terminal'); },
  };
  advance(loop, 100, sinks);
  assert.deepEqual(won, ['terminal']);
  assert.equal(loop.world, world);
  assert.equal(loop.playing, false);
  let now = 100;
  while (!won.includes('ended') && now < 4000) {
    now += 100;
    advance(loop, now, sinks);
  }
  assert.deepEqual(won, ['terminal', 'ended']);
  advance(loop, now + 100, sinks);
  assert.deepEqual(won, ['terminal', 'ended']);
});

test('a loss holds the world for 1s and a win for 1.4s at 0.3x render dt', () => {
  const loss = armed(true);
  const lostWorld = loss.world;
  assert.ok(lostWorld);
  lostWorld.player.lives = 0;
  const renderDt: number[] = [];
  const holds: [string, number][] = [];
  let lost = 0;
  const lossSinks: Sinks = {
    ...quiet(),
    render(_w, _e, _a, dt) { renderDt.push(dt); },
    ended(ev) { if (ev.e === 'lost') lost += 1; },
    hold(kind, seconds) { holds.push([kind, seconds]); },
  };
  advance(loss, 100, lossSinks);
  const tick = lostWorld.tick;
  assert.equal(lost, 0);
  // The renderer counts the hold in the slowed dt it receives, so it is told the slowed length.
  assert.deepEqual(holds, [['lost', 0.3]]);
  assert.equal(loss.world, lostWorld);
  assert.equal(loss.hold?.kind, 'lost');
  assert.equal(renderDt[0], 0.1 * 0.3);
  pump(loss, lossSinks, 9);
  assert.equal(lost, 1);
  assert.equal(lostWorld.tick, tick);
  assert.ok(renderDt.every((dt) => dt === 0.1 * 0.3));

  const win = armed(true);
  const wonWorld = win.world;
  assert.ok(wonWorld);
  wonWorld.player.y = wonWorld.wormholeY ?? wonWorld.spec.length;
  let won = 0;
  const winDt: number[] = [];
  const winSinks: Sinks = {
    ...quiet(),
    render(_w, _e, _a, dt) { winDt.push(dt); },
    ended(ev) { if (ev.e === 'won') won += 1; },
  };
  advance(win, 100, winSinks);
  assert.equal(won, 0);
  assert.equal(win.hold?.kind, 'won');
  pump(win, winSinks, 12);
  assert.equal(won, 0);
  pump(win, winSinks, 1);
  assert.equal(won, 1);
  assert.equal(win.world, wonWorld);
  assert.equal(winDt[0], 0.1 * 0.3);
});

test('a human step clears botOnly', () => {
  const bot = armed(true);
  advance(bot, 100, quiet());
  assert.equal(bot.botOnly, true);
  assert.ok((bot.world?.tick ?? 0) > 0);

  const human = armed(false);
  assert.equal(human.botOnly, true);
  advance(human, 100, quiet());
  assert.equal(human.botOnly, false);
  assert.ok((human.world?.tick ?? 0) > 0);
});

test('a paused loop renders but never steps', () => {
  const loop = createLoop();
  resetRun(loop, { level: 1, attempt: 0 });
  let rendered: Loop['world'] = null;
  let frames = 0;
  advance(loop, 100, {
    ...quiet(),
    render(world) { rendered = world; frames += 1; },
  });
  assert.equal(frames, 1);
  assert.equal(rendered, loop.world);
  assert.equal(loop.world?.tick, 0);
  assert.equal(loop.playing, false);
});

test('the hud sink is called only when hudOf returns a new object', () => {
  const loop = createLoop();
  resetRun(loop, { level: 1, attempt: 0 });
  let calls = 0;
  const sinks: Sinks = { ...quiet(), hud() { calls += 1; } };
  advance(loop, 100, sinks);
  const hud = loop.hud;
  assert.ok(hud);
  assert.equal(calls, 1);
  advance(loop, 200, sinks);
  assert.equal(calls, 1);
  assert.equal(loop.hud, hud);
});

test('press, drag, and release write the input', () => {
  const loop = createLoop();
  resetRun(loop, { level: 1, attempt: 0 });
  const anchor = loop.world?.player.x ?? 0;
  press(loop, 40);
  assert.deepEqual(loop.input, dragInput(anchor, 0));
  drag(loop, 240, 400);
  assert.deepEqual(loop.input, dragInput(anchor, 200 / 400));
  release(loop);
  assert.equal(loop.input, COAST);
});

test('rapidRemaining is the fraction of the rapid window left', () => {
  const loop = armed(false);
  const world = loop.world;
  assert.ok(world);
  assert.equal(rapidRemaining(null), 0);
  assert.equal(rapidRemaining(world), 0);
  world.player.rapidUntil = world.tick + RAPID_TICKS / 2;
  assert.equal(rapidRemaining(world), 0.5);
  world.player.rapidUntil = world.tick + RAPID_TICKS;
  assert.equal(rapidRemaining(world), 1);
  world.tick = world.player.rapidUntil;
  assert.equal(rapidRemaining(world), 0);
});

test('resetRun rebuilds the world only when the run key changes', () => {
  const loop = createLoop();
  press(loop, 10);
  assert.equal(resetRun(loop, { level: 1, attempt: 0 }), true);
  assert.equal(loop.input, COAST);
  const world = loop.world;
  assert.equal(resetRun(loop, { level: 1, attempt: 0 }), false);
  assert.equal(loop.world, world);
  assert.equal(resetRun(loop, { level: 1, attempt: 1 }), true);
  assert.notEqual(loop.world, world);
  assert.equal(resetRun(loop, null), true);
  assert.equal(loop.world, null);
  assert.equal(loop.hud, null);
});
