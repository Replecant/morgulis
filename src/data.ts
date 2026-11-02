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
    id: 'pc', name: `${c.first.slice(0, 1)}. ${c.last}`, kind: 'pc', hp, maxHp: hp, move: 4,
    weapons: p.weapons.slice(), atkM: meleeAttack(c), atkR: rangedAttack(c), def: defense(c),
    armor: 0, dmgM: meleeDamage(c), horror: horrorSave(c), med: skillBonus(c, 'medicine'), wounds: [],
    equip: { ...PROF_EQUIP[c.prof] }, // броня теперь даётся предметами
    abil: { ...p.combatAbil }, leader: true,
  };
}

/** Игрок начинает один — отряд пока состоит только из героя. */
export function makeSquad(c: Character): UnitBase[] {
  return [makeLeader(c)];
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
  scav_gun:    E('scav_gun', 'Мародёр с ружьём', 'militia_gun', 6, 4, ['musket'], 'ranged', 2, 10),
  scav_knife:  E('scav_knife', 'Мародёр с ножом', 'militia', 7, 4, ['knife'], 'melee', 2, 10),
};

export interface BattleDef {
  id: string;
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
 *  c  ящики/бочки/обломки  f  забор                (половинное укрытие)
 *  w  лужа нефти (непроходимо, обзор не закрывает)
 *  o  ритуальный круг (проходимо)
 */
export function battleDef(id: string, _flags: Record<string, boolean | undefined>): BattleDef {
  switch (id) {
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
        enemies: [{ t: 'scav_gun', x: 18, y: 4 }, { t: 'scav_knife', x: 15, y: 8 }],
        lights: [[13, 6, 170, '#f0a050'], [4, 10, 110, '#e8c070']],
      };
  }
}
