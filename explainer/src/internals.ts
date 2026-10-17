// Types for the virtual module 'pewpew-internals'. build.mjs resolves that name to the real private stage functions
// of src/sim/step.ts and src/sim/boss.ts (it appends an export line in the bundle only). This file is never bundled.
import type { BossPhase, BossSpec } from '../../src/levels';
import type { Input, SimEvent, World } from '../../src/sim';

export declare function steer(w: World, input: Input): void;
export declare function wellPull(w: World): number;
export declare function spawnFromTrack(w: World): void;
export declare function fire(w: World, out: SimEvent[]): void;
export declare function moveBodies(w: World, out: SimEvent[]): void;
export declare function collide(w: World, out: SimEvent[]): void;
export declare function despawn(w: World): void;
export declare function transition(w: World, out: SimEvent[]): void;
export declare function bossPhase(spec: BossSpec, hp: number): BossPhase;
