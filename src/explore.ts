// ============================================================
//  Регион: серая земля под зелёным светом.
//  Эшфорд (масло), Ричморд (жуки), тракт и железная дорога к форту барона.
//  Большая карта с камерой; статичные объекты рисуются один раз в спрайты.
// ============================================================
import { G } from './state';
import { bfs, pathTo, DIRS4, lerp, seeded, TAU, Pt, clamp } from './util';
import { drawFigure, Lighting, Light, flicker, drawDeadTree, drawCrate, drawAsh, vignette } from './gfx';

export const ET = 32;
export const MW = 112, MH = 72;
const VW = 960, VH = 640;
const PX = MW * ET, PY = MH * ET;

type Ground = 'w' | 'g' | 'r' | 'p' | 'o' | 'k' | 'f' | 'm' | 'x';
// w — пустошь, g — деревенская земля, r — дорога, p — загон (грязь), o — пропитанная маслом земля, k — дощатый перрон, f — за стеной форта,
// m — мшистая болотная земля, x — болотная вода (непроходима)

interface Obj {
  kind: string; x: number; y: number; w: number; h: number;
  block: boolean; name?: string; talk?: string; seed: number;
  sprite?: HTMLCanvasElement; sx?: number; sy?: number;     // спрайт и его смещение
  lights?: { x: number; y: number; r: number; color: string; a?: number }[];
  dynamic?: boolean;
}
interface Npc { id: string; name: string; kind: string; x: number; y: number; talk: string; cond?: () => boolean; seed: number; face?: number }
interface Beetle { id: string; x: number; y: number; tx: number; ty: number; pen: { x0: number; y0: number; x1: number; y1: number } | null; dir: number; seed: number; wait: number; talk: string; name: string; scale: number; homeward?: boolean }
interface Walker { kind: string; x: number; y: number; rx: number; ry: number; fx: number; fy: number; flip: boolean }

// ------------------------------------------------------------ области (для названий мест)
const AREAS: { name: string; x0: number; y0: number; x1: number; y1: number }[] = [
  { name: 'Разъезд Эшфорд', x0: 6, y0: 55, x1: 37, y1: 63 },
  { name: 'Эшфорд', x0: 5, y0: 31, x1: 37, y1: 57 },
  { name: 'Ричморд', x0: 57, y0: 5, x1: 93, y1: 31 },
];
/** Локальные сцены — участки большой карты. Уход за край сцены возвращает на глобальную карту. */
export const SCENES: Record<string, { name: string; x0: number; y0: number; x1: number; y1: number; entry: Pt }> = {
  ashford:  { name: 'Эшфорд', x0: 3, y0: 30, x1: 37, y1: 63, entry: { x: 35, y: 43 } },
  richmord: { name: 'Ричморд', x0: 55, y0: 3, x1: 94, y1: 31, entry: { x: 57, y: 20 } },
  fenmor:   { name: 'Фенмор', x0: 1, y0: 1, x1: 36, y1: 28, entry: { x: 19, y: 27 } },
  fortgate: { name: 'Ворота форта', x0: 86, y0: 38, x1: 103, y1: 66, entry: { x: 88, y: 49 } },
};
const PENS = [{ x0: 62, y0: 9, x1: 73, y1: 17, gx: 67 }, { x0: 77, y0: 10, x1: 88, y1: 18, gx: 82 }];

