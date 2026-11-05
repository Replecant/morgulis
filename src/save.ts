// ============================================================
//  Сохранения: ручной слот (пауза, F5) и автосохранение
//  (вход в сцену и выход на карту, смена суток). Всё в localStorage.
//  Загрузка — из паузы, F9, главного меню и экрана смерти.
// ============================================================
import { G } from './state';
import { World } from './worldmap';
import { Explore } from './explore';
import { Weather } from './weather';
import { getStock, setStock } from './trade';

export type Slot = 'manual' | 'auto';
const KEY: Record<Slot, string> = { manual: 'morgulis.save.manual', auto: 'morgulis.save.auto' };
const VER = 1;

export interface SaveMeta { when: number; clock: number; name: string; place: string }
export interface SaveData {
  v: number; meta: SaveMeta;
  g: Pick<typeof G, 'flags' | 'pc' | 'squad' | 'supplies' | 'money' | 'stash' | 'known' | 'checkLock' | 'clock'>;
  mode: 'world' | 'explore'; scene: string; at: { x: number; y: number } | null;
  party: { x: number; y: number };
  world: Record<string, unknown>;
  weather: { kind: string; until: number; locked: boolean };
  shops: Record<string, Record<string, number>>;
}

/** Состояние, которое меняется во время игры и должно пережить перезагрузку. */
const WORLD_KEYS = ['bands', 'hungry', 'morlocks', 'trafficClock', 'demons', 'dead', 'dsq', 'loyal', 'clouds', 'lastDay', 'inGas', 'gasDose', 'filterUse'] as const;

/** Можно ли сохраниться прямо сейчас (не в бою, не в диалоге, игра идёт). */
export const canSave = () => (G.mode === 'world' || G.mode === 'explore') && !!G.pc;

function build(): SaveData {
  const W = World as unknown as Record<string, unknown>;
  const world: Record<string, unknown> = {};
  for (const k of WORLD_KEYS) world[k] = W[k];
  world.patrols = World.patrols.map((p) => ({ s: p.s, dir: p.dir, wait: p.wait }));
  return {
    v: VER,
    meta: { when: Date.now(), clock: G.clock, name: G.squad[0]?.name ?? '', place: G.location.replace(/^У места: /, '') },
    g: { flags: G.flags, pc: G.pc, squad: G.squad, supplies: G.supplies, money: G.money, stash: G.stash, known: G.known, checkLock: G.checkLock, clock: G.clock },
    mode: G.mode === 'explore' ? 'explore' : 'world',
    scene: G.mode === 'explore' ? Explore.scene : '',
    at: G.mode === 'explore' ? { x: Math.round(Explore.player.x), y: Math.round(Explore.player.y) } : null,
    party: { x: World.party.x, y: World.party.y },
    world,
    weather: { kind: Weather.kind, until: Weather.until, locked: Weather.locked },
    shops: getStock(),
  };
}

let lastAuto = 0;
export const Save = {
  /** Записать слот. false — если сейчас сохраняться нельзя или хранилище недоступно. */
  write(slot: Slot): boolean {
    if (!canSave()) return false;
    try { localStorage.setItem(KEY[slot], JSON.stringify(build())); return true; } catch { return false; }
  },
  /** Автосохранение — не чаще раза в 5 секунд. */
  auto() { const now = performance.now(); if (now - lastAuto < 5000) return; if (this.write('auto')) lastAuto = now; },
  read(slot: Slot): SaveData | null {
    try { const d = JSON.parse(localStorage.getItem(KEY[slot]) ?? 'null') as SaveData | null; return d && d.v === VER ? d : null; } catch { return null; }
  },
  meta(slot: Slot) { return this.read(slot)?.meta ?? null; },
  /** Самое свежее из двух слотов. */
  latest(): Slot | null {
    const m = this.meta('manual'), a = this.meta('auto');
    if (!m && !a) return null;
    return !a || (m && m.when >= a.when) ? 'manual' : 'auto';
  },
  /** Вернуть в мир то, что сохранено (вызывается после World.init и прочей подготовки). */
  applyWorld(d: SaveData) {
    const W = World as unknown as Record<string, unknown>;
    for (const k of WORLD_KEYS) if (d.world[k] !== undefined) W[k] = d.world[k];
    const pts = (d.world.patrols ?? []) as { s: number; dir: 1 | -1; wait: number }[];
    World.patrols.forEach((p, i) => { if (pts[i]) Object.assign(p, pts[i]); });
    World.party.x = World.party.tx = d.party.x; World.party.y = World.party.ty = d.party.y; World.party.moving = false;
    Object.assign(Weather, d.weather);
    setStock(d.shops);
  },
};

/** «День 3, 14:00 · Эшфорд · Э. Грэйсон» — для кнопок загрузки. */
export function metaText(m: SaveMeta) {
  const d = Math.floor(m.clock / 24) + 1, h = Math.floor(m.clock % 24);
  return `день ${d}, ${String(h).padStart(2, '0')}:00${m.place ? ' · ' + m.place : ''} · ${m.name}`;
}
