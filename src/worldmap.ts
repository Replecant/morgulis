// ============================================================
//  Глобальная карта региона (в духе Mount & Blade):
//  отряд свободно ходит по карте, время идёт, деревни — входы
//  в локальные сцены, примечательности — события на карте.
// ============================================================
import { G } from './state';
import { seeded, TAU, clamp, dist, Pt } from './util';
import { drawFigure, Lighting, Light, drawAsh, vignette } from './gfx';

const VW = 960, VH = 640;
export const WW = 1920, WH = 1280;

export interface Loc {
  id: string; name: string; kind: 'village' | 'fort' | 'poi';
  x: number; y: number; talk: string; scene?: string; desc: string;
}
export const LOCS: Loc[] = [
  { id: 'ashford', name: 'Эшфорд', kind: 'village', x: 430, y: 760, talk: 'loc_ashford', scene: 'ashford', desc: 'Деревня нефтяников. Качалки, цистерны, пустые дома.' },
  { id: 'richmord', name: 'Ричморд', kind: 'village', x: 1180, y: 330, talk: 'loc_richmord', scene: 'richmord', desc: 'Жучиные фермы. Мясо и панцирь.' },
  { id: 'fenmor', name: 'Фенмор', kind: 'village', x: 470, y: 270, talk: 'loc_fenmor', scene: 'fenmor', desc: 'Грибные фермы в болотистой низине.' },
  { id: 'fort', name: 'Форт барона', kind: 'fort', x: 1730, y: 840, talk: 'loc_fort', scene: 'fortgate', desc: 'Город-крепость барона Олдриджа.' },
  { id: 'airship', name: 'Руины дирижабля', kind: 'poi', x: 930, y: 520, talk: 'poi_airship', desc: 'Остов огромного воздушного корабля.' },
  { id: 'post', name: 'Разрушенный пост', kind: 'poi', x: 1150, y: 905, talk: 'poi_post', desc: 'Руины имперского поста между трактом и путями.' },
  { id: 'bones', name: 'Старые кости', kind: 'poi', x: 760, y: 430, talk: 'poi_bones', desc: 'Скелет исполинского жука.' },
  { id: 'lorry', name: 'Остов грузовика', kind: 'poi', x: 1380, y: 800, talk: 'poi_lorry', desc: 'Брошенная имперская машина у тракта.' },
  { id: 'flare', name: 'Газовый факел', kind: 'poi', x: 230, y: 640, talk: 'poi_flare', desc: 'Вечный огонь над старой скважиной.' },
];
const ROADS: number[][][] = [
  [[430, 760], [600, 790], [800, 800], [1000, 830], [1200, 850], [1400, 830], [1560, 850], [1730, 840]],
  [[800, 800], [880, 680], [960, 560], [1060, 440], [1180, 330]],
  [[430, 760], [450, 600], [480, 440], [470, 270]],
];
const RAIL: number[][] = [[0, 900], [300, 890], [440, 880], [700, 910], [1000, 950], [1300, 940], [1550, 910], [1730, 880]];

const SPEED = 55;          // пикселей карты в час по бездорожью
const ROAD_BONUS = 1.7;    // по дороге быстрее
const HOURS_PER_SEC = 1.2; // сколько игровых часов проходит за секунду пути

