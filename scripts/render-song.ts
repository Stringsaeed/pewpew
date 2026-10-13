import { mkdirSync, writeFileSync } from 'node:fs';
import {
  SFX, SONGS, ampAt, cutoffAt, patchOf, pitchAt, sfxHits, songHits,
  type Hit, type MusicId, type Patch, type SfxId, type Wave,
} from '../src/audio';

const RATE = 44100;
const OUT_DIR = '/tmp/pewpew-audio';
const META: Record<MusicId, { readonly key: string; readonly bars: number }> = {
  tier1: { key: 'C major', bars: 8 },
  tier2: { key: 'A minor', bars: 8 },
  tier3: { key: 'F# minor', bars: 8 },
  boss: { key: 'D minor', bars: 8 },
};

type OscWave = Exclude<Wave, 'noise'>;

function wave(kind: OscWave, phase: number): number {
  const turn = Math.PI * 2;
  const t = ((phase % turn) + turn) % turn;
  if (kind === 'sine') return Math.sin(t);
  if (kind === 'square') return t < Math.PI ? 1 : -1;
  if (kind === 'sawtooth') return t / Math.PI - 1;
  const u = t / turn;
  if (u < 0.25) return u * 4;
  if (u < 0.75) return 2 - u * 4;
  return u * 4 - 4;
}

function biquad(type: NonNullable<Patch['filter']>['type'], freq: number, q: number, rate: number) {
  const w0 = (2 * Math.PI * Math.min(freq, rate * 0.45)) / rate;
  const alpha = Math.sin(w0) / (2 * Math.max(q, 0.0001));
  const cos = Math.cos(w0);
  let b0: number;
  let b1: number;
  let b2: number;
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = b0;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
  } else {
    b0 = Math.sin(w0) / 2;
    b1 = 0;
    b2 = -b0;
  }
  const a0 = 1 + alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

function render(hits: readonly Hit[]): Float32Array {
  let end = 0;
  for (const hit of hits) end = Math.max(end, hit.when + hit.dur + patchOf(hit.patch).env.r + 0.02);
  const mix = new Float32Array(Math.max(1, Math.ceil(end * RATE)));
  const noise = new Float32Array(RATE);
  let seed = 0x6d2b79f5;
  for (let i = 0; i < noise.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    noise[i] = (seed / 4294967296) * 2 - 1;
  }
  for (const hit of hits) {
    const patch = patchOf(hit.patch);
    const start = Math.floor(hit.when * RATE);
    const len = Math.ceil((hit.dur + patch.env.r) * RATE) + 1;
    let phase = 0;
    let detunePhase = 0;
    let z1 = 0;
    let z2 = 0;
    let b0 = 1;
    let b1 = 0;
    let b2 = 0;
    let a1 = 0;
    let a2 = 0;
    let lastHz = -1;
    for (let i = 0; i < len; i++) {
      const at = start + i;
      if (at >= mix.length) break;
      const t = i / RATE;
      let x = 0;
      if (patch.wave === 'noise') {
        x = noise[at % noise.length]!;
      } else {
        phase += (2 * Math.PI * pitchAt(t, hit.midi, patch.sweep)) / RATE;
        x += wave(patch.wave, phase);
        if (patch.detune !== undefined) {
          detunePhase += (2 * Math.PI * pitchAt(t, hit.midi, patch.sweep, patch.detune)) / RATE;
          x += wave(patch.wave, detunePhase);
        }
      }
      if (patch.filter) {
        const hz = cutoffAt(t, patch.filter, patch.env);
        if (Math.abs(hz - lastHz) > 1) {
          const coeff = biquad(patch.filter.type, hz, patch.filter.q, RATE);
          b0 = coeff.b0;
          b1 = coeff.b1;
          b2 = coeff.b2;
          a1 = coeff.a1;
          a2 = coeff.a2;
          lastHz = hz;
        }
        const y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        x = y;
      }
      mix[at]! += x * ampAt(t, hit.dur, patch.env, patch.gain);
    }
  }
  return mix;
}

function wavBytes(samples: Float32Array): Uint8Array {
  const dataBytes = samples.length * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]! * 0.8));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }
  return bytes;
}

function hitsFor(id: string): Hit[] {
  if (id in SONGS) return songHits(SONGS[id as MusicId]);
  if (id in SFX) return sfxHits(SFX[id as SfxId]);
  throw new Error(`unknown song or sfx ${id}`);
}

function main(): void {
  const arg = process.argv[2] ?? 'all';
  const ids = arg === 'all' ? [...Object.keys(SONGS), ...Object.keys(SFX)] : [arg];
  mkdirSync(OUT_DIR, { recursive: true });
  for (const id of ids) {
    if (id in SONGS) {
      const steps = SONGS[id as MusicId].voices[0]!.steps.trim().split(/\s+/).length;
      const meta = META[id as MusicId];
      if (steps !== meta.bars * 16) throw new Error(`${id} has ${steps} steps`);
    }
    const samples = render(hitsFor(id));
    const path = `${OUT_DIR}/${id}.wav`;
    writeFileSync(path, wavBytes(samples));
    const seconds = (samples.length / RATE).toFixed(3);
    if (id in SONGS) {
      const meta = META[id as MusicId];
      console.log(`${id} ${SONGS[id as MusicId].bpm}bpm ${meta.key} ${meta.bars}bars ${seconds}s ${path}`);
    } else {
      console.log(`${id} ${seconds}s ${path}`);
    }
  }
}

main();
