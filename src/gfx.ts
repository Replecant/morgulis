// ============================================================
//  Процедурная графика: фигурки, небо с Оком, свет, пепел
// ============================================================
import { TAU } from './util';

type Ctx = CanvasRenderingContext2D;

interface Style {
  coat?: string; legs?: string; skin?: string; hair?: string; beard?: string;
  hat?: 'cap' | 'helmet' | 'tophat' | 'bonnet' | 'flatcap' | 'minerhelm';
  hatC?: string; trim?: string; belt?: string; apron?: string;
  dress?: boolean; collar?: boolean; mask?: boolean; band?: boolean; sash?: boolean; hood?: boolean;
  weapon?: 'saber' | 'rifle' | 'fork' | 'musket' | 'hammer' | 'staff' | 'pole' | 'bottle';
  scale?: number;
}

export const STYLES: Record<string, Style> = {
  lieutenant: { coat: '#5a2622', legs: '#1c1a17', trim: '#c09a52', belt: '#2a1d12', hat: 'cap', hatC: '#2b1513', skin: '#cdb69a', weapon: 'saber' },
  sergeant: { coat: '#4b4e3b', legs: '#24251d', belt: '#2c2418', hat: 'helmet', hatC: '#3d4030', mask: true, weapon: 'rifle' },
  sniper: { coat: '#474b3a', legs: '#24251d', belt: '#2c2418', hat: 'helmet', hatC: '#3a3d2d', mask: true, weapon: 'rifle' },
  medic: { coat: '#4d4f3e', legs: '#24251d', belt: '#2c2418', hat: 'helmet', hatC: '#3d4030', mask: true, band: true, weapon: 'rifle' },
  elder: { coat: '#3f3a32', legs: '#24211c', hat: 'tophat', hatC: '#191715', beard: '#b8b4aa', skin: '#c4b29c' },
  widow: { coat: '#2b282d', dress: true, hat: 'bonnet', hatC: '#17151a', skin: '#c0ae98', weapon: 'pole' },
  priest: { coat: '#141414', dress: true, collar: true, hair: '#8a8a86', skin: '#c8b8a2' },
  boy: { coat: '#5a4a35', legs: '#3a3226', hat: 'flatcap', hatC: '#3a3226', scale: 0.78, skin: '#d2bca0' },
  miner: { coat: '#3c382f', legs: '#2a2721', hat: 'minerhelm', hatC: '#5a4a2a', beard: '#6a655c', weapon: 'bottle' },
  militia: { coat: '#5a4a36', legs: '#2e2a22', hat: 'flatcap', hatC: '#2c2620', weapon: 'fork', skin: '#bfa88c' },
  militia_gun: { coat: '#4a4232', legs: '#2a261f', hair: '#3a2a1a', weapon: 'musket', skin: '#bfa88c', belt: '#2a1d12' },
  fanatic: { coat: '#3e3b30', legs: '#25231d', hat: 'flatcap', hatC: '#1e1d18', weapon: 'fork', sash: true },
  fanatic_gun: { coat: '#38362c', legs: '#25231d', hair: '#222', weapon: 'musket', sash: true },
  smith: { coat: '#3a2d22', legs: '#221c16', apron: '#5b3b22', hair: '#1c1a18', beard: '#1c1a18', weapon: 'hammer', scale: 1.15, skin: '#b89a7c' },
  cultist: { coat: '#0f0f12', dress: true, hood: true, weapon: 'staff', scale: 1.05 },
  imp: {},
};

export interface FigOpts { t?: number; flip?: boolean; dead?: boolean; flash?: number; seed?: number; terror?: boolean }

