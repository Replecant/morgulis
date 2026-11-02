// ============================================================
//  Пиксельное окружение: земля, рельсы, постройки и объекты.
//  Всё рисуется в низком разрешении, клетка T = 20 px.
// ============================================================
import { T, prect, ppx, pline, pellipse, shade, outline, seeded } from './px';

type Ctx = CanvasRenderingContext2D;
export interface PxLight { x: number; y: number; r: number; color: string; a?: number }

const INK = '#0c0e0a', BRASS = '#c8a050', AMBER = '#e0a848', AMBER_D = '#9a6a28';

// ============================================================ земля
const GROUND: Record<string, string[]> = {
  w: ['#55554a', '#51514a', '#59584c', '#4d4d44'],     // пустошь
  g: ['#4e483c', '#4a4438', '#524c40', '#46413a'],     // деревенская земля
  r: ['#5a5040', '#564c3c', '#5e5444', '#524838'],     // дорога
  p: ['#43382a', '#3e3426', '#473c2e', '#3a3022'],     // загон
  o: ['#3a3832', '#36342e', '#3e3c36', '#32302a'],     // масляная земля
  m: ['#363a2a', '#323626', '#3a3e2c', '#2e3224'],     // мох
};

/** Нарисовать клетку земли. horiz — дорога идёт горизонтально (для колеи). */
export function paintTile(c: Ctx, X: number, Y: number, g: string, r: () => number, horiz = true) {
  if (g === 'f') { prect(c, X, Y, T, T, '#12110e'); return; }
  if (g === 'k') { // дощатый перрон
    prect(c, X, Y, T, T, '#5a4630');
    for (let x = 0; x < T; x += 5) { prect(c, X + x, Y, 1, T, '#3a2c1c'); ppx(c, X + x + 2, Y + 3, '#7a6040'); ppx(c, X + x + 2, Y + 15, '#2a1e12'); }
    return;
  }
  if (g === 'l') { // озёрная вода: тёмная, с рябью
    prect(c, X, Y, T, T, '#1a2628');
    for (let i = 0; i < 7; i++) { const x = X + r() * (T - 4), y = Y + r() * T; prect(c, x, y, 3, 1, r() < 0.3 ? '#4a6a68' : '#26383a'); }
    return;
  }
  if (g === 'x') { // болотная вода
    prect(c, X, Y, T, T, '#16201a');
    for (let i = 0; i < 6; i++) ppx(c, X + r() * T, Y + r() * T, '#243428');
    if (r() < 0.5) prect(c, X + 3 + r() * 10, Y + 5 + r() * 10, 4, 1, '#4a6a4a');
    if (r() < 0.25) for (let i = 0; i < 3; i++) prect(c, X + 4 + r() * 12, Y + 8 + r() * 6, 1, 5, '#3e5230');
    return;
  }
  const pal = GROUND[g] ?? GROUND.w;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = r();
    const col = v < 0.06 ? shade(pal[0], -0.22) : v > 0.97 ? shade(pal[2], 0.14) : pal[(v * 37) & 3];
    c.fillStyle = col; c.fillRect(X + x, Y + y, 1, 1);
  }
  if (g === 'r') { // колея
    const d = shade(pal[3], -0.22);
    if (horiz) { prect(c, X, Y + 5, T, 2, d); prect(c, X, Y + 13, T, 2, d); }
    else { prect(c, X + 5, Y, 2, T, d); prect(c, X + 13, Y, 2, T, d); }
    for (let i = 0; i < 3; i++) ppx(c, X + r() * T, Y + r() * T, '#7a6e58');
  }
  if ((g === 'w' || g === 'g') && r() < 0.35) { // трещины
    let x = X + r() * T, y = Y + r() * T;
    for (let k = 0; k < 4; k++) { const nx = x + (r() - 0.5) * 7, ny = y + (r() - 0.5) * 7; pline(c, x, y, nx, ny, shade(pal[0], -0.32)); x = nx; y = ny; }
  }
  if ((g === 'w' || g === 'g') && r() < 0.18) { // сухая трава
    const x = X + 3 + r() * 13, y = Y + 6 + r() * 12;
    ppx(c, x, y, '#6a6440'); ppx(c, x + 1, y - 1, '#6a6440'); ppx(c, x - 1, y - 1, '#5a5636'); ppx(c, x + 2, y, '#5a5636');
  }
  if (g === 'p' && r() < 0.5) { prect(c, X + r() * 15, Y + r() * 16, 3, 2, '#2a2218'); }
  if (g === 'o') { prect(c, X + 3 + r() * 10, Y + 4 + r() * 10, 3, 1, '#4a5e44'); }
  if (g === 'm' && r() < 0.2) { const x = X + 4 + r() * 12, y = Y + 6 + r() * 10; ppx(c, x, y + 1, '#d8d0b0'); prect(c, x - 1, y, 3, 1, '#c8c0a0'); }
}

export function paintRail(c: Ctx, X: number, Y: number) {
  for (let x = 0; x < T; x += 5) prect(c, X + x + 1, Y + 4, 3, 12, '#3a2c1e');
  prect(c, X, Y + 6, T, 1, '#8a8a82'); prect(c, X, Y + 13, T, 1, '#8a8a82');
  prect(c, X, Y + 7, T, 1, '#4a4a44'); prect(c, X, Y + 14, T, 1, '#4a4a44');
}

// ============================================================ объекты
/** Сколько пикселей спрайт выступает вверх за свою клетку. */
const TOP: Record<string, number> = {
  house: 16, ruin: 16, farm: 16, station: 20, pumphouse: 28, slaughter: 16, barn: 14, hut: 16,
  tank: 18, watertower: 44, wagon: 14, lamp: 30, tree: 26, rock: 6, barrel: 6, fence: 10, feed: 8, chitin: 6,
  cellar: 10, adit: 26, shroombed: 6, bigshroom: 18, rack: 14, wall: 30, gate: 40, railgate: 36, tower: 56,
  sign: 16, wire: 8, cell: 16, orecart: 8, boat: 4, nets: 20, scrapheap: 16, banner: 46, poster: 24, statue: 44, horn: 40, keep: 76, barracks: 22, laundry: 22, handcart: 12, crates: 14, coalheap: 8, standpipe: 18, noticeboard: 22, sacks: 8, vent: 4, clinic: 30, shack: 18, factory: 64, tenement: 30, stall: 18, workshop: 26, crater: 0, bones: 0, wallruin: 14, skeleton: 14, milestone: 14, lorry: 12,
};

export interface ObjLike { kind: string; x: number; y: number; w: number; h: number; seed: number; ruinKind?: string; boarded?: boolean }

