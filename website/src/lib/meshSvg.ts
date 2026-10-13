import { MESHES, type MeshId } from '@game/render/meshes.gen';

/** Euler angles in radians, applied as X then Y then Z. */
export interface Pose { x?: number; y?: number; z?: number }

const LIGHT = norm([-0.45, 0.55, 0.7]);
const VIEW = [0, -0.276, 0.961] as const;

function norm(v: number[]): [number, number, number] {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
}
const sat = (v: number) => Math.min(1, Math.max(0, v));
const hex = (v: number) => Math.round(sat(v) * 255).toString(16).padStart(2, '0');

function rotate(p: [number, number, number], { x = 0, y = 0, z = 0 }: Pose): [number, number, number] {
  let [a, b, c] = p;
  [b, c] = [b * Math.cos(x) - c * Math.sin(x), b * Math.sin(x) + c * Math.cos(x)];
  [a, c] = [a * Math.cos(y) + c * Math.sin(y), -a * Math.sin(y) + c * Math.cos(y)];
  [a, b] = [a * Math.cos(z) - b * Math.sin(z), a * Math.sin(z) + b * Math.cos(z)];
  return [a, b, c];
}

/** The mesh pipeline's fragment shader (src/render/wgsl.ts), evaluated once per face on the CPU. */
function shade(n: [number, number, number], col: [number, number, number]): string {
  const lam = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  const t = n[1] * 0.5 + 0.5;
  const amb = [0.22 + (0.2 - 0.22) * t, 0.16 + (0.28 - 0.16) * t, 0.3 + (0.42 - 0.3) * t];
  const rimK = (1 - sat(n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2])) ** 3 * sat((col[0] * 0.3 + col[1] * 0.5 + col[2] * 0.2) * 6);
  const rim = [0.35 * rimK, 0.45 * rimK, 0.8 * rimK];
  const emissive = Math.max(...col) > 1.0001;
  const out = col.map((c, i) => (emissive ? c * 0.7 : c * (amb[i]! + 0.7 * lam) + rim[i]!));
  return `#${hex(out[0]!)}${hex(out[1]!)}${hex(out[2]!)}`;
}

/** Orthographic, painter-sorted, back-face-culled SVG of a generated game mesh. Returns the viewBox and the polygons. */
export function meshSvg(id: MeshId, pose: Pose = {}): { viewBox: string; body: string } {
  const m = MESHES[id];
  const tris: { z: number; d: string; fill: string }[] = [];
  const r = m.radius * 1.04;
  for (let i = 0; i < m.indices.length; i += 3) {
    const ids = [m.indices[i]!, m.indices[i + 1]!, m.indices[i + 2]!];
    const pts = ids.map((v) => rotate([m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!], pose));
    const n = norm(rotate([m.normals[ids[0]! * 3]!, m.normals[ids[0]! * 3 + 1]!, m.normals[ids[0]! * 3 + 2]!], pose));
    if (n[2] <= 0) continue;
    const col = [0, 1, 2].map((k) => ids.reduce((s, v) => s + m.colors[v * 3 + k]!, 0) / 3) as [number, number, number];
    tris.push({
      z: (pts[0]![2] + pts[1]![2] + pts[2]![2]) / 3,
      d: pts.map((p) => `${p[0].toFixed(3)},${(-p[1]).toFixed(3)}`).join(' '),
      fill: shade(n, col),
    });
  }
  tris.sort((a, b) => a.z - b.z);
  const body = tris.map((t) => `<polygon points="${t.d}" fill="${t.fill}" stroke="${t.fill}" stroke-width="0.006" stroke-linejoin="round"/>`).join('');
  return { viewBox: `${-r} ${-r} ${2 * r} ${2 * r}`, body };
}
