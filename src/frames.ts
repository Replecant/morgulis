// ============================================================
//  Пиксельные рамки окон: загружаются и раскодируются заранее,
//  при запуске игры, — чтобы окно и рамка появлялись одновременно.
// ============================================================
import menu from './assets/menu-frame.webp';
import inv from './assets/inv-frame.webp';
import sheet from './assets/sheet-frame.webp';
import trade from './assets/trade-frame.webp';
import death from './assets/death.webp';
import occult from './assets/occult-frame.webp';
import map from './assets/map-frame.webp';

export type FrameId = 'menu' | 'inv' | 'sheet' | 'trade' | 'death' | 'occult' | 'map';
const URLS: Record<FrameId, string> = { menu, inv, sheet, trade, death, occult, map };
export const frameUrl = (id: FrameId) => URLS[id];

export const FRAMES = {} as Record<FrameId, HTMLImageElement>;
const ready = {} as Record<FrameId, Promise<void>>;
const done = new Set<FrameId>();
for (const id of Object.keys(URLS) as FrameId[]) {
  const img = new Image();
  img.decoding = 'async';
  img.src = URLS[id];
  FRAMES[id] = img; // держим ссылку — раскодированная картинка остаётся в памяти
  ready[id] = img.decode().catch(() => {}).then(() => { done.add(id); });
}

/** Рамка загружена и раскодирована (или не загрузилась — тогда ждать больше нечего). */
export const frameReady = (id: FrameId) => done.has(id);
export const whenFrameReady = (id: FrameId) => ready[id];

/** Показать окно, когда его рамка готова (обычно — сразу: рамки грузятся при старте). */
export function withFrame(id: FrameId, el: HTMLElement, show: () => void) {
  el.style.backgroundImage = `url("${URLS[id]}")`;
  if (done.has(id)) { show(); return; }
  ready[id].then(show);
}
