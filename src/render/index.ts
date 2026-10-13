import type { NativeCanvas } from 'react-native-webgpu';
import { ARCHETYPES, Kind, type BossId } from '../levels';
import { BOSS_RADIUS, LOOK, ROCKET_RADIUS, WORMHOLE_RADIUS, type Look } from './look';
import { MESHES, type MeshId } from './meshes.gen';
import { GLOW, MESH, STARS } from './wgsl';
import { MAX_BODIES, type SimEvent, type WorldView } from '../sim';

export type { Look };
export { LOOK };

/**
 * Reads WorldView, never writes it. Owns GPU objects and particles. Three pipelines, drawn in order into one pass
 * with a depth buffer:
 *  stars  fullscreen triangle, procedural hashed star layers parallaxed by a camera y uniform. No buffers.
 *  mesh   one shared vertex and index buffer holding every MeshData (interleaved pos|normal|color, 36 B), plus one
 *         instance buffer (x, y, rot, scale, tint rgb, flash = 8 f32). Per frame: counting-sort live bodies by MeshId,
 *         one writeBuffer, then drawIndexed per non-empty mesh with the vertex and instance buffers bound at that mesh's offsets.
 *         Rocket, boss, and wormhole are appended from the player, boss, and wormholeY scalars. Lambert plus emissive vertex color.
 *  glow   instanced quads, additive blend, no depth write: bolts, exhaust, explosion particles, shield bubble.
 * Particles live here (CPU SoA, 2048 cap) and spawn from SimEvents; the sim never knows they exist.
 */
export interface Renderer {
  /** world null = menu backdrop (stars only). alpha = leftover accumulator / STEP, for interpolation. */
  frame(world: WorldView | null, events: readonly SimEvent[], alpha: number, dtSec: number): void;
  dispose(): void;
}

export const MAX_PIXEL_RATIO = 2;

const MESH_IDS = Object.keys(MESHES) as MeshId[];
const MESH_INDEX = Object.fromEntries(MESH_IDS.map((id, i) => [id, i])) as { [M in MeshId]: number };
const INSTANCE_FLOATS = 8;
const MESH_CAP = MAX_BODIES + 3;
const PARTICLE_CAP = 2048;
const GLOW_CAP = MAX_BODIES + PARTICLE_CAP + 2;
const FOV_Y = (50 * Math.PI) / 180;
const PITCH = (16 * Math.PI) / 180;
const LOOK_AHEAD = 6.5;
const VISIBLE_HALF_WIDTH = 5.4;
const NEAR = 1;
const FAR = 90;
const BOSS_MESH: { readonly [B in BossId]: number } = {
  warden: MESH_INDEX.warden, hive: MESH_INDEX.hive, core: MESH_INDEX.core,
};
const KIND_COUNT = Object.keys(LOOK).length;
const VARIANTS = 4;

