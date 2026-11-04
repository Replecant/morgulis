// ============================================================
//  Ролевая система Мортелиса (компьютерная адаптация)
//  3d6 + бонус ≥ КС. Четыре характеристики, шесть профессий,
//  6 уровней, таланты профессий на 2, 4 и 6. Подробности — в RULES.md.
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
  hpLevel: number;       // прирост ОЗ за уровень (берётся половина, мин. 1)
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

// ------------------------------------------------------------ таланты профессий (уровни 2, 4, 6 — выбор из двух)
export type TalentMods = Partial<Record<'maxHp' | 'atkM' | 'atkR' | 'def' | 'armor' | 'dmgM' | 'horror' | 'move' | 'courage', number>>;
export interface ClassTalent { id: string; name: string; desc: string; mods?: TalentMods; skills?: Partial<Record<SkillKey, number>>; abil?: Record<string, number>; signs?: number }
export const TALENT_LEVELS = [2, 4, 6];
const CT = (id: string, name: string, desc: string, x: Partial<ClassTalent> = {}): ClassTalent => ({ id, name, desc, ...x });
export const CLASS_TALENTS: Record<ProfId, ClassTalent[][]> = {
  soldier: [
    [CT('s_trench', 'Окопная закалка', '+1 к поглощению урона: привык держать удар.', { mods: { armor: 1 } }),
     CT('s_bayonet', 'Штыковая выучка', '+1 к атаке и +1 к урону в ближнем бою.', { mods: { atkM: 1, dmgM: 1 } })],
    [CT('s_rally', 'Командный голос', 'В бою — «Командный клич»: союзник в радиусе 6 получает +1 ОД (раз за бой).', { abil: { rally: 1 } }),
     CT('s_veteran', 'Ветеран', 'Каждый бой начинает с 1 очком куража; +1 к стойкости.', { mods: { courage: 1, horror: 1 } })],
    [CT('s_unbroken', 'Несгибаемый', '+6 ОЗ и +2 к стойкости.', { mods: { maxHp: 6, horror: 2 } }),
     CT('s_stormer', 'Штурмовик', 'После Штыковой атаки и Последнего натиска не раскрыт: Защита не падает.')],
  ],
  shooter: [
    [CT('h_eye', 'Глаз охотника', '+1 к стрельбе.', { mods: { atkR: 1 } }),
     CT('h_cover', 'Чутьё укрытий', '+1 к Защите.', { mods: { def: 1 } })],
    [CT('h_sniper', 'Снайпер', 'Прицельный выстрел даёт +6 к броску вместо +4.'),
     CT('h_hunter', 'Охотник на нечисть', '+2 к урону по демонам и мертвецам.')],
    [CT('h_deadeye', 'Смертельный выстрел', 'При стрельбе крит уже с 15 на костях, а не с 16.'),
     CT('h_calm', 'Ледяное спокойствие', 'Подавление пулемётным огнём не действует; +2 к стойкости.', { mods: { horror: 2 } })],
  ],
  saboteur: [
    [CT('b_shadow', 'Тень', '+2 к Скрытности.', { skills: { stealth: 2 } }),
     CT('b_knife', 'Ножевой бой', 'Нож, штык и ритуальный кинжал: +1 к атаке и +2 к урону.')],
    [CT('b_blast', 'Подрывник', 'Гранаты и динамит бьют на 2 сильнее.'),
     CT('b_quick', 'Юркий', '+1 к перемещению в бою.', { mods: { move: 1 } })],
    [CT('b_ghost', 'Призрак', '+2 к Защите.', { mods: { def: 2 } }),
     CT('b_lethal', 'Добивание', '+2 к атаке по врагам, у которых осталось не больше половины ОЗ.')],
  ],
  occultist: [
    [CT('o_sign', 'Ученик тьмы', '+1 знак: можно постичь ещё одно заклинание.', { signs: 1 }),
     CT('o_ward', 'Защитные знаки', '+2 к стойкости и +1 к Защите.', { mods: { horror: 2, def: 1 } })],
    [CT('o_nerves', 'Стальные нервы', 'Заклинания дороже 1 повышают напряжение на 1 меньше.'),
     CT('o_lore', 'Тайное знание', '+2 к Оккультизму и +1 знак.', { skills: { occult: 2 }, signs: 1 })],
    [CT('o_master', 'Мастер ритуалов', '+2 знака.', { signs: 2 }),
     CT('o_blood', 'Кровь и воля', '+5 ОЗ и +3 к стойкости.', { mods: { maxHp: 5, horror: 3 } })],
  ],
  technician: [
    [CT('t_careful', 'Бережный ремонт', 'Оружие отряда изнашивается вдвое реже.'),
     CT('t_hands', 'Золотые руки', '+2 к Механике.', { skills: { mechanics: 2 } })],
    [CT('t_plate', 'Бронепластины', '+1 к поглощению урона.', { mods: { armor: 1 } }),
     CT('t_shop', 'Закалка цеха', '+4 ОЗ и +1 к стойкости.', { mods: { maxHp: 4, horror: 1 } })],
    [CT('t_tuned', 'Подстройка оружия', '+1 к урону огнестрельным оружием.'),
     CT('t_calc', 'Расчёт', '+1 к стрельбе и +1 к Защите.', { mods: { atkR: 1, def: 1 } })],
  ],
  medic: [
    [CT('m_field', 'Полевой хирург', 'Бинт и аптечка в бою лечат на 2 ОЗ больше.'),
     CT('m_cold', 'Холодная голова', '+2 к стойкости и +2 к Вниманию.', { mods: { horror: 2 }, skills: { perception: 2 } })],
    [CT('m_triage', 'Сортировка', 'Тяжелораненый, поднятый бинтом или аптечкой, встаёт с половиной ОЗ.'),
     CT('m_steady', 'Верная рука', '+2 к Медицине (перевязки, операции) и +1 к Защите.', { skills: { medicine: 2 }, mods: { def: 1 } })],
    [CT('m_anatomy', 'Анатом', 'Знает, куда бить: +1 к атаке и +2 к урону в ближнем бою.', { mods: { atkM: 1, dmgM: 2 } }),
     CT('m_angel', 'Ангел окопов', '+6 ОЗ и 1 очко куража в начале каждого боя.', { mods: { maxHp: 6, courage: 1 } })],
  ],
};
const ALL_CT = Object.values(CLASS_TALENTS).flat(2);
export const classTalent = (id: string) => ALL_CT.find((t) => t.id === id);
export const talentsOf = (c: Character | null | undefined) => (c?.classTalents ?? []).map(classTalent).filter((t): t is ClassTalent => !!t);
export const hasTalent = (c: Character | null | undefined, id: string) => !!c?.classTalents?.includes(id);
export const talentMod = (c: Character, k: keyof TalentMods) => talentsOf(c).reduce((s, t) => s + (t.mods?.[k] ?? 0), 0);
export const talentSigns = (c: Character | null | undefined) => talentsOf(c).reduce((s, t) => s + (t.signs ?? 0), 0);
/** Какой выбор таланта ждёт героя: уровень с талантом, на котором талант ещё не взят (по порядку). */
export function pendingTalent(c: Character | null | undefined): ClassTalent[] | null {
  if (!c) return null;
  const tier = TALENT_LEVELS.findIndex((l, i) => c.level >= l && (c.classTalents?.length ?? 0) <= i);
  return tier >= 0 ? CLASS_TALENTS[c.prof][tier] : null;
}

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
  classTalents?: string[];   // таланты профессии, взятые на уровнях 2, 4, 6
  courageMoves?: string[];   // известные приёмы куража (нет — стартовые профессии)
}

