// ============================================================
//  Музыка автора. Сгенерированных звуков в игре нет — только
//  треки, которые даёт автор.
//  · Мирные темы идут по очереди по кругу — в меню, на карте,
//    в деревнях и городе; в бою стихают и потом продолжаются
//    с того же места.
//  · Боевая тема играет в бою (по кругу), каждый бой — с начала.
//  Переходы плавные. Выключить/включить — в меню паузы (Esc), выбор запоминается.
// ============================================================
import theme1 from './assets/theme-1.mp3';
import theme2 from './assets/theme-2.mp3';
import battle1 from './assets/battle-1.mp3';

const FADE = 1.2; // время затухания (с)
let VOL = 0.55;   // громкость музыки 0..1 (настраивается в меню паузы)

/** Дорожка: плейлист по кругу с плавной громкостью. */
class Lane {
  cur = 0;
  a: HTMLAudioElement;
  playing = false;
  constructor(private list: string[]) {
    this.a = this.make(0);
  }
  private make(vol: number) {
    const a = new Audio(this.list[this.cur]);
    a.preload = 'auto'; a.volume = vol;
    a.onended = () => this.next();
    if (this.list.length === 1) a.loop = true;
    return a;
  }
  next() {
    this.cur = (this.cur + 1) % this.list.length;
    const vol = this.a.volume;
    this.a.onended = null;
    this.a = this.make(vol);
    if (this.playing) this.a.play().catch(() => {});
  }
  /** Плавно к нужной громкости; на нуле — пауза. restart — начать трек заново, если дорожка молчала. */
  update(dt: number, want: boolean, restart = false) {
    const a = this.a;
    if (want && a.paused) {
      if (restart && a.volume === 0) { if (this.cur !== 0) { this.cur = this.list.length - 1; this.next(); } else a.currentTime = 0; }
      this.a.play().catch(() => {});
    }
    this.playing = want;
    const target = want ? VOL : 0, step = (VOL / FADE) * dt, b = this.a;
    b.volume = Math.max(0, Math.min(VOL, b.volume + Math.sign(target - b.volume) * Math.min(step, Math.abs(target - b.volume))));
    if (!want && b.volume === 0 && !b.paused) b.pause();
  }
  setVol() { if (!this.a.paused && this.playing) this.a.volume = VOL; }
  state() { return { track: this.cur + 1, paused: this.a.paused, volume: +this.a.volume.toFixed(2), time: +this.a.currentTime.toFixed(1) }; }
}

const peace = new Lane([theme1, theme2]);
const battle = new Lane([battle1]);

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
  /** следующий мирный трек (для отладки) */
  skip() { peace.next(); },
  /** для отладки: состояние дорожек */
  state() { return { ...peace.state(), battle: battle.state(), muted, unlocked }; },
  get muted() { return muted; },
  get volume() { return VOL; },
  /** Громкость 0..1: применяется сразу и запоминается. */
  setVolume(v: number) {
    VOL = Math.max(0, Math.min(1, v));
    peace.setVol(); battle.setVol();
    try { localStorage.setItem('morgulis.volume', String(VOL)); } catch { /* ничего */ }
  },
  setMuted(m: boolean) { if (m !== muted) this.toggle(); },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('morgulis.music', muted ? 'off' : 'on'); } catch { /* ничего */ }
    return muted;
  },
  /** Каждый кадр: inBattle — играет боевая тема, иначе мирные. */
  update(dt: number, inBattle: boolean) {
    const on = !muted && unlocked;
    peace.update(dt, on && !inBattle);
    battle.update(dt, on && inBattle, true);
  },
};
