/// <reference types="node" />
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ALLOWED_MATH = new Set(['sqrt', 'imul', 'floor', 'min', 'max', 'abs']);
function disallowed(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const found = [...code.matchAll(/Math\s*(?:\.\s*(\w+)|\[)/g)].map((m) => m[1] ?? '[computed]');
  if (code.includes('**')) found.push('**');
  return found.filter((name) => !ALLOWED_MATH.has(name));
}

test('the determinism checker flags trig, pow, and random but ignores comments', () => {
  assert.deepEqual(disallowed('const a = Math.sin(x) + Math.floor(y) ** 2; // Math.cos\n/* Math.random */ Math.pow(2, 3);'), ['sin', 'pow', '**']);
});

const srcDir = dirname(dirname(fileURLToPath(import.meta.url)));
const mathSources: string[] = [];
const simFile = join(srcDir, 'sim.ts');
if (existsSync(simFile)) mathSources.push(simFile);
const simDir = join(srcDir, 'sim');
if (existsSync(simDir) && statSync(simDir).isDirectory()) {
  for (const name of readdirSync(simDir).filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts')).sort()) {
    mathSources.push(join(simDir, name));
  }
}
mathSources.push(join(srcDir, 'levels.ts'));

for (const file of mathSources) {
  const label = relative(join(srcDir, '..'), file);
  test(`${label} uses only + - * / sqrt imul floor min max abs from Math`, () => {
    assert.deepEqual(disallowed(readFileSync(file, 'utf8')), []);
  });
}

import { ARCHETYPES, Kind } from '../levels';
import { COAST, createWorld, dragInput, hudOf, replay, simulate, step, type SimEvent, type World } from './index';
import { greedyBot, idleBot } from '../bot';

/** A world with its track exhausted, so only bodies a test places exist. */
function emptyWorld(): World {
  const w = createWorld(1);
  w.cursor = w.track.length;
  return w;
}
function put(w: World, kind: Kind, x: number, y: number): void {
  const b = w.bodies, i = b.count++;
  b.kind[i] = kind; b.variant[i] = 0;
  b.x[i] = x; b.y[i] = y; b.px[i] = x; b.py[i] = y; b.vx[i] = 0; b.vy[i] = 0;
  b.rot[i] = 0; b.spin[i] = 0; b.t[i] = 0; b.param[i] = 0; b.hp[i] = ARCHETYPES[kind].hp;
}
function run(w: World, steps: number, input = COAST): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < steps; i++) step(w, input, all);
  return all;
}
const kindsIn = (w: World, kind: Kind): number[] => {
  const ys: number[] = [];
  for (let i = 0; i < w.bodies.count; i++) if (w.bodies.kind[i] === kind) ys.push(w.bodies.y[i]);
  return ys.sort((a, b) => a - b);
};

test('dragInput maps finger travel to a clamped target x', () => {
  assert.deepEqual(dragInput(1, 0.1), { targetX: 2.125 });
  assert.deepEqual(dragInput(0, 0.5), { targetX: 4 });
  assert.deepEqual(dragInput(0, -0.5), { targetX: -4 });
});

test('the same input stream gives the same events and the same final hash, twice', () => {
  const inputs = Array.from({ length: 900 }, (_, i) => (i % 120 < 60 ? { targetX: -2 } : { targetX: 2.5 }));
  const once = () => {
    const w = createWorld(7);
    const events = inputs.flatMap((input) => { const out: SimEvent[] = []; step(w, input, out); return out; });
    return { events, x: w.player.x, y: w.player.y, score: w.score, count: w.bodies.count };
  };
  const a = once(), b = once();
  assert.deepEqual(a, b);
  assert.deepEqual(a.events[0], { e: 'start', level: 7 });
  const r1 = simulate(7, greedyBot), r2 = simulate(7, greedyBot);
  assert.equal(r1.outcome, 'won');
  assert.equal(r1.hash, r2.hash);
  assert.equal(r1.steps, r2.steps);
});

