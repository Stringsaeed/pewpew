/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isUnlocked, parseSave, recordRun, type Save } from './save';

const fresh = parseSave(null);

test('missing, malformed, and wrong-version input yields a fresh save', () => {
  for (const raw of [undefined, null, 42, 'not json', '{"v":2,"levels":[]}', '[]', { v: 1 }, { v: 1, levels: 'x' }]) {
    const s = parseSave(raw);
    assert.equal(s.levels.length, 30);
    assert.deepEqual(s.levels[0], { best: 0, stars: 0 });
    assert.equal(s.music, true);
    assert.equal(s.sfx, true);
  }
});

test('a stored save round-trips through JSON', () => {
  const played = recordRun(recordRun(fresh, 1, 1200, 3), 2, 800, 1);
  const back = parseSave(JSON.stringify({ ...played, music: false }));
  assert.deepEqual(back.levels[0], { best: 1200, stars: 3 });
  assert.deepEqual(back.levels[1], { best: 800, stars: 1 });
  assert.equal(back.music, false);
  assert.equal(back.sfx, true);
});

test('bad records are repaired per entry and the length is forced to 30', () => {
  const raw = { v: 1, levels: [{ best: 500.9, stars: 2 }, { best: -5, stars: 9 }, 'junk', { best: Infinity, stars: 1 }], music: 'yes', sfx: false };
  const s = parseSave(raw);
  assert.equal(s.levels.length, 30);
  assert.deepEqual(s.levels.slice(0, 4), [{ best: 500, stars: 2 }, { best: 0, stars: 0 }, { best: 0, stars: 0 }, { best: 0, stars: 1 }]);
  assert.equal(s.music, true);
  assert.equal(s.sfx, false);
});

test('recordRun keeps the max of best and stars independently', () => {
  let s = recordRun(fresh, 5, 900, 2);
  s = recordRun(s, 5, 400, 3);
  assert.deepEqual(s.levels[4], { best: 900, stars: 3 });
  s = recordRun(s, 5, 1500, 1);
  assert.deepEqual(s.levels[4], { best: 1500, stars: 3 });
});

test('recordRun is idempotent and returns the same object for a duplicate', () => {
  const once = recordRun(fresh, 3, 700, 2);
  assert.equal(recordRun(once, 3, 700, 2), once);
  assert.equal(recordRun(once, 3, 100, 1), once);
  assert.deepEqual(once.levels[2], { best: 700, stars: 2 });
});

test('recordRun leaves other levels and the input untouched', () => {
  const before = JSON.stringify(fresh);
  const next = recordRun(fresh, 30, 10, 1);
  assert.equal(JSON.stringify(fresh), before);
  assert.deepEqual(next.levels[29], { best: 10, stars: 1 });
  assert.deepEqual(next.levels[28], { best: 0, stars: 0 });
});

test('isUnlocked: level 1 always, level n once n-1 has a star', () => {
  assert.equal(isUnlocked(fresh, 1), true);
  assert.equal(isUnlocked(fresh, 2), false);
  const s: Save = recordRun(fresh, 1, 100, 1);
  assert.equal(isUnlocked(s, 2), true);
  assert.equal(isUnlocked(s, 3), false);
  assert.equal(isUnlocked(recordRun(fresh, 29, 100, 3), 30), true);
});
