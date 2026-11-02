// ============================================================
//  Пиксельные персонажи 24×32: собираются из частей по стилю
//  (gfx.ts STYLES), с контуром, кадрами шага и позой падения.
// ============================================================
import { STYLES } from './gfx';
import { outline, shade, pixelize, prect, ppx, pline } from './px';

type Ctx = CanvasRenderingContext2D;
export const SW = 24, SH = 32;
const INK = '#0c0e0a';
const STEEL = '#8e928c', STEEL_L = '#cfd4ca', WOOD = '#5a4228', WOOD_D = '#3a2a18', BRASS = '#c8a050';

const cache = new Map<string, HTMLCanvasElement>();

/** Спрайт персонажа. frame: 0..3 — кадры шага (0 и 2 — стойка). */
export function charSprite(kind: string, frame = 0, dead = false, flash = false): HTMLCanvasElement {
  const key = `${kind}|${frame}|${dead}|${flash}`;
  let cv = cache.get(key);
  if (cv) return cv;
  let base = kind === 'imp' ? impSprite(frame) : kind === 'salamander' ? salamanderSprite(frame) : buildChar(kind, frame);
  if (flash) base = flashCopy(base);
  if (dead) base = rotate90(base);
  cache.set(key, base);
  return base;
}
/** Сбросить кэш (после смены внешности героя или снаряжения). */
export function clearSpriteCache(prefix?: string) {
  if (!prefix) { cache.clear(); return; }
  for (const k of [...cache.keys()]) if (k.startsWith(prefix + '|')) cache.delete(k);
}

export interface SpriteOpts { flip?: boolean; frame?: number; dead?: boolean; flash?: boolean; scale?: number; bob?: number; shadow?: boolean }
/** Нарисовать персонажа: (x, y) — точка между ступнями в пикселях холста c. */
export function drawSprite(c: Ctx, kind: string, x: number, y: number, o: SpriteOpts = {}) {
  const k = o.scale ?? 1;
  const sp = charSprite(kind, o.frame ?? 0, !!o.dead, !!o.flash);
  c.imageSmoothingEnabled = false;
  if (o.shadow !== false && !o.dead) {
    c.fillStyle = 'rgba(0,0,0,0.45)';
    for (let yy = -1; yy <= 1; yy++) { const w = Math.round((6 - Math.abs(yy) * 2) * k); c.fillRect(Math.round(x - w), Math.round(y + yy * k - k), w * 2, k); }
  }
  const w = sp.width * k, h = sp.height * k;
  const dx = Math.round(x - w / 2), dy = Math.round(y - h + (o.dead ? 2 * k : 0) - (o.bob ?? 0) * k);
  if (o.flip) { c.save(); c.translate(dx * 2 + w, 0); c.scale(-1, 1); c.drawImage(sp, dx, dy, w, h); c.restore(); }
  else c.drawImage(sp, dx, dy, w, h);
}

