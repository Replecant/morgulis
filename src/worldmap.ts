// ============================================================
//  Глобальная карта региона (в духе Mount & Blade):
//  отряд свободно ходит по карте, время идёт, деревни — входы
//  в локальные сцены, примечательности — события на карте.
// ============================================================
import { G } from './state';
import { seeded, TAU, clamp, dist, Pt } from './util';
import { PixelView, LW, LH, PS, PLight, applyLight, prect, ppx, pline, pellipse, pshadow, outline, pixelize, shade } from './px';
import { miniSprite } from './sprites';
import { hasTool } from './state';
import { addWoundId } from './wounds';
import { Debug } from './debug';
import { Weather } from './weather';

const VW = 960, VH = 640;
export const WW = 1920, WH = 1280;
/** Западная граница мира: за Эшфордом — старый фронт (траншеи, проволока, мертвецы). */
export const WX0 = -2500;
/** Восточнее — старый фронт (поле сражений баронов), западнее — земли баронессы. */
const FRONT_W0 = -900;
const OX = -WX0 / 2;          // сдвиг фона: пиксель фона = (x мира − WX0) / 2
/** Северная граница мира: севернее y=0 — земли бывшего барона Сильвера (густые леса, власть Народного Собрания). */
export const WY0 = -1200;
const OY = -WY0 / 2;
const NORTH_Y = 0;
const FRONT_X = 120;          // западнее — старый фронт

export interface Loc {
  id: string; name: string; kind: 'village' | 'fort' | 'poi';
  x: number; y: number; talk: string; scene?: string; desc: string;
}
export const LOCS: Loc[] = [
  { id: 'ashford', name: 'Эшфорд', kind: 'village', x: 430, y: 760, talk: 'loc_ashford', scene: 'ashford', desc: 'Деревня нефтяников. Качалки, цистерны, пустые дома.' },
  { id: 'richmord', name: 'Ричморд', kind: 'village', x: 1180, y: 330, talk: 'loc_richmord', scene: 'richmord', desc: 'Жучиные фермы. Мясо и панцирь.' },
  { id: 'fenmor', name: 'Фенмор', kind: 'village', x: 470, y: 270, talk: 'loc_fenmor', scene: 'fenmor', desc: 'Грибные фермы в болотистой низине.' },
  { id: 'fort', name: 'Форт барона', kind: 'fort', x: 1730, y: 840, talk: 'loc_fort', scene: 'fortgate', desc: 'Город-крепость барона Олдриджа.' },
  { id: 'airship', name: 'Руины дирижабля', kind: 'poi', x: 930, y: 520, talk: 'poi_airship', desc: 'Остов огромного воздушного корабля.' },
  { id: 'post', name: 'Разрушенный пост', kind: 'poi', x: 1150, y: 905, talk: 'poi_post', desc: 'Руины имперского поста между трактом и путями.' },
  { id: 'bones', name: 'Старые кости', kind: 'poi', x: 760, y: 430, talk: 'poi_bones', desc: 'Скелет исполинского жука.' },
  { id: 'lorry', name: 'Остов грузовика', kind: 'poi', x: 1270, y: 690, talk: 'poi_lorry', desc: 'Брошенный имперский грузовик в ложбине, в стороне от тракта.' },
  { id: 'trenches', name: 'Старые траншеи', kind: 'poi', x: -500, y: 600, talk: 'poi_trenches', desc: 'Здесь бились бароны этих и соседних земель.' },
  { id: 'bunker', name: 'Командный блиндаж', kind: 'poi', x: -700, y: 360, talk: 'poi_bunker', desc: 'Бетонный блиндаж с заклинившей бронедверью.' },
  { id: 'armorcar', name: 'Ржавая бронемашина', kind: 'poi', x: -260, y: 980, talk: 'poi_armorcar', desc: 'Брошенная бронемашина в воронке.' },
  // ---------------- земли баронессы (к западу от поля сражений)
  { id: 'bfort', name: 'Форт баронессы', kind: 'fort', x: -2150, y: 620, talk: 'loc_bfort', scene: 'bfort', desc: 'Крепость баронессы: один большой ярус и замок.' },
  { id: 'brimmor', name: 'Бриммор', kind: 'village', x: -1640, y: 640, talk: 'loc_brimmor', scene: 'brimmor', desc: 'Рыбацкая деревня на берегу озера.' },
  { id: 'hailstone', name: 'Хейлстоун', kind: 'village', x: -1920, y: 1060, talk: 'loc_hailstone', scene: 'hailstone', desc: 'Деревня старателей: руда и металлолом.' },
  { id: 'mossley', name: 'Мосслей', kind: 'village', x: -2240, y: 240, talk: 'loc_mossley', scene: 'mossley', desc: 'Деревня грибников и пастухов.' },
  { id: 'bcamp', name: 'Особый лагерь', kind: 'village', x: -1300, y: 1000, talk: 'loc_bcamp', scene: 'bcamp', desc: 'Промышленная зона баронессы за колючей проволокой.' },
  // ---------------- север: земли бывшего барона Сильвера — край Народного Собрания
  { id: 'svoboda', name: 'Форт Свобода', kind: 'fort', x: 1150, y: -800, talk: 'loc_svoboda', scene: 'svoboda', desc: 'Бывший форт барона Сильвера. Теперь — Народного Собрания.' },
  { id: 'einbow', name: 'Эйнбоу', kind: 'village', x: 640, y: -380, talk: 'loc_einbow', scene: 'einbow', desc: 'Сожжённая деревня: её уничтожили за связи со старым режимом.' },
  { id: 'hawley', name: 'Хоули', kind: 'village', x: 1560, y: -300, talk: 'loc_hawley', scene: 'hawley', desc: 'Деревня жуководов. Почти не пострадала.' },
  { id: 'woodham', name: 'Вудхэм', kind: 'village', x: 380, y: -900, talk: 'loc_woodham', scene: 'woodham', desc: 'Деревня лесорубов в глубине леса.' },
  { id: 'tarwell', name: 'Тарвелл', kind: 'village', x: 1490, y: -960, talk: 'loc_tarwell', scene: 'tarwell', desc: 'Деревня нефтяников. Вышки под охраной братьев.' },
  { id: 'redpost', name: 'Застава Собрания', kind: 'poi', x: 1215, y: 20, talk: 'poi_redpost', desc: 'Шлагбаум и красный флаг на въезде в северные леса.' },
  { id: 'einbpost', name: 'Застава у Эйнбоу', kind: 'poi', x: 572, y: -230, talk: 'poi_einbpost', desc: 'Пост братьев свободы на дороге к сожжённой деревне.' },
  { id: 'flare', name: 'Газовый факел', kind: 'poi', x: 230, y: 640, talk: 'poi_flare', desc: 'Вечный огонь над старой скважиной.' },
];
const ROADS: number[][][] = [
  [[430, 760], [600, 790], [800, 800], [1000, 830], [1200, 850], [1400, 830], [1560, 850], [1730, 840]],
  [[800, 800], [880, 680], [960, 560], [1060, 440], [1180, 330]],
  [[430, 760], [450, 600], [480, 440], [470, 270]],
  // старая военная дорога — от Эшфорда на запад, к фронту
  [[430, 760], [260, 800], [40, 790], [-220, 740], [-480, 700], [-760, 640]],
  // земли баронессы: тракт от поля сражений к форту баронессы
  [[-760, 640], [-1000, 620], [-1300, 650], [-1640, 690], [-1950, 680], [-2150, 640]],
  [[-1950, 680], [-2100, 430], [-2240, 250]],
  [[-1640, 690], [-1800, 900], [-1920, 1060]],
  [[-1300, 650], [-1300, 1000]],
  // север: тракт от Ричморда через лес к форту Свобода и ветки к деревням
  [[1180, 330], [1175, 180], [1170, 40], [1160, -150], [1150, -400], [1150, -620], [1150, -800]],
  [[470, 270], [480, 100], [540, -120], [640, -380]],
  [[640, -380], [880, -400], [1150, -400]],
  [[1150, -400], [1380, -330], [1560, -300]],
  [[1150, -800], [900, -830], [620, -870], [380, -900]],
  [[1150, -800], [1330, -890], [1490, -960]],
];
/** Озеро и реки в землях баронессы (координаты мира). */
const LAKE = { x: -1650, y: 420, rx: 250, ry: 140 };
const RIVERS: number[][][] = [
  [[-1380, -1200], [-1420, -900], [-1400, -600], [-1450, -300], [-1480, 0], [-1520, 120], [-1580, 210], [-1600, 290]], // из северных лесов в озеро
  [[-1430, 470], [-1380, 560], [-1340, 700], [-1290, 820], [-1210, 920], [-1180, 1080], [-1120, 1280]], // из озера на юго-восток
  [[-1880, 470], [-2000, 540], [-2120, 500], [-2300, 560], [-2500, 520]],                  // из озера на запад
];
/** y железной дороги на долготе x (по ломаной RAIL). */
function railY(x: number) {
  for (let i = 1; i < RAIL.length; i++) { const [x0, y0] = RAIL[i - 1], [x1, y1] = RAIL[i]; if (x <= x1) return y0 + (y1 - y0) * clamp((x - x0) / (x1 - x0), 0, 1); }
  return RAIL[RAIL.length - 1][1];
}
const RAIL: number[][] = [[-2080, 700], [-1800, 760], [-1450, 830], [-1150, 880], [-900, 870], [-500, 885], [0, 875], [200, 840], [330, 806], [430, 798], [540, 806], [700, 848], [850, 905], [1000, 950], [1300, 940], [1550, 910], [1730, 880]];
/** Ломаная, сдвинутая вбок на d (по нормали; углы — по среднему из соседних нормалей). */
function offsetPoly(poly: number[][], d: number) {
  return poly.map(([x, y], i) => {
    const a = poly[Math.max(0, i - 1)], b = poly[Math.min(poly.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [x - (dy / l) * d, y + (dx / l) * d];
  });
}
/** Двухпутная линия: два главных пути по обе стороны от оси RAIL. */
const TRACK_GAP = 7;
/** Разъезд Эшфорд: третий путь южнее главных, со съездами на концах. */
const SIDING: number[][] = [[280, TRACK_GAP], [340, 24], [380, 24], [430, 24], [480, 24], [525, 24], [585, TRACK_GAP]].map(([x, d]) => [x, Math.round(railY(x) + d)]);

// патрули барона: первый ходит от Фенмора через Эшфорд по тракту до форта, второй — от форта к Ричморду
// братья свободы: один ходит по северному тракту, второй — между Эйнбоу и Хоули, третий — от Вудхэма через форт к Тарвеллу
const PATROL_PATHS: number[][][] = [[...ROADS[2].slice().reverse(), ...ROADS[0].slice(1)], [...ROADS[0].slice(2).reverse(), ...ROADS[1].slice(1)], [...ROADS[4].slice().reverse().slice(0, 4), [-1300, 1000]].reverse(),
  ROADS[8].slice(2), [...ROADS[10], ...ROADS[11].slice(1)], [...ROADS[12].slice().reverse(), ...ROADS[13].slice(1)]];
export type PatrolOwner = 'baron' | 'baroness' | 'revo';
const PATROL_OWNER: PatrolOwner[] = ['baron', 'baron', 'baroness', 'revo', 'revo', 'revo'];
const PATROL_SPEED = 36;   // пикселей карты в час
interface Patrol { path: number[][]; len: number; s: number; dir: 1 | -1; wait: number; speed: number; owner: PatrolOwner }
const polyLen = (pts: number[][]) => pts.reduce((a, pt, i) => (i ? a + Math.hypot(pt[0] - pts[i - 1][0], pt[1] - pts[i - 1][1]) : 0), 0);
function polyAt(pts: number[][], s: number): Pt & { dx: number } {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], l = Math.hypot(x1 - x0, y1 - y0);
    if (s <= l || i === pts.length - 1) { const k = clamp(s / l, 0, 1); return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, dx: x1 - x0 }; }
    s -= l;
  }
  return { x: pts[0][0], y: pts[0][1], dx: 0 };
}

// группы траншейных мертвецов: бродят по старому фронту, медленнее отряда
interface DeadGroup { id: string; kinds: string[]; x: number; y: number; tx: number; ty: number; alive: boolean; respawn: number; calm: number; seen: boolean }
const DEAD_START: [string, string[], number, number][] = [
  ['trench1', ['dead_soldier', 'dead_rifle', 'dead_soldier'], -600, 500],
  ['trench2', ['dead_gas', 'dead_soldier', 'dead_rifle'], -330, 860],
  ['trench3', ['dead_sapper', 'dead_soldier', 'dead_gas'], -760, 950],
];
// голодные бандиты: оборванцы бродят вглубь земли барона — слабые и медленные
interface Hungry { id: number; kinds: string[]; x: number; y: number; tx: number; ty: number; alive: boolean; respawn: number; calm: number; seen: boolean }
const HUNGRY_START: [number, number][] = [[700, 650], [1350, 560], [950, 1100]];
// морские демоны: двое бродят по берегу озера баронессы
interface LakeDemon { id: number; x: number; y: number; tx: number; ty: number; alive: boolean; respawn: number; calm: number; seen: boolean; a: number }
const lakeRing = (a: number, k: number) => ({ x: -1650 + Math.cos(a) * 250 * k, y: 420 + Math.sin(a) * 140 * k });
const nearLake = (q: Pt) => { const d = Math.hypot((q.x + 1650) / 250, (q.y - 420) / 140); return d > 0.95 && d < 1.9; };
const inBaronLand = (q: Pt) => q.x > 200 && q.x < 1650 && q.y > 120 && q.y < WH - 120;
const inNorth = (q: Pt) => q.y < NORTH_Y;
// лоялисты старого режима: редкие группы прячутся в лесу, подальше от дорог
interface Loyal { id: number; kinds: string[]; x: number; y: number; tx: number; ty: number; alive: boolean; respawn: number; calm: number; seen: boolean }
const LOYAL_START: [number, number][] = [[880, -620], [1420, -620], [300, -450]];
const inFront = (q: Pt) => q.x > FRONT_W0 + 40 && q.x < FRONT_X - 20 && q.y > 80 && q.y < WH - 80;
// едкие облака: плывут над пустошью по ветру; без противогаза газ обжигает лёгкие
interface Cloud { x: number; y: number; r: number; vx: number; vy: number; seed: number }
const FIND_R = 170;         // с какого расстояния отряд замечает примечательное место
const SPEED = 55;          // пикселей карты в час по бездорожью
const ROAD_BONUS = 1.7;    // по дороге быстрее
const HOURS_PER_SEC = 1.2; // сколько игровых часов проходит за секунду пути

