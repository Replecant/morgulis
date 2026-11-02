// ============================================================
//  Музыка автора. Сгенерированных звуков в игре нет — только
//  треки, которые даёт автор. Треки идут по очереди по кругу
//  везде — в меню, на карте, в деревнях и городе, — кроме боя:
//  там музыка плавно стихает и потом продолжается с того же места.
//  M — выключить/включить (выбор запоминается).
// ============================================================
import theme1 from './assets/theme-1.mp3';
import theme2 from './assets/theme-2.mp3';

const FADE = 1.2; // время затухания (с)
let VOL = 0.55;   // громкость музыки 0..1 (настраивается в меню паузы)
const LIST = [theme1, theme2];
let cur = 0;
let track = new Audio(LIST[cur]);
track.preload = 'auto'; track.volume = 0;
/** Трек закончился — следующий по кругу. */
function next() {
  cur = (cur + 1) % LIST.length;
  const vol = track.volume;
  track.onended = null;
  track = new Audio(LIST[cur]);
  track.preload = 'auto'; track.volume = vol; track.onended = next;
  if (playing) track.play().catch(() => {});
}
track.onended = next;
let playing = false;

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
  /** следующий трек (для отладки) */
  skip() { next(); },
  /** для отладки: состояние трека */
  state() { return { track: cur + 1, paused: track.paused, volume: +track.volume.toFixed(2), time: +track.currentTime.toFixed(1), muted, unlocked }; },
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
  /** Вызывается каждый кадр: где музыка разрешена — нарастает, иначе (бой) — стихает и встаёт на паузу. */
  update(dt: number, allowed: boolean) {
    const want = allowed && !muted && unlocked;
    if (want && track.paused) track.play().catch(() => {});
    playing = want;
    const target = want ? VOL : 0;
    const step = (VOL / FADE) * dt;
    track.volume = Math.max(0, Math.min(VOL, track.volume + Math.sign(target - track.volume) * Math.min(step, Math.abs(target - track.volume))));
    if (!want && track.volume === 0 && !track.paused) track.pause();
  },
};
