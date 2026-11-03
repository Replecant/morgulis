// ============================================================
//  Главное меню, книга правил, «Об игре»
// ============================================================
import { Book, h, Spread } from './book';
import { vignette, drawDeadTree } from './gfx';
import { PixelView, pixelize } from './px';
import { FRAMES, frameReady } from './frames';
import { ATTRS, ATTR_ORDER, PROFESSIONS, PROF_ORDER, DC, DC_NAMES, LEVEL_XP, mastery, ProfId } from './rules';
import { seeded, TAU } from './util';
import { LANG, setLang, type Lang } from './i18n';

const W = 960, H = 640;
const STAR = { x: 480, y: 177 }; // за розеткой готической арки меню

// ------------------------------------------------------------ фон
let silhouettes: HTMLCanvasElement | null = null;

function buildSilhouettes() {
  silhouettes = pixelize(W / 2, H / 2, (c) => { c.scale(0.5, 0.5); drawSilhouettes(c); }, 2);
}
function drawSilhouettes(c: CanvasRenderingContext2D) {
  const r = seeded(13);
  // дальние холмы
  c.fillStyle = '#121810';
  c.beginPath(); c.moveTo(0, H);
  for (let x = 0; x <= W; x += 30) c.lineTo(x, 470 + Math.sin(x * 0.01) * 14 + r() * 8);
  c.lineTo(W, H); c.fill();
  // собор слева
  c.fillStyle = '#0a0d09';
  const base = 520;
  c.fillRect(90, 380, 220, base - 380);
  for (const [x, w, top] of [[90, 46, 250], [264, 46, 230]] as [number, number, number][]) {
    c.fillRect(x, top, w, base - top);
    c.beginPath(); c.moveTo(x - 4, top); c.lineTo(x + w / 2, top - 120); c.lineTo(x + w + 4, top); c.fill();
    for (let k = 0; k < 4; k++) { // пинакли
      const px = x + (k % 2 ? w : 0), py = top - 6 + Math.floor(k / 2) * 60;
      c.beginPath(); c.moveTo(px - 4, py); c.lineTo(px, py - 22); c.lineTo(px + 4, py); c.fill();
    }
  }
  c.beginPath(); c.moveTo(136, 380); c.lineTo(200, 300); c.lineTo(264, 380); c.fill();
  // светящиеся стрельчатые окна собора
  c.fillStyle = 'rgba(120,170,90,0.35)';
  for (const [x, y] of [[113, 320], [287, 300], [160, 420], [200, 410], [240, 420]]) {
    c.beginPath(); c.moveTo(x - 5, y + 22); c.lineTo(x - 5, y + 6); c.quadraticCurveTo(x, y - 6, x + 5, y + 6); c.lineTo(x + 5, y + 22); c.fill();
  }
  c.fillStyle = 'rgba(150,200,110,0.4)';
  c.beginPath(); c.arc(200, 350, 11, 0, TAU); c.fill();
  // фабрики и вышки справа
  c.fillStyle = '#0a0d09';
  c.fillRect(640, 420, 260, base - 420);
  for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(640 + i * 52, 420); c.lineTo(640 + i * 52 + 40, 392); c.lineTo(640 + i * 52 + 52, 420); c.fill(); }
  for (const [x, hgt] of [[680, 210], [760, 250], [850, 190]]) { c.fillRect(x, 420 - hgt, 18, hgt); c.fillRect(x - 3, 420 - hgt, 24, 8); }
  c.strokeStyle = '#0a0d09'; c.lineWidth = 2;
  for (const [x, hh] of [[560, 120], [930, 140]]) {
    const w = hh * 0.35;
    c.beginPath(); c.moveTo(x - w / 2, base); c.lineTo(x, base - hh); c.lineTo(x + w / 2, base);
    for (let i = 1; i < 6; i++) { const k = i / 6, yy = base - hh * k, hw = (w / 2) * (1 - k); c.moveTo(x - hw, yy); c.lineTo(x + hw, yy); c.lineTo(x - hw * 0.8, yy - hh / 6); }
    c.stroke();
  }
  c.fillStyle = 'rgba(200,170,90,0.35)';
  for (let i = 0; i < 9; i++) c.fillRect(650 + r() * 240, 440 + r() * 60, 3, 4);
  // передний план: земля, ограда кладбища, мёртвые деревья
  c.fillStyle = '#060805';
  c.beginPath(); c.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) c.lineTo(x, 540 + Math.sin(x * 0.02) * 8 + r() * 6);
  c.lineTo(W, H); c.fill();
  c.strokeStyle = '#060805'; c.lineWidth = 3;
  for (let x = 20; x < 330; x += 14) { c.beginPath(); c.moveTo(x, 548); c.lineTo(x, 515 + (x % 28 ? 6 : 0)); c.stroke(); }
  c.beginPath(); c.moveTo(14, 528); c.lineTo(330, 528); c.stroke();
  for (const [x, y] of [[360, 545], [395, 552], [610, 548]]) { c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 26); c.moveTo(x - 9, y - 18); c.lineTo(x + 9, y - 18); c.stroke(); }
  drawDeadTree(c, 930, 560, r, 3.2);
  drawDeadTree(c, 40, 560, r, 2.6);
}