// ============================================================ сборка персонажа
function buildChar(kind: string, frame: number): HTMLCanvasElement {
  const st = STYLES[kind] ?? STYLES.militia;
  const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
  const c = cv.getContext('2d')!;
  const R = (x: number, y: number, w: number, h: number, col: string) => prect(c, x, y, w, h, col);
  const P = (x: number, y: number, col: string) => ppx(c, x, y, col);

  const size = (st.scale ?? 1) < 0.9 ? 's' : (st.scale ?? 1) > 1.04 ? 'b' : 'n';
  const top = size === 's' ? 11 : size === 'b' ? 4 : 6;            // верх головы
  const neck = top + 7;
  const tTop = neck + 1;                                            // плечи
  const tBot = st.puttees ? 22 : size === 's' ? 26 : 25;           // низ шинели (у солдат — короткий мундир)
  const [tx0, tx1] = size === 'b' ? [6, 17] : [7, 16];
  const coat = st.coat ?? '#4a4a3e', coatD = shade(coat, -0.38), coatL = shade(coat, 0.16);
  const skin = st.skin ?? '#c8a684', skinD = shade(skin, -0.3);
  const legs = st.legs ?? '#24221c', legsD = shade(legs, -0.3), boot = '#141210';
  const LB = st.limbs ?? {};
  const COPPER = '#b06a3a', SPARK = '#d8ff70';
  const walk = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const bob = frame === 1 || frame === 3 ? -1 : 0;
  const sy = (y: number) => y + bob; // всё выше пояса покачивается

  // --- газовые баллоны за спиной (газовый мертвец)
  if (st.tanks) {
    R(tx0 - 3, sy(tTop), 3, 10, '#5a5e4a'); R(tx0 - 3, sy(tTop), 1, 10, '#7a7e66'); R(tx0 - 3, sy(tTop - 1), 3, 1, BRASS);
    R(tx0 - 2, sy(tTop + 10), 2, 1, '#3a3e30'); P(tx0 - 4, sy(tTop + 3), '#9fd36a');               // течь — зелёная капля
  }
  // --- задняя рука (левая)
  const armL = LB.armL;
  if (armL === 'lost') { R(tx0 - 1, sy(tTop + 1), 2, 3, coatD); P(tx0 - 1, sy(tTop + 4), shade(coatD, -0.3)); } // подколотый рукав
  else {
    const metal = armL === 'piston' || armL === 'galvanic';
    R(tx0 - 1, sy(tTop + 1), 2, 8, metal ? (armL === 'galvanic' ? shade(COPPER, -0.25) : '#6e726c') : coatD);
    if (st.band && !metal) { R(tx0 - 1, sy(tTop + 2), 2, 2, '#e0dcc8'); P(tx0 - 1, sy(tTop + 3), '#a02a20'); }
    if (st.armband && !metal) R(tx0 - 1, sy(tTop + 2), 2, 2, st.armband);
    const hcol = armL === 'hook' ? STEEL : armL === 'hinged' ? BRASS : metal ? STEEL : armL === 'flesh' ? '#b89a8a' : skinD;
    if (armL === 'hook') { P(tx0 - 1, sy(tTop + 9), STEEL); P(tx0, sy(tTop + 10), STEEL); }
    else R(tx0 - 1, sy(tTop + 9), 2, 1, hcol);
  }

  // --- ноги / подол
  if (!st.dress) {
    const lTop = tBot + 1;
    const lx = 9 - walk, rx = 13 + walk;
    const leg = (x: number, col: string, kind: string | undefined) => {
      const len = SH - lTop;
      if (kind === 'lost') { R(x, lTop - 1, 2, 2, col); return; }                       // культя под штаниной
      if (kind === 'pegleg') { R(x, lTop - 1, 2, 3, col); R(x + 1, lTop + 2, 1, len - 2, WOOD); P(x + 1, SH - 1, WOOD_D); return; }
      if (kind === 'springleg') {
        R(x, lTop - 1, 2, 3, col);
        for (let y = lTop + 2; y < SH - 2; y++) P(x + (y % 2), y, STEEL);              // пружина
        R(x, SH - 2, 3, 2, '#5a5e5a'); return;
      }
      if (kind === 'hydraleg') { R(x, lTop - 1, 2, 3, col); R(x, lTop + 2, 2, len - 4, '#6e726c'); R(x + 1, lTop + 3, 1, len - 6, BRASS); R(x, SH - 2, 3, 2, '#4a4e4a'); return; }
      R(x, lTop - 1, 2, len, col); R(x, SH - 3, 3, 3, boot);
      if (st.puttees) for (let y = SH - 10; y < SH - 3; y++) { R(x, y, 2, 1, (y & 1) ? st.puttees : shade(st.puttees, -0.25)); P(x + ((y >> 1) & 1), y, shade(st.puttees, 0.15)); } // обмотки по спирали
    };
    leg(lx, legsD, LB.legL); leg(rx, legs, LB.legR);
    if (LB.legL === 'lost' || LB.legR === 'lost') pline(c, tx0 - 2, sy(tTop + 3), tx0 - 3, SH - 1, WOOD); // костыль
    if (walk) { R(walk > 0 ? lx : rx, SH - 1, 3, 1, 'rgba(0,0,0,0)'); }
  }
  // --- корпус
  if (st.dress) {
    for (let y = tTop; y < SH; y++) {
      const grow = Math.floor((y - tTop) / 4);
      const x0 = tx0 - grow, x1 = tx1 + grow;
      R(x0, sy(y), x1 - x0 + 1, 1, coat);
      R(x0, sy(y), 1, 1, coatL); R(x1 - 1, sy(y), 2, 1, coatD);
    }
    const foot = (x: number, kind: string | undefined) => { if (kind === 'lost') return; R(x, SH - 1, 3, 1, kind === 'pegleg' ? WOOD : kind ? '#5a5e5a' : boot); };
    foot(tx0 - 3, LB.legL); foot(tx1 + 1 + walk, LB.legR);
    if (LB.legL === 'lost' || LB.legR === 'lost') pline(c, tx0 - 2, sy(tTop + 3), tx0 - 4, SH - 1, WOOD);
  } else {
    R(tx0 - 1, sy(tTop), tx1 - tx0 + 3, 2, coat);                  // плечи
    R(tx0, sy(tTop + 2), tx1 - tx0 + 1, tBot - tTop - 1, coat);
    R(tx0 - 1, sy(tBot), tx1 - tx0 + 3, 1, coat);                   // расклёшенный подол
    R(tx0, sy(tTop + 1), 1, tBot - tTop, coatL);
    R(tx1 - 1, sy(tTop + 1), 2, tBot - tTop, coatD);
    R(12, sy(tTop + 9), 1, tBot - tTop - 8, coatD);                 // разрез
  }
  if (st.apron) R(tx0 + 2, sy(tTop + 2), tx1 - tx0 - 3, (st.dress ? SH - 2 : tBot) - tTop - 1, st.apron);
  if (st.cuirass) {
    R(tx0 + 1, sy(tTop + 1), tx1 - tx0 - 1, 7, '#8e9296'); R(tx0 + 1, sy(tTop + 1), 2, 7, '#c0c4c8');
    R(tx0 + 1, sy(tTop + 8), tx1 - tx0 - 1, 1, '#4a4c4e');
  }
  if (st.trim) {
    for (const yy of [2, 4, 6]) P(12, sy(tTop + yy), st.trim);
    R(tx0 - 1, sy(tTop), 2, 1, st.trim); R(tx1, sy(tTop), 2, 1, st.trim);
  }
  if (st.belt) { R(tx0, sy(tTop + 7), tx1 - tx0 + 1, 1, st.belt); P(12, sy(tTop + 7), BRASS); }
  if (st.webbing) { // накладные нагрудные карманы, перекрещенные ремни и подсумки
    R(tx0 + 1, sy(tTop + 2), 3, 2, shade(coat, -0.18)); R(tx1 - 3, sy(tTop + 2), 3, 2, shade(coat, -0.18));
    P(tx0 + 2, sy(tTop + 2), BRASS); P(tx1 - 2, sy(tTop + 2), BRASS);
    pline(c, tx0 + 1, sy(tTop), tx1 - 1, sy(tTop + 6), st.webbing); pline(c, tx1 - 1, sy(tTop), tx0 + 1, sy(tTop + 6), st.webbing);
    R(tx0, sy(tTop + 8), 3, 2, shade(st.webbing, -0.2)); R(tx1 - 2, sy(tTop + 8), 3, 2, shade(st.webbing, -0.2));
  }
  if (st.tabs) { P(10, sy(tTop), st.tabs); P(13, sy(tTop), st.tabs); } // петлицы
  if (st.number) { R(tx0 + 1, sy(tTop + 2), 4, 3, '#d8d4c0'); P(tx0 + 2, sy(tTop + 3), '#2a2a2a'); P(tx0 + 4, sy(tTop + 3), '#2a2a2a'); } // нашивка с номером
  if (st.collar) R(11, sy(tTop), 2, 1, '#e8e4d8');
  if (st.undead) { // истлевшая шинель: дыры, торчащие рёбра, рваный подол
    R(tx0 + 2, sy(tTop + 4), 2, 1, '#d8d4c0'); R(tx0 + 2, sy(tTop + 6), 2, 1, '#d8d4c0'); P(tx0 + 3, sy(tTop + 5), INK);
    if (!st.dress) for (const xx of [tx0, tx0 + 3, tx1 - 1]) c.clearRect(xx, sy(tBot), 1, 1);
    P(tx1 - 2, sy(tTop + 9), shade(coat, -0.55));
  }

  // --- голова
  const hx0 = 9, hy = sy(top);
  if (st.hood) {
    R(8, hy - 2, 8, 10, coat); R(7, hy + 1, 1, 7, coat); R(16, hy + 1, 1, 7, coatD);
    R(10, hy + 2, 4, 5, '#030303');
    P(11, hy + 4, '#b8ff80'); P(13, hy + 4, '#b8ff80');
  } else {
    if (st.longHair && st.hair) R(8, hy + 1, 3, 10, shade(st.hair, -0.1));
    R(hx0, hy, 6, 7, skin); R(hx0 + 5, hy, 1, 7, skinD);
    P(hx0 + 1, hy + 3, skinD);                                      // ухо
    if (st.hair) { R(hx0, hy - 1, 6, 2, st.hair); R(hx0, hy, 2, 4, st.hair); }
    if (st.beard) { R(hx0 + 2, hy + 5, 4, 2, st.beard); R(hx0 + 3, hy + 7, 3, 1, st.beard); }
    if (st.respirator) { // противогаз: прорезиненная маска, круглые стёкла, хобот к сумке на груди
      R(hx0, hy, 6, 7, '#6a6a54'); R(hx0 + 5, hy, 1, 7, '#4e4e40'); R(hx0, hy, 6, 1, '#7a7a62');
      R(hx0 + 3, hy + 2, 2, 2, '#c8d8c8'); P(hx0 + 4, hy + 3, '#7a9a8a'); P(hx0 + 1, hy + 2, '#a8b8a8');  // круглые стёкла
      R(hx0 + 4, hy + 5, 2, 2, '#3a3a30'); P(hx0 + 5, hy + 6, '#6a6a58');
      pline(c, hx0 + 5, hy + 7, 13, sy(tTop + 3), '#3a3a30');
      R(11, sy(tTop + 3), 4, 3, '#6a6450'); R(11, sy(tTop + 3), 4, 1, '#7a7460');            // сумка противогаза
    } else if (st.mask) {
      R(hx0 + 1, hy + 2, 6, 5, '#2b2d28');
      P(hx0 + 3, hy + 3, '#9fd36a'); P(hx0 + 5, hy + 3, '#9fd36a');
      R(hx0 + 3, hy + 6, 3, 3, '#4a4a44'); P(hx0 + 3, hy + 6, '#6a6a62');
    } else if (st.undead) {
      P(hx0 + 4, hy + 3, '#c8ff60'); P(hx0 + 2, hy + 3, '#7aa040');  // светящиеся глаза
      R(hx0 + 1, hy + 5, 5, 1, '#d8d4c0'); P(hx0 + 2, hy + 5, INK); P(hx0 + 4, hy + 5, INK); // оскал
      P(hx0 + 1, hy + 1, shade(skin, -0.45)); P(hx0 + 4, hy + 6, shade(skin, -0.45));        // трупные пятна
    } else {
      const eR = LB.eyeR;
      P(hx0 + 4, hy + 3, eR === 'lost' ? INK : eR === 'glasseye' ? '#c8d8e0' : eR === 'occulteye' ? '#b8ff60' : INK); // глаз
      if (eR === 'lost') { R(hx0 + 3, hy + 2, 3, 3, '#141210'); }                 // повязка на глазу
      if (eR === 'lost' || LB.eyeL === 'lost') R(hx0, hy + 2, 6, 1, eR === 'lost' ? '#141210' : '#2a2018'); // ремешок повязки
      if (eR === 'occulteye') P(hx0 + 4, hy + 4, '#4a6a2a');                       // прожилки
      P(hx0 + 5, hy + 5, skinD);
    }
    if (st.mask && st.tanks) pline(c, hx0 + 4, hy + 8, tx0 - 2, sy(tTop + 1), '#2a2c24'); // шланг от маски к баллонам
    if (st.goggles) { R(hx0, hy + 1, 6, 1, '#2a2018'); P(hx0 + 2, hy + 1, BRASS); P(hx0 + 4, hy + 1, BRASS); }
    const hc = st.hatC ?? '#222', hcD = shade(hc, -0.35), hcL = shade(hc, 0.18);
    switch (st.hat) {
      case 'cap':
        R(hx0 - 1, hy - 3, 8, 3, hc); R(hx0 - 1, hy - 3, 8, 1, hcL); R(hx0 - 1, hy - 1, 8, 1, hcD);
        R(hx0 + 4, hy, 4, 1, INK); P(hx0 + 2, hy - 2, BRASS);
        break;
      case 'helmet':
        R(hx0, hy - 3, 6, 1, hcL); R(hx0 - 1, hy - 2, 8, 2, hc); R(hx0 - 3, hy, 12, 1, hcD);
        break;
      case 'brodie': // плоская каска «тазиком» с широкими полями
        R(hx0 + 1, hy - 3, 4, 1, hcL); R(hx0, hy - 2, 6, 1, hc); R(hx0 - 1, hy - 1, 8, 1, hc);  // низкий купол
        R(hx0 - 3, hy, 12, 1, hcD); P(hx0 - 3, hy, shade(hc, 0.1)); P(hx0 + 8, hy, shade(hc, 0.1)); // ровные широкие поля
        P(hx0 + 2, hy - 2, hcL);                                                                 // заклёпка
        if (st.tabs) R(hx0, hy - 1, 6, 1, st.tabs);                                              // красная полоса на каске
        break;
      case 'tophat':
        R(hx0, hy - 7, 6, 7, hc); R(hx0, hy - 7, 1, 7, hcL); R(hx0, hy - 2, 6, 1, '#3a2a2a'); R(hx0 - 2, hy, 10, 1, hcD);
        break;
      case 'flatcap':
        R(hx0 - 1, hy - 2, 8, 2, hc); R(hx0 - 1, hy - 2, 8, 1, hcL); R(hx0 + 4, hy, 4, 1, hcD);
        break;
      case 'bonnet':
        R(hx0 - 1, hy - 2, 6, 2, hc); R(hx0 - 1, hy - 1, 3, 9, hc); R(hx0 - 1, hy - 2, 6, 1, hcL);
        break;
      case 'minerhelm':
        R(hx0, hy - 3, 6, 1, hcL); R(hx0 - 1, hy - 2, 8, 2, hc); R(hx0 - 2, hy, 10, 1, hcD); P(hx0 + 5, hy - 3, '#f0d070');
        break;
    }
  }

  // --- передняя рука и оружие
  const ax = tx1, ay = sy(tTop + 1);
  const armR = LB.armR;
  const hand = () => {
    if (!armR) { R(ax, ay + 8, 2, 2, skin); return; }
    if (armR === 'lost') return;
    if (armR === 'hook') { P(ax, ay + 8, STEEL); P(ax + 1, ay + 9, STEEL_L); P(ax + 1, ay + 10, STEEL); P(ax, ay + 10, STEEL); return; }
    if (armR === 'hinged') { R(ax, ay + 8, 2, 2, BRASS); P(ax + 1, ay + 9, '#7a5a28'); return; }
    if (armR === 'flesh') { R(ax, ay + 8, 2, 2, '#b89a8a'); P(ax, ay + 8, '#5a2a2a'); return; }   // чужая кожа, шов
    R(ax, ay + 8, 2, 2, STEEL); P(ax + 1, ay + 9, STEEL_L);                                         // стальная кисть
  };
  if (armR === 'lost') { R(ax, ay, 2, 3, coat); R(ax + 1, ay, 1, 3, coatD); P(ax, ay + 3, coatD); } // подколотый рукав
  else if (armR === 'piston') { R(ax, ay, 2, 3, coat); R(ax, ay + 3, 2, 5, '#6e726c'); P(ax + 1, ay + 4, BRASS); P(ax + 1, ay + 6, '#4a4e4a'); }
  else if (armR === 'galvanic') { R(ax, ay, 2, 3, coat); R(ax, ay + 3, 2, 5, COPPER); for (const k of [3, 5, 7]) P(ax, ay + k, '#7a4220'); P(ax + 1, ay + 4, SPARK); }
  else { R(ax, ay, 2, 8, coat); R(ax + 1, ay, 1, 8, coatD); if (armR === 'flesh') P(ax, ay + 7, '#5a2a2a'); }
  if (st.sash) { R(ax, ay + 1, 2, 2, '#7fb04a'); }
  const hx = ax + 1, hy2 = ay + 9; // кисть
  switch (armR === 'lost' && !['rifle', 'musket', 'bag'].includes(st.weapon ?? '') ? undefined : st.weapon) {
    case 'saber':
      pline(c, hx + 1, hy2 + 1, hx + 4, hy2 + 8, STEEL); pline(c, hx + 2, hy2 + 1, hx + 4, hy2 + 6, STEEL_L);
      R(hx - 1, hy2 - 1, 3, 1, BRASS); hand();
      R(tx0 - 2, sy(tTop + 6), 2, 4, '#2a1d12');                    // кобура
      break;
    case 'knife': hand(); pline(c, hx + 1, hy2 + 1, hx + 3, hy2 + 4, STEEL_L); break;
    case 'pistol': R(hx - 1, hy2 - 2, 5, 2, '#1e1e1c'); P(hx + 3, hy2 - 2, STEEL); hand(); break;
    case 'rifle': case 'musket': {
      const wood = st.weapon === 'musket' ? '#6a4626' : WOOD;
      pline(c, 9, sy(tBot), 19, sy(tTop - 5), wood); pline(c, 10, sy(tBot), 20, sy(tTop - 5), WOOD_D);
      pline(c, 17, sy(tTop - 2), 20, sy(tTop - 8), STEEL);
      hand(); R(9, sy(tTop + 6), 2, 2, skin);
      break;
    }
    case 'fork':
      R(hx + 1, 2, 1, SH - 2, WOOD); R(hx, 2, 3, 1, STEEL); R(hx, 0, 1, 2, STEEL); R(hx + 1, 0, 1, 2, STEEL); R(hx + 2, 0, 1, 2, STEEL);
      hand();
      break;
    case 'goad': R(hx + 1, 1, 1, SH - 1, WOOD); P(hx + 1, 0, STEEL_L); hand(); break;
    case 'pole': pline(c, hx, SH - 1, hx + 3, 1, WOOD); P(hx + 3, 0, '#f0a040'); hand(); break;
    case 'staff':
      R(hx + 1, 4, 1, SH - 4, '#2a2018'); R(hx, 1, 3, 3, '#7ad050'); P(hx + 1, 2, '#e8ffc0'); hand();
      break;
    case 'hammer':
      pline(c, hx, hy2 + 1, hx + 2, hy2 - 9, WOOD); R(hx - 1, hy2 - 12, 6, 3, '#4a4a48'); R(hx - 1, hy2 - 12, 6, 1, '#6a6a68'); hand();
      break;
    case 'wrench': pline(c, hx, hy2 + 1, hx + 3, hy2 + 7, STEEL); P(hx + 4, hy2 + 7, STEEL); P(hx + 2, hy2 + 8, STEEL); hand(); break;
    case 'bag': R(hx - 2, hy2 + 1, 5, 4, '#2a1a12'); P(hx, hy2 + 1, BRASS); hand(); break;
    case 'shovel': // окопная лопата-дубина с заточенным краем
      pline(c, hx, hy2 + 1, hx + 2, hy2 - 10, WOOD); R(hx, hy2 - 15, 5, 5, STEEL); R(hx, hy2 - 15, 5, 1, STEEL_L); P(hx + 4, hy2 - 11, '#5a2a1a'); hand();
      break;
    case 'book': R(hx - 2, hy2 - 3, 4, 5, '#4a1a14'); R(hx - 2, hy2 - 3, 1, 5, '#d8c8a0'); hand(); break;
    case 'bottle': R(hx, hy2 - 3, 2, 4, '#3d6a3a'); P(hx, hy2 - 4, '#2a2018'); hand(); break;
    default: hand();
  }
  outline(cv, INK);
  return cv;
}

