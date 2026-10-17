import { codeFigure, highlightInto } from './code';
import { h } from './dom';
import { hero } from './figures/hero';
import { poolFigure, steerWalk } from './figures/basics';
import { stepWalk } from './figures/stepwalk';
import { frameWalk } from './figures/frame';
import { levelRow, trackWalk } from './figures/levels';
import { bossFigure, droneWalk } from './figures/enemies';
import { collideFigure } from './figures/collide';
import { botFigure, proofFigure } from './figures/proof';
import { runtimesFigure, threadsFigure } from './figures/threads';
import { soundFigure } from './figures/sound';
import { cameraFigure, flowFigure } from './figures/ui';

/** Every {{name}} placeholder in post.md. {{code:NAME}} is a captioned real excerpt. */
const FIGURES: Record<string, () => HTMLElement> = {
  hero, pool: poolFigure, step: stepWalk, steer: steerWalk, frame: frameWalk, level: levelRow, track: trackWalk,
  drones: droneWalk, boss: bossFigure, collide: collideFigure, bot: botFigure, proof: proofFigure,
  threads: threadsFigure, runtimes: runtimesFigure, sound: soundFigure, camera: cameraFigure, flow: flowFigure,
};

function mount(slot: HTMLElement): void {
  const name = slot.dataset.fig!;
  try {
    const el = name.startsWith('code:') ? codeFigure(name.slice(5)) : FIGURES[name]?.();
    if (!el) throw new Error(`unknown figure ${name}`);
    slot.replaceWith(el);
  } catch (e) {
    console.error(e);
    slot.replaceWith(h('div', { class: 'fig-error' }, `figure "${name}" failed: ${(e as Error).message}`));
  }
}

for (const el of document.querySelectorAll<HTMLElement>('code[data-code]')) highlightInto(el, el.textContent ?? '');
for (const el of document.querySelectorAll<HTMLElement>('pre.code:not(.live) > code')) highlightInto(el, el.textContent ?? '');

// Figures mount as they come near the viewport, so the page opens fast and idle figures cost nothing.
const slots = [...document.querySelectorAll<HTMLElement>('.fig[data-fig]')];
const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    io.unobserve(en.target);
    mount(en.target as HTMLElement);
  }
}, { rootMargin: '800px 0px' });
for (const s of slots) io.observe(s);
