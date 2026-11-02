// ============================================================
//  Пиксельный движок: мир рисуется в низком разрешении
//  (480×320, клетка 20 px) и увеличивается ×2 без сглаживания.
// ============================================================
export const LW = 480, LH = 320, PS = 2;
export const T = 20; // клетка в пикселях низкого разрешения

type Ctx = CanvasRenderingContext2D;

/** Холст низкого разрешения + вывод на экран. */
export class PixelView {
  cv = document.createElement('canvas');
  c: Ctx;
  constructor(public w = LW, public h = LH) {
    this.cv.width = w; this.cv.height = h;
    this.c = this.cv.getContext('2d', { willReadFrequently: true })!;
    this.c.imageSmoothingEnabled = false;
  }
  present(out: Ctx, x = 0, y = 0, scale = PS) {
    out.imageSmoothingEnabled = false;
    out.drawImage(this.cv, 0, 0, this.w, this.h, x, y, this.w * scale, this.h * scale);
  }
}

// ------------------------------------------------------------ примитивы (целые пиксели, без сглаживания)
export function prect(c: Ctx, x: number, y: number, w: number, h: number, col: string) {
  c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
export function ppx(c: Ctx, x: number, y: number, col: string) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), 1, 1); }
export function pline(c: Ctx, x0: number, y0: number, x1: number, y1: number, col: string, wdt = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  c.fillStyle = col;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    c.fillRect(x0, y0, wdt, wdt);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
/** Залитый эллипс по пикселям. */
export function pellipse(c: Ctx, cx: number, cy: number, rx: number, ry: number, col: string) {
  c.fillStyle = col;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1))));
    c.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}
/** Полупрозрачная тень «шахматкой» — честный пиксельный способ. */
export function pshadow(c: Ctx, cx: number, cy: number, rx: number, ry: number, col = 'rgba(0,0,0,0.45)') {
  pellipse(c, cx, cy, rx, ry, col);
}

/** Осветлить/затемнить цвет: k > 0 светлее, k < 0 темнее. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

export function seeded(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Контур в 1 пиксель вокруг непрозрачной части холста. */
export function outline(cv: HTMLCanvasElement, col = '#0c0e0a') {
  const c = cv.getContext('2d')!;
  const img = c.getImageData(0, 0, cv.width, cv.height), d = img.data, w = cv.width, h = cv.height;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 128;
  const pts: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) pts.push(x, y);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); // контур — в координатах холста, без сдвига рисования
  c.fillStyle = col;
  for (let i = 0; i < pts.length; i += 2) c.fillRect(pts[i], pts[i + 1], 1, 1);
  c.restore();
}

/** Нарисовать векторную картинку крупно и уменьшить «ближайшим соседом» — получается чёткий пиксельный спрайт. */
export function pixelize(w: number, h: number, draw: (c: Ctx) => void, ss = 4): HTMLCanvasElement {
  const big = document.createElement('canvas'); big.width = w * ss; big.height = h * ss;
  const bc = big.getContext('2d')!; bc.scale(ss, ss); draw(bc);
  const src = bc.getImageData(0, 0, big.width, big.height).data;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!, img = c.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((y * ss + (ss >> 1)) * big.width + x * ss + (ss >> 1)) * 4, di = (y * w + x) * 4;
    if (src[si + 3] < 110) continue;
    d[di] = src[si]; d[di + 1] = src[si + 1]; d[di + 2] = src[si + 2]; d[di + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return cv;
}

/** Масштабировать пиксельный холст в целое число раз (для интерфейса). */
export function upscale(src: HTMLCanvasElement, k: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = src.width * k; cv.height = src.height * k;
  const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; c.drawImage(src, 0, 0, cv.width, cv.height);
  return cv;
}

// ------------------------------------------------------------ свет с растровым смешиванием
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);
export interface PLight { x: number; y: number; r: number; a: number; color?: string }
let lightBuf: Float32Array | null = null, colBuf: Float32Array | null = null;
const rgbCache = new Map<string, [number, number, number]>();
const rgb = (hex: string) => {
  let v = rgbCache.get(hex);
  if (!v) { const n = parseInt(hex.slice(1), 16); v = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; rgbCache.set(hex, v); }
  return v;
};

/**
 * Освещение кадра: ambient — уровень темноты вне света (0..1),
 * tint — общий оттенок мира (болезненно-зелёный свет угасшей звезды).
 * Свет квантуется на ступени с дизерингом Байера — пиксельная «зернистость» на переходах.
 */
export function applyLight(c: Ctx, w: number, h: number, lights: PLight[], ambient = 0.6, tint: [number, number, number] = [0.84, 1, 0.78], vignette = 0.35) {
  const n = w * h;
  if (!lightBuf || lightBuf.length !== n) { lightBuf = new Float32Array(n); colBuf = new Float32Array(n * 3); }
  const L = lightBuf, C = colBuf!;
  C.fill(0);
  // фон с виньеткой: к краям кадра темнее
  for (let y = 0; y < h; y++) { const vy = (y / h - 0.5) * 2; for (let x = 0; x < w; x++) { const vx = (x / w - 0.5) * 2; L[y * w + x] = ambient * (1 - vignette * Math.max(0, vx * vx + vy * vy - 0.35)); } }
  for (const l of lights) {
    if (l.a <= 0) continue;
    const r = l.r, x0 = Math.max(0, Math.floor(l.x - r)), x1 = Math.min(w - 1, Math.ceil(l.x + r));
    const y0 = Math.max(0, Math.floor(l.y - r)), y1 = Math.min(h - 1, Math.ceil(l.y + r));
    const col = l.color ? rgb(l.color) : null;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dd = Math.hypot(x - l.x, (y - l.y) * 1.15) / r;
      if (dd >= 1) continue;
      const k = (1 - dd) * (1 - dd) * l.a, i = y * w + x;
      L[i] += k * 0.95;
      if (col) { C[i * 3] += k * col[0]; C[i * 3 + 1] += k * col[1]; C[i * 3 + 2] += k * col[2]; }
    }
  }
  const img = c.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const q = Math.min(1.3, Math.floor(L[i] * 5 + BAYER[(y & 3) * 4 + (x & 3)]) / 5);
    const p = i * 4;
    d[p] = Math.min(255, d[p] * q * tint[0] + C[i * 3] * 46);
    d[p + 1] = Math.min(255, d[p + 1] * q * tint[1] + C[i * 3 + 1] * 40);
    d[p + 2] = Math.min(255, d[p + 2] * q * tint[2] + C[i * 3 + 2] * 26);
  }
  c.putImageData(img, 0, 0);
}
