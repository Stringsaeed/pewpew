import { useEffect, useRef } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Canvas, useCanvasRef, type NativeCanvas } from 'react-native-webgpu';
import { AudioContext, AudioManager } from 'react-native-audio-api';

const SHADER = /* wgsl */ `
struct Uniforms { angle: f32, aspect: f32, pad0: f32, pad1: f32 };
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
};

@vertex
fn vs(@location(0) p: vec2f, @location(1) c: vec3f) -> VSOut {
  let s = sin(u.angle);
  let co = cos(u.angle);
  let r = vec2f(p.x * co - p.y * s, p.x * s + p.y * co);
  var o: VSOut;
  o.pos = vec4f(r.x / u.aspect * 0.6, r.y * 0.6, 0.0, 1.0);
  o.color = c;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4f {
  return vec4f(i.color, 1.0);
}
`;

const VERTICES = new Float32Array([
  // x, y, r, g, b
  0.0, 0.5, 1.0, 0.1, 0.4,
  -0.45, -0.35, 0.1, 1.0, 0.8,
  0.45, -0.35, 1.0, 0.9, 0.1,
]);

function beep(audio: AudioContext) {
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, t);
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.2);
}

export default function App() {
  const canvasRef = useCanvasRef();
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    let frame = 0;
    let stopped = false;

    const init = async () => {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('no GPU adapter');
      const { vendor, architecture, device: name, description, isFallbackAdapter } = adapter.info;
      console.log('[spike] adapter.info', JSON.stringify({ vendor, architecture, device: name, description, isFallbackAdapter }));
      const device = await adapter.requestDevice();
      const format = navigator.gpu.getPreferredCanvasFormat();
      console.log('[spike] preferred canvas format', format);

      const module = device.createShaderModule({ code: SHADER });
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module,
          entryPoint: 'vs',
          buffers: [
            {
              arrayStride: 20,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x2' },
                { shaderLocation: 1, offset: 8, format: 'float32x3' },
              ],
            },
          ],
        },
        fragment: { module, entryPoint: 'fs', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      });

      const vbuf = device.createBuffer({
        size: VERTICES.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(vbuf, 0, VERTICES);

      const ubuf = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bind = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: ubuf } }],
      });

      const start = Date.now();
      let configuredW = 0;
      let configuredH = 0;
      let ctx: ReturnType<NonNullable<typeof canvasRef.current>['getContext']> = null;

      const draw = () => {
        if (stopped) return;
        frame = requestAnimationFrame(draw);

        if (!ctx) {
          // Layout size is 0 until the first layout pass, so retry on the next frame.
          const c = canvasRef.current?.getContext('webgpu') ?? null;
          const size = c?.canvas as unknown as NativeCanvas | undefined;
          if (!c || !size || size.clientWidth === 0 || size.clientHeight === 0) return;
          ctx = c;
        }
        const canvas = ctx.canvas as unknown as NativeCanvas;
        const ratio = PixelRatio.get();
        const w = Math.round(canvas.clientWidth * ratio);
        const h = Math.round(canvas.clientHeight * ratio);
        if (w !== configuredW || h !== configuredH) {
          canvas.width = w;
          canvas.height = h;
          ctx.configure({ device, format, alphaMode: 'opaque' });
          configuredW = w;
          configuredH = h;
        }

        const angle = ((Date.now() - start) / 1000) * 1.5;
        device.queue.writeBuffer(ubuf, 0, new Float32Array([angle, w / h, 0, 0]));

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: ctx.getCurrentTexture().createView(),
              clearValue: { r: 0.02, g: 0.02, b: 0.06, a: 1 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bind);
        pass.setVertexBuffer(0, vbuf);
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
        ctx.present();
      };
      frame = requestAnimationFrame(draw);
    };

    init().catch((e) => console.error('[spike] webgpu init failed', e));
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [canvasRef]);

  const onBeep = () => {
    if (!audioRef.current) {
      AudioManager.setAudioSessionOptions({ iosCategory: 'playback', iosMode: 'default' });
      audioRef.current = new AudioContext();
    }
    beep(audioRef.current);
    console.log('[spike] beep');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Canvas ref={canvasRef} style={StyleSheet.absoluteFill} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="beep"
        onPress={onBeep}
        style={styles.button}
      >
        <Text style={styles.label}>Beep</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05050f' },
  button: {
    position: 'absolute',
    bottom: 64,
    alignSelf: 'center',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  label: { color: '#fff', fontSize: 20, fontWeight: '600' },
});
