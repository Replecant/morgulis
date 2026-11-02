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
  ammoType?: 'ammo_pistol' | 'ammo_rifle' | 'ammo_shell'; // чем перезаряжается (нет — заряды только на бой)
  shot?: boolean;      // дробь: −1 урона за клетку дальше оптимальной
  pierce?: boolean;    // пробивает броню
}

export const WEAPONS: Record<string, Weapon> = {
  revolver:  { name: 'Револьвер', type: 'ranged', range: 7, opt: 4, atk: 1, dmg: [3, 5], ammo: 6, ammoType: 'ammo_pistol' },
  autopistol:{ name: 'Самозарядный пистолет', type: 'ranged', range: 6, opt: 4, atk: 1, dmg: [2, 5], ammo: 8, ammoType: 'ammo_pistol' },
  saber:     { name: 'Офицерская сабля', type: 'melee', atk: 1, dmg: [4, 7] },
  carbine:   { name: 'Карабин', type: 'ranged', range: 8, opt: 5, atk: 0, dmg: [3, 5], ammo: 4, ammoType: 'ammo_rifle' },
  rifle:     { name: 'Армейская винтовка', type: 'ranged', range: 11, opt: 8, atk: 1, dmg: [4, 6], ammo: 5, ammoType: 'ammo_rifle' },
  huntrifle: { name: 'Охотничья винтовка', type: 'ranged', range: 13, opt: 10, atk: 2, dmg: [5, 7], ammo: 3, ammoType: 'ammo_rifle' },
  shotgun2:  { name: 'Двуствольный дробовик', type: 'ranged', range: 5, opt: 2, atk: 1, dmg: [5, 8], ammo: 2, ammoType: 'ammo_shell', shot: true },
  pumpshot:  { name: 'Помповый дробовик', type: 'ranged', range: 5, opt: 2, atk: 1, dmg: [4, 7], ammo: 5, ammoType: 'ammo_shell', shot: true },
  flamer:    { name: 'Огнемёт', type: 'ranged', range: 4, opt: 4, atk: 2, dmg: [4, 6], ammo: 3, ignoreCover: true, splash: [2, 3] },
  exprifle:  { name: 'Экспериментальная винтовка', type: 'ranged', range: 12, opt: 9, atk: 2, dmg: [6, 8], ammo: 4, ammoType: 'ammo_rifle', pierce: true },
  bayonet:   { name: 'Штык', type: 'melee', atk: 0, dmg: [2, 4] },
  knife:     { name: 'Нож', type: 'melee', atk: 1, dmg: [2, 4] },
  wrench:    { name: 'Тяжёлый гаечный ключ', type: 'melee', atk: 0, dmg: [3, 5] },
  sawnoff:   { name: 'Обрез', type: 'ranged', range: 4, opt: 2, atk: 0, dmg: [4, 7], ammo: 2, ammoType: 'ammo_shell', shot: true },
  axe:       { name: 'Пожарный топор', type: 'melee', atk: 0, dmg: [3, 7] },
  fists:     { name: 'Кулаки', type: 'melee', atk: 0, dmg: [1, 2] },
  pitchfork: { name: 'Вилы', type: 'melee', atk: 0, dmg: [2, 4] },
  musket:    { name: 'Старое ружьё', type: 'ranged', range: 7, opt: 3, atk: -1, dmg: [2, 4] },
  buttstock: { name: 'Приклад', type: 'melee', atk: -1, dmg: [1, 3] },
  // оружие траншейных мертвецов
  rustbayonet: { name: 'Ржавый штык', type: 'melee', atk: 0, dmg: [2, 4] },
  oldrifle:  { name: 'Гнилая винтовка', type: 'ranged', range: 9, opt: 5, atk: -1, dmg: [3, 5] },
  gasbreath: { name: 'Газовый выдох', type: 'ranged', range: 3, opt: 3, atk: 1, dmg: [2, 3], ignoreCover: true, splash: [1, 2] },
  trenchclub:{ name: 'Окопная лопата', type: 'melee', atk: 0, dmg: [3, 6] },
  hammer:    { name: 'Кузнечный молот', type: 'melee', atk: 0, dmg: [3, 6] },
  claws:     { name: 'Когти', type: 'melee', atk: 1, dmg: [2, 3] },
  flame:     { name: 'Зелёное пламя', type: 'ranged', range: 8, opt: 8, atk: 1, dmg: [3, 5], ignoreCover: true, splash: [1, 2], magic: true },
};

