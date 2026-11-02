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
  sign: 16, crater: 0, bones: 0, wallruin: 14, skeleton: 14, milestone: 14, lorry: 12,
};

export interface ObjLike { kind: string; x: number; y: number; w: number; h: number; seed: number; ruinKind?: string }

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
      const lit = !ruined && o.kind !== 'slaughter' && r() < 0.8;
      for (let i = 0; i < nWin; i++) {
        const cx = Math.round(((i + 0.5) * W) / nWin + (i === 0 ? -8 : 8)), cy = wy + 4;
        const on = lit && (i === 0 || r() < 0.5);
        R(cx - 3, cy, 7, 6, ruined ? '#0a0b0a' : on ? AMBER : '#1a1c20');
        if (!ruined) { R(cx, cy, 1, 6, '#2a1e12'); R(cx - 3, cy + 2, 7, 1, '#2a1e12'); if (on) R(cx - 2, cy + 3, 2, 2, '#f8d888'); }
        else { L(cx - 3, cy, cx + 3, cy + 5, '#5a4028'); L(cx + 3, cy, cx - 3, cy + 5, '#5a4028'); }
        R(cx - 4, cy + 6, 9, 1, shade(wall, -0.35));
        if (on) lights.push({ x: cx, y: cy + 3, r: 22, color: '#f0b050', a: 0.8 });
      }
      // дверь
      const dx = Math.round(W / 2);
      R(dx - 3, H - 11, 7, 11, '#140e0a');
      if (!ruined) { R(dx - 3, H - 11, 7, 1, '#3a2a1a'); P(dx + 2, H - 6, BRASS); }
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
