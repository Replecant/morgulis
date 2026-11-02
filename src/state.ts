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
  location: '',            // название места, где стоит игрок
  time: 0,
  mouse: { x: 0, y: 0 },
  keys: new Set<string>(),
};


export interface Supplies { bandages: number; medicine: number; rations: number }
export function newSupplies(): Supplies { return { bandages: 3, medicine: 0, rations: 2 }; }

export function resetGame(pc: Character = newCharacter()) {
  G.flags = {};
  G.supplies = newSupplies();
  G.stash = [...START_STASH];
  G.pc = pc;
  G.squad = makeSquad(pc);
}

/** Журнал: активные и выполненные задания региона. */
export function journal(): { text: string; done: boolean }[] {
  const f = G.flags, out: { text: string; done: boolean }[] = [];
  if (f.valveTaken) out.push({ text: f.valveDone ? 'Клапан для Иды Кроу' : f.hasValve ? 'Отнести клапан Иде Кроу (Эшфорд)' : 'Найти клапан на старой насосной (юг Эшфорда)', done: !!f.valveDone });
  if (f.beetleTaken) out.push({ text: f.beetleDone ? 'Жучиха Мэг вернулась в Ричморд' : 'Найти сбежавшую жучиху Мэг (к западу от Ричморда, у костей)', done: !!f.beetleDone });
  if (f.heardScav) out.push({ text: f.scavDone ? 'Разрушенный пост свободен' : 'Мародёры у разрушенного поста (между трактом и путями)', done: !!f.scavDone });
  return out;
}