export const HAIR = ['#1c1a18', '#4a2e1c', '#8a6a42', '#8a3e1c', '#9a968c'];
export const SKIN = ['#e0c8ac', '#cdb69a', '#b0906e', '#8a6a4e', '#5e4634'];

export function newCharacter(): Character {
  return {
    first: '', last: '', gender: 'm', age: 28, hair: HAIR[1], skin: SKIN[1],
    prof: 'soldier', attrs: { str: 0, dex: 0, int: 0, wil: 0 },
    extraSkills: [], talent: 'tough', level: 1, xp: 0, classTalents: [],
  };
}

/** Опыт, нужный для достижения уровня (индекс = уровень − 1). */
export const LEVEL_XP = [0, 100, 250, 450, 700, 1000];
export const MAX_LEVEL = 6;

/** Мастерство растёт с уровнем: +1 / +2 / +3 на уровнях 1 / 3 / 5 (на чётных уровнях — таланты профессии). */
export const mastery = (lvl: number) => 1 + Math.floor((lvl - 1) / 2);

export const pointsSpent = (c: Character) => ATTR_ORDER.reduce((s, k) => s + c.attrs[k], 0);
export const pointsLeft = (c: Character) => ATTR_POINTS - pointsSpent(c);
export const extraSkillSlots = (c: Character) => 1 + (c.talent === 'scholar' ? 1 : 0);

export function trainedSkills(c: Character): SkillKey[] {
  return [...new Set([...PROFESSIONS[c.prof].skills, ...c.extraSkills])];
}
export function skillBonus(c: Character, s: SkillKey) {
  return c.attrs[SKILLS[s].attr] + (trainedSkills(c).includes(s) ? mastery(c.level) + 1 : 0) + talentsOf(c).reduce((n, t) => n + (t.skills?.[s] ?? 0), 0);
}

