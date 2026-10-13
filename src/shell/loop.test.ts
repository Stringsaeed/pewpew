/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COAST, dragInput } from '../sim';
import {
  MAX_STEPS_PER_FRAME, advance, createLoop, drag, press, release, resetRun, setPlaying,
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

test('won reaches ended exactly once', () => {
  const loop = armed(true);
  const world = loop.world;
  assert.ok(world);
  world.player.y = world.wormholeY ?? world.spec.length;
  const won: number[] = [];
  const sinks: Sinks = { ...quiet(), ended(ev) { if (ev.e === 'won') won.push(world.tick); } };
  advance(loop, 100, sinks);
  advance(loop, 200, sinks);
  advance(loop, 300, sinks);
  assert.deepEqual(won, [1]);
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
