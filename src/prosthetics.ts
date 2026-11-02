// ============================================================
//  Протезирование (этап 1): потеря рук и ног как постоянное
//  состояние и протезы категорий I–III. Протез — часть тела
//  персонажа: без износа, прочности и бросков на установку.
//  Ставит протезист в Среднем городе форта.
// ============================================================
import type { UnitBase } from './data';
import type { SkillKey } from './rules';

export type Limb = 'armR' | 'armL' | 'legR' | 'legL';
export const LIMB_ORDER: Limb[] = ['armR', 'armL', 'legR', 'legL'];
export const LIMB_NAMES: Record<Limb, string> = { armR: 'Правая рука', armL: 'Левая рука', legR: 'Правая нога', legL: 'Левая нога' };
const isArm = (l: Limb) => l === 'armR' || l === 'armL';

/** Поправки: в бою (атаки, защита, перемещение) и к навыкам. */
export interface LimbMods { atkM?: number; atkR?: number; def?: number; move?: number; skills?: Partial<Record<SkillKey, number>> }

export interface Prosthesis { id: string; name: string; cat: 1 | 2 | 3; part: 'arm' | 'leg'; price: number; desc: string; mods: LimbMods }

/** Протезы этапа 1. Категории I–II в основном компенсируют утрату, III — небольшие ситуационные бонусы. */
export const PROSTHESES: Record<string, Prosthesis> = {
  hook:      { id: 'hook', name: 'Железный крюк', cat: 1, part: 'arm', price: 15,
               desc: 'Держит простые предметы, но не годится для точной работы и неудобен с длинным оружием.',
               mods: { atkM: -1, atkR: -1, skills: { mechanics: -3, medicine: -3, stealth: -2 } } },
  hinged:    { id: 'hinged', name: 'Шарнирная кисть', cat: 2, part: 'arm', price: 60,
               desc: 'Пальцы на шарнирах и тросах. Держит оружие и инструмент, но тонкая работа даётся хуже.',
               mods: { skills: { stealth: -2, mechanics: -1, medicine: -1 } } },
  piston:    { id: 'piston', name: 'Поршневая рука', cat: 3, part: 'arm', price: 150,
               desc: 'Стальные поршни вместо мышц. Мёртвая хватка и сила для тяжёлых механизмов; урон оружия не растёт.',
               mods: { skills: { athletics: 2, mechanics: 2, stealth: -1 } } },
  pegleg:    { id: 'pegleg', name: 'Деревянная нога', cat: 1, part: 'leg', price: 15,
               desc: 'Стучит по доскам. Ходить можно, но медленно; бег, прыжки и равновесие даются тяжело.',
               mods: { move: -1, skills: { athletics: -2, stealth: -1 } } },
  springleg: { id: 'springleg', name: 'Пружинная нога', cat: 2, part: 'leg', price: 60,
               desc: 'Стальная пружина в колене. Шаг обычный, но на рытвинах и в грязи протез подводит.',
               mods: { skills: { survival: -2 } } },
  hydraleg:  { id: 'hydraleg', name: 'Гидравлическая нога', cat: 3, part: 'leg', price: 150,
               desc: 'Гидравлический цилиндр держит любой вес. Обычный шаг и уверенная опора под ношей.',
               mods: { skills: { athletics: 1 } } },
};

/** Последствия утраты без протеза. */
const LOST: Record<'arm' | 'leg', LimbMods> = {
  arm: { atkM: -2, atkR: -3, skills: { mechanics: -4, medicine: -4, stealth: -3, athletics: -2 } },
  leg: { move: -2, def: -1, skills: { athletics: -4, stealth: -2, survival: -2 } },
};

export const limbsOf = (b: UnitBase) => (b.limbs ??= {});
export const hasLoss = (b: UnitBase) => LIMB_ORDER.some((l) => b.limbs?.[l]);

/** Состояние конечности: «цела», «утрачена» или название протеза. */
export function limbState(b: UnitBase, l: Limb): { text: string; lost: boolean; prost?: Prosthesis } {
  const v = b.limbs?.[l];
  if (!v) return { text: 'цела', lost: false };
  if (v === 'lost') return { text: 'утрачена', lost: true };
  return { text: PROSTHESES[v].name, lost: false, prost: PROSTHESES[v] };
}

/** Суммарные поправки от утраченных конечностей и протезов. */
export function limbMods(b: UnitBase): Required<Omit<LimbMods, 'skills'>> & { skills: Partial<Record<SkillKey, number>> } {
  const m = { atkM: 0, atkR: 0, def: 0, move: 0, skills: {} as Partial<Record<SkillKey, number>> };
  for (const l of LIMB_ORDER) {
    const v = b.limbs?.[l];
    if (!v) continue;
    const src = v === 'lost' ? LOST[isArm(l) ? 'arm' : 'leg'] : PROSTHESES[v].mods;
    m.atkM += src.atkM ?? 0; m.atkR += src.atkR ?? 0; m.def += src.def ?? 0; m.move += src.move ?? 0;
    for (const [k, v2] of Object.entries(src.skills ?? {})) m.skills[k as SkillKey] = (m.skills[k as SkillKey] ?? 0) + v2;
  }
  return m;
}
export const limbSkill = (b: UnitBase | undefined, s: SkillKey) => (b ? limbMods(b).skills[s] ?? 0 : 0);

/** Утрата конечности (ампутация). */
export function loseLimb(b: UnitBase, l: Limb) { limbsOf(b)[l] = 'lost'; }

/** Подходит ли протез к этой конечности (рука к руке, нога к ноге; ставится вместо утраченной или старого протеза). */
export const fits = (p: Prosthesis, l: Limb) => (p.part === 'arm') === isArm(l);

export function install(b: UnitBase, l: Limb, id: string) { limbsOf(b)[l] = id; }

/** Короткая строка поправок для интерфейса. */
export function modsText(m: LimbMods): string {
  const sg = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
  const SK: Record<string, string> = { athletics: 'Атлетика', mechanics: 'Механика', medicine: 'Медицина', stealth: 'Скрытность', survival: 'Выживание' };
  const out: string[] = [];
  if (m.atkM && m.atkM === m.atkR) out.push(`атаки ${sg(m.atkM)}`);
  else { if (m.atkM) out.push(`ближний бой ${sg(m.atkM)}`); if (m.atkR) out.push(`стрельба ${sg(m.atkR)}`); }
  if (m.def) out.push(`защита ${sg(m.def)}`);
  if (m.move) out.push(`перемещение ${sg(m.move)}`);
  for (const [k, v] of Object.entries(m.skills ?? {})) out.push(`${SK[k] ?? k} ${sg(v!)}`);
  return out.join(', ') || 'без поправок';
}
export const lostModsText = (part: 'arm' | 'leg') => modsText(LOST[part]);