function segDist(p: Pt, a: number[], b: number[]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const k = clamp(((p.x - a[0]) * dx + (p.y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(p.x - (a[0] + dx * k), p.y - (a[1] + dy * k));
}
const onRoad = (p: Pt) => ROADS.some((r) => r.some((pt, i) => i > 0 && segDist(p, r[i - 1], pt) < 14));

export const World = {
  bg: null as HTMLCanvasElement | null,
  light: null as Lighting | null,
  party: { x: 430, y: 790, tx: 430, ty: 790, moving: false, flip: false },
  pending: null as Loc | null,
  hover: null as Loc | null,
  cam: { x: 0, y: 0 },
  band: { x: 1050, y: 1080, tx: 1050, ty: 1080, alive: true, respawn: 0, calm: 0, seen: false },
  onArrive: (_l: Loc) => {},
  onEncounter: () => {},
  onDay: () => {},
  lastDay: 0,

  init() {
    this.bg = renderBackground();
    this.light = this.light ?? new Lighting(VW, VH);
    this.band = { x: 1050, y: 1080, tx: 1050, ty: 1080, alive: true, respawn: 0, calm: 0, seen: false };
    this.lastDay = Math.floor(G.clock / 24);
  },

  /** Поставить отряд рядом с местом (после выхода из сцены). */
  placeAt(id: string) {
    const l = LOCS.find((l) => l.scene === id || l.id === id)!;
    this.party.x = this.party.tx = l.x; this.party.y = this.party.ty = l.y + 30;
    this.party.moving = false; this.pending = null;
    this.updateLocation();
  },

  locAt(x: number, y: number, r = 26) { return LOCS.find((l) => Math.hypot(l.x - x, l.y - y) < (l.kind === 'fort' ? 70 : r)) ?? null; },
  nearLoc() { return LOCS.find((l) => dist(l, this.party) < (l.kind === 'fort' ? 90 : 40)) ?? null; },
  updateLocation() {
    const l = this.nearLoc();
    G.location = l ? `У места: ${l.name}` : onRoad(this.party) ? 'Тракт' : 'Серая пустошь';
  },

  click(mx: number, my: number) {
    const x = mx + this.cam.x, y = my + this.cam.y;
    const l = this.locAt(x, y);
    if (l) { this.pending = l; this.party.tx = l.x; this.party.ty = l.y + (l.kind === 'fort' ? 60 : 0); }
    else { this.pending = null; this.party.tx = clamp(x, 10, WW - 10); this.party.ty = clamp(y, 10, WH - 10); }
    this.party.moving = true;
  },
  hoverAt(mx: number, my: number) { this.hover = this.locAt(mx + this.cam.x, my + this.cam.y); },
  interactKey() { const l = this.nearLoc(); if (l) this.onArrive(l); },

  update(dt: number) {
    const p = this.party, k = G.keys;
    let vx = 0, vy = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) vx -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) vx += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) vy -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) vy += 1;
    let moved = 0;
    const speed = SPEED * (onRoad(p) ? ROAD_BONUS : 1) * HOURS_PER_SEC;
    if (vx || vy) {
      const n = Math.hypot(vx, vy);
      p.x = clamp(p.x + (vx / n) * speed * dt, 10, WW - 10); p.y = clamp(p.y + (vy / n) * speed * dt, 10, WH - 10);
      if (vx) p.flip = vx < 0;
      p.moving = false; this.pending = null; moved = speed * dt;
    } else if (p.moving) {
      const d = Math.hypot(p.tx - p.x, p.ty - p.y), stepLen = Math.min(d, speed * dt);
      if (d > 0.5) { p.x += ((p.tx - p.x) / d) * stepLen; p.y += ((p.ty - p.y) / d) * stepLen; if (Math.abs(p.tx - p.x) > 1) p.flip = p.tx < p.x; moved = stepLen; }
      if (d - stepLen < 1) {
        p.moving = false;
        if (this.pending) { const l = this.pending; this.pending = null; this.onArrive(l); }
      }
    }
    if (moved) {
      G.clock += dt * HOURS_PER_SEC;
      this.updateLocation();
      const day = Math.floor(G.clock / 24);
      if (day > this.lastDay) { this.lastDay = day; this.onDay(); }
      this.updateBand(dt);
    }
  },

  /** Банда мародёров: бродит по пустоши, замечает отряд и преследует. */
  updateBand(dt: number) {
    const b = this.band, p = this.party;
    if (!b.alive) {
      if (G.clock >= b.respawn) {
        b.alive = true;
        do { b.x = 200 + Math.random() * 1500; b.y = 200 + Math.random() * 900; } while (dist(b, p) < 500 || LOCS.some((l) => l.kind !== 'poi' && dist(l, b) < 160));
        b.tx = b.x; b.ty = b.y;
      }
      return;
    }
    const d = dist(b, p);
    const chase = d < 230 && G.clock >= b.calm && !LOCS.some((l) => l.kind !== 'poi' && dist(l, p) < 110);
    b.seen = d < 330;
    if (chase) { b.tx = p.x; b.ty = p.y; }
    else if (dist(b, { x: b.tx, y: b.ty }) < 4 || (G.clock < b.calm && dist(b, p) < 300)) {
      // бродим (или уходим подальше, если откупились)
      const away = G.clock < b.calm;
      const a = away ? Math.atan2(b.y - p.y, b.x - p.x) + (Math.random() - 0.5) : Math.random() * TAU;
      b.tx = clamp(b.x + Math.cos(a) * 250, 100, WW - 250); b.ty = clamp(b.y + Math.sin(a) * 250, 100, WH - 100);
      if (LOCS.some((l) => l.kind !== 'poi' && dist(l, { x: b.tx, y: b.ty }) < 150)) { b.tx = b.x; b.ty = b.y; }
    }
    const sp = (chase ? 68 : 40) * HOURS_PER_SEC * dt;
    const dd = dist(b, { x: b.tx, y: b.ty });
    if (dd > 0.5) { b.x += ((b.tx - b.x) / dd) * Math.min(sp, dd); b.y += ((b.ty - b.y) / dd) * Math.min(sp, dd); }
    if (chase && dist(b, p) < 20) { p.moving = false; this.pending = null; G.keys.clear(); this.onEncounter(); }
  },
  /** После откупа или удачного бегства банда на время отстаёт. */
  calmBand(hours: number) { this.band.calm = G.clock + hours; },
  killBand() { this.band.alive = false; this.band.respawn = G.clock + 72; },

  // ========================================================== отрисовка
  draw(c: CanvasRenderingContext2D, t: number) {
    const p = this.party;
    this.cam.x = clamp(p.x - VW / 2, 0, WW - VW);
    this.cam.y = clamp(p.y - VH / 2, 0, WH - VH);
    const cx = Math.round(this.cam.x), cy = Math.round(this.cam.y);
    c.drawImage(this.bg!, cx, cy, VW, VH, 0, 0, VW, VH);
    c.save(); c.translate(-cx, -cy);

    // дым над фортом и факел
    for (let i = 0; i < 4; i++) {
      const sx = 1700 + i * 22, k = (t * 0.25 + i * 0.3) % 1;
      c.fillStyle = `rgba(60,70,55,${0.35 * (1 - k)})`;
      c.beginPath(); c.arc(sx + k * 40, 760 - k * 90, 8 + k * 26, 0, TAU); c.fill();
    }
    const fl = LOCS.find((l) => l.id === 'flare')!;
    drawFlame(c, fl.x, fl.y - 26, t);

    // метки мест
    for (const l of LOCS) {
      const hv = this.hover === l || this.pending === l;
      if (l.kind === 'poi') {
        c.fillStyle = hv ? 'rgba(232,208,144,0.25)' : 'rgba(0,0,0,0.25)';
        c.beginPath(); c.arc(l.x, l.y, 20, 0, TAU); c.fill();
      }
    }
    // цель пути
    if (p.moving) {
      c.strokeStyle = 'rgba(232,208,144,0.7)'; c.setLineDash([5, 6]); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.tx, p.ty); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(p.tx, p.ty, 5 + Math.sin(t * 5), 0, TAU); c.stroke();
    }
    // банда
    const b = this.band;
    if (b.alive && b.seen) {
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(b.x, b.y + 2, 12, 4, 0, 0, TAU); c.fill();
      drawFigure(c, 'militia_gun', b.x - 5, b.y, 0.75, { t, flip: b.tx < b.x });
      drawFigure(c, 'militia', b.x + 6, b.y + 3, 0.75, { t, seed: 2, flip: b.tx < b.x });
    }
    // отряд
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(p.x, p.y + 2, 10, 3.5, 0, 0, TAU); c.fill();
    drawFigure(c, G.squad[0]?.look ?? 'pc', p.x, p.y, 0.85, { t: p.moving ? t * 3 : t, flip: p.flip });
    c.restore();

    // свет
    const lights: Light[] = [];
    const L = (x: number, y: number, r: number, a: number, color?: string) => lights.push({ x: x - cx, y: y - cy, r, a, color });
    for (const l of LOCS) {
      if (l.kind === 'village') L(l.x, l.y, 90, 0.7, l.id === 'fenmor' ? '#a8f070' : '#f0c070');
      if (l.kind === 'fort') L(l.x, l.y - 30, 200, 0.75, '#e8d090');
    }
    L(fl.x, fl.y - 30, 170, 0.8 + Math.sin(t * 9) * 0.1, '#ff9a40');
    L(p.x, p.y, 120, 0.75, '#d8c890');
    this.light!.draw(c, lights, 0.45, 0.45, '6,12,6');
    c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = '#b8cca8'; c.fillRect(0, 0, VW, VH); c.restore();
    drawAsh(c, t);
    vignette(c, VW, VH);

    // подписи (поверх темноты)
    for (const l of LOCS) {
      const x = l.x - cx, y = l.y - cy + (l.kind === 'fort' ? 110 : l.kind === 'village' ? 44 : 30);
      if (x < -100 || x > VW + 100 || y < -40 || y > VH + 40) continue;
      const hv = this.hover === l || this.pending === l;
      c.font = l.kind === 'poi' ? 'italic 13px "Old Standard TT", serif' : `bold ${l.kind === 'fort' ? 20 : 16}px "Playfair Display SC", serif`;
      c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillText(l.name, x + 1, y + 1);
      c.fillStyle = hv ? '#ffe8a0' : l.kind === 'poi' ? '#c8c0a0' : '#e8dcb0'; c.fillText(l.name, x, y);
      if (hv) { c.font = '12px "Old Standard TT", serif'; c.fillStyle = '#b9b49a'; c.fillText(l.desc, x, y + 16); }
      c.textAlign = 'left';
    }
    if (b.alive && b.seen) {
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      c.fillStyle = '#e07060'; c.fillText(G.clock < b.calm ? 'Мародёры (отстали)' : dist(b, p) < 230 ? 'Мародёры — преследуют!' : 'Мародёры', b.x - cx, b.y - cy - 34);
      c.textAlign = 'left';
    }
    const near = this.nearLoc();
    if (near && !p.moving) {
      const label = `[E] ${near.name}`;
      c.font = '13px "Old Standard TT", serif';
      const w = c.measureText(label).width + 14, x = p.x - cx - w / 2, y = p.y - cy - 52;
      c.fillStyle = 'rgba(8,12,7,0.85)'; c.fillRect(x, y, w, 18); c.strokeStyle = '#c09a52'; c.strokeRect(x + 0.5, y + 0.5, w - 1, 17);
      c.fillStyle = '#e0dcc0'; c.textAlign = 'center'; c.fillText(label, x + w / 2, y + 13); c.textAlign = 'left';
    }
  },
};

