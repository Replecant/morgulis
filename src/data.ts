// ============================================================
//  Данные: оружие, отряд, противники, тактические карты
// ============================================================

import { PROF_EQUIP, SQUAD_EQUIP, Equip } from './items';
import { Character, PROFESSIONS, maxHp, defense, meleeAttack, rangedAttack, meleeDamage, horrorSave, skillBonus, talentsOf, talentMod } from './rules';
import { tr } from './i18n';

export interface Weapon {
  name: string;
  type: 'ranged' | 'melee';
  range?: number;      // макс. дальность (клетки)
  opt?: number;        // дальше этой дистанции — штраф −1 за каждые 2 клетки
  atk: number;         // бонус оружия к броску атаки
  dmg: [number, number];
  ammo?: number;
  ignoreCover?: boolean;
  splash?: [number, number];
  magic?: boolean;
  ammoType?: 'ammo_pistol' | 'ammo_rifle' | 'ammo_shell' | 'ammo_mg'; // чем перезаряжается (нет — заряды только на бой)
  poison?: boolean;    // попадание отравляет (лёгкое ранение «Отравление газом»)
  gas?: boolean;       // газовая атака: противогаз полностью защищает
  shot?: boolean;      // дробь: −1 урона за клетку дальше оптимальной
  pierce?: boolean;    // пробивает броню
  closePen?: number;   // штраф к попаданию в упор (соседняя клетка); по умолчанию у огнестрела 3, у пистолетов 1, у дробовиков 0
  breath?: number;     // дыхание: бьёт всех в полосе на столько клеток вперёд и вешает слабость
  burst?: number;      // очередь: столько выстрелов за атаку, каждый с −3; цель и её соседи подавлены
  antiDemon?: number;  // прибавка к урону по демоническим существам
  heavy?: boolean;     // тяжёлое: −1 к перемещению
  color?: string;      // цвет снаряда у колдовского оружия (по умолчанию — зелёный)
}

