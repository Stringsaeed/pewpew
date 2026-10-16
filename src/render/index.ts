import { FRAME_TIMING } from '../frameTiming';
import { tierOf } from '../levels';
import type { NativeCanvas } from 'react-native-webgpu';
import type { SimEvent, WorldView } from '../sim';
import { INSTANCE_FLOATS, MESH_IDS, createBatch } from './batch';
import { UNIFORM_FLOATS, writeCamera } from './camera';
import { LOOK, TIER_TINT, type Look } from './look';
import { MESHES } from './meshes.gen';
import { HOLD_LOST, HOLD_NONE, HOLD_WON, SHAKE_REACH, TRAUMA_DECAY, ageHitFlashes, bossPhaseIndex, createFx, holdProgress, smooth, wobble } from './fx';
import { applyEvents, createPool, emitBossDamage, integrate, spawnExhaust } from './particles';
import { SHADERS, instanceLayout, meshVertexLayout, shaderCode, type ShaderPair } from './shaders';

export type { Look };
export { LOOK };

/**
 * Reads WorldView, never writes it. Owns GPU objects and particles. Three pipelines, drawn in order into one pass
 * with a depth buffer:
 *  stars  fullscreen triangle, procedural hashed star layers parallaxed by a camera y uniform. No buffers.
 *  mesh   one shared vertex and index buffer holding every MeshData (interleaved pos|normal|color, 36 B), plus one
 *         instance buffer (12 f32 per instance, see Instance in shaders.ts). Per frame: counting-sort live bodies by MeshId,
 *         one writeBuffer, then drawIndexed per non-empty mesh with the vertex and instance buffers bound at that mesh's offsets.
 *         Rocket, boss, and the black hole (horizon plus accretion disc) are appended from the player, boss, and wormholeY
 *         scalars. Lambert plus emissive vertex color. The instance's mode column picks the transform (see shaders.ts).
 *  glow   instanced quads, additive blend, no depth write: bolts, exhaust, explosion particles, rings, halos, shield bubble.
 * Particles live here (CPU SoA, 2048 cap) and spawn from SimEvents; the sim never knows they exist.
 * The shaders are TypeGPU functions (shaders.ts), resolved to WGSL once here. Pipelines and draws stay raw WebGPU.
 */
export interface Renderer {
  /** world null = menu backdrop (stars only). alpha = leftover accumulator / STEP, for interpolation. */
  frame(world: WorldView | null, events: readonly SimEvent[], alpha: number, dtSec: number): void;
  /** Shake off, white flashes at half strength. The shell skips slow motion itself. */
  setReduceMotion(on: boolean): void;
  /**
   * Called once when the sim emits `won` or `lost`. The shell then keeps calling `frame` with the same terminal world
   * for about `seconds` of the dt it passes (1.4 for won, 1.0 for lost), already scaled for slow motion. Won flies the
   * rocket into the black hole and ends in a white flash. Lost blows the ship up and hides it.
   */
  hold(kind: 'won' | 'lost', seconds: number): void;
  dispose(): void;
}

export const MAX_PIXEL_RATIO = 2;
const BUBBLE_MESH = MESH_IDS.indexOf('bubble');
const VERTEX_BYTES = meshVertexLayout.vertexLayout.arrayStride;
const INSTANCE_BYTES = instanceLayout.vertexLayout.arrayStride;

