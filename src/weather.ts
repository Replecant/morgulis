// ============================================================
//  Погода: ясно, пасмурно, туман, дождь, буря. Меняется сама
//  со временем (раз в 18–48 игровых часов). Влияет на
//  освещение и рисует туман, дождь, молнии — на карте, в сценах
//  и в бою. Немного влияет на игру: в дождь и бурю отряд идёт
//  медленнее, в туман хуже видно (места находятся ближе).
//  Звуков нет — только картинка.
// ============================================================
import { G, lampLevel } from './state';
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


export const Weather = {
  kind: 'clear' as WeatherKind,
  until: 10,        // G.clock, когда погода сменится
  locked: false,    // отладка: погода зафиксирована
  flash: 0,         // молния: оставшееся время вспышки (с)
  nextFlash: 4,
  thunderIn: -1,   // через сколько секунд после вспышки ударит гром
  thunderPow: 1,
  omen: false,     // зловещий туман ковена: перекрывает погоду, пока отряд рядом с ковеном
  /** Погода, которую видно сейчас (с учётом зловещего тумана). */
  shown(): WeatherKind { return this.omen ? 'fog' : this.kind; },

  reset() { this.kind = 'clear'; this.until = G.clock + 16 + Math.random() * 12; this.flash = 0; },
  set(k: WeatherKind, lock = false) { this.kind = k; this.locked = lock; this.until = G.clock + 18 + Math.random() * 24; },
  label() { return this.omen ? 'Зловещий туман' : WEATHER_NAMES[this.kind]; },

  /** Каждый кадр: смена погоды по игровому времени и молнии в бурю. */
  update(dt: number) {
    if (!this.locked && G.clock >= this.until) {
      const opts = NEXT[this.kind], sum = opts.reduce((a, o) => a + o[1], 0);
      let r = Math.random() * sum;
      for (const [k, w] of opts) { r -= w; if (r <= 0) { this.kind = k; break; } }
      this.until = G.clock + 18 + Math.random() * 30; // держится от трёх четвертей суток до двух
    }
    if (this.flash > 0) this.flash -= dt;
    if (this.kind === 'storm' && !this.omen) {
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
    if (this.omen) return { ambient: 0.52, tint: [baseTint[0] * 0.78, baseTint[1] * 0.92, baseTint[2] * 0.74], vig: baseVig + 0.22 };
    const k = this.shown(), m = (a: number, b: number, c: number): [number, number, number] => [baseTint[0] * a, baseTint[1] * b, baseTint[2] * c];
    if (k === 'storm') return this.flash > 0 ? { ambient: 1.0, tint: m(0.95, 1, 1.05), vig: baseVig } : { ambient: 0.4, tint: m(0.78, 0.82, 0.86), vig: baseVig + 0.2 };
    if (k === 'rain') return { ambient: 0.6, tint: m(0.76, 0.8, 0.84), vig: baseVig + 0.12 };
    if (k === 'overcast') return { ambient: 0.6, tint: m(0.86, 0.86, 0.88), vig: baseVig + 0.06 };
    if (k === 'fog') return { ambient: 0.6, tint: m(0.9, 0.92, 0.9), vig: baseVig };
    return { ambient: 0.6, tint: baseTint, vig: baseVig };
  },
  /** Скорость отряда на карте. */
  speedK() { const k = this.shown(), l = lampLevel(); return k === 'storm' ? [0.7, 0.8, 0.88][l] : k === 'rain' ? [0.85, 0.92, 1][l] : 1; },
  /** Дальность обзора на карте (находки мест); фонарь отряда помогает держать путь и замечать места. */
  sightK() { const k = this.shown(), l = lampLevel(); return (k === 'fog' ? [0.55, 0.72, 0.88][l] : k === 'storm' ? [0.75, 0.85, 0.95][l] : 1) * [1, 1.1, 1.2][l]; },

  /** Поверх освещённого кадра низкого разрешения: туман, дождь, отблеск молнии. ox/oy — сдвиг камеры (сейчас не нужен: дымка экранная). */
  draw(c: CanvasRenderingContext2D, w: number, h: number, t: number, _ox = 0, _oy = 0) {
    const k = this.shown();
    if (k === 'fog' || k === 'storm' || k === 'rain') { // дымка на весь экран: ровная пелена, к краям гуще, медленно «дышит»
      const fog = k === 'fog', br = Math.sin(t * 0.35) * 0.03;
      const col = this.omen ? '96,116,86' : fog ? '128,138,126' : '62,72,72';
      c.fillStyle = `rgba(${col},${(this.omen ? 0.2 : fog ? 0.24 : 0.1) + br})`; c.fillRect(0, 0, w, h);
      const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.hypot(w, h) * 0.55);
      g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${this.omen ? 0.58 : fog ? 0.5 : 0.22})`);
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      if (this.omen) for (let i = 0; i < 5; i++) { // зловещие клубы медленно плывут поперёк экрана
        const cx = ((i * 137 + t * (4 + i)) % (w + 240)) - 120, cy = h * (0.15 + 0.18 * i) + Math.sin(t * 0.2 + i) * 12, r = 70 + i * 14;
        const cg = c.createRadialGradient(cx, cy, 0, cx, cy, r);
        cg.addColorStop(0, 'rgba(60,78,52,0.26)'); cg.addColorStop(1, 'rgba(60,78,52,0)');
        c.fillStyle = cg; c.fillRect(cx - r, cy - r, r * 2, r * 2);
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