export const WEAPONS: Record<string, Weapon> = {
  revolver:  { name: 'Револьвер', type: 'ranged', closePen: 1, range: 7, opt: 4, atk: 1, dmg: [3, 5], ammo: 6, ammoType: 'ammo_pistol' },
  autopistol:{ name: 'Самозарядный пистолет', type: 'ranged', closePen: 1, range: 6, opt: 4, atk: 1, dmg: [2, 5], ammo: 8, ammoType: 'ammo_pistol' },
  saber:     { name: 'Офицерская сабля', type: 'melee', atk: 1, dmg: [4, 7] },
  carbine:   { name: 'Карабин', type: 'ranged', range: 8, opt: 5, atk: 0, dmg: [3, 5], ammo: 4, ammoType: 'ammo_rifle' },
  rifle:     { name: 'Армейская винтовка', type: 'ranged', range: 11, opt: 8, atk: 1, dmg: [4, 6], ammo: 5, ammoType: 'ammo_rifle' },
  huntrifle: { name: 'Охотничья винтовка', type: 'ranged', closePen: 5, range: 13, opt: 10, atk: 2, dmg: [5, 7], ammo: 3, ammoType: 'ammo_rifle' },
  shotgun2:  { name: 'Двуствольный дробовик', type: 'ranged', closePen: 0, range: 5, opt: 2, atk: 1, dmg: [5, 8], ammo: 2, ammoType: 'ammo_shell', shot: true },
  pumpshot:  { name: 'Помповый дробовик', type: 'ranged', closePen: 0, range: 5, opt: 2, atk: 1, dmg: [4, 7], ammo: 5, ammoType: 'ammo_shell', shot: true },
  flamer:    { name: 'Огнемёт', type: 'ranged', closePen: 0, range: 4, opt: 4, atk: 2, dmg: [4, 6], ammo: 3, ignoreCover: true, splash: [2, 3] },
  mg:        { name: 'Ручной пулемёт', type: 'ranged', closePen: 4, range: 10, opt: 6, atk: 0, dmg: [3, 5], ammo: 15, ammoType: 'ammo_mg', burst: 3, heavy: true },
  exprifle:  { name: 'Экспериментальная винтовка', type: 'ranged', range: 12, opt: 9, atk: 2, dmg: [6, 8], ammo: 4, ammoType: 'ammo_rifle', pierce: true },
  bayonet:   { name: 'Штык', type: 'melee', atk: 0, dmg: [2, 4] },
  knife:     { name: 'Нож', type: 'melee', atk: 1, dmg: [2, 4] },
  wrench:    { name: 'Тяжёлый гаечный ключ', type: 'melee', atk: 0, dmg: [3, 5] },
  sawnoff:   { name: 'Обрез', type: 'ranged', closePen: 0, range: 4, opt: 2, atk: 0, dmg: [4, 7], ammo: 2, ammoType: 'ammo_shell', shot: true },
  axe:       { name: 'Топор', type: 'melee', atk: 0, dmg: [3, 7] },
  fists:     { name: 'Кулаки', type: 'melee', atk: 0, dmg: [1, 2] },
  pitchfork: { name: 'Вилы', type: 'melee', atk: 0, dmg: [2, 4] },
  musket:    { name: 'Старое ружьё', type: 'ranged', range: 7, opt: 3, atk: -1, dmg: [2, 4] },
  buttstock: { name: 'Приклад', type: 'melee', atk: -1, dmg: [1, 3] },
  // оружие траншейных мертвецов
  cudgel:    { name: 'Дубина', type: 'melee', atk: 0, dmg: [1, 3] },
  breath:    { name: 'Зловонное дыхание', type: 'ranged', closePen: 0, range: 4, opt: 4, atk: 2, dmg: [2, 4], ignoreCover: true, breath: 4, ammo: 1 }, // раз за бой
  salbite:   { name: 'Укус', type: 'melee', atk: 1, dmg: [3, 6] },
  rustbayonet: { name: 'Ржавый штык', type: 'melee', atk: 0, dmg: [2, 4] },
  oldrifle:  { name: 'Гнилая винтовка', type: 'ranged', range: 9, opt: 5, atk: -1, dmg: [3, 5] },
  gasbreath: { name: 'Газовый выдох', type: 'ranged', closePen: 0, range: 3, opt: 3, atk: 1, dmg: [2, 3], ignoreCover: true, splash: [1, 2], poison: true, gas: true },
  deadfist:  { name: 'Кулаки', type: 'melee', atk: 1, dmg: [2, 3] },
  demonfire: { name: 'Демоническое пламя', type: 'ranged', closePen: 0, range: 7, opt: 6, atk: 1, dmg: [3, 5], ammo: 3, ignoreCover: true, magic: true }, // Ферглоу: три раза за бой, сквозь укрытия
  deadgrenade: { name: 'Старая граната', type: 'ranged', closePen: 0, range: 5, opt: 5, atk: 0, dmg: [3, 5], ammo: 2, ignoreCover: true, splash: [2, 3] }, // мертвец-гренадер: две на бой, взрыв задевает и своих
  trenchclub:{ name: 'Траншейная дубинка', type: 'melee', atk: 1, dmg: [3, 5] },
  spade:     { name: 'Сапёрная лопатка', type: 'melee', atk: 0, dmg: [3, 6] },
  rdagger:   { name: 'Ритуальный кинжал', type: 'melee', atk: 1, dmg: [2, 4], antiDemon: 3 },
  hammer:    { name: 'Двуручный молот', type: 'melee', atk: -1, dmg: [4, 8] },
  claws:     { name: 'Когти', type: 'melee', atk: 0, dmg: [2, 3] },
  hexfire:   { name: 'Ведьмин огонь', type: 'ranged', range: 7, opt: 7, atk: 1, dmg: [2, 4], ignoreCover: true, magic: true },
  houndbite: { name: 'Клыки', type: 'melee', atk: 1, dmg: [3, 6] },
  demonclaw: { name: 'Когти демона', type: 'melee', atk: 1, dmg: [4, 7] },
  // морлоки: камни из пращи, кость и дурной глаз
  sling:     { name: 'Праща', type: 'ranged', closePen: 1, range: 7, opt: 4, atk: 0, dmg: [2, 4] },
  boneclub:  { name: 'Костяная дубина', type: 'melee', atk: 1, dmg: [3, 6] },
  boneknife: { name: 'Костяной нож', type: 'melee', atk: 0, dmg: [2, 3] },
  bonecurse: { name: 'Порча', type: 'ranged', closePen: 0, range: 6, opt: 6, atk: 1, dmg: [2, 3], ignoreCover: true, magic: true, color: '#f0d040' },
  flame:     { name: 'Зелёное пламя', type: 'ranged', range: 8, opt: 8, atk: 1, dmg: [3, 5], ignoreCover: true, splash: [1, 2], magic: true },
};

export const ABILITIES: Record<string, { name: string; desc: string }> = {
  reload:     { name: 'Перезарядка', desc: '1 ОД. Дозарядить оружие патронами из запаса и расклинить заклинившее.' },
  rally:      { name: 'Командный клич', desc: '1 ОД. Союзник в радиусе 6 получает +1 ОД. Раз за бой.' },
  grenade:    { name: 'Граната', desc: 'Завершает ход. Бросок до 5 клеток, взрыв 3×3, урон 3–5 — и своим тоже!' },
  dynamite:   { name: 'Динамит', desc: 'Завершает ход. Бросок до 4 клеток, взрыв 3×3, урон 5–8 — и своим тоже! Мешки, ящики и заборы в облаке разлетаются.' },
  smoke:      { name: 'Дым', desc: '1 ОД. Дымовое облако 3×3 на два хода: закрывает обзор, стоящим в дыму +3 к Защите.' },
  bandage:    { name: 'Бинт', desc: '1 ОД. Себе или соседу: +3 ОЗ и бонус Медицины. Поднимает тяжелораненого.' },
  medkit:     { name: 'Аптечка', desc: '1 ОД. Себе или соседу: +6 ОЗ и бонус Медицины. Поднимает тяжелораненого.' },
  painkiller: { name: 'Обезбол.', desc: '1 ОД. Себе: +3 ОЗ и +1 кураж.' },
  aim:        { name: 'Прицельный выстрел', desc: '2 ОД. Выстрел с +4 к броску атаки.' },
  wimp:       { name: 'Призыв беса', desc: 'Раз за бой, завершает ход (Ферглоу). Бес появляется на соседней клетке и служит отряду 3 раунда. Редко — своеволит.' },
  galvanic:   { name: 'Гальв. разряд', desc: 'Без ОД, раз за бой (гальваническая рука). Следующий удар в ближнем бою: +2 к атаке и урону. После удара — проверка Силы КС 12, провал: −1 ОЗ.' },
};

