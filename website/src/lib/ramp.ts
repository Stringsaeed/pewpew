import { LEVELS, tierOf, type BossId, type LevelSpec } from '@game/levels';

export const TIER_TONE = { 1: '#9a6bff', 2: '#2fd6c4', 3: '#ff3d6a' } as const;
export const COL = 32;
export const PLOT_W = LEVELS.length * COL;
export const PLOT_H = 220;
const HEADROOM = 28;

interface Metric { key: string; label: string; unit: string; of: (l: LevelSpec) => number; fmt: (v: number) => string }
export interface Bar { n: number; v: number; h: number; boss: BossId | null; tone: string }
export interface Chart extends Metric { max: number; bars: Bar[] }

const METRICS: Metric[] = [
  { key: 'density', label: 'Hazards', unit: 'per 100 units', of: (l) => l.density, fmt: String },
  { key: 'scroll', label: 'Speed', unit: 'units / second', of: (l) => l.scroll, fmt: (v) => v.toFixed(1) },
  { key: 'fire', label: 'Drone fire', unit: 'shots / s / drone', of: (l) => l.droneFireRate, fmt: (v) => v.toFixed(2) },
  { key: 'length', label: 'Track', unit: 'units to the wormhole', of: (l) => l.length, fmt: String },
];

export const barTop = (h: number): number => PLOT_H - h;
export const gridY = (f: number): number => PLOT_H - f * (PLOT_H - HEADROOM);

export const charts: Chart[] = METRICS.map((m) => {
  const max = Math.max(...LEVELS.map(m.of));
  const bars = LEVELS.map((l) => {
    const v = m.of(l);
    return { n: l.n, v, h: Math.max(3, (v / max) * (PLOT_H - HEADROOM)), boss: l.boss, tone: TIER_TONE[tierOf(l.n)] };
  });
  return { ...m, max, bars };
});

export const first = LEVELS[0];
export const last = LEVELS[29];
