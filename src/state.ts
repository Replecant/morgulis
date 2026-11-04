import { makeSquad, UnitBase } from './data';
import { Character, newCharacter } from './rules';
import { START_STASH, PROF_START, CONS_ORDER, ConsId } from './items';
import type { SkillKey } from './rules';
import { limbSkill } from './prosthetics';

export type Mode = 'title' | 'create' | 'world' | 'explore' | 'combat' | 'end';

export const G = {
  mode: 'title' as Mode,
  flags: {} as Record<string, boolean | undefined>,
  pc: null as Character | null,
  squad: [] as UnitBase[],
  supplies: newSupplies(),
  money: 0,                // шиллинги
  stash: [] as string[],   // общий обоз отряда (id предметов)
  known: [] as string[],   // изученные заклинания (occult.ts)
  checkLock: {} as Record<string, number>, // проваленные проверки: до какого часа их нельзя повторить
  location: '',            // название места, где стоит игрок
  clock: 8,                // игровое время в часах с начала (день 1, 08:00)
  time: 0,
  mouse: { x: 0, y: 0 },
  keys: new Set<string>(),
};


export type Supplies = Record<ConsId, number>;
export function newSupplies(): Supplies {
  const s = {} as Supplies;
  for (const id of CONS_ORDER) s[id] = 0;
  s.ration = 2;
  return s;
}

export function resetGame(pc: Character = newCharacter()) {
  G.known = [];
  G.flags = {};
  G.checkLock = {};
  G.clock = 8;
  G.supplies = newSupplies();
  G.stash = [...START_STASH];
  G.pc = pc;
  const st = PROF_START[pc.prof];
  G.money = st.money;
  G.stash.push(...st.tools);
  for (const [k, v] of Object.entries(st.cons)) G.supplies[k as ConsId] += v!;
  G.squad = makeSquad(pc);
}

/** Журнал: активные и выполненные задания региона. */
export function journal(): { text: string; done: boolean }[] {
  const f = G.flags, out: { text: string; done: boolean }[] = [];
  void f; // заданий пока нет — тестовые убраны
  return out;
}

/** Есть ли у отряда предмет (спецснаряжение лежит в обозе). */
export const hasTool = (id: string) => G.stash.includes(id) || G.squad.some((b) => Object.values(b.equip ?? {}).includes(id));

/** Есть чем чинить и разбирать механизмы: большой или компактный набор инструментов. */
export const hasRepairKit = () => hasTool('tools') || hasTool('ctools');

/** Александр в отряде. */
export const alexIn = () => G.squad.some((b) => b.id === 'alex');
export const arthurIn = () => G.squad.some((b) => b.id === 'arthur');
export const ivyIn = () => G.squad.some((b) => b.id === 'ivy');
export const ferglowIn = () => G.squad.some((b) => b.id === 'ferglow');
/** Спутник, которого Ферглоу «улучшил» ритуалом в пещере — теперь мертвец. */
export const undeadCompanion = (id: string) => !!G.flags['undead_' + id];
/** Ручная крыса в слоте оберега у кого-то из отряда — чует мертвецов и газ. */
export const ratIn = () => G.squad.some((b) => (b.equip?.charm ?? '').split('~')[0] === 'rat');
/** Где Александр должен побывать: крупные форты и край мира. */
export const ALEX_SIGHTS: [string, string][] = [['svoboda', 'форт Свобода'], ['bfort', 'форт Леди Харрингтон'], ['wfort', 'форт Винферда'], ['fort', 'форт Олдриджа'], ['deadend', 'край Траншейного моря']];
export const alexSawAll = () => ALEX_SIGHTS.every(([k]) => G.flags['alexSaw_' + k]);

/** Фонарь отряда: 0 — нет, 1 — масляный, 2 — электрический. */
export const lampLevel = () => (hasTool('elamp') ? 2 : hasTool('oillamp') ? 1 : 0);

/** Прибавка к проверке навыка героя от утраченных конечностей и протезов. Спецснаряжение бонусов не даёт — только доступ к действиям. */
export function gearBonus(skill: SkillKey): number {
  return limbSkill(G.squad[0], skill);
}