export const Explore = {
  ground: [] as Ground[][],
  rail: [] as number[][],          // 0 — нет, 1 — рельсы
  block: [] as boolean[][],
  objs: [] as Obj[],
  npcs: [] as Npc[],
  beetles: [] as Beetle[],
  chunks: new Map<number, HTMLCanvasElement>(),
  light: null as Lighting | null,
  player: null as unknown as Walker,
  followers: [] as Walker[],
  trail: [] as Pt[],
  moveK: 1,
  path: [] as Pt[],
  pending: null as Obj | Npc | Beetle | null,
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
    fill('g', 57, 5, 36, 26);
    // Фенмор: болотистая низина с грибными грядками
    fill('m', 2, 2, 34, 26);
    for (const [x, y, rr] of [[3, 7, 1], [32, 7, 2], [32, 23, 2], [15, 25, 1], [26, 27, 1]]) blob('x', x, y, rr);
    for (const p of PENS) fill('p', p.x0 + 1, p.y0 + 1, p.x1 - p.x0 - 1, p.y1 - p.y0 - 1);
    // форт: всё восточнее стены — недоступно
    fill('f', 103, 0, MW - 103, MH);

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
    road([[22, 43], [22, 57]]);
    road([[22, 43], [22, 30]]);
    road([[19, 28], [19, 14]]);

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

    // случайные камни, деревья и воронки в пустоши
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
      else if (k < 0.9) { if (free(x, y, 2, 2)) add({ kind: 'crater', x, y, w: 2, h: 2, block: false }); }
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

    // ---------------- жуки
    const names = ['Граф', 'Пудинг', 'Чернушка', 'Старый Бен', 'Ржавый', 'Тихоня', 'Жвала'];
    let n = 0;
    for (const p of PENS) for (let i = 0; i < (p === PENS[0] ? 4 : 3); i++) {
      const x = p.x0 + 2 + r() * (p.x1 - p.x0 - 4), y = p.y0 + 2 + r() * (p.y1 - p.y0 - 4);
      this.beetles.push({ id: 'b' + n, x, y, tx: x, ty: y, pen: p, dir: r() * TAU, seed: r() * 10, wait: r() * 3, talk: 'beetle', name: `Жук «${names[n++ % names.length]}»`, scale: 0.9 + r() * 0.3 });
    }

    // ---------------- игрок
    const mk = (kind: string, x: number, y: number): Walker => ({ kind, x, y, rx: x, ry: y, fx: x, fy: y, flip: false });
    this.player = mk('pc', 24, 58);
    this.followers = [];
    this.trail = [];
    this.light = this.light ?? new Lighting(VW, VH);
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
  thingAt(x: number, y: number): Obj | Npc | Beetle | null {
    const npc = this.activeNpcs().find((n) => n.x === x && n.y === y);
    if (npc) return npc;
    const b = this.beetles.find((b) => Math.round(b.x - 0.5) === x && Math.round(b.y - 0.5) === y);
    if (b) return b;
    return this.objs.find((o) => o.talk && x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) ?? null;
  },
  blocked(x: number, y: number) {
    if (!this.inMap(x, y)) return true;
    return this.block[y][x] || this.activeNpcs().some((n) => n.x === x && n.y === y);
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

  isAdjacent(it: Obj | Npc | Beetle) {
    const p = this.player;
    if ('w' in it && 'h' in it) return p.x >= it.x - 1 && p.x <= it.x + it.w && p.y >= it.y - 1 && p.y <= it.y + it.h && !(p.x >= it.x && p.x < it.x + it.w && p.y >= it.y && p.y < it.y + it.h);
    return Math.abs(Math.round(it.x - ('tx' in it ? 0.5 : 0)) - p.x) + Math.abs(Math.round(it.y - ('tx' in it ? 0.5 : 0)) - p.y) <= ('tx' in it ? 2 : 1);
  },
  adjacentThing(): Obj | Npc | Beetle | null {
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
  interact(t: Obj | Npc | Beetle) {
    if (!t.talk) return;
    this.lastInteract = performance.now();
    if ('kind' in t && !('w' in t)) this.player.flip = t.x < this.player.x;
    this.onInteract(t.talk);
  },

  /** Клик в экранных координатах. */
  click(mx: number, my: number) {
    const tx = Math.floor((mx + this.cam.x) / ET), ty = Math.floor((my + this.cam.y) / ET);
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
  hover(mx: number, my: number) { this.hoverW = { x: Math.floor((mx + this.cam.x) / ET), y: Math.floor((my + this.cam.y) / ET) }; },

  // ========================================================== отрисовка
  draw(c: CanvasRenderingContext2D, t: number) {
    const p = this.player;
    const sc = SCENES[this.scene];
    const sx0 = sc.x0 * ET - 64, sx1 = (sc.x1 + 1) * ET + 64, sy0 = sc.y0 * ET - 64, sy1 = (sc.y1 + 1) * ET + 64;
    this.cam.x = sx1 - sx0 <= VW ? (sx0 + sx1 - VW) / 2 : clamp(p.rx * ET + 16 - VW / 2, sx0, sx1 - VW);
    this.cam.y = sy1 - sy0 <= VH ? (sy0 + sy1 - VH) / 2 : clamp(p.ry * ET + 16 - VH / 2, sy0, sy1 - VH);
    const cx = Math.round(this.cam.x), cy = Math.round(this.cam.y);
    c.save();
    c.translate(-cx, -cy);

    // земля чанками
    const CS = 16 * ET;
    for (let gy = Math.floor(cy / CS); gy <= Math.floor((cy + VH) / CS); gy++)
      for (let gx = Math.floor(cx / CS); gx <= Math.floor((cx + VW) / CS); gx++) c.drawImage(this.chunk(gx, gy), gx * CS, gy * CS);

    // плоские объекты (воронки, кости)
    const inView = (o: Obj, m = 120) => o.x * ET + o.w * ET > cx - m && o.x * ET < cx + VW + m && o.y * ET + o.h * ET > cy - m && o.y * ET < cy + VH + m;
    for (const o of this.objs) if (!o.block && inView(o) && o.sprite) c.drawImage(o.sprite, o.x * ET - o.sx!, o.y * ET - o.sy!);

    // всё стоящее — по глубине
    const ents: { y: number; d: () => void }[] = [];
    for (const o of this.objs) {
      if (!o.block || !inView(o)) continue;
      const y = o.y + o.h - 0.5;
      if (o.dynamic) ents.push({ y, d: () => this.drawDynamic(c, o, t) });
      else if (o.sprite) ents.push({ y, d: () => c.drawImage(o.sprite!, o.x * ET - o.sx!, o.y * ET - o.sy!) });
    }
    for (const b of this.beetles) if (b.x * ET > cx - 80 && b.x * ET < cx + VW + 80 && b.y * ET > cy - 80 && b.y * ET < cy + VH + 80) ents.push({ y: b.y - 0.5, d: () => drawBeetle(c, b.x * ET, b.y * ET, b.dir, t + b.seed, b.scale, Math.hypot(b.tx - b.x, b.ty - b.y) > 0.1) });
    for (const n of this.activeNpcs()) {
      const near = Math.abs(n.x - p.x) + Math.abs(n.y - p.y) < 5;
      ents.push({ y: n.y, d: () => drawFigure(c, n.kind, n.x * ET + 16, n.y * ET + 29, 0.95, { t, seed: n.seed, flip: near ? p.x < n.x : n.x > 60 }) });
    }
    this.followers.forEach((f, i) => ents.push({ y: f.ry - 0.01, d: () => drawFigure(c, G.squad[i + 1]?.look ?? f.kind, f.rx * ET + 16, f.ry * ET + 29, 0.95, { t, seed: i + 1, flip: f.flip }) }));
    ents.push({ y: p.ry, d: () => drawFigure(c, G.squad[0]?.look ?? 'pc', p.rx * ET + 16, p.ry * ET + 29, 0.95, { t, flip: p.flip }) });
    ents.sort((a, b) => a.y - b.y).forEach((e) => e.d());

    // тени облаков
    for (let i = 0; i < 6; i++) {
      const ox = ((i * 900 + t * 14) % (PX + 1200)) - 600, oy = (i * 613) % PY;
      const g = c.createRadialGradient(ox, oy, 0, ox, oy, 420);
      g.addColorStop(0, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(ox - 420, oy - 420, 840, 840);
    }
    // за пределами сцены — мгла пустоши
    {
      const X0 = sc.x0 * ET, X1 = (sc.x1 + 1) * ET, Y0 = sc.y0 * ET, Y1 = (sc.y1 + 1) * ET, F = 72;
      c.fillStyle = '#080a07';
      c.fillRect(cx - 10, cy - 10, X0 - cx + 10, VH + 20); c.fillRect(X1, cy - 10, cx + VW - X1 + 10, VH + 20);
      c.fillRect(cx - 10, cy - 10, VW + 20, Y0 - cy + 10); c.fillRect(cx - 10, Y1, VW + 20, cy + VH - Y1 + 10);
      const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
        const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(8,10,7,0.95)'); g.addColorStop(1, 'rgba(8,10,7,0)');
        c.fillStyle = g; c.fillRect(rx, ry, rw, rh);
      };
      edge(X0, 0, X0 + F, 0, X0, Y0, F, Y1 - Y0); edge(X1, 0, X1 - F, 0, X1 - F, Y0, F, Y1 - Y0);
      edge(0, Y0, 0, Y0 + F, X0, Y0, X1 - X0, F); edge(0, Y1, 0, Y1 - F, X0, Y1 - F, X1 - X0, F);
    }
    c.restore();

    // свет (в экранных координатах)
    const lights: Light[] = [];
    const L = (x: number, y: number, r: number, a: number, color?: string) => { const sx = x - cx, sy = y - cy; if (sx > -r && sx < VW + r && sy > -r && sy < VH + r) lights.push({ x: sx, y: sy, r, a, color }); };
    for (const o of this.objs) {
      if (!o.lights || !inView(o, 200)) continue;
      for (const l of o.lights) {
        const a = o.kind === 'lamp' ? flicker(t, o.seed, o.seed % 3 === 0) : o.kind === 'campfire' ? 0.8 + Math.sin(t * 11 + o.seed) * 0.12 : (l.a ?? 0.7) + Math.sin(t * 3 + l.x) * 0.06;
        L(o.x * ET + l.x, o.y * ET + l.y, l.r, a, l.color);
      }
    }
    L(p.rx * ET + 16, p.ry * ET + 16, 130, 0.8, '#d8c890');
    this.light!.draw(c, lights, 0.5, 0.5, '6,14,6');
    // болезненно-зелёный общий тон
    c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = '#b4cca4'; c.fillRect(0, 0, VW, VH); c.restore();
    drawAsh(c, t);
    vignette(c, VW, VH);

    if (G.mode === 'explore') this.drawPrompts(c, cx, cy);
    if (this.banner) this.drawBanner(c);
  },

  drawDynamic(c: CanvasRenderingContext2D, o: Obj, t: number) {
    if (o.kind === 'pump') drawPumpjack(c, o.x * ET, o.y * ET, t + o.seed);
    else if (o.kind === 'campfire') drawCampfire(c, o.x * ET + 16, o.y * ET + 24, t);
  },

  drawPrompts(c: CanvasRenderingContext2D, cx: number, cy: number) {
    const adj = this.moveK >= 1 ? this.adjacentThing() : null;
    const hv = this.hoverW ? this.thingAt(this.hoverW.x, this.hoverW.y) : null;
    for (const it of [adj, hv]) {
      if (!it || !it.name) continue;
      const label = it === adj ? `[E] ${it.name}` : it.name;
      c.font = '13px "Old Standard TT", Georgia, serif';
      const w = c.measureText(label).width + 12;
      const ix = ('w' in it ? (it.x + it.w / 2) * ET : 'tx' in it ? it.x * ET : it.x * ET + 16) - cx;
      const iy = ('w' in it ? it.y * ET - 34 : 'tx' in it ? it.y * ET - 46 : it.y * ET - 30) - cy;
      c.fillStyle = 'rgba(8,12,7,0.85)'; c.fillRect(ix - w / 2, iy, w, 18);
      c.strokeStyle = it === adj ? '#c09a52' : '#4b5838'; c.lineWidth = 1; c.strokeRect(ix - w / 2 + 0.5, iy + 0.5, w - 1, 17);
      c.fillStyle = '#e0dcc0'; c.textAlign = 'center'; c.fillText(label, ix, iy + 13); c.textAlign = 'left';
      if (it === hv) break;
    }
  },

  drawBanner(c: CanvasRenderingContext2D) {
    const b = this.banner!, a = Math.min(1, b.t * 3, (3 - b.t) * 1.5);
    c.save(); c.globalAlpha = Math.max(0, a);
    c.font = 'bold 28px "Playfair Display SC", "Old Standard TT", serif'; c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillText(b.text, VW / 2 + 2, 112);
    c.fillStyle = '#ddd3ae'; c.fillText(b.text, VW / 2, 110);
    c.strokeStyle = 'rgba(192,154,82,0.7)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(VW / 2 - 140, 122); c.lineTo(VW / 2 + 140, 122); c.stroke();
    c.restore();
  },

  // ---------------------------------------------------------- земля (чанки)
  chunk(gx: number, gy: number): HTMLCanvasElement {
    const key = gy * 100 + gx;
    const cached = this.chunks.get(key);
    if (cached) return cached;
    const CSZ = 16, cv = document.createElement('canvas'); cv.width = CSZ * ET; cv.height = CSZ * ET;
    const c = cv.getContext('2d')!;
    const r = seeded(key * 31 + 7);
    for (let ty = 0; ty < CSZ; ty++) for (let tx = 0; tx < CSZ; tx++) {
      const x = gx * CSZ + tx, y = gy * CSZ + ty, X = tx * ET, Y = ty * ET;
      if (!this.inMap(x, y)) { c.fillStyle = '#0c0d0a'; c.fillRect(X, Y, ET, ET); continue; }
      const g = this.ground[y][x];
      if (g === 'r') {
        c.fillStyle = r() < 0.5 ? '#4a4436' : '#463f32'; c.fillRect(X, Y, ET, ET);
        c.fillStyle = 'rgba(30,26,20,0.45)';
        if (this.ground[y][x - 1] === 'r' || this.ground[y][x + 1] === 'r') { c.fillRect(X, Y + 9, ET, 3); c.fillRect(X, Y + 21, ET, 3); }
        else { c.fillRect(X + 9, Y, 3, ET); c.fillRect(X + 21, Y, 3, ET); }
        for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(120,110,90,0.25)'; c.fillRect(X + r() * ET, Y + r() * ET, 2, 2); }
      } else if (g === 'k') {
        c.fillStyle = '#4a3a28'; c.fillRect(X, Y, ET, ET);
        c.strokeStyle = '#2a2016'; c.lineWidth = 1;
        for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(X + i * 8 + 0.5, Y); c.lineTo(X + i * 8 + 0.5, Y + ET); c.stroke(); }
      } else if (g === 'f') {
        c.fillStyle = '#16140f'; c.fillRect(X, Y, ET, ET);
      } else if (g === 'x') {
        c.fillStyle = '#121a12'; c.fillRect(X, Y, ET, ET);
        c.fillStyle = 'rgba(120,180,110,0.10)'; c.beginPath(); c.ellipse(X + 8 + r() * 16, Y + 8 + r() * 16, 8, 2, 0, 0, TAU); c.fill();
        if (r() < 0.3) { c.strokeStyle = '#3a4a2a'; c.lineWidth = 1; const rx = X + r() * ET, ry = Y + ET - 4; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(rx + i * 2, ry); c.lineTo(rx + i * 2 + (r() - 0.5) * 3, ry - 8 - r() * 6); c.stroke(); } }
      } else if (g === 'm') {
        c.fillStyle = ['#2e3226', '#2a2e22', '#323628'][Math.floor(r() * 3)]; c.fillRect(X, Y, ET, ET);
        for (let i = 0; i < 7; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '70,90,50' : '20,24,16'},0.35)`; c.beginPath(); c.arc(X + r() * ET, Y + r() * ET, 1 + r() * 2, 0, TAU); c.fill(); }
        if (r() < 0.12) { c.fillStyle = '#c8c0a0'; const mx = X + 6 + r() * 20, my = Y + 10 + r() * 16; c.fillRect(mx, my, 1.5, 3); c.beginPath(); c.ellipse(mx + 0.7, my, 2.5, 1.5, 0, Math.PI, TAU); c.fill(); }
      } else {
        const base = g === 'w' ? ['#4a4a44', '#47473f', '#4e4d46', '#44443d'] : g === 'g' ? ['#3e3a32', '#423d34', '#3a362f'] : g === 'p' ? ['#3a3024', '#362c20', '#3e3428'] : ['#22211c', '#1e1d19', '#262420'];
        c.fillStyle = base[Math.floor(r() * base.length)]; c.fillRect(X, Y, ET, ET);
        for (let i = 0; i < 9; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '20,20,16' : '110,110,95'},0.22)`; c.fillRect(X + r() * ET, Y + r() * ET, 1.5, 1.5); }
        if (g === 'w' && r() < 0.35) {
          c.strokeStyle = 'rgba(22,22,18,0.55)'; c.lineWidth = 1; c.beginPath();
          let px = X + r() * ET, py = Y + r() * ET; c.moveTo(px, py);
          for (let i = 0; i < 3; i++) { px += (r() - 0.5) * 20; py += (r() - 0.5) * 20; c.lineTo(px, py); }
          c.stroke();
        }
        if ((g === 'w' || g === 'g') && r() < 0.12) {
          c.strokeStyle = '#5c5a3c'; c.lineWidth = 1;
          const sx = X + 4 + r() * 22, sy = Y + 8 + r() * 20;
          for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(sx + i * 1.5, sy); c.lineTo(sx + i * 1.5 + (r() - 0.5) * 4, sy - 4 - r() * 4); c.stroke(); }
        }
        if (g === 'p' && r() < 0.4) { c.fillStyle = 'rgba(20,14,8,0.5)'; c.beginPath(); c.ellipse(X + r() * ET, Y + r() * ET, 4, 2.5, r() * 3, 0, TAU); c.fill(); }
        if (g === 'o') { c.fillStyle = 'rgba(140,170,120,0.08)'; c.beginPath(); c.ellipse(X + 10 + r() * 12, Y + 10 + r() * 12, 6, 2, 0, 0, TAU); c.fill(); }
      }
      // рельсы
      if (this.rail[y][x]) {
        c.fillStyle = '#2e261c';
        for (let i = 0; i < 4; i++) c.fillRect(X + i * 8 + 1, Y + 6, 5, 20);
        c.fillStyle = '#6a6a64'; c.fillRect(X, Y + 10, ET, 2.5); c.fillRect(X, Y + 20, ET, 2.5);
        c.fillStyle = 'rgba(200,200,190,0.2)'; c.fillRect(X, Y + 10, ET, 1); c.fillRect(X, Y + 20, ET, 1);
      }
    }
    this.chunks.set(key, cv);
    return cv;
  },

  // ---------------------------------------------------------- спрайты статичных объектов
  renderSprites() {
    for (const o of this.objs) {
      if (o.dynamic) { if (o.kind === 'campfire') o.lights = [{ x: 16, y: 20, r: 190, color: '#f0a050' }]; continue; }
      const top = SPRITE_TOP[o.kind] ?? 24, pad = 16;
      const cv = document.createElement('canvas');
      cv.width = o.w * ET + pad * 2; cv.height = o.h * ET + top + pad;
      const c = cv.getContext('2d')!;
      c.translate(pad, top);
      o.sx = pad; o.sy = top;
      const r = seeded(o.seed * 97 + 13);
      o.lights = drawStatic(c, o, r, this) ?? undefined;
      o.sprite = cv;
    }
  },
};

