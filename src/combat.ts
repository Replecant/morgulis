// ============================================================
//  Пошаговый тактический бой
//  2 очка действия (ОД): ход = 1 ОД, атака завершает ход юнита.
//  Укрытия: половинное (−25%) и полное (−40%) к шансу попадания.
// ============================================================
import { G } from './state';
import { WEAPONS, ENEMIES, ABILITIES, battleDef, BattleDef, UnitBase } from './data';
import { bfs, pathTo, lineTiles, BfsMap, DIRS8, Pt, clamp, cheb, dist, lerp, pick, randInt, seeded, sleep, TAU } from './util';
import { check, checkChance, CheckResult } from './rules';
import { woundMods, effMaxHp, addWound, bandageAmount, medkitAmount, WOUNDS } from './wounds';
import { AMMO_NAME } from './items';
import { equipStats } from './items';
import { drawFigure, Lighting, Light, drawDeadTree, drawCrate, drawAsh, vignette } from './gfx';

export const CT = 40, CW = 24, CH = 14;
const W = CW * CT, H = CH * CT;

const TILE: Record<string, { walk?: boolean; cover?: number; los?: boolean }> = {
  '.': { walk: true }, ',': { walk: true }, 'o': { walk: true },
  '#': { cover: 40, los: true }, 'm': { cover: 40, los: true }, 'P': { cover: 40, los: true }, 'T': { cover: 40, los: true },
  'c': { cover: 25 }, 'f': { cover: 25 }, 'w': {},
};

export interface Unit {
  uid: number; team: 'player' | 'enemy'; base: UnitBase;
  name: string; kind: string; x: number; y: number; px: number; py: number;
  hp: number; maxHp: number; move: number; ap: number;
  atkM: number; atkR: number; def: number; armor: number; dmgM: number; horror: number; med: number;
  courage: number;      // боевой кураж 0–3
  grenadeCap: number;   // сколько гранат можно применить за бой (патронташ)
  thrown: number;       // сколько уже брошено
  quick: boolean; quickUsed: boolean; // патронташ: бесплатная перезарядка раз в ход
  blast: boolean;       // сапёрный доспех: урон от взрывов вдвое меньше
  rallyCharm: boolean;  // медальон: поднятый встаёт с половиной ОЗ
  exposed: boolean;     // раскрылся после рискованного манёвра: −2 к Защите до своего хода
  downed: boolean;      // тяжело ранен (боец отряда на 0 ОЗ) — можно спасти
  weapons: string[]; ammo: Record<string, number>; abil: Record<string, number>;
  ai?: UnitBase['ai']; leader: boolean; demonic: boolean;
  dead: boolean; fled: boolean; terror: boolean; flip: boolean; flash: number; seed: number;
  cd: { summon: number; whisper: number };
}

type Action = { type: 'w' | 'a' | 'c'; key: string };
export interface BtnInfo { kind: 'w' | 'a' | 'c'; key: string; label: string; desc: string; disabled: boolean; active: boolean }
interface Fx { type: 'tracer' | 'proj' | 'ring'; x1: number; y1: number; x2: number; y2: number; color: string; life: number; max: number; k?: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; g: number }
interface Float { x: number; y: number; text: string; color: string; t: number }

// ------------------------------------------------------------ кураж (экспериментально)
export const COURAGE_MAX = 3;
export const COURAGE: Record<string, { name: string; short: string; cost: number; desc: string }> = {
  charge: { name: 'Штыковая атака', short: 'Штыковая', cost: 1, desc: 'Нужны 2 ОД и холодное оружие. Бросок до 6 клеток к врагу и удар: +2 к атаке, +2 к урону. После — раскрыт: −2 к Защите до своего хода.' },
  rush:   { name: 'Отчаянный рывок', short: 'Рывок', cost: 1, desc: '1 ОД. Перебежка на двойное расстояние. Каждый вражеский стрелок, который видит бойца, стреляет вслед с −3.' },
  last:   { name: 'Последний натиск', short: 'Натиск', cost: 2, desc: 'Только при ОЗ не выше трети. Атака: кость бросается дважды, берётся лучшая, +2 к урону. После — раскрыт.' },
  rescue: { name: 'Спасение товарища', short: 'Спасение', cost: 1, desc: 'Нужны 2 ОД. Бросок до 6 клеток к тяжелораненому союзнику — тот встаёт с четвертью ОЗ. По пути — огонь вслед.' },
};
const COURAGE_ORDER = ['charge', 'rush', 'last', 'rescue'];

