// ============================================================
//  Регион: серая земля под зелёным светом.
//  Эшфорд (масло), Ричморд (жуки), тракт и железная дорога к форту Олдриджа.
//  Большая карта с камерой; статичные объекты рисуются один раз в спрайты.
// ============================================================
import { G, lampLevel } from './state';
import { bfs, pathTo, DIRS4, lerp, seeded, TAU, Pt, clamp } from './util';
import { flicker } from './gfx';
import { PixelView, applyLight, PLight, T, LW, LH, PS, ppx, pline } from './px';
import { drawSprite, beetleSprite } from './sprites';
import { paintTile, paintRail, paintTrenchEarth, paintTrenchFloor, objSprite, drawPumpjack, drawCampfire } from './pxworld';
import { FOLK, FolkDef } from './folk';
import { Debug } from './debug';
import { Weather } from './weather';
import { tr } from './i18n';

/** Клетка на экране (низкое разрешение ×2). */
export const ET = T * PS;
export const MW = 1172, MH = 72; // восточнее x=103 — форт Олдриджа; с x=188 — сцены земель баронессы; с x=412 — север (земли Собрания)
const VW = LW, VH = LH; // видимая область в пикселях низкого разрешения

type Ground = 'w' | 'g' | 'r' | 'p' | 'o' | 'k' | 'f' | 'm' | 'x' | 'l' | 't' | 'd'; // t — земля над траншеей (стенка хода, не пройти), d — дно траншеи
// w — пустошь, g — деревенская земля, r — дорога, p — загон (грязь), o — пропитанная маслом земля, k — дощатый перрон, f — за стеной форта,
// m — мшистая болотная земля, x — болотная вода (непроходима)

interface Obj {
  kind: string; x: number; y: number; w: number; h: number;
  block: boolean; name?: string; talk?: string; seed: number;
  sprite?: HTMLCanvasElement; sx?: number; sy?: number;     // спрайт и его смещение
  lights?: { x: number; y: number; r: number; color: string; a?: number }[];
  dynamic?: boolean;
  boarded?: boolean;   // заколоченный дом: окна тёмные, забиты досками
}
interface Npc { id: string; name: string; kind: string; x: number; y: number; talk: string; cond?: () => boolean; seed: number; face?: number }
interface Beetle { id: string; x: number; y: number; tx: number; ty: number; pen: { x0: number; y0: number; x1: number; y1: number } | null; dir: number; seed: number; wait: number; talk: string; name: string; scale: number; homeward?: boolean }
/** Фоновый житель: координаты дробные (в клетках), идёт по маршруту, бросает реплики. */
interface Folk {
  def: FolkDef; id: string; name: string; kind: string; talk: string;
  x: number; y: number; i: number; path: Pt[]; wait: number; flip: boolean; step: number;
  bark: { text: string; t: number } | null; barkI: number; nextBark: number; hold: number; seed: number; blockT: number;
}
interface Walker { kind: string; x: number; y: number; rx: number; ry: number; fx: number; fy: number; flip: boolean }

// ------------------------------------------------------------ области (для названий мест)
const AREAS: { name: string; x0: number; y0: number; x1: number; y1: number }[] = [
  { name: 'Разъезд Эшфорд', x0: 6, y0: 55, x1: 37, y1: 63 },
  { name: 'Эшфорд', x0: 5, y0: 31, x1: 37, y1: 57 },
  { name: 'Ричморд', x0: 57, y0: 5, x1: 93, y1: 39 },
  { name: 'Площадь Свободы', x0: 597, y0: 22, x1: 623, y1: 38 },
  { name: 'Дорога к воротам', x0: 604, y0: 40, x1: 616, y1: 66 },
];
/** Локальные сцены — участки большой карты. Уход за край сцены возвращает на глобальную карту. */
export const SCENES: Record<string, { name: string; x0: number; y0: number; x1: number; y1: number; entry: Pt }> = {
  ashford:  { name: 'Эшфорд', x0: 3, y0: 30, x1: 37, y1: 63, entry: { x: 35, y: 43 } },
  richmord: { name: 'Ричморд', x0: 55, y0: 3, x1: 94, y1: 39, entry: { x: 57, y: 20 } },
  fenmor:   { name: 'Фенмор', x0: 1, y0: 1, x1: 36, y1: 28, entry: { x: 19, y: 27 } },
  fortgate: { name: 'Ворота форта', x0: 86, y0: 38, x1: 103, y1: 66, entry: { x: 88, y: 49 } },
  // форт — город в три яруса: внизу трущобы и заводы, выше рынки и мастерские, на самом верху — только по пропуску
  fort1:    { name: 'Нижний город', x0: 100, y0: 28, x1: 147, y1: 70, entry: { x: 103, y: 49 } },
  // земли Леди Харрингтон
  brimmor:   { name: 'Бриммор', x0: 190, y0: 18, x1: 229, y1: 54, entry: { x: 228, y: 47 } },
  hailstone: { name: 'Хейлстоун', x0: 232, y0: 18, x1: 271, y1: 56, entry: { x: 270, y: 48 } },
  mossley:   { name: 'Мосслей', x0: 274, y0: 14, x1: 313, y1: 50, entry: { x: 294, y: 49 } },
  bcamp:     { name: 'Особый лагерь', x0: 316, y0: 18, x1: 357, y1: 60, entry: { x: 356, y: 40 } },
  bfort:     { name: 'Форт Леди Харрингтон', x0: 360, y0: 8, x1: 409, y1: 66, entry: { x: 408, y: 37 } },
  // север: земли бывшего барона Сильвера — край Народного Собрания
  einbow:    { name: 'Эйнбоу', x0: 414, y0: 16, x1: 452, y1: 50, entry: { x: 433, y: 47 } },
  hawley:    { name: 'Хоули', x0: 456, y0: 10, x1: 495, y1: 48, entry: { x: 459, y: 30 } },
  woodham:   { name: 'Вудхэм', x0: 499, y0: 14, x1: 537, y1: 50, entry: { x: 535, y: 32 } },
  tarwell:   { name: 'Тарвелл', x0: 541, y0: 14, x1: 579, y1: 50, entry: { x: 543, y: 32 } },
  // юг: земли барона Винферда
  greywell:    { name: 'Грейвелл', x0: 702, y0: 14, x1: 741, y1: 52, entry: { x: 704, y: 33 } },
  deepfield:   { name: 'Дипфилд', x0: 745, y0: 14, x1: 784, y1: 52, entry: { x: 747, y: 33 } },
  bramley:     { name: 'Брэмли', x0: 788, y0: 14, x1: 827, y1: 52, entry: { x: 825, y: 33 } },
  willowbrook: { name: 'Уиллоубрук', x0: 831, y0: 14, x1: 870, y1: 52, entry: { x: 833, y: 33 } },
  ironcliff:   { name: 'Айронклифф', x0: 874, y0: 14, x1: 913, y1: 52, entry: { x: 893, y: 16 } },
  limbridge:   { name: 'Лимбридж', x0: 917, y0: 14, x1: 956, y1: 52, entry: { x: 919, y: 33 } },
  wf1:         { name: 'Торговый город', x0: 960, y0: 6, x1: 1009, y1: 67, entry: { x: 985, y: 64 } },
  wf2:         { name: 'Верхний ярус', x0: 1013, y0: 6, x1: 1056, y1: 67, entry: { x: 1034, y: 64 } },
  coven:     { name: 'Ковен ведьм', x0: 642, y0: 12, x1: 690, y1: 56, entry: { x: 666, y: 53 } },
  // Траншейное море: места, которые отряд находит сам
  volnitsa:  { name: 'Вольница', x0: 1062, y0: 10, x1: 1114, y1: 62, entry: { x: 1096, y: 60 } },
  post314:   { name: 'Пост 314', x0: 1118, y0: 8, x1: 1168, y1: 64, entry: { x: 1146, y: 62 } },
  svoboda:   { name: 'Форт Свобода', x0: 583, y0: 4, x1: 638, y1: 67, entry: { x: 610, y: 63 } },
  fort2:    { name: 'Средний город', x0: 144, y0: 31, x1: 184, y1: 67, entry: { x: 147, y: 49 } },
};
// Вольница: центр Круга, воронки с грибами и жилые ямы — на внешнем кольце
const VOL_C = { x: 1088, y: 35 };
const onRingAt = (deg: number, d: number): [number, number] => [Math.round(VOL_C.x + Math.cos(deg * Math.PI / 180) * d), Math.round(VOL_C.y + Math.sin(deg * Math.PI / 180) * d)];
const VOL_CRATERS = [-145, -35, 120].map((a) => onRingAt(a, 23));
const VOL_PITS = [-90, 10, 165].map((a) => onRingAt(a, 22));
const PENS = [{ x0: 62, y0: 9, x1: 73, y1: 17, gx: 67 }, { x0: 77, y0: 10, x1: 88, y1: 18, gx: 82 }, { x0: 296, y0: 18, x1: 307, y1: 27, gx: 301 }, { x0: 461, y0: 13, x1: 472, y1: 21, gx: 466 }, { x0: 477, y0: 13, x1: 488, y1: 21, gx: 482 }, { x0: 790, y0: 15, x1: 803, y1: 24, gx: 796 }, { x0: 808, y0: 15, x1: 823, y1: 24, gx: 815 }]; // ещё два — выпас в Брэмли // третий — загон в Мосслее, четвёртый и пятый — в Хоули

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((q) => (q + 0.5) / 16);
/** Полупрозрачный клуб растром: пиксели либо есть, либо нет. */
function puff(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string, a: number) {
  c.fillStyle = col;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x - cx, y - cy) / r;
    if (d < 1 && a * (1 - d * d) > BAYER4[(y & 3) * 4 + (x & 3)]) c.fillRect(x, y, 1, 1);
  }
}
/** Дым из трубы: тёмные клубы поднимаются и расплываются. */
function drawSmoke(c: CanvasRenderingContext2D, x: number, y: number, t: number) {
  for (let k = 0; k < 5; k++) {
    const ph = (t * 0.22 + k / 5) % 1;
    puff(c, x + ph * 18 + Math.sin(t + k) * 2, y - ph * 46, 3 + ph * 9, k % 2 ? '#2e302a' : '#3a3c34', 0.85 * (1 - ph));
  }
}
/** Пар из решётки: светлые клочья, быстро тают. */
function drawSteam(c: CanvasRenderingContext2D, x: number, y: number, t: number) {
  for (let k = 0; k < 3; k++) {
    const ph = (t * 0.5 + k / 3) % 1;
    puff(c, x + Math.sin(t * 2 + k) * 3, y - ph * 22, 2 + ph * 5, '#a8aca0', 0.6 * (1 - ph));
  }
}

