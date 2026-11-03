// ============================================================
//  Ролевая система Мортелиса (компьютерная адаптация)
//  3d6 + бонус ≥ КС. Четыре характеристики, шесть профессий,
//  10 уровней, таланты. Подробности — в RULES.md.
// ============================================================

// ------------------------------------------------------------ характеристики
// ВНИМАНИЕ: названия — рабочие, их легко переименовать здесь.
import { tr } from './i18n';
export type AttrKey = 'str' | 'dex' | 'int' | 'wil';
export const ATTRS: Record<AttrKey, { name: string; short: string; desc: string }> = {
  str: { name: 'Сила', short: 'СИЛ', desc: 'Мышцы и выносливость. Ближний бой, переноска тяжестей, здоровье.' },
  dex: { name: 'Ловкость', short: 'ЛОВ', desc: 'Реакция и точность рук. Стрельба, скрытность, защита, инициатива.' },
  int: { name: 'Разум', short: 'РАЗ', desc: 'Образование и смекалка. Механизмы, медицина, оккультные знания.' },
  wil: { name: 'Воля', short: 'ВОЛ', desc: 'Самообладание и характер. Устойчивость к ужасу, убеждение, внимание.' },
};
export const ATTR_ORDER: AttrKey[] = ['str', 'dex', 'int', 'wil'];
export const ATTR_MIN = -1, ATTR_MAX_START = 3, ATTR_POINTS = 5;

// ------------------------------------------------------------ навыки
export type SkillKey = 'melee' | 'athletics' | 'shooting' | 'stealth' | 'mechanics' | 'medicine' | 'occult' | 'perception' | 'persuasion' | 'survival';
export const SKILLS: Record<SkillKey, { name: string; attr: AttrKey; desc: string }> = {
  melee:      { name: 'Ближний бой', attr: 'str', desc: 'Штык, сабля, нож, приклад.' },
  athletics:  { name: 'Атлетика', attr: 'str', desc: 'Бег, лазание, выбивание дверей.' },
  shooting:   { name: 'Стрельба', attr: 'dex', desc: 'Револьверы, винтовки, пулемёты.' },
  stealth:    { name: 'Скрытность', attr: 'dex', desc: 'Тихо пройти, спрятаться, вскрыть замок.' },
  mechanics:  { name: 'Механика', attr: 'int', desc: 'Двигатели, оружие, протезы, взрыватели.' },
  medicine:   { name: 'Медицина', attr: 'int', desc: 'Перевязка, операции, яды и лекарства.' },
  occult:     { name: 'Оккультизм', attr: 'int', desc: 'Ритуалы, знаки, природа сверхъестественного.' },
  perception: { name: 'Внимание', attr: 'wil', desc: 'Заметить засаду, след, ложь.' },
  persuasion: { name: 'Убеждение', attr: 'wil', desc: 'Уговорить, запугать, поторговаться.' },
  survival:   { name: 'Выживание', attr: 'wil', desc: 'Пустошь, следопытство, охота, ночлег.' },
};
export const SKILL_ORDER = Object.keys(SKILLS) as SkillKey[];

// ------------------------------------------------------------ профессии
export type ProfId = 'soldier' | 'shooter' | 'saboteur' | 'occultist' | 'technician' | 'medic';
export interface Profession {
  id: ProfId;
  name: string;
  emblem: string;
  motto: string;
  desc: string;
  key: AttrKey;
  hp: number;            // ОЗ на 1 уровне (+ Сила)
  hpLevel: number;       // прирост ОЗ за уровень (+ Сила, мин. 1)
  armor: number;         // поглощение урона стартовой одеждой
  skills: SkillKey[];
  ability: { name: string; desc: string };
  kit: string[];
  weapons: string[];     // ключи из data.ts WEAPONS
  combatAbil: Record<string, number>;
  archetypes: string;
  look: { coat: string; trim?: string; weapon: 'rifle' | 'saber' | 'book' | 'wrench' | 'bag' | 'knife'; goggles?: boolean; band?: boolean };
}