export interface UnitBase {
  id: string;
  name: string;
  kind: string;          // ключ внешнего вида (см. gfx.ts STYLES)
  hp: number;
  maxHp: number;
  move: number;
  weapons: string[];
  atkM: number;          // бонус атаки в ближнем бою
  atkR: number;          // бонус атаки дальнобойным оружием
  def: number;           // Защита (КС для попадания)
  armor?: number;        // поглощение урона
  dmgM?: number;         // бонус урона в ближнем бою
  horror?: number;       // бонус к спасброску против ужаса
  med?: number;          // бонус Медицины (перевязка, операции)
  str?: number;          // Сила спутника — сколько он унесёт (у героя берётся из характеристик)
  wounds?: string[];     // ранения (см. wounds.ts)
  limbs?: Partial<Record<'armR' | 'armL' | 'legR' | 'legL' | 'eyeR' | 'eyeL', string>>; // утраченные части тела и протезы (см. prosthetics.ts)
  strain?: number;       // оккультное напряжение 0–6 (оккультист)
  fleshDue?: number;      // плотяная рука: когда (G.clock) нужен тканевый раствор
  fleshReject?: boolean;  // плотяная рука: отторжение
  equip?: Equip;         // снаряжение (см. items.ts) — у бойцов отряда
  look?: string;         // ключ стиля фигурки с учётом снаряжения
  abil?: Record<string, number>;
  ai?: 'melee' | 'ranged' | 'caster' | 'breath'; // breath — сперва дыхание, потом врукопашную
  leader?: boolean;
  demonic?: boolean;
  howl?: boolean;        // колдун без бесов: вместо Шёпота Бездны — вой из темноты (шаман морлоков)
  boss?: boolean;
  courage0?: number;     // кураж в начале боя от талантов
  innate?: string[];     // оружие, которое не зависит от снаряжения (оккультное пламя Ферглоу)
  tflags?: string[];     // таланты профессии героя (для боя)
}

/** Командир отряда — персонаж игрока, собранный по правилам из rules.ts. */
export function makeLeader(c: Character): UnitBase {
  const p = PROFESSIONS[c.prof];
  const hp = maxHp(c);
  return {
    id: 'pc', name: `${tr(c.first).slice(0, 1)}. ${c.last}`, /* инициал — от имени на языке игры */ kind: 'pc', hp,
    weapons: p.weapons.slice(), wounds: [], equip: { ...PROF_EQUIP[c.prof] }, // броня теперь даётся предметами
    leader: true, ...leaderStats(c),
  };
}
/** Характеристики героя из правил: уровень, черты, таланты (снаряжение и раны считаются в бою отдельно). */
export function leaderStats(c: Character) {
  const abil: Record<string, number> = { ...PROFESSIONS[c.prof].combatAbil };
  for (const t of talentsOf(c)) for (const [k, n] of Object.entries(t.abil ?? {})) abil[k] = (abil[k] ?? 0) + n;
  return {
    maxHp: maxHp(c), move: 4 + talentMod(c, 'move'), atkM: meleeAttack(c), atkR: rangedAttack(c), def: defense(c),
    armor: talentMod(c, 'armor'), dmgM: meleeDamage(c), horror: horrorSave(c), med: skillBonus(c, 'medicine'),
    courage0: talentMod(c, 'courage'), tflags: talentsOf(c).map((t) => t.id), abil,
  };
}
/** Пересчитать героя после нового уровня или таланта: прибавка к максимуму ОЗ добавляется и к текущим. */
export function refreshLeader(c: Character, b: UnitBase) {
  const s = leaderStats(c), dHp = s.maxHp - b.maxHp;
  Object.assign(b, s);
  b.hp = Math.max(1, Math.min(b.maxHp, b.hp + Math.max(0, dHp)));
}

/** Александр — мальчишка из Ричморда, мечтает о приключениях. Самый лёгкий и быстрый в отряде — и самый хилый. */
export function makeAlex(): UnitBase {
  return {
    id: 'alex', name: 'Александр', kind: 'alex', hp: 6, maxHp: 6, move: 5,
    weapons: ['knife'], atkM: 0, atkR: 0, def: 15, armor: 0, dmgM: 0, horror: -1, med: 0, str: -1, wounds: [],
    equip: { main: 'knife', head: 'cap', body: 'clothes' }, abil: {},
  };
}

/** Артур Сильвер — племянник повешенного барона, стрелок: охотничья винтовка и прицельный выстрел, сабля про запас. */
export function makeArthur(): UnitBase {
  return {
    id: 'arthur', name: 'Артур', kind: 'arthur', hp: 12, maxHp: 12, move: 4,
    weapons: ['huntrifle', 'saber'], atkM: 1, atkR: 3, def: 14, armor: 0, dmgM: 0, horror: 0, med: 0, str: 0, wounds: [],
    equip: { main: 'huntrifle', side: 'saber', body: 'clothes' }, abil: { aim: 99 },
  };
}