function impSprite(frame: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
  const c = cv.getContext('2d')!;
  const R = (x: number, y: number, w: number, h: number, col: string) => prect(c, x, y, w, h, col);
  const up = frame % 2 ? 2 : 0, body = '#6a1e16', bodyD = '#3a0e0a';
  // крылья
  R(2, 12 - up, 5, 2, '#2a0d0d'); R(1, 10 - up, 3, 2, '#2a0d0d'); R(4, 14, 4, 3, '#2a0d0d');
  // тело
  R(8, 16, 8, 9, body); R(14, 16, 2, 9, bodyD); R(9, 25, 2, 4, body); R(13, 25, 2, 4, bodyD);
  // голова, рога, глаза
  R(11, 10, 6, 6, body); R(16, 10, 1, 6, bodyD);
  R(11, 7, 1, 3, '#d8c8a0'); R(16, 7, 1, 3, '#d8c8a0'); ppx(c, 10, 6, '#d8c8a0'); ppx(c, 17, 6, '#d8c8a0');
  ppx(c, 14, 12, '#eaff7a'); ppx(c, 16, 12, '#eaff7a'); R(13, 14, 4, 1, '#1a0606');
  // хвост и когти
  pline(c, 8, 23, 4, 26, body); ppx(c, 3, 25, bodyD);
  R(17, 19, 3, 2, body); ppx(c, 20, 21, '#d8c8a0');
  outline(cv, INK);
  return cv;
}

