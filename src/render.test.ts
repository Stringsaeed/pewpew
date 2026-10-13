import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { greedyBot } from './bot';
import { Kind } from './levels';
import { MESHES, type MeshId } from './render/meshes.gen';
import { MAX_PIXEL_RATIO, LOOK, createRenderer } from './render';
import { STEP, createWorld, step, type SimEvent, type World } from './sim';
import { createFakeGpu, type FakeGpu, type GpuCall } from './testing/fake-gpu';

const SNAP = new URL('./testing/render.snapshot.json', import.meta.url);
const FRAMES = 100;
const ALPHA = 0.25;
const VARIANTS = 4;
const MESH_IDS = Object.keys(MESHES) as MeshId[];
const LAYOUT = (() => {
  let vertex = 0;
  return MESH_IDS.map((id) => {
    const baseVertex = vertex;
    vertex += MESHES[id].positions.length / 3;
    return { id, baseVertex };
  });
})();

describe('renderer', { concurrency: false }, () => {
  test('sizes the canvas from the injected pixel ratio', () => {
    const gpu = createFakeGpu({ clientWidth: 100, clientHeight: 50 });
    const renderer = createRenderer(gpu.device, gpu.context, 'bgra8unorm', 3);
    renderer.frame(null, [], 0, STEP);
    assert.equal(gpu.canvas.width, 300);
    assert.equal(gpu.canvas.height, 150);
    assert.equal(gpu.configures, 1);
    const texture = gpu.calls.find((call) => call.op === 'createTexture');
    assert.deepEqual(texture, { op: 'createTexture', width: 300, height: 150, format: 'depth24plus' });
    renderer.dispose();
    assert.ok(gpu.buffers.length > 0 && gpu.buffers.every((buffer) => buffer.destroyed));
  });

  test('a zero layout draws nothing', () => {
    const gpu = createFakeGpu({ clientWidth: 0, clientHeight: 40 });
    const renderer = createRenderer(gpu.device, gpu.context, 'bgra8unorm', MAX_PIXEL_RATIO);
    renderer.frame(null, [], 0, STEP);
    assert.equal(gpu.calls.some((call) => call.op === 'present' || call.op === 'createTexture'), false);
    assert.equal(gpu.configures, 0);
    renderer.dispose();
    assert.ok(gpu.buffers.every((buffer) => buffer.destroyed));
  });

  test('a null world draws stars and particles, never meshes', () => {
    const restore = installRandom(1);
    try {
      const gpu = createFakeGpu();
      const renderer = createRenderer(gpu.device, gpu.context, 'bgra8unorm', MAX_PIXEL_RATIO);
      const world = createWorld(1);
      const events: SimEvent[] = [];
      for (let i = 0; i < 5; i++) {
        step(world, greedyBot(world), events);
        renderer.frame(world, events, ALPHA, STEP);
        events.length = 0;
      }
      const mark = gpu.calls.length;
      renderer.frame(null, [], ALPHA, STEP);
      const frame = gpu.calls.slice(mark);
      assert.equal(frame.some((call) => call.op === 'drawIndexed'), false);
      const draws = frame.filter((call) => call.op === 'draw');
      assert.ok(draws.length >= 1);
      assert.equal(draws[0]?.op === 'draw' && draws[0].vertexCount, 3);
      assert.ok(draws.every((call) => call.op === 'draw' && (call.vertexCount === 3 || call.vertexCount === 4)));
      assert.ok(draws.some((call) => call.op === 'draw' && call.vertexCount === 4));
      renderer.dispose();
      assert.ok(gpu.buffers.every((buffer) => buffer.destroyed));
    } finally {
      restore();
    }
  });

  test('a won hold dives the rocket into the black hole and a new run ends the hold', () => {
    const restore = installRandom(7);
    try {
      const gpu = createFakeGpu();
      const renderer = createRenderer(gpu.device, gpu.context, 'bgra8unorm', MAX_PIXEL_RATIO);
      const world = createWorld(1);
      world.player.x = 3;
      world.player.y = 40;
      world.wormholeY = 40;
      world.phase = { p: 'won', stars: 3 };
      renderer.hold('won', 1.4);
      const rocket = LAYOUT.find((mesh) => mesh.id === 'rocket')!.baseVertex * 36;
      const hole = LAYOUT.find((mesh) => mesh.id === 'blackhole')!.baseVertex * 36;
      const seen: { rocket: boolean; hole: boolean }[] = [];
      for (let i = 0; i < 20; i++) {
        const mark = gpu.calls.length;
        renderer.frame(world, [], 0, 0.1);
        const offsets = vertexOffsets(gpu.calls.slice(mark), gpu.buffers[0]!.id);
        seen.push({ rocket: offsets.includes(rocket), hole: offsets.includes(hole) });
      }
      assert.equal(seen[0]!.rocket, true);
      assert.equal(seen[19]!.rocket, false);
      assert.ok(seen.every((frame) => frame.hole));
      renderer.frame(createWorld(1), [], 0, STEP);
      const mark = gpu.calls.length;
      renderer.frame(createWorld(1), [], 0, STEP);
      assert.ok(vertexOffsets(gpu.calls.slice(mark), gpu.buffers[0]!.id).includes(rocket));
      renderer.dispose();
    } finally {
      restore();
    }
  });

  test('hits shake the camera, reduce motion does not, and the shake dies away', () => {
    const restore = installRandom(3);
    try {
      const shakeAfter = (reduce: boolean): number[] => {
        const gpu = createFakeGpu();
        const renderer = createRenderer(gpu.device, gpu.context, 'bgra8unorm', MAX_PIXEL_RATIO);
        renderer.setReduceMotion(reduce);
        const world = createWorld(1);
        const out: number[] = [];
        const hit: SimEvent = { e: 'playerHit', x: 0, y: 0, lives: 2 };
        for (const [events, dt] of [[[hit], 0.016], [[], 0.016], [[], 1.5]] as const) {
          renderer.frame(world, events, 0, dt);
          const uniform = gpu.buffers[4]!.id;
          let at = 0, last = -1;
          for (const call of gpu.calls) if (call.op === 'writeBuffer') { if (call.buffer === uniform) last = at; at++; }
          const floats = new Float32Array(gpu.writes[last]!.buffer.slice(0));
          out.push(Math.abs(floats[12]!));
        }
        renderer.dispose();
        return out;
      };
      const shaken = shakeAfter(false);
      assert.ok(shaken[0]! > 0.001 && shaken[1]! > 0.001);
      assert.equal(shaken[2], 0);
      assert.deepEqual(shakeAfter(true), [0, 0, 0]);
    } finally {
      restore();
    }
  });

  test('the shield bubble draws last in its own pipeline and lingers half a second after a block', () => {
    const restore = installRandom(5);
    try {
      const gpu = createFakeGpu();
      const renderer = createRenderer(gpu.device, gpu.context, 'bgra8unorm', MAX_PIXEL_RATIO);
      const world = createWorld(1);
      world.player.shield = true;
      const bubble = LAYOUT.find((mesh) => mesh.id === 'bubble')!.baseVertex * 36;
      const drawsBubble = (event: SimEvent[], dt: number): boolean => {
        const mark = gpu.calls.length;
        renderer.frame(world, event, 0, dt);
        const frame = gpu.calls.slice(mark);
        const offsets = vertexOffsets(frame, gpu.buffers[0]!.id);
        const pipelines = frame.filter((call) => call.op === 'setPipeline');
        if (offsets.includes(bubble)) {
          assert.equal(offsets[offsets.length - 1], bubble);
          assert.equal(pipelines.length, 4);
        }
        return offsets.includes(bubble);
      };
      assert.equal(drawsBubble([], 0.016), true);
      world.player.shield = false;
      assert.equal(drawsBubble([{ e: 'shieldBlock', x: 0, y: 0 }], 0.016), true);
      assert.equal(drawsBubble([], 0.3), true);
      assert.equal(drawsBubble([], 0.3), false);
      renderer.dispose();
    } finally {
      restore();
    }
  });

  test('a lost hold hides the ship and keeps drawing the fire', () => {
    const restore = installRandom(9);
    try {
      const gpu = createFakeGpu();
      const renderer = createRenderer(gpu.device, gpu.context, 'bgra8unorm', MAX_PIXEL_RATIO);
      const world = createWorld(1);
      world.phase = { p: 'lost' };
      renderer.hold('lost', 1);
      const rocket = LAYOUT.find((mesh) => mesh.id === 'rocket')!.baseVertex * 36;
      for (let i = 0; i < 10; i++) {
        const mark = gpu.calls.length;
        renderer.frame(world, [], 0, 0.1);
        const frame = gpu.calls.slice(mark);
        assert.equal(vertexOffsets(frame, gpu.buffers[0]!.id).includes(rocket), false);
        assert.ok(frame.some((call) => call.op === 'draw' && call.vertexCount === 4 && call.instanceCount > 20));
      }
      renderer.dispose();
    } finally {
      restore();
    }
  });

  test('level 1 and a boss fight match the draw contract and the snapshot', () => {
    const restore = installRandom(0xdecaf);
    try {
      const level1 = play(createWorld(1), FRAMES);
      const bossWorld = createWorld(10);
      reachBoss(bossWorld);
      const boss = play(bossWorld, FRAMES);
      const shot = {
        level1: pick(level1),
        boss: pick(boss),
      };
      const text = `${JSON.stringify(shot, null, 2)}\n`;
      if (process.env.UPDATE_RENDER_SNAPSHOT) writeFileSync(SNAP, text);
      assertSameText(readFileSync(SNAP, 'utf8'), text);
    } finally {
      restore();
    }
  });
});