function segDist(p: Pt, a: number[], b: number[]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const k = clamp(((p.x - a[0]) * dx + (p.y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(p.x - (a[0] + dx * k), p.y - (a[1] + dy * k));
}
const nearRoad = (p: Pt, d: number) => ROADS.some((r) => r.some((pt, i) => i > 0 && segDist(p, r[i - 1], pt) < d));
const onRoad = (p: Pt) => nearRoad(p, 14);

export const World = {
  bg: null as HTMLCanvasElement | null,
  view: null as PixelView | null,
  party: { x: 430, y: 790, tx: 430, ty: 790, moving: false, flip: false },
  pending: null as Loc | null,
  hover: null as Loc | null,
  cam: { x: 0, y: 0 },
  band: { x: 1050, y: 1080, tx: 1050, ty: 1080, alive: true, respawn: 0, calm: 0, seen: false },
  onArrive: (_l: Loc) => {},
  onEncounter: () => {},
  onPatrol: (_owner: PatrolOwner) => {},
  loyal: [] as Loyal[],
  loyalHit: null as Loyal | null,
  onLoyal: () => {},
  onDiscover: (_l: Loc) => {},
  onDead: (_g: DeadGroup) => {},
  onGas: (_msg: string) => {},
  clouds: [] as Cloud[],
  inGas: false, gasDose: 0, filterUse: 0,
  pendingPatrol: null as Patrol | null,
  dead: [] as DeadGroup[],
  hungry: [] as Hungry[],
  demons: [] as LakeDemon[],
  demonHit: null as LakeDemon | null,
  onDemon: () => {},
  hungryHit: null as Hungry | null,
  onHungry: () => {},
  deadHit: null as DeadGroup | null,
  patrols: [] as Patrol[],
  onDay: () => {},
  lastDay: 0,

  init() {
    this.bg = renderBackground();
    this.band = { x: 1050, y: 1080, tx: 1050, ty: 1080, alive: true, respawn: 0, calm: 0, seen: false };
    this.lastDay = Math.floor(G.clock / 24);
    // первый выходит из Эшфорда к форту, второй — из форта к Ричморду: идут навстречу и расходятся
    this.clouds = [[200, 300], [760, 1080], [1250, 560], [-300, 420], [-650, 900], [1560, 1120], [900, 180], [-1250, 220], [-2050, 950], [-1500, 1150], [-2300, 380]].map(([x, y], i) => ({
      x, y, r: 70 + ((i * 37) % 50), vx: 9 + (i % 3) * 3, vy: ((i % 2) * 2 - 1) * 2, seed: i * 1.9 }));
    this.inGas = false; this.gasDose = 0; this.filterUse = 0;
    this.demons = [0.6, 3.6].map((a, i) => { const q = lakeRing(a, 1.25); return { id: i, x: q.x, y: q.y, tx: q.x, ty: q.y, alive: true, respawn: 0, calm: 0, seen: false, a }; });
    this.hungry = HUNGRY_START.map(([x, y], i) => ({ id: i, kinds: i % 2 ? ['hungry2', 'hungry', 'hungry'] : ['hungry', 'hungry2'], x, y, tx: x, ty: y, alive: true, respawn: 0, calm: 0, seen: false }));
    this.dead = DEAD_START.map(([id, kinds, x, y]) => ({ id, kinds, x, y, tx: x, ty: y, alive: true, respawn: 0, calm: 0, seen: false }));
    this.patrols = PATROL_PATHS.map((path, i) => { const len = polyLen(path); return { path, len, s: i === 0 ? len * 0.2 : i >= 3 ? len * (0.15 + (i - 3) * 0.3) : 0, dir: 1 as const, wait: 0, speed: i ? PATROL_SPEED * 1.15 : PATROL_SPEED * 0.9, owner: PATROL_OWNER[i] }; });
    this.loyal = LOYAL_START.map(([x, y], i) => ({ id: i, kinds: i === 1 ? ['loyal_off', 'loyalist', 'loyalist'] : ['loyalist', 'loyalist2'], x, y, tx: x, ty: y, alive: true, respawn: 0, calm: 0, seen: false }));
  },
  patrolPos(pt: Patrol) { return polyAt(pt.path, pt.s); },
  /** Патрули идут по дорогам туда и обратно, на концах отдыхают. Сами отряд не останавливают — с ними можно заговорить. */
  updatePatrols(dt: number) {
    const hours = dt * HOURS_PER_SEC, p = this.party;
    for (const pt of this.patrols) {
      if (pt.wait > 0) pt.wait -= hours;
      else {
        pt.s += pt.dir * pt.speed * hours;
        if (pt.s >= pt.len || pt.s <= 0) { pt.s = clamp(pt.s, 0, pt.len); pt.dir = pt.dir === 1 ? -1 : 1; pt.wait = 3 + Math.random() * 3; }
      }
    }
  },
  nearPatrol(q: Pt, r: number) { return this.patrols.some((pt) => dist(this.patrolPos(pt), q) < r); },

  /** Поставить отряд рядом с местом (после выхода из сцены). */
  placeAt(id: string) {
    const l = LOCS.find((l) => l.scene === id || l.id === id)!;
    this.party.x = this.party.tx = l.x; this.party.y = this.party.ty = l.y + 30;
    this.party.moving = false; this.pending = null;
    this.updateLocation();
    this.discover();
  },

  /** Примечательные места видны на карте, только когда отряд их нашёл — подошёл близко. */
  known(l: Loc) { return l.kind !== 'poi' || !!G.flags['found_' + l.id]; },
  discover() {
    for (const l of LOCS) if (l.kind === 'poi' && !G.flags['found_' + l.id] && dist(l, this.party) < FIND_R * Weather.sightK()) { G.flags['found_' + l.id] = true; this.onDiscover(l); }
  },
  locAt(x: number, y: number, r = 26) { return LOCS.find((l) => this.known(l) && Math.hypot(l.x - x, l.y - y) < (l.kind === 'fort' ? 70 : r)) ?? null; },
  nearLoc() { return LOCS.find((l) => this.known(l) && dist(l, this.party) < (l.kind === 'fort' ? 90 : 40)) ?? null; },
  updateLocation() {
    const l = this.nearLoc();
    G.location = l ? `У места: ${l.name}` : this.inCloud(this.party) ? 'Едкое облако' : inNorth(this.party) ? (onRoad(this.party) ? 'Северный тракт' : 'Северные леса') : this.party.x < FRONT_W0 ? 'Земли баронессы' : this.party.x < FRONT_X ? 'Старый фронт' : onRoad(this.party) ? 'Тракт' : 'Серая пустошь';
  },

  patrolNear(q: Pt, r: number) { return this.patrols.find((pt) => dist(this.patrolPos(pt), q) < r) ?? null; },
  click(mx: number, my: number) {
    const x = mx + this.cam.x, y = my + this.cam.y;
    if (Debug.clickTp) { // отладка: мгновенный перенос в точку
      this.party.x = this.party.tx = clamp(x, WX0 + 10, WW - 10); this.party.y = this.party.ty = clamp(y, WY0 + 10, WH - 10);
      this.party.moving = false; this.pending = null; this.pendingPatrol = null;
      this.updateLocation(); this.discover();
      return;
    }
    // клик по патрулю — подойти и заговорить
    const pt = this.patrolNear({ x, y: y + 8 }, 22);
    if (pt) { this.pending = null; this.pendingPatrol = pt; const q = this.patrolPos(pt); this.party.tx = q.x; this.party.ty = q.y; this.party.moving = true; return; }
    this.pendingPatrol = null;
    const l = this.locAt(x, y);
    if (l) { this.pending = l; this.party.tx = l.x; this.party.ty = l.y + (l.kind === 'fort' ? 60 : 0); }
    else { this.pending = null; this.party.tx = clamp(x, WX0 + 10, WW - 10); this.party.ty = clamp(y, WY0 + 10, WH - 10); }
    this.party.moving = true;
  },
  hoverAt(mx: number, my: number) { this.hover = this.locAt(mx + this.cam.x, my + this.cam.y); },
  interactKey() {
    const l = this.nearLoc();
    if (l) { this.onArrive(l); return; }
    const pn = this.patrolNear(this.party, 45);
    if (pn) { this.party.moving = false; this.onPatrol(pn.owner); }
  },

  update(dt: number) {
    const p = this.party, k = G.keys;
    // идём к патрулю — догоняем его и заговариваем
    if (this.pendingPatrol) {
      const q = this.patrolPos(this.pendingPatrol);
      p.tx = q.x; p.ty = q.y;
      if (dist(q, p) < 26) { const ow = this.pendingPatrol.owner; this.pendingPatrol = null; p.moving = false; G.keys.clear(); this.onPatrol(ow); return; }
    }
    let vx = 0, vy = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) vx -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) vx += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) vy -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) vy += 1;
    let moved = 0;
    const speed = SPEED * (onRoad(p) ? ROAD_BONUS : inNorth(p) ? 0.7 : 1) * HOURS_PER_SEC * Debug.speed * Weather.speedK();
    if (vx || vy) {
      const n = Math.hypot(vx, vy);
      p.x = clamp(p.x + (vx / n) * speed * dt, WX0 + 10, WW - 10); p.y = clamp(p.y + (vy / n) * speed * dt, WY0 + 10, WH - 10);
      if (vx) p.flip = vx < 0;
      p.moving = false; this.pending = null; this.pendingPatrol = null; moved = speed * dt;
    } else if (p.moving) {
      const d = Math.hypot(p.tx - p.x, p.ty - p.y), stepLen = Math.min(d, speed * dt);
      if (d > 0.5) { p.x += ((p.tx - p.x) / d) * stepLen; p.y += ((p.ty - p.y) / d) * stepLen; if (Math.abs(p.tx - p.x) > 1) p.flip = p.tx < p.x; moved = stepLen; }
      if (d - stepLen < 1) {
        p.moving = false;
        if (this.pending) { const l = this.pending; this.pending = null; this.onArrive(l); }
      }
    }
    if (moved) {
      G.clock += dt * HOURS_PER_SEC;
      this.discover();
      this.updateLocation();
      const day = Math.floor(G.clock / 24);
      if (day > this.lastDay) { this.lastDay = day; this.onDay(); }
      this.updatePatrols(dt);
      this.updateDead(dt);
      this.updateClouds(dt);
      this.updateBand(dt);
      this.updateHungry(dt);
      this.updateDemons(dt);
      this.updateLoyal(dt);
    }
  },

  /** Банда мародёров: бродит по пустоши, замечает отряд и преследует. */
  updateBand(dt: number) {
    const b = this.band, p = this.party;
    if (!b.alive) {
      if (G.clock >= b.respawn) {
        b.alive = true;
        do { b.x = 200 + Math.random() * 1500; b.y = 200 + Math.random() * 900; } while (dist(b, p) < 500 || LOCS.some((l) => l.kind !== 'poi' && dist(l, b) < 160));
        b.tx = b.x; b.ty = b.y;
      }
      return;
    }
    const d = dist(b, p);
    // при патруле рядом мародёры не нападают и уходят подальше от дороги
    const patrolNear = this.nearPatrol(b, 200);
    const chase = !Debug.invisible && d < 230 && G.clock >= b.calm && !patrolNear && !this.nearPatrol(p, 220) && !LOCS.some((l) => l.kind !== 'poi' && dist(l, p) < 110);
    if (patrolNear) {
      const pt = this.patrols.reduce((a, q) => (dist(this.patrolPos(q), b) < dist(this.patrolPos(a), b) ? q : a));
      const pp = this.patrolPos(pt), a = Math.atan2(b.y - pp.y, b.x - pp.x);
      b.tx = clamp(b.x + Math.cos(a) * 260, 100, WW - 250); b.ty = clamp(b.y + Math.sin(a) * 260, 100, WH - 100);
    }
    b.seen = d < 330;
    if (chase) { b.tx = p.x; b.ty = p.y; }
    else if (!patrolNear && (dist(b, { x: b.tx, y: b.ty }) < 4 || (G.clock < b.calm && dist(b, p) < 300))) {
      // бродим (или уходим подальше, если откупились)
      const away = G.clock < b.calm;
      const a = away ? Math.atan2(b.y - p.y, b.x - p.x) + (Math.random() - 0.5) : Math.random() * TAU;
      b.tx = clamp(b.x + Math.cos(a) * 250, 100, WW - 250); b.ty = clamp(b.y + Math.sin(a) * 250, 100, WH - 100);
      if (LOCS.some((l) => l.kind !== 'poi' && dist(l, { x: b.tx, y: b.ty }) < 150)) { b.tx = b.x; b.ty = b.y; }
    }
    const sp = (chase ? 68 : 40) * HOURS_PER_SEC * dt;
    const dd = dist(b, { x: b.tx, y: b.ty });
    if (dd > 0.5) { b.x += ((b.tx - b.x) / dd) * Math.min(sp, dd); b.y += ((b.ty - b.y) / dd) * Math.min(sp, dd); }
    if (chase && dist(b, p) < 20) { p.moving = false; this.pending = null; G.keys.clear(); this.onEncounter(); }
  },
  /** Голодные бандиты: бродят по земле барона, держатся подальше от деревень, форта и патрулей; заметив отряд — плетутся к нему. */
  updateHungry(dt: number) {
    const p = this.party, hours = dt * HOURS_PER_SEC;
    for (const g of this.hungry) {
      if (!g.alive) {
        if (G.clock >= g.respawn) {
          const s0 = HUNGRY_START[g.id];
          if (dist({ x: s0[0], y: s0[1] }, p) > 400) { g.alive = true; g.x = g.tx = s0[0]; g.y = g.ty = s0[1]; }
        }
        continue;
      }
      const d = dist(g, p), patrolNear = this.nearPatrol(g, 180);
      g.seen = d < 300;
      const chase = !Debug.invisible && d < 170 && G.clock >= g.calm && !patrolNear && !this.nearPatrol(p, 200) && inBaronLand(p) && !LOCS.some((l) => l.kind !== 'poi' && dist(l, p) < 100);
      if (chase) { g.tx = p.x; g.ty = p.y; }
      else if (patrolNear || dist(g, { x: g.tx, y: g.ty }) < 4) {
        for (let k = 0; k < 8; k++) {
          const a = Math.random() * TAU, t = { x: g.x + Math.cos(a) * 180, y: g.y + Math.sin(a) * 180 };
          if (inBaronLand(t) && !LOCS.some((l) => l.kind !== 'poi' && dist(l, t) < 140)) { g.tx = t.x; g.ty = t.y; break; }
        }
      }
      const sp = (chase ? 36 : 20) * hours, dd = dist(g, { x: g.tx, y: g.ty });   // медленнее отряда
      if (dd > 0.5) { g.x += ((g.tx - g.x) / dd) * Math.min(sp, dd); g.y += ((g.ty - g.y) / dd) * Math.min(sp, dd); }
      if (chase && d < 20) { p.moving = false; this.pending = null; G.keys.clear(); this.hungryHit = g; this.onHungry(); return; }
    }
  },
  /** Морские демоны: бродят кругом по берегу; заметив отряд у воды — идут к нему, но от озера не отходят. */
  updateDemons(dt: number) {
    const p = this.party, hours = dt * HOURS_PER_SEC;
    for (const g of this.demons) {
      if (!g.alive) {
        if (G.clock >= g.respawn) { const q = lakeRing(g.a, 1.25); if (dist(q, p) > 400) { g.alive = true; g.x = g.tx = q.x; g.y = g.ty = q.y; } }
        continue;
      }
      const d = dist(g, p);
      g.seen = d < 300;
      const chase = !Debug.invisible && d < 160 && G.clock >= g.calm && nearLake(p);
      if (chase) { g.tx = p.x; g.ty = p.y; }
      else if (dist(g, { x: g.tx, y: g.ty }) < 4) { g.a += 0.5 + Math.random() * 0.6; const q = lakeRing(g.a, 1.1 + Math.random() * 0.35); g.tx = q.x; g.ty = q.y; }
      const sp = (chase ? 34 : 14) * hours, dd = dist(g, { x: g.tx, y: g.ty });
      if (dd > 0.5) { g.x += ((g.tx - g.x) / dd) * Math.min(sp, dd); g.y += ((g.ty - g.y) / dd) * Math.min(sp, dd); }
      if (chase && d < 22) { p.moving = false; this.pending = null; G.keys.clear(); this.demonHit = g; this.onDemon(); return; }
    }
  },
  /** Лоялисты: прячутся в лесу вдали от дорог и патрулей; заметив одинокого путника в чаще — выходят к нему. */
  updateLoyal(dt: number) {
    const p = this.party, hours = dt * HOURS_PER_SEC;
    const ok = (q: Pt) => inNorth(q) && q.y > WY0 + 140 && q.x > 120 && q.x < WW - 140 && !nearRoad(q, 70) && !LOCS.some((l) => l.kind !== 'poi' && dist(l, q) < 170);
    for (const g of this.loyal) {
      if (!g.alive) {
        if (G.clock >= g.respawn) { const s0 = LOYAL_START[g.id]; if (dist({ x: s0[0], y: s0[1] }, p) > 450) { g.alive = true; g.x = g.tx = s0[0]; g.y = g.ty = s0[1]; } }
        continue;
      }
      const d = dist(g, p), patrolNear = this.nearPatrol(g, 220);
      g.seen = d < 240 * Weather.sightK();
      const chase = !Debug.invisible && d < 150 && G.clock >= g.calm && !patrolNear && !this.nearPatrol(p, 240) && inNorth(p) && !onRoad(p) && !LOCS.some((l) => l.kind !== 'poi' && dist(l, p) < 120);
      if (chase) { g.tx = p.x; g.ty = p.y; }
      else if (patrolNear || dist(g, { x: g.tx, y: g.ty }) < 4) {
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * TAU, t = { x: g.x + Math.cos(a) * 170, y: g.y + Math.sin(a) * 170 };
          if (ok(t)) { g.tx = t.x; g.ty = t.y; break; }
        }
      }
      const sp = (chase ? 40 : 18) * hours, dd = dist(g, { x: g.tx, y: g.ty });
      if (dd > 0.5) { g.x += ((g.tx - g.x) / dd) * Math.min(sp, dd); g.y += ((g.ty - g.y) / dd) * Math.min(sp, dd); }
      if (chase && d < 20) { p.moving = false; this.pending = null; G.keys.clear(); this.loyalHit = g; this.onLoyal(); return; }
    }
  },
  killLoyal() { const g = this.loyalHit; if (g) { g.alive = false; g.respawn = G.clock + 96; } this.loyalHit = null; },
  calmLoyal(hours: number) {
    const g = this.loyalHit, p = this.party; if (!g) return;
    g.calm = G.clock + hours;
    const a = Math.atan2(g.y - p.y, g.x - p.x);
    g.tx = clamp(g.x + Math.cos(a) * 200, 140, WW - 160); g.ty = clamp(g.y + Math.sin(a) * 200, WY0 + 160, NORTH_Y - 60);
    this.loyalHit = null;
  },
  killDemon() { const g = this.demonHit; if (g) { g.alive = false; g.respawn = G.clock + 72; } this.demonHit = null; },
  calmDemon(hours: number) { const g = this.demonHit; if (g) { g.calm = G.clock + hours; g.a += 1.5; const q = lakeRing(g.a, 1.2); g.tx = q.x; g.ty = q.y; } this.demonHit = null; },

  killHungry() { const g = this.hungryHit; if (g) { g.alive = false; g.respawn = G.clock + 36; } this.hungryHit = null; },
  calmHungry(hours: number) {
    const g = this.hungryHit, p = this.party; if (!g) return;
    g.calm = G.clock + hours;
    const a = Math.atan2(g.y - p.y, g.x - p.x);
    g.tx = clamp(g.x + Math.cos(a) * 220, 220, 1630); g.ty = clamp(g.y + Math.sin(a) * 220, 140, WH - 140);
    this.hungryHit = null;
  },

  /** Мертвецы бредут по фронту; заметив отряд, идут на него, но за пределы фронта не выходят. */
  updateDead(dt: number) {
    const p = this.party, hours = dt * HOURS_PER_SEC;
    for (const g of this.dead) {
      if (!g.alive) {
        // павшие снова поднимаются — через двое суток, подальше от отряда
        if (G.clock >= g.respawn) {
          const s0 = DEAD_START.find((d) => d[0] === g.id)!;
          if (dist({ x: s0[2], y: s0[3] }, p) > 400) { g.alive = true; g.x = g.tx = s0[2]; g.y = g.ty = s0[3]; }
        }
        continue;
      }
      const d = dist(g, p);
      g.seen = d < 320;
      const chase = !Debug.invisible && d < 190 && G.clock >= g.calm && inFront(p);
      if (chase) { g.tx = p.x; g.ty = p.y; }
      else if (dist(g, { x: g.tx, y: g.ty }) < 4) {
        for (let k = 0; k < 8; k++) {
          const a = Math.random() * TAU, t = { x: g.x + Math.cos(a) * 160, y: g.y + Math.sin(a) * 160 };
          if (inFront(t)) { g.tx = t.x; g.ty = t.y; break; }
        }
      }
      const sp = (chase ? 42 : 22) * hours, dd = dist(g, { x: g.tx, y: g.ty });
      if (dd > 0.5) { g.x += ((g.tx - g.x) / dd) * Math.min(sp, dd); g.y += ((g.ty - g.y) / dd) * Math.min(sp, dd); }
      if (chase && d < 20) { p.moving = false; this.pending = null; G.keys.clear(); this.deadHit = g; this.onDead(g); return; }
    }
  },
  /** Облака дрейфуют; если отряд внутри — противогаз тратит фильтры, иначе газ отравляет. */
  updateClouds(dt: number) {
    const hours = dt * HOURS_PER_SEC, p = this.party;
    for (const cl of this.clouds) {
      cl.x += cl.vx * hours; cl.y += cl.vy * hours + Math.sin(G.clock * 0.3 + cl.seed) * 0.4 * hours;
      if (cl.x > WW + 160) { cl.x = WX0 - 160; cl.y = 150 + Math.random() * (WH - 300); }
      if (cl.y < 60 || cl.y > WH - 60) cl.vy = -cl.vy;
    }
    const inside = this.clouds.some((cl) => dist(cl, p) < cl.r * 0.8);
    const mask = hasTool('gasmask') && G.supplies.filter > 0;
    if (inside && !this.inGas) this.onGas(mask ? 'Едкое облако. Вы натягиваете противогаз.' : 'Едкое облако! Без противогаза газ обжигает лёгкие — выбирайтесь скорее.');
    this.inGas = inside;
    if (!inside) return;
    if (mask) {
      this.filterUse += hours;
      if (this.filterUse >= 3) { this.filterUse = 0; G.supplies.filter--; this.onGas(`Фильтр противогаза отработал (осталось ${G.supplies.filter}).`); }
      return;
    }
    this.gasDose += hours;
    while (this.gasDose >= 1) {
      this.gasDose -= 1;
      let poisoned = false;
      for (const b of G.squad) { b.hp = Math.max(1, b.hp - 2); if (addWoundId(b, 'gassed')) poisoned = true; }
      this.onGas(poisoned ? 'Отравление газом: кашель, резь в глазах (−2 ОЗ, −1 к атакам до привала).' : 'Газ жжёт лёгкие: −2 ОЗ.');
    }
  },
  inCloud(q: Pt) { return this.clouds.some((cl) => dist(cl, q) < cl.r * 0.8); },

  killDead() { const g = this.deadHit; if (g) { g.alive = false; g.respawn = G.clock + 48; } },
  /** Оторвались от мертвецов: они на время теряют след и бредут прочь. */
  calmDead(hours: number) {
    const g = this.deadHit, p = this.party; if (!g) return;
    g.calm = G.clock + hours;
    const a = Math.atan2(g.y - p.y, g.x - p.x);
    g.tx = clamp(g.x + Math.cos(a) * 200, FRONT_W0 + 60, FRONT_X - 40); g.ty = clamp(g.y + Math.sin(a) * 200, 100, WH - 100);
  },

  /** После откупа или удачного бегства банда на время отстаёт. */
  calmBand(hours: number) { this.band.calm = G.clock + hours; },
  killBand() { this.band.alive = false; this.band.respawn = G.clock + 72; },

  // ========================================================== обзорная карта (окно по M)
  /** Весь регион целиком: фон, найденные места, подписи, где сейчас отряд. hover — точка под мышью (в пикселях холста). */
  drawOverview(c: CanvasRenderingContext2D, cw: number, ch: number, t: number, hover: Pt | null) {
    if (!this.bg) return null;
    const bg = this.bg, k = Math.min(cw / bg.width, ch / bg.height), dw = bg.width * k, dh = bg.height * k, ox = (cw - dw) / 2, oy = (ch - dh) / 2;
    const X = (wx: number) => ox + (wx / 2 + OX) * k, Y = (wy: number) => oy + (wy / 2 + OY) * k;
    c.fillStyle = '#0d130c'; c.fillRect(0, 0, cw, ch);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(bg, ox, oy, dw, dh);
    c.fillStyle = 'rgba(20,26,16,0.2)'; c.fillRect(ox, oy, dw, dh); // приглушить, как под светом Ока
    // подпись не вылезает за край холста
    const text = (str: string, x: number, y: number, col: string) => {
      const half = c.measureText(str).width / 2 + 4, tx = clamp(x, half, cw - half);
      c.fillStyle = 'rgba(0,0,0,0.9)'; c.fillText(str, tx + 1, y + 1); c.fillStyle = col; c.fillText(str, tx, y);
    };
    for (const l of LOCS) { const ic = POI_ICONS.get(l.id); if (ic && this.known(l)) c.drawImage(ic.cv, ox + (ic.ox + OX) * k, oy + (ic.oy + OY) * k, ic.cv.width * k, ic.cv.height * k); }
    // земли — крупными бледными буквами
    c.textAlign = 'center';
    c.font = `italic ${Math.round(ch * 0.034)}px "Old Standard TT", serif`;
    for (const [name, wx, wy] of [['Земли барона', 1000, 1120], ['Старый фронт', -390, 1080], ['Земли баронессы', -1700, 1150], ['Северные леса — земли Собрания', 700, -1110]] as [string, number, number][])
      text(name, X(wx), Y(wy), 'rgba(216,206,170,0.7)');
    // места: точка и название
    let hov: Loc | null = null;
    for (const l of LOCS) {
      if (!this.known(l)) continue;
      const x = X(l.x), y = Y(l.y);
      if (hover && Math.hypot(hover.x - x, hover.y - y) < (l.kind === 'fort' ? 22 : 14)) hov = l;
    }
    for (const l of LOCS) {
      if (!this.known(l)) continue;
      const x = X(l.x), y = Y(l.y), big = l.kind === 'fort', poi = l.kind === 'poi', hv = hov === l;
      c.fillStyle = hv ? '#ffe8a0' : poi ? '#c8c0a0' : '#e8dcb0';
      c.beginPath(); c.arc(x, y, big ? 5 : poi ? 2.5 : 3.5, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = 1.5; c.stroke();
      c.font = poi ? `italic ${Math.round(ch * 0.026)}px "Old Standard TT", serif` : `bold ${Math.round(ch * (big ? 0.036 : 0.03))}px "Playfair Display SC", serif`;
      text(l.name, x, l.id === 'brimmor' ? y + 18 : y - (big ? 10 : 7), hv ? '#ffe8a0' : poi ? '#c8c0a0' : '#e8dcb0');
    }
    // отряд — пульсирующее кольцо
    const px = X(this.party.x), py = Y(this.party.y), pr = 6 + (Math.sin(t * 4) + 1) * 3;
    c.strokeStyle = 'rgba(240,200,110,0.9)'; c.lineWidth = 2; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.stroke();
    c.fillStyle = '#f0c86e'; c.beginPath(); c.arc(px, py, 3, 0, TAU); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke();
    c.font = `italic ${Math.round(ch * 0.028)}px "Old Standard TT", serif`;
    text('Вы здесь', px, py + 22, '#f0d890');
    c.textAlign = 'left';
    return hov;
  },

  // ========================================================== отрисовка
  draw(c: CanvasRenderingContext2D, t: number) {
    const p = this.party;
    // камера — в пикселях карты, кратно 2 (один пиксель фона = 2 пикселя карты)
    this.cam.x = Math.round(clamp(p.x - VW / 2, WX0, WW - VW) / 2) * 2;
    this.cam.y = Math.round(clamp(p.y - VH / 2, WY0, WH - VH) / 2) * 2;
    const cx = this.cam.x, cy = this.cam.y, lx = cx / 2, ly = cy / 2;
    const v = (this.view ??= new PixelView(LW, LH)), lc = v.c;
    lc.drawImage(this.bg!, lx + OX, ly + OY, LW, LH, 0, 0, LW, LH);
    for (const l of LOCS) { // найденные примечательности
      const ic = POI_ICONS.get(l.id);
      if (ic && this.known(l)) lc.drawImage(ic.cv, ic.ox - lx, ic.oy - ly);
    }
    const X = (wx: number) => Math.round(wx / 2 - lx), Y = (wy: number) => Math.round(wy / 2 - ly);

    // дым над фортом — пиксельные клубы с растром
    for (let i = 0; i < 5; i++) {
      const k = (t * 0.22 + i * 0.21) % 1;
      const sx = X(1700 + i * 22) + k * 20, sy = Y(760) - k * 45, r = 4 + k * 13;
      ditherDisc(lc, sx, sy, r, '#3c463a', 0.55 * (1 - k));
    }
    const fl = LOCS.find((l) => l.id === 'flare')!;
    if (this.known(fl)) pixelFlame(lc, X(fl.x), Y(fl.y) - 13, t); // зарево видно издалека, сам факел — когда найден

    // метки примечательностей
    for (const l of LOCS) {
      if (l.kind !== 'poi' || !this.known(l)) continue;
      const hv = this.hover === l || this.pending === l;
      if (hv) ditherRing(lc, X(l.x), Y(l.y), 12, '#e8d090');
    }
    // цель пути — пунктир по пикселям
    if (p.moving) {
      const x0 = X(p.x), y0 = Y(p.y), x1 = X(p.tx), y1 = Y(p.ty), n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
      lc.fillStyle = '#e8d090';
      for (let i = 0; i < n; i++) if ((i + Math.floor(t * 8)) % 6 < 3) lc.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1);
      const rr = 2 + (Math.floor(t * 4) % 2);
      prect(lc, x1 - rr, y1, 1, 1, '#e8d090'); prect(lc, x1 + rr, y1, 1, 1, '#e8d090'); prect(lc, x1, y1 - rr, 1, 1, '#e8d090'); prect(lc, x1, y1 + rr, 1, 1, '#e8d090');
    }
    const fr = (moving: boolean, ph = 0) => moving ? [0, 1, 2, 3][Math.floor(t * 7 + ph) % 4] : 0;
    const mini = (kind: string, x: number, y: number, flip: boolean, frame: number) => {
      const sp = miniSprite(kind, frame), dx = Math.round(x - 6), dy = Math.round(y - 16);
      pshadow(lc, Math.round(x), Math.round(y), 4, 1);
      if (flip) { lc.save(); lc.translate(dx * 2 + 12, 0); lc.scale(-1, 1); lc.drawImage(sp, dx, dy); lc.restore(); }
      else lc.drawImage(sp, dx, dy);
    };
    // банда
    const b = this.band;
    if (b.alive && b.seen) {
      const bm = dist(b, { x: b.tx, y: b.ty }) > 1;
      mini('militia_gun', X(b.x) - 4, Y(b.y), b.tx < b.x, fr(bm));
      mini('militia', X(b.x) + 4, Y(b.y) + 2, b.tx < b.x, fr(bm, 2));
    }
    const pm0 = p.moving || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].some((kk) => G.keys.has(kk));
    // морские демоны — ползут вдоль берега
    for (const g of this.demons) {
      if (!g.alive || !g.seen) continue;
      const sp = miniSprite('salamander', pm0 ? Math.floor(t * 4) % 4 : 0), fl = g.tx < g.x, dx = Math.round(X(g.x) - 7), dy = Math.round(Y(g.y) - 17);
      pshadow(lc, Math.round(X(g.x)), Math.round(Y(g.y)), 9, 2);
      if (fl) { lc.save(); lc.translate(dx * 2 + 14, 0); lc.scale(-1, 1); lc.drawImage(sp, dx, dy); lc.restore(); } else lc.drawImage(sp, dx, dy);
    }
    // лоялисты — кучкой, в выцветших мундирах
    for (const g of this.loyal) {
      if (!g.alive || !g.seen) continue;
      const fl = g.tx < g.x;
      g.kinds.forEach((k, i) => mini(k, X(g.x) + (i - 1) * 7, Y(g.y) + (i % 2) * 3, fl, fr(pm0, i * 1.1)));
    }
    // голодные бандиты — плетутся кучкой
    for (const g of this.hungry) {
      if (!g.alive || !g.seen) continue;
      const fl = g.tx < g.x;
      g.kinds.forEach((k, i) => mini(k, X(g.x) + (i - 1) * 7, Y(g.y) + (i % 2) * 3, fl, fr(pm0, i * 1.3)));
    }
    // мертвецы — бредут вразвалку, кучкой
    for (const g of this.dead) {
      if (!g.alive || !g.seen) continue;
      const fl = g.tx < g.x, mv = pm0 || dist(g, { x: g.tx, y: g.ty }) > 1;
      g.kinds.forEach((k, i) => mini(k, X(g.x) + (i - 1) * 7, Y(g.y) + (i % 2) * 3, fl, fr(mv && pm0, i * 1.7)));
    }
    // патрули барона: трое стражников гуськом
    for (const pt of this.patrols) {
      const pos = this.patrolPos(pt), back = pt.dir === 1 ? -1 : 1, walk = pm0 && pt.wait <= 0;
      const fl = (pt.dir === 1 ? pos.dx : -pos.dx) < 0;
      for (let k = 2; k >= 0; k--) {
        const q = polyAt(pt.path, clamp(pt.s + back * k * 9, 0, pt.len));
        mini(pt.owner === 'baroness' ? 'bguard' : pt.owner === 'revo' ? (k === 0 ? 'brother_off' : k === 1 ? 'brother' : 'brother2') : 'guard', X(q.x), Y(q.y), fl, fr(walk, k * 1.3));
      }
    }
    // отряд
    const pm = p.moving || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].some((kk) => G.keys.has(kk));
    mini(G.squad[0]?.look ?? 'pc', X(p.x), Y(p.y), p.flip, fr(pm));

    // едкие облака — клубы растром, медленно клубятся
    for (const cl of this.clouds) {
      const sx = X(cl.x), sy = Y(cl.y), rr = cl.r / 2;
      if (sx < -rr - 20 || sx > LW + rr + 20 || sy < -rr - 20 || sy > LH + rr + 20) continue;
      for (let k = 0; k < 6; k++) {
        const a = k * 1.05 + cl.seed + t * 0.08, d = rr * (k ? 0.45 : 0);
        ditherDisc(lc, sx + Math.cos(a) * d, sy + Math.sin(a) * d * 0.6, rr * (k ? 0.6 : 0.8), k % 2 ? '#8a9a3a' : '#a4b04a', 0.5, 1);
      }
    }
    // свет
    const lights: PLight[] = [];
    const L = (wx: number, wy: number, r: number, a: number, color?: string) => lights.push({ x: X(wx), y: Y(wy), r, a, color });
    for (const l of LOCS) {
      if (l.kind === 'village') L(l.x, l.y, l.id === 'einbow' ? 30 : 48, l.id === 'einbow' ? 0.3 : 0.55, l.id === 'fenmor' ? '#a8f070' : l.id === 'einbow' ? '#c86a40' : '#f0c070');
      if (l.kind === 'fort') L(l.x, l.y - 30, 100, 0.6, '#e8d090');
    }
    L(fl.x, fl.y - 30, 80, 0.7 + Math.sin(t * 9) * 0.08, '#ff9a40');
    L(p.x, p.y, 58, 0.55, '#d8c890');
    for (const pt of this.patrols) { const q = this.patrolPos(pt); L(q.x, q.y - 8, 34, 0.5, '#f0d090'); } // фонарь патруля
    for (const g of this.dead) if (g.alive && g.seen) L(g.x, g.y - 6, 22, 0.35, '#a8f070'); // гнилушечный отсвет глаз
    const wl = Weather.light([0.84, 1, 0.78], 0.3);
    applyLight(lc, LW, LH, lights, wl.ambient, wl.tint, wl.vig);
    Weather.draw(lc, LW, LH, t, lx, ly);
    // пепел — по одному пикселю
    lc.fillStyle = 'rgba(190,196,170,0.55)';
    for (let i = 0; i < 40; i++) {
      const ax = ((i * 97.3 + t * (6 + (i % 5) * 2)) % (LW + 20)) - 10, ay = ((i * 53.7 + t * (9 + (i % 3) * 3)) % (LH + 20)) - 10;
      lc.fillRect(Math.round(ax + Math.sin(t + i) * 3), Math.round(ay), 1, 1);
    }
    v.present(c, 0, 0, PS);

    // подписи (чёткий текст поверх пиксельного слоя)
    for (const l of LOCS) {
      if (!this.known(l)) continue;
      const x = l.x - cx, y = l.y - cy + (l.kind === 'fort' ? 110 : l.id === 'richmord' ? 70 : l.id === 'hawley' ? 56 : l.id === 'ashford' ? 78 : l.kind === 'village' ? 44 : 30);
      if (x < -100 || x > VW + 100 || y < -40 || y > VH + 40) continue;
      const hv = this.hover === l || this.pending === l;
      c.font = l.kind === 'poi' ? 'italic 13px "Old Standard TT", serif' : `bold ${l.kind === 'fort' ? 20 : 16}px "Playfair Display SC", serif`;
      c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText(l.name, x + 2, y + 2);
      c.fillStyle = hv ? '#ffe8a0' : l.kind === 'poi' ? '#c8c0a0' : '#e8dcb0'; c.fillText(l.name, x, y);
      if (hv) { c.font = '12px "Old Standard TT", serif'; c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText(l.desc, x + 1, y + 17); c.fillStyle = '#c9c4aa'; c.fillText(l.desc, x, y + 16); }
      c.textAlign = 'left';
    }
    if (b.alive && b.seen) {
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      c.fillStyle = '#e07060'; c.fillText(G.clock < b.calm ? 'Мародёры (отстали)' : dist(b, p) < 230 ? 'Мародёры — преследуют!' : 'Мародёры', b.x - cx, b.y - cy - 40);
      c.textAlign = 'left';
    }
    for (const g of this.demons) {
      if (!g.alive || !g.seen) continue;
      const lbl = G.clock < g.calm ? 'Морской демон (ушёл в воду)' : dist(g, p) < 160 && nearLake(p) ? 'Морской демон — идёт к вам!' : 'Морской демон';
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText(lbl, g.x - cx + 1, g.y - cy - 33);
      c.fillStyle = '#9ac8a0'; c.fillText(lbl, g.x - cx, g.y - cy - 34);
      c.textAlign = 'left';
    }
    for (const g of this.loyal) {
      if (!g.alive || !g.seen) continue;
      const lbl = G.clock < g.calm ? 'Лоялисты (скрылись)' : dist(g, p) < 150 && !onRoad(p) ? 'Лоялисты — выходят к вам' : 'Лоялисты';
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText(lbl, g.x - cx + 1, g.y - cy - 39);
      c.fillStyle = '#a8b0d0'; c.fillText(lbl, g.x - cx, g.y - cy - 40);
      c.textAlign = 'left';
    }
    for (const g of this.hungry) {
      if (!g.alive || !g.seen) continue;
      const lbl = G.clock < g.calm ? 'Голодные бандиты (ушли)' : dist(g, p) < 170 ? 'Голодные бандиты — идут к вам' : 'Голодные бандиты';
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText(lbl, g.x - cx + 1, g.y - cy - 39);
      c.fillStyle = '#c8a878'; c.fillText(lbl, g.x - cx, g.y - cy - 40);
      c.textAlign = 'left';
    }
    for (const g of this.dead) {
      if (!g.alive || !g.seen) continue;
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText('Мертвецы', g.x - cx + 1, g.y - cy - 39);
      c.fillStyle = '#a8d070'; c.fillText(G.clock < g.calm ? 'Мертвецы (потеряли след)' : dist(g, p) < 190 && inFront(p) ? 'Мертвецы — идут на вас!' : 'Мертвецы', g.x - cx, g.y - cy - 40);
      c.textAlign = 'left';
    }
    this.patrols.forEach((pt, i) => {
      const q = this.patrolPos(pt), sx = q.x - cx, sy = q.y - cy;
      if (sx < -60 || sx > VW + 60 || sy < -40 || sy > VH + 60) return;
      if (this.patrols.slice(0, i).some((o) => dist(this.patrolPos(o), q) < 60)) return; // два патруля рядом — одна подпись
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      const lbl = pt.owner === 'baroness' ? 'Патруль баронессы' : pt.owner === 'revo' ? 'Братья свободы' : 'Патруль барона';
      c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText(lbl, sx + 1, sy - 39);
      c.fillStyle = pt.owner === 'baroness' ? '#d8a0a0' : pt.owner === 'revo' ? '#e07a68' : '#d8c080'; c.fillText(lbl, sx, sy - 40);
      c.textAlign = 'left';
    });
    const near = this.nearLoc();
    const nearPt = !near && !p.moving ? this.patrolNear(p, 45) : null;
    if ((near || nearPt) && !p.moving) {
      const label = `[E] ${near ? near.name : 'Заговорить с патрулём'}`;
      c.font = '13px "Old Standard TT", serif';
      const w = c.measureText(label).width + 14, x = p.x - cx - w / 2, y = p.y - cy - 58;
      c.fillStyle = 'rgba(8,12,7,0.85)'; c.fillRect(x, y, w, 18); c.strokeStyle = '#c09a52'; c.strokeRect(x + 0.5, y + 0.5, w - 1, 17);
      c.fillStyle = '#e0dcc0'; c.textAlign = 'center'; c.fillText(label, x + w / 2, y + 13); c.textAlign = 'left';
    }
  },
};