/** Рисует персонажа: (x, y) — точка между ступнями. Рост ≈ 34·s пикселей. */
export function drawFigure(c: Ctx, kind: string, x: number, y: number, s = 1, o: FigOpts = {}) {
  const st = STYLES[kind];
  if (!st) return;
  const t = o.t ?? 0;
  const flash = (o.flash ?? 0) > 0;
  const col = (v: string | undefined) => (flash ? '#f2e8de' : v ?? '#222');
  c.save();
  c.translate(x, y);
  if (o.dead) {
    c.fillStyle = 'rgba(60,8,8,0.6)';
    c.beginPath(); c.ellipse(0, -2 * s, 13 * s, 4.5 * s, 0, 0, TAU); c.fill();
    c.translate(-13 * s, -3 * s);
    c.rotate(Math.PI / 2);
    c.globalAlpha *= 0.8;
  }
  c.scale(s * (o.flip ? -1 : 1), s);
  if (st.scale) c.scale(st.scale, st.scale);
  const bob = o.dead ? 0 : Math.sin(t * 2.4 + (o.seed ?? 0)) * 0.5;

  if (!o.dead) {
    c.fillStyle = 'rgba(0,0,0,0.38)';
    c.beginPath(); c.ellipse(0, 0, 8, 2.8, 0, 0, TAU); c.fill();
  }
  if (kind === 'imp') { drawImp(c, t, col, bob); c.restore(); return; }

  // ноги
  if (!st.dress) {
    c.fillStyle = col(st.legs);
    c.fillRect(-4, -9, 3.2, 9); c.fillRect(0.8, -9, 3.2, 9);
    c.fillStyle = col('#141210');
    c.fillRect(-4.5, -2, 4, 2); c.fillRect(0.6, -2, 4.4, 2);
  }
  // туловище / шинель / ряса
  c.fillStyle = col(st.coat);
  c.beginPath();
  if (st.dress) { c.moveTo(-7, 0); c.lineTo(7, 0); c.lineTo(4.5, -18 + bob); c.lineTo(-4.5, -18 + bob); }
  else { c.moveTo(-6.5, -5); c.lineTo(6.5, -5); c.lineTo(5, -18 + bob); c.lineTo(-5, -18 + bob); }
  c.closePath(); c.fill();
  if (!flash) { c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(1.5, -18 + bob, 5, st.dress ? 18 - bob : 13); }
  if (st.apron) { c.fillStyle = col(st.apron); c.fillRect(-4, -15 + bob, 8, 13); }
  if (st.belt) { c.fillStyle = col(st.belt); c.fillRect(-5.6, -10 + bob, 11.2, 1.6); }
  if (st.trim) {
    c.fillStyle = col(st.trim);
    for (let i = 0; i < 3; i++) c.fillRect(-0.6, -16 + bob + i * 2.6, 1.2, 1.2);
    c.fillRect(-5.5, -18.2 + bob, 2.5, 1.3); c.fillRect(3, -18.2 + bob, 2.5, 1.3);
  }
  if (st.band) { c.fillStyle = col('#ddd'); c.fillRect(-7.5, -15 + bob, 2.6, 2.6); c.fillStyle = col('#a22'); c.fillRect(-6.8, -14.4 + bob, 1.2, 1.4); }
  if (st.sash) { c.fillStyle = col('#7fb04a'); c.fillRect(-7.5, -15 + bob, 2.6, 2.4); }
  if (st.collar) { c.fillStyle = col('#ddd'); c.fillRect(-1.5, -18.3 + bob, 3, 1.3); }
  // руки
  c.fillStyle = col(st.coat);
  c.fillRect(-7.5, -17 + bob, 2.6, 9); c.fillRect(4.9, -17 + bob, 2.6, 9);
  c.fillStyle = col(st.skin ?? '#c2ad94');
  c.fillRect(-7.5, -8.5 + bob, 2.6, 2); c.fillRect(4.9, -8.5 + bob, 2.6, 2);

  drawWeapon(c, st.weapon, bob, col, t);

  const hy = -21.5 + bob;
  if (st.hood) {
    c.fillStyle = col(st.coat);
    c.beginPath(); c.moveTo(-5.2, hy + 3.5);
    c.quadraticCurveTo(-6.5, hy - 6, 0, hy - 8.5);
    c.quadraticCurveTo(6.5, hy - 6, 5.2, hy + 3.5); c.closePath(); c.fill();
    c.fillStyle = '#030303';
    c.beginPath(); c.ellipse(1, hy, 2.8, 3.3, 0, 0, TAU); c.fill();
    c.save(); c.shadowColor = '#9fef6a'; c.shadowBlur = 6; c.fillStyle = '#c8ff8a';
    c.fillRect(0.1, hy - 0.9, 1.2, 1); c.fillRect(2.2, hy - 0.9, 1.2, 1); c.restore();
  } else {
    if (st.hat === 'bonnet') {
      c.fillStyle = col(st.hatC);
      c.beginPath(); c.arc(-0.6, hy - 0.3, 5, Math.PI * 0.55, Math.PI * 2.05); c.closePath(); c.fill();
    }
    c.fillStyle = col(st.skin ?? '#c2ad94');
    c.beginPath(); c.arc(0, hy, 3.8, 0, TAU); c.fill();
    if (st.hair) { c.fillStyle = col(st.hair); c.beginPath(); c.arc(0, hy - 0.8, 3.9, Math.PI, TAU); c.fill(); }
    if (st.beard) { c.fillStyle = col(st.beard); c.beginPath(); c.arc(0.6, hy + 1.6, 3, 0, Math.PI); c.fill(); }
    if (st.mask) {
      c.fillStyle = col('#2b2d28');
      c.beginPath(); c.arc(0.4, hy + 0.3, 3.9, 0, TAU); c.fill();
      c.fillStyle = flash ? '#fff' : '#8fbf5a';
      c.beginPath(); c.arc(2.2, hy - 0.9, 1.1, 0, TAU); c.arc(-0.6, hy - 0.9, 1.1, 0, TAU); c.fill();
      c.fillStyle = col('#4a4a44'); c.fillRect(1.2, hy + 2.2, 3, 2.6);
    } else {
      c.fillStyle = '#111'; c.fillRect(1.6, hy - 0.8, 1, 1);
    }
    drawHat(c, st.hat, st.hatC, hy, col);
  }
  if (o.terror) {
    c.fillStyle = '#b58cff';
    c.font = 'bold 8px serif'; c.textAlign = 'center';
    c.fillText('◉', 0, hy - 9);
  }
  c.restore();
}