/** Mean vertex color normalized to a max channel of 1: the burst color when that mesh is destroyed. */
function signature(id: MeshId): [number, number, number] {
  const c = MESHES[id].colors;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < c.length; i += 3) { r += Math.min(c[i], 1); g += Math.min(c[i + 1], 1); b += Math.min(c[i + 2], 1); }
  const m = Math.max(r, g, b) || 1;
  return [r / m, g / m, b / m];
}

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
  const meshInst = new Float32Array(MESH_CAP * INSTANCE_FLOATS);
  const glowInst = new Float32Array(GLOW_CAP * INSTANCE_FLOATS);
  const meshInstBuf = buffer(meshInst, GPUBufferUsage.VERTEX);
  const glowInstBuf = buffer(glowInst, GPUBufferUsage.VERTEX);
  const uniforms = new Float32Array(36);
  const uniformBuf = buffer(uniforms, GPUBufferUsage.UNIFORM);

  const bindLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bindLayout] });
  const bind = device.createBindGroup({ layout: bindLayout, entries: [{ binding: 0, resource: { buffer: uniformBuf } }] });
  const DEPTH: GPUTextureFormat = 'depth24plus';
  const additive: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };

  const starsModule = device.createShaderModule({ code: STARS });
  const meshModule = device.createShaderModule({ code: MESH });
  const glowModule = device.createShaderModule({ code: GLOW });
  const starsPipe = device.createRenderPipeline({
    layout,
    vertex: { module: starsModule, entryPoint: 'vs' },
    fragment: { module: starsModule, entryPoint: 'fs', targets: [{ format }] },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'always' },
  });
  const meshPipe = device.createRenderPipeline({
    layout,
    vertex: {
      module: meshModule, entryPoint: 'vs',
      buffers: [
        { arrayStride: 36, attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x3' },
        ] },
        { arrayStride: 32, stepMode: 'instance', attributes: [
          { shaderLocation: 3, offset: 0, format: 'float32x4' },
          { shaderLocation: 4, offset: 16, format: 'float32x4' },
        ] },
      ],
    },
    fragment: { module: meshModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less' },
  });
  const glowPipe = device.createRenderPipeline({
    layout,
    vertex: {
      module: glowModule, entryPoint: 'vs',
      buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x4' },
        { shaderLocation: 1, offset: 16, format: 'float32x4' },
      ] }],
    },
    fragment: { module: glowModule, entryPoint: 'fs', targets: [{ format, blend: { color: additive, alpha: additive } }] },
    primitive: { topology: 'triangle-strip' },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less' },
  });

  // Flat (kind, variant) tables so the per-body loop is two typed-array reads. Mesh -1 means a glow kind.
  const meshOf = new Int16Array(KIND_COUNT * VARIANTS).fill(-1);
  const scaleOf = new Float32Array(KIND_COUNT * VARIANTS);
  const tintOf = new Float32Array(KIND_COUNT * 3);
  const burst = new Float32Array(KIND_COUNT * 3);
  for (let k = 0; k < KIND_COUNT; k++) {
    const look = LOOK[k as Kind];
    if (look.draw === 'mesh') {
      if (look.meshes.length > VARIANTS || VARIANTS % look.meshes.length !== 0) throw new Error(`LOOK[${k}]: mesh count must divide ${VARIANTS}`);
      for (let v = 0; v < VARIANTS; v++) {
        const id = look.meshes[v % look.meshes.length];
        meshOf[k * VARIANTS + v] = MESH_INDEX[id];
        scaleOf[k * VARIANTS + v] = ARCHETYPES[k as Kind].radius / MESHES[id].radius;
      }
      tintOf.set(look.tint, k * 3);
      burst.set(signature(look.meshes[0]), k * 3);
    } else {
      burst.set(look.rgba.slice(0, 3), k * 3);
    }
  }
  const bossBurst = Float32Array.from(MESH_IDS.flatMap((id) => signature(id)));
  const counts = new Uint32Array(MESH_IDS.length);
  const starts = new Uint32Array(MESH_IDS.length);
  const cursor = new Uint32Array(MESH_IDS.length);
  const bodyMesh = new Int16Array(MAX_BODIES);

  const P = {
    count: 0,
    x: new Float32Array(PARTICLE_CAP), y: new Float32Array(PARTICLE_CAP),
    vx: new Float32Array(PARTICLE_CAP), vy: new Float32Array(PARTICLE_CAP),
    life: new Float32Array(PARTICLE_CAP), ttl: new Float32Array(PARTICLE_CAP), size: new Float32Array(PARTICLE_CAP),
    r: new Float32Array(PARTICLE_CAP), g: new Float32Array(PARTICLE_CAP), b: new Float32Array(PARTICLE_CAP),
  };
  const spawn = (x: number, y: number, vx: number, vy: number, ttl: number, size: number, r: number, g: number, b: number) => {
    if (P.count === PARTICLE_CAP) return;
    const i = P.count++;
    P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy;
    P.life[i] = ttl; P.ttl[i] = ttl; P.size[i] = size; P.r[i] = r; P.g[i] = g; P.b[i] = b;
  };
  const burstAt = (x: number, y: number, n: number, speed: number, size: number, ttl: number, rgb: Float32Array, o: number) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + 0.7 * Math.random());
      const hot = Math.random() < 0.3 ? 1 : 0;
      spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, ttl * (0.5 + 0.5 * Math.random()), size * (0.6 + 0.8 * Math.random()),
        hot || rgb[o], hot || rgb[o + 1], hot || rgb[o + 2]);
    }
  };
  const WHITE = Float32Array.of(1, 1, 1);
  const RED = Float32Array.of(1, 0.25, 0.3);
  const SHIELD_BLUE = Float32Array.of(0.35, 0.65, 1);

  let depth: GPUTexture | null = null;
  let width = 0;
  let height = 0;
  let time = 0;
  let menuY = 0;
  let bossFlash = 0;
  let bossFlashCooldown = 0;
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

  function camera(camY: number): void {
    const aspect = width / height;
    const t = Math.tan(FOV_Y / 2);
    const dist = Math.max(VISIBLE_HALF_WIDTH / (t * aspect), 14);
    const ty = camY + LOOK_AHEAD;
    const ey = ty - dist * Math.sin(PITCH);
    const ez = dist * Math.cos(PITCH);
    // Eye and target share x = 0, so the basis is right = +x, forward = (0, fy, fz), up = (0, -fz, fy).
    const fy = (ty - ey) / dist;
    const fz = -ez / dist;
    const u = uniforms;
    u.fill(0);
    u[0] = 1;
    u[5] = -fz; u[6] = -fy;
    u[9] = fy; u[10] = -fz;
    u[13] = -(-fz * ey + fy * ez); u[14] = fy * ey + fz * ez; u[15] = 1;
    const f = 1 / t;
    const nf = 1 / (NEAR - FAR);
    u[16] = f / aspect; u[21] = f; u[26] = FAR * nf; u[27] = -1; u[30] = NEAR * FAR * nf;
    u[32] = width; u[33] = height; u[34] = camY; u[35] = time;
  }

  function putMesh(slot: number, x: number, y: number, rot: number, s: number, r: number, g: number, b: number, flash: number) {
    const o = slot * INSTANCE_FLOATS;
    meshInst[o] = x; meshInst[o + 1] = y; meshInst[o + 2] = rot; meshInst[o + 3] = s;
    meshInst[o + 4] = r; meshInst[o + 5] = g; meshInst[o + 6] = b; meshInst[o + 7] = flash;
  }
  let glowCount = 0;
  function putGlow(x: number, y: number, sx: number, sy: number, r: number, g: number, b: number, a: number) {
    if (glowCount === GLOW_CAP) return;
    const o = glowCount++ * INSTANCE_FLOATS;
    glowInst[o] = x; glowInst[o + 1] = y; glowInst[o + 2] = sx; glowInst[o + 3] = sy;
    glowInst[o + 4] = r; glowInst[o + 5] = g; glowInst[o + 6] = b; glowInst[o + 7] = a;
  }

  function onEvents(world: WorldView | null, events: readonly SimEvent[]): void {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      switch (ev.e) {
        case 'destroy': {
          if (ev.target === 'boss') {
            const m = world?.boss ? BOSS_MESH[world.boss.id] : MESH_INDEX.core;
            burstAt(ev.x, ev.y, 220, 9, 0.5, 1.4, bossBurst, m * 3);
            bossFlash = 0.3;
          } else {
            burstAt(ev.x, ev.y, 18 + Math.round(ARCHETYPES[ev.target].radius * 30), 6, 0.32, 0.8, burst, ev.target * 3);
          }
          break;
        }
        case 'hit':
          burstAt(ev.x, ev.y, 6, 4, 0.2, 0.25, WHITE, 0);
          if (ev.target === 'boss' && bossFlashCooldown <= 0) {
            bossFlash = 0.06;
            bossFlashCooldown = 0.15;
          }
          break;
        case 'playerHit': burstAt(ev.x, ev.y, 48, 7, 0.4, 0.9, RED, 0); break;
        case 'pickup': burstAt(ev.x, ev.y, 22, 4, 0.25, 0.5, burst, ev.kind * 3); break;
        case 'shieldBlock': burstAt(ev.x, ev.y, 36, 6, 0.3, 0.6, SHIELD_BLUE, 0); break;
        default: break;
      }
    }
  }

  function stepParticles(dt: number): void {
    const drag = Math.max(0, 1 - 2.2 * dt);
    for (let i = 0; i < P.count; ) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        const j = --P.count;
        P.x[i] = P.x[j]; P.y[i] = P.y[j]; P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]; P.life[i] = P.life[j];
        P.ttl[i] = P.ttl[j]; P.size[i] = P.size[j]; P.r[i] = P.r[j]; P.g[i] = P.g[j]; P.b[i] = P.b[j];
        continue;
      }
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
      P.vx[i] *= drag; P.vy[i] *= drag;
      i++;
    }
  }

  function frame(world: WorldView | null, events: readonly SimEvent[], alpha: number, dt: number): void {
    if (!resize()) return;
    time += dt;
    bossFlash = Math.max(0, bossFlash - dt);
    bossFlashCooldown = Math.max(0, bossFlashCooldown - dt);
    onEvents(world, events);
    stepParticles(dt);

    counts.fill(0);
    glowCount = 0;
    let camY = menuY;
    let meshSlots = 0;
    if (world) {
      const pl = world.player;
      const px = pl.px + (pl.x - pl.px) * alpha;
      const py = pl.py + (pl.y - pl.py) * alpha;
      camY = py;
      const bodies = world.bodies;
      for (let i = 0; i < bodies.count; i++) {
        const m = meshOf[bodies.kind[i] * VARIANTS + (bodies.variant[i] % VARIANTS)];
        bodyMesh[i] = m;
        if (m >= 0) {
          counts[m]++;
        } else {
          const look = LOOK[bodies.kind[i] as Kind];
          if (look.draw === 'glow') {
            const x = bodies.px[i] + (bodies.x[i] - bodies.px[i]) * alpha;
            const y = bodies.py[i] + (bodies.y[i] - bodies.py[i]) * alpha;
            putGlow(x, y, look.size * 0.7, look.size * 1.9, look.rgba[0], look.rgba[1], look.rgba[2], look.rgba[3]);
          }
        }
      }
      counts[MESH_INDEX.rocket]++;
      if (world.boss) counts[BOSS_MESH[world.boss.id]]++;
      if (world.wormholeY !== null) counts[MESH_INDEX.wormhole]++;

      let acc = 0;
      for (let m = 0; m < counts.length; m++) { starts[m] = acc; cursor[m] = acc; acc += counts[m]; }
      meshSlots = acc;

      for (let i = 0; i < bodies.count; i++) {
        const m = bodyMesh[i];
        if (m < 0) continue;
        const k = bodies.kind[i];
        putMesh(cursor[m]++,
          bodies.px[i] + (bodies.x[i] - bodies.px[i]) * alpha,
          bodies.py[i] + (bodies.y[i] - bodies.py[i]) * alpha,
          bodies.rot[i], scaleOf[k * VARIANTS + (bodies.variant[i] % VARIANTS)],
          tintOf[k * 3], tintOf[k * 3 + 1], tintOf[k * 3 + 2], 0);
      }
      const blink = world.tick < pl.invulnUntil && (world.tick >> 3) % 2 === 0 ? 0.5 : 0;
      const bank = Math.max(-0.5, Math.min(0.5, -pl.vx * 0.06));
      putMesh(cursor[MESH_INDEX.rocket]++, px, py, bank, ROCKET_RADIUS / MESHES.rocket.radius, 1, 1, 1, blink);
      if (world.boss) {
        const b = world.boss;
        const m = BOSS_MESH[b.id];
        putMesh(cursor[m]++, b.px + (b.x - b.px) * alpha, b.y, Math.sin(time * 0.8) * 0.08,
          BOSS_RADIUS / MESHES[b.id].radius, 1, 1, 1, 0.45 * Math.min(1, bossFlash / 0.06));
      }
      if (world.wormholeY !== null) {
        putMesh(cursor[MESH_INDEX.wormhole]++, 0, world.wormholeY, time * 0.9, WORMHOLE_RADIUS / MESHES.wormhole.radius, 1, 1, 1, 0);
        putGlow(0, world.wormholeY, WORMHOLE_RADIUS * 0.9, WORMHOLE_RADIUS * 0.9, 0.6, 0.4, 1, 0.5);
      }

      const nozzle = py - ROCKET_RADIUS * 0.95;
      const puffs = Math.min(8, Math.round(dt * 120));
      for (let i = 0; i < puffs; i++) {
        const heat = Math.random();
        spawn(px + (Math.random() - 0.5) * 0.18, nozzle, (Math.random() - 0.5) * 0.8, -3 - Math.random() * 3,
          0.22 + 0.2 * Math.random(), 0.22 + 0.12 * Math.random(), 1, 0.45 + 0.45 * heat, 0.1 + 0.3 * heat * heat);
      }
      if (pl.shield) putGlow(px, py, 1.3, 1.3, 0.35, 0.65, 1, -0.9);
    } else {
      menuY += dt * 2.5;
    }
    for (let i = 0; i < P.count; i++) {
      const a = P.life[i] / P.ttl[i];
      const s = P.size[i] * (0.4 + 0.6 * a);
      putGlow(P.x[i], P.y[i], s, s, P.r[i], P.g[i], P.b[i], a);
    }

    camera(camY);
    device.queue.writeBuffer(uniformBuf, 0, uniforms);
    if (meshSlots > 0) device.queue.writeBuffer(meshInstBuf, 0, meshInst, 0, meshSlots * INSTANCE_FLOATS);
    if (glowCount > 0) device.queue.writeBuffer(glowInstBuf, 0, glowInst, 0, glowCount * INSTANCE_FLOATS);

    colorAttachment.view = ctx.getCurrentTexture().createView();
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass(passDesc);
    pass.setBindGroup(0, bind);
    pass.setPipeline(starsPipe);
    pass.draw(3);
    if (meshSlots > 0) {
      pass.setPipeline(meshPipe);
      pass.setIndexBuffer(indexBuf, 'uint16');
      for (let m = 0; m < counts.length; m++) {
        if (counts[m] === 0) continue;
        // Dawn rejects a nonzero baseVertex or firstInstance unless the device enabled 'indirect-first-instance',
        // so both offsets go into the vertex buffer bindings and the renderer works with whatever device it is given.
        pass.setVertexBuffer(0, vertexBuf, baseVertex[m] * 36);
        pass.setVertexBuffer(1, meshInstBuf, starts[m] * INSTANCE_FLOATS * 4);
        pass.drawIndexed(indexCountOf[m], counts[m], firstIndex[m], 0, 0);
      }
    }
    if (glowCount > 0) {
      pass.setPipeline(glowPipe);
      pass.setVertexBuffer(0, glowInstBuf);
      pass.draw(4, glowCount);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
    ctx.present();
  }

  return {
    frame,
    dispose() {
      for (const b of [vertexBuf, indexBuf, meshInstBuf, glowInstBuf, uniformBuf]) b.destroy();
      depth?.destroy();
    },
  };
}