export function maxHp(c: Character) {
  const p = PROFESSIONS[c.prof];
  // за уровень — половина прироста профессии (6 уровней: здоровье к концу примерно вдвое больше стартового)
  const per = Math.max(1, Math.floor(p.hpLevel / 2)) + (c.talent === 'tough' ? 1 : 0);
  return p.hp + c.attrs.str + (c.talent === 'tough' ? 3 : 0) + per * (c.level - 1) + talentMod(c, 'maxHp');
}
/** Защита: 13 + Ловкость. Под 3d6 база поднята на 3 (с d20 было 10), чтобы по открытой цели попадали примерно в 60–75%, а не в 90%. */
export const DEF_BASE = 13;
export const defense = (c: Character) => DEF_BASE + c.attrs.dex + (c.talent === 'quick' ? 1 : 0) + talentMod(c, 'def');
export const armorOf = (c: Character) => PROFESSIONS[c.prof].armor;
export const initiative = (c: Character) => c.attrs.dex + (c.talent === 'quick' ? 2 : 0);
export const meleeAttack = (c: Character) => skillBonus(c, 'melee') + talentMod(c, 'atkM');
export const rangedAttack = (c: Character) => skillBonus(c, 'shooting') + (c.talent === 'steady' ? 1 : 0) + talentMod(c, 'atkR');
export const meleeDamage = (c: Character) => Math.max(0, c.attrs.str) + (c.talent === 'grip' ? 1 : 0) + talentMod(c, 'dmgM');
export const horrorSave = (c: Character) => c.attrs.wil + (c.talent === 'cold' ? 3 : 0) + talentMod(c, 'horror');

// ------------------------------------------------------------ приёмы куража: 2 в начале, ещё по одному на 3 и 5 уровнях (не больше 4)
export const COURAGE: Record<string, { name: string; short: string; cost: number; desc: string }> = {
  charge: { name: 'Штыковая атака', short: 'Штыковая', cost: 1, desc: 'Нужны 2 ОД и холодное оружие. Бросок до 6 клеток к врагу и удар: +2 к атаке, +2 к урону. После — раскрыт: −2 к Защите до своего хода.' },
  rush:   { name: 'Отчаянный рывок', short: 'Рывок', cost: 1, desc: '1 ОД. Перебежка на двойное расстояние. Каждый вражеский стрелок, который видит бойца, стреляет вслед с −3.' },
  last:   { name: 'Последний натиск', short: 'Натиск', cost: 2, desc: 'Только при ОЗ не выше трети. Атака: кость бросается дважды, берётся лучшая, +2 к урону. После — раскрыт.' },
  rescue: { name: 'Спасение товарища', short: 'Спасение', cost: 1, desc: 'Нужны 2 ОД. Бросок до 6 клеток к тяжелораненому союзнику — тот встаёт с четвертью ОЗ. По пути — огонь вслед.' },
  grit:   { name: 'Стиснуть зубы', short: 'Зубы', cost: 1, desc: 'Без ОД. +3 ОЗ, снимает подавление и слабость.' },
  brace:  { name: 'Стоять насмерть', short: 'Насмерть', cost: 1, desc: '1 ОД, завершает ход. До своего следующего хода +3 к Защите.' },
  pierce: { name: 'Выстрел в щель', short: 'В щель', cost: 1, desc: 'Нужны 2 ОД и огнестрел. Выстрел с +2 к атаке — броня цели не спасает.' },
  volley: { name: 'Шквал огня', short: 'Шквал', cost: 2, desc: 'Нужны 2 ОД и огнестрел с двумя зарядами. Два выстрела подряд по одной цели.' },
  inspire: { name: 'Воодушевить', short: 'Воодушевить', cost: 2, desc: '1 ОД. Свои бойцы в радиусе 5: +1 кураж каждому.' },
};
export const COURAGE_ORDER = ['charge', 'rush', 'last', 'rescue', 'grit', 'brace', 'pierce', 'volley', 'inspire'];
/** С чего начинает каждая профессия (а спутники — по своим ролям). */
export const COURAGE_START: Record<ProfId, string[]> = {
  soldier: ['charge', 'rush'], shooter: ['pierce', 'rush'], saboteur: ['rush', 'grit'],
  occultist: ['grit', 'brace'], technician: ['brace', 'volley'], medic: ['rescue', 'grit'],
};
export const COMPANION_MOVES: Record<string, string[]> = { alex: ['rush', 'rescue'], arthur: ['pierce', 'brace'] };
export const MOVE_LEVELS = [3, 5];
export const knownMoves = (c: Character) => c.courageMoves ?? COURAGE_START[c.prof];
/** Выбор нового приёма куража ждёт героя: уровень 3 / 5 достигнут, а приёмов меньше положенного. */
export function pendingMove(c: Character | null | undefined): string[] | null {
  if (!c) return null;
  const due = 2 + MOVE_LEVELS.filter((l) => c.level >= l).length, known = knownMoves(c);
  return known.length < due ? COURAGE_ORDER.filter((k) => !known.includes(k)) : null;
}

// ------------------------------------------------------------ опыт
/** Опыт за поверженного врага: тем больше, чем он крепче и опаснее. */
export const enemyXp = (hp: number, atk: number) => Math.max(3, Math.round((hp + (atk + 2) * 3) / 2));
export const XP = { poi: 10, place: 20, scene: 10, check: 5 } as const;

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