export const PROFESSIONS: Record<ProfId, Profession> = {
  soldier: {
    id: 'soldier', name: 'Солдат', emblem: '⚔', motto: 'Держать строй',
    desc: 'Универсальный боец и опора отряда. Умеет держать оборону, ходить в штыковую и поднимать товарищей, когда остальные готовы бежать.',
    key: 'str', hp: 12, hpLevel: 6, armor: 1,
    skills: ['melee', 'athletics', 'shooting'],
    ability: { name: 'Штыковой бросок', desc: 'Рывок к врагу и удар штыком. Особенно хорош, когда накоплен кураж.' },
    kit: ['Армейская винтовка', 'Штык', 'Стальная каска', 'Плотная шинель', '10 винт. патронов', 'Паёк', 'Бинт', '15 ш.'],
    weapons: ['rifle', 'bayonet'], combatAbil: {},
    archetypes: 'огнемётчик, гренадер, знаменосец',
    look: { coat: '#5a2622', trim: '#c09a52', weapon: 'rifle' },
  },
  shooter: {
    id: 'shooter', name: 'Стрелок', emblem: '⌖', motto: 'Один выстрел',
    desc: 'Мастер огнестрельного оружия. Бьёт издалека и точно, знает цену каждому патрону и каждому укрытию.',
    key: 'dex', hp: 9, hpLevel: 5, armor: 0,
    skills: ['shooting', 'perception', 'survival'],
    ability: { name: 'Прицельный выстрел', desc: 'Тратит весь ход на прицеливание: +4 к броску атаки 3d6.' },
    kit: ['Охотничья винтовка', '20 винт. патронов', 'Нож', 'Кепи', '20 ш.'],
    weapons: ['huntrifle', 'knife'], combatAbil: { aim: 99 },
    archetypes: 'охотник на вампиров, снайпер, дуэлянт',
    look: { coat: '#3d4330', weapon: 'rifle' },
  },
  saboteur: {
    id: 'saboteur', name: 'Диверсант', emblem: '✶', motto: 'Тише тени',
    desc: 'Скрытность, проникновение и саботаж. Взрывчатка, ловушки, удар в спину — там, где солдаты идут в лоб, диверсант уже внутри.',
    key: 'dex', hp: 9, hpLevel: 5, armor: 1,
    skills: ['stealth', 'mechanics', 'perception'],
    ability: { name: 'Подрыв', desc: 'Бросает гранаты и динамит на 1 клетку дальше.' },
    kit: ['Самозарядный пистолет', 'Нож', 'Граната', 'Кепи', 'Отмычки', 'Компактный набор инструментов', '25 ш.'],
    weapons: ['autopistol', 'knife'], combatAbil: {},
    archetypes: 'подрывник, лазутчик, ловчий',
    look: { coat: '#232427', weapon: 'knife' },
  },
  occultist: {
    id: 'occultist', name: 'Оккультист', emblem: '☽', motto: 'Знать цену',
    desc: 'Исследователь сверхъестественного. Его практики ритуальны, медленны и опасны — и всё же порой это единственное, что работает против того, что приходит из темноты.',
    key: 'int', hp: 7, hpLevel: 4, armor: 0,
    skills: ['occult', 'perception', 'persuasion'],
    ability: { name: 'Оккультизм', desc: 'Четыре школы: народное колдовство, демонология, астрология, руническая эзотерика. Заклинания в бою и ритуалы вне боя (меню — O). Шкала напряжения 0–6.' },
    kit: ['Оккультный гримуар', 'Ритуальный кинжал', 'Ритуальные принадлежности: мел, свечи, травы', 'Поношенный самозарядный пистолет', 'Цилиндр', '30 ш.'],
    weapons: ['autopistol', 'rdagger'], combatAbil: {},
    archetypes: 'зависят от традиции',
    look: { coat: '#1b1820', trim: '#8a7a4a', weapon: 'book' },
  },
  technician: {
    id: 'technician', name: 'Техник', emblem: '⚙', motto: 'Всё можно починить',
    desc: 'Механизмы, транспорт, инженерия и протезы. Без техника отряд не заведёт грузовик, не починит пулемёт и не поставит новую руку.',
    key: 'int', hp: 9, hpLevel: 5, armor: 1,
    skills: ['mechanics', 'athletics', 'perception'],
    ability: { name: 'Мастер на все руки', desc: 'Набор инструментов и запасные детали: разбирает механизмы и чинит изношенное оружие в походе.' },
    kit: ['Набор инструментов', 'Измерительные инструменты', 'Самозарядный пистолет', '3 запасные детали', 'Кепи', '20 ш.'],
    weapons: ['autopistol'], combatAbil: {},
    archetypes: 'механик-водитель, протезист, артиллерист',
    look: { coat: '#4a3a26', weapon: 'wrench', goggles: true },
  },
  medic: {
    id: 'medic', name: 'Медик', emblem: '✚', motto: 'Не навреди… сильно',
    desc: 'Хирург и полевой врач. Лечит раны, проводит операции, вытаскивает пули. Магического исцеления нет — есть только скальпель, бинты и твёрдая рука.',
    key: 'int', hp: 8, hpLevel: 5, armor: 0,
    skills: ['medicine', 'perception', 'persuasion'],
    ability: { name: 'Хирургия', desc: 'Лучшая Медицина в отряде; хирургический набор позволяет оперировать тяжёлые раны.' },
    kit: ['Хирургический набор', '3 бинта', 'Антисептик', 'Револьвер', 'Нож', 'Кепи', '20 ш.'],
    weapons: ['revolver', 'knife'], combatAbil: {},
    archetypes: 'военный хирург, токсиколог, анатом',
    look: { coat: '#4f4d46', weapon: 'bag', band: true },
  },
};
export const PROF_ORDER: ProfId[] = ['soldier', 'shooter', 'saboteur', 'occultist', 'technician', 'medic'];