const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((q) => (q + 0.5) / 16);
/** Полупрозрачный диск честным растром: пиксели либо есть, либо нет. */
function ditherDisc(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string, a: number, soft = 0.6) {
  c.fillStyle = col;
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x - cx, y - cy) / r;
    if (d < 1 && a * (1 - d * d * soft) > BAY[(y & 3) * 4 + (x & 3)]) c.fillRect(x, y, 1, 1);
  }
}
function ditherRing(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string) {
  c.fillStyle = col;
  for (let i = 0; i < 48; i++) { if (i % 3 === 2) continue; const a = (i / 48) * TAU; c.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.6), 1, 1); }
}
function pixelFlame(c: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const cols = ['#c04818', '#e88030', '#f8c860', '#fff0b0'];
  for (let i = 0; i < 4; i++) {
    const h = 8 - i * 2 + Math.round(Math.sin(t * 11 + i * 2) * 1.5), w = 3 - Math.floor(i * 0.7);
    for (let yy = 0; yy < h; yy++) {
      const ww = Math.max(0, Math.round(w * (1 - yy / h))), sw = Math.round(Math.sin(t * 9 + yy * 0.8) * (yy / h) * 1.5);
      prect(c, x - ww + sw, y - yy, ww * 2 + 1, 1, cols[i]);
    }
  }
}

