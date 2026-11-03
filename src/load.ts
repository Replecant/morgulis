// ============================================================
//  Вес обоза. Всё, что несёт отряд — надетое, обоз и расходники, —
//  весит; сколько отряд поднимет, зависит от Силы каждого бойца.
//  Перегруз замедляет на карте и сковывает в бою.
// ============================================================
import { G } from './state';
import type { UnitBase } from './data';
import { CONS_ORDER, CONS_WT, itemWt } from './items';
export { itemWt } from './items';

/** Сила бойца для переноски: у героя — характеристика, у спутников — своя. */
export const strOf = (b: UnitBase) => (b.id === 'pc' ? G.pc?.attrs.str ?? 0 : b.str ?? 0);
/** Сколько поднимет боец: 20 кг + 5 за каждое очко Силы (не меньше 10). */
export const carryOf = (b: UnitBase) => Math.max(10, 20 + 5 * strOf(b));
export const capacity = () => G.squad.reduce((s, b) => s + carryOf(b), 0);

/** Вся ноша отряда: надетое, обоз, расходники. */
export function load() {
  let w = 0;
  for (const b of G.squad) for (const id of Object.values(b.equip ?? {})) if (id) w += itemWt(id);
  for (const id of G.stash) w += itemWt(id);
  for (const id of CONS_ORDER) w += (G.supplies[id] ?? 0) * CONS_WT[id];
  return Math.round(w * 10) / 10;
}
/** 0 — норма, 1 — перегруз (до полутора), 2 — неподъёмно. */
export function overload() { const r = load() / Math.max(1, capacity()); return r <= 1 ? 0 : r <= 1.5 ? 1 : 2; }
/** Множитель скорости на карте. */
export const loadSpeedK = () => [1, 0.6, 0.3][overload()];
/** Штраф к перемещению в бою. */
export const loadMovePen = () => [0, 1, 2][overload()];
export const LOAD_NAME = ['', 'Перегруз', 'Неподъёмно'];
export const fmtKg = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');
