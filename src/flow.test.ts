/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduce, runOf, TITLE, type Action, type Screen } from './flow';
import { parseSave, recordRun, type Save } from './save';

const fresh = parseSave(null);
const unlocked2: Save = recordRun(fresh, 1, 100, 1);
const won = { e: 'won', score: 900, stars: 2 } as const;
const lost = { e: 'lost', score: 300 } as const;

const play1: Screen = { s: 'play', level: 1, attempt: 0 };
const paused1: Screen = { s: 'paused', level: 1, attempt: 0 };
const complete1: Screen = { s: 'complete', level: 1, score: 900, stars: 2 };
const gameover1: Screen = { s: 'gameover', level: 1, score: 300 };

test('title: start opens levels, settings remembers title', () => {
  assert.deepEqual(reduce(TITLE, { a: 'start' }, fresh), { s: 'levels' });
  assert.deepEqual(reduce(TITLE, { a: 'settings' }, fresh), { s: 'settings', back: 'title' });
});

test('levels: pick plays an unlocked level and ignores a locked one', () => {
  const levels: Screen = { s: 'levels' };
  assert.deepEqual(reduce(levels, { a: 'pick', level: 1 }, fresh), { s: 'play', level: 1, attempt: 0 });
  assert.equal(reduce(levels, { a: 'pick', level: 2 }, fresh), levels);
  assert.deepEqual(reduce(levels, { a: 'pick', level: 2 }, unlocked2), { s: 'play', level: 2, attempt: 0 });
  assert.deepEqual(reduce(levels, { a: 'back' }, fresh), { s: 'title' });
  assert.deepEqual(reduce(levels, { a: 'settings' }, fresh), { s: 'settings', back: 'levels' });
});

test('settings: back returns to where it was opened from, including a paused run', () => {
  assert.deepEqual(reduce({ s: 'settings', back: 'title' }, { a: 'back' }, fresh), { s: 'title' });
  assert.deepEqual(reduce({ s: 'settings', back: 'levels' }, { a: 'back' }, fresh), { s: 'levels' });
  const fromPause = reduce({ s: 'paused', level: 7, attempt: 3 }, { a: 'settings' }, fresh);
  assert.deepEqual(fromPause, { s: 'settings', back: 'paused', level: 7, attempt: 3 });
  assert.deepEqual(reduce(fromPause, { a: 'back' }, fresh), { s: 'paused', level: 7, attempt: 3 });
});

test('play: pause, quit, and both run results', () => {
  assert.deepEqual(reduce(play1, { a: 'pause' }, fresh), paused1);
  assert.deepEqual(reduce(play1, { a: 'quit' }, fresh), { s: 'levels' });
  assert.deepEqual(reduce(play1, { a: 'ended', result: won }, fresh), complete1);
  assert.deepEqual(reduce(play1, { a: 'ended', result: lost }, fresh), gameover1);
});

test('paused: resume keeps the attempt, retry bumps it, quit leaves', () => {
  const p: Screen = { s: 'paused', level: 4, attempt: 2 };
  assert.deepEqual(reduce(p, { a: 'resume' }, fresh), { s: 'play', level: 4, attempt: 2 });
  assert.deepEqual(reduce(p, { a: 'retry' }, fresh), { s: 'play', level: 4, attempt: 3 });
  assert.deepEqual(reduce(p, { a: 'quit' }, fresh), { s: 'levels' });
});

test('complete: next advances, level 30 returns to levels, retry and quit', () => {
  assert.deepEqual(reduce(complete1, { a: 'next' }, unlocked2), { s: 'play', level: 2, attempt: 0 });
  assert.deepEqual(reduce({ s: 'complete', level: 30, score: 1, stars: 1 }, { a: 'next' }, fresh), { s: 'levels' });
  assert.deepEqual(reduce(complete1, { a: 'retry' }, fresh), { s: 'play', level: 1, attempt: 0 });
  assert.deepEqual(reduce(complete1, { a: 'quit' }, fresh), { s: 'levels' });
});

test('gameover: retry restarts the level, quit leaves', () => {
  assert.deepEqual(reduce(gameover1, { a: 'retry' }, fresh), { s: 'play', level: 1, attempt: 0 });
  assert.deepEqual(reduce(gameover1, { a: 'quit' }, fresh), { s: 'levels' });
});

test('duplicate dispatches return the same object', () => {
  const once = reduce(play1, { a: 'ended', result: won }, fresh);
  assert.equal(reduce(once, { a: 'ended', result: won }, fresh), once);
  assert.equal(reduce(once, { a: 'ended', result: lost }, fresh), once);
  const paused = reduce(play1, { a: 'pause' }, fresh);
  assert.equal(reduce(paused, { a: 'pause' }, fresh), paused);
  const levels = reduce(TITLE, { a: 'start' }, fresh);
  assert.equal(reduce(levels, { a: 'start' }, fresh), levels);
});

test('every action not listed for a screen leaves that screen unchanged', () => {
  const settings: Screen = { s: 'settings', back: 'title' };
  const valid: Record<Screen['s'], readonly Action['a'][]> = {
    title: ['start', 'settings'],
    levels: ['pick', 'settings', 'back'],
    settings: ['back'],
    play: ['pause', 'quit', 'ended'],
    paused: ['resume', 'retry', 'quit', 'settings'],
    complete: ['next', 'retry', 'quit'],
    gameover: ['retry', 'quit'],
  };
  const actions: Action[] = [
    { a: 'start' }, { a: 'pick', level: 1 }, { a: 'pause' }, { a: 'resume' }, { a: 'quit' },
    { a: 'retry' }, { a: 'next' }, { a: 'settings' }, { a: 'back' }, { a: 'ended', result: won },
  ];
  const screens: Screen[] = [TITLE, { s: 'levels' }, settings, play1, paused1, complete1, gameover1];
  for (const screen of screens) {
    for (const act of actions) {
      if (valid[screen.s].includes(act.a)) continue;
      assert.equal(reduce(screen, act, fresh), screen, `${screen.s} + ${act.a}`);
    }
  }
});

test('runOf keys the World: play, paused, and settings-from-pause share a run; everything else has none', () => {
  assert.deepEqual(runOf(play1), { level: 1, attempt: 0 });
  assert.deepEqual(runOf(paused1), { level: 1, attempt: 0 });
  assert.deepEqual(runOf({ s: 'settings', back: 'paused', level: 1, attempt: 0 }), { level: 1, attempt: 0 });
  for (const s of [TITLE, { s: 'levels' }, { s: 'settings', back: 'levels' }, complete1, gameover1] as Screen[]) {
    assert.equal(runOf(s), null, s.s);
  }
});

test('retry from pause changes the run key, resume does not', () => {
  const before = runOf(paused1);
  assert.deepEqual(runOf(reduce(paused1, { a: 'resume' }, fresh)), before);
  assert.notDeepEqual(runOf(reduce(paused1, { a: 'retry' }, fresh)), before);
});