/** Морской демон: громадная саламандра, ходит на двух задних лапах. Выше человека,
 *  кожа лоснится слизью, гребень вдоль спины, жабры, набухший ядовитый зоб, хвост волочится. */
function salamanderSprite(frame: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = 34; cv.height = 44;
  const c = cv.getContext('2d')!;
  const R = (x: number, y: number, w: number, h: number, col: string) => prect(c, x, y, w, h, col);
  const P = (x: number, y: number, col: string) => ppx(c, x, y, col);
  const sk = '#3e4a3a', skD = '#26302a', skL = '#5e6e52', belly = '#8a8a5a', slime = '#a8c890', crest = '#6a2e2e';
  const walk = frame === 1 ? 1 : frame === 3 ? -1 : 0, bob = frame === 1 || frame === 3 ? -1 : 0;
  const Y = (y: number) => y + bob;
  // хвост — тяжёлый, волочится по земле позади
  for (let k = 0; k < 10; k++) { const x = 9 - k, y = 34 + Math.round(k * 0.6 + Math.sin(k * 0.8 + frame) * 0.8); R(x, y, 2, Math.max(1, 3 - (k >> 2)), k % 3 ? sk : skD); }
  // задние лапы — толстые бёдра, согнутые колени, перепончатые ступни
  const legL = 13 - walk, legR = 19 + walk;
  R(legL, Y(28), 4, 5, skD); R(legL - 1, 33, 3, 7, skD); R(legL - 3, 40, 6, 2, skD); P(legL - 3, 41, '#1a1e18'); P(legL + 2, 41, '#1a1e18');
  R(legR, Y(28), 4, 5, sk); R(legR + 1, 33, 3, 7, sk); R(legR, 40, 6, 2, sk); P(legR, 41, '#1a1e18'); P(legR + 5, 41, '#1a1e18');
  // туловище — сутулое, бочкообразное
  R(11, Y(14), 12, 15, sk); R(10, Y(16), 1, 11, skD); R(23, Y(16), 1, 11, skD); R(11, Y(14), 12, 1, skL);
  R(14, Y(17), 7, 11, belly); for (let y = 18; y < 28; y += 2) R(14, Y(y), 7, 1, '#7a7a4e');   // складки брюха
  for (let y = 15; y < 28; y += 3) { P(12, Y(y), slime); P(22, Y(y + 1), slime); }             // слизь
  // спинной гребень
  for (let y = 12; y < 28; y += 3) R(9, Y(y), 2, 2, crest);
  // передние лапы — короткие, с когтями, свисают вперёд
  R(23, Y(17), 3, 7, skD); R(24, Y(24), 3, 2, skD); P(27, Y(25), '#c8c0a0'); P(26, Y(26), '#c8c0a0');
  R(9, Y(18), 2, 6, skD); P(9, Y(24), '#c8c0a0');
  // голова — широкая, плоская, выдвинута вперёд на короткой шее
  R(16, Y(7), 14, 8, sk); R(16, Y(7), 14, 1, skL); R(29, Y(9), 2, 5, skD);
  R(19, Y(13), 12, 4, belly); R(19, Y(16), 10, 1, '#6a6a40');                                  // набухший зоб
  R(22, Y(12), 9, 1, '#2a1a14'); P(30, Y(11), '#1a1a14');                                     // пасть
  R(24, Y(8), 2, 2, '#e8e070'); P(25, Y(9), '#3a2a10');                                       // глаз
  for (const [x, y] of [[16, 5], [18, 4], [20, 5]]) R(x, Y(y), 1, 3, crest);                  // жабры-гребень на затылке
  P(29, Y(17), slime); P(27, Y(18), slime); P(30, Y(15), '#7aa060');                          // капли слизи, яд у пасти
  outline(cv, INK);
  return cv;
}

