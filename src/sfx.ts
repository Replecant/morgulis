// ============================================================
//  Звуки автора (не сгенерированные): гром в бурю, выстрелы ружья/винтовки и пистолета/револьвера.
//  Отдельная громкость в меню паузы, запоминается.
// ============================================================
import thunderUrl from './assets/thunder.mp3';
import shotRifleUrl from './assets/shot-rifle.mp3';
import shotPistolUrl from './assets/shot-pistol.mp3';

let VOL = 0.6, on = true;
try {
  const v = localStorage.getItem('morgulis.sfx'); if (v !== null && !isNaN(+v)) VOL = Math.max(0, Math.min(1, +v));
  on = localStorage.getItem('morgulis.sfxOn') !== 'off';
} catch { /* хранилище недоступно */ }
let unlocked = false;
window.addEventListener('pointerdown', () => (unlocked = true), { once: true });
window.addEventListener('keydown', () => (unlocked = true), { once: true });

const thunder = new Audio(thunderUrl); thunder.preload = 'auto';
const shotRifle = new Audio(shotRifleUrl); shotRifle.preload = 'auto';
const shotPistol = new Audio(shotPistolUrl); shotPistol.preload = 'auto';
const PISTOLS = new Set(['revolver', 'autopistol']);
/** Оружие, которому подходит звук выстрела ружья: длинноствольное. */
const RIFLES = new Set(['rifle', 'huntrifle', 'carbine', 'musket', 'oldrifle', 'exprifle', 'mg']);

export const Sfx = {
  get volume() { return VOL; },
  get on() { return on; },
  setVolume(v: number) { VOL = Math.max(0, Math.min(1, v)); try { localStorage.setItem('morgulis.sfx', String(VOL)); } catch { /* ничего */ } },
  setOn(v: boolean) { on = v; try { localStorage.setItem('morgulis.sfxOn', v ? 'on' : 'off'); } catch { /* ничего */ } },
  /** Выстрел (в бою): ружья и винтовки, пистолеты и револьверы. Остальное оружие пока без звука. */
  shot(weapon: string) {
    const src = RIFLES.has(weapon) ? shotRifle : PISTOLS.has(weapon) ? shotPistol : null;
    if (!on || !unlocked || VOL <= 0 || !src) return;
    const a = src.cloneNode() as HTMLAudioElement;
    a.volume = Math.min(1, VOL * 0.9);
    a.playbackRate = 0.93 + Math.random() * 0.14; // чуть разные выстрелы
    a.play().catch(() => {});
  },
  /** Раскат грома: громкость зависит от «расстояния» (0.4–1), чуть разная высота. */
  thunder(power = 1) {
    if (!on || !unlocked || VOL <= 0) return;
    const a = thunder.cloneNode() as HTMLAudioElement;
    a.volume = Math.min(1, VOL * power);
    a.playbackRate = 0.85 + Math.random() * 0.3;
    a.play().catch(() => {});
  },
};
