/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allEntries, batches, BOARD, enqueue, totals, winEntries } from './leaderboards';
import { parseSave, recordRun } from './save';

const fresh = parseSave(null);

test('board ids are zero-padded and stable', () => {
  assert.equal(BOARD.level(1), 'pewpew.level.01');
  assert.equal(BOARD.level(30), 'pewpew.level.30');
});

test('a fresh save reports nothing', () => {
  assert.deepEqual(totals(fresh), { score: 0, stars: 0 });
  assert.deepEqual(allEntries(fresh), []);
});

test('allEntries lists played levels plus both totals', () => {
  const s = recordRun(recordRun(fresh, 1, 1200, 3), 3, 800, 1);
  assert.deepEqual(allEntries(s), [
    { board: 'pewpew.level.01', value: 1200 },
    { board: 'pewpew.level.03', value: 800 },
    { board: BOARD.score, value: 2000 },
    { board: BOARD.stars, value: 4 },
  ]);
});

test('winEntries covers the level and the totals after the run was recorded', () => {
  const s = recordRun(recordRun(fresh, 1, 1200, 3), 2, 500, 2);
  assert.deepEqual(winEntries(s, 2), [
    { board: 'pewpew.level.02', value: 500 },
    { board: BOARD.score, value: 1700 },
    { board: BOARD.stars, value: 5 },
  ]);
});

test('batches groups boards that share a value and drops duplicate boards', () => {
  const out = batches([
    { board: 'a', value: 5 }, { board: 'b', value: 5 }, { board: 'c', value: 7 }, { board: 'a', value: 5 },
  ]);
  assert.deepEqual(out, [{ value: 5, boards: ['a', 'b'] }, { value: 7, boards: ['c'] }]);
});

test('enqueue keeps the max per board and does not mutate the input', () => {
  const q0 = new Map<string, number>();
  const q1 = enqueue(q0, [{ board: 'a', value: 5 }, { board: 'b', value: 1 }]);
  const q2 = enqueue(q1, [{ board: 'a', value: 3 }, { board: 'b', value: 9 }]);
  assert.equal(q0.size, 0);
  assert.deepEqual([...q2], [['a', 5], ['b', 9]]);
});
