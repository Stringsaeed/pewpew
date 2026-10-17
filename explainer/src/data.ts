import excerptsJson from '../build/excerpts.json';
import goldenJson from '../build/golden.json';

export interface Excerpt { readonly file: string; readonly start: number; readonly text: string }
/** Build-time excerpts from the real source files (see build.mjs). */
export const EXCERPTS = excerptsJson as Record<string, Excerpt>;
export interface GoldenRow { readonly n: number; readonly hash: string; readonly steps: number; readonly score: number; readonly stars: number }
/** Rows of scripts/verify-levels.golden.txt. */
export const GOLDEN = goldenJson as GoldenRow[];
