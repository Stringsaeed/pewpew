import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { Kind } from './levels';
import type { SimEvent } from './sim';
import { EVENT_SFX, SFX, SONGS, type MusicId, type SfxId } from './sound';
import { createAudio } from './audio';
import {
  createFakeAudio, type FakeBufferSource, type FakeContext, type FakeFilter, type FakeGain, type FakeNode, type FakeOsc,
} from './testing/fake-audio';

const restores: Array<() => void> = [];
afterEach(() => { while (restores.length) restores.pop()!(); });

function installClock() {
  const prevSet = globalThis.setInterval;
  const prevClear = globalThis.clearInterval;
  const intervals: { fn: () => void; ms: number; id: number }[] = [];
  const cleared: number[] = [];
  let next = 1;
  globalThis.setInterval = ((fn: () => void, ms?: number) => {
    const id = next++;
    intervals.push({ fn, ms: ms ?? 0, id });
    return id as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
  globalThis.clearInterval = ((id?: unknown) => { cleared.push(Number(id)); }) as typeof clearInterval;
  const clock = {
    intervals,
    cleared,
    tick(i = intervals.length - 1) { intervals[i]!.fn(); },
    restore() {
      globalThis.setInterval = prevSet;
      globalThis.clearInterval = prevClear;
    },
  };
  restores.push(clock.restore);
  return clock;
}

function rig() {
  const timers = installClock();
  const fake = createFakeAudio();
  const engine = createAudio(fake.factory);
  return { timers, ...fake, engine };
}

function isGain(node: FakeNode): node is FakeGain { return node.kind === 'gain'; }
function isOsc(node: FakeNode): node is FakeOsc { return node.kind === 'osc'; }
function isFilter(node: FakeNode): node is FakeFilter { return node.kind === 'filter'; }
function isBuffer(node: FakeNode): node is FakeBufferSource { return node.kind === 'buffer'; }

function masters(ctx: FakeContext): { music: FakeGain; sfx: FakeGain } {
  const gains = ctx.nodes.filter(isGain).filter((gain) => gain.outs.includes(ctx.destination));
  return { music: gains[0]!, sfx: gains[1]! };
}

function noteGains(ctx: FakeContext, bus: FakeGain): FakeGain[] {
  return ctx.nodes.filter(isGain).filter((gain) => gain.outs.includes(bus));
}

function upstream(ctx: FakeContext, gain: FakeGain): { oscs: FakeOsc[]; buffers: FakeBufferSource[]; filters: FakeFilter[] } {
  const filters = ctx.nodes.filter(isFilter).filter((filter) => filter.outs.includes(gain));
  const feeds = (node: FakeNode) => node.outs.includes(gain) || node.outs.some((out) => filters.some((filter) => filter === out));
  return {
    oscs: ctx.nodes.filter(isOsc).filter(feeds),
    buffers: ctx.nodes.filter(isBuffer).filter(feeds),
    filters,
  };
}

function busVoices(ctx: FakeContext, bus: FakeGain): { oscs: FakeOsc[]; buffers: FakeBufferSource[]; gains: FakeGain[] } {
  const gains = noteGains(ctx, bus);
  const oscs: FakeOsc[] = [];
  const buffers: FakeBufferSource[] = [];
  for (const gain of gains) {
    const up = upstream(ctx, gain);
    oscs.push(...up.oscs);
    buffers.push(...up.buffers);
  }
  return { oscs, buffers, gains };
}

function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} is not ${expected}`);
}

function uniq(times: number[]): number[] {
  return [...new Set(times.map((time) => Math.round(time * 1000) / 1000))].sort((a, b) => a - b);
}

test('session options are set before the context exists', () => {
  const { order } = rig();
  assert.deepEqual(order, ['session', 'context']);
});

test('each patch builds its node graph', () => {
  const chime = rig();
  chime.engine.events([{ e: 'shieldBlock', x: 0, y: 0 }]);
  const chimeGain = noteGains(chime.ctx, masters(chime.ctx).sfx)[0]!;
  const chimeUp = upstream(chime.ctx, chimeGain);
  assert.equal(chimeUp.oscs.length, 1);
  assert.equal(chimeUp.oscs[0]!.type, 'triangle');
  assert.equal(chimeUp.filters.length, 0);
  assert.equal(chimeUp.buffers.length, 0);
  assert.ok(chimeUp.oscs[0]!.outs.includes(chimeGain));

  const zap = rig();
  zap.engine.events([{ e: 'fire', x: 0, y: 0, rapid: false }]);
  const zapVoices = busVoices(zap.ctx, masters(zap.ctx).sfx);
  assert.equal(zapVoices.oscs.length, 2);
  assert.ok(zapVoices.oscs.every((osc) => osc.type === 'square'));
  assert.equal(zap.ctx.nodes.filter(isFilter).length, 0);

  const boom = rig();
  boom.engine.events([{ e: 'destroy', target: Kind.Asteroid, x: 0, y: 0 }]);
  const boomSrc = busVoices(boom.ctx, masters(boom.ctx).sfx).buffers.find((src) => src.starts[0] === 0)!;
  const boomFilter = boomSrc.outs[0]!;
  assert.equal(boomFilter.kind, 'filter');
  if (boomFilter.kind !== 'filter') return;
  assert.equal(boomFilter.type, 'lowpass');
  assert.equal(boomSrc.loop, true);
  assert.deepEqual(boomFilter.frequency.events[0], { op: 'set', value: 1200, time: 0 });
  assert.deepEqual(boomFilter.frequency.events[1], { op: 'exp', value: 200, time: 0.382 });

  const hat = rig();
  hat.engine.ui('tap');
  const hatSrc = busVoices(hat.ctx, masters(hat.ctx).sfx).buffers[0]!;
  const hatFilter = hatSrc.outs[0]!;
  assert.equal(hatFilter.kind, 'filter');
  if (hatFilter.kind !== 'filter') return;
  assert.equal(hatFilter.type, 'highpass');
  assert.deepEqual(hatFilter.frequency.events, [{ op: 'set', value: 7000, time: 0 }]);
  assert.equal(hatSrc.buffer!.getChannelData(0).some((sample) => sample !== 0), true);

  const lead = rig();
  lead.engine.events([{ e: 'won', score: 1, stars: 1 }]);
  const firstLead = busVoices(lead.ctx, masters(lead.ctx).sfx).gains[0]!;
  const leadUp = upstream(lead.ctx, firstLead);
  assert.equal(leadUp.oscs.length, 2);
  assert.ok(leadUp.oscs.every((osc) => osc.type === 'square'));
  const leadHz = leadUp.oscs.map((osc) => osc.frequency.events[0]!.value).sort((a, b) => a - b);
  close(leadHz[0]!, hz(72));
  close(leadHz[1]! / leadHz[0]!, 2 ** (7 / 1200));

  const music = rig();
  music.engine.events([{ e: 'start', level: 1 }]);
  const played = busVoices(music.ctx, masters(music.ctx).music);
  const saw = played.oscs.find((osc) => osc.type === 'sawtooth' && osc.starts[0] === 0)!;
  const kick = played.oscs.find((osc) => osc.type === 'sine' && osc.starts[0] === 0)!;
  const bassFilter = saw.outs[0]!;
  assert.equal(bassFilter.kind, 'filter');
  if (bassFilter.kind !== 'filter') return;
  assert.equal(bassFilter.type, 'lowpass');
  assert.deepEqual(bassFilter.frequency.events, [
    { op: 'set', value: 480, time: 0 },
    { op: 'exp', value: 1300, time: 0.125 },
  ]);
  assert.equal(kick.outs[0]!.kind, 'gain');
  assert.equal(played.buffers.length, 1);
});

test('ADSR times are scheduled in order', () => {
  const { engine, ctx } = rig();
  engine.events([{ e: 'shieldBlock', x: 0, y: 0 }]);
  const gain = noteGains(ctx, masters(ctx).sfx)[0]!;
  const events = gain.gain.events;
  assert.deepEqual(events.map((event) => event.op), ['set', 'exp', 'exp', 'set', 'exp']);
  assert.deepEqual(events.map((event) => event.time), [0, 0.002, 0.202, 0.5, 0.7]);
  assert.equal(events[0]!.value, 0.0001);
  assert.equal(events[1]!.value, 0.25);
  close(events[2]!.value, 0.05);
  close(events[3]!.value, 0.05);
  assert.equal(events[4]!.value, 0.0001);
  for (let i = 1; i < events.length; i++) assert.ok(events[i]!.time > events[i - 1]!.time);
});

test('a pitch sweep ramps to the semitone target', () => {
  const { engine, ctx } = rig();
  engine.events([{ e: 'fire', x: 1, y: 2, rapid: true }]);
  const osc = busVoices(ctx, masters(ctx).sfx).oscs.find((node) => node.starts[0] === 0)!;
  const set = osc.frequency.events[0]!;
  const ramp = osc.frequency.events[1]!;
  const target = hz(84) * 2 ** (-18 / 12);
  assert.equal(set.op, 'set');
  assert.equal(ramp.op, 'exp');
  close(set.value, hz(84));
  close(ramp.value, target);
  assert.equal(ramp.time, 0.07);
  assert.equal(Math.round(ramp.value), 370);
});

test('the voice cap stops the oldest laser', () => {
  const { engine, clock, ctx } = rig();
  for (const t of [0, 0.02, 0.04, 0.06, 0.08]) {
    clock.t = t;
    engine.events([{ e: 'fire', x: 0, y: 0, rapid: false }]);
  }
  assert.equal(SFX.laser.maxVoices, 4);
  const oscs = busVoices(ctx, masters(ctx).sfx).oscs;
  const oldest = oscs.find((osc) => osc.starts[0] === 0)!;
  const kept = oscs.find((osc) => osc.starts[0] === 0.02)!;
  assert.equal(oldest.stops.at(-1), 0.08);
  assert.ok(kept.stops.at(-1)! > 0.08);
  assert.equal(oscs.filter((osc) => osc.starts[0] === 0.08).length, 1);
});

test('the sequencer schedules bar 1 inside the lookahead, then bar 2 on the next tick', () => {
  const { engine, clock, ctx, timers } = rig();
  assert.equal(timers.intervals[0]!.ms, 25);
  engine.events([{ e: 'start', level: 1 }]);
  const opened = busVoices(ctx, masters(ctx).music);
  assert.deepEqual(uniq(opened.oscs.filter((osc) => osc.type === 'square').map((osc) => osc.starts[0]!)), [0]);
  assert.deepEqual(uniq(opened.oscs.filter((osc) => osc.type === 'sawtooth').map((osc) => osc.starts[0]!)), [0]);
  assert.deepEqual(uniq(opened.buffers.map((src) => src.starts[0]!)), [0]);
  assert.ok(opened.oscs.every((osc) => osc.starts[0]! < 0.12));

  clock.t = 1.8;
  timers.tick();
  const bar1 = busVoices(ctx, masters(ctx).music);
  const squares = bar1.oscs.filter((osc) => osc.type === 'square');
  const saws = bar1.oscs.filter((osc) => osc.type === 'sawtooth');
  const kicks = bar1.oscs.filter((osc) => osc.type === 'sine');
  assert.deepEqual(uniq(squares.map((osc) => osc.starts[0]!)), [0, 0.25, 0.5, 1, 1.25, 1.5]);
  assert.deepEqual(uniq(saws.map((osc) => osc.starts[0]!)), [0, 0.5, 1, 1.5]);
  assert.deepEqual(uniq(kicks.map((osc) => osc.starts[0]!)), [0, 0.5, 1, 1.5]);
  assert.deepEqual(uniq(bar1.buffers.map((src) => src.starts[0]!)), [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
  assert.equal(Math.max(...bar1.oscs.map((osc) => osc.starts[0]!)), 1.5);
  assert.equal(squares.filter((osc) => osc.starts[0] === 0).length, 2);
  const lead = squares.filter((osc) => osc.starts[0] === 0).map((osc) => osc.frequency.events[0]!.value).sort((a, b) => a - b);
  close(lead[0]!, hz(64));
  close(saws.find((osc) => osc.starts[0] === 0)!.frequency.events[0]!.value, hz(36));
  const kickRamp = kicks.find((osc) => osc.starts[0] === 0)!.frequency.events;
  close(kickRamp[1]!.value, kickRamp[0]!.value / 4);
  assert.equal(kickRamp[1]!.time, 0.09);

  clock.t = 1.91;
  timers.tick();
  const bar2 = busVoices(ctx, masters(ctx).music);
  const at2 = bar2.oscs.filter((osc) => Math.abs(osc.starts[0]! - 2) < 1e-9);
  assert.equal(at2.filter((osc) => osc.type === 'square').length, 2);
  assert.equal(at2.filter((osc) => osc.type === 'sawtooth').length, 1);
  assert.equal(at2.filter((osc) => osc.type === 'sine').length, 1);
  close(at2.filter((osc) => osc.type === 'square').map((osc) => osc.frequency.events[0]!.value).sort((a, b) => a - b)[0]!, hz(74));
  close(at2.find((osc) => osc.type === 'sawtooth')!.frequency.events[0]!.value, hz(45));
  assert.equal(bar2.buffers.filter((src) => Math.abs(src.starts[0]! - 2) < 1e-9).length, 1);
  assert.ok(bar2.oscs.every((osc) => osc.starts[0]! <= 2));
  assert.ok(bar2.buffers.every((src) => src.starts[0]! <= 2));
});

test('switching tier or entering the boss stops the old voices', () => {
  const tier = rig();
  tier.engine.events([{ e: 'start', level: 1 }]);
  const oldTier = busVoices(tier.ctx, masters(tier.ctx).music);
  tier.clock.t = 0.3;
  tier.engine.events([{ e: 'start', level: 11 }]);
  for (const osc of oldTier.oscs) assert.equal(osc.stops.at(-1), 0.3);
  for (const src of oldTier.buffers) assert.equal(src.stops.at(-1), 0.3);
  const nextBass = busVoices(tier.ctx, masters(tier.ctx).music).oscs.find((osc) => osc.type === 'sawtooth' && osc.starts[0] === 0.3)!;
  close(nextBass.frequency.events[0]!.value, hz(33));

  const boss = rig();
  boss.engine.events([{ e: 'start', level: 5 }]);
  const oldBoss = busVoices(boss.ctx, masters(boss.ctx).music);
  boss.clock.t = 0.05;
  boss.engine.events([{ e: 'bossEnter', boss: 'warden' }]);
  for (const osc of oldBoss.oscs) assert.equal(osc.stops.at(-1), 0.05);
  const stab = busVoices(boss.ctx, masters(boss.ctx).music).oscs.filter((osc) => osc.type === 'square' && osc.starts[0] === 0.05);
  assert.equal(stab.length, 2);
  close(stab.map((osc) => osc.frequency.events[0]!.value).sort((a, b) => a - b)[0]!, hz(62));
});

test('won plays the stinger and stops the music', () => {
  const { engine, clock, ctx, timers } = rig();
  engine.events([{ e: 'start', level: 1 }]);
  const playing = busVoices(ctx, masters(ctx).music);
  clock.t = 0.2;
  engine.events([{ e: 'won', score: 40, stars: 2 }]);
  for (const osc of playing.oscs) assert.equal(osc.stops.at(-1), 0.2);
  for (const src of playing.buffers) assert.equal(src.stops.at(-1), 0.2);
  const musicGains = noteGains(ctx, masters(ctx).music).length;
  clock.t = 3;
  timers.tick();
  assert.equal(noteGains(ctx, masters(ctx).music).length, musicGains);
  assert.equal(noteGains(ctx, masters(ctx).sfx).length, 4);
});

test('mix writes the two master gains', () => {
  const { engine, clock, ctx } = rig();
  clock.t = 1.5;
  engine.mix({ music: false, sfx: true });
  const { music, sfx } = masters(ctx);
  assert.deepEqual(music.gain.events.at(-1), { op: 'set', value: 0, time: 1.5 });
  assert.deepEqual(sfx.gain.events.at(-1), { op: 'set', value: 1, time: 1.5 });
  clock.t = 2;
  engine.mix({ music: true, sfx: false });
  assert.deepEqual(music.gain.events.at(-1), { op: 'set', value: 1, time: 2 });
  assert.deepEqual(sfx.gain.events.at(-1), { op: 'set', value: 0, time: 2 });
});

test('ui plays a tap and starts or stops the title song', () => {
  const { engine, clock, ctx } = rig();
  engine.ui('tap');
  assert.equal(busVoices(ctx, masters(ctx).sfx).buffers.length, 1);
  assert.equal(busVoices(ctx, masters(ctx).music).gains.length, 0);
  clock.t = 0.4;
  engine.ui('menu-music');
  const title = busVoices(ctx, masters(ctx).music).oscs.filter((osc) => osc.type === 'square' && osc.starts[0] === 0.4);
  assert.equal(title.length, 2);
  close(title.map((osc) => osc.frequency.events[0]!.value).sort((a, b) => a - b)[0]!, hz(64));
  clock.t = 0.5;
  engine.ui('silence');
  for (const osc of title) assert.equal(osc.stops.at(-1), 0.5);
});

test('active suspends the context and the sequencer together', () => {
  const { engine, clock, ctx, timers } = rig();
  engine.events([{ e: 'start', level: 1 }]);
  const before = ctx.nodes.length;
  engine.active(false);
  assert.equal(ctx.suspends, 1);
  assert.deepEqual(timers.cleared, [1]);
  clock.t = 5;
  timers.intervals[0]!.fn();
  assert.equal(ctx.nodes.length, before);
  engine.active(true);
  assert.equal(ctx.resumes, 1);
  assert.equal(timers.intervals[1]!.ms, 25);
  assert.ok(ctx.nodes.length > before);
});

test('EVENT_SFX names every sim event', () => {
  const names = ['start', 'fire', 'enemyFire', 'hit', 'destroy', 'pickup', 'shieldBlock', 'playerHit', 'bossEnter', 'wormholeOpen', 'won', 'lost'] as const;
  assert.deepEqual(Object.keys(EVENT_SFX).sort(), [...names].sort());
  const samples: SimEvent[] = [
    { e: 'start', level: 4 },
    { e: 'fire', x: 0, y: 0, rapid: false },
    { e: 'enemyFire', x: 0, y: 0 },
    { e: 'hit', target: Kind.Drone, x: 0, y: 0 },
    { e: 'destroy', target: Kind.Mine, x: 0, y: 0 },
    { e: 'pickup', kind: Kind.Crystal, x: 0, y: 0 },
    { e: 'pickup', kind: Kind.Rapid, x: 0, y: 0 },
    { e: 'pickup', kind: Kind.Shield, x: 0, y: 0 },
    { e: 'shieldBlock', x: 0, y: 0 },
    { e: 'playerHit', x: 0, y: 0, lives: 1 },
    { e: 'bossEnter', boss: 'core' },
    { e: 'wormholeOpen', y: 8 },
    { e: 'won', score: 9, stars: 3 },
    { e: 'lost', score: 2 },
  ];
  const got = samples.map((ev) => {
    switch (ev.e) {
      case 'start': return EVENT_SFX.start(ev);
      case 'fire': return EVENT_SFX.fire(ev);
      case 'enemyFire': return EVENT_SFX.enemyFire(ev);
      case 'hit': return EVENT_SFX.hit(ev);
      case 'destroy': return EVENT_SFX.destroy(ev);
      case 'pickup': return EVENT_SFX.pickup(ev);
      case 'shieldBlock': return EVENT_SFX.shieldBlock(ev);
      case 'playerHit': return EVENT_SFX.playerHit(ev);
      case 'bossEnter': return EVENT_SFX.bossEnter(ev);
      case 'wormholeOpen': return EVENT_SFX.wormholeOpen(ev);
      case 'won': return EVENT_SFX.won(ev);
      case 'lost': return EVENT_SFX.lost(ev);
      default: {
        const neverEv: never = ev;
        return neverEv;
      }
    }
  });
  assert.deepEqual(got, [
    null, 'laser', null, 'hit', 'explode', 'pickup', 'pickup', 'shield', 'shield', 'explode', null, 'pickup', 'complete', 'gameover',
  ]);
  for (const id of got) if (id !== null) assert.ok(id in SFX);
});

test('every song voice is 8 bars of tokens that parse', () => {
  const token = /^(?:[A-G](?:#|b)?[0-8]|-|\.)$/;
  const bpm: Record<MusicId, number> = { tier1: 120, tier2: 132, tier3: 144, boss: 160 };
  const tonic: Record<MusicId, string> = { tier1: 'C2', tier2: 'A1', tier3: 'F#1', boss: 'D1' };
  for (const id of Object.keys(SONGS) as MusicId[]) {
    const song = SONGS[id];
    assert.equal(song.bpm, bpm[id]);
    assert.deepEqual(song.voices.map((voice) => voice.patch), ['lead', 'bass', 'kick', 'hat']);
    const counts = song.voices.map((voice) => voice.steps.trim().split(/\s+/).length);
    assert.deepEqual(counts, [128, 128, 128, 128]);
    for (const voice of song.voices) {
      for (const tok of voice.steps.trim().split(/\s+/)) assert.match(tok, token);
    }
    assert.equal(song.voices[1]!.steps.split(/\s+/)[0], tonic[id]);
  }
  for (const id of Object.keys(SFX) as SfxId[]) {
    assert.ok(SFX[id].notes.length > 0);
    assert.ok(SFX[id].maxVoices >= 1);
  }
});