function reachBoss(world: World): void {
  const events: SimEvent[] = [];
  for (let i = 0; i < 20000 && world.phase.p !== 'boss'; i++) {
    step(world, greedyBot(world), events);
    events.length = 0;
  }
  assert.equal(world.phase.p, 'boss');
  assert.ok(world.boss);
}

interface FrameLog { calls: GpuCall[]; mesh: string; glow: string }

function play(world: World, frames: number): FrameLog[] {
  const gpu = createFakeGpu();
  const renderer = createRenderer(gpu.device, gpu.context, 'bgra8unorm', MAX_PIXEL_RATIO);
  const events: SimEvent[] = [];
  const expected = [];
  for (let i = 0; i < frames; i++) {
    step(world, greedyBot(world), events);
    expected.push(instanceCounts(world));
    renderer.frame(world, events, ALPHA, STEP);
    events.length = 0;
  }
  const logs = splitFrames(gpu);
  assert.equal(logs.length, frames);
  assert.equal(gpu.buffers.length, 5);
  assert.equal(gpu.configures, 1);
  const vertex = gpu.buffers[0]!.id;
  for (let i = 0; i < frames; i++) {
    assertDraws(logs[i]!.calls, expected[i]!, vertex);
    if (i === 0) continue;
    assert.equal(logs[i]!.calls.some((call) => call.op === 'createBuffer' || call.op === 'createTexture'), false);
  }
  renderer.dispose();
  assert.ok(gpu.buffers.every((buffer) => buffer.destroyed));
  assert.ok(gpu.textures.every((texture) => texture.destroyed));
  return logs;
}