const SPRITE_TOP: Record<string, number> = { hut: 30, adit: 40, cellar: 20, bigshroom: 40, rack: 26, shroombed: 14, house: 30, ruin: 30, pumphouse: 40, farm: 30, barn: 30, slaughter: 30, station: 36, tank: 30, watertower: 70, lamp: 50, tree: 44, wall: 50, gate: 70, railgate: 60, tower: 90, wagon: 20, sign: 30, feed: 16, lorry: 20, skeleton: 26, milestone: 26, wallruin: 26, chitin: 14, fence: 18 };

// ============================================================ рисование объектов
function drawStatic(c: CanvasRenderingContext2D, o: Obj, r: () => number, world: typeof Explore): Obj['lights'] | void {
  const W = o.w * ET, H = o.h * ET;
  const lights: NonNullable<Obj['lights']> = [];
  switch (o.kind) {
    case 'house': case 'ruin': case 'farm': case 'station': case 'pumphouse': case 'slaughter': {
      const ruined = o.kind === 'ruin';
      const wallH = ET + 10, wy = H - wallH;
      const wallCol = o.kind === 'station' ? '#4a3026' : o.kind === 'slaughter' ? '#4a443c' : o.kind === 'pumphouse' ? '#3a3a36' : '#3b3229';
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(4, H - 2, W, 6);
      c.fillStyle = wallCol; c.fillRect(3, wy, W - 6, wallH);
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.5;
      if (o.kind === 'station' || o.kind === 'pumphouse') for (let yy = wy + 5; yy < H; yy += 6) { c.beginPath(); c.moveTo(3, yy); c.lineTo(W - 3, yy); c.stroke(); }
      else { for (let i = 3; i < W - 3; i += 16) { c.beginPath(); c.moveTo(i, wy); c.lineTo(i, H); c.stroke(); } c.beginPath(); c.moveTo(3, wy + wallH / 2); c.lineTo(W - 3, wy + wallH / 2); c.stroke(); }
      // окна
      const nWin = Math.max(1, Math.floor(o.w / 2));
      const lit = !ruined && o.kind !== 'slaughter' && r() < 0.8;
      for (let i = 0; i < nWin; i++) {
        const cx = (i + 0.5) * (W / nWin) + (i === 0 ? -6 : 6), cy = wy + 15;
        const on = lit && (i === 0 || r() < 0.5);
        c.fillStyle = ruined ? '#0b0c0b' : on ? '#7a6428' : '#121418';
        c.fillRect(cx - 6, cy - 6, 12, 12);
        if (!ruined) { c.fillStyle = '#1d1712'; c.fillRect(cx - 0.75, cy - 6, 1.5, 12); c.fillRect(cx - 6, cy - 0.75, 12, 1.5); }
        else { c.strokeStyle = '#3a3026'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx - 6, cy - 6); c.lineTo(cx + 6, cy + 6); c.moveTo(cx + 6, cy - 6); c.lineTo(cx - 6, cy + 6); c.stroke(); }
        if (on) lights.push({ x: cx, y: cy, r: 40, color: '#f0b050', a: 0.75 });
      }
      // дверь
      const dx = W / 2;
      c.fillStyle = '#17110c'; c.fillRect(dx - 7, H - 24, 14, 24);
      if (ruined) { c.fillStyle = '#2a2016'; c.save(); c.translate(dx + 7, H); c.rotate(0.5); c.fillRect(-14, -22, 13, 22); c.restore(); }
      // крыша
      const roofCol = o.kind === 'station' ? '#2a2422' : o.kind === 'slaughter' ? '#3a2e28' : '#2a2b2d';
      c.fillStyle = roofCol;
      c.beginPath(); c.moveTo(-3, wy + 3); c.lineTo(W + 3, wy + 3); c.lineTo(W - 9, -8); c.lineTo(9, -8); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1;
      for (let yy = -2; yy < wy; yy += 6) { const k = (yy + 8) / (wy + 11); c.beginPath(); c.moveTo(lerp(9, -3, k), yy); c.lineTo(lerp(W - 9, W + 3, k), yy); c.stroke(); }
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(9, -10, W - 18, 4);
      if (ruined) {
        c.fillStyle = '#0b0b0a';
        const hx = 14 + r() * (W - 50), hw = 24 + r() * 16;
        c.beginPath(); c.moveTo(hx, -2); c.lineTo(hx + hw, -4); c.lineTo(hx + hw + 6, wy - 6); c.lineTo(hx + 4, wy - 2); c.closePath(); c.fill();
        c.strokeStyle = '#2a2018'; c.lineWidth = 3;
        for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(hx + 4 + i * 9, -3); c.lineTo(hx + i * 10, wy - 4); c.stroke(); }
        if ((o as any).ruinKind === 'pump') { c.strokeStyle = '#3a2e22'; c.lineWidth = 4; c.beginPath(); c.moveTo(W - 14, wy); c.lineTo(W - 14, -24); c.stroke(); }
      } else if (o.kind !== 'station') {
        c.fillStyle = '#3a2a22'; c.fillRect(W - 26, -18, 9, 18);
      }
      if (o.kind === 'pumphouse') { c.fillStyle = '#26241e'; c.fillRect(W - 20, -36, 10, 30); c.fillStyle = 'rgba(160,170,150,0.25)'; c.beginPath(); c.arc(W - 15, -40, 6, 0, TAU); c.fill(); }
      if (o.kind === 'station') {
        c.fillStyle = '#2a2016'; c.fillRect(W / 2 - 34, wy - 14, 68, 12);
        c.fillStyle = '#c8b88a'; c.font = 'bold 9px "Old Standard TT", serif'; c.textAlign = 'center'; c.fillText('ЭШФОРД', W / 2, wy - 5); c.textAlign = 'left';
      }
      if (o.kind === 'slaughter') { // висящие панцири
        for (let i = 0; i < 3; i++) { c.fillStyle = '#4a2e18'; c.beginPath(); c.ellipse(14 + i * 16, wy + 4, 6, 9, 0, 0, TAU); c.fill(); c.strokeStyle = '#2a1a0e'; c.beginPath(); c.moveTo(14 + i * 16, wy - 5); c.lineTo(14 + i * 16, wy + 13); c.stroke(); }
      }
      break;
    }
    case 'barn': {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(4, H - 2, W, 6);
      c.fillStyle = '#3e3024'; c.fillRect(2, H - 38, W - 4, 38);
      c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.5;
      for (let i = 2; i < W; i += 8) { c.beginPath(); c.moveTo(i, H - 38); c.lineTo(i, H); c.stroke(); }
      c.fillStyle = '#1a140e'; c.fillRect(W / 2 - 18, H - 30, 36, 30);
      c.strokeStyle = '#4a3a28'; c.lineWidth = 2; c.beginPath(); c.moveTo(W / 2 - 18, H - 30); c.lineTo(W / 2 + 18, H); c.moveTo(W / 2 + 18, H - 30); c.lineTo(W / 2 - 18, H); c.stroke();
      c.fillStyle = '#2e2620'; c.beginPath(); c.moveTo(-4, H - 36); c.lineTo(W + 4, H - 36); c.lineTo(W - 6, -6); c.lineTo(6, -6); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.35)'; for (let yy = 0; yy < H - 36; yy += 7) { c.beginPath(); c.moveTo(6, yy); c.lineTo(W - 6, yy); c.stroke(); }
      break;
    }
    case 'tank': {
      const cx = W / 2, rx = W / 2 - 4;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(cx + 4, H - 6, rx, 10, 0, 0, TAU); c.fill();
      const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#3a3a34'); g.addColorStop(0.4, '#55554c'); g.addColorStop(1, '#1e1e1a');
      c.fillStyle = g; c.fillRect(4, 0, W - 8, H - 8);
      c.beginPath(); c.ellipse(cx, H - 8, rx, 10, 0, 0, Math.PI); c.fill();
      c.fillStyle = '#4a4a42'; c.beginPath(); c.ellipse(cx, 0, rx, 10, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.5; for (let yy = 14; yy < H - 8; yy += 14) { c.beginPath(); c.moveTo(4, yy); c.lineTo(W - 4, yy); c.stroke(); }
      for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(110,60,30,0.35)'; c.fillRect(6 + r() * (W - 14), r() * (H - 20), 3, 8 + r() * 14); }
      c.fillStyle = '#16150f'; c.fillRect(cx - 2, -18, 4, 14);
      break;
    }
    case 'watertower': {
      c.strokeStyle = '#2a2016'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(8, H); c.lineTo(14, -10); c.moveTo(W - 8, H); c.lineTo(W - 14, -10); c.moveTo(10, H - 20); c.lineTo(W - 10, -6); c.moveTo(W - 10, H - 20); c.lineTo(10, -6); c.stroke();
      c.fillStyle = '#3a2e24'; c.fillRect(2, -58, W - 4, 48);
      c.strokeStyle = '#1e160e'; c.lineWidth = 2; for (let yy = -50; yy < -10; yy += 10) { c.beginPath(); c.moveTo(2, yy); c.lineTo(W - 2, yy); c.stroke(); }
      c.fillStyle = '#26201a'; c.beginPath(); c.moveTo(0, -58); c.lineTo(W / 2, -70); c.lineTo(W, -58); c.fill();
      break;
    }
    case 'wagon': {
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(6, H - 4, W - 8, 6);
      c.fillStyle = '#1a1814'; c.fillRect(6, H - 8, W - 12, 5);
      for (const wx of [14, W - 14]) { c.fillStyle = '#121110'; c.beginPath(); c.arc(wx, H - 4, 5, 0, TAU); c.fill(); }
      const g = c.createLinearGradient(0, -14, 0, H - 8); g.addColorStop(0, '#3e3c36'); g.addColorStop(0.5, '#24221e'); g.addColorStop(1, '#141310');
      c.fillStyle = g; c.beginPath(); c.roundRect(4, -16, W - 8, H + 6, 12); c.fill();
      c.fillStyle = '#2a2824'; c.fillRect(W / 2 - 5, -20, 10, 6);
      for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(110,60,30,0.35)'; c.fillRect(8 + r() * (W - 20), -10 + r() * 14, 6, 2); }
      break;
    }
    case 'lamp': {
      const x = 16, y = H - 2;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x, y, 6, 2, 0, 0, TAU); c.fill();
      c.fillStyle = '#15140f'; c.fillRect(x - 1.5, y - 42, 3, 42); c.fillRect(x - 4, y - 4, 8, 4); c.fillRect(x - 1, y - 44, 9, 2);
      c.fillStyle = '#c8a050'; c.fillRect(x + 3.5, y - 42, 6, 8);
      c.strokeStyle = '#15140f'; c.lineWidth = 1; c.strokeRect(x + 3.5, y - 42, 6, 8);
      lights.push({ x: x + 6, y: y - 38, r: 110, color: '#f0c070' });
      break;
    }
    case 'fence': {
      const x = 0, y = H - 6;
      const horiz = world.objs.some((f) => f.kind === 'fence' && f.y === o.y && Math.abs(f.x - o.x) === 1);
      c.fillStyle = '#2c241b'; c.fillRect(x + 13, y - 18, 5, 20);
      c.fillStyle = '#3e3022';
      if (horiz) { c.fillRect(x - 2, y - 14, ET + 4, 3); c.fillRect(x - 2, y - 7, ET + 4, 3); }
      else { c.fillRect(x + 14, y - 34, 3, 34); }
      break;
    }
    case 'feed': {
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(W / 2, H - 6, W / 2, 8, 0, 0, TAU); c.fill();
      for (let i = 0; i < 26; i++) { c.fillStyle = ['#3a3420', '#4a3a22', '#2a3018', '#5a4a2a'][Math.floor(r() * 4)]; c.beginPath(); c.ellipse(8 + r() * (W - 16), H - 8 - r() * (H - 10) * (0.6 + r() * 0.4), 5 + r() * 6, 3 + r() * 3, r() * 3, 0, TAU); c.fill(); }
      break;
    }
    case 'chitin': {
      for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? '#5a3a1e' : '#4a2e18'; c.beginPath(); c.ellipse(10 + i * 10, H - 8 - (i % 2) * 6, 10, 7, 0.3, 0, TAU); c.fill(); c.strokeStyle = 'rgba(255,220,160,0.15)'; c.stroke(); }
      break;
    }
    case 'tree': drawDeadTree(c, 16, H - 4, r, 1.1); break;
    case 'rock': {
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(17, H - 5, 13, 4, 0, 0, TAU); c.fill();
      const g = c.createLinearGradient(4, H - 26, 26, H); g.addColorStop(0, '#6a6a60'); g.addColorStop(1, '#2a2a26');
      c.fillStyle = g; c.beginPath(); c.moveTo(4, H - 6); c.lineTo(8, H - 20 - r() * 6); c.lineTo(18, H - 24 - r() * 6); c.lineTo(28, H - 14); c.lineTo(26, H - 4); c.closePath(); c.fill();
      break;
    }
    case 'barrel': drawCrate(c, 16, H - 2, ET, true); break;
    case 'hut': {
      const wallH = ET, wy = H - wallH;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(4, H - 2, W, 6);
      // сваи
      c.fillStyle = '#1e1a14'; for (let x = 6; x < W - 4; x += 18) c.fillRect(x, H - 6, 4, 8);
      c.fillStyle = '#3a3428'; c.fillRect(3, wy, W - 6, wallH - 4);
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.5; for (let x = 3; x < W - 3; x += 7) { c.beginPath(); c.moveTo(x, wy); c.lineTo(x, H - 4); c.stroke(); }
      c.fillStyle = '#17110c'; c.fillRect(W / 2 - 6, H - 26, 12, 22);
      const cx = W / 2 + 22; c.fillStyle = '#5a6a30'; c.fillRect(cx - 5, wy + 8, 10, 9);
      lights.push({ x: cx, y: wy + 12, r: 40, color: '#b0e070', a: 0.6 });
      // мшистая крыша
      c.fillStyle = '#2e3a24'; c.beginPath(); c.moveTo(-4, wy + 2); c.lineTo(W + 4, wy + 2); c.lineTo(W - 10, -6); c.lineTo(10, -6); c.closePath(); c.fill();
      for (let i = 0; i < 14; i++) { c.fillStyle = r() < 0.5 ? '#3e4a2c' : '#26301e'; c.beginPath(); c.ellipse(10 + r() * (W - 20), -2 + r() * (wy - 2), 6 + r() * 6, 3, 0, 0, TAU); c.fill(); }
      break;
    }
    case 'cellar': {
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(W / 2, H - 4, W / 2, 8, 0, 0, TAU); c.fill();
      const g = c.createRadialGradient(W / 2 - 8, H - 30, 4, W / 2, H - 14, W / 1.4);
      g.addColorStop(0, '#4a4a34'); g.addColorStop(1, '#22241a');
      c.fillStyle = g; c.beginPath(); c.ellipse(W / 2, H - 10, W / 2, H / 2 + 8, 0, Math.PI, TAU); c.fill();
      for (let i = 0; i < 10; i++) { c.fillStyle = 'rgba(80,100,50,0.4)'; c.beginPath(); c.arc(8 + r() * (W - 16), H - 10 - r() * 26, 2 + r() * 3, 0, TAU); c.fill(); }
      c.fillStyle = '#1a140c'; c.beginPath(); c.moveTo(W / 2 - 10, H - 4); c.lineTo(W / 2 - 10, H - 18); c.arc(W / 2, H - 18, 10, Math.PI, 0); c.lineTo(W / 2 + 10, H - 4); c.fill();
      c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.5; c.stroke();
      lights.push({ x: W / 2, y: H - 12, r: 36, color: '#9fe070', a: 0.5 });
      break;
    }
    case 'adit': {
      c.fillStyle = '#2a2a24'; c.beginPath(); c.moveTo(-6, H); c.lineTo(4, -20); c.lineTo(W * 0.4, -34); c.lineTo(W - 4, -18); c.lineTo(W + 6, H); c.closePath(); c.fill();
      for (let i = 0; i < 18; i++) { c.fillStyle = r() < 0.5 ? '#3a3a32' : '#1e1e1a'; c.beginPath(); c.ellipse(r() * W, -24 + r() * (H + 14), 6 + r() * 8, 3 + r() * 4, r() * 3, 0, TAU); c.fill(); }
      const dw = 40, dx = W / 2 - dw / 2;
      c.fillStyle = '#060705'; c.fillRect(dx, H - 46, dw, 46);
      c.fillStyle = '#4a3622'; c.fillRect(dx - 5, H - 50, 5, 50); c.fillRect(dx + dw, H - 50, 5, 50); c.fillRect(dx - 6, H - 54, dw + 12, 6);
      c.fillStyle = 'rgba(160,230,110,0.25)'; c.beginPath(); c.ellipse(W / 2, H - 10, 14, 6, 0, 0, TAU); c.fill();
      lights.push({ x: W / 2, y: H - 20, r: 80, color: '#9fe070', a: 0.6 });
      // вагонетка
      c.fillStyle = '#3a3a34'; c.fillRect(dx + dw + 10, H - 16, 18, 10); c.fillStyle = '#121210'; c.beginPath(); c.arc(dx + dw + 14, H - 4, 3, 0, TAU); c.arc(dx + dw + 24, H - 4, 3, 0, TAU); c.fill();
      break;
    }
    case 'shroombed': {
      c.fillStyle = '#1e1a12'; c.fillRect(0, H - 22, W, 18);
      c.fillStyle = '#2a2418'; c.fillRect(0, H - 22, W, 3);
      for (let i = 0; i < W / 7; i++) {
        const x = 3 + i * 7 + r() * 3, y = H - 8 - r() * 6, sz = 2.5 + r() * 2.5;
        c.fillStyle = '#d0c8a8'; c.fillRect(x - 0.7, y, 1.4, 4);
        c.fillStyle = r() < 0.3 ? '#a8d888' : '#c8c0a0'; c.beginPath(); c.ellipse(x, y, sz, sz * 0.6, 0, Math.PI, TAU); c.fill();
      }
      lights.push({ x: W / 2, y: H - 12, r: 44, color: '#b0f080', a: 0.35 });
      break;
    }
    case 'bigshroom': {
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(16, H - 3, 9, 3, 0, 0, TAU); c.fill();
      c.fillStyle = '#c8c4a8'; c.fillRect(13, H - 26, 6, 24);
      const g = c.createRadialGradient(14, H - 32, 2, 16, H - 28, 18);
      g.addColorStop(0, '#e0ffc0'); g.addColorStop(0.5, '#90c070'); g.addColorStop(1, '#3a5a2a');
      c.fillStyle = g; c.beginPath(); c.ellipse(16, H - 26, 16, 10, 0, Math.PI, TAU); c.fill();
      c.fillStyle = 'rgba(30,50,20,0.6)'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(6 + r() * 20, H - 30 + r() * 4, 1.5, 0, TAU); c.fill(); }
      lights.push({ x: 16, y: H - 28, r: 110, color: '#a8f070', a: 0.8 });
      break;
    }
    case 'rack': {
      c.strokeStyle = '#2a2016'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(4, H); c.lineTo(4, H - 30); c.moveTo(W - 4, H); c.lineTo(W - 4, H - 30); c.moveTo(2, H - 28); c.lineTo(W - 2, H - 28); c.stroke();
      for (let i = 0; i < 8; i++) { const x = 8 + i * 6; c.strokeStyle = '#3a2a1a'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, H - 28); c.lineTo(x, H - 22); c.stroke(); c.fillStyle = '#8a7a58'; c.beginPath(); c.ellipse(x, H - 20, 3, 2, 0, 0, TAU); c.fill(); }
      break;
    }
    case 'crater': {
      const g = c.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
      g.addColorStop(0, 'rgba(20,18,14,0.75)'); g.addColorStop(0.7, 'rgba(30,28,22,0.4)'); g.addColorStop(1, 'rgba(90,88,78,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(W / 2, H / 2, W / 2, H / 2.4, 0, 0, TAU); c.fill();
      break;
    }
    case 'bones': {
      c.strokeStyle = '#a8a290'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(6, 20); c.lineTo(22, 14); c.moveTo(10, 26); c.lineTo(26, 24); c.stroke();
      c.fillStyle = '#b8b2a0'; c.beginPath(); c.arc(24, 16, 3, 0, TAU); c.fill();
      break;
    }
    case 'skeleton': {
      c.strokeStyle = '#b4ae9c'; c.lineCap = 'round';
      c.lineWidth = 5; c.beginPath(); c.moveTo(10, H - 30); c.quadraticCurveTo(W / 2, H - 50, W - 20, H - 26); c.stroke();
      c.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const x = 26 + i * 18; c.beginPath(); c.moveTo(x, H - 42 + Math.abs(i - 2.5) * 3); c.quadraticCurveTo(x - 10, H - 20, x - 4, H - 6); c.moveTo(x, H - 42 + Math.abs(i - 2.5) * 3); c.quadraticCurveTo(x + 12, H - 60, x + 4, H - 70); c.stroke(); }
      c.fillStyle = '#c8c2ae'; c.beginPath(); c.ellipse(W - 18, H - 28, 16, 12, 0.3, 0, TAU); c.fill();
      c.fillStyle = '#1a1814'; c.beginPath(); c.arc(W - 14, H - 30, 3, 0, TAU); c.fill();
      c.strokeStyle = '#a8a290'; c.lineWidth = 3; c.beginPath(); c.moveTo(W - 6, H - 36); c.quadraticCurveTo(W + 10, H - 50, W + 4, H - 60); c.moveTo(W - 6, H - 22); c.quadraticCurveTo(W + 12, H - 18, W + 10, H - 6); c.stroke();
      break;
    }
    case 'milestone': {
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(17, H - 4, 9, 3, 0, 0, TAU); c.fill();
      c.fillStyle = '#6a665c'; c.fillRect(9, H - 30, 14, 28); c.beginPath(); c.arc(16, H - 30, 7, Math.PI, TAU); c.fill();
      c.fillStyle = '#2a2822'; c.font = 'bold 8px serif'; c.textAlign = 'center'; c.fillText('24', 16, H - 16); c.textAlign = 'left';
      break;
    }
    case 'lorry': {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(4, H - 6, W - 4, 8);
      c.fillStyle = '#3a2a1e'; c.fillRect(4, H - 30, W - 36, 24);
      c.fillStyle = '#4a3020'; c.fillRect(W - 34, H - 40, 28, 34);
      c.fillStyle = '#0e0e0c'; c.fillRect(W - 28, H - 36, 16, 10);
      for (const wx of [18, W - 22]) { c.fillStyle = '#121110'; c.beginPath(); c.arc(wx, H - 6, 8, 0, TAU); c.fill(); }
      for (let i = 0; i < 8; i++) { c.fillStyle = 'rgba(140,70,30,0.4)'; c.fillRect(6 + r() * (W - 14), H - 38 + r() * 30, 4, 3); }
      break;
    }
    case 'wallruin': {
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(2, H - 4, W, 5);
      for (let x = 0; x < W; x += 8) for (let yy = 0; yy < H; yy += 8) {
        const hh = 18 + Math.floor(r() * 18);
        if (yy === H - 8 || o.w === 1) { c.fillStyle = r() < 0.5 ? '#55524a' : '#4a4740'; c.fillRect(x, yy + 8 - hh, 8, hh); c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x, yy + 8 - hh, 8, 2); }
      }
      break;
    }
    case 'sign': {
      c.fillStyle = '#2a2016'; c.fillRect(14, H - 30, 3, 30);
      c.fillStyle = '#3a2e20'; c.fillRect(2, H - 34, 28, 12);
      c.fillStyle = '#c8b88a'; c.font = 'bold 6px serif'; c.textAlign = 'center'; c.fillText('РАЗЪЕЗД', 16, H - 25); c.textAlign = 'left';
      break;
    }
    case 'wall': {
      c.fillStyle = '#3a3630'; c.fillRect(0, -40, W, H + 40);
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1;
      for (let yy = -40; yy < H; yy += 8) { c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke(); }
      c.fillStyle = '#2a2622'; for (let x = 0; x < W; x += 16) c.fillRect(x, -50, 10, 10);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(W - 10, -40, 10, H + 40);
      break;
    }
    case 'tower': {
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(6, H - 4, W, 8);
      c.fillStyle = '#44403a'; c.fillRect(4, -80, W - 8, H + 80);
      c.strokeStyle = 'rgba(0,0,0,0.35)'; for (let yy = -80; yy < H; yy += 9) { c.beginPath(); c.moveTo(4, yy); c.lineTo(W - 4, yy); c.stroke(); }
      c.fillStyle = '#2e2a26'; for (let x = 0; x < W; x += 14) c.fillRect(x, -90, 9, 12);
      c.fillStyle = '#0e0d0b'; c.fillRect(W / 2 - 4, -60, 8, 14); c.fillRect(W / 2 - 4, -20, 8, 14);
      c.fillStyle = '#e8d090'; c.beginPath(); c.arc(W / 2, -68, 4, 0, TAU); c.fill();
      lights.push({ x: W / 2, y: -68, r: 160, color: '#e8e0b0', a: 0.6 });
      break;
    }
    case 'gate': case 'railgate': {
      c.fillStyle = '#3a3630'; c.fillRect(0, -60, W, H + 60);
      c.fillStyle = '#1a1612'; c.fillRect(6, 10, W - 12, H - 10);
      c.fillStyle = '#3a2a1e'; c.fillRect(8, 12, W - 16, H - 14);
      c.strokeStyle = '#1a120c'; c.lineWidth = 2;
      for (let yy = 22; yy < H; yy += 14) { c.beginPath(); c.moveTo(8, yy); c.lineTo(W - 8, yy); c.stroke(); }
      c.fillStyle = '#6a5a40'; for (let yy = 18; yy < H; yy += 14) { c.fillRect(12, yy, 3, 3); c.fillRect(W - 15, yy, 3, 3); }
      c.fillStyle = '#2a2622'; for (let x = 0; x < W; x += 16) c.fillRect(x, -70, 10, 10);
      lights.push({ x: W / 2, y: -10, r: 130, color: '#e8c070', a: 0.7 });
      break;
    }
  }
  return lights.length ? lights : undefined;
}

