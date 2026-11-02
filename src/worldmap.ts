// ============================================================
//  Глобальная карта региона (в духе Mount & Blade):
//  отряд свободно ходит по карте, время идёт, деревни — входы
//  в локальные сцены, примечательности — события на карте.
// ============================================================
import { G } from './state';
import { seeded, TAU, clamp, dist, Pt } from './util';
import { PixelView, LW, LH, PS, PLight, applyLight, prect, ppx, pline, pellipse, pshadow, outline, pixelize, shade } from './px';
import { miniSprite } from './sprites';

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

// патрули барона: первый ходит по тракту Эшфорд — форт, второй — от форта к Ричморду
const PATROL_PATHS: number[][][] = [ROADS[0], [...ROADS[0].slice(2).reverse(), ...ROADS[1].slice(1)]];
const PATROL_SPEED = 36;   // пикселей карты в час
interface Patrol { path: number[][]; len: number; s: number; dir: 1 | -1; wait: number; cool: number; speed: number }
const polyLen = (pts: number[][]) => pts.reduce((a, pt, i) => (i ? a + Math.hypot(pt[0] - pts[i - 1][0], pt[1] - pts[i - 1][1]) : 0), 0);
function polyAt(pts: number[][], s: number): Pt & { dx: number } {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], l = Math.hypot(x1 - x0, y1 - y0);
    if (s <= l || i === pts.length - 1) { const k = clamp(s / l, 0, 1); return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, dx: x1 - x0 }; }
    s -= l;
  }
  return { x: pts[0][0], y: pts[0][1], dx: 0 };
}

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
  view: null as PixelView | null,
  party: { x: 430, y: 790, tx: 430, ty: 790, moving: false, flip: false },
  pending: null as Loc | null,
  hover: null as Loc | null,
  cam: { x: 0, y: 0 },
  band: { x: 1050, y: 1080, tx: 1050, ty: 1080, alive: true, respawn: 0, calm: 0, seen: false },
  onArrive: (_l: Loc) => {},
  onEncounter: () => {},
  onPatrol: () => {},
  patrols: [] as Patrol[],
  onDay: () => {},
  lastDay: 0,

  init() {
    this.bg = renderBackground();
    this.band = { x: 1050, y: 1080, tx: 1050, ty: 1080, alive: true, respawn: 0, calm: 0, seen: false };
    this.lastDay = Math.floor(G.clock / 24);
    // первый выходит из Эшфорда к форту, второй — из форта к Ричморду: идут навстречу и расходятся
    this.patrols = PATROL_PATHS.map((path, i) => { const len = polyLen(path); return { path, len, s: i ? 0 : len * 0.2, dir: 1 as const, wait: 0, cool: 0, speed: i ? PATROL_SPEED * 1.15 : PATROL_SPEED * 0.9 }; });
  },
  patrolPos(pt: Patrol) { return polyAt(pt.path, pt.s); },
  /** Патрули идут по дорогам туда и обратно, на концах отдыхают. Встретив отряд — останавливают его. */
  updatePatrols(dt: number) {
    const hours = dt * HOURS_PER_SEC, p = this.party;
    for (const pt of this.patrols) {
      if (pt.wait > 0) pt.wait -= hours;
      else {
        pt.s += pt.dir * pt.speed * hours;
        if (pt.s >= pt.len || pt.s <= 0) { pt.s = clamp(pt.s, 0, pt.len); pt.dir = pt.dir === 1 ? -1 : 1; pt.wait = 3 + Math.random() * 3; }
      }
      if (G.clock >= pt.cool && dist(this.patrolPos(pt), p) < 24) {
        pt.cool = G.clock + 18;
        p.moving = false; this.pending = null; G.keys.clear();
        this.onPatrol();
        return;
      }
    }
  },
  nearPatrol(q: Pt, r: number) { return this.patrols.some((pt) => dist(this.patrolPos(pt), q) < r); },

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
      this.updatePatrols(dt);
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
    // при патруле рядом мародёры не нападают и уходят подальше от дороги
    const patrolNear = this.nearPatrol(b, 200);
    const chase = d < 230 && G.clock >= b.calm && !patrolNear && !this.nearPatrol(p, 220) && !LOCS.some((l) => l.kind !== 'poi' && dist(l, p) < 110);
    if (patrolNear) {
      const pt = this.patrols.reduce((a, q) => (dist(this.patrolPos(q), b) < dist(this.patrolPos(a), b) ? q : a));
      const pp = this.patrolPos(pt), a = Math.atan2(b.y - pp.y, b.x - pp.x);
      b.tx = clamp(b.x + Math.cos(a) * 260, 100, WW - 250); b.ty = clamp(b.y + Math.sin(a) * 260, 100, WH - 100);
    }
    b.seen = d < 330;
    if (chase) { b.tx = p.x; b.ty = p.y; }
    else if (!patrolNear && (dist(b, { x: b.tx, y: b.ty }) < 4 || (G.clock < b.calm && dist(b, p) < 300))) {
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
    // камера — в пикселях карты, кратно 2 (один пиксель фона = 2 пикселя карты)
    this.cam.x = Math.round(clamp(p.x - VW / 2, 0, WW - VW) / 2) * 2;
    this.cam.y = Math.round(clamp(p.y - VH / 2, 0, WH - VH) / 2) * 2;
    const cx = this.cam.x, cy = this.cam.y, lx = cx / 2, ly = cy / 2;
    const v = (this.view ??= new PixelView(LW, LH)), lc = v.c;
    lc.drawImage(this.bg!, lx, ly, LW, LH, 0, 0, LW, LH);
    const X = (wx: number) => Math.round(wx / 2 - lx), Y = (wy: number) => Math.round(wy / 2 - ly);

    // дым над фортом — пиксельные клубы с растром
    for (let i = 0; i < 5; i++) {
      const k = (t * 0.22 + i * 0.21) % 1;
      const sx = X(1700 + i * 22) + k * 20, sy = Y(760) - k * 45, r = 4 + k * 13;
      ditherDisc(lc, sx, sy, r, '#3c463a', 0.55 * (1 - k));
    }
    const fl = LOCS.find((l) => l.id === 'flare')!;
    pixelFlame(lc, X(fl.x), Y(fl.y) - 13, t);

    // метки примечательностей
    for (const l of LOCS) {
      if (l.kind !== 'poi') continue;
      const hv = this.hover === l || this.pending === l;
      if (hv) ditherRing(lc, X(l.x), Y(l.y), 12, '#e8d090');
    }
    // цель пути — пунктир по пикселям
    if (p.moving) {
      const x0 = X(p.x), y0 = Y(p.y), x1 = X(p.tx), y1 = Y(p.ty), n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
      lc.fillStyle = '#e8d090';
      for (let i = 0; i < n; i++) if ((i + Math.floor(t * 8)) % 6 < 3) lc.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1);
      const rr = 2 + (Math.floor(t * 4) % 2);
      prect(lc, x1 - rr, y1, 1, 1, '#e8d090'); prect(lc, x1 + rr, y1, 1, 1, '#e8d090'); prect(lc, x1, y1 - rr, 1, 1, '#e8d090'); prect(lc, x1, y1 + rr, 1, 1, '#e8d090');
    }
    const fr = (moving: boolean, ph = 0) => moving ? [0, 1, 2, 3][Math.floor(t * 7 + ph) % 4] : 0;
    const mini = (kind: string, x: number, y: number, flip: boolean, frame: number) => {
      const sp = miniSprite(kind, frame), dx = Math.round(x - 6), dy = Math.round(y - 16);
      pshadow(lc, Math.round(x), Math.round(y), 4, 1);
      if (flip) { lc.save(); lc.translate(dx * 2 + 12, 0); lc.scale(-1, 1); lc.drawImage(sp, dx, dy); lc.restore(); }
      else lc.drawImage(sp, dx, dy);
    };
    // банда
    const b = this.band;
    if (b.alive && b.seen) {
      const bm = dist(b, { x: b.tx, y: b.ty }) > 1;
      mini('militia_gun', X(b.x) - 4, Y(b.y), b.tx < b.x, fr(bm));
      mini('militia', X(b.x) + 4, Y(b.y) + 2, b.tx < b.x, fr(bm, 2));
    }
    // патрули барона: трое стражников гуськом
    const pm0 = p.moving || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].some((kk) => G.keys.has(kk));
    for (const pt of this.patrols) {
      const pos = this.patrolPos(pt), back = pt.dir === 1 ? -1 : 1, walk = pm0 && pt.wait <= 0;
      const fl = (pt.dir === 1 ? pos.dx : -pos.dx) < 0;
      for (let k = 2; k >= 0; k--) {
        const q = polyAt(pt.path, clamp(pt.s + back * k * 9, 0, pt.len));
        mini('guard', X(q.x), Y(q.y), fl, fr(walk, k * 1.3));
      }
    }
    // отряд
    const pm = p.moving || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].some((kk) => G.keys.has(kk));
    mini(G.squad[0]?.look ?? 'pc', X(p.x), Y(p.y), p.flip, fr(pm));

    // свет
    const lights: PLight[] = [];
    const L = (wx: number, wy: number, r: number, a: number, color?: string) => lights.push({ x: X(wx), y: Y(wy), r, a, color });
    for (const l of LOCS) {
      if (l.kind === 'village') L(l.x, l.y, 48, 0.55, l.id === 'fenmor' ? '#a8f070' : '#f0c070');
      if (l.kind === 'fort') L(l.x, l.y - 30, 100, 0.6, '#e8d090');
    }
    L(fl.x, fl.y - 30, 80, 0.7 + Math.sin(t * 9) * 0.08, '#ff9a40');
    L(p.x, p.y, 58, 0.55, '#d8c890');
    for (const pt of this.patrols) { const q = this.patrolPos(pt); L(q.x, q.y - 8, 34, 0.5, '#f0d090'); } // фонарь патруля
    applyLight(lc, LW, LH, lights, 0.6, [0.84, 1, 0.78], 0.3);
    // пепел — по одному пикселю
    lc.fillStyle = 'rgba(190,196,170,0.55)';
    for (let i = 0; i < 40; i++) {
      const ax = ((i * 97.3 + t * (6 + (i % 5) * 2)) % (LW + 20)) - 10, ay = ((i * 53.7 + t * (9 + (i % 3) * 3)) % (LH + 20)) - 10;
      lc.fillRect(Math.round(ax + Math.sin(t + i) * 3), Math.round(ay), 1, 1);
    }
    v.present(c, 0, 0, PS);

    // подписи (чёткий текст поверх пиксельного слоя)
    for (const l of LOCS) {
      const x = l.x - cx, y = l.y - cy + (l.kind === 'fort' ? 110 : l.id === 'richmord' ? 70 : l.kind === 'village' ? 44 : 30);
      if (x < -100 || x > VW + 100 || y < -40 || y > VH + 40) continue;
      const hv = this.hover === l || this.pending === l;
      c.font = l.kind === 'poi' ? 'italic 13px "Old Standard TT", serif' : `bold ${l.kind === 'fort' ? 20 : 16}px "Playfair Display SC", serif`;
      c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText(l.name, x + 2, y + 2);
      c.fillStyle = hv ? '#ffe8a0' : l.kind === 'poi' ? '#c8c0a0' : '#e8dcb0'; c.fillText(l.name, x, y);
      if (hv) { c.font = '12px "Old Standard TT", serif'; c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText(l.desc, x + 1, y + 17); c.fillStyle = '#c9c4aa'; c.fillText(l.desc, x, y + 16); }
      c.textAlign = 'left';
    }
    if (b.alive && b.seen) {
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      c.fillStyle = '#e07060'; c.fillText(G.clock < b.calm ? 'Мародёры (отстали)' : dist(b, p) < 230 ? 'Мародёры — преследуют!' : 'Мародёры', b.x - cx, b.y - cy - 40);
      c.textAlign = 'left';
    }
    this.patrols.forEach((pt, i) => {
      const q = this.patrolPos(pt), sx = q.x - cx, sy = q.y - cy;
      if (sx < -60 || sx > VW + 60 || sy < -40 || sy > VH + 60) return;
      if (this.patrols.slice(0, i).some((o) => dist(this.patrolPos(o), q) < 60)) return; // два патруля рядом — одна подпись
      c.font = 'italic 12px "Old Standard TT", serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillText('Патруль барона', sx + 1, sy - 39);
      c.fillStyle = '#d8c080'; c.fillText('Патруль барона', sx, sy - 40);
      c.textAlign = 'left';
    });
    const near = this.nearLoc();
    if (near && !p.moving) {
      const label = `[E] ${near.name}`;
      c.font = '13px "Old Standard TT", serif';
      const w = c.measureText(label).width + 14, x = p.x - cx - w / 2, y = p.y - cy - 58;
      c.fillStyle = 'rgba(8,12,7,0.85)'; c.fillRect(x, y, w, 18); c.strokeStyle = '#c09a52'; c.strokeRect(x + 0.5, y + 0.5, w - 1, 17);
      c.fillStyle = '#e0dcc0'; c.textAlign = 'center'; c.fillText(label, x + w / 2, y + 13); c.textAlign = 'left';
    }
  },
};