/** Время: «День 3, 14:00». */
export function clockText() {
  const d = Math.floor(G.clock / 24) + 1, h = Math.floor(G.clock % 24);
  return `День ${d}, ${String(h).padStart(2, '0')}:00`;
}

// ============================================================ фон карты (пиксельный, 960×640)
const BW = (WW - WX0) / 2, BH = (WH - WY0) / 2;
const INK = '#0c0e0a';

/** Нарисовать значок на отдельном холсте, обвести контуром и вклеить (x, y — точка опоры внизу по центру). */
function stamp(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, draw: (s: CanvasRenderingContext2D) => void, edge = true) {
  const cv = document.createElement('canvas'); cv.width = w + 2; cv.height = h + 2;
  const s = cv.getContext('2d')!; s.translate(1, 1); draw(s);
  if (edge) outline(cv, INK);
  c.drawImage(cv, Math.round(x - w / 2 - 1), Math.round(y - h - 1));
}

const POI_ICONS = new Map<string, { cv: HTMLCanvasElement; ox: number; oy: number }>();

function renderBackground(): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = BW; cv.height = BH;
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const r = seeded(4242);
  c.translate(OX, OY); // всё ниже — в координатах мира / 2 (запад и север уходят в минус)
  // --- мягкая основа (потом квантуется растром)
  c.save(); c.scale(0.5, 0.5);
  c.fillStyle = '#4a4a42'; c.fillRect(WX0, 0, WW - WX0, WH);
  // север: тёмная лесная подстилка, к границе — переход в серую пустошь
  c.fillStyle = '#2a2e26'; c.fillRect(WX0, WY0, WW - WX0, -WY0);
  { const g = c.createLinearGradient(0, -80, 0, 60); g.addColorStop(0, 'rgba(42,46,38,1)'); g.addColorStop(1, 'rgba(74,74,66,0)'); c.fillStyle = g; c.fillRect(WX0, -80, WW - WX0, 140); }
  for (let i = 0; i < 1300; i++) {
    const x = WX0 + r() * (WW - WX0), y = r() * WH, rr = 30 + r() * 110;
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    const v = r() < 0.5 ? '30,30,26' : '110,108,96';
    g.addColorStop(0, `rgba(${v},${0.06 + r() * 0.08})`); g.addColorStop(1, `rgba(${v},0)`);
    c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  const hill = (x: number, y: number, s: number) => {
    const g = c.createRadialGradient(x - s * 0.3, y - s * 0.3, 2, x, y, s);
    g.addColorStop(0, 'rgba(126,124,108,0.45)'); g.addColorStop(0.6, 'rgba(60,60,52,0.15)'); g.addColorStop(1, 'rgba(20,20,16,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, s, s * 0.6, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(15,15,12,0.3)'; c.beginPath(); c.ellipse(x + s * 0.25, y + s * 0.22, s * 0.8, s * 0.4, 0, 0, TAU); c.fill();
  };
  for (const [x, y, n] of [[1500, 300, 7], [300, 1100, 6], [900, 1150, 5], [1650, 1150, 5], [150, 200, 4], [1300, 620, 3]]) for (let i = 0; i < n; i++) hill(x + (r() - 0.5) * 260, y + (r() - 0.5) * 160, 40 + r() * 50);
  // болото вокруг Фенмора
  for (let i = 0; i < 46; i++) {
    const a = r() * TAU, d = 30 + r() * 170, x = 470 + Math.cos(a) * d, y = 270 + Math.sin(a) * d * 0.7;
    c.fillStyle = r() < 0.5 ? 'rgba(22,38,24,0.75)' : 'rgba(44,60,32,0.6)';
    c.beginPath(); c.ellipse(x, y, 10 + r() * 26, 5 + r() * 12, r() * 3, 0, TAU); c.fill();
  }
  // нефтяные пятна у Эшфорда
  for (let i = 0; i < 18; i++) { c.fillStyle = 'rgba(16,15,12,0.55)'; c.beginPath(); c.ellipse(180 + r() * 360, 600 + r() * 240, 8 + r() * 18, 4 + r() * 8, r() * 3, 0, TAU); c.fill(); }
  // старый фронт: перепаханная грязь и застоявшийся газ
  for (let i = 0; i < 320; i++) {
    const x = FRONT_W0 + 20 + r() * (FRONT_X - FRONT_W0), y = 60 + r() * (WH - 120), rr = 20 + r() * 60;
    c.fillStyle = r() < 0.6 ? 'rgba(40,33,24,0.28)' : 'rgba(96,88,70,0.18)';
    c.beginPath(); c.ellipse(x, y, rr, rr * 0.6, r() * 3, 0, TAU); c.fill();
  }
  for (let i = 0; i < 14; i++) {
    const x = FRONT_W0 + 80 + r() * (FRONT_X - FRONT_W0 - 120), y = 120 + r() * (WH - 240), rr = 60 + r() * 90;
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, 'rgba(110,150,60,0.22)'); g.addColorStop(1, 'rgba(110,150,60,0)');
    c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  { // пятна подлеска, сырости и тени под кронами
    const rn = seeded(911);
    for (let i = 0; i < 900; i++) {
      const x = WX0 + rn() * (WW - WX0), y = WY0 + rn() * (-WY0 + 30), rr = 30 + rn() * 100;
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      const v = rn() < 0.6 ? '16,24,16' : '70,84,58';
      g.addColorStop(0, `rgba(${v},${0.08 + rn() * 0.1})`); g.addColorStop(1, `rgba(${v},0)`);
      c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
  }
  c.restore();
  quantize(c, BW, BH, 10);

  // --- чёткие пиксельные детали
  const pts = (a: number[][]) => a.map(([x, y]) => [x / 2, y / 2]);
  const thick = (poly: number[][], col: string, w: number, dash?: [number, number]) => {
    c.fillStyle = col;
    for (let i = 1; i < poly.length; i++) {
      const [x0, y0] = poly[i - 1], [x1, y1] = poly[i], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let k = 0; k <= n; k++) {
        if (dash && (k % (dash[0] + dash[1])) >= dash[0]) continue;
        c.fillRect(Math.round(x0 + (x1 - x0) * k / n - (w - 1) / 2), Math.round(y0 + (y1 - y0) * k / n - (w - 1) / 2), w, w);
      }
    }
  };
  // трещины
  for (let i = 0; i < 540; i++) {
    let x = -OX + r() * BW, y = r() * (WH / 2);
    for (let k = 0; k < 3; k++) { const nx = x + (r() - 0.5) * 14, ny = y + (r() - 0.5) * 14; pline(c, x, y, nx, ny, '#34342e'); x = nx; y = ny; }
  }
  // сухое русло
  const bed: number[][] = [];
  for (let i = 0; i <= 64; i++) { const x = (i / 64) * (WW / 2); bed.push([x, 180 + Math.sin(i * 0.31) * 22 + i * 1.7 + Math.sin(i * 0.9) * 4]); }
  thick(bed, '#2c2a22', 5); thick(bed, '#3a372e', 3); thick(bed, '#5a5646', 1, [3, 4]);
  // мёртвые рощи
  const tree = (x: number, y: number) => {
    const h = 4 + Math.floor(r() * 3);
    prect(c, x, y - h, 1, h, '#1c1a15');
    ppx(c, x - 1, y - h + 1, '#1c1a15'); ppx(c, x - 2, y - h, '#1c1a15');
    ppx(c, x + 1, y - h + 2, '#1c1a15'); ppx(c, x + 2, y - h + 1, '#1c1a15');
    ppx(c, x + 1, y, 'rgba(0,0,0,0.35)');
  };
  for (const [x, y, n] of [[650, 580, 40], [1420, 560, 45], [250, 430, 35], [1050, 1150, 30], [820, 1020, 20], [1600, 420, 25]]) for (let i = 0; i < n; i++) tree(Math.round((x + (r() - 0.5) * 220) / 2), Math.round((y + (r() - 0.5) * 130) / 2));
  // камыш на болоте
  for (let i = 0; i < 180; i++) {
    const a = r() * TAU, d = r() * 200, x = Math.round((470 + Math.cos(a) * d) / 2), y = Math.round((270 + Math.sin(a) * d * 0.7) / 2);
    prect(c, x, y - 2, 1, 2 + Math.round(r()), r() < 0.5 ? '#4a5e32' : '#5e7038');
  }
  // вышки на нефтяном поле
  const derrick = (x: number, y: number) => stamp(c, x, y, 7, 9, (s) => {
    for (let k = 0; k < 8; k++) { const w = Math.round(3 - k * 0.4); ppx(s, 3 - w, 8 - k, '#1e1c17'); ppx(s, 3 + w, 8 - k, '#1e1c17'); }
    prect(s, 2, 5, 3, 1, '#1e1c17'); ppx(s, 3, 0, '#1e1c17'); prect(s, 1, 9, 5, 1, 'rgba(0,0,0,0.4)');
  }, false);
  for (let i = 0; i < 20; i++) derrick(Math.round((180 + r() * 360) / 2), Math.round((600 + r() * 240) / 2));
  // старый фронт: траншеи, проволока, воронки, остовы техники
  drawWarZone(c, r, thick);
  // земли баронессы: озеро и реки (дороги и рельсы ложатся поверх — мосты и броды)
  drawWater(c, r, thick);
  // север: густой лес бывших земель барона Сильвера
  drawForest(c);
  // железная дорога: насыпь, шпалы, рельсы
  const track = (poly: number[][]) => {
    const rail = pts(poly);
    for (let i = 1; i < rail.length; i++) {
      const [x0, y0] = rail[i - 1], [x1, y1] = rail[i], len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
      for (let k = 0; k < len; k += 3) { const x = x0 + (x1 - x0) * (k / len), y = y0 + (y1 - y0) * (k / len); pline(c, x - nx * 3, y - ny * 3, x + nx * 3, y + ny * 3, '#4a3a28'); }
      for (const o of [-1.6, 1.6]) pline(c, x0 + nx * o, y0 + ny * o, x1 + nx * o, y1 + ny * o, '#8a8a80');
    }
  };
  thick(pts(RAIL), '#2a2620', 13); thick(pts(SIDING), '#2a2620', 6); // общая насыпь
  track(SIDING); track(offsetPoly(RAIL, -TRACK_GAP)); track(offsetPoly(RAIL, TRACK_GAP));
  // дороги
  for (const rd of ROADS) { const pr = pts(rd); thick(pr, '#26221a', 6); thick(pr, '#6a604a', 4); thick(pr, '#7e7458', 2, [2, 5]); }
  // атмосферные руины — без подписей и событий
  drawRuins(c, r);
  // значки мест
  for (const l of LOCS) {
    if (l.kind !== 'poi') { drawLocIcon(c, l, r); continue; }
    // примечательности — на отдельных холстах: показываются, когда найдены
    const ox = Math.round(l.x / 2) - 40, oy = Math.round(l.y / 2) - 40, ic = document.createElement('canvas'); ic.width = 80; ic.height = 64;
    const ictx = ic.getContext('2d')!; ictx.imageSmoothingEnabled = false; ictx.translate(-ox, -oy);
    drawLocIcon(ictx, l, r);
    POI_ICONS.set(l.id, { cv: ic, ox, oy });
  }
  // края региона тонут во мгле — растровое затемнение
  edgeFog(c, BW, BH);
  return cv;
}

/** Квантовать цвета с растром Байера: мягкие градиенты превращаются в пиксельную «зернистость». */
function quantize(c: CanvasRenderingContext2D, w: number, h: number, step: number) {
  const img = c.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4, b = (BAY[(y & 3) * 4 + (x & 3)] - 0.5) * step;
    for (let k = 0; k < 3; k++) d[p + k] = Math.max(0, Math.min(255, Math.round((d[p + k] + b) / step) * step));
  }
  c.putImageData(img, 0, 0);
}
function edgeFog(c: CanvasRenderingContext2D, w: number, h: number) {
  const img = c.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // мгла у краёв: по расстоянию до ближайшего края, углы темнее
    const ex = Math.max(0, 1 - Math.min(x, w - x) / 150), ey = Math.max(0, 1 - Math.min(y, h - y) / 110);
    let a = Math.min(0.9, Math.hypot(ex, ey) * 0.85);
    if (a <= 0) continue;
    a = Math.floor(a * 4 + BAY[(y & 3) * 4 + (x & 3)]) / 4; // ступени с растром
    const p = (y * w + x) * 4;
    d[p] = d[p] * (1 - a) + 8 * a; d[p + 1] = d[p + 1] * (1 - a) + 10 * a; d[p + 2] = d[p + 2] * (1 - a) + 7 * a;
  }
  c.putImageData(img, 0, 0);
}

