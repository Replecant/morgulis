// ============================================================
//  Регион: серая земля под зелёным светом.
//  Эшфорд (масло), Ричморд (жуки), тракт и железная дорога к форту барона.
//  Большая карта с камерой; статичные объекты рисуются один раз в спрайты.
// ============================================================
import { G } from './state';
import { bfs, pathTo, DIRS4, lerp, seeded, TAU, Pt, clamp } from './util';
import { flicker } from './gfx';
import { PixelView, applyLight, PLight, T, LW, LH, PS, ppx } from './px';
import { drawSprite, beetleSprite } from './sprites';
import { paintTile, paintRail, objSprite, drawPumpjack, drawCampfire } from './pxworld';
import { FOLK, FolkDef } from './folk';

/** Клетка на экране (низкое разрешение ×2). */
export const ET = T * PS;
export const MW = 186, MH = 72; // восточнее x=103 — форт: Нижний и Средний город
const VW = LW, VH = LH; // видимая область в пикселях низкого разрешения

type Ground = 'w' | 'g' | 'r' | 'p' | 'o' | 'k' | 'f' | 'm' | 'x';
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
];
/** Локальные сцены — участки большой карты. Уход за край сцены возвращает на глобальную карту. */
export const SCENES: Record<string, { name: string; x0: number; y0: number; x1: number; y1: number; entry: Pt }> = {
  ashford:  { name: 'Эшфорд', x0: 3, y0: 30, x1: 37, y1: 63, entry: { x: 35, y: 43 } },
  richmord: { name: 'Ричморд', x0: 55, y0: 3, x1: 94, y1: 39, entry: { x: 57, y: 20 } },
  fenmor:   { name: 'Фенмор', x0: 1, y0: 1, x1: 36, y1: 28, entry: { x: 19, y: 27 } },
  fortgate: { name: 'Ворота форта', x0: 86, y0: 38, x1: 103, y1: 66, entry: { x: 88, y: 49 } },
  // форт — город в три яруса: внизу трущобы и заводы, выше рынки и мастерские, на самом верху — только по пропуску
  fort1:    { name: 'Нижний город', x0: 100, y0: 28, x1: 147, y1: 70, entry: { x: 103, y: 49 } },
  fort2:    { name: 'Средний город', x0: 144, y0: 31, x1: 184, y1: 67, entry: { x: 147, y: 49 } },
};
const PENS = [{ x0: 62, y0: 9, x1: 73, y1: 17, gx: 67 }, { x0: 77, y0: 10, x1: 88, y1: 18, gx: 82 }];