const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((q) => (q + 0.5) / 16);
/** Полупрозрачный диск честным растром: пиксели либо есть, либо нет. */
function ditherDisc(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string, a: number) {
  c.fillStyle = col;
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x - cx, y - cy) / r;
    if (d < 1 && a * (1 - d * d * 0.6) > BAY[(y & 3) * 4 + (x & 3)]) c.fillRect(x, y, 1, 1);
  }
}
function ditherRing(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string) {
  c.fillStyle = col;
  for (let i = 0; i < 48; i++) { if (i % 3 === 2) continue; const a = (i / 48) * TAU; c.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.6), 1, 1); }
}
function pixelFlame(c: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const cols = ['#c04818', '#e88030', '#f8c860', '#fff0b0'];
  for (let i = 0; i < 4; i++) {
    const h = 8 - i * 2 + Math.round(Math.sin(t * 11 + i * 2) * 1.5), w = 3 - Math.floor(i * 0.7);
    for (let yy = 0; yy < h; yy++) {
      const ww = Math.max(0, Math.round(w * (1 - yy / h))), sw = Math.round(Math.sin(t * 9 + yy * 0.8) * (yy / h) * 1.5);
      prect(c, x - ww + sw, y - yy, ww * 2 + 1, 1, cols[i]);
    }
  }
}

