// ============================================================
//  Пиксельные персонажи 24×32: собираются из частей по стилю
//  (gfx.ts STYLES), с контуром, кадрами шага и позой падения.
// ============================================================
import { STYLES } from './gfx';
import { outline, shade, pixelize, prect, ppx, pline, pellipse } from './px';

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
  let base = kind === 'imp' ? impSprite(frame) : kind === 'hound' ? houndSprite(frame) : kind === 'salamander' ? salamanderSprite(frame) : buildChar(kind, frame);
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
/** Оружие, которое в бою держат «на изготовку» — так его легче различить. */
const AIM = new Set(['rifle', 'musket', 'shotgun', 'sawnoff', 'pistol', 'knife', 'mg']);
/** Вид фигурки для боя: стрелки и бойцы с ножом — в стойке с оружием на изготовку (ключ с суффиксом «#aim»). */
export function combatKind(kind: string) { const st = STYLES[kind]; return st && st.weapon && AIM.has(st.weapon) && st.limbs?.armR !== 'lost' ? kind + '#aim' : kind; }

function buildChar(kind0: string, frame: number): HTMLCanvasElement {
  const aim = kind0.endsWith('#aim'), kind = aim ? kind0.slice(0, -4) : kind0;
  const st = STYLES[kind] ?? STYLES.militia;
  // в боевой стойке холст шире на 16 (по 8 с боков), чтобы длинный ствол выходил далеко за силуэт; фигура остаётся по центру
  const cv = document.createElement('canvas'); cv.width = SW + (aim ? 16 : 0); cv.height = SH;
  const c = cv.getContext('2d')!;
  if (aim) c.translate(8, 0);
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
    if (st.longHair && st.hair) { R(7, hy + 1, 4, 10, shade(st.hair, -0.1)); P(7, hy + 11, shade(st.hair, -0.25)); P(10, hy + 11, shade(st.hair, -0.25)); } // волосы по плечам сзади
    R(hx0, hy, 6, 7, skin); R(hx0 + 5, hy, 1, 7, skinD);
    // ухо не рисуем: точка в ряд с глазом читалась как второй, серый глаз
    if (st.hair) { R(hx0, hy - 1, 6, 2, st.hair); R(hx0, hy, 2, 4, st.hair); }
    if (st.longHair && st.hair) { // женская причёска: чёлка и прядь с лицевой стороны, спадающая на плечо
      const hd = shade(st.hair, -0.15), hl = shade(st.hair, 0.15);
      R(hx0 - 1, hy - 1, 8, 1, st.hair); P(hx0 + 1, hy - 1, hl); P(hx0 + 2, hy, st.hair); P(hx0 + 5, hy, st.hair);
      R(hx0 + 6, hy, 1, 11, st.hair); R(hx0 + 5, hy + 5, 1, 5, st.hair); P(hx0 + 6, hy + 2, hl); P(hx0 + 6, hy + 6, hl); P(hx0 + 7, hy + 10, hd); P(hx0 + 5, hy + 10, hd);
    }
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
    if (st.eyes && !st.hood) { P(hx0 + 4, hy + 3, st.eyes); P(hx0 + 2, hy + 3, shade(st.eyes, -0.35)); }   // горящие глаза
    if (st.horns) { // загнутые назад рога
      const hd = shade(st.horns, -0.3);
      R(hx0 + 1, hy - 2, 1, 2, st.horns); P(hx0, hy - 3, st.horns); P(hx0 - 1, hy - 4, hd); P(hx0 - 1, hy - 5, hd);
      R(hx0 + 4, hy - 2, 1, 2, st.horns); P(hx0 + 5, hy - 3, st.horns); P(hx0 + 6, hy - 4, hd); P(hx0 + 6, hy - 5, hd);
    }
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
  const aimed = aim && !!st.weapon && AIM.has(st.weapon);
  if (aimed) { /* рука — в боевой стойке ниже */ }
  else if (armR === 'lost') { R(ax, ay, 2, 3, coat); R(ax + 1, ay, 1, 3, coatD); P(ax, ay + 3, coatD); } // подколотый рукав
  else if (armR === 'piston') { R(ax, ay, 2, 3, coat); R(ax, ay + 3, 2, 5, '#6e726c'); P(ax + 1, ay + 4, BRASS); P(ax + 1, ay + 6, '#4a4e4a'); }
  else if (armR === 'galvanic') { R(ax, ay, 2, 3, coat); R(ax, ay + 3, 2, 5, COPPER); for (const k of [3, 5, 7]) P(ax, ay + k, '#7a4220'); P(ax + 1, ay + 4, SPARK); }
  else { R(ax, ay, 2, 8, coat); R(ax + 1, ay, 1, 8, coatD); if (armR === 'flesh') P(ax, ay + 7, '#5a2a2a'); }
  if (st.sash) { R(ax, ay + 1, 2, 2, '#7fb04a'); }
  const hx = ax + 1, hy2 = ay + 9; // кисть
  if (aim && st.weapon && AIM.has(st.weapon)) { // боевая стойка: оружие на изготовку — длина и силуэт видны издалека
    const hand2 = (x: number, y: number) => R(x, y, 2, 2, armR ? STEEL : skin);
    const sleeve = (x: number, y: number, w: number) => { R(x, y, w, 2, coat); R(x, y + 1, w, 1, coatD); };
    // светлые, контрастные к тёмным шинелям цвета: ствол — светлая сталь с тёмной нижней кромкой, дерево — рыжее
    const EDGE = SW + 7, steelD = '#4a4e4a', dark = '#2e302e', wood = '#8a5e32', woodD = '#5a3a1e';
    switch (st.weapon) {
      case 'rifle': // приклад у плеча, длинный ствол далеко вперёд, штык
        sleeve(ax - 1, ay + 3, 4); hand2(ax + 3, ay + 3);
        R(ax - 3, ay + 2, 9, 2, wood); R(ax - 3, ay + 3, 9, 1, woodD);
        R(ax + 6, ay + 1, EDGE - ax - 9, 1, STEEL_L); R(ax + 6, ay + 2, EDGE - ax - 9, 1, steelD);
        R(EDGE - 3, ay + 1, 3, 1, '#f0f4ea'); P(EDGE - 1, ay + 2, STEEL_L);
        hand2(ax + 6, ay + 3);
        break;
      case 'musket': // длинное ружьё: всё в рыжем дереве, светлое дуло, без штыка
        sleeve(ax - 1, ay + 3, 4); hand2(ax + 3, ay + 3);
        R(ax - 3, ay + 2, EDGE - ax, 2, wood); R(ax - 3, ay + 3, EDGE - ax, 1, woodD);
        R(ax + 8, ay + 1, EDGE - ax - 9, 1, STEEL); P(EDGE - 2, ay + 1, '#f0f4ea'); P(EDGE - 2, ay + 2, STEEL_L);
        hand2(ax + 8, ay + 3);
        break;
      case 'shotgun': // дробовик: средней длины, толстые сдвоенные стволы
        sleeve(ax - 1, ay + 3, 4); hand2(ax + 3, ay + 3);
        R(ax - 3, ay + 2, 7, 3, wood); R(ax - 3, ay + 4, 7, 1, woodD);
        R(ax + 4, ay + 1, 9, 3, dark); R(ax + 4, ay + 1, 9, 1, STEEL_L); R(ax + 4, ay + 2, 9, 1, STEEL); R(ax + 12, ay + 1, 1, 3, '#f0f4ea');
        hand2(ax + 7, ay + 4);
        break;
      case 'mg': // ручной пулемёт: толстая тёмная коробка, длинный ствол с кожухом, сошки, короб с лентой
        sleeve(ax - 1, ay + 3, 4); hand2(ax + 3, ay + 4);
        R(ax - 3, ay + 2, 6, 3, wood); R(ax - 3, ay + 4, 6, 1, woodD);
        R(ax + 3, ay + 1, 8, 4, dark); R(ax + 3, ay + 1, 8, 1, STEEL);
        R(ax + 11, ay + 1, EDGE - ax - 11, 2, '#5a5e58'); R(ax + 11, ay + 1, EDGE - ax - 11, 1, STEEL_L); P(EDGE - 1, ay + 1, '#f0f4ea');
        pline(c, EDGE - 4, ay + 3, EDGE - 6, ay + 7, dark); pline(c, EDGE - 4, ay + 3, EDGE - 2, ay + 7, dark);
        R(ax + 5, ay + 5, 4, 3, '#5a5c48'); R(ax + 5, ay + 5, 4, 1, '#7a7c64'); P(ax + 4, ay + 7, BRASS); P(ax + 3, ay + 8, BRASS);
        hand2(ax + 9, ay + 4);
        break;
      case 'sawnoff': // обрез у бедра: короткие толстые стволы, рукоять
        R(ax, ay, 2, 7, coat); R(ax + 1, ay, 1, 7, coatD); hand2(ax, ay + 7);
        R(ax + 2, ay + 6, 6, 3, dark); R(ax + 2, ay + 6, 6, 1, STEEL_L); R(ax + 2, ay + 7, 6, 1, STEEL); R(ax + 7, ay + 6, 1, 3, '#f0f4ea');
        R(ax - 1, ay + 8, 3, 3, wood);
        break;
      case 'pistol': // рука вытянута вперёд на уровне плеча, пистолет на конце
        sleeve(ax, ay + 1, 5); hand2(ax + 5, ay + 1);
        R(ax + 6, ay, 4, 2, dark); R(ax + 6, ay, 4, 1, STEEL_L); P(ax + 10, ay, '#f0f4ea'); R(ax + 5, ay + 3, 2, 2, wood);
        R(tx0 - 2, sy(tTop + 6), 2, 3, '#2a1d12');
        break;
      case 'knife': // рука вперёд-вниз, широкий светлый клинок вперёд-вверх
        pline(c, ax, ay + 1, ax + 3, ay + 5, coat, 2); hand2(ax + 3, ay + 5);
        R(ax + 4, ay + 4, 1, 3, BRASS);
        pline(c, ax + 5, ay + 5, ax + 9, ay + 2, STEEL_L, 2); pline(c, ax + 5, ay + 4, ax + 9, ay + 1, '#f0f4ea'); P(ax + 10, ay + 1, '#f0f4ea');
        break;
    }
    outline(cv, INK);
    return cv;
  }
  switch (armR === 'lost' && !['rifle', 'musket', 'bag'].includes(st.weapon ?? '') ? undefined : st.weapon) {
    case 'saber':
      pline(c, hx + 1, hy2 + 1, hx + 4, hy2 + 8, STEEL); pline(c, hx + 2, hy2 + 1, hx + 4, hy2 + 6, STEEL_L);
      R(hx - 1, hy2 - 1, 3, 1, BRASS); hand();
      R(tx0 - 2, sy(tTop + 6), 2, 4, '#2a1d12');                    // кобура
      break;
    case 'knife': // широкий клинок вперёд-вниз, латунная гарда, блик по лезвию
      R(hx - 1, hy2 + 1, 4, 1, BRASS);
      pline(c, hx + 1, hy2 + 2, hx + 5, hy2 + 6, STEEL); pline(c, hx + 2, hy2 + 2, hx + 6, hy2 + 6, STEEL_L); P(hx + 6, hy2 + 7, STEEL_L);
      hand();
      break;
    case 'pistol': // пистолет в опущенной руке: рукоять в кулаке, короткий затвор над кулаком смотрит вперёд
      R(hx - 1, hy2 - 2, 6, 1, '#5a5a56'); P(hx + 4, hy2 - 2, STEEL_L);   // затвор, мушка
      R(hx + 1, hy2 - 1, 4, 1, '#2a2a28');                                  // ствол
      P(hx + 1, hy2, '#2a2a28');                                            // спусковая скоба
      R(hx - 1, hy2 + 1, 2, 2, '#5a3a22');                                  // рукоять из-под кулака
      hand();
      R(tx0 - 2, sy(tTop + 6), 2, 3, '#2a1d12');                    // кобура на боку
      break;
    case 'sawnoff': { // обрез: короткие сдвоенные стволы от бедра вперёд, приклад-пистолетная рукоять
      pline(c, hx - 1, hy2 + 3, hx + 7, hy2 - 1, '#2e2e2a', 2); pline(c, hx, hy2 + 2, hx + 7, hy2 - 2, '#6a6a64');
      P(hx + 8, hy2 - 2, STEEL_L); P(hx + 8, hy2 - 1, '#1a1a18');
      R(hx - 3, hy2 + 3, 3, 3, '#5a3a22'); P(hx - 3, hy2 + 5, '#3a2416');
      hand();
      break;
    }
    case 'shotgun': { // дробовик: длинный, толстые тёмные стволы, тёмное дерево, без штыка
      pline(c, 9, sy(tBot), 18, sy(tTop - 3), '#4a2e1a', 2);
      pline(c, 15, sy(tTop + 1), 21, sy(tTop - 7), '#2e2e2a', 2); pline(c, 16, sy(tTop + 1), 21, sy(tTop - 6), '#6a6a64');
      hand(); R(9, sy(tTop + 6), 2, 2, skin);
      break;
    }
    case 'mg': { // пулемёт на плече: толстый тёмный ствол, коробка, короб с лентой
      pline(c, 9, sy(tBot), 17, sy(tTop - 3), '#5a3a1e', 2);
      pline(c, 14, sy(tTop + 1), 21, sy(tTop - 8), '#2e302e', 2); pline(c, 15, sy(tTop + 1), 21, sy(tTop - 7), '#6a6e68');
      R(12, sy(tTop + 2), 3, 3, '#5a5c48'); P(12, sy(tTop + 2), '#7a7c64');
      hand(); R(9, sy(tTop + 6), 2, 2, skin);
      break;
    }
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

/** Адская гончая: поджарая четвероногая тварь, чёрно-багровая шкура, гребень шипов, горящие глаза. 30×22. */
function houndSprite(frame: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = 30; cv.height = 22;
  const c = cv.getContext('2d')!;
  const R = (x: number, y: number, w: number, h: number, col: string) => prect(c, x, y, w, h, col);
  const P = (x: number, y: number, col: string) => ppx(c, x, y, col);
  const body = '#3a1614', bodyL = '#5a2420', bodyD = '#1e0a0a', bone = '#c8bca0';
  const st = [0, 1, 0, -1][frame % 4];
  // ноги: передняя и задняя пары, в шаге расходятся
  for (const [x, ph] of [[6, st], [9, -st], [18, -st], [21, st]] as [number, number][]) { R(x + ph, 14, 2, 6, bodyD); R(x + ph - 1, 19, 3, 1, bone); }
  // туловище: впалый живот, проступающие рёбра
  R(5, 9, 18, 6, body); R(5, 9, 18, 1, bodyL); R(8, 14, 11, 1, bodyD);
  for (const x of [11, 13, 15]) R(x, 11, 1, 3, bodyD);
  // гребень шипов по хребту
  for (const x of [7, 10, 13, 16, 19]) { P(x, 8, bone); P(x, 7, shade(bone, -0.2)); }
  // хвост
  pline(c, 5, 10, 1, 6, body); P(0, 5, bone);
  // голова с вытянутой мордой и пастью
  R(22, 6, 6, 5, body); R(27, 8, 3, 3, body); R(22, 6, 6, 1, bodyL);
  R(25, 11, 5, 1, '#8a1a10'); P(26, 11, bone); P(28, 11, bone);     // пасть, клыки
  P(22, 4, bone); P(23, 5, bone); P(25, 4, bone); P(25, 5, bone);    // рога-уши
  P(26, 7, '#ffb040'); P(24, 7, '#c86a20');                          // глаза
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

/** Морской демон: громадная саламандра на двух ногах, выше человека. Сутулая — горб выше головы,
 *  плоская широкая голова вынесена вперёд, глаз навыкате на макушке, наружные жабры, зубчатый гребень
 *  вдоль хребта, тяжёлый хвост волочится по земле, кожа лоснится слизью, светлое брюхо в складках,
 *  перепончатые лапы с когтями, под челюстью набухающий зоб. 34×44.
 *  Кадры: 0 и 2 — стойка, 1 и 3 — шаг с покачиванием (зоб раздувается). Смотрит вправо. */
function salamanderSprite(frame: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = 34; cv.height = 44;
  const c = cv.getContext('2d')!;
  const R = (x: number, y: number, w: number, h: number, col: string) => prect(c, x, y, w, h, col);
  const P = (x: number, y: number, col: string) => ppx(c, x, y, col);
  const E = (cx: number, cy: number, rx: number, ry: number, col: string) => pellipse(c, cx, cy, rx, ry, col);
  const L = (x0: number, y0: number, x1: number, y1: number, col: string, w = 1) => pline(c, x0, y0, x1, y1, col, w);

  // палитра: болотная зелень, светлое брюхо, бурая перепонка гребня, розоватые жабры
  const sk = '#3b5a36', skD = '#223820', skDD = '#142212', skL = '#5c7e4e', gloss = '#a6d494';
  const belly = '#a4aa6e', bellyD = '#7a7e4c';
  const crest = '#5a2226', crestL = '#8e3838', gill = '#b24444', gillL = '#e27a74';
  const pouch = '#c2b482', pouchD = '#8a8252', pouchL = '#e4daa8';
  const eye = '#f2ea5a', claw = '#e0d8b4', mouth = '#150a0c', venom = '#8ce46c';

  const f = ((frame % 4) + 4) % 4;
  const walk = f === 1 ? 1 : f === 3 ? -1 : 0;   // шаг: ближняя нога вперёд (+1) / назад (-1)
  const bob = f % 2 ? -1 : 0;                      // корпус приподнимается в шаге
  const Y = (y: number) => y + bob;
  const sway = f === 1 ? 1 : f === 3 ? -1 : 0;     // кончик хвоста ходит из стороны в сторону
  const clawD = shade(claw, -0.35);

  // ---- хвост: толстый у крестца, волочится по земле позади, сужается к кончику
  const tail: [number, number, number][] = [[9, 30, 3], [7, 32, 3], [5, 34, 2], [3, 37, 2], [2, 39, 1], [1, 41, 1]];
  for (const [x, y, r] of tail) E(x, y + (y > 35 ? sway : 0), r, r, sk);
  for (const [x, y, r] of tail) E(x, y + r - 1 + (y > 35 ? sway : 0), r, 0, skD);          // низ хвоста в тени
  R(0, 41 + sway, 2, 1, skD);
  for (const [x, y] of [[6, 29], [4, 32], [3, 35]]) { P(x, y, crest); P(x - 1, y, crestL); }  // зубцы гребня на хвосте
  P(7, 30, gloss);

  // ---- дальняя (левая) нога: отведена назад, тёмная, колено согнуто
  const lx = 11 - walk;
  L(lx + 2, Y(29), lx, Y(33), skD, 3);                     // бедро
  L(lx, Y(33), lx + 1, 38, skD, 2);                        // голень
  R(lx - 2, 40, 8, 2, skD); R(lx - 2, 41, 8, 1, skDD);      // ступня
  P(lx + 5, 40, clawD); P(lx + 4, 39, clawD); P(lx + 2, 39, clawD);

  // ---- туловище: высокий сутулый горб выше головы, грудь выдаётся вперёд, к крестцу сужается
  E(12, Y(18), 7, 10, sk);
  E(14, Y(26), 6, 5, sk);
  R(6, Y(14), 2, 9, skD); L(8, Y(25), 12, Y(30), skD, 1);   // тень вдоль хребта и под брюхом
  // светлое брюхо со складками
  E(15, Y(22), 4, 7, belly);
  R(13, Y(17), 3, 8, belly);
  for (let y = 17; y <= 27; y += 2) R(12, Y(y), 7, 1, bellyD);
  for (let y = 17; y <= 27; y += 1) P(19, Y(y), bellyD);
  // гребень вдоль хребта: тёмно-бурая перепонка, зубцы через каждые три ряда
  for (let y = 9; y <= 27; y++) {
    const bx = 12 - Math.round(7 * Math.sqrt(Math.max(0, 1 - ((y - 18) ** 2) / 100)));
    const ex = Math.max(bx, 6);
    R(ex - 1, Y(y), 1, 1, crest);
    if (y % 3 === 0) { P(ex - 2, Y(y), crest); P(ex - 3, Y(y - 1), crestL); P(ex - 2, Y(y - 1), crest); }
  }
  // блеск слизи на горбу — свет сверху
  R(9, Y(9), 4, 1, skL); P(8, Y(10), gloss); P(9, Y(9), gloss); P(10, Y(9), gloss);

  // ---- дальняя рука: почти скрыта за ближней, видны предплечье и когти
  L(17, Y(19), 18, Y(24), skD, 2); R(17, Y(25), 3, 2, skD); P(16, Y(26), clawD); P(19, Y(27), clawD);

  // ---- ближняя (правая) нога: бедро вперёд, колено, голень назад, широкая перепончатая ступня
  const rx = 17 + walk;
  L(13, Y(28), rx + 1, Y(32), skD, 5);                      // тёмный кант бедра — отделяет от туловища
  L(14, Y(28), rx + 1, Y(32), sk, 4);                       // бедро
  R(14, Y(29), 3, 1, skL); P(15, Y(28), gloss);
  L(rx + 2, Y(33), rx + 1, 38, sk, 3);                      // голень
  L(rx + 1, Y(33), rx, 38, skD, 1);
  R(rx - 1, 40, 9, 2, sk); R(rx - 1, 41, 9, 1, skD); R(rx + 1, 40, 3, 1, skL);   // ступня
  P(rx + 8, 40, claw); P(rx + 7, 39, claw); P(rx + 4, 39, claw); P(rx + 1, 39, claw);
  P(rx + 5, 40, bellyD); P(rx + 2, 40, bellyD);                                   // перепонка меж пальцев

  // ---- шея: короткая, от горба вперёд и вниз к голове
  R(13, Y(8), 6, 6, sk); R(13, Y(8), 4, 1, skL);
  // ---- голова: плоская, широкая, вынесена вперёд; верх плоский, пасть во всю длину
  R(15, Y(6), 17, 6, sk); R(31, Y(7), 2, 5, sk);
  R(15, Y(6), 16, 1, skL); R(17, Y(7), 10, 1, shade(sk, 0.12));
  P(19, Y(6), gloss); P(20, Y(6), gloss); P(27, Y(7), gloss);
  R(18, Y(12), 15, 1, shade(sk, -0.12)); R(19, Y(13), 13, 1, skD);                 // нижняя челюсть
  R(20, Y(11), 13, 1, mouth); P(33, Y(12), mouth); P(19, Y(12), mouth);            // пасть: длинная щель и уголки
  P(25, Y(12), claw); P(29, Y(12), claw); P(31, Y(12), claw);                      // зубы
  P(31, Y(8), skD);                                                                // ноздря
  // выпученный глаз на макушке
  R(23, Y(4), 4, 3, skD); R(24, Y(4), 2, 2, eye); P(25, Y(4), mouth); P(24, Y(3), skL);
  // наружные жабры: три мясистых отростка за головой, розовые кончики
  L(15, Y(7), 12, Y(4), gill); L(15, Y(9), 11, Y(8), gill); L(15, Y(11), 12, Y(13), gill);
  P(12, Y(4), gillL); P(13, Y(3), gillL); P(11, Y(5), gillL);
  P(11, Y(8), gillL); P(10, Y(7), gillL); P(10, Y(9), gillL);
  P(12, Y(13), gillL); P(11, Y(14), gillL); P(11, Y(12), gillL);
  // ---- ближняя рука: короткая, свисает вперёд, перепончатая кисть с тремя когтями
  L(19, Y(19), 20, Y(22), skDD, 3); L(20, Y(22), 22, Y(26), skDD, 3);
  L(20, Y(19), 21, Y(22), sk, 2); L(21, Y(22), 23, Y(26), sk, 2);
  L(20, Y(19), 21, Y(22), skD, 1); L(21, Y(22), 22, Y(26), skD, 1);
  R(23, Y(27), 3, 2, sk); P(23, Y(28), skD);
  P(26, Y(27), claw); P(26, Y(29), claw); P(24, Y(29), claw);
  P(22, Y(23), gloss);

  // набухающий зоб: висит мешком под челюстью, в шаге раздувается
  const sw = f % 2;
  E(22, Y(16) + sw, 5, 3 + sw, pouch);
  E(21, Y(15) + sw, 3, 1, pouchL); P(19, Y(16) + sw, pouchL);
  E(22, Y(19) + sw * 2, 4, 0, pouchD); P(27, Y(17) + sw, pouchD);
  P(32, Y(13), venom); P(33, Y(14), venom); P(31, Y(14) + sw, venom);               // ядовитая пена у пасти

  // капли слизи, стекающие по коже
  for (const [x, y] of [[13, 25], [10, 23], [16, 13]]) { P(x, Y(y), gloss); P(x, Y(y + 1), skL); }

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
  if (kind === 'hound' || kind === 'imp') { // на карте — уменьшенные гончая и бес
    const big = kind === 'hound' ? houndSprite(frame) : impSprite(frame);
    const w = kind === 'hound' ? 15 : 9, hh = kind === 'hound' ? 11 : 12;
    cv = document.createElement('canvas'); cv.width = 12 > w ? 12 : w; cv.height = 17;
    const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; c.drawImage(big, 0, 0, big.width, big.height, 0, 17 - hh, w, hh);
    cache.set(key, cv); return cv;
  }
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
  if (st.armband) R(2, 7, 1, 2, st.armband);
  // голова
  R(3, 2, 4, 4, skin); R(6, 2, 1, 4, shade(skin, -0.2));
  if (st.respirator) { R(3, 3, 4, 3, '#5a5a48'); R(5, 3, 1, 1, '#9ab0a0'); R(5, 5, 1, 2, '#3a3a30'); }
  else if (st.mask) { R(3, 4, 4, 2, '#3a3c30'); R(4, 4, 1, 1, '#9aa080'); }
  else R(5, 3, 1, 1, st.undead ? '#c8ff60' : INK);
  if (st.tanks) R(0, 6, 2, 4, '#5a5e4a');
  if (st.beard) R(3, 5, 4, 1, st.beard);
  if (st.hair && !st.hat) R(3, 1, 4, 2, st.hair);
  if (st.horns) { R(3, 0, 1, 1, st.horns); R(6, 0, 1, 1, st.horns); ppx(c, 2, -1, st.horns); ppx(c, 7, -1, st.horns); }
  if (st.eyes && !st.hood) R(5, 3, 1, 1, st.eyes);
  if (st.longHair && st.hair) { R(2, 2, 1, 5, st.hair); R(7, 2, 1, 4, st.hair); }
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
    case 'knife': R(9, 9, 1, 3, STEEL_L); R(8, 9, 1, 1, BRASS); break;
    case 'pistol': R(9, 8, 3, 1, '#3a3a36'); ppx(c, 11, 8, STEEL_L); break;
    case 'sawnoff': R(8, 9, 4, 1, '#3a3a36'); ppx(c, 11, 8, STEEL_L); break;
    case 'shotgun': R(9, 3, 1, 9, '#4a2e1a'); R(9, 1, 1, 3, '#3a3a36'); break;
    case 'mg': R(9, 2, 1, 10, '#2e302e'); R(8, 6, 3, 2, '#5a5c48'); R(9, 0, 1, 2, STEEL_L); break;
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  outline(cv, INK);
  cache.set(key, cv);
  return cv;
}
