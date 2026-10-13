/// <reference types="node" />
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * UI may value-import from src/levels only the tables and helpers it reads today:
 * BOSSES, levelSpec, tierOf, and LEVELS. Every other levels name, and every sim
 * import, must be `import type` (or an inline `type` specifier). Do not widen this set.
 */
const LEVEL_VALUE_NAMES = new Set(['BOSSES', 'levelSpec', 'tierOf', 'LEVELS']);

interface ImportDecl {
  readonly spec: string;
  readonly typeOnly: boolean;
  readonly values: readonly string[];
  readonly types: readonly string[];
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Named or default bindings. `type` on the statement or the specifier marks a type. */
function bindings(clause: string, statementIsType: boolean): { values: string[]; types: string[] } {
  const values: string[] = [];
  const types: string[] = [];
  const brace = clause.indexOf('{');
  const head = (brace === -1 ? clause : clause.slice(0, brace)).replace(/,\s*$/, '').trim();
  if (head.length > 0 && head !== 'type') {
    const name = head.startsWith('*') ? '*' : head.split(/\s+as\s+/)[0].trim();
    (statementIsType ? types : values).push(name);
  }
  if (brace === -1) return { values, types };
  const inner = clause.slice(brace + 1, clause.lastIndexOf('}'));
  for (const part of inner.split(',')) {
    const spec = part.trim();
    if (spec.length === 0) continue;
    const isType = statementIsType || spec.startsWith('type ');
    const body = spec.startsWith('type ') ? spec.slice(5).trim() : spec;
    const name = body.split(/\s+as\s+/)[0].trim();
    (isType ? types : values).push(name);
  }
  return { values, types };
}

function importsIn(source: string): ImportDecl[] {
  const code = stripComments(source);
  const found: ImportDecl[] = [];
  const re = /(?:^|\n)[ \t]*import\s+(type\s+)?([^;]*?)\s+from\s+(['"])([^'"]+)\3/g;
  for (const match of code.matchAll(re)) {
    const { values, types } = bindings(match[2] ?? '', Boolean(match[1]));
    found.push({ spec: match[4] ?? '', typeOnly: Boolean(match[1]), values, types });
  }
  const side = /(?:^|\n)[ \t]*import\s+(['"])([^'"]+)\1/g;
  for (const match of code.matchAll(side)) {
    found.push({ spec: match[2] ?? '', typeOnly: false, values: ['*'], types: [] });
  }
  return found;
}

/** Package name, or a src path with the extension and a trailing /index removed. */
function moduleId(fromFile: string, spec: string): string {
  if (!spec.startsWith('.')) return spec;
  let rel = relative(root, resolve(root, dirname(fromFile), spec)).replace(/\\/g, '/');
  rel = rel.replace(/\.tsx?$/, '').replace(/\/index$/, '');
  return rel;
}

const isTest = (file: string) => file.endsWith('.test.ts') || file.endsWith('.test.tsx');
const isPkg = (mod: string, name: string) => mod === name || mod.startsWith(`${name}/`);
const under = (mod: string, dir: string) => mod === dir || mod.startsWith(`${dir}/`);

function mentions(kind: string, spec: string, detail: string): string {
  return `${kind}: ${spec}${detail.length > 0 ? ` (${detail})` : ''}`;
}

/** One string per broken rule. Each names the offending import. */
function boundaryViolations(file: string, decls: readonly ImportDecl[]): string[] {
  const out: string[] = [];
  for (const decl of decls) {
    const mod = moduleId(file, decl.spec);
    const blame = (why: string) => out.push(`${file} imports ${decl.spec} — ${why}`);

    if ((file.startsWith('src/sim/') || file === 'src/levels.ts')
      && (isPkg(mod, 'react') || isPkg(mod, 'react-native')
        || under(mod, 'src/ui') || under(mod, 'src/render') || under(mod, 'src/audio')
        || mod === 'src/save' || mod === 'src/flow' || under(mod, 'src/shell') || under(mod, 'src/dev'))) {
      blame('src/sim and src/levels must not import react, react-native, ui, render, audio, save, flow, shell, or dev');
    }

    if (file.startsWith('src/ui/') && under(mod, 'src/sim') && decl.values.length > 0) {
      blame(`ui may import src/sim only as types, not ${decl.values.join(', ')}`);
    }
    if (file.startsWith('src/ui/') && mod === 'src/levels') {
      const extra = decl.values.filter((name) => !LEVEL_VALUE_NAMES.has(name));
      if (extra.length > 0) {
        blame(`ui may value-import only BOSSES, levelSpec, tierOf, LEVELS from src/levels, not ${extra.join(', ')}`);
      }
    }

    if (file.startsWith('src/render/')
      && (mod === 'src/save' || mod === 'src/flow' || under(mod, 'src/audio') || under(mod, 'src/ui')
        || under(mod, 'src/shell') || isPkg(mod, 'react') || isPkg(mod, 'react-native'))) {
      blame('src/render must not import save, flow, audio, ui, shell, react, or react-native');
    }

    if (file.startsWith('src/audio/')
      && (under(mod, 'src/render') || under(mod, 'src/ui') || under(mod, 'src/shell')
        || mod === 'src/save' || mod === 'src/flow' || isPkg(mod, 'react-native'))) {
      blame('src/audio must not import render, ui, shell, save, flow, or react-native');
    }

    if (under(mod, 'src/dev') && file !== 'App.tsx' && !file.startsWith('src/shell/') && !file.startsWith('src/dev/')) {
      blame('only App.tsx, src/shell, and src/dev may import src/dev');
    }

    if (!isTest(file) && !file.startsWith('src/sim/') && mod.startsWith('src/sim/')) {
      blame(`deep import of ${mod}; import the src/sim barrel`);
    }
    if (!isTest(file) && !file.startsWith('src/render/') && mod.startsWith('src/render/')) {
      blame(`deep import of ${mod}; import the src/render barrel`);
    }
  }
  return out;
}

test('the import scanner separates type names from value names and ignores comments', () => {
  const found = importsIn(`
    import { BOSSES, levelSpec, type LevelNumber } from '../levels';
    import type { Hud as HudState } from '../sim';
    import {
      RAPID_TICKS,
      type World,
    } from '../sim/rules';
    // import { nope } from 'react';
    /* import x from 'react-native' */
  `);
  assert.deepEqual(found, [
    { spec: '../levels', typeOnly: false, values: ['BOSSES', 'levelSpec'], types: ['LevelNumber'] },
    { spec: '../sim', typeOnly: true, values: [], types: ['Hud'] },
    { spec: '../sim/rules', typeOnly: false, values: ['RAPID_TICKS'], types: ['World'] },
  ]);
});

test('boundary failures name the file and the offending import', () => {
  const deep = boundaryViolations('src/ui/Hud.tsx', [
    { spec: '../sim/rules', typeOnly: false, values: ['RAPID_TICKS', 'TICKS_PER_SEC'], types: [] },
  ]);
  assert.deepEqual(deep, [
    'src/ui/Hud.tsx imports ../sim/rules — ui may import src/sim only as types, not RAPID_TICKS, TICKS_PER_SEC',
    'src/ui/Hud.tsx imports ../sim/rules — deep import of src/sim/rules; import the src/sim barrel',
  ]);
  const levels = boundaryViolations('src/ui/Complete.tsx', [
    { spec: '../levels', typeOnly: false, values: ['LEVELS', 'Kind'], types: ['LevelNumber'] },
  ]);
  assert.deepEqual(levels, [
    'src/ui/Complete.tsx imports ../levels — ui may value-import only BOSSES, levelSpec, tierOf, LEVELS from src/levels, not Kind',
  ]);
  assert.deepEqual(boundaryViolations('src/render.test.ts', [
    { spec: './sim/world', typeOnly: false, values: ['add'], types: [] },
    { spec: './render/meshes.gen', typeOnly: false, values: ['MESHES'], types: ['MeshId'] },
  ]), []);
  assert.deepEqual(moduleId('App.tsx', './src/dev/qa'), 'src/dev/qa');
  assert.deepEqual(moduleId('src/shell/loop.ts', '../sim'), 'src/sim');
  assert.deepEqual(moduleId('src/render/batch.ts', './meshes.gen'), 'src/render/meshes.gen');
});

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(path);
  }
}

const sources: string[] = [];
walk(join(root, 'src'), sources);
sources.push(join(root, 'App.tsx'));

for (const path of sources) {
  const file = relative(root, path).replace(/\\/g, '/');
  test(`${file} respects module boundaries`, () => {
    const violations = boundaryViolations(file, importsIn(readFileSync(path, 'utf8')));
    assert.deepEqual(violations, [], mentions(file, violations.join('\n'), ''));
  });
}
