import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { d } from 'typegpu';
import { INSTANCE_FLOATS } from './batch';
import { UNIFORM_FLOATS } from './camera';
import { generate } from '../../scripts/gen-shaders';
import { SHADERS, Uniforms, instanceLayout, meshVertexLayout, shaderCode } from './shaders';

const count = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

describe('shaders', () => {
  // The fake GPU never compiles WGSL, so resolving is the only shader check short of a device.
  for (const [name, pair] of Object.entries(SHADERS)) {
    test(`${name} resolves to one vertex and one fragment entry point over the uniform block`, () => {
      const wgsl = shaderCode(pair);
      assert.equal(count(wgsl, /@vertex fn /g), 1);
      assert.equal(count(wgsl, /@fragment fn /g), 1);
      assert.equal(count(wgsl, /@group\(0\) @binding\(0\) var<uniform> \w+: Uniforms;/g), 1);
      assert.equal(count(wgsl, /@group\(/g), 1);
    });
  }

  test('shaders.gen.ts is up to date: the app ships this WGSL, not the TypeGPU functions', () => {
    const current = readFileSync(new URL('./shaders.gen.ts', import.meta.url), 'utf8');
    assert.ok(current === generate(), 'src/render/shaders.gen.ts is stale; run npm run gen:shaders');
  });

  test('the schemas match what camera.ts, the renderer, and the batcher pack', () => {
    assert.equal(d.sizeOf(Uniforms), UNIFORM_FLOATS * 4);
    // camera.ts writes floats 0 to 35; the renderer writes the nebula tint at 36 and fx at 40.
    assert.equal(d.memoryLayoutOf(Uniforms, (u) => u.res).offset, 32 * 4);
    assert.equal(d.memoryLayoutOf(Uniforms, (u) => u.camY).offset, 34 * 4);
    assert.equal(d.memoryLayoutOf(Uniforms, (u) => u.time).offset, 35 * 4);
    assert.equal(d.memoryLayoutOf(Uniforms, (u) => u.tint).offset, 36 * 4);
    assert.equal(d.memoryLayoutOf(Uniforms, (u) => u.fx).offset, 40 * 4);
    assert.equal(instanceLayout.vertexLayout.arrayStride, INSTANCE_FLOATS * 4);
    assert.equal(instanceLayout.vertexLayout.stepMode, 'instance');
    // createRenderer interleaves position, normal, and color: 9 floats per vertex.
    assert.equal(meshVertexLayout.vertexLayout.arrayStride, 9 * 4);
  });
});