// ------------------------------------------------------------ таланты
export type TalentId = 'tough' | 'steady' | 'cold' | 'quick' | 'grip' | 'scholar';
export const TALENTS: Record<TalentId, { name: string; desc: string }> = {
  tough:   { name: 'Крепкое здоровье', desc: '+3 ОЗ сейчас и +1 ОЗ за каждый уровень.' },
  steady:  { name: 'Твёрдая рука', desc: '+1 к атакам огнестрельным оружием.' },
  cold:    { name: 'Хладнокровие', desc: '+3 к проверкам против страха и сверхъестественного ужаса.' },
  quick:   { name: 'Быстрая реакция', desc: '+1 к Защите и +2 к инициативе.' },
  grip:    { name: 'Железная хватка', desc: '+1 к урону в ближнем бою.' },
  scholar: { name: 'Начитанность', desc: 'Ещё один навык на выбор становится обученным.' },
};
export const TALENT_ORDER = Object.keys(TALENTS) as TalentId[];

// ------------------------------------------------------------ персонаж
export interface Character {
  first: string;
  last: string;
  gender: 'm' | 'f';
  age: number;
  hair: string;
  skin: string;
  prof: ProfId;
  attrs: Record<AttrKey, number>;
  extraSkills: SkillKey[];   // выбранные сверх профессии
  talent: TalentId;
  level: number;
  xp: number;
}

export const HAIR = ['#1c1a18', '#4a2e1c', '#8a6a42', '#8a3e1c', '#9a968c'];
export const SKIN = ['#e0c8ac', '#cdb69a', '#b0906e', '#8a6a4e', '#5e4634'];

export function newCharacter(): Character {
  return {
    first: '', last: '', gender: 'm', age: 28, hair: HAIR[1], skin: SKIN[1],
    prof: 'soldier', attrs: { str: 0, dex: 0, int: 0, wil: 0 },
    extraSkills: [], talent: 'tough', level: 1, xp: 0,
  };
}

/** Опыт, нужный для достижения уровня (индекс = уровень − 1). */
export const LEVEL_XP = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];
export const MAX_LEVEL = 10;

/** Мастерство растёт с уровнем: +1 / +2 / +3 / +4 на уровнях 1 / 4 / 7 / 10. */
export const mastery = (lvl: number) => 1 + Math.floor((lvl - 1) / 3);

export const pointsSpent = (c: Character) => ATTR_ORDER.reduce((s, k) => s + c.attrs[k], 0);
export const pointsLeft = (c: Character) => ATTR_POINTS - pointsSpent(c);
export const extraSkillSlots = (c: Character) => 1 + (c.talent === 'scholar' ? 1 : 0);

export function trainedSkills(c: Character): SkillKey[] {
  return [...new Set([...PROFESSIONS[c.prof].skills, ...c.extraSkills])];
}
export function skillBonus(c: Character, s: SkillKey) {
  return c.attrs[SKILLS[s].attr] + (trainedSkills(c).includes(s) ? mastery(c.level) + 1 : 0);
}

export function maxHp(c: Character) {
  const p = PROFESSIONS[c.prof];
  const per = Math.max(1, p.hpLevel + c.attrs.str) + (c.talent === 'tough' ? 1 : 0);
  return p.hp + c.attrs.str + (c.talent === 'tough' ? 3 : 0) + per * (c.level - 1);
}
/** Защита: 13 + Ловкость. Под 3d6 база поднята на 3 (с d20 было 10), чтобы по открытой цели попадали примерно в 60–75%, а не в 90%. */
export const DEF_BASE = 13;
export const defense = (c: Character) => DEF_BASE + c.attrs.dex + (c.talent === 'quick' ? 1 : 0);
export const armorOf = (c: Character) => PROFESSIONS[c.prof].armor;
export const initiative = (c: Character) => c.attrs.dex + (c.talent === 'quick' ? 2 : 0);
export const meleeAttack = (c: Character) => skillBonus(c, 'melee');
export const rangedAttack = (c: Character) => skillBonus(c, 'shooting') + (c.talent === 'steady' ? 1 : 0);
export const meleeDamage = (c: Character) => Math.max(0, c.attrs.str) + (c.talent === 'grip' ? 1 : 0);
export const horrorSave = (c: Character) => c.attrs.wil + (c.talent === 'cold' ? 3 : 0);