const fog = Array.from({ length: 7 }, (_, i) => ({ x: i * 170, y: 470 + (i % 3) * 30, w: 260 + (i % 2) * 120, s: 6 + i * 1.3 }));

let view: PixelView | null = null;
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((q) => q / 16 - 0.5);
/** Фон меню: рисуется в половинном разрешении, цвета квантуются растром, вывод ×2 без сглаживания. */
const frame = FRAMES.menu;
let frameT0 = -1;

/** Заглавный экран: пиксельная рамка (скелеты-солдаты, шестерни, трубы) и падающий пепел. */
export function drawMenuBg(out: CanvasRenderingContext2D, t: number) {
  // пока рамка грузится — тёмный экран, без мелькания запасной сцены
  if (!frameReady('menu')) { out.fillStyle = '#060806'; out.fillRect(0, 0, W, H); return; }
  if (!frame.naturalWidth) { drawMenuScene(out, t); return; } // картинка не загрузилась
  if (frameT0 < 0) frameT0 = t;
  out.fillStyle = '#060806'; out.fillRect(0, 0, W, H);
  out.imageSmoothingEnabled = true; out.imageSmoothingQuality = 'high';
  out.globalAlpha = Math.min(1, (t - frameT0) / 0.5);              // плавное проявление
  out.drawImage(frame, 0, 0, W, H);
  out.globalAlpha = 1;
  // внутреннее поле рамки чуть «дышит» зеленоватым светом угасшей звезды
  const k = Math.min(1, (t - frameT0) / 1.5), p = 0.5 + Math.sin(t * 0.6) * 0.5;
  const g = out.createRadialGradient(480, 300, 20, 480, 320, 330);
  g.addColorStop(0, `rgba(120,170,90,${(0.06 + p * 0.03) * k})`); g.addColorStop(1, 'rgba(120,170,90,0)');
  out.fillStyle = g; out.fillRect(187, 128, 588, 384);
  // пепел — квадратики по 2 пикселя, как пиксели рамки
  out.fillStyle = 'rgba(190,200,170,0.5)';
  for (let i = 0; i < 46; i++) {
    const ax = ((i * 197.3 + t * (10 + (i % 5) * 4)) % (W + 40)) - 20, ay = ((i * 113.7 + t * (16 + (i % 3) * 6)) % (H + 40)) - 20;
    out.fillRect(Math.round((ax + Math.sin(t + i) * 6) / 2) * 2, Math.round(ay / 2) * 2, 2, 2);
  }
}