/** Айви Гримшоу — армейский медик, сбежавшая от Леди Харрингтон; лучшая перевязка в отряде, револьвер и нож. */
export function makeIvy(): UnitBase {
  return {
    id: 'ivy', name: 'Айви', kind: 'ivy', hp: 10, maxHp: 10, move: 4,
    weapons: ['revolver', 'knife'], atkM: 1, atkR: 1, def: 13, armor: 0, dmgM: 0, horror: 1, med: 4, str: 1, wounds: [],
    equip: { main: 'revolver', side: 'knife', body: 'clothes' }, abil: {},
  };
}

/** Уильям Ферглоу — джентри из Империи, член имперского оккультного общества, демонолог: демоническое пламя и призыв беса. */
export function makeFerglow(): UnitBase {
  return {
    id: 'ferglow', name: 'Уильям', kind: 'ferglow', hp: 9, maxHp: 9, move: 4,
    weapons: ['demonfire', 'revolver', 'rdagger'], innate: ['demonfire'], atkM: 0, atkR: 2, def: 13, armor: 0, dmgM: 0, horror: 3, med: 0, str: -1, wounds: [],
    equip: { main: 'revolver', side: 'rdagger', head: 'tophat', body: 'clothes' }, abil: { wimp: 1 },
  };
}

/** Игрок начинает один — отряд пока состоит только из героя. */
export function makeSquad(c: Character): UnitBase[] {
  return [makeLeader(c)];
}

/** Противник. def — Защита по старой шкале d20; под 3d6 к ней прибавляется DEF_SHIFT (см. DEF_BASE в rules.ts). */
const DEF_SHIFT = 3;
const E = (id: string, name: string, kind: string, hp: number, move: number, weapons: string[], ai: UnitBase['ai'], atk: number, def: number, extra: Partial<UnitBase> = {}): UnitBase =>
  ({ id, name, kind, hp, maxHp: hp, move, weapons, ai, atkM: atk, atkR: atk, def: def + DEF_SHIFT, ...extra });

