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
  const tBot = st.bare ? 21 : st.puttees ? 22 : size === 's' ? 26 : 25;           // низ шинели (у солдат — короткий мундир)
  const [tx0, tx1] = size === 'b' ? [6, 17] : [7, 16];
  const coat = st.bare ? (st.skin ?? '#6e2a22') : st.coat ?? '#4a4a3e', coatD = shade(coat, -0.38), coatL = shade(coat, 0.16);
  const skin = st.skin ?? '#c8a684', skinD = shade(skin, -0.3);
  const legs = st.bare ? shade(skin, -0.12) : st.legs ?? '#24221c', legsD = shade(legs, -0.3), boot = st.bare ? shade(skin, -0.6) : '#141210'; // у демонов — копыта
  const LB = st.limbs ?? {};
  const COPPER = '#b06a3a', SPARK = '#d8ff70';
  const bob = frame === 1 || frame === 3 ? -1 : 0;
  const sy = (y: number) => y + bob; // всё выше пояса покачивается

  // Фигурка смотрит на зрителя (анфас): голова, плечи и ноги симметричны, свет слева.
  // «Правая» рука/глаз (armR, eyeR) — справа на картинке, в ней оружие; при отражении меняются местами.

  // --- газовые баллоны за спиной: из-за плеч торчат вентили, через грудь — лямки
  if (st.tanks) {
    for (const x of [tx0, tx1 - 1]) { R(x, sy(tTop - 3), 2, 3, '#5a5e4a'); R(x, sy(tTop - 3), 1, 3, '#7a7e66'); R(x, sy(tTop - 4), 2, 1, BRASS); }
    P(tx1 + 1, sy(tTop - 2), '#9fd36a');                                                  // течь — зелёная капля
  }

  // --- ноги / подол. В шаге одна нога поднята (короче на пиксель), корпус покачивается
  const lift = frame === 1 ? -1 : frame === 3 ? 1 : 0;   // -1 — поднята левая, 1 — правая
  const lx = 9, rx = 13;
  if (!st.dress) {
    const lTop = tBot + 1;
    const leg = (x: number, side: -1 | 1, kind: string | undefined) => {
      const bot = SH - (lift === side ? 1 : 0), len = bot - lTop, inner = side < 0 ? x + 1 : x;
      if (kind === 'lost') { R(x, lTop - 1, 2, 2, legs); R(inner, lTop - 1, 1, 2, legsD); return; }   // культя под штаниной
      if (kind === 'pegleg') { R(x, lTop - 1, 2, 3, legs); R(inner, lTop + 2, 1, len - 2, WOOD); P(inner, bot - 1, WOOD_D); return; }
      if (kind === 'springleg') {
        R(x, lTop - 1, 2, 3, legs);
        for (let y = lTop + 2; y < bot - 2; y++) P(x + (y % 2), y, STEEL);              // пружина
        R(x - (side < 0 ? 1 : 0), bot - 2, 3, 2, '#5a5e5a'); return;
      }
      if (kind === 'hydraleg') { R(x, lTop - 1, 2, 3, legs); R(x, lTop + 2, 2, len - 4, '#6e726c'); R(inner, lTop + 3, 1, len - 6, BRASS); R(x - (side < 0 ? 1 : 0), bot - 2, 3, 2, '#4a4e4a'); return; }
      R(x, lTop - 1, 2, len, legs); R(x + 1, lTop - 1, 1, len, legsD);
      if (st.puttees) for (let y = bot - 10; y < bot - 3; y++) { R(x, y, 2, 1, (y & 1) ? st.puttees : shade(st.puttees, -0.25)); P(x + ((y >> 1) & 1), y, shade(st.puttees, 0.15)); } // обмотки по спирали
      R(x, bot - 3, 2, 3, boot); R(x - (side < 0 ? 1 : 0), bot - 1, 3, 1, boot);          // сапог, носок чуть наружу
    };
    leg(lx, -1, LB.legL); leg(rx, 1, LB.legR);
  } else {
    for (let y = tTop; y < SH - 1; y++) {
      const grow = Math.floor((y - tTop) / 4);
      const x0 = tx0 - grow, x1 = tx1 + grow;
      R(x0, sy(y), x1 - x0 + 1, 1, coat);
      R(x0, sy(y), 1, 1, coatL); R(x1 - 1, sy(y), 2, 1, coatD);
    }
    const foot = (x: number, side: -1 | 1, kind: string | undefined) => { if (kind === 'lost' || lift === side) return; R(x, SH - 1, 2, 1, kind === 'pegleg' ? WOOD : kind ? '#5a5e5a' : boot); };
    foot(lx, -1, LB.legL); foot(rx, 1, LB.legR);
  }
  if (LB.legL === 'lost' || LB.legR === 'lost') { pline(c, tx0 - 3, sy(tTop + 1), tx0 - 4, SH - 1, WOOD); R(tx0 - 5, sy(tTop + 1), 3, 1, WOOD_D); } // костыль под мышкой

  // --- корпус
  if (!st.dress) {
    R(tx0 - 1, sy(tTop), tx1 - tx0 + 3, 2, coat);                  // плечи
    R(tx0, sy(tTop + 2), tx1 - tx0 + 1, tBot - tTop - 1, coat);
    R(tx0 - 1, sy(tBot), tx1 - tx0 + 3, 1, coat);                   // расклёшенный подол
    R(tx0, sy(tTop + 1), 1, tBot - tTop, coatL);
    R(tx1 - 1, sy(tTop + 1), 2, tBot - tTop, coatD);
    if (!st.bare) {
      R(12, sy(tTop + 2), 1, tBot - tTop - 1, coatD);               // борт шинели
      for (const yy of [3, 6]) P(11, sy(tTop + yy), coatL);          // пуговицы
    }
  }
  if (st.bare) { // голый торс: грудь, рёбра-мышцы, набедренная повязка вместо подола
    R(tx0 + 2, sy(tTop + 3), 3, 1, coatD); R(tx1 - 4, sy(tTop + 3), 3, 1, coatD);
    for (const yy of [5, 7]) { R(tx0 + 3, sy(tTop + yy), 2, 1, shade(coat, -0.22)); R(tx1 - 4, sy(tTop + yy), 2, 1, shade(coat, -0.22)); }
    R(11, sy(tTop + 4), 2, 5, shade(coat, -0.22)); R(11, sy(tTop + 4), 1, 5, shade(coat, -0.1));
    const lc = st.belt ?? '#2a1a14';
    R(tx0, sy(tBot - 1), tx1 - tx0 + 1, 2, lc); R(10, sy(tBot + 1), 4, 3, lc); R(11, sy(tBot + 4), 2, 1, shade(lc, -0.3));
  }
  if (st.apron) { R(tx0 + 2, sy(tTop + 2), tx1 - tx0 - 3, (st.dress ? SH - 2 : tBot) - tTop - 1, st.apron); P(tx0 + 2, sy(tTop + 1), st.apron); P(tx1 - 2, sy(tTop + 1), st.apron); }
  if (st.cuirass) {
    R(tx0 + 1, sy(tTop + 1), tx1 - tx0 - 1, 7, '#8e9296'); R(tx0 + 1, sy(tTop + 1), 2, 7, '#c0c4c8');
    R(tx0 + 1, sy(tTop + 8), tx1 - tx0 - 1, 1, '#4a4c4e'); R(11, sy(tTop + 2), 2, 5, '#a4a8ac');
  }
  if (st.trim) {
    for (const yy of [2, 4, 6]) { P(11, sy(tTop + yy), st.trim); P(13, sy(tTop + yy), st.trim); }
    R(tx0 - 1, sy(tTop), 2, 1, st.trim); R(tx1, sy(tTop), 2, 1, st.trim);
  }
  if (st.belt) { R(tx0, sy(tTop + 7), tx1 - tx0 + 1, 1, st.belt); R(11, sy(tTop + 7), 2, 1, BRASS); }
  if (st.webbing) { // накладные нагрудные карманы, перекрещенные ремни и подсумки
    R(tx0 + 1, sy(tTop + 2), 3, 2, shade(coat, -0.18)); R(tx1 - 3, sy(tTop + 2), 3, 2, shade(coat, -0.18));
    P(tx0 + 2, sy(tTop + 2), BRASS); P(tx1 - 2, sy(tTop + 2), BRASS);
    pline(c, tx0 + 1, sy(tTop), tx1 - 1, sy(tTop + 6), st.webbing); pline(c, tx1 - 1, sy(tTop), tx0 + 1, sy(tTop + 6), st.webbing);
    R(tx0, sy(tTop + 8), 3, 2, shade(st.webbing, -0.2)); R(tx1 - 2, sy(tTop + 8), 3, 2, shade(st.webbing, -0.2));
  }
  if (st.tanks) { R(tx0 + 2, sy(tTop), 1, 7, '#3a3e30'); R(tx1 - 2, sy(tTop), 1, 7, '#3a3e30'); } // лямки баллонов
  if (st.tabs) { P(10, sy(tTop), st.tabs); P(13, sy(tTop), st.tabs); } // петлицы
  if (st.number) { R(tx0 + 1, sy(tTop + 2), 4, 3, '#d8d4c0'); P(tx0 + 2, sy(tTop + 3), '#2a2a2a'); P(tx0 + 4, sy(tTop + 3), '#2a2a2a'); } // нашивка с номером
  if (st.collar) R(11, sy(tTop), 2, 1, '#e8e4d8');
  if (st.ragged) { // обноски: заплаты другого сукна, прорехи, рваный подол
    R(tx0 + 1, sy(tTop + 3), 2, 2, shade(coat, 0.12)); R(tx1 - 3, sy(tTop + 6), 2, 2, shade(coat, -0.2));
    P(tx0 + 4, sy(tTop + 5), shade(coat, -0.55)); P(tx1 - 2, sy(tTop + 2), shade(coat, -0.55));
    if (!st.dress) for (const xx of [tx0 + 1, tx0 + 4, tx1 - 2]) c.clearRect(xx, sy(tBot), 1, 1);
  }
  if (st.undead) { // истлевшая шинель: дыры, торчащие рёбра, рваный подол
    R(tx0 + 2, sy(tTop + 4), 2, 1, '#d8d4c0'); R(tx0 + 2, sy(tTop + 6), 2, 1, '#d8d4c0'); P(tx0 + 3, sy(tTop + 5), INK);
    if (!st.dress) for (const xx of [tx0, tx0 + 3, tx1 - 1]) c.clearRect(xx, sy(tBot), 1, 1);
    P(tx1 - 2, sy(tTop + 9), shade(coat, -0.55));
  }

  // --- руки по бокам: x — левый столбец рукава, кисть — под рукавом
  const handAt = (x: number, y: number, kind: string | undefined) => {
    if (!kind) { R(x, y, 2, 2, skin); P(x + 1, y + 1, skinD); return; }
    if (kind === 'lost') return;
    if (kind === 'hook') { P(x, y, STEEL); P(x + 1, y + 1, STEEL_L); P(x + 1, y + 2, STEEL); P(x, y + 2, STEEL); return; }
    if (kind === 'hinged') { R(x, y, 2, 2, BRASS); P(x + 1, y + 1, '#7a5a28'); return; }
    if (kind === 'flesh') { R(x, y, 2, 2, '#b89a8a'); P(x, y, '#5a2a2a'); return; }   // чужая кожа, шов
    R(x, y, 2, 2, STEEL); P(x + 1, y + 1, STEEL_L);                                  // стальная кисть
  };
  const arm = (x: number, kind: string | undefined, hand = true) => {
    const y = sy(tTop + 1);
    if (kind === 'lost') { R(x, y, 2, 3, coat); R(x + 1, y, 1, 3, coatD); P(x, y + 3, coatD); return; } // подколотый рукав
    if (kind === 'piston') { R(x, y, 2, 3, coat); R(x, y + 3, 2, 5, '#6e726c'); P(x + 1, y + 4, BRASS); P(x + 1, y + 6, '#4a4e4a'); }
    else if (kind === 'galvanic') { R(x, y, 2, 3, coat); R(x, y + 3, 2, 5, COPPER); for (const k of [3, 5, 7]) P(x, y + k, '#7a4220'); P(x + 1, y + 4, SPARK); }
    else { R(x, y, 2, 8, coat); R(x + 1, y, 1, 8, coatD); if (kind === 'flesh') P(x, y + 7, '#5a2a2a'); }
    if (hand) handAt(x, y + 8, kind);
  };
  const metalL = LB.armL === 'piston' || LB.armL === 'galvanic' || LB.armL === 'lost';
  const ax = tx1 + 1, ay = sy(tTop + 1);
  const aimed = aim && !!st.weapon && AIM.has(st.weapon) && LB.armR !== 'lost';
  const twoHand = aimed && ['rifle', 'musket', 'shotgun', 'mg'].includes(st.weapon!);
  if (twoHand && LB.armL !== 'lost') { // левая рука поддерживает оружие: плечо вниз, предплечье через грудь
    const y = sy(tTop + 1), lc = LB.armL === 'galvanic' ? COPPER : LB.armL === 'piston' ? '#6e726c' : coat;
    R(tx0 - 2, y, 2, 4, coat); R(tx0 - 1, y, 1, 4, coatD);
    pline(c, tx0 - 2, y + 4, tx1 - 6, y + 4, lc, 2);
  } else arm(tx0 - 2, LB.armL);
  if (!metalL && LB.armL !== 'lost') {
    if (st.band) { R(tx0 - 2, sy(tTop + 2), 2, 2, '#e0dcc8'); P(tx0 - 1, sy(tTop + 3), '#a02a20'); }
    if (st.armband) R(tx0 - 2, sy(tTop + 2), 2, 2, st.armband);
  }

  // --- голова
  const hx0 = 9, hy = sy(top);
  const eyeL = hx0 + 1, eyeR = hx0 + 4, ey = hy + 3;
  R(11, hy + 7, 2, 1, skinD);                                        // шея
  if (st.hood) {
    R(8, hy - 2, 8, 10, coat); R(7, hy + 1, 1, 7, coatL); R(16, hy + 1, 1, 7, coatD); R(14, hy - 1, 2, 9, coatD);
    R(10, hy + 2, 4, 5, '#030303');
    P(10, hy + 4, '#b8ff80'); P(13, hy + 4, '#b8ff80');
  } else {
    R(hx0, hy, 6, 6, skin); R(hx0 + 1, hy + 6, 4, 1, skin);          // лицо, подбородок
    R(hx0 + 5, hy, 1, 6, skinD); P(hx0 + 4, hy + 6, skinD);
    if (st.hair) { R(hx0, hy - 1, 6, 2, st.hair); R(hx0, hy + 1, 1, 2, st.hair); R(hx0 + 5, hy + 1, 1, 2, shade(st.hair, -0.15)); }
    if (st.longHair && st.hair) { // женская причёска: чёлка и пряди по обе стороны лица, до плеч
      const hd = shade(st.hair, -0.18), hl = shade(st.hair, 0.15);
      R(hx0 - 1, hy - 1, 8, 1, st.hair); R(hx0, hy, 6, 1, st.hair); P(hx0 + 2, hy, skin); P(hx0 + 1, hy - 1, hl);
      R(hx0 - 1, hy, 2, 10, st.hair); R(hx0 + 5, hy, 2, 10, hd);
      P(hx0 - 1, hy + 2, hl); P(hx0 - 1, hy + 6, hl); P(hx0 + 6, hy + 4, shade(hd, -0.15));
      P(hx0 - 1, hy + 10, hd); P(hx0 + 6, hy + 10, shade(hd, -0.15));
    }
    if (st.beard) {
      R(hx0, hy + 4, 1, 2, st.beard); R(hx0 + 5, hy + 4, 1, 2, shade(st.beard, -0.15));
      R(hx0, hy + 5, 6, 2, st.beard); R(hx0 + 1, hy + 7, 4, 1, st.beard); R(hx0 + 2, hy + 5, 2, 1, shade(st.beard, -0.35));
    }
    const eyeAt = (x: number, kind: string | undefined) => {
      if (kind === 'lost') { R(x - 1, hy + 2, 3, 3, '#141210'); R(hx0, hy + 2, 6, 1, '#141210'); return; }   // повязка с ремешком
      if (kind === 'glasseye') { P(x, ey, '#c8d8e0'); P(x, ey - 1, BRASS); return; }
      if (kind === 'occulteye') { P(x, ey, '#b8ff60'); P(x, ey + 1, '#4a6a2a'); return; }                   // прожилки
      P(x, ey, INK);
    };
    if (st.respirator) { // противогаз: прорезиненная маска, два круглых стекла, фильтр-хобот к сумке на груди
      R(hx0, hy, 6, 7, '#6a6a54'); R(hx0 + 5, hy, 1, 7, '#4e4e40'); R(hx0, hy, 6, 1, '#7a7a62');
      for (const x of [hx0, hx0 + 4]) { R(x, hy + 2, 2, 2, '#c8d8c8'); P(x + 1, hy + 3, '#7a9a8a'); }
      R(hx0 + 2, hy + 5, 2, 2, '#3a3a30'); P(hx0 + 2, hy + 5, '#6a6a58');
      pline(c, hx0 + 3, hy + 7, 12, sy(tTop + 3), '#3a3a30');
      R(10, sy(tTop + 3), 4, 3, '#6a6450'); R(10, sy(tTop + 3), 4, 1, '#7a7460');            // сумка противогаза
    } else if (st.mask) {
      R(hx0, hy + 2, 6, 5, '#2b2d28');
      P(eyeL, ey, '#9fd36a'); P(eyeR, ey, '#9fd36a');
      R(hx0 + 2, hy + 5, 2, 3, '#4a4a44'); P(hx0 + 2, hy + 5, '#6a6a62');
    } else if (st.undead) {
      P(eyeL, ey, '#c8ff60'); P(eyeR, ey, '#c8ff60');                 // светящиеся глаза
      P(eyeL, ey - 1, shade(skin, -0.45)); P(eyeR, ey - 1, shade(skin, -0.45)); // впалые глазницы
      R(hx0 + 1, hy + 5, 4, 1, '#d8d4c0'); P(hx0 + 2, hy + 5, INK); P(hx0 + 4, hy + 5, INK); // оскал
      P(hx0, hy + 1, shade(skin, -0.45)); P(hx0 + 4, hy + 1, shade(skin, -0.45));            // трупные пятна
    } else {
      if (LB.eyeL !== 'lost') eyeAt(eyeL, LB.eyeL);
      eyeAt(eyeR, LB.eyeR);
      if (LB.eyeL === 'lost') eyeAt(eyeL, 'lost');
      if (!st.beard) R(hx0 + 2, hy + 5, 2, 1, skinD);                 // рот
    }
    if (st.mask && st.tanks) { pline(c, hx0 + 2, hy + 8, tx0 + 1, sy(tTop + 2), '#2a2c24'); } // шланг от маски к баллонам
    if (st.goggles) { R(hx0, hy + 1, 6, 1, '#2a2018'); P(eyeL, hy + 1, BRASS); P(eyeR, hy + 1, BRASS); }
    if (st.eyes) { P(eyeL, ey, st.eyes); P(eyeR, ey, st.eyes); }      // горящие глаза
    if (st.horns) { // рога в стороны и вверх
      const hd = shade(st.horns, -0.3);
      R(hx0 + 1, hy - 2, 1, 2, st.horns); P(hx0, hy - 3, st.horns); P(hx0 - 1, hy - 4, hd); P(hx0 - 1, hy - 5, hd);
      R(hx0 + 4, hy - 2, 1, 2, st.horns); P(hx0 + 5, hy - 3, st.horns); P(hx0 + 6, hy - 4, hd); P(hx0 + 6, hy - 5, hd);
    }
    const hc = st.hatC ?? '#222', hcD = shade(hc, -0.35), hcL = shade(hc, 0.18);
    switch (st.hat) {
      case 'cap': // фуражка: тулья, околыш, козырёк над глазами, кокарда по центру
        R(hx0 - 1, hy - 3, 8, 2, hc); R(hx0 - 1, hy - 3, 8, 1, hcL); R(hx0, hy - 1, 6, 1, hcD);
        R(hx0, hy, 6, 1, INK); R(hx0 + 2, hy - 2, 2, 1, BRASS);
        break;
      case 'helmet':
        R(hx0, hy - 3, 6, 1, hcL); R(hx0 - 1, hy - 2, 8, 2, hc); R(hx0 - 1, hy - 2, 1, 2, hcL); R(hx0 - 3, hy, 12, 1, hcD);
        break;
      case 'brodie': // плоская каска «тазиком» с широкими полями
        R(hx0 + 1, hy - 3, 4, 1, hcL); R(hx0, hy - 2, 6, 1, hc); R(hx0 - 1, hy - 1, 8, 1, hc);  // низкий купол
        R(hx0 - 3, hy, 12, 1, hcD); P(hx0 - 3, hy, shade(hc, 0.1)); P(hx0 + 8, hy, shade(hc, 0.1)); // ровные широкие поля
        P(hx0 + 1, hy - 2, hcL);                                                                 // заклёпка
        if (st.tabs) R(hx0, hy - 1, 6, 1, st.tabs);                                              // красная полоса на каске
        break;
      case 'tophat':
        R(hx0, hy - 7, 6, 7, hc); R(hx0, hy - 7, 1, 7, hcL); R(hx0, hy - 2, 6, 1, '#3a2a2a'); R(hx0 - 2, hy, 10, 1, hcD);
        break;
      case 'flatcap': // кепка: плоский верх, короткий козырёк над лбом
        R(hx0 - 1, hy - 2, 8, 2, hc); R(hx0 - 1, hy - 2, 8, 1, hcL); R(hx0, hy, 6, 1, hcD);
        break;
      case 'bonnet': // чепец обрамляет лицо с обеих сторон
        R(hx0 - 1, hy - 2, 8, 2, hc); R(hx0 - 1, hy - 2, 8, 1, hcL); R(hx0 - 1, hy, 1, 8, hc); R(hx0 + 6, hy, 1, 8, hcD);
        break;
      case 'minerhelm':
        R(hx0, hy - 3, 6, 1, hcL); R(hx0 - 1, hy - 2, 8, 2, hc); R(hx0 - 2, hy, 10, 1, hcD); R(hx0 + 2, hy - 2, 2, 1, '#f0d070');
        break;
    }
  }

  // --- правая рука и оружие
  const armR = LB.armR;
  const hand = () => handAt(ax, ay + 8, armR);
  const hx = ax, hy2 = ay + 9; // кисть
  if (aimed) { // боевая стойка: оружие на изготовку к цели — длина и силуэт видны издалека
    const bx = tx1; // ружьё у правого плеча
    const hand2 = (x: number, y: number) => R(x, y, 2, 2, armR ? STEEL : skin);
    const sleeve = (x: number, y: number, w: number) => { R(x, y, w, 2, coat); R(x, y + 1, w, 1, coatD); };
    // светлые, контрастные к тёмным шинелям цвета: ствол — светлая сталь с тёмной нижней кромкой, дерево — рыжее
    const EDGE = SW + 7, steelD = '#4a4e4a', dark = '#2e302e', wood = '#8a5e32', woodD = '#5a3a1e';
    switch (st.weapon) {
      case 'rifle': // приклад у плеча, длинный ствол далеко вперёд, штык
        sleeve(bx, ay + 3, 3); hand2(bx + 3, ay + 3);
        R(bx - 3, ay + 2, 9, 2, wood); R(bx - 3, ay + 3, 9, 1, woodD);
        R(bx + 6, ay + 1, EDGE - bx - 9, 1, STEEL_L); R(bx + 6, ay + 2, EDGE - bx - 9, 1, steelD);
        R(EDGE - 3, ay + 1, 3, 1, '#f0f4ea'); P(EDGE - 1, ay + 2, STEEL_L);
        hand2(bx + 6, ay + 3);
        break;
      case 'musket': // длинное ружьё: всё в рыжем дереве, светлое дуло, без штыка
        sleeve(bx, ay + 3, 3); hand2(bx + 3, ay + 3);
        R(bx - 3, ay + 2, EDGE - bx, 2, wood); R(bx - 3, ay + 3, EDGE - bx, 1, woodD);
        R(bx + 8, ay + 1, EDGE - bx - 9, 1, STEEL); P(EDGE - 2, ay + 1, '#f0f4ea'); P(EDGE - 2, ay + 2, STEEL_L);
        hand2(bx + 8, ay + 3);
        break;
      case 'shotgun': // дробовик: средней длины, толстые сдвоенные стволы
        sleeve(bx, ay + 3, 3); hand2(bx + 3, ay + 3);
        R(bx - 3, ay + 2, 7, 3, wood); R(bx - 3, ay + 4, 7, 1, woodD);
        R(bx + 4, ay + 1, 9, 3, dark); R(bx + 4, ay + 1, 9, 1, STEEL_L); R(bx + 4, ay + 2, 9, 1, STEEL); R(bx + 12, ay + 1, 1, 3, '#f0f4ea');
        hand2(bx + 7, ay + 4);
        break;
      case 'mg': // ручной пулемёт: толстая тёмная коробка, длинный ствол с кожухом, сошки, короб с лентой
        sleeve(bx, ay + 3, 3); hand2(bx + 3, ay + 4);
        R(bx - 3, ay + 2, 6, 3, wood); R(bx - 3, ay + 4, 6, 1, woodD);
        R(bx + 3, ay + 1, 8, 4, dark); R(bx + 3, ay + 1, 8, 1, STEEL);
        R(bx + 11, ay + 1, EDGE - bx - 11, 2, '#5a5e58'); R(bx + 11, ay + 1, EDGE - bx - 11, 1, STEEL_L); P(EDGE - 1, ay + 1, '#f0f4ea');
        pline(c, EDGE - 4, ay + 3, EDGE - 6, ay + 7, dark); pline(c, EDGE - 4, ay + 3, EDGE - 2, ay + 7, dark);
        R(bx + 5, ay + 5, 4, 3, '#5a5c48'); R(bx + 5, ay + 5, 4, 1, '#7a7c64'); P(bx + 4, ay + 7, BRASS); P(bx + 3, ay + 8, BRASS);
        hand2(bx + 9, ay + 4);
        break;
      case 'sawnoff': // обрез у бедра: короткие толстые стволы в сторону цели
        arm(ax, armR, false); hand2(ax, ay + 7);
        R(ax + 2, ay + 6, 6, 3, dark); R(ax + 2, ay + 6, 6, 1, STEEL_L); R(ax + 2, ay + 7, 6, 1, STEEL); R(ax + 7, ay + 6, 1, 3, '#f0f4ea');
        R(ax - 1, ay + 8, 2, 3, wood);
        break;
      case 'pistol': // рука вытянута в сторону цели на уровне плеча, пистолет на конце
        sleeve(ax, ay + 1, 4); hand2(ax + 4, ay + 1);
        R(ax + 5, ay, 4, 2, dark); R(ax + 5, ay, 4, 1, STEEL_L); P(ax + 9, ay, '#f0f4ea'); R(ax + 4, ay + 3, 2, 2, wood);
        break;
      case 'knife': // рука в сторону-вниз, широкий светлый клинок вперёд-вверх
        pline(c, ax, ay + 1, ax + 3, ay + 5, coat, 2); hand2(ax + 3, ay + 5);
        R(ax + 4, ay + 4, 1, 3, BRASS);
        pline(c, ax + 5, ay + 5, ax + 9, ay + 2, STEEL_L, 2); pline(c, ax + 5, ay + 4, ax + 9, ay + 1, '#f0f4ea'); P(ax + 10, ay + 1, '#f0f4ea');
        break;
    }
    if (twoHand && LB.armL !== 'lost') handAt(tx1 - 4, ay + 3, LB.armL);   // левая кисть под прикладом
    outline(cv, INK);
    return cv;
  }
  arm(ax, armR, false);
  if (st.sash && armR !== 'lost') R(ax, ay + 1, 2, 2, '#7fb04a');
  const holster = (h: number) => R(tx0 - 1, sy(tTop + 11), 2, h, '#2a1d12');   // кобура/ножны на левом бедре
  switch (armR === 'lost' && !['rifle', 'musket', 'bag'].includes(st.weapon ?? '') ? undefined : st.weapon) {
    case 'saber': // сабля опущена вдоль ноги
      pline(c, hx + 1, hy2 + 1, hx + 3, hy2 + 9, STEEL); pline(c, hx + 2, hy2 + 1, hx + 4, hy2 + 8, STEEL_L);
      R(hx - 1, hy2 + 1, 4, 1, BRASS); hand(); holster(5);
      break;
    case 'knife': // широкий клинок вниз, латунная гарда, блик по лезвию
      R(hx - 1, hy2 + 1, 4, 1, BRASS);
      pline(c, hx, hy2 + 2, hx + 2, hy2 + 6, STEEL); pline(c, hx + 1, hy2 + 2, hx + 3, hy2 + 6, STEEL_L); P(hx + 3, hy2 + 7, STEEL_L);
      hand();
      break;
    case 'pistol': // пистолет в опущенной руке стволом вниз
      R(hx, hy2 + 1, 2, 4, '#2a2a28'); R(hx, hy2 + 1, 1, 4, '#5a5a56'); P(hx, hy2 + 5, STEEL_L);
      hand(); holster(3);
      break;
    case 'sawnoff': // обрез в опущенной руке: короткие сдвоенные стволы вниз и чуть в сторону
      pline(c, hx, hy2 + 1, hx + 2, hy2 + 7, '#2e2e2a', 2); pline(c, hx, hy2 + 1, hx + 1, hy2 + 7, '#6a6a64');
      P(hx + 2, hy2 + 8, STEEL_L); R(hx - 1, hy2 - 1, 2, 2, '#5a3a22');
      hand();
      break;
    case 'rifle': case 'musket': case 'shotgun': { // ружьё у ноги «к ноге»: приклад на земле, ствол выше плеча
      const gx = ax + 2, top0 = sy(tTop - (st.weapon === 'shotgun' ? 3 : 7));
      const wood = st.weapon === 'musket' ? '#6a4626' : st.weapon === 'shotgun' ? '#4a2e1a' : WOOD;
      const stockTop = st.weapon === 'musket' ? top0 + 3 : sy(tTop + 8);
      R(gx - 1, stockTop, 2, SH - 1 - stockTop, wood); R(gx, stockTop, 1, SH - 1 - stockTop, WOOD_D); R(gx - 1, SH - 1, 2, 1, '#1a1410');
      R(gx, top0, 1, stockTop - top0, st.weapon === 'shotgun' ? '#2e2e2a' : STEEL);
      if (st.weapon === 'shotgun') R(gx - 1, top0, 1, stockTop - top0, '#5a5a56');
      if (st.weapon === 'rifle') R(gx, top0 - 4, 1, 4, STEEL_L);                                   // штык
      hand();
      break;
    }
    case 'mg': { // пулемёт на ремне через грудь, ствол над правым плечом
      pline(c, tx0 + 1, sy(tBot - 2), tx1 + 3, sy(tTop - 6), '#2e302e', 2); pline(c, tx0 + 2, sy(tBot - 2), tx1 + 3, sy(tTop - 5), '#6a6e68');
      R(11, sy(tTop + 5), 4, 3, '#5a5c48'); R(11, sy(tTop + 5), 4, 1, '#7a7c64');
      hand();
      break;
    }
    case 'fork':
      R(hx + 1, 2, 1, SH - 2, WOOD); R(hx, 2, 3, 1, STEEL); R(hx, 0, 1, 2, STEEL); R(hx + 1, 0, 1, 2, STEEL); R(hx + 2, 0, 1, 2, STEEL);
      hand();
      break;
    case 'goad': R(hx + 1, 1, 1, SH - 1, WOOD); P(hx + 1, 0, STEEL_L); hand(); break;
    case 'pole': pline(c, hx + 1, SH - 1, hx + 3, 1, WOOD); P(hx + 3, 0, '#f0a040'); hand(); break;
    case 'staff':
      R(hx + 1, 4, 1, SH - 4, '#2a2018'); R(hx, 1, 3, 3, '#7ad050'); P(hx + 1, 2, '#e8ffc0'); hand();
      break;
    case 'hammer':
      pline(c, hx + 1, hy2 + 1, hx + 2, hy2 - 9, WOOD); R(hx - 1, hy2 - 12, 6, 3, '#4a4a48'); R(hx - 1, hy2 - 12, 6, 1, '#6a6a68'); hand();
      break;
    case 'wrench': pline(c, hx + 1, hy2 + 1, hx + 2, hy2 + 7, STEEL); P(hx + 3, hy2 + 7, STEEL); P(hx + 1, hy2 + 8, STEEL); hand(); break;
    case 'bag': R(hx - 1, hy2 + 1, 4, 4, '#2a1a12'); P(hx + 1, hy2 + 1, BRASS); hand(); break;
    case 'grenade': // граната с длинной ручкой, занесённая для броска
      pline(c, hx + 1, hy2 + 1, hx + 1, hy2 - 5, WOOD); R(hx, hy2 - 9, 3, 4, '#4a4e40'); R(hx, hy2 - 9, 3, 1, '#6a6e5a'); P(hx + 1, hy2 - 10, STEEL_L); hand(); break;
    case 'shovel': // окопная лопата-дубина с заточенным краем
      pline(c, hx + 1, hy2 + 1, hx + 2, hy2 - 10, WOOD); R(hx, hy2 - 15, 5, 5, STEEL); R(hx, hy2 - 15, 5, 1, STEEL_L); P(hx + 4, hy2 - 11, '#5a2a1a'); hand();
      break;
    case 'book': R(hx - 1, hy2 - 1, 4, 5, '#4a1a14'); R(hx - 1, hy2 - 1, 1, 5, '#d8c8a0'); hand(); break;
    case 'bottle': R(hx, hy2 + 1, 2, 4, '#3d6a3a'); P(hx, hy2 + 5, '#2a2018'); hand(); break;
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
  // голова повёрнута к зрителю: широкий лоб, два горящих глаза, морда с пастью и клыками, рога-уши в стороны
  R(20, 5, 8, 6, body); R(20, 5, 8, 1, bodyL); R(27, 5, 1, 6, bodyD);
  R(21, 11, 6, 2, body); R(22, 13, 4, 1, bodyD);
  ppx(c, 22, 8, '#ffb040'); ppx(c, 25, 8, '#ffb040'); ppx(c, 22, 7, bodyD); ppx(c, 25, 7, bodyD);
  R(23, 10, 2, 1, '#120606');                                          // нос
  R(22, 12, 4, 1, '#8a1a10'); ppx(c, 22, 13, bone); ppx(c, 25, 13, bone);   // пасть, клыки
  ppx(c, 20, 4, bone); ppx(c, 19, 3, bone); ppx(c, 18, 2, shade(bone, -0.2));
  ppx(c, 27, 4, bone); ppx(c, 28, 3, bone); ppx(c, 29, 2, shade(bone, -0.2));
  outline(cv, INK);
  return cv;
}
/** Бес анфас: перепончатые крылья по обе стороны, рога, жёлтые глаза, хвост с наконечником. */
function impSprite(frame: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
  const c = cv.getContext('2d')!;
  const R = (x: number, y: number, w: number, h: number, col: string) => prect(c, x, y, w, h, col);
  const RR = (x: number, y: number, w: number, h: number, col: string, colR = col) => { R(x, y, w, h, col); R(SW - x - w, y, w, h, colR); };
  const up = frame % 2 ? 2 : 0, body = '#6a1e16', bodyD = '#3a0e0a', wing = '#2a0d0d', wingL = '#4a1814', bone = '#d8c8a0';
  // крылья: распахнуты в стороны, в взмахе поднимаются
  RR(2, 11 - up, 6, 2, wing); RR(1, 9 - up, 3, 2, wing); RR(0, 7 - up, 2, 2, wing); RR(3, 13, 5, 3, wing); RR(5, 16, 3, 2, wing);
  RR(2, 11 - up, 4, 1, wingL);
  // тело и ноги (в шаге одна нога поджата)
  R(8, 16, 8, 9, body); R(14, 16, 2, 9, bodyD); R(11, 18, 2, 5, shade(body, -0.2));
  R(9, 25, 2, frame === 1 ? 3 : 4, body); R(13, 25, 2, frame === 3 ? 3 : 4, bodyD);
  // руки с когтями
  R(6, 17, 2, 6, body); R(16, 17, 2, 6, bodyD); ppx(c, 6, 23, bone); ppx(c, 7, 23, bone); ppx(c, 16, 23, bone); ppx(c, 17, 23, bone);
  // голова, рога, глаза, пасть с клыками
  R(9, 10, 6, 6, body); R(14, 10, 1, 6, bodyD);
  RR(9, 7, 1, 3, bone); ppx(c, 8, 6, bone); ppx(c, 15, 6, bone);
  ppx(c, 10, 12, '#eaff7a'); ppx(c, 13, 12, '#eaff7a');
  R(10, 14, 4, 1, '#1a0606'); ppx(c, 10, 14, bone); ppx(c, 13, 14, bone);
  // хвост в сторону, наконечник-стрелка
  pline(c, 14, 24, 19, 27, body); ppx(c, 20, 26, bodyD); ppx(c, 20, 28, bodyD); ppx(c, 21, 27, bodyD);
  outline(cv, INK);
  return cv;
}

