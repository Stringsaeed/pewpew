import { LEVELS } from '../levels';
import { recordRun, type Save } from '../save';
import { hashWorld, type World } from '../sim';

/** One star on levels 1..29 unlocks all 30. recordRun max-merges, so real records survive and a second press changes nothing. */
export function unlockAll(s: Save): Save {
  return LEVELS.slice(0, -1).reduce((acc, spec) => recordRun(acc, spec.n, 0, 1), s);
}

/** Same hash and hex format as scripts/verify-levels.ts, so a device run greps against .audit/verify-levels.txt. */
export function logAutoRun(w: World): void {
  console.log(`[pewpew] level ${w.spec.n} hash ${hashWorld(w).toString(16).padStart(8, '0')} steps ${w.tick}`);
}

const FRAMES = 600;

export function createTickTimer() {
  const ms = new Float64Array(FRAMES);
  let n = 0, window = 0;
  return {
    reset(): void { n = 0; window = 0; },
    add(sample: number, level: number, auto: boolean): void {
      ms[n++] = sample;
      if (n < FRAMES) return;
      n = 0;
      window++;
      const sorted = ms.slice().sort();
      const avg = sorted.reduce((a, b) => a + b, 0) / FRAMES;
      console.log(`[pewpew] tick level ${level}${auto ? ' auto' : ''} window ${window} avg ${avg.toFixed(2)} ms p95 ${sorted[Math.floor(FRAMES * 0.95)].toFixed(2)} ms max ${sorted[FRAMES - 1].toFixed(2)} ms over ${FRAMES} frames`);
    },
  };
}
