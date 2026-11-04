// ============================================================
//  Глобальная карта региона (в духе Mount & Blade):
//  отряд свободно ходит по карте, время идёт, деревни — входы
//  в локальные сцены, примечательности — события на карте.
// ============================================================
import { G, arthurIn } from './state';
import { seeded, TAU, clamp, dist, Pt } from './util';
import { PixelView, LW, LH, PS, PLight, applyLight, prect, ppx, pline, pellipse, pshadow, outline, pixelize, shade } from './px';
import { miniSprite } from './sprites';
import { lampLevel } from './state';
import { loadSpeedK } from './load';
import { itemOf } from './items';
import { ENEMIES, type UnitBase } from './data';
import { addWoundId } from './wounds';
import { Debug } from './debug';
import { Weather } from './weather';

const VW = 960, VH = 640;
export const WW = 3800, WH = 2500; // восточный край — траншейное море тянется дальше, чем видно
/** Восточнее — Траншейное море: здесь когда-то, ещё до катаклизма, столкнулись армии Империи и баронов-сепаратистов. */
export const HELL_X = 2280;
/** Восточный край прежней карты (земли Олдриджа). */
const OLD_E = 1920;
/** Южнее — земли барона Винферда (старые земли кончаются здесь). */
export const SOUTH_Y = 1280;
/** Западная граница мира: за Эшфордом — старый фронт (траншеи, проволока, мертвецы). */
export const WX0 = -2500;
/** Восточнее — старый фронт (поле сражений баронов), западнее — земли Леди Харрингтон. */
const FRONT_W0 = -900;
const OX = -WX0 / 2;          // сдвиг фона: пиксель фона = (x мира − WX0) / 2
/** Северная граница мира: севернее y=0 — земли бывшего барона Сильвера (густые леса, власть Народного Собрания). */
export const WY0 = -1200;
const OY = -WY0 / 2;
const NORTH_Y = 0;
const FRONT_X = 120;          // западнее — старый фронт

export interface Loc {
  id: string; name: string; kind: 'village' | 'fort' | 'poi';
  hidden?: boolean; // скрыто на карте, пока отряд сам не найдёт (как примечательности)
  x: number; y: number; talk: string; scene?: string; desc: string;
}
export const LOCS: Loc[] = [
  { id: 'ashford', name: 'Эшфорд', kind: 'village', x: 430, y: 760, talk: 'loc_ashford', scene: 'ashford', desc: 'Деревня нефтяников. Качалки, цистерны, пустые дома.' },
  { id: 'richmord', name: 'Ричморд', kind: 'village', x: 1180, y: 330, talk: 'loc_richmord', scene: 'richmord', desc: 'Жучиные фермы. Мясо и панцирь.' },
  { id: 'fenmor', name: 'Фенмор', kind: 'village', x: 470, y: 270, talk: 'loc_fenmor', scene: 'fenmor', desc: 'Грибные фермы в болотистой низине.' },
  { id: 'fort', name: 'Форт Олдриджа', kind: 'fort', x: 1730, y: 840, talk: 'loc_fort', scene: 'fortgate', desc: 'Город-крепость барона Олдриджа.' },
  { id: 'airship', name: 'Руины дирижабля', kind: 'poi', x: 930, y: 520, talk: 'poi_airship', desc: 'Остов огромного воздушного корабля.' },
  { id: 'post', name: 'Разрушенный пост', kind: 'poi', x: 1150, y: 905, talk: 'poi_post', desc: 'Руины имперского поста между трактом и путями.' },
  { id: 'bones', name: 'Старые кости', kind: 'poi', x: 760, y: 430, talk: 'poi_bones', desc: 'Скелет исполинского жука.' },
  { id: 'lorry', name: 'Остов грузовика', kind: 'poi', x: 1270, y: 690, talk: 'poi_lorry', desc: 'Брошенный имперский грузовик в ложбине, в стороне от тракта.' },
  { id: 'trenches', name: 'Старые траншеи', kind: 'poi', x: -500, y: 600, talk: 'poi_trenches', desc: 'Здесь бились бароны этих и соседних земель.' },
  { id: 'bunker', name: 'Командный блиндаж', kind: 'poi', x: -700, y: 360, talk: 'poi_bunker', desc: 'Бетонный блиндаж с заклинившей бронедверью.' },
  { id: 'armorcar', name: 'Ржавая бронемашина', kind: 'poi', x: -260, y: 980, talk: 'poi_armorcar', desc: 'Брошенная бронемашина в воронке.' },
  // ---------------- земли Леди Харрингтон (к западу от поля сражений)
  { id: 'bfort', name: 'Форт Леди Харрингтон', kind: 'fort', x: -2150, y: 620, talk: 'loc_bfort', scene: 'bfort', desc: 'Крепость баронессы: один большой ярус и замок.' },
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
  { id: 'coven', name: 'Ковен ведьм', kind: 'village', hidden: true, x: -420, y: -560, talk: 'loc_coven', scene: 'coven', desc: 'Логово ведьм в глухом лесу, в вечном зловещем тумане.' },
  { id: 'einbpost', name: 'Застава у Эйнбоу', kind: 'poi', x: 572, y: -230, talk: 'poi_einbpost', desc: 'Пост братьев свободы на дороге к сожжённой деревне.' },
  // ---------------- юг: земли барона Винферда — самые развитые и спокойные
  { id: 'wfort', name: 'Форт Винферда', kind: 'fort', x: -250, y: 2050, talk: 'loc_wfort', scene: 'wf1', desc: 'Столица барона Винферда: торговые ряды, театр, наверху — знать.' },
  { id: 'greywell', name: 'Грейвелл', kind: 'village', x: 700, y: 1700, talk: 'loc_greywell', scene: 'greywell', desc: 'Деревня нефтяников посреди нефтяных полей.' },
  { id: 'deepfield', name: 'Дипфилд', kind: 'village', x: 1250, y: 1900, talk: 'loc_deepfield', scene: 'deepfield', desc: 'Вторая деревня нефтяников: качалки и перегонный цех.' },
  { id: 'bramley', name: 'Брэмли', kind: 'village', x: -1500, y: 1560, talk: 'loc_bramley', scene: 'bramley', desc: 'Деревня, где пасут жуков.' },
  { id: 'willowbrook', name: 'Уиллоубрук', kind: 'village', x: -960, y: 1820, talk: 'loc_willowbrook', scene: 'willowbrook', desc: 'Деревня у реки: рыбный и грибной промысел.' },
  { id: 'ironcliff', name: 'Айронклифф', kind: 'village', x: 300, y: 2330, talk: 'loc_ironcliff', scene: 'ironcliff', desc: 'Деревня горняков у южных гор.' },
  { id: 'limbridge', name: 'Лимбридж', kind: 'village', x: 60, y: 1890, talk: 'loc_limbridge', scene: 'limbridge', desc: 'Палатки и лачуги беженцев, ждущих права на расселение.' },
  { id: 'railworks', name: 'Стройка железной дороги', kind: 'poi', x: 470, y: 1905, talk: 'poi_railworks', desc: 'Здесь прокладывают новую ветку к нефтяным деревням.' },
  { id: 'wfcustoms', name: 'Пограничная контора', kind: 'poi', x: 1470, y: 1240, talk: 'poi_wfcustoms', desc: 'Будка, шлагбаум и стол с печатями на въезде в земли Винферда.' },
  { id: 'wfcustoms2', name: 'Пограничная контора', kind: 'poi', x: -1730, y: 1250, talk: 'poi_wfcustoms', desc: 'Будка, шлагбаум и стол с печатями на въезде в земли Винферда.' },
  { id: 'deadend', name: 'Край Траншейного моря', kind: 'poi', x: 2235, y: 850, talk: 'poi_deadend', desc: 'Здесь обрываются тракт и рельсы. Дальше — Траншейное море.' },
  // ---------------- Траншейное море: найти можно только самому
  { id: 'gravehill', name: 'Могильный холм', kind: 'poi', x: 2560, y: 1740, talk: 'poi_gravehill', desc: 'Холм, сплошь изрытый могилами: колья, каски, доски с номерами.' },
  { id: 'heathen', name: 'Покинутое капище', kind: 'poi', x: 3010, y: 520, talk: 'poi_heathen', desc: 'Круг кольев с черепами и идолы из касок и штыков. Здесь давно никого нет.' },
  { id: 'apost1', name: 'Заброшенный пост 209', kind: 'poi', x: 2780, y: 2060, talk: 'poi_apost1', desc: 'Имперский пост: бункеры распахнуты, внутри пусто.' },
  { id: 'apost2', name: 'Заброшенный пост 156', kind: 'poi', x: 2920, y: 1260, talk: 'poi_apost2', desc: 'Имперский пост, взятый с бою: обгоревшие мешки, следы когтей на бетоне.' },
  { id: 'scrapyard', name: 'Кладбище имперской техники', kind: 'poi', x: 2640, y: 400, talk: 'poi_scrapyard', desc: 'Ряды ржавых танков, грузовиков и орудий — и остов сухопутного корабля.' },
  { id: 'volnitsa', name: 'Вольница', kind: 'village', hidden: true, x: 2600, y: 1150, talk: 'loc_volnitsa', scene: 'volnitsa', desc: 'Круглые траншеи, землянки и воронки с грибами. Здесь собираются бандиты, анархисты и прочие сомнительные личности.' },
  { id: 'post314', name: 'Пост 314', kind: 'village', hidden: true, x: 2400, y: 1420, talk: 'loc_post314', scene: 'post314', desc: 'Передовой пункт остатков имперской армии у края моря траншей. Бетонные бункеры, гарнизон с семьями несёт вечный дозор и ждёт связи со столицей.' },
  { id: 'flare', name: 'Газовый факел', kind: 'poi', x: 230, y: 640, talk: 'poi_flare', desc: 'Вечный огонь над старой скважиной.' },
];
const ROADS: number[][][] = [
  [[430, 760], [600, 790], [800, 800], [1000, 830], [1200, 850], [1400, 830], [1560, 850], [1730, 840]],
  [[800, 800], [880, 680], [960, 560], [1060, 440], [1180, 330]],
  [[430, 760], [450, 600], [480, 440], [470, 270]],
  // старая военная дорога — от Эшфорда на запад, к фронту
  [[430, 760], [260, 800], [40, 790], [-220, 740], [-480, 700], [-760, 640]],
  // земли Леди Харрингтон: тракт от поля сражений к форту Леди Харрингтон
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
  // юг: земли Винферда — от тракта барона, от Хейлстоуна баронессы, между деревнями
  [[1560, 850], [1520, 1100], [1440, 1290], [1200, 1480], [950, 1600], [700, 1700]],
  [[700, 1700], [400, 1830], [60, 1890], [-250, 2050]],
  [[-1920, 1060], [-1780, 1300], [-1500, 1560], [-1250, 1700], [-960, 1820], [-600, 1950], [-250, 2050]],
  [[700, 1700], [980, 1800], [1250, 1900]],
  [[-250, 2050], [0, 2200], [300, 2330]],
  // восток: тракт от форта Олдриджа к Траншейному морю — и обрывается
  [[1730, 840], [1900, 815], [2060, 830], [2210, 822]],
];
/** Озеро и реки в землях Леди Харрингтон (координаты мира). */
const LAKE = { x: -1650, y: 420, rx: 250, ry: 140 };
const RIVERS: number[][][] = [
  [[-1380, -1200], [-1420, -900], [-1400, -600], [-1450, -300], [-1480, 0], [-1520, 120], [-1580, 210], [-1600, 290]], // из северных лесов в озеро
  [[-1430, 470], [-1380, 560], [-1340, 700], [-1290, 820], [-1210, 920], [-1180, 1080], [-1120, 1280], [-1080, 1500], [-1010, 1700], [-940, 1850], [-970, 2100], [-1060, 2380], [-1110, 2500]], // из озера на юго-восток и дальше через земли Винферда
  [[-1880, 470], [-2000, 540], [-2120, 500], [-2300, 560], [-2500, 520]],                  // из озера на запад
];
/** y железной дороги на долготе x (по ломаной RAIL). */
function railY(x: number) {
  for (let i = 1; i < RAIL.length; i++) { const [x0, y0] = RAIL[i - 1], [x1, y1] = RAIL[i]; if (x <= x1) return y0 + (y1 - y0) * clamp((x - x0) / (x1 - x0), 0, 1); }
  return RAIL[RAIL.length - 1][1];
}
const RAIL: number[][] = [[-2080, 700], [-1800, 760], [-1450, 830], [-1150, 880], [-900, 870], [-500, 885], [0, 875], [200, 840], [330, 806], [430, 798], [540, 806], [700, 848], [850, 905], [1000, 950], [1300, 940], [1550, 910], [1730, 880], [1900, 872], [2060, 880], [2180, 875]];
/** Ветка к форту Винферда: от главной линии у Эшфорда на юг (двухпутная). */
const WF_RAIL: number[][] = [[255, Math.round(railY(255))], [190, 1000], [90, 1300], [-20, 1600], [-120, 1850], [-205, 2010]];
/** Новая ветка от форта к нефтяным деревням: готовый участок и насыпь, где ещё работают. */
const WF_NEW_DONE: number[][] = [[-205, 2015], [80, 1975], [460, 1890]];
const WF_NEW_BED: number[][] = [[460, 1890], [720, 1765], [1000, 1840], [1250, 1905]];
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
  ROADS[8].slice(2), [...ROADS[10], ...ROADS[11].slice(1)], [...ROADS[12].slice().reverse(), ...ROADS[13].slice(1)],
  // Винферд: пеший патруль от нефтяников через Лимбридж к форту и горнякам; бронемашины — по длинным трактам
  [...ROADS[15], ...ROADS[18].slice(1)], [...ROADS[14].slice(1), ...ROADS[17].slice(1)], ROADS[16].slice(1)];