/** Время: «День 3, 14:00». */
export function clockText() {
  const d = Math.floor(G.clock / 24) + 1, h = Math.floor(G.clock % 24);
  return `День ${d}, ${String(h).padStart(2, '0')}:00`;
}

// ============================================================ фон карты (пиксельный, 960×640)
const BW = WW / 2, BH = WH / 2;
const INK = '#0c0e0a';

/** Нарисовать значок на отдельном холсте, обвести контуром и вклеить (x, y — точка опоры внизу по центру). */
function stamp(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, draw: (s: CanvasRenderingContext2D) => void, edge = true) {
  const cv = document.createElement('canvas'); cv.width = w + 2; cv.height = h + 2;
  const s = cv.getContext('2d')!; s.translate(1, 1); draw(s);
  if (edge) outline(cv, INK);
  c.drawImage(cv, Math.round(x - w / 2 - 1), Math.round(y - h - 1));
}

function renderBackground(): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = BW; cv.height = BH;
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const r = seeded(4242);
  // --- мягкая основа (потом квантуется растром)
  c.save(); c.scale(0.5, 0.5);
  c.fillStyle = '#4a4a42'; c.fillRect(0, 0, WW, WH);
  for (let i = 0; i < 900; i++) {
    const x = r() * WW, y = r() * WH, rr = 30 + r() * 110;
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    const v = r() < 0.5 ? '30,30,26' : '110,108,96';
    g.addColorStop(0, `rgba(${v},${0.06 + r() * 0.08})`); g.addColorStop(1, `rgba(${v},0)`);
    c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  const hill = (x: number, y: number, s: number) => {
    const g = c.createRadialGradient(x - s * 0.3, y - s * 0.3, 2, x, y, s);
    g.addColorStop(0, 'rgba(126,124,108,0.45)'); g.addColorStop(0.6, 'rgba(60,60,52,0.15)'); g.addColorStop(1, 'rgba(20,20,16,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, s, s * 0.6, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(15,15,12,0.3)'; c.beginPath(); c.ellipse(x + s * 0.25, y + s * 0.22, s * 0.8, s * 0.4, 0, 0, TAU); c.fill();
  };
  for (const [x, y, n] of [[1500, 300, 7], [300, 1100, 6], [900, 1150, 5], [1650, 1150, 5], [150, 200, 4], [1300, 620, 3]]) for (let i = 0; i < n; i++) hill(x + (r() - 0.5) * 260, y + (r() - 0.5) * 160, 40 + r() * 50);
  // болото вокруг Фенмора
  for (let i = 0; i < 46; i++) {
    const a = r() * TAU, d = 30 + r() * 170, x = 470 + Math.cos(a) * d, y = 270 + Math.sin(a) * d * 0.7;
    c.fillStyle = r() < 0.5 ? 'rgba(22,38,24,0.75)' : 'rgba(44,60,32,0.6)';
    c.beginPath(); c.ellipse(x, y, 10 + r() * 26, 5 + r() * 12, r() * 3, 0, TAU); c.fill();
  }
  // нефтяные пятна у Эшфорда
  for (let i = 0; i < 18; i++) { c.fillStyle = 'rgba(16,15,12,0.55)'; c.beginPath(); c.ellipse(180 + r() * 360, 600 + r() * 240, 8 + r() * 18, 4 + r() * 8, r() * 3, 0, TAU); c.fill(); }
  c.restore();
  quantize(c, BW, BH, 10);

  // --- чёткие пиксельные детали
  const pts = (a: number[][]) => a.map(([x, y]) => [x / 2, y / 2]);
  const thick = (poly: number[][], col: string, w: number, dash?: [number, number]) => {
    c.fillStyle = col;
    for (let i = 1; i < poly.length; i++) {
      const [x0, y0] = poly[i - 1], [x1, y1] = poly[i], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let k = 0; k <= n; k++) {
        if (dash && (k % (dash[0] + dash[1])) >= dash[0]) continue;
        c.fillRect(Math.round(x0 + (x1 - x0) * k / n - (w - 1) / 2), Math.round(y0 + (y1 - y0) * k / n - (w - 1) / 2), w, w);
      }
    }
  };
  // трещины
  for (let i = 0; i < 380; i++) {
    let x = r() * BW, y = r() * BH;
    for (let k = 0; k < 3; k++) { const nx = x + (r() - 0.5) * 14, ny = y + (r() - 0.5) * 14; pline(c, x, y, nx, ny, '#34342e'); x = nx; y = ny; }
  }
  // сухое русло
  const bed: number[][] = [];
  for (let i = 0; i <= 64; i++) { const x = (i / 64) * BW; bed.push([x, 180 + Math.sin(i * 0.31) * 22 + i * 1.7 + Math.sin(i * 0.9) * 4]); }
  thick(bed, '#2c2a22', 5); thick(bed, '#3a372e', 3); thick(bed, '#5a5646', 1, [3, 4]);
  // воронки
  for (let i = 0; i < 60; i++) {
    const x = Math.round(r() * BW), y = Math.round(r() * BH), s = 3 + Math.round(r() * 5);
    pellipse(c, x, y + 1, s + 1, Math.ceil(s * 0.6) + 1, '#5e5c50'); pellipse(c, x, y, s, Math.ceil(s * 0.6), '#26241e'); pellipse(c, x + 1, y + 1, s - 2, Math.max(1, Math.ceil(s * 0.4) - 1), '#1a1914');
  }
  // мёртвые рощи
  const tree = (x: number, y: number) => {
    const h = 4 + Math.floor(r() * 3);
    prect(c, x, y - h, 1, h, '#1c1a15');
    ppx(c, x - 1, y - h + 1, '#1c1a15'); ppx(c, x - 2, y - h, '#1c1a15');
    ppx(c, x + 1, y - h + 2, '#1c1a15'); ppx(c, x + 2, y - h + 1, '#1c1a15');
    ppx(c, x + 1, y, 'rgba(0,0,0,0.35)');
  };
  for (const [x, y, n] of [[650, 580, 40], [1420, 560, 45], [250, 430, 35], [1050, 1150, 30], [820, 1020, 20], [1600, 420, 25]]) for (let i = 0; i < n; i++) tree(Math.round((x + (r() - 0.5) * 220) / 2), Math.round((y + (r() - 0.5) * 130) / 2));
  // камыш на болоте
  for (let i = 0; i < 180; i++) {
    const a = r() * TAU, d = r() * 200, x = Math.round((470 + Math.cos(a) * d) / 2), y = Math.round((270 + Math.sin(a) * d * 0.7) / 2);
    prect(c, x, y - 2, 1, 2 + Math.round(r()), r() < 0.5 ? '#4a5e32' : '#5e7038');
  }
  // вышки на нефтяном поле
  const derrick = (x: number, y: number) => stamp(c, x, y, 7, 9, (s) => {
    for (let k = 0; k < 8; k++) { const w = Math.round(3 - k * 0.4); ppx(s, 3 - w, 8 - k, '#1e1c17'); ppx(s, 3 + w, 8 - k, '#1e1c17'); }
    prect(s, 2, 5, 3, 1, '#1e1c17'); ppx(s, 3, 0, '#1e1c17'); prect(s, 1, 9, 5, 1, 'rgba(0,0,0,0.4)');
  }, false);
  for (let i = 0; i < 20; i++) derrick(Math.round((180 + r() * 360) / 2), Math.round((600 + r() * 240) / 2));
  // железная дорога: насыпь, шпалы, рельсы
  const rail = pts(RAIL);
  thick(rail, '#2a2620', 6);
  {
    for (let i = 1; i < rail.length; i++) {
      const [x0, y0] = rail[i - 1], [x1, y1] = rail[i], len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
      for (let k = 0; k < len; k += 3) { const x = x0 + (x1 - x0) * (k / len), y = y0 + (y1 - y0) * (k / len); pline(c, x - nx * 3, y - ny * 3, x + nx * 3, y + ny * 3, '#4a3a28'); }
      for (const o of [-1.6, 1.6]) pline(c, x0 + nx * o, y0 + ny * o, x1 + nx * o, y1 + ny * o, '#8a8a80');
    }
  }
  // дороги
  for (const rd of ROADS) { const pr = pts(rd); thick(pr, '#26221a', 6); thick(pr, '#6a604a', 4); thick(pr, '#7e7458', 2, [2, 5]); }
  // атмосферные руины — без подписей и событий
  drawRuins(c, r);
  // значки мест
  for (const l of LOCS) drawLocIcon(c, l, r);
  // края региона тонут во мгле — растровое затемнение
  edgeFog(c, BW, BH);
  return cv;
}

