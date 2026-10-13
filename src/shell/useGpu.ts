import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, PixelRatio } from 'react-native';
import { useCanvasRef, type NativeCanvas } from 'react-native-webgpu';
import { MAX_PIXEL_RATIO, createRenderer, type Renderer } from '../render';
import { advance, type Loop, type Sinks } from './loop';

type CanvasRef = ReturnType<typeof useCanvasRef>;
/** Dev-only wrapper around one frame. Absent in release, so the clock never imports qa. */
export type FrameSample = (now: number, tick: (now: number) => void) => void;

/**
 * Owns the adapter, the device, the rAF clock, and the renderer.
 * The pixel ratio is read once, here, when the renderer is created.
 * A zero-size canvas retries on the next frame instead of configuring.
 * Also subscribes to Reduce Motion and returns that flag for the screen tree.
 */
export function useGpu(canvasRef: CanvasRef, loop: Loop, sinks: Sinks, sample: FrameSample | null): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceRef = useRef(false);
  const rendererRef = useRef<Renderer | null>(null);
  const sinksRef = useRef(sinks);
  sinksRef.current = sinks;
  const sampleRef = useRef(sample);
  sampleRef.current = sample;

  useEffect(() => {
    let alive = true;
    const apply = (on: boolean) => {
      if (!alive) return;
      reduceRef.current = on;
      setReduceMotion(on);
      rendererRef.current?.setReduceMotion(on);
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(apply);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', apply);
    return () => { alive = false; sub.remove(); };
  }, []);

  useEffect(() => {
    let frame = 0;
    let stopped = false;
    let renderer: Renderer | null = null;
    let device: GPUDevice | null = null;
    let format: GPUTextureFormat;
    let ctx: (GPUCanvasContext & { present(): void }) | null = null;

    // One sinks object for the life of the canvas. advance must not allocate a new one per frame.
    const bound: Sinks = {
      render(world, events, alpha, dt) { renderer?.frame(world, events, alpha, dt); },
      audio(events) { sinksRef.current.audio(events); },
      ended(ev) { sinksRef.current.ended(ev); },
      hud(next) { sinksRef.current.hud(next); },
      terminal(ev) { sinksRef.current.terminal?.(ev); },
      hold(kind, seconds) { renderer?.hold(kind, seconds); },
    };
    const tick = (now: number) => advance(loop, now, bound);

    const frameFn = (now: number) => {
      if (stopped) return;
      frame = requestAnimationFrame(frameFn);
      if (!renderer) {
        const c = canvasRef.current?.getContext('webgpu') ?? null;
        const canvas = c?.canvas as unknown as NativeCanvas | undefined;
        if (!c || !canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0 || !device) return;
        ctx = c;
        renderer = createRenderer(device, ctx, format, Math.min(PixelRatio.get(), MAX_PIXEL_RATIO));
        rendererRef.current = renderer;
        renderer.setReduceMotion(reduceRef.current);
        loop.last = now;
        return;
      }
      const run = sampleRef.current;
      if (run) run(now, tick);
      else tick(now);
    };

    const init = async () => {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('no GPU adapter');
      device = await adapter.requestDevice();
      format = navigator.gpu.getPreferredCanvasFormat();
      if (!stopped) frame = requestAnimationFrame(frameFn);
    };

    init().catch((e) => console.error('[pewpew] webgpu init failed', e));
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, [canvasRef, loop]);

  return reduceMotion;
}
