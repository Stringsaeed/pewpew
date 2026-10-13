import { ARCHETYPES, DRONE_PATTERNS, Kind } from '../levels';
import type { LevelSpec } from '../levels';
import { clamp, rand } from './math';
import type { Rng } from './math';
import {
  DRONE_ANCHOR_LIMIT, PLAYER_MAX_VX, PLAYER_X_LIMIT, ROW_DY, ROW_GAP, TRACK_END_CLEAR, TRACK_HALF_WIDTH, TRACK_START,
} from './rules';

export interface Spawn { readonly y: number; readonly x: number; readonly kind: Kind; readonly variant: number; readonly param: number }
/** Compiled from (LevelSpec, seed) once at createWorld, sorted by y. */
export type Track = readonly Spawn[];

/**
 * Stratified placement on rows ROW_DY apart. Each row first picks a gap whose centre random-walks no faster than the
 * rocket can follow, then places its hazards (and any well) outside that gap, so a 1.6-unit path always exists.
 */
export function compileTrack(spec: LevelSpec): Track {
  const s: Rng = { rng: spec.seed | 0 };
  const out: Spawn[] = [];
  const mix: readonly (readonly [Kind, number])[] = [
    [Kind.Asteroid, spec.mix.asteroid ?? 0], [Kind.Mine, spec.mix.mine ?? 0], [Kind.Drone, spec.mix.drone ?? 0],
  ];
  const total = mix.reduce((sum, [, wt]) => sum + wt, 0);
  const pickKind = (u: number): Kind => {
    let acc = u * total;
    for (const [k, wt] of mix) { if (acc < wt) return k; acc -= wt; }
    return Kind.Asteroid;
  };
  const rows = Math.floor((spec.length - TRACK_END_CLEAR - TRACK_START) / ROW_DY) + 1;
  const wellRows = new Set<number>();
  for (let k = 0; k < spec.wells; k++) wellRows.add(Math.floor((k + 0.5) * rows / spec.wells));
  const reach = 0.5 * PLAYER_MAX_VX * ROW_DY / spec.scroll;
  const gapLimit = PLAYER_X_LIMIT - ROW_GAP / 2;
  const perRow = spec.density / 100 * ROW_DY;
  const pickupPerRow = [
    [Kind.Crystal, spec.pickups.crystal / 100 * ROW_DY], [Kind.Shield, spec.pickups.shield / 100 * ROW_DY],
    [Kind.Rapid, spec.pickups.rapid / 100 * ROW_DY],
  ] as const;
  const pickupOwed = [0, 0, 0];
  let gapX = 0, owed = 0;

  const outsideGap = (r: number): number => {
    const lo = -TRACK_HALF_WIDTH + r, hi = TRACK_HALF_WIDTH - r;
    const left = Math.max(0, gapX - ROW_GAP / 2 - r - lo);
    const right = Math.max(0, hi - (gapX + ROW_GAP / 2 + r));
    const u = rand(s) * (left + right);
    return u < left ? lo + u : gapX + ROW_GAP / 2 + r + (u - left);
  };

  for (let row = 0; row < rows; row++) {
    const y = TRACK_START + row * ROW_DY;
    gapX = clamp(gapX + (rand(s) * 2 - 1) * reach, -gapLimit, gapLimit);
    owed += perRow;
    const n = Math.floor(owed);
    owed -= n;
    if (wellRows.has(row)) {
      out.push({ y, x: outsideGap(ARCHETYPES[Kind.Well].radius), kind: Kind.Well, variant: 0, param: spec.wellPull });
    }
    for (let k = 0; k < n; k++) {
      const kind = pickKind(rand(s));
      const x = outsideGap(ARCHETYPES[kind].radius);
      if (kind === Kind.Asteroid) out.push({ y, x, kind, variant: Math.floor(rand(s) * 4), param: (rand(s) - 0.5) * 0.6 });
      else if (kind === Kind.Drone) {
        const pattern = spec.drones[Math.floor(rand(s) * spec.drones.length)];
        const ax = clamp(x, -DRONE_ANCHOR_LIMIT, DRONE_ANCHOR_LIMIT);
        out.push({ y, x: ax, kind, variant: DRONE_PATTERNS.indexOf(pattern), param: ax });
      } else out.push({ y, x, kind, variant: 0, param: 0 });
    }
    let slot = 0;
    pickupPerRow.forEach(([kind, rate], k) => {
      pickupOwed[k] += rate;
      while (pickupOwed[k] >= 1) {
        pickupOwed[k] -= 1;
        const x = kind === Kind.Crystal ? clamp(gapX + (rand(s) - 0.5) * 1.2, -PLAYER_X_LIMIT, PLAYER_X_LIMIT)
          : (rand(s) * 2 - 1) * (PLAYER_X_LIMIT - 0.5);
        out.push({ y: y + ROW_DY / 2 + 0.8 * slot++, x, kind, variant: 0, param: 0 });
      }
    });
  }
  return out.sort((a, b) => a.y - b.y);
}
