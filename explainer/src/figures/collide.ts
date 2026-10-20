import { h } from '../dom';
import { codeView } from '../code';
import { figure, pill, rich, segmented } from '../figure';
import { canvas2d, KIND_COLOR, KIND_NAME } from '../world2d';
import { ARCHETYPES, Kind } from '../../../src/levels';
import { createWorld, PLAYER_RADIUS, type SimEvent, type World } from '../../../src/sim';
import { add } from '../../../src/sim/world';
import { PICKUP_SLACK } from '../../../src/sim/rules';
import { collide } from '../../../src/sim/step';

const KINDS = [Kind.Asteroid, Kind.Mine, Kind.Drone, Kind.Well, Kind.Crystal, Kind.Shield, Kind.EnemyBolt] as const;
const W = 330, H = 250, S = 46;

/** Drag the rocket around one body. Every move builds a tiny world and calls the real collide() on it. */
export function collideFigure(): HTMLElement {
  const fig = figure('collide(), one body at a time', { wide: true });
  let kind: Kind = Kind.Asteroid;
  let shield = false, immune = false, bolt = false;
  let rx = -1.6, ry = -0.6;
  const { el: cv, ctx } = canvas2d(W, H);
  cv.style.cursor = 'crosshair';
  const out = h('div', { class: 'collide-out' });
  const code = codeView('collide', { maxHeight: 260 });

  // Lines of collide() that each outcome passes through, found by their text so they follow the source.
  const L = (s: string, from = 0) => code.find(s, from);
  const dist = L('if (dx * dx + dy * dy >= rr * rr) continue;');
  const pickupFrom = L("if (a.role === 'pickup') {");
  const pickupTo = L('continue;', pickupFrom);
  const immuneLine = L('if (w.tick < p.invulnUntilTick) continue;');
  const hurtLine = L('hurt(w, out);');
  const fieldLine = L("if (a.role === 'field') continue;");
  const deadFrom = fieldLine + 1;
  const deadTo = L("if (a.role === 'hazard') out.push");
  const boltHit = L('if (--b.hp[i] > 0)');
  const killFrom = L('w.score += a.score;');
  const killTo = L('if (a.splitInto !== null)');

  function light(ranges: [number, number][]): void {
    code.lines.forEach((ln, i) => {
      const on = ranges.some(([a, b]) => i >= a && i <= b);
      ln.classList.toggle('on', on);
      ln.classList.toggle('dim', !on);
    });
    // Keep the deepest lit line in view: that is where this outcome ended.
    const deepest = code.lines[Math.max(...ranges.map(([, b]) => b))];
    if (deepest) code.el.scrollTo({ top: Math.max(0, deepest.offsetTop - code.el.clientHeight / 2), behavior: 'smooth' });
  }

  function world(): World {
    const w = createWorld(1);
    w.tick = 100;
    w.bodies.count = 0;
    w.player.x = rx;
    w.player.y = 10 + ry;
    w.player.shield = shield;
    w.player.invulnUntilTick = immune ? 200 : 0;
    add(w, kind, 0, 10, 0, 0);
    if (bolt) add(w, Kind.Bolt, 0, 9.95, 0, 28);
    return w;
  }

  function run(): void {
    const w = world();
    const events: SimEvent[] = [];
    const hpBefore = w.bodies.hp[0]!;
    collide(w, events);
    const a = ARCHETYPES[kind];
    const rr = a.radius + PLAYER_RADIUS + (a.role === 'pickup' ? PICKUP_SLACK : 0);
    const d = Math.hypot(rx, ry);
    const touching = d < rr;
    const ranges: [number, number][] = [[dist, dist]];
    let story: string;
    if (!touching) story = `Distance ${d.toFixed(2)} ≥ ${rr.toFixed(2)} (body radius ${a.radius} + rocket ${PLAYER_RADIUS}${a.role === 'pickup' ? ` + pickup slack ${PICKUP_SLACK}` : ''}). No contact, so the loop moves on.`;
    else if (a.role === 'pickup') { ranges.push([pickupFrom, pickupTo]); story = `On contact with a pickup, \`collect\` applies it and marks the body DEAD. Score is now ${w.score}${w.player.shield ? ', shield on' : ''}.`; }
    else if (immune) { ranges.push([immuneLine, immuneLine]); story = 'Contact, but the rocket is still immune from a recent hit, so nothing happens.'; }
    else {
      ranges.push([hurtLine, hurtLine]);
      if (a.role === 'field') { ranges.push([fieldLine, fieldLine]); story = 'A well hurts on contact but is not destroyed: the `field` role skips the DEAD line.'; }
      else { ranges.push([deadFrom, deadTo]); story = `Contact with a ${KIND_NAME[kind]}: \`hurt\` ${shield ? 'spends the shield' : `costs a life (${w.player.lives} left)`}, and the body is marked DEAD${a.role === 'hazard' ? ', with a destroy event' : ''}.`; }
    }
    if (bolt) {
      // Read the outcome from what collide() did, not from what we expect it to do.
      if (a.role !== 'hazard') story += ' Bolts only test hazards and the boss, so this one flies on.';
      else if (a.hp === 0) story += ' The bolt passes over: a mine has hp 0 and cannot be shot.';
      else if (events.some((e) => e.e === 'hit')) { ranges.push([boltHit, boltHit]); story += ` The bolt lands: hp ${hpBefore} → ${w.bodies.hp[0]}, a \`hit\` event.`; }
      else if (w.score >= a.score && a.score > 0) { ranges.push([killFrom, killTo]); story += ` The bolt finishes it: +${a.score} points${a.splitInto ? `, and it splits into ${a.splitInto.count} fragments` : ''}.`; }
      else story += ' The rocket already destroyed it this step, so the bolt finds nothing alive to hit.';
    }
    light(ranges);
    out.replaceChildren(rich(story), h('div', { class: 'mono small muted' }, `events: ${events.map((e) => e.e).join(', ') || 'none'} · bodies after: ${w.bodies.count} (dead ones leave in despawn)`));
    draw(rr, touching);
  }

  function draw(rr: number, touching: boolean): void {
    const cx = W / 2, cy = H / 2;
    ctx.fillStyle = '#05060d';
    ctx.fillRect(0, 0, W, H);
    const a = ARCHETYPES[kind];
    ctx.strokeStyle = touching ? '#ffe14f' : 'rgba(255,255,255,.35)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, rr * S, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = KIND_COLOR[kind]!;
    ctx.beginPath(); ctx.arc(cx, cy, a.radius * S, 0, Math.PI * 2); ctx.fill();
    if (kind === Kind.Well) { ctx.fillStyle = '#05060d'; ctx.beginPath(); ctx.arc(cx, cy, a.radius * S * 0.6, 0, Math.PI * 2); ctx.fill(); }
    if (bolt) { ctx.strokeStyle = '#4ff3ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy + 14); ctx.lineTo(cx, cy - 2); ctx.stroke(); ctx.lineWidth = 1; }
    const px = cx + rx * S, py = cy - ry * S;
    ctx.fillStyle = 'rgba(238,240,250,.15)';
    ctx.beginPath(); ctx.arc(px, py, PLAYER_RADIUS * S, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#eef0fa';
    ctx.beginPath(); ctx.moveTo(px, py - 12); ctx.lineTo(px - 8, py + 8); ctx.lineTo(px + 8, py + 8); ctx.closePath(); ctx.fill();
    if (shield) { ctx.strokeStyle = '#8dff6a'; ctx.beginPath(); ctx.arc(px, py, 1.3 * S * 0.5, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#8a92b2';
    ctx.font = '11px "Paper Mono", ui-monospace, monospace';
    ctx.fillText(`${KIND_NAME[kind]} · dashed ring = contact distance`, 8, H - 10);
  }

  const move = (e: PointerEvent): void => {
    const r = cv.getBoundingClientRect();
    rx = (e.clientX - r.left - W / 2) / S;
    ry = -(e.clientY - r.top - H / 2) / S;
    run();
  };
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerdown', move);

  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void): HTMLButtonElement => {
    const b = pill(label, () => { set(!get()); b.classList.toggle('on', get()); run(); });
    return b;
  };
  fig.body.append(
    h('div', { class: 'row' }, segmented(KINDS, kind, (v) => { kind = v; run(); }, (v) => KIND_NAME[v]).el),
    h('div', { class: 'row' },
      toggle('rocket has a shield', () => shield, (v) => { shield = v; }),
      toggle('rocket is immune', () => immune, (v) => { immune = v; }),
      toggle('a bolt is on it', () => bolt, (v) => { bolt = v; }),
    ),
    h('div', { class: 'two collide' }, cv, out),
    code.el,
  );
  run();
  fig.caption('Move the pointer over the dark box to move the rocket. Each move calls the real `collide()` on a one-body world, and the lit lines are the path it took.');
  return fig.el;
}