export const ENEMIES: Record<string, UnitBase> = {
  fork:        E('fork', 'Ополченец', 'militia', 7, 4, ['pitchfork'], 'melee', 2, 10),
  musket:      E('musket', 'Ополченец с ружьём', 'militia_gun', 6, 4, ['musket'], 'ranged', 2, 10),
  brem:        E('brem', 'Кузнец Брэм', 'smith', 13, 4, ['hammer'], 'melee', 4, 11, { boss: true, armor: 1, dmgM: 1 }),
  fanatic:     E('fanatic', 'Фанатик', 'fanatic', 8, 4, ['pitchfork'], 'melee', 3, 11),
  fanatic_gun: E('fanatic_gun', 'Фанатик с ружьём', 'fanatic_gun', 7, 4, ['musket'], 'ranged', 3, 10),
  vale:        E('vale', 'Мордекай Вейл', 'cultist', 22, 4, ['flame'], 'caster', 4, 12, { demonic: true, boss: true }),
  imp:         E('imp', 'Бес', 'imp', 5, 6, ['claws'], 'melee', 3, 13, { demonic: true }),
  scav_gun:    E('scav_gun', 'Мародёр с ружьём', 'militia_gun', 6, 4, ['musket'], 'ranged', 2, 10),
  scav_knife:  E('scav_knife', 'Мародёр с ножом', 'militia', 7, 4, ['knife'], 'melee', 2, 10),
  // бандиты пустоши: серьёзнее оборванцев — трофейное оружие, ремни, умеют драться
  bandit_gun:  E('bandit_gun', 'Бандит с винтовкой', 'bandit_gun', 9, 4, ['rifle', 'knife'], 'ranged', 3, 11),
  bandit_shot: E('bandit_shot', 'Бандит с обрезом', 'bandit_shot', 10, 4, ['sawnoff', 'knife'], 'ranged', 2, 11),
  bandit_axe:  E('bandit_axe', 'Бандит с топором', 'bandit_axe', 12, 4, ['axe'], 'melee', 3, 11, { armor: 1 }),
  // дезертиры армии Леди Харрингтон — бывшие солдаты: стреляют лучше бандитов и держатся укрытий
  deserter:        E('deserter', 'Дезертир', 'deserter', 10, 4, ['rifle', 'bayonet'], 'ranged', 3, 12),
  deserter_sapper: E('deserter_sapper', 'Дезертир-сапёр', 'deserter_sapper', 13, 4, ['spade'], 'melee', 3, 11, { armor: 1 }),
  deserter_mg:     E('deserter_mg', 'Дезертир с пулемётом', 'deserter_mg', 11, 3, ['mg', 'knife'], 'ranged', 2, 11),
  deserter_sgt:    E('deserter_sgt', 'Беглый сержант', 'deserter_sgt', 15, 4, ['revolver', 'bayonet'], 'ranged', 4, 12, { armor: 1 }),
  // солдаты патрулей — союзники в стычках фракций
  baron_soldier: E('baron_soldier', 'Солдат Олдриджа', 'guard', 10, 4, ['rifle', 'bayonet'], 'ranged', 3, 12),
  bsoldier:      E('bsoldier', 'Солдат Леди Харрингтон', 'bguard', 10, 4, ['rifle', 'bayonet'], 'ranged', 3, 12),
  wf_soldier:    E('wf_soldier', 'Солдат Винферда', 'wfguard', 10, 4, ['rifle', 'bayonet'], 'ranged', 3, 12),
  brother_fighter: E('brother_fighter', 'Брат свободы', 'brother', 9, 4, ['carbine', 'bayonet'], 'ranged', 2, 11),
  b_officer:       E('b_officer', 'Офицер Леди Харрингтон', 'bofficer', 13, 4, ['revolver', 'saber'], 'ranged', 3, 12, { armor: 1 }),
  ivy_foe:         E('ivy_foe', 'Айви Гримшоу', 'ivy', 10, 4, ['revolver', 'knife'], 'ranged', 3, 13),
  brother_off:     E('brother_off', 'Старший брат', 'brother_off', 12, 4, ['revolver', 'bayonet'], 'ranged', 3, 12, { armor: 1 }),
  bandit_boss: E('bandit_boss', 'Главарь шайки', 'bandit_boss', 15, 4, ['revolver', 'saber'], 'ranged', 4, 12, { armor: 1 }),
  // морской демон: громадный, скользкий (высокая Защита), ядовитое дыхание
  salamander: E('salamander', 'Морской демон', 'salamander', 26, 3, ['breath', 'salbite'], 'breath', 2, 13, { armor: 1, demonic: true }),
  // голодные бандиты: слабые, измождённые
  hungry:  E('hungry', 'Голодный бандит', 'hungry', 5, 4, ['knife'], 'melee', 0, 9),
  hungry2: E('hungry2', 'Голодный бандит', 'hungry2', 5, 4, ['cudgel'], 'melee', 0, 9),
  // ковен: ведьмы колдуют издали, старшие демоны рвут вблизи
  witch:  E('witch', 'Ведьма ковена', 'crone2', 10, 3, ['hexfire'], 'caster', 3, 11, { demonic: true }),
  witch2: E('witch2', 'Старшая ведьма', 'crone', 14, 3, ['hexfire'], 'caster', 4, 12, { demonic: true, boss: true }),
  hound:  E('hound', 'Адская гончая', 'hound', 12, 6, ['houndbite'], 'melee', 3, 12, { demonic: true }),
  demon:  E('demon', 'Рогатый демон', 'demon', 22, 4, ['demonclaw'], 'melee', 4, 13, { demonic: true, armor: 1 }),
  // лоялисты старого режима: бывшие гвардейцы, загнанные в лес — стреляют метко, патронов мало
  loyalist:  E('loyalist', 'Лоялист', 'loyalist', 8, 4, ['carbine', 'bayonet'], 'ranged', 2, 11),
  loyalist2: E('loyalist2', 'Лоялист', 'loyalist2', 8, 4, ['carbine', 'bayonet'], 'ranged', 2, 11),
  loyal_off: E('loyal_off', 'Офицер старой гвардии', 'loyal_off', 12, 4, ['revolver', 'saber'], 'ranged', 3, 12),
  // траншейные мертвецы: медленные, упрямые, бьют больно
  dead_soldier: E('dead_soldier', 'Окопный мертвец', 'dead_soldier', 9, 3, ['deadfist'], 'melee', 2, 9),
  dead_rifle:   E('dead_rifle', 'Мертвец-стрелок', 'dead_rifle', 7, 3, ['oldrifle', 'rustbayonet'], 'ranged', 1, 9),
  // газовый мертвец — смертник: бредёт на отряд, выдыхает газ, а убитый — лопается облаком газа на соседние клетки
  dead_gas:     E('dead_gas', 'Газовый мертвец', 'dead_gas', 9, 3, ['gasbreath'], 'melee', 1, 9),
  dead_sapper:  E('dead_sapper', 'Мертвец-сапёр в панцире', 'dead_sapper', 16, 2, ['spade'], 'melee', 3, 10, { armor: 2 }),
  // траншейное море: мертвецы бывшего фронта Империи и баронов-сепаратистов
  // гренадер швыряет старые гранаты, пока есть, потом идёт врукопашную; убитый — иногда рвётся гранатой на поясе
  dead_gren:    E('dead_gren', 'Мертвец-гренадер', 'dead_gren', 9, 3, ['deadgrenade', 'deadfist'], 'ranged', 1, 9),
  // штурмовик — единственный быстрый мертвец: каска, маска, траншейная дубинка
  dead_storm:   E('dead_storm', 'Траншейный штурмовик', 'dead_storm', 12, 5, ['trenchclub'], 'melee', 3, 11, { armor: 1 }),
  // морлоки — одичавшие люди из пещер у южных гор Винферда: быстрые, жестокие, стаей
  morlock_sling:  E('morlock_sling', 'Морлок-пращник', 'morlock_sling', 7, 5, ['sling', 'boneknife'], 'ranged', 3, 11),
  morlock_war:    E('morlock_war', 'Морлок-воин', 'morlock_war', 12, 5, ['boneclub'], 'melee', 3, 11),
  morlock_shaman: E('morlock_shaman', 'Морлок-шаман', 'morlock_shaman', 9, 4, ['bonecurse', 'boneknife'], 'caster', 3, 11, { howl: true }),
  // культисты траншейного моря — бывшие солдаты Империи в обносках, что служат демонам; ходят с ними одной сворой
  cultist:      E('cultist', 'Культист', 'cult_k', 8, 4, ['bayonet', 'knife'], 'melee', 2, 10),
  cultist_gun:  E('cultist_gun', 'Культист с винтовкой', 'cult_g', 8, 4, ['rifle', 'bayonet'], 'ranged', 2, 10),
};

