import { h, svg } from '../dom';
import { figure, pill, segmented } from '../figure';
import { Kind } from '../../../src/levels';
import { createAudio, parseSteps, SONGS, type AudioEngine, type BaseAudioContextLike, type MusicId } from '../../../src/audio';
import type { SimEvent } from '../../../src/sim';

let shared: AudioEngine | null = null;

/** The game's audio engine on a browser AudioContext. Web Audio has the same node API react-native-audio-api mirrors. */
export function webAudio(): AudioEngine {
  shared ??= createAudio({
    configureSession() {},
    createContext: () => new AudioContext() as unknown as BaseAudioContextLike,
  });
  return shared;
}

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Which event starts each song: start picks the tier song from the level, bossEnter picks the boss song. */
const SONG_EVENT: Record<MusicId, SimEvent> = {
  tier1: { e: 'start', level: 1 },
  tier2: { e: 'start', level: 11 },
  tier3: { e: 'start', level: 21 },
  boss: { e: 'bossEnter', boss: 'warden' },
};

const SFX_EVENTS: [string, SimEvent][] = [
  ['fire', { e: 'fire', x: 0, y: 0, rapid: false }],
  ['hit', { e: 'hit', target: Kind.Asteroid, x: 0, y: 0 }],
  ['destroy', { e: 'destroy', target: Kind.Asteroid, x: 0, y: 0 }],
  ['pickup', { e: 'pickup', kind: Kind.Crystal, x: 0, y: 0 }],
  ['shieldBlock', { e: 'shieldBlock', x: 0, y: 0 }],
  ['won', { e: 'won', score: 0, stars: 3 }],
  ['lost', { e: 'lost', score: 0 }],
];

export function soundFigure(): HTMLElement {
  const fig = figure('The synth, playing from this page', { wide: true });
  let song: MusicId = 'tier1';
  let startedAt = 0;
  let playing = false;
  const grid = h('div', { class: 'song' });
  const head = h('div', { class: 'muted small' });
  let playhead: SVGLineElement | null = null;
  let cellW = 0, label = 0, nSteps = 0, stepDur = 0;

  function drawGrid(): void {
    const s = SONGS[song];
    const voices = s.voices.map((v) => parseSteps(v.steps));
    nSteps = voices[0]?.length ?? 0;
    stepDur = 60 / s.bpm / 4;
    label = 44;
    cellW = 5;
    const rowH = 14;
    const W = label + nSteps * cellW, H = s.voices.length * (rowH + 4) + 8;
    const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart song-svg', preserveAspectRatio: 'none' });
    s.voices.forEach((voice, vi) => {
      const y = 4 + vi * (rowH + 4);
      el.append(svg('text', { x: 2, y: y + 10 }, voice.patch));
      let lo = 127, hi = 0;
      for (const t of voices[vi]!) if (t.k === 'note') { lo = Math.min(lo, t.midi); hi = Math.max(hi, t.midi); }
      voices[vi]!.forEach((t, i) => {
        if (t.k === 'rest') return;
        const x = label + i * cellW;
        if (t.k === 'hold') { el.append(svg('rect', { x, y: y + rowH / 2 - 1, width: cellW, height: 2, class: 'note-hold' })); return; }
        const yy = y + rowH - 3 - ((t.midi - lo) / Math.max(1, hi - lo)) * (rowH - 6);
        el.append(svg('rect', { x: x + 0.5, y: yy - 2, width: cellW - 1, height: 4, rx: 1, class: 'note', 'data-note': `${NOTE[t.midi % 12]}${Math.floor(t.midi / 12) - 1}` }));
      });
    });
    playhead = svg('line', { x1: label, x2: label, y1: 0, y2: H, class: 'playhead' });
    el.append(playhead);
    grid.replaceChildren(el);
    head.textContent = `${song} · ${s.bpm} bpm · ${s.voices.length} voices · ${nSteps} sixteenth notes · ${(nSteps * stepDur).toFixed(1)} s loop`;
  }

  const tick = (): void => {
    requestAnimationFrame(tick);
    if (!playing || !playhead) return;
    // The engine schedules on its own audio clock; this playhead follows the tempo from the moment you pressed play.
    const t = ((performance.now() - startedAt) / 1000) % (nSteps * stepDur);
    const x = label + (t / stepDur) * cellW;
    playhead.setAttribute('x1', String(x));
    playhead.setAttribute('x2', String(x));
  };

  const songSeg = segmented(['tier1', 'tier2', 'tier3', 'boss'] as const, song, (v) => {
    song = v;
    drawGrid();
    if (playing) play();
  });
  const playBtn = pill('▶ play', () => (playing ? stop() : play()));
  function play(): void {
    webAudio().mix({ music: true, sfx: true });
    webAudio().events([SONG_EVENT[song]]);
    startedAt = performance.now();
    playing = true;
    playBtn.textContent = '■ stop';
  }
  function stop(): void {
    webAudio().ui('silence');
    playing = false;
    playBtn.textContent = '▶ play';
  }

  fig.body.append(
    h('div', { class: 'row' }, songSeg.el, playBtn),
    head,
    grid,
    h('div', { class: 'row sfx' }, h('span', { class: 'muted small' }, 'send an event:'), ...SFX_EVENTS.map(([name, ev]) => pill(name, () => webAudio().events([ev])))),
  );
  drawGrid();
  requestAnimationFrame(tick);
  fig.caption('Every sound is made by the game\'s `createAudio` with a browser `AudioContext` in place of the native one. The buttons send the same SimEvents the sim emits. `won` and `lost` also stop the music, as they do in the game.');
  return fig.el;
}
