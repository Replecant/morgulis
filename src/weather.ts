// ============================================================
//  Погода: ясно, пасмурно, туман, дождь, буря. Меняется сама
//  со временем (каждые несколько игровых часов). Влияет на
//  освещение и рисует туман, дождь, молнии — на карте, в сценах
//  и в бою. Немного влияет на игру: в дождь и бурю отряд идёт
//  медленнее, в туман хуже видно (места находятся ближе).
//  Звуков нет — только картинка.
// ============================================================
import { G } from './state';
import { Sfx } from './sfx';

export type WeatherKind = 'clear' | 'overcast' | 'fog' | 'rain' | 'storm';
export const WEATHER_NAMES: Record<WeatherKind, string> = { clear: 'Ясно', overcast: 'Пасмурно', fog: 'Туман', rain: 'Дождь', storm: 'Буря' };
export const WEATHER_ORDER: WeatherKind[] = ['clear', 'overcast', 'fog', 'rain', 'storm'];

// куда может перейти погода (веса)
const NEXT: Record<WeatherKind, [WeatherKind, number][]> = {
  clear: [['clear', 3], ['overcast', 4], ['fog', 2]],
  overcast: [['clear', 2], ['overcast', 2], ['rain', 3], ['fog', 2]],
  fog: [['fog', 1], ['overcast', 3], ['clear', 2]],
  rain: [['rain', 2], ['overcast', 3], ['storm', 2], ['fog', 1]],
  storm: [['rain', 4], ['overcast', 2], ['storm', 1]],
};

const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((q) => (q + 0.5) / 16);

export const Weather = {
  kind: 'clear' as WeatherKind,
  until: 10,        // G.clock, когда погода сменится
  locked: false,    // отладка: погода зафиксирована
  flash: 0,         // молния: оставшееся время вспышки (с)
  nextFlash: 4,
  thunderIn: -1,   // через сколько секунд после вспышки ударит гром
  thunderPow: 1,

  reset() { this.kind = 'clear'; this.until = G.clock + 4 + Math.random() * 4; this.flash = 0; },
  set(k: WeatherKind, lock = false) { this.kind = k; this.locked = lock; this.until = G.clock + 5 + Math.random() * 6; },
  label() { return WEATHER_NAMES[this.kind]; },

  /** Каждый кадр: смена погоды по игровому времени и молнии в бурю. */
  update(dt: number) {
    if (!this.locked && G.clock >= this.until) {
      const opts = NEXT[this.kind], sum = opts.reduce((a, o) => a + o[1], 0);
      let r = Math.random() * sum;
      for (const [k, w] of opts) { r -= w; if (r <= 0) { this.kind = k; break; } }
      this.until = G.clock + 4 + Math.random() * 8;
    }
    if (this.flash > 0) this.flash -= dt;
    if (this.kind === 'storm') {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.flash = 0.18; this.nextFlash = 4 + Math.random() * 9;
        const far = Math.random();                       // молния то ближе, то дальше: гром позже и тише
        this.thunderIn = 0.2 + far * 1.6; this.thunderPow = 1 - far * 0.6;
      }
    }
    if (this.thunderIn >= 0) { this.thunderIn -= dt; if (this.thunderIn < 0 && G.mode !== 'title' && G.mode !== 'create') Sfx.thunder(this.thunderPow); }
  },

  /** Освещение: уровень темноты, оттенок мира, виньетка. */
  light(baseTint: [number, number, number], baseVig: number): { ambient: number; tint: [number, number, number]; vig: number } {
    const k = this.kind, m = (a: number, b: number, c: number): [number, number, number] => [baseTint[0] * a, baseTint[1] * b, baseTint[2] * c];
    if (k === 'storm') return this.flash > 0 ? { ambient: 1.0, tint: m(0.95, 1, 1.05), vig: baseVig } : { ambient: 0.4, tint: m(0.78, 0.82, 0.86), vig: baseVig + 0.2 };
    if (k === 'rain') return { ambient: 0.6, tint: m(0.76, 0.8, 0.84), vig: baseVig + 0.12 };
    if (k === 'overcast') return { ambient: 0.6, tint: m(0.86, 0.86, 0.88), vig: baseVig + 0.06 };
    if (k === 'fog') return { ambient: 0.6, tint: m(0.9, 0.92, 0.9), vig: baseVig };
    return { ambient: 0.6, tint: baseTint, vig: baseVig };
  },
  /** Скорость отряда на карте. */
  speedK() { return this.kind === 'storm' ? 0.7 : this.kind === 'rain' ? 0.85 : 1; },
  /** Дальность обзора на карте (находки мест). */
  sightK() { return this.kind === 'fog' ? 0.55 : this.kind === 'storm' ? 0.75 : 1; },

  /** Поверх освещённого кадра низкого разрешения: туман, дождь, отблеск молнии. ox/oy — сдвиг камеры (для неподвижного тумана). */
  draw(c: CanvasRenderingContext2D, w: number, h: number, t: number, ox = 0, oy = 0) {
    const k = this.kind;
    if (k === 'fog' || k === 'storm' || k === 'rain') { // клубы тумана растром (в дождь — лёгкая дымка)
      const n = k === 'fog' ? 18 : 6, a0 = k === 'fog' ? 0.5 : 0.22;
      c.fillStyle = k === 'fog' ? '#5e665c' : '#3e4644';
      for (let i = 0; i < n; i++) {
        const R = 60 + (i * 37) % 50;
        const cx = ((i * 173 + t * (3 + (i % 3)) - ox * 0.6) % (w + 2 * R) + w + 2 * R) % (w + 2 * R) - R;
        const cy = ((i * 97 - oy * 0.6) % (h + 2 * R) + h + 2 * R) % (h + 2 * R) - R;
        const ry = R * 0.55;
        for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(h - 1, cy + ry); y++) for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(w - 1, cx + R); x++) {
          const d = Math.hypot((x - cx) / R, (y - cy) / ry);
          if (d < 1 && a0 * (1 - d * d) > BAY[(y & 3) * 4 + (x & 3)]) c.fillRect(x, y, 1, 1);
        }
      }
    }
    if (k === 'rain' || k === 'storm') { // косые струи и брызги
      const n = k === 'storm' ? 220 : 120, sx = k === 'storm' ? 70 : 30, sy = k === 'storm' ? 260 : 200, len = k === 'storm' ? 6 : 4;
      c.fillStyle = k === 'storm' ? '#9aa8a8' : '#8a9898';
      for (let i = 0; i < n; i++) {
        const x0 = (((i * 97.3 + t * sx) % (w + 40)) + w + 40) % (w + 40) - 20, y0 = (((i * 53.7 + t * sy * (0.8 + (i % 5) * 0.1)) % (h + 20)) + h + 20) % (h + 20) - 10;
        for (let s = 0; s < len; s++) c.fillRect(Math.round(x0 + s * sx / sy), Math.round(y0 + s), 1, 1);
      }
      c.fillStyle = '#b8c4c4';
      for (let i = 0; i < n / 6; i++) { const x = (i * 131 + Math.floor(t * 17) * 37) % w, y = (i * 71 + Math.floor(t * 13) * 53) % h; c.fillRect(x, y, 1, 1); c.fillRect(x + 1, y - 1, 1, 1); }
    }
  },
};