/** Квантовать цвета с растром Байера: мягкие градиенты превращаются в пиксельную «зернистость». */
function quantize(c: CanvasRenderingContext2D, w: number, h: number, step: number) {
  const img = c.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4, b = (BAY[(y & 3) * 4 + (x & 3)] - 0.5) * step;
    for (let k = 0; k < 3; k++) d[p + k] = Math.max(0, Math.min(255, Math.round((d[p + k] + b) / step) * step));
  }
  c.putImageData(img, 0, 0);
}
function edgeFog(c: CanvasRenderingContext2D, w: number, h: number) {
  const img = c.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const rr = Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2) * 0.75);
    let a = Math.max(0, Math.min(0.9, (rr - 0.62) / 0.5));
    if (a <= 0) continue;
    a = Math.floor(a * 4 + BAY[(y & 3) * 4 + (x & 3)]) / 4; // ступени с растром
    const p = (y * w + x) * 4;
    d[p] = d[p] * (1 - a) + 8 * a; d[p + 1] = d[p + 1] * (1 - a) + 10 * a; d[p + 2] = d[p + 2] * (1 - a) + 7 * a;
  }
  c.putImageData(img, 0, 0);
}

/** Домик 11×11: стена, крыша рядами черепицы, окно, дверь. */
function hut(s: CanvasRenderingContext2D, x: number, y: number, roof = '#3a3e48', wall = '#6a5a44', lit = true) {
  prect(s, x + 1, y + 5, 9, 6, wall); prect(s, x + 9, y + 5, 1, 6, shade(wall, -0.3)); prect(s, x + 1, y + 5, 9, 1, shade(wall, -0.35));
  for (let k = 0; k < 5; k++) prect(s, x + k, y + 5 - k, 11 - k * 2, 1, k === 2 ? shade(roof, 0.28) : k === 0 ? shade(roof, -0.2) : roof);
  prect(s, x + 2, y + 7, 2, 2, lit ? '#e8b850' : '#1c1a16');
  prect(s, x + 6, y + 7, 2, 4, '#2a2018');
}