export interface BattleDef {
  id: string;
  title: string;
  theme: 'road' | 'factory' | 'trench' | 'forest' | 'rocks';
  dark?: boolean; // темно — свет только у отряда и в редких бликах
  map: string[];
  players: [number, number][];
  /** ammo — сколько зарядов на бой (иначе — без счёта), extra — добавочное оружие, move — поправка хода */
  enemies: { t: string; x: number; y: number; name?: string; ammo?: Record<string, number>; extra?: string[]; move?: number; note?: string }[];
  /** союзники: воюют на стороне отряда сами, под управлением ИИ (стычки фракций) */
  allies?: { t: string; x: number; y: number; ammo?: Record<string, number> }[];
  lights: [number, number, number, string][]; // x, y, радиус(px), цвет
}

/*  Легенда карт:
 *  .  земля / пол        ,  сухая трава
 *  #  стена (полное укрытие, блокирует обзор)
 *  T  мёртвое дерево     m  станок    P  колонна   (полное укрытие)
 *  c  ящики/бочки/обломки  f  забор                (половинное укрытие)
 *  w  лужа нефти (непроходимо, обзор не закрывает)
 *  R  валун (полное укрытие)   r  россыпь камней (половинное укрытие)
 *  o  ритуальный круг (проходимо)
 *  x  колючая проволока (непроходимо, обзор не закрывает)
 */
/** Стычка фракций, в которую вступил отряд: кто с нами и кто против (заполняет main.ts перед боем). */
export const CLASH = { allies: [] as string[], enemies: [] as string[], title: 'Стычка', forest: false };

