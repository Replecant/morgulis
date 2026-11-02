// ============================================================
//  Данные: оружие, отряд, противники, тактические карты
// ============================================================

import { PROF_EQUIP, SQUAD_EQUIP, Equip } from './items';
import { Character, PROFESSIONS, maxHp, defense, meleeAttack, rangedAttack, meleeDamage, horrorSave, skillBonus } from './rules';

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
}

export const WEAPONS: Record<string, Weapon> = {
  revolver:  { name: 'Служебный револьвер', type: 'ranged', range: 7, opt: 4, atk: 1, dmg: [3, 5], ammo: 6 },
  saber:     { name: 'Офицерская сабля', type: 'melee', atk: 1, dmg: [4, 7] },
  carbine:   { name: 'Карабин', type: 'ranged', range: 8, opt: 5, atk: 0, dmg: [3, 5], ammo: 4 },
  rifle:     { name: 'Магазинная винтовка', type: 'ranged', range: 11, opt: 8, atk: 1, dmg: [4, 6], ammo: 5 },
  bayonet:   { name: 'Штык', type: 'melee', atk: 0, dmg: [2, 4] },
  knife:     { name: 'Нож', type: 'melee', atk: 1, dmg: [2, 4] },
  wrench:    { name: 'Тяжёлый гаечный ключ', type: 'melee', atk: 0, dmg: [3, 5] },
  sawnoff:   { name: 'Обрез', type: 'ranged', range: 4, opt: 2, atk: 0, dmg: [4, 7], ammo: 2 },
  axe:       { name: 'Пожарный топор', type: 'melee', atk: 0, dmg: [3, 7] },
  fists:     { name: 'Кулаки', type: 'melee', atk: 0, dmg: [1, 2] },
  pitchfork: { name: 'Вилы', type: 'melee', atk: 0, dmg: [2, 4] },
  musket:    { name: 'Старое ружьё', type: 'ranged', range: 7, opt: 3, atk: -1, dmg: [2, 4] },
  hammer:    { name: 'Кузнечный молот', type: 'melee', atk: 0, dmg: [3, 6] },
  claws:     { name: 'Когти', type: 'melee', atk: 1, dmg: [2, 3] },
  flame:     { name: 'Зелёное пламя', type: 'ranged', range: 8, opt: 8, atk: 1, dmg: [3, 5], ignoreCover: true, splash: [1, 2], magic: true },
};

export const ABILITIES: Record<string, { name: string; desc: string }> = {
  reload:  { name: 'Перезарядка', desc: '1 ОД. Полностью перезарядить оружие.' },
  rally:   { name: 'Командный клич', desc: '1 ОД. Союзник в радиусе 6 получает +1 ОД. Раз за бой.' },
  grenade: { name: 'Взрывчатка', desc: 'Завершает ход. Взрыв 3×3, урон 3–5 — и своим тоже!' },
  bandage: { name: 'Перевязка', desc: '1 ОД. +5 ОЗ себе или соседнему союзнику.' },
  aim:     { name: 'Прицельный выстрел', desc: '2 ОД. Выстрел с +4 к броску атаки.' },
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
  wounds?: string[];     // ранения (см. wounds.ts)
  equip?: Equip;         // снаряжение (см. items.ts) — у бойцов отряда
  look?: string;         // ключ стиля фигурки с учётом снаряжения
  abil?: Record<string, number>;
  ai?: 'melee' | 'ranged' | 'caster';
  leader?: boolean;
  demonic?: boolean;
  boss?: boolean;
}

/** Командир отряда — персонаж игрока, собранный по правилам из rules.ts. */
export function makeLeader(c: Character): UnitBase {
  const p = PROFESSIONS[c.prof];
  const hp = maxHp(c);
  return {
    id: 'pc', name: `Лт. ${c.last}`, kind: 'pc', hp, maxHp: hp, move: 4,
    weapons: p.weapons.slice(), atkM: meleeAttack(c), atkR: rangedAttack(c), def: defense(c),
    armor: 0, dmgM: meleeDamage(c), horror: horrorSave(c), med: skillBonus(c, 'medicine'), wounds: [],
    equip: { ...PROF_EQUIP[c.prof] }, // броня теперь даётся предметами
    abil: { rally: 1, ...p.combatAbil }, leader: true,
  };
}

export function makeSquad(c: Character): UnitBase[] {
  return [
    makeLeader(c),
    { id: 'halloway', name: 'Серж. Хэллоуэй', kind: 'sergeant', hp: 12, maxHp: 12, move: 4, weapons: [], atkM: 3, atkR: 3, def: 11, abil: { grenade: 1 }, equip: { ...SQUAD_EQUIP.halloway } },
    { id: 'pickett', name: 'Ряд. Пиккет', kind: 'sniper', hp: 9, maxHp: 9, move: 4, weapons: [], atkM: 1, atkR: 4, def: 11, abil: { aim: 99 }, equip: { ...SQUAD_EQUIP.pickett } },
    { id: 'doe', name: 'Ряд. Доу', kind: 'medic', hp: 10, maxHp: 10, move: 4, weapons: [], atkM: 1, atkR: 2, def: 10, med: 3, abil: { bandage: 1 }, equip: { ...SQUAD_EQUIP.doe } },
  ];
}