/** Домик 11×11: стена, крыша рядами черепицы, окно, дверь. */
function hut(s: CanvasRenderingContext2D, x: number, y: number, roof = '#3a3e48', wall = '#6a5a44', lit = true) {
  prect(s, x + 1, y + 5, 9, 6, wall); prect(s, x + 9, y + 5, 1, 6, shade(wall, -0.3)); prect(s, x + 1, y + 5, 9, 1, shade(wall, -0.35));
  for (let k = 0; k < 5; k++) prect(s, x + k, y + 5 - k, 11 - k * 2, 1, k === 2 ? shade(roof, 0.28) : k === 0 ? shade(roof, -0.2) : roof);
  prect(s, x + 2, y + 7, 2, 2, lit ? '#e8b850' : '#1c1a16');
  prect(s, x + 6, y + 7, 2, 4, '#2a2018');
}

/** Разрушенный домик 11×11: стены с провалами, остатки крыши, пустые окна. */
function ruinHut(s: CanvasRenderingContext2D, x: number, y: number, wall = '#4e4636', roof = '#33353a') {
  prect(s, x + 1, y + 5, 9, 6, wall); prect(s, x + 9, y + 5, 1, 6, shade(wall, -0.3));
  for (let k = 0; k < 3; k++) prect(s, x + k, y + 5 - k, 5 - k, 1, roof);       // уцелела левая половина крыши
  ppx(s, x + 6, y + 5, wall); ppx(s, x + 8, y + 6, '#0c0c0a');                  // зубчатый верх стены
  prect(s, x + 2, y + 7, 2, 2, '#0c0c0a'); prect(s, x + 6, y + 7, 2, 4, '#0c0c0a'); // пустые проёмы
  ppx(s, x + 10, y + 10, shade(wall, -0.2)); ppx(s, x + 11, y + 10, shade(wall, -0.35)); // обломки
}

const RUINS: { kind: string; x: number; y: number }[] = [
  { kind: 'farm', x: 620, y: 650 },
  { kind: 'chapel', x: 1490, y: 455 },
  { kind: 'factory', x: 300, y: 1010 },
  { kind: 'hamlet', x: 1250, y: 1120 },
  { kind: 'tower', x: 1610, y: 650 },
  { kind: 'railcar', x: 760, y: 895 },
  { kind: 'wall', x: 980, y: 210 },
  { kind: 'farm', x: 130, y: 460 },
  { kind: 'wall', x: 860, y: 1110 },
  { kind: 'tower', x: 160, y: 820 },
];

