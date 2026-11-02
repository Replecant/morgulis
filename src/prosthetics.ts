// ============================================================
//  Протезирование. Утраченные руки, ноги и глаза — постоянное
//  состояние; протез — часть тела (без износа и прочности).
//  Этап 1: протезы I–III у протезиста в Среднем городе.
//  Этап 2: экспериментальные протезы (IV) и оккультный глаз —
//  в подпольной мастерской Нижнего города; протезы глаз.
// ============================================================
import type { UnitBase } from './data';
import type { SkillKey } from './rules';

export type Limb = 'armR' | 'armL' | 'legR' | 'legL' | 'eyeR' | 'eyeL';
export type Part = 'arm' | 'leg' | 'eye';
export const LIMB_ORDER: Limb[] = ['eyeR', 'eyeL', 'armR', 'armL', 'legR', 'legL'];
export const LIMB_NAMES: Record<Limb, string> = { armR: 'Правая рука', armL: 'Левая рука', legR: 'Правая нога', legL: 'Левая нога', eyeR: 'Правый глаз', eyeL: 'Левый глаз' };
export const partOf = (l: Limb): Part => (l.startsWith('arm') ? 'arm' : l.startsWith('leg') ? 'leg' : 'eye');

/** Поправки: в бою (атаки, защита, перемещение) и к навыкам. */
export interface LimbMods { atkM?: number; atkR?: number; def?: number; move?: number; skills?: Partial<Record<SkillKey, number>> }
export type Shop = 'clinic' | 'under';
export const SHOP_NAMES: Record<Shop, string> = { clinic: 'Клиника протезирования', under: 'Подпольная мастерская' };

export interface Prosthesis {
  id: string; name: string; cat: 1 | 2 | 3 | 4; part: Part; price: number; shop: Shop;
  desc: string; mods: LimbMods;
  special?: string;          // особая способность или побочный эффект (текст для интерфейса)
  needItem?: string;         // нужен предмет из обоза (расходуется при установке)
}

export const PROSTHESES: Record<string, Prosthesis> = {
  // ---------------- руки
  hook:      { id: 'hook', name: 'Железный крюк', cat: 1, part: 'arm', price: 15, shop: 'clinic',
               desc: 'Держит простые предметы, но не годится для точной работы и неудобен с длинным оружием.',
               mods: { atkM: -1, atkR: -1, skills: { mechanics: -3, medicine: -3, stealth: -2 } } },
  hinged:    { id: 'hinged', name: 'Шарнирная кисть', cat: 2, part: 'arm', price: 60, shop: 'clinic',
               desc: 'Пальцы на шарнирах и тросах. Держит оружие и инструмент, но тонкая работа даётся хуже.',
               mods: { skills: { stealth: -2, mechanics: -1, medicine: -1 } } },
  piston:    { id: 'piston', name: 'Поршневая рука', cat: 3, part: 'arm', price: 150, shop: 'clinic',
               desc: 'Стальные поршни вместо мышц. Мёртвая хватка и сила для тяжёлых механизмов; урон оружия не растёт.',
               mods: { skills: { athletics: 2, mechanics: 2, stealth: -1 } } },
  galvanic:  { id: 'galvanic', name: 'Гальваническая рука', cat: 4, part: 'arm', price: 220, shop: 'under',
               desc: 'Медные катушки и гальванические банки вдоль предплечья. Разряд швыряет руку вперёд с нечеловеческой силой.',
               mods: { skills: { stealth: -1 } },
               special: 'Раз за бой — «Гальванический разряд»: следующий удар в ближнем бою +2 к атаке и урону. После удара — проверка Силы КС 12, провал: −1 ОЗ.' },
  flesh:     { id: 'flesh', name: 'Плотяная рука', cat: 4, part: 'arm', price: 260, shop: 'under',
               desc: 'Чужая рука, пришитая к культе запретной хирургией. Работает как своя — пока ткани получают раствор.',
               mods: {},
               special: 'Каждые 3 дня нужен тканевый раствор. Без него — отторжение: рука слушается как утраченная, пока не получит раствор.' },
  // ---------------- ноги
  pegleg:    { id: 'pegleg', name: 'Деревянная нога', cat: 1, part: 'leg', price: 15, shop: 'clinic',
               desc: 'Стучит по доскам. Ходить можно, но медленно; бег, прыжки и равновесие даются тяжело.',
               mods: { move: -1, skills: { athletics: -2, stealth: -1 } } },
  springleg: { id: 'springleg', name: 'Пружинная нога', cat: 2, part: 'leg', price: 60, shop: 'clinic',
               desc: 'Стальная пружина в колене. Шаг обычный, но на рытвинах и в грязи протез подводит.',
               mods: { skills: { survival: -2 } } },
  hydraleg:  { id: 'hydraleg', name: 'Гидравлическая нога', cat: 3, part: 'leg', price: 150, shop: 'clinic',
               desc: 'Гидравлический цилиндр держит любой вес. Обычный шаг и уверенная опора под ношей.',
               mods: { skills: { athletics: 1 } } },
  // ---------------- глаза
  glasseye:  { id: 'glasseye', name: 'Стеклянный глаз', cat: 1, part: 'eye', price: 10, shop: 'clinic',
               desc: 'Расписное стекло в глазнице. Косметический: зрение не возвращает.',
               mods: { atkR: -2, skills: { perception: -2 } } },
  occulteye: { id: 'occulteye', name: 'Оккультный глаз', cat: 4, part: 'eye', price: 120, shop: 'under', needItem: 'ritualkit',
               desc: 'Мутный шар с прожилками, вживлённый по обряду. Видит — и видит больше, чем следует.',
               mods: { skills: { occult: 2 } },
               special: 'Возвращает зрение. +2 к Оккультизму — замечать оккультные следы. Для обряда нужны ритуальные принадлежности (расходуются).' },
};