export type PatrolOwner = 'baron' | 'baroness' | 'revo' | 'winford' | 'wfcar';
const PATROL_OWNER: PatrolOwner[] = ['baron', 'baron', 'baroness', 'revo', 'revo', 'revo', 'winford', 'wfcar', 'wfcar'];
const PATROL_SPEED = 36;   // пикселей карты в час
interface Patrol { path: number[][]; len: number; s: number; dir: 1 | -1; wait: number; speed: number; owner: PatrolOwner; off?: Pt; beaten?: number; spare?: number } // spare — до этого часа братья не трогают отряд (отпустили, отстали) // off — сошёл с дороги в погоню; beaten — до этого часа потрёпан и в бой не лезет
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
interface DeadGroup { id: string; kinds: string[]; x: number; y: number; tx: number; ty: number; alive: boolean; respawn: number; calm: number; seen: boolean; hell?: boolean } // hell — бредут по траншейному морю
const DEAD_START: [string, string[], number, number][] = [
  ['trench1', ['dead_soldier', 'dead_rifle', 'dead_soldier'], -600, 500],
  ['trench2', ['dead_gas', 'dead_soldier', 'dead_rifle'], -330, 860],
  ['trench3', ['dead_sapper', 'dead_soldier', 'dead_gas'], -760, 950],
];
// голодные бандиты: оборванцы бродят вглубь земли Олдриджа — слабые и медленные
interface Hungry { id: number; kinds: string[]; x: number; y: number; tx: number; ty: number; alive: boolean; respawn: number; calm: number; seen: boolean; chasing?: boolean }
const HUNGRY_START: [number, number][] = [[640, 560], [1330, 640], [1100, 1150]];
// морские демоны: двое бродят по берегу озера баронессы
interface LakeDemon { id: number; x: number; y: number; tx: number; ty: number; alive: boolean; respawn: number; calm: number; seen: boolean; a: number }
const lakeRing = (a: number, k: number) => ({ x: -1650 + Math.cos(a) * 250 * k, y: 420 + Math.sin(a) * 140 * k });
const lakeD = (q: Pt) => Math.hypot((q.x + 1650) / 250, (q.y - 420) / 140);
/** Где морской демон может быть: у самой воды, не у дорог и не у деревни. */
const demonOk = (q: Pt, far = 1.22) => { const d = lakeD(q); return d > 0.95 && d < far && !nearRoad(q, 55) && dist(q, { x: -1640, y: 640 }) > 170; };
/** Отряд в зоне демонов — у берега, но не на дороге и не у Бриммора: только тогда они идут на него. */
const nearLake = (q: Pt) => demonOk(q, 1.4);
const inBaronLand = (q: Pt) => q.x > 200 && q.x < 1650 && q.y > 120 && q.y < SOUTH_Y - 120;
const inNorth = (q: Pt) => q.y < NORTH_Y;
// лоялисты старого режима: редкие группы прячутся в лесу, подальше от дорог
// ------------------------------------------------------------ стычки между отрядами
// Патрули бьют тех, кого их господин считает разбойниками; бандиты гоняют голодных. Отряд может вступить за одну из сторон.
export interface ClashSide { kind: 'patrol' | 'band' | 'hungry' | 'loyal' | 'dead' | 'cult'; name: string; units: string[]; ref: object }
export interface Clash { x: number; y: number; a: ClashSide; b: ClashSide; until: number; offered: boolean; seed: number; met: boolean } // met — стороны сошлись, идёт перестрелка
const PATROL_UNITS: Record<PatrolOwner, string[]> = {
  baron: ['baron_soldier', 'baron_soldier', 'baron_soldier'], baroness: ['bsoldier', 'bsoldier', 'bsoldier'],
  winford: ['wf_soldier', 'wf_soldier', 'wf_soldier'], wfcar: ['wf_soldier', 'wf_soldier', 'wf_soldier', 'wf_soldier'], revo: ['brother_fighter', 'brother_fighter', 'brother_fighter'],
};
export const PATROL_NAME: Record<PatrolOwner, string> = { baron: 'Патруль Олдриджа', baroness: 'Патруль Леди Харрингтон', winford: 'Патруль Винферда', wfcar: 'Бронемашина Винферда', revo: 'Братья свободы' };
/** Сила стороны для исхода стычки без отряда: ОЗ × (атака + 4). */
const strength = (units: string[]) => units.reduce((s, k) => s + (ENEMIES[k]?.maxHp ?? 8) * ((ENEMIES[k]?.atkR ?? 2) + 4), 0);
interface Loyal { id: number; kinds: string[]; x: number; y: number; tx: number; ty: number; alive: boolean; respawn: number; calm: number; seen: boolean }
// отряды демонов: бродят по лесу вокруг ковена — бес, рогатый демон, адская гончая в разных сочетаниях
interface DemonSquad { id: number; kinds: string[]; x: number; y: number; tx: number; ty: number; alive: boolean; respawn: number; calm: number; seen: boolean; hell?: boolean } // hell — свора культа в траншейном море
const COVEN_AT = { x: -420, y: -560 }, COVEN_R = 520;
const DSQ_START: [number, number, string[]][] = [[-700, -430, ['hound', 'imp']], [-180, -720, ['demon', 'imp']], [-470, -230, ['hound', 'hound', 'imp']], [-640, -800, ['demon', 'hound']]];
const nearCoven = (q: Pt, r = COVEN_R) => dist(q, COVEN_AT) < r;
// шайки бандитов: бродят по пустошам барона, по 2–4 человека
interface Band { fac: 'bandit' | 'deserter'; home?: 'lh' | 'wf'; raid?: boolean; id: number; kinds: string[]; x: number; y: number; tx: number; ty: number; alive: boolean; respawn: number; calm: number; seen: boolean }
const BAND_START: [number, number][] = [[750, 1180], [1450, 1180], [820, 200], [1560, 430]]; // глухие углы, подальше от трактов
// дезертиры бесчинствуют в землях Леди Харрингтон и заходят в земли Винферда — одна из его головных болей
const DESERTER_START: [number, number, 'lh' | 'wf'][] = [[-1250, 1080, 'lh'], [-2320, 1080, 'lh'], [-1150, 230, 'lh'], [-1500, 1750, 'wf'], [250, 1700, 'wf']];
/** Где бродит шайка: бандиты — в землях Олдриджа; дезертиры Леди Харрингтон — в её землях и на западе земель Винферда; осевшие у Винферда — по всем его землям. */
function inBandArea(q: Pt, fac: Band['fac'], home: Band['home'] = 'lh') {
  if (fac === 'bandit') return q.x > 200 && q.x < 1700 && q.y > 150 && q.y < SOUTH_Y - 60;
  const lh = q.x > WX0 + 140 && q.x < FRONT_W0 - 80 && q.y > 150 && q.y < SOUTH_Y - 60;
  const wf = q.x > WX0 + 140 && q.x < (home === 'wf' ? HELL_X - 200 : -300) && q.y > SOUTH_Y + 60 && q.y < WH - 260;
  return home === 'wf' ? wf : lh || wf;
}
/** Рамка, в которой ищут место для новой шайки (дезертиры появляются у себя «дома»). */
const bandBox = (b: Band) => (b.fac === 'bandit' ? { x0: 200, x1: 1700, y0: 150, y1: SOUTH_Y - 60 } : b.home === 'wf' ? { x0: WX0 + 140, x1: HELL_X - 200, y0: SOUTH_Y + 60, y1: WH - 260 } : { x0: WX0 + 140, x1: FRONT_W0 - 80, y0: 150, y1: SOUTH_Y - 60 });
/** Глушь для шайки: подальше от трактов, рельсов, сёл и воды. */
const BAND_ROAD = 190;
function bandWild(q: Pt, fac: Band['fac'] = 'bandit', home: Band['home'] = 'lh') {
  return inBandArea(q, fac, home) && !nearRoad(q, BAND_ROAD) && !railNear(q, BAND_ROAD - 40) && !waterAt(q, 20) && !LOCS.some((l) => l.kind !== 'poi' && dist(l, q) < 260);
}
/** Состав шайки: 2–4 бандита; в шайке из 3–4 может быть главарь. */
function bandRoll(): string[] {
  const n = 2 + Math.floor(Math.random() * 3), pool = ['bandit_gun', 'bandit_shot', 'bandit_axe'];
  const k = Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)]);
  if (n >= 3 && Math.random() < 0.6) k[0] = 'bandit_boss';
  return k;
}
/** Дезертиры: 2–4 солдата; бывает беглый сержант, сапёр с лопаткой, изредка — пулемётчик. */
function deserterRoll(): string[] {
  const n = 2 + Math.floor(Math.random() * 3);
  const k = Array.from({ length: n }, (): string => (Math.random() < 0.7 ? 'deserter' : 'deserter_sapper'));
  if (n >= 3 && Math.random() < 0.5) k[0] = 'deserter_sgt';
  if (n >= 3 && Math.random() < 0.25) k[n - 1] = 'deserter_mg';
  return k;
}
const rollFor = (fac: Band['fac']) => (fac === 'deserter' ? deserterRoll() : bandRoll());
const LOYAL_START: [number, number][] = [[880, -620], [1420, -620], [300, -450]];
const inHell = (q: Pt) => q.x > HELL_X && !peaksAt(q, 40); // север отрезан горами
// ------------------------------------------------------------ траншейное море: мертвецы и культ — враждуют между собой
const HELL_DEAD_START: [number, number][] = [[2700, 600], [2900, 1500], [2550, 1900], [3000, 2250], [2850, 250], [3400, 900], [3600, 1900], [3300, 2300]];
const HELL_CULT_START: [number, number][] = [[2980, 900], [2720, 2150], [3080, 1700], [3500, 1350], [3650, 500]];
/** Где бродят: в море траншей, подальше от Вольницы, Поста 314 и края карты. */
const hellWild = (q: Pt) => inHell(q) && q.y > 60 && q.y < WH - 80 && q.x < WW - 50 && !LOCS.some((l) => l.kind !== 'poi' && dist(l, q) < 220);
const pickW = (pool: [string, number][]) => { let r = Math.random() * pool.reduce((s, [, w]) => s + w, 0); return pool.find(([, w]) => (r -= w) < 0)![0]; };
/** Мертвецы бывшего фронта: 3–4, среди них — гренадеры и штурмовики, характерные для моря траншей. */
function hellDeadRoll(): string[] {
  const n = 3 + (Math.random() < 0.4 ? 1 : 0);
  return Array.from({ length: n }, () => pickW([['dead_soldier', 3], ['dead_rifle', 2], ['dead_gren', 2], ['dead_storm', 2], ['dead_gas', 1], ['dead_sapper', 1]]));
}
/** Свора культа: 1–2 культиста и демоны (бес, гончая, изредка рогатый) — всего 3–4. */
function cultRoll(): string[] {
  const total = 3 + (Math.random() < 0.4 ? 1 : 0), nc = 1 + (Math.random() < 0.5 ? 1 : 0), nd = total - nc;
  const out: string[] = Array.from({ length: nc }, () => (Math.random() < 0.5 ? 'cultist' : 'cultist_gun'));
  let horned = false;
  for (let i = 0; i < nd; i++) { const k = !horned && Math.random() < 0.25 ? 'demon' : pickW([['imp', 3], ['hound', 2]]); if (k === 'demon') horned = true; out.push(k); }
  return out;
}
/** Место для новой группы в море — подальше от отряда. */
function hellSpot(p: Pt): Pt | null {
  for (let k = 0; k < 30; k++) { const q = { x: HELL_X + 120 + Math.random() * (WW - HELL_X - 180), y: 120 + Math.random() * (WH - 240) }; if (hellWild(q) && dist(q, p) > 450) return q; }
  return null;
}
const inFront = (q: Pt) => q.x > FRONT_W0 + 40 && q.x < FRONT_X - 20 && q.y > 80 && q.y < SOUTH_Y - 80;
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

// ============================================================ вода: по озеру и рекам не пройти, мосты — там, где дорога или рельсы
const railNear = (q: Pt, d: number) => [RAIL, WF_RAIL].some((r) => r.some((pt, i) => i > 0 && segDist(q, r[i - 1], pt) < d));
/** pad — запас вокруг воды (для сетки обхода, чтобы путь не проскальзывал сквозь узкую реку между клетками). */
// ------------------------------------------------------------ северо-восточные горы
// Высокий горный массив на северо-востоке: от северных лесов до восточного края карты, Траншейное море — южнее. Непроходим, как вода.
/** Западный край массива (зависит от y) и южный край (зависит от x). */
const peakW = (y: number) => OLD_E + 30 + Math.sin(y / 90) * 28 + Math.sin(y / 37 + 1) * 12;
const peakS = (x: number) => NORTH_Y - 70 + Math.sin(x / 70) * 26 + Math.sin(x / 23 + 2) * 9;
export function peaksAt(q: Pt, pad = 0) { return q.x > peakW(q.y) - pad && q.y < peakS(q.x) + pad; }

function waterAt(q: Pt, pad = 0) {
  if (peaksAt(q, pad)) return true; // горы — непроходимы
  const a = Math.atan2((q.y - LAKE.y) / LAKE.ry, (q.x - LAKE.x) / LAKE.rx), wob = 1 + Math.sin(a * 5) * 0.06 + Math.sin(a * 11 + 1) * 0.03;
  const inLake = Math.hypot((q.x - LAKE.x) / LAKE.rx, (q.y - LAKE.y) / LAKE.ry) / wob < 1.02 + pad / LAKE.ry;
  const inRiver = !inLake && RIVERS.some((rv) => rv.some((pt, i) => i > 0 && segDist(q, rv[i - 1], pt) < 8 + pad));
  if (!inLake && !inRiver) return false;
  return !nearRoad(q, 12) && !railNear(q, 12); // мосты и броды
}
// сетка проходимости для обхода воды (клетка 16 пикселей карты); строится один раз
const GC = 16, GW = Math.ceil((WW - WX0) / GC), GH = Math.ceil((WH - WY0) / GC);
let gridWet: Uint8Array | null = null;
function wetGrid() {
  if (gridWet) return gridWet;
  gridWet = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) gridWet[gy * GW + gx] = waterAt({ x: WX0 + gx * GC + GC / 2, y: WY0 + gy * GC + GC / 2 }, GC * 0.75) ? 1 : 0;
  return gridWet;
}
const cellOf = (q: Pt) => ({ x: clamp(Math.floor((q.x - WX0) / GC), 0, GW - 1), y: clamp(Math.floor((q.y - WY0) / GC), 0, GH - 1) });
const centerOf = (c: Pt) => ({ x: WX0 + c.x * GC + GC / 2, y: WY0 + c.y * GC + GC / 2 });
function lineDry(a: Pt, b: Pt) { const n = Math.ceil(dist(a, b) / 3); for (let i = 1; i <= n; i++) if (waterAt({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n })) return false; return true; }
/** Путь в обход воды: BFS по сетке, затем срезаем углы, где по прямой сухо. Пусто — если идти можно напрямую. */
function dryRoute(from: Pt, to: Pt): Pt[] {
  if (lineDry(from, to)) return [];
  const wet = wetGrid(), s0 = cellOf(from), t0 = cellOf(to), prev = new Int32Array(GW * GH).fill(-1);
  const start = s0.y * GW + s0.x; prev[start] = start;
  const q = [start]; let best = start, bestD = Infinity;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h], cx = cur % GW, cy = (cur - cx) / GW, dd = Math.hypot(cx - t0.x, cy - t0.y);
    if (dd < bestD) { bestD = dd; best = cur; if (dd === 0) break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const k = ny * GW + nx; if (prev[k] !== -1 || wet[k]) continue;
      prev[k] = cur; q.push(k);
    }
  }
  const cells: Pt[] = []; for (let k = best; k !== start; k = prev[k]) cells.push(centerOf({ x: k % GW, y: Math.floor(k / GW) }));
  cells.reverse();
  if (bestD === 0) cells[cells.length - 1] = { x: to.x, y: to.y }; // цель сухая — идём точно в неё
  const out: Pt[] = []; let at = from; // срезаем углы
  for (let i = 0; i < cells.length; i++) { if (i === cells.length - 1 || !lineDry(at, cells[i + 1])) { out.push(cells[i]); at = cells[i]; } }
  return out;
}