function drawRuins(c: CanvasRenderingContext2D, r: () => number) {
  const stone = '#5e5a50', stoneD = '#3e3b34', brick = '#5a3e30', brickD = '#3a2820', dark = '#0c0c0a';
  for (const ru of RUINS) {
    const x = Math.round(ru.x / 2), y = Math.round(ru.y / 2);
    switch (ru.kind) {
      case 'farm': // заброшенная усадьба: дом, сарай без крыши, повалившийся забор
        stamp(c, x, y + 8, 34, 16, (s) => {
          ruinHut(s, 1, 3, '#55503f');
          prect(s, 15, 8, 9, 6, '#4a4234'); prect(s, 16, 9, 7, 5, dark); prect(s, 15, 7, 3, 1, '#4a4234'); prect(s, 21, 6, 3, 2, '#4a4234'); // сарай
          for (let k = 0; k < 8; k++) if (k !== 3 && k !== 6) prect(s, 25 + k, 11 + (k % 3 === 0 ? 1 : 0), 1, 3 - (k % 2), '#4e4030'); // забор
        });
        break;
      case 'chapel': // заброшенная часовня с обвалившимся шпилем
        stamp(c, x, y + 10, 22, 28, (s) => {
          prect(s, 3, 14, 15, 13, stone); prect(s, 16, 14, 2, 13, stoneD);
          for (let k = 0; k < 6; k++) prect(s, 3 + k, 14 - k, 15 - k * 2, 1, k === 2 ? shade(stone, 0.2) : stoneD); // фронтон
          prect(s, 9, 2, 4, 7, stone); prect(s, 10, 0, 2, 2, stone); prect(s, 12, 3, 1, 6, stoneD); // обломок башенки
          prect(s, 7, 4, 1, 1, stoneD); ppx(s, 6, 6, stoneD);
          prect(s, 9, 18, 3, 5, dark); ppx(s, 10, 17, dark);                               // стрельчатое окно
          prect(s, 5, 23, 3, 4, dark); prect(s, 14, 21, 2, 2, dark);                        // пролом
          prect(s, 18, 25, 3, 2, stoneD); ppx(s, 1, 26, stoneD); ppx(s, 2, 25, stone);      // осыпь
        });
        break;
      case 'factory': // мёртвый завод: пилообразная крыша с провалами, обломанная труба
        stamp(c, x, y + 8, 44, 34, (s) => {
          prect(s, 2, 18, 34, 14, brick); prect(s, 2, 18, 34, 1, brickD);
          for (let k = 0; k < 5; k++) { if (k === 2) continue; for (let t = 0; t < 5; t++) prect(s, 2 + k * 7 + t, 17 - t, 7 - t, 1, '#3a3a3e'); }
          for (let k = 0; k < 6; k++) prect(s, 5 + k * 5, 23, 3, 4, k === 3 ? '#2a2018' : dark);  // окна, одно заколочено
          prect(s, 16, 18, 6, 3, dark);                                                       // провал крыши
          prect(s, 37, 4, 5, 28, brick); prect(s, 41, 4, 1, 28, brickD); prect(s, 37, 4, 2, 1, brickD); ppx(s, 40, 3, brick); // труба
          for (let k = 0; k < 4; k++) prect(s, 37, 8 + k * 6, 5, 1, brickD);
          prect(s, 0, 31, 44, 1, brickD); ppx(s, 36, 30, brick);
        });
        break;
      case 'hamlet': // брошенный хутор
        stamp(c, x, y + 10, 40, 22, (s) => {
          ruinHut(s, 1, 2, '#544c3c'); ruinHut(s, 15, 9, '#4e4636'); ruinHut(s, 27, 3, '#585040');
          prect(s, 12, 18, 2, 2, stoneD); ppx(s, 26, 20, stoneD); prect(s, 3, 19, 3, 1, '#4e4030');
        });
        break;
      case 'tower': // разрушенная сторожевая башня
        stamp(c, x, y + 6, 14, 30, (s) => {
          prect(s, 3, 6, 8, 23, stone); prect(s, 9, 6, 2, 23, stoneD);
          prect(s, 3, 4, 2, 2, stone); prect(s, 7, 3, 2, 3, stone); prect(s, 10, 5, 1, 1, stoneD); // зубчатый обломанный верх
          prect(s, 5, 10, 2, 3, dark); prect(s, 6, 18, 2, 3, dark); prect(s, 4, 25, 3, 4, dark);
          for (let k = 0; k < 4; k++) prect(s, 3, 9 + k * 6, 8, 1, stoneD);
          prect(s, 11, 26, 3, 3, stoneD); ppx(s, 1, 28, stone);
        });
        break;
      case 'railcar': // опрокинутый вагон у насыпи
        stamp(c, x, y + 5, 28, 14, (s) => {
          prect(s, 2, 2, 22, 8, '#4a3a2c'); prect(s, 2, 2, 22, 1, '#5e4a36'); prect(s, 2, 9, 22, 1, '#2e241c');
          for (let k = 0; k < 4; k++) prect(s, 5 + k * 5, 4, 3, 3, dark);
          for (const wx of [5, 19]) { prect(s, wx, 10, 4, 3, '#1c1c1a'); ppx(s, wx + 1, 11, '#5a5a54'); } // колёса кверху
          prect(s, 24, 5, 3, 1, '#3a3028'); ppx(s, 0, 11, '#3a3028');
        });
        break;
      case 'wall': // остатки каменной стены
        stamp(c, x, y + 4, 34, 12, (s) => {
          const hs = [6, 8, 7, 4, 0, 0, 3, 6, 9, 8, 5, 2, 0, 4, 7, 6, 3];
          hs.forEach((h, k) => { if (h) { prect(s, k * 2, 11 - h, 2, h, k % 3 ? stone : stoneD); ppx(s, k * 2, 11 - h, shade(stone, 0.2)); } });
          prect(s, 9, 9, 3, 2, stoneD); prect(s, 25, 10, 2, 1, stoneD);
        });
        break;
    }
  }
}

type Thick = (poly: number[][], col: string, w: number, dash?: [number, number]) => void;

/** Ржавая бронемашина: клёпаный короб на колёсах со спицами, маленькая башенка с пулемётом. */
function armoredCar(s: CanvasRenderingContext2D, x: number, y: number, flip = false) {
  const X = (v: number) => (flip ? x + 22 - v : x + v);
  const R = (a: number, b: number, w: number, h: number, col: string) => prect(s, flip ? x + 22 - a - w + 1 : x + a, y + b, w, h, col);
  R(1, 4, 20, 6, '#5a3e28'); R(1, 4, 20, 1, '#7a5638');                    // корпус
  R(17, 5, 4, 3, '#4e3622'); R(21, 6, 1, 2, '#3a2a1a');                    // скошенный нос, решётка
  R(7, 1, 7, 3, '#4e3622'); R(7, 1, 7, 1, '#6e4e32'); R(14, 2, 4, 1, '#2e2418'); // башенка, ствол пулемёта
  for (const k of [3, 7, 11, 15, 19]) ppx(s, X(k), y + 6, '#8a6a44');        // заклёпки
  R(4, 7, 3, 1, '#0c0c0a'); R(12, 7, 3, 1, '#0c0c0a');                     // смотровые щели
  for (const k of [2, 9, 16]) ppx(s, X(k), y + 5, '#9a5a2a');               // рыжая ржавчина
  for (const wx of [5, 17]) { pellipse(s, X(wx), y + 11, 2, 2, '#141210'); ppx(s, X(wx), y + 11, '#6a5a40'); }
}

/** Старый фронт к западу от Эшфорда: линии траншей, проволока, воронки, остовы техники, могилы. */
/** Озеро и реки баронессы: тёмная вода с бликами, берег, камыш. */
function drawWater(c: CanvasRenderingContext2D, r: () => number, thick: Thick) {
  const pts = (a: number[][]) => a.map(([x, y]) => [x / 2, y / 2]);
  for (const rv of RIVERS) { const pr = pts(rv); thick(pr, '#3a3a30', 9); thick(pr, '#1e2a26', 7); thick(pr, '#26363a', 4); thick(pr, '#4a6a68', 1, [2, 7]); }
  const lx = LAKE.x / 2, ly = LAKE.y / 2, rx = LAKE.rx / 2, ry = LAKE.ry / 2;
  // неровный берег: эллипс с «рябью» радиуса
  for (let y = Math.floor(ly - ry - 4); y <= ly + ry + 4; y++) for (let x = Math.floor(lx - rx - 4); x <= lx + rx + 4; x++) {
    const a = Math.atan2((y - ly) / ry, (x - lx) / rx), wob = 1 + Math.sin(a * 5) * 0.06 + Math.sin(a * 11 + 1) * 0.03;
    const d = Math.hypot((x - lx) / rx, (y - ly) / ry) / wob;
    if (d < 1) ppx(c, x, y, d > 0.93 ? '#2a3630' : (x * 7 + y * 13) % 29 === 0 ? '#4a6a68' : d < 0.6 ? '#1a2628' : '#1e2c2c');
    else if (d < 1.07) ppx(c, x, y, '#3a3a30');
  }
  for (let i = 0; i < 90; i++) { // камыш по берегу
    const a = r() * TAU, d = 0.97 + r() * 0.08, x = Math.round(lx + Math.cos(a) * rx * d), y = Math.round(ly + Math.sin(a) * ry * d);
    prect(c, x, y - 2, 1, 2 + Math.round(r()), r() < 0.5 ? '#4a5e32' : '#5e7038');
  }
}

/** Густой лес севера: ели и тёмные лиственные кроны рядами, просеки под дороги, поляны под деревни. */
function drawForest(c: CanvasRenderingContext2D) {
  const r = seeded(5150);
  const fir = (x: number, y: number, h: number) => {
    prect(c, x - 2, y + 1, 5, 1, 'rgba(0,0,0,0.35)');
    prect(c, x, y - 1, 1, 2, '#2a2016');
    for (let k = 0; k < h; k++) {
      const w = Math.min(3, Math.floor((k + 1) / 2)), yy = y - 1 - h + k;
      prect(c, x - w, yy, w * 2 + 1, 1, k % 2 ? '#2a4228' : '#33502e');
      ppx(c, x - w, yy, '#4c6e3c'); if (w > 0) ppx(c, x + w, yy, '#1c2c1a');
    }
    ppx(c, x, y - 1 - h, '#4c6e3c');
  };
  const leafy = (x: number, y: number) => {
    prect(c, x - 2, y + 1, 5, 1, 'rgba(0,0,0,0.35)');
    prect(c, x, y - 2, 1, 3, '#2a2016');
    pellipse(c, x, y - 4, 3, 2, '#34462a'); ppx(c, x - 1, y - 5, '#566e3e'); ppx(c, x - 2, y - 4, '#4a603a'); ppx(c, x + 1, y - 3, '#202c18'); ppx(c, x + 2, y - 4, '#202c18');
  };
  const dead = (x: number, y: number) => { prect(c, x, y - 5, 1, 6, '#1c1a15'); ppx(c, x - 1, y - 4, '#1c1a15'); ppx(c, x + 1, y - 3, '#1c1a15'); };
  const near = (q: Pt) => {
    if (nearRoad(q, 30)) return true;
    for (const l of LOCS) if (q.y < 60 && dist(l, q) < (l.kind === 'fort' ? 150 : l.kind === 'village' ? 95 : 40)) return true;
    return RIVERS[0].some((pt, i) => i > 0 && segDist(q, RIVERS[0][i - 1], pt) < 22);
  };
  for (let y = WY0 / 2 + 6; y < NORTH_Y / 2 + 14; y += 5) {
    // к южной опушке лес редеет
    const edge = y > NORTH_Y / 2 - 30 ? (NORTH_Y / 2 + 14 - y) / 44 : 1;
    for (let x = WX0 / 2 + (y % 10 ? 0 : 3); x < WW / 2; x += 5) {
      const tx = Math.round(x + (r() - 0.5) * 3), ty = Math.round(y + (r() - 0.5) * 3);
      const q = { x: tx * 2, y: ty * 2 };
      // поляны — по плавному шуму
      const glade = Math.sin(q.x * 0.011 + 1.3) * Math.sin(q.y * 0.013 + 0.4) + Math.sin(q.x * 0.004 - q.y * 0.006) * 0.6;
      if (r() > edge * (glade > 0.75 ? 0.25 : 0.9)) continue;
      if (near(q)) continue;
      const k = r();
      if (k < 0.66) fir(tx, ty, 5 + Math.floor(r() * 4));
      else if (k < 0.97) leafy(tx, ty);
      else dead(tx, ty);
    }
  }
}

function drawWarZone(c: CanvasRenderingContext2D, r: () => number, thick: Thick) {
  const X0 = FRONT_W0 / 2 + 10, X1 = FRONT_X / 2, Y0 = 30, Y1 = BH - 30;
  // густые воронки, часть залита мутной водой
  for (let i = 0; i < 200; i++) {
    const x = Math.round(X0 + r() * (X1 - X0)), y = Math.round(Y0 + r() * (Y1 - Y0)), sz = 2 + Math.round(r() * 5);
    pellipse(c, x, y + 1, sz + 1, Math.ceil(sz * 0.6) + 1, '#5a5444'); pellipse(c, x, y, sz, Math.ceil(sz * 0.6), '#221e17');
    if (r() < 0.3) pellipse(c, x, y + 1, Math.max(1, sz - 2), Math.max(1, Math.ceil(sz * 0.3)), '#2e3a26');
  }
  // линии траншей — зигзаг огневых ячеек, бруствер, дощатый настил
  const lines = [-380, -260, -130];
  const paths: number[][][] = [];
  for (const bx of lines) {
    const pts: number[][] = [];
    // линия петляет по местности; огневые ячейки — изломы разной глубины
    let y = Y0 + 10 + r() * 20, side = 0;
    const ph = r() * 6;
    while (y < Y1 - 10) {
      const base = bx + Math.sin(y / 47 + ph) * 18 + Math.sin(y / 13 + ph * 2) * 4;
      const x = Math.round(base + side * (4 + r() * 5));
      pts.push([x, y]); y += 7 + Math.round(r() * 8); pts.push([x, y]); side = 1 - side;
      if (r() < 0.15) y += 6; // обвалившийся участок — разрыв не рисуем, просто длиннее перегон
    }
    paths.push(pts);
    thick(pts, '#6a5c44', 7); thick(pts, '#16130e', 5); thick(pts, '#2a241a', 3); thick(pts, '#4a3a26', 1, [1, 2]);
  }
  // ходы сообщения между линиями
  for (let k = 0; k < 7; k++) {
    const a = k % 2, y = Y0 + 40 + r() * (Y1 - Y0 - 80), x0 = lines[a] + 4, x1 = lines[a + 1];
    const pts = [[x0, y], [x0 + (x1 - x0) * 0.33, y + (r() - 0.5) * 14], [x0 + (x1 - x0) * 0.66, y + (r() - 0.5) * 14], [x1, y + (r() - 0.5) * 10]];
    thick(pts, '#5e5240', 5); thick(pts, '#16130e', 3);
  }
  // колючая проволока перед каждой линией
  for (const bx of lines) {
    const wx = bx - 20;
    for (let y = Y0; y < Y1; y++) {
      if (Math.floor(y / 26) % 5 === 3) continue; // проходы
      const x = Math.round(wx + Math.sin(y * 0.9) * 1.5);
      if (r() < 0.85) ppx(c, x, y, y % 2 ? '#8a8a80' : '#6e6e66');
      if (y % 9 === 0) prect(c, wx - 1, y - 2, 1, 4, '#3a2c1e');
    }
  }
  // расщеплённые стволы
  for (let i = 0; i < 70; i++) {
    const x = Math.round(X0 + r() * (X1 - X0)), y = Math.round(Y0 + r() * (Y1 - Y0)), h = 2 + Math.round(r() * 3);
    prect(c, x, y - h, 1, h, '#1c1a15'); ppx(c, x + (r() < 0.5 ? 1 : -1), y - h, '#2c2820');
  }
  // ряды касок на воткнутых винтовках — могилы безымянных
  for (const [gx, gy, n] of [[-330, 180, 8], [-200, 520, 6], [-410, 470, 7]]) for (let k = 0; k < n; k++) {
    const x = gx + (k % 4) * 5, y = gy + Math.floor(k / 4) * 8;
    prect(c, x, y - 5, 1, 6, '#3a2c1e'); prect(c, x - 1, y - 7, 3, 2, '#4a4e3a'); ppx(c, x - 1, y - 7, '#62664e');
  }
  // несколько ржавых бронемашин — техника здесь роскошь, и бароны бросили немногое
  stamp(c, -255, 360, 24, 14, (s) => armoredCar(s, 1, 0));
  stamp(c, -390, 250, 24, 14, (s) => armoredCar(s, 1, 0, true));
}