let UID = 0;
function mkUnit(b: UnitBase, team: Unit['team'], x: number, y: number): Unit {
  const player = team === 'player';
  const m = player ? woundMods(b) : { atkM: 0, atkR: 0, def: 0, move: 0, horror: 0, maxHp: 0 };
  // снаряжение бойцов отряда: оружие, броня, бонусы, патронташ, оберег
  const e = player && b.equip ? equipStats(b) : null;
  const abil = { ...(b.abil ?? {}) };
  const u: Unit = {
    uid: ++UID, team, base: b, name: b.name, kind: b.look ?? b.kind, x, y, px: x * CT + CT / 2, py: y * CT + CT / 2,
    hp: b.hp, maxHp: player ? effMaxHp(b) : b.maxHp, move: Math.max(2, b.move + m.move + (e?.move ?? 0)), ap: 0,
    weapons: e ? e.weapons : b.weapons.slice(), ammo: {}, abil,
    atkM: b.atkM + m.atkM + (e?.atkM ?? 0), atkR: b.atkR + m.atkR + (e?.atkR ?? 0), def: b.def + m.def + (e?.def ?? 0),
    armor: (b.armor ?? 0) + (e?.armor ?? 0), dmgM: b.dmgM ?? 0,
    horror: (b.horror ?? 0) + m.horror + (e?.horror ?? 0), med: b.med ?? 0,
    courage: Math.min(COURAGE_MAX, e?.courage ?? 0), grenadeCap: e?.grenades ?? 0, thrown: 0, quick: !!e?.quick, quickUsed: false, blast: !!e?.blast, rallyCharm: !!e?.rally,
    exposed: false, downed: false,
    ai: b.ai, leader: !!b.leader, demonic: !!b.demonic,
    dead: false, fled: false, terror: false, flip: team === 'enemy', flash: 0, seed: Math.random() * 10, cd: { summon: 0, whisper: 0 },
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
  light: null as Lighting | null,
  circle: null as { x: number; y: number; r: number } | null,
  smoke: [] as { x: number; y: number; turns: number }[],

  // ---------------------------------------------------------- запуск
  start(id: BattleDef['id']) {
    const def = battleDef(id, G.flags);
    this.def = def;
    this.map = def.map.map((r) => r.padEnd(CW, '.').slice(0, CW).split(''));
    this.units = []; this.fx = []; this.parts = []; this.floats = []; this.anims = [];
    this.ended = false; this.busy = false; this.round = 1; this.sel = null; this.reach = null; this.smoke = [];
    G.squad.forEach((s, i) => {
      const [x, y] = def.players[i];
      const u = mkUnit(s, 'player', x, y);
      u.hp = Math.max(1, Math.min(u.maxHp, s.hp));
      this.units.push(u);
    });
    for (const e of def.enemies) this.units.push(mkUnit(ENEMIES[e.t], 'enemy', e.x, e.y));
    this.light = this.light ?? new Lighting(W, H);
    this.renderBg();
    this.hooks.log(`— ${def.title} —`);
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
  coverAt(x: number, y: number) { const t = this.tile(x, y); return t ? TILE[t]?.cover ?? 0 : 0; },
  /** Укрытие цели t от стрелка from: смотрим соседние клетки цели со стороны стрелка. */
  coverOf(t: Pt, from: Pt) {
    const dx = from.x - t.x, dy = from.y - t.y;
    let c = 0;
    if (dx && Math.abs(dx) >= Math.abs(dy) * 0.5) c = Math.max(c, this.coverAt(t.x + Math.sign(dx), t.y));
    if (dy && Math.abs(dy) >= Math.abs(dx) * 0.5) c = Math.max(c, this.coverAt(t.x, t.y + Math.sign(dy)));
    return c;
  },
  /** Бонус укрытия к Защите: половинное +3, полное +5. */
  coverDef(cover: number) { return cover >= 40 ? 5 : cover >= 25 ? 3 : 0; },
  /**
   * Бросок атаки по правилам: d20 + бонус атаки + бонус оружия − штраф дистанции
   * против Защиты цели (+ укрытие). Возвращает null, если атака невозможна.
   */
  attackInfo(att: Unit, from: Pt, t: Unit, wkey: string, extra = 0) {
    const w = WEAPONS[wkey];
    let bonus = w.atk + extra, dc = t.def - (t.exposed ? 2 : 0);
    if (w.type === 'melee') {
      if (cheb(from, t) !== 1) return null;
      bonus += att.atkM;
    } else {
      const d = dist(from, t);
      if (d > w.range! + 0.01 || !this.los(from, t)) return null;
      bonus += att.atkR - Math.floor(Math.max(0, d - w.opt!) / 2);
      if (!w.ignoreCover) dc += this.coverDef(this.coverOf(t, from));
      if (this.inSmoke(t.x, t.y)) dc += 3;
    }
    return { bonus, dc, chance: checkChance(bonus, dc) };
  },
  hitChance(a: Unit, t: Unit, wkey: string, extra = 0) { return this.attackInfo(a, a, t, wkey, extra)?.chance ?? 0; },

  // ---------------------------------------------------------- ход игрока
  async startPlayerTurn() {
    this.turn = 'player';
    for (const s of this.smoke) s.turns--;
    this.smoke = this.smoke.filter((s) => s.turns > 0);
    for (const u of this.alive('player')) {
      u.exposed = false; u.quickUsed = false;
      u.ap = u.terror ? 1 : 2;
      if (u.terror) this.float(u, 'Ужас: 1 ОД', '#b58cff');
      u.terror = false;
    }
    this.busy = true; this.hooks.panel();
    await this.showBanner(`ХОД ОТРЯДА · раунд ${this.round}`, '#d4b673');
    this.busy = false;
    const lead = this.alive('player').find((u) => u.leader && u.ap > 0) ?? this.alive('player').find((u) => u.ap > 0);
    if (lead) this.select(lead);
  },

  select(u: Unit) {
    this.sel = u;
    this.action = { type: 'w', key: u.weapons[0] };
    this.computeReach();
    this.hooks.panel();
  },
  selectNext() {
    const list = this.alive('player').filter((u) => u.ap > 0);
    if (!list.length) return;
    const i = this.sel ? list.indexOf(this.sel) : -1;
    this.select(list[(i + 1) % list.length]);
  },
  computeReach() {
    const s = this.sel;
    if (!s || s.ap <= 0) { this.reach = null; return; }
    const range = this.action.type === 'c' && this.action.key === 'rush' ? s.move * 2
      : this.action.type === 'c' ? s.move + 2 : s.move * Math.min(s.ap, 2);
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
    if ((key === 'charge' || key === 'rescue') && u.ap < 2) return 'Нужны 2 ОД';
    if (u.ap < 1) return 'Нет ОД';
    if (key === 'charge' && !u.weapons.some((w) => WEAPONS[w].type === 'melee')) return 'Нет холодного оружия';
    if (key === 'last' && u.hp > u.maxHp / 3) return 'Только при ОЗ не выше трети';
    if (key === 'rescue' && !this.units.some((x) => x.downed)) return 'Некого спасать';
    return null;
  },
  cancel() {
    if (this.sel) { this.action = { type: 'w', key: this.sel.weapons[0] }; this.computeReach(); this.hooks.panel(); }
  },

  /** Кнопки панели: оружие + способности. */
  buttons(): BtnInfo[] {
    const u = this.sel;
    if (!u) return [];
    const out: BtnInfo[] = [];
    for (const w of u.weapons) {
      const W_ = WEAPONS[w];
      const ammo = W_.ammo ? ` ${u.ammo[w]}/${W_.ammo}` : '';
      const ab = (n: number) => (n >= 0 ? '+' : '') + n;
      const desc = W_.type === 'melee' ? `Ближний бой · урон ${W_.dmg[0]}–${W_.dmg[1]} · атака ${ab(u.atkM + W_.atk)}` : `Дальность ${W_.range} · урон ${W_.dmg[0]}–${W_.dmg[1]} · атака ${ab(u.atkR + W_.atk)}`;
      out.push({ kind: 'w', key: w, label: W_.name + ammo, desc, disabled: false, active: this.action.type === 'w' && this.action.key === w });
    }
    const types = [...new Set(u.weapons.map((w) => WEAPONS[w].ammoType).filter(Boolean))] as string[];
    if (u.team === 'player' && types.length) {
      const freeReload = u.quick && !u.quickUsed;
      out.push({
        kind: 'a', key: 'reload', label: `${ABILITIES.reload.name} (${types.map((t) => `${AMMO_NAME[t]} ${G.supplies[t as keyof typeof G.supplies]}`).join(', ')})`,
        desc: `${ABILITIES.reload.desc}${freeReload ? ' Патронташ: сейчас без траты ОД.' : ''}`,
        disabled: (u.ap < 1 && !freeReload) || !this.reloadable(u).length, active: false,
      });
    }
    if (u.team === 'player') {
      const S = G.supplies, cap = u.thrown >= u.grenadeCap;
      const cons: [string, number, boolean][] = [['grenade', S.grenade, cap], ['smoke', S.smoke, cap], ['bandage', S.bandage, u.ap < 1], ['medkit', S.medkit, u.ap < 1], ['painkiller', S.painkiller, u.ap < 1]];
      for (const [k, n, block] of cons) if (n > 0) out.push({ kind: 'a', key: k, label: `${ABILITIES[k].name} (${n})`, desc: ABILITIES[k].desc + (k === 'grenade' || k === 'smoke' ? ` Брошено за бой: ${u.thrown}/${u.grenadeCap} (зависит от патронташа).` : ''), disabled: block, active: this.action.type === 'a' && this.action.key === k });
    }
    for (const k of Object.keys(u.abil)) {
      const n = u.abil[k];
      out.push({ kind: 'a', key: k, label: ABILITIES[k].name + (n < 10 ? ` (${n})` : ''), desc: ABILITIES[k].desc, disabled: n <= 0 || (k === 'aim' && u.ap < 2), active: this.action.type === 'a' && this.action.key === k });
    }
    if (u.team === 'player') for (const k of COURAGE_ORDER) {
      const block = this.courageBlock(u, k);
      out.push({ kind: 'c', key: k, label: `${COURAGE[k].short} ${'✦'.repeat(COURAGE[k].cost)}`, desc: `${COURAGE[k].name}. ${COURAGE[k].desc}` + (block ? ` (${block})` : ''), disabled: !!block, active: this.action.type === 'c' && this.action.key === k });
    }
    return out;
  },
  pressButton(i: number) {
    if (this.busy || this.turn !== 'player' || !this.sel) return;
    const b = this.buttons()[i];
    if (!b || b.disabled) return;
    const u = this.sel;
    if (b.kind === 'w') { this.action = { type: 'w', key: b.key }; this.computeReach(); this.hooks.panel(); return; }
    if (b.kind === 'c') { this.action = { type: 'c', key: b.key }; this.computeReach(); this.hooks.panel(); return; }
    if (b.key === 'reload') {
      this.run(async () => {
        const got: string[] = [];
        for (const w of this.reloadable(u)) {
          const t = WEAPONS[w].ammoType!, need = WEAPONS[w].ammo! - u.ammo[w], take = Math.min(need, G.supplies[t]);
          u.ammo[w] += take; G.supplies[t] -= take; got.push(`${WEAPONS[w].name} +${take}`);
        }
        if (u.quick && !u.quickUsed) u.quickUsed = true; else u.ap -= 1;
        this.float(u, 'Перезарядка', '#d8c890');
        this.hooks.log(`${u.name} перезаряжает: ${got.join(', ')}.`);
        await sleep(350);
      });
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
    return u.weapons.filter((w) => { const W_ = WEAPONS[w]; return W_.ammoType && u.ammo[w] < W_.ammo! && G.supplies[W_.ammoType] > 0; });
  },
  canFire(u: Unit, w: string, quiet = false) {
    if (WEAPONS[w].ammo && u.ammo[w] <= 0) { if (!quiet) this.hooks.toast('Нет патронов — нужна перезарядка'); return false; }
    return true;
  },
  /** Шанс попадания для текущего выбранного действия (для подсветки целей). */
  actionChance(u: Unit, t: Unit) {
    if (this.action.type === 'w') return this.canFire(u, this.action.key, true) ? this.hitChance(u, t, this.action.key) : 0;
    if (this.action.key === 'aim') return this.canFire(u, u.weapons[0], true) ? this.hitChance(u, t, u.weapons[0], 4) : 0;
    if (this.action.type === 'c' && this.action.key === 'last') { const w = this.lastStandWeapon(u, t); return w ? this.advChance(this.hitChance(u, t, w)) : 0; }
    if (this.action.type === 'c' && this.action.key === 'charge') return this.chargeTile(u, t) ? this.hitChance({ ...u, x: this.chargeTile(u, t)!.x, y: this.chargeTile(u, t)!.y } as Unit, t, this.meleeWeapon(u)!, 2) : 0;
    return 0;
  },
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
    if (sel && act.type === 'c') { this.useCourage(sel, act.key, tx, ty, u ?? this.downedAt(tx, ty)); return; }
    if (u && u.team === 'player') { if (u.ap > 0) this.select(u); else this.hooks.toast(`${u.name}: ОД закончились`); return; }
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
      const cost = n.d <= sel.move ? 1 : 2;
      if (cost > sel.ap) return;
      const path = pathTo(this.reach!, CW, tx, ty);
      this.run(async () => { await this.moveAlong(sel, path); sel.ap -= cost; });
    }
  },

  useAbility(u: Unit, key: string, tx: number, ty: number, target?: Unit) {
    const T = (s: string) => this.hooks.toast(s);
    if (key === 'aim') {
      if (!target || target.team !== 'enemy') return T('Выберите врага');
      const w = u.weapons[0];
      if (!this.canFire(u, w)) return;
      if (this.hitChance(u, target, w, 4) <= 0) return T('Цель вне досягаемости или не видна');
      this.run(async () => { this.float(u, 'Прицел…', '#d8c890'); await sleep(350); await this.attack(u, target, w, 4); u.ap = 0; });
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
      if (!target || target.team !== 'player' || cheb(u, target) > 1) return T('Выберите себя или соседнего союзника');
      if ((kit ? G.supplies.medkit : G.supplies.bandage) <= 0) return T(kit ? 'Аптечек нет' : 'Бинты кончились');
      if (!target.downed && target.hp >= target.maxHp) return T('Союзник не ранен');
      this.run(async () => {
        if (kit) G.supplies.medkit--; else G.supplies.bandage--;
        u.ap -= 1;
        const amount = kit ? medkitAmount(u.med) : bandageAmount(u.med);
        if (target.downed) this.revive(target, amount);
        else { const h = Math.min(amount, target.maxHp - target.hp); target.hp += h; this.float(target, `+${h}`, '#8fdc7a'); }
        this.hooks.log(`${u.name}: ${kit ? 'аптечка' : 'перевязка'} — ${target === u ? 'себе' : target.name}.`);
        await sleep(400);
      });
    } else if (key === 'grenade' || key === 'smoke') {
      const range = key === 'smoke' ? 6 : 5;
      if (cheb(u, { x: tx, y: ty }) > range) return T(`Слишком далеко (макс. ${range} клеток)`);
      if (u.thrown >= u.grenadeCap) return T('Больше гранат за этот бой не достать — нужен патронташ получше');
      this.run(async () => {
        u.thrown++;
        if (key === 'grenade') { G.supplies.grenade--; await this.grenade(u, tx, ty); u.ap = 0; }
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
        u.exposed = true; u.ap = 0;
        if (!u.dead) this.float(u, 'Раскрыт: −2 Защита', '#d08060');
      });
    } else if (key === 'last') {
      if (!target || target.team !== 'enemy' || target.dead) return T('Выберите врага');
      const w = this.lastStandWeapon(u, target);
      if (!w) return T('Цель вне досягаемости');
      this.run(async () => {
        spend();
        this.hooks.log(`${u.name} идёт в последний натиск!`);
        await this.attack(u, target, w, 0, { dmg: 2, adv: true });
        u.exposed = true; u.ap = 0;
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
      const nx = this.alive('player').find((u) => u.ap > 0);
      if (nx) this.select(nx);
      else { this.sel = null; this.reach = null; this.hooks.panel(); await sleep(300); this.endPlayerTurn(); }
    } else { this.computeReach(); this.hooks.panel(); }
  },

  // ---------------------------------------------------------- ход противника
  async endPlayerTurn() {
    if (this.turn !== 'player' || this.busy || this.ended) return;
    this.turn = 'enemy'; this.sel = null; this.reach = null; this.busy = true;
    this.hooks.panel();
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
    for (const u of this.alive('player')) { const d = dist(p, u); if (d < bd) { bd = d; best = u; } }
    return best;
  },
  bestAttack(u: Unit, pos: Pt) {
    let best: { t: Unit; w: string; c: number; score: number } | null = null;
    for (const w of u.weapons) {
      if (WEAPONS[w].ammo && u.ammo[w] <= 0) continue;
      for (const t of this.alive('player')) {
        const c = this.attackInfo(u, pos, t, w)?.chance ?? 0;
        if (c <= 0) continue;
        const score = c + (t.hp <= WEAPONS[w].dmg[1] ? 15 : 0) + (t.leader ? 5 : 0);
        if (!best || score > best.score) best = { t, w, c, score };
      }
    }
    return best;
  },

  async aiAct(u: Unit) {
    if (u.ai === 'caster') return this.aiCaster(u);
    for (let guard = 0; u.ap > 0 && !u.dead && guard < 3; guard++) {
      const here = this.bestAttack(u, u);
      if (u.ai === 'melee') {
        if (here) { await this.attack(u, here.t, here.w); break; }
        const path = this.meleePath(u);
        if (!path || path.length < 2) break;
        await this.moveAlong(u, path); u.ap--;
      } else {
        const opt = this.rangedTile(u);
        if (here && (!opt || opt.c <= here.c + 10 || u.ap < 2)) { await this.attack(u, here.t, here.w); break; }
        if (!opt || opt.path.length < 2) { if (here) await this.attack(u, here.t, here.w); break; }
        await this.moveAlong(u, opt.path); u.ap--;
      }
    }
    u.ap = 0;
  },

  meleePath(u: Unit) {
    const reach = bfs(CW, CH, u.x, u.y, (x, y) => this.free(x, y), null);
    let best: { x: number; y: number; d: number } | null = null;
    for (const t of this.alive('player')) for (const [dx, dy] of DIRS8) {
      const n = reach.get((t.y + dy) * CW + t.x + dx);
      if (n && (!best || n.d < best.d)) best = n;
    }
    if (!best) {
      let bd = 1e9;
      for (const n of reach.values()) { const p = this.nearestPlayer(n); if (!p) continue; const d = dist(n, p); if (d < bd) { bd = d; best = n; } }
    }
    if (!best) return null;
    return pathTo(reach, CW, best.x, best.y).slice(0, u.move + 1);
  },

  rangedTile(u: Unit) {
    const reach = bfs(CW, CH, u.x, u.y, (x, y) => this.free(x, y), u.move);
    let best: { score: number; c: number; n: Pt } | null = null;
    for (const n of reach.values()) {
      const np = this.nearestPlayer(n);
      if (!np) continue;
      const at = this.bestAttack(u, n);
      const cover = this.coverOf(n, np), nd = dist(n, np);
      let score = at ? at.c + cover * 0.6 - n.d * 1.5 : -nd * 4 + cover * 0.2 - 100;
      if (at && nd < 2) score -= 15;
      if (!best || score > best.score) best = { score, c: at ? at.c : 0, n };
    }
    return best ? { c: best.c, path: pathTo(reach, CW, best.n.x, best.n.y) } : null;
  },

  /** Демонолог: призывает бесов, насылает ужас, жжёт зелёным пламенем, держит дистанцию. */
  async aiCaster(u: Unit) {
    u.cd.summon--; u.cd.whisper--;
    const imps = this.alive('enemy').filter((e) => e.kind === 'imp').length;
    if (u.cd.summon <= 0 && imps < 2) {
      const spot = this.freeNear(u, 2);
      if (spot) { await this.summon(u, spot); u.ap--; u.cd.summon = 3; }
    }
    if (u.ap > 0 && this.alive('player').some((p) => cheb(p, u) === 1)) {
      const reach = bfs(CW, CH, u.x, u.y, (x, y) => this.free(x, y), u.move);
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
    const targets = this.alive('player').filter((p) => !p.terror && dist(u, p) <= 8 && this.los(u, p));
    if (u.cd.whisper <= 0 && targets.length && Math.random() < 0.45) {
      await this.whisper(u, targets.find((p) => p.leader) ?? pick(targets));
      u.cd.whisper = 3;
    } else await this.attack(u, here.t, here.w);
    u.ap = 0;
  },

  freeNear(u: Pt, r: number): Pt | null {
    const spots: Pt[] = [];
    for (let y = u.y - r; y <= u.y + r; y++) for (let x = u.x - r; x <= u.x + r; x++) if (this.free(x, y)) spots.push({ x, y });
    return spots.length ? pick(spots) : null;
  },

  // ---------------------------------------------------------- действия
  async attack(a: Unit, t: Unit, wkey: string, bonus = 0, opts: { dmg?: number; adv?: boolean } = {}) {
    const w = WEAPONS[wkey];
    if (t.x !== a.x) a.flip = t.x < a.x;
    const info = this.attackInfo(a, a, t, wkey, bonus) ?? { bonus: 0, dc: 99, chance: 0 };
    let roll: CheckResult = check(info.bonus, info.dc);
    let advTxt = '';
    if (opts.adv) { // преимущество: бросаем дважды, берём лучший
      const r2 = check(info.bonus, info.dc);
      advTxt = ` / ${r2.roll}`;
      if ((r2.success && !roll.success) || (r2.success === roll.success && r2.total > roll.total)) roll = r2;
    }
    const ch = opts.adv ? this.advChance(info.chance) : info.chance, hit = roll.success;
    const rollTxt = `d20: ${roll.roll}${advTxt}${info.bonus >= 0 ? '+' : ''}${info.bonus} против ${info.dc}`;
    if (w.ammo) a.ammo[wkey]--;
    if (w.type === 'melee') await this.lunge(a, t);
    else if (w.magic) { await this.projectile(a, t, '#9fef6a', 320); this.burst(t.px, t.py - 12, '#9fef6a', 26, 90); }
    else { this.muzzle(a, t, hit); await sleep(140); }
    if (hit) {
      let d = randInt(w.dmg[0], w.dmg[1]) + (w.type === 'melee' ? a.dmgM : 0) + (opts.dmg ?? 0);
      if (w.shot) d = Math.max(1, d - Math.max(0, Math.floor(dist(a, t) - w.opt!))); // дробь теряет силу
      const crit = roll.crit; // натуральная 20: полуторный урон, броня не спасает
      if (crit) d = Math.ceil(d * 1.5);
      const absorbed = crit || w.pierce ? 0 : Math.min(d - 1, t.armor);
      d -= absorbed;
      this.hooks.log(`${a.name} → ${t.name}: ${w.name}, ${crit ? 'КРИТ! ' : ''}${d} урона${absorbed ? ` (броня −${absorbed})` : ''} [${rollTxt}]`);
      await this.damage(t, d, crit);
      if (crit) this.gainCourage(a, 'точный удар');
      if (t.dead && t.team === 'enemy') this.gainCourage(a, 'враг повержен');
      if (w.splash) {
        for (const o of this.units.filter((o) => !o.dead && o !== t && cheb(o, t) === 1)) await this.damage(o, randInt(w.splash[0], w.splash[1]), false);
      }
    } else {
      this.float(t, 'Промах', '#b8b8a8');
      this.hooks.log(`${a.name} промахивается по цели «${t.name}» [${rollTxt}, шанс был ${ch}%]`);
    }
    await sleep(260);
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

  async kill(u: Unit) {
    u.dead = true;
    if (u.team === 'player') { // бойцы отряда не гибнут, а падают тяжело ранеными
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
    const save = check(t.horror + (G.flags.salts ? 4 : 0), 14);
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

  async grenade(u: Unit, tx: number, ty: number) {
    const x = tx * CT + CT / 2, y = ty * CT + CT / 2;
    this.float(u, 'Взрывчатка!', '#e8d070');
    const sx = u.px, sy = u.py - 16;
    await this.tween(420, (k) => {
      this.parts.push({ x: lerp(sx, x, k), y: lerp(sy, y, k) - Math.sin(k * Math.PI) * 70, vx: 0, vy: 0, life: 0.25, max: 0.25, color: '#666', size: 2, g: 0 });
    });
    this.shake = 11;
    this.burst(x, y, '#ffb050', 40, 160); this.burst(x, y, '#555', 30, 90);
    this.fx.push({ type: 'ring', x1: x, y1: y, x2: 0, y2: 0, color: '#ffb050', life: 0.4, max: 0.4 });
    this.hooks.log(`${u.name} бросает взрывчатку!`);
    for (const o of this.units.filter((o) => !o.dead && cheb(o, { x: tx, y: ty }) <= 1)) { const d = randInt(3, 5); await this.damage(o, o.blast ? Math.ceil(d / 2) : d, false); }
    await sleep(350);
  },

  async checkEnd() {
    if (this.ended) return true;
    if (!this.alive('player').length) { // весь отряд лежит — бой проигран
      this.ended = true; this.busy = true;
      await sleep(700);
      await this.showBanner('ОТРЯД РАЗБИТ', '#d0614c');
      this.hooks.defeat(this.def.id);
      return true;
    }
    if (!this.alive('enemy').length) {
      this.ended = true; this.busy = true;
      await sleep(500);
      await this.showBanner('ПОБЕДА', '#9fd36a');
      G.squad.forEach((s) => {
        const u = this.units.find((x) => x.base === s)!;
        s.hp = Math.min(effMaxHp(s), u.downed ? 1 : u.hp); // тяжелораненые выживают с 1 ОЗ
      });
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
    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      if (p.x !== u.x) u.flip = p.x < u.x;
      const sx = u.px, sy = u.py, tx = p.x * CT + CT / 2, ty = p.y * CT + CT / 2;
      await this.tween(stepMs, (k) => { u.px = lerp(sx, tx, k); u.py = lerp(sy, ty, k); });
      u.x = p.x; u.y = p.y;
    }
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
  float(u: Unit, text: string, color: string) { this.floats.push({ x: u.px, y: u.py - 38, text, color, t: 0 }); },
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
    c.save();
    if (this.shake > 0) c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    c.drawImage(this.bg!, 0, 0);
    if (this.circle) { // пульсирующий круг призыва
      const { x, y, r } = this.circle, p = 0.5 + Math.sin(t * 2) * 0.25;
      c.save(); c.shadowColor = '#9fef6a'; c.shadowBlur = 18;
      c.strokeStyle = `rgba(160,240,110,${p})`; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
      c.beginPath();
      for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * (TAU * 2 / 5) + t * 0.1; const px = x + Math.cos(a) * r * 0.92, py = y + Math.sin(a) * r * 0.92; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      c.stroke(); c.restore();
    }

    const sel = this.sel, playerTurn = this.turn === 'player' && !this.busy;
    const hov = this.hover, hovU = hov ? this.unitAt(hov.x, hov.y) ?? this.downedAt(hov.x, hov.y) : undefined;
    if (playerTurn && sel) {
      const brave = this.action.type === 'c';
      if ((this.action.type === 'w' || brave) && this.reach) {
        for (const n of this.reach.values()) {
          if (n.d === 0) continue;
          c.fillStyle = brave ? 'rgba(240,150,60,0.16)' : n.d <= sel.move ? 'rgba(90,150,210,0.2)' : 'rgba(210,170,80,0.15)';
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
      c.beginPath(); c.ellipse(sel.px, sel.py + 14, 15, 5, 0, 0, TAU); c.stroke();
    }

    // юниты
    for (const sm of this.smoke) { // дымовые облака
      for (let i = 0; i < 9; i++) {
        const px = (sm.x - 1 + (i % 3)) * CT + CT / 2, py = (sm.y - 1 + Math.floor(i / 3)) * CT + CT / 2;
        const g = c.createRadialGradient(px, py, 4, px, py, CT * 0.9);
        g.addColorStop(0, `rgba(150,150,140,${0.55 * Math.min(1, sm.turns / 2 + 0.3)})`); g.addColorStop(1, 'rgba(150,150,140,0)');
        c.fillStyle = g; c.fillRect(px - CT, py - CT, CT * 2, CT * 2);
      }
    }
    const vis = this.units.filter((u) => !u.fled).sort((a, b) => (a.dead === b.dead ? a.py - b.py : a.dead ? -1 : 1));
    for (const u of vis) drawFigure(c, u.kind, u.px, u.py + 15, 1.2, { t, flip: u.flip, dead: u.dead, flash: u.flash, seed: u.seed });

    // эффекты
    for (const f of this.fx) {
      const a = Math.max(0, f.life / f.max);
      if (f.type === 'tracer') { c.strokeStyle = f.color; c.globalAlpha = a; c.lineWidth = 2; c.beginPath(); c.moveTo(f.x1, f.y1); c.lineTo(f.x2, f.y2); c.stroke(); c.globalAlpha = 1; }
      if (f.type === 'ring') { c.strokeStyle = f.color; c.globalAlpha = a; c.lineWidth = 3; c.beginPath(); c.arc(f.x1, f.y1, (1 - a) * 50 + 5, 0, TAU); c.stroke(); c.globalAlpha = 1; }
      if (f.type === 'proj') {
        const x = lerp(f.x1, f.x2, f.k!), y = lerp(f.y1, f.y2, f.k!);
        c.save(); c.shadowColor = f.color; c.shadowBlur = 16; c.fillStyle = f.color; c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill(); c.restore();
      }
    }
    for (const p of this.parts) { c.globalAlpha = Math.max(0, p.life / p.max); c.fillStyle = p.color; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    c.globalAlpha = 1;

    // свет
    const lights: Light[] = this.def.lights.map(([x, y, r, color]) => ({ x: x * CT + 20, y: y * CT + 20, r, a: 0.85 + Math.sin(t * 7 + x) * 0.08, color }));
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.team === 'player') lights.push({ x: u.px, y: u.py, r: 85, a: 0.7 });
      else if (u.kind === 'cultist') lights.push({ x: u.px + (u.flip ? -9 : 9), y: u.py - 25, r: 90, a: 0.9, color: '#9fef6a' });
      else if (u.kind === 'imp') lights.push({ x: u.px, y: u.py - 10, r: 40, a: 0.5, color: '#e8ff6a' });
    }
    for (const f of this.fx) if (f.type === 'proj') lights.push({ x: lerp(f.x1, f.x2, f.k!), y: lerp(f.y1, f.y2, f.k!), r: 70, a: 1, color: f.color });
    this.light!.draw(c, lights, 0.45, 0.45);
    drawAsh(c, t);
    vignette(c, W, H);

    // полоски здоровья и статусы — поверх темноты
    for (const u of this.units) {
      if (u.dead) continue;
      const bw = 30, x = u.px - bw / 2, y = u.py - 34;
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(x - 1, y - 1, bw + 2, 5);
      c.fillStyle = u.team === 'player' ? '#7fbf5a' : '#c9503e';
      c.fillRect(x, y, bw * (u.hp / u.maxHp), 3);
      if (u.team === 'player' && this.turn === 'player') {
        for (let i = 0; i < u.ap; i++) { c.fillStyle = '#e0c070'; c.fillRect(x + i * 6, y - 5, 4, 3); }
      }
      if (u.terror) { c.fillStyle = '#b58cff'; c.font = 'bold 12px serif'; c.fillText('◉', x + bw + 2, y + 4); }
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
          const info = this.action.type === 'c' ? null : this.attackInfo(sel, sel, u, wk, this.action.key === 'aim' ? 4 : 0);
          if (info) lines.push(`d20 ${info.bonus >= 0 ? '+' : ''}${info.bonus} против Защиты ${info.dc}`);
          if (this.action.key === 'charge') lines.push('Штыковая: +2 к атаке, +2 к урону, затем раскрыт');
          if (this.action.key === 'last') lines.push('Натиск: лучший из двух бросков, +2 к урону');
          const cv = w.type === 'ranged' && !w.ignoreCover ? this.coverOf(u, sel) : 0;
          if (cv) lines.push(cv >= 40 ? 'Цель в полном укрытии (+5 к Защите)' : 'Цель в половинном укрытии (+3 к Защите)');
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
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d')!;
    const r = seeded(this.def.id === 'road' ? 42 : 77);
    const factory = this.def.theme === 'factory';
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const X = x * CT, Y = y * CT, t = this.map[y][x];
      if (factory) {
        c.fillStyle = r() < 0.5 ? '#2a2a26' : '#272723'; c.fillRect(X, Y, CT, CT);
        c.strokeStyle = '#1c1c19'; c.lineWidth = 1; c.strokeRect(X + 0.5, Y + 0.5, CT - 1, CT - 1);
        c.fillStyle = '#3a3a34'; for (const [a, b] of [[4, 4], [36, 4], [4, 36], [36, 36]]) c.fillRect(X + a - 1, Y + b - 1, 2, 2);
        if (r() < 0.2) { c.fillStyle = 'rgba(40,70,30,0.35)'; c.beginPath(); c.ellipse(X + r() * CT, Y + r() * CT, 8 + r() * 10, 4 + r() * 5, 0, 0, TAU); c.fill(); }
      } else {
        c.fillStyle = ['#3d3b34', '#413f37', '#3a3832'][Math.floor(r() * 3)]; c.fillRect(X, Y, CT, CT);
        for (let i = 0; i < 12; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '20,20,16' : '90,90,75'},0.25)`; c.fillRect(X + r() * CT, Y + r() * CT, 1.5, 1.5); }
        if (t === ',') { c.strokeStyle = '#5a5638'; for (let i = 0; i < 6; i++) { const gx = X + 6 + r() * 28, gy = Y + 10 + r() * 24; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + (r() - 0.5) * 5, gy - 6); c.stroke(); } }
      }
    }
    if (!factory) { // разбитая дорога через поле боя
      c.fillStyle = 'rgba(25,23,20,0.55)';
      c.beginPath(); c.moveTo(0, 6.2 * CT); c.bezierCurveTo(8 * CT, 5.5 * CT, 14 * CT, 8.4 * CT, W, 6.6 * CT); c.lineTo(W, 8 * CT); c.bezierCurveTo(14 * CT, 9.8 * CT, 8 * CT, 7 * CT, 0, 7.8 * CT); c.fill();
    }
    const os = this.map.flatMap((row, y) => row.map((t, x) => (t === 'o' ? { x, y } : null)).filter(Boolean)) as Pt[];
    if (os.length) {
      const cx = os.reduce((s, p) => s + p.x, 0) / os.length * CT + CT / 2, cy = os.reduce((s, p) => s + p.y, 0) / os.length * CT + CT / 2;
      this.circle = { x: cx, y: cy, r: 2.9 * CT };
      c.strokeStyle = 'rgba(60,90,40,0.8)'; c.lineWidth = 3;
      c.beginPath(); c.arc(cx, cy, this.circle.r, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(90,10,10,0.35)'; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(cx + (r() - 0.5) * 120, cy + (r() - 0.5) * 120, 6 + r() * 8, 3 + r() * 4, 0, 0, TAU); c.fill(); }
    } else this.circle = null;

    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const X = x * CT, Y = y * CT, t = this.map[y][x], cx = X + CT / 2;
      switch (t) {
        case '#':
          if (factory) {
            c.fillStyle = '#3b241e'; c.fillRect(X, Y - 8, CT, CT + 8);
            c.strokeStyle = 'rgba(20,10,8,0.6)'; c.lineWidth = 1;
            for (let yy = Y - 8; yy < Y + CT; yy += 7) { c.beginPath(); c.moveTo(X, yy); c.lineTo(X + CT, yy); c.stroke(); }
            c.fillStyle = '#2a1712'; c.fillRect(X, Y - 10, CT, 4);
          } else {
            c.fillStyle = '#4e4b43'; c.fillRect(X + 2, Y - 10, CT - 4, CT + 8);
            c.strokeStyle = '#34322c'; c.lineWidth = 1.5;
            for (let yy = Y - 4; yy < Y + CT; yy += 9) { c.beginPath(); c.moveTo(X + 2, yy); c.lineTo(X + CT - 2, yy); c.stroke(); }
            c.fillStyle = '#5c5950'; c.fillRect(X + 2, Y - 12, CT - 4, 4);
          }
          break;
        case 'T': drawDeadTree(c, cx, Y + CT - 6, r, 1.4); break;
        case 'c': drawCrate(c, cx, Y + CT - 4, CT, r() < 0.4); break;
        case 'f':
          c.fillStyle = '#2c241b'; c.fillRect(X + 4, Y + 10, 4, 26); c.fillRect(X + CT - 8, Y + 12, 4, 24);
          c.fillStyle = '#3e3225'; c.fillRect(X, Y + 16, CT, 4); c.fillRect(X, Y + 27, CT, 4);
          break;
        case 'w':
          if (factory) {
            c.fillStyle = '#1e1e1b'; c.beginPath(); c.ellipse(cx, Y + 22, 18, 14, 0, 0, TAU); c.fill();
            c.fillStyle = '#21402a'; c.beginPath(); c.ellipse(cx, Y + 20, 14, 9, 0, 0, TAU); c.fill();
            c.strokeStyle = '#3a3a34'; c.lineWidth = 2; c.beginPath(); c.ellipse(cx, Y + 20, 16, 11, 0, 0, TAU); c.stroke();
          } else {
            c.fillStyle = '#0b0c0a'; c.beginPath(); c.ellipse(cx, Y + 22, 19, 13, 0, 0, TAU); c.fill();
            c.fillStyle = 'rgba(130,170,110,0.25)'; c.beginPath(); c.ellipse(cx - 5, Y + 18, 7, 2, 0, 0, TAU); c.fill();
          }
          break;
        case 'm':
          c.fillStyle = '#26282a'; c.fillRect(X + 2, Y - 6, CT - 4, CT + 2);
          c.fillStyle = '#34363a'; c.fillRect(X + 2, Y - 8, CT - 4, 5);
          c.strokeStyle = '#4a3a2a'; c.lineWidth = 3; c.beginPath(); c.arc(cx, Y + 12, 9, 0, TAU); c.stroke();
          c.fillStyle = '#4a3a2a'; c.beginPath(); c.arc(cx, Y + 12, 3, 0, TAU); c.fill();
          c.fillStyle = '#2a2016'; c.fillRect(X + 6, Y + 26, 6, 8);
          break;
        case 'P':
          c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(X + 12, Y + 30, 22, 8);
          c.fillStyle = '#33302b'; c.fillRect(X + 11, Y - 20, 18, CT + 16);
          c.fillStyle = '#4a463e'; c.fillRect(X + 9, Y - 22, 22, 5); c.fillRect(X + 9, Y + 30, 22, 5);
          c.fillStyle = '#5a564c'; for (let yy = Y - 14; yy < Y + 28; yy += 10) c.fillRect(X + 13, yy, 2, 2);
          break;
      }
    }
    c.strokeStyle = 'rgba(255,255,255,0.035)'; c.lineWidth = 1;
    for (let x = 0; x <= CW; x++) { c.beginPath(); c.moveTo(x * CT + 0.5, 0); c.lineTo(x * CT + 0.5, H); c.stroke(); }
    for (let y = 0; y <= CH; y++) { c.beginPath(); c.moveTo(0, y * CT + 0.5); c.lineTo(W, y * CT + 0.5); c.stroke(); }
    this.bg = cv;
  },
};

function drawShield(c: CanvasRenderingContext2D, x: number, y: number, full: boolean) {
  c.fillStyle = full ? '#7fb3e0' : 'rgba(127,179,224,0.55)';
  c.beginPath(); c.moveTo(x - 5, y - 6); c.lineTo(x + 5, y - 6); c.lineTo(x + 5, y); c.lineTo(x, y + 6); c.lineTo(x - 5, y); c.closePath(); c.fill();
  if (!full) { c.fillStyle = '#10140d'; c.fillRect(x, y - 5, 4, 10); }
}