export const World = {
  bg: null as HTMLCanvasElement | null,
  view: null as PixelView | null,
  party: { x: 430, y: 790, tx: 430, ty: 790, moving: false, flip: false },
  route: [] as Pt[], // путь в обход воды (точки после текущей цели)
  pending: null as Loc | null,
  hover: null as Loc | null,
  cam: { x: 0, y: 0 },
  bands: [] as Band[],
  bandHit: null as Band | null,
  bandLoot: 2, // сколько бандитов было в разбитой шайке — для добычи
  bandTrophy: '', // трофейное оружие (id экземпляра с состоянием) или пусто
  bandKinds: [] as string[],
  bandFac: 'bandit' as 'bandit' | 'deserter', // чья шайка была разбита — для текста добычи
  onArrive: (_l: Loc) => {},
  onEncounter: () => {},
  onPatrol: (_owner: PatrolOwner) => {},
  /** Братья свободы узнали Артура (или отряд в списках разыскиваемых). */
  revoHit: null as Patrol | null,
  onRevo: () => {},
  spareRevo(hours: number) { const pt = this.revoHit; if (pt) pt.spare = G.clock + hours; this.revoHit = null; },
  beatRevo() { const pt = this.revoHit; if (pt) { pt.wait = 0; pt.dir = pt.dir === 1 ? -1 : 1; pt.beaten = G.clock + 24; pt.spare = G.clock + 24; } this.revoHit = null; },
  loyal: [] as Loyal[],
  dsq: [] as DemonSquad[],
  dsqHit: null as DemonSquad | null,
  onDsq: () => {},
  loyalHit: null as Loyal | null,
  onLoyal: () => {},
  onDiscover: (_l: Loc) => {},
  onDead: (_g: DeadGroup) => {},
  onGas: (_msg: string) => {},
  clouds: [] as Cloud[],
  inGas: false, gasDose: 0, filterUse: 0,
  pendingPatrol: null as Patrol | null,
  clashes: [] as Clash[],
  clashHit: null as Clash | null,
  onClash: () => {},
  clashReward: { text: '', give: () => {} },
  /** Кто в стычке — тот стоит и не преследует отряд. */
  inClash(ref: object) { return this.clashes.some((c) => c.a.ref === ref || c.b.ref === ref); },
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
    this.bands = [
      ...BAND_START.map(([x, y], i): Band => ({ fac: 'bandit', id: i, kinds: bandRoll(), x, y, tx: x, ty: y, alive: true, respawn: 0, calm: 0, seen: false, raid: false })),
      ...DESERTER_START.map(([x, y, home], i): Band => ({ fac: 'deserter', home, id: 10 + i, kinds: deserterRoll(), x, y, tx: x, ty: y, alive: true, respawn: 0, calm: 0, seen: false, raid: false })),
    ];
    this.lastDay = Math.floor(G.clock / 24);
    // первый выходит из Эшфорда к форту, второй — из форта к Ричморду: идут навстречу и расходятся
    this.clouds = [[2500, 400], [2800, 1300], [2650, 2050], [3000, 700], [2400, -600], [2900, -200], [300, 1520], [-700, 1660], [1100, 2120], [-1500, 2000], [600, 2210], [-300, 1750], [200, 300], [760, 1080], [1250, 560], [-300, 420], [-650, 900], [1560, 1120], [900, 180], [-1250, 220], [-2050, 950], [-1500, 1150], [-2300, 380], [3400, 600], [3600, 1700], [3300, 2200]].map(([x, y], i) => ({
      x, y, r: 70 + ((i * 37) % 50), vx: 9 + (i % 3) * 3, vy: ((i % 2) * 2 - 1) * 2, seed: i * 1.9 }));
    this.inGas = false; this.gasDose = 0; this.filterUse = 0; this.clashes = []; this.clashHit = null;
    this.demons = [0.6, 3.6].map((a, i) => { const q = lakeRing(a, 1.1); return { id: i, x: q.x, y: q.y, tx: q.x, ty: q.y, alive: true, respawn: 0, calm: 0, seen: false, a }; });
    this.hungry = HUNGRY_START.map(([x, y], i) => ({ id: i, kinds: i % 2 ? ['hungry2', 'hungry', 'hungry'] : ['hungry', 'hungry2'], x, y, tx: x, ty: y, alive: true, respawn: 0, calm: 0, seen: false }));
    this.dead = [...DEAD_START.map(([id, kinds, x, y]) => ({ id, kinds, x, y, tx: x, ty: y, alive: true, respawn: 0, calm: 0, seen: false })),
      ...HELL_DEAD_START.map(([x, y], i) => ({ id: 'hell' + i, kinds: hellDeadRoll(), x, y, tx: x, ty: y, alive: true, respawn: 0, calm: 0, seen: false, hell: true }))];
    this.patrols = PATROL_PATHS.map((path, i) => { const len = polyLen(path); return { path, len, s: i === 0 ? len * 0.2 : i >= 3 ? len * ((0.15 + (i - 3) * 0.3) % 1) : 0, dir: 1 as const, wait: 0, speed: PATROL_OWNER[i] === 'wfcar' ? PATROL_SPEED * 2 : i ? PATROL_SPEED * 1.15 : PATROL_SPEED * 0.9, owner: PATROL_OWNER[i] }; });
    this.dsq = [...DSQ_START.map(([x, y, kinds], i) => ({ id: i, kinds, x, y, tx: x, ty: y, alive: true, respawn: 0, calm: 0, seen: false })),
      ...HELL_CULT_START.map(([x, y], i) => ({ id: 10 + i, kinds: cultRoll(), x, y, tx: x, ty: y, alive: true, respawn: 0, calm: 0, seen: false, hell: true }))];
    this.loyal = LOYAL_START.map(([x, y], i) => ({ id: i, kinds: i === 1 ? ['loyal_off', 'loyalist', 'loyalist'] : ['loyalist', 'loyalist2'], x, y, tx: x, ty: y, alive: true, respawn: 0, calm: 0, seen: false }));
  },
  patrolPos(pt: Patrol) { const q = polyAt(pt.path, pt.s); return pt.off ? { ...q, x: q.x + pt.off.x, y: q.y + pt.off.y } : q; },
  /** Патрули идут по дорогам туда и обратно, на концах отдыхают. Сами отряд не останавливают — с ними можно заговорить. */
  updatePatrols(dt: number) {
    const hours = dt * HOURS_PER_SEC, p = this.party;
    for (const pt of this.patrols) {
      if (pt.off && !this.inClash(pt)) { // погоня кончилась — возвращается на дорогу
        const d = Math.hypot(pt.off.x, pt.off.y), k = Math.max(0, d - 60 * hours) / Math.max(1, d);
        pt.off = d < 2 ? undefined : { x: pt.off.x * k, y: pt.off.y * k };
        continue;
      }
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
  known(l: Loc) { return (l.kind !== 'poi' && !l.hidden) || !!G.flags['found_' + l.id]; },
  discover() {
    for (const l of LOCS) if ((l.kind === 'poi' || l.hidden) && !G.flags['found_' + l.id] && dist(l, this.party) < FIND_R * Weather.sightK()) { G.flags['found_' + l.id] = true; this.onDiscover(l); }
  },
  locAt(x: number, y: number, r = 26) { return LOCS.find((l) => this.known(l) && Math.hypot(l.x - x, l.y - y) < (l.kind === 'fort' ? 70 : r)) ?? null; },
  nearLoc() { return LOCS.find((l) => this.known(l) && dist(l, this.party) < (l.kind === 'fort' ? 90 : 40)) ?? null; },
  updateLocation() {
    const l = this.nearLoc();
    G.location = l ? `У места: ${l.name}` : this.inCloud(this.party) ? 'Едкое облако' : inHell(this.party) ? 'Траншейное море' : this.party.y > SOUTH_Y ? (onRoad(this.party) ? 'Тракт Винферда' : 'Земли Винферда') : inNorth(this.party) ? (onRoad(this.party) ? 'Северный тракт' : 'Северные леса') : this.party.x < FRONT_W0 ? 'Земли Леди Харрингтон' : this.party.x < FRONT_X ? 'Старый фронт' : onRoad(this.party) ? 'Тракт' : 'Земли Олдриджа';
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
    if (pt) { this.route = []; this.pending = null; this.pendingPatrol = pt; const q = this.patrolPos(pt); this.party.tx = q.x; this.party.ty = q.y; this.party.moving = true; return; }
    this.pendingPatrol = null;
    const l = this.locAt(x, y);
    if (l) { this.pending = l; this.party.tx = l.x; this.party.ty = l.y + (l.kind === 'fort' ? 60 : 0); }
    else { this.pending = null; this.party.tx = clamp(x, WX0 + 10, WW - 10); this.party.ty = clamp(y, WY0 + 10, WH - 10); }
    this.route = dryRoute(this.party, { x: this.party.tx, y: this.party.ty }); // через воду не идём — в обход, к мосту
    if (this.route.length) { const n = this.route.shift()!; this.party.tx = n.x; this.party.ty = n.y; }
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
    const speed = SPEED * (onRoad(p) ? ROAD_BONUS : inHell(p) ? 0.5 : inNorth(p) && p.x < OLD_E ? 0.7 : 1) * HOURS_PER_SEC * Debug.speed * Weather.speedK() * loadSpeedK();
    if (vx || vy) {
      const n = Math.hypot(vx, vy), sx = (vx / n) * speed * dt, sy = (vy / n) * speed * dt;
      // в воду не шагнуть: пробуем целиком, потом скольжение вдоль берега по одной оси
      const tryAt = (x: number, y: number) => { const q = { x: clamp(x, WX0 + 10, WW - 10), y: clamp(y, WY0 + 10, WH - 10) }; if (waterAt(q, -3) && !waterAt(p, -3)) return false; p.x = q.x; p.y = q.y; return true; };
      if (!tryAt(p.x + sx, p.y + sy) && !tryAt(p.x + sx, p.y)) tryAt(p.x, p.y + sy);
      this.route = [];
      if (vx) p.flip = vx < 0;
      p.moving = false; this.pending = null; this.pendingPatrol = null; moved = speed * dt;
    } else if (p.moving) {
      const d = Math.hypot(p.tx - p.x, p.ty - p.y), stepLen = Math.min(d, speed * dt);
      if (d > 0.5) {
        const nx = p.x + ((p.tx - p.x) / d) * stepLen, ny = p.y + ((p.ty - p.y) / d) * stepLen;
        if (waterAt({ x: nx, y: ny }, -3) && !waterAt(p, -3) && !this.pendingPatrol) { p.moving = false; this.route = []; this.pending = null; } // упёрлись в воду
        else { p.x = nx; p.y = ny; if (Math.abs(p.tx - p.x) > 1) p.flip = p.tx < p.x; moved = stepLen; }
      }
      if (p.moving && d - stepLen < 1 && this.route.length) { const n = this.route.shift()!; p.tx = n.x; p.ty = n.y; }
      else if (p.moving && d - stepLen < 1) {
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
      // на землях Собрания: патруль братьев узнаёт Артура в лицо (или отряд — по спискам) и останавливает
      if (!Debug.invisible && !this.revoHit && (arthurIn() || G.flags.svobodaWanted)) {
        const pt = this.patrols.find((x) => x.owner === 'revo' && !this.inClash(x) && (x.spare ?? 0) <= G.clock && (x.beaten ?? 0) <= G.clock && dist(this.patrolPos(x), p) < 45);
        if (pt) { p.moving = false; this.pending = null; this.pendingPatrol = null; this.route = []; G.keys.clear(); this.revoHit = pt; this.onRevo(); return; }
      }
      this.updateDead(dt);
      this.updateClouds(dt);
      this.updateBand(dt);
      this.updateHungry(dt);
      this.updateDemons(dt);
      this.updateLoyal(dt);
      this.updateDsq(dt);
      this.updateClashes(dt);
    }
  },

  /** Сторона стычки по отряду на карте. */
  sideOf(ref: Patrol | Band | Hungry | Loyal | DeadGroup | DemonSquad): ClashSide {
    if ('owner' in ref) return { kind: 'patrol', name: PATROL_NAME[ref.owner], units: PATROL_UNITS[ref.owner], ref };
    if ('fac' in ref) return { kind: 'band', name: ref.fac === 'deserter' ? 'Дезертиры' : 'Бандиты', units: ref.kinds, ref };
    if (this.dead.includes(ref as DeadGroup)) return { kind: 'dead', name: 'Мертвецы', units: (ref as DeadGroup).kinds, ref };
    if (this.dsq.includes(ref as DemonSquad)) return { kind: 'cult', name: 'Культ', units: (ref as DemonSquad).kinds, ref };
    if (this.hungry.includes(ref as Hungry)) return { kind: 'hungry', name: 'Голодные бандиты', units: (ref as Hungry).kinds, ref };
    return { kind: 'loyal', name: 'Лоялисты', units: (ref as Loyal).kinds, ref };
  },
  /** Где сейчас сторона стычки. */
  sidePos(sd: ClashSide): Pt { return sd.kind === 'patrol' ? this.patrolPos(sd.ref as Patrol) : (sd.ref as Pt); },
  startClash(a: ClashSide, b: ClashSide) {
    const pa = this.sidePos(a), pb = this.sidePos(b);
    this.clashes.push({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, a, b, until: 0, offered: false, seed: Math.random() * 100, met: false });
  },
  /** Стычка закончилась: проигравшие разбиты (патруль не гибнет — отходит зализывать раны). */
  endClash(c: Clash, winner: 'a' | 'b') {
    const lose = winner === 'a' ? c.b : c.a, win = winner === 'a' ? c.a : c.b;
    const r = lose.ref as { alive?: boolean; respawn?: number; wait?: number };
    if (lose.kind === 'patrol') { // патруль не гибнет и не стоит на месте: разворачивается и уходит по дороге, какое-то время в бой не лезет
      const pt = lose.ref as Patrol; pt.wait = 0; pt.dir = pt.dir === 1 ? -1 : 1; pt.beaten = G.clock + 10;
      if (win.kind !== 'patrol') { // отбились от патруля — уходят от него, а не стоят рядом
        const w = win.ref as Pt & { tx: number; ty: number }, lp = this.sidePos(lose), a = Math.atan2(w.y - lp.y, w.x - lp.x);
        w.tx = w.x + Math.cos(a) * 220; w.ty = w.y + Math.sin(a) * 220;
      }
    }
    else { r.alive = false; r.respawn = G.clock + (lose.kind === 'hungry' ? 48 : 60); }
    this.clashes = this.clashes.filter((x) => x !== c);
    if (this.clashHit === c) this.clashHit = null;
  },
  /** Патрули замечают у дороги тех, кого их господин считает врагами; стычки без отряда решаются сами; подошедший отряд может вступить. */
  updateClashes(_dt: number) {
    const p = this.party;
    for (const pt of this.patrols) {
      if (this.inClash(pt)) { pt.wait = Math.max(pt.wait, 0.5); continue; }
      if ((pt.beaten ?? 0) > G.clock) continue; // потрёпанный патруль отходит и в бой не лезет
      const q = this.patrolPos(pt);
      const foes: (Band | Hungry | Loyal)[] = pt.owner === 'baron' ? [...this.bands.filter((b) => b.fac === 'bandit'), ...this.hungry]
        : pt.owner === 'revo' ? this.loyal : this.bands.filter((b) => b.fac === 'deserter');
      // бросаются в погоню, только если враг у самой дороги
      const road = polyAt(pt.path, pt.s), t = foes.find((g) => g.alive && !this.inClash(g) && dist(g, q) < 150 && dist(g, road) < 110);
      if (t) this.startClash(this.sideOf(pt), this.sideOf(t));
    }
    // траншейное море: мертвецы и культ враждуют — заметив друг друга, сходятся насмерть
    for (const g of this.dead) {
      if (!g.hell || !g.alive || this.inClash(g)) continue;
      const t = this.dsq.find((s) => s.hell && s.alive && !this.inClash(s) && dist(s, g) < 200);
      if (t) this.startClash(this.sideOf(g), this.sideOf(t));
    }
    // погоня: охотник (патруль или бандиты) идёт на добычу; кто слабее — бежит, кто сильнее — принимает бой.
    // Перестрелка начинается, только когда сошлись вплотную; ушли далеко — погоня брошена.
    const hours = _dt * HOURS_PER_SEC;
    for (const c of [...this.clashes]) {
      if (!c.met) {
        const hunter = c.a, prey = c.b, hp = this.sidePos(hunter), pp = this.sidePos(prey);
        const brave = strength(prey.units) >= strength(hunter.units) * 0.8; // сильная шайка не бежит от патруля
        // охотник
        if (hunter.kind === 'patrol') {
          const pt = hunter.ref as Patrol, base = polyAt(pt.path, pt.s), off = pt.off ?? { x: 0, y: 0 }, dd = dist(hp, pp), k = Math.min(1, (75 * hours) / Math.max(1, dd));
          pt.off = { x: off.x + (pp.x - hp.x) * k, y: off.y + (pp.y - hp.y) * k };
          if (Math.hypot(pt.off.x, pt.off.y) > 150 || dist(base, pp) > 190) { this.clashes = this.clashes.filter((x) => x !== c); continue; } // далеко от дороги не пойдут
        } else {
          const r = hunter.ref as { x: number; y: number; tx: number; ty: number }, dd = dist(r, pp), k = Math.min(1, (70 * hours) / Math.max(1, dd));
          r.x += (pp.x - r.x) * k; r.y += (pp.y - r.y) * k; r.tx = r.x; r.ty = r.y;
        }
        // добыча: бежит прочь (голодные — медленнее) или идёт навстречу
        {
          const r = prey.ref as { x: number; y: number; tx: number; ty: number }, h2 = this.sidePos(hunter), dd = Math.max(1, dist(r, h2));
          const sp = (brave ? 40 : prey.kind === 'hungry' ? 30 : 42) * hours, dir = brave ? 1 : -1;
          const nx = r.x + ((h2.x - r.x) / dd) * sp * dir, ny = r.y + ((h2.y - r.y) / dd) * sp * dir;
          if (!waterAt({ x: nx, y: ny }, 10) && !peaksAt({ x: nx, y: ny }, 10)) { r.x = nx; r.y = ny; }
          r.tx = r.x; r.ty = r.y;
        }
        const d = dist(this.sidePos(c.a), this.sidePos(c.b));
        if (d <= 34) { c.met = true; c.until = G.clock + 0.6 + Math.random() * 0.6; } // перестрелка короткая: ~полсекунды–секунда пути
        else if (d > 380) { this.clashes = this.clashes.filter((x) => x !== c); continue; } // ушли
      }
      const qa = this.sidePos(c.a), qb = this.sidePos(c.b);
      c.x = (qa.x + qb.x) / 2; c.y = (qa.y + qb.y) / 2;
    }
    for (const c of [...this.clashes]) {
      if (c === this.clashHit || !c.met || G.clock < c.until) continue;
      const sa = strength(c.a.units), sb = strength(c.b.units);
      this.endClash(c, Math.random() < sa / (sa + sb) ? 'a' : 'b');
    }
    if (!Debug.invisible && !this.clashHit) {
      const c = this.clashes.find((x) => x.met && !x.offered && dist(x, p) < 36); // вплотную: подошли или кликнули прямо на перестрелку
      if (c) { c.offered = true; p.moving = false; this.pending = null; G.keys.clear(); this.clashHit = c; this.onClash(); }
    }
  },
  /** Шайки бандитов: держатся глуши, далеко от трактов; лишь изредка (налёт) выходят к дороге. Замечают отряд в глуши и преследуют — но на тракт за ним почти не идут. */
  updateBand(dt: number) {
    const p = this.party;
    const pick = (b: Band, from: Pt, r: number) => { // следующая точка в глуши; совсем редко — налёт к тракту
      b.raid = Math.random() < 0.04;
      for (let k = 0; k < 24; k++) {
        const a = Math.random() * TAU, t = { x: from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r };
        if (b.raid ? (inBandArea(t, b.fac, b.home) && !waterAt(t, 20) && !LOCS.some((l) => l.kind !== 'poi' && dist(l, t) < 200)) : bandWild(t, b.fac, b.home)) { b.tx = t.x; b.ty = t.y; return; }
      }
      b.raid = false; b.tx = b.x; b.ty = b.y;
    };
    for (const b of this.bands) {
      if (b.alive && this.inClash(b)) { b.seen = dist(b, p) < 340 * Weather.sightK(); continue; } // в перестрелке — стоит, но видна
      if (!b.alive) {
        if (G.clock >= b.respawn) {
          for (let k = 0; k < 200; k++) {
            const A = bandBox(b), q = { x: A.x0 + Math.random() * (A.x1 - A.x0), y: A.y0 + Math.random() * (A.y1 - A.y0) };
            if (bandWild(q, b.fac, b.home) && dist(q, p) > 600 && this.hungry.every((g) => dist(g, q) > 450) && this.bands.every((o) => o === b || !o.alive || dist(o, q) > 400)) {
              b.alive = true; b.kinds = rollFor(b.fac); b.x = b.tx = q.x; b.y = b.ty = q.y; b.raid = false; break;
            }
          }
        }
        continue;
      }
      const d = dist(b, p);
      const patrolNear = this.nearPatrol(b, 220);
      // в погоню — только если отряд сам сошёл в глушь (или идёт налёт)
      const chase = !Debug.invisible && d < 220 && G.clock >= b.calm && !patrolNear && !this.nearPatrol(p, 240) && (b.raid || !nearRoad(p, BAND_ROAD - 70)) && !LOCS.some((l) => l.kind !== 'poi' && dist(l, p) < 160);
      b.seen = d < 340 * Weather.sightK();
      if (chase) { b.tx = p.x; b.ty = p.y; }
      else if (patrolNear || dist(b, { x: b.tx, y: b.ty }) < 4 || (G.clock < b.calm && d < 300) || (!b.raid && nearRoad({ x: b.tx, y: b.ty }, BAND_ROAD - 40))) {
        if (G.clock < b.calm || patrolNear) b.raid = false;
        pick(b, b, 230);
      }
      // бандиты гоняют голодных: заметив их, идут наперехват
      const prey = !chase && b.fac === 'bandit' ? this.hungry.find((g) => g.alive && !this.inClash(g) && dist(g, b) < 260) : undefined;
      if (prey) { b.tx = prey.x; b.ty = prey.y; if (dist(b, prey) < 26) { this.startClash(this.sideOf(b), this.sideOf(prey)); continue; } }
      const sp = (chase || prey ? 70 : 34) * HOURS_PER_SEC * dt, dd = dist(b, { x: b.tx, y: b.ty });
      if (dd > 0.5) { b.x += ((b.tx - b.x) / dd) * Math.min(sp, dd); b.y += ((b.ty - b.y) / dd) * Math.min(sp, dd); }
      if (chase && dist(b, p) < 20) { p.moving = false; this.pending = null; G.keys.clear(); this.bandHit = b; this.onEncounter(); return; }
    }
  },
  /** Голодные бандиты: бродят по земле Олдриджа, держатся подальше от деревень, форта и патрулей; заметив отряд — плетутся к нему. */
  updateHungry(dt: number) {
    const p = this.party, hours = dt * HOURS_PER_SEC;
    for (const g of this.hungry) {
      if (g.alive && this.inClash(g)) { g.seen = dist(g, p) < 300; continue; }
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
      g.chasing = chase;
      // рядом патруль — уходят от него (а не мечутся на месте)
      const pq = patrolNear ? this.patrols.map((pt) => this.patrolPos(pt)).find((q) => dist(q, g) < 180) : undefined;
      if (chase) { g.tx = p.x; g.ty = p.y; }
      else if ((pq && dist(pq, { x: g.tx, y: g.ty }) < 220) || dist(g, { x: g.tx, y: g.ty }) < 4) {
        const base = pq ? Math.atan2(g.y - pq.y, g.x - pq.x) : Math.random() * TAU;
        for (let k = 0; k < 8; k++) {
          const a = base + (pq ? (Math.random() - 0.5) * 1.6 : 0), t = { x: g.x + Math.cos(a) * 180, y: g.y + Math.sin(a) * 180 };
          if (inBaronLand(t) && !nearRoad(t, 70) && this.bands.every((b) => !b.alive || dist(b, t) > 300) && !LOCS.some((l) => l.kind !== 'poi' && dist(l, t) < 140)) { g.tx = t.x; g.ty = t.y; break; }
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
        if (G.clock >= g.respawn) { const q = lakeRing(g.a, 1.1); if (demonOk(q) && dist(q, p) > 400) { g.alive = true; g.x = g.tx = q.x; g.y = g.ty = q.y; } }
        continue;
      }
      const d = dist(g, p);
      g.seen = d < 300;
      const chase = !Debug.invisible && d < 160 && G.clock >= g.calm && nearLake(p);
      if (chase) { g.tx = p.x; g.ty = p.y; }
      else if (dist(g, { x: g.tx, y: g.ty }) < 4 || !demonOk({ x: g.tx, y: g.ty })) {
        for (let k = 0; k < 12; k++) { // следующая точка вдоль берега, в обход дорог и деревни
          const a = g.a + (0.35 + Math.random() * 0.5) * (k % 2 ? -1 : 1), q = lakeRing(a, 1.03 + Math.random() * 0.15);
          if (demonOk(q)) { g.a = a; g.tx = q.x; g.ty = q.y; break; }
        }
      }
      const sp = (chase ? 34 : 14) * hours, dd = dist(g, { x: g.tx, y: g.ty });
      if (dd > 0.5) { g.x += ((g.tx - g.x) / dd) * Math.min(sp, dd); g.y += ((g.ty - g.y) / dd) * Math.min(sp, dd); }
      if (chase && d < 22) { p.moving = false; this.pending = null; G.keys.clear(); this.demonHit = g; this.onDemon(); return; }
    }
  },
  /** Лоялисты: прячутся в лесу вдали от дорог и патрулей; заметив одинокого путника в чаще — выходят к нему. */
  updateLoyal(dt: number) {
    const p = this.party, hours = dt * HOURS_PER_SEC;
    const ok = (q: Pt) => inNorth(q) && q.y > WY0 + 140 && q.x > 120 && q.x < OLD_E - 140 && !nearRoad(q, 70) && !LOCS.some((l) => l.kind !== 'poi' && dist(l, q) < 170);
    for (const g of this.loyal) {
      if (g.alive && this.inClash(g)) { g.seen = dist(g, p) < 240 * Weather.sightK(); continue; }
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
  /** Отряды демонов: кружат по лесу у ковена; заметив отряд рядом — идут на него, но от ковена далеко не уходят. Гончие быстрее. */
  updateDsq(dt: number) {
    const p = this.party, hours = dt * HOURS_PER_SEC;
    const okC = (q: Pt) => nearCoven(q) && !nearCoven(q, 130) && q.y < NORTH_Y - 40 && !nearRoad(q, 50);
    for (const g of this.dsq) {
      if (g.alive && this.inClash(g)) { g.seen = dist(g, p) < 260 * Weather.sightK(); continue; }
      if (!g.alive) {
        if (G.clock >= g.respawn) {
          if (g.hell) { const q = hellSpot(p); if (q) { g.alive = true; g.kinds = cultRoll(); g.x = g.tx = q.x; g.y = g.ty = q.y; g.calm = 0; } continue; }
          const s0 = DSQ_START[g.id]; if (dist({ x: s0[0], y: s0[1] }, p) > 420) { g.alive = true; g.x = g.tx = s0[0]; g.y = g.ty = s0[1]; }
        }
        continue;
      }
      const ok = g.hell ? hellWild : okC;
      const d = dist(g, p);
      g.seen = d < 260 * Weather.sightK();
      const chase = !Debug.invisible && d < 170 && G.clock >= g.calm && (g.hell ? hellWild(p) : nearCoven(p, COVEN_R + 120) && !nearCoven(p, 110));
      if (chase) { g.tx = p.x; g.ty = p.y; }
      else if (dist(g, { x: g.tx, y: g.ty }) < 4) {
        for (let k = 0; k < 10; k++) { const a = Math.random() * TAU, t = { x: g.x + Math.cos(a) * 180, y: g.y + Math.sin(a) * 180 }; if (ok(t)) { g.tx = t.x; g.ty = t.y; break; } }
      }
      const fast = g.kinds.includes('hound'), sp = (chase ? (fast ? 58 : 44) : 20) * hours, dd = dist(g, { x: g.tx, y: g.ty });
      if (dd > 0.5) { g.x += ((g.tx - g.x) / dd) * Math.min(sp, dd); g.y += ((g.ty - g.y) / dd) * Math.min(sp, dd); }
      if (chase && d < 20) { p.moving = false; this.pending = null; G.keys.clear(); this.dsqHit = g; this.onDsq(); return; }
    }
  },
  killDsq() { const g = this.dsqHit; if (g) { g.alive = false; g.respawn = G.clock + 72; } this.dsqHit = null; },
  calmDsq(hours: number) {
    const g = this.dsqHit, p = this.party; if (!g) return;
    g.calm = G.clock + hours;
    const a = Math.atan2(g.y - p.y, g.x - p.x); g.tx = g.x + Math.cos(a) * 200; g.ty = g.y + Math.sin(a) * 200;
    this.dsqHit = null;
  },
  killLoyal() { const g = this.loyalHit; if (g) { g.alive = false; g.respawn = G.clock + 96; } this.loyalHit = null; },
  calmLoyal(hours: number) {
    const g = this.loyalHit, p = this.party; if (!g) return;
    g.calm = G.clock + hours;
    const a = Math.atan2(g.y - p.y, g.x - p.x);
    g.tx = clamp(g.x + Math.cos(a) * 200, 140, OLD_E - 160); g.ty = clamp(g.y + Math.sin(a) * 200, WY0 + 160, NORTH_Y - 60);
    this.loyalHit = null;
  },
  killDemon() { const g = this.demonHit; if (g) { g.alive = false; g.respawn = G.clock + 72; } this.demonHit = null; },
  calmDemon(hours: number) { const g = this.demonHit; if (g) { g.calm = G.clock + hours; for (let k = 0; k < 12; k++) { g.a += 0.6; const q = lakeRing(g.a, 1.08); if (demonOk(q)) { g.tx = q.x; g.ty = q.y; break; } } } this.demonHit = null; },

  killHungry() { const g = this.hungryHit; if (g) { g.alive = false; g.respawn = G.clock + 36; } this.hungryHit = null; },
  calmHungry(hours: number) {
    const g = this.hungryHit, p = this.party; if (!g) return;
    g.calm = G.clock + hours;
    const a = Math.atan2(g.y - p.y, g.x - p.x);
    g.tx = clamp(g.x + Math.cos(a) * 220, 220, 1630); g.ty = clamp(g.y + Math.sin(a) * 220, 140, SOUTH_Y - 140);
    this.hungryHit = null;
  },

  /** Мертвецы бредут по фронту; заметив отряд, идут на него, но за пределы фронта не выходят. */
  updateDead(dt: number) {
    const p = this.party, hours = dt * HOURS_PER_SEC;
    for (const g of this.dead) {
      if (g.alive && this.inClash(g)) { g.seen = dist(g, p) < 320 * Weather.sightK(); continue; }
      if (!g.alive) {
        // павшие снова поднимаются — через двое суток, подальше от отряда (в море траншей — новая группа в новом месте)
        if (G.clock >= g.respawn) {
          if (g.hell) { const q = hellSpot(p); if (q) { g.alive = true; g.kinds = hellDeadRoll(); g.x = g.tx = q.x; g.y = g.ty = q.y; g.calm = 0; } continue; }
          const s0 = DEAD_START.find((d) => d[0] === g.id)!;
          if (dist({ x: s0[2], y: s0[3] }, p) > 400) { g.alive = true; g.x = g.tx = s0[2]; g.y = g.ty = s0[3]; }
        }
        continue;
      }
      const zone = g.hell ? hellWild : inFront;
      const d = dist(g, p);
      g.seen = d < 320;
      const chase = !Debug.invisible && d < 190 && G.clock >= g.calm && zone(p);
      if (chase) { g.tx = p.x; g.ty = p.y; }
      else if (dist(g, { x: g.tx, y: g.ty }) < 4) {
        for (let k = 0; k < 8; k++) {
          const a = Math.random() * TAU, t = { x: g.x + Math.cos(a) * 160, y: g.y + Math.sin(a) * 160 };
          if (zone(t)) { g.tx = t.x; g.ty = t.y; break; }
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
    // противогаз защищает того, на ком он надет (слот «Лицо»), пока есть фильтры
    const masked = (b: UnitBase) => !!b.equip?.face && itemOf(b.equip.face).gas && G.supplies.filter > 0;
    const bare = G.squad.filter((b) => !masked(b)), any = bare.length < G.squad.length;
    if (inside && !this.inGas) this.onGas(!bare.length ? 'Едкое облако. Отряд натягивает противогазы.' : any ? `Едкое облако! Противогазы натянуты, но ${bare.map((b) => b.name).join(', ')} без маски — выбирайтесь скорее.` : 'Едкое облако! Без противогазов газ обжигает лёгкие — выбирайтесь скорее.');
    this.inGas = inside;
    if (!inside) return;
    if (any) {
      this.filterUse += hours;
      if (this.filterUse >= 3) { this.filterUse = 0; G.supplies.filter--; this.onGas(`Фильтр противогаза отработал (осталось ${G.supplies.filter}).`); }
    }
    if (!bare.length) return;
    this.gasDose += hours;
    while (this.gasDose >= 1) {
      this.gasDose -= 1;
      let poisoned = false;
      for (const b of bare) { b.hp = Math.max(1, b.hp - 2); if (addWoundId(b, 'gassed')) poisoned = true; }
      const msg = poisoned ? 'Отравление газом: кашель, резь в глазах (−2 ОЗ, −1 к атакам до привала).' : 'Газ жжёт лёгкие: −2 ОЗ.';
      this.onGas(any ? `${bare.map((b) => b.name).join(', ')}: ${msg[0].toLowerCase()}${msg.slice(1)}` : msg);
    }
  },
  inCloud(q: Pt) { return this.clouds.some((cl) => dist(cl, q) < cl.r * 0.8); },

  killDead() { const g = this.deadHit; if (g) { g.alive = false; g.respawn = G.clock + 48; } },
  /** Оторвались от мертвецов: они на время теряют след и бредут прочь. */
  calmDead(hours: number) {
    const g = this.deadHit, p = this.party; if (!g) return;
    g.calm = G.clock + hours;
    const a = Math.atan2(g.y - p.y, g.x - p.x);
    if (g.hell) { g.tx = clamp(g.x + Math.cos(a) * 200, HELL_X + 80, WW - 60); g.ty = clamp(g.y + Math.sin(a) * 200, 80, WH - 80); return; }
    g.tx = clamp(g.x + Math.cos(a) * 200, FRONT_W0 + 60, FRONT_X - 40); g.ty = clamp(g.y + Math.sin(a) * 200, 100, SOUTH_Y - 100);
  },

  /** После откупа или удачного бегства банда на время отстаёт. */
  calmBand(hours: number) { const b = this.bandHit; if (b) b.calm = G.clock + hours; this.bandHit = null; },
  killBand() { const b = this.bandHit; if (b) { b.alive = false; b.respawn = G.clock + 60; } this.bandHit = null; },

  // ========================================================== обзорная карта (окно по M)
  /** Весь регион целиком: фон, найденные места, подписи, где сейчас отряд. hover — точка под мышью (в пикселях холста). */
  /** Вид обзорной карты: центр (координаты мира) и масштаб (1 — весь регион в окне). Двигается и масштабируется в окне карты. */
  overviewFit(cw: number, ch: number) { return this.bg ? Math.min(cw / this.bg.width, ch / this.bg.height) : 1; },
  clampView(v: { cx: number; cy: number; z: number }, cw: number, ch: number) {
    v.z = clamp(v.z, 1, 8);
    const k = this.overviewFit(cw, ch) * v.z, hw = cw / k, hh = ch / k; // видимая часть — в пикселях фона (мир / 2)
    const bx = clamp(v.cx / 2 + OX, hw / 2, Math.max(hw / 2, BW - hw / 2)), by = clamp(v.cy / 2 + OY, hh / 2, Math.max(hh / 2, BH - hh / 2));
    v.cx = (bx - OX) * 2; v.cy = (by - OY) * 2;
    if (BW * k <= cw) v.cx = (BW / 2 - OX) * 2;
    if (BH * k <= ch) v.cy = (BH / 2 - OY) * 2;
  },
  drawOverview(c: CanvasRenderingContext2D, cw: number, ch: number, t: number, hover: Pt | null, view: { cx: number; cy: number; z: number }) {
    if (!this.bg) return null;
    const bg = this.bg, k = this.overviewFit(cw, ch) * view.z, dw = bg.width * k, dh = bg.height * k;
    const ox = cw / 2 - (view.cx / 2 + OX) * k, oy = ch / 2 - (view.cy / 2 + OY) * k;
    const X = (wx: number) => ox + (wx / 2 + OX) * k, Y = (wy: number) => oy + (wy / 2 + OY) * k;
    c.fillStyle = '#0d130c'; c.fillRect(0, 0, cw, ch);
    c.imageSmoothingEnabled = k < 1; c.imageSmoothingQuality = 'high'; // крупно — чёткие пиксели, мелко — сглаживание
    c.drawImage(bg, ox, oy, dw, dh);
    c.fillStyle = 'rgba(20,26,16,0.2)'; c.fillRect(ox, oy, dw, dh); // приглушить, как под светом Ока
    // подпись не вылезает за край холста
    const text = (str: string, x: number, y: number, col: string) => {
      if (x < -10 || x > cw + 10 || y < -10 || y > ch + 20) return; // место за краем окна — без подписи
      const half = c.measureText(str).width / 2 + 4, tx = clamp(x, half, cw - half);
      c.fillStyle = 'rgba(0,0,0,0.9)'; c.fillText(str, tx + 1, y + 1); c.fillStyle = col; c.fillText(str, tx, y);
    };
    for (const l of LOCS) { const ic = POI_ICONS.get(l.id); if (ic && this.known(l)) c.drawImage(ic.cv, ox + (ic.ox + OX) * k, oy + (ic.oy + OY) * k, ic.cv.width * k, ic.cv.height * k); }
    // земли — крупными бледными буквами
    c.textAlign = 'center';
    c.font = `italic ${Math.round(ch * 0.034)}px "Old Standard TT", serif`;
    for (const [name, wx, wy] of [['Земли Олдриджа', 1000, 1120], ['Старый фронт', -390, 1080], ['Земли Леди Харрингтон', -1700, 1150], ['Северные леса — земли Собрания', 700, -1110], ['Земли барона Винферда', 400, 1420], ['Траншейное море', 3000, 900]] as [string, number, number][])
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
    // стычки: вспышки выстрелов между сторонами
    for (const c of this.clashes) {
      if (!c.met) continue;
      const sx = X(c.x), sy = Y(c.y), on = Math.floor(t * 9 + c.seed);
      for (let k = 0; k < 4; k++) { const a = c.seed + k * 1.7 + on * 0.9; if ((on + k) % 3 === 0) { ppx(lc, sx + Math.cos(a) * 9, sy - 6 + Math.sin(a) * 4, '#ffd070'); ppx(lc, sx + Math.cos(a) * 9 + 1, sy - 6 + Math.sin(a) * 4, '#ff9040'); } }
    }
    // банда
    for (const b of this.bands) {
      if (!b.alive || !b.seen) continue;
      const bm = dist(b, { x: b.tx, y: b.ty }) > 1;
      b.kinds.forEach((k, i) => mini(k, X(b.x) + (i - (b.kinds.length - 1) / 2) * 7, Y(b.y) + (i % 2) * 3, b.tx < b.x, fr(bm, i * 1.3)));
    }
    const pm0 = p.moving || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].some((kk) => G.keys.has(kk));
    // морские демоны — ползут вдоль берега
    for (const g of this.demons) {
      if (!g.alive || !g.seen) continue;
      const sp = miniSprite('salamander', pm0 ? Math.floor(t * 4) % 4 : 0), fl = g.tx < g.x, dx = Math.round(X(g.x) - 7), dy = Math.round(Y(g.y) - 17);
      pshadow(lc, Math.round(X(g.x)), Math.round(Y(g.y)), 9, 2);
      if (fl) { lc.save(); lc.translate(dx * 2 + 14, 0); lc.scale(-1, 1); lc.drawImage(sp, dx, dy); lc.restore(); } else lc.drawImage(sp, dx, dy);
    }
    // демоны — бес, рогатый, гончая
    for (const g of this.dsq) {
      if (!g.alive || !g.seen) continue;
      const fl = g.tx < g.x;
      g.kinds.forEach((k, i) => mini(k, X(g.x) + (i - 1) * 8, Y(g.y) + (i % 2) * 3, fl, fr(pm0, i * 0.9)));
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
      if (pt.owner === 'wfcar') { // бронемашина Винферда
        pshadow(lc, X(pos.x), Y(pos.y) + 1, 11, 2);
        armoredCar(lc, X(pos.x) - 11, Y(pos.y) - 11, fl, true);
        continue;
      }
      const off = pt.off ?? { x: 0, y: 0 }; // в погоне патруль сошёл с дороги — рисуем там, где он есть
      for (let k = 2; k >= 0; k--) {
        const q0 = polyAt(pt.path, clamp(pt.s + back * k * 9, 0, pt.len)), q = { x: q0.x + off.x, y: q0.y + off.y };
        mini(pt.owner === 'winford' ? (k === 0 ? 'wfofficer' : 'wfguard') : pt.owner === 'baroness' ? 'bguard' : pt.owner === 'revo' ? (k === 0 ? 'brother_off' : k === 1 ? 'brother' : 'brother2') : 'guard', X(q.x), Y(q.y), fl, fr(walk, k * 1.3));
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
      if (l.kind === 'village' && this.known(l)) L(l.x, l.y, l.id === 'einbow' ? 30 : 48, l.id === 'einbow' ? 0.3 : 0.55, l.id === 'fenmor' ? '#a8f070' : l.id === 'einbow' ? '#c86a40' : l.id === 'coven' ? '#9adf50' : l.id === 'volnitsa' ? '#e08a40' : '#f0c070');
      if (l.kind === 'fort') L(l.x, l.y - 30, 100, 0.6, '#e8d090');
    }
    L(fl.x, fl.y - 30, 80, 0.7 + Math.sin(t * 9) * 0.08, '#ff9a40');
    { const lamp = lampLevel(); L(p.x, p.y, [58, 84, 112][lamp], [0.55, 0.65, 0.75][lamp], lamp === 2 ? '#e8ecd8' : '#d8c890'); } // фонарь отряда
    for (const pt of this.patrols) { const q = this.patrolPos(pt); L(q.x, q.y - 8, pt.owner === 'wfcar' ? 46 : 34, 0.5, '#f0d090'); } // фонарь патруля, фары бронемашины
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
    // подписи отрядов: если место занято другой подписью — поднимаем выше, чтобы не наползали друг на друга
    const placed: { x0: number; x1: number; y: number }[] = [];
    const tag = (lbl: string, x: number, y: number, col: string) => {
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      const w = c.measureText(lbl).width / 2 + 4;
      for (let k = 0; k < 6 && placed.some((r) => x - w < r.x1 && x + w > r.x0 && Math.abs(y - r.y) < 14); k++) y -= 15;
      placed.push({ x0: x - w, x1: x + w, y });
      c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText(lbl, x + 1, y + 1); c.fillStyle = col; c.fillText(lbl, x, y);
    };
    for (const b of this.bands) {
      if (!b.alive || !b.seen) continue;
      const who = b.fac === 'deserter' ? 'Дезертиры' : 'Бандиты', ch = this.clashes.find((c) => c.a.ref === b || c.b.ref === b);
      if (ch?.met) continue; // в перестрелке — подпись у стычки
      const lbl = ch ? (ch.b.ref === b ? (strength(ch.b.units) >= strength(ch.a.units) * 0.8 ? `${who} — принимают бой` : `${who} — уходят от погони`) : `${who} — в погоне`) : G.clock < b.calm ? `${who} (отстали)` : dist(b, p) < 250 ? `${who} — преследуют!` : who;
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      tag(lbl, b.x - cx, b.y - cy - 40, '#e07060');
      c.textAlign = 'left';
    }
    for (const g of this.demons) {
      if (!g.alive || !g.seen) continue;
      const lbl = G.clock < g.calm ? 'Морской демон (ушёл в воду)' : dist(g, p) < 160 && nearLake(p) ? 'Морской демон — идёт к вам!' : 'Морской демон';
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      tag(lbl, g.x - cx, g.y - cy - 34, '#9ac8a0');
      c.textAlign = 'left';
    }
    for (const g of this.dsq) {
      if (!g.alive || !g.seen) continue;
      if (this.clashes.some((c) => c.met && c.b.ref === g)) continue; // в стычке — подпись у стычки
      const who = g.hell ? 'Культ' : 'Демоны';
      const lbl = G.clock < g.calm ? `${who} (отстали)` : dist(g, p) < 170 && (g.hell ? hellWild(p) : nearCoven(p, COVEN_R + 120)) ? `${who} — идут на вас!` : who;
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      tag(lbl, g.x - cx, g.y - cy - 40, '#e08a60');
      c.textAlign = 'left';
    }
    for (const g of this.loyal) {
      if (!g.alive || !g.seen) continue;
      const chl = this.clashes.find((c) => c.b.ref === g);
      if (chl?.met) continue;
      const lbl = chl ? 'Лоялисты — уходят от погони' : G.clock < g.calm ? 'Лоялисты (скрылись)' : dist(g, p) < 150 && !onRoad(p) ? 'Лоялисты — выходят к вам' : 'Лоялисты';
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      tag(lbl, g.x - cx, g.y - cy - 40, '#a8b0d0');
      c.textAlign = 'left';
    }
    for (const g of this.hungry) {
      if (!g.alive || !g.seen) continue;
      const chg = this.clashes.find((c) => c.b.ref === g);
      if (chg?.met) continue;
      const lbl = chg ? 'Голодные бандиты — бегут' : G.clock < g.calm ? 'Голодные бандиты (ушли)' : g.chasing ? 'Голодные бандиты — идут к вам' : 'Голодные бандиты';
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      tag(lbl, g.x - cx, g.y - cy - 40, '#c8a878');
      c.textAlign = 'left';
    }
    for (const g of this.dead) {
      if (!g.alive || !g.seen || this.clashes.some((cl) => cl.met && cl.a.ref === g)) continue; // в стычке — подпись у стычки
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      tag(G.clock < g.calm ? 'Мертвецы (потеряли след)' : dist(g, p) < 190 && (g.hell ? hellWild(p) : inFront(p)) ? 'Мертвецы — идут на вас!' : 'Мертвецы', g.x - cx, g.y - cy - 40, '#a8d070');
      c.textAlign = 'left';
    }
    this.patrols.forEach((pt, i) => {
      const q = this.patrolPos(pt), sx = q.x - cx, sy = q.y - cy;
      if (sx < -60 || sx > VW + 60 || sy < -40 || sy > VH + 60) return;
      if (this.patrols.slice(0, i).some((o) => dist(this.patrolPos(o), q) < 60)) return; // два патруля рядом — одна подпись
      if (this.clashes.some((c) => c.met && c.a.ref === pt)) return; // в стычке — подпись у стычки
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      const lbl = PATROL_NAME[pt.owner];
      const ly = sy - (pt.owner === 'wfcar' ? 28 : 40);
      tag(lbl, sx, ly, pt.owner === 'baroness' ? '#d8a0a0' : pt.owner === 'revo' ? '#e07a68' : pt.owner === 'winford' || pt.owner === 'wfcar' ? '#a8c0e0' : '#d8c080');
      c.textAlign = 'left';
    });
    for (const cl of this.clashes) { // подпись стычки
      if (!cl.met) continue;
      const sx = cl.x - cx, sy = cl.y - cy;
      if (sx < -80 || sx > VW + 80 || sy < -40 || sy > VH + 60 || dist(cl, p) > 420) continue;
      const lbl = `Стычка: ${cl.a.name} — ${cl.b.name}`;
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      tag(lbl, sx, sy - 56, '#f0a060'); c.textAlign = 'left';
    }
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
  c.fillStyle = '#2a2e26'; c.fillRect(WX0, WY0, HELL_X - WX0, -WY0);
  c.fillStyle = '#3a3630'; c.fillRect(OLD_E, WY0, WW - OLD_E, -WY0); // восточнее Олдриджа на севере — скальное подножие гор
  { const g = c.createLinearGradient(0, -80, 0, 60); g.addColorStop(0, 'rgba(42,46,38,1)'); g.addColorStop(1, 'rgba(74,74,66,0)'); c.fillStyle = g; c.fillRect(WX0, -80, WW - WX0, 140); }
  for (let i = 0; i < 1300; i++) {
    const x = WX0 + r() * (OLD_E - WX0), y = r() * SOUTH_Y, rr = 30 + r() * 110;
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
    const x = FRONT_W0 + 20 + r() * (FRONT_X - FRONT_W0), y = 60 + r() * (SOUTH_Y - 120), rr = 20 + r() * 60;
    c.fillStyle = r() < 0.6 ? 'rgba(40,33,24,0.28)' : 'rgba(96,88,70,0.18)';
    c.beginPath(); c.ellipse(x, y, rr, rr * 0.6, r() * 3, 0, TAU); c.fill();
  }
  for (let i = 0; i < 14; i++) {
    const x = FRONT_W0 + 80 + r() * (FRONT_X - FRONT_W0 - 120), y = 120 + r() * (SOUTH_Y - 240), rr = 60 + r() * 90;
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, 'rgba(110,150,60,0.22)'); g.addColorStop(1, 'rgba(110,150,60,0)');
    c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  { // юг — земли Винферда: та же серая пустошь, нефтяные пятна у нефтяников, тёмные предгорья
    const rs = seeded(2717);
    for (let i = 0; i < 700; i++) {
      const x = WX0 + rs() * (HELL_X - WX0), y = SOUTH_Y + rs() * (WH - SOUTH_Y), rr = 30 + rs() * 110;
      const g = c.createRadialGradient(x, y, 0, x, y, rr), v = rs() < 0.5 ? '30,30,26' : '110,108,96';
      g.addColorStop(0, `rgba(${v},${0.06 + rs() * 0.08})`); g.addColorStop(1, `rgba(${v},0)`); c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    for (let i = 0; i < 70; i++) { c.fillStyle = 'rgba(16,15,12,0.55)'; c.beginPath(); c.ellipse(560 + rs() * 820, 1580 + rs() * 420, 8 + rs() * 22, 4 + rs() * 9, rs() * 3, 0, TAU); c.fill(); }
    const g2 = c.createLinearGradient(0, 2180, 0, WH); g2.addColorStop(0, 'rgba(40,38,34,0)'); g2.addColorStop(1, 'rgba(40,38,34,0.7)'); c.fillStyle = g2; c.fillRect(WX0, 2180, WW - WX0, WH - 2180);
  }
  { // Траншейное море: бурая перепаханная земля, ядовитая дымка; к западу — резкий край
    c.fillStyle = '#3a3226'; c.fillRect(HELL_X, WY0, WW - HELL_X, WH - WY0);
    const rh = seeded(6061);
    for (let i = 0; i < 1400 * (WW - HELL_X) / 920; i++) {
      const x = HELL_X + rh() * (WW - HELL_X), y = WY0 + rh() * (WH - WY0), rr = 20 + rh() * 70;
      c.fillStyle = rh() < 0.6 ? 'rgba(24,20,14,0.35)' : 'rgba(100,90,66,0.22)';
      c.beginPath(); c.ellipse(x, y, rr, rr * 0.6, rh() * 3, 0, TAU); c.fill();
    }
    for (let i = 0; i < 40 * (WW - HELL_X) / 920; i++) {
      const x = HELL_X + 80 + rh() * (WW - HELL_X - 80), y = WY0 + rh() * (WH - WY0), rr = 80 + rh() * 120, g = c.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, 'rgba(120,150,60,0.18)'); g.addColorStop(1, 'rgba(120,150,60,0)'); c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
  }
  { // пятна подлеска, сырости и тени под кронами
    const rn = seeded(911);
    for (let i = 0; i < 900; i++) {
      const x = WX0 + rn() * (OLD_E - WX0), y = WY0 + rn() * (-WY0 + 30), rr = 30 + rn() * 100;
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
    let x = -OX + r() * BW, y = r() * (SOUTH_Y / 2);
    for (let k = 0; k < 3; k++) { const nx = x + (r() - 0.5) * 14, ny = y + (r() - 0.5) * 14; pline(c, x, y, nx, ny, '#34342e'); x = nx; y = ny; }
  }
  // сухое русло
  const bed: number[][] = [];
  for (let i = 0; i <= 64; i++) { const x = (i / 64) * (OLD_E / 2); bed.push([x, 180 + Math.sin(i * 0.31) * 22 + i * 1.7 + Math.sin(i * 0.9) * 4]); }
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
  { // юг: обширные нефтяные поля Винферда, мёртвые деревья, горы на самом юге
    const rs = seeded(3303);
    for (let i = 0; i < 46; i++) { const x = 560 + rs() * 820, y = 1580 + rs() * 420; if (LOCS.some((l) => dist(l, { x, y }) < 70)) continue; derrick(Math.round(x / 2), Math.round(y / 2)); }
    for (let i = 0; i < 60; i++) { const x = WX0 + 300 + rs() * (HELL_X - WX0 - 400), y = SOUTH_Y + 80 + rs() * 850; if (LOCS.some((l) => dist(l, { x, y }) < 90) || (x > 520 && x < 1400 && y > 1560 && y < 2020)) continue; tree(Math.round(x / 2), Math.round(y / 2)); }
    drawMountains(c, rs);
  }
  // старый фронт: траншеи, проволока, воронки, остовы техники
  drawWarZone(c, r, thick);
  // Траншейное море на востоке
  drawHell(c, thick);
  // земли Леди Харрингтон: озеро и реки (дороги и рельсы ложатся поверх — мосты и броды)
  drawWater(c, r, thick);
  // север: густой лес бывших земель барона Сильвера
  drawForest(c);
  // северо-восток: высокий горный массив до самого Траншейного моря
  drawPeaks(c);
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
  // ветка к форту Винферда — тоже двухпутная
  thick(pts(WF_RAIL), '#2a2620', 13); track(offsetPoly(WF_RAIL, -TRACK_GAP)); track(offsetPoly(WF_RAIL, TRACK_GAP));
  // новая ветка к нефтяникам: готовый участок — рельсы, дальше — голая насыпь, штабеля шпал, кое-где первые шпалы
  thick(pts(WF_NEW_DONE), '#2a2620', 6); track(WF_NEW_DONE);
  thick(pts(WF_NEW_BED), '#3a3428', 6); thick(pts(WF_NEW_BED), '#5a5040', 3);
  { const bed = pts(WF_NEW_BED), rs = seeded(4417);
    for (let i = 1; i < bed.length; i++) { const [x0, y0] = bed[i - 1], [x1, y1] = bed[i], len = Math.hypot(x1 - x0, y1 - y0);
      for (let k = 0; k < len; k += 9) { const x = x0 + (x1 - x0) * (k / len), y = y0 + (y1 - y0) * (k / len); if (i === 1 && k < 40) pline(c, x - 1, y - 3, x + 1, y + 3, '#4a3a28'); else if (rs() < 0.25) prect(c, Math.round(x + 4), Math.round(y - 5), 3, 2, '#5a4430'); } } }
  // дороги
  for (const rd of ROADS) { const pr = pts(rd); thick(pr, '#26221a', 6); thick(pr, '#6a604a', 4); thick(pr, '#7e7458', 2, [2, 5]); }
  // атмосферные руины — без подписей и событий
  drawRuins(c, r);
  // значки мест
  for (const l of LOCS) {
    if (l.kind !== 'poi' && !l.hidden) { drawLocIcon(c, l, r); continue; }
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
  // вдоль тракта от форта Олдриджа к Винферду: брошенные усадьбы, хутора, целые деревушки
  { kind: 'hamlet', x: 1610, y: 990 },
  { kind: 'tower', x: 1460, y: 1060 },
  { kind: 'deadvillage', x: 1580, y: 1170 },
  { kind: 'wall', x: 1360, y: 1250 },
  { kind: 'farm', x: 1530, y: 1360 },
  { kind: 'deadvillage', x: 1320, y: 1410 },
  { kind: 'chapel', x: 1130, y: 1430 },
  { kind: 'hamlet', x: 1290, y: 1530 },
  { kind: 'deadvillage', x: 1010, y: 1505 },
  { kind: 'wall', x: 860, y: 1570 },
  { kind: 'farm', x: 1090, y: 1640 },
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
      case 'deadvillage': // развалины деревушки: полдюжины домов без крыш, поваленный забор, колодец, засохшее дерево
        stamp(c, x, y + 12, 58, 34, (s) => {
          for (let i = 0; i < 26; i++) ppx(s, 2 + r() * 54, 4 + r() * 28, r() < 0.5 ? '#3a3630' : '#4a443a');
          ruinHut(s, 1, 2, '#544c3c'); ruinHut(s, 16, 0, '#4e4636'); ruinHut(s, 34, 3, '#585040');
          ruinHut(s, 6, 15, '#4e4636'); ruinHut(s, 26, 17, '#544c3c'); ruinHut(s, 44, 16, '#4a4434');
          for (let k = 0; k < 12; k++) if (k % 4 !== 2) prect(s, 2 + k * 4, 31 + (k % 2), 1, 2 - (k % 2), '#4e4030'); // поваленный забор
          prect(s, 20, 27, 4, 3, stoneD); prect(s, 21, 27, 2, 1, '#0c0c0a'); prect(s, 22, 21, 1, 6, '#3a2c1e'); pline(s, 22, 21, 27, 24, '#3a2c1e'); // колодец с журавлём
          prect(s, 52, 26, 1, 6, '#1c1a15'); ppx(s, 51, 27, '#1c1a15'); ppx(s, 53, 28, '#1c1a15');                                                // засохшее дерево
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
function armoredCar(s: CanvasRenderingContext2D, x: number, y: number, flip = false, fresh = false) {
  const X = (v: number) => (flip ? x + 22 - v : x + v);
  const R = (a: number, b: number, w: number, h: number, col: string) => prect(s, flip ? x + 22 - a - w + 1 : x + a, y + b, w, h, col);
  if (fresh) { // исправная машина Винферда: тёмно-синяя краска, фара
    R(1, 4, 20, 6, '#2e3a4e'); R(1, 4, 20, 1, '#4a5a72'); R(17, 5, 4, 3, '#26303e'); R(7, 1, 7, 3, '#26303e'); R(7, 1, 7, 1, '#4a5a72'); R(14, 2, 4, 1, '#1a1e24');
    for (const k of [3, 7, 11, 15, 19]) ppx(s, X(k), y + 6, '#c8a050');
    R(4, 7, 3, 1, '#0c0c0a'); R(12, 7, 3, 1, '#0c0c0a'); R(21, 5, 1, 1, '#f0e0a0');
    for (const wx of [5, 17]) { pellipse(s, X(wx), y + 11, 2, 2, '#141210'); ppx(s, X(wx), y + 11, '#8a8a80'); }
    return;
  }
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
    for (let x = WX0 / 2 + (y % 10 ? 0 : 3); x < HELL_X / 2; x += 5) {
      const tx = Math.round(x + (r() - 0.5) * 3), ty = Math.round(y + (r() - 0.5) * 3);
      const q = { x: tx * 2, y: ty * 2 };
      // поляны — по плавному шуму
      const glade = Math.sin(q.x * 0.011 + 1.3) * Math.sin(q.y * 0.013 + 0.4) + Math.sin(q.x * 0.004 - q.y * 0.006) * 0.6;
      if (r() > edge * (glade > 0.75 ? 0.25 : 0.9)) continue;
      if (near(q) || peaksAt(q, 14)) continue; // у подножия гор лес кончается
      const k = r();
      if (k < 0.66) fir(tx, ty, 5 + Math.floor(r() * 4));
      else if (k < 0.97) leafy(tx, ty);
      else dead(tx, ty);
    }
  }
}

/** Высокий горный массив на северо-востоке: скальное подножие, пики внахлёст, снег на вершинах. */
function drawPeaks(c: CanvasRenderingContext2D) {
  const r = seeded(4471), X0 = Math.floor(OLD_E / 2), X1 = Math.ceil(WW / 2), Y0 = WY0 / 2;
  // подножие: тёмный камень, осыпь по контуру
  for (let x = X0; x < X1; x++) for (let y = Y0; y < 30; y++) {
    const q = { x: x * 2, y: y * 2 };
    if (!peaksAt(q)) continue;
    ppx(c, x, y, !peaksAt(q, -10) ? (r() < 0.5 ? '#4e4a40' : '#403c34') : (r() < 0.1 ? '#3a362f' : '#2e2b26'));
  }
  // пики — только внутри массива (не залезают ни в лес, ни в Траншейное море); дальние — выше, ближние перекрывают
  c.save(); c.beginPath(); c.rect(X0, Y0, X1 - X0, 30 - Y0); c.clip();
  const peaks: [number, number, number, number][] = [];
  for (let y = Y0 + 16; y < 30; y += 6 + r() * 5) for (let x = X0 + 6 + r() * 8; x < X1; x += 7 + r() * 9) {
    const h = 12 + r() * r() * 30, w = h * (0.8 + r() * 0.35);
    if (!peaksAt({ x: (x - w) * 2, y: y * 2 }, -6) || !peaksAt({ x: x * 2, y: y * 2 }, -16)) continue;
    peaks.push([x, y, h, w]);
  }
  peaks.sort((a, b) => a[1] - b[1]);
  for (const [px, py, h, w] of peaks) {
    const snow = h > 24 ? h * 0.22 : h > 18 ? h * 0.1 : 0, X = Math.round(px);
    for (let k = 0; k < h; k++) {
      const half = Math.round((k / h) * w), y = Math.round(py - h + k), sn = k < snow;
      prect(c, X - half, y, half, 1, sn ? '#a8a8a0' : k % 3 ? '#5a564c' : '#646054');
      prect(c, X, y, half + 1, 1, sn ? '#76787a' : k % 3 ? '#34302a' : '#3c3830');
    }
    // гребень: светлая кромка по левому склону
    for (let k = 1; k < h; k += 2) ppx(c, X - Math.round((k / h) * w), Math.round(py - h + k), k < snow ? '#c8c8c0' : '#78736a');
    ppx(c, X, Math.round(py - h), snow ? '#d0d0c8' : '#8a857a');
  }
  c.restore();
}

/** Горы на юге земель Винферда: гряда тёмных скал со светлыми гранями. */
function drawMountains(c: CanvasRenderingContext2D, r: () => number) {
  const peaks: [number, number, number][] = [];
  for (let row = 0; row < 3; row++) for (let x = WX0 / 2 + 40 + row * 9; x < HELL_X / 2 - 40; x += 12 + r() * 16) peaks.push([x, WH / 2 - 40 - row * 22 - r() * 20, 22 + r() * 22 - row * 4]);
  peaks.sort((a, b) => a[1] - b[1]);
  for (const [px, py, h] of peaks) {
    if (Math.abs(px * 2 - 300) < 120 && (py - h) * 2 < 2420) continue; // проход к Айронклиффу
    const w = h * 1.3;
    for (let k = 0; k < h; k++) {
      const half = Math.round((k / h) * w), y = Math.round(py - h + k);
      prect(c, Math.round(px - half), y, half, 1, k % 3 ? '#6a665a' : '#76716a');
      prect(c, Math.round(px), y, half, 1, k % 3 ? '#3e3a34' : '#46423a');
    }
    ppx(c, Math.round(px), Math.round(py - h), '#a8a296'); prect(c, Math.round(px - 1), Math.round(py - h + 1), 2, 1, '#8a857a');
  }
}

/** Траншейное море: воронка на воронке, джунгли траншей во все стороны, проволока, остовы, кресты. */
function drawHell(c: CanvasRenderingContext2D, thick: Thick) {
  const r = seeded(7333), X0 = HELL_X / 2, X1 = WW / 2, Y0 = WY0 / 2, Y1 = WH / 2;
  const kk = (X1 - X0) / 460; // плотность — как на прежней ширине моря
  // рваный край: земля обрывается — гребень бруствера и осыпь вдоль всей границы
  for (let y = Y0; y < Y1; y++) {
    const x = X0 + Math.round(Math.sin(y / 9) * 3 + Math.sin(y / 31) * 6 + (r() - 0.5) * 3);
    prect(c, x - 2, y, 3, 1, '#6a5c44'); ppx(c, x + 1, y, '#1a150e'); if (r() < 0.3) ppx(c, x - 4 - Math.floor(r() * 4), y, '#4a4234');
  }
  // воронки внахлёст, гуще, чем на старом фронте
  for (let i = 0; i < 2600 * kk; i++) {
    const x = Math.round(X0 + 6 + r() * (X1 - X0 - 6)), y = Math.round(Y0 + r() * (Y1 - Y0)), sz = 2 + Math.round(r() * r() * 9);
    pellipse(c, x, y + 1, sz + 1, Math.ceil(sz * 0.6) + 1, '#5e5440'); pellipse(c, x, y, sz, Math.ceil(sz * 0.6), '#1c1812');
    if (r() < 0.35) pellipse(c, x, y + 1, Math.max(1, sz - 2), Math.max(1, Math.ceil(sz * 0.3)), r() < 0.5 ? '#2e3a26' : '#3a3a22');
  }
  // джунгли траншей: ломаные во все стороны, с ответвлениями
  for (let i = 0; i < 90 * kk; i++) {
    let x = X0 + 10 + r() * (X1 - X0 - 20), y = Y0 + r() * (Y1 - Y0), a = r() * TAU;
    const pts: number[][] = [[x, y]], n = 6 + Math.floor(r() * 14);
    for (let k = 0; k < n; k++) {
      a += (r() - 0.5) * 1.6; const len = 6 + r() * 12;
      x = clamp(x + Math.cos(a) * len, X0 + 6, X1 - 4); y = clamp(y + Math.sin(a) * len, Y0 + 2, Y1 - 2); pts.push([Math.round(x), Math.round(y)]);
    }
    thick(pts, '#6a5c44', 5); thick(pts, '#120f0a', 3); if (r() < 0.6) thick(pts, '#3a2e1e', 1, [1, 2]);
  }
  // колючая проволока клубками
  for (let i = 0; i < 160 * kk; i++) {
    const x = X0 + 8 + r() * (X1 - X0 - 10), y = Y0 + r() * (Y1 - Y0), len = 6 + r() * 16;
    for (let k = 0; k < len; k++) { const px = x + k, py = y + Math.sin(k * 1.1) * 1.5; if (r() < 0.8) ppx(c, px, py, k % 2 ? '#8a8a80' : '#6e6e66'); if (k % 5 === 0) prect(c, Math.round(px), Math.round(y) - 2, 1, 3, '#3a2c1e'); }
  }
  // обломанные стволы, кресты-могилы, каски на винтовках
  for (let i = 0; i < 220 * kk; i++) {
    const x = Math.round(X0 + 8 + r() * (X1 - X0 - 10)), y = Math.round(Y0 + r() * (Y1 - Y0)), k = r();
    if (k < 0.5) { const h = 2 + Math.round(r() * 3); prect(c, x, y - h, 1, h, '#1c1a15'); ppx(c, x + (r() < 0.5 ? 1 : -1), y - h, '#2c2820'); }
    else if (k < 0.8) { prect(c, x, y - 4, 1, 5, '#4a3a26'); prect(c, x - 1, y - 3, 3, 1, '#4a3a26'); }
    else { prect(c, x, y - 5, 1, 6, '#3a2c1e'); prect(c, x - 1, y - 7, 3, 2, '#4a4e3a'); }
  }
  // остовы бронемашин и пушек — их тут больше, чем на старом фронте
  for (let i = 0; i < 9 * kk; i++) { const x = X0 + 30 + r() * (X1 - X0 - 50), y = Y0 + 20 + r() * (Y1 - Y0 - 40); stamp(c, x, y, 24, 14, (s) => armoredCar(s, 1, 0, r() < 0.5)); }
  for (let i = 0; i < 6 * kk; i++) { // опрокинутые орудия: колесо и ствол
    const x = Math.round(X0 + 30 + r() * (X1 - X0 - 50)), y = Math.round(Y0 + 20 + r() * (Y1 - Y0 - 40));
    pellipse(c, x, y, 3, 3, '#2a2420'); ppx(c, x, y, '#6a5a40'); pline(c, x, y - 1, x + 9, y - 4, '#3a3a36', 2);
  }
}

function drawWarZone(c: CanvasRenderingContext2D, r: () => number, thick: Thick) {
  const X0 = FRONT_W0 / 2 + 10, X1 = FRONT_X / 2, Y0 = 30, Y1 = SOUTH_Y / 2 - 30;
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
    case 'bfort': { // форт Леди Харрингтон: один большой ярус в кольце стен и замок на скале
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
    // ---------------- юг: земли Винферда
    case 'wfort': { // три яруса: торговые ряды и мастерские → театр, школы, дома побогаче → замок барона и знать
      stamp(c, x, y + 40, 116, 96, (s) => {
        const ox = 58, oy = 58, R = 48;
        const walls = pixelize(116, 96, (v) => {
          v.fillStyle = '#4e4a44'; v.beginPath(); v.ellipse(ox, oy, R, R * 0.6, 0, 0, TAU); v.fill();
          v.fillStyle = '#3a3630'; v.beginPath(); v.ellipse(ox, oy, R * 0.84, R * 0.5, 0, 0, TAU); v.fill();
          v.fillStyle = '#5e5a52'; v.beginPath(); v.ellipse(ox, oy - 10, R * 0.56, R * 0.33, 0, 0, TAU); v.fill();
          v.fillStyle = '#46423c'; v.beginPath(); v.ellipse(ox, oy - 11, R * 0.5, R * 0.28, 0, 0, TAU); v.fill();
          v.fillStyle = '#6e6a62'; v.beginPath(); v.ellipse(ox, oy - 22, R * 0.26, R * 0.16, 0, 0, TAU); v.fill();
          for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; v.fillStyle = '#5e5a52'; v.fillRect(ox + Math.cos(a) * R - 3, oy + Math.sin(a) * R * 0.6 - 4, 6, 7); }
        });
        s.drawImage(walls, 0, 0);
        for (let row = 0; row < 3; row++) for (let k = 0; k < 9; k++) { // ярус 1: ровные ряды лавок и домов, много огней
          const hx = 14 + k * 10 + (row % 2) * 4, hy = 66 + row * 6;
          if (Math.hypot((hx - ox) / (R * 0.8), (hy - oy) / (R * 0.47)) > 1) continue;
          prect(s, hx, hy, 8, 4, ['#6a5a44', '#5a4c3a', '#7a6650'][(row + k) % 3]); prect(s, hx, hy, 8, 1, '#3a3e48'); if ((row + k) % 2) ppx(s, hx + 3, hy + 2, '#f0c060');
        }
        prect(s, ox - 16, oy - 12, 14, 8, '#8a8070'); prect(s, ox - 16, oy - 12, 14, 1, '#a89c88'); for (let k = 0; k < 4; k++) prect(s, ox - 15 + k * 4, oy - 10, 1, 6, '#c8bca0'); // театр с колоннами
        pellipse(s, ox - 9, oy - 13, 5, 3, '#4a6a68'); ppx(s, ox - 9, oy - 16, '#c8a050');                                                          // купол театра
        prect(s, ox + 4, oy - 12, 12, 7, '#7a6a56'); prect(s, ox + 4, oy - 12, 12, 1, '#3a3e48'); ppx(s, ox + 7, oy - 9, '#f0c060'); ppx(s, ox + 12, oy - 9, '#f0c060'); // школа
        prect(s, ox - 10, oy - 44, 20, 22, '#7a766c'); for (let k = 0; k < 20; k += 4) prect(s, ox - 10 + k, oy - 47, 2, 3, '#7a766c'); // замок
        for (const tx of [-14, 10]) { prect(s, tx + ox, oy - 50, 5, 28, '#6e6a62'); prect(s, tx + ox - 1, oy - 54, 7, 4, '#2e3a4e'); }
        prect(s, ox - 1, oy - 60, 2, 12, '#3a3428'); prect(s, ox + 1, oy - 60, 7, 4, '#2e4a7a'); ppx(s, ox + 4, oy - 59, '#c8a050');           // синий флаг Винферда
        for (const [wx, wy] of [[-6, -38], [3, -38], [-6, -30], [3, -30]]) prect(s, ox + wx, oy + wy, 2, 3, '#f0d080');
      });
      break;
    }
    case 'greywell': case 'deepfield': { // нефтяники: вышки, резервуары, аккуратные дома
      const big = l.id === 'deepfield';
      stamp(c, x, y + 14, 60, 36, (s) => {
        for (let i = 0; i < 10; i++) pellipse(s, 4 + r() * 52, 20 + r() * 14, 4, 2, '#16140f');
        for (const [dx, dy] of big ? [[2, 0], [14, 2], [26, 0], [50, 3]] : [[4, 2], [46, 0]]) { for (let k = 0; k < 10; k++) { const w = Math.round(3 - k * 0.3); ppx(s, dx + 3 - w, dy + 10 - k, '#1e1c17'); ppx(s, dx + 3 + w, dy + 10 - k, '#1e1c17'); } prect(s, dx + 1, dy + 6, 5, 1, '#1e1c17'); }
        for (const tx of big ? [38] : [16, 28]) { prect(s, tx, 14, 10, 9, '#5a5a54'); prect(s, tx, 14, 2, 9, '#7a7a72'); prect(s, tx, 13, 10, 2, '#6a6a62'); }
        if (big) { prect(s, 18, 16, 14, 8, '#5a3226'); prect(s, 28, 6, 2, 10, '#4a2a1e'); ppx(s, 21, 19, '#e07028'); }
        hut(s, 4, 24, '#3a3e48', '#7a6650', true); hut(s, 18, 25, '#3a3e48', '#7a6650', true); hut(s, 32, 24, '#3a3e48', '#7a6650', true); hut(s, 46, 25, '#3a3e48', '#6a5a44', true);
      });
      break;
    }
    case 'bramley': // жуки на выпасе: большие загоны, сараи
      stamp(c, x, y + 18, 62, 38, (s) => {
        const pen = (px: number, py: number, w: number) => {
          prect(s, px, py, w, 11, '#3a3428'); prect(s, px + 1, py + 1, w - 2, 9, '#4e4636');
          for (let k = 0; k < w; k += 3) { prect(s, px + k, py - 2, 1, 2, '#5a4a32'); ppx(s, px + k, py + 11, '#5a4a32'); }
          for (let k = 0; k < w / 8; k++) { prect(s, px + 3 + k * 8, py + 3 + (k % 2) * 3, 5, 3, '#7a4a26'); ppx(s, px + 3 + k * 8, py + 3 + (k % 2) * 3, '#a06a3a'); }
        };
        pen(1, 3, 28); pen(33, 4, 28);
        hut(s, 4, 22, '#4e3e30', '#7a6650', true); hut(s, 18, 24, '#4e3e30', '#6a5a44', true); prect(s, 32, 26, 16, 8, '#5a4a32'); prect(s, 32, 25, 16, 1, '#3a2c1e'); hut(s, 50, 22, '#4e3e30', '#7a6650', true);
      });
      break;
    case 'willowbrook': // у реки: мостки, лодки, сушильни с рыбой, грибные погреба
      stamp(c, x, y + 14, 56, 34, (s) => {
        for (const [bx, by] of [[30, 8], [33, 12]]) { prect(s, bx, by, 7, 1, '#5a4630'); }
        pellipse(s, 41, 9, 3, 1, '#3a2a1c'); pellipse(s, 42, 14, 3, 1, '#3a2a1c');
        for (let i = 0; i < 6; i++) { prect(s, 4 + i * 4, 4, 1, 4, '#5a4a32'); ppx(s, 5 + i * 4, 5, '#8a9a9a'); }
        for (let i = 0; i < 6; i++) { const mx = 4 + (i % 3) * 6, my = 26 + Math.floor(i / 3) * 4; prect(s, mx + 1, my + 1, 1, 2, '#c8c0a0'); prect(s, mx, my, 3, 1, '#9ad078'); }
        hut(s, 4, 12, '#3a4648', '#6a5a44', true); hut(s, 17, 14, '#3a4648', '#6a5a44', true); hut(s, 22, 22, '#2e3a24', '#5a4c3a', true); hut(s, 44, 20, '#3a4648', '#6a5a44', true);
      });
      break;
    case 'ironcliff': // горняки: копёр над шахтой, отвалы, бараки
      stamp(c, x, y + 12, 56, 36, (s) => {
        pellipse(s, 14, 26, 12, 5, '#3a3630'); pellipse(s, 42, 28, 10, 4, '#4a3e30');
        prect(s, 24, 4, 2, 18, '#2a2620'); prect(s, 32, 4, 2, 18, '#2a2620'); prect(s, 24, 4, 10, 2, '#2a2620'); pellipse(s, 29, 4, 3, 3, '#4a4a44'); ppx(s, 29, 4, '#8a8a80'); // копёр
        prect(s, 26, 18, 6, 4, '#0c0c0a');
        hut(s, 2, 12, '#3a3a40', '#5a4c3a', true); hut(s, 40, 12, '#3a3a40', '#5a4c3a', true); hut(s, 44, 22, '#3a3a40', '#5a4c3a', false);
        for (let i = 0; i < 4; i++) prect(s, 8 + i * 4, 30, 3, 2, '#7a4a2a');
      });
      break;
    case 'limbridge': // беженцы: палатки, лачуги, костры — и контора по расселению
      stamp(c, x, y + 12, 58, 32, (s) => {
        for (let i = 0; i < 14; i++) { const tx = 2 + (i % 7) * 8 + (Math.floor(i / 7) % 2) * 3, ty = 8 + Math.floor(i / 7) * 10; for (let k = 0; k < 4; k++) prect(s, tx + k, ty + 4 - k, 7 - k * 2, 1, ['#8a8270', '#6a6656', '#7a6a5a'][i % 3]); ppx(s, tx + 3, ty + 4, '#1a1612'); }
        prect(s, 40, 22, 14, 8, '#6a5e50'); prect(s, 40, 21, 14, 1, '#3a3e48'); ppx(s, 44, 25, '#f0c060'); ppx(s, 50, 25, '#f0c060'); prect(s, 46, 15, 1, 6, '#3a3428'); prect(s, 47, 15, 4, 3, '#2e4a7a');
        for (const [fx, fy] of [[12, 26], [28, 28]]) { ppx(s, fx, fy, '#f0a040'); ppx(s, fx, fy - 1, '#f8d070'); }
        for (let i = 0; i < 6; i++) ppx(s, 30 + i * 2, 30, '#c8b8a0'); // очередь к конторе
      });
      break;
    case 'railworks': // стройка: насыпь, штабель шпал, тачки, будка десятника
      stamp(c, x, y + 6, 34, 18, (s) => {
        prect(s, 0, 10, 34, 4, '#5a5040'); prect(s, 0, 9, 34, 1, '#3a3428');
        for (let k = 0; k < 4; k++) prect(s, 2 + k * 4, 9, 2, 5, '#4a3a28');
        for (let k = 0; k < 3; k++) prect(s, 20, 3 + k * 2, 10, 2, k % 2 ? '#6a5236' : '#5a4430');
        prect(s, 4, 2, 7, 6, '#4a4234'); prect(s, 4, 1, 7, 1, '#2e2a22'); ppx(s, 6, 4, '#e0a050');
        prect(s, 14, 6, 1, 3, '#d8c8a0'); ppx(s, 14, 5, '#c8a888'); prect(s, 17, 7, 1, 2, '#d8c8a0');
      });
      break;
    case 'wfcustoms': case 'wfcustoms2': // пограничная контора: будка, шлагбаум, синий флаг
      stamp(c, x, y + 6, 26, 22, (s) => {
        prect(s, 2, 12, 9, 7, '#5a5448'); prect(s, 2, 11, 9, 1, '#2e3a4e'); prect(s, 4, 14, 2, 2, '#e0a050');
        prect(s, 11, 15, 1, 4, '#3a3428'); for (let k = 0; k < 13; k++) ppx(s, 12 + k, 15, k % 4 < 2 ? '#d8d0c0' : '#2e4a7a');
        prect(s, 7, 0, 1, 11, '#3a3428'); prect(s, 8, 0, 6, 4, '#2e4a7a'); ppx(s, 10, 1, '#c8a050');
      });
      break;
    case 'coven': // ковен: кривые избы, каменный круг с зелёным огнём, мёртвые деревья, болотные окна
      stamp(c, x, y + 14, 60, 36, (s) => {
        pellipse(s, 30, 20, 27, 13, '#2a2e24');
        for (const [bx, by] of [[10, 28], [48, 10], [52, 26]]) pellipse(s, bx, by, 4, 2, '#16201a');
        for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; prect(s, Math.round(30 + Math.cos(a) * 9), Math.round(19 + Math.sin(a) * 5) - 2, 2, 3, '#7a7a70'); }
        prect(s, 29, 17, 3, 3, '#9adf50'); ppx(s, 30, 15, '#d8ff90'); ppx(s, 30, 16, '#9adf50');
        for (const [hx, hy] of [[2, 4], [44, 2], [4, 20]]) { prect(s, hx + 1, hy + 5, 9, 6, '#3a3428'); for (let k = 0; k < 5; k++) prect(s, hx + k + (k % 2), hy + 5 - k, 11 - k * 2, 1, '#2a3022'); ppx(s, hx + 3, hy + 7, '#9adf50'); }
        for (const [tx, ty] of [[18, 6], [42, 22], [56, 16], [14, 32]]) { prect(s, tx, ty - 7, 1, 7, '#1c1a15'); ppx(s, tx - 1, ty - 5, '#1c1a15'); ppx(s, tx + 1, ty - 6, '#1c1a15'); ppx(s, tx, ty - 8, '#d0ccc0'); }
      });
      break;
    case 'volnitsa': // Вольница: два кольца траншей вокруг ямы с костром, воронки, чёрная тряпка на жерди
      stamp(c, x, y + 12, 52, 34, (s) => {
        pellipse(s, 26, 17, 25, 15, '#2a2218');
        for (const [rx, ry] of [[22, 13], [13, 8]]) for (let k = 0; k < 64; k++) { const a = (k / 64) * TAU; ppx(s, Math.round(26 + Math.cos(a) * rx), Math.round(17 + Math.sin(a) * ry), k % 5 ? '#5a4632' : '#120e0a'); }
        pellipse(s, 26, 17, 5, 3, '#43382a'); ppx(s, 26, 17, '#f0a040'); ppx(s, 26, 16, '#f8d070');
        for (const [bx, by] of [[6, 6], [45, 9], [10, 28]]) { pellipse(s, bx, by, 3, 2, '#1a160e'); ppx(s, bx, by - 1, '#a8f070'); }
        prect(s, 21, 2, 1, 12, '#4a3a26'); prect(s, 22, 2, 5, 3, '#141210');
        for (const [hx, hy] of [[38, 22], [14, 20], [33, 5]]) { prect(s, hx, hy, 3, 2, '#120e0a'); prect(s, hx, hy - 1, 3, 1, '#5a4226'); }
      });
      break;
    case 'post314': // Пост 314: кольцо мешков, горбы бункеров, радиомачта, выцветшее знамя
      stamp(c, x, y + 10, 50, 40, (s) => {
        pellipse(s, 25, 26, 23, 12, '#2e2a22');
        for (let k = 0; k < 60; k++) { const a = (k / 60) * TAU; ppx(s, Math.round(25 + Math.cos(a) * 22), Math.round(26 + Math.sin(a) * 11), k % 2 ? '#8a7a58' : '#6e5e42'); }
        for (const [bx, by] of [[8, 20], [30, 18], [16, 30], [34, 30]]) { prect(s, bx, by, 9, 4, '#6a6a62'); prect(s, bx, by - 1, 9, 1, '#3a3022'); prect(s, bx + 1, by + 1, 3, 1, '#0e0e0c'); ppx(s, bx + 7, by + 2, '#e0a050'); }
        prect(s, 42, 1, 1, 24, '#6a6a62'); ppx(s, 42, 0, '#ff5040'); pline(s, 42, 4, 36, 24, '#3a3a34'); pline(s, 42, 4, 48, 24, '#3a3a34');
        prect(s, 24, 6, 1, 13, '#3a3428'); prect(s, 25, 6, 6, 4, '#a8a290'); prect(s, 25, 6, 6, 1, '#9a8048');
      });
      break;
    case 'gravehill': // могильный холм: горб земли, частокол кольев с касками и досок
      stamp(c, x, y + 10, 40, 26, (s) => {
        pellipse(s, 20, 18, 19, 8, '#3a3022'); pellipse(s, 20, 15, 14, 6, '#443a2a'); pellipse(s, 20, 12, 8, 4, '#4a3e2c');
        for (let k = 0; k < 18; k++) { const gx = 5 + ((k * 7) % 31), gy = 8 + ((k * 5) % 13); prect(s, gx, gy - 4, 1, 4, k % 3 ? '#5a4a32' : '#6a6a62'); if (k % 3 === 0) prect(s, gx - 1, gy - 5, 3, 1, '#4a4e40'); else if (k % 3 === 1) prect(s, gx - 1, gy - 3, 3, 1, '#5a4a32'); }
      });
      break;
    case 'heathen': // покинутое капище: круг кольев с черепами, кострище, идол из касок
      stamp(c, x, y + 10, 34, 26, (s) => {
        pellipse(s, 17, 16, 15, 7, '#2e2a22'); pellipse(s, 17, 16, 4, 2, '#141210');
        for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU, kx = Math.round(17 + Math.cos(a) * 12), ky = Math.round(15 + Math.sin(a) * 6); prect(s, kx, ky - 5, 1, 5, '#3a2c1e'); ppx(s, kx, ky - 6, '#c8c2ae'); }
        prect(s, 16, 3, 2, 10, '#3a2c1e'); prect(s, 14, 4, 6, 2, '#4a4e40'); prect(s, 15, 7, 4, 2, '#4a4e40'); ppx(s, 17, 2, '#c8c2ae');
      });
      break;
    case 'apost1': case 'apost2': // заброшенный пост: разваленный вал, тёмные бункеры, у второго — обгоревшее
      stamp(c, x, y + 10, 40, 30, (s) => {
        pellipse(s, 20, 18, 18, 9, '#2e2a22');
        for (let k = 0; k < 40; k++) { if (k % 7 === 2) continue; const a = (k / 40) * TAU; ppx(s, Math.round(20 + Math.cos(a) * 17), Math.round(18 + Math.sin(a) * 8), k % 2 ? '#6a5e44' : '#54493a'); }
        for (const [bx, by] of [[8, 13], [24, 12], [14, 21]]) { prect(s, bx, by, 8, 4, l.id === 'apost2' ? '#4a4a44' : '#5e5e56'); prect(s, bx, by - 1, 8, 1, '#3a3022'); prect(s, bx + 5, by + 1, 2, 3, '#0a0a08'); }
        prect(s, 33, 4, 1, 14, '#4a4a44'); ppx(s, 32, 6, '#4a4a44'); ppx(s, 34, 9, '#4a4a44'); // сломанная мачта
        if (l.id === 'apost2') for (let k = 0; k < 6; k++) ppx(s, 9 + k * 4, 19 + (k % 2), '#1a1612');
      });
      break;
    case 'scrapyard': // кладбище техники: ряды ржавых танков и грузовиков, над ними — остов сухопутного корабля
      stamp(c, x, y + 8, 60, 36, (s) => {
        pellipse(s, 30, 24, 28, 10, '#2e2a22');
        prect(s, 14, 4, 32, 12, '#4a3e30'); prect(s, 14, 4, 32, 1, '#6a5238'); for (let k = 0; k < 5; k++) prect(s, 17 + k * 6, 7, 3, 2, '#141210'); prect(s, 24, 0, 6, 4, '#4a3e30'); prect(s, 26, -3, 1, 3, '#3a3428');
        for (let k = 0; k < 4; k++) { prect(s, 14 + k * 8, 16, 6, 3, '#3a3026'); } // гусеницы корабля
        for (let k = 0; k < 6; k++) { const tx = 4 + k * 9, ty = 22 + (k % 2) * 6; prect(s, tx, ty, 7, 3, k % 3 ? '#5a4a36' : '#6a4a2a'); prect(s, tx + 2, ty - 2, 3, 2, '#5a4a36'); prect(s, tx + 5, ty - 1, 4, 1, '#4a3e30'); prect(s, tx, ty + 3, 7, 1, '#2a2218'); }
      });
      break;
    case 'deadend': // тупик: упор на рельсах, баррикада из шпал и мешков, знак
      stamp(c, x, y + 8, 30, 26, (s) => {
        prect(s, 4, 20, 8, 4, '#5a3a22'); prect(s, 4, 19, 8, 1, '#b02a22'); prect(s, 5, 16, 1, 3, '#3a2a1a'); prect(s, 10, 16, 1, 3, '#3a2a1a'); // упор на рельсах
        for (let k = 0; k < 4; k++) prect(s, 14 + (k % 2) * 2, 8 + k * 3, 12, 2, k % 2 ? '#6a5236' : '#5a4430');                 // баррикада из шпал
        for (let k = 0; k < 3; k++) pellipse(s, 16 + k * 4, 22, 2, 1, '#8a7a5a');                                                 // мешки
        prect(s, 6, 2, 1, 12, '#3a2a1a'); prect(s, 2, 2, 9, 4, '#c8b88a'); prect(s, 3, 3, 7, 1, '#5a2a24');                     // знак
      });
      break;
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