function drawLocIcon(c: CanvasRenderingContext2D, l: Loc, r: () => number) {
  const x = Math.round(l.x / 2), y = Math.round(l.y / 2);
  switch (l.id) {
    case 'ashford':
      stamp(c, x, y + 12, 58, 34, (s) => {
        prect(s, 46, 8, 11, 15, '#4a4a44'); prect(s, 46, 8, 2, 15, '#6a6a62'); prect(s, 46, 7, 11, 2, '#5a5a52'); prect(s, 46, 15, 11, 1, '#2e2e2a'); // резервуар
        hut(s, 2, 11, '#3a3e48', '#6a5a44', true); hut(s, 15, 4, '#3a3e48', '#6a5a44', true); hut(s, 29, 9, '#383a40', '#5a4c3a', false);
        hut(s, 8, 22, '#383a40', '#5a4c3a', false); hut(s, 22, 20, '#3a3e48', '#6a5a44', true); hut(s, 36, 22, '#383a40', '#5a4c3a', false);
        prect(s, 25, 21, 3, 1, '#0c0c0a'); prect(s, 39, 23, 2, 2, '#0c0c0a'); // провалы в крышах
      });
      break;
    case 'richmord':
      stamp(c, x, y + 26, 58, 48, (s) => {
        const pen = (px: number, py: number) => {
          prect(s, px, py, 22, 11, '#3a3428'); prect(s, px + 1, py + 1, 20, 9, '#4e4636');
          for (let k = 0; k < 22; k += 3) { prect(s, px + k, py - 2, 1, 2, '#5a4a32'); ppx(s, px + k, py + 11, '#5a4a32'); }
          prect(s, px + 4, py + 3, 5, 3, '#7a4a26'); prect(s, px + 4, py + 3, 2, 1, '#a06a3a'); prect(s, px + 13, py + 5, 4, 3, '#7a4a26'); ppx(s, px + 13, py + 5, '#a06a3a');
        };
        pen(1, 3); pen(32, 4);
        hut(s, 4, 22, '#4e3e30', '#6a5a44', false); hut(s, 18, 20, '#4e3e30', '#7a6650', true); hut(s, 32, 23, '#3a3e48', '#6a5a44', true); hut(s, 44, 20, '#4e3e30', '#6a5a44', true);
        // нижняя улица — половина домов брошена
        hut(s, 2, 34, '#3a3e48', '#5a4c3a', false); hut(s, 13, 35, '#4e3e30', '#6a5a44', true); ruinHut(s, 24, 34); hut(s, 35, 35, '#3a3e48', '#6a5a44', true); hut(s, 46, 34, '#4e3e30', '#5a4c3a', false);
      });
      break;
    case 'fenmor':
      stamp(c, x, y + 14, 56, 36, (s) => {
        for (let i = 0; i < 12; i++) {
          const mx = 2 + (i % 4) * 7 + Math.round(r() * 2), my = 3 + Math.floor(i / 4) * 7;
          prect(s, mx + 1, my + 2, 1, 3, '#c8c0a0'); prect(s, mx, my + 1, 3, 1, '#9ad078'); ppx(s, mx + 1, my, '#c0f0a0');
        }
        hut(s, 32, 4, '#2e3a24', '#5a4c3a', true); hut(s, 44, 12, '#2e3a24', '#5a4c3a', false); hut(s, 30, 22, '#34402a', '#5a4c3a', true);
        pellipse(s, 12, 29, 9, 4, '#2a2c20'); prect(s, 9, 29, 5, 3, '#0c0c0a'); // погреб
      });
      break;
    case 'fort': { // город в три яруса: трущобы и заводы → рынки и мастерские → Верхний город
      const R = 50;
      stamp(c, x, y + 38, 120, 104, (s) => {
        const ox = 60, oy = 60;
        const walls = pixelize(120, 104, (v) => {
          // ярус 1 — внешняя стена и грязь трущоб
          v.fillStyle = '#3e3a32'; v.beginPath();
          for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, rr = i % 2 ? R : R * 0.86; v.lineTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr * 0.62); }
          v.closePath(); v.fill();
          v.fillStyle = '#2a2620'; v.beginPath(); v.ellipse(ox, oy, R * 0.8, R * 0.48, 0, 0, TAU); v.fill();
          // ярус 2 — стена повыше
          v.fillStyle = '#4e4840'; v.beginPath(); v.ellipse(ox, oy - 10, R * 0.56, R * 0.34, 0, 0, TAU); v.fill();
          v.fillStyle = '#3a342c'; v.beginPath(); v.ellipse(ox, oy - 11, R * 0.5, R * 0.29, 0, 0, TAU); v.fill();
          // ярус 3 — холм цитадели
          v.fillStyle = '#5e5a50'; v.beginPath(); v.ellipse(ox, oy - 20, R * 0.28, R * 0.18, 0, 0, TAU); v.fill();
          for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; v.fillStyle = '#56504a'; v.beginPath(); v.arc(ox + Math.cos(a) * R * 0.93, oy + Math.sin(a) * R * 0.58, 4, 0, TAU); v.fill(); }
        });
        s.drawImage(walls, 0, 0);
        // ярус 1: тесные лачуги из ржавого железа и закопчённые заводы с трубами
        const rust = ['#5a4a3a', '#4a4a44', '#6a4a30', '#3e3a32'];
        for (let i = 0; i < 90; i++) {
          const a = r() * TAU, d = 0.62 + r() * 0.16, hx = Math.round(ox + Math.cos(a) * R * d * 0.95), hy = Math.round(oy + Math.sin(a) * R * d * 0.58);
          if (hy < oy - 14) continue;
          prect(s, hx, hy, 3, 2, rust[Math.floor(r() * rust.length)]); ppx(s, hx, hy, '#7a6a5a');
          if (r() < 0.08) ppx(s, hx + 1, hy + 1, '#e0a050');
        }
        for (const [fx, fy] of [[22, 66], [84, 68], [34, 76]]) {
          prect(s, fx, fy, 12, 6, '#5a3226'); prect(s, fx, fy, 12, 1, '#3a2018'); prect(s, fx + 2, fy + 2, 2, 2, '#e07028'); prect(s, fx + 7, fy + 2, 2, 2, '#e07028');
          prect(s, fx + 9, fy - 12, 2, 12, '#4a2a1e'); prect(s, fx + 9, fy - 13, 2, 1, '#1a1410');
        }
        // ярус 2: рынки и мастерские — дома впритык
        for (let i = 0; i < 16; i++) {
          const a = r() * TAU, d = r() * 0.36, hx = Math.round(ox + Math.cos(a) * R * d) - 5, hy = Math.round(oy - 11 + Math.sin(a) * R * d * 0.55) - 5;
          if (hy < oy - 26) continue;
          hut(s, hx, hy, r() < 0.5 ? '#3a3632' : '#4a3a2e', '#5a4c3a', r() < 0.35);
        }
        // ярус 3: Верхний город — цитадель с башнями
        prect(s, ox - 9, oy - 38, 18, 16, '#6e6a60'); prect(s, ox - 9, oy - 38, 18, 1, '#8a867a'); prect(s, ox + 7, oy - 38, 2, 16, '#55524a');
        for (const tx of [-12, 10]) { prect(s, ox + tx, oy - 44, 4, 22, '#6a665c'); for (let k = 0; k < 4; k += 2) ppx(s, ox + tx + k, oy - 45, '#6a665c'); }
        prect(s, ox - 2, oy - 50, 4, 12, '#76726a'); ppx(s, ox - 2, oy - 51, '#76726a'); ppx(s, ox + 1, oy - 51, '#76726a');
        for (const [wx, wy] of [[-6, -34], [-1, -34], [4, -34], [-6, -29], [4, -29], [0, -46]]) prect(s, ox + wx, oy + wy, 2, 2, '#f0d080');
      });
      break;
    }
    case 'brimmor': // рыбацкая деревня: хижины на берегу, мостки, лодки, сети
      stamp(c, x, y + 10, 52, 30, (s) => {
        hut(s, 2, 12, '#3a3e48', '#6a5a44', true); hut(s, 14, 8, '#4a4038', '#5a4c3a', false); hut(s, 27, 13, '#3a3e48', '#6a5a44', true);
        prect(s, 38, 2, 12, 2, '#6a5236'); for (let k = 0; k < 12; k += 3) ppx(s, 38 + k, 4, '#3a2c1e');   // мостки
        prect(s, 40, 6, 8, 3, '#4a3424'); prect(s, 41, 6, 6, 1, '#6a4a30');                                  // лодка
        for (let k = 0; k < 6; k++) ppx(s, 4 + k * 2, 24 + (k % 2), '#8a8a7a');                              // сеть
      });
      break;
    case 'hailstone': // старатели: отвалы, копёр над шахтой, лачуги
      stamp(c, x, y + 12, 54, 34, (s) => {
        pellipse(s, 10, 26, 9, 5, '#4a4438'); pellipse(s, 9, 24, 6, 3, '#5a5244'); pellipse(s, 42, 27, 10, 5, '#3a3830'); for (let k = 0; k < 10; k++) ppx(s, 34 + k * 2, 25 + (k % 3), '#7a5a3a');
        for (let k = 0; k < 14; k++) { const w = Math.round(4 - k * 0.25); ppx(s, 27 - w, 18 - k, '#3a3428'); ppx(s, 27 + w, 18 - k, '#3a3428'); } prect(s, 24, 4, 7, 2, '#3a3428'); pellipse(s, 27, 4, 2, 2, '#5a5a52');
        hut(s, 12, 8, '#4a4a44', '#5a4c3a', true); hut(s, 34, 8, '#4a4a44', '#5a4c3a', false);
      });
      break;
    case 'mossley': // грибники и пастухи: грибные грядки, загон с жуками, хижины
      stamp(c, x, y + 12, 54, 32, (s) => {
        for (let i = 0; i < 8; i++) { const mx = 2 + (i % 4) * 6, my = 4 + Math.floor(i / 4) * 6; prect(s, mx + 1, my + 2, 1, 2, '#c8c0a0'); prect(s, mx, my + 1, 3, 1, '#9ad078'); }
        prect(s, 28, 2, 22, 11, '#3a3428'); prect(s, 29, 3, 20, 9, '#4e4636'); prect(s, 33, 5, 5, 3, '#7a4a26'); prect(s, 42, 7, 4, 2, '#7a4a26');
        hut(s, 4, 18, '#2e3a24', '#5a4c3a', true); hut(s, 18, 20, '#2e3a24', '#5a4c3a', false); hut(s, 36, 18, '#4e3e30', '#6a5a44', true);
      });
      break;
    case 'bcamp': // особый лагерь: цеха за проволокой, вышки, трубы
      stamp(c, x, y + 14, 60, 38, (s) => {
        for (let k = 0; k < 60; k += 2) { ppx(s, k, 36, '#8a8a80'); ppx(s, k, 6, '#8a8a80'); }
        for (let k = 6; k < 36; k += 2) { ppx(s, 0, k, '#8a8a80'); ppx(s, 59, k, '#8a8a80'); }
        prect(s, 6, 18, 20, 12, '#5a3226'); prect(s, 30, 20, 22, 10, '#5a3226'); for (const fx of [9, 14, 34, 40, 46]) prect(s, fx, 22, 2, 3, '#e07028');
        prect(s, 20, 4, 3, 14, '#4a2a1e'); prect(s, 44, 6, 3, 14, '#4a2a1e');
        for (const tx of [2, 54]) { prect(s, tx, 0, 4, 8, '#3a3428'); prect(s, tx - 1, 0, 6, 2, '#4a4038'); ppx(s, tx + 1, 2, '#f0d080'); }
      });
      break;
    case 'bfort': { // форт баронессы: один большой ярус в кольце стен и замок на скале
      stamp(c, x, y + 40, 112, 92, (s) => {
        const ox = 56, oy = 56, R = 46;
        const walls = pixelize(112, 92, (v) => {
          v.fillStyle = '#4a463e'; v.beginPath(); v.ellipse(ox, oy, R, R * 0.6, 0, 0, TAU); v.fill();
          v.fillStyle = '#2e2c26'; v.beginPath(); v.ellipse(ox, oy, R * 0.84, R * 0.48, 0, 0, TAU); v.fill();
          for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; v.fillStyle = '#56524a'; v.fillRect(ox + Math.cos(a) * R - 3, oy + Math.sin(a) * R * 0.6 - 4, 6, 7); }
        });
        s.drawImage(walls, 0, 0);
        // ровные ряды казарм и домов — порядок и строй
        for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) {
          const hx = 18 + k * 13 + (row % 2) * 4, hy = 52 + row * 9 - (k === 2 || k === 3 ? 6 : 0);
          if (Math.hypot((hx - ox) / (R * 0.8), (hy - oy) / (R * 0.45)) > 1) continue;
          prect(s, hx, hy, 10, 5, '#5a5248'); prect(s, hx, hy, 10, 1, '#7a2a24'); if ((row + k) % 3 === 0) ppx(s, hx + 3, hy + 2, '#f0c060');
        }
        // замок баронессы
        prect(s, ox - 12, oy - 46, 24, 26, '#6e6a62'); prect(s, ox - 12, oy - 46, 24, 1, '#8a867a'); prect(s, ox + 10, oy - 46, 2, 26, '#55524a');
        for (let k = 0; k < 24; k += 4) prect(s, ox - 12 + k, oy - 49, 2, 3, '#6e6a62');
        for (const tx of [-16, 12]) { prect(s, tx + ox, oy - 52, 5, 32, '#66625a'); prect(s, tx + ox - 1, oy - 56, 7, 4, '#7a2a24'); }
        prect(s, ox - 1, oy - 62, 2, 14, '#3a3428'); prect(s, ox + 1, oy - 62, 6, 4, '#a03028');                // флаг
        for (const [wx, wy] of [[-7, -40], [-2, -40], [3, -40], [-7, -32], [3, -32]]) prect(s, ox + wx, oy + wy, 2, 3, '#f0d080');
      });
      break;
    }

    // ---------------- север
    case 'svoboda': { // форт Свобода: кольцо стен, красные флаги над башнями, виселицы вдоль въезда
      stamp(c, x, y + 40, 112, 90, (s) => {
        const ox = 56, oy = 54, R = 46;
        const walls = pixelize(112, 90, (v) => {
          v.fillStyle = '#46423a'; v.beginPath(); v.ellipse(ox, oy, R, R * 0.6, 0, 0, TAU); v.fill();
          v.fillStyle = '#2c2a24'; v.beginPath(); v.ellipse(ox, oy, R * 0.84, R * 0.48, 0, 0, TAU); v.fill();
          for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; v.fillStyle = '#524e46'; v.fillRect(ox + Math.cos(a) * R - 3, oy + Math.sin(a) * R * 0.6 - 4, 6, 7); }
        });
        s.drawImage(walls, 0, 0);
        for (let i = 0; i < 70; i++) { // тесные дома, редкие огни
          const a = r() * TAU, d = 0.25 + r() * 0.55, hx = Math.round(ox + Math.cos(a) * R * d), hy = Math.round(oy + Math.sin(a) * R * d * 0.55);
          prect(s, hx, hy, 4, 3, ['#6e665a', '#62605a', '#5a5248'][Math.floor(r() * 3)]); prect(s, hx, hy, 4, 1, '#3a3836');
          if (r() < 0.07) ppx(s, hx + 1, hy + 1, '#e0a050');
        }
        // бывший замок барона — теперь Дом Собрания
        prect(s, ox - 10, oy - 30, 20, 16, '#5e5a52'); for (let k = 0; k < 20; k += 4) prect(s, ox - 10 + k, oy - 33, 2, 3, '#5e5a52');
        prect(s, ox - 1, oy - 46, 2, 14, '#3a3428'); prect(s, ox + 1, oy - 46, 8, 5, '#b02a22');
        for (let i = 0; i < 8; i += 2) { const a = (i / 8) * TAU; const fx = Math.round(ox + Math.cos(a) * R), fy = Math.round(oy + Math.sin(a) * R * 0.6); prect(s, fx, fy - 12, 1, 8, '#3a3428'); prect(s, fx + 1, fy - 12, 4, 3, '#b02a22'); }
        // площадь с помостом и въезд — ряд виселиц
        prect(s, ox - 3, oy - 4, 7, 3, '#4a3a26'); prect(s, ox - 2, oy - 11, 1, 7, '#2a1e14'); prect(s, ox + 2, oy - 11, 1, 7, '#2a1e14'); prect(s, ox - 2, oy - 11, 5, 1, '#2a1e14'); prect(s, ox, oy - 10, 1, 4, '#1a1814');
        for (let k = 0; k < 4; k++) for (const side of [-6, 5]) { const gx = ox + side, gy = oy + 14 + k * 6; prect(s, gx, gy - 6, 1, 6, '#2a1e14'); prect(s, gx, gy - 6, side < 0 ? 3 : -2, 1, '#2a1e14'); prect(s, side < 0 ? gx + 2 : gx - 2, gy - 5, 1, 3, '#1a1814'); }
        prect(s, ox - 4, oy + R * 0.6 - 4, 9, 4, '#141210');
      });
      break;
    }
    case 'einbow': // сожжённая деревня: чёрные остовы, пепел, тонкий дым
      stamp(c, x, y + 12, 54, 32, (s) => {
        pellipse(s, 27, 18, 24, 11, '#55504a');
        for (let i = 0; i < 60; i++) ppx(s, 6 + r() * 42, 10 + r() * 16, ['#6a645c', '#2a2724', '#7a6e60'][Math.floor(r() * 3)]);
        for (const [hx, hy] of [[4, 6], [20, 3], [36, 7], [10, 17], [28, 18], [42, 17]]) {
          prect(s, hx + 1, hy + 7, 9, 4, '#141210'); prect(s, hx + 1, hy + 4, 1, 7, '#1e1c1a'); prect(s, hx + 9, hy + 5, 1, 6, '#1e1c1a'); prect(s, hx + 4, hy + 3, 1, 4, '#1e1c1a');
          prect(s, hx + 7, hy + 1, 2, 6, '#4a3428'); ppx(s, hx + 3, hy + 9, '#e06a2a'); ppx(s, hx + 6, hy + 10, '#a04a22');
        }
        ppx(s, 31, 21, '#c8602a'); ppx(s, 14, 20, '#a04a22');
      });
      break;
    case 'hawley': // жуководы: загоны, сараи, дома — и один сгоревший
      stamp(c, x, y + 20, 58, 40, (s) => {
        const pen = (px: number, py: number) => {
          prect(s, px, py, 22, 10, '#3a3428'); prect(s, px + 1, py + 1, 20, 8, '#4e4636');
          for (let k = 0; k < 22; k += 3) { prect(s, px + k, py - 2, 1, 2, '#5a4a32'); ppx(s, px + k, py + 10, '#5a4a32'); }
          prect(s, px + 4, py + 3, 5, 3, '#7a4a26'); prect(s, px + 4, py + 3, 2, 1, '#a06a3a'); prect(s, px + 13, py + 4, 4, 3, '#7a4a26');
        };
        pen(1, 3); pen(33, 4);
        hut(s, 4, 22, '#4e3e30', '#6a5a44', true); hut(s, 18, 24, '#3a3e48', '#6a5a44', true); hut(s, 44, 22, '#4e3e30', '#7a6650', false);
        prect(s, 32, 29, 9, 6, '#1e1c1a'); ppx(s, 33, 27, '#14120f'); ppx(s, 36, 26, '#14120f'); ppx(s, 39, 28, '#14120f'); ppx(s, 35, 31, '#6a3a1e'); // сгоревший дом
        prect(s, 26, 14, 1, 8, '#3a3428'); prect(s, 27, 14, 4, 3, '#b02a22');
      });
      break;
    case 'woodham': // лесорубы: дома на поляне, штабеля брёвен, пилорама
      stamp(c, x, y + 14, 56, 34, (s) => {
        pellipse(s, 28, 20, 26, 12, '#3e3c30');
        for (let i = 0; i < 3; i++) for (let k = 0; k < 6; k++) { pellipse(s, 30 + k * 3, 24 + i * 2, 1, 1, '#7a5a38'); ppx(s, 30 + k * 3, 24 + i * 2, '#a07a4a'); }
        prect(s, 8, 20, 16, 7, '#4a3a28'); prect(s, 8, 19, 16, 1, '#2e2418'); prect(s, 10, 22, 4, 3, '#1a140e'); prect(s, 18, 22, 2, 2, '#e0a050');
        hut(s, 4, 4, '#3a3428', '#5a4630', true); hut(s, 20, 2, '#3a3428', '#5a4630', false); hut(s, 38, 6, '#3a3428', '#5a4630', true);
        for (let i = 0; i < 5; i++) { prect(s, 46 + (i % 2) * 3, 18 + i * 3, 1, 1, '#2a2016'); }
      });
      break;
    case 'tarwell': { // нефтяники: вышки, резервуар, бараки; над ними — флаг Собрания
      const der = (s: CanvasRenderingContext2D, dx: number, dy: number) => { for (let k = 0; k < 10; k++) { const w = Math.round(3 - k * 0.3); ppx(s, dx + 3 - w, dy + 10 - k, '#1e1c17'); ppx(s, dx + 3 + w, dy + 10 - k, '#1e1c17'); } prect(s, dx + 1, dy + 6, 5, 1, '#1e1c17'); ppx(s, dx + 3, dy, '#1e1c17'); };
      stamp(c, x, y + 14, 58, 36, (s) => {
        for (let i = 0; i < 8; i++) pellipse(s, 6 + r() * 46, 20 + r() * 12, 4, 2, '#16140f');
        for (const [dx, dy] of [[2, 2], [14, 0], [46, 4], [30, 2]]) der(s, dx, dy);
        prect(s, 40, 18, 12, 10, '#4a4a44'); prect(s, 40, 18, 2, 10, '#6a6a62'); prect(s, 40, 17, 12, 2, '#5a5a52');
        hut(s, 4, 22, '#3a3e48', '#5a4c3a', true); hut(s, 18, 23, '#383a40', '#5a4c3a', true);
        prect(s, 31, 16, 1, 9, '#3a3428'); prect(s, 32, 16, 5, 3, '#b02a22');
      });
      break;
    }
    case 'redpost': case 'einbpost': // застава Собрания: шлагбаум, будка, красный флаг
      stamp(c, x, y + 6, 26, 22, (s) => {
        prect(s, 2, 12, 8, 7, '#4a4234'); prect(s, 2, 11, 8, 1, '#2e2a22'); prect(s, 4, 14, 2, 2, '#e0a050');
        prect(s, 11, 15, 1, 4, '#3a3428'); for (let k = 0; k < 13; k++) ppx(s, 12 + k, 15, k % 4 < 2 ? '#d8d0c0' : '#b02a22');
        prect(s, 7, 0, 1, 11, '#3a3428'); prect(s, 8, 0, 6, 4, '#b02a22'); ppx(s, 8, 4, '#8a2018');
      });
      break;
    case 'airship':
      stamp(c, x, y + 6, 50, 18, (s) => {
        pellipse(s, 25, 14, 23, 3, 'rgba(0,0,0,0.35)');
        for (let i = 0; i < 9; i++) { const ax = 3 + i * 5, top = 2 + Math.abs(i - 4); pline(s, ax, 14 - i * 0.6, ax + 1, top, '#9a9080'); pline(s, ax + 1, top, ax + 3, 13 - i * 0.6, '#7a7262'); }
        pline(s, 2, 15, 47, 9, '#8a8070');
        prect(s, 18, 6, 12, 4, '#6a6250'); prect(s, 19, 7, 3, 2, '#4a4436');
        prect(s, 22, 12, 8, 4, '#3a2e22'); prect(s, 23, 13, 2, 1, '#1a140e');
      });
      break;
    case 'post':
      stamp(c, x, y + 5, 18, 14, (s) => {
        prect(s, 1, 4, 3, 8, '#5e5a50'); prect(s, 1, 10, 13, 2, '#5e5a50'); prect(s, 13, 0, 3, 12, '#6a665a'); prect(s, 5, 2, 6, 2, '#4e4a42');
        prect(s, 14, 0, 1, 12, '#8a8678'); ppx(s, 8, 7, '#f0a050'); ppx(s, 7, 8, '#c06020');
      });
      break;
    case 'bones':
      stamp(c, x, y + 6, 30, 18, (s) => {
        for (let i = 0; i < 5; i++) { const bx = 4 + i * 4; pline(s, bx, 8, bx - 2, 15, '#b4ae9c'); pline(s, bx, 8, bx + 1, 1, '#c8c2ae'); }
        pline(s, 2, 9, 22, 8, '#d0cab6'); pellipse(s, 25, 9, 3, 3, '#c8c2ae'); ppx(s, 25, 9, '#1a1814'); ppx(s, 27, 8, '#1a1814');
      });
      break;
    case 'lorry': // ранний грузовик: капот-коробка, открытая кабина под навесом, кузов с брезентом, колёса со спицами
      stamp(c, x, y + 5, 26, 15, (s) => {
        prect(s, 1, 9, 24, 2, '#2e241a');                                       // рама
        prect(s, 1, 2, 12, 7, '#5a5440'); prect(s, 1, 2, 12, 1, '#6e6850');     // брезентовый верх кузова
        for (let k = 0; k < 4; k++) prect(s, 2 + k * 3, 3, 1, 6, '#48432f');    // дуги тента
        prect(s, 1, 8, 12, 1, '#4a3424');                                       // борт
        prect(s, 14, 2, 1, 7, '#3a2a1c'); prect(s, 14, 2, 6, 1, '#3a2a1c'); prect(s, 19, 2, 1, 4, '#3a2a1c'); // навес кабины на стойках
        prect(s, 15, 6, 4, 3, '#4a3424');                                       // сиденье
        prect(s, 20, 5, 5, 4, '#4e3a28'); prect(s, 20, 5, 5, 1, '#6a4e34'); prect(s, 24, 6, 1, 2, '#8a8a80'); // капот, решётка
        prect(s, 16, 4, 1, 2, '#2a2a28');                                       // руль
        for (const [wx, wr] of [[5, 3], [21, 2]] as [number, number][]) {      // колёса со спицами, литая резина
          pellipse(s, wx, 11, wr, wr, '#141210'); ppx(s, wx, 11, '#7a7a70');
          ppx(s, wx - 1, 11, '#4a4a44'); ppx(s, wx + 1, 11, '#4a4a44'); ppx(s, wx, 10, '#4a4a44'); ppx(s, wx, 12, '#4a4a44');
        }
        prect(s, 8, 1, 3, 1, '#2a261c'); ppx(s, 9, 2, '#2a261c');               // дыра в брезенте
      });
      break;
    case 'trenches': // кусок траншеи с бруствером и каска на винтовке
      stamp(c, x, y + 6, 34, 18, (s) => {
        const z = [[1, 12], [8, 12], [8, 7], [16, 7], [16, 12], [24, 12], [24, 7], [32, 7]];
        for (let i = 1; i < z.length; i++) pline(s, z[i - 1][0], z[i - 1][1], z[i][0], z[i][1], '#6e5e42', 5);
        for (let i = 1; i < z.length; i++) pline(s, z[i - 1][0], z[i - 1][1] + 1, z[i][0], z[i][1] + 1, '#16130e', 3);
        prect(s, 12, 0, 1, 7, '#3a2c1e'); prect(s, 10, 0, 5, 2, '#4a4e3a'); ppx(s, 10, 0, '#62664e');
        for (const [a, b] of [[3, 16], [20, 16], [28, 3]]) ppx(s, a, b, '#8a8a80');
      });
      break;
    case 'bunker': // бетонный блиндаж с бронедверью
      stamp(c, x, y + 6, 28, 14, (s) => {
        pellipse(s, 14, 12, 13, 8, '#5a5444'); prect(s, 3, 6, 22, 7, '#6e6e66'); prect(s, 3, 6, 22, 1, '#8a8a80');
        prect(s, 6, 8, 9, 1, '#0c0c0a');                                     // амбразура
        prect(s, 18, 8, 5, 5, '#3a3c3e'); prect(s, 18, 8, 5, 1, '#5a5c5e'); ppx(s, 22, 10, '#c8a050'); // бронедверь
        for (let k = 0; k < 5; k++) ppx(s, 4 + k * 5, 7, '#5a5a52');
      });
      break;
    case 'armorcar': // ржавая бронемашина в воронке
      stamp(c, x, y + 6, 26, 16, (s) => { pellipse(s, 12, 13, 12, 3, '#221e17'); armoredCar(s, 1, 1); });
      break;
    case 'flare':
      stamp(c, x, y, 9, 13, (s) => {
        for (let k = 0; k < 13; k++) { const w = Math.round(4 - k * 0.3); ppx(s, 4 - w, 12 - k, '#2a2620'); ppx(s, 4 + w, 12 - k, '#2a2620'); }
        prect(s, 2, 8, 5, 1, '#3a342a'); prect(s, 3, 4, 3, 1, '#3a342a'); prect(s, 4, 0, 1, 2, '#5a4a30');
        pellipse(s, 4, 12, 4, 1, '#121110');
      });
      break;
  }
}