function drawHat(c: Ctx, h: Style['hat'], hc: string | undefined, hy: number, col: (v?: string) => string) {
  c.fillStyle = col(hc);
  switch (h) {
    case 'cap':
      c.fillRect(-4.2, hy - 5.8, 8.6, 3.2); c.fillRect(-3.6, hy - 2.9, 7.2, 1.3);
      c.fillStyle = col('#0e0e0e'); c.fillRect(1.6, hy - 2.7, 4.2, 1.2);
      c.fillStyle = col('#c09a52'); c.fillRect(-0.5, hy - 5, 1.6, 1.4);
      break;
    case 'helmet':
      c.beginPath(); c.ellipse(0, hy - 2.3, 6.4, 1.5, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(0, hy - 2.5, 3.9, Math.PI, TAU); c.fill();
      break;
    case 'tophat':
      c.fillRect(-3.3, hy - 11.5, 6.6, 8.3); c.fillRect(-5.2, hy - 3.8, 10.4, 1.5);
      c.fillStyle = col('#3a2a2a'); c.fillRect(-3.3, hy - 5.2, 6.6, 1.1);
      break;
    case 'flatcap':
      c.beginPath(); c.ellipse(0, hy - 2.8, 4.5, 2.2, 0, Math.PI, TAU); c.fill();
      c.fillRect(0, hy - 3.2, 6, 1.3);
      break;
    case 'minerhelm':
      c.beginPath(); c.arc(0, hy - 1.6, 4.3, Math.PI, TAU); c.fill();
      c.fillRect(-5, hy - 1.9, 10, 1.3);
      c.fillStyle = '#e8d070'; c.fillRect(2.4, hy - 5.2, 2.2, 2);
      break;
  }
}

function drawWeapon(c: Ctx, w: Style['weapon'], bob: number, col: (v?: string) => string, t: number) {
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, lw: number) => {
    c.strokeStyle = col(color); c.lineWidth = lw;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  };
  c.lineCap = 'round';
  switch (w) {
    case 'saber':
      line(6.5, -8 + bob, 12, -0.5, '#c9c9c0', 1.2);
      c.fillStyle = col('#c09a52'); c.fillRect(5.2, -9.4 + bob, 3, 1.6);
      c.fillStyle = col('#2a1d12'); c.fillRect(-7.2, -11 + bob, 2.4, 4.5); // кобура
      break;
    case 'rifle':
      line(4, -4 + bob, 9, -24 + bob, '#3b2a1c', 1.9);
      line(8.4, -21 + bob, 9.8, -28 + bob, '#6a6a66', 1);
      break;
    case 'musket':
      line(3.5, -3 + bob, 9, -26 + bob, '#5a3e24', 1.9);
      line(8.5, -24 + bob, 9.4, -28 + bob, '#555', 1.1);
      break;
    case 'fork':
      line(7, 1, 7, -27 + bob, '#5a4630', 1.5);
      line(5, -27 + bob, 9, -27 + bob, '#777', 0.9);
      for (const px of [5, 7, 9]) line(px, -27 + bob, px, -32 + bob, '#888', 0.8);
      break;
    case 'hammer':
      line(6.5, -6 + bob, 9.5, -20 + bob, '#4a3420', 1.7);
      c.fillStyle = col('#4c4c4c'); c.fillRect(6.2, -24 + bob, 7, 4.4);
      break;
    case 'staff': {
      line(7.5, 1, 7.5, -30 + bob, '#2a2018', 1.6);
      c.save(); c.shadowColor = '#9fef6a'; c.shadowBlur = 12;
      c.fillStyle = '#c0f28a';
      c.beginPath(); c.arc(7.5, -32 + bob, 2.3 + Math.sin(t * 4) * 0.3, 0, TAU); c.fill(); c.restore();
      break;
    }
    case 'pole':
      line(6.5, 0, 9.5, -33, '#4a3a28', 1.2);
      c.fillStyle = '#f0a040'; c.fillRect(9, -35, 1.6, 2);
      break;
    case 'bottle':
      c.fillStyle = col('#3d5a2a'); c.fillRect(6, -11 + bob, 2.2, 4.2); c.fillRect(6.6, -12.5 + bob, 1, 1.6);
      break;
  }
}