export const Explore = {
  ground: [] as Ground[][],
  rail: [] as number[][],          // 0 — нет, 1 — рельсы
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
    fill('f', 103, 0, MW - 103, MH);
    fill('o', 103, 30, 42, 39);   // Нижний город: грязь, масло, сажа
    fill('p', 147, 33, 34, 33);   // Средний город: утоптанная земля
    fill('k', 155, 45, 17, 11);   // рыночная площадь — дощатый настил

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
    road([[54, 45], [54, 30], [58, 24], [60, 20], [92, 20]]);
    road([[54, 32], [92, 32]]); // нижняя улица Ричморда
    road([[22, 43], [22, 57]]);
    road([[22, 43], [22, 30]]);
    road([[19, 28], [19, 14]]);
    // улицы форта
    road([[103, 49], [146, 49]]); road([[114, 30], [114, 68]]); road([[127, 30], [127, 68]]); road([[138, 51], [138, 68]]);
    road([[147, 49], [182, 49]]); road([[163, 33], [163, 65]]);

    // масляные пятна вокруг качалок
    const PUMPS: [number, number][] = [[9, 34], [32, 34], [18, 48], [33, 52], [11, 44]];
    for (const [x, y] of PUMPS) blob('o', x + 1, y + 1, 2);
    for (let i = 0; i < 14; i++) blob('o', Math.floor(r() * 100), Math.floor(r() * MH), 0);

    // железная дорога: главный путь и запасной у разъезда
    for (let x = 0; x <= 102; x++) this.rail[61][x] = 1;
    for (let x = 10; x <= 34; x++) this.rail[59][x] = 1;
    this.rail[60][9] = 1; this.rail[60][35] = 1;
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
    // фонари Эшфорда
    for (const [x, y] of [[12, 42], [20, 42], [28, 45], [21, 50], [24, 56], [10, 56], [34, 45]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    for (const [x, y] of [[21, 39], [11, 45], [24, 51], [17, 52], [34, 49]]) B('barrel', x, y, 1, 1);

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
    for (const [x, y] of [[62, 21], [76, 21], [88, 21]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
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
    // ворота форта
    for (let y = 0; y < MH; y++) if (y < 48 || y > 52) if (y < 60 || y > 62) B('wall', 101, y, 2, 1);
    B('gate', 101, 48, 2, 5, { name: 'Ворота форта', talk: 'fortgate' });
    B('railgate', 101, 60, 2, 3, { name: 'Железнодорожные ворота', talk: 'railgate' });
    for (const y of [8, 20, 32, 44, 54, 66]) B('tower', 100, y, 3, 3, { name: 'Башня форта', talk: 'tower' });
    for (const [x, y] of [[98, 47], [98, 53], [98, 59], [98, 63]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    for (const [x, y] of [[93, 44], [95, 44], [93, 46]]) B('barrel', x, y, 1, 1, { name: 'Товар маркитанта', talk: 'sutler_goods' });

    // ---------------- Нижний город: трущобы и заводы
    const taken = (x: number, y: number, w: number, h: number) => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const g = this.ground[yy]?.[xx];
        if (!g || g === 'r' || g === 'f') return true;
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
    for (const [x, y] of [[110, 47], [124, 52], [135, 47], [106, 52], [141, 56]]) B('campfire', x, y, 1, 1, { dynamic: true, name: 'Уличный костёр', talk: 'slumfire' });
    for (const [x, y] of [[108, 48], [131, 51]]) B('lamp', x, y, 1, 1, { name: 'Фонарь', talk: 'lamp' });
    for (const row of [36, 39, 42, 45, 52, 55, 58, 61]) {
      for (let x = 104; x < 144;) {
        const w = 2 + Math.floor(r() * 2);
        if (!taken(x, row, w, 2) && x + w <= 144) B('shack', x, row, w, 2, { name: 'Лачуга', talk: 'shack' });
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
    for (const row of [34, 38, 42, 57, 61]) {
      for (let x = 147; x < 181;) {
        const w = 3;
        if (!taken(x, row, w, 3) && x + w <= 181) B('tenement', x, row, w, 3, { name: 'Дом', talk: 'tenement' });
        x += w + (r() < 0.25 ? 1 : 0);
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

    // блокировка клеток
    for (const o of this.objs) if (o.block) for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (this.inMap(x, y)) this.block[y][x] = true;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (this.ground[y][x] === 'f' || this.ground[y][x] === 'x') this.block[y][x] = true;

    // ---------------- жители
    const NPC = (id: string, name: string, kind: string, x: number, y: number, talk: string, cond?: () => boolean) => this.npcs.push({ id, name, kind, x, y, talk, cond, seed: this.npcs.length * 1.7 });
    NPC('oldos', 'Олдос, смотритель', 'elder', 21, 58, 'oldos');
    NPC('ida', 'Ида Кроу', 'foreman', 27, 41, 'ida');
    NPC('burk', 'Бёрк, нефтяник', 'oilworker', 34, 36, 'burk');
    NPC('nell', 'Нелл', 'widow', 26, 50, 'nell');
    NPC('wallace', 'Уоллес, погонщик', 'herder', 66, 19, 'wallace');
    NPC('hob', 'Хоб, мясник', 'butcher', 75, 26, 'hob');
    NPC('penny', 'Пенни, пастушка', 'girl', 84, 19, 'penny');
    NPC('agnes', 'Агнес, старшая грибница', 'grower', 10, 23, 'agnes');
    NPC('toby', 'Тоби, сборщик', 'picker', 7, 18, 'toby');
    NPC('abe', 'Слепой Эйб', 'miner', 21, 15, 'abe');
    NPC('guard1', 'Стражник', 'guard', 99, 48, 'guard');
    NPC('guard2', 'Стражник', 'guard', 99, 52, 'guard');
    NPC('sutler', 'Маркитант', 'sutler', 94, 45, 'sutler');
    NPC('upper1', 'Стража Верхнего города', 'guard', 179, 46, 'upper_guard');
    NPC('upper2', 'Стража Верхнего города', 'guard', 179, 52, 'upper_guard');

    // ---------------- жуки
    const names = ['Граф', 'Пудинг', 'Чернушка', 'Старый Бен', 'Ржавый', 'Тихоня', 'Жвала'];
    let n = 0;
    for (const p of PENS) for (let i = 0; i < (p === PENS[0] ? 4 : 3); i++) {
      const x = p.x0 + 2 + r() * (p.x1 - p.x0 - 4), y = p.y0 + 2 + r() * (p.y1 - p.y0 - 4);
      this.beetles.push({ id: 'b' + n, x, y, tx: x, ty: y, pen: p, dir: r() * TAU, seed: r() * 10, wait: r() * 3, talk: 'beetle', name: `Жук «${names[n++ % names.length]}»`, scale: 0.9 + r() * 0.3 });
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
    // вернувшаяся жучиха Мэг появляется в загоне
    if (id === 'richmord' && G.flags.beetleDone && !this.beetles.some((b) => b.id === 'meg')) {
      const pen = PENS[0];
      this.beetles.push({ id: 'meg', x: 67.5, y: 13, tx: 67.5, ty: 13, pen, dir: 0, seed: 3, wait: 1, talk: 'meg_home', name: 'Жучиха Мэг', scale: 1.15 });
    }
    G.location = '';
    this.updateLocation();
  },
  inScene(x: number, y: number) { const s = SCENES[this.scene]; return x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1; },

  inMap(x: number, y: number) { return x >= 0 && y >= 0 && x < MW && y < MH; },
  activeNpcs() { return this.npcs.filter((n) => !n.cond || n.cond()); },
  /** Жители текущей сцены. */
  sceneFolk() { return this.folk.filter((f) => f.def.scene === this.scene); },
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
      this.moveK = Math.min(1, this.moveK + dt / 0.14);
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
    if (dir) { this.path = []; this.pending = null; this.step(dir[0], dir[1]); return; }
    if (this.path.length) {
      const n = this.path.shift()!;
      if (!this.step(n.x - p.x, n.y - p.y)) { this.path = []; this.pending = null; }
      return;
    }
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
    f.bark = { text: f.def.barks[f.barkI], t: 0 };
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
    if (reach.has(ty * MW + tx)) { this.path = pathTo(reach, MW, tx, ty).slice(1); this.pending = null; }
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

    // всё стоящее — по глубине
    const walking = this.moveK < 1, wf = walking ? 1 + (Math.floor(t * 8) % 2) * 2 : 0;
    const ents: { y: number; d: () => void }[] = [];
    for (const o of this.objs) {
      if (!o.block || !inView(o)) continue;
      const y = o.y + o.h - 0.5;
      if (o.dynamic) ents.push({ y, d: () => (o.kind === 'pump' ? drawPumpjack(c, o.x * T, o.y * T, t + o.seed) : drawCampfire(c, o.x * T + 10, o.y * T + 16, t)) });
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
    L(p.rx * T + T / 2, p.ry * T + T / 2, 74, 0.8, '#d8c890');
    applyLight(c, VW, VH, lights, 0.6, [0.82, 1, 0.76]);
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
      paintTile(c, X, Y, g, r, this.ground[y][x - 1] === 'r' || this.ground[y][x + 1] === 'r');
      if (this.rail[y][x]) paintRail(c, X, Y);
    }
    this.chunks.set(key, cv);
    return cv;
  },

  // ---------------------------------------------------------- спрайты статичных объектов
  renderSprites() {
    for (const o of this.objs) {
      if (o.dynamic) { if (o.kind === 'campfire') o.lights = [{ x: 10, y: 12, r: 90, color: '#f0a050' }]; continue; }
      const horizFence = o.kind === 'fence' && this.objs.some((f) => f.kind === 'fence' && f.y === o.y && Math.abs(f.x - o.x) === 1);
      const s = objSprite(o as any, { horizFence });
      o.sprite = s.cv; o.sx = s.sx; o.sy = s.sy;
      o.lights = s.lights.length ? s.lights : undefined;
    }
  },
};