export function battleDef(id: string, _flags: Record<string, boolean | undefined>): BattleDef {
  if (id === 'clash') { // стычка: отряд вступает за одну из сторон, союзники воюют рядом
    const w = battleDef(CLASH.forest ? 'loyal2' : 'waste', _flags);
    const epos = [{ x: 19, y: 5 }, { x: 17, y: 9 }, { x: 21, y: 7 }, { x: 20, y: 11 }], apos = [{ x: 5, y: 4 }, { x: 6, y: 7 }, { x: 5, y: 10 }, { x: 6, y: 12 }];
    return { ...w, id, title: CLASH.title, enemies: CLASH.enemies.slice(0, 4).map((t, i) => ({ t, ...epos[i] })), allies: CLASH.allies.slice(0, 4).map((t, i) => ({ t, ...apos[i] })) };
  }
  if (id.startsWith('trench')) return trenchBattle(id);
  if (id === 'lake') { // берег озера: вода (непроходимо), камни, коряги
    return { id, title: 'Берег озера', theme: 'road',
      map: [
        'wwwwwwwwwwwwwwwwwwwwwwww',
        'wwwwwwwwwwwwwwwwwwwwwwww',
        'wwwwwwwwwwwwwwwwwwwwwwww',
        'www..wwwwwwww....wwwwwww',
        '.......ww.......c...wwww',
        '...,.......T..........ww',
        '.c.......,......,.......',
        '.......c.........T......',
        '...T........,...........',
        '.........c.........c....',
        '..,..........T..........',
        '.......,..........,.....',
        '....c..........c........',
        '........................',
      ],
      players: [[3, 9], [3, 11], [2, 8], [2, 10]],
      enemies: [{ t: 'salamander', x: 17, y: 5 }],
      lights: [[12, 3, 220, '#6a9a8a'], [3, 10, 110, '#e8c070']],
    };
  }
  if (id === 'ivy') { // Айви не пойдёт с мертвецом — у входа в пещеру
    const w = battleDef('waste', _flags);
    return { ...w, id, title: 'Айви', enemies: [{ t: 'ivy_foe', x: 16, y: 7, ammo: { revolver: 6 } }], lights: [[12, 7, 180, '#a8b890'], [3, 7, 110, '#e8c070']] };
  }
  if (id === 'revo') { // братья свободы узнали Артура (или вас — по спискам разыскиваемых): бой в северном лесу
    const f = battleDef('loyal2', _flags);
    return { ...f, id, title: 'Братья свободы', enemies: [{ t: 'brother_off', x: 20, y: 7, ammo: { revolver: 6 } }, { t: 'brother_fighter', x: 18, y: 4, ammo: { carbine: 4 } }, { t: 'brother_fighter', x: 18, y: 10, ammo: { carbine: 4 } }, { t: 'brother_fighter', x: 21, y: 11, ammo: { carbine: 4 } }] };
  }
  if (id.startsWith('dsqh_')) { // свора культистов и демонов в траншейном море: состав в id (dsqh_cultist+imp+hound)
    const kinds = id.slice(5).split('+'), t = trenchBattle('trench1'), pos = [{ x: 19, y: 4 }, { x: 20, y: 9 }, { x: 22, y: 6 }, { x: 21, y: 11 }];
    return { ...t, id, title: 'Культ в траншеях', enemies: kinds.slice(0, 4).map((k, i) => ({ t: k, ...pos[i], ammo: k === 'cultist_gun' ? { rifle: 3 } : undefined })), lights: [[12, 6, 160, '#c86a40'], [3, 7, 110, '#e8c070']] };
  }
  if (id.startsWith('dsq_')) { // отряд демонов в лесу у ковена: состав в id (dsq_imp+hound+demon)
    const kinds = id.slice(4).split('+'), pos = [{ x: 19, y: 5 }, { x: 19, y: 9 }, { x: 21, y: 7 }];
    const f = battleDef('loyal2', _flags);
    return { ...f, id, title: 'Демоны в тумане', enemies: kinds.map((t, i) => ({ t, ...pos[i] })), lights: [[12, 6, 200, '#9aff60'], [3, 7, 110, '#e8c070']] };
  }
  if (id === 'coven') { // поляна ковена: каменный круг, ели, топь
    return { id, title: 'Ковен ведьм', theme: 'forest',
      map: [
        'TT.T....T....T...T..T.TT',
        'T..ww.......T.....c...TT',
        '..T.....T......T.......T',
        '.....T...ooooo.....T....',
        'T.......ooooooo.......T.',
        '..c....ooooooooo..T.....',
        '.......ooooooooo........',
        'T..T...ooooooooo....c..T',
        '.......ooooooooo.T......',
        '..T.....ooooooo.......T.',
        '.....T...ooooo....T.....',
        'T........c........ww..T.',
        '..T..T......T.......T...',
        'TT....T...T...T..T...TTT',
      ],
      players: [[2, 6], [2, 8], [1, 5], [1, 9]],
      enemies: [{ t: 'witch2', x: 12, y: 6 }, { t: 'witch', x: 15, y: 4 }, { t: 'witch', x: 15, y: 9 }, { t: 'demon', x: 10, y: 7 }, { t: 'hound', x: 9, y: 4 }, { t: 'imp', x: 9, y: 10 }],
      lights: [[12, 7, 220, '#9aff60'], [2, 7, 110, '#e8c070']],
    };
  }
  if (id.startsWith('loyal')) { // лоялисты — в лесной чаще: стволы елей, бурелом
    const n = +(id.slice(5) || 2);
    const comp: BattleDef['enemies'] = n >= 3
      ? [{ t: 'loyal_off', x: 20, y: 7, ammo: { revolver: 4 } }, { t: 'loyalist', x: 18, y: 4, ammo: { carbine: 3 } }, { t: 'loyalist', x: 18, y: 10, ammo: { carbine: 3 } }]
      : [{ t: 'loyalist', x: 19, y: 5, ammo: { carbine: 3 } }, { t: 'loyalist2', x: 18, y: 9, ammo: { carbine: 3 } }];
    return { id, title: 'Лесная чаща', theme: 'forest',
      map: [
        'TT..T...T....T..T...T.TT',
        'T...c.....T.......T....T',
        '..T.....T....,..T....T..',
        '.....T......c.......T...',
        'T.......T.......T.......',
        '..,..T.....T.......c..T.',
        '.c........,....T........',
        '....T..T.........T....T.',
        'T.........c...T.........',
        '...T...,.......T.....T..',
        '.T.....T...T..c....T....',
        '....c.......T......,..T.',
        'T..T....T.......T.......',
        'TT....T....T..T....T..TT',
      ],
      players: [[3, 6], [3, 8], [2, 5], [2, 9]],
      enemies: comp,
      lights: [[12, 6, 200, '#a8b890'], [3, 7, 110, '#e8c070']],
    };
  }
  if (id.startsWith('band_')) { // шайка бандитов: состав в id (band_bandit_gun_bandit_axe…)
    const kinds = id.slice(5).split('+'), w = battleDef('waste', _flags);
    const pos = [{ x: 19, y: 5 }, { x: 17, y: 9 }, { x: 21, y: 7 }, { x: 20, y: 11 }];
    const ammo: Record<string, Record<string, number>> = { bandit_gun: { rifle: 4 }, bandit_shot: { sawnoff: 2 }, bandit_boss: { revolver: 6 }, deserter: { rifle: 5 }, deserter_mg: { mg: 9 }, deserter_sgt: { revolver: 6 } };
    const des = kinds.some((k) => k.startsWith('deserter'));
    return { ...w, id, title: des ? 'Дезертиры' : 'Бандиты в пустоши', enemies: kinds.map((t, i) => ({ t, ...pos[i], ammo: ammo[t] })) };
  }
  if (id.startsWith('morl_')) { // морлоки — у подножия гор: валуны, осыпи, чёрные зевы пещер; темно
    const kinds = id.slice(5).split('+');
    const pos = [{ x: 19, y: 4 }, { x: 18, y: 9 }, { x: 21, y: 6 }, { x: 20, y: 11 }, { x: 16, y: 6 }];
    return { id, title: 'Морлоки', theme: 'rocks', dark: true,
      map: [
        '####RR####..####RRR#####',
        '##R....RR.....R.....RR##',
        '#R..r......r......R...R#',
        '.....R..........r.......',
        '..r.......RR.........r..',
        '.......r.......R........',
        '...R..........r....R....',
        '.........R.........r....',
        '.....r.......RR.........',
        '.......R..r.........R...',
        '...........r.....r......',
        '..R..r..........R.......',
        '.........R..r.......r...',
        '....r...........R.......',
      ],
      players: [[3, 7], [3, 9], [2, 6], [2, 8]],
      enemies: kinds.map((t, i) => ({ t, ...pos[i % pos.length] })),
      lights: [[9, 0, 90, '#6a6a5a'], [3, 8, 120, '#e8c070']],
    };
  }
  if (id.startsWith('hungry')) { // голодные бандиты — на карте засады в пустоши
    const w = battleDef('waste', _flags), n = +(id.slice(6) || 2);
    const pos = [{ x: 19, y: 5 }, { x: 18, y: 9 }, { x: 21, y: 7 }];
    return { ...w, id, title: 'Голодные бандиты', enemies: pos.slice(0, n).map((q, i) => ({ t: i % 2 ? 'hungry2' : 'hungry', ...q })) };
  }
  switch (id) {
    case 'waste':
      return {
        id: 'waste', title: 'Засада в пустоши', theme: 'road',
        map: [
          '.....,.........T........',
          '..T.......c.............',
          '.......,........cc......',
          '.....c.....T............',
          '..............,.....T...',
          '...T.....c..............',
          '.........,......c.......',
          '...........T............',
          '.....c..........,...c...',
          '..T........c............',
          '.......,.........T......',
          '...c..........c.........',
          '.........T.........,....',
          '........................',
        ],
        players: [[3, 7], [3, 9], [2, 6], [2, 8]],
        enemies: [{ t: 'scav_gun', x: 19, y: 5 }, { t: 'scav_knife', x: 17, y: 9 }],
        lights: [[12, 7, 260, '#c8d0a0']],
      };
    case 'ruins':
    default:
      return {
        id: 'ruins', title: 'Разрушенный пост', theme: 'road',
        map: [
          '......,.........T.......',
          '..c......####...........',
          '.........#..#.....c.....',
          '.....c...#......#.......',
          '.........#......#..,....',
          '..T.............#.......',
          '........ww..............',
          '.....#.........c........',
          '.....#..c...............',
          '.....###.......#..T.....',
          '...............#........',
          '..c.....,......####.....',
          '............c...........',
          '........................',
        ],
        players: [[2, 7], [2, 9], [1, 6], [1, 8]],
        // то, что видно при проверке «Внимания» у костра, правда всегда: пороховница пуста, второй хромает
        enemies: [
          { t: 'scav_gun', x: 18, y: 4, name: 'Оборванец с ружьём', ammo: { musket: 1 }, extra: ['buttstock'], note: 'Оборванец перехватывает пустое ружьё прикладом вперёд.' },
          { t: 'scav_knife', x: 15, y: 8, name: 'Оборванец с ножом', move: -1 },
        ],
        lights: [[13, 6, 170, '#f0a050'], [4, 10, 110, '#e8c070']],
      };
  }
}

