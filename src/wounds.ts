// ============================================================
//  Ранения и лечение как ресурс
//  ОЗ сами не восстанавливаются. Лечение тратит бинты, пайки
//  аптечки и антисептик. Тяжёлые ранения снимает только операция
//  (нужен хирургический набор).
// ============================================================
import { G, hasTool, gearBonus } from './state';
import { UnitBase } from './data';
import { check, CheckResult } from './rules';
import { pick } from './util';
import { limbMods, loseLimb, Limb, LIMB_NAMES } from './prosthetics';

export interface WoundMods { atkM?: number; atkR?: number; def?: number; move?: number; horror?: number; maxHp?: number }
export interface Wound {
  id: string;
  name: string;
  heavy: boolean;
  desc: string;
  mods: WoundMods;
}

export const WOUNDS: Record<string, Wound> = {
  // лёгкие — проходят после привала
  brow:     { id: 'brow', name: 'Рассечённая бровь', heavy: false, desc: 'Кровь заливает глаз: −1 к стрельбе.', mods: { atkR: -1 } },
  shoulder: { id: 'shoulder', name: 'Ушиб плеча', heavy: false, desc: '−1 к атакам в ближнем бою.', mods: { atkM: -1 } },
  ankle:    { id: 'ankle', name: 'Вывих лодыжки', heavy: false, desc: '−1 к перемещению.', mods: { move: -1 } },
  concuss:  { id: 'concuss', name: 'Контузия', heavy: false, desc: 'Звон в ушах: −2 к стойкости против ужаса.', mods: { horror: -2 } },
  stitches: { id: 'stitches', name: 'Свежие швы', heavy: false, desc: 'После операции: −1 к Защите.', mods: { def: -1 } },
  gassed:   { id: 'gassed', name: 'Отравление газом', heavy: false, desc: 'Кашель и резь в глазах: −1 к атакам, −2 к макс. ОЗ.', mods: { atkM: -1, atkR: -1, maxHp: -2 } },
  // тяжёлые — только операция
  bullet:   { id: 'bullet', name: 'Пуля в плече', heavy: true, desc: '−2 к атакам, −2 к макс. ОЗ.', mods: { atkM: -2, atkR: -2, maxHp: -2 } },
  ribs:     { id: 'ribs', name: 'Сломанные рёбра', heavy: true, desc: '−1 к Защите, −2 к макс. ОЗ.', mods: { def: -1, maxHp: -2 } },
  thigh:    { id: 'thigh', name: 'Рана бедра', heavy: true, desc: '−1 к перемещению, −2 к макс. ОЗ.', mods: { move: -1, maxHp: -2 } },
  eye:      { id: 'eye', name: 'Рана глаза', heavy: true, desc: '−2 к стрельбе, −2 к макс. ОЗ.', mods: { atkR: -2, maxHp: -2 } },
  gash:     { id: 'gash', name: 'Глубокая рваная рана', heavy: true, desc: '−4 к макс. ОЗ.', mods: { maxHp: -4 } },
};
const LIGHT = ['brow', 'shoulder', 'ankle', 'concuss'];
const HEAVY = ['bullet', 'ribs', 'thigh', 'gash', 'eye'];

export const woundsOf = (b: UnitBase) => (b.wounds ?? []).map((id) => WOUNDS[id]);

export function woundMods(b: UnitBase): Required<WoundMods> {
  const m = { atkM: 0, atkR: 0, def: 0, move: 0, horror: 0, maxHp: 0 };
  for (const w of woundsOf(b)) for (const k in w.mods) (m as any)[k] += (w.mods as any)[k];
  // утраченные конечности и протезы — постоянные поправки
  const l = limbMods(b); m.atkM += l.atkM; m.atkR += l.atkR; m.def += l.def; m.move += l.move;
  return m;
}
/** Максимум ОЗ с учётом ранений. */
export const effMaxHp = (b: UnitBase) => Math.max(1, b.maxHp + woundMods(b).maxHp);

/** Нанести конкретное ранение (если его ещё нет). */
export function addWoundId(b: UnitBase, id: string): boolean {
  const have = b.wounds ?? (b.wounds = []);
  if (have.includes(id)) return false;
  have.push(id); b.hp = Math.min(b.hp, effMaxHp(b));
  return true;
}

/** Нанести ранение (не дублируя уже имеющиеся). */
export function addWound(b: UnitBase, heavy: boolean): Wound | null {
  const have = b.wounds ?? (b.wounds = []);
  const pool = (heavy ? HEAVY : LIGHT).filter((id) => !have.includes(id));
  if (!pool.length) return null;
  const id = pick(pool);
  have.push(id);
  b.hp = Math.min(b.hp, effMaxHp(b));
  return WOUNDS[id];
}

// ------------------------------------------------------------ запасы

/** Лучший лекарь отряда (бонус Медицины) — он перевязывает и оперирует. */
export function bestHealer(): { name: string; bonus: number } {
  let best = { name: 'никто', bonus: -1 };
  for (const s of G.squad) if (s.med != null && s.med > best.bonus) best = { name: s.name, bonus: s.med };
  return best.bonus < 0 ? { name: 'без лекаря', bonus: 0 } : best;
}
export const bandageAmount = (medBonus: number) => 3 + Math.max(0, medBonus);
export const medkitAmount = (medBonus: number) => 6 + Math.max(0, medBonus);

