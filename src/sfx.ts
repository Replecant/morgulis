// ============================================================
//  Звуки автора (не сгенерированные): гром в бурю.
//  Отдельная громкость в меню паузы, запоминается.
// ============================================================
import thunderUrl from './assets/thunder.mp3';

let VOL = 0.6, on = true;
try {
  const v = localStorage.getItem('morgulis.sfx'); if (v !== null && !isNaN(+v)) VOL = Math.max(0, Math.min(1, +v));
  on = localStorage.getItem('morgulis.sfxOn') !== 'off';
} catch { /* хранилище недоступно */ }
let unlocked = false;
window.addEventListener('pointerdown', () => (unlocked = true), { once: true });
window.addEventListener('keydown', () => (unlocked = true), { once: true });

const thunder = new Audio(thunderUrl); thunder.preload = 'auto';

export const Sfx = {
  get volume() { return VOL; },
  get on() { return on; },
  setVolume(v: number) { VOL = Math.max(0, Math.min(1, v)); try { localStorage.setItem('morgulis.sfx', String(VOL)); } catch { /* ничего */ } },
  setOn(v: boolean) { on = v; try { localStorage.setItem('morgulis.sfxOn', v ? 'on' : 'off'); } catch { /* ничего */ } },
  /** Раскат грома: громкость зависит от «расстояния» (0.4–1), чуть разная высота. */
  thunder(power = 1) {
    if (!on || !unlocked || VOL <= 0) return;
    const a = thunder.cloneNode() as HTMLAudioElement;
    a.volume = Math.min(1, VOL * power);
    a.playbackRate = 0.85 + Math.random() * 0.3;
    a.play().catch(() => {});
  },
};