/** Последствия утраты без протеза. */
export const LOST: Record<Part, LimbMods> = {
  arm: { atkM: -2, atkR: -3, skills: { mechanics: -4, medicine: -4, stealth: -3, athletics: -2 } },
  leg: { move: -2, def: -1, skills: { athletics: -4, stealth: -2, survival: -2 } },
  eye: { atkR: -2, skills: { perception: -2 } },
};

export const limbsOf = (b: UnitBase) => (b.limbs ??= {});
export const hasLoss = (b: UnitBase) => LIMB_ORDER.some((l) => b.limbs?.[l]);
/** Плотяная рука без раствора — отторжение. */
export const rejecting = (b: UnitBase) => !!b.fleshReject;

/** Состояние части тела: «цела», «утрачена» или протез. */
export function limbState(b: UnitBase, l: Limb): { text: string; lost: boolean; prost?: Prosthesis } {
  const v = b.limbs?.[l];
  if (!v) return { text: partOf(l) === 'eye' ? 'видит' : 'цела', lost: false };
  if (v === 'lost') return { text: 'утрачена', lost: true };
  const p = PROSTHESES[v];
  return { text: p.name + (p.id === 'flesh' && rejecting(b) ? ' (отторжение!)' : ''), lost: false, prost: p };
}

/** Поправки, которые даёт конкретная часть тела. */
export function modsOf(b: UnitBase, l: Limb): LimbMods {
  const v = b.limbs?.[l];
  if (!v) return {};
  if (v === 'lost' || (v === 'flesh' && rejecting(b))) return LOST[partOf(l)];
  return PROSTHESES[v].mods;
}

/** Суммарные поправки от утраченных частей тела и протезов. */
export function limbMods(b: UnitBase) {
  const m = { atkM: 0, atkR: 0, def: 0, move: 0, skills: {} as Partial<Record<SkillKey, number>> };
  for (const l of LIMB_ORDER) {
    const src = modsOf(b, l);
    m.atkM += src.atkM ?? 0; m.atkR += src.atkR ?? 0; m.def += src.def ?? 0; m.move += src.move ?? 0;
    for (const [k, v2] of Object.entries(src.skills ?? {})) m.skills[k as SkillKey] = (m.skills[k as SkillKey] ?? 0) + v2;
  }
  return m;
}
export const limbSkill = (b: UnitBase | undefined, s: SkillKey) => (b ? limbMods(b).skills[s] ?? 0 : 0);
export const hasProsth = (b: UnitBase, id: string) => LIMB_ORDER.some((l) => b.limbs?.[l] === id);

export function loseLimb(b: UnitBase, l: Limb) { limbsOf(b)[l] = 'lost'; }
export const fits = (p: Prosthesis, l: Limb) => p.part === partOf(l);
export function install(b: UnitBase, l: Limb, id: string, clock: number) {
  limbsOf(b)[l] = id;
  if (id === 'flesh') { b.fleshDue = clock + 72; b.fleshReject = false; }
}

export const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const sg = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
const SK: Record<string, string> = { athletics: 'Атлетика', mechanics: 'Механика', medicine: 'Медицина', stealth: 'Скрытность', survival: 'Выживание', perception: 'Внимание', occult: 'Оккультизм' };
/** Короткая строка поправок для интерфейса. */
export function modsText(m: LimbMods): string {
  const out: string[] = [];
  if (m.atkM && m.atkM === m.atkR) out.push(`атаки ${sg(m.atkM)}`);
  else { if (m.atkM) out.push(`ближний бой ${sg(m.atkM)}`); if (m.atkR) out.push(`стрельба ${sg(m.atkR)}`); }
  if (m.def) out.push(`защита ${sg(m.def)}`);
  if (m.move) out.push(`перемещение ${sg(m.move)}`);
  for (const [k, v] of Object.entries(m.skills ?? {})) out.push(`${SK[k] ?? k} ${sg(v!)}`);
  return out.join(', ') || 'без поправок';
}
export const lostModsText = (part: Part) => modsText(LOST[part]);