// ------------------------------------------------------------ лечение вне боя
export function bandage(b: UnitBase): string | null {
  if (G.supplies.bandage <= 0) return 'Бинты кончились.';
  const max = effMaxHp(b);
  if (b.hp >= max) return `${b.name} не нуждается в перевязке.`;
  G.supplies.bandage--;
  const healer = bestHealer();
  const h = Math.min(bandageAmount(healer.bonus), max - b.hp);
  b.hp += h;
  return `${healer.name} перевязывает: ${b.name} +${h} ОЗ.`;
}

/** Аптечка вне боя: больше ОЗ и снимает одно лёгкое ранение. */
export function useMedkit(b: UnitBase): string | null {
  if (G.supplies.medkit <= 0) return 'Аптечек нет.';
  const light = woundsOf(b).filter((w) => !w.heavy);
  const max = effMaxHp(b);
  if (b.hp >= max && !light.length) return `${b.name} не нуждается в аптечке.`;
  G.supplies.medkit--;
  const healer = bestHealer();
  const h = Math.min(medkitAmount(healer.bonus), max - b.hp);
  b.hp += h;
  let txt = `${healer.name} открывает аптечку: ${b.name} +${h} ОЗ.`;
  if (light.length) { b.wounds = (b.wounds ?? []).filter((id) => id !== light[0].id); txt += ` «${light[0].name}» обработана.`; }
  return txt;
}

/** Привал: половина недостающих ОЗ, лёгкие раны заживают. */
export function rest(): string {
  if (G.supplies.ration <= 0) return 'Нет пайков — на голодный желудок раны не заживают.';
  G.supplies.ration--;
  G.clock += 8; // привал занимает ночь
  const healed: string[] = [];
  for (const b of G.squad) {
    const light = woundsOf(b).filter((w) => !w.heavy);
    b.wounds = (b.wounds ?? []).filter((id) => WOUNDS[id].heavy);
    healed.push(...light.map((w) => `${b.name}: «${w.name}»`));
    const max = effMaxHp(b);
    b.hp = Math.min(max, b.hp + Math.ceil((max - b.hp) / 2));
  }
  return 'Отряд разбивает привал. Силы частично восстановлены.' + (healed.length ? ` Зажило: ${healed.join(', ')}.` : '');
}

/** Операция: d20 + Медицина лекаря против 13. Успех — тяжёлая рана становится «швами». */
export function surgery(b: UnitBase, woundId: string): { text: string; roll?: CheckResult } {
  if (!hasTool('surgerykit')) return { text: 'Без хирургического набора оперировать нельзя.' };
  if (G.supplies.antiseptic <= 0) return { text: 'Нет антисептика для операции.' };
  G.supplies.antiseptic--;
  const healer = bestHealer();
  healer.bonus += gearBonus('medicine');
  const r = check(healer.bonus, 13);
  const w = WOUNDS[woundId];
  const rollTxt = `d20 (${r.roll}) ${healer.bonus >= 0 ? '+' : '−'} ${Math.abs(healer.bonus)} = ${r.total} против 13`;
  if (r.success) {
    b.wounds = (b.wounds ?? []).filter((id) => id !== woundId);
    if (!b.wounds.includes('stitches')) b.wounds.push('stitches');
    b.hp = Math.min(b.hp, effMaxHp(b));
    return { text: `${healer.name} оперирует: «${w.name}» вылечена, остались свежие швы. [${rollTxt}]`, roll: r };
  }
  // тяжёлый провал (на 5 и больше) при ране конечности — спасти её не удаётся: ампутация
  const limb: Limb | null = woundId === 'bullet' ? 'armR' : woundId === 'thigh' ? (Math.random() < 0.5 ? 'legR' : 'legL') : woundId === 'eye' ? (Math.random() < 0.5 ? 'eyeR' : 'eyeL') : null;
  if (limb && (r.fumble || r.total <= 8) && !b.limbs?.[limb]) {
    b.wounds = (b.wounds ?? []).filter((id) => id !== woundId);
    loseLimb(b, limb);
    if (!b.wounds.includes('stitches')) b.wounds.push('stitches');
    b.hp = Math.max(1, Math.min(b.hp - 2, effMaxHp(b)));
    const eye = limb.startsWith('eye');
    return { text: `Операция не удалась: ${eye ? 'глаз не спасти' : 'конечность не спасти, приходится ампутировать'} — ${LIMB_NAMES[limb].toLowerCase()} ${eye ? 'утрачен' : 'утрачена'} навсегда. Протез поставят в клинике Среднего города форта. [${rollTxt}]`, roll: r };
  }
  b.hp = Math.max(1, b.hp - 2);
  return { text: `Операция не удалась: «${w.name}» осталась, ${b.name} теряет 2 ОЗ. [${rollTxt}]`, roll: r };
}
