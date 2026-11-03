// ============================================================
//  Окно карты региона (клавиша M): рамка автора, внутри — карта
//  региона: найденные места и где сейчас отряд. Колесо / + − —
//  масштаб, мышью — тащить, стрелки/WASD — двигать, Пробел — к отряду.
// ============================================================
import { $ } from './util';
import { withFrame } from './frames';
import { World } from './worldmap';

export const MapWin = {
  open: false,
  onClose: () => {},
  hover: null as { x: number; y: number } | null,
  raf: 0,
  view: { cx: 0, cy: 0, z: 3 },
  drag: null as { x: number; y: number; cx: number; cy: number } | null,
  keys: new Set<string>(),
  last: 0,

  show(onClose: () => void) {
    this.open = true; this.onClose = onClose;
    const cv = $('mapcv') as HTMLCanvasElement;
    const at = (e: MouseEvent) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) * cv.width) / r.width, y: ((e.clientY - r.top) * cv.height) / r.height }; };
    this.view = { cx: World.party.x, cy: World.party.y, z: this.view.z || 3 }; // открываем на отряде
    cv.onmousemove = (e) => {
      this.hover = at(e);
      if (this.drag) { const k = this.k(); this.view.cx = this.drag.cx - ((this.hover.x - this.drag.x) / k) * 2; this.view.cy = this.drag.cy - ((this.hover.y - this.drag.y) / k) * 2; }
    };
    cv.onmousedown = (e) => { const q = at(e); this.drag = { x: q.x, y: q.y, cx: this.view.cx, cy: this.view.cy }; cv.style.cursor = 'grabbing'; };
    window.onmouseup = () => { this.drag = null; cv.style.cursor = 'grab'; };
    cv.onmouseleave = () => { this.hover = null; };
    cv.onwheel = (e) => { e.preventDefault(); this.zoomAt(at(e), e.deltaY < 0 ? 1.25 : 0.8); };
    cv.style.cursor = 'grab';
    withFrame('map', $('mapwin'), () => {
      if (!this.open) return;
      $('mapwin').classList.remove('hidden');
      const loop = () => { if (!this.open) return; this.draw(); this.raf = requestAnimationFrame(loop); };
      loop();
    });
  },
  /** Пикселей холста на пиксель фона (фон = мир / 2). */
  k() { const cv = $('mapcv') as HTMLCanvasElement; return World.overviewFit(cv.width, cv.height) * this.view.z; },
  /** Масштаб с центром в точке холста p (точка под курсором остаётся на месте). */
  zoomAt(p: { x: number; y: number } | null, f: number) {
    const cv = $('mapcv') as HTMLCanvasElement, q = p ?? { x: cv.width / 2, y: cv.height / 2 };
    const k0 = this.k(), wx = this.view.cx + ((q.x - cv.width / 2) / k0) * 2, wy = this.view.cy + ((q.y - cv.height / 2) / k0) * 2;
    this.view.z = Math.max(1, Math.min(8, this.view.z * f));
    const k1 = this.k(); this.view.cx = wx - ((q.x - cv.width / 2) / k1) * 2; this.view.cy = wy - ((q.y - cv.height / 2) / k1) * 2;
  },
  /** Клавиши, пока окно открыто (из main.ts). */
  key(code: string, down: boolean) {
    if (down && (code === 'Equal' || code === 'NumpadAdd')) this.zoomAt(null, 1.25);
    else if (down && (code === 'Minus' || code === 'NumpadSubtract')) this.zoomAt(null, 0.8);
    else if (down && code === 'Space') { this.view.cx = World.party.x; this.view.cy = World.party.y; }
    else if (down) this.keys.add(code); else this.keys.delete(code);
  },
  close() { this.keys.clear(); this.drag = null; this.open = false; cancelAnimationFrame(this.raf); $('mapwin').classList.add('hidden'); this.onClose(); },

  draw() {
    const cv = $('mapcv') as HTMLCanvasElement, r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d')!, now = performance.now(), dt = Math.min(0.05, (now - (this.last || now)) / 1000); this.last = now;
    // клавиши — плавное движение карты
    const K = this.keys, sp = (900 / this.view.z) * dt;
    if (K.has('ArrowLeft') || K.has('KeyA')) this.view.cx -= sp;
    if (K.has('ArrowRight') || K.has('KeyD')) this.view.cx += sp;
    if (K.has('ArrowUp') || K.has('KeyW')) this.view.cy -= sp;
    if (K.has('ArrowDown') || K.has('KeyS')) this.view.cy += sp;
    World.clampView(this.view, w, h);
    const hov = World.drawOverview(c, w, h, now / 1000, this.hover, this.view);
    // подсказка внизу и описание места под мышью
    c.textAlign = 'center';
    c.font = `italic ${Math.round(h * 0.028)}px "Old Standard TT", serif`;
    const line = hov ? hov.desc : 'Колесо или + − — масштаб · тащить мышью или WASD — двигать · Пробел — к отряду · M / Esc — закрыть';
    c.fillStyle = 'rgba(8,12,7,0.85)'; const tw = c.measureText(line).width + 20; c.fillRect(w / 2 - tw / 2, h - h * 0.065, tw, h * 0.05);
    c.fillStyle = hov ? '#e8dcb0' : '#a8a088'; c.fillText(line, w / 2, h - h * 0.028);
    c.textAlign = 'left';
  },
};