const E = (id: string, name: string, kind: string, hp: number, move: number, weapons: string[], ai: UnitBase['ai'], atk: number, def: number, extra: Partial<UnitBase> = {}): UnitBase =>
  ({ id, name, kind, hp, maxHp: hp, move, weapons, ai, atkM: atk, atkR: atk, def, ...extra });

export const ENEMIES: Record<string, UnitBase> = {
  fork:        E('fork', 'Ополченец', 'militia', 7, 4, ['pitchfork'], 'melee', 2, 10),
  musket:      E('musket', 'Ополченец с ружьём', 'militia_gun', 6, 4, ['musket'], 'ranged', 2, 10),
  brem:        E('brem', 'Кузнец Брэм', 'smith', 13, 4, ['hammer'], 'melee', 4, 11, { boss: true, armor: 1, dmgM: 1 }),
  fanatic:     E('fanatic', 'Фанатик', 'fanatic', 8, 4, ['pitchfork'], 'melee', 3, 11),
  fanatic_gun: E('fanatic_gun', 'Фанатик с ружьём', 'fanatic_gun', 7, 4, ['musket'], 'ranged', 3, 10),
  vale:        E('vale', 'Мордекай Вейл', 'cultist', 22, 4, ['flame'], 'caster', 4, 12, { demonic: true, boss: true }),
  imp:         E('imp', 'Бес', 'imp', 5, 6, ['claws'], 'melee', 3, 13, { demonic: true }),
};

export interface BattleDef {
  id: 'road' | 'factory';
  title: string;
  theme: 'road' | 'factory';
  map: string[];
  players: [number, number][];
  enemies: { t: string; x: number; y: number }[];
  lights: [number, number, number, string][]; // x, y, радиус(px), цвет
}

/*  Легенда карт:
 *  .  земля / пол        ,  сухая трава
 *  #  стена (полное укрытие, блокирует обзор)
 *  T  мёртвое дерево     m  станок    P  колонна   (полное укрытие)
 *  c  ящики/бочки        f  забор                  (половинное укрытие)
 *  w  лужа нефти / чан с краской (непроходимо, обзор не закрывает)
 *  o  ритуальный круг (проходимо)
 */
export function battleDef(id: 'road' | 'factory', flags: Record<string, boolean | undefined>): BattleDef {
  if (id === 'road') {
    const p1 = flags.persuade1, p2 = flags.persuade2;
    let en = [
      { t: 'fork', x: 16, y: 5 }, { t: 'fork', x: 16, y: 9 }, { t: 'musket', x: 21, y: 3 },
      { t: 'fork', x: 15, y: 7 }, { t: 'musket', x: 21, y: 11 },
    ];
    let brem: { t: string; x: number; y: number } | null = { t: 'brem', x: 19, y: 7 };
    if (p1 || p2) en = en.slice(0, 3);          // часть ополченцев сложила оружие
    if (p1 && p2) {                              // Брэм ушёл, остались фанатики
      brem = null;
      en = en.map((e) => ({ ...e, t: e.t === 'fork' ? 'fanatic' : 'fanatic_gun' }));
    }
    if (brem) en.push(brem);
    return {
      id, title: 'Дорога к красильне', theme: 'road',
      map: [
        '..........,,......f.....',
        '...c..........T...f..T..',
        '......ffff..............',
        '..T...........#.....c...',
        '..............#.........',
        '........c.....#.....,...',
        ',.......c...........,...',
        '............w...........',
        '.....ff.....w.....c.....',
        '..........,......cc.....',
        '..c.....#...............',
        '........#.....T....ff...',
        '...T....#...........,...',
        '............,...........',
      ],
      players: [[2, 6], [2, 8], [1, 5], [1, 9]],
      enemies: en,
      lights: [[6, 2, 150, '#e8c070'], [12, 10, 140, '#e8c070'], [20, 6, 160, '#e8c070']],
    };
  }
  const tommy = flags.tommy;
  const map = [
    '########################',
    '#.....c........m.......#',
    '#..P.......P...m....P..#',
    '#......................#',
    '#..mm.....oooo.....cc..#',
    '#..mm....oooooo........#',
    '#........oooooo...P....#',
    '#..c.....oooooo........#',
    '#........oooooo....mm..#',
    '#..P......oooo.....mm..#',
    '#.....c................#',
    '#..........P.....c.....#',
    '#...ww.............P...#',
    '########################',
  ];
  if (tommy) { // пролом в восточной стене
    map[10] = map[10].slice(0, 23) + '.';
    map[11] = map[11].slice(0, 23) + '.';
  }
  const enemies = [
    { t: 'vale', x: 12, y: 6 },
    { t: 'fanatic', x: 8, y: 4 }, { t: 'fanatic', x: 8, y: 9 },
    { t: 'fanatic_gun', x: 17, y: 3 }, { t: 'fanatic_gun', x: 16, y: 10 },
  ];
  if (!tommy) enemies.push({ t: 'imp', x: 14, y: 5 }, { t: 'imp', x: 14, y: 8 });
  return {
    id, title: 'Цех красильни Хартвелла', theme: 'factory', map,
    players: tommy ? [[22, 10], [21, 11], [22, 11], [21, 10]] : [[2, 6], [2, 8], [1, 5], [1, 7]],
    enemies,
    lights: [[5, 3, 120, '#e0a050'], [18, 11, 120, '#e0a050'], [12, 6.5, 230, '#9fef6a']],
  };
}