/** Морской демон: громадная саламандра на двух ногах, выше человека, стоит к зрителю лицом.
 *  Сутулые плечи-горб выше головы с зубчатым гребнем, плоская широкая голова с пастью во всю ширину,
 *  глаза навыкате по краям макушки, наружные жабры по обе стороны, под челюстью набухающий зоб,
 *  светлое брюхо в складках, перепончатые лапы с когтями, хвост лежит на земле сбоку. 34×44.
 *  Кадры: 0 и 2 — стойка, 1 и 3 — шаг с покачиванием (зоб раздувается). */
function salamanderSprite(frame: number): HTMLCanvasElement {
  const W = 34;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = 44;
  const c = cv.getContext('2d')!;
  const R = (x: number, y: number, w: number, h: number, col: string) => prect(c, x, y, w, h, col);
  const P = (x: number, y: number, col: string) => ppx(c, x, y, col);
  const L = (x0: number, y0: number, x1: number, y1: number, col: string, w = 1) => pline(c, x0, y0, x1, y1, col, w);
  // зеркальные помощники: правая половина — отражение левой (ось между 16 и 17), справа можно дать тень
  const RR = (x: number, y: number, w: number, h: number, col: string, colR = col) => { R(x, y, w, h, col); R(W - x - w, y, w, h, colR); };
  const PP = (x: number, y: number, col: string, colR = col) => { P(x, y, col); P(W - 1 - x, y, colR); };
  const LL = (x0: number, y0: number, x1: number, y1: number, col: string, w = 1, colR = col) => { L(x0, y0, x1, y1, col, w); L(W - 1 - x0, y0, W - 1 - x1, y1, colR, w); };
  const row = (y: number, hw: number, col: string) => R(17 - hw, y, hw * 2, 1, col);   // симметричная строка полушириной hw

  const sk = '#3b5a36', skD = '#223820', skDD = '#142212', skL = '#5c7e4e', gloss = '#a6d494';
  const belly = '#a4aa6e', bellyD = '#7a7e4c';
  const crest = '#5a2226', crestL = '#8e3838', gill = '#b24444', gillL = '#e27a74';
  const pouch = '#c2b482', pouchD = '#8a8252', pouchL = '#e4daa8';
  const eye = '#f2ea5a', claw = '#e0d8b4', mouth = '#150a0c', venom = '#8ce46c';

  const f = ((frame % 4) + 4) % 4;
  const lift = f === 1 ? -1 : f === 3 ? 1 : 0;     // в шаге поднята левая (-1) или правая (1) лапа
  const bob = f % 2 ? -1 : 0;
  const Y = (y: number) => y + bob;
  const sway = f === 1 ? 1 : f === 3 ? -1 : 0;     // кончик хвоста ходит

  // ---- хвост: от крестца уходит влево и лежит на земле, сужаясь к кончику
  const tail: [number, number, number][] = [[11, 36, 3], [8, 38, 3], [5, 40, 2], [3, 41, 1], [1, 41 + sway, 1]];
  for (const [x, y, r] of tail) pellipse(c, x, y, r, Math.min(r, 2), sk);
  for (const [x, y, r] of tail) R(x - r, y + Math.min(r, 2), r * 2 + 1, 1, skD);
  for (const [x, y] of [[9, 35], [6, 37], [4, 39]]) { P(x, y, crest); P(x, y - 1, crestL); }

  // ---- гребень над плечами: зубцы перепонки торчат над горбом
  for (let x = 6; x <= 27; x += 3) { const h = 3 - Math.round(Math.abs(x - 16.5) / 5); R(x, Y(5 - h), 2, h + 2, crest); P(x, Y(5 - h), crestL); }
  // ---- горб-плечи: шире головы, выше её верха
  for (let y = 5; y <= 15; y++) row(Y(y), Math.round(12 * Math.sqrt(Math.max(0, 1 - ((y - 13) ** 2) / 70))), skD);
  RR(7, Y(6), 4, 1, sk, skD); PP(8, Y(6), skL, sk);

  // ---- ноги: широкая стойка, колени наружу, перепончатые ступни
  for (const side of [-1, 1] as const) {
    const up = lift === side ? 1 : 0, x = side < 0 ? 9 : 22, col = side < 0 ? sk : skD;
    L(x + (side < 0 ? 3 : 0), Y(31), x + (side < 0 ? 0 : 3) - side, Y(35), col, 4);          // бедро
    L(x + 1, Y(35), x + 1, 39 - up, col, 3);                                                  // голень
    R(x - 2, 40 - up, 7, 2, col); R(x - 2, 41 - up, 7, 1, side < 0 ? skD : skDD);             // ступня
    for (const k of [-2, 0, 2, 4]) P(x + k, 42 - up, claw);                                   // когти к зрителю
  }

  // ---- туловище: бочка, к поясу сужается
  for (let y = 15; y <= 33; y++) row(Y(y), Math.round(9 - Math.max(0, y - 24) * 0.3), sk);
  R(8, Y(16), 2, 14, skL); R(24, Y(16), 2, 14, skD);                                           // свет слева, тень справа
  // светлое брюхо со складками
  for (let y = 18; y <= 33; y++) row(Y(y), Math.round(6 - Math.abs(y - 26) * 0.22), belly);
  for (let y = 19; y <= 33; y += 2) row(Y(y), Math.round(6 - Math.abs(y - 26) * 0.22), bellyD);
  R(22, Y(19), 1, 14, bellyD);

  // ---- руки: свисают по бокам, перепончатые кисти с тремя когтями
  LL(6, Y(15), 4, Y(23), skDD, 4, skDD); LL(4, Y(23), 5, Y(28), skDD, 4, skDD);
  LL(6, Y(15), 4, Y(23), sk, 2, skD); LL(4, Y(23), 5, Y(28), sk, 2, skD); R(3, Y(29), 4, 2, sk); R(27, Y(29), 4, 2, skD);
  for (const x of [3, 5, 7]) PP(x - (x === 7 ? 1 : 0), Y(31), claw);
  PP(5, Y(18), gloss, skL);

  // ---- голова: плоская, широкая, пасть во всю ширину
  RR(8, Y(8), 9, 7, sk, sk); R(8, Y(8), 18, 1, skL); R(10, Y(9), 12, 1, shade(sk, 0.12)); R(24, Y(9), 2, 6, skD);
  P(12, Y(8), gloss); P(13, Y(8), gloss); P(19, Y(9), gloss);
  R(9, Y(13), 16, 1, mouth); PP(8, Y(12), mouth);                                                // пасть с опущенными уголками
  for (const x of [11, 14, 19, 22]) P(x, Y(13), claw);                                           // зубы
  R(9, Y(14), 16, 1, shade(sk, -0.12)); R(10, Y(15), 14, 1, skD); R(11, Y(16), 12, 1, skDD);                                 // нижняя челюсть
  PP(15, Y(10), skD);                                                                             // ноздри
  // глаза навыкате по краям макушки
  RR(8, Y(5), 4, 3, skD); RR(9, Y(5), 2, 2, eye); PP(10, Y(6), mouth); PP(9, Y(4), skL, skD);
  // наружные жабры: по три мясистых отростка с каждой стороны головы
  LL(8, Y(8), 4, Y(5), gill); LL(8, Y(10), 3, Y(9), gill); LL(8, Y(12), 4, Y(14), gill);
  for (const [x, y] of [[4, 5], [3, 4], [5, 4], [3, 9], [2, 8], [2, 10], [4, 14], [3, 15], [3, 13]]) PP(x, Y(y), gillL);

  // ---- зоб под челюстью, в шаге раздувается
  const sw = f % 2;
  pellipse(c, 16, Y(18) + sw, 5, 3 + sw, pouch);
  pellipse(c, 15, Y(17) + sw, 3, 1, pouchL);
  R(12, Y(21) + sw * 2, 9, 1, pouchD); P(21, Y(18) + sw, pouchD);
  P(8, Y(14), venom); P(25, Y(14), venom); P(26, Y(15) + sw, venom);                              // ядовитая пена в уголках пасти

  // капли слизи
  for (const [x, y] of [[9, 24], [24, 21], [12, 30]]) { P(x, Y(y), gloss); P(x, Y(y + 1), skL); }

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
  cv = document.createElement('canvas'); cv.width = 13; cv.height = 17;   // анфас: корпус 7 пикселей, голова 5, оружие справа
  const c = cv.getContext('2d')!;
  c.translate(1, 1);
  const R = (x: number, y: number, w: number, h: number, col: string) => prect(c, x, y, w, h, col);
  const coat = st.bare ? (st.skin ?? '#6e2a22') : st.coat ?? '#4a4232', legs = st.bare ? shade(coat, -0.15) : st.legs ?? shade(coat, -0.4), skin = st.skin ?? '#c4ac90';
  const step = frame === 1 ? -1 : frame === 3 ? 1 : 0;   // в шаге поднята одна нога
  // ноги
  if (st.dress) { R(2, 10, 7, 4, shade(coat, -0.15)); if (step >= 0) R(3, 14, 2, 1, INK); if (step <= 0) R(6, 14, 2, 1, INK); }
  else { R(3, 11, 2, step < 0 ? 2 : 3, legs); R(6, 11, 2, step > 0 ? 2 : 3, legs); R(4, 11, 1, 3, shade(legs, -0.25)); R(7, 11, 1, 3, shade(legs, -0.25)); }
  // корпус и руки
  R(2, 6, 7, 5, coat); R(2, 6, 1, 5, shade(coat, 0.18)); R(8, 6, 1, 5, shade(coat, -0.25));
  R(1, 7, 1, 3, shade(coat, -0.1)); R(9, 7, 1, 3, shade(coat, -0.3)); R(1, 10, 1, 1, skin); R(9, 10, 1, 1, skin);
  if (st.apron) R(3, 8, 5, 4, st.apron);
  if (st.belt) R(2, 9, 7, 1, st.belt);
  if (st.trim) { R(4, 6, 1, 3, st.trim); R(6, 6, 1, 3, st.trim); }
  if (st.sash) R(9, 7, 1, 1, '#7a2020');
  if (st.number) R(3, 7, 2, 1, '#d8d4c0');
  if (st.armband) R(1, 7, 1, 2, st.armband);
  if (st.tanks) { R(2, 4, 1, 2, '#5a5e4a'); R(8, 4, 1, 2, '#5a5e4a'); }
  // голова
  R(3, 2, 5, 4, skin); R(7, 2, 1, 4, shade(skin, -0.2));
  if (st.respirator) { R(3, 2, 5, 4, '#5a5a48'); R(4, 3, 1, 1, '#9ab0a0'); R(6, 3, 1, 1, '#9ab0a0'); R(5, 5, 1, 2, '#3a3a30'); }
  else if (st.mask) { R(3, 3, 5, 3, '#3a3c30'); R(4, 3, 1, 1, '#9aa080'); R(6, 3, 1, 1, '#9aa080'); }
  else { const e = st.undead ? '#c8ff60' : INK; R(4, 3, 1, 1, e); R(6, 3, 1, 1, e); }
  if (st.beard) R(3, 5, 5, 1, st.beard);
  if (st.hair && !st.hat) R(3, 1, 5, 2, st.hair);
  if (st.horns) { R(4, 0, 1, 1, st.horns); R(6, 0, 1, 1, st.horns); ppx(c, 3, -1, st.horns); ppx(c, 7, -1, st.horns); }
  if (st.eyes && !st.hood) { R(4, 3, 1, 1, st.eyes); R(6, 3, 1, 1, st.eyes); }
  if (st.longHair && st.hair) { R(2, 2, 1, 5, st.hair); R(8, 2, 1, 5, shade(st.hair, -0.15)); R(3, 1, 5, 1, st.hair); }
  if (st.hood) { R(2, 1, 7, 2, coat); R(2, 2, 1, 4, coat); R(8, 2, 1, 4, coat); R(3, 3, 5, 2, '#000'); R(4, 3, 1, 1, '#9fef6a'); R(6, 3, 1, 1, '#9fef6a'); }
  const hc = st.hatC ?? '#2a2620';
  switch (st.hat) {
    case 'cap': R(3, 0, 5, 2, hc); R(3, 2, 5, 1, INK); R(5, 1, 1, 1, BRASS); break;
    case 'flatcap': R(3, 1, 5, 1, hc); R(2, 2, 7, 1, shade(hc, -0.3)); break;
    case 'brodie': R(0, 2, 11, 1, shade(hc, -0.3)); R(3, 1, 5, 1, hc); R(4, 0, 3, 1, hc); if (st.tabs) R(3, 1, 5, 1, st.tabs); break;
    case 'helmet': case 'minerhelm': R(2, 1, 7, 2, hc); R(3, 0, 5, 1, hc); R(2, 2, 7, 1, shade(hc, -0.3)); if (st.hat === 'minerhelm') R(5, 1, 1, 1, '#f0d080'); break;
    case 'tophat': R(3, -1, 5, 3, hc); R(2, 2, 7, 1, hc); break;
    case 'bonnet': R(2, 1, 7, 2, hc); R(2, 2, 1, 4, hc); R(8, 2, 1, 4, hc); break;
  }
  // оружие — в правой руке
  switch (st.weapon) {
    case 'rifle': case 'musket': R(10, 3, 1, 11, WOOD); R(10, 1, 1, 3, STEEL); break;
    case 'fork': case 'staff': case 'pole': case 'goad': R(10, 1, 1, 13, WOOD); if (st.weapon === 'fork') { R(9, 0, 1, 2, STEEL); R(10, 0, 1, 1, STEEL); R(11, 0, 1, 2, STEEL); } if (st.weapon === 'staff') R(10, 0, 1, 2, '#7ad050'); break;
    case 'saber': R(10, 10, 1, 4, STEEL_L); R(9, 10, 1, 1, BRASS); break;
    case 'hammer': case 'wrench': case 'shovel': R(10, 6, 1, 5, WOOD); R(10, 5, 2, 2, STEEL); break;
    case 'bag': R(9, 10, 2, 3, '#6a5a3a'); break;
    case 'grenade': R(10, 6, 1, 4, WOOD); R(10, 4, 2, 2, '#4a4e40'); break;
    case 'knife': R(10, 11, 1, 2, STEEL_L); R(10, 10, 1, 1, BRASS); break;
    case 'pistol': R(10, 10, 1, 2, '#3a3a36'); break;
    case 'sawnoff': R(10, 10, 1, 3, '#3a3a36'); ppx(c, 10, 13, STEEL_L); break;
    case 'shotgun': R(10, 3, 1, 11, '#4a2e1a'); R(10, 1, 1, 3, '#3a3a36'); break;
    case 'mg': R(10, 2, 1, 10, '#2e302e'); R(9, 6, 2, 2, '#5a5c48'); R(10, 0, 1, 2, STEEL_L); break;
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  outline(cv, INK);
  cache.set(key, cv);
  return cv;
}
