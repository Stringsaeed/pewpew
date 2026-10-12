import { COAST, type Bot } from './sim';

const NI = (): never => { throw new Error('not implemented'); };

/** Looks 3 s ahead, scores 9 lanes by threat (hazards, enemy bolts, well pull) minus crystal value, steers to the best. */
export const greedyBot: Bot = (w) => NI();
export const idleBot: Bot = () => COAST;
