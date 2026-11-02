// ============================================================
//  Музыка автора. Сгенерированных звуков в игре нет — только
//  треки, которые даёт автор. Тема карты мира играет, пока
//  отряд на глобальной карте, и плавно стихает в деревнях и боях.
//  M — выключить/включить (выбор запоминается).
// ============================================================
import worldTheme from './assets/world-theme.mp3';

const VOL = 0.55, FADE = 1.2; // громкость и время затухания (с)
const track = new Audio(worldTheme);
track.loop = true; track.preload = 'auto'; track.volume = 0;

let muted = false;
try { muted = localStorage.getItem('morgulis.music') === 'off'; } catch { /* хранилище недоступно */ }
let unlocked = false; // браузер разрешает звук только после действия игрока

const unlock = () => { unlocked = true; };
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

export const Music = {
  /** для отладки: состояние трека */
  state() { return { paused: track.paused, volume: +track.volume.toFixed(2), time: +track.currentTime.toFixed(1), muted, unlocked }; },
  get muted() { return muted; },
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