/** Разрушенный домик 11×11: стены с провалами, остатки крыши, пустые окна. */
function ruinHut(s: CanvasRenderingContext2D, x: number, y: number, wall = '#4e4636', roof = '#33353a') {
  prect(s, x + 1, y + 5, 9, 6, wall); prect(s, x + 9, y + 5, 1, 6, shade(wall, -0.3));
  for (let k = 0; k < 3; k++) prect(s, x + k, y + 5 - k, 5 - k, 1, roof);       // уцелела левая половина крыши
  ppx(s, x + 6, y + 5, wall); ppx(s, x + 8, y + 6, '#0c0c0a');                  // зубчатый верх стены
  prect(s, x + 2, y + 7, 2, 2, '#0c0c0a'); prect(s, x + 6, y + 7, 2, 4, '#0c0c0a'); // пустые проёмы
  ppx(s, x + 10, y + 10, shade(wall, -0.2)); ppx(s, x + 11, y + 10, shade(wall, -0.35)); // обломки
}

const RUINS: { kind: string; x: number; y: number }[] = [
  { kind: 'farm', x: 620, y: 650 },
  { kind: 'chapel', x: 1490, y: 455 },
  { kind: 'factory', x: 300, y: 1010 },
  { kind: 'hamlet', x: 1250, y: 1120 },
  { kind: 'tower', x: 1610, y: 650 },
  { kind: 'railcar', x: 560, y: 935 },
  { kind: 'wall', x: 980, y: 210 },
  { kind: 'farm', x: 130, y: 460 },
  { kind: 'tank', x: 1760, y: 1150 },
  { kind: 'wall', x: 860, y: 1110 },
  { kind: 'tower', x: 160, y: 820 },
];