/** Запасной фон (пока картинка рамки грузится) — пиксельные силуэты собора и фабрик. */
function drawMenuScene(out: CanvasRenderingContext2D, t: number) {
  if (!silhouettes) buildSilhouettes();
  view ??= new PixelView(W / 2, H / 2);
  const c = view.c;
  c.save(); c.scale(0.5, 0.5);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#060a06'); g.addColorStop(0.55, '#16201a'); g.addColorStop(1, '#22301f');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // угасшая звезда — тусклая, зеленоватая, едва «дышит»
  const p = 1 + Math.sin(t * 0.5) * 0.03;
  const glow = c.createRadialGradient(STAR.x, STAR.y, 0, STAR.x, STAR.y, 330 * p);
  glow.addColorStop(0, 'rgba(170,225,120,0.38)'); glow.addColorStop(0.25, 'rgba(120,180,90,0.13)'); glow.addColorStop(1, 'rgba(80,120,60,0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, H);
  c.fillStyle = '#a9c989';
  c.beginPath(); c.arc(STAR.x, STAR.y, 46 * p, 0, TAU); c.fill();
  const inner = c.createRadialGradient(STAR.x + 6, STAR.y - 4, 4, STAR.x, STAR.y, 46 * p);
  inner.addColorStop(0, 'rgba(210,240,170,0.6)'); inner.addColorStop(1, 'rgba(60,90,45,0.55)');
  c.fillStyle = inner; c.beginPath(); c.arc(STAR.x, STAR.y, 46 * p, 0, TAU); c.fill();
  // облака
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 260 + t * (3 + i * 0.7)) % 1400) - 220;
    c.fillStyle = 'rgba(8,12,8,0.55)';
    c.beginPath(); c.ellipse(cx, 70 + i * 34, 230, 9 + (i % 3) * 4, 0, 0, TAU); c.fill();
  }
  c.drawImage(silhouettes!, 0, 0, W, H);
  for (const f of fog) {
    const x = ((f.x + t * f.s) % (W + 400)) - 200;
    const fg = c.createRadialGradient(x, f.y, 0, x, f.y, f.w);
    fg.addColorStop(0, 'rgba(110,130,100,0.12)'); fg.addColorStop(1, 'rgba(110,130,100,0)');
    c.fillStyle = fg; c.fillRect(x - f.w, f.y - f.w, f.w * 2, f.w * 2);
  }
  vignette(c, W, H);
  c.restore();
  // квантование с растром Байера: градиенты неба и тумана становятся пиксельными
  const w = W / 2, hh = H / 2, img = c.getImageData(0, 0, w, hh), d = img.data, step = 7;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, b = BAY[(y & 3) * 4 + (x & 3)] * step;
    d[i] = Math.round((d[i] + b) / step) * step; d[i + 1] = Math.round((d[i + 1] + b) / step) * step; d[i + 2] = Math.round((d[i + 2] + b) / step) * step;
  }
  c.putImageData(img, 0, 0);
  // пепел — по одному пикселю
  c.fillStyle = 'rgba(190,200,170,0.6)';
  for (let i = 0; i < 50; i++) {
    const ax = ((i * 97.3 + t * (5 + (i % 5) * 2)) % (w + 20)) - 10, ay = ((i * 53.7 + t * (8 + (i % 3) * 3)) % (hh + 20)) - 10;
    c.fillRect(Math.round(ax + Math.sin(t + i) * 3), Math.round(ay), 1, 1);
  }
  view.present(out, 0, 0, 2);
}

// ------------------------------------------------------------ меню

export interface MenuHandlers { onNew: () => void; onQuick: (prof: ProfId) => void; onRules: () => void; onAbout: () => void }

export function showMainMenu(host: HTMLElement, hd: MenuHandlers) {
  const item = (label: string, fn: () => void) => h('button', { class: 'mitem', onclick: fn }, h('span', { class: 'orn' }, '❦'), label, h('span', { class: 'orn r' }, '❦'));
  const arch = h('div', { class: 'arch' },
    h('div', { class: 'arch-content' },
      h('h1', { class: 'mtitle' }, 'Моргулис'),
      h('div', { class: 'msub' }, 'ролевая песочница'),
      h('div', { class: 'mrule' }, '✦'),
      h('nav', { class: 'mnav' },
        item('Новая игра', hd.onNew),
        item('Быстрый старт', () => {
          // список профессий вместо пунктов меню
          const nav = arch.querySelector('.mnav')!;
          nav.replaceChildren(
            h('div', { class: 'mquick' }, 'Готовый герой — выберите профессию:'),
            h('div', { class: 'mprofs' }, ...PROF_ORDER.map((id) =>
              h('button', { class: 'mprof', onclick: () => hd.onQuick(id) }, h('span', { class: 'emb' }, PROFESSIONS[id].emblem), PROFESSIONS[id].name))),
            item('‹ Назад', () => showMainMenu(host, hd)),
          );
        }),
        item('Правила', hd.onRules),
        item('Об игре', hd.onAbout)),
    ),
    h('div', { class: 'mlang' },
      ...(['ru', 'en'] as Lang[]).map((l) => h('button', { class: 'mlbtn' + (LANG === l ? ' on' : ''), onclick: () => { if (LANG !== l) setLang(l); } }, l === 'ru' ? 'Русский' : 'English'))),
    h('div', { class: 'mver' }, 'прототип · v0.2'),
  );
  host.replaceChildren(h('div', { class: 'menu' }, arch));
}

export function showAbout(host: HTMLElement, onBack: () => void) {
  host.replaceChildren(h('div', { class: 'menu' },
    h('div', { class: 'about' },
      h('h2', {}, 'Об игре'),
      h('p', {}, 'Моргулис — самостоятельный вымышленный мир. Его звезда почти перестала светить и стала тусклой и зеленоватой. Пакс-Империя рухнула, на её руинах делят власть остатки имперской армии и нефтяные бароны.'),
      h('p', {}, 'Это прототип ролевой песочницы: создание персонажа по d20-системе, регион с тремя деревнями и фортом Олдриджа — глобальная карта, исследование, диалоги, торговля за шиллинги и пошаговые тактические бои.'),
      h('p', { class: 'note' }, 'Управление: WASD / стрелки или клик — движение · E — говорить · I — снаряжение · Q — лечение · в бою: клик, 1–9, Tab, Enter.'),
      h('button', { class: 'mitem', onclick: onBack }, '‹ Назад'),
    )));
}

