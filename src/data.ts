// ============================================================
//  Данные: оружие, отряд, противники, тактические карты
// ============================================================

export interface Weapon {
  name: string;
  type: 'ranged' | 'melee';
  range?: number;      // макс. дальность (клетки)
  opt?: number;        // дальше этой дистанции точность падает
  acc: number;         // базовая точность, %
  dmg: [number, number];
  ammo?: number;
  ignoreCover?: boolean;
  splash?: [number, number];
  magic?: boolean;
  sfx: 'shot' | 'rifle' | 'slash' | 'magic';
}

export const WEAPONS: Record<string, Weapon> = {
  revolver:  { name: 'Револьвер «Уэбли»', type: 'ranged', range: 7, opt: 4, acc: 78, dmg: [3, 5], ammo: 6, sfx: 'shot' },
  saber:     { name: 'Офицерская сабля', type: 'melee', acc: 88, dmg: [4, 7], sfx: 'slash' },
  carbine:   { name: 'Карабин', type: 'ranged', range: 8, opt: 5, acc: 70, dmg: [3, 5], ammo: 4, sfx: 'rifle' },
  rifle:     { name: 'Винтовка «Ли-Метфорд»', type: 'ranged', range: 11, opt: 8, acc: 72, dmg: [4, 6], ammo: 5, sfx: 'rifle' },
  bayonet:   { name: 'Штык', type: 'melee', acc: 82, dmg: [2, 4], sfx: 'slash' },
  pitchfork: { name: 'Вилы', type: 'melee', acc: 72, dmg: [2, 4], sfx: 'slash' },
  musket:    { name: 'Старое ружьё', type: 'ranged', range: 7, opt: 3, acc: 58, dmg: [2, 4], sfx: 'shot' },
  hammer:    { name: 'Кузнечный молот', type: 'melee', acc: 75, dmg: [3, 6], sfx: 'slash' },
  claws:     { name: 'Когти', type: 'melee', acc: 80, dmg: [2, 3], sfx: 'slash' },
  flame:     { name: 'Зелёное пламя', type: 'ranged', range: 8, opt: 8, acc: 80, dmg: [3, 5], ignoreCover: true, splash: [1, 2], magic: true, sfx: 'magic' },
};

export const ABILITIES: Record<string, { name: string; desc: string }> = {
  reload:  { name: 'Перезарядка', desc: '1 ОД. Полностью перезарядить оружие.' },
  rally:   { name: 'Командный клич', desc: '1 ОД. Союзник в радиусе 6 получает +1 ОД. Раз за бой.' },
  grenade: { name: 'Граната', desc: 'Завершает ход. Взрыв 3×3, урон 3–5 — и своим тоже!' },
  bandage: { name: 'Перевязка', desc: '1 ОД. +5 ОЗ себе или соседнему союзнику.' },
  aim:     { name: 'Прицельный выстрел', desc: '2 ОД. Выстрел с +20% к точности.' },
};

export interface UnitBase {
  id: string;
  name: string;
  kind: string;          // ключ внешнего вида (см. gfx.ts STYLES)
  hp: number;
  maxHp: number;
  move: number;
  weapons: string[];
  abil?: Record<string, number>;
  ai?: 'melee' | 'ranged' | 'caster';
  leader?: boolean;
  demonic?: boolean;
  boss?: boolean;
}

export function makeSquad(): UnitBase[] {
  return [
    { id: 'carver', name: 'Лт. Карвер', kind: 'lieutenant', hp: 14, maxHp: 14, move: 4, weapons: ['revolver', 'saber'], abil: { rally: 1 }, leader: true },
    { id: 'halloway', name: 'Серж. Хэллоуэй', kind: 'sergeant', hp: 12, maxHp: 12, move: 4, weapons: ['carbine', 'bayonet'], abil: { grenade: 1 } },
    { id: 'pickett', name: 'Ряд. Пиккет', kind: 'sniper', hp: 9, maxHp: 9, move: 4, weapons: ['rifle', 'bayonet'], abil: { aim: 99 } },
    { id: 'doe', name: 'Ряд. Доу', kind: 'medic', hp: 10, maxHp: 10, move: 4, weapons: ['carbine', 'bayonet'], abil: { bandage: 3 } },
  ];
}

const E = (id: string, name: string, kind: string, hp: number, move: number, weapons: string[], ai: UnitBase['ai'], extra: Partial<UnitBase> = {}): UnitBase =>
  ({ id, name, kind, hp, maxHp: hp, move, weapons, ai, ...extra });

export const ENEMIES: Record<string, UnitBase> = {
  fork:        E('fork', 'Ополченец', 'militia', 7, 4, ['pitchfork'], 'melee'),
  musket:      E('musket', 'Ополченец с ружьём', 'militia_gun', 6, 4, ['musket'], 'ranged'),
  brem:        E('brem', 'Кузнец Брэм', 'smith', 13, 4, ['hammer'], 'melee', { boss: true }),
  fanatic:     E('fanatic', 'Фанатик', 'fanatic', 8, 4, ['pitchfork'], 'melee'),
  fanatic_gun: E('fanatic_gun', 'Фанатик с ружьём', 'fanatic_gun', 7, 4, ['musket'], 'ranged'),
  vale:        E('vale', 'Мордекай Вейл', 'cultist', 22, 4, ['flame'], 'caster', { demonic: true, boss: true }),
  imp:         E('imp', 'Бес', 'imp', 5, 6, ['claws'], 'melee', { demonic: true }),
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
