import { makeSquad, UnitBase } from './data';
import { Character, newCharacter } from './rules';
import { START_STASH } from './items';

export type Mode = 'title' | 'create' | 'explore' | 'combat' | 'end';

export const G = {
  mode: 'title' as Mode,
  flags: {} as Record<string, boolean | undefined>,
  pc: null as Character | null,
  squad: [] as UnitBase[],
  supplies: newSupplies(),
  stash: [] as string[],   // общий обоз отряда (id предметов)
  time: 0,
  mouse: { x: 0, y: 0 },
  keys: new Set<string>(),
};


export interface Supplies { bandages: number; medicine: number; rations: number }
export function newSupplies(): Supplies { return { bandages: 4, medicine: 1, rations: 1 }; }

export function resetGame(pc: Character = newCharacter()) {
  G.flags = {};
  G.supplies = newSupplies();
  G.stash = [...START_STASH];
  G.pc = pc;
  G.squad = makeSquad(pc);
}

export function objectiveText(): string {
  const f = G.flags;
  if (f.won) return 'Эшфорд освобождён. Конец пролога.';
  if (f.battle1Won) return 'Войдите в красильню Хартвелла и найдите «Пастыря».';
  if (f.heardPastor) return 'Осмотрите красильню Хартвелла на северо-востоке. Жители могут знать больше.';
  return 'Найдите старосту Эшфорда.';
}
