/// <reference types="node" />
/**
 * Creates PewPew's Game Center leaderboard sets and leaderboards in App Store Connect, idempotently.
 * See docs/game-center.md for the design and the manual path.
 *
 *   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_PATH=~/AuthKey.p8 npx tsx scripts/asc-leaderboards.ts [--dry-run]
 *
 * Needs an App Store Connect API key with the App Manager role. Uses only Node's crypto for the ES256 token.
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LEVELS, tierOf } from '../src/levels';
import { BOARD } from '../src/leaderboards';

const APP_ID = process.env.ASC_APP_ID ?? '6822155755';
const API = 'https://api.appstoreconnect.apple.com/v1';
const LOCALE = 'en-US';
const DRY = process.argv.includes('--dry-run');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SetSpec { readonly vendor: string; readonly name: string }
interface BoardSpec { readonly vendor: string; readonly name: string; readonly set: string }

const SETS: readonly SetSpec[] = [
  { vendor: 'pewpew.set.campaign', name: 'Campaign' },
  { vendor: 'pewpew.set.sector1', name: 'Sector 1' },
  { vendor: 'pewpew.set.sector2', name: 'Sector 2' },
  { vendor: 'pewpew.set.sector3', name: 'Sector 3' },
];
const BOARDS: readonly BoardSpec[] = [
  { vendor: BOARD.score, name: 'Campaign Score', set: 'pewpew.set.campaign' },
  { vendor: BOARD.stars, name: 'Stars', set: 'pewpew.set.campaign' },
  ...LEVELS.map((l) => ({ vendor: BOARD.level(l.n), name: `Level ${String(l.n).padStart(2, '0')}`, set: `pewpew.set.sector${tierOf(l.n)}` })),
];

function env(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`Missing ${name}`); process.exit(2); }
  return v;
}

function token(): string {
  const keyPath = env('ASC_KEY_PATH').replace(/^~/, process.env.HOME ?? '');
  let pem: Buffer;
  try { pem = readFileSync(keyPath); } catch { console.error(`Cannot read the API key at ${keyPath}`); process.exit(2); }
  const key = createPrivateKey(pem);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const input = `${b64({ alg: 'ES256', kid: env('ASC_KEY_ID'), typ: 'JWT' })}.${b64({ iss: env('ASC_ISSUER_ID'), iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' })}`;
  const sig = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${input}.${sig}`;
}

const jwt = token();

interface Resource { readonly id: string; readonly attributes: Record<string, unknown> }

async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`${method} ${path} -> ${res.status}\n${text}`);
    process.exit(1);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function list(path: string): Promise<Resource[]> {
  const out: Resource[] = [];
  let next: string | null = `${API}${path}${path.includes('?') ? '&' : '?'}limit=200`;
  while (next !== null) {
    const page: { data: Resource[]; links?: { next?: string } } = await api('GET', next.slice(API.length));
    out.push(...page.data);
    next = page.links?.next ?? null;
  }
  return out;
}

const ref = (type: string, id: string) => ({ data: { type, id } });

async function create(type: string, attributes: Record<string, unknown>, relationships: Record<string, unknown>): Promise<string> {
  if (DRY) { console.log(`  would create ${type}`, JSON.stringify(attributes)); return `dry-${type}`; }
  const res = await api<{ data: Resource }>('POST', `/${type}`, { data: { type, attributes, relationships } });
  return res.data.id;
}

async function main() {
  console.log(`${DRY ? 'Planning' : 'Applying'} Game Center setup for app ${APP_ID}`);

  // 1. Game Center detail record. The App Store Connect page exists for every app, but the API record only appears
  //    once Game Center has been enabled (by creating it here, or by the first leaderboard made in the UI).
  const existing = await api<{ data: Resource | null }>('GET', `/apps/${APP_ID}/gameCenterDetail`).then((r) => r.data?.id ?? null);
  const fresh = existing === null;
  if (fresh) console.log('Game Center is not enabled for the app in the API yet; enabling it');
  const detail: string = existing ?? await create('gameCenterDetails', {}, { app: ref('apps', APP_ID) });
  if (!DRY && !UUID.test(detail)) { console.error(`Unexpected Game Center detail id: ${detail}`); process.exit(1); }
  console.log(`Game Center detail: ${detail}`);

  // 2. Leaderboard sets. A just-created (or dry-run placeholder) detail has nothing to list.
  const existingSets = new Map(fresh ? [] : (await list(`/gameCenterDetails/${detail}/gameCenterLeaderboardSets`)).map((s) => [s.attributes.vendorIdentifier as string, s.id] as const));
  const setIds = new Map<string, string>();
  for (const s of SETS) {
    const found = existingSets.get(s.vendor);
    if (found !== undefined) { setIds.set(s.vendor, found); console.log(`set ${s.vendor}: exists`); continue; }
    console.log(`set ${s.vendor}: creating`);
    const id = await create('gameCenterLeaderboardSets', { referenceName: s.name, vendorIdentifier: s.vendor }, { gameCenterDetail: ref('gameCenterDetails', detail) });
    await create('gameCenterLeaderboardSetLocalizations', { locale: LOCALE, name: s.name }, { gameCenterLeaderboardSet: ref('gameCenterLeaderboardSets', id) });
    setIds.set(s.vendor, id);
  }

  // 3. Leaderboards, each attached to its set at creation (the set is the only relationship Apple accepts then).
  const existingBoards = new Map(fresh ? [] : (await list(`/gameCenterDetails/${detail}/gameCenterLeaderboards`)).map((b) => [b.attributes.vendorIdentifier as string, b.id] as const));
  for (const b of BOARDS) {
    if (existingBoards.has(b.vendor)) { console.log(`board ${b.vendor}: exists`); continue; }
    console.log(`board ${b.vendor}: creating in ${b.set}`);
    const id = await create(
      'gameCenterLeaderboards',
      {
        referenceName: b.name,
        vendorIdentifier: b.vendor,
        defaultFormatter: 'INTEGER',
        scoreSortType: 'DESC',
        submissionType: 'BEST_SCORE',
        scoreRangeStart: '0',
        scoreRangeEnd: '999999999',
      },
      // A board created inside a set may carry only the set relationship; the detail is implied by the set.
      { gameCenterLeaderboardSets: { data: [{ type: 'gameCenterLeaderboardSets', id: setIds.get(b.set) }] } },
    );
    await create('gameCenterLeaderboardLocalizations', { locale: LOCALE, name: b.name }, { gameCenterLeaderboard: ref('gameCenterLeaderboards', id) });
  }
  console.log('Done. Next: tick Game Center on the App Store version page and pick the sets to ship (docs/game-center.md step 3).');
}

void main();