export function createRenderer(
  device: GPUDevice,
  ctx: GPUCanvasContext & { present(): void },
  format: GPUTextureFormat,
  pixelRatio: number,
): Renderer {
  const canvas = ctx.canvas as unknown as NativeCanvas;

  let vertexCount = 0;
  let indexCount = 0;
  for (const id of MESH_IDS) { vertexCount += MESHES[id].positions.length / 3; indexCount += MESHES[id].indices.length; }
  const vertexData = new Float32Array(vertexCount * 9);
  const indexData = new Uint16Array(indexCount + (indexCount & 1));
  const firstIndex = new Uint32Array(MESH_IDS.length);
  const indexCountOf = new Uint32Array(MESH_IDS.length);
  const baseVertex = new Int32Array(MESH_IDS.length);
  {
    let v = 0, ix = 0;
    MESH_IDS.forEach((id, m) => {
      const { positions, normals, colors, indices } = MESHES[id];
      firstIndex[m] = ix; indexCountOf[m] = indices.length; baseVertex[m] = v;
      for (let i = 0; i < positions.length / 3; i++, v++) {
        vertexData.set(positions.subarray(i * 3, i * 3 + 3), v * 9);
        vertexData.set(normals.subarray(i * 3, i * 3 + 3), v * 9 + 3);
        vertexData.set(colors.subarray(i * 3, i * 3 + 3), v * 9 + 6);
      }
      indexData.set(indices, ix);
      ix += indices.length;
    });
  }
  const buffer = (data: Float32Array | Uint16Array, usage: GPUBufferUsageFlags) => {
    const b = device.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, data);
    return b;
  };
  const vertexBuf = buffer(vertexData, GPUBufferUsage.VERTEX);
  const indexBuf = buffer(indexData, GPUBufferUsage.INDEX);
  const batch = createBatch();
  const meshInstBuf = buffer(batch.meshInst, GPUBufferUsage.VERTEX);
  const glowInstBuf = buffer(batch.glowInst, GPUBufferUsage.VERTEX);
  const uniforms = new Float32Array(UNIFORM_FLOATS);
  const uniformBuf = buffer(uniforms, GPUBufferUsage.UNIFORM);

  const bindLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bindLayout] });
  const bind = device.createBindGroup({ layout: bindLayout, entries: [{ binding: 0, resource: { buffer: uniformBuf } }] });
  const DEPTH: GPUTextureFormat = 'depth24plus';
  const additive: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };

  // Each module holds one vertex and one fragment entry point, so the pipelines leave entryPoint to WebGPU.
  const module = (pair: ShaderPair) => device.createShaderModule({ code: shaderCode(pair) });
  const starsModule = module(SHADERS.stars);
  const meshModule = module(SHADERS.mesh);
  const glowModule = module(SHADERS.glow);
  const bubbleModule = module(SHADERS.bubble);
  const starsPipe = device.createRenderPipeline({
    layout,
    vertex: { module: starsModule },
    fragment: { module: starsModule, targets: [{ format }] },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'always' },
  });
  const meshBuffers = [meshVertexLayout.vertexLayout, instanceLayout.vertexLayout];
  const meshPipe = device.createRenderPipeline({
    layout,
    vertex: { module: meshModule, buffers: meshBuffers },
    fragment: { module: meshModule, targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less' },
  });
  // The shield bubble: the same vertex layout, its own shader, additive, no depth write, drawn after everything else.
  const bubblePipe = device.createRenderPipeline({
    layout,
    vertex: { module: bubbleModule, buffers: meshBuffers },
    fragment: { module: bubbleModule, targets: [{ format, blend: { color: additive, alpha: additive } }] },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less' },
  });
  const glowPipe = device.createRenderPipeline({
    layout,
    vertex: { module: glowModule, buffers: [instanceLayout.vertexLayout] },
    fragment: { module: glowModule, targets: [{ format, blend: { color: additive, alpha: additive } }] },
    primitive: { topology: 'triangle-strip' },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less' },
  });

  const pool = createPool();
  const fx = createFx();

  let depth: GPUTexture | null = null;
  let width = 0;
  let height = 0;
  let time = 0;
  let menuY = 0;
  const colorAttachment: GPURenderPassColorAttachment = {
    view: undefined as unknown as GPUTextureView,
    clearValue: { r: 0.01, g: 0.01, b: 0.03, a: 1 },
    loadOp: 'clear', storeOp: 'store',
  };
  const depthAttachment: GPURenderPassDepthStencilAttachment = {
    view: undefined as unknown as GPUTextureView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard',
  };
  const passDesc: GPURenderPassDescriptor = { colorAttachments: [colorAttachment], depthStencilAttachment: depthAttachment };

  function resize(): boolean {
    const w = Math.round(canvas.clientWidth * pixelRatio);
    const h = Math.round(canvas.clientHeight * pixelRatio);
    if (w === 0 || h === 0) return false;
    if (w === width && h === height) return true;
    canvas.width = w;
    canvas.height = h;
    ctx.configure({ device, format, alphaMode: 'opaque' });
    depth?.destroy();
    depth = device.createTexture({ size: [w, h], format: DEPTH, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    depthAttachment.view = depth.createView();
    width = w;
    height = h;
    return true;
  }

  function frame(world: WorldView | null, events: readonly SimEvent[], alpha: number, dt: number): void {
    if (!resize()) return;
    const timing = FRAME_TIMING;
    let mark = timing.on ? performance.now() : 0;
    time += dt;
    // A new run, or the menu, ends the hold: the shell never says so.
    if (fx.hold !== HOLD_NONE && (!world || (world.phase.p !== 'won' && world.phase.p !== 'lost'))) fx.hold = HOLD_NONE;
    fx.flash = Math.max(0, fx.flash - dt);
    fx.cooldown = Math.max(0, fx.cooldown - dt);
    fx.holeAge += dt;
    fx.bubbleAge += dt;
    if (fx.hitLive) ageHitFlashes(fx, dt);
    fx.trauma = Math.max(0, fx.trauma - TRAUMA_DECAY * dt);
    fx.dying = Math.max(0, fx.dying - dt);
    if (fx.ripple >= 0) fx.ripple += dt;
    if (fx.hold !== HOLD_NONE) fx.holdT += dt;
    applyEvents(pool, world, events, batch.bursts, fx);
    integrate(pool, dt);

    batch.begin();
    let camY = menuY;
    let zoom = 1;
    if (world) {
      batch.packWorld(world, alpha, time, fx);
      camY = batch.py;
      if (world.boss) emitBossDamage(pool, fx, world.boss.x, world.boss.y, bossPhaseIndex(world.boss.id, world.boss.hp), dt);
      if (batch.exhaust) spawnExhaust(pool, batch.nozzleX, batch.nozzleY, batch.headX, batch.headY, batch.puff, dt);
      if (fx.hold === HOLD_WON && world.wormholeY !== null) {
        const e = smooth(0, 0.8, holdProgress(fx));
        camY += (world.wormholeY - camY) * 0.6 * e;
        zoom = 1 - 0.14 * e;
      }
    } else {
      menuY += dt * 2.5;
    }
    batch.packParticles(pool);

    // Backdrop: the tier's nebula tint and the scroll speed ease toward their targets, so a new level never snaps.
    const tier = world ? tierOf(world.spec.n) : 1;
    const ease = Math.min(1, dt * 2.5);
    const tint = TIER_TINT[tier - 1];
    fx.tintR += (tint[0] - fx.tintR) * ease; fx.tintG += (tint[1] - fx.tintG) * ease; fx.tintB += (tint[2] - fx.tintB) * ease;
    fx.speed += ((fx.reduceMotion ? 0 : world ? world.spec.scroll : 2.5) - fx.speed) * ease;
    fx.warp = fx.reduceMotion || fx.hold !== HOLD_WON ? 0 : smooth(0, 0.8, holdProgress(fx));
    uniforms[36] = fx.tintR; uniforms[37] = fx.tintG; uniforms[38] = fx.tintB; uniforms[39] = 1;
    uniforms[40] = fx.speed; uniforms[41] = fx.warp;
    const shake = fx.trauma * fx.trauma * SHAKE_REACH;
    writeCamera(uniforms, camY, width, height, time, zoom, shake * wobble(time, 0), shake * wobble(time, 11));
    device.queue.writeBuffer(uniformBuf, 0, uniforms);
    if (batch.meshSlots > 0) device.queue.writeBuffer(meshInstBuf, 0, batch.meshInst, 0, batch.meshSlots * INSTANCE_FLOATS);
    if (batch.glowCount > 0) device.queue.writeBuffer(glowInstBuf, 0, batch.glowInst, 0, batch.glowCount * INSTANCE_FLOATS);

    if (timing.on) mark = lap(timing, 'pack', mark);
    colorAttachment.view = ctx.getCurrentTexture().createView();
    if (timing.on) mark = lap(timing, 'acquire', mark);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass(passDesc);
    pass.setBindGroup(0, bind);
    pass.setPipeline(starsPipe);
    pass.draw(3);
    if (batch.meshSlots > 0) {
      pass.setPipeline(meshPipe);
      pass.setIndexBuffer(indexBuf, 'uint16');
      for (let m = 0; m < batch.counts.length; m++) {
        if (batch.counts[m] === 0 || m === BUBBLE_MESH) continue;
        // Dawn rejects a nonzero baseVertex or firstInstance unless the device enabled 'indirect-first-instance',
        // so both offsets go into the vertex buffer bindings and the renderer works with whatever device it is given.
        pass.setVertexBuffer(0, vertexBuf, baseVertex[m] * VERTEX_BYTES);
        pass.setVertexBuffer(1, meshInstBuf, batch.starts[m] * INSTANCE_BYTES);
        pass.drawIndexed(indexCountOf[m], batch.counts[m], firstIndex[m], 0, 0);
      }
    }
    if (batch.glowCount > 0) {
      pass.setPipeline(glowPipe);
      pass.setVertexBuffer(0, glowInstBuf);
      pass.draw(4, batch.glowCount);
    }
    if (batch.counts[BUBBLE_MESH] > 0) {
      pass.setPipeline(bubblePipe);
      pass.setVertexBuffer(0, vertexBuf, baseVertex[BUBBLE_MESH] * VERTEX_BYTES);
      pass.setVertexBuffer(1, meshInstBuf, batch.starts[BUBBLE_MESH] * INSTANCE_BYTES);
      pass.drawIndexed(indexCountOf[BUBBLE_MESH], batch.counts[BUBBLE_MESH], firstIndex[BUBBLE_MESH], 0, 0);
    }
    pass.end();
    const commands = encoder.finish();
    if (timing.on) mark = lap(timing, 'encode', mark);
    device.queue.submit([commands]);
    if (timing.on) mark = lap(timing, 'submit', mark);
    ctx.present();
    if (timing.on) lap(timing, 'present', mark);
  }

  return {
    frame,
    setReduceMotion(on) {
      fx.reduceMotion = on;
      if (on) fx.trauma = 0;
    },
    hold(kind, seconds) {
      fx.hold = kind === 'won' ? HOLD_WON : HOLD_LOST;
      fx.holdSeconds = Math.max(seconds, 0.1);
      fx.holdT = 0;
      fx.holdFresh = true;
    },
    dispose() {
      for (const b of [vertexBuf, indexBuf, meshInstBuf, glowInstBuf, uniformBuf]) b.destroy();
      depth?.destroy();
    },
  };
}

/** Adds the time since `since` to one frame phase and returns now. */
function lap(timing: typeof FRAME_TIMING, phase: 'pack' | 'acquire' | 'encode' | 'submit' | 'present', since: number): number {
  const now = performance.now();
  timing[phase] += now - since;
  return now;
}