export const ABILITIES: Record<string, { name: string; desc: string }> = {
  reload:     { name: 'Перезарядка', desc: '1 ОД. Дозарядить оружие патронами из запаса.' },
  rally:      { name: 'Командный клич', desc: '1 ОД. Союзник в радиусе 6 получает +1 ОД. Раз за бой.' },
  grenade:    { name: 'Граната', desc: 'Завершает ход. Взрыв 3×3, урон 3–5 — и своим тоже!' },
  smoke:      { name: 'Дым', desc: '1 ОД. Дымовое облако 3×3 на два хода: закрывает обзор, стоящим в дыму +3 к Защите.' },
  bandage:    { name: 'Бинт', desc: '1 ОД. Себе или соседу: +3 ОЗ и бонус Медицины. Поднимает тяжелораненого.' },
  medkit:     { name: 'Аптечка', desc: '1 ОД. Себе или соседу: +6 ОЗ и бонус Медицины. Поднимает тяжелораненого.' },
  painkiller: { name: 'Обезбол.', desc: '1 ОД. Себе: +3 ОЗ и +1 кураж.' },
  aim:        { name: 'Прицельный выстрел', desc: '2 ОД. Выстрел с +4 к броску атаки.' },
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
  wounds?: string[];     // ранения (см. wounds.ts)
  limbs?: Partial<Record<'armR' | 'armL' | 'legR' | 'legL' | 'eyeR' | 'eyeL', string>>; // утраченные части тела и протезы (см. prosthetics.ts)
  fleshDue?: number;      // плотяная рука: когда (G.clock) нужен тканевый раствор
  fleshReject?: boolean;  // плотяная рука: отторжение
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
  // траншейные мертвецы: медленные, упрямые, бьют больно
  dead_soldier: E('dead_soldier', 'Окопный мертвец', 'dead_soldier', 9, 3, ['rustbayonet'], 'melee', 2, 9),
  dead_rifle:   E('dead_rifle', 'Мертвец-стрелок', 'dead_rifle', 7, 3, ['oldrifle', 'rustbayonet'], 'ranged', 1, 9),
  dead_gas:     E('dead_gas', 'Газовый мертвец', 'dead_gas', 9, 3, ['gasbreath'], 'ranged', 1, 9),
  dead_sapper:  E('dead_sapper', 'Мертвец-сапёр в панцире', 'dead_sapper', 16, 2, ['trenchclub'], 'melee', 3, 10, { armor: 2 }),
};

export interface BattleDef {
  id: string;
  title: string;
  theme: 'road' | 'factory' | 'trench';
  map: string[];
  players: [number, number][];
  /** ammo — сколько зарядов на бой (иначе — без счёта), extra — добавочное оружие, move — поправка хода */
  enemies: { t: string; x: number; y: number; ammo?: Record<string, number>; extra?: string[]; move?: number; note?: string }[];
  lights: [number, number, number, string][]; // x, y, радиус(px), цвет
}

/*  Легенда карт:
 *  .  земля / пол        ,  сухая трава
 *  #  стена (полное укрытие, блокирует обзор)
 *  T  мёртвое дерево     m  станок    P  колонна   (полное укрытие)
 *  c  ящики/бочки/обломки  f  забор                (половинное укрытие)
 *  w  лужа нефти (непроходимо, обзор не закрывает)
 *  o  ритуальный круг (проходимо)
 *  x  колючая проволока (непроходимо, обзор не закрывает)
 */
export function battleDef(id: string, _flags: Record<string, boolean | undefined>): BattleDef {
  if (id.startsWith('trench')) return trenchBattle(id);
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
          { t: 'scav_gun', x: 18, y: 4, ammo: { musket: 1 }, extra: ['buttstock'], note: 'Мародёр перехватывает пустое ружьё прикладом вперёд.' },
          { t: 'scav_knife', x: 15, y: 8, move: -1 },
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
    id, title: 'Старый фронт', theme: 'trench',
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
    enemies: comps[id] ?? comps.trench1,
    lights: [[12, 6, 150, '#a8d070'], [3, 7, 110, '#e8c070']],
  };
}
