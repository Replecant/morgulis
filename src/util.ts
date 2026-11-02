export const TAU = Math.PI * 2;
export type Pt = { x: number; y: number };

export const DIRS4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DIRS8: [number, number][] = [...DIRS4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Детерминированный ГПСЧ — чтобы фон рисовался одинаково при каждом запуске. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const cheb = (a: Pt, b: Pt) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface BfsNode { x: number; y: number; d: number; prev: number }
export type BfsMap = Map<number, BfsNode>;

/** Поиск в ширину по сетке. Диагонали не срезают углы. */
export function bfs(
  w: number, h: number, sx: number, sy: number,
  passable: (x: number, y: number) => boolean,
  maxSteps: number | null, dirs = DIRS8,
): BfsMap {
  const out: BfsMap = new Map();
  const k0 = sy * w + sx;
  out.set(k0, { x: sx, y: sy, d: 0, prev: -1 });
  const q = [k0];
  for (let qi = 0; qi < q.length; qi++) {
    const ck = q[qi];
    const c = out.get(ck)!;
    if (maxSteps != null && c.d >= maxSteps) continue;
    for (const [dx, dy] of dirs) {
      const nx = c.x + dx, ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = ny * w + nx;
      if (out.has(nk) || !passable(nx, ny)) continue;
      if (dx && dy && (!passable(c.x + dx, c.y) || !passable(c.x, c.y + dy))) continue;
      out.set(nk, { x: nx, y: ny, d: c.d + 1, prev: ck });
      q.push(nk);
    }
  }
  return out;
}

export function pathTo(map: BfsMap, w: number, x: number, y: number): Pt[] {
  const p: Pt[] = [];
  let n = map.get(y * w + x);
  while (n) {
    p.push({ x: n.x, y: n.y });
    n = n.prev >= 0 ? map.get(n.prev) : undefined;
  }
  return p.reverse();
}

/** Брезенхем — для линии видимости. */
export function lineTiles(x0: number, y0: number, x1: number, y1: number): Pt[] {
  const pts: Pt[] = [];
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