function flashCopy(src: HTMLCanvasElement) {
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  const c = cv.getContext('2d')!; c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-atop'; c.fillStyle = '#f2e8de'; c.fillRect(0, 0, cv.width, cv.height);
  return cv;
}
function rotate90(src: HTMLCanvasElement) {
  const cv = document.createElement('canvas'); cv.width = src.height; cv.height = src.width;
  const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false;
  c.translate(cv.width, 0); c.rotate(Math.PI / 2); c.drawImage(src, 0, 0);
  // темнее — лежит в пыли
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(20,10,8,0.35)'; c.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

// ============================================================ жук-тяжеловоз (8 направлений × 2 кадра лап)
const beetleCache = new Map<string, HTMLCanvasElement>();
export function beetleSprite(dir: number, frame: number): HTMLCanvasElement {
  const di = ((Math.round(dir / (Math.PI / 4)) % 8) + 8) % 8, key = `${di}|${frame}`;
  let cv = beetleCache.get(key);
  if (cv) return cv;
  cv = pixelize(40, 30, (c) => {
    c.translate(20, 15); c.scale(1, 0.75); c.rotate(di * Math.PI / 4);
    c.strokeStyle = '#1a120c'; c.lineWidth = 2; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) for (const side of [-1, 1]) {
      const ph = frame ? (i % 2 ? 3 : -3) * side : 0, bx = -7 + i * 7, by = side * 7;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + ph - 3, by + side * 8); c.lineTo(bx + ph - 6, by + side * 12); c.stroke();
    }
    c.fillStyle = '#7a4a26'; c.beginPath(); c.ellipse(-3, 0, 15, 10, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#a06a3a'; c.beginPath(); c.ellipse(-6, -3, 9, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a180c'; c.fillRect(-18, -0.7, 26, 1.4);
    c.fillStyle = '#4a2c16'; c.beginPath(); c.ellipse(12, 0, 6, 7, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1a100a'; c.beginPath(); c.ellipse(18, 0, 4, 5, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#120a06'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(20, -2); c.lineTo(24, -4); c.moveTo(20, 2); c.lineTo(24, 4); c.stroke();
  });
  outline(cv, INK);
  beetleCache.set(key, cv);
  return cv;
}

// ============================================================ фигурка для глобальной карты (10×15)
/** Маленькая фигурка отряда на карте региона: те же цвета и шляпы, что у большого спрайта. */
export function miniSprite(kind: string, frame = 0): HTMLCanvasElement {
  const key = `${kind}|mini|${frame}`;
  let cv = cache.get(key);
  if (cv) return cv;
  if (kind === 'salamander') { // на карте — уменьшенная саламандра
    const big = salamanderSprite(frame);
    cv = document.createElement('canvas'); cv.width = 14; cv.height = 18;
    const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; c.drawImage(big, 0, 0, big.width, big.height, 0, 0, 14, 18);
    cache.set(key, cv); return cv;
  }
  const st = STYLES[kind] ?? STYLES.militia;
  cv = document.createElement('canvas'); cv.width = 12; cv.height = 17;
  const c = cv.getContext('2d')!;
  c.translate(1, 1);
  const R = (x: number, y: number, w: number, h: number, col: string) => prect(c, x, y, w, h, col);
  const coat = st.coat ?? '#4a4232', legs = st.legs ?? shade(coat, -0.4), skin = st.skin ?? '#c4ac90';
  const step = frame % 2 === 1 ? (frame === 1 ? 1 : -1) : 0;
  // ноги
  if (st.dress) { R(2, 10, 6, 4, shade(coat, -0.15)); R(3, 14, 1, 1, INK); R(6, 14, 1, 1, INK); }
  else { R(3 + Math.min(0, step), 11, 2, 3 + Math.max(0, -step), legs); R(5 + Math.max(0, step), 11, 2, 3 + Math.max(0, step), legs); }
  // корпус и руки
  R(2, 6, 6, 5, coat); R(2, 6, 1, 5, shade(coat, 0.18)); R(7, 6, 1, 5, shade(coat, -0.25));
  R(1, 7, 1, 3, shade(coat, -0.1)); R(8, 7, 1, 3, shade(coat, -0.3)); R(1, 10, 1, 1, skin); R(8, 10, 1, 1, skin);
  if (st.apron) R(3, 8, 4, 4, st.apron);
  if (st.belt) R(2, 9, 6, 1, st.belt);
  if (st.trim) { R(4, 6, 1, 4, st.trim); }
  if (st.sash) R(3, 7, 1, 1, '#7a2020');
  if (st.number) R(3, 7, 2, 1, '#d8d4c0');
  // голова
  R(3, 2, 4, 4, skin); R(6, 2, 1, 4, shade(skin, -0.2));
  if (st.respirator) { R(3, 3, 4, 3, '#5a5a48'); R(5, 3, 1, 1, '#9ab0a0'); R(5, 5, 1, 2, '#3a3a30'); }
  else if (st.mask) { R(3, 4, 4, 2, '#3a3c30'); R(4, 4, 1, 1, '#9aa080'); }
  else R(5, 3, 1, 1, st.undead ? '#c8ff60' : INK);
  if (st.tanks) R(0, 6, 2, 4, '#5a5e4a');
  if (st.beard) R(3, 5, 4, 1, st.beard);
  if (st.hair && !st.hat) R(3, 1, 4, 2, st.hair);
  if (st.longHair && st.hair) R(2, 2, 1, 4, st.hair);
  if (st.hood) { R(2, 1, 6, 2, coat); R(2, 2, 1, 4, coat); R(7, 2, 1, 4, coat); R(3, 3, 3, 2, '#000'); }
  const hc = st.hatC ?? '#2a2620';
  switch (st.hat) {
    case 'cap': R(3, 1, 4, 2, hc); R(5, 2, 3, 1, INK); break;
    case 'flatcap': R(3, 1, 4, 2, hc); R(6, 2, 2, 1, hc); break;
    case 'brodie': R(0, 2, 10, 1, shade(hc, -0.3)); R(2, 1, 6, 1, hc); R(3, 0, 4, 1, hc); if (st.tabs) R(2, 1, 6, 1, st.tabs); break;
    case 'helmet': case 'minerhelm': R(2, 1, 6, 2, hc); R(3, 0, 4, 1, hc); R(2, 2, 6, 1, shade(hc, -0.3)); if (st.hat === 'minerhelm') R(6, 1, 1, 1, '#f0d080'); break;
    case 'tophat': R(3, -1, 4, 3, hc); R(2, 2, 6, 1, hc); break;
    case 'bonnet': R(2, 1, 5, 2, hc); R(2, 2, 1, 3, hc); break;
  }
  // оружие
  switch (st.weapon) {
    case 'rifle': case 'musket': R(9, 3, 1, 9, WOOD); R(9, 1, 1, 2, STEEL); break;
    case 'fork': case 'staff': case 'pole': case 'goad': R(9, 1, 1, 13, WOOD); if (st.weapon === 'fork') { R(8, 0, 1, 2, STEEL); R(9, 0, 1, 1, STEEL); R(10, 0, 1, 2, STEEL); } break;
    case 'saber': R(9, 7, 1, 5, STEEL_L); R(8, 10, 1, 1, BRASS); break;
    case 'hammer': case 'wrench': case 'shovel': R(9, 6, 1, 5, WOOD); R(8, 6, 3, 2, STEEL); break;
    case 'bag': R(8, 9, 3, 3, '#6a5a3a'); break;
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  outline(cv, INK);
  cache.set(key, cv);
  return cv;
}