export const Explore = {
  ground: [] as Ground[][],
  rail: [] as number[][],          // 0 — нет, 1 — рельсы
  switches: [] as { x0: number; y0: number; x1: number; y1: number }[], // косые съезды между путями (от левого края клетки x0 до левого края x1)
  block: [] as boolean[][],
  objs: [] as Obj[],
  npcs: [] as Npc[],
  beetles: [] as Beetle[],
  folk: [] as Folk[],
  chunks: new Map<number, HTMLCanvasElement>(),
  view: null as PixelView | null,
  player: null as unknown as Walker,
  followers: [] as Walker[],
  trail: [] as Pt[],
  moveK: 1,
  path: [] as Pt[],
  pending: null as Obj | Npc | Beetle | Folk | null,
  exitDir: null as [number, number] | null, exitTarget: null as Pt | null, exitTries: 0, // после пути — шаг за край сцены (выход на карту)
  onInteract: (_talk: string) => {},
  onLocation: (_name: string) => {},
  onExit: (_scene: string) => {},
  scene: 'ashford',
  lastInteract: 0,
  hoverW: null as Pt | null,
  cam: { x: 0, y: 0 },
  banner: null as { text: string; t: number } | null,

  // ========================================================== построение мира
  init() {
    const r = seeded(77);
    this.ground = []; this.rail = []; this.block = [];
    for (let y = 0; y < MH; y++) { this.ground.push(new Array(MW).fill('w')); this.rail.push(new Array(MW).fill(0)); this.block.push(new Array(MW).fill(false)); }
    this.objs = []; this.npcs = []; this.beetles = []; this.chunks.clear();
    const fill = (g: Ground, x0: number, y0: number, w: number, h: number) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (this.inMap(x, y)) this.ground[y][x] = g; };
    const blob = (g: Ground, cx: number, cy: number, rr: number) => { for (let y = cy - rr; y <= cy + rr; y++) for (let x = cx - rr; x <= cx + rr; x++) if (this.inMap(x, y) && Math.hypot(x - cx, y - cy) <= rr + r() * 0.8) this.ground[y][x] = g; };

    // деревни и загоны
    fill('g', 5, 31, 33, 26);
    fill('g', 57, 5, 36, 34); // Ричморд с нижней улицей
    // Фенмор: болотистая низина с грибными грядками
    fill('m', 2, 2, 34, 26);
    for (const [x, y, rr] of [[3, 7, 1], [32, 7, 2], [32, 23, 2], [15, 25, 1], [26, 27, 1]]) blob('x', x, y, rr);
    for (const p of PENS) fill('p', p.x0 + 1, p.y0 + 1, p.x1 - p.x0 - 1, p.y1 - p.y0 - 1);
    // форт: всё восточнее стены — недоступно, кроме улиц Нижнего и Среднего города
    fill('f', 103, 0, 412 - 103, MH); // до x=412 — дальше сцены севера со своей землёй
    fill('o', 103, 30, 42, 39);   // Нижний город: грязь, масло, сажа
    fill('p', 147, 33, 34, 33);   // Средний город: утоптанная земля
    fill('k', 155, 45, 17, 11);   // рыночная площадь — дощатый настил
    // ---------------- земли Леди Харрингтон
    fill('w', 190, 18, 40, 37); fill('l', 190, 18, 40, 12);                        // Бриммор: озеро на севере
    for (const x of [197, 210, 221]) fill('k', x, 22, 2, 8);                        // мостки в воду
    fill('g', 190, 30, 40, 3);
    fill('w', 232, 18, 40, 39); for (let i = 0; i < 9; i++) blob('o', 236 + Math.floor(r() * 32), 24 + Math.floor(r() * 28), 2); // Хейлстоун: изрытая земля
    fill('m', 274, 14, 40, 37);                                                     // Мосслей: влажная низина
    fill('o', 316, 18, 42, 43);                                                     // Особый лагерь
    fill('p', 360, 8, 50, 59); fill('k', 384, 28, 12, 18);                          // форт Леди Харрингтон: плац
    // ---------------- север
    fill('g', 415, 17, 37, 33); for (let i = 0; i < 16; i++) blob('o', 418 + Math.floor(r() * 31), 20 + Math.floor(r() * 27), 1 + Math.floor(r() * 2)); // Эйнбоу: пепелище
    fill('g', 457, 11, 38, 37);                                                     // Хоули
    fill('m', 500, 15, 37, 35); fill('g', 507, 22, 24, 21);                         // Вудхэм: поляна в лесу
    fill('o', 542, 15, 37, 35);                                                     // Тарвелл: промасленная земля
    // ---------------- юг: земли Винферда
    fill('o', 703, 15, 38, 37);                                     // Грейвелл: промасленная земля
    fill('o', 746, 15, 38, 37);                                     // Дипфилд
    fill('g', 789, 15, 38, 37);                                     // Брэмли
    fill('g', 832, 15, 38, 37); fill('l', 848, 14, 4, 39);         // Уиллоубрук: река посередине
    fill('w', 875, 15, 38, 37); fill('f', 874, 49, 40, 4);         // Айронклифф: у подножия гор
    fill('p', 918, 15, 38, 37);                                     // Лимбридж: истоптанная грязь
    fill('f', 960, 6, 50, 62); fill('g', 961, 8, 48, 59); fill('k', 976, 40, 19, 3); fill('g', 982, 67, 6, 1); // проём главных ворот // форт Винферда, ярус 1: улицы и рыночный настил
    fill('f', 1013, 6, 44, 62); fill('g', 1014, 16, 42, 51); fill('p', 1014, 7, 42, 8); // ярус 2; за стеной — двор замка (туда не пройти)
    fill('m', 643, 13, 47, 43); fill('p', 652, 21, 29, 26);                         // ковен: болотистый лес, вытоптанная поляна
    for (const [x, y, rr] of [[648, 46, 2], [684, 22, 2], [646, 26, 1], [686, 44, 1], [656, 51, 1]]) blob('x', x, y, rr);
    fill('f', 583, 4, 56, 64); fill('p', 585, 6, 52, 61); fill('k', 599, 24, 23, 13); fill('p', 606, 67, 8, 1); // форт Свобода: улицы, площадь, проём ворот
    // ---------------- Траншейное море: земля изрыта, ходят только по дну траншей
    const ring = (g: Ground, cx: number, cy: number, r0: number, r1: number) => { const R1 = Math.ceil(r1) + 1; for (let y = cy - R1; y <= cy + R1; y++) for (let x = cx - R1; x <= cx + R1; x++) { const d = Math.hypot(x - cx, y - cy); if (this.inMap(x, y) && d >= r0 && d <= r1) this.ground[y][x] = g; } };
    const ditch = (pts: number[][]) => { // ход шириной в две клетки по ломаной из прямых отрезков
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        for (let y = Math.min(y0, y1); y <= Math.max(y0, y1) + 1; y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1) + 1; x++) if (this.inMap(x, y) && this.ground[y][x] === 't') this.ground[y][x] = 'd';
      }
    };
    // Вольница: два кольца траншей вокруг выдолбленной площадки, лучи-ходы между ними, воронки с грибами, жилые ямы
    fill('t', 1062, 10, 53, 53);
    { const cx = 1088, cy = 35;
      for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) if (Math.hypot(x - cx, y - cy) <= 5.6) this.ground[y][x] = 'p'; // Круг
      ring('d', cx, cy, 10.4, 12.3); ring('d', cx, cy, 19.2, 21.1);
      ditch([[cx - 1, cy - 11], [cx - 1, cy - 5]]); ditch([[cx - 1, cy + 5], [cx - 1, cy + 11]]);        // к Кругу — с севера и юга
      ditch([[cx + 12, cy - 1], [cx + 19, cy - 1]]); ditch([[cx - 20, cy - 1], [cx - 12, cy - 1]]);      // между кольцами — с востока и запада
      ditch([[cx + 7, cy + 18], [cx + 7, 62]]);                                                           // выход на юг, к краю
      for (const [x, y] of VOL_CRATERS) for (let yy = y - 4; yy <= y + 4; yy++) for (let xx = x - 4; xx <= x + 4; xx++) if (Math.hypot(xx - x, yy - y) <= 3.1) this.ground[yy][xx] = 'm'; // воронки
      for (const [x, y] of VOL_PITS) for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 3; xx <= x + 3; xx++) if (Math.abs(xx - x) + Math.abs(yy - y) * 1.3 <= 3.6) this.ground[yy][xx] = 'p'; // жилые ямы
    }
    // Пост 314: двор, вырытый в земле и обнесённый мешками, бетонные бункеры по краям; к краю ведёт ход зигзагом
    fill('t', 1118, 8, 51, 57);
    fill('o', 1123, 13, 41, 38);
    ditch([[1142, 50], [1142, 54], [1136, 54], [1136, 58], [1146, 58], [1146, 63]]);

    // дороги
    const road = (pts: number[][], wdt = 1) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
        for (let k = 0; k <= n; k++) {
          const x = Math.round(lerp(x0, x1, k / n)), y = Math.round(lerp(y0, y1, k / n));
          for (let dy = 0; dy <= wdt; dy++) for (let dx = 0; dx <= wdt; dx++) if (this.inMap(x + dx, y + dy) && this.ground[y + dy][x + dx] !== 'f') this.ground[y + dy][x + dx] = 'r';
        }
      }
    };
    road([[0, 43], [22, 43], [40, 44], [56, 45], [72, 47], [88, 50], [101, 50]]);
    road([[54, 45], [54, 30], [55, 22], [57, 20], [92, 20]]);
    road([[54, 32], [92, 32]]); // нижняя улица Ричморда
    road([[22, 43], [22, 57]]);
    road([[22, 43], [22, 30]]);
    road([[19, 28], [19, 14]]);
    // улицы форта
    road([[103, 49], [146, 49]]); road([[114, 30], [114, 68]]); road([[127, 30], [127, 68]]); road([[138, 51], [138, 68]]);
    road([[147, 49], [182, 49]]); road([[163, 33], [163, 65]]);
    // земли Леди Харрингтон
    road([[229, 47], [190, 47]]); road([[271, 48], [233, 48]]); road([[294, 50], [294, 30], [281, 30]]);
    road([[357, 40], [321, 40]]); road([[337, 26], [337, 58]]); // от ворот через лагерь; поперёк — от цехов к баракам
    road([[409, 37], [362, 37]]); road([[390, 9], [390, 65]]);
    // север
    road([[433, 50], [433, 33], [416, 33]]); road([[433, 33], [450, 30]]);
    road([[456, 30], [494, 30]]); road([[475, 30], [475, 46]]);
    road([[537, 32], [520, 32], [512, 26]]);
    road([[541, 32], [578, 32]]); road([[560, 32], [560, 18]]);
    road([[666, 56], [666, 39]]); // тропа к кругу
    road([[702, 33], [741, 33]]); road([[721, 33], [721, 28]]);
    road([[745, 33], [784, 33]]);
    road([[788, 33], [827, 33]]);
    road([[831, 33], [870, 33]]); fill('k', 848, 33, 4, 2); // мост через реку
    for (const [x, y] of [[848, 21], [848, 44]]) fill('k', x, y, 2, 2);                       // мостки
    road([[893, 14], [893, 44]]); road([[876, 40], [911, 40]]);
    road([[917, 33], [956, 33]]); road([[946, 33], [946, 22]]);
    road([[984, 67], [984, 9]]); road([[962, 38], [1007, 38]]); road([[962, 22], [1007, 22]]);
    road([[1033, 67], [1033, 17]]); road([[1015, 40], [1054, 40]]);
    road([[609, 68], [609, 38]]); road([[586, 38], [636, 38]]); road([[609, 23], [609, 14]]); road([[586, 14], [636, 14]]);

    // масляные пятна вокруг качалок
    const PUMPS: [number, number][] = [[9, 34], [32, 34], [18, 48], [33, 52], [11, 44]];
    for (const [x, y] of PUMPS) blob('o', x + 1, y + 1, 2);
    for (let i = 0; i < 14; i++) blob('o', Math.floor(r() * 100), Math.floor(r() * MH), 0);

    // железная дорога: главный путь и запасной у разъезда
    for (let x = 0; x <= 102; x++) { this.rail[61][x] = 1; this.rail[62][x] = 1; } // двухпутная линия
    for (let x = 12; x <= 32; x++) this.rail[59][x] = 1;
    for (let x = 317; x <= 357; x++) this.rail[24][x] = 1;   // ветка к цехам особого лагеря
    for (let x = 380; x <= 409; x++) { this.rail[61][x] = 1; this.rail[62][x] = 1; } // конечная в форте Леди Харрингтон, два пути
    for (let y = 22; y <= 40; y++) this.rail[y][250] = 1;    // узкоколейка от шахты Хейлстоуна
    // стрелки разъезда: косые съезды с главного пути (ряд 61) на запасной (ряд 59) и обратно
    this.switches = [{ x0: 9, y0: 61, x1: 12, y1: 59 }, { x0: 33, y0: 59, x1: 36, y1: 61 }];
    fill('k', 11, 58, 23, 1); // перрон

    // ---------------- объекты
    let seed = 1;
    const add = (o: Omit<Obj, 'seed'>) => { const ob = { ...o, seed: seed++ } as Obj; this.objs.push(ob); return ob; };
    const B = (kind: string, x: number, y: number, w: number, h: number, extra: Partial<Obj> = {}) => add({ kind, x, y, w, h, block: true, ...extra });

    // Эшфорд — север улицы
    for (const [x, y] of PUMPS) B('pump', x, y, 2, 2, { dynamic: true, name: 'Нефтяная качалка', talk: 'pumpjack' });
    B('house', 13, 35, 4, 3, { name: 'Жилой дом', talk: 'house_ashford' });
    B('tank', 18, 34, 3, 3, { name: 'Резервуар с маслом', talk: 'tank' });
    B('pumphouse', 25, 37, 5, 4, { name: 'Насосная', talk: 'pumphouse' });
    B('ruin', 7, 39, 4, 3, { name: 'Заброшенный дом', talk: 'ruin1' });
    B('ruin', 30, 39, 4, 3, { name: 'Заброшенный дом', talk: 'ruin2' });
    // Эшфорд — юг улицы
    B('house', 7, 47, 4, 3, { name: 'Жилой дом', talk: 'house_ashford' });
    B('ruin', 13, 47, 4, 3, { name: 'Заброшенный дом', talk: 'ruin3' });
    B('house', 25, 47, 4, 3, { name: 'Дом Нелл', talk: 'house_nell' });
    B('ruin', 29, 47, 3, 3, { name: 'Заброшенный дом', talk: 'ruin4' });
    B('ruin', 7, 52, 4, 3, { name: 'Заколоченный дом', talk: 'ruin5' });
    B('tank', 13, 52, 3, 3, { name: 'Пустой резервуар', talk: 'tank_empty' });
    B('ruin', 26, 52, 5, 3, { name: 'Старая насосная', talk: 'oldpump', ruinKind: 'pump' } as Partial<Obj>);
    // разъезд
    B('station', 15, 55, 5, 3, { name: 'Будка смотрителя', talk: 'station' });
    B('watertower', 30, 55, 2, 2, { name: 'Водонапорная башня', talk: 'watertower' });
    for (const x of [13, 17, 21]) B('wagon', x, 59, 4, 1, { name: 'Цистерна', talk: 'wagon' });
    B('sign', 24, 57, 1, 1, { name: 'Табличка разъезда', talk: 'station_sign' });
    // застава барона на западном въезде — дорога с поля сражений и от баронессы
    B('tower', 3, 38, 3, 3, { name: 'Сторожевая вышка', talk: 'ashtower' });
    B('tower', 3, 46, 3, 3, { name: 'Сторожевая вышка', talk: 'ashtower' });
    B('tower', 35, 46, 3, 3, { name: 'Сторожевая вышка', talk: 'ashtower' });
    for (const [x, y] of [[6, 41], [6, 46], [5, 41], [6, 47]]) B('sandbags', x, y, 1, 1, { name: 'Мешки с песком', talk: 'sandbags' });
    B('lamp', 8, 45, 1, 1, { name: 'Фонарь заставы', talk: 'lamp' });
    // фонари Эшфорда
    for (const [x, y] of [[12, 42], [20, 42], [28, 45], [21, 50], [24, 56], [10, 56], [34, 46]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    for (const [x, y] of [[21, 39], [14, 45], [24, 51], [17, 52], [34, 49]]) B('barrel', x, y, 1, 1);

    // Ричморд
    for (const p of PENS) {
      for (let x = p.x0; x <= p.x1; x++) for (const y of [p.y0, p.y1]) if (!(y === p.y1 && (x === p.gx || x === p.gx + 1))) B('fence', x, y, 1, 1);
      for (let y = p.y0 + 1; y < p.y1; y++) for (const x of [p.x0, p.x1]) B('fence', x, y, 1, 1);
    }
    B('farm', 58, 23, 4, 3, { name: 'Дом погонщиков', talk: 'house_richmord' });
    B('barn', 63, 23, 8, 3, { name: 'Жучиный сарай', talk: 'barn' });
    B('slaughter', 73, 23, 5, 3, { name: 'Бойня', talk: 'slaughter' });
    B('barn', 79, 23, 8, 3, { name: 'Жучиный сарай', talk: 'barn' });
    B('farm', 88, 23, 4, 3, { name: 'Дом Пенни', talk: 'house_richmord' });
    for (const [x, y] of [[59, 11], [59, 15], [75, 8], [90, 13]]) B('feed', x, y, 2, 2, { name: 'Куча корма', talk: 'feed' });
    B('chitin', 78, 27, 2, 1, { name: 'Пустые панцири', talk: 'chitinpile' });
    for (const [x, y] of [[62, 22], [76, 22], [88, 22]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    // нижняя улица: жилые дома вперемешку с брошенными — многие уехали в форт
    B('house', 59, 27, 4, 3, { name: 'Дом жуковода', talk: 'house_richmord2' });
    B('house', 66, 27, 4, 3, { name: 'Заколоченный дом', talk: 'rich_empty', boarded: true });
    B('farm', 82, 27, 4, 3, { name: 'Дом скорняка', talk: 'house_tanner' });
    B('ruin', 88, 27, 4, 3, { name: 'Обгорелый дом', talk: 'rich_ruin' });
    B('farm', 57, 34, 4, 3, { name: 'Дом кормовщиков', talk: 'house_richmord2' });
    B('house', 63, 34, 4, 3, { name: 'Пустой дом', talk: 'rich_empty2', boarded: true });
    B('ruin', 69, 34, 4, 3, { name: 'Развалины', talk: 'rich_ruin2' });
    B('farm', 75, 34, 4, 3, { name: 'Дом старика Тома', talk: 'house_tom' });
    B('house', 81, 34, 4, 3, { name: 'Заколоченный дом', talk: 'rich_empty', boarded: true });
    B('house', 87, 34, 5, 3, { name: 'Бывший трактир', talk: 'rich_inn', boarded: true });
    for (const [x, y] of [[63, 31], [74, 31], [86, 31]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    for (const [x, y] of [[64, 29], [80, 37], [92, 31]]) B('barrel', x, y, 1, 1);

    // Фенмор
    B('adit', 25, 2, 6, 3, { name: 'Грибная штольня', talk: 'adit' });
    B('cellar', 5, 3, 3, 2, { name: 'Грибной погреб', talk: 'cellar' });
    B('cellar', 12, 3, 3, 2, { name: 'Грибной погреб', talk: 'cellar' });
    B('hut', 8, 20, 4, 3, { name: 'Дом Агнес', talk: 'hut_agnes' });
    B('hut', 23, 20, 4, 3, { name: 'Хижина сборщиков', talk: 'hut' });
    B('hut', 13, 7, 4, 3, { name: 'Хижина', talk: 'hut' });
    B('hut', 22, 9, 4, 3, { name: 'Сушильня', talk: 'drying' });
    for (const y of [11, 13, 15, 17]) for (const x of [3, 8]) B('shroombed', x, y, 4, 1, { name: 'Грибная грядка', talk: 'shroombed' });
    for (const y of [13, 15, 17]) for (const x of [24, 29]) B('shroombed', x, y, 4, 1, { name: 'Грибная грядка', talk: 'shroombed' });
    for (const [x, y] of [[16, 13], [16, 17]]) B('rack', x, y, 2, 1, { name: 'Сушилка', talk: 'rack' });
    for (const [x, y] of [[18, 11], [22, 13], [11, 19], [28, 11], [6, 9], [26, 25], [13, 24], [33, 18]]) B('bigshroom', x, y, 1, 1, { name: 'Светящийся гриб', talk: 'bigshroom' });
    B('feed', 29, 23, 2, 2, { name: 'Грибной компост', talk: 'compost' });
    B('hut', 2, 22, 4, 3, { name: 'Хижина шептуньи', talk: 'wise_fen_hut' });
    B('rack', 6, 24, 2, 1, { name: 'Вешала с травами', talk: 'herbrack' });
    // ворота форта
    for (let y = 0; y < MH; y++) if (y < 48 || y > 52) if (y < 60 || y > 62) B('wall', 101, y, 2, 1);
    B('gate', 101, 48, 2, 5, { name: 'Ворота форта', talk: 'fortgate' });
    B('railgate', 101, 60, 2, 3, { name: 'Железнодорожные ворота', talk: 'railgate' });
    for (const y of [8, 20, 32, 44, 54, 66]) B('tower', 100, y, 3, 3, { name: 'Башня форта', talk: 'tower' });
    for (const [x, y] of [[98, 47], [98, 53], [98, 59], [98, 63]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });

    // ---------------- Нижний город: трущобы и заводы
    const taken = (x: number, y: number, w: number, h: number) => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const g = this.ground[yy]?.[xx];
        if (!g || g === 'r' || g === 'f' || g === 't') return true;
      }
      return this.objs.some((o) => x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y);
    };
    for (let x = 103; x < 146; x += 2) { B('wall', x, 29, 2, 1); B('wall', x, 69, 2, 1); }
    for (let y = 30; y < 69; y++) if (y < 47 || y > 51) B('wall', 145, y, 2, 1);
    B('gate', 145, 47, 2, 5, { name: 'Ворота Среднего города', talk: 'mid_gate' });
    B('factory', 104, 31, 8, 4, { name: 'Литейный цех', talk: 'factory' });
    B('factory', 117, 31, 9, 4, { name: 'Механический завод', talk: 'factory' });
    B('factory', 130, 31, 7, 4, { name: 'Котельная', talk: 'factory' });
    B('factory', 116, 64, 10, 4, { name: 'Заводской цех', talk: 'factory' });
    B('workshop', 141, 63, 3, 2, { name: 'Подпольная мастерская', talk: 'underworkshop' });
    for (const [x, y] of [[110, 47], [124, 52], [135, 47], [106, 52], [141, 56]]) B('campfire', x, y, 1, 1, { dynamic: true, name: 'Уличный костёр', talk: 'slumfire' });
    for (const [x, y] of [[108, 48], [131, 51]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    // у цехов: пар из решёток, уголь, ящики, тележки, доска объявлений о найме
    for (const x of [106, 110, 119, 124, 135]) add({ kind: 'vent', x, y: 35, w: 1, h: 1, block: false, dynamic: true, name: 'Решётка паропровода' }); // решётка в земле — по ней ходят
    B('coalheap', 129, 35, 2, 1, { name: 'Куча угля', talk: 'coalheap' });
    B('coalheap', 130, 65, 2, 1, { name: 'Куча угля', talk: 'coalheap' });
    B('crates', 136, 35, 1, 1, { name: 'Ящики', talk: 'crates' }); B('crates', 116, 35, 1, 1, { name: 'Ящики', talk: 'crates' });
    B('noticeboard', 112, 48, 2, 1, { name: 'Доска объявлений', talk: 'notice_low' });
    B('handcart', 117, 51, 2, 1, { name: 'Тележка', talk: 'handcart' });
    B('standpipe', 129, 48, 1, 1, { name: 'Водоразборная колонка', talk: 'standpipe' });
    for (const row of [36, 39, 42, 45, 52, 55, 58, 61]) {
      for (let x = 104; x < 144;) {
        const w = 2 + Math.floor(r() * 2);
        if (!taken(x, row, w, 2) && x + w <= 144) {
          // часть мест между лачугами — дворики: бельё, уголь, ящики, мешки
          const k = r();
          const open = !taken(x, row + 2, w, 2); // за дворик не встанет постройка, закрывающая его
          if (k < 0.09 && open) B('laundry', x, row + 1, w, 1, { name: 'Бельевая верёвка', talk: 'laundry' });
          else if (k < 0.14 && open) B('crates', x, row + 1, 1, 1, { name: 'Ящики', talk: 'crates' });
          else if (k < 0.18 && open) B('sacks', x, row + 1, 1, 1, { name: 'Мешки', talk: 'sacks' });
          else if (!taken(x + Math.floor(w / 2), row + 2, 1, 1)) B('shack', x, row, w, 2, { name: 'Лачуга', talk: 'shack' });
        }
        x += w + (r() < 0.45 ? 1 : 0);
      }
    }

    // ---------------- Средний город: рынки, мастерские, тесные дома
    for (let x = 147; x < 181; x += 2) { B('wall', x, 32, 2, 1); B('wall', x, 66, 2, 1); }
    for (let y = 33; y < 66; y++) if (y < 47 || y > 51) B('wall', 181, y, 2, 1);
    B('gate', 181, 47, 2, 5, { name: 'Ворота Верхнего города', talk: 'upper_gate' });
    for (const x of [156, 159, 166, 169]) for (const y of [46, 53]) B('stall', x, y, 2, 1, { name: 'Рыночный лоток', talk: 'stall' });
    B('workshop', 148, 45, 3, 2, { name: 'Оружейная мастерская', talk: 'workshop' });
    B('workshop', 175, 45, 3, 2, { name: 'Мастерская механика', talk: 'workshop' });
    B('workshop', 148, 52, 3, 2, { name: 'Кузня', talk: 'workshop' });
    B('workshop', 175, 52, 3, 2, { name: 'Скорняжная мастерская', talk: 'workshop' });
    for (const [x, y] of [[153, 48], [161, 51], [170, 48], [178, 51]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    B('clinic', 166, 57, 5, 3, { name: 'Клиника протезирования', talk: 'clinic' });
    // рынок: товар у лотков, тележки, колонка, доска объявлений
    for (const [x, y] of [[155, 47], [158, 54], [168, 47], [171, 54]]) B('sacks', x, y, 1, 1, { name: 'Мешки с товаром', talk: 'sacks' });
    for (const [x, y] of [[161, 46], [165, 53]]) B('crates', x, y, 1, 1, { name: 'Ящики с товаром', talk: 'crates' });
    B('handcart', 153, 52, 2, 1, { name: 'Тележка торговца', talk: 'handcart' });
    B('handcart', 172, 46, 2, 1, { name: 'Тележка торговца', talk: 'handcart' });
    B('standpipe', 160, 55, 1, 1, { name: 'Водоразборная колонка', talk: 'standpipe' });
    B('noticeboard', 152, 44, 2, 1, { name: 'Доска объявлений', talk: 'notice_mid' });
    for (const row of [34, 38, 42, 57, 61]) {
      for (let x = 147; x < 181;) {
        const w = 3;
        if (!taken(x, row, w, 3) && !taken(x + 1, row + 3, 1, 1) && x + w <= 181) {
          if (r() < 0.1) B('laundry', x, row + 2, w, 1, { name: 'Бельевая верёвка', talk: 'laundry' }); // двор с бельём
          else B('tenement', x, row, w, 3, { name: 'Дом', talk: 'tenement' });
        }
        x += w + (r() < 0.25 ? 1 : 0);
      }
    }

    // ======================= БРИММОР — рыбацкая деревня на озере
    for (const [x, y] of [[199, 26], [212, 24], [223, 27], [208, 27]]) B('boat', x, y, 2, 1, { name: 'Лодка', talk: 'boat' });
    B('house', 192, 34, 4, 3, { name: 'Дом старосты', talk: 'house_brimmor' });
    B('hut', 200, 35, 4, 3, { name: 'Коптильня', talk: 'smokehouse' });
    B('house', 207, 34, 4, 3, { name: 'Рыбацкий дом', talk: 'house_fisher' });
    B('hut', 215, 35, 4, 3, { name: 'Хижина', talk: 'house_fisher' });
    B('house', 222, 34, 4, 3, { name: 'Пустой дом', talk: 'empty_fisher', boarded: true });
    B('house', 193, 50, 4, 3, { name: 'Рыбацкий дом', talk: 'house_fisher' });
    B('hut', 207, 50, 4, 3, { name: 'Хижина', talk: 'house_fisher' });
    B('house', 216, 50, 4, 3, { name: 'Казённая скупка рыбы', talk: 'fishbuy' });
    for (const [x, y] of [[194, 40], [204, 41], [219, 41]]) B('nets', x, y, 3, 1, { name: 'Сети', talk: 'nets' });
    for (const [x, y] of [[198, 44], [211, 44]]) B('rack', x, y, 2, 1, { name: 'Вешала с рыбой', talk: 'fishrack' });
    for (const [x, y] of [[202, 32], [217, 32], [226, 45]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    B('poster', 225, 49, 1, 1, { name: 'Плакат', talk: 'poster' });
    for (const [x, y] of [[214, 46], [196, 46]]) B('barrel', x, y, 1, 1, { name: 'Бочка с солёной рыбой', talk: 'fishbarrel' });

    // ======================= ХЕЙЛСТОУН — старатели: руда и металлолом
    B('adit', 247, 19, 7, 3, { name: 'Шахта', talk: 'mine' });
    for (const y of [27, 33]) B('orecart', 250, y, 1, 1, { name: 'Вагонетка с рудой', talk: 'orecart' });
    for (const [x, y] of [[236, 22], [262, 23], [238, 36], [264, 38], [256, 52], [236, 50]]) B('scrapheap', x, y, 3, 2, { name: 'Груда металлолома', talk: 'scrapheap' });
    for (const [x, y] of [[257, 30], [242, 30]]) B('coalheap', x, y, 2, 1, { name: 'Отвал руды', talk: 'orepile' });
    B('workshop', 256, 42, 4, 2, { name: 'Сортировочная', talk: 'sorting' });
    for (const [x, y] of [[235, 43], [240, 44], [244, 52], [262, 50], [266, 44]]) B('shack', x, y, 3, 2, { name: 'Лачуга старателя', talk: 'shack_prosp' });
    for (const [x, y] of [[246, 46], [258, 35]]) B('campfire', x, y, 1, 1, { dynamic: true, name: 'Костёр', talk: 'slumfire' });
    B('poster', 268, 46, 1, 1, { name: 'Плакат', talk: 'poster' });
    for (const [x, y] of [[253, 47], [244, 39]]) B('crates', x, y, 1, 1, { name: 'Ящики', talk: 'crates' });

    // ======================= МОССЛЕЙ — грибники и пастухи
    for (const y of [20, 22, 24, 26]) for (const x of [277, 282]) B('shroombed', x, y, 4, 1, { name: 'Грибная грядка', talk: 'shroombed' });
    for (const [x, y] of [[280, 29], [287, 19], [290, 33], [310, 31]]) B('bigshroom', x, y, 1, 1, { name: 'Светящийся гриб', talk: 'bigshroom' });
    B('hut', 277, 34, 4, 3, { name: 'Дом старшей', talk: 'house_mossley' });
    B('hut', 284, 39, 4, 3, { name: 'Хижина грибников', talk: 'hut' });
    B('hut', 299, 38, 4, 3, { name: 'Дом пастухов', talk: 'house_herders' });
    B('hut', 306, 43, 4, 3, { name: 'Хижина', talk: 'hut' });
    B('barn', 300, 30, 7, 3, { name: 'Жучиный навес', talk: 'barn' });
    B('rack', 288, 25, 2, 1, { name: 'Сушилка', talk: 'rack' }); B('feed', 309, 20, 2, 2, { name: 'Куча корма', talk: 'feed' });
    B('cellar', 277, 15, 3, 2, { name: 'Грибной погреб', talk: 'cellar' }); B('cellar', 285, 15, 3, 2, { name: 'Грибной погреб', talk: 'cellar' });
    B('poster', 296, 45, 1, 1, { name: 'Плакат', talk: 'poster' });
    B('cellar', 288, 45, 3, 2, { name: 'Землянка знахаря', talk: 'wise_moss_hut' });
    B('rack', 292, 45, 2, 1, { name: 'Вешала с травами', talk: 'herbrack' });

    // ======================= ОСОБЫЙ ЛАГЕРЬ — лагерь принудительного труда баронессы
    // ограда: проходы — ворота у вахты (восток, y 37–42) и ворота железнодорожной ветки (y 24)
    for (let x = 316; x <= 357; x++) { B('fence', x, 18, 1, 1); B('fence', x, 60, 1, 1); }
    for (let y = 19; y < 60; y++) { B('fence', 316, y, 1, 1); if ((y < 37 || y > 42) && y !== 24) B('fence', 357, y, 1, 1); }
    for (let x = 317; x <= 353; x++) if (x < 336 || x > 339) B('wire', x, 33, 1, 1, { name: 'Колючая проволока', talk: 'wire' }); // между рабочей и жилой зоной
    for (const [x, y] of [[318, 19], [353, 19], [318, 36], [318, 56], [353, 56], [332, 57]]) B('tower', x, y, 3, 3, { name: 'Сторожевая вышка', talk: 'camptower' });
    // ворота и вахта
    B('tower', 354, 34, 3, 3, { name: 'Вышка у ворот', talk: 'camptower' }); B('tower', 354, 43, 3, 3, { name: 'Вышка у ворот', talk: 'camptower' });
    B('barracks', 346, 35, 6, 2, { name: 'Вахта', talk: 'vakhta' });
    B('noticeboard', 350, 43, 2, 1, { name: 'Распорядок', talk: 'camp_rules' });
    // рабочая зона: цеха у ветки, вагоны, уголь, ящики
    B('factory', 322, 27, 9, 4, { name: 'Цех', talk: 'campfactory' });
    B('factory', 341, 27, 9, 4, { name: 'Цех', talk: 'campfactory' });
    for (const x of [325, 330, 344, 349]) add({ kind: 'vent', x, y: 31, w: 1, h: 1, block: false, dynamic: true, name: 'Решётка паропровода' });
    for (const x of [321, 328, 343]) B('wagon', x, 24, 4, 1, { name: 'Товарный вагон', talk: 'campwagon' });
    for (const [x, y] of [[333, 28], [333, 30]]) B('coalheap', x, y, 2, 1, { name: 'Уголь', talk: 'coalheap' });
    for (const [x, y] of [[351, 26], [352, 28], [321, 21], [335, 21]]) B('crates', x, y, 1, 1, { name: 'Ящики', talk: 'campcrates' });
    B('handcart', 340, 25, 2, 1, { name: 'Тачка', talk: 'handcart' });
    // плац для поверки
    B('horn', 333, 35, 1, 1, { name: 'Громкоговоритель', talk: 'horn' });
    B('banner', 322, 35, 1, 1, { name: 'Знамя баронессы', talk: 'banner' }); B('banner', 334, 37, 1, 1, { name: 'Знамя баронессы', talk: 'banner' });
    B('poster', 342, 38, 1, 1, { name: 'Плакат', talk: 'camp_poster' });
    // жилая зона: бараки, столовая, карцер, колонка
    for (const [x, y] of [[321, 44], [328, 44], [340, 44], [321, 49], [328, 49], [340, 49], [322, 54], [340, 53]]) B('barracks', x, y, 6, 3, { name: 'Барак заключённых', talk: 'campbarracks' });
    B('barracks', 347, 48, 7, 3, { name: 'Столовая', talk: 'canteen' });
    B('cell', 350, 53, 3, 2, { name: 'Карцер', talk: 'kartser' });
    B('cell', 329, 55, 3, 2, { name: 'Баня', talk: 'bathhouse' });
    B('standpipe', 335, 46, 1, 1, { name: 'Колонка', talk: 'standpipe' });
    for (const [x, y] of [[326, 42], [343, 42], [335, 52], [347, 39], [331, 26]]) B('lamp', x, y, 1, 1, { name: 'Прожектор', talk: 'searchlight' });

    // ======================= ФОРТ БАРОНЕССЫ — один большой ярус и замок
    for (let x = 360; x <= 409; x++) { B('wall', x, 8, 1, 1); B('wall', x, 66, 1, 1); }
    for (let y = 9; y < 66; y++) { B('wall', 360, y, 1, 1); if (y < 35 || y > 39) B('wall', 409, y, 1, 1); }
    for (const y of [8, 63]) B('tower', 407, y, 3, 3, { name: 'Башня', talk: 'btower' });
    // замок баронессы за внутренней стеной
    for (let y = 9; y < 66; y++) if (y < 34 || y > 38) B('wall', 375, y, 1, 1);
    B('gate', 374, 34, 2, 5, { name: 'Ворота замка', talk: 'castle_gate' });
    B('keep', 362, 26, 11, 6, { name: 'Замок баронессы', talk: 'castle' });
    B('banner', 371, 22, 1, 1, { name: 'Знамя баронессы', talk: 'banner' }); B('banner', 371, 41, 1, 1, { name: 'Знамя баронессы', talk: 'banner' });
    // большой ярус: казармы рядами, плац, статуя, агитация
    for (const y of [11, 17, 49, 55]) for (const x of [378, 397]) B('barracks', x, y, 9, 3, { name: y < 30 ? 'Казарма' : 'Дом горожан', talk: y < 30 ? 'bbarracks' : 'bhouse' });
    B('fountain', 389, 36, 4, 4, { name: 'Фонтан со статуей баронессы', talk: 'statue' }); // ровно на перекрёстке площади
    for (const [x, y] of [[384, 27], [395, 27], [384, 46], [395, 46]]) B('banner', x, y, 1, 1, { name: 'Знамя баронессы', talk: 'banner' });
    for (const [x, y] of [[379, 24], [400, 24], [379, 44], [400, 44], [405, 34]]) B('poster', x, y, 1, 1, { name: 'Плакат', talk: 'poster' });
    for (const [x, y] of [[392, 25], [392, 47], [378, 36]]) B('horn', x, y, 1, 1, { name: 'Громкоговоритель', talk: 'horn' });
    B('stall', 399, 39, 2, 1, { name: 'Интендантская лавка', talk: 'stall_b' }); B('crates', 402, 40, 1, 1, { name: 'Ящики интенданта', talk: 'crates' });
    for (const x of [384, 390]) B('wagon', x, 61, 4, 1, { name: 'Вагон', talk: 'bwagon' });
    for (const [x, y] of [[381, 32], [399, 32], [381, 42], [399, 33]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    B('clinic', 401, 27, 5, 3, { name: 'Лазарет', talk: 'bclinic' });


    // ======================= ЭЙНБОУ — сожжена за связи со старым режимом
    const burnt = (x: number, y: number, w = 4) => B('burnt', x, y, w, 3, { name: 'Пепелище', talk: 'burnt' });
    for (const [x, y] of [[418, 21], [425, 20], [439, 21], [446, 22], [418, 37], [424, 38], [438, 37], [444, 38], [420, 44], [440, 44]]) burnt(x, y);
    B('burnt', 431, 20, 5, 3, { name: 'Сгоревшая часовня', talk: 'burnt_chapel' });
    B('noticeboard', 435, 36, 2, 1, { name: 'Приговор на столбе', talk: 'einb_notice' });
    for (const [x, y] of [[427, 27], [429, 27], [431, 27], [427, 29], [429, 29]]) add({ kind: 'bones', x, y, w: 1, h: 1, block: false, name: 'Свежая могила', talk: 'einb_graves' });
    B('standpipe', 443, 30, 1, 1, { name: 'Колодец', talk: 'einb_well' });
    for (const [x, y] of [[417, 28], [448, 34], [421, 49], [449, 46]]) B('tree', x, y, 1, 1, { name: 'Обгорелое дерево' });
    for (const [x, y] of [[436, 26], [422, 35]]) B('crates', x, y, 1, 1, { name: 'Брошенный скарб', talk: 'einb_junk' });

    // ======================= ХОУЛИ — жуководы; беда прошла почти стороной
    B('farm', 458, 23, 4, 3, { name: 'Дом старосты', talk: 'hawley_house' });
    B('rbanner', 462, 24, 1, 1, { name: 'Красный флаг', talk: 'rbanner' });
    B('barn', 464, 23, 8, 3, { name: 'Жучиный сарай', talk: 'barn' });
    B('barn', 480, 23, 8, 3, { name: 'Жучиный сарай', talk: 'barn' });
    B('farm', 489, 23, 4, 3, { name: 'Дом жуковода', talk: 'house_richmord2' });
    B('house', 459, 33, 4, 3, { name: 'Дом жуковода', talk: 'house_richmord2' });
    B('farm', 466, 33, 4, 3, { name: 'Дом кормовщиков', talk: 'house_richmord2' });
    B('burnt', 479, 33, 4, 3, { name: 'Сгоревший дом', talk: 'hawley_burnt' });
    B('house', 485, 33, 4, 3, { name: 'Дом', talk: 'hawley_quiet' });
    B('farm', 459, 41, 4, 3, { name: 'Дом скорняка', talk: 'house_tanner' });
    B('house', 485, 41, 4, 3, { name: 'Дом на отшибе', talk: 'hawley_odd', boarded: true });
    B('barn', 488, 45, 5, 2, { name: 'Сарай', talk: 'hawley_shed' });
    for (const [x, y] of [[490, 13], [459, 15]]) B('feed', x, y, 2, 2, { name: 'Куча корма', talk: 'feed' });
    B('chitin', 470, 27, 2, 1, { name: 'Пустые панцири', talk: 'chitinpile_n' });
    B('rposter', 472, 32, 1, 1, { name: 'Плакат Собрания', talk: 'rposter' });
    for (const [x, y] of [[463, 32], [482, 32], [478, 44]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });

    // ======================= ВУДХЭМ — лесорубы
    fill('g', 500, 38, 7, 8);
    B('hut', 501, 39, 4, 3, { name: 'Избушка знахарки', talk: 'wise_wood_hut' });
    B('rack', 505, 43, 2, 1, { name: 'Вешала с травами', talk: 'herbrack' });
    for (let i = 0; i < 120; i++) { // ельник вокруг поляны
      const x = 500 + Math.floor(r() * 37), y = 15 + Math.floor(r() * 35);
      if (this.ground[y][x] === 'm' && !taken(x, y, 1, 1)) B('pine', x, y, 1, 1, { name: 'Ель', talk: 'pine' });
    }
    B('hut', 509, 23, 4, 3, { name: 'Дом бригадира', talk: 'wood_house' });
    B('hut', 515, 23, 4, 3, { name: 'Дом лесоруба', talk: 'wood_house2' });
    B('hut', 524, 23, 4, 3, { name: 'Дом лесоруба', talk: 'wood_house2' });
    B('barn', 509, 35, 8, 3, { name: 'Пилорама', talk: 'sawmill' });
    B('hut', 525, 37, 4, 3, { name: 'Дом лесоруба', talk: 'wood_house2' });
    for (const [x, y] of [[519, 34], [519, 37], [519, 40], [512, 40]]) B('logs', x, y, 3, 1, { name: 'Штабель брёвен', talk: 'logs' });
    B('sawpit', 523, 34, 2, 1, { name: 'Козлы с пилой', talk: 'sawpit' });
    for (const [x, y] of [[528, 29], [510, 30], [530, 42], [516, 43], [526, 27]]) B('stump', x, y, 1, 1, { name: 'Пень', talk: 'stump' });
    B('campfire', 522, 30, 1, 1, { dynamic: true, name: 'Костёр', talk: 'woodfire' });
    B('rposter', 529, 34, 1, 1, { name: 'Плакат Собрания', talk: 'rposter' });

    // ======================= ТАРВЕЛЛ — нефтяники, вышки под охраной братьев
    const TPUMPS: [number, number][] = [[545, 18], [552, 22], [566, 18], [572, 23], [546, 40], [570, 41]];
    for (const [x, y] of TPUMPS) B('pump', x, y, 2, 2, { dynamic: true, name: 'Нефтяная качалка', talk: 'tar_pump' });
    B('tank', 563, 26, 3, 3, { name: 'Резервуар', talk: 'tar_tank' });
    B('pumphouse', 553, 34, 5, 4, { name: 'Насосная', talk: 'pumphouse' });
    B('house', 543, 34, 4, 3, { name: 'Дом нефтяников', talk: 'tar_house' });
    B('house', 563, 35, 4, 3, { name: 'Дом нефтяников', talk: 'tar_house' });
    B('house', 548, 44, 4, 3, { name: 'Пустой дом мастера', talk: 'tar_master', boarded: true });
    B('house', 565, 44, 4, 3, { name: 'Дом нефтяников', talk: 'tar_house' });
    for (const x of [574, 576]) B('wagon', x, 36, 2, 1, { name: 'Бочки', talk: 'tar_barrels' });
    B('rbanner', 559, 29, 1, 1, { name: 'Красный флаг', talk: 'rbanner' });
    B('rposter', 556, 30, 1, 1, { name: 'Плакат Собрания', talk: 'rposter' });
    for (const [x, y] of [[551, 30], [569, 30], [558, 42]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    for (const [x, y] of [[549, 29], [571, 34], [555, 41]]) B('barrel', x, y, 1, 1);

    // ======================= КОВЕН ВЕДЬМ — глухой лес, вечный зловещий туман
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; B('rock', Math.round(666 + Math.cos(a) * 6), Math.round(33 + Math.sin(a) * 5), 1, 1, { name: 'Камень круга', talk: 'coven_stone' }); }
    B('campfire', 666, 33, 1, 1, { dynamic: true, name: 'Зелёный огонь', talk: 'coven_fire' });
    B('cauldron', 663, 31, 1, 1, { name: 'Котёл', talk: 'coven_cauldron' });
    for (const [x, y] of [[653, 22], [676, 22], [653, 40], [676, 41]]) B('hut', x, y, 4, 3, { name: 'Изба ведьмы', talk: 'coven_hut' });
    for (const [x, y] of [[659, 24], [673, 24], [658, 42], [674, 44], [663, 47], [669, 47]]) B('totem', x, y, 1, 1, { name: 'Тотем', talk: 'coven_totem' });
    for (const [x, y] of [[680, 30], [652, 30]]) B('rack', x, y, 2, 1, { name: 'Вешала с костями и травами', talk: 'coven_rack' });
    for (const [x, y] of [[656, 35], [678, 36], [661, 44], [671, 27]]) add({ kind: 'bones', x, y, w: 1, h: 1, block: false });
    for (const [x, y] of [[650, 34], [682, 39], [670, 51], [660, 52], [684, 28]]) B('tree', x, y, 1, 1, { name: 'Мёртвое дерево' });
    for (let i = 0; i < 160; i++) { // ельник стеной вокруг поляны
      const x = 643 + Math.floor(r() * 47), y = 13 + Math.floor(r() * 43);
      if (this.ground[y][x] === 'm' && !taken(x, y, 1, 1)) B('pine', x, y, 1, 1, { name: 'Ель', talk: 'pine' });
    }

    // ======================= пограничные посты в сёлах: мешки с песком у въездов
    for (const [x, y] of [[269, 46], [270, 46], [269, 51], [270, 51]]) B('sandbags', x, y, 1, 1, { name: 'Мешки с песком', talk: 'sandbags' }); // Хейлстоун — к Винферду
    for (const [x, y] of [[823, 30], [824, 30], [823, 36], [824, 36]]) B('sandbags', x, y, 1, 1, { name: 'Мешки с песком', talk: 'sandbags' }); // Брэмли — к баронессе
    // ======================= ЗЕМЛИ ВИНФЕРДА — самые развитые и спокойные
    // ---- Грейвелл: нефтяники, опрятно, контора и распоряжения
    for (const [x, y] of [[704, 17], [709, 17], [728, 17], [733, 17], [738, 18], [708, 47], [724, 47], [732, 47]]) B('pump', x, y, 2, 2, { dynamic: true, name: 'Нефтяная качалка', talk: 'wf_pump' });
    B('tank', 713, 23, 3, 3, { name: 'Резервуар', talk: 'wf_tank' }); B('tank', 727, 23, 3, 3, { name: 'Резервуар', talk: 'wf_tank' });
    B('station', 719, 24, 5, 3, { name: 'Контора промысла', talk: 'wf_office' });
    for (const [x, y] of [[704, 36], [710, 36], [728, 36], [734, 36], [704, 42], [734, 42]]) B('house', x, y, 4, 3, { name: 'Дом нефтяников', talk: 'wf_oilhouse' });
    B('pumphouse', 716, 41, 5, 4, { name: 'Насосная', talk: 'pumphouse' });
    B('noticeboard', 724, 30, 2, 1, { name: 'Распоряжения конторы', talk: 'wf_notice' });
    for (const [x, y] of [[709, 31], [716, 31], [730, 31], [738, 31], [722, 40]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    // ---- Дипфилд: качалки, перегонный цех, общежития
    for (const [x, y] of [[747, 16], [768, 17], [774, 21], [779, 16], [749, 45], [770, 46], [778, 44]]) B('pump', x, y, 2, 2, { dynamic: true, name: 'Нефтяная качалка', talk: 'wf_pump' });
    B('factory', 755, 20, 9, 4, { name: 'Перегонный цех', talk: 'wf_refinery' });
    B('tank', 747, 24, 3, 3, { name: 'Резервуар', talk: 'wf_tank' }); B('tank', 768, 24, 3, 3, { name: 'Резервуар', talk: 'wf_tank' });
    B('barracks', 749, 37, 8, 3, { name: 'Общежитие нефтяников', talk: 'wf_dorm' }); B('barracks', 762, 37, 8, 3, { name: 'Общежитие нефтяников', talk: 'wf_dorm' });
    B('house', 775, 37, 4, 3, { name: 'Дом мастера', talk: 'wf_oilhouse' });
    B('watertower', 758, 45, 2, 2, { name: 'Водонапорная башня', talk: 'watertower' });
    for (const x of [764, 768]) B('wagon', x, 29, 4, 1, { name: 'Цистерна', talk: 'wf_wagon' });
    for (const [x, y] of [[752, 31], [761, 31], [776, 31], [756, 42]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    // ---- Брэмли: выпас жуков
    B('barn', 790, 26, 8, 3, { name: 'Жучиный сарай', talk: 'barn' }); B('barn', 811, 26, 8, 3, { name: 'Жучиный сарай', talk: 'barn' });
    B('feed', 803, 26, 2, 2, { name: 'Куча корма', talk: 'feed' }); B('feed', 822, 27, 2, 2, { name: 'Куча корма', talk: 'feed' });
    for (const [x, y] of [[790, 37], [797, 37], [811, 37], [818, 37]]) B('farm', x, y, 4, 3, { name: 'Дом погонщиков', talk: 'wf_herdhouse' });
    B('slaughter', 803, 43, 5, 3, { name: 'Бойня', talk: 'slaughter' }); B('chitin', 797, 45, 2, 1, { name: 'Пустые панцири', talk: 'chitinpile_n' });
    B('noticeboard', 806, 31, 2, 1, { name: 'Учёт поголовья', talk: 'wf_herdnotice' });
    for (const [x, y] of [[795, 31], [816, 31]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    // ---- Уиллоубрук: на западном берегу — рыба, на восточном — грибы
    for (const [x, y] of [[850, 25], [850, 41]]) B('boat', x, y, 2, 1, { name: 'Лодка', talk: 'boat' });
    B('hut', 833, 17, 4, 3, { name: 'Рыбацкий дом', talk: 'house_fisher' }); B('hut', 840, 17, 4, 3, { name: 'Коптильня', talk: 'smokehouse' });
    for (const [x, y] of [[834, 24], [841, 24]]) B('rack', x, y, 2, 1, { name: 'Вешала с рыбой', talk: 'fishrack' });
    B('nets', 834, 28, 3, 1, { name: 'Сети', talk: 'nets' });
    B('house', 833, 40, 4, 3, { name: 'Дом старосты', talk: 'wf_riverhouse' }); B('hut', 840, 41, 4, 3, { name: 'Скупка рыбы', talk: 'wf_fishbuy' });
    for (const x of [854, 861]) B('cellar', x, 17, 3, 2, { name: 'Грибной погреб', talk: 'cellar' });
    for (const y of [22, 24, 26]) for (const x of [854, 860]) B('shroombed', x, y, 4, 1, { name: 'Грибная грядка', talk: 'shroombed' });
    for (const [x, y] of [[866, 22], [858, 29]]) B('bigshroom', x, y, 1, 1, { name: 'Светящийся гриб', talk: 'bigshroom' });
    B('hut', 856, 40, 4, 3, { name: 'Хижина грибников', talk: 'hut' }); B('hut', 863, 40, 4, 3, { name: 'Сушильня', talk: 'drying' });
    for (const [x, y] of [[845, 31], [854, 36]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    // ---- Айронклифф: шахта у подножия гор
    B('adit', 889, 46, 7, 3, { name: 'Шахта', talk: 'wf_mine' });
    for (const y of [30, 36]) B('orecart', 895, y, 1, 1, { name: 'Вагонетка с рудой', talk: 'orecart' });
    for (let y = 26; y <= 45; y++) this.rail[y][895] = 1;
    for (const [x, y] of [[879, 44], [902, 44]]) B('coalheap', x, y, 2, 1, { name: 'Отвал руды', talk: 'orepile' });
    B('barracks', 876, 33, 8, 3, { name: 'Барак горняков', talk: 'wf_minerdorm' }); B('barracks', 899, 33, 8, 3, { name: 'Барак горняков', talk: 'wf_minerdorm' });
    B('workshop', 878, 24, 4, 2, { name: 'Кузня', talk: 'workshop' }); B('house', 900, 23, 4, 3, { name: 'Дом штейгера', talk: 'wf_steigerhouse' });
    for (let i = 0; i < 18; i++) { const x = 875 + Math.floor(r() * 38), y = 15 + Math.floor(r() * 33); if (!taken(x, y, 1, 1) && !this.rail[y][x]) B('rock', x, y, 1, 1); }
    for (const [x, y] of [[890, 38], [897, 42], [885, 31]]) if (!taken(x, y, 1, 1)) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    // ---- Лимбридж: палатки и лачуги беженцев, контора по расселению
    B('station', 943, 17, 6, 3, { name: 'Контора по расселению', talk: 'wf_resettle' });
    B('noticeboard', 949, 21, 2, 1, { name: 'Списки на расселение', talk: 'wf_lists' });
    B('wbanner', 942, 21, 1, 1, { name: 'Знамя Винферда', talk: 'wbanner' });
    for (const row of [16, 20, 25, 37, 41, 45]) for (let x = 919; x < 940; x += 3 + (row % 2)) if (!taken(x, row, 2, 2)) {
      const k = r(); if (k < 0.12) B('shack', x, row, 3, 2, { name: 'Лачуга', talk: 'wf_shack' }); else if (k < 0.18) B('laundry', x, row + 1, 3, 1, { name: 'Бельевая верёвка', talk: 'laundry' }); else B('tent', x, row, 2, 2, { name: 'Палатка', talk: 'wf_tent' });
    }
    for (const row of [37, 41, 45]) for (let x = 942; x < 955; x += 3) if (!taken(x, row, 2, 2)) B('tent', x, row, 2, 2, { name: 'Палатка', talk: 'wf_tent' });
    for (const [x, y] of [[930, 30], [944, 29], [925, 35]]) B('campfire', x, y, 1, 1, { dynamic: true, name: 'Костёр', talk: 'slumfire' });
    B('standpipe', 937, 29, 1, 1, { name: 'Колонка', talk: 'standpipe' });
    B('tent', 950, 48, 2, 2, { name: 'Палатка на отшибе', talk: 'ivy_tent' }); // здесь прячется Айви Гримшоу
    // ---- Форт Винферда, ярус 1: торговые ряды, дома, мастерские
    for (let x = 960; x <= 1008; x += 2) { if (x < 982 || x > 986) B('wall', x, 67, 2, 1); if (x < 982 || x > 985) B('wall', x, 7, 2, 1); } // стены вплотную к воротам
    for (let y = 8; y < 67; y++) { B('wall', 960, y, 1, 1); B('wall', 1009, y, 1, 1); }
    B('gate', 982, 7, 4, 1, { name: 'Ворота на верхний ярус', talk: 'wf_up' });
    for (const x of [979, 988]) B('tower', x, 64, 3, 3, { name: 'Надвратная башня', talk: 'wf_tower' });
    for (const y of [44, 48, 52, 56, 60]) { B('stall', 979, y, 2, 1, { name: 'Торговый ряд', talk: 'wf_stall' }); B('stall', 988, y, 2, 1, { name: 'Торговый ряд', talk: 'wf_stall' }); }
    for (const [x, y] of [[976, 45], [991, 49], [976, 53], [991, 57]]) B('crates', x, y, 1, 1, { name: 'Ящики с товаром', talk: 'crates' });
    B('station', 963, 40, 6, 3, { name: 'Канцелярия барона', talk: 'wf_chancery' });
    B('noticeboard', 970, 42, 2, 1, { name: 'Указы и формы', talk: 'wf_decrees' });
    B('acar', 997, 40, 3, 2, { name: 'Бронемашина', talk: 'wf_acar' });
    for (const [x, y] of [[963, 45], [963, 51], [1003, 45], [1003, 51]]) B('workshop', x, y, 4, 2, { name: ['Оружейная мастерская', 'Часовщик', 'Скорняжная мастерская', 'Мастерская механика'][(x + y) % 4], talk: 'workshop' });
    for (const row of [9, 14, 25, 30, 56, 60]) for (let x = 962; x < 1007; x += 5) if (x + 4 < 982 || x > 986) if (!taken(x, row, 4, 3)) B('house', x, row, 4, 3, { name: 'Дом горожан', talk: 'wf_house' });
    for (const [x, y] of [[974, 37], [994, 37], [981, 20], [988, 24], [981, 44], [988, 58], [981, 62]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    for (const [x, y] of [[978, 36], [992, 36]]) B('wbanner', x, y, 1, 1, { name: 'Знамя Винферда', talk: 'wbanner' });
    B('standpipe', 995, 46, 1, 1, { name: 'Колонка', talk: 'standpipe' });
    // ---- ярус 2: театр, школы, дома тех, кто побогаче; за стеной — замок барона и знать
    for (let x = 1013; x <= 1055; x += 2) if (x < 1031 || x > 1034) { B('wall', x, 67, 2, 1); B('wall', x, 15, 2, 1); }
    for (let y = 16; y < 67; y++) { B('wall', 1013, y, 1, 1); B('wall', 1056, y, 1, 1); }
    B('gate', 1031, 67, 4, 1, { name: 'Ворота вниз, в торговый город', talk: 'wf_down' });
    B('gate', 1031, 15, 4, 1, { name: 'Ворота к замку', talk: 'wf_upper' });
    B('keep', 1027, 8, 13, 6, { name: 'Замок барона Винферда', talk: 'wf_castle' });
    B('theatre', 1017, 42, 11, 5, { name: 'Театр', talk: 'wf_theatre' });
    B('school', 1038, 42, 8, 3, { name: 'Школа', talk: 'wf_school' });
    for (const [x, y] of [[1016, 19], [1022, 19], [1040, 19], [1047, 19], [1016, 27], [1047, 27], [1016, 33], [1040, 33], [1047, 33], [1016, 55], [1022, 55], [1040, 57], [1016, 61], [1022, 61], [1040, 62], [1047, 62]]) if (!taken(x, y, 5, 3)) B('farm', x, y, 5, 3, { name: 'Дом зажиточных горожан', talk: 'wf_richhouse' });
    for (const [x, y] of [[1031, 24], [1036, 24], [1031, 36], [1036, 36], [1031, 50], [1036, 50], [1031, 58]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    for (const [x, y] of [[1030, 17], [1037, 17], [1030, 44], [1037, 46]]) B('wbanner', x, y, 1, 1, { name: 'Знамя Винферда', talk: 'wbanner' });
    B('noticeboard', 1028, 49, 2, 1, { name: 'Афиша театра', talk: 'wf_playbill' });

    // ======================= ФОРТ СВОБОДА — бывший форт барона Сильвера
    for (let x = 584; x <= 637; x += 2) { B('wall', x, 5, 2, 1); if (x < 606 || x > 612) B('wall', x, 67, 2, 1); }
    for (let y = 6; y < 67; y++) { B('wall', 584, y, 1, 1); B('wall', 637, y, 1, 1); }
    for (const x of [603, 613]) B('tower', x, 64, 3, 3, { name: 'Надвратная башня', talk: 'svob_tower' });
    for (const [x, y] of [[585, 6], [634, 6], [585, 64], [634, 64]]) B('tower', x, y, 3, 3, { name: 'Башня', talk: 'svob_tower' });
    // вдоль дороги от ворот — виселицы с лоялистами старого режима
    for (let y = 43; y <= 62; y += 3) { B('gallows', 606, y, 1, 1, { name: 'Повешенный', talk: 'hanged' }); B('gallows', 612, y, 1, 1, { name: 'Повешенный', talk: 'hanged' }); }
    // площадь: помост с бароном, знамёна, громкоговорители
    B('gibbet', 607, 28, 5, 3, { name: 'Помост — барон Сильвер', talk: 'baron_gibbet' });
    for (const [x, y] of [[600, 25], [619, 25], [600, 35], [619, 35]]) B('rbanner', x, y, 1, 1, { name: 'Знамя Собрания', talk: 'rbanner' });
    for (const [x, y] of [[603, 24], [616, 36]]) B('horn', x, y, 1, 1, { name: 'Громкоговоритель', talk: 'svob_horn' });
    B('noticeboard', 614, 24, 2, 1, { name: 'Списки', talk: 'svob_list' });
    B('stall', 621, 32, 2, 1, { name: 'Пункт распределения', talk: 'svob_stall' });
    B('crates', 623, 31, 1, 1, { name: 'Ящики с пайками', talk: 'crates' });
    // бывший замок барона — теперь Дом Собрания
    B('keep', 603, 7, 13, 6, { name: 'Дом Собрания', talk: 'svob_keep' });
    for (const x of [601, 617]) B('rbanner', x, 12, 1, 1, { name: 'Знамя Собрания', talk: 'rbanner' });
    B('barracks', 587, 24, 9, 3, { name: 'Казарма братьев свободы', talk: 'svob_barracks' });
    B('cell', 625, 24, 4, 2, { name: 'Подвал трибунала', talk: 'svob_cell' });
    B('clinic', 587, 29, 5, 3, { name: 'Лазарет братьев свободы', talk: 'svob_clinic' });
    for (const [x, y] of [[598, 40], [626, 40], [596, 13], [624, 13], [588, 36], [632, 36], [604, 40], [615, 21]]) B('rposter', x, y, 1, 1, { name: 'Плакат Собрания', talk: 'rposter' });
    for (const [x, y] of [[602, 37], [618, 22], [607, 40], [613, 40]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    B('standpipe', 596, 31, 1, 1, { name: 'Колонка', talk: 'standpipe' });
    // справа от ворот — лесной двор: паровая лесопилка, сушильный навес, брёвна и шпалы
    B('factory', 617, 42, 9, 4, { name: 'Паровая лесопилка', talk: 'svob_sawmill' });
    B('barn', 628, 42, 7, 3, { name: 'Сушильный навес', talk: 'svob_drying' });
    for (const [x, y] of [[617, 49], [621, 49], [629, 49], [617, 52], [621, 52], [629, 52]]) B('logs', x, y, 3, 1, { name: 'Штабель брёвен', talk: 'svob_logs' });
    for (const [x, y] of [[617, 57], [621, 57], [617, 60], [621, 60]]) B('logs', x, y, 3, 1, { name: 'Штабель шпал', talk: 'svob_sleepers' });
    B('sawpit', 626, 50, 2, 1, { name: 'Козлы с пилой', talk: 'sawpit' });
    for (const [x, y] of [[633, 49], [626, 58]]) B('sawdust', x, y, 2, 2, { name: 'Опилки', talk: 'svob_sawdust' });
    B('handcart', 629, 56, 2, 1, { name: 'Тачка с брёвнами', talk: 'handcart' });
    B('crates', 634, 53, 1, 1, { name: 'Ящики с гвоздями', talk: 'crates' });
    B('noticeboard', 630, 60, 2, 1, { name: 'Норма выработки', talk: 'svob_norm' });
    B('rposter', 615, 47, 1, 1, { name: 'Плакат Собрания', talk: 'rposter' });
    B('lamp', 627, 47, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    // тесные дома с закрытыми ставнями
    for (const row of [8, 16, 20, 41, 45, 49, 53, 57, 61]) {
      for (let x = 586; x < 636;) {
        const w = 3;
        if (!taken(x, row, w, 3) && !taken(x + 1, row + 3, 1, 1) && x + w <= 636 && !(x + w > 602 && x < 617 && row < 22) && !(x + w > 603 && x < 616 && row > 40) && !(x + w > 616 && row > 40)) {
          const k = r();
          if (k < 0.08) B('laundry', x, row + 2, w, 1, { name: 'Бельевая верёвка', talk: 'laundry' });
          else if (k < 0.16) B('burnt', x, row, w, 3, { name: 'Сгоревший дом', talk: 'svob_burnt' });
          else B('tenement', x, row, w, 3, { name: 'Дом', talk: 'svob_house', boarded: true });
        }
        x += w + (r() < 0.3 ? 1 : 0);
      }
    }
    // случайные камни и деревья в пустоши (воронки — только на поле сражений к западу)
    const free = (x: number, y: number, w: number, h: number) => {
      for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) {
        if (!this.inMap(xx, yy)) return false;
        if (this.ground[yy][xx] !== 'w' || this.rail[yy][xx]) return false;
        if (this.objs.some((o) => xx >= o.x && xx < o.x + o.w && yy >= o.y && yy < o.y + o.h)) return false;
      }
      return true;
    };
    for (let i = 0; i < 160; i++) {
      const x = 1 + Math.floor(r() * 99), y = 1 + Math.floor(r() * (MH - 2));
      const k = r();
      if (k < 0.4) { if (free(x, y, 1, 1)) B('tree', x, y, 1, 1, { name: 'Мёртвое дерево' }); }
      else if (k < 0.75) { if (free(x, y, 1, 1)) B('rock', x, y, 1, 1); }
      else if (free(x, y, 1, 1)) add({ kind: 'bones', x, y, w: 1, h: 1, block: false });
    }

    // ======================= ВОЛЬНИЦА — круглые траншеи, землянки, воронки с грибами
    { const { x: cx, y: cy } = VOL_C;
      B('campfire', cx, cy, 1, 1, { dynamic: true, name: 'Костёр Круга', talk: 'vol_fire' });
      B('blkbanner', cx - 4, cy - 4, 1, 1, { name: 'Чёрная тряпка на жерди', talk: 'vol_flag' });
      B('logs', cx - 3, cy + 3, 2, 1, { name: 'Брёвна вокруг костра', talk: 'vol_logs' });
      B('logs', cx + 2, cy + 3, 2, 1, { name: 'Брёвна вокруг костра', talk: 'vol_logs' });
      B('crates', cx + 4, cy - 3, 1, 1, { name: 'Ящики с общим добром', talk: 'vol_crates' });
      B('raincatch', cx + 4, cy + 1, 1, 1, { name: 'Дождесборник', talk: 'vol_rain' });
      B('raincatch', cx - 5, cy, 1, 1, { name: 'Дождесборник', talk: 'vol_rain' });
      for (const [x, y] of VOL_CRATERS) {
        add({ kind: 'crater', x: x - 1, y: y - 1, w: 3, h: 3, block: false });
        B('shroombed', x - 2, y + 2, 3, 1, { name: 'Грибы в воронке', talk: 'vol_shrooms' });
        B('bigshroom', x + 2, y - 1, 1, 1, { name: 'Светящийся гриб', talk: 'bigshroom' });
        B('bigshroom', x - 2, y - 2, 1, 1, { name: 'Светящийся гриб', talk: 'bigshroom' });
      }
      VOL_PITS.forEach(([x, y], i) => {
        if (i === 0) B('shack', x - 3, y - 2, 3, 2, { name: 'Лавка барыги', talk: 'vol_stash' });
        else B('tent', x - 3, y - 2, 2, 2, { name: 'Латаная палатка', talk: 'vol_tent' });
        B('raincatch', x + 2, y - 1, 1, 1, { name: 'Дождесборник', talk: 'vol_rain' });
        if (i === 2) B('laundry', x - 1, y + 1, 3, 1, { name: 'Бельевая верёвка', talk: 'laundry' });
        else B('crates', x - 1, y + 1, 1, 1, { name: 'Ящики', talk: 'crates' });
      });
      // землянки — в стенках колец, где дно траншеи прямо под ними
      const cand: [number, number][] = [];
      for (let y = 12; y < 60; y++) for (let x = 1064; x < 1112; x++) {
        const fl = (xx: number, yy: number) => this.ground[yy][xx] === 'd';
        if (this.ground[y][x] === 't' && this.ground[y][x + 1] === 't' && fl(x, y + 1) && fl(x + 1, y + 1) && Math.hypot(x - cx, y - cy) > 7) cand.push([x, y]);
      }
      const dug: [number, number][] = [];
      for (const k of cand.map((q) => ({ q, v: r() })).sort((a, b) => a.v - b.v)) {
        const [x, y] = k.q;
        if (dug.length < 12 && dug.every(([a, b]) => Math.hypot(a - x, b - y) > 6)) dug.push([x, y]);
      }
      for (const [x, y] of dug) B('dugout', x, y, 2, 1, { name: 'Землянка', talk: 'vol_dugout' });
      B('sign', cx + 9, 59, 1, 1, { name: 'Доска у входа', talk: 'vol_sign' });
    }
    // ======================= ПОСТ 314 — бетонные бункеры, двор за мешками, вечный дозор
    { // бункеры по краям двора; у командного — знамя, у радийного — мачта
      for (const [x, y, w] of [[1125, 14, 6], [1132, 14, 6], [1151, 14, 6], [1157, 22, 6], [1125, 24, 6], [1125, 34, 6], [1157, 34, 6], [1125, 43, 6], [1156, 43, 6]] as [number, number, number][])
        B('bunker', x, y, w, 3, { name: 'Жилой бункер', talk: 'p314_bunker' });
      B('bunker', 1140, 14, 9, 3, { name: 'Командный бункер', talk: 'p314_cmdbunker' });
      B('bunker', 1146, 24, 7, 3, { name: 'Радиобункер', talk: 'p314_radiobunker' });
      B('antenna', 1153, 25, 1, 1, { name: 'Радиомачта', talk: 'p314_antenna' });
      B('ibanner', 1143, 19, 1, 1, { name: 'Имперское знамя', talk: 'p314_flag' });
      // плац: знамя посередине, вокруг — быт
      B('ibanner', 1143, 31, 1, 1, { name: 'Имперское знамя', talk: 'p314_flag' });
      B('campfire', 1134, 31, 1, 1, { dynamic: true, name: 'Полевая кухня', talk: 'p314_kitchen' });
      B('laundry', 1133, 38, 4, 1, { name: 'Бельевая верёвка', talk: 'p314_laundry' });
      B('laundry', 1150, 38, 4, 1, { name: 'Бельевая верёвка', talk: 'p314_laundry' });
      for (const x of [1149, 1153]) B('shroombed', x, 31, 3, 1, { name: 'Грибная грядка', talk: 'p314_shrooms' });
      for (const [x, y] of [[1133, 22], [1153, 46], [1132, 46]]) B('raincatch', x, y, 1, 1, { name: 'Дождесборник', talk: 'p314_rain' });
      for (const [x, y] of [[1137, 22], [1138, 22], [1131, 21], [1160, 30]]) B('crates', x, y, 1, 1, { name: 'Армейские ящики', talk: 'p314_crates' });
      B('noticeboard', 1139, 28, 2, 1, { name: 'Доска приказов', talk: 'p314_orders' });
      B('shrine', 1158, 15, 3, 1, { name: 'Место для молитвы', talk: 'p314_shrine' }); // в углу двора, за командным бункером
      // южный вал: мешки, проволока, проход; орудие смотрит в Ад
      for (let x = 1124; x < 1163; x++) if (x < 1140 || x > 1145) B(x % 7 === 3 ? 'wire' : 'sandbags', x, 50, 1, 1, x % 7 === 3 ? { name: 'Колючая проволока', talk: 'wire' } : { name: 'Мешки с песком', talk: 'p314_sandbags' });
      B('gun', 1148, 47, 2, 1, { name: 'Полевое орудие', talk: 'p314_gun' });
      for (const [x, y] of [[1124, 49], [1162, 49]]) B('sandbags', x, y, 1, 1, { name: 'Пулемётное гнездо', talk: 'p314_nest' });
      B('sign', 1144, 52, 1, 1, { name: 'Табличка', talk: 'p314_sign' });
      for (const [x, y] of [[1140, 49], [1146, 49], [1137, 28], [1149, 28]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    }

    // блокировка клеток
    for (const o of this.objs) if (o.block) for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (this.inMap(x, y)) this.block[y][x] = true;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (this.ground[y][x] === 'f' || this.ground[y][x] === 't' || this.ground[y][x] === 'x' || this.ground[y][x] === 'l') this.block[y][x] = true;

    // ---------------- жители
    const NPC = (id: string, name: string, kind: string, x: number, y: number, talk: string, cond?: () => boolean) => this.npcs.push({ id, name, kind, x, y, talk, cond, seed: this.npcs.length * 1.7 });
    NPC('oldos', 'Олдос, смотритель', 'elder', 21, 58, 'oldos');
    NPC('ash_sgt', 'Сержант заставы', 'ashsoldier', 7, 42, 'ash_sgt');
    NPC('ash_sol1', 'Часовой', 'ashsoldier', 7, 45, 'ash_sgt');
    NPC('ida', 'Ида Кроу', 'foreman', 27, 41, 'ida');
    NPC('burk', 'Бёрк, нефтяник', 'oilworker', 34, 36, 'burk');
    NPC('nell', 'Нелл', 'widow', 26, 50, 'nell');
    NPC('wallace', 'Уоллес, погонщик', 'herder', 66, 19, 'wallace');
    NPC('hob', 'Хоб, мясник', 'butcher', 75, 26, 'hob');
    NPC('penny', 'Пенни, пастушка', 'girl', 84, 19, 'penny');
    NPC('alex', 'Александр', 'alex', 70, 21, 'alex', () => !G.flags.alexJoined);
    NPC('alex_dad', 'Отец Александра', 'alex_dad', 60, 30, 'alex_dad', () => !G.flags.alexDadBeaten);
    NPC('alex_dad_b', 'Отец Александра', 'alex_dad_b', 60, 30, 'alex_dad_b', () => !!G.flags.alexDadBeaten);
    NPC('rich_corp', 'Капрал барона', 'guard', 63, 22, 'rich_corp');
    NPC('agnes', 'Агнес, старшая грибница', 'grower', 10, 23, 'agnes');
    NPC('toby', 'Тоби, сборщик', 'picker', 7, 18, 'toby');
    NPC('abe', 'Слепой Эйб', 'miner', 21, 15, 'abe');
    NPC('guard1', 'Стражник', 'guard', 99, 48, 'guard');
    NPC('guard2', 'Стражник', 'guard', 99, 52, 'guard');
    NPC('trader', 'Торговец', 'sutler', 157, 47, 'trader');
    NPC('ferglow', 'Джентльмен в цилиндре', 'ferglow', 163, 38, 'ferglow', () => !G.flags.ferglowJoined); // временно: его место — в Империи
    NPC('prosthetist', 'Протезист', 'medic_civ', 167, 56, 'prosthetist');
    NPC('surgeon', 'Подпольный хирург', 'surgeon_under', 142, 65, 'surgeon');
    NPC('alex_changed', 'Александр', 'alex_changed', 139, 65, 'alex_changed', () => !!G.flags.alexSoldLeft);
    // земли Леди Харрингтон
    NPC('fish_elder', 'Старый Гарт, староста', 'fisher', 195, 38, 'fish_elder');
    NPC('fish_buyer', 'Скупщица', 'fisher_w', 218, 54, 'fish_buyer');
    NPC('prosp_boss', 'Мэйбл, старшина старателей', 'prospector_w', 255, 45, 'prosp_boss');
    NPC('scrap_trader', 'Скупщик лома', 'scrapper', 260, 47, 'scrap_trader');
    NPC('moss_elder', 'Ровена, старшая', 'grower', 280, 38, 'moss_elder');
    NPC('moss_herder', 'Пастух', 'herder', 303, 29, 'moss_herder');
    NPC('camp_gate1', 'Часовой', 'bguard', 355, 37, 'camp_gate'); NPC('camp_gate2', 'Часовой', 'bguard', 355, 42, 'camp_gate');
    NPC('camp_foreman', 'Мастер цеха', 'bofficer', 336, 36, 'camp_foreman');
    NPC('bgate1', 'Часовой', 'bguard', 407, 34, 'bgate'); NPC('bgate2', 'Часовой', 'bguard', 407, 40, 'bgate');
    NPC('castle_g1', 'Гвардеец', 'bguard', 377, 33, 'castle_gate'); NPC('castle_g2', 'Гвардеец', 'bguard', 377, 39, 'castle_gate');
    NPC('herald', 'Глашатай', 'bherald', 389, 33, 'herald');
    NPC('quarter', 'Интендант', 'bofficer', 400, 40, 'quartermaster');
    // север
    NPC('einb_old', 'Старуха на пепелище', 'oldwoman', 425, 24, 'einb_old');
    NPC('hawley_elder', 'Староста Хоули', 'herder', 461, 27, 'hawley_elder');
    NPC('wood_boss', 'Бригадир лесорубов', 'lumber', 513, 27, 'wood_boss');
    NPC('tar_boss', 'Старший нефтяник', 'oilworker', 557, 39, 'tar_boss');
    NPC('tar_guard1', 'Брат при вышках', 'brother', 551, 25, 'tar_guard'); NPC('tar_guard2', 'Брат при вышках', 'brother2', 568, 21, 'tar_guard');
    NPC('svob_gate1', 'Брат у ворот', 'brother', 608, 65, 'svob_gate'); NPC('svob_gate2', 'Брат у ворот', 'brother2', 612, 65, 'svob_gate');
    NPC('svob_g1', 'Брат у помоста', 'brother', 606, 32, 'svob_gibguard'); NPC('svob_g2', 'Брат у помоста', 'brother_w', 612, 32, 'svob_gibguard');
    NPC('commissar', 'Комиссар Собрания', 'brother_off', 609, 14, 'commissar');
    NPC('distrib', 'Раздатчица', 'nb_w', 621, 33, 'distrib');
    // юг: земли Винферда
    NPC('wf_oilboss', 'Управляющий промыслом', 'wfclerk', 723, 28, 'wf_oilboss');
    NPC('wf_drill', 'Мастер буровой', 'wfoil', 760, 30, 'wf_drill');
    NPC('wf_herd', 'Старший погонщик', 'herder', 807, 30, 'wf_herd');
    NPC('wf_river', 'Староста Уиллоубрука', 'fisher', 842, 30, 'wf_river');
    NPC('wf_steiger', 'Штейгер', 'wfminer', 896, 28, 'wf_steiger');
    NPC('wf_resclerk', 'Чиновник по расселению', 'wfclerk', 946, 21, 'wf_resclerk');
    NPC('wf_refelder', 'Старшая из беженцев', 'refugee_w', 930, 32, 'wf_refelder');
    NPC('ivy', 'Беженка у палатки', 'ivy', 952, 49, 'ivy', () => !G.flags.ivyJoined && !G.flags.ivyBetrayed);
    NPC('wf_gate1', 'Часовой', 'wfguard', 982, 65, 'wf_gateguard'); NPC('wf_gate2', 'Часовой', 'wfguard', 986, 65, 'wf_gateguard');
    NPC('wf_trader', 'Купец торговых рядов', 'sutler', 981, 49, 'wf_trader');
    NPC('wf_chclerk', 'Писарь канцелярии', 'wfclerk', 966, 44, 'wf_chclerk');
    NPC('wf_upg1', 'Стража яруса', 'wfguard', 982, 8, 'wf_upguard'); NPC('wf_upg2', 'Стража яруса', 'wfguard', 986, 8, 'wf_upguard');
    NPC('wf_nob1', 'Гвардия знати', 'wfofficer', 1031, 16, 'wf_nobguard'); NPC('wf_nob2', 'Гвардия знати', 'wfguard', 1035, 16, 'wf_nobguard');
    const coven = () => !G.flags.covenDead;
    NPC('coven_elder', 'Старшая ведьма', 'crone', 666, 29, 'coven_elder', coven);
    NPC('coven_w1', 'Ведьма', 'crone2', 660, 33, 'coven_witch', coven);
    NPC('coven_w2', 'Ведьма', 'crone3', 672, 31, 'coven_witch', coven);
    NPC('coven_d1', 'Рогатый', 'demon', 664, 28, 'coven_demon', coven);
    NPC('coven_d2', 'Рогатая', 'demon2', 669, 36, 'coven_demon', coven);
    NPC('alex_coven', 'Александр', 'alex', 663, 35, 'alex_coven', () => !!G.flags.alexCoven && !G.flags.alexCovenGone);
    // Вольница
    NPC('arthur', 'Артур Сильвер', 'arthur', 1091, 33, 'arthur', () => !G.flags.arthurJoined);
    NPC('vol_orator', 'Оратор', 'vol_orator', 1084, 33, 'vol_orator');
    NPC('vol_fence', 'Барыга', 'vol_fence', 1089, 15, 'vol_fence');
    NPC('vol_water', 'Водяная', 'vol_water', 1066, 43, 'vol_water');
    NPC('vol_grower', 'Грибник', 'vol_grower', 1108, 23, 'vol_grower');
    // Пост 314
    NPC('p314_gate', 'Часовой', 'imp_sold', 1141, 50, 'p314_gate');
    NPC('p314_cmd', 'Комендант поста', 'imp_cmd', 1145, 18, 'p314_cmd');
    NPC('p314_radio', 'Радист', 'imp_radio', 1150, 27, 'p314_radio');
    NPC('p314_qm', 'Каптенармус', 'imp_qm', 1132, 26, 'p314_qm');
    NPC('p314_cook', 'Дежурная по кухне', 'imp_sold_w2', 1136, 32, 'p314_cook');
    NPC('p314_chap', 'Капеллан', 'imp_chaplain', 1160, 17, 'p314_chap');
    NPC('wise_fen', 'Шептунья', 'wise_fen', 4, 26, 'wise_fen');
    NPC('wise_moss', 'Знахарь', 'wise_moss', 289, 48, 'wise_moss');
    NPC('wise_wood', 'Лесная знахарка', 'wise_wood', 503, 43, 'wise_wood');
    NPC('svob_prosth', 'Протезист братьев', 'rmedic', 593, 32, 'svob_prosth');
    NPC('hawley_prosth', 'Старик с костылём', 'hawley_prosth', 484, 45, 'hawley_prosth');
    NPC('bprosth', 'Военный протезист', 'bmedic', 404, 31, 'bprosth');
    NPC('upper1', 'Стража Верхнего города', 'guard', 179, 46, 'upper_guard');
    NPC('upper2', 'Стража Верхнего города', 'guard', 179, 52, 'upper_guard');

    // ---------------- жуки
    const names = ['Граф', 'Пудинг', 'Чернушка', 'Старый Бен', 'Ржавый', 'Тихоня', 'Жвала'];
    let n = 0;
    for (const p of PENS) for (let i = 0; i < (p === PENS[0] ? 4 : 3); i++) {
      const x = p.x0 + 2 + r() * (p.x1 - p.x0 - 4), y = p.y0 + 2 + r() * (p.y1 - p.y0 - 4);
      this.beetles.push({ id: 'b' + n, x, y, tx: x, ty: y, pen: p, dir: r() * TAU, seed: r() * 10, wait: r() * 3, talk: p.x0 > 450 ? 'beetle_hawley' : p.x0 > 250 ? 'beetle_moss' : 'beetle', name: `Жук «${names[n++ % names.length]}»`, scale: 0.9 + r() * 0.3 });
    }

    // ---------------- фоновые жители (точки маршрутов прижимаются к ближайшей свободной клетке)
    this.folk = [];
    this.folk = FOLK.map((d0, k) => {
      const d: FolkDef = { ...d0, route: d0.route.map((st) => ({ ...st, ...this.freeNear(st.x, st.y) })) };
      const s0 = d.route[0];
      return { def: d, id: d.id, name: d.name, kind: d.kind, talk: 'folk:' + d.id, x: s0.x, y: s0.y, i: 0, path: [], wait: s0.wait * r(), flip: r() < 0.5, step: 0,
        bark: null, barkI: Math.floor(r() * d.barks.length), nextBark: 4 + r() * 12, hold: 0, seed: k * 2.3, blockT: 0 };
    });

    // ---------------- игрок
    const mk = (kind: string, x: number, y: number): Walker => ({ kind, x, y, rx: x, ry: y, fx: x, fy: y, flip: false });
    this.player = mk('pc', 24, 58);
    this.followers = [];
    this.trail = [];
    this.view = this.view ?? new PixelView();
    this.renderSprites();
  },

  /** Войти в локальную сцену (по умолчанию — у её въезда). */
  enter(id: string, at?: Pt) {
    const sc = SCENES[id];
    this.scene = id;
    const p = at ?? sc.entry;
    const mk = (kind: string, x: number, y: number): Walker => ({ kind, x, y, rx: x, ry: y, fx: x, fy: y, flip: false });
    this.player = mk('pc', p.x, p.y);
    this.followers = G.squad.slice(1).map((s) => mk(s.look ?? s.kind, p.x, p.y));
    this.trail = this.followers.map(() => ({ ...p }));
    this.path = []; this.pending = null; this.moveK = 1;
    for (const f of this.folk) { f.bark = null; f.hold = 0; f.nextBark = 3 + Math.random() * 8; }
    G.location = '';
    this.updateLocation();
  },
  inScene(x: number, y: number) { const s = SCENES[this.scene]; return x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1; },

  inMap(x: number, y: number) { return x >= 0 && y >= 0 && x < MW && y < MH; },
  activeNpcs() { return this.npcs.filter((n) => !n.cond || n.cond()); },
  /** Жители текущей сцены. */
  sceneFolk() { return this.folk.filter((f) => f.def.scene === this.scene && !(f.def.scene === 'coven' && G.flags.covenDead)); },
  freeNear(x: number, y: number): Pt {
    for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx, ny = y + dy;
      if (this.inMap(nx, ny) && !this.blocked(nx, ny)) return { x: nx, y: ny };
    }
    return { x, y };
  },
  thingAt(x: number, y: number): Obj | Npc | Beetle | Folk | null {
    const npc = this.activeNpcs().find((n) => n.x === x && n.y === y);
    if (npc) return npc;
    const fk = this.sceneFolk().find((f) => Math.round(f.x) === x && Math.round(f.y) === y);
    if (fk) return fk;
    const b = this.beetles.find((b) => Math.round(b.x - 0.5) === x && Math.round(b.y - 0.5) === y);
    if (b) return b;
    return this.objs.find((o) => o.talk && x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) ?? null;
  },
  blocked(x: number, y: number) {
    if (!this.inMap(x, y)) return true;
    return this.block[y][x] || this.activeNpcs().some((n) => n.x === x && n.y === y) || this.folkAt(x, y);
  },
  /** Клетку занимает житель — стоит на ней или уже шагает в неё. */
  folkAt(x: number, y: number, self?: Folk) {
    return this.sceneFolk().some((f) => f !== self && ((Math.round(f.x) === x && Math.round(f.y) === y) || (f.path.length > 0 && f.path[0].x === x && f.path[0].y === y && Math.hypot(f.path[0].x - f.x, f.path[0].y - f.y) < 0.95)));
  },
  /** Клетки героя и отряда (во время шага — обе: откуда и куда). */
  heroAt(x: number, y: number) {
    for (const w of [this.player, ...this.followers]) {
      if (w.x === x && w.y === y) return true;
      if (this.moveK < 1 && Math.round(w.fx) === x && Math.round(w.fy) === y) return true;
    }
    return false;
  },
  /** Проложить путь жителя к текущей точке маршрута в обход героя и других жителей. */
  repath(f: Folk) {
    const st = f.def.route[f.i], sx = Math.round(f.x), sy = Math.round(f.y);
    const ok = (x: number, y: number) => this.inScene(x, y) && !this.block[y][x] && !this.activeNpcs().some((n) => n.x === x && n.y === y) && !this.heroAt(x, y) && !this.folkAt(x, y, f);
    const reach = bfs(MW, MH, sx, sy, ok, null, DIRS4);
    if (reach.has(st.y * MW + st.x)) { f.path = pathTo(reach, MW, st.x, st.y).slice(1); return true; }
    f.path = [];
    return false;
  },
  areaAt(x: number, y: number): string {
    const a = AREAS.find((a) => x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1);
    return a && this.scene !== 'fortgate' ? a.name : SCENES[this.scene].name;
  },
  updateLocation() {
    const name = this.areaAt(this.player.x, this.player.y);
    if (name !== G.location) {
      G.location = name;
      this.banner = { text: name, t: 0 };
      this.onLocation(name);
    }
  },

  // ========================================================== логика
  update(dt: number) {
    this.updateBeetles(dt);
    this.updateFolk(dt);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 3) this.banner = null; }
    const p = this.player;
    if (this.moveK < 1) {
      this.moveK = Math.min(1, this.moveK + (dt * Debug.speed) / 0.14);
      for (const w of [p, ...this.followers]) { w.rx = lerp(w.fx, w.x, this.moveK); w.ry = lerp(w.fy, w.y, this.moveK); }
      if (this.moveK < 1) return;
      this.updateLocation();
    }
    const k = G.keys;
    let dir: [number, number] | null = null;
    if (k.has('ArrowLeft') || k.has('KeyA')) dir = [-1, 0];
    else if (k.has('ArrowRight') || k.has('KeyD')) dir = [1, 0];
    else if (k.has('ArrowUp') || k.has('KeyW')) dir = [0, -1];
    else if (k.has('ArrowDown') || k.has('KeyS')) dir = [0, 1];
    if (dir) { this.path = []; this.pending = null; this.exitDir = null; this.exitTarget = null; this.step(dir[0], dir[1]); return; }
    if (this.path.length) {
      const n = this.path.shift()!;
      if (!this.step(n.x - p.x, n.y - p.y)) {
        this.path = []; this.pending = null;
        // шли к выходу, а дорогу перегородили — проложить путь заново в обход
        if (this.exitTarget && this.exitTries++ < 20) {
          const reach = bfs(MW, MH, p.x, p.y, (x, y) => !this.blocked(x, y), null, DIRS4);
          if (reach.has(this.exitTarget.y * MW + this.exitTarget.x)) this.path = pathTo(reach, MW, this.exitTarget.x, this.exitTarget.y).slice(1);
        } else { this.exitDir = null; this.exitTarget = null; }
      }
      return;
    }
    if (this.exitDir && this.exitTarget && (p.x !== this.exitTarget.x || p.y !== this.exitTarget.y)) { this.exitDir = null; this.exitTarget = null; }
    if (this.exitDir) { const d = this.exitDir; this.exitDir = null; this.exitTarget = null; this.step(d[0], d[1]); return; }
    if (this.pending) {
      const it = this.pending; this.pending = null;
      if (this.isAdjacent(it)) this.interact(it);
    }
  },

  step(dx: number, dy: number) {
    const p = this.player;
    if (dx) p.flip = dx < 0;
    if (!this.inScene(p.x + dx, p.y + dy)) { this.path = []; this.pending = null; this.onExit(this.scene); return false; }
    if (this.blocked(p.x + dx, p.y + dy)) return false;
    this.trail.unshift({ x: p.x, y: p.y }); this.trail.length = this.followers.length;
    for (const w of [p, ...this.followers]) { w.fx = w.rx; w.fy = w.ry; }
    p.x += dx; p.y += dy;
    this.followers.forEach((f, i) => { const t = this.trail[i]; if (t.x !== f.x) f.flip = t.x < f.x; f.x = t.x; f.y = t.y; });
    this.moveK = 0;
    return true;
  },

  updateBeetles(dt: number) {
    for (const b of this.beetles) {
      const d = Math.hypot(b.tx - b.x, b.ty - b.y);
      if (d < 0.1) {
        if (b.homeward) { b.homeward = false; b.pen = PENS[0]; b.x = 67.5; b.y = 15; b.tx = b.x; b.ty = b.y; b.wait = 2; }
        b.wait -= dt;
        if (b.wait <= 0 && b.pen) {
          b.tx = b.pen.x0 + 1.5 + Math.random() * (b.pen.x1 - b.pen.x0 - 2);
          b.ty = b.pen.y0 + 1.5 + Math.random() * (b.pen.y1 - b.pen.y0 - 2);
          b.wait = 2 + Math.random() * 5;
        }
        continue;
      }
      const sp = (b.homeward ? 2.2 : 0.6) * dt;
      const want = Math.atan2(b.ty - b.y, b.tx - b.x);
      let da = want - b.dir; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      b.dir += clamp(da, -dt * 2, dt * 2);
      if (Math.abs(da) < 0.6) { b.x += Math.cos(b.dir) * Math.min(sp, d); b.y += Math.sin(b.dir) * Math.min(sp, d); }
    }
  },

  isAdjacent(it: Obj | Npc | Beetle | Folk) {
    const p = this.player;
    if ('w' in it && 'h' in it) return p.x >= it.x - 1 && p.x <= it.x + it.w && p.y >= it.y - 1 && p.y <= it.y + it.h && !(p.x >= it.x && p.x < it.x + it.w && p.y >= it.y && p.y < it.y + it.h);
    return Math.abs(Math.round(it.x - ('tx' in it ? 0.5 : 0)) - p.x) + Math.abs(Math.round(it.y - ('tx' in it ? 0.5 : 0)) - p.y) <= ('tx' in it ? 2 : 1);
  },
  adjacentThing(): Obj | Npc | Beetle | Folk | null {
    const p = this.player;
    const facing: [number, number] = p.flip ? [-1, 0] : [1, 0];
    for (const [dx, dy] of [facing, ...DIRS4]) {
      const t = this.thingAt(p.x + dx, p.y + dy);
      if (t && ('talk' in t) && t.talk) return t;
    }
    const b = this.beetles.find((b) => Math.hypot(b.x - 0.5 - p.x, b.y - 0.5 - p.y) < 1.8);
    return b ?? null;
  },
  interactKey() {
    if (this.moveK < 1 || performance.now() - this.lastInteract < 250) return;
    const t = this.adjacentThing();
    if (t) this.interact(t);
  },
  interact(t: Obj | Npc | Beetle | Folk) {
    if (!t.talk) return;
    this.lastInteract = performance.now();
    if ('kind' in t && !('w' in t)) this.player.flip = t.x < this.player.x;
    if ('def' in t) { this.say(t, true); return; } // житель отвечает репликой, без окна диалога
    this.onInteract(t.talk);
  },

  /** Реплика жителя пузырём над головой. talk — обратился игрок: житель останавливается и поворачивается. */
  say(f: Folk, talk = false) {
    f.barkI = (f.barkI + 1) % f.def.barks.length;
    f.bark = { text: tr(f.def.barks[f.barkI]), t: 0 }; // перевод до разбивки на строки
    f.nextBark = 18 + Math.random() * 20;
    if (talk) { f.hold = 3.5; f.flip = this.player.x < f.x; }
  },

  updateFolk(dt: number) {
    const p = this.player;
    for (const f of this.sceneFolk()) {
      if (f.bark && (f.bark.t += dt) > 4.5) f.bark = null;
      const near = Math.abs(f.x - p.x) + Math.abs(f.y - p.y);
      // сами заговаривают, когда герой рядом
      f.nextBark -= dt;
      if (f.nextBark <= 0) { if (near < 6 && G.mode === 'explore') this.say(f); else f.nextBark = 3 + Math.random() * 6; }
      if (f.hold > 0) { f.hold -= dt; f.flip = p.x < f.x; continue; }
      if (f.path.length) {
        const n = f.path[0];
        // впереди герой или другой житель — подождать, потом обойти
        const entering = Math.hypot(n.x - f.x, n.y - f.y) > 0.95;
        if (entering && (this.heroAt(n.x, n.y) || this.folkAt(n.x, n.y, f))) {
          f.blockT += dt;
          if (f.blockT > 1.2) { f.blockT = 0; if (!this.repath(f)) f.wait = 1 + Math.random(); }
          continue;
        }
        f.blockT = 0;
        const dx = n.x - f.x, dy = n.y - f.y, d = Math.hypot(dx, dy), sp = (f.def.speed ?? 1.6) * dt;
        if (Math.abs(dx) > 0.01) f.flip = dx < 0;
        if (d <= sp) { f.x = n.x; f.y = n.y; f.path.shift(); } else { f.x += (dx / d) * sp; f.y += (dy / d) * sp; }
        f.step += sp;
        if (!f.path.length) f.wait = f.def.route[f.i].wait * (0.7 + Math.random() * 0.6);
        continue;
      }
      f.wait -= dt;
      if (f.wait > 0) continue;
      // к следующей точке маршрута
      f.i = (f.i + 1) % f.def.route.length;
      if (!this.repath(f)) f.wait = 1;
    }
  },

  /** Клик в экранных координатах. */
  click(mx: number, my: number) {
    const tx = Math.floor((mx / PS + this.cam.x) / T), ty = Math.floor((my / PS + this.cam.y) / T);
    const p = this.player;
    const reach = bfs(MW, MH, p.x, p.y, (x, y) => !this.blocked(x, y), null, DIRS4);
    const thing = this.thingAt(tx, ty);
    if (thing && thing.talk) {
      if (this.isAdjacent(thing)) { this.interact(thing); return; }
      let best: { x: number; y: number; d: number } | null = null;
      const cand: Pt[] = [];
      if ('w' in thing) { for (let y = thing.y - 1; y <= thing.y + thing.h; y++) for (let x = thing.x - 1; x <= thing.x + thing.w; x++) cand.push({ x, y }); }
      else { const cx = Math.round(thing.x - ('tx' in thing ? 0.5 : 0)), cy = Math.round(thing.y - ('tx' in thing ? 0.5 : 0)); for (const [dx, dy] of DIRS4) cand.push({ x: cx + dx, y: cy + dy }); }
      for (const c of cand) { const n = reach.get(c.y * MW + c.x); if (n && (!best || n.d < best.d)) best = n; }
      if (best) { this.path = pathTo(reach, MW, best.x, best.y).slice(1); this.pending = thing; }
      return;
    }
    if (reach.has(ty * MW + tx) && this.inScene(tx, ty)) { this.path = pathTo(reach, MW, tx, ty).slice(1); this.pending = null; this.exitDir = null; this.exitTarget = null; return; }
    // клик за краем сцены — дойти до ближайшего открытого места на краю и выйти на карту
    const sc0 = SCENES[this.scene], onEdge = tx <= sc0.x0 || tx >= sc0.x1 || ty <= sc0.y0 || ty >= sc0.y1;
    if (!this.inScene(tx, ty) || (onEdge && this.blocked(tx, ty))) {
      const sc = SCENES[this.scene];
      let best: { x: number; y: number; d: number; dir: [number, number] } | null = null;
      for (const n of reach.values()) {
        const dir: [number, number] | null = n.x === sc.x1 ? [1, 0] : n.x === sc.x0 ? [-1, 0] : n.y === sc.y1 ? [0, 1] : n.y === sc.y0 ? [0, -1] : null;
        if (!dir) continue;
        const d = Math.hypot(n.x - tx, n.y - ty) + n.d * 0.15;
        if (!best || d < best.d) best = { x: n.x, y: n.y, d, dir };
      }
      if (best) { this.path = pathTo(reach, MW, best.x, best.y).slice(1); this.pending = null; this.exitDir = best.dir; this.exitTarget = { x: best.x, y: best.y }; this.exitTries = 0; }
    }
  },
  hover(mx: number, my: number) { this.hoverW = { x: Math.floor((mx / PS + this.cam.x) / T), y: Math.floor((my / PS + this.cam.y) / T) }; },

  // ========================================================== отрисовка (пиксельная)
  draw(out: CanvasRenderingContext2D, t: number) {
    const p = this.player, v = this.view!, c = v.c;
    const sc = SCENES[this.scene];
    const sx0 = sc.x0 * T - 30, sx1 = (sc.x1 + 1) * T + 30, sy0 = sc.y0 * T - 30, sy1 = (sc.y1 + 1) * T + 30;
    this.cam.x = Math.round(sx1 - sx0 <= VW ? (sx0 + sx1 - VW) / 2 : clamp(p.rx * T + T / 2 - VW / 2, sx0, sx1 - VW));
    this.cam.y = Math.round(sy1 - sy0 <= VH ? (sy0 + sy1 - VH) / 2 : clamp(p.ry * T + T / 2 - VH / 2, sy0, sy1 - VH));
    const cx = this.cam.x, cy = this.cam.y;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#080a07'; c.fillRect(0, 0, VW, VH);
    c.translate(-cx, -cy);

    // земля чанками
    const CS = 16 * T;
    for (let gy = Math.floor(cy / CS); gy <= Math.floor((cy + VH) / CS); gy++)
      for (let gx = Math.floor(cx / CS); gx <= Math.floor((cx + VW) / CS); gx++) if (gx >= 0 && gy >= 0) c.drawImage(this.chunk(gx, gy), gx * CS, gy * CS);

    const inView = (o: Obj, m = 60) => (o.x + o.w) * T > cx - m && o.x * T < cx + VW + m && (o.y + o.h) * T > cy - m && o.y * T < cy + VH + m;
    for (const o of this.objs) if (!o.block && inView(o) && o.sprite) c.drawImage(o.sprite, o.x * T - o.sx!, o.y * T - o.sy!);
    const steam = this.objs.filter((o) => o.kind === 'vent' && inView(o));

    // всё стоящее — по глубине
    const walking = this.moveK < 1, wf = walking ? 1 + (Math.floor(t * 8) % 2) * 2 : 0;
    const ents: { y: number; d: () => void }[] = [];
    for (const o of this.objs) {
      if (!o.block || !inView(o)) continue;
      const y = o.y + o.h - 0.5;
      if (o.dynamic && o.kind === 'vent' && o.block) ents.push({ y, d: () => { if (o.sprite) c.drawImage(o.sprite, o.x * T - o.sx!, o.y * T - o.sy!); drawSteam(c, o.x * T + 10, o.y * T + 12, t + o.seed * 0.7); } });
      else if (o.dynamic) ents.push({ y, d: () => (o.kind === 'pump' ? drawPumpjack(c, o.x * T, o.y * T, t + o.seed) : drawCampfire(c, o.x * T + 10, o.y * T + 16, t)) });
      else if (o.sprite) ents.push({ y, d: () => c.drawImage(o.sprite!, o.x * T - o.sx!, o.y * T - o.sy!) });
    }
    for (const b of this.beetles) {
      if (b.x * T < cx - 40 || b.x * T > cx + VW + 40 || b.y * T < cy - 40 || b.y * T > cy + VH + 40) continue;
      const moving = Math.hypot(b.tx - b.x, b.ty - b.y) > 0.1;
      ents.push({ y: b.y - 0.5, d: () => {
        const sp = beetleSprite(b.dir, moving ? Math.floor((t + b.seed) * 6) % 2 : 0);
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(Math.round(b.x * T - 12), Math.round(b.y * T + 6), 24, 3);
        c.drawImage(sp, Math.round(b.x * T - sp.width / 2), Math.round(b.y * T - sp.height / 2));
      } });
    }
    for (const n of this.activeNpcs()) {
      const near = Math.abs(n.x - p.x) + Math.abs(n.y - p.y) < 5;
      const bob = Math.sin(t * 1.6 + n.seed) > 0.75 ? 1 : 0;
      // вдалеке от героя именные жители иногда оглядываются
      const flip = near ? p.x < n.x : Math.sin(t * 0.23 + n.seed * 3.1) > 0;
      ents.push({ y: n.y, d: () => drawSprite(c, n.kind, n.x * T + T / 2, n.y * T + T - 1, { flip, bob }) });
    }
    for (const f of this.sceneFolk()) {
      if (f.x * T < cx - 40 || f.x * T > cx + VW + 40 || f.y * T < cy - 50 || f.y * T > cy + VH + 40) continue;
      const moving = f.path.length > 0 && f.hold <= 0;
      const st = f.def.route[f.i], working = !moving && f.hold <= 0 && !!st.work;
      const frame = moving ? [1, 0, 3, 0][Math.floor(f.step * 3.2) % 4] : 0;
      const bob = working ? (Math.sin(t * 5 + f.seed) > 0 ? 1 : 0) : Math.sin(t * 1.4 + f.seed) > 0.8 ? 1 : 0;
      ents.push({ y: f.y, d: () => drawSprite(c, f.kind, f.x * T + T / 2, f.y * T + T - 1, { flip: f.flip, frame, bob }) });
    }
    this.followers.forEach((f, i) => ents.push({ y: f.ry - 0.01, d: () => drawSprite(c, G.squad[i + 1]?.look ?? f.kind, f.rx * T + T / 2, f.ry * T + T - 1, { flip: f.flip, frame: wf }) }));
    ents.push({ y: p.ry, d: () => drawSprite(c, G.squad[0]?.look ?? 'pc', p.rx * T + T / 2, p.ry * T + T - 1, { flip: p.flip, frame: wf, bob: !walking && Math.sin(t * 1.6) > 0.75 ? 1 : 0 }) });
    ents.sort((a, b) => a.y - b.y).forEach((e) => e.d());

    for (const o of steam) drawSteam(c, o.x * T + 10, o.y * T + 12, t + o.seed * 0.7);
    // дым из заводских труб
    for (const o of this.objs) {
      if (o.kind !== 'factory' || !inView(o, 140)) continue;
      const W = o.w * T, wy = o.y * T + o.h * T - 52;
      for (const fx of [0.22, 0.72]) drawSmoke(c, o.x * T + Math.round(W * fx) + 3, wy - 66, t + o.seed * 1.3 + fx * 4);
    }
    // за пределами сцены — мгла пустоши (ступенчатая, по-пиксельному)
    {
      const X0 = sc.x0 * T, X1 = (sc.x1 + 1) * T, Y0 = sc.y0 * T, Y1 = (sc.y1 + 1) * T;
      c.fillStyle = '#080a07';
      c.fillRect(cx - 4, cy - 4, X0 - cx + 4, VH + 8); c.fillRect(X1, cy - 4, cx + VW - X1 + 4, VH + 8);
      c.fillRect(cx - 4, cy - 4, VW + 8, Y0 - cy + 4); c.fillRect(cx - 4, Y1, VW + 8, cy + VH - Y1 + 4);
      for (let k = 0; k < 4; k++) {
        c.fillStyle = `rgba(8,10,7,${0.75 - k * 0.18})`;
        const d = k * 6;
        c.fillRect(X0 + d, Y0, 6, Y1 - Y0); c.fillRect(X1 - d - 6, Y0, 6, Y1 - Y0);
        c.fillRect(X0, Y0 + d, X1 - X0, 6); c.fillRect(X0, Y1 - d - 6, X1 - X0, 6);
      }
    }

    // пепел — по одному пикселю
    for (let i = 0; i < 46; i++) {
      const x = cx + ((i * 97 + t * (6 + (i % 4) * 3)) % VW), y = cy + ((i * 53 + t * (9 + (i % 3) * 4)) % VH);
      ppx(c, x, y, i % 3 ? '#8a8c7a' : '#6a6c5c');
    }
    c.setTransform(1, 0, 0, 1, 0, 0);

    // свет
    const lights: PLight[] = [];
    const L = (x: number, y: number, r: number, a: number, color?: string) => { const lx = x - cx, ly = y - cy; if (lx > -r && lx < VW + r && ly > -r && ly < VH + r) lights.push({ x: lx, y: ly, r, a, color }); };
    for (const o of this.objs) {
      if (!o.lights || !inView(o, 100)) continue;
      for (const l of o.lights) {
        const a = o.kind === 'lamp' ? flicker(t, o.seed, o.seed % 3 === 0) : o.kind === 'campfire' ? 0.85 + Math.sin(t * 11 + o.seed) * 0.12 : (l.a ?? 0.7);
        L(o.x * T + l.x, o.y * T + l.y, l.r, a, l.color);
      }
    }
    { const lamp = lampLevel(); L(p.rx * T + T / 2, p.ry * T + T / 2, [74, 104, 136][lamp], [0.8, 0.88, 0.95][lamp], lamp === 2 ? '#e8ecd8' : '#d8c890'); } // свет героя; фонарь — шире
    const wl = Weather.light([0.82, 1, 0.76], 0.35);
    applyLight(c, VW, VH, lights, wl.ambient, wl.tint, wl.vig);
    Weather.draw(c, VW, VH, t, cx, cy);
    v.present(out);

    if (G.mode === 'explore') { this.drawBarks(out, cx, cy); this.drawPrompts(out, cx, cy); }
    if (this.banner) this.drawBanner(out);
  },

  /** Подписи «[E] …» — чёткий текст поверх пиксельного мира (экранные координаты). */
  drawPrompts(c: CanvasRenderingContext2D, cx: number, cy: number) {
    const adj = this.moveK >= 1 ? this.adjacentThing() : null;
    const hv = this.hoverW ? this.thingAt(this.hoverW.x, this.hoverW.y) : null;
    for (const it of [adj, hv]) {
      if (!it || !it.name) continue;
      const label = it === adj ? `[E] ${it.name}` : it.name;
      c.font = '13px "Old Standard TT", Georgia, serif';
      const w = c.measureText(label).width + 12;
      const lx = 'w' in it ? (it.x + it.w / 2) * T : 'tx' in it ? it.x * T : it.x * T + T / 2;
      const ly = 'w' in it ? it.y * T - 22 : 'tx' in it ? it.y * T - 26 : it.y * T - 30;
      const ix = (lx - cx) * PS, iy = (ly - cy) * PS;
      c.fillStyle = 'rgba(8,12,7,0.88)'; c.fillRect(ix - w / 2, iy, w, 18);
      c.strokeStyle = it === adj ? '#c09a52' : '#4b5838'; c.lineWidth = 1; c.strokeRect(ix - w / 2 + 0.5, iy + 0.5, w - 1, 17);
      c.fillStyle = '#e0dcc0'; c.textAlign = 'center'; c.fillText(label, ix, iy + 13); c.textAlign = 'left';
      if (it === hv) break;
    }
  },

  /** Реплики жителей — пузыри над головой, чёткий текст поверх пиксельного мира. */
  drawBarks(c: CanvasRenderingContext2D, cx: number, cy: number) {
    c.font = 'italic 13px "Old Standard TT", Georgia, serif';
    for (const f of this.sceneFolk()) {
      if (!f.bark) continue;
      const a = Math.min(1, f.bark.t * 5, (4.5 - f.bark.t) * 2);
      const words = f.bark.text.split(' '), lines: string[] = [];
      let cur = '';
      for (const w of words) { const tst = cur ? cur + ' ' + w : w; if (c.measureText(tst).width > 230 && cur) { lines.push(cur); cur = w; } else cur = tst; }
      lines.push(cur);
      const w = Math.max(...lines.map((l) => c.measureText(l).width)) + 16, h = lines.length * 16 + 8;
      const hx = (f.x * T + T / 2 - cx) * PS, hy = (f.y * T - 30 - cy) * PS;
      const x = clamp(hx - w / 2, 6, 954 - w), y = Math.max(6, hy - h - 8);
      c.save(); c.globalAlpha = Math.max(0, a);
      c.fillStyle = 'rgba(14,18,11,0.92)'; c.fillRect(x, y, w, h);
      c.strokeStyle = '#8a7a52'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      // хвостик к говорящему
      c.fillStyle = 'rgba(14,18,11,0.92)'; c.beginPath(); c.moveTo(hx - 5, y + h - 1); c.lineTo(hx + 5, y + h - 1); c.lineTo(hx, y + h + 7); c.fill();
      c.strokeStyle = '#8a7a52'; c.beginPath(); c.moveTo(hx - 5, y + h); c.lineTo(hx, y + h + 7); c.lineTo(hx + 5, y + h); c.stroke();
      c.fillStyle = '#e0dcc0';
      lines.forEach((l, k) => c.fillText(l, x + 8, y + 17 + k * 16));
      c.restore();
    }
  },

  drawBanner(c: CanvasRenderingContext2D) {
    const b = this.banner!, a = Math.min(1, b.t * 3, (3 - b.t) * 1.5);
    c.save(); c.globalAlpha = Math.max(0, a);
    c.font = 'bold 28px "Playfair Display SC", "Old Standard TT", serif'; c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillText(b.text, 482, 112);
    c.fillStyle = '#ddd3ae'; c.fillText(b.text, 480, 110);
    c.fillStyle = 'rgba(192,154,82,0.8)'; c.fillRect(340, 122, 280, 2);
    c.restore();
  },

  // ---------------------------------------------------------- земля (чанки)
  chunk(gx: number, gy: number): HTMLCanvasElement {
    const key = gy * 100 + gx;
    const cached = this.chunks.get(key);
    if (cached) return cached;
    const CSZ = 16, cv = document.createElement('canvas'); cv.width = CSZ * T; cv.height = CSZ * T;
    const c = cv.getContext('2d')!;
    const r = seeded(key * 31 + 7);
    for (let ty = 0; ty < CSZ; ty++) for (let tx = 0; tx < CSZ; tx++) {
      const x = gx * CSZ + tx, y = gy * CSZ + ty, X = tx * T, Y = ty * T;
      if (!this.inMap(x, y)) { c.fillStyle = '#0c0d0a'; c.fillRect(X, Y, T, T); continue; }
      const g = this.ground[y][x];
      if (g === 't') { const fl = (dx: number, dy: number) => { const n = this.ground[y + dy]?.[x + dx]; return !!n && n !== 't'; }; paintTrenchEarth(c, X, Y, r, fl); }
      else if (g === 'd') { const t = (dx: number, dy: number) => this.ground[y + dy]?.[x + dx] === 't'; paintTrenchFloor(c, X, Y, r, t(0, -1) || t(0, 1) || !(t(-1, 0) || t(1, 0))); }
      else paintTile(c, X, Y, g, r, this.ground[y][x - 1] === 'r' || this.ground[y][x + 1] === 'r');
      if (this.rail[y][x]) paintRail(c, X, Y);
    }
    // стрелки — поверх земли, после всех клеток чанка: шпалы поперёк, два рельса
    for (const sw of this.switches) {
      const ax = (sw.x0 - gx * CSZ) * T, ay = (sw.y0 - gy * CSZ) * T, bx = (sw.x1 - gx * CSZ) * T, by = (sw.y1 - gy * CSZ) * T;
      if (Math.max(ax, bx) < 0 || Math.min(ax, bx) > CSZ * T || Math.max(ay, by) < -T || Math.min(ay, by) > CSZ * T) continue;
      const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
      for (let k = 2; k < len; k += 5) { const x = ax + ux * k, y = ay + uy * k + 10; pline(c, x - 1, y - 6, x + 1, y + 6, '#3a2c1e', 2); }
      for (const [o, col] of [[6, '#8a8a82'], [7, '#4a4a44'], [13, '#8a8a82'], [14, '#4a4a44']] as [number, string][]) pline(c, ax, ay + o, bx, by + o, col);
    }
    this.chunks.set(key, cv);
    return cv;
  },

  // ---------------------------------------------------------- спрайты статичных объектов
  renderSprites() {
    for (const o of this.objs) {
      if (o.dynamic && o.kind !== 'vent') { if (o.kind === 'campfire') o.lights = [{ x: 10, y: 12, r: 90, color: o.talk === 'coven_fire' ? '#9aff60' : '#f0a050' }]; continue; }
      const horizFence = o.kind === 'fence' && this.objs.some((f) => f.kind === 'fence' && f.y === o.y && Math.abs(f.x - o.x) === 1);
      const s = objSprite(o as any, { horizFence });
      o.sprite = s.cv; o.sx = s.sx; o.sy = s.sy;
      o.lights = s.lights.length ? s.lights : undefined;
    }
  },
};
