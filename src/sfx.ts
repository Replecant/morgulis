// ============================================================
//  Звуки автора (не сгенерированные): гром в бурю, выстрелы ружья/винтовки, пистолета/револьвера
//  и дробовика, удары тупым и режущим оружием.
//  Отдельная громкость в меню паузы, запоминается.
// ============================================================
import thunderUrl from './assets/thunder.mp3';
import shotRifleUrl from './assets/shot-rifle.mp3';
import shotPistolUrl from './assets/shot-pistol.mp3';
import shotShotgunUrl from './assets/shot-shotgun.mp3';
import hitBluntUrl from './assets/hit-blunt.mp3';
import hitCutUrl from './assets/hit-cut.mp3';

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
const shotShotgun = new Audio(shotShotgunUrl); shotShotgun.preload = 'auto';
const hitBlunt = new Audio(hitBluntUrl); hitBlunt.preload = 'auto';
const hitCut = new Audio(hitCutUrl); hitCut.preload = 'auto';
const PISTOLS = new Set(['revolver', 'autopistol']);
const SHOTGUNS = new Set(['shotgun2', 'pumpshot', 'sawnoff']);
/** Холодное оружие: тупое и режущее/колющее. */
const BLUNT = new Set(['hammer', 'wrench', 'trenchclub', 'fists', 'buttstock', 'cudgel']);
const CUT = new Set(['knife', 'saber', 'bayonet', 'rustbayonet', 'axe', 'rdagger', 'spade', 'pitchfork', 'claws', 'demonclaw']);
/** Оружие, которому подходит звук выстрела ружья: длинноствольное. */
const RIFLES = new Set(['rifle', 'huntrifle', 'carbine', 'musket', 'oldrifle', 'exprifle', 'mg']);

function play(src: HTMLAudioElement | null, k: number) {
  if (!on || !unlocked || VOL <= 0 || !src) return;
  const a = src.cloneNode() as HTMLAudioElement;
  a.volume = Math.min(1, VOL * k);
  a.playbackRate = 0.93 + Math.random() * 0.14; // чуть разные
  a.play().catch(() => {});
}

export const Sfx = {
  get volume() { return VOL; },
  get on() { return on; },
  setVolume(v: number) { VOL = Math.max(0, Math.min(1, v)); try { localStorage.setItem('morgulis.sfx', String(VOL)); } catch { /* ничего */ } },
  setOn(v: boolean) { on = v; try { localStorage.setItem('morgulis.sfxOn', v ? 'on' : 'off'); } catch { /* ничего */ } },
  /** Выстрел (в бою): ружья и винтовки, пистолеты и револьверы, дробовики и обрез. Остальное оружие пока без звука. */
  shot(weapon: string) {
    play(RIFLES.has(weapon) ? shotRifle : PISTOLS.has(weapon) ? shotPistol : SHOTGUNS.has(weapon) ? shotShotgun : null, 0.9);
  },
  /** Попадание холодным оружием: тупой удар или режущий. */
  hit(weapon: string) {
    play(BLUNT.has(weapon) ? hitBlunt : CUT.has(weapon) ? hitCut : null, 0.9);
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
