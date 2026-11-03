// ============================================================
//  Оккультизм: четыре школы (заклинания добавляются строкой в SPELLS — вкладка школы
//  в меню покажет их сама), ритуалы вне боя
//  и оккультное напряжение (0–6). Только для оккультиста.
//  Заклинание в бою тратит основное действие (как атака).
//  Проверки — обычный d20 + Оккультизм против сложности.
// ============================================================
import { G, gearBonus, hasTool } from './state';
import { skillBonus } from './rules';

export type School = 'folk' | 'demon' | 'astro' | 'rune';
export const SCHOOL_ORDER: School[] = ['folk', 'demon', 'astro', 'rune'];
export const SCHOOLS: Record<School, { name: string; short: string; role: string; emblem: string }> = {
  folk:  { name: 'Народное колдовство', short: 'Колдовство', role: 'Проклятия, ослабление врагов, защитные обряды.', emblem: '✥' },
  demon: { name: 'Демонология', short: 'Демонология', role: 'Призыв сущностей, опасные усиления, контроль. Самая рискованная школа.', emblem: '⛧' },
  astro: { name: 'Астрология', short: 'Астрология', role: 'Предвидение, поддержка, управление вероятностями.', emblem: '☉' },
  rune:  { name: 'Руническая эзотерика', short: 'Руны', role: 'Печати, ловушки, контроль пространства.', emblem: 'ᛟ' },
};

export type Target = 'enemy' | 'ally' | 'self' | 'cell';
export interface Spell {
  id: string; school: School; name: string; strain: number;
  target: Target; range: number;
  dc?: number;              // нужна проверка Оккультизма (сложность)
  turns?: number;           // длительность эффекта в раундах
  desc: string;
}

export const SPELLS: Record<string, Spell> = {
  // ---------------- народное колдовство
  hex:     { id: 'hex', school: 'folk', name: 'Сглаз', strain: 1, target: 'enemy', range: 8, dc: 12, turns: 3, desc: 'Проверка КС 12. Враг на 3 раунда получает −3 к атакам.' },
  rot:     { id: 'rot', school: 'folk', name: 'Порча', strain: 1, target: 'enemy', range: 8, dc: 12, turns: 3, desc: 'Проверка КС 12. Враг 3 раунда теряет по 2 ОЗ в начале раунда (броня не спасает).' },
  ward:    { id: 'ward', school: 'folk', name: 'Оберег', strain: 1, target: 'ally', range: 4, turns: 3, desc: 'Союзнику (или себе) на 3 раунда: +1 к Защите и +4 к стойкости против ужаса и потустороннего.' },
  // ---------------- демонология
  summon:  { id: 'summon', school: 'demon', name: 'Призыв низшего демона', strain: 2, target: 'cell', range: 2, dc: 13, turns: 3, desc: 'Проверка КС 13. На соседней клетке появляется бес-союзник на 3 раунда. Провал — бес приходит, но служит не вам.' },
  pact:    { id: 'pact', school: 'demon', name: 'Демонический договор', strain: 2, target: 'ally', range: 4, turns: 3, desc: 'Союзнику на 3 раунда: +2 к атакам, +2 к урону, +1 к перемещению. Когда договор истекает — плата: −2 ОЗ.' },
  command: { id: 'command', school: 'demon', name: 'Приказ', strain: 2, target: 'enemy', range: 6, turns: 2, desc: 'Только на слабое потустороннее существо (мертвец, бес; не больше 10 ОЗ). Проверка КС 10 + половина его ОЗ: на 2 раунда оно сражается за вас.' },
  // ---------------- астрология
  fortune: { id: 'fortune', school: 'astro', name: 'Благоприятный час', strain: 1, target: 'ally', range: 8, desc: 'Союзнику: следующая атака — с +4 к броску.' },
  omen:    { id: 'omen', school: 'astro', name: 'Дурное предзнаменование', strain: 1, target: 'enemy', range: 8, dc: 11, desc: 'Проверка КС 11. Следующая атака врага — с −4 к броску.' },
  stars:   { id: 'stars', school: 'astro', name: 'Звёздное благословение', strain: 2, target: 'self', range: 0, turns: 2, desc: 'Весь отряд на 2 раунда: +1 к атакам и к Защите.' },
  // ---------------- руны
  guard:   { id: 'guard', school: 'rune', name: 'Охранная руна', strain: 1, target: 'cell', range: 4, turns: 3, desc: 'Руна на клетке на 3 раунда: стоящий на ней союзник получает +3 к Защите.' },
  glyph:   { id: 'glyph', school: 'rune', name: 'Ловчий глиф', strain: 1, target: 'cell', range: 5, desc: 'Ловушка на клетке до конца боя: первый враг, ступивший на неё, получает 3 урона и связан на 1 раунд.' },
  bind:    { id: 'bind', school: 'rune', name: 'Печать связывания', strain: 2, target: 'enemy', range: 6, dc: 12, turns: 2, desc: 'Проверка КС 12. Враг на 2 раунда не может сдвинуться с места.' },
};