test('swap-remove keeps the pool dense', () => {
  const w = emptyWorld();
  for (const y of [10, -20, 11, -20, 12]) put(w, Kind.Crystal, 4, y);
  run(w, 1);
  assert.deepEqual(kindsIn(w, Kind.Crystal), [10, 11, 12]);
  assert.equal(w.bodies.count, 4); // three crystals and the first bolt
  for (let i = 0; i < w.bodies.count; i++) assert.ok(w.bodies.hp[i] >= 0, `slot ${i} is live`);
});

test('a shield absorbs exactly one hit', () => {
  const w = emptyWorld();
  w.player.shield = true;
  put(w, Kind.Mine, 0, 0.3);
  const first = run(w, 1).filter((e) => e.e === 'shieldBlock' || e.e === 'playerHit');
  assert.deepEqual(first, [{ e: 'shieldBlock', x: 0, y: 0.1 }]);
  assert.equal(w.player.lives, 3);
  assert.equal(w.player.shield, false);
  run(w, 40);
  put(w, Kind.Mine, 0, w.player.y + 0.3);
  const second = run(w, 1).filter((e) => e.e === 'shieldBlock' || e.e === 'playerHit');
  assert.equal(second.length, 1);
  assert.equal(second[0].e, 'playerHit');
  assert.equal(w.player.lives, 2);
});

test('rapid fire halves the fire interval for its duration', () => {
  const w = emptyWorld();
  put(w, Kind.Rapid, 0, 0.1);
  const fires: number[] = [];
  for (let i = 0; i < 390; i++) {
    const out: SimEvent[] = [];
    step(w, COAST, out);
    if (out.some((e) => e.e === 'fire')) fires.push(w.tick - 1);
  }
  assert.deepEqual(fires.slice(0, 4), [0, 12, 18, 24]);
  assert.deepEqual(fires.slice(-5), [348, 354, 360, 372, 384]);
});

test('a destroyed asteroid spawns three fragments and scores', () => {
  const w = emptyWorld();
  put(w, Kind.Asteroid, 0, 4);
  for (let i = 0; i < 60; i++) {
    const out: SimEvent[] = [];
    step(w, COAST, out);
    if (out.some((e) => e.e === 'destroy' && e.target === Kind.Asteroid)) break;
  }
  assert.equal(kindsIn(w, Kind.Asteroid).length, 0);
  assert.equal(kindsIn(w, Kind.Fragment).length, 3);
  assert.equal(w.score, 50);
});

test('a terminal phase makes step a no-op that emits nothing', () => {
  const w = createWorld(4);
  for (let i = 0; i < 20000 && w.phase.p !== 'lost'; i++) step(w, idleBot(w), []);
  assert.equal(w.phase.p, 'lost');
  const tick = w.tick, y = w.player.y, count = w.bodies.count;
  const out = run(w, 10);
  assert.deepEqual(out, []);
  assert.deepEqual([w.tick, w.player.y, w.bodies.count], [tick, y, count]);
});

test('hudOf returns the previous object when nothing visible changed', () => {
  const w = emptyWorld();
  const h1 = hudOf(w, null);
  assert.deepEqual(h1, { score: 0, lives: 3, progress: 0, shield: false, rapid: false, bossHp: null });
  assert.equal(hudOf(w, h1), h1);
  w.score = 25;
  const h2 = hudOf(w, h1);
  assert.notEqual(h2, h1);
  assert.equal(h2.score, 25);
});

test('a recorded run replays to the same result from its inputs alone', () => {
  for (const [n, bot] of [[3, greedyBot], [4, idleBot]] as const) {
    const r = simulate(n, bot);
    const rp = replay(n, r.inputs);
    assert.equal(r.inputs.length, r.steps);
    assert.deepEqual({ ...rp, inputs: null }, { ...r, inputs: null });
  }
  assert.equal(simulate(3, greedyBot).outcome, 'won');
  assert.equal(simulate(4, idleBot).outcome, 'lost');
});