function drawRuins(c: CanvasRenderingContext2D, r: () => number) {
  const stone = '#5e5a50', stoneD = '#3e3b34', brick = '#5a3e30', brickD = '#3a2820', dark = '#0c0c0a';
  for (const ru of RUINS) {
    const x = Math.round(ru.x / 2), y = Math.round(ru.y / 2);
    switch (ru.kind) {
      case 'farm': // заброшенная усадьба: дом, сарай без крыши, повалившийся забор
        stamp(c, x, y + 8, 34, 16, (s) => {
          ruinHut(s, 1, 3, '#55503f');
          prect(s, 15, 8, 9, 6, '#4a4234'); prect(s, 16, 9, 7, 5, dark); prect(s, 15, 7, 3, 1, '#4a4234'); prect(s, 21, 6, 3, 2, '#4a4234'); // сарай
          for (let k = 0; k < 8; k++) if (k !== 3 && k !== 6) prect(s, 25 + k, 11 + (k % 3 === 0 ? 1 : 0), 1, 3 - (k % 2), '#4e4030'); // забор
        });
        break;
      case 'chapel': // заброшенная часовня с обвалившимся шпилем
        stamp(c, x, y + 10, 22, 28, (s) => {
          prect(s, 3, 14, 15, 13, stone); prect(s, 16, 14, 2, 13, stoneD);
          for (let k = 0; k < 6; k++) prect(s, 3 + k, 14 - k, 15 - k * 2, 1, k === 2 ? shade(stone, 0.2) : stoneD); // фронтон
          prect(s, 9, 2, 4, 7, stone); prect(s, 10, 0, 2, 2, stone); prect(s, 12, 3, 1, 6, stoneD); // обломок башенки
          prect(s, 7, 4, 1, 1, stoneD); ppx(s, 6, 6, stoneD);
          prect(s, 9, 18, 3, 5, dark); ppx(s, 10, 17, dark);                               // стрельчатое окно
          prect(s, 5, 23, 3, 4, dark); prect(s, 14, 21, 2, 2, dark);                        // пролом
          prect(s, 18, 25, 3, 2, stoneD); ppx(s, 1, 26, stoneD); ppx(s, 2, 25, stone);      // осыпь
        });
        break;
      case 'factory': // мёртвый завод: пилообразная крыша с провалами, обломанная труба
        stamp(c, x, y + 8, 44, 34, (s) => {
          prect(s, 2, 18, 34, 14, brick); prect(s, 2, 18, 34, 1, brickD);
          for (let k = 0; k < 5; k++) { if (k === 2) continue; for (let t = 0; t < 5; t++) prect(s, 2 + k * 7 + t, 17 - t, 7 - t, 1, '#3a3a3e'); }
          for (let k = 0; k < 6; k++) prect(s, 5 + k * 5, 23, 3, 4, k === 3 ? '#2a2018' : dark);  // окна, одно заколочено
          prect(s, 16, 18, 6, 3, dark);                                                       // провал крыши
          prect(s, 37, 4, 5, 28, brick); prect(s, 41, 4, 1, 28, brickD); prect(s, 37, 4, 2, 1, brickD); ppx(s, 40, 3, brick); // труба
          for (let k = 0; k < 4; k++) prect(s, 37, 8 + k * 6, 5, 1, brickD);
          prect(s, 0, 31, 44, 1, brickD); ppx(s, 36, 30, brick);
        });
        break;
      case 'hamlet': // брошенный хутор
        stamp(c, x, y + 10, 40, 22, (s) => {
          ruinHut(s, 1, 2, '#544c3c'); ruinHut(s, 15, 9, '#4e4636'); ruinHut(s, 27, 3, '#585040');
          prect(s, 12, 18, 2, 2, stoneD); ppx(s, 26, 20, stoneD); prect(s, 3, 19, 3, 1, '#4e4030');
        });
        break;
      case 'tower': // разрушенная сторожевая башня
        stamp(c, x, y + 6, 14, 30, (s) => {
          prect(s, 3, 6, 8, 23, stone); prect(s, 9, 6, 2, 23, stoneD);
          prect(s, 3, 4, 2, 2, stone); prect(s, 7, 3, 2, 3, stone); prect(s, 10, 5, 1, 1, stoneD); // зубчатый обломанный верх
          prect(s, 5, 10, 2, 3, dark); prect(s, 6, 18, 2, 3, dark); prect(s, 4, 25, 3, 4, dark);
          for (let k = 0; k < 4; k++) prect(s, 3, 9 + k * 6, 8, 1, stoneD);
          prect(s, 11, 26, 3, 3, stoneD); ppx(s, 1, 28, stone);
        });
        break;
      case 'railcar': // опрокинутый вагон у насыпи
        stamp(c, x, y + 5, 28, 14, (s) => {
          prect(s, 2, 2, 22, 8, '#4a3a2c'); prect(s, 2, 2, 22, 1, '#5e4a36'); prect(s, 2, 9, 22, 1, '#2e241c');
          for (let k = 0; k < 4; k++) prect(s, 5 + k * 5, 4, 3, 3, dark);
          for (const wx of [5, 19]) { prect(s, wx, 10, 4, 3, '#1c1c1a'); ppx(s, wx + 1, 11, '#5a5a54'); } // колёса кверху
          prect(s, 24, 5, 3, 1, '#3a3028'); ppx(s, 0, 11, '#3a3028');
        });
        break;
      case 'wall': // остатки каменной стены
        stamp(c, x, y + 4, 34, 12, (s) => {
          const hs = [6, 8, 7, 4, 0, 0, 3, 6, 9, 8, 5, 2, 0, 4, 7, 6, 3];
          hs.forEach((h, k) => { if (h) { prect(s, k * 2, 11 - h, 2, h, k % 3 ? stone : stoneD); ppx(s, k * 2, 11 - h, shade(stone, 0.2)); } });
          prect(s, 9, 9, 3, 2, stoneD); prect(s, 25, 10, 2, 1, stoneD);
        });
        break;
      case 'tank': // подбитый танк
        stamp(c, x, y + 6, 30, 14, (s) => {
          prect(s, 2, 7, 24, 6, '#2e2e2a'); for (let k = 0; k < 6; k++) prect(s, 3 + k * 4, 9, 2, 2, '#4a4a44'); // гусеница
          prect(s, 4, 3, 19, 5, '#4a4a3c'); prect(s, 4, 3, 19, 1, '#5e5e4c');
          prect(s, 9, 0, 8, 4, '#44443a'); prect(s, 17, 1, 9, 1, '#3a3a32'); ppx(s, 26, 2, '#3a3a32');   // башня, ствол опущен
          prect(s, 12, 4, 3, 2, dark); prect(s, 27, 11, 2, 2, '#2e2e2a');                              // пробоина, слетевший трак
        });
        break;
    }
  }
}

