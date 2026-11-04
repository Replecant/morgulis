// ============================================================
//  Пошаговый тактический бой
//  2 очка действия (ОД): ход = 1 ОД, атака завершает ход юнита.
//  Укрытия: половинное (−25%) и полное (−40%) к шансу попадания.
// ============================================================
import { Sfx } from './sfx';
import { tr } from './i18n';
import { G } from './state';
import { WEAPONS, ENEMIES, ABILITIES, battleDef, BattleDef, UnitBase } from './data';
import { bfs, pathTo, lineTiles, BfsMap, DIRS8, Pt, clamp, cheb, dist, lerp, pick, randInt, seeded, sleep, TAU } from './util';
import { check, checkChance, CheckResult } from './rules';
import { woundMods, effMaxHp, addWound, addWoundId, bandageAmount, medkitAmount, WOUNDS } from './wounds';
import { AMMO_NAME } from './items';
import { equipStats, itemOf, condOf, withCond } from './items';
import { loadMovePen } from './load';
import { PixelView, applyLight, PLight, T, PS, prect, ppx, pline, pellipse, shade, seeded as pseed, outline } from './px';
import { drawSprite, combatKind } from './sprites';
import { paintTile, objSprite } from './pxworld';
import { hasProsth } from './prosthetics';
import { Weather } from './weather';
import { SPELLS, SCHOOLS, STRAIN_MAX, knows, occultBonus, addStrain, strainCheck } from './occult';
import { COURAGE, COURAGE_ORDER, COMPANION_MOVES, knownMoves } from './rules';

export const CT = 40, CW = 24, CH = 14;
/** Прибавка к атакам в ближнем бою (под 3d6 Защита поднята на 3 ради стрельбы; врукопашную укрытий нет — возвращаем часть). */
const MELEE_EDGE = 2;
const W = CW * CT, H = CH * CT;

const TILE: Record<string, { walk?: boolean; cover?: number; los?: boolean }> = {
  '.': { walk: true }, ',': { walk: true }, 'o': { walk: true },
  '#': { cover: 40, los: true }, 'm': { cover: 40, los: true }, 'P': { cover: 40, los: true }, 'T': { cover: 40, los: true },
  'c': { cover: 25 }, 'f': { cover: 25 }, 'w': {}, 'x': {},
};

export interface Unit {
  uid: number; team: 'player' | 'enemy'; base: UnitBase;
  name: string; kind: string; x: number; y: number; px: number; py: number;
  hp: number; maxHp: number; move: number; ap: number;
  atkM: number; atkR: number; def: number; armor: number; dmgM: number; horror: number; med: number;
  courage: number;      // боевой кураж 0–3
  worn: string[];       // изношенное оружие: огнестрел может заклинить, холодное бьёт слабее
  jam: string[];        // заклинившее оружие — расклинивается перезарядкой
  fired: string[];      // чем бойец бил в этом бою (износ после боя)
  gas: boolean;         // противогаз: газ и зловонное дыхание не действуют
  splinter: boolean;    // защитная маска: осколки, дробь и огонь на 1 слабее
  blast: boolean;       // сапёрный доспех: урон от взрывов вдвое меньше
  rallyCharm: boolean;  // медальон: поднятый встаёт с половиной ОЗ
  exposed: boolean;     // раскрылся после рискованного манёвра: −2 к Защите до своего хода
  downed: boolean;      // тяжело ранен (боец отряда на 0 ОЗ) — можно спасти
  walking?: boolean;    // идёт (для анимации шага)
  weapons: string[]; ammo: Record<string, number>; abil: Record<string, number>;
  emptyNote?: string; // что сказать в журнал, когда у стрелка кончились заряды
  galv?: boolean;     // заряжен гальванический разряд
  st: Record<string, number>; // оккультные состояния: ключ → раундов осталось
  summon?: number;    // призванный бес: раундов до исчезновения
  ai?: UnitBase['ai']; leader: boolean; demonic: boolean;
  dead: boolean; fled: boolean; terror: boolean; flip: boolean; back?: boolean; flash: number; seed: number;
  cd: { summon: number; whisper: number };
  ally?: boolean;     // союзник в стычке: на стороне отряда, но ходит сам (ИИ)
  goal?: number;      // ИИ стрелка: клетка-цель (укрытие), к которой он идёт — y * CW + x
}

type Action = { type: 'w' | 'a' | 'c' | 's'; key: string };
export interface BtnInfo { kind: 'w' | 'a' | 'c' | 's' | 'm'; key: string; label: string; desc: string; disabled: boolean; active: boolean }
interface Fx { type: 'tracer' | 'proj' | 'ring' | 'breath'; cells?: Pt[]; x1: number; y1: number; x2: number; y2: number; color: string; life: number; max: number; k?: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; g: number }
interface Float { x: number; y: number; text: string; color: string; t: number }

// ------------------------------------------------------------ кураж (экспериментально)
export const COURAGE_MAX = 3;
export { COURAGE } from './rules'; // таблица приёмов куража — в rules.ts (их учат с уровнями)
/** Приёмы куража, которые применяются сразу, без выбора цели. */
const COURAGE_SELF = ['grit', 'brace', 'inspire'];

/** Талант профессии героя (rules.ts CLASS_TALENTS) — есть ли он у бойца. */
const KNIVES = ['knife', 'bayonet', 'rdagger', 'rustbayonet'];
const tal = (u: Unit, id: string) => !!u.base.tflags?.includes(id);
const strainCost = (u: Unit, n: number) => (tal(u, 'o_nerves') && n > 1 ? n - 1 : n); // «Стальные нервы»
let UID = 0;
function mkUnit(b: UnitBase, team: Unit['team'], x: number, y: number): Unit {
  const player = team === 'player';
  const m = player ? woundMods(b) : { atkM: 0, atkR: 0, def: 0, move: 0, horror: 0, maxHp: 0 };
  // снаряжение бойцов отряда: оружие, броня, бонусы, маска, оберег
  const e = player && b.equip ? equipStats(b) : null;
  const abil = { ...(b.abil ?? {}) };
  if (player && hasProsth(b, 'galvanic')) abil.galvanic = 1; // гальваническая рука
  const u: Unit = {
    uid: ++UID, team, base: b, name: b.name, kind: b.look ?? b.kind, x, y, px: x * CT + CT / 2, py: y * CT + CT / 2,
    hp: b.hp, maxHp: player ? effMaxHp(b) : b.maxHp, move: Math.max(2, b.move + m.move + (e?.move ?? 0) - (player && e ? loadMovePen() : 0)), ap: 0,
    weapons: e ? [...(b.innate ?? []), ...e.weapons.filter((w) => !(b.innate?.length && w === 'fists'))] : b.weapons.slice(), ammo: {}, abil,
    atkM: b.atkM + m.atkM + (e?.atkM ?? 0), atkR: b.atkR + m.atkR + (e?.atkR ?? 0), def: b.def + m.def + (e?.def ?? 0),
    armor: (b.armor ?? 0) + (e?.armor ?? 0), dmgM: b.dmgM ?? 0,
    horror: (b.horror ?? 0) + m.horror + (e?.horror ?? 0), med: b.med ?? 0,
    courage: Math.min(COURAGE_MAX, (e?.courage ?? 0) + (b.courage0 ?? 0)), worn: e ? e.worn.slice() : [], jam: [], fired: [], gas: !!e?.gas, splinter: !!e?.splinter, blast: !!e?.blast, rallyCharm: !!e?.rally,
    exposed: false, downed: false,
    ai: b.ai, leader: !!b.leader, demonic: !!b.demonic,
    dead: false, fled: false, terror: false, flip: team === 'enemy', flash: 0, seed: Math.random() * 10, cd: { summon: 0, whisper: 0 }, st: {},
  };
  for (const w of u.weapons) if (WEAPONS[w].ammo) u.ammo[w] = WEAPONS[w].ammo!;
  return u;
}

export interface CombatHooks {
  panel: () => void;
  log: (s: string) => void;
  toast: (s: string) => void;
  victory: (id: BattleDef['id']) => void;
  defeat: (id: BattleDef['id']) => void;
}

