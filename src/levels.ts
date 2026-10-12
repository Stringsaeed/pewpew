export const Kind = {
  Asteroid: 0, Fragment: 1, Mine: 2, Drone: 3, Well: 4,
  Crystal: 5, Shield: 6, Rapid: 7, Bolt: 8, EnemyBolt: 9,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];
export type PickupKind = typeof Kind.Crystal | typeof Kind.Shield | typeof Kind.Rapid;

/** How a body interacts. Collision rules in sim switch on role, never on kind. */
export type Role = 'hazard' | 'pickup' | 'playerShot' | 'enemyShot' | 'field';

export interface Archetype {
  readonly role: Role;
  readonly radius: number;
  /** Bolt hits to destroy; 0 = cannot be shot (mines, wells, pickups). */
  readonly hp: number;
  readonly score: number;
  readonly splitInto: { readonly kind: Kind; readonly count: number } | null;
}
export const ARCHETYPES: { readonly [K in Kind]: Archetype } = {
  [Kind.Asteroid]:  { role: 'hazard', radius: 0.7, hp: 3, score: 50, splitInto: { kind: Kind.Fragment, count: 3 } },
  [Kind.Fragment]:  { role: 'hazard', radius: 0.3, hp: 1, score: 10, splitInto: null },
  [Kind.Mine]:      { role: 'hazard', radius: 0.45, hp: 0, score: 0, splitInto: null },
  [Kind.Drone]:     { role: 'hazard', radius: 0.5, hp: 2, score: 100, splitInto: null },
  [Kind.Well]:      { role: 'field', radius: 0.6, hp: 0, score: 0, splitInto: null },
  [Kind.Crystal]:   { role: 'pickup', radius: 0.4, hp: 0, score: 25, splitInto: null },
  [Kind.Shield]:    { role: 'pickup', radius: 0.45, hp: 0, score: 0, splitInto: null },
  [Kind.Rapid]:     { role: 'pickup', radius: 0.45, hp: 0, score: 0, splitInto: null },
  [Kind.Bolt]:      { role: 'playerShot', radius: 0.12, hp: 1, score: 0, splitInto: null },
  [Kind.EnemyBolt]: { role: 'enemyShot', radius: 0.15, hp: 1, score: 0, splitInto: null },
};

export type DronePattern = 'sine' | 'zigzag' | 'dive' | 'orbit';
export type BossId = 'warden' | 'hive' | 'core';
export type BossAttack =
  | { readonly a: 'spread'; readonly bolts: number; readonly arcDeg: number }
  | { readonly a: 'aimed'; readonly bolts: number }
  | { readonly a: 'mines'; readonly count: number }
  | { readonly a: 'drones'; readonly count: number; readonly pattern: DronePattern };
export interface BossPhase {
  /** The phase takes over once boss hp / BossSpec.hp is at or below this fraction. */
  readonly atHpFraction: number;
  readonly sweepSpeed: number;
  readonly attackEvery: number; // seconds
  readonly attacks: readonly [BossAttack, ...BossAttack[]]; // cycled in order
}
export interface BossSpec {
  readonly hp: number;
  /** Ordered by falling atHpFraction. The first phase is the full-health phase. */
  readonly phases: readonly [BossPhase & { readonly atHpFraction: 1 }, ...BossPhase[]];
}
export const BOSSES: { readonly [B in BossId]: BossSpec } = {
  warden: { hp: 60, phases: [
    { atHpFraction: 1, sweepSpeed: 1.5, attackEvery: 1.6, attacks: [{ a: 'spread', bolts: 5, arcDeg: 60 }, { a: 'mines', count: 3 }] },
    { atHpFraction: 0.4, sweepSpeed: 2.0, attackEvery: 1.2, attacks: [{ a: 'spread', bolts: 7, arcDeg: 80 }, { a: 'aimed', bolts: 3 }, { a: 'mines', count: 3 }] },
  ] },
  hive: { hp: 110, phases: [
    { atHpFraction: 1, sweepSpeed: 2.0, attackEvery: 1.3, attacks: [{ a: 'drones', count: 3, pattern: 'orbit' }, { a: 'aimed', bolts: 3 }] },
    { atHpFraction: 0.5, sweepSpeed: 2.6, attackEvery: 1.0, attacks: [{ a: 'drones', count: 4, pattern: 'zigzag' }, { a: 'aimed', bolts: 4 }, { a: 'spread', bolts: 5, arcDeg: 70 }] },
  ] },
  core: { hp: 180, phases: [
    { atHpFraction: 1, sweepSpeed: 2.6, attackEvery: 1.0, attacks: [{ a: 'spread', bolts: 9, arcDeg: 120 }, { a: 'aimed', bolts: 5 }, { a: 'mines', count: 4 }] },
    { atHpFraction: 0.6, sweepSpeed: 3.0, attackEvery: 0.85, attacks: [{ a: 'drones', count: 3, pattern: 'dive' }, { a: 'spread', bolts: 11, arcDeg: 140 }, { a: 'aimed', bolts: 5 }] },
    { atHpFraction: 0.25, sweepSpeed: 3.5, attackEvery: 0.7, attacks: [{ a: 'spread', bolts: 13, arcDeg: 160 }, { a: 'mines', count: 5 }, { a: 'aimed', bolts: 7 }] },
  ] },
};

