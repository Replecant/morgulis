// ============================================================
//  Музыка автора. Сгенерированных звуков в игре нет — только
//  треки, которые даёт автор. Тема карты мира играет, пока
//  отряд на глобальной карте, и плавно стихает в деревнях и боях.
//  M — выключить/включить (выбор запоминается).
// ============================================================
import worldTheme from './assets/world-theme.mp3';

const FADE = 1.2; // время затухания (с)
let VOL = 0.55;   // громкость музыки 0..1 (настраивается в меню паузы)
const track = new Audio(worldTheme);
track.loop = true; track.preload = 'auto'; track.volume = 0;

let muted = false;
try {
  muted = localStorage.getItem('morgulis.music') === 'off';
  const v = localStorage.getItem('morgulis.volume');
  if (v !== null && !isNaN(+v)) VOL = Math.max(0, Math.min(1, +v));
} catch { /* хранилище недоступно */ }
let unlocked = false; // браузер разрешает звук только после действия игрока

const unlock = () => { unlocked = true; };
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

export const Music = {
  /** для отладки: состояние трека */
  state() { return { paused: track.paused, volume: +track.volume.toFixed(2), time: +track.currentTime.toFixed(1), muted, unlocked }; },
  get muted() { return muted; },
  get volume() { return VOL; },
  /** Громкость 0..1: применяется сразу и запоминается. */
  setVolume(v: number) {
    VOL = Math.max(0, Math.min(1, v));
    if (!track.paused) track.volume = VOL;
    try { localStorage.setItem('morgulis.volume', String(VOL)); } catch { /* ничего */ }
  },
  setMuted(m: boolean) { if (m !== muted) this.toggle(); },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('morgulis.music', muted ? 'off' : 'on'); } catch { /* ничего */ }
    return muted;
  },
  /** Вызывается каждый кадр: на карте мира музыка нарастает, вне её — стихает и встаёт на паузу. */
  update(dt: number, onWorld: boolean) {
    const want = onWorld && !muted && unlocked;
    if (want && track.paused) track.play().catch(() => {});
    const target = want ? VOL : 0;
    const step = (VOL / FADE) * dt;
    track.volume = Math.max(0, Math.min(VOL, track.volume + Math.sign(target - track.volume) * Math.min(step, Math.abs(target - track.volume))));
    if (!want && track.volume === 0 && !track.paused) track.pause();
  },
};