function drawPumpjack(c: CanvasRenderingContext2D, X: number, Y: number, t: number) {
  const a = Math.sin(t * 1.6) * 0.32;
  const px = X + 30, py = Y + 18; // ось балансира
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(X + 32, Y + 58, 30, 7, 0, 0, TAU); c.fill();
  c.fillStyle = '#1e1c18'; c.fillRect(X + 4, Y + 52, 56, 6);
  // стойка-пирамида
  c.strokeStyle = '#2a2620'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(X + 20, Y + 54); c.lineTo(px, py); c.lineTo(X + 40, Y + 54); c.stroke();
  // кривошип и противовес
  const cx = X + 50, cy = Y + 44, ca = t * 1.6;
  c.fillStyle = '#3a3a34'; c.beginPath(); c.arc(cx, cy, 8, 0, TAU); c.fill();
  const kx = cx + Math.cos(ca) * 7, ky = cy + Math.sin(ca) * 7;
  // балансир
  c.save(); c.translate(px, py); c.rotate(a);
  c.fillStyle = '#4a4238'; c.fillRect(-26, -3, 46, 6);
  c.fillStyle = '#3a342c'; c.beginPath(); c.moveTo(-26, -6); c.quadraticCurveTo(-36, 0, -26, 10); c.lineTo(-22, 10); c.lineTo(-22, -6); c.fill(); // «голова»
  c.restore();
  const bx = px + Math.cos(a) * 18, by = py + Math.sin(a) * 18;
  c.strokeStyle = '#2a2620'; c.lineWidth = 2; c.beginPath(); c.moveTo(bx, by); c.lineTo(kx, ky); c.stroke();
  // штанга к скважине
  const hx = px + Math.cos(a + Math.PI) * 28, hy = py + Math.sin(a + Math.PI) * 28;
  c.strokeStyle = '#5a5a52'; c.lineWidth = 1; c.beginPath(); c.moveTo(hx - 2, hy + 6); c.lineTo(X + 2, Y + 52); c.stroke();
  c.fillStyle = '#2a2620'; c.fillRect(X - 2, Y + 48, 8, 8);
}