/** Спрайт объекта: холст + смещение + источники света (в пикселях относительно левого верхнего угла клетки). */
export function objSprite(o: ObjLike, neighbors?: { horizFence: boolean }) {
  const top = TOP[o.kind] ?? 12, pad = 6;
  const W = o.w * T, H = o.h * T;
  const cv = document.createElement('canvas'); cv.width = W + pad * 2; cv.height = H + top + pad;
  const c = cv.getContext('2d')!;
  c.translate(pad, top);
  const r = seeded(o.seed * 7919 + 17);
  const lights: PxLight[] = [];
  const R = (x: number, y: number, w: number, h: number, col: string) => prect(c, x, y, w, h, col);
  const P = (x: number, y: number, col: string) => ppx(c, x, y, col);
  const L = (x0: number, y0: number, x1: number, y1: number, col: string, w = 1) => pline(c, x0, y0, x1, y1, col, w);
  let doOutline = true;

  switch (o.kind) {
    case 'house': case 'ruin': case 'farm': case 'station': case 'pumphouse': case 'slaughter': {
      const ruined = o.kind === 'ruin';
      const wallH = 22, wy = H - wallH;
      const wall = { house: '#8a7656', farm: '#8a7656', ruin: '#6e604a', station: '#7a4232', pumphouse: '#6a6c66', slaughter: '#767060' }[o.kind]!;
      R(1, H, W, 2, 'rgba(0,0,0,0.5)');
      R(0, wy, W, wallH, wall);
      if (o.kind === 'station' || o.kind === 'slaughter') {        // кирпич / камень
        for (let y = wy + 2; y < H; y += 3) for (let x = ((y / 3) | 0) % 2 ? 0 : 2; x < W; x += 5) R(x, y, 4, 1, shade(wall, -0.18));
      } else if (o.kind === 'pumphouse') {                         // гофрожелезо
        for (let x = 1; x < W; x += 3) R(x, wy, 1, wallH, shade(wall, -0.25));
      } else {                                                     // фахверк
        for (let x = 0; x <= W - 2; x += 8) R(x, wy, 2, wallH, '#2e2216');
        R(0, wy, W, 2, '#2e2216'); R(0, wy + 10, W, 2, '#2e2216');
        for (let x = 0; x < W - 8; x += 16) L(x + 2, H - 1, x + 8, wy + 11, '#2e2216', 2);
      }
      R(0, wy, 1, wallH, shade(wall, 0.15));
      // окна
      const nWin = Math.max(1, Math.floor(o.w / 2));
      const lit = !ruined && !o.boarded && o.kind !== 'slaughter' && r() < 0.8;
      for (let i = 0; i < nWin; i++) {
        const cx = Math.round(((i + 0.5) * W) / nWin + (i === 0 ? -8 : 8)), cy = wy + 4;
        const on = lit && (i === 0 || r() < 0.5);
        R(cx - 3, cy, 7, 6, ruined ? '#0a0b0a' : on ? AMBER : '#1a1c20');
        if (!ruined) { R(cx, cy, 1, 6, '#2a1e12'); R(cx - 3, cy + 2, 7, 1, '#2a1e12'); if (on) R(cx - 2, cy + 3, 2, 2, '#f8d888'); }
        else { L(cx - 3, cy, cx + 3, cy + 5, '#5a4028'); L(cx + 3, cy, cx - 3, cy + 5, '#5a4028'); }
        if (o.boarded) { R(cx - 4, cy + 1, 9, 2, '#6a5034'); R(cx - 4, cy + 4, 9, 1, '#5a4228'); P(cx - 3, cy + 1, '#8a6a44'); } // доски на окнах
        R(cx - 4, cy + 6, 9, 1, shade(wall, -0.35));
        if (on) lights.push({ x: cx, y: cy + 3, r: 22, color: '#f0b050', a: 0.8 });
      }
      // дверь
      const dx = Math.round(W / 2);
      R(dx - 3, H - 11, 7, 11, '#140e0a');
      if (o.boarded) { L(dx - 3, H - 10, dx + 3, H - 2, '#6a5034', 2); L(dx + 3, H - 10, dx - 3, H - 2, '#5a4228', 2); } // крест из досок
      else if (!ruined) { R(dx - 3, H - 11, 7, 1, '#3a2a1a'); P(dx + 2, H - 6, BRASS); }
      else { L(dx + 4, H, dx + 9, H - 8, '#4a3622', 2); }
      // крыша
      const roofCol = { station: '#4a3430', slaughter: '#4e3e30', farm: '#5a4a2e', ruin: '#383a40' }[o.kind as string] ?? '#3a3e48';
      for (let y = -8; y < wy; y++) {
        const inset = Math.max(0, Math.round(((wy - y) / (wy + 8)) * 5));
        const row = y - -8;
        const col = row < 2 ? shade(roofCol, -0.35) : row % 3 === 0 ? shade(roofCol, 0.32) : row % 3 === 1 ? roofCol : shade(roofCol, -0.18);
        R(-2 + inset, y, W + 4 - inset * 2, 1, col);
      }
      for (let y = -5; y < wy - 2; y += 3) for (let x = 2; x < W - 2; x += 5) P(x + ((y / 3) & 1) * 2, y + 1, shade(roofCol, -0.45));
      R(-2, -8, 2, wy + 8, 'rgba(0,0,0,0)');
      R(-2, wy - 1, W + 4, 1, shade(roofCol, -0.4));
      if (ruined) {
        // провал в крыше с рваными краями и голыми стропилами
        const hx = 6 + Math.floor(r() * (W - 30)), hw = 14 + Math.floor(r() * 8);
        for (let y = -3; y < wy - 3; y++) { const j0 = Math.floor(r() * 3), j1 = Math.floor(r() * 3); R(hx + j0, y, hw - j0 - j1, 1, '#0c0c0b'); }
        for (let i = 0; i <= hw; i += 5) R(hx + i, -4, 1, wy - 1, '#3e2c1a');
        R(hx - 1, wy / 2 - 3, hw + 2, 1, '#3e2c1a');
        if (o.ruinKind === 'pump') { R(W - 8, -14, 2, wy + 14, '#4a3a2c'); }
      } else if (o.kind === 'house' || o.kind === 'farm') {
        R(W - 14, -14, 5, 9, '#4a3428'); R(W - 15, -15, 7, 2, '#2a1c14');
      }
      if (o.kind === 'pumphouse') { R(W - 10, -26, 4, 22, '#3a3a36'); R(W - 11, -27, 6, 2, '#24241f'); }
      if (o.kind === 'station') { R(dx - 14, wy - 6, 28, 5, '#2a2016'); for (let x = dx - 11; x < dx + 11; x += 3) R(x, wy - 4, 2, 1, '#c8b88a'); }
      if (o.kind === 'slaughter') for (let i = 0; i < 3; i++) { pellipse(c, 10 + i * 8, wy + 3, 2, 3, '#5a3418'); P(10 + i * 8, wy - 1, INK); }
      break;
    }
    case 'barn': {
      const wy = H - 18;
      R(1, H, W, 2, 'rgba(0,0,0,0.5)');
      R(0, wy, W, 18, '#7a6040');
      for (let x = 0; x < W; x += 4) R(x, wy, 1, 18, '#3a2c1c');
      const dx = Math.round(W / 2);
      R(dx - 8, H - 15, 16, 15, '#1e160e'); L(dx - 8, H - 15, dx + 7, H - 1, '#6a5236'); L(dx + 7, H - 15, dx - 8, H - 1, '#6a5236');
      for (let y = -6; y < wy; y++) { const inset = Math.max(0, Math.round(((wy - y) / (wy + 6)) * 4)); R(-2 + inset, y, W + 4 - inset * 2, 1, (y + 6) % 3 === 0 ? '#7a6a52' : (y + 6) % 3 === 1 ? '#4a3e2e' : '#3a3024'); }
      break;
    }
    case 'hut': {
      const wy = H - 16;
      R(1, H, W, 2, 'rgba(0,0,0,0.5)');
      for (let x = 3; x < W - 2; x += 10) R(x, H - 4, 2, 4, '#2a2218');
      R(1, wy, W - 2, 12, '#62583e');
      for (let x = 1; x < W - 1; x += 3) R(x, wy, 1, 12, '#2e281c');
      R(Math.round(W / 2) - 3, H - 13, 6, 9, '#140e0a');
      R(W - 18, wy + 3, 6, 4, '#8ac860'); R(W - 15, wy + 3, 1, 4, '#3a4a2a');
      lights.push({ x: W - 15, y: wy + 5, r: 22, color: '#b0e070', a: 0.7 });
      for (let y = -6; y < wy + 1; y++) { const inset = Math.max(0, Math.round(((wy - y) / (wy + 6)) * 5)); R(-3 + inset, y, W + 6 - inset * 2, 1, (y & 1) ? '#4a5a36' : '#3e4e2e'); }
      for (let i = 0; i < 16; i++) pellipse(c, 3 + r() * (W - 6), -3 + r() * wy, 2 + Math.floor(r() * 2), 1, r() < 0.5 ? '#5e7040' : '#34422a');
      break;
    }
    case 'tank': {
      const shades = ['#5a5a52', '#6e6e64', '#7a7a70', '#66665e', '#56564e', '#46463e', '#383832'];
      R(2, H - 2, W - 2, 3, 'rgba(0,0,0,0.5)');
      for (let x = 2; x < W - 2; x++) { const k = Math.floor(((x - 2) / (W - 4)) * shades.length); R(x, -12, 1, H + 8, shades[Math.min(shades.length - 1, k)]); }
      pellipse(c, W / 2, -12, W / 2 - 2, 4, '#5e5e56'); pellipse(c, W / 2, -12, W / 2 - 4, 3, '#4e4e46');
      for (let y = -4; y < H - 4; y += 10) R(2, y, W - 4, 1, '#2a2a24');
      for (let i = 0; i < 5; i++) R(5 + r() * (W - 12), -8 + r() * (H - 10), 1, 4 + r() * 8, '#6a3a1e');
      for (let y = -10; y < H - 4; y += 3) R(W - 9, y, 3, 1, '#2a2a24');
      R(W - 9, -10, 1, H + 6, '#2a2a24'); R(W - 7, -10, 1, H + 6, '#2a2a24');
      break;
    }
    case 'watertower': {
      L(4, H, 8, -12, '#2a2016', 2); L(W - 4, H, W - 8, -12, '#2a2016', 2); L(6, H - 8, W - 6, -6, '#2a2016'); L(W - 6, H - 8, 6, -6, '#2a2016');
      R(1, -36, W - 2, 24, '#4a3a2a'); for (let y = -33; y < -12; y += 4) R(1, y, W - 2, 1, '#2a2016');
      R(1, -36, 2, 24, '#5a4a36');
      for (let y = 0; y < 6; y++) R(1 + y, -42 + y, W - 2 - y * 2, 1, '#2e261e');
      break;
    }
    case 'wagon': {
      R(4, H - 3, W - 6, 3, 'rgba(0,0,0,0.5)');
      R(4, H - 6, W - 8, 3, '#1a1814');
      for (const wx of [10, W - 12]) { R(wx - 3, H - 5, 7, 5, '#141210'); P(wx, H - 3, '#5a5a52'); }
      const rows = ['#5a5850', '#4a4840', '#3e3c36', '#34322c', '#2a2824', '#22201c', '#1c1a18'];
      for (let y = 0; y < 14; y++) R(3 + (y === 0 || y === 13 ? 2 : 0), -10 + y, W - 6 - (y === 0 || y === 13 ? 4 : 0), 1, rows[Math.min(6, Math.floor(y / 2))]);
      R(W / 2 - 3, -13, 6, 3, '#3a3830');
      for (let i = 0; i < 4; i++) R(6 + r() * (W - 16), -6 + r() * 8, 3, 1, '#6a3a1e');
      break;
    }
    case 'lamp': {
      const x = 9, y = H - 2;
      R(x - 2, y, 5, 1, 'rgba(0,0,0,0.5)');
      R(x, y - 26, 1, 26, '#1a1a14'); R(x - 1, y - 2, 3, 2, '#1a1a14');
      R(x, y - 27, 5, 1, '#1a1a14');
      R(x + 3, y - 26, 4, 5, AMBER); P(x + 4, y - 25, '#f8e0a0'); R(x + 3, y - 27, 4, 1, '#1a1a14'); R(x + 3, y - 21, 4, 1, '#1a1a14');
      lights.push({ x: x + 5, y: y - 23, r: 62, color: '#f0c070' });
      break;
    }
    case 'fence': {
      const y = H - 3;
      R(8, y - 12, 2, 13, '#3a2c1e'); P(8, y - 12, '#5a4630');
      if (neighbors?.horizFence) { R(-1, y - 9, T + 2, 1, '#5a4630'); R(-1, y - 4, T + 2, 1, '#5a4630'); R(-1, y - 8, T + 2, 1, '#2a2016'); R(-1, y - 3, T + 2, 1, '#2a2016'); }
      else R(8, y - 22, 2, 10, '#5a4630');
      doOutline = false;
      break;
    }
    case 'feed': {
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2, d = r() * 14;
        pellipse(c, W / 2 + Math.cos(a) * d, H - 10 + Math.sin(a) * d * 0.6 - (14 - d) * 0.6, 2 + Math.floor(r() * 2), 1, ['#4a4426', '#5a4a2a', '#34401e', '#6a5832'][Math.floor(r() * 4)]);
      }
      break;
    }
    case 'chitin': for (let i = 0; i < 5; i++) { pellipse(c, 6 + i * 7, H - 6 - (i % 2) * 4, 5, 3, i % 2 ? '#6a4224' : '#5a3418'); P(4 + i * 7, H - 8 - (i % 2) * 4, '#8a6040'); } break;
    case 'tree': {
      const br = (x0: number, y0: number, a: number, len: number, d: number) => {
        if (d === 0) return;
        const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
        L(x0, y0, x1, y1, d > 3 ? '#221d16' : '#2e271e', d > 3 ? 2 : 1);
        br(x1, y1, a - 0.45 - r() * 0.35, len * 0.7, d - 1); if (r() < 0.85) br(x1, y1, a + 0.35 + r() * 0.35, len * 0.66, d - 1);
      };
      R(4, H - 2, 12, 2, 'rgba(0,0,0,0.45)');
      br(10, H - 2, -Math.PI / 2 + (r() - 0.5) * 0.3, 10, 5);
      doOutline = false;
      break;
    }
    case 'rock': {
      R(3, H - 2, 15, 2, 'rgba(0,0,0,0.45)');
      pellipse(c, 10, H - 7, 7, 5, '#4a4a42'); pellipse(c, 9, H - 8, 5, 3, '#62625a'); P(7, H - 10, '#7a7a70');
      break;
    }
    case 'barrel': {
      const x = 6, y = H - 1;
      R(x - 1, y, 10, 1, 'rgba(0,0,0,0.5)');
      R(x, y - 11, 8, 11, '#2e2e28'); R(x, y - 9, 8, 1, '#6a4422'); R(x, y - 4, 8, 1, '#6a4422'); R(x + 1, y - 11, 1, 11, '#44443c');
      R(x + 1, y - 12, 6, 1, '#1a1a16');
      break;
    }
    case 'crater': {
      for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
        const d = Math.hypot((x - W / 2) / (W / 2 - 4), (y - H / 2) / (H / 2.4 - 4));
        if (d < 1 && ((x + y) & 1 || d < 0.55)) P(x, y, d < 0.55 ? '#2a2a24' : '#3a3a32');
      }
      doOutline = false;
      break;
    }
    case 'bones': L(4, 12, 14, 8, '#b4ae9c'); L(6, 15, 16, 14, '#b4ae9c'); R(14, 7, 2, 2, '#c8c2ae'); doOutline = false; break;
    case 'cellar': {
      R(2, H - 2, W - 2, 2, 'rgba(0,0,0,0.45)');
      for (let y = 0; y < 16; y++) { const w = Math.round((W / 2 - 1) * Math.sqrt(1 - ((15 - y) / 16) ** 2)); R(W / 2 - w, H - 18 + y, w * 2, 1, y < 4 ? '#4a4c34' : y < 10 ? '#3e402c' : '#2e3022'); }
      for (let i = 0; i < 10; i++) P(8 + r() * (W - 16), H - 16 + r() * 12, '#5a6a3a');
      R(W / 2 - 5, H - 12, 10, 12, '#120c08'); R(W / 2 - 4, H - 13, 8, 1, '#120c08'); R(W / 2 - 6, H - 12, 1, 12, '#4a3622'); R(W / 2 + 5, H - 12, 1, 12, '#4a3622');
      R(W / 2 - 2, H - 4, 4, 1, '#6ab040');
      lights.push({ x: W / 2, y: H - 6, r: 20, color: '#9fe070', a: 0.6 });
      break;
    }
    case 'adit': {
      for (let y = -20; y < H; y++) { const w = W / 2 + 4 - Math.max(0, -y) * 0.6; R(W / 2 - w, y, w * 2, 1, y < -10 ? '#3a3a32' : (y & 3) ? '#34342c' : '#2c2c26'); }
      for (let i = 0; i < 26; i++) pellipse(c, r() * W, -16 + r() * (H + 10), 2 + Math.floor(r() * 3), 1 + Math.floor(r() * 2), r() < 0.5 ? '#46463c' : '#26261f');
      const dw = 20, dx = W / 2 - dw / 2;
      R(dx, H - 24, dw, 24, '#040504');
      R(dx - 3, H - 26, 3, 26, '#5a4226'); R(dx + dw, H - 26, 3, 26, '#5a4226'); R(dx - 4, H - 28, dw + 8, 3, '#4a3620');
      R(W / 2 - 6, H - 4, 12, 2, '#3a6a2a');
      R(dx + dw + 6, H - 8, 9, 5, '#4a4a42'); P(dx + dw + 7, H - 2, INK); P(dx + dw + 13, H - 2, INK);
      lights.push({ x: W / 2, y: H - 8, r: 44, color: '#9fe070', a: 0.7 });
      break;
    }
    case 'shroombed': {
      R(0, H - 10, W, 8, '#2a2016'); R(0, H - 10, W, 1, '#3a2c1e');
      for (let x = 2; x < W - 2; x += 4) {
        const y = H - 6 - Math.floor(r() * 3), glow = r() < 0.3;
        R(x + 1, y, 1, 3, '#d0c8a8'); R(x, y - 1, 3, 1, glow ? '#a8e080' : '#c8c0a0'); P(x + 1, y - 2, glow ? '#c8f0a0' : '#d8d0b0');
      }
      lights.push({ x: W / 2, y: H - 6, r: 24, color: '#b0f080', a: 0.4 });
      break;
    }
    case 'bigshroom': {
      R(4, H - 2, 12, 2, 'rgba(0,0,0,0.4)');
      R(8, H - 14, 4, 13, '#c8c4a8'); R(11, H - 14, 1, 13, '#9a9680');
      for (let y = 0; y < 6; y++) { const w = Math.round(8 * Math.sqrt(1 - ((5 - y) / 6) ** 2)); R(10 - w, H - 20 + y, w * 2, 1, y < 2 ? '#c8f0a0' : y < 4 ? '#90c070' : '#5a8a40'); }
      P(6, H - 17, '#3a5a2a'); P(12, H - 18, '#3a5a2a'); P(14, H - 16, '#3a5a2a');
      lights.push({ x: 10, y: H - 17, r: 56, color: '#a8f070', a: 0.85 });
      break;
    }
    case 'rack': {
      R(2, H - 18, 2, 18, '#3a2c1e'); R(W - 4, H - 18, 2, 18, '#3a2c1e'); R(1, H - 17, W - 2, 1, '#4a3622');
      for (let x = 6; x < W - 5; x += 4) { R(x, H - 16, 1, 3, '#2a1e12'); R(x - 1, H - 13, 3, 2, '#9a8a62'); }
      doOutline = false;
      break;
    }
    case 'wall': {
      R(0, -28, W, H + 28, '#4a463e');
      for (let y = -26; y < H; y += 5) for (let x = ((y / 5) & 1) * 4; x < W; x += 8) R(x, y, 7, 1, '#3a3630');
      for (let x = 0; x < W; x += 8) R(x, -34, 5, 6, '#4a463e');
      R(W - 4, -28, 4, H + 28, '#36322c');
      break;
    }
    case 'gate': case 'railgate': {
      R(0, -36, W, H + 36, '#4a463e');
      for (let x = 0; x < W; x += 8) R(x, -42, 5, 6, '#4a463e');
      R(3, 6, W - 6, H - 6, '#1a1612');
      R(5, 8, W - 10, H - 10, '#5a3e28');
      for (let y = 14; y < H; y += 9) R(5, y, W - 10, 1, '#2a1c12');
      R(W / 2, 8, 1, H - 10, '#2a1c12');
      for (let y = 12; y < H; y += 9) { P(8, y, '#8a7050'); P(W - 9, y, '#8a7050'); }
      lights.push({ x: W / 2, y: -4, r: 60, color: '#e8c070', a: 0.7 });
      break;
    }
    case 'tower': {
      R(2, H - 2, W, 3, 'rgba(0,0,0,0.5)');
      R(2, -50, W - 4, H + 50, '#56524a');
      for (let y = -48; y < H; y += 5) for (let x = 2 + ((y / 5) & 1) * 4; x < W - 2; x += 8) R(x, y, 7, 1, '#46423a');
      for (let x = 0; x < W; x += 8) R(x, -56, 5, 7, '#56524a');
      R(W / 2 - 2, -40, 4, 6, '#e8d090'); R(W / 2 - 2, -20, 4, 6, '#0e0d0b');
      R(W - 6, -50, 4, H + 50, '#46423a');
      lights.push({ x: W / 2, y: -37, r: 80, color: '#e8e0b0', a: 0.6 });
      break;
    }
    case 'sign': R(9, H - 16, 2, 16, '#3a2c1e'); R(2, H - 18, 16, 6, '#4a3a26'); for (let x = 4; x < 16; x += 3) R(x, H - 16, 2, 1, '#c8b88a'); break;

    case 'wire': { // колючая проволока на кольях — спираль в два ряда
      for (const kx of [2, 15]) { R(kx, H - 18, 2, 18, '#3a2c1e'); P(kx, H - 19, '#5a4430'); }
      for (let k = 0; k < W; k++) { P(k, H - 14 + Math.round(Math.sin(k * 1.3) * 2), '#8a8a80'); P(k, H - 7 + Math.round(Math.cos(k * 1.1) * 2), '#7a7a70'); }
      for (const [a, b] of [[5, 13], [10, 6], [17, 11]]) { P(a, H - b, '#b8b8b0'); P(a + 1, H - b - 1, '#b8b8b0'); }
      doOutline = false;
      break;
    }
    case 'cell': { // приземистый каменный дом: карцер или баня — решётка на окне, тяжёлая дверь
      const wy = H - 18, st = '#5e5a52';
      R(1, H, W, 2, 'rgba(0,0,0,0.5)'); R(0, wy, W, 18, st);
      for (let y = wy + 2; y < H; y += 4) for (let x = ((y / 4) | 0) % 2 ? 0 : 4; x < W; x += 8) R(x, y, 7, 1, shade(st, -0.18));
      R(6, wy + 4, 6, 5, '#141210'); for (let x = 7; x < 12; x += 2) R(x, wy + 4, 1, 5, '#6a6a62');   // решётка
      R(W - 14, H - 13, 8, 13, '#2a241c'); R(W - 14, H - 13, 8, 1, '#4a4038'); P(W - 8, H - 7, '#8a8a80');
      for (let y = -4; y < wy; y++) R(-1, y, W + 2, 1, (y & 1) ? '#44484c' : '#3a3e42');
      break;
    }
    case 'orecart': { // рудничная вагонетка на узкоколейке
      R(3, H - 14, W - 6, 9, '#4a4a46'); R(3, H - 14, W - 6, 1, '#6a6a62'); R(4, H - 6, W - 8, 1, '#2a2a28');
      for (let x = 5; x < W - 5; x += 3) P(x, H - 15, ['#7a4a2a', '#8a5a30', '#5a3a22'][x % 3]);                  // руда горкой
      R(6, H - 17, W - 12, 3, '#7a4a2a'); P(9, H - 18, '#a06a3a');
      for (const wx of [6, W - 7]) { pellipse(c, wx, H - 3, 2, 2, '#1c1c1a'); P(wx, H - 3, '#6a6a60'); }
      break;
    }
    case 'boat': { // рыбацкая лодка, вытащенная на воду у мостков
      pellipse(c, W / 2, H - 9, W / 2 - 2, 6, '#3a2a1c'); pellipse(c, W / 2, H - 11, W / 2 - 4, 4, '#5a4228'); R(4, H - 12, W - 8, 1, '#7a5a36');
      R(W / 2 - 1, H - 13, 2, 3, '#3a2c1e'); for (let x = 6; x < W - 6; x += 5) P(x, H - 9, '#2a1e12');
      L(W - 6, H - 12, W + 2, H - 16, '#5a4228');                                                 // весло
      R(2, H - 3, W - 4, 1, '#2e4446');
      break;
    }
    case 'nets': { // сети сушатся на шестах, на них — поплавки
      R(1, -18, 2, H + 18, '#3a2c1e'); R(W - 3, -18, 2, H + 18, '#3a2c1e');
      for (let y = -16; y < H - 4; y += 4) R(3, y, W - 6, 1, '#8a8a76');                 // редкая ячея: шнуры
      for (let x = 5; x < W - 3; x += 4) for (let y = -15; y < H - 4; y += 2) P(x, y, '#7a7a68');
      for (let x = 5; x < W - 4; x += 6) P(x, -16, '#c86030');
      break;
    }
    case 'scrapheap': { // гора металлолома: ржавые листы, трубы, колесо, каска
      pellipse(c, W / 2, H - 6, W / 2 - 1, 9, '#3e3428'); pellipse(c, W / 2 - 4, H - 10, W / 2 - 8, 7, '#4a3e30');
      for (let i = 0; i < 18; i++) { const x = 4 + r() * (W - 10), y = H - 18 + r() * 14, col = ['#7a4a2a', '#5a5a52', '#8a5a30', '#4a4a44', '#6a6a60'][Math.floor(r() * 5)]; R(x, y, 2 + r() * 5, 1 + r() * 2, col); }
      L(6, H - 14, 18, H - 18, '#6a6a60', 2); pellipse(c, W - 10, H - 8, 4, 4, '#2a2a28'); P(W - 10, H - 8, '#7a7a70');
      R(W / 2, H - 17, 5, 2, '#4a4e3a');
      break;
    }
    case 'banner': { // знамя баронессы на шесте
      R(9, -44, 2, H + 44, '#3a3428'); P(9, -46, BRASS); P(10, -46, BRASS);
      R(11, -42, 8, 22, '#8a2a24'); R(11, -42, 8, 2, '#a83a30'); R(11, -22, 3, 2, '#8a2a24'); R(16, -22, 3, 2, '#8a2a24');  // ласточкин хвост
      R(13, -36, 4, 4, '#d8c070'); P(14, -37, '#d8c070'); P(15, -32, '#d8c070');                                          // знак
      break;
    }
    case 'poster': { // агитационный плакат: профиль баронессы и лозунг полосами
      R(2, H - 22, 2, 22, '#3a2c1e'); R(W - 4, H - 22, 2, 22, '#3a2c1e');
      R(1, H - 24, W - 2, 16, '#8a2a24'); R(2, H - 23, W - 4, 14, '#c8b890');
      R(5, H - 21, 6, 8, '#3a3434'); R(6, H - 23, 4, 3, '#3a3434'); P(10, H - 18, '#3a3434');                         // профиль
      for (let y = H - 20; y < H - 11; y += 3) R(13, y, W - 17, 1, '#8a2a24');                                         // строки лозунга
      break;
    }
    case 'statue': { // статуя баронессы на постаменте
      R(4, H - 14, W - 8, 14, '#5e5a52'); R(4, H - 14, W - 8, 2, '#7a766a'); R(2, H - 4, W - 4, 4, '#4e4a42');
      const cx = Math.round(W / 2);
      R(cx - 4, H - 30, 8, 16, '#6a6a62'); R(cx - 6, H - 20, 12, 6, '#6a6a62');                                       // мантия
      R(cx - 2, H - 36, 4, 6, '#7a7a70'); R(cx - 3, H - 38, 6, 2, '#6a6a62');                                         // голова, причёска
      L(cx + 4, H - 28, cx + 9, H - 40, '#7a7a70', 2);                                                                // рука вверх
      R(cx - 6, H - 10, 12, 2, '#3a3a34');                                                                            // табличка
      break;
    }
    case 'horn': { // два громкоговорителя-раструба на столбе
      R(9, -36, 2, H + 36, '#2e2c28'); R(4, -33, 12, 2, '#3a3428');
      for (let k = 0; k < 6; k++) { R(3 - k, -34 - (k >> 1), 1, 3 + k, '#9a8a58'); R(16 + k, -34 - (k >> 1), 1, 3 + k, '#9a8a58'); }
      P(-2, -33, '#2a2418'); P(21, -33, '#2a2418'); P(10, -38, '#a03028');
      break;
    }
    case 'barracks': { // казарма: длинный кирпичный дом, ровные окна, красная полоса
      const wallH = 22, wy = H - wallH, wall = '#6a5e50';
      R(1, H, W, 2, 'rgba(0,0,0,0.5)'); R(0, wy, W, wallH, wall);
      for (let y = wy + 2; y < H; y += 3) for (let x = ((y / 3) | 0) % 2 ? 0 : 3; x < W; x += 6) R(x, y, 5, 1, shade(wall, -0.15));
      R(0, wy + 2, W, 2, '#7a2a24');
      for (let x = 6; x < W - 6; x += 10) { const on = r() < 0.6; R(x, wy + 7, 5, 6, on ? AMBER : '#1a1c20'); R(x + 2, wy + 7, 1, 6, '#2a1e12'); if (on) lights.push({ x: x + 2, y: wy + 10, r: 18, color: '#f0b050', a: 0.6 }); }
      R(Math.round(W / 2) - 4, H - 12, 8, 12, '#1a140e');
      for (let y = -6; y < wy; y++) R(-1, y, W + 2, 1, (y + 6) % 3 === 0 ? '#5a5e62' : '#44484c');
      break;
    }
    case 'keep': { // замок баронессы: донжон с зубцами, башни, флаг
      const wy = H - 70, stone = '#6e6a62';
      R(2, H, W - 4, 3, 'rgba(0,0,0,0.5)');
      R(4, wy, W - 8, 70, stone); for (let y = wy + 2; y < H; y += 5) for (let x = 4 + (((y / 5) | 0) % 2) * 4; x < W - 4; x += 8) R(x, y, 7, 1, shade(stone, -0.15));
      for (let x = 4; x < W - 4; x += 8) R(x, wy - 5, 5, 5, stone);
      for (const tx of [0, W - 14]) { R(tx, wy - 8, 14, 78, '#66625a'); for (let x = tx; x < tx + 14; x += 5) R(x, wy - 12, 3, 4, '#66625a'); R(tx + 2, wy - 18, 10, 6, '#7a2a24'); }
      for (let x = 22; x < W - 22; x += 12) for (const y of [wy + 12, wy + 32]) { R(x, y, 4, 8, '#f0d080'); R(x + 1, y - 1, 2, 1, '#f0d080'); lights.push({ x: x + 2, y: y + 4, r: 22, color: '#f0d080', a: 0.6 }); }
      const dx = Math.round(W / 2); R(dx - 8, H - 18, 16, 18, '#1a140e'); R(dx - 8, H - 18, 16, 2, '#4a3a26');
      R(dx - 1, wy - 30, 2, 26, '#3a3428'); R(dx + 1, wy - 30, 10, 6, '#a03028'); R(dx + 4, wy - 28, 3, 2, '#d8c070');
      lights.push({ x: dx, y: H - 10, r: 50, color: '#e8c070', a: 0.6 });
      break;
    }
    case 'laundry': { // бельевая верёвка между шестами: заношенное бельё
      R(1, -20, 2, H + 20, '#3a2c1e'); R(W - 3, -20, 2, H + 20, '#3a2c1e');
      for (let x = 2; x < W - 2; x++) P(x, -18 + Math.round(Math.sin((x / (W - 4)) * Math.PI) * 3), '#8a8a7a');
      const cloth = ['#9a9488', '#6a6e7a', '#8a5a4a', '#b0aa9a', '#5a6a4a'];
      for (let x = 5; x < W - 6; x += 7) {
        const y0 = -17 + Math.round(Math.sin((x / (W - 4)) * Math.PI) * 3), col = cloth[Math.floor(r() * cloth.length)], hh = 6 + Math.floor(r() * 6);
        R(x, y0, 5, hh, col); R(x, y0, 5, 1, shade(col, 0.2)); if (r() < 0.5) P(x + 2, y0 + hh - 2, shade(col, -0.35)); // заплата
      }
      R(2, H - 2, W - 4, 2, 'rgba(0,0,0,0.3)');
      break;
    }
    case 'handcart': { // ручная тележка на двух колёсах с мешками
      R(2, H - 12, W - 10, 7, '#5e4a30'); R(2, H - 12, W - 10, 1, '#7a6040'); for (let x = 4; x < W - 10; x += 5) R(x, H - 11, 1, 6, '#3e3020');
      pline(c, W - 8, H - 9, W - 1, H - 3, '#4a3a26', 1); pline(c, W - 8, H - 7, W - 1, H - 1, '#4a3a26', 1);   // ручки
      pellipse(c, 9, H - 4, 4, 4, '#2a2016'); P(9, H - 4, '#8a7a50'); P(7, H - 4, '#4a3a26'); P(11, H - 4, '#4a3a26');
      for (let k = 0; k < 3; k++) { pellipse(c, 6 + k * 6, H - 15, 3, 2, '#8a7a5a'); P(6 + k * 6, H - 17, '#6a5a3a'); }
      break;
    }
    case 'crates': { // штабель ящиков
      R(2, H - 10, 15, 10, '#6a4c2c'); R(2, H - 10, 15, 1, '#82603a'); L(2, H - 9, 16, H - 1, '#3a2a18');
      R(4, H - 19, 11, 9, '#5e4428'); R(4, H - 19, 11, 1, '#7a5a36'); L(4, H - 18, 14, H - 11, '#3a2a18');
      R(1, H, 18, 1, 'rgba(0,0,0,0.5)');
      break;
    }
    case 'coalheap': { // куча угля с лопатой
      pellipse(c, W / 2, H - 4, W / 2 - 2, 5, '#141414'); pellipse(c, W / 2 - 3, H - 6, W / 2 - 7, 4, '#1e1e1e');
      for (let k = 0; k < 10; k++) P(4 + r() * (W - 8), H - 8 + r() * 6, '#3a3a3a');
      pline(c, W - 10, H - 14, W - 6, H - 4, '#5a4228'); R(W - 7, H - 5, 3, 3, '#8e928c');
      break;
    }
    case 'standpipe': { // уличная водоразборная колонка, ведро и лужа
      pellipse(c, 10, H - 2, 8, 2, '#2a3a3a'); P(6, H - 2, '#5a7a7a');
      R(8, H - 18, 4, 17, '#3e4244'); R(8, H - 18, 1, 17, '#5a5e60'); R(7, H - 20, 6, 3, '#4a4e50');
      R(12, H - 15, 4, 2, '#3e4244'); P(15, H - 13, '#7a9a9a');                             // носик, капля
      pline(c, 6, H - 16, 3, H - 20, '#3e4244', 1);                                          // рычаг
      R(14, H - 7, 5, 5, '#5a5048'); R(14, H - 7, 5, 1, '#7a7068');                         // ведро
      break;
    }
    case 'noticeboard': { // доска объявлений: листки без надписей
      R(3, H - 20, 2, 20, '#3a2c1e'); R(W - 5, H - 20, 2, 20, '#3a2c1e');
      R(1, H - 22, W - 2, 14, '#4a3a26'); R(1, H - 22, W - 2, 1, '#6a5236');
      for (let k = 0; k < 5; k++) { const x = 3 + Math.floor(r() * (W - 10)), y = H - 21 + Math.floor(r() * 7), col = r() < 0.5 ? '#c8c0a0' : '#a89a78'; R(x, y, 5, 6, col); for (let l = 1; l < 5; l += 2) R(x + 1, y + l, 3, 1, shade(col, -0.35)); }
      break;
    }
    case 'sacks': { // мешки
      for (const [x, y, rr] of [[6, H - 4, 5], [13, H - 4, 5], [9, H - 10, 5]] as [number, number, number][]) { pellipse(c, x, y, rr, 4, '#8a7a58'); pellipse(c, x - 1, y - 1, rr - 2, 2, '#a0906a'); P(x, y - 4, '#5a4a30'); }
      break;
    }
    case 'vent': { // решётка канализации/паропровода (пар рисуется анимацией)
      R(3, H - 8, 14, 6, '#2a2a28'); for (let x = 4; x < 16; x += 2) R(x, H - 7, 1, 4, '#4a4a46'); R(3, H - 8, 14, 1, '#5a5a56');
      doOutline = false;
      break;
    }
    case 'clinic': { // клиника: беленая кирпичная стена, высокие окна, вывеска с механической кистью
      const wallH = 40, wy = H - wallH, wall = '#8a8270';
      R(1, H, W, 2, 'rgba(0,0,0,0.5)');
      R(0, wy, W, wallH, wall);
      for (let y = wy + 2; y < H; y += 4) for (let x = ((y / 4) | 0) % 2 ? 0 : 4; x < W; x += 8) R(x, y, 7, 1, shade(wall, -0.12));
      R(0, wy, 1, wallH, shade(wall, 0.15)); R(W - 2, wy, 2, wallH, shade(wall, -0.3));
      for (const wx of [8, 22, W - 30, W - 16]) { R(wx, wy + 8, 8, 14, '#d8c890'); R(wx + 1, wy + 9, 6, 12, '#f0e0a8'); R(wx + 3, wy + 8, 1, 14, '#5a4a32'); lights.push({ x: wx + 4, y: wy + 15, r: 24, color: '#f0e0b0', a: 0.6 }); }
      const dx = Math.round(W / 2);
      R(dx - 5, H - 16, 10, 16, '#2a2018'); R(dx - 5, H - 16, 10, 1, '#5a4430'); P(dx + 3, H - 8, BRASS);
      R(dx - 9, wy - 14, 18, 12, '#3a2c1e'); R(dx - 8, wy - 13, 16, 10, '#d8d0b8');               // вывеска
      R(dx - 3, wy - 11, 6, 5, '#7a7a72'); for (let k = 0; k < 4; k++) R(dx - 3 + k * 2, wy - 13, 1, 3, '#7a7a72'); P(dx, wy - 9, BRASS); // механическая кисть
      for (let x = -2; x < W + 3; x++) R(x, wy - 4, 1, 4, (x % 3) ? '#4a4844' : '#5a5854');
      R(W - 12, wy - 16, 4, 12, '#4a4844');
      break;
    }
    // ---------------- форт: Нижний и Средний город
    case 'shack': { // лачуга из ржавого железа и досок, кривая крыша, печная труба
      const wy = H - 16;
      R(1, H, W, 2, 'rgba(0,0,0,0.5)');
      const panels = ['#5a4a3a', '#4a4a44', '#6a5238', '#3e3a32', '#5e5a4e', '#6a4a30'];
      for (let x = 0; x < W;) {
        const w = 5 + Math.floor(r() * 6), col = panels[Math.floor(r() * panels.length)];
        R(x, wy, Math.min(w, W - x), 16, col);
        if (r() < 0.5) for (let xx = x + 1; xx < Math.min(x + w, W); xx += 2) R(xx, wy + 1, 1, 14, shade(col, -0.2)); // гофра
        if (r() < 0.4) P(x + 1, wy + 3 + Math.floor(r() * 8), '#8a5a2a');                                      // ржавый подтёк
        x += w;
      }
      const tilt = r() < 0.5 ? 1 : -1;
      for (let x = -2; x < W + 2; x++) {
        const ty = wy - 6 + Math.round(((tilt > 0 ? x : W - x) / W) * 5);
        R(x, ty, 1, wy - ty + 1, (x & 1) ? '#6a4a30' : '#5a5a52');
        P(x, ty, '#7a6a5a');
      }
      const dx = 4 + Math.floor(r() * (W - 14));
      R(dx, H - 11, 7, 11, '#1a140e'); R(dx + 1, H - 10, 2, 9, '#5a4a3a');                               // тряпичная занавеска
      if (r() < 0.5) { R(dx + 10, wy + 4, 4, 3, '#c89040'); lights.push({ x: dx + 12, y: wy + 5, r: 16, color: '#e0a050', a: 0.5 }); }
      R(W - 8, wy - 14, 2, 10, '#2a2a26'); P(W - 8, wy - 15, '#4a4a44');                                    // труба
      break;
    }
    case 'factory': { // заводской цех: кирпич, высокие окна с жаром печей, пилообразная крыша, трубы
      const wallH = 52, wy = H - wallH, brick = '#6a3a2a';
      R(1, H, W, 2, 'rgba(0,0,0,0.55)');
      R(0, wy, W, wallH, brick);
      for (let y = wy + 2; y < H; y += 3) for (let x = ((y / 3) | 0) % 2 ? 0 : 3; x < W; x += 6) R(x, y, 5, 1, shade(brick, -0.2));
      R(0, wy, W, 2, shade(brick, -0.35));
      for (let x = 6; x < W - 8; x += 14) {                                                               // окна
        const hot = r() < 0.6;
        R(x, wy + 8, 8, 16, hot ? '#c85a20' : '#141210'); R(x + 1, wy + 7, 6, 1, hot ? '#c85a20' : '#141210');
        if (hot) { R(x + 2, wy + 12, 4, 10, '#f09040'); lights.push({ x: x + 4, y: wy + 16, r: 30, color: '#f07028', a: 0.7 }); }
        R(x + 3, wy + 8, 1, 16, '#2a1a12'); R(x, wy + 15, 8, 1, '#2a1a12');
      }
      const dx = Math.round(W / 2);
      R(dx - 10, H - 20, 20, 20, '#120e0a'); R(dx - 8, H - 18, 16, 18, '#3a1a0e');                       // ворота цеха
      lights.push({ x: dx, y: H - 8, r: 36, color: '#e86a28', a: 0.6 });
      for (let x = 0; x < W; x += 20) for (let t = 0; t < 12; t++) R(x + t, wy - 1 - t, 20 - t, 1, t === 0 ? '#2e2e2c' : t < 3 ? '#4a4a46' : '#3a3a38'); // пилообразная крыша
      for (const fx of [0.22, 0.72]) {                                                                    // трубы
        const cx = Math.round(W * fx);
        R(cx, wy - 62, 7, 50, '#5a3226'); R(cx + 5, wy - 62, 2, 50, '#3a2018');
        for (let y = wy - 58; y < wy - 12; y += 8) R(cx, y, 7, 1, '#3a2018');
        R(cx - 1, wy - 64, 9, 3, '#2a1a14'); R(cx, wy - 66, 7, 2, '#1a1410');                             // закопчённый верх
      }
      break;
    }
    case 'tenement': { // наспех сколоченный двухэтажный дом, окно в окно с соседом
      const wallH = 46, wy = H - wallH, lean = r() < 0.5 ? 1 : -1;
      R(1, H, W, 2, 'rgba(0,0,0,0.5)');
      const wood = ['#6a5438', '#5e4a32', '#725a3c'][Math.floor(r() * 3)];
      R(0, wy + 22, W, 24, wood);                                                                         // первый этаж
      R(lean, wy, W, 23, shade(wood, 0.06));                                                              // второй этаж, чуть кренится
      for (let x = 0; x < W; x += 4) { R(x, wy + 22, 1, 24, shade(wood, -0.3)); R(x + lean, wy, 1, 22, shade(wood, -0.3)); }
      R(0, wy + 21, W, 2, '#2e2216');                                                                     // межэтажная балка
      for (let i = 0; i < 3; i++) { const px = Math.floor(r() * (W - 10)), py = wy + Math.floor(r() * 36); R(px, py, 8, 6, '#5a5a52'); R(px, py, 8, 1, '#7a7a70'); } // заплатки жестью
      for (const [wx, wy2] of [[8, wy + 6], [W - 16, wy + 6], [W - 16, wy + 28]]) {
        const on = r() < 0.45;
        R(wx + lean * (wy2 < wy + 20 ? 1 : 0), wy2, 7, 7, on ? AMBER : '#1a1c20'); R(wx + 3, wy2, 1, 7, '#2a1e12');
        if (on) lights.push({ x: wx + 3, y: wy2 + 3, r: 20, color: '#f0b050', a: 0.6 });
      }
      R(7, H - 13, 8, 13, '#140e0a'); P(13, H - 7, BRASS);                                                // дверь
      for (let x = -2; x < W + 3; x++) R(x + lean, wy - 5 + (x > W / 2 ? 1 : 0), 1, 5, (x % 3) ? '#2e2c28' : '#3a3834'); // толь на крыше
      R(W - 10, wy - 13, 3, 9, '#3a3a36');
      break;
    }
    case 'stall': { // рыночный лоток под выцветшим полосатым навесом
      R(1, H, W, 2, 'rgba(0,0,0,0.45)');
      R(2, -16, 2, H + 14, '#3a2c1e'); R(W - 4, -16, 2, H + 14, '#3a2c1e');                                // столбы
      for (let x = 0; x < W; x++) R(x, -18 + ((x / 4) & 1), 1, 7, ((x / 5) | 0) % 2 ? '#7a3a2a' : '#a08a5a'); // навес
      R(1, H - 10, W - 2, 3, '#5a4228'); R(4, H - 7, 2, 7, '#3a2a18'); R(W - 6, H - 7, 2, 7, '#3a2a18');    // прилавок
      const goods = ['#8a6a3a', '#5a6a3a', '#a08050', '#6a4a3a', '#9a9a8a', '#7a3a2a'];
      for (let x = 4; x < W - 4; x += 4) { const g = goods[Math.floor(r() * goods.length)]; R(x, H - 13, 3, 3, g); P(x, H - 13, shade(g, 0.2)); }
      break;
    }
    case 'workshop': { // мастерская: широкая дверь, жар горна, вывеска с ключом
      const wallH = 28, wy = H - wallH, wood = '#5e4a32';
      R(1, H, W, 2, 'rgba(0,0,0,0.5)');
      R(0, wy, W, wallH, wood);
      for (let x = 0; x < W; x += 4) R(x, wy, 1, wallH, shade(wood, -0.3));
      const dx = Math.round(W / 2) - 9;
      R(dx, H - 18, 18, 18, '#1a0e08'); R(dx + 4, H - 8, 6, 4, '#e86a28'); R(dx + 5, H - 9, 4, 1, '#f8b060'); // открытые ворота, горн
      lights.push({ x: dx + 7, y: H - 8, r: 34, color: '#f07028', a: 0.75 });
      R(dx + 12, H - 6, 4, 3, '#3a3a3a');                                                                  // наковальня
      R(W - 14, wy - 2, 12, 7, '#4a3a26'); R(W - 11, wy + 1, 6, 1, '#b0b0a8'); P(W - 5, wy, '#b0b0a8');     // вывеска с ключом
      for (let x = -2; x < W + 3; x++) R(x, wy - 4, 1, 4, (x % 3) ? '#3a3632' : '#4a4640');
      R(6, wy - 14, 4, 10, '#3a3a36'); R(5, wy - 15, 6, 2, '#24241f');
      break;
    }
  }
  if (doOutline) outline(cv, INK);
  return { cv, sx: pad, sy: top, lights };
}

