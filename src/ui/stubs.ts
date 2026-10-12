// Temporary stand-ins so the shell runs on a device while sim, render, and audio are built on other branches.
// Each real function is tried first. Only the skeleton's 'not implemented' error selects the stub, so once the
// real bodies land this file does nothing. Delete it and point App.tsx's single stubs import at sim, render, audio.
import { createAudio as realCreateAudio, type AudioEngine } from '../audio';
import { levelSpec, type LevelNumber } from '../levels';
import { createRenderer as realCreateRenderer, type Renderer } from '../render';
import {
  createWorld as realCreateWorld, dragInput as realDragInput, hudOf as realHudOf, step as realStep,
  type Hud, type Input, type SimEvent, type World, type WorldView,
} from '../sim';

const isUnimplemented = (e: unknown) => e instanceof Error && e.message === 'not implemented';

const RUN_TICKS = 1800;
const LOSING_LEVEL: LevelNumber = 2;
let simIsStub = false;
const stubWorlds = new WeakSet<object>();

function stubWorld(n: LevelNumber): World {
  const spec = levelSpec(n);
  const body = <T extends Float32Array | Uint8Array | Int16Array>(make: new (n: number) => T) => new make(1);
  return {
    spec, track: [], cursor: 0, tick: 0, rng: 1, phase: { p: 'fly' }, score: 0, wormholeY: spec.length, boss: null, dropped: 0,
    player: { x: 0, px: 0, vx: 0, y: 0, py: 0, lives: 3, shield: false, rapidUntil: 0, invulnUntil: 0, fireAt: 0 },
    bodies: {
      count: 0, kind: body(Uint8Array), variant: body(Uint8Array), x: body(Float32Array), y: body(Float32Array),
      px: body(Float32Array), py: body(Float32Array), vx: body(Float32Array), vy: body(Float32Array),
      rot: body(Float32Array), spin: body(Float32Array), t: body(Float32Array), param: body(Float32Array), hp: body(Int16Array),
    },
  };
}

function stubStep(w: World, input: Input, out: SimEvent[]) {
  if (w.phase.p === 'won' || w.phase.p === 'lost') return;
  const p = w.player;
  if (w.tick === 0) out.push({ e: 'start', level: w.spec.n });
  w.tick += 1;
  p.px = p.x;
  if (input.targetX !== null) p.x += (Math.max(-4.5, Math.min(4.5, input.targetX)) - p.x) * 0.2;
  p.py = p.y;
  p.y = (w.tick / RUN_TICKS) * w.spec.length;
  if (w.tick % 30 === 0) w.score += 10;
  p.shield = w.tick > 300 && w.tick < 900;
  const losing = w.spec.n === LOSING_LEVEL;
  if (losing && w.tick % 600 === 0) {
    p.lives = (p.lives - 1) as 0 | 1 | 2;
    out.push({ e: 'playerHit', x: p.x, y: p.y, lives: p.lives });
  }
  if (losing && p.lives === 0) {
    w.phase = { p: 'lost' };
    out.push({ e: 'lost', score: w.score });
  } else if (w.tick >= RUN_TICKS) {
    w.phase = { p: 'won', stars: 3 };
    out.push({ e: 'won', score: w.score, stars: 3 });
  }
}

function stubHud(w: WorldView, prev: Hud | null): Hud {
  const next: Hud = {
    score: w.score, lives: w.player.lives, progress: Math.min(100, Math.floor((w.tick / RUN_TICKS) * 100)),
    shield: w.player.shield, rapid: w.tick > 600 && w.tick < 1200, bossHp: null,
  };
  const same = prev !== null && (Object.keys(next) as (keyof Hud)[]).every((k) => prev[k] === next[k]);
  return same ? prev : next;
}

export function createWorld(n: LevelNumber): World {
  if (!simIsStub) {
    try { return realCreateWorld(n); } catch (e) { if (!isUnimplemented(e)) throw e; simIsStub = true; }
  }
  const w = stubWorld(n);
  stubWorlds.add(w);
  return w;
}
export const step = (w: World, input: Input, out: SimEvent[]) => (stubWorlds.has(w) ? stubStep(w, input, out) : realStep(w, input, out));
export const hudOf = (w: WorldView, prev: Hud | null) => (stubWorlds.has(w) ? stubHud(w, prev) : realHudOf(w, prev));
export const dragInput = (anchorX: number, dxFrac: number): Input => (simIsStub ? { targetX: anchorX + dxFrac * 9 } : realDragInput(anchorX, dxFrac));

export function createRenderer(device: GPUDevice, ctx: GPUCanvasContext, format: GPUTextureFormat): Renderer {
  try { return realCreateRenderer(device, ctx, format); } catch (e) { if (!isUnimplemented(e)) throw e; }
  let t = 0;
  return {
    frame(world, _events, _alpha, dtSec) {
      t += dtSec;
      const pulse = world === null ? 0 : 0.02 * (1 + Math.sin(t * 3));
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: { r: 0.02 + (world === null ? 0 : 0.25 * (world.player.x + 4.5) / 9), g: 0.02 + pulse, b: 0.06 + pulse, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      });
      pass.end();
      device.queue.submit([encoder.finish()]);
      (ctx as GPUCanvasContext & { present(): void }).present();
    },
    dispose() {},
  };
}

export function createAudio(): AudioEngine {
  try { return realCreateAudio(); } catch (e) { if (!isUnimplemented(e)) throw e; }
  return {
    events() {},
    ui: (cue) => console.log('[stub-audio] ui', cue),
    mix: (m) => console.log('[stub-audio] mix', JSON.stringify(m)),
    active: (on) => console.log('[stub-audio] active', on),
  };
}