function drawLocIcon(c: CanvasRenderingContext2D, l: Loc, r: () => number) {
  const x = Math.round(l.x / 2), y = Math.round(l.y / 2);
  switch (l.id) {
    case 'ashford':
      stamp(c, x, y + 12, 58, 34, (s) => {
        prect(s, 46, 8, 11, 15, '#4a4a44'); prect(s, 46, 8, 2, 15, '#6a6a62'); prect(s, 46, 7, 11, 2, '#5a5a52'); prect(s, 46, 15, 11, 1, '#2e2e2a'); // резервуар
        hut(s, 2, 11, '#3a3e48', '#6a5a44', true); hut(s, 15, 4, '#3a3e48', '#6a5a44', true); hut(s, 29, 9, '#383a40', '#5a4c3a', false);
        hut(s, 8, 22, '#383a40', '#5a4c3a', false); hut(s, 22, 20, '#3a3e48', '#6a5a44', true); hut(s, 36, 22, '#383a40', '#5a4c3a', false);
        prect(s, 25, 21, 3, 1, '#0c0c0a'); prect(s, 39, 23, 2, 2, '#0c0c0a'); // провалы в крышах
      });
      break;
    case 'richmord':
      stamp(c, x, y + 26, 58, 48, (s) => {
        const pen = (px: number, py: number) => {
          prect(s, px, py, 22, 11, '#3a3428'); prect(s, px + 1, py + 1, 20, 9, '#4e4636');
          for (let k = 0; k < 22; k += 3) { prect(s, px + k, py - 2, 1, 2, '#5a4a32'); ppx(s, px + k, py + 11, '#5a4a32'); }
          prect(s, px + 4, py + 3, 5, 3, '#7a4a26'); prect(s, px + 4, py + 3, 2, 1, '#a06a3a'); prect(s, px + 13, py + 5, 4, 3, '#7a4a26'); ppx(s, px + 13, py + 5, '#a06a3a');
        };
        pen(1, 3); pen(32, 4);
        hut(s, 4, 22, '#4e3e30', '#6a5a44', false); hut(s, 18, 20, '#4e3e30', '#7a6650', true); hut(s, 32, 23, '#3a3e48', '#6a5a44', true); hut(s, 44, 20, '#4e3e30', '#6a5a44', true);
        // нижняя улица — половина домов брошена
        hut(s, 2, 34, '#3a3e48', '#5a4c3a', false); hut(s, 13, 35, '#4e3e30', '#6a5a44', true); ruinHut(s, 24, 34); hut(s, 35, 35, '#3a3e48', '#6a5a44', true); hut(s, 46, 34, '#4e3e30', '#5a4c3a', false);
      });
      break;
    case 'fenmor':
      stamp(c, x, y + 14, 56, 36, (s) => {
        for (let i = 0; i < 12; i++) {
          const mx = 2 + (i % 4) * 7 + Math.round(r() * 2), my = 3 + Math.floor(i / 4) * 7;
          prect(s, mx + 1, my + 2, 1, 3, '#c8c0a0'); prect(s, mx, my + 1, 3, 1, '#9ad078'); ppx(s, mx + 1, my, '#c0f0a0');
        }
        hut(s, 32, 4, '#2e3a24', '#5a4c3a', true); hut(s, 44, 12, '#2e3a24', '#5a4c3a', false); hut(s, 30, 22, '#34402a', '#5a4c3a', true);
        pellipse(s, 12, 29, 9, 4, '#2a2c20'); prect(s, 9, 29, 5, 3, '#0c0c0a'); // погреб
      });
      break;
    case 'fort': {
      const R = 48;
      stamp(c, x, y + 36, 112, 96, (s) => {
        const ox = 56, oy = 52;
        const fort = pixelize(112, 96, (v) => {
          v.fillStyle = '#3e3a32'; v.beginPath();
          for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, rr = i % 2 ? R : R * 0.8; v.lineTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr * 0.7); }
          v.closePath(); v.fill();
          v.fillStyle = '#26221e'; v.beginPath(); v.ellipse(ox, oy, R * 0.66, R * 0.44, 0, 0, TAU); v.fill();
          for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; v.fillStyle = '#4e4840'; v.beginPath(); v.arc(ox + Math.cos(a) * R, oy + Math.sin(a) * R * 0.7, 5, 0, TAU); v.fill(); }
        });
        s.drawImage(fort, 0, 0);
        // зубцы: светлая кромка верхних стен
        const fd = fort.getContext('2d')!.getImageData(0, 0, 112, 96).data;
        for (let i = 0; i < 112; i += 2) for (let yy = 0; yy < 50; yy++) {
          if (fd[(yy * 112 + i) * 4 + 3] > 0) { ppx(s, i, yy, '#6a6458'); break; }
        }
        for (let i = 0; i < 26; i++) {
          const a = r() * TAU, d = r() * R * 0.5, hx = Math.round(ox + Math.cos(a) * d) - 4, hy = Math.round(oy + Math.sin(a) * d * 0.6) - 6;
          hut(s, hx, hy, r() < 0.5 ? '#2e3038' : '#3a3030', '#4a4034', r() < 0.4);
        }
        for (const [dx, h] of [[-15, 35], [-4, 45], [8, 30]]) { prect(s, ox + dx, oy - h, 4, h - 5, '#2a1e18'); prect(s, ox + dx, oy - h, 1, h - 5, '#4a3428'); prect(s, ox + dx, oy - h, 4, 1, '#1a120e'); }
      });
      break;
    }
    case 'airship':
      stamp(c, x, y + 6, 50, 18, (s) => {
        pellipse(s, 25, 14, 23, 3, 'rgba(0,0,0,0.35)');
        for (let i = 0; i < 9; i++) { const ax = 3 + i * 5, top = 2 + Math.abs(i - 4); pline(s, ax, 14 - i * 0.6, ax + 1, top, '#9a9080'); pline(s, ax + 1, top, ax + 3, 13 - i * 0.6, '#7a7262'); }
        pline(s, 2, 15, 47, 9, '#8a8070');
        prect(s, 18, 6, 12, 4, '#6a6250'); prect(s, 19, 7, 3, 2, '#4a4436');
        prect(s, 22, 12, 8, 4, '#3a2e22'); prect(s, 23, 13, 2, 1, '#1a140e');
      });
      break;
    case 'post':
      stamp(c, x, y + 5, 18, 14, (s) => {
        prect(s, 1, 4, 3, 8, '#5e5a50'); prect(s, 1, 10, 13, 2, '#5e5a50'); prect(s, 13, 0, 3, 12, '#6a665a'); prect(s, 5, 2, 6, 2, '#4e4a42');
        prect(s, 14, 0, 1, 12, '#8a8678'); ppx(s, 8, 7, '#f0a050'); ppx(s, 7, 8, '#c06020');
      });
      break;
    case 'bones':
      stamp(c, x, y + 6, 30, 18, (s) => {
        for (let i = 0; i < 5; i++) { const bx = 4 + i * 4; pline(s, bx, 8, bx - 2, 15, '#b4ae9c'); pline(s, bx, 8, bx + 1, 1, '#c8c2ae'); }
        pline(s, 2, 9, 22, 8, '#d0cab6'); pellipse(s, 25, 9, 3, 3, '#c8c2ae'); ppx(s, 25, 9, '#1a1814'); ppx(s, 27, 8, '#1a1814');
      });
      break;
    case 'lorry':
      stamp(c, x, y + 4, 18, 11, (s) => {
        prect(s, 0, 3, 11, 5, '#4a3424'); prect(s, 0, 3, 11, 1, '#6a4a30'); prect(s, 11, 1, 6, 7, '#5a3a24'); prect(s, 13, 2, 3, 2, '#1c1c1a');
        pellipse(s, 3, 8, 2, 2, '#121110'); pellipse(s, 13, 8, 2, 2, '#121110'); ppx(s, 3, 8, '#4a4a44'); ppx(s, 13, 8, '#4a4a44');
      });
      break;
    case 'flare':
      stamp(c, x, y, 9, 13, (s) => {
        for (let k = 0; k < 13; k++) { const w = Math.round(4 - k * 0.3); ppx(s, 4 - w, 12 - k, '#2a2620'); ppx(s, 4 + w, 12 - k, '#2a2620'); }
        prect(s, 2, 8, 5, 1, '#3a342a'); prect(s, 3, 4, 3, 1, '#3a342a'); prect(s, 4, 0, 1, 2, '#5a4a30');
        pellipse(s, 4, 12, 4, 1, '#121110');
      });
      break;
  }
}
