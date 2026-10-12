/*
 * CI proof of "30 levels". Exits 1 on any failure and prints a per-level stats table.
 *
 *   importing LEVELS runs defineLevels, which throws unless there are 30 rows, LEVELS[i].n === i + 1,
 *     (boss !== null) === (n % 10 === 0), every mix weight is positive, and each RAMP 'nondecreasing' column never falls
 *   boss hp: BOSSES.warden.hp < BOSSES.hive.hp < BOSSES.core.hp
 *   for n in 1..30: r = simulate(n, greedyBot); assert r.outcome === 'won' && r.dropped === 0
 *                   assert replay(n, r.inputs).hash === r.hash   (determinism from the input stream alone)
 *   difficulty sanity: idleBot loses every level >= 4; greedyBot's lives lost per tier is nondecreasing.
 */
import { BOSSES, LEVELS } from '../src/levels';
import { replay, simulate } from '../src/sim';
import { greedyBot, idleBot } from '../src/bot';

const NI = (): never => { throw new Error('not implemented'); };

NI();
