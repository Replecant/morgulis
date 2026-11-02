import { makeSquad, UnitBase } from './data';

export type Mode = 'title' | 'explore' | 'combat' | 'end';

export const G = {
  mode: 'title' as Mode,
  flags: {} as Record<string, boolean | undefined>,
  squad: makeSquad() as UnitBase[],
  time: 0,
  preBattle: [] as number[],
  mouse: { x: 0, y: 0 },
  keys: new Set<string>(),
};

export function healSquad() { G.squad.forEach((s) => (s.hp = s.maxHp)); }
export const squadHurt = () => G.squad.some((s) => s.hp < s.maxHp);

export function resetGame() {
  G.flags = {};
  G.squad = makeSquad();
}

export function objectiveText(): string {
  const f = G.flags;
  if (f.won) return 'Эшфорд освобождён. Конец пролога.';
  if (f.battle1Won) return 'Войдите в красильню Хартвелла и найдите «Пастыря».';
  if (f.heardPastor) return 'Осмотрите красильню Хартвелла на северо-востоке. Жители могут знать больше.';
  return 'Найдите старосту Эшфорда.';
}