/** Время: «День 3, 14:00». */
export function clockText() {
  const d = Math.floor(G.clock / 24) + 1, h = Math.floor(G.clock % 24);
  return `День ${d}, ${String(h).padStart(2, '0')}:00`;
}

// ============================================================ фон карты
function renderBackground(): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = WW; cv.height = WH;
  const c = cv.getContext('2d')!;
  const r = seeded(4242);
  // земля
  c.fillStyle = '#4a4a42'; c.fillRect(0, 0, WW, WH);
  for (let i = 0; i < 1800; i++) {
    const x = r() * WW, y = r() * WH, rr = 20 + r() * 90;
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    const v = r() < 0.5 ? '30,30,26' : '110,108,96';
    g.addColorStop(0, `rgba(${v},${0.05 + r() * 0.07})`); g.addColorStop(1, `rgba(${v},0)`);
    c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // трещины
  c.strokeStyle = 'rgba(25,24,20,0.35)'; c.lineWidth = 1;
  for (let i = 0; i < 420; i++) {
    let x = r() * WW, y = r() * WH; c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; c.lineTo(x, y); }
    c.stroke();
  }
  // сухое русло
  c.strokeStyle = 'rgba(30,28,22,0.5)'; c.lineWidth = 10; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, 360); c.bezierCurveTo(400, 420, 700, 300, 1000, 420); c.bezierCurveTo(1300, 540, 1500, 480, 1920, 620); c.stroke();
  c.strokeStyle = 'rgba(90,86,72,0.35)'; c.lineWidth = 3; c.stroke();
  // холмы
  const hill = (x: number, y: number, s: number) => {
    const g = c.createRadialGradient(x - s * 0.3, y - s * 0.3, 2, x, y, s);
    g.addColorStop(0, 'rgba(120,118,104,0.35)'); g.addColorStop(0.6, 'rgba(60,60,52,0.15)'); g.addColorStop(1, 'rgba(20,20,16,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, s, s * 0.6, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(15,15,12,0.25)'; c.beginPath(); c.ellipse(x + s * 0.25, y + s * 0.2, s * 0.8, s * 0.4, 0, 0, TAU); c.fill();
  };
  for (const [x, y, n] of [[1500, 300, 7], [300, 1100, 6], [900, 1150, 5], [1650, 1150, 5], [150, 200, 4], [1300, 620, 3]]) for (let i = 0; i < n; i++) hill(x + (r() - 0.5) * 260, y + (r() - 0.5) * 160, 40 + r() * 50);
  // мёртвые рощи
  const tree = (x: number, y: number) => {
    c.strokeStyle = '#1a1814'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 9);
    c.moveTo(x, y - 6); c.lineTo(x - 4, y - 11); c.moveTo(x, y - 5); c.lineTo(x + 4, y - 10); c.stroke();
  };
  for (const [x, y, n] of [[650, 580, 40], [1420, 560, 45], [250, 430, 35], [1050, 1150, 30], [820, 1020, 20], [1600, 420, 25]]) for (let i = 0; i < n; i++) tree(x + (r() - 0.5) * 220, y + (r() - 0.5) * 130);
  // болото вокруг Фенмора
  for (let i = 0; i < 40; i++) {
    const a = r() * TAU, d = 30 + r() * 170, x = 470 + Math.cos(a) * d, y = 270 + Math.sin(a) * d * 0.7;
    c.fillStyle = r() < 0.5 ? 'rgba(20,34,20,0.6)' : 'rgba(40,56,30,0.45)';
    c.beginPath(); c.ellipse(x, y, 10 + r() * 26, 5 + r() * 12, r() * 3, 0, TAU); c.fill();
  }
  for (let i = 0; i < 160; i++) {
    const a = r() * TAU, d = r() * 200, x = 470 + Math.cos(a) * d, y = 270 + Math.sin(a) * d * 0.7;
    c.strokeStyle = '#3a4a2a'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 3, y - 5 - r() * 4); c.stroke();
  }
  // нефтяное поле у Эшфорда
  const derrick = (x: number, y: number) => {
    c.strokeStyle = '#1a1814'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x, y - 14); c.lineTo(x + 4, y); c.moveTo(x - 3, y - 4); c.lineTo(x + 3, y - 4); c.moveTo(x - 2, y - 8); c.lineTo(x + 2, y - 8); c.stroke();
    c.fillStyle = 'rgba(10,10,8,0.5)'; c.beginPath(); c.ellipse(x, y + 1, 7, 2.5, 0, 0, TAU); c.fill();
  };
  for (let i = 0; i < 26; i++) derrick(180 + r() * 360, 600 + r() * 240);
  // воронки
  for (let i = 0; i < 70; i++) {
    const x = r() * WW, y = r() * WH, s = 6 + r() * 14;
    const g = c.createRadialGradient(x, y, 1, x, y, s);
    g.addColorStop(0, 'rgba(15,14,11,0.6)'); g.addColorStop(0.8, 'rgba(40,38,32,0.3)'); g.addColorStop(1, 'rgba(110,108,96,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
  }
  // железная дорога
  const poly = (pts: number[][]) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) c.lineTo(p[0], p[1]); };
  c.strokeStyle = '#26221c'; c.lineWidth = 7; poly(RAIL); c.stroke();
  c.strokeStyle = '#5a5850'; c.lineWidth = 1.2; c.setLineDash([2, 5]); poly(RAIL); c.stroke(); c.setLineDash([]);
  for (let i = 1; i < RAIL.length; i++) {
    const [x0, y0] = RAIL[i - 1], [x1, y1] = RAIL[i], len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    c.strokeStyle = '#3a3428'; c.lineWidth = 1.5;
    for (let k = 0; k < len; k += 9) { const x = x0 + (x1 - x0) * (k / len), y = y0 + (y1 - y0) * (k / len); c.beginPath(); c.moveTo(x - nx * 5, y - ny * 5); c.lineTo(x + nx * 5, y + ny * 5); c.stroke(); }
  }
  // дороги
  for (const rd of ROADS) {
    c.strokeStyle = 'rgba(20,18,14,0.6)'; c.lineWidth = 10; c.lineJoin = 'round'; poly(rd); c.stroke();
    c.strokeStyle = '#6a604a'; c.lineWidth = 5; poly(rd); c.stroke();
    c.strokeStyle = 'rgba(40,34,26,0.6)'; c.lineWidth = 1; c.setLineDash([6, 8]); poly(rd); c.stroke(); c.setLineDash([]);
  }
  // значки мест
  for (const l of LOCS) drawLocIcon(c, l, r);
  // края региона тонут во мгле
  const fog = c.createRadialGradient(WW / 2, WH / 2, WH * 0.45, WW / 2, WH / 2, WW * 0.62);
  fog.addColorStop(0, 'rgba(8,10,7,0)'); fog.addColorStop(1, 'rgba(8,10,7,0.85)');
  c.fillStyle = fog; c.fillRect(0, 0, WW, WH);
  return cv;
}

