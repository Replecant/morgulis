// ============================================================
//  Окно карты региона (клавиша M): рамка автора, внутри — весь
//  регион целиком, найденные места и где сейчас отряд.
// ============================================================
import { $ } from './util';
import { withFrame } from './frames';
import { World } from './worldmap';

export const MapWin = {
  open: false,
  onClose: () => {},
  hover: null as { x: number; y: number } | null,
  raf: 0,

  show(onClose: () => void) {
    this.open = true; this.onClose = onClose;
    const cv = $('mapcv') as HTMLCanvasElement;
    cv.onmousemove = (e) => { const r = cv.getBoundingClientRect(); this.hover = { x: ((e.clientX - r.left) * cv.width) / r.width, y: ((e.clientY - r.top) * cv.height) / r.height }; };
    cv.onmouseleave = () => (this.hover = null);
    withFrame('map', $('mapwin'), () => {
      if (!this.open) return;
      $('mapwin').classList.remove('hidden');
      const loop = () => { if (!this.open) return; this.draw(); this.raf = requestAnimationFrame(loop); };
      loop();
    });
  },
  close() { this.open = false; cancelAnimationFrame(this.raf); $('mapwin').classList.add('hidden'); this.onClose(); },

  draw() {
    const cv = $('mapcv') as HTMLCanvasElement, r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d')!;
    const hov = World.drawOverview(c, w, h, performance.now() / 1000, this.hover);
    // подсказка внизу и описание места под мышью
    c.textAlign = 'center';
    c.font = `italic ${Math.round(h * 0.028)}px "Old Standard TT", serif`;
    const line = hov ? hov.desc : 'M или Esc — закрыть';
    c.fillStyle = 'rgba(8,12,7,0.85)'; const tw = c.measureText(line).width + 20; c.fillRect(w / 2 - tw / 2, h - h * 0.065, tw, h * 0.05);
    c.fillStyle = hov ? '#e8dcb0' : '#a8a088'; c.fillText(line, w / 2, h - h * 0.028);
    c.textAlign = 'left';
  },
};