function drawImp(c: Ctx, t: number, col: (v?: string) => string, bob: number) {
  const fl = Math.sin(t * 11) * 2.2;
  const y = -4 + bob * 2; // парит
  c.fillStyle = col('#250b0b');
  c.beginPath(); c.moveTo(-1, y - 9); c.lineTo(-12, y - 17 + fl); c.lineTo(-8, y - 9); c.lineTo(-12, y - 5 + fl * 0.5); c.lineTo(-2, y - 4); c.fill();
  c.fillStyle = col('#5e1a14');
  c.beginPath(); c.ellipse(0, y - 5, 5, 6, 0, 0, TAU); c.fill();
  c.fillRect(-3, y - 1, 2, 4); c.fillRect(1, y - 1, 2, 4);
  c.beginPath(); c.arc(2, y - 12, 3.6, 0, TAU); c.fill();
  c.strokeStyle = col('#d8c8a0'); c.lineWidth = 1;
  c.beginPath(); c.moveTo(0.5, y - 14.5); c.lineTo(-1.5, y - 18.5); c.moveTo(3.5, y - 14.8); c.lineTo(4.8, y - 19); c.stroke();
  c.strokeStyle = col('#5e1a14'); c.lineWidth = 1.3;
  c.beginPath(); c.moveTo(-4, y - 2); c.quadraticCurveTo(-10, y, -9, y - 7 + fl * 0.5); c.stroke();
  c.save(); c.shadowColor = '#e8ff6a'; c.shadowBlur = 5; c.fillStyle = '#eaff7a';
  c.fillRect(3, y - 13, 1.3, 1); c.fillRect(4.7, y - 13, 1.2, 1); c.restore();
}