// ============================================================ анимированные объекты
export function drawPumpjack(c: Ctx, X: number, Y: number, t: number) {
  const a = Math.sin(t * 1.6) * 0.3;
  const px = X + 18, py = Y + 10;
  prect(c, X + 1, Y + 36, 38, 3, '#1e1c18');
  pline(c, X + 12, Y + 36, px, py, '#4a4436'); pline(c, X + 25, Y + 36, px, py, '#4a4436');
  const bx = Math.cos(a) * 15, by = Math.sin(a) * 15;
  pline(c, px - bx, py - by, px + bx, py + by, '#7a6e5a', 2);
  prect(c, px - bx - 3, py - by - 2, 3, 6, '#5a5040'); prect(c, px - bx - 3, py - by - 2, 1, 6, INK);
  pline(c, px - bx - 2, py - by + 4, X + 2, Y + 35, '#8a8a80');
  prect(c, X, Y + 32, 5, 5, '#2e2a22');
  const kx = X + 31, ky = Y + 28, ca = t * 1.6;
  prect(c, kx - 3, ky - 3, 7, 7, '#3e3e36');
  pline(c, kx, ky, kx + Math.cos(ca) * 4, ky + Math.sin(ca) * 4, '#7a7a70');
  pline(c, kx + Math.cos(ca) * 4, ky + Math.sin(ca) * 4, px + bx, py + by, '#5a5a52');
}

export function drawCampfire(c: Ctx, x: number, y: number, t: number) {
  pline(c, x - 6, y, x + 6, y - 2, '#3a2a1a', 2); pline(c, x - 5, y - 2, x + 5, y, '#2a1e12', 2);
  const f = Math.floor(t * 10) % 3;
  const cols = ['#e05a20', '#f0a040', '#fff0a0'];
  for (let i = 0; i < 3; i++) {
    const h = 7 - i * 2 + ((f + i) % 2);
    prect(c, x - 3 + i, y - 2 - h, 7 - i * 2, h, cols[i]);
  }
  ppx(c, x + ((f - 1) * 2), y - 11 - f, '#f0a040');
}