// ------------------------------------------------------------ книга правил
export function openRules(host: HTMLElement, onClose: () => void) {
  const P = (...t: (string | HTMLElement)[]) => h('p', {}, ...t);
  const spreads: Spread[] = [
    {
      title: 'Основа',
      left: () => h('div', {},
        h('div', { class: 'chapter' }, 'Глава I'), h('h1', {}, 'Основа'),
        h('p', { class: 'drop' }, 'Ролевая система Моргулиса — облегчённая d20 с духом старой школы: мало правил, быстрые проверки, опасный мир.'),
        h('p', { class: 'formula' }, 'd20 + черта + мастерство ≥ КС'),
        P('Мастерство добавляется, только если навык обучен. Натуральная 20 — всегда успех, натуральная 1 — всегда провал.'),
        h('div', { class: 'dcs' }, ...Object.values(DC).map((d) => h('span', {}, DC_NAMES[d], ' ', String(d)))),
      ),
      right: () => h('div', {},
        h('h3', {}, 'Черты'),
        ...ATTR_ORDER.map((k) => h('p', {}, h('b', {}, `${ATTRS[k].name} (${ATTRS[k].short}). `), ATTRS[k].desc)),
        h('p', { class: 'note' }, 'При создании персонажа черты лежат в пределах от −1 до +3.'),
      ),
    },
    {
      title: 'Профессии',
      left: () => h('div', {},
        h('div', { class: 'chapter' }, 'Глава II'), h('h1', {}, 'Профессии'),
        ...PROF_ORDER.slice(0, 3).map((id) => h('p', {}, h('b', {}, `${PROFESSIONS[id].emblem} ${PROFESSIONS[id].name}. `), PROFESSIONS[id].desc))),
      right: () => h('div', {},
        ...PROF_ORDER.slice(3).map((id) => h('p', {}, h('b', {}, `${PROFESSIONS[id].emblem} ${PROFESSIONS[id].name}. `), PROFESSIONS[id].desc)),
        h('p', { class: 'note' }, 'Позже профессии получат архетипы: например, солдат-огнемётчик или стрелок — охотник на вампиров.')),
    },
    {
      title: 'Рост',
      left: () => h('div', {},
        h('div', { class: 'chapter' }, 'Глава III'), h('h1', {}, 'Рост персонажа'),
        P('Десять уровней. С уровнем растут здоровье и мастерство, открываются таланты и специализации.'),
        h('table', { class: 'stats' }, h('tr', {}, h('td', {}, h('b', {}, 'Ур.')), h('td', {}, h('b', {}, 'Опыт')), h('td', {}, h('b', {}, 'Мастерство'))),
          ...LEVEL_XP.map((xp, i) => h('tr', {}, h('td', {}, i + 1), h('td', {}, xp), h('td', {}, `+${mastery(i + 1)}`)))),
      ),
      right: () => h('div', {},
        h('h3', {}, 'Здоровье и раны'),
        P('Здоровье (ОЗ) — запас сил до того, как вы упадёте. Броня не мешает попаданию, но поглощает часть урона.'),
        P('Магического исцеления нет. Раны заживают медленно: перевязка в бою, отдых, хирург.'),
      ),
    },
    {
      title: 'Бой',
      left: () => h('div', {},
        h('div', { class: 'chapter' }, 'Глава IV'), h('h1', {}, 'Бой'),
        P('Пошаговый, с групповой инициативой: сначала ходит весь отряд, потом все противники.'),
        P('За ход боец может переместиться и совершить одно основное действие — или потратить действие на второй переход.'),
        P('Атака: d20 + бонус атаки против Защиты цели. Половинное укрытие даёт цели +3 к Защите, полное — +5. Дальше оптимальной дистанции — штраф.'),
      ),
      right: () => h('div', {},
        h('h3', {}, 'Боевой кураж'),
        P('Шкала 0–3. Копится в схватке и тратится на отчаянные атаки, штыковые броски и рискованные манёвры.'),
        h('h3', {}, 'Оккультизм'),
        P('Четыре традиции: народное колдовство, демонология, астрология, руническая эзотерика. Магия ритуальна, медленна и опасна; шкала напряжения 0–6. Жреческой магии нет.'),
      ),
    },
  ];
  const book = new Book(host, spreads, { heading: 'Правила Моргулиса', onClose });
  book.maxReached = spreads.length - 1; // все главы открыты сразу
  book.render();
  return book;
}