// ------------------------------------------------------------------ небо

/** Небо с Оком — тусклым зелёным светилом. */
export function drawSky(c: Ctx, t: number, w: number, h: number) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#11170f'); g.addColorStop(0.6, '#222c1c'); g.addColorStop(1, '#344029');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const sx = 170, sy = 44, p = 1 + Math.sin(t * 0.7) * 0.04;
  const glow = c.createRadialGradient(sx, sy, 0, sx, sy, 130 * p);
  glow.addColorStop(0, 'rgba(180,235,125,0.42)'); glow.addColorStop(0.3, 'rgba(140,200,100,0.15)'); glow.addColorStop(1, 'rgba(120,180,90,0)');
  c.fillStyle = glow; c.fillRect(0, 0, w, h);
  c.fillStyle = '#b9d992';
  c.beginPath(); c.arc(sx, sy, 19 * p, 0, TAU); c.fill();
  c.fillStyle = 'rgba(70,100,50,0.5)';
  c.beginPath(); c.ellipse(sx + 2, sy, 6, 9 * p, 0, 0, TAU); c.fill(); // «зрачок»
  c.strokeStyle = 'rgba(40,60,30,0.65)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(sx - 15, sy - 10); c.lineTo(sx - 5, sy - 3); c.lineTo(sx - 9, sy + 6);
  c.moveTo(sx + 12, sy - 13); c.lineTo(sx + 7, sy - 2); c.stroke();
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 290 + t * (4 + i)) % 1300) - 150;
    c.fillStyle = 'rgba(16,22,14,0.55)';
    c.beginPath(); c.ellipse(cx, 18 + i * 14, 170, 5 + (i % 2) * 2, 0, 0, TAU); c.fill();
  }
}

// ------------------------------------------------------------------ свет

export interface Light { x: number; y: number; r: number; a: number; color?: string }

/**
 * Затемнение с «вырезанными» источниками света + цветное свечение поверх.
 * darkTop/darkBottom — непрозрачность тьмы сверху/снизу.
 */