/** Bodies per mesh, plus the rocket, boss, black hole, and shield bubble the renderer appends to those groups. */
function instanceCounts(world: World): Map<MeshId, number> {
  const counts = new Map<MeshId, number>();
  for (const id of MESH_IDS) counts.set(id, 0);
  const bodies = world.bodies;
  for (let i = 0; i < bodies.count; i++) {
    const look = LOOK[bodies.kind[i] as Kind];
    if (look.draw !== 'mesh') continue;
    const slot = (bodies.variant[i]! % VARIANTS) % look.meshes.length;
    const id = look.meshes[slot]!;
    counts.set(id, counts.get(id)! + 1);
  }
  counts.set('rocket', counts.get('rocket')! + 1);
  if (world.boss) counts.set(world.boss.id, counts.get(world.boss.id)! + 1);
  if (world.player.shield) counts.set('bubble', counts.get('bubble')! + 1);
  if (world.wormholeY !== null) {
    counts.set('blackhole', counts.get('blackhole')! + 1);
    counts.set('accretion', counts.get('accretion')! + 1);
  }
  return counts;
}

function assertDraws(calls: GpuCall[], counts: Map<MeshId, number>, vertex: number): void {
  const drawn: { offset: number; instances: number }[] = [];
  let offset = -1;
  for (const call of calls) {
    if (call.op === 'setVertexBuffer' && call.slot === 0 && call.buffer === vertex) offset = call.offset;
    if (call.op === 'drawIndexed') drawn.push({ offset, instances: call.instanceCount });
  }
  const groups = LAYOUT.filter((mesh) => (counts.get(mesh.id) ?? 0) > 0);
  assert.equal(drawn.length, groups.length);
  for (let i = 0; i < groups.length; i++) {
    assert.equal(drawn[i]!.offset, groups[i]!.baseVertex * 36);
    assert.equal(drawn[i]!.instances, counts.get(groups[i]!.id));
  }
}