export const Combat = {
  hooks: null as unknown as CombatHooks,
  def: null as unknown as BattleDef,
  map: [] as string[][],
  units: [] as Unit[],
  sel: null as Unit | null,
  action: { type: 'w', key: '' } as Action,
  reach: null as BfsMap | null,
  busy: false, ended: false,
  turn: 'player' as 'player' | 'enemy',
  round: 1,
  anims: [] as ((now: number) => boolean)[],
  fx: [] as Fx[], parts: [] as Particle[], floats: [] as Float[],
  shake: 0,
  banner: null as { text: string; color: string; t: number } | null,
  hover: null as Pt | null,
  bg: null as HTMLCanvasElement | null,
  wearNotes: [] as string[], // что износилось за бой — показывается после победы
  view: null as PixelView | null,
  circle: null as { x: number; y: number; r: number } | null,
  smoke: [] as { x: number; y: number; turns: number }[],
  gasClouds: [] as { x: number; y: number; turns: number }[], // газ из лопнувших газовых мертвецов: 3×3, травит всех без противогаза
  runes: [] as { x: number; y: number; kind: 'guard' | 'glyph'; turns: number }[], // руны на клетках
  magic: false,       // панель показывает заклинания

  // ---------------------------------------------------------- запуск
  start(id: BattleDef['id']) {
    const def = battleDef(id, G.flags);
    this.def = def;
    this.map = def.map.map((r) => r.padEnd(CW, '.').slice(0, CW).split(''));
    this.units = []; this.fx = []; this.parts = []; this.floats = []; this.anims = [];
    this.ended = false; this.busy = false; this.round = 1; this.sel = null; this.reach = null; this.smoke = []; this.gasClouds = []; this.runes = []; this.magic = false;
    G.squad.forEach((s, i) => {
      // мест в бою обычно четыре — пятый и дальше встают на ближайшие свободные клетки рядом с отрядом
      const pos = def.players[i] ? { x: def.players[i][0], y: def.players[i][1] } : null;
      const anchor = { x: def.players[i % def.players.length][0], y: def.players[i % def.players.length][1] };
      const spot = pos && this.free(pos.x, pos.y) ? pos : this.closestFree(anchor, 4) ?? anchor;
      const { x, y } = spot;
      const u = mkUnit(s, 'player', x, y);
      u.hp = Math.max(1, Math.min(u.maxHp, s.hp));
      this.units.push(u);
    });
    // руническое усиление оружия героя (ритуал) — на один бой
    if (G.flags.runeWeapon) {
      const h = this.units.find((u) => u.leader);
      if (h) { h.atkM++; h.atkR++; h.dmgM++; this.hooks.log(`Руны на оружии ${h.name} тлеют: +1 к атакам и урону вблизи.`); }
      G.flags.runeWeapon = false;
    }
    for (const a of def.allies ?? []) { // союзники стычки — рядом с отрядом, на ближайших свободных клетках
      const spot = this.free(a.x, a.y) ? { x: a.x, y: a.y } : this.freeNear(a, 3);
      if (!spot) continue;
      const u = mkUnit(ENEMIES[a.t], 'player', spot.x, spot.y);
      u.ally = true;
      if (a.ammo) Object.assign(u.ammo, a.ammo);
      this.units.push(u);
    }
    for (const e of def.enemies) {
      const base = ENEMIES[e.t];
      const u = mkUnit(e.extra ? { ...base, weapons: [...base.weapons, ...e.extra] } : base, 'enemy', e.x, e.y);
      if (e.ammo) Object.assign(u.ammo, e.ammo);
      if (e.move) u.move = Math.max(1, u.move + e.move);
      if (e.name) u.name = e.name;
      u.emptyNote = e.note;
      this.units.push(u);
    }
    this.view = this.view ?? new PixelView(W / PS, H / PS);
    this.renderBg();
    this.hooks.log(`— ${def.title} —`);
    if (loadMovePen()) this.hooks.log(`Отряд перегружен: −${loadMovePen()} к перемещению каждому бойцу.`);
    this.startPlayerTurn();
  },

  // ---------------------------------------------------------- геометрия
  tile(x: number, y: number) { return x < 0 || y < 0 || x >= CW || y >= CH ? null : this.map[y][x]; },
  walk(x: number, y: number) { const t = this.tile(x, y); return !!(t && TILE[t]?.walk); },
  unitAt(x: number, y: number) { return this.units.find((u) => !u.dead && u.x === x && u.y === y); },
  /** Свободна ли клетка: тяжелораненые бойцы тоже занимают место. */
  free(x: number, y: number) { return this.walk(x, y) && !this.unitAt(x, y) && !this.downedAt(x, y); },
  downedAt(x: number, y: number) { return this.units.find((u) => u.downed && u.x === x && u.y === y); },
  alive(team: Unit['team']) { return this.units.filter((u) => !u.dead && u.team === team); },
  blocksLos(x: number, y: number) { const t = this.tile(x, y); return !t || !!TILE[t]?.los || this.inSmoke(x, y); },
  inSmoke(x: number, y: number) { return this.smoke.some((s) => Math.abs(s.x - x) <= 1 && Math.abs(s.y - y) <= 1); },
  los(a: Pt, b: Pt) {
    const pts = lineTiles(a.x, a.y, b.x, b.y);
    for (let i = 1; i < pts.length - 1; i++) if (this.blocksLos(pts[i].x, pts[i].y)) return false;
    return true;
  },
  /** Боец отряда (а не призванный бес или подчинённое существо). */
  isSquad(u: Unit) { return G.squad.includes(u.base); },
  /** Перемещение с учётом оккультных состояний: связанный стоит на месте, договор даёт +1. */
  mv(u: Unit) { return u.st.bound ? 0 : Math.max(1, u.move + (u.st.pact ? 1 : 0) - (u.st.supp ? 2 : 0)); },
  coverAt(x: number, y: number) { const t = this.tile(x, y); return t ? TILE[t]?.cover ?? 0 : 0; },
  /** Укрытие цели t от стрелка from: смотрим соседние клетки цели со стороны стрелка. */
  coverOf(t: Pt, from: Pt) {
    const dx = from.x - t.x, dy = from.y - t.y;
    let c = 0;
    if (dx && Math.abs(dx) >= Math.abs(dy) * 0.5) c = Math.max(c, this.coverAt(t.x + Math.sign(dx), t.y));
    if (dy && Math.abs(dy) >= Math.abs(dx) * 0.5) c = Math.max(c, this.coverAt(t.x, t.y + Math.sign(dy)));
    return c;
  },
  /** Бонус укрытия к Защите: половинное +1, полное +2. Под 3d6 каждое очко ≈ 12% шанса, а стрелки противника всегда ищут лучшее укрытие —
   *  при +2/+4 по укрытому врагу попадали в 16–37%, бой превращался в череду промахов. */
  coverDef(cover: number) { return cover >= 40 ? 2 : cover >= 25 ? 1 : 0; },
  /**
   * Бросок атаки по правилам: 3d6 + бонус атаки + бонус оружия − штраф дистанции
   * против Защиты цели (+ укрытие). Возвращает null, если атака невозможна.
   */
  attackInfo(att: Unit, from: Pt, t: Unit, wkey: string, extra = 0) {
    const w = WEAPONS[wkey];
    let bonus = w.atk + extra, dc = t.def - (t.exposed ? 2 : 0);
    // оккультные состояния
    if (att.st.hex) bonus -= 3;
    if (att.st.weak) bonus -= 2; // слабость от зловонного дыхания
    if (att.st.supp) bonus -= 2; // прижат пулемётным огнём
    if (att.st.pact) bonus += 2;
    if (att.st.stars) bonus += 1;
    if (att.st.fortune) bonus += 4;
    if (att.st.omen) bonus -= 4;
    if (t.st.ward) dc += 1;
    if (t.st.brace) dc += 3; // «Стоять насмерть»
    if (t.st.stars) dc += 1;
    if (this.runes.some((r) => r.kind === 'guard' && r.x === t.x && r.y === t.y) && t.team === 'player') dc += 3;
    if (tal(att, 'b_knife') && KNIVES.includes(wkey)) bonus += 1;          // «Ножевой бой»
    if (tal(att, 'b_lethal') && t.hp <= t.maxHp / 2) bonus += 2;             // «Добивание»
    if (w.type === 'melee') {
      if (cheb(from, t) !== 1) return null;
      bonus += att.atkM + MELEE_EDGE; // вплотную укрытие не спасает — Защита, поднятая под 3d6, бьёт по рукопашной слабее
    } else {
      const d = dist(from, t);
      if (d > w.range! + 0.01 || !this.los(from, t)) return null;
      bonus += att.atkR - Math.floor(Math.max(0, d - w.opt!) / 2);
      if (cheb(from, t) === 1 && !w.magic) bonus -= w.closePen ?? 3; // в упор длинным стволом не прицелиться
      if (!w.ignoreCover) dc += this.coverDef(this.coverOf(t, from));
      if (this.inSmoke(t.x, t.y)) dc += 3;
    }
    return { bonus, dc, chance: checkChance(bonus, dc) };
  },
  hitChance(a: Unit, t: Unit, wkey: string, extra = 0) { return this.attackInfo(a, a, t, wkey, extra - (WEAPONS[wkey].burst ? 3 : 0))?.chance ?? 0; }, // у очереди — шанс одной пули

  // ---------------------------------------------------------- ход игрока
  async startPlayerTurn() {
    this.turn = 'player';
    if (this.round > 1) await this.tickOccult();
    for (const s of this.smoke) s.turns--;
    this.smoke = this.smoke.filter((s) => s.turns > 0);
    if (this.round > 1) await this.tickGas();
    for (const u of this.alive('player')) {
      u.exposed = false;
      u.ap = u.terror ? 1 : 2;
      if (u.terror) this.float(u, 'Ужас: 1 ОД', '#b58cff');
      u.terror = false;
    }
    this.busy = true; this.hooks.panel();
    await this.showBanner(`ХОД ОТРЯДА · раунд ${this.round}`, '#d4b673');
    this.busy = false;
    const lead = this.alive('player').find((u) => u.leader && u.ap > 0) ?? this.alive('player').find((u) => u.ap > 0 && !u.ally);
    if (lead) this.select(lead);
  },

  select(u: Unit) {
    this.sel = u;
    this.action = { type: 'w', key: u.weapons[0] };
    this.computeReach();
    this.hooks.panel();
  },
  selectNext() {
    const list = this.alive('player').filter((u) => u.ap > 0 && !u.ally);
    if (!list.length) return;
    const i = this.sel ? list.indexOf(this.sel) : -1;
    this.select(list[(i + 1) % list.length]);
  },
  computeReach() {
    const s = this.sel;
    if (!s || s.ap <= 0) { this.reach = null; return; }
    const mv = this.mv(s);
    const range = this.action.type === 'c' && this.action.key === 'rush' ? mv * 2
      : this.action.type === 'c' ? mv + 2 : mv * Math.min(s.ap, 2);
    this.reach = bfs(CW, CH, s.x, s.y, (x, y) => this.free(x, y), range);
  },
  gainCourage(u: Unit, why: string) {
    if (u.team !== 'player' || u.dead || u.courage >= COURAGE_MAX) return;
    u.courage++;
    this.float(u, `Кураж! ${why}`, '#f0a040');
  },
  /** Можно ли сейчас применить манёвр куража (и почему нет). */
  courageBlock(u: Unit, key: string): string | null {
    const c = COURAGE[key];
    if (u.courage < c.cost) return `Нужно куража: ${c.cost}`;
    if ((key === 'charge' || key === 'rescue' || key === 'pierce' || key === 'volley') && u.ap < 2) return 'Нужны 2 ОД';
    if (key === 'grit') return u.hp >= u.maxHp && !u.st.supp && !u.st.weak ? 'Нечего превозмогать' : null; // без ОД
    if (u.ap < 1) return 'Нет ОД';
    if ((key === 'pierce' || key === 'volley') && !this.gunOf(u, key === 'volley' ? 2 : 1)) return key === 'volley' ? 'Нужен огнестрел с двумя зарядами' : 'Нужен заряженный огнестрел';
    if (key === 'inspire' && !this.alive('player').some((x) => x !== u && !x.downed && dist(u, x) <= 5.5)) return 'Рядом нет своих';
    if (key === 'charge' && !u.weapons.some((w) => WEAPONS[w].type === 'melee')) return 'Нет холодного оружия';
    if (key === 'last' && u.hp > u.maxHp / 3) return 'Только при ОЗ не выше трети';
    if (key === 'rescue' && !this.units.some((x) => x.downed)) return 'Некого спасать';
    return null;
  },
  cancel() {
    if (this.magic) { this.magic = false; this.hooks.panel(); }
    if (this.sel) { this.action = { type: 'w', key: this.sel.weapons[0] }; this.computeReach(); this.hooks.panel(); }
  },

  /** Кнопки панели: оружие + способности. */
  buttons(): BtnInfo[] {
    const u = this.sel;
    if (u && this.magic) return this.spellButtons(u);
    if (!u) return [];
    const out: BtnInfo[] = [];
    for (const w of u.weapons) {
      const W_ = WEAPONS[w];
      const ammo = W_.ammo ? ` ${u.ammo[w]}/${W_.ammo}` : '';
      const ab = (n: number) => (n >= 0 ? '+' : '') + n;
      const desc = W_.type === 'melee' ? `Ближний бой · урон ${W_.dmg[0]}–${W_.dmg[1]} · атака ${ab(u.atkM + W_.atk + MELEE_EDGE)}` : `Дальность ${W_.range} · урон ${W_.dmg[0]}–${W_.dmg[1]} · атака ${ab(u.atkR + W_.atk)}`;
      out.push({ kind: 'w', key: w, label: W_.name + ammo, desc, disabled: false, active: this.action.type === 'w' && this.action.key === w });
    }
    const types = [...new Set(u.weapons.map((w) => WEAPONS[w].ammoType).filter(Boolean))] as string[];
    if (u.team === 'player' && types.length) {
      out.push({
        kind: 'a', key: 'reload', label: `${u.jam.length ? '⚠ ' : ''}${ABILITIES.reload.name} (${types.map((t) => `${AMMO_NAME[t]} ${G.supplies[t as keyof typeof G.supplies]}`).join(', ')})`,
        desc: tr(ABILITIES.reload.desc) + (u.jam.length ? ' ' + tr('Заклинило: ') + u.jam.map((w) => WEAPONS[w].name).join(', ') + '.' : ''),
        disabled: u.ap < 1 || !this.reloadable(u).length, active: false,
      });
    }
    if (this.isSquad(u)) { // расходники отряда — только у бойцов отряда
      const S = G.supplies, noAp = u.ap < 1;
      const cons: [string, number][] = [['grenade', S.grenade], ['dynamite', S.dynamite], ['smoke', S.smoke], ['bandage', S.bandage], ['medkit', S.medkit], ['painkiller', S.painkiller]];
      for (const [k, n] of cons) if (n > 0) out.push({ kind: 'a', key: k, label: `${ABILITIES[k].name} (${n})`, desc: tr(ABILITIES[k].desc), disabled: noAp, active: this.action.type === 'a' && this.action.key === k });
    }
    for (const k of Object.keys(u.abil)) {
      const n = u.abil[k];
      out.push({ kind: 'a', key: k, label: ABILITIES[k].name + (n < 10 ? ` (${n})` : ''), desc: ABILITIES[k].desc, disabled: n <= 0 || (k === 'aim' && u.ap < 2), active: this.action.type === 'a' && this.action.key === k });
    }
    if (u.leader && G.known.length) out.push({ kind: 'm', key: 'magic', label: `✶ Оккультизм (напр. ${u.base.strain ?? 0}/${STRAIN_MAX})`, desc: 'Заклинания изученных школ. Каждое тратит основное действие и повышает оккультное напряжение.', disabled: u.ap < 1, active: false });
    if (this.isSquad(u)) for (const k of COURAGE_ORDER) {
      if (!this.movesOf(u).includes(k)) continue; // приём не изучен
      if (u.courage < COURAGE[k].cost) continue; // нет куража — кнопки нет, панель не забита
      const block = this.courageBlock(u, k);
      if (block && !/ОД/.test(block)) continue; // невозможно по условиям (нет раненых, здоровья много…) — тоже не показываем
      out.push({ kind: 'c', key: k, label: `${COURAGE[k].short} ${'✦'.repeat(COURAGE[k].cost)}`, desc: `${tr(COURAGE[k].name)}. ${tr(COURAGE[k].desc)}` + (block ? ` (${tr(block)})` : ''), disabled: !!block, active: this.action.type === 'c' && this.action.key === k });
    }
    return out;
  },
  pressButton(i: number) {
    if (this.busy || this.turn !== 'player' || !this.sel) return;
    const b = this.buttons()[i];
    if (!b || b.disabled) return;
    const u = this.sel;
    if (b.kind === 'w') { this.action = { type: 'w', key: b.key }; this.computeReach(); this.hooks.panel(); return; }
    if (b.kind === 'm') { this.magic = b.key === 'magic'; this.action = { type: 'w', key: u.weapons[0] }; this.hooks.panel(); return; }
    if (b.kind === 's') {
      const sp = SPELLS[b.key];
      if (sp.target === 'self') { this.castSpell(u, b.key, u.x, u.y, u); return; }
      this.action = { type: 's', key: b.key };
      this.hooks.toast(sp.target === 'enemy' ? `${sp.name}: выберите врага` : sp.target === 'ally' ? `${sp.name}: выберите союзника или себя` : `${sp.name}: выберите клетку`);
      this.hooks.panel(); return;
    }
    if (b.kind === 'c' && COURAGE_SELF.includes(b.key)) { this.useCourage(u, b.key, u.x, u.y, u); return; }
    if (b.kind === 'c') { this.action = { type: 'c', key: b.key }; this.computeReach(); this.hooks.panel(); return; }
    if (b.key === 'reload') {
      this.run(async () => {
        const got: string[] = [], unjam = u.jam.length > 0;
        for (const w of this.reloadable(u)) {
          const t = WEAPONS[w].ammoType!, need = WEAPONS[w].ammo! - u.ammo[w], take = Math.min(need, G.supplies[t]);
          if (u.jam.includes(w)) { u.jam = u.jam.filter((x) => x !== w); got.push(`${WEAPONS[w].name} — расклинено`); }
          if (take > 0) { u.ammo[w] += take; G.supplies[t] -= take; got.push(`${WEAPONS[w].name} +${take}`); }
        }
        u.ap -= 1;
        this.float(u, unjam ? 'Расклинил' : 'Перезарядка', '#d8c890');
        this.hooks.log(`${u.name} перезаряжает: ${got.join(', ')}.`);
        await sleep(350);
      });
      return;
    }
    if (b.key === 'galvanic') {
      if (u.galv) return;
      u.abil.galvanic = 0; u.galv = true;
      this.float(u, 'Разряд!', '#d8ff70');
      this.burst(u.px, u.py - 14, '#d8ff70', 8, 30);
      this.hooks.log(`${u.name}: гальванические банки гудят — следующий удар вблизи +2 к атаке и урону.`);
      this.hooks.panel();
      return;
    }
    if (b.key === 'painkiller') {
      this.run(async () => {
        G.supplies.painkiller--; u.ap -= 1;
        const h = Math.min(3, u.maxHp - u.hp); u.hp += h;
        this.float(u, `+${h}`, '#8fdc7a');
        this.gainCourage(u, 'боль отступила');
        this.hooks.log(`${u.name} принимает обезболивающее.`);
        await sleep(400);
      });
      return;
    }
    this.action = { type: 'a', key: b.key };
    this.hooks.panel();
  },

  /** Оружие, которое можно дозарядить патронами из запаса. */
  reloadable(u: Unit) {
    return u.weapons.filter((w) => { const W_ = WEAPONS[w]; return W_.ammoType && (u.jam.includes(w) || (u.ammo[w] < W_.ammo! && G.supplies[W_.ammoType] > 0)); });
  },
  canFire(u: Unit, w: string, quiet = false) {
    if (u.jam.includes(w)) { if (!quiet) this.hooks.toast('Оружие заклинило — расклинить перезарядкой (1 ОД)'); return false; }
    if (WEAPONS[w].ammo && u.ammo[w] <= 0) { if (!quiet) this.hooks.toast('Нет патронов — нужна перезарядка'); return false; }
    return true;
  },
  /** Шанс попадания для текущего выбранного действия (для подсветки целей). */
  actionChance(u: Unit, t: Unit) {
    if (this.action.type === 'w') return this.canFire(u, this.action.key, true) ? this.hitChance(u, t, this.action.key) : 0;
    if (this.action.key === 'aim') return this.canFire(u, u.weapons[0], true) ? this.hitChance(u, t, u.weapons[0], tal(u, 'h_sniper') ? 6 : 4) : 0;
    if (this.action.type === 'c' && this.action.key === 'last') { const w = this.lastStandWeapon(u, t); return w ? this.advChance(this.hitChance(u, t, w)) : 0; }
    if (this.action.type === 'c' && (this.action.key === 'pierce' || this.action.key === 'volley')) { const w = this.gunOf(u, this.action.key === 'volley' ? 2 : 1); return w ? this.hitChance(u, t, w, this.action.key === 'pierce' ? 2 : 0) : 0; }
    if (this.action.type === 'c' && this.action.key === 'charge') return this.chargeTile(u, t) ? this.hitChance({ ...u, x: this.chargeTile(u, t)!.x, y: this.chargeTile(u, t)!.y } as Unit, t, this.meleeWeapon(u)!, 2) : 0;
    return 0;
  },
  /** Какие приёмы куража знает боец: герой — изученные с уровнями, спутники — свои. */
  movesOf(u: Unit) { return u.base.id === 'pc' && G.pc ? knownMoves(G.pc) : G.flags['undead_' + u.base.id] ? [] : COMPANION_MOVES[u.base.id] ?? []; }, // мертвецам кураж не нужен
  /** Огнестрел, из которого боец может выстрелить n раз подряд (для приёмов куража). */
  gunOf(u: Unit, n = 1) { return u.weapons.find((w) => WEAPONS[w].type === 'ranged' && !WEAPONS[w].magic && this.canFire(u, w, true) && (u.ammo[w] === undefined || u.ammo[w] >= n)); },
  advChance(p: number) { return Math.round(100 - (100 - p) * (100 - p) / 100); },
  meleeWeapon(u: Unit) { return u.weapons.find((w) => WEAPONS[w].type === 'melee'); },
  lastStandWeapon(u: Unit, t: Unit) {
    return u.weapons.filter((w) => this.canFire(u, w, true)).sort((a, b) => this.hitChance(u, t, b) - this.hitChance(u, t, a)).find((w) => this.hitChance(u, t, w) > 0);
  },
  /** Ближайшая к бойцу клетка рядом с целью в пределах броска (ход + 2). */
  chargeTile(u: Unit, t: Pt): Pt | null {
    if (!this.reach) return null;
    let best: { x: number; y: number; d: number } | null = null;
    for (const [dx, dy] of DIRS8) {
      const n = this.reach.get((t.y + dy) * CW + t.x + dx);
      if (n && (!best || n.d < best.d)) best = n;
    }
    return best;
  },

  click(mx: number, my: number, right: boolean) {
    if (this.busy || this.turn !== 'player' || this.ended) return;
    if (right) { this.cancel(); return; }
    const tx = Math.floor(mx / CT), ty = Math.floor(my / CT);
    if (tx < 0 || ty < 0 || tx >= CW || ty >= CH) return;
    const sel = this.sel, act = this.action, u = this.unitAt(tx, ty);
    if (sel && act.type === 'a') { this.useAbility(sel, act.key, tx, ty, u ?? this.downedAt(tx, ty)); return; }
    if (sel && act.type === 's') { this.castSpell(sel, act.key, tx, ty, u); return; }
    if (sel && act.type === 'c') { this.useCourage(sel, act.key, tx, ty, u ?? this.downedAt(tx, ty)); return; }
    if (u && u.team === 'player') { if (u.ally) this.hooks.toast(`${u.name} — союзник, воюет сам`); else if (u.ap > 0) this.select(u); else this.hooks.toast(`${u.name}: ОД закончились`); return; }
    if (!sel || sel.ap <= 0) return;
    if (u && u.team === 'enemy') {
      const w = act.key;
      if (!this.canFire(sel, w)) return;
      const ch = this.hitChance(sel, u, w);
      if (ch <= 0) { this.hooks.toast(WEAPONS[w].type === 'melee' ? 'Нужно подойти вплотную' : 'Цель вне досягаемости или не видна'); return; }
      this.run(async () => { await this.attack(sel, u, w); sel.ap = 0; });
      return;
    }
    const n = this.reach?.get(ty * CW + tx);
    if (n && n.d > 0) {
      const cost = n.d <= this.mv(sel) ? 1 : 2;
      if (cost > sel.ap) return;
      const path = pathTo(this.reach!, CW, tx, ty);
      this.run(async () => { await this.moveAlong(sel, path); sel.ap -= cost; });
    }
  },

  // ---------------------------------------------------------- оккультизм
  spellButtons(u: Unit): BtnInfo[] {
    const strain = u.base.strain ?? 0;
    const out: BtnInfo[] = [{ kind: 'm', key: 'back', label: '‹ Назад', desc: 'Вернуться к оружию и действиям.', disabled: false, active: false }];
    for (const id of G.known) {
      const sp = SPELLS[id];
      const cost = strainCost(u, sp.strain), over = strain + cost > STRAIN_MAX;
      out.push({ kind: 's', key: id, label: `${SCHOOLS[sp.school].emblem} ${sp.name} (+${cost})`,
        desc: `${tr(SCHOOLS[sp.school].name)}. ${tr(sp.desc)} ${tr(`Напряжение +${cost}.`)}${over ? ' ' + tr('Напряжение на пределе — нужен привал.') : ''}`,
        disabled: u.ap < 1 || over, active: this.action.type === 's' && this.action.key === id });
    }
    return out;
  },

  /** Сотворить заклинание: проверка цели, бросок, эффект, напряжение и отдача. */
  castSpell(u: Unit, id: string, tx: number, ty: number, target?: Unit) {
    const sp = SPELLS[id], T = (m: string) => this.hooks.toast(m);
    if (!knows(id) || u.ap < 1) return;
    const inRange = (p: Pt) => dist(u, p) <= sp.range + 0.01;
    if (sp.target === 'enemy') {
      if (!target || target.team !== 'enemy' || target.dead) return T('Выберите врага');
      if (!inRange(target) || !this.los(u, target)) return T('Враг вне досягаемости или не виден');
      if (id === 'command' && !(target.demonic || target.base.id.startsWith('dead_'))) return T('Приказ действует только на потусторонних существ');
      if (id === 'command' && target.hp > 10) return T('Существо слишком сильно для приказа');
    } else if (sp.target === 'ally') {
      if (!target || target.team !== 'player' || target.dead) return T('Выберите союзника или себя');
      if (!inRange(target)) return T('Союзник слишком далеко');
    } else if (sp.target === 'cell') {
      if (!inRange({ x: tx, y: ty })) return T('Клетка слишком далеко');
      if (!this.walk(tx, ty) || (sp.id !== 'guard' && this.unitAt(tx, ty))) return T('Клетка занята или непроходима');
      if (sp.id === 'summon' && cheb(u, { x: tx, y: ty }) !== 1) return T('Бес появится только рядом с вами');
      if (this.runes.some((r) => r.x === tx && r.y === ty)) return T('Здесь уже есть руна');
    }
    this.run(async () => {
      u.ap = 0; // основное действие
      addStrain(strainCost(u, sp.strain));
      const col = sp.school === 'demon' ? '#e05030' : sp.school === 'astro' ? '#f0e090' : sp.school === 'rune' ? '#c8a0ff' : '#9fef6a';
      this.float(u, sp.name, col);
      this.burst(u.px, u.py - 16, col, 10, 40);
      await sleep(250);
      let ok = true, rollTxt = '';
      if (sp.dc !== undefined || id === 'command') {
        const dc = id === 'command' ? 10 + Math.ceil(target!.hp / 2) : sp.dc!;
        const r = check(occultBonus(), dc); ok = r.success;
        rollTxt = ` [Оккультизм: 3d6 ${r.roll}${occultBonus() >= 0 ? '+' : ''}${occultBonus()} против ${dc}]`;
      }
      const tgt = target!, turns = sp.turns ?? 1;
      const hit = (msg: string, who: Unit) => { this.float(who, msg, col); this.burst(who.px, who.py - 14, col, 12, 50); };
      switch (id) {
        case 'hex': case 'rot': case 'bind': case 'omen':
          await this.projectile(u, tgt, col, 380);
          if (ok) { tgt.st[id === 'omen' ? 'omen' : id === 'bind' ? 'bound' : id] = id === 'omen' ? 99 : turns; hit(sp.name, tgt); this.hooks.log(`${u.name}: «${sp.name}» на ${tgt.name}.${rollTxt}`); }
          else { this.float(tgt, 'Устоял', '#ddd'); this.hooks.log(`${tgt.name} не поддаётся: «${sp.name}» срывается.${rollTxt}`); }
          break;
        case 'ward': case 'pact': case 'fortune':
          tgt.st[id] = id === 'fortune' ? 99 : turns; hit(sp.name, tgt);
          this.hooks.log(`${u.name}: «${sp.name}» — ${tgt === u ? 'на себя' : tgt.name}.`);
          break;
        case 'stars':
          for (const a of this.alive('player')) { a.st.stars = turns; hit('☉', a); }
          this.hooks.log(`${u.name} читает звёзды: отряду +1 к атакам и Защите на ${turns} раунда.`);
          break;
        case 'guard': case 'glyph':
          this.runes.push({ x: tx, y: ty, kind: id, turns: id === 'guard' ? turns : 99 });
          this.burst(tx * CT + CT / 2, ty * CT + CT / 2, col, 14, 40);
          this.hooks.log(`${u.name} чертит ${id === 'guard' ? 'охранную руну' : 'ловчий глиф'}.`);
          break;
        case 'summon': {
          const imp = mkUnit(ENEMIES.imp, ok ? 'player' : 'enemy', tx, ty);
          imp.flash = 0.3; imp.name = ok ? 'Призванный бес' : 'Своевольный бес';
          if (ok) { imp.summon = turns; imp.ap = 0; }
          this.units.push(imp);
          this.burst(tx * CT + CT / 2, ty * CT + CT / 2, '#e05030', 26, 70);
          this.hooks.log(ok ? `${u.name} призывает беса: он служит ${turns} раунда.${rollTxt}` : `Бес приходит — но смотрит на ${u.name} и скалится. Он не будет служить.${rollTxt}`);
          break;
        }
        case 'command':
          await this.projectile(u, tgt, col, 380);
          if (ok) { tgt.team = 'player'; tgt.st.commanded = turns; tgt.ap = 0; tgt.flip = !tgt.flip; hit('Подчинён', tgt); this.hooks.log(`${tgt.name} подчиняется приказу на ${turns} раунда.${rollTxt}`); }
          else { this.float(tgt, 'Не слушается', '#ddd'); this.hooks.log(`${tgt.name} не слушается приказа.${rollTxt}`); }
          break;
      }
      await sleep(300);
      // отдача при высоком напряжении
      const sc = strainCheck();
      if (sc && !sc.ok) {
        const k = randInt(1, 3), txt = `[Воля: 3d6 ${sc.roll} → ${sc.total} против ${sc.dc}]`;
        if (k === 1) { const d = randInt(1, 3); this.float(u, `Отдача −${d}`, '#b58cff'); this.hooks.log(`Отдача: из носа идёт кровь, ${u.name} теряет ${d} ОЗ. ${txt}`); await this.damage(u, d, false); }
        else if (k === 2) { u.terror = true; this.float(u, 'Видения!', '#b58cff'); this.hooks.log(`Отдача: перед глазами чужие видения — в следующем ходу 1 ОД. ${txt}`); }
        else { u.courage = 0; u.hp = Math.max(1, u.hp - 1); this.float(u, 'Шёпот…', '#b58cff'); this.hooks.log(`Отдача: шёпот в голове гасит кураж, −1 ОЗ. ${txt}`); }
      } else if (sc) this.hooks.log(`${u.name} удерживает напряжение. [Воля: 3d6 ${sc.roll} → ${sc.total} против ${sc.dc}]`);
      this.magic = false;
    });
  },

  /** Начало раунда: тикают оккультные состояния, руны, призванные и подчинённые. */
  async tickOccult() {
    for (const r of this.runes) if (r.kind === 'guard') r.turns--;
    this.runes = this.runes.filter((r) => r.turns > 0);
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.st.rot) { this.hooks.log(`Порча гложет ${u.name}: −2 ОЗ.`); await this.damage(u, 2, false); if (u.dead || u.downed) continue; }
      for (const k of Object.keys(u.st)) {
        if (u.st[k] >= 99) continue; // одноразовые — до использования
        if (--u.st[k] > 0) continue;
        delete u.st[k];
        if (k === 'pact') { u.hp = Math.max(1, u.hp - 2); this.float(u, 'Плата −2', '#e05030'); this.hooks.log(`Договор истёк — плата: ${u.name} теряет 2 ОЗ.`); }
        if (k === 'commanded') { u.team = 'enemy'; u.flip = !u.flip; this.float(u, 'Приказ спал', '#e05030'); this.hooks.log(`${u.name} больше не подчиняется.`); }
      }
      if (u.summon !== undefined && --u.summon <= 0) {
        u.dead = true; u.fled = true;
        this.burst(u.px, u.py - 10, '#6a5a50', 24, 60);
        this.hooks.log(`${u.name} рассыпается в прах — срок службы вышел.`);
      }
    }
  },

  useAbility(u: Unit, key: string, tx: number, ty: number, target?: Unit) {
    const T = (s: string) => this.hooks.toast(s);
    if (key === 'aim') {
      if (!target || target.team !== 'enemy') return T('Выберите врага');
      const w = u.weapons[0];
      if (!this.canFire(u, w)) return;
      const aimB = tal(u, 'h_sniper') ? 6 : 4;
      if (this.hitChance(u, target, w, aimB) <= 0) return T('Цель вне досягаемости или не видна');
      this.run(async () => { this.float(u, 'Прицел…', '#d8c890'); await sleep(350); await this.attack(u, target, w, aimB); u.ap = 0; });
    } else if (key === 'wimp') { // Ферглоу призывает беса на соседнюю клетку
      if (cheb(u, { x: tx, y: ty }) !== 1 || !this.walk(tx, ty) || this.unitAt(tx, ty)) return T('Выберите свободную клетку рядом');
      this.run(async () => {
        u.abil.wimp--; u.ap = 0;
        const ok = check(4, 12).success; // опытный демонолог: почти всегда слушается
        this.float(u, '«Явись, слуга!»', '#e05030');
        const imp = mkUnit(ENEMIES.imp, ok ? 'player' : 'enemy', tx, ty);
        imp.flash = 0.3; imp.name = ok ? 'Бес Ферглоу' : 'Своевольный бес';
        if (ok) { imp.summon = 3; imp.ap = 0; }
        this.units.push(imp);
        this.burst(tx * CT + CT / 2, ty * CT + CT / 2, '#e05030', 26, 70);
        this.hooks.log(ok ? `${u.name} небрежно щёлкает пальцами — из воздуха выступает бес и кланяется ему. Служит 3 раунда.` : `Бес является, смотрит на ${u.name} и хихикает. Служить он не будет.`);
        await sleep(400);
      });
    } else if (key === 'rally') {
      if (!target || target.team !== 'player' || target === u || dist(u, target) > 6.5) return T('Выберите союзника в радиусе 6');
      this.run(async () => {
        u.abil.rally--; u.ap -= 1; target.ap = Math.min(3, target.ap + 1);
        this.float(u, '«Отряд, вперёд!»', '#e8d070');
        await sleep(300);
        this.float(target, '+1 ОД', '#e8d070');
        await sleep(250);
        this.gainCourage(target, '');
        this.hooks.log(`${u.name} поднимает дух: ${target.name} получает +1 ОД.`);
        await sleep(400);
      });
    } else if (key === 'bandage' || key === 'medkit') {
      const kit = key === 'medkit';
      if (!target || !this.isSquad(target) || cheb(u, target) > 1) return T('Выберите себя или соседнего бойца отряда');
      if ((kit ? G.supplies.medkit : G.supplies.bandage) <= 0) return T(kit ? 'Аптечек нет' : 'Бинты кончились');
      if (!target.downed && target.hp >= target.maxHp) return T('Союзник не ранен');
      this.run(async () => {
        if (kit) G.supplies.medkit--; else G.supplies.bandage--;
        u.ap -= 1;
        let amount = (kit ? medkitAmount(u.med) : bandageAmount(u.med)) + (tal(u, 'm_field') ? 2 : 0);          // «Полевой хирург»
        if (target.downed && tal(u, 'm_triage')) amount = Math.max(amount, Math.ceil(target.maxHp / 2)); // «Сортировка»
        if (target.downed) this.revive(target, amount);
        else { const h = Math.min(amount, target.maxHp - target.hp); target.hp += h; this.float(target, `+${h}`, '#8fdc7a'); }
        this.hooks.log(`${u.name}: ${kit ? 'аптечка' : 'перевязка'} — ${target === u ? 'себе' : target.name}.`);
        await sleep(400);
      });
    } else if (key === 'grenade' || key === 'smoke' || key === 'dynamite') {
      const range = (key === 'smoke' ? 6 : key === 'dynamite' ? 4 : 5) + (key !== 'smoke' && u.base.id === 'pc' && G.pc?.prof === 'saboteur' ? 1 : 0); // диверсант бросает дальше
      if (cheb(u, { x: tx, y: ty }) > range) return T(`Слишком далеко (макс. ${range} клеток)`);
      this.run(async () => {
        if (key === 'grenade') { G.supplies.grenade--; await this.grenade(u, tx, ty); u.ap = 0; }
        else if (key === 'dynamite') { G.supplies.dynamite--; await this.grenade(u, tx, ty, true); u.ap = 0; }
        else {
          G.supplies.smoke--; u.ap -= 1;
          this.float(u, 'Дым!', '#c8c8c0');
          this.smoke.push({ x: tx, y: ty, turns: 2 });
          this.burst(tx * CT + CT / 2, ty * CT + CT / 2, '#9a9a90', 40, 60);
          this.hooks.log(`${u.name} бросает дымовую гранату.`);
          await sleep(400);
        }
      });
    }
  },

  // ---------------------------------------------------------- манёвры куража
  useCourage(u: Unit, key: string, tx: number, ty: number, target?: Unit) {
    const T = (s: string) => this.hooks.toast(s);
    const block = this.courageBlock(u, key);
    if (block) return T(block);
    const spend = () => { u.courage -= COURAGE[key].cost; this.float(u, COURAGE[key].name + '!', '#f0a040'); };
    if (key === 'rush') {
      const n = this.reach?.get(ty * CW + tx);
      if (!n || n.d === 0) return T('Выберите клетку в пределах рывка');
      const path = pathTo(this.reach!, CW, tx, ty);
      this.run(async () => {
        spend(); u.ap -= 1;
        this.hooks.log(`${u.name}: отчаянный рывок под огнём!`);
        await this.moveAlong(u, path, 75);
        await this.underFire(u);
      });
    } else if (key === 'charge') {
      if (!target || target.team !== 'enemy' || target.dead) return T('Выберите врага');
      const spot = this.chargeTile(u, target);
      if (!spot) return T('Слишком далеко для броска (ход + 2 клетки)');
      const w = this.meleeWeapon(u)!;
      this.run(async () => {
        spend();
        this.hooks.log(`${u.name} бросается в штыковую!`);
        await this.moveAlong(u, pathTo(this.reach!, CW, spot.x, spot.y), 70);
        await this.attack(u, target, w, 2, { dmg: 2 });
        u.ap = 0;
        if (!tal(u, 's_stormer')) { u.exposed = true; if (!u.dead) this.float(u, 'Раскрыт: −2 Защита', '#d08060'); }
      });
    } else if (key === 'last') {
      if (!target || target.team !== 'enemy' || target.dead) return T('Выберите врага');
      const w = this.lastStandWeapon(u, target);
      if (!w) return T('Цель вне досягаемости');
      this.run(async () => {
        spend();
        this.hooks.log(`${u.name} идёт в последний натиск!`);
        await this.attack(u, target, w, 0, { dmg: 2, adv: true });
        u.ap = 0; if (!tal(u, 's_stormer')) u.exposed = true;
      });
    } else if (key === 'grit') {
      this.run(async () => {
        spend();
        const h = Math.min(3, u.maxHp - u.hp); u.hp += h; delete u.st.supp; delete u.st.weak;
        if (h) this.float(u, `+${h}`, '#8fdc7a');
        this.hooks.log(`${u.name} стискивает зубы и выпрямляется.`);
        await sleep(300);
      });
    } else if (key === 'brace') {
      this.run(async () => {
        spend(); u.st.brace = 1; u.ap = 0;
        this.float(u, '+3 Защита', '#c8d8a0');
        this.hooks.log(`${u.name} упирается и встаёт насмерть.`);
        await sleep(300);
      });
    } else if (key === 'inspire') {
      this.run(async () => {
        spend(); u.ap -= 1;
        this.hooks.log(`${u.name}: «Держаться! Ещё немного!»`);
        for (const p of this.alive('player').filter((x) => x !== u && !x.downed && dist(u, x) <= 5.5)) this.gainCourage(p, 'воодушевлён');
        await sleep(400);
      });
    } else if (key === 'pierce' || key === 'volley') {
      if (!target || target.team !== 'enemy' || target.dead) return T('Выберите врага');
      const w = this.gunOf(u, key === 'volley' ? 2 : 1)!;
      if (this.hitChance(u, target, w, key === 'pierce' ? 2 : 0) <= 0) return T('Цель вне досягаемости или не видна');
      this.run(async () => {
        spend();
        if (key === 'pierce') { this.hooks.log(`${u.name} целит в щель брони.`); await this.attack(u, target, w, 2, { pierce: true }); }
        else {
          this.hooks.log(`${u.name} открывает шквальный огонь!`);
          await this.attack(u, target, w, 0);
          if (!target.dead && !u.dead && !u.jam.includes(w) && (u.ammo[w] === undefined || u.ammo[w] > 0)) await this.attack(u, target, w, 0);
        }
        u.ap = 0;
      });
    } else if (key === 'rescue') {
      if (!target || !target.downed) return T('Выберите тяжелораненого союзника');
      const spot = cheb(u, target) === 1 ? { x: u.x, y: u.y } : this.chargeTile(u, target);
      if (!spot) return T('Слишком далеко (ход + 2 клетки)');
      this.run(async () => {
        spend();
        this.hooks.log(`${u.name} бросается к раненому товарищу!`);
        if (spot.x !== u.x || spot.y !== u.y) { await this.moveAlong(u, pathTo(this.reach!, CW, spot.x, spot.y), 75); await this.underFire(u); }
        if (!u.dead) this.revive(target, Math.ceil(target.maxHp / 4));
        u.ap = 0;
      });
    }
  },

  revive(t: Unit, hp: number) {
    t.dead = false; t.downed = false; t.ap = 0; t.flash = 0.3;
    if (t.rallyCharm) { hp = Math.max(hp, Math.ceil(t.maxHp / 2)); this.float(t, 'Медальон', '#e8d070'); }
    t.hp = Math.max(1, Math.min(t.maxHp, hp));
    this.float(t, `На ногах! ${t.hp} ОЗ`, '#8fdc7a');
    this.hooks.log(`${t.name} снова на ногах (${t.hp} ОЗ).`);
  },

  /** Огонь вслед: каждый видящий бойца вражеский стрелок стреляет с −3. */
  async underFire(u: Unit) {
    const shooters = this.alive('enemy').filter((e) => e.weapons.some((w) => WEAPONS[w].type === 'ranged' && this.attackInfo(e, e, u, w, -3)));
    for (const e of shooters.slice(0, 3)) {
      if (u.dead) break;
      const w = e.weapons.find((w) => WEAPONS[w].type === 'ranged')!;
      this.float(e, 'Огонь вслед!', '#d0614c');
      await this.attack(e, u, w, -3);
    }
  },

  async run(fn: () => Promise<void>) {
    this.busy = true; this.hooks.panel();
    await fn();
    this.busy = false;
    if (this.action.type !== 'w' && this.sel) this.action = { type: 'w', key: this.sel.weapons[0] };
    if (await this.checkEnd()) return;
    if (this.turn !== 'player') return;
    if (!this.sel || this.sel.dead || this.sel.ap <= 0) {
      const nx = this.alive('player').find((u) => u.ap > 0 && !u.ally);
      if (nx) this.select(nx);
      else { this.sel = null; this.reach = null; this.hooks.panel(); await sleep(300); this.endPlayerTurn(); }
    } else { this.computeReach(); this.hooks.panel(); }
  },

  // ---------------------------------------------------------- ход противника
  async endPlayerTurn() {
    if (this.turn !== 'player' || this.busy || this.ended) return;
    this.turn = 'enemy'; this.sel = null; this.reach = null; this.busy = true;
    this.hooks.panel();
    const allies = this.alive('player').filter((u) => u.ally);
    if (allies.length) { // союзники стычки ходят после отряда
      await this.showBanner('ХОД СОЮЗНИКОВ', '#a8c080');
      for (const a of allies) { if (a.dead) continue; a.ap = 2; await this.aiAct(a); if (await this.checkEnd()) return; await sleep(120); }
    }
    await this.showBanner('ХОД ПРОТИВНИКА', '#d0614c');
    for (const e of this.alive('enemy')) {
      if (e.dead) continue;
      e.ap = 2;
      await this.aiAct(e);
      if (await this.checkEnd()) return;
      await sleep(120);
    }
    this.busy = false;
    this.round++;
    this.startPlayerTurn();
  },

  nearestPlayer(p: Pt) {
    let best: Unit | null = null, bd = 1e9;
    for (const u of this.foes()) { const d = dist(p, u); if (d < bd) { bd = d; best = u; } }
    return best;
  },
  bestAttack(u: Unit, pos: Pt) {
    let best: { t: Unit; w: string; c: number; score: number } | null = null;
    for (const w of u.weapons) {
      if (this.outOf(u, w)) continue;
      for (const t of this.foes()) {
        const c = this.attackInfo(u, pos, t, w)?.chance ?? 0;
        if (c <= 0) continue;
        const score = c + (t.hp <= WEAPONS[w].dmg[1] ? 15 : 0) + (t.leader ? 5 : 0);
        if (!best || score > best.score) best = { t, w, c, score };
      }
    }
    return best;
  },

  /** Кончились заряды (у врагов счёт бывает и у оружия без магазина — например, одно ружьё на бой). */
  outOf(u: Unit, w: string) { return (WEAPONS[w].ammo || u.ammo[w] !== undefined) && u.ammo[w] <= 0; },

  /** Чей ход ИИ сейчас: враги ищут цели среди отряда и союзников, союзники — среди врагов. */
  aiFor: null as Unit | null,
  foes() { return this.alive(this.aiFor && this.aiFor.team === 'player' ? 'enemy' : 'player'); },
  async aiAct(u: Unit): Promise<void> {
    this.aiFor = u;
    if (u.ai === 'caster') return this.aiCaster(u);
    if (u.ai === 'breath') return this.aiBreath(u);
    // стрелок без зарядов идёт врукопашную
    if (u.ai === 'ranged' && !u.weapons.some((w) => WEAPONS[w].type === 'ranged' && !this.outOf(u, w))) u.ai = 'melee';
    for (let guard = 0; u.ap > 0 && !u.dead && guard < 3; guard++) {
      const here = this.bestAttack(u, u);
      if (u.ai === 'melee') {
        if (here) { await this.attack(u, here.t, here.w); break; }
        const path = this.meleePath(u);
        if (!path || path.length < 2) break;
        await this.moveAlong(u, path); u.ap--;
      } else {
        // стрелок: цель — лучшее укрытие поближе к отряду, на рабочей дистанции своего оружия (а не просто ближайшее);
        // до него идёт за один-два хода, по пути стреляет, если уже стоит в укрытии с хорошим выстрелом
        const goal = this.coverGoal(u), hereScore = this.goalScore(u, u, 0);
        if (!goal || goal.path.length <= 1 || goal.score <= hereScore + 4) { if (here) await this.attack(u, here.t, here.w); break; }
        const mv = this.mv(u), reachNow = goal.path.length - 1 <= mv;
        if (here && !reachNow && (u.ap < 2 || (this.coverVsAll(u, u) >= 25 && here.c >= 55))) { await this.attack(u, here.t, here.w); break; }
        if (reachNow && goal.cover > this.coverVsAll(u, u) + 5) this.float(u, 'В укрытие', '#c8c0a0');
        else if (!reachNow) this.float(u, 'Перебежка', '#c8c0a0');
        await this.moveAlong(u, reachNow ? goal.path : this.bound(u, goal.path[goal.path.length - 1])); u.ap--;
      }
    }
    u.ap = 0;
  },

  /** Тварь с дыханием (морской демон): идёт на отряд, выдыхает облако туда, где заденет больше бойцов, потом дерётся вблизи. */
  async aiBreath(u: Unit): Promise<void> {
    const bw = u.weapons.find((w) => WEAPONS[w].breath && !this.outOf(u, w));
    if (!bw) { u.ai = 'melee'; return this.aiAct(u); }
    for (let guard = 0; u.ap > 0 && !u.dead && guard < 3; guard++) {
      // цель — та, по направлению к которой в полосу попадёт больше бойцов отряда
      let best: { t: Unit; n: number; d: number } | null = null;
      for (const t of this.foes()) {
        if (!this.attackInfo(u, u, t, bw)) continue;
        const n = this.breathCells(u, t, WEAPONS[bw].breath!).filter((c) => this.units.some((o) => !o.dead && o.team === 'player' && o.x === c.x && o.y === c.y)).length;
        const d = dist(u, t);
        if (n && (!best || n > best.n || (n === best.n && d < best.d))) best = { t, n, d };
      }
      if (best) { await this.attack(u, best.t, bw); break; }
      // никого не достать — вблизи укусить, иначе подойти
      const here = this.bestAttack(u, u);
      if (here && WEAPONS[here.w].type === 'melee') { await this.attack(u, here.t, here.w); break; }
      const path = this.meleePath(u);
      if (!path || path.length < 2) break;
      await this.moveAlong(u, path); u.ap--;
    }
    u.ap = 0;
  },
  /** Клетки облака дыхания: n клеток от a в сторону t, до стены. */
  breathCells(a: Pt, t: Pt, n: number): Pt[] {
    const dx = t.x - a.x, dy = t.y - a.y, m = Math.max(1, Math.abs(dx), Math.abs(dy)), cells: Pt[] = [];
    for (let k = 1; k <= n; k++) {
      const c = { x: Math.round(a.x + (dx * k) / m), y: Math.round(a.y + (dy * k) / m) };
      if (c.x < 0 || c.y < 0 || c.x >= CW || c.y >= CH || this.map[c.y][c.x] === '#') break; // в стену облако не идёт
      cells.push(c);
    }
    return cells;
  },

  meleePath(u: Unit) {
    const reach = bfs(CW, CH, u.x, u.y, (x, y) => this.free(x, y), null);
    let best: { x: number; y: number; d: number } | null = null;
    for (const t of this.foes()) for (const [dx, dy] of DIRS8) {
      const n = reach.get((t.y + dy) * CW + t.x + dx);
      if (n && (!best || n.d < best.d)) best = n;
    }
    if (!best) {
      let bd = 1e9;
      for (const n of reach.values()) { const p = this.nearestPlayer(n); if (!p) continue; const d = dist(n, p); if (d < bd) { bd = d; best = n; } }
    }
    if (!best) return null;
    return pathTo(reach, CW, best.x, best.y).slice(0, this.mv(u) + 1);
  },

  /** Лучшее укрытие клетки n от каждого врага, который её видит (среднее; 0 — открыто, 40 — полное). Кого не видно — тот не опасен. */
  coverVsAll(u: Unit, n: Pt) {
    const foes = this.foes(); let sum = 0, cnt = 0;
    for (const p of foes) { if (!this.los(p, n)) { sum += 40; cnt++; continue; } sum += this.coverOf(n, p); cnt++; }
    return cnt ? sum / cnt : 40;
  },
  /** Оценка клетки для стрелка: шанс попасть + укрытие − открытость под огнём − близость к врагу + держать дистанцию оружия. */
  tileScore(u: Unit, n: Pt, steps: number) {
    const foes = this.foes(); if (!foes.length) return -1e9;
    const at = this.bestAttack(u, n), np = this.nearestPlayer(n)!, nd = dist(n, np);
    let exposed = 0;
    for (const p of foes) if (this.los(p, n)) { const c = this.coverOf(n, p); exposed += c >= 40 ? 0 : c >= 25 ? 0.45 : 1; }
    const w = at ? WEAPONS[at.w] : WEAPONS[u.weapons.find((k) => WEAPONS[k].type === 'ranged') ?? u.weapons[0]];
    const want = w.type === 'ranged' ? Math.max(2, (w.opt ?? 4) - 1) : 1, lowHp = u.hp <= u.maxHp * 0.35;
    let score = (at ? at.c : -40) - exposed * 16 + this.coverVsAll(u, n) * 0.35 - steps * 1.2;
    score -= Math.abs(nd - want) * (lowHp ? 0 : 1.5);
    if (nd < 2 && (w.closePen ?? 3) > 0) score -= 22;           // в упор длинным стволом — плохо, отойти
    if (lowHp) score += Math.min(nd, 10) * 2.5 - exposed * 10;   // ранен — держаться подальше и в укрытии
    if (!at) score -= nd * 6;                                     // стрелять не из чего — сблизиться (короткоствольные — тем более)
    return score;
  },
  /** Оценка клетки как цели для стрелка: укрытие важнее всего, затем рабочая дистанция до отряда, выстрел оттуда и путь. */
  goalScore(u: Unit, n: Pt, turns: number) {
    const foes = this.foes(); if (!foes.length) return -1e9;
    const at = this.bestAttack(u, n), np = this.nearestPlayer(n)!, nd = dist(n, np);
    const wk = at?.w ?? u.weapons.find((k) => WEAPONS[k].type === 'ranged' && !this.outOf(u, k)) ?? u.weapons[0], w = WEAPONS[wk];
    const lowHp = u.hp <= u.maxHp * 0.35;
    const want = (w.type === 'ranged' ? clamp((w.opt ?? 4) - 2, 2, 5) : 1) + (lowHp ? 3 : 0); // подойти поближе, но не в упор
    let exposed = 0;
    for (const p of foes) if (this.los(p, n)) { const c = this.coverOf(n, p); exposed += c >= 40 ? 0 : c >= 25 ? 0.4 : 1; }
    let s = this.coverVsAll(u, n) * (lowHp ? 1.6 : 1.1) - exposed * 9 + (at ? at.c * 0.3 : -22) - Math.abs(nd - want) * 3.5 - turns * 2.5;
    const cp = w.type === 'ranged' ? (w.closePen ?? 3) : 0;
    if (foes.some((p) => cheb(p, n) === 1)) s -= cp > 0 ? 15 + cp * 8 : 6; // длинным стволом в упор — плохо, тем хуже, чем длиннее ствол
    for (const o of this.units) if (o !== u && !o.dead && o.team === u.team && cheb(o, n) === 1) s -= 3; // не кучковаться под гранату
    return s;
  },
  /** Перебежка к далёкой цели: из клеток в пределах хода — та, что ближе к цели и лучше укрыта (от укрытия к укрытию, а не по открытому). */
  bound(u: Unit, goal: Pt): Pt[] {
    const toGoal = bfs(CW, CH, goal.x, goal.y, (x, y) => this.free(x, y) || (x === u.x && y === u.y), null);
    const reach = bfs(CW, CH, u.x, u.y, (x, y) => this.free(x, y), this.mv(u));
    const gd = (q: Pt) => toGoal.get(q.y * CW + q.x)?.d ?? 99, d0 = gd(u);
    let best: Pt | null = null, bs = -1e9;
    for (const n of reach.values()) {
      if (!n.d || gd(n) >= d0) continue; // только вперёд, к цели
      let exposed = 0;
      for (const p of this.foes()) if (this.los(p, n)) { const c = this.coverOf(n, p); exposed += c >= 40 ? 0 : c >= 25 ? 0.4 : 1; }
      const sc = this.coverVsAll(u, n) * 0.8 - exposed * 6 - gd(n) * 2.5;
      if (sc > bs) { bs = sc; best = n; }
    }
    return best ? pathTo(reach, CW, best.x, best.y) : [];
  },
  /** Лучшее укрытие на всём поле (с учётом, сколько ходов до него идти); занятые другими стрелками клетки не берёт. */
  coverGoal(u: Unit) {
    const reach = bfs(CW, CH, u.x, u.y, (x, y) => this.free(x, y), null), mv = Math.max(1, this.mv(u));
    const claimed = new Set(this.units.filter((o) => o !== u && !o.dead && o.team === u.team && o.goal !== undefined).map((o) => o.goal!));
    let best: { n: Pt & { d: number }; score: number } | null = null;
    for (const n of reach.values()) {
      if (n.d && claimed.has(n.y * CW + n.x)) continue;
      const sc = this.goalScore(u, n, Math.ceil(n.d / mv));
      if (!best || sc > best.score) best = { n, score: sc };
    }
    if (u.goal !== undefined && best) { // прежняя цель, если она почти так же хороша — чтобы не метаться
      const g = reach.get(u.goal);
      if (g && !claimed.has(u.goal)) { const sc = this.goalScore(u, g, Math.ceil(g.d / mv)); if (sc >= best.score - 5) best = { n: g, score: sc }; }
    }
    if (!best) return null;
    u.goal = best.n.y * CW + best.n.x;
    return { score: best.score, cover: this.coverVsAll(u, best.n), path: pathTo(reach, CW, best.n.x, best.n.y) };
  },
  rangedTile(u: Unit) {
    const reach = bfs(CW, CH, u.x, u.y, (x, y) => this.free(x, y), this.mv(u));
    let best: { score: number; c: number; n: Pt; cover: number } | null = null;
    for (const n of reach.values()) {
      const sc = this.tileScore(u, n, n.d);
      if (!best || sc > best.score) best = { score: sc, c: this.bestAttack(u, n)?.c ?? 0, n, cover: this.coverVsAll(u, n) };
    }
    return best ? { score: best.score, c: best.c, cover: best.cover, path: pathTo(reach, CW, best.n.x, best.n.y) } : null;
  },

  /** Демонолог: призывает бесов, насылает ужас, жжёт зелёным пламенем, держит дистанцию. */
  async aiCaster(u: Unit) {
    u.cd.summon--; u.cd.whisper--;
    const imps = this.alive('enemy').filter((e) => e.kind === 'imp').length;
    if (u.cd.summon <= 0 && imps < 2) {
      const spot = this.freeNear(u, 2);
      if (spot) { await this.summon(u, spot); u.ap--; u.cd.summon = 3; }
    }
    if (u.ap > 0 && this.foes().some((p) => cheb(p, u) === 1)) {
      const reach = bfs(CW, CH, u.x, u.y, (x, y) => this.free(x, y), this.mv(u));
      let best: Pt | null = null, bs = -1e9;
      for (const n of reach.values()) {
        const np = this.nearestPlayer(n)!;
        const s = dist(n, np) * 3 + (this.bestAttack(u, n) ? 10 : 0) + this.coverOf(n, np) * 0.2;
        if (s > bs) { bs = s; best = n; }
      }
      if (best && (best.x !== u.x || best.y !== u.y)) {
        this.float(u, 'Шаг в тень', '#9fef6a');
        await this.moveAlong(u, pathTo(reach, CW, best.x, best.y)); u.ap--;
      }
    }
    if (u.ap <= 0) return;
    let here = this.bestAttack(u, u);
    if (!here) {
      const opt = this.rangedTile(u);
      if (opt && opt.path.length > 1) { await this.moveAlong(u, opt.path); u.ap--; }
      here = this.bestAttack(u, u);
    }
    if (!here || u.ap <= 0) { u.ap = 0; return; }
    const targets = this.foes().filter((p) => !p.terror && dist(u, p) <= 8 && this.los(u, p));
    if (u.cd.whisper <= 0 && targets.length && Math.random() < 0.45) {
      await this.whisper(u, targets.find((p) => p.leader) ?? pick(targets));
      u.cd.whisper = 3;
    } else await this.attack(u, here.t, here.w);
    u.ap = 0;
  },

  /** Ближайшая к точке свободная клетка (а не случайная) — чтобы лишние бойцы отряда встали плечом к плечу. */
  closestFree(u: Pt, r: number): Pt | null {
    let best: Pt | null = null, bd = 1e9;
    for (let y = u.y - r; y <= u.y + r; y++) for (let x = u.x - r; x <= u.x + r; x++) if (this.free(x, y)) { const d = Math.hypot(x - u.x, y - u.y); if (d < bd) { bd = d; best = { x, y }; } }
    return best;
  },
  freeNear(u: Pt, r: number): Pt | null {
    const spots: Pt[] = [];
    for (let y = u.y - r; y <= u.y + r; y++) for (let x = u.x - r; x <= u.x + r; x++) if (this.free(x, y)) spots.push({ x, y });
    return spots.length ? pick(spots) : null;
  },

  // ---------------------------------------------------------- действия
  async attack(a: Unit, t: Unit, wkey: string, bonus = 0, opts: { dmg?: number; adv?: boolean; pierce?: boolean } = {}) {
    const w = WEAPONS[wkey];
    if (w.breath) return this.breathAttack(a, t, wkey, bonus);
    if (!a.fired.includes(wkey)) a.fired.push(wkey);
    if (w.burst) return this.burstAttack(a, t, wkey, bonus);
    if (t.x !== a.x) a.flip = t.x < a.x;
    const once = { fortune: !!a.st.fortune, omen: !!a.st.omen };
    if (a.st.pact) opts = { ...opts, dmg: (opts.dmg ?? 0) + 2 }; // демонический договор
    const galv = a.galv && WEAPONS[wkey].type === 'melee';
    if (galv) { bonus += 2; opts = { ...opts, dmg: (opts.dmg ?? 0) + 2 }; a.galv = false; }
    const info = this.attackInfo(a, a, t, wkey, bonus) ?? { bonus: 0, dc: 99, chance: 0 };
    if (once.fortune) delete a.st.fortune;   // благоприятный час и дурной знак — на одну атаку
    if (once.omen) delete a.st.omen;
    let roll: CheckResult = check(info.bonus, info.dc);
    let advTxt = '';
    if (opts.adv) { // преимущество: бросаем дважды, берём лучший
      const r2 = check(info.bonus, info.dc);
      advTxt = ` / ${r2.roll}`;
      if ((r2.success && !roll.success) || (r2.success === roll.success && r2.total > roll.total)) roll = r2;
    }
    const ch = opts.adv ? this.advChance(info.chance) : info.chance, hit = roll.success;
    const rollTxt = `3d6: ${roll.roll}${advTxt}${info.bonus >= 0 ? '+' : ''}${info.bonus} против ${info.dc}`;
    if (this.jams(a, wkey, roll.roll)) return;
    if (w.ammo || a.ammo[wkey] !== undefined) a.ammo[wkey]--;
    if (w.type === 'ranged') Sfx.shot(wkey);
    if (a.emptyNote && a.ammo[wkey] === 0) { this.hooks.log(a.emptyNote); a.emptyNote = undefined; }
    if (w.type === 'melee') await this.lunge(a, t);
    else if (w.magic) { await this.projectile(a, t, '#9fef6a', 320); this.burst(t.px, t.py - 12, '#9fef6a', 26, 90); }
    else { this.muzzle(a, t, hit); await sleep(140); }
    if (hit && w.gas && t.gas) { // противогаз держит газ целиком
      this.float(t, 'Противогаз', '#a8b860');
      this.hooks.log(`${a.name} → ${t.name}: ${w.name} — противогаз держит, газ не действует [${rollTxt}]`);
    } else if (hit) {
      if (w.type === 'melee') Sfx.hit(wkey);
      let d = randInt(w.dmg[0], w.dmg[1]) + (w.type === 'melee' ? a.dmgM : 0) + (opts.dmg ?? 0) - (a.st.weak ? 1 : 0);
      if (w.type === 'melee' && a.worn.includes(wkey)) d -= 1; // затупилось, расшаталось
      if (w.antiDemon && t.demonic) d += w.antiDemon;
      if (tal(a, 'b_knife') && KNIVES.includes(wkey)) d += 2;                                    // «Ножевой бой»
      if (tal(a, 'h_hunter') && (t.demonic || t.base.id.startsWith('dead_'))) d += 2;             // «Охотник на нечисть»
      if (tal(a, 't_tuned') && w.type === 'ranged' && !w.magic) d += 1;                            // «Подстройка оружия»
      d = Math.max(1, d);
      if (w.shot) d = Math.max(1, d - Math.max(0, Math.floor(dist(a, t) - w.opt!)) - (t.splinter ? 1 : 0)); // дробь теряет силу
      const crit = roll.crit || (tal(a, 'h_deadeye') && w.type === 'ranged' && roll.roll >= 15); // 16+ на костях (у «Смертельного выстрела» — 15+): полуторный урон, броня не спасает
      if (crit) d = Math.ceil(d * 1.5);
      const absorbed = crit || w.pierce || w.gas || opts.pierce ? 0 : Math.min(d - 1, t.armor); // газ броня не держит — только противогаз
      d -= absorbed;
      this.hooks.log(`${a.name} → ${t.name}: ${w.name}, ${crit ? 'КРИТ! ' : ''}${d} урона${absorbed ? ` (броня −${absorbed})` : ''} [${rollTxt}]`);
      await this.damage(t, d, crit);
      if (w.poison && !t.gas && t.team === 'player' && !t.dead && this.isSquad(t) && addWoundId(t.base, 'gassed')) { this.float(t, 'Отравление', '#a8c890'); this.hooks.log(`${t.name}: пагубное дыхание — «Отравление газом».`); }
      if (crit) this.gainCourage(a, 'точный удар');
      if (t.dead && t.team === 'enemy') this.gainCourage(a, 'враг повержен');
      if (w.splash) {
        for (const o of this.units.filter((o) => !o.dead && o !== t && cheb(o, t) === 1)) {
          if (w.gas) { await this.gasHit(o); continue; } // газ задевает соседей — противогаз спасает
          await this.damage(o, Math.max(1, randInt(w.splash[0], w.splash[1]) - (o.splinter ? 1 : 0)), false);
        }
      }
    } else {
      this.float(t, 'Промах', '#b8b8a8');
      this.hooks.log(`${a.name} промахивается по цели «${t.name}» [${rollTxt}, шанс был ${ch}%]`);
    }
    await sleep(260);
    if (galv) { // отдача гальванической руки
      const str = a.team === 'player' && a.leader ? (G.pc?.attrs.str ?? 0) : 0, r = check(str, 12);
      if (!r.success) { a.hp = Math.max(1, a.hp - 1); this.float(a, '−1 (разряд)', '#d8ff70'); this.hooks.log(`Отдача разряда: ${a.name} теряет 1 ОЗ [Сила: 3d6 ${r.roll}${str >= 0 ? '+' : ''}${str} против 12].`); }
      else this.hooks.log(`${a.name} выдерживает отдачу разряда [Сила: 3d6 ${r.roll}${str >= 0 ? '+' : ''}${str} против 12].`);
    }
  },

  /** Изношенный огнестрел клинит на 6 и меньше на 3d6 (≈9%): выстрела нет, патрон испорчен. */
  jams(a: Unit, wkey: string, roll: number) {
    if (!a.worn.includes(wkey) || !WEAPONS[wkey].ammoType || roll > 6) return false;
    if (a.ammo[wkey] > 0) a.ammo[wkey]--;
    a.jam.push(wkey);
    this.float(a, 'Заклинило!', '#e8a050');
    this.burst(a.px + (a.flip ? -14 : 14), a.py - 14, '#8a8a80', 6, 30);
    this.hooks.log(`${a.name}: ${WEAPONS[wkey].name} клинит — изношенный механизм. Нужна перезарядка, чтобы расклинить.`);
    return true;
  },

  /** Пулемётная очередь: несколько выстрелов с −3, каждый — свой бросок; цель и всех рядом с ней прижимает (подавление). */
  async burstAttack(a: Unit, t: Unit, wkey: string, bonus: number) {
    const w = WEAPONS[wkey];
    if (t.x !== a.x) a.flip = t.x < a.x;
    const shots = Math.min(w.burst!, a.ammo[wkey] ?? w.burst!);
    this.hooks.log(`${a.name} открывает огонь на подавление: ${w.name}, очередь в ${shots}.`);
    let hits = 0;
    for (let k = 0; k < shots && !t.dead; k++) {
      const info = this.attackInfo(a, a, t, wkey, bonus - 3) ?? { bonus: 0, dc: 99, chance: 0 };
      const roll = check(info.bonus, info.dc), rt = `3d6: ${roll.roll}${info.bonus >= 0 ? '+' : ''}${info.bonus} против ${info.dc}`;
      if (this.jams(a, wkey, roll.roll)) break;
      a.ammo[wkey]--;
      Sfx.shot(wkey);
      this.muzzle(a, t, roll.success);
      await sleep(110);
      if (!roll.success) { this.hooks.log(`  пуля ${k + 1}: мимо [${rt}]`); continue; }
      hits++;
      let d = randInt(w.dmg[0], w.dmg[1]) - (a.st.weak ? 1 : 0);
      if (roll.crit) d = Math.ceil(d * 1.5);
      const absorbed = roll.crit ? 0 : Math.min(d - 1, t.armor);
      d = Math.max(1, d - absorbed);
      this.hooks.log(`  пуля ${k + 1}: ${roll.crit ? 'КРИТ! ' : ''}${d} урона${absorbed ? ` (броня −${absorbed})` : ''} [${rt}]`);
      await this.damage(t, d, roll.crit);
      if (roll.crit) this.gainCourage(a, 'точный удар');
      if (t.dead && t.team === 'enemy') this.gainCourage(a, 'враг повержен');
    }
    if (!hits) this.float(t, 'Промах', '#b8b8a8');
    // подавление: цель и все её соседи из той же стороны прижаты до конца своего хода
    const pinned = this.units.filter((o) => !o.dead && !o.downed && o.team === t.team && cheb(o, t) <= 1);
    for (const o of pinned) { if (tal(o, 'h_calm')) { this.float(o, 'Не дрогнул', '#c8d8a0'); continue; } o.st.supp = o.team === 'player' ? 2 : 1; this.float(o, 'Подавлен', '#e8c070'); }
    if (pinned.length) this.hooks.log(`Под огнём: ${pinned.map((o) => o.name).join(', ')} — −2 к атакам и к перемещению на ход.`);
    await sleep(260);
  },

  /** После боя: оружие, которым работали, изнашивается (идеальное → изношенное, изношенное → сломанное). */
  wearAfterBattle(): string[] {
    const out: string[] = [];
    for (const u of this.units) {
      if (!this.isSquad(u) || !u.base.equip) continue;
      for (const slot of ['main', 'side'] as const) {
        const id = u.base.equip[slot];
        if (!id) continue;
        const it = itemOf(id), c = condOf(id);
        if (!it.weapon || !u.fired.includes(it.weapon) || c === 'broken') continue;
        const fire = !!WEAPONS[it.weapon].ammoType;
        const careful = this.units.some((x) => this.isSquad(x) && tal(x, 't_careful')) ? 0.5 : 1; // «Бережный ремонт»
        if (Math.random() >= (c === 'ok' ? (fire ? 0.08 : 0.05) : (fire ? 0.12 : 0.08)) * careful) continue;
        if (c === 'ok') { u.base.equip[slot] = withCond(id, 'worn'); out.push(`${u.name}: ${it.name} — оружие износилось, ${fire ? 'может клинить' : 'бьёт слабее'}.`); }
        else { delete u.base.equip[slot]; G.stash.push(withCond(id, 'broken')); out.push(`${u.name}: ${it.name} — оружие сломалось и убрано в обоз, нужна починка.`); }
      }
    }
    return out;
  },

  /** Зловонное дыхание: облако на w.breath клеток вперёд по направлению к цели; каждый в полосе — бросок атаки, урон и слабость. */
  async breathAttack(a: Unit, t: Unit, wkey: string, bonus: number) {
    const w = WEAPONS[wkey], n = w.breath!;
    if (t.x !== a.x) a.flip = t.x < a.x;
    const cells = this.breathCells(a, t, n);
    if (a.ammo[wkey] !== undefined) a.ammo[wkey]--; // дыхание — раз за бой
    this.hooks.log(`${a.name} извергает зловонное дыхание!`);
    this.fx.push({ type: 'breath', x1: a.px, y1: a.py, x2: 0, y2: 0, color: '#8a9a3a', life: 1.8, max: 1.8, cells });
    this.shake = Math.max(this.shake, 2.5);
    await sleep(420);
    for (const c of cells) {
      const v = this.units.find((u) => !u.dead && u !== a && u.x === c.x && u.y === c.y);
      if (!v) continue;
      if (v.gas) { this.float(v, 'Противогаз', '#a8b860'); this.hooks.log(`${v.name}: противогаз держит — зловоние не действует.`); continue; }
      const info = this.attackInfo(a, a, v, wkey, bonus) ?? { bonus: w.atk + bonus, dc: v.def, chance: 0 };
      const roll = check(info.bonus, info.dc), rt = `3d6: ${roll.roll}${info.bonus >= 0 ? '+' : ''}${info.bonus} против ${info.dc}`;
      if (!roll.success) { this.float(v, 'Увернулся', '#b8b8a8'); this.hooks.log(`${v.name} успевает отвернуться от облака [${rt}]`); continue; }
      const d = randInt(w.dmg[0], w.dmg[1]);
      this.hooks.log(`${a.name} → ${v.name}: ${w.name}, ${d} урона, слабость на 2 раунда (−2 к атакам, −1 к урону) [${rt}]`);
      await this.damage(v, d, false);
      if (!v.dead) { v.st.weak = 3; this.float(v, 'Слабость', '#a8b860'); }
      await sleep(120);
    }
    await sleep(300);
  },

  async damage(u: Unit, d: number, crit: boolean) {
    u.hp -= d; u.flash = 0.22;
    this.float(u, `${crit ? '‼ ' : ''}−${d}`, crit ? '#ffcf5a' : '#ff6a5a');
    this.shake = Math.max(this.shake, crit ? 7 : 3.5);
    this.burst(u.px, u.py - 10, u.demonic ? '#3a0a08' : '#7a1010', 10, 60);
    if (u.hp <= 0) { u.hp = 0; await this.kill(u); return; }
    if (u.team === 'player') {
      if (crit) { // крит по бойцу отряда оставляет лёгкое ранение
        const wd = addWound(u.base, false);
        if (wd) { this.float(u, wd.name, '#e09080'); this.hooks.log(`${u.name}: ранение «${wd.name}» — ${wd.desc}`); }
      }
      this.gainCourage(u, 'устоял');
    }
  },

  /** Газ травит всех в облаке, кроме мертвецов и тех, кто в противогазе. */
  async gasHit(o: Unit) {
    if (o.dead || o.base.id.startsWith('dead_')) return;
    if (o.gas) { this.float(o, 'Противогаз', '#a8b860'); return; }
    await this.damage(o, randInt(1, 2), false);
    if (!o.dead && this.isSquad(o) && addWoundId(o.base, 'gassed')) { this.float(o, 'Отравление', '#a8c890'); this.hooks.log(`${o.name}: газ — «Отравление газом».`); }
  },
  /** Начало раунда: газовые облака травят стоящих в них и редеют. */
  async tickGas() {
    for (const g of this.gasClouds) {
      for (const o of this.units.filter((o) => !o.dead && cheb(o, g) <= 1)) await this.gasHit(o);
      g.turns--;
    }
    this.gasClouds = this.gasClouds.filter((g) => g.turns > 0);
  },

  async kill(u: Unit) {
    u.dead = true;
    if (u.base.id === 'dead_gas') { // смертник: лопается — газ на соседние клетки
      this.gasClouds.push({ x: u.x, y: u.y, turns: 2 });
      this.burst(u.px, u.py - 10, '#9aaa40', 34, 90); this.burst(u.px, u.py - 6, '#6a7a2a', 20, 50);
      this.float(u, 'Газ!', '#b8c860'); this.shake = Math.max(this.shake, 5);
      this.hooks.log(`${u.name} лопается — облако газа накрывает соседние клетки!`);
      await sleep(250);
      for (const o of this.units.filter((o) => o !== u && !o.dead && cheb(o, u) <= 1)) await this.gasHit(o);
      return;
    }
    if (u.base.id === 'dead_gren' && Math.random() < 0.5) { // гренадер: падая, разжимает руку — граната на поясе рвётся
      this.burst(u.px, u.py - 8, '#e0a050', 30, 80); this.burst(u.px, u.py - 4, '#5a4a3a', 22, 60);
      this.float(u, 'Взрыв!', '#f0b060'); this.shake = Math.max(this.shake, 6);
      this.hooks.log(`${u.name} падает — и граната у него на поясе рвётся!`);
      await sleep(250);
      for (const o of this.units.filter((o) => o !== u && !o.dead && cheb(o, u) <= 1)) await this.damage(o, Math.max(1, randInt(2, 4) - (o.splinter ? 1 : 0)), false);
      return;
    }
    if (u.kind === 'imp') { // бес не оставляет тела — рассыпается в прах
      u.fled = true;
      this.burst(u.px, u.py - 10, '#6a5a50', 26, 70);
      this.burst(u.px, u.py - 4, '#3a2e28', 18, 40);
      this.float(u, 'Прах', '#b8a890');
      this.hooks.log(`${u.name} рассыпается в прах.`);
      await sleep(300);
      return;
    }
    if (u.team === 'player' && this.isSquad(u)) { // бойцы отряда не гибнут, а падают тяжело ранеными
      u.downed = true; u.courage = 0; u.terror = false;
      const wd = addWound(u.base, true);
      this.float(u, 'Тяжело ранен' + (u.base.id === 'pc' && G.pc?.gender === 'f' ? 'а' : ''), '#e05040');
      this.hooks.log(`${u.name}: тяжёлое ранение${wd ? ` «${wd.name}»` : ''}. Бойца можно поднять перевязкой или спасти.`);
      await sleep(300);
      return;
    }
    this.hooks.log(`${u.name} повержен.`);
    if (u.kind === 'smith') { // без вожака ополчение разбегается
      for (const e of this.alive('enemy')) {
        if ((e.kind === 'militia' || e.kind === 'militia_gun') && Math.random() < 0.6) {
          e.dead = true; e.fled = true;
          this.float(e, 'Бежит!', '#ddd');
          this.hooks.log(`${e.name} бросает оружие и бежит.`);
        }
      }
    }
    if (u.kind === 'cultist') {
      for (const e of this.alive('enemy')) {
        e.dead = true; e.fled = true;
        if (e.kind === 'imp') this.burst(e.px, e.py - 8, '#9fef6a', 20, 80);
        else this.float(e, 'Сдаётся', '#ddd');
      }
      this.hooks.log('Бесы рассеиваются. Фанатики бросают оружие.');
    }
    await sleep(300);
  },

  async summon(u: Unit, spot: Pt) {
    this.float(u, '«Явись!»', '#9fef6a');
    const x = spot.x * CT + CT / 2, y = spot.y * CT + CT / 2;
    this.fx.push({ type: 'ring', x1: x, y1: y, x2: 0, y2: 0, color: '#9fef6a', life: 0.7, max: 0.7 });
    this.burst(x, y, '#9fef6a', 30, 70);
    await sleep(500);
    const imp = mkUnit(ENEMIES.imp, 'enemy', spot.x, spot.y);
    imp.flash = 0.3;
    this.units.push(imp);
    this.hooks.log(`${u.name} призывает беса из-за Ока!`);
    await sleep(350);
  },

  async whisper(u: Unit, t: Unit) {
    this.float(u, '«Смотри в Око…»', '#b58cff');
    await this.projectile(u, t, '#b58cff', 500);
    const save = check(t.horror + (G.flags.salts ? 4 : 0) + (t.st.ward ? 4 : 0), 12);
    if (!save.success) {
      t.terror = true;
      if (t.courage) this.hooks.log(`Ужас гасит кураж: ${t.name} теряет его.`);
      t.courage = 0;
      this.float(t, 'Ужас!', '#b58cff');
      this.hooks.log(`Шёпот Бездны: ${t.name} охвачен ужасом (в следующем ходу 1 ОД).`);
    } else {
      this.float(t, 'Устоял', '#ddd');
      this.hooks.log(`${t.name} устоял перед Шёпотом Бездны.`);
    }
    await sleep(300);
  },

  async grenade(u: Unit, tx: number, ty: number, dyn = false) {
    const x = tx * CT + CT / 2, y = ty * CT + CT / 2;
    this.float(u, dyn ? 'Динамит!' : 'Граната!', '#e8d070');
    const sx = u.px, sy = u.py - 16;
    await this.tween(420, (k) => {
      this.parts.push({ x: lerp(sx, x, k), y: lerp(sy, y, k) - Math.sin(k * Math.PI) * 70, vx: 0, vy: 0, life: 0.25, max: 0.25, color: '#666', size: 2, g: 0 });
    });
    this.shake = dyn ? 15 : 11;
    this.burst(x, y, '#ffb050', dyn ? 60 : 40, dyn ? 200 : 160); this.burst(x, y, '#555', dyn ? 45 : 30, 90);
    this.fx.push({ type: 'ring', x1: x, y1: y, x2: 0, y2: 0, color: '#ffb050', life: 0.4, max: 0.4 });
    this.hooks.log(dyn ? `${u.name} бросает динамитную шашку!` : `${u.name} бросает гранату!`);
    if (dyn) { // лёгкие укрытия — мешки, ящики, заборы — разносит
      let broke = 0;
      for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) {
        if (yy < 0 || xx < 0 || yy >= CH || xx >= CW) continue;
        const ch = this.map[yy][xx];
        if (ch === 'c' || ch === 'f') { this.map[yy][xx] = ','; broke++; this.burst(xx * CT + CT / 2, yy * CT + CT / 2, '#6a4a2a', 14, 80); }
      }
      if (broke) { this.hooks.log('Взрыв разносит укрытия в щепки.'); this.renderBg(); }
    }
    for (const o of this.units.filter((o) => !o.dead && cheb(o, { x: tx, y: ty }) <= 1)) { let d = (dyn ? randInt(5, 8) : randInt(3, 5)) + (tal(u, 'b_blast') ? 2 : 0); if (o.splinter) d -= 1; await this.damage(o, Math.max(1, o.blast ? Math.ceil(d / 2) : d), false); }
    await sleep(350);
  },

  async checkEnd() {
    if (this.ended) return true;
    const real = (team: Unit['team']) => this.units.filter((u) => !u.dead && (team === 'player' ? u.team === 'player' && !u.summon && !u.st.commanded && !u.ally : u.team === 'enemy' || !!u.st.commanded));
    if (!real('player').length) { // весь отряд лежит — бой проигран
      this.ended = true; this.busy = true;
      await sleep(700);
      await this.showBanner('ОТРЯД РАЗБИТ', '#d0614c');
      this.hooks.defeat(this.def.id);
      return true;
    }
    if (!real('enemy').length) {
      this.ended = true; this.busy = true;
      await sleep(500);
      await this.showBanner('ПОБЕДА', '#9fd36a');
      G.squad.forEach((s) => {
        const u = this.units.find((x) => x.base === s)!;
        s.hp = Math.min(effMaxHp(s), u.downed ? 1 : u.hp); // тяжелораненые выживают с 1 ОЗ
      });
      this.wearNotes = this.wearAfterBattle();
      this.hooks.victory(this.def.id);
      return true;
    }
    return false;
  },

  // ---------------------------------------------------------- анимации
  tween(ms: number, f: (k: number) => void) {
    return new Promise<void>((res) => {
      const st = performance.now();
      this.anims.push((now) => {
        const k = Math.min(1, (now - st) / ms);
        f(k);
        if (k >= 1) { res(); return true; }
        return false;
      });
    });
  },
  async moveAlong(u: Unit, path: Pt[], stepMs = 110) {
    u.walking = true;
    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      if (p.x !== u.x) u.flip = p.x < u.x;
      u.back = p.y < u.y && Math.abs(p.y - u.y) >= Math.abs(p.x - u.x); // шаг вверх — спиной к зрителю
      const sx = u.px, sy = u.py, tx = p.x * CT + CT / 2, ty = p.y * CT + CT / 2;
      await this.tween(stepMs, (k) => { u.px = lerp(sx, tx, k); u.py = lerp(sy, ty, k); });
      u.x = p.x; u.y = p.y;
      const g = u.team === 'enemy' ? this.runes.find((r) => r.kind === 'glyph' && r.x === u.x && r.y === u.y) : null;
      if (g) { // ловчий глиф срабатывает
        this.runes = this.runes.filter((r) => r !== g);
        u.walking = false;
        this.burst(u.px, u.py - 6, '#c8a0ff', 14, 60);
        this.float(u, 'Глиф!', '#c8a0ff');
        this.hooks.log(`${u.name} наступает на ловчий глиф: 3 урона, связан на раунд.`);
        u.st.bound = Math.max(u.st.bound ?? 0, 1);
        await this.damage(u, 3, false);
        return;
      }
    }
    u.walking = false;
  },
  async lunge(a: Unit, t: Unit) {
    const sx = a.px, sy = a.py, dx = (t.px - a.px) * 0.45, dy = (t.py - a.py) * 0.45;
    await this.tween(110, (k) => { a.px = sx + dx * k; a.py = sy + dy * k; });
    this.fx.push({ type: 'tracer', x1: t.px - 10, y1: t.py - 22, x2: t.px + 10, y2: t.py - 4, color: '#e8e8e0', life: 0.15, max: 0.15 });
    await this.tween(140, (k) => { a.px = sx + dx * (1 - k); a.py = sy + dy * (1 - k); });
  },
  muzzle(a: Unit, t: Unit, hit: boolean) {
    const ox = hit ? 0 : (Math.random() - 0.5) * 50, oy = hit ? 0 : (Math.random() - 0.5) * 40;
    const mx = a.px + (a.flip ? -10 : 10), my = a.py - 16;
    this.fx.push({ type: 'tracer', x1: mx, y1: my, x2: t.px + ox, y2: t.py - 12 + oy, color: '#ffe0a0', life: 0.12, max: 0.12 });
    this.burst(mx, my, '#ffd070', 6, 60);
    this.burst(mx, my, '#888', 5, 25);
  },
  projectile(a: Unit, t: Unit, color: string, ms: number) {
    const f: Fx = { type: 'proj', x1: a.px, y1: a.py - 22, x2: t.px, y2: t.py - 12, color, life: 99, max: 99, k: 0 };
    this.fx.push(f);
    return this.tween(ms, (k) => {
      f.k = k;
      this.parts.push({ x: lerp(f.x1, f.x2, k), y: lerp(f.y1, f.y2, k), vx: (Math.random() - 0.5) * 20, vy: -10, life: 0.4, max: 0.4, color, size: 2.5, g: 0 });
      if (k >= 1) f.life = 0;
    });
  },
  burst(x: number, y: number, color: string, n: number, sp: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = Math.random() * sp;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - sp * 0.3, life: 0.4 + Math.random() * 0.5, max: 0.9, color, size: 1.5 + Math.random() * 2, g: 160 });
    }
  },
  float(u: Unit, text: string, color: string) { this.floats.push({ x: u.px, y: u.py - 58, text, color, t: 0 }); },
  async showBanner(text: string, color: string) { this.banner = { text, color, t: 0 }; await sleep(1000); this.banner = null; },

  update(dt: number) {
    const now = performance.now();
    this.anims = this.anims.filter((f) => !f(now));
    for (const f of this.fx) f.life -= dt;
    this.fx = this.fx.filter((f) => f.life > 0);
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.floats) { f.t += dt; f.y -= 22 * dt; }
    this.floats = this.floats.filter((f) => f.t < 1.4);
    for (const u of this.units) if (u.flash > 0) u.flash -= dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    if (this.banner) this.banner.t += dt;
  },

  // ---------------------------------------------------------- отрисовка
  draw(c: CanvasRenderingContext2D, t: number) {
    // ---------- пиксельный слой: поле, дым, юниты, эффекты, свет
    const v = this.view!, lc = v.c, lw = v.w, lh = v.h;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.drawImage(this.bg!, 0, 0);
    if (this.circle) { // пульсирующий круг призыва — точками
      const { x, y, r } = this.circle, n = 48, on = Math.floor(t * 6);
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; if ((i + on) % 3) ppx(lc, x / PS + Math.cos(a) * r / PS, y / PS + Math.sin(a) * r / PS, '#a8f070'); }
    }
    for (const g of this.gasClouds) { // газ лопнувшего мертвеца — жёлто-зелёные растровые клубы
      const shift = Math.floor(t * 2);
      for (let yy = (g.y - 1) * T - 3; yy < (g.y + 2) * T + 2; yy++) for (let xx = (g.x - 1) * T - 3; xx < (g.x + 2) * T + 3; xx++) {
        const d = Math.hypot((xx - (g.x + 0.5) * T) / (1.6 * T), (yy - (g.y + 0.5) * T) / (1.5 * T));
        if (d < 1 && ((xx + yy + shift) % (d < 0.55 ? 2 : 3) === 0)) ppx(lc, xx, yy, d < 0.5 ? '#a8b850' : '#7a8a3a');
      }
    }
    for (const sm of this.smoke) { // дым — растровые клубы
      const shift = Math.floor(t * 3);
      for (let yy = (sm.y - 1) * T - 4; yy < (sm.y + 2) * T + 2; yy++) for (let xx = (sm.x - 1) * T - 4; xx < (sm.x + 2) * T + 4; xx++) {
        const d = Math.hypot((xx - (sm.x + 0.5) * T) / (1.7 * T), (yy - (sm.y + 0.5) * T) / (1.6 * T));
        if (d < 1 && ((xx + yy + shift) % (d < 0.6 ? 2 : 3) === 0)) ppx(lc, xx, yy, d < 0.5 ? '#a8a8a0' : '#8a8a82');
      }
    }
    for (const r of this.runes) { // руны на клетках
      const cx = r.x * T + T / 2, cy = r.y * T + T / 2, col = r.kind === 'guard' ? '#d8c070' : '#c8a0ff', on = Math.floor(t * 4) % 2;
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; if ((i + on) % 2) ppx(lc, cx + Math.cos(a) * 7, cy + Math.sin(a) * 4, col); }
      if (r.kind === 'guard') { pline(lc, cx, cy - 3, cx, cy + 3, col); pline(lc, cx - 2, cy - 1, cx + 2, cy - 1, col); }
      else { pline(lc, cx - 3, cy - 2, cx + 3, cy + 2, col); pline(lc, cx - 3, cy + 2, cx + 3, cy - 2, col); }
    }
    const vis = this.units.filter((u) => !u.fled).sort((a, b) => (a.dead === b.dead ? a.py - b.py : a.dead ? -1 : 1));
    for (const u of vis) {
      const frame = u.walking ? 1 + (Math.floor(t * 8) % 2) * 2 : 0;
      const bob = !u.walking && !u.dead && Math.sin(t * 1.8 + u.seed) > 0.75 ? 1 : 0;
      drawSprite(lc, combatKind(u.kind), u.px / PS, u.py / PS + 9, { flip: u.flip, back: u.walking && u.back, dead: u.dead, flash: u.flash > 0, frame, bob }); // в бою — оружие на изготовку
    }
    for (const f of this.fx) {
      const a = Math.max(0, f.life / f.max);
      if (f.type === 'tracer' && a > 0.3) pline(lc, f.x1 / PS, f.y1 / PS, f.x2 / PS, f.y2 / PS, f.color);
      if (f.type === 'ring') { const rr = ((1 - a) * 50 + 5) / PS; for (let i = 0; i < 40; i++) { const ang = (i / 40) * TAU; ppx(lc, f.x1 / PS + Math.cos(ang) * rr, f.y1 / PS + Math.sin(ang) * rr, f.color); } }
      if (f.type === 'breath' && f.cells) { // клубы зловонного облака: расползаются от пасти по полосе и медленно тают
        const age = 1 - a, BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
        f.cells.forEach((c, i) => {
          const grow = Math.min(1, Math.max(0, age * 4 - i * 0.45)); if (grow <= 0) return;
          const cx = (c.x * CT + CT / 2) / PS, cy = (c.y * CT + CT / 2) / PS - 4, fade = a < 0.35 ? a / 0.35 : 1;
          for (let k = 0; k < 4; k++) {
            const ox = Math.sin(t * 2 + i * 1.7 + k * 2.1) * 5, oy = Math.cos(t * 1.6 + i + k * 1.3) * 3 - k * 2, r = (9 + k * 2 + i) * grow;
            const col = ['#6a7a2a', '#8a9a3a', '#a4ae50', '#5a5a30'][k];
            for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
              const d = Math.hypot(xx, yy) / r; if (d >= 1) continue;
              const px = Math.round(cx + ox + xx), py = Math.round(cy + oy + yy * 0.7);
              if (0.95 * fade * (1 - d * d * 0.7) > (BAY[(py & 3) * 4 + (px & 3)] + 0.5) / 16) ppx(lc, px, py, col);
            }
          }
          if (grow > 0.6 && (Math.floor(t * 9) + i) % 3 === 0) ppx(lc, cx + Math.sin(t * 5 + i) * 5, cy - 7, '#d0d890'); // капли слизи
        });
      }
      if (f.type === 'proj') { const x = lerp(f.x1, f.x2, f.k!) / PS, y = lerp(f.y1, f.y2, f.k!) / PS; prect(lc, x - 1, y - 1, 3, 3, f.color); ppx(lc, x, y, '#ffffff'); }
    }
    for (const p of this.parts) if (p.life / p.max > 0.15) prect(lc, p.x / PS, p.y / PS, p.size > 2.5 ? 2 : 1, p.size > 2.5 ? 2 : 1, p.color);
    // свет
    const lights: PLight[] = this.def.lights.map(([x, y, r, color]) => ({ x: x * T + T / 2, y: y * T + T / 2, r: r / PS, a: 0.85 + Math.sin(t * 7 + x) * 0.06, color }));
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.team === 'player') lights.push({ x: u.px / PS, y: u.py / PS, r: 44, a: 0.7 });
      else if (u.kind === 'cultist') lights.push({ x: u.px / PS + (u.flip ? -5 : 5), y: u.py / PS - 14, r: 46, a: 0.9, color: '#9fef6a' });
      else if (u.kind === 'imp') lights.push({ x: u.px / PS, y: u.py / PS - 6, r: 20, a: 0.5, color: '#e8ff6a' });
    }
    for (const f of this.fx) if (f.type === 'proj') lights.push({ x: lerp(f.x1, f.x2, f.k!) / PS, y: lerp(f.y1, f.y2, f.k!) / PS, r: 36, a: 1, color: f.color });
    for (let i = 0; i < 30; i++) ppx(lc, (i * 97 + t * (6 + (i % 4) * 3)) % lw, (i * 53 + t * (9 + (i % 3) * 4)) % lh, '#8a8c7a');
    const wl = Weather.light([0.84, 1, 0.78], 0.25);
    applyLight(lc, lw, lh, lights, wl.ambient, wl.tint, wl.vig);
    Weather.draw(lc, lw, lh, t);

    c.save();
    if (this.shake > 0) c.translate(Math.round((Math.random() - 0.5) * this.shake), Math.round((Math.random() - 0.5) * this.shake));
    v.present(c);

    // ---------- чёткий слой поверх: подсветка клеток, цели, полоски, подсказки
    const sel = this.sel, playerTurn = this.turn === 'player' && !this.busy;
    const hov = this.hover, hovU = hov ? this.unitAt(hov.x, hov.y) ?? this.downedAt(hov.x, hov.y) : undefined;
    if (playerTurn && sel) {
      const brave = this.action.type === 'c';
      if ((this.action.type === 'w' || brave) && this.reach) {
        for (const n of this.reach.values()) {
          if (n.d === 0) continue;
          c.fillStyle = brave ? 'rgba(240,150,60,0.13)' : n.d <= this.mv(sel) ? 'rgba(110,160,210,0.14)' : 'rgba(210,170,80,0.11)';
          c.fillRect(n.x * CT + 1, n.y * CT + 1, CT - 2, CT - 2);
        }
        const showPath = this.action.type === 'w' || this.action.key === 'rush';
        const hn = showPath && hov && !hovU ? this.reach.get(hov.y * CW + hov.x) : undefined;
        if (hn && hn.d > 0) { // путь и укрытия в точке назначения
          const path = pathTo(this.reach, CW, hn.x, hn.y);
          c.strokeStyle = 'rgba(230,220,180,0.6)'; c.lineWidth = 2; c.setLineDash([4, 4]);
          c.beginPath(); path.forEach((p, i) => (i ? c.lineTo(p.x * CT + 20, p.y * CT + 20) : c.moveTo(p.x * CT + 20, p.y * CT + 20))); c.stroke();
          c.setLineDash([]);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const cv = this.coverAt(hn.x + dx, hn.y + dy);
            if (cv) drawShield(c, hn.x * CT + 20 + dx * 15, hn.y * CT + 20 + dy * 15, cv >= 40);
          }
        }
      }
      if ((this.action.type === 'a' && (this.action.key === 'rally' || this.action.key === 'bandage' || this.action.key === 'medkit')) || (brave && this.action.key === 'rescue')) {
        for (const p of this.units.filter((x) => x.team === 'player' && (!x.dead || x.downed))) {
          const k = this.action.key;
          const ok = k === 'rally' ? !p.dead && p !== sel && dist(sel, p) <= 6.5
            : k === 'bandage' || k === 'medkit' ? cheb(sel, p) <= 1 && (p.downed || p.hp < p.maxHp)
            : p.downed && (cheb(sel, p) === 1 || !!this.chargeTile(sel, p));
          if (ok) { c.strokeStyle = '#8fdc7a'; c.lineWidth = 2; c.strokeRect(p.x * CT + 2, p.y * CT + 2, CT - 4, CT - 4); }
        }
      }
      if (this.action.type === 'a' && (this.action.key === 'grenade' || this.action.key === 'smoke') && hov) {
        const ok = cheb(sel, hov) <= (this.action.key === 'smoke' ? 6 : 5);
        c.fillStyle = !ok ? 'rgba(120,120,120,0.2)' : this.action.key === 'smoke' ? 'rgba(200,200,190,0.25)' : 'rgba(255,150,60,0.25)';
        c.fillRect((hov.x - 1) * CT, (hov.y - 1) * CT, CT * 3, CT * 3);
      }
      for (const e of this.alive('enemy')) {
        if (this.actionChance(sel, e) > 0) { c.strokeStyle = 'rgba(225,85,60,0.85)'; c.lineWidth = 2; c.strokeRect(e.x * CT + 2, e.y * CT + 2, CT - 4, CT - 4); }
      }
    }
    if (hov) { c.strokeStyle = 'rgba(240,230,190,0.5)'; c.lineWidth = 1; c.strokeRect(hov.x * CT + 0.5, hov.y * CT + 0.5, CT - 1, CT - 1); }
    if (sel) {
      c.strokeStyle = '#d4b673'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(sel.px, sel.py + 17, 14, 4, 0, 0, TAU); c.stroke();
    }


    // полоски здоровья и статусы — поверх темноты
    for (const u of this.units) {
      if (u.dead) continue;
      const bw = 30, x = u.px - bw / 2, y = u.py - 50;
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(x - 1, y - 1, bw + 2, 5);
      c.fillStyle = u.team === 'player' ? '#7fbf5a' : '#c9503e';
      c.fillRect(x, y, bw * (u.hp / u.maxHp), 3);
      if (u.team === 'player' && this.turn === 'player') {
        for (let i = 0; i < u.ap; i++) { c.fillStyle = '#e0c070'; c.fillRect(x + i * 6, y - 5, 4, 3); }
      }
      if (u.terror) { c.fillStyle = '#b58cff'; c.font = 'bold 12px serif'; c.fillText('◉', x + bw + 2, y + 4); }
      { // оккультные состояния — значки над полоской здоровья
        const ICON: Record<string, [string, string]> = { weak: ['☣', '#a8b860'], supp: ['⇊', '#e8c070'], hex: ['✥', '#9fef6a'], rot: ['☠', '#9fef6a'], ward: ['✥', '#e8e0b0'], pact: ['⛧', '#e05030'], commanded: ['⛧', '#e05030'], fortune: ['☉', '#f0e090'], omen: ['☾', '#b58cff'], stars: ['✶', '#f0e090'], bound: ['ᛟ', '#c8a0ff'] };
        let ix = x; c.font = 'bold 11px serif';
        for (const k of Object.keys(u.st)) { const ic = ICON[k]; if (!ic) continue; c.fillStyle = ic[1]; c.fillText(ic[0], ix, y - 8); ix += 10; }
        if (u.summon) { c.fillStyle = '#e05030'; c.fillText(`⛧${u.summon}`, ix, y - 8); }
      }
      if (u.team === 'player' && u.courage) { // кураж
        c.font = 'bold 11px serif'; c.fillStyle = '#f0a040';
        for (let i = 0; i < u.courage; i++) c.fillText('✦', x + bw - 7 - i * 8, y - 2);
      }
      if (u.exposed) { c.fillStyle = '#e07050'; c.font = 'bold 11px serif'; c.fillText('⚠', x - 11, y + 4); }
    }
    for (const u of this.units) { // тяжелораненые — метка для спасения
      if (!u.downed) continue;
      const pulse = 0.6 + Math.sin(t * 4) * 0.4;
      c.globalAlpha = pulse; c.fillStyle = '#e05040'; c.font = 'bold 16px serif'; c.textAlign = 'center';
      c.fillText('✚', u.px, u.py - 14); c.globalAlpha = 1; c.textAlign = 'left';
    }
    for (const f of this.floats) {
      c.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      c.font = 'bold 14px "Old Standard TT", Georgia, serif'; c.textAlign = 'center';
      c.fillStyle = '#000'; c.fillText(f.text, f.x + 1, f.y + 1);
      c.fillStyle = f.color; c.fillText(f.text, f.x, f.y);
    }
    c.globalAlpha = 1; c.textAlign = 'left';

    if (playerTurn && sel && hovU) this.drawTooltip(c, sel, hovU);
    c.restore();

    if (this.banner) {
      const a = Math.min(1, this.banner.t * 4, (1 - this.banner.t) * 4 + 0.3);
      c.globalAlpha = Math.max(0, a);
      c.fillStyle = 'rgba(5,8,4,0.8)'; c.fillRect(0, H / 2 - 32, W, 64);
      c.fillStyle = this.banner.color; c.font = 'bold 30px "Old Standard TT", Georgia, serif'; c.textAlign = 'center';
      c.fillText(this.banner.text, W / 2, H / 2 + 10);
      c.globalAlpha = 1; c.textAlign = 'left';
    }
  },

  drawTooltip(c: CanvasRenderingContext2D, sel: Unit, u: Unit) {
    const lines: string[] = [`${u.name}  ${u.hp}/${u.maxHp} ОЗ`];
    if (u.downed) lines.push('Тяжело ранен — поднять перевязкой или спасти (кураж)');
    if (u.team === 'player') {
      if (u.courage) lines.push(`Кураж: ${'✦'.repeat(u.courage)}`);
      if (u.exposed) lines.push('Раскрыт: −2 к Защите');
      for (const w of u.base.wounds ?? []) lines.push(`Ранение: ${WOUNDS[w].name}`);
    }
    if (u.team === 'enemy') {
      const wk = this.action.type === 'w' ? this.action.key : this.action.key === 'aim' ? sel.weapons[0]
        : this.action.type === 'c' && this.action.key === 'last' ? this.lastStandWeapon(sel, u) ?? null
        : this.action.type === 'c' && this.action.key === 'charge' ? this.meleeWeapon(sel) ?? null : null;
      if (wk) {
        const ch = this.actionChance(sel, u), w = WEAPONS[wk];
        if (ch > 0) {
          lines.push(`Попадание: ${ch}%   Урон: ${w.dmg[0]}–${w.dmg[1]}`);
          const info = this.action.type === 'c' ? null : this.attackInfo(sel, sel, u, wk, this.action.key === 'aim' ? (tal(sel, 'h_sniper') ? 6 : 4) : 0);
          if (info) lines.push(`3d6 ${info.bonus >= 0 ? '+' : ''}${info.bonus} против Защиты ${info.dc}`);
          if (this.action.key === 'charge') lines.push('Штыковая: +2 к атаке, +2 к урону, затем раскрыт');
          if (this.action.key === 'last') lines.push('Натиск: лучший из двух бросков, +2 к урону');
          const cv = w.type === 'ranged' && !w.ignoreCover ? this.coverOf(u, sel) : 0;
          if (cv) lines.push(cv >= 40 ? 'Цель в полном укрытии (+2 к Защите)' : 'Цель в половинном укрытии (+1 к Защите)');
          if (u.armor) lines.push(`Броня поглощает ${u.armor}`);
        } else lines.push(w.type === 'melee' ? 'Слишком далеко для ближнего боя' : 'Вне досягаемости / не видно');
      }
    }
    c.font = '13px "Old Standard TT", Georgia, serif';
    const w = Math.max(...lines.map((l) => c.measureText(l).width)) + 14;
    let x = u.px + 24, y = u.py - 40;
    if (x + w > W) x = u.px - 24 - w;
    if (y < 4) y = 4;
    c.fillStyle = 'rgba(8,12,7,0.92)'; c.fillRect(x, y, w, lines.length * 17 + 8);
    c.strokeStyle = u.team === 'enemy' ? '#8a3a2c' : '#4b5838'; c.strokeRect(x + 0.5, y + 0.5, w - 1, lines.length * 17 + 7);
    lines.forEach((l, i) => { c.fillStyle = i === 0 ? '#e6d8a8' : '#cfd0b8'; c.fillText(l, x + 7, y + 17 + i * 17); });
  },

  renderBg() {
    const LWb = W / PS, LHb = H / PS;
    const cv = document.createElement('canvas'); cv.width = LWb; cv.height = LHb;
    const c = cv.getContext('2d')!;
    const r = pseed(this.def.id === 'road' ? 42 : this.def.id === 'waste' ? 91 : 77);
    const factory = this.def.theme === 'factory', trench = this.def.theme === 'trench', forest = this.def.theme === 'forest';
    // пол
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const X = x * T, Y = y * T;
      if (factory) {
        prect(c, X, Y, T, T, r() < 0.5 ? '#3a3a34' : '#36362f');
        prect(c, X, Y, T, 1, '#2a2a24'); prect(c, X, Y, 1, T, '#2a2a24');
        for (const [a, b] of [[2, 2], [17, 2], [2, 17], [17, 17]]) ppx(c, X + a, Y + b, '#5a5a50');
        if (r() < 0.2) pellipse(c, X + 4 + r() * 12, Y + 4 + r() * 12, 4, 2, '#344a2c');
      } else if (trench) { // изрытая грязь ничейной земли
        prect(c, X, Y, T, T, r() < 0.5 ? '#3a3328' : '#362f25');
        for (let k = 0; k < 5; k++) ppx(c, X + r() * T, Y + r() * T, r() < 0.5 ? '#2a241b' : '#4a4234');
        if (r() < 0.12) { pellipse(c, X + 10, Y + 10, 7, 4, '#4a4234'); pellipse(c, X + 10, Y + 9, 5, 3, '#1e1a14'); } // воронка
        if (this.map[y][x] === ',') for (let k = 0; k < 3; k++) prect(c, X + 3 + r() * 14, Y + 6 + r() * 10, 1, 2, '#4e5a38');
      } else paintTile(c, X, Y, forest ? (this.map[y][x] === ',' ? 'g' : 'm') : this.map[y][x] === ',' ? 'g' : 'w', r);
    }
    if (trench) { // газ стелется по земле — бледные пятна растром
      for (let i = 0; i < 900; i++) { const gx = r() * LWb, gy = r() * LHb; if (Math.sin(gx / 37) + Math.cos(gy / 23) > 1.1) ppx(c, gx, gy, '#5a6e3a'); }
    }
    if (!factory && !trench && !forest) { // разбитая дорога через поле боя
      for (let x = 0; x < LWb; x++) {
        const yc = 7 * T + Math.round(Math.sin(x / 40) * 10);
        for (let y = yc - 10; y < yc + 10; y++) if (r() < 0.55) ppx(c, x, y, (x + y) % 7 ? '#4a4436' : '#5a5040');
      }
    }
    // ритуальный круг
    const os = this.map.flatMap((row, y) => row.map((ch, x) => (ch === 'o' ? { x, y } : null)).filter(Boolean)) as Pt[];
    if (os.length) {
      const cx = os.reduce((a, p) => a + p.x, 0) / os.length * CT + CT / 2, cy = os.reduce((a, p) => a + p.y, 0) / os.length * CT + CT / 2;
      this.circle = { x: cx, y: cy, r: 2.9 * CT };
      for (let i = 0; i < 120; i++) { const a = (i / 120) * TAU; ppx(c, cx / PS + Math.cos(a) * 58, cy / PS + Math.sin(a) * 58, '#3e5a2e'); }
      for (let k = 0; k < 5; k++) { const a0 = -Math.PI / 2 + k * (TAU * 2 / 5), a1 = -Math.PI / 2 + (k + 1) * (TAU * 2 / 5); pline(c, cx / PS + Math.cos(a0) * 54, cy / PS + Math.sin(a0) * 54, cx / PS + Math.cos(a1) * 54, cy / PS + Math.sin(a1) * 54, '#34502a'); }
      for (let i = 0; i < 8; i++) pellipse(c, cx / PS + (r() - 0.5) * 70, cy / PS + (r() - 0.5) * 70, 3, 2, '#4a1a14');
    } else this.circle = null;
    // объекты по рядам (нижние перекрывают верхние)
    let seed = 1;
    const spr = (kind: string, x: number, y: number, extra: any = {}) => {
      const sp = objSprite({ kind, x, y, w: 1, h: 1, seed: seed++ }, extra);
      c.drawImage(sp.cv, x * T - sp.sx, y * T - sp.sy);
    };
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const X = x * T, Y = y * T, ch = this.map[y][x];
      switch (ch) {
        case '#': if (trench) { // бруствер из мешков с песком
          prect(c, X, Y - 4, T, T + 4, '#4a4030');
          for (let row = 0; row < 4; row++) for (let k = -1; k < 3; k++) {
            const bx = X + k * 8 + (row % 2 ? 4 : 0), by = Y - 4 + row * 6;
            if (bx + 7 <= X || bx >= X + T) continue;
            prect(c, Math.max(X, bx), by, Math.min(7, X + T - Math.max(X, bx)), 5, row % 2 ? '#7a6a4a' : '#6e5e42');
            prect(c, Math.max(X, bx), by, Math.min(7, X + T - Math.max(X, bx)), 1, '#8a7a58');
          }
          break;
        } else {
          const col = factory ? '#6a3a2c' : '#6a665a', dark = shade(col, -0.3);
          prect(c, X, Y - 6, T, T + 6, col);
          for (let yy = Y - 4; yy < Y + T; yy += 4) for (let xx = X + (((yy / 4) | 0) % 2) * 3; xx < X + T; xx += 6) prect(c, xx, yy, 5, 1, dark);
          prect(c, X, Y - 7, T, 2, shade(col, 0.2)); prect(c, X + T - 2, Y - 6, 2, T + 6, dark);
          break;
        }
        case 'x': // колючая проволока на кольях
          for (const kx of [3, 15]) { prect(c, X + kx, Y + 2, 2, 15, '#3a2c1e'); ppx(c, X + kx, Y + 1, '#5a4430'); }
          for (let k = 0; k < 20; k++) { ppx(c, X + k, Y + 6 + Math.round(Math.sin(k * 1.3) * 2), '#8a8a80'); ppx(c, X + k, Y + 12 + Math.round(Math.cos(k * 1.1) * 2), '#7a7a70'); }
          for (const [a, b] of [[6, 5], [10, 13], [17, 9]]) { ppx(c, X + a, Y + b, '#b0b0a8'); ppx(c, X + a + 1, Y + b - 1, '#b0b0a8'); }
          break;
        case 'T': spr(forest ? 'pine' : 'tree', x, y); break;
        case 'c':
          if (r() < 0.4) spr('barrel', x, y);
          else { prect(c, X + 3, Y + 4, 14, 13, '#6a4c2c'); prect(c, X + 3, Y + 2, 14, 3, '#82603a'); pline(c, X + 3, Y + 5, X + 16, Y + 16, '#3a2a18'); prect(c, X + 3, Y + 4, 14, 1, '#3a2a18'); prect(c, X + 2, Y + 17, 16, 1, 'rgba(0,0,0,0.5)'); }
          break;
        case 'f': spr('fence', x, y, { horizFence: true }); break;
        case 'w':
          if (this.def.id === 'lake') { // озёрная вода у берега
            prect(c, X, Y, T, T, '#1a2628');
            for (let k = 0; k < 5; k++) prect(c, X + r() * 16, Y + r() * T, 3, 1, r() < 0.4 ? '#4a6a68' : '#26383a');
            if (this.map[y + 1]?.[x] === '.' || this.map[y + 1]?.[x] === ',') { prect(c, X, Y + T - 3, T, 3, '#2e3a30'); for (let k = 0; k < 4; k++) prect(c, X + r() * 18, Y + T - 6, 1, 4, '#4a5e32'); } // камыш у кромки
            break;
          }
          if (factory) { pellipse(c, X + 10, Y + 11, 9, 7, '#2a2a26'); pellipse(c, X + 10, Y + 10, 7, 5, '#2e5a34'); ppx(c, X + 7, Y + 8, '#6aa060'); }
          else { pellipse(c, X + 10, Y + 11, 9, 6, '#121310'); prect(c, X + 5, Y + 9, 4, 1, '#4a5e44'); }
          break;
        case 'm': {
          prect(c, X + 1, Y - 4, 18, 22, '#3a3c3e'); prect(c, X + 1, Y - 5, 18, 2, '#5a5c5e'); prect(c, X + 1, Y - 4, 2, 22, '#4e5052');
          pellipse(c, X + 10, Y + 5, 5, 5, '#5a4630'); pellipse(c, X + 10, Y + 5, 2, 2, '#2a2016');
          prect(c, X + 4, Y + 13, 3, 4, '#2a2016'); ppx(c, X + 15, Y - 1, '#c8a050');
          break;
        }
        case 'P':
          prect(c, X + 6, Y + 16, 10, 3, 'rgba(0,0,0,0.5)'); prect(c, X + 6, Y - 10, 8, 27, '#4a463e'); prect(c, X + 5, Y - 12, 10, 3, '#5e5a50'); prect(c, X + 5, Y + 15, 10, 2, '#5e5a50');
          prect(c, X + 6, Y - 10, 2, 25, '#5e5a50'); for (let yy = Y - 6; yy < Y + 14; yy += 5) ppx(c, X + 10, yy, '#6a665a');
          break;
      }
    }
    // едва заметная сетка клеток
    c.fillStyle = 'rgba(255,255,255,0.035)';
    for (let x = 0; x <= CW; x++) c.fillRect(x * T, 0, 1, LHb);
    for (let y = 0; y <= CH; y++) c.fillRect(0, y * T, LWb, 1);
    this.bg = cv;
  },
};

function drawShield(c: CanvasRenderingContext2D, x: number, y: number, full: boolean) {
  c.fillStyle = full ? '#7fb3e0' : 'rgba(127,179,224,0.55)';
  c.beginPath(); c.moveTo(x - 5, y - 6); c.lineTo(x + 5, y - 6); c.lineTo(x + 5, y); c.lineTo(x, y + 6); c.lineTo(x - 5, y); c.closePath(); c.fill();
  if (!full) { c.fillStyle = '#10140d'; c.fillRect(x, y - 5, 4, 10); }
}