/** Бой в траншеях старого фронта: отряд за бруствером, мертвецы идут через ничейную землю. */
function trenchBattle(id: string): BattleDef {
  const comps: Record<string, BattleDef['enemies']> = {
    trench1: [{ t: 'dead_soldier', x: 19, y: 4 }, { t: 'dead_soldier', x: 20, y: 9 }, { t: 'dead_rifle', x: 22, y: 6 }],
    trench2: [{ t: 'dead_soldier', x: 19, y: 5 }, { t: 'dead_gas', x: 20, y: 8 }, { t: 'dead_rifle', x: 22, y: 3 }],
    trench3: [{ t: 'dead_sapper', x: 19, y: 7 }, { t: 'dead_soldier', x: 20, y: 4 }, { t: 'dead_soldier', x: 21, y: 10 }, { t: 'dead_gas', x: 22, y: 6 }],
  };
  return {
    id, title: id.startsWith('trench+') ? 'Траншейное море' : 'Старый фронт', theme: 'trench',
    map: [
      '.....#....x..x.....,....',
      '..c..#...........T......',
      '.....#....xx.......x....',
      '.....#.......w..........',
      '..........c.....x.......',
      '.....#....x.........c...',
      '.....#..........,.......',
      '.....#....x.....T....w..',
      '..T..#.......c..........',
      '..........x.x...x.......',
      '.....#..w...............',
      '.....#....x.......c.....',
      '..c..#..............T...',
      '........................',
    ],
    players: [[3, 6], [3, 8], [2, 5], [2, 9]],
    // мертвецы траншейного моря: состав в id (trench+dead_gren+dead_storm…)
    enemies: id.startsWith('trench+') ? id.slice(7).split('+').slice(0, 4).map((t, i) => ({ t, ...[{ x: 19, y: 4 }, { x: 20, y: 9 }, { x: 22, y: 6 }, { x: 21, y: 11 }][i] })) : comps[id] ?? comps.trench1,
    lights: [[12, 6, 150, '#a8d070'], [3, 7, 110, '#e8c070']],
  };
}