export type LevelNumber =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15
  | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30;

export interface LevelSpec {
  readonly n: LevelNumber;
  /** Fixed per level, so players and the verifier fly the identical compiled track. */
  readonly seed: number;
  readonly length: number;        // world units to the wormhole (or boss arena)
  readonly scroll: number;        // units per second
  readonly density: number;       // hazards per 100 units
  /** Spawn weights. An absent kind never spawns; a present weight must be positive. */
  readonly mix: { readonly asteroid?: number; readonly mine?: number; readonly drone?: number };
  readonly drones: readonly DronePattern[];
  readonly droneFireRate: number; // shots per second per drone; 0 = drones hold fire
  readonly wells: number;         // count over the whole track
  readonly wellPull: number;      // lateral units/s^2 at the core
  readonly pickups: { readonly crystal: number; readonly shield: number; readonly rapid: number }; // per 100 units
  readonly boss: BossId | null;
}
export interface TrackLevel extends LevelSpec { readonly boss: null }
export interface BossLevel extends LevelSpec { readonly boss: BossId }
export type Decade = readonly [
  TrackLevel, TrackLevel, TrackLevel, TrackLevel, TrackLevel,
  TrackLevel, TrackLevel, TrackLevel, TrackLevel, BossLevel,
];
/** Thirty rows. The tuple pins bosses to levels 10, 20, and 30. */
export type LevelTable = readonly [...Decade, ...Decade, ...Decade];

type NumericKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];
/** Ramp policy per numeric column. Mapped over LevelSpec so a new numeric column fails the build until classified. */
export const RAMP: { readonly [K in Exclude<NumericKeys<LevelSpec>, 'n' | 'seed'>]: 'nondecreasing' | 'free' } = {
  length: 'nondecreasing', scroll: 'nondecreasing', density: 'nondecreasing',
  droneFireRate: 'nondecreasing', wells: 'nondecreasing', wellPull: 'nondecreasing',
};
type RampColumn = keyof typeof RAMP;
const RAMP_COLUMNS = Object.keys(RAMP) as RampColumn[];

/** Throws at import on a malformed table, so neither the app nor the verifier can load one. */
export function defineLevels(rows: LevelTable): LevelTable {
  if (rows.length !== 30) throw new Error(`LEVELS has ${rows.length} rows, expected 30`);
  rows.forEach((row, i) => {
    const n = i + 1;
    if (row.n !== n) throw new Error(`LEVELS[${i}].n is ${row.n}, expected ${n}`);
    if ((row.boss !== null) !== (n % 10 === 0)) throw new Error(`level ${n}: boss must be set on 10, 20, and 30 only`);
    const weights = Object.values(row.mix).filter((w) => w !== undefined);
    if (weights.length === 0 || weights.some((w) => !(w > 0))) throw new Error(`level ${n}: mix weights must be positive`);
  });
  for (const col of RAMP_COLUMNS) {
    if (RAMP[col] !== 'nondecreasing') continue;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][col] < rows[i - 1][col]) throw new Error(`level ${i + 1}: ${col} decreases from ${rows[i - 1][col]} to ${rows[i][col]}`);
    }
  }
  return rows;
}