function house(c: CanvasRenderingContext2D, x: number, y: number, s = 1, roof = '#2a2b2d', lit = true) {
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x - 7 * s, y, 15 * s, 3 * s);
  c.fillStyle = '#3b3229'; c.fillRect(x - 6 * s, y - 7 * s, 12 * s, 7 * s);
  c.fillStyle = roof; c.beginPath(); c.moveTo(x - 8 * s, y - 6 * s); c.lineTo(x, y - 13 * s); c.lineTo(x + 8 * s, y - 6 * s); c.fill();
  if (lit) { c.fillStyle = '#c8a050'; c.fillRect(x - 3 * s, y - 5 * s, 2.5 * s, 2.5 * s); }
}

function drawLocIcon(c: CanvasRenderingContext2D, l: Loc, r: () => number) {
  const { x, y } = l;
  switch (l.id) {
    case 'ashford':
      house(c, x - 18, y - 2); house(c, x + 4, y - 8); house(c, x + 18, y + 4, 1, '#2a2b2d', false); house(c, x - 4, y + 10, 1, '#2a2b2d', false);
      c.fillStyle = '#3a3a34'; c.beginPath(); c.ellipse(x + 30, y - 10, 7, 9, 0, 0, TAU); c.fill(); // резервуар
      break;
    case 'richmord':
      c.strokeStyle = '#3a3022'; c.lineWidth = 2; c.strokeRect(x - 30, y - 22, 26, 16); c.strokeRect(x + 4, y - 20, 24, 16);
      c.fillStyle = '#3a2414'; c.beginPath(); c.ellipse(x - 17, y - 14, 6, 4, 0.4, 0, TAU); c.ellipse(x + 16, y - 12, 6, 4, -0.3, 0, TAU); c.fill();
      house(c, x - 16, y + 12, 1, '#2e2620'); house(c, x + 2, y + 12, 1.2, '#2e2620', false); house(c, x + 22, y + 14);
      break;
    case 'fenmor':
      for (let i = 0; i < 9; i++) { const mx = x - 28 + (i % 3) * 10 + r() * 4, my = y - 12 + Math.floor(i / 3) * 8; c.fillStyle = '#c8c0a0'; c.fillRect(mx - 0.6, my, 1.2, 3); c.fillStyle = '#9ad078'; c.beginPath(); c.ellipse(mx, my, 3, 2, 0, Math.PI, TAU); c.fill(); }
      house(c, x + 12, y - 4, 1, '#2e3a24'); house(c, x + 26, y + 8, 1, '#2e3a24', false);
      c.fillStyle = '#24261c'; c.beginPath(); c.ellipse(x - 10, y + 14, 12, 6, 0, Math.PI, TAU); c.fill(); // погреб
      break;
    case 'fort': {
      const R = 95;
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(x + 8, y + 8, R + 10, R * 0.7, 0, 0, TAU); c.fill();
      c.fillStyle = '#3a3630'; c.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, rr = i % 2 ? R : R * 0.8; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7); }
      c.closePath(); c.fill();
      c.strokeStyle = '#5a5448'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#26221e'; c.beginPath(); c.ellipse(x, y, R * 0.68, R * 0.46, 0, 0, TAU); c.fill();
      for (let i = 0; i < 30; i++) { const a = r() * TAU, d = r() * R * 0.6; house(c, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.65, 0.8, '#1e1c1a', r() < 0.4); }
      for (const [dx, h] of [[-30, 70], [-8, 90], [16, 60]]) { c.fillStyle = '#2a1e18'; c.fillRect(x + dx, y - h, 8, h - 10); }
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; c.fillStyle = '#4a4440'; c.beginPath(); c.arc(x + Math.cos(a) * R, y + Math.sin(a) * R * 0.7, 9, 0, TAU); c.fill(); }
      break;
    }
    case 'airship': {
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(x, y + 6, 46, 12, -0.15, 0, TAU); c.fill();
      c.strokeStyle = '#8a8070'; c.lineWidth = 1.6;
      for (let i = 0; i < 9; i++) { const ax = x - 40 + i * 10; c.beginPath(); c.moveTo(ax, y + 4 - i * 1.2); c.quadraticCurveTo(ax + 3, y - 20 + Math.abs(i - 4) * 2, ax + 6, y + 2 - i * 1.2); c.stroke(); }
      c.beginPath(); c.moveTo(x - 42, y + 4); c.lineTo(x + 46, y - 8); c.stroke();
      c.fillStyle = 'rgba(120,110,90,0.4)'; c.beginPath(); c.moveTo(x - 10, y - 14); c.lineTo(x + 20, y - 18); c.lineTo(x + 26, y - 4); c.lineTo(x - 4, y); c.fill();
      c.fillStyle = '#3a2e22'; c.fillRect(x + 4, y + 2, 16, 7);
      break;
    }
    case 'post':
      c.fillStyle = '#55524a'; c.fillRect(x - 14, y - 6, 4, 14); c.fillRect(x - 14, y + 6, 22, 3); c.fillRect(x + 8, y - 12, 5, 18); c.fillRect(x - 6, y - 10, 10, 3);
      c.fillStyle = 'rgba(240,160,80,0.8)'; c.beginPath(); c.arc(x - 2, y + 1, 2, 0, TAU); c.fill();
      break;
    case 'bones':
      c.strokeStyle = '#b4ae9c'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x - 22, y); c.quadraticCurveTo(x, y - 8, x + 18, y + 2); c.stroke();
      for (let i = 0; i < 5; i++) { const bx = x - 16 + i * 8; c.beginPath(); c.moveTo(bx, y - 4); c.quadraticCurveTo(bx - 4, y + 6, bx - 2, y + 10); c.moveTo(bx, y - 4); c.quadraticCurveTo(bx + 4, y - 14, bx + 2, y - 18); c.stroke(); }
      c.fillStyle = '#c8c2ae'; c.beginPath(); c.ellipse(x + 20, y + 1, 6, 5, 0.3, 0, TAU); c.fill();
      break;
    case 'lorry':
      c.fillStyle = '#3a2a1e'; c.fillRect(x - 16, y - 8, 20, 10); c.fillStyle = '#4a3020'; c.fillRect(x + 4, y - 12, 12, 14);
      c.fillStyle = '#121110'; c.beginPath(); c.arc(x - 10, y + 3, 4, 0, TAU); c.arc(x + 10, y + 3, 4, 0, TAU); c.fill();
      break;
    case 'flare':
      c.strokeStyle = '#1a1814'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x, y - 24); c.lineTo(x + 7, y); c.moveTo(x - 5, y - 8); c.lineTo(x + 5, y - 8); c.moveTo(x - 3, y - 16); c.lineTo(x + 3, y - 16); c.stroke();
      break;
  }
}

function drawFlame(c: CanvasRenderingContext2D, x: number, y: number, t: number) {
  for (let i = 0; i < 3; i++) {
    const h = 14 + Math.sin(t * 11 + i * 2) * 4;
    c.fillStyle = i === 0 ? '#e06020' : i === 1 ? '#f0a040' : '#fff0a0';
    c.beginPath(); c.moveTo(x - 5 + i * 2, y); c.quadraticCurveTo(x - 3 + i, y - h, x + Math.sin(t * 7) * 2, y - h - 6 + i * 3); c.quadraticCurveTo(x + 4 - i, y - h / 2, x + 5 - i * 2, y); c.fill();
  }
}