// ------------------------------------------------------------ проверки
/** Ступени сложности под 3d6. Обученный специалист с сильной характеристикой на 1-м уровне берёт обычную примерно в половине случаев. */
export const DC = { easy: 12, normal: 15, hard: 17, extreme: 19 } as const;
export const DC_NAMES: Record<number, string> = { 12: 'лёгкая', 15: 'обычная', 17: 'сложная', 19: 'очень сложная' };

export interface CheckResult { roll: number; bonus: number; total: number; dc: number; success: boolean; crit: boolean; fumble: boolean }
// Бросок — 3d6 (3–18, чаще всего 9–12): меньше случайности, больше веса у навыка и укрытий.
// 16–18 на костях — блестящий успех (крит), 3–5 — провал при любом бонусе: каждое примерно в 5% бросков.
export const DICE = '3d6';
export const CRIT_AT = 16, FUMBLE_AT = 5;
const d6 = () => 1 + Math.floor(Math.random() * 6);
export const roll3d6 = () => d6() + d6() + d6();
/** Вероятность каждой суммы 3d6 (индекс — сумма). */
const P3D6 = (() => { const p = new Array(19).fill(0); for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) p[a + b + c] += 1 / 216; return p; })();
/** Проверка: 3d6 + бонус ≥ КС. 16+ на костях — всегда успех, 5 и меньше — всегда провал. */
export function check(bonus: number, dc: number): CheckResult {
  const roll = roll3d6();
  const total = roll + bonus;
  return { roll, bonus, total, dc, success: roll >= CRIT_AT || (roll > FUMBLE_AT && total >= dc), crit: roll >= CRIT_AT, fumble: roll <= FUMBLE_AT };
}
/** Вероятность успеха проверки, % (для подсказок в интерфейсе). */
export function checkChance(bonus: number, dc: number) {
  let p = 0;
  for (let r = 3; r <= 18; r++) if (r >= CRIT_AT || (r > FUMBLE_AT && r + bonus >= dc)) p += P3D6[r];
  return Math.round(p * 100);
}

/** Готовый герой для быстрого старта: случайные пол и имя, черты под профессию. */
export function quickCharacter(prof: ProfId): Character {
  const c = newCharacter();
  const rnd = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  c.gender = Math.random() < 0.5 ? 'm' : 'f';
  c.first = tr(rnd(NAMES[c.gender])); c.last = tr(rnd(NAMES.last));
  c.age = 22 + Math.floor(Math.random() * 25);
  c.hair = rnd(HAIR); c.skin = rnd(SKIN);
  c.prof = prof;
  const p = PROFESSIONS[prof];
  // ключевая черта +3, следующая по важности +2 (всего 5 очков)
  const second: Record<AttrKey, AttrKey> = { str: 'dex', dex: 'wil', int: 'wil', wil: 'dex' };
  c.attrs[p.key] = 3; c.attrs[second[p.key]] = 2;
  c.extraSkills = [SKILL_ORDER.find((s) => !p.skills.includes(s) && (s === 'perception' || s === 'athletics' || s === 'shooting'))!];
  c.talent = 'tough';
  return c;
}

export const fullName = (c: Character) => `${c.first} ${c.last}`.trim();
export const g = (c: Character | null | undefined, m: string, f: string) => (c?.gender === 'f' ? f : m);

// ------------------------------------------------------------ имена
// Имена в британской эстетике — без реальных мест и исторических лиц.
export const NAMES = {
  m: ['Эдмунд', 'Артур', 'Сайрус', 'Томас', 'Габриэль', 'Мэтью', 'Илай', 'Джаспер', 'Альберт', 'Корнелиус', 'Уолтер', 'Эзра'],
  f: ['Элинор', 'Агата', 'Мэри', 'Вайолет', 'Беатрис', 'Клара', 'Ада', 'Хелена', 'Мод', 'Сесилия', 'Эдит', 'Роуз'],
  last: ['Карвер', 'Блэквуд', 'Хейл', 'Мортимер', 'Эшгров', 'Крейн', 'Вэйланд', 'Фэрроу', 'Грэйсон', 'Холлис', 'Стрэйдж', 'Рэвенхилл'],
};