export const LEVELS: LevelTable = defineLevels([
  { n: 1, seed: 0x9e3779b9, length: 900, scroll: 6.0, density: 8, mix: { asteroid: 1 },
    drones: [], droneFireRate: 0, wells: 0, wellPull: 0, pickups: { crystal: 4, shield: 0.3, rapid: 0.3 }, boss: null },
  { n: 2, seed: 0x3cd6e3f3, length: 940, scroll: 6.2, density: 9, mix: { asteroid: 1 },
    drones: [], droneFireRate: 0, wells: 0, wellPull: 0, pickups: { crystal: 4, shield: 0.3, rapid: 0.3 }, boss: null },
  { n: 3, seed: 0x1b147dcc, length: 980, scroll: 6.4, density: 10, mix: { asteroid: 3, mine: 1 },
    drones: [], droneFireRate: 0, wells: 0, wellPull: 0, pickups: { crystal: 4, shield: 0.3, rapid: 0.3 }, boss: null },
  { n: 4, seed: 0x4c081dbf, length: 1020, scroll: 6.6, density: 11, mix: { asteroid: 3, mine: 1 },
    drones: [], droneFireRate: 0, wells: 0, wellPull: 0, pickups: { crystal: 4, shield: 0.3, rapid: 0.3 }, boss: null },
  { n: 5, seed: 0x487981ab, length: 1060, scroll: 6.8, density: 12, mix: { asteroid: 3, mine: 1, drone: 2 },
    drones: ['sine'], droneFireRate: 0, wells: 0, wellPull: 0, pickups: { crystal: 4, shield: 0.3, rapid: 0.3 }, boss: null },
  { n: 6, seed: 0xdb408c9d, length: 1100, scroll: 7.0, density: 13, mix: { asteroid: 3, mine: 1, drone: 2 },
    drones: ['sine', 'zigzag', 'dive'], droneFireRate: 0.1, wells: 0, wellPull: 0, pickups: { crystal: 4, shield: 0.3, rapid: 0.3 }, boss: null },
  { n: 7, seed: 0x78bc1b8f, length: 1140, scroll: 7.2, density: 14, mix: { asteroid: 3, mine: 1, drone: 2 },
    drones: ['sine', 'zigzag', 'dive'], droneFireRate: 0.1, wells: 1, wellPull: 2, pickups: { crystal: 4, shield: 0.3, rapid: 0.3 }, boss: null },
  { n: 8, seed: 0xd83072e5, length: 1180, scroll: 7.4, density: 15, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive'], droneFireRate: 0.15, wells: 1, wellPull: 2.25, pickups: { crystal: 4, shield: 0.3, rapid: 0.3 }, boss: null },
  { n: 9, seed: 0x65cbdd54, length: 1220, scroll: 7.6, density: 16, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive'], droneFireRate: 0.15, wells: 1, wellPull: 2.5, pickups: { crystal: 4, shield: 0.3, rapid: 0.3 }, boss: null },
  { n: 10, seed: 0x85ebca6b, length: 1260, scroll: 7.8, density: 17, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive'], droneFireRate: 0.2, wells: 2, wellPull: 3, pickups: { crystal: 4, shield: 0.4, rapid: 0.4 }, boss: 'warden' },
  { n: 11, seed: 0x91783bb0, length: 1300, scroll: 8.0, density: 18, mix: { asteroid: 3, mine: 1, drone: 2 },
    drones: ['sine', 'zigzag', 'dive'], droneFireRate: 0.2, wells: 2, wellPull: 3, pickups: { crystal: 5, shield: 0.4, rapid: 0.4 }, boss: null },
  { n: 12, seed: 0x0231739b, length: 1340, scroll: 8.2, density: 19, mix: { asteroid: 3, mine: 1, drone: 2 },
    drones: ['sine', 'zigzag', 'dive'], droneFireRate: 0.22, wells: 2, wellPull: 3.2, pickups: { crystal: 5, shield: 0.4, rapid: 0.4 }, boss: null },
  { n: 13, seed: 0x2aa96dd0, length: 1380, scroll: 8.4, density: 20, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive'], droneFireRate: 0.24, wells: 2, wellPull: 3.4, pickups: { crystal: 5, shield: 0.4, rapid: 0.4 }, boss: null },
  { n: 14, seed: 0xb42bc0b0, length: 1420, scroll: 8.6, density: 21, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive'], droneFireRate: 0.26, wells: 2, wellPull: 3.6, pickups: { crystal: 5, shield: 0.4, rapid: 0.4 }, boss: null },
  { n: 15, seed: 0x04e90bf5, length: 1460, scroll: 8.8, density: 22, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.28, wells: 2, wellPull: 3.8, pickups: { crystal: 5, shield: 0.4, rapid: 0.4 }, boss: null },
  { n: 16, seed: 0xe2ad51ba, length: 1500, scroll: 9.0, density: 23, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.3, wells: 2, wellPull: 4, pickups: { crystal: 5, shield: 0.4, rapid: 0.4 }, boss: null },
  { n: 17, seed: 0x79f70494, length: 1540, scroll: 9.2, density: 24, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.32, wells: 2, wellPull: 4.2, pickups: { crystal: 5, shield: 0.4, rapid: 0.4 }, boss: null },
  { n: 18, seed: 0x010b6880, length: 1580, scroll: 9.4, density: 25, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.34, wells: 2, wellPull: 4.4, pickups: { crystal: 5, shield: 0.4, rapid: 0.4 }, boss: null },
  { n: 19, seed: 0xa4523835, length: 1620, scroll: 9.6, density: 26, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.36, wells: 3, wellPull: 4.5, pickups: { crystal: 5, shield: 0.4, rapid: 0.4 }, boss: null },
  { n: 20, seed: 0xceeb36b7, length: 1660, scroll: 9.8, density: 27, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.4, wells: 3, wellPull: 4.5, pickups: { crystal: 5, shield: 0.5, rapid: 0.5 }, boss: 'hive' },
  { n: 21, seed: 0xd939ff68, length: 1700, scroll: 10.0, density: 28, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.4, wells: 3, wellPull: 4.6, pickups: { crystal: 6, shield: 0.5, rapid: 0.5 }, boss: null },
  { n: 22, seed: 0xb18c6441, length: 1740, scroll: 10.2, density: 29, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.42, wells: 3, wellPull: 4.8, pickups: { crystal: 6, shield: 0.5, rapid: 0.5 }, boss: null },
  { n: 23, seed: 0xdd507b42, length: 1780, scroll: 10.4, density: 30, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.44, wells: 3, wellPull: 5, pickups: { crystal: 6, shield: 0.5, rapid: 0.5 }, boss: null },
  { n: 24, seed: 0x5db59265, length: 1820, scroll: 10.6, density: 31, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.46, wells: 3, wellPull: 5.2, pickups: { crystal: 6, shield: 0.5, rapid: 0.5 }, boss: null },
  { n: 25, seed: 0x33469494, length: 1860, scroll: 10.8, density: 32, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.48, wells: 3, wellPull: 5.4, pickups: { crystal: 6, shield: 0.5, rapid: 0.5 }, boss: null },
  { n: 26, seed: 0xa65d9b7a, length: 1900, scroll: 11.0, density: 33, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.5, wells: 3, wellPull: 5.6, pickups: { crystal: 6, shield: 0.5, rapid: 0.5 }, boss: null },
  { n: 27, seed: 0x57dcb96b, length: 1940, scroll: 11.2, density: 34, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.52, wells: 4, wellPull: 5.8, pickups: { crystal: 6, shield: 0.5, rapid: 0.5 }, boss: null },
  { n: 28, seed: 0x1b486183, length: 1980, scroll: 11.4, density: 35, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.54, wells: 4, wellPull: 6, pickups: { crystal: 6, shield: 0.5, rapid: 0.5 }, boss: null },
  { n: 29, seed: 0xe411ddc1, length: 2020, scroll: 11.6, density: 36, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.56, wells: 5, wellPull: 6, pickups: { crystal: 6, shield: 0.5, rapid: 0.5 }, boss: null },
  { n: 30, seed: 0x3e2cf241, length: 2060, scroll: 11.8, density: 37, mix: { asteroid: 3, mine: 2, drone: 2 },
    drones: ['sine', 'zigzag', 'dive', 'orbit'], droneFireRate: 0.6, wells: 5, wellPull: 6, pickups: { crystal: 6, shield: 0.6, rapid: 0.6 }, boss: 'core' },
]);

export const levelSpec = (n: LevelNumber): LevelSpec => LEVELS[n - 1];
export const tierOf = (n: LevelNumber): 1 | 2 | 3 => (n <= 10 ? 1 : n <= 20 ? 2 : 3);