function drawCampfire(c: CanvasRenderingContext2D, x: number, y: number, t: number) {
  c.fillStyle = '#2a1e14';
  for (let i = 0; i < 3; i++) { c.save(); c.translate(x, y); c.rotate(i * 1.1); c.fillRect(-10, -1.5, 20, 3); c.restore(); }
  for (let i = 0; i < 3; i++) {
    const h = 10 + Math.sin(t * 9 + i * 2) * 3;
    c.fillStyle = i === 0 ? '#f08030' : i === 1 ? '#f0c050' : '#fff0a0';
    c.beginPath(); c.moveTo(x - 6 + i * 3, y); c.quadraticCurveTo(x - 3 + i * 2, y - h, x + i - 1, y - h - 4 + i * 2); c.quadraticCurveTo(x + 4 - i, y - h / 2, x + 6 - i * 3, y); c.fill();
  }
}

/** Жук-тяжеловоз, вид сверху под углом. (x, y) — центр. */
function drawBeetle(c: CanvasRenderingContext2D, x: number, y: number, dir: number, t: number, s: number, walking: boolean) {
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,0.38)'; c.beginPath(); c.ellipse(2, 8, 26 * s, 12 * s, 0, 0, TAU); c.fill();
  c.scale(s, s * 0.8); // сплющиваем — ракурс сверху под углом
  c.rotate(dir);
  // лапы
  c.strokeStyle = '#1a120c'; c.lineWidth = 2.4; c.lineCap = 'round';
  for (let i = 0; i < 3; i++) for (const side of [-1, 1]) {
    const ph = walking ? Math.sin(t * 9 + i * 2 + (side > 0 ? Math.PI : 0)) * 4 : 0;
    const bx = -8 + i * 9, by = side * 9;
    c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + ph - 4, by + side * 10); c.lineTo(bx + ph - 8, by + side * 16); c.stroke();
  }
  // брюшко-надкрылья
  const g = c.createLinearGradient(-20, -14, 14, 14);
  g.addColorStop(0, '#6a4426'); g.addColorStop(0.5, '#3a2414'); g.addColorStop(1, '#1a0e06');
  c.fillStyle = g; c.beginPath(); c.ellipse(-4, 0, 20, 13, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-24, 0); c.lineTo(14, 0); c.stroke();
  c.fillStyle = 'rgba(255,230,180,0.18)'; c.beginPath(); c.ellipse(-8, -6, 10, 3, -0.2, 0, TAU); c.fill(); // блик
  // переднеспинка и голова
  c.fillStyle = '#2a1a0e'; c.beginPath(); c.ellipse(16, 0, 8, 9, 0, 0, TAU); c.fill();
  c.fillStyle = '#1a100a'; c.beginPath(); c.ellipse(24, 0, 5, 6, 0, 0, TAU); c.fill();
  // жвалы и усы
  const m = Math.sin(t * 3) * 0.3;
  c.strokeStyle = '#120a06'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(27, -3); c.quadraticCurveTo(32, -5 - m * 4, 33, -1); c.moveTo(27, 3); c.quadraticCurveTo(32, 5 + m * 4, 33, 1); c.stroke();
  c.lineWidth = 1; c.beginPath(); c.moveTo(25, -4); c.quadraticCurveTo(34, -14, 40, -12 + m * 6); c.moveTo(25, 4); c.quadraticCurveTo(34, 14, 40, 12 - m * 6); c.stroke();
  c.restore();
}