/** Vertex-buffer offsets of every indexed draw in a frame: one per mesh group drawn. */
function vertexOffsets(calls: GpuCall[], vertex: number): number[] {
  const offsets: number[] = [];
  let offset = -1;
  for (const call of calls) {
    if (call.op === 'setVertexBuffer' && call.slot === 0 && call.buffer === vertex) offset = call.offset;
    if (call.op === 'drawIndexed') offsets.push(offset);
  }
  return offsets;
}

function splitFrames(gpu: FakeGpu): FrameLog[] {
  const meshId = gpu.buffers[2]!.id;
  const glowId = gpu.buffers[3]!.id;
  const frames: FrameLog[] = [];
  let calls: GpuCall[] = [];
  let mesh = '';
  let glow = '';
  let writeAt = 0;
  for (const call of gpu.calls) {
    calls.push(call);
    if (call.op === 'writeBuffer') {
      const bytes = gpu.writes[writeAt++]!;
      if (call.buffer === meshId) mesh = packFloats(bytes);
      else if (call.buffer === glowId) glow = packFloats(bytes);
    }
    if (call.op === 'present') {
      frames.push({ calls, mesh, glow });
      calls = [];
      mesh = '';
      glow = '';
    }
  }
  assert.equal(writeAt, gpu.writes.length);
  return frames;
}

function pick(frames: FrameLog[]): { 1: FrameLog; 50: FrameLog; 100: FrameLog } {
  return { 1: frames[0]!, 50: frames[49]!, 100: frames[99]! };
}

function packFloats(bytes: Uint8Array): string {
  const floats = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  let text = '';
  for (let i = 0; i < floats.length; i++) {
    if (i) text += ',';
    text += JSON.stringify(floats[i]);
  }
  return text;
}

function installRandom(seed: number): () => void {
  const prev = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return () => { Math.random = prev; };
}

function assertSameText(actual: string, expected: string): void {
  if (actual === expected) return;
  const n = Math.min(actual.length, expected.length);
  let i = 0;
  while (i < n && actual[i] === expected[i]) i++;
  assert.fail(`snapshot mismatch at ${i} (lengths ${actual.length} vs ${expected.length}): ${JSON.stringify(actual.slice(Math.max(0, i - 40), i + 80))}`);
}
