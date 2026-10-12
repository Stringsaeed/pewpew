import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ALLOWED_MATH = new Set(['sqrt', 'imul', 'floor', 'min', 'max', 'abs']);
/** Math members and `**` used in code, ignoring comments. */
function disallowed(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const found = [...code.matchAll(/Math\s*(?:\.\s*(\w+)|\[)/g)].map((m) => m[1] ?? '[computed]');
  if (code.includes('**')) found.push('**');
  return found.filter((name) => !ALLOWED_MATH.has(name));
}

test('the determinism checker flags trig, pow, and random but ignores comments', () => {
  assert.deepEqual(disallowed('const a = Math.sin(x) + Math.floor(y) ** 2; // Math.cos\n/* Math.random */ Math.pow(2, 3);'), ['sin', 'pow', '**']);
});

for (const file of ['sim.ts', 'levels.ts']) {
  test(`${file} uses only + - * / sqrt imul floor min max abs from Math`, () => {
    assert.deepEqual(disallowed(readFileSync(new URL(file, import.meta.url), 'utf8')), []);
  });
}