export class Lighting {
  cv = document.createElement('canvas');
  lc: Ctx;
  constructor(public w: number, public h: number) {
    this.cv.width = w; this.cv.height = h;
    this.lc = this.cv.getContext('2d')!;
  }
  draw(c: Ctx, lights: Light[], darkTop: number, darkBottom: number, tint = '6,11,6') {
    const l = this.lc;
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, this.w, this.h);
    const g = l.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, `rgba(${tint},${darkTop})`);
    g.addColorStop(0.2, `rgba(${tint},${(darkTop + darkBottom) / 2})`);
    g.addColorStop(1, `rgba(${tint},${darkBottom})`);
    l.fillStyle = g; l.fillRect(0, 0, this.w, this.h);
    l.globalCompositeOperation = 'destination-out';
    for (const L of lights) {
      if (L.a <= 0) continue;
      const rg = l.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
      rg.addColorStop(0, `rgba(0,0,0,${L.a})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = rg;
      l.beginPath(); l.arc(L.x, L.y, L.r, 0, TAU); l.fill();
    }
    c.drawImage(this.cv, 0, 0);
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      if (!L.color || L.a <= 0) continue;
      const r = L.r * 0.55;
      const rg = c.createRadialGradient(L.x, L.y, 0, L.x, L.y, r);
      rg.addColorStop(0, hexA(L.color, 0.2 * L.a));
      rg.addColorStop(1, hexA(L.color, 0));
      c.fillStyle = rg;
      c.beginPath(); c.arc(L.x, L.y, r, 0, TAU); c.fill();
    }
    c.restore();
  }
}

export function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Мерцание фонаря. Сломанные фонари то гаснут, то вспыхивают. */
export function flicker(t: number, phase: number, broken: boolean) {
  if (broken) {
    const v = Math.sin(t * 2.7 + phase) + Math.sin(t * 7.3 + phase * 3) + Math.sin(t * 17 + phase);
    if (v > 0.9) return 0;
    return 0.35 + (Math.sin(t * 31 + phase) * 0.5 + 0.5) * 0.3;
  }
  return 0.82 + Math.sin(t * 9 + phase) * Math.sin(t * 5.3 + phase * 2) * 0.12;
}

// ------------------------------------------------------------------ пепел

interface Ash { x: number; y: number; vx: number; vy: number; s: number; a: number }
const ash: Ash[] = [];
export function updateAsh(dt: number, w: number, h: number) {
  while (ash.length < 70) ash.push({ x: Math.random() * w, y: Math.random() * h, vx: 6 + Math.random() * 10, vy: 8 + Math.random() * 14, s: 0.6 + Math.random() * 1.3, a: 0.2 + Math.random() * 0.4 });
  for (const p of ash) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.y > h) { p.y = -4; p.x = Math.random() * w; }
    if (p.x > w) p.x = -4;
  }
}
export function drawAsh(c: Ctx, t: number) {
  for (const p of ash) {
    c.fillStyle = `rgba(170,180,150,${p.a})`;
    c.fillRect(p.x + Math.sin(t + p.y * 0.05) * 3, p.y, p.s, p.s);
  }
}

export function vignette(c: Ctx, w: number, h: number) {
  const g = c.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
}

// ------------------------------------------------------------------ окружение

export function drawDeadTree(c: Ctx, x: number, y: number, r: () => number, size = 1) {
  c.strokeStyle = '#1b1814'; c.lineCap = 'round';
  const br = (x: number, y: number, a: number, len: number, w: number, d: number) => {
    if (d === 0 || len < 2) return;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
    br(x2, y2, a - 0.35 - r() * 0.45, len * 0.7, w * 0.62, d - 1);
    if (r() < 0.8) br(x2, y2, a + 0.3 + r() * 0.45, len * 0.66, w * 0.6, d - 1);
  };
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath(); c.ellipse(x, y, 9 * size, 3 * size, 0, 0, TAU); c.fill();
  br(x, y, -Math.PI / 2 + (r() - 0.5) * 0.25, 17 * size, 4.2 * size, 5);
}

export function drawCrate(c: Ctx, x: number, y: number, s: number, barrel: boolean) {
  if (barrel) {
    c.fillStyle = '#2a2a26'; c.fillRect(x - s * 0.32, y - s * 0.85, s * 0.64, s * 0.8);
    c.fillStyle = '#1a1a17'; c.beginPath(); c.ellipse(x, y - s * 0.85, s * 0.32, s * 0.12, 0, 0, TAU); c.fill();
    c.fillStyle = '#5a3a1e'; c.fillRect(x - s * 0.32, y - s * 0.65, s * 0.64, 2); c.fillRect(x - s * 0.32, y - s * 0.3, s * 0.64, 2);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, y - s * 0.85, s * 0.32, s * 0.8);
    return;
  }
  const w = s * 0.75, h = s * 0.62;
  c.fillStyle = '#4e3a24'; c.fillRect(x - w / 2, y - h - 3, w, h);
  c.fillStyle = '#5f4830'; c.fillRect(x - w / 2, y - h - 8, w, 6);
  c.strokeStyle = '#2c2014'; c.lineWidth = 1.4;
  c.strokeRect(x - w / 2, y - h - 3, w, h);
  c.beginPath(); c.moveTo(x - w / 2, y - h - 3); c.lineTo(x + w / 2, y - 3); c.stroke();
}