export interface Ritual { id: string; school: School; name: string; strain: number; hours: number; where: 'any' | 'world'; desc: string }
export const RITUALS: Ritual[] = [
  { id: 'cleanse', school: 'folk', name: 'Ведьмино лечение', strain: 1, hours: 1, where: 'any', desc: 'Травы, нитки и наговор. Снимает одно лёгкое ранение героя (отравление газом, ушиб, вывих…).' },
  { id: 'banish', school: 'demon', name: 'Изгнание', strain: 2, hours: 1, where: 'world', desc: 'Только на карте. Ближние мертвецы (до ~250 шагов) теряют след и уходят прочь на сутки.' },
  { id: 'sense', school: 'astro', name: 'Обнаружение сверхъестественного', strain: 1, hours: 2, where: 'world', desc: 'Только на карте. Звёзды указывают на скрытое: открываются примечательные места вокруг (до ~600 шагов).' },
  { id: 'runeweap', school: 'rune', name: 'Руническое усиление', strain: 1, hours: 1, where: 'any', desc: 'Руны на оружии героя: в следующем бою +1 к атакам и +1 к урону вблизи.' },
];

// ------------------------------------------------------------ состояние героя
export const isOccultist = () => G.pc?.prof === 'occultist';
/** Знаки — сколько заклинаний можно изучить: 2 + уровень, +1 с гримуаром, +1 за урок у знахаря. */
export const signs = () => (isOccultist() ? 2 + (G.pc?.level ?? 1) + (hasTool('grimoire') ? 1 : 0) + (G.flags.folkLesson ? 1 : 0) + (G.flags.covenLesson ? 1 : 0) : 0);
export const freeSigns = () => signs() - G.known.length;
export const knows = (id: string) => G.known.includes(id);
export const knowsSchool = (s: School) => G.known.some((id) => SPELLS[id]?.school === s);
export const STRAIN_MAX = 6;
export const strain = () => G.squad[0]?.strain ?? 0;
/** Бонус Оккультизма героя (с учётом протезов). */
export const occultBonus = () => (G.pc ? skillBonus(G.pc, 'occult') + gearBonus('occult') : 0);

/** Отдача от напряжения: при напряжении 4+ после заклинания — проверка Воли КС 8 + напряжение. */
export function strainCheck(): { roll: number; total: number; dc: number; ok: boolean } | null {
  const s = strain();
  if (s < 4) return null;
  const wil = G.pc?.attrs.wil ?? 0, roll = 1 + Math.floor(Math.random() * 20), dc = 8 + s;
  return { roll, total: roll + wil, dc, ok: roll !== 1 && (roll === 20 || roll + wil >= dc) };
}
export function addStrain(n: number) { const b = G.squad[0]; if (b) b.strain = Math.min(STRAIN_MAX, (b.strain ?? 0) + n); }
