// ============================================================
//  Режим исследования: деревня Эшфорд
// ============================================================
import { G } from './state';
import { bfs, pathTo, DIRS4, lerp, seeded, TAU, Pt } from './util';
import { drawFigure, drawSky, Lighting, Light, flicker, drawDeadTree, drawCrate, drawAsh, vignette } from './gfx';

export const ET = 32, EW = 30, EH = 20;
const W = EW * ET, H = EH * ET;

interface Building { x: number; y: number; w: number; h: number; door: number; type: 'house' | 'chapel' | 'factory'; windows: number[]; lit: number[]; ruined?: boolean }
interface Npc { id: string; name: string; kind: string; x: number; y: number; dialog: string; cond?: () => boolean; seed: number }
interface Obj { id: string; name: string; x: number; y: number; dialog: string }
interface Walker { kind: string; x: number; y: number; rx: number; ry: number; fx: number; fy: number; flip: boolean }

const BUILDINGS: Building[] = [
  { x: 3, y: 5, w: 5, h: 4, door: 5, type: 'house', windows: [4, 7], lit: [4] },          // дом старосты
  { x: 9, y: 6, w: 4, h: 3, door: 11, type: 'house', windows: [10], lit: [] },
  { x: 14, y: 4, w: 5, h: 5, door: 16, type: 'chapel', windows: [15, 18], lit: [15] },    // часовня
  { x: 2, y: 15, w: 5, h: 3, door: 4, type: 'house', windows: [3, 6], lit: [3] },
  { x: 9, y: 15, w: 4, h: 3, door: 10, type: 'house', windows: [12], lit: [], ruined: true },
  { x: 15, y: 16, w: 4, h: 3, door: 16, type: 'house', windows: [18], lit: [18] },       // дом Марты
  { x: 20, y: 3, w: 10, h: 7, door: 25, type: 'factory', windows: [], lit: [] },         // красильня
];

const LAMPS = [
  { x: 3, y: 12, b: false }, { x: 10, y: 12, b: true }, { x: 13, y: 14, b: false }, { x: 19, y: 12, b: true },
  { x: 24, y: 14, b: false }, { x: 7, y: 14, b: true }, { x: 21, y: 16, b: true }, { x: 27, y: 13, b: false }, { x: 2, y: 9, b: true },
].map((l, i) => ({ ...l, ph: i * 1.7 }));

const TREES: Pt[] = [{ x: 1, y: 4 }, { x: 12, y: 4 }, { x: 19, y: 17 }, { x: 27, y: 17 }, { x: 1, y: 18 }, { x: 28, y: 15 }, { x: 8, y: 4 }, { x: 22, y: 12 }];
const FENCES: Pt[] = [...[20, 21, 22, 23, 24, 26, 27, 28, 29].map((x) => ({ x, y: 11 })), ...[9, 10, 11].map((x) => ({ x, y: 14 }))];
const CRATES: Pt[] = [{ x: 23, y: 17 }, { x: 23, y: 18 }, { x: 24, y: 18 }, { x: 13, y: 16 }];
const PUDDLES: Pt[] = [{ x: 26, y: 18 }, { x: 27, y: 19 }, { x: 20, y: 19 }, { x: 8, y: 18 }];

export const Explore = {
  block: [] as boolean[][],
  ground: [] as string[][],
  bg: null as HTMLCanvasElement | null,
  light: null as Lighting | null,
  windows: [] as { x: number; y: number; color: string }[],
  npcs: [] as Npc[],
  objects: [] as Obj[],
  player: null as unknown as Walker,
  followers: [] as Walker[],
  trail: [] as Pt[],
  moveK: 1,
  path: [] as Pt[],
  pending: null as Npc | Obj | null,
  onInteract: (_dialog: string) => {},
  lastInteract: 0,
  hoverTile: null as Pt | null,

  init() {
    this.block = []; this.ground = [];
    for (let y = 0; y < EH; y++) { this.block.push(new Array(EW).fill(y < 3)); this.ground.push(new Array(EW).fill(y < 3 ? 's' : 'g')); }
    for (let y = 3; y < EH; y++) for (let x = 0; x < EW; x++) {
      if ((x >= 24 && y >= 15) || y >= 19 || x === 0 && y > 15) this.ground[y][x] = 'w';
    }
    for (let x = 0; x <= 25; x++) this.ground[13][x] = 'r';
    for (let y = 10; y <= 12; y++) { this.ground[y][25] = 'r'; this.ground[y][5] = 'r'; this.ground[y][16] = 'r'; }
    this.ground[9][5] = 'r'; this.ground[9][16] = 'r';
    for (const b of BUILDINGS) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) this.block[y][x] = true;
    for (const p of [...LAMPS, ...TREES, ...FENCES, ...CRATES]) this.block[p.y][p.x] = true;

    this.npcs = [
      { id: 'elder', name: 'Староста Грейвз', kind: 'elder', x: 6, y: 9, dialog: 'elder' },
      { id: 'benedict', name: 'Отец Бенедикт', kind: 'priest', x: 17, y: 9, dialog: 'benedict' },
      { id: 'marta', name: 'Марта', kind: 'widow', x: 14, y: 14, dialog: 'marta' },
      { id: 'tommy', name: 'Томми', kind: 'boy', x: 22, y: 17, dialog: 'tommy' },
      { id: 'jeb', name: 'Старый Джеб', kind: 'miner', x: 13, y: 11, dialog: 'jeb' },
      { id: 'brem', name: 'Кузнец Брэм', kind: 'smith', x: 25, y: 11, dialog: 'brem', cond: () => !G.flags.battle1Won },
      { id: 'mil1', name: 'Ополченец', kind: 'militia', x: 24, y: 10, dialog: 'brem', cond: () => !G.flags.battle1Won },
      { id: 'mil2', name: 'Ополченец', kind: 'militia_gun', x: 26, y: 10, dialog: 'brem', cond: () => !G.flags.battle1Won },
    ].map((n, i) => ({ ...n, seed: i * 2.3 }));
    this.objects = [
      { id: 'board', name: 'Доска указов', x: 8, y: 12, dialog: 'board' },
      { id: 'well', name: 'Колодец', x: 12, y: 10, dialog: 'well' },
      { id: 'gate', name: 'Ворота красильни', x: 25, y: 9, dialog: 'gate' },
      { id: 'lamp', name: 'Фонарь', x: 13, y: 14, dialog: 'lamp' },
    ];
    for (const o of this.objects) this.block[o.y][o.x] = true;

    const mk = (kind: string, x: number, y: number): Walker => ({ kind, x, y, rx: x, ry: y, fx: x, fy: y, flip: false });
    this.player = mk('pc', 1, 13);
    this.trail = [{ x: 0, y: 13 }, { x: 0, y: 12 }, { x: 0, y: 14 }];
    this.followers = G.squad.slice(1).map((s, i) => mk(s.kind, this.trail[i].x, this.trail[i].y));
    this.path = []; this.pending = null; this.moveK = 1;
    this.light = new Lighting(W, H);
    this.renderBg();
  },

  activeNpcs() { return this.npcs.filter((n) => !n.cond || n.cond()); },
  thingAt(x: number, y: number): Npc | Obj | null {
    return this.activeNpcs().find((n) => n.x === x && n.y === y) ?? this.objects.find((o) => o.x === x && o.y === y) ?? null;
  },
  blocked(x: number, y: number) {
    if (x < 0 || y < 0 || x >= EW || y >= EH) return true;
    return this.block[y][x] || !!this.activeNpcs().find((n) => n.x === x && n.y === y);
  },

  // ----------------------------------------------------------- логика
  update(dt: number) {
    const p = this.player;
    if (this.moveK < 1) {
      this.moveK = Math.min(1, this.moveK + dt / 0.16);
      for (const w of [p, ...this.followers]) { w.rx = lerp(w.fx, w.x, this.moveK); w.ry = lerp(w.fy, w.y, this.moveK); }
      if (this.moveK < 1) return;
    }
    const k = G.keys;
    let dir: [number, number] | null = null;
    if (k.has('ArrowLeft') || k.has('KeyA')) dir = [-1, 0];
    else if (k.has('ArrowRight') || k.has('KeyD')) dir = [1, 0];
    else if (k.has('ArrowUp') || k.has('KeyW')) dir = [0, -1];
    else if (k.has('ArrowDown') || k.has('KeyS')) dir = [0, 1];
    if (dir) { this.path = []; this.pending = null; this.step(dir[0], dir[1]); return; }
    if (this.path.length) {
      const n = this.path.shift()!;
      if (!this.step(n.x - p.x, n.y - p.y)) { this.path = []; this.pending = null; }
      return;
    }
    if (this.pending) {
      const it = this.pending; this.pending = null;
      if (Math.abs(it.x - p.x) + Math.abs(it.y - p.y) === 1) this.interact(it);
    }
  },

  step(dx: number, dy: number) {
    const p = this.player;
    if (dx) p.flip = dx < 0;
    if (this.blocked(p.x + dx, p.y + dy)) return false;
    this.trail.unshift({ x: p.x, y: p.y }); this.trail.length = 3;
    for (const w of [p, ...this.followers]) { w.fx = w.rx; w.fy = w.ry; }
    p.x += dx; p.y += dy;
    this.followers.forEach((f, i) => {
      const t = this.trail[i];
      if (t.x !== f.x) f.flip = t.x < f.x;
      f.x = t.x; f.y = t.y;
    });
    this.moveK = 0;
    return true;
  },

  adjacentThing(): Npc | Obj | null {
    const p = this.player;
    const facing: [number, number] = p.flip ? [-1, 0] : [1, 0];
    for (const [dx, dy] of [facing, ...DIRS4]) {
      const t = this.thingAt(p.x + dx, p.y + dy);
      if (t) return t;
    }
    return null;
  },

  interactKey() {
    if (this.moveK < 1 || performance.now() - this.lastInteract < 250) return;
    const t = this.adjacentThing();
    if (t) this.interact(t);
  },

  interact(t: Npc | Obj) {
    this.lastInteract = performance.now();
    if ('kind' in t) this.player.flip = t.x < this.player.x;
    this.onInteract(t.dialog);
  },

  click(mx: number, my: number) {
    const tx = Math.floor(mx / ET), ty = Math.floor(my / ET);
    const p = this.player;
    const reach = bfs(EW, EH, p.x, p.y, (x, y) => !this.blocked(x, y), null, DIRS4);
    const thing = this.thingAt(tx, ty);
    if (thing) {
      if (Math.abs(thing.x - p.x) + Math.abs(thing.y - p.y) === 1) { this.interact(thing); return; }
      let best: { x: number; y: number; d: number } | null = null;
      for (const [dx, dy] of DIRS4) {
        const n = reach.get((thing.y + dy) * EW + thing.x + dx);
        if (n && (!best || n.d < best.d)) best = n;
      }
      if (best) { this.path = pathTo(reach, EW, best.x, best.y).slice(1); this.pending = thing; }
      return;
    }
    if (reach.has(ty * EW + tx)) { this.path = pathTo(reach, EW, tx, ty).slice(1); this.pending = null; }
  },

  // ----------------------------------------------------------- отрисовка
  draw(c: CanvasRenderingContext2D, t: number) {
    drawSky(c, t, W, 104);
    c.drawImage(this.bg!, 0, 0);
    this.drawSmoke(c, t);

    // всё «стоящее» сортируем по Y, чтобы ближние перекрывали дальних
    const ents: { y: number; d: () => void }[] = [];
    for (const l of LAMPS) ents.push({ y: l.y, d: () => drawLamp(c, l, t) });
    const p = this.player;
    for (const n of this.activeNpcs()) {
      const near = Math.abs(n.x - p.x) + Math.abs(n.y - p.y) < 4;
      ents.push({ y: n.y, d: () => drawFigure(c, n.kind, n.x * ET + 16, n.y * ET + 29, 0.95, { t, seed: n.seed, flip: near ? p.x < n.x : n.x > 15 }) });
    }
    this.followers.forEach((f, i) => ents.push({ y: f.ry - 0.01, d: () => drawFigure(c, G.squad[i + 1]?.look ?? f.kind, f.rx * ET + 16, f.ry * ET + 29, 0.95, { t, seed: i + 1, flip: f.flip }) }));
    ents.push({ y: p.ry, d: () => drawFigure(c, G.squad[0]?.look ?? 'pc', p.rx * ET + 16, p.ry * ET + 29, 0.95, { t, flip: p.flip }) });
    ents.sort((a, b) => a.y - b.y).forEach((e) => e.d());

    // свет
    const lights: Light[] = [];
    for (const l of LAMPS) {
      const i = flicker(t, l.ph, l.b);
      lights.push({ x: l.x * ET + 22, y: l.y * ET - 6, r: 95, a: i, color: '#f0c070' });
    }
    for (const w of this.windows) lights.push({ x: w.x, y: w.y, r: 34, a: 0.7 + Math.sin(t * 3 + w.x) * 0.08, color: w.color });
    lights.push({ x: p.rx * ET + 16, y: p.ry * ET + 16, r: 110, a: 0.75, color: '#d8c890' });
    lights.push({ x: 170, y: 44, r: 160, a: 0.6 });
    this.light!.draw(c, lights, 0.1, 0.6);

    drawAsh(c, t);
    vignette(c, W, H);

    if (G.mode === 'explore') this.drawPrompts(c);
  },

  drawPrompts(c: CanvasRenderingContext2D) {
    const t = this.moveK >= 1 ? this.adjacentThing() : null;
    const hv = this.hoverTile ? this.thingAt(this.hoverTile.x, this.hoverTile.y) : null;
    for (const it of [t, hv]) {
      if (!it) continue;
      const label = it === t ? `[E] ${it.name}` : it.name;
      c.font = '13px "Old Standard TT", Georgia, serif';
      const w = c.measureText(label).width + 12;
      const x = it.x * ET + 16 - w / 2, y = it.y * ET - 30;
      c.fillStyle = 'rgba(8,12,7,0.85)'; c.fillRect(x, y, w, 18);
      c.strokeStyle = it === t ? '#c09a52' : '#4b5838'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, 17);
      c.fillStyle = '#e0dcc0'; c.textAlign = 'center'; c.fillText(label, it.x * ET + 16, y + 13);
      c.textAlign = 'left';
      if (it === t && hv === t) break;
    }
  },

  smoke: [] as { x: number; y: number; r: number; a: number; vx: number }[],
  drawSmoke(c: CanvasRenderingContext2D, t: number) {
    // из одной трубы «заброшенной» фабрики сочится зелёный дымок…
    if (this.smoke.length < 26 && Math.random() < 0.15) this.smoke.push({ x: 875, y: 14, r: 4, a: 0.35, vx: 4 + Math.random() * 6 });
    for (const s of this.smoke) {
      s.y -= 0.12; s.x += s.vx * 0.016; s.r += 0.07; s.a -= 0.0016;
      c.fillStyle = `rgba(110,150,90,${Math.max(0, s.a)})`;
      c.beginPath(); c.arc(s.x + Math.sin(t + s.r) * 2, s.y, s.r, 0, TAU); c.fill();
    }
    this.smoke = this.smoke.filter((s) => s.a > 0 && s.y > -20);
  },

  // ----------------------------------------------------------- статичный фон
  renderBg() {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d')!;
    const r = seeded(1888);
    this.windows = [];

    // далёкие силуэты: холмы, вышки нефтяного барона, шпили мёртвого города
    c.fillStyle = '#1c2318';
    c.beginPath(); c.moveTo(0, 104);
    for (let x = 0; x <= W; x += 40) c.lineTo(x, 80 + Math.sin(x * 0.013) * 8 + r() * 6);
    c.lineTo(W, 104); c.fill();
    for (const [x, h] of [[60, 50], [390, 62], [470, 44], [560, 56]] as [number, number][]) drawDerrick(c, x, 96, h);
    c.fillStyle = '#161c13';
    for (const [x, h] of [[250, 38], [270, 52], [292, 30], [310, 44]] as [number, number][]) {
      c.fillRect(x, 96 - h, 9, h);
      c.beginPath(); c.moveTo(x - 1, 96 - h); c.lineTo(x + 4.5, 96 - h - 14); c.lineTo(x + 10, 96 - h); c.fill();
    }

    // земля
    for (let y = 3; y < EH; y++) for (let x = 0; x < EW; x++) {
      const g = this.ground[y][x], X = x * ET, Y = y * ET;
      if (g === 'r') {
        c.fillStyle = '#2b2925'; c.fillRect(X, Y, ET, ET);
        for (let i = 0; i < 7; i++) {
          c.fillStyle = r() < 0.5 ? '#36332d' : '#3c3832';
          c.beginPath(); c.ellipse(X + 3 + r() * 26, Y + 3 + r() * 26, 4 + r() * 2, 3, 0, 0, TAU); c.fill();
        }
      } else {
        const base = g === 'w' ? ['#4a463c', '#46423a', '#4e4a40'] : ['#3d3b34', '#413f37', '#3a3832'];
        c.fillStyle = base[Math.floor(r() * 3)]; c.fillRect(X, Y, ET, ET);
        for (let i = 0; i < 10; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '20,20,16' : '90,90,75'},0.25)`; c.fillRect(X + r() * ET, Y + r() * ET, 1.5, 1.5); }
        if (g === 'w' && r() < 0.5) { // трещины пустоши
          c.strokeStyle = 'rgba(20,18,14,0.6)'; c.lineWidth = 1;
          c.beginPath(); let px = X + r() * ET, py = Y + r() * ET; c.moveTo(px, py);
          for (let i = 0; i < 3; i++) { px += (r() - 0.5) * 18; py += (r() - 0.5) * 18; c.lineTo(px, py); }
          c.stroke();
        }
        if (g === 'g' && r() < 0.3) { // сухая трава
          c.strokeStyle = '#5a5638'; c.lineWidth = 1;
          const gx = X + r() * 24 + 4, gy = Y + r() * 24 + 6;
          for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(gx + i * 1.5, gy); c.lineTo(gx + i * 1.5 + (r() - 0.5) * 4, gy - 4 - r() * 4); c.stroke(); }
        }
      }
    }
    for (const p of PUDDLES) {
      c.fillStyle = '#0c0d0b'; c.beginPath(); c.ellipse(p.x * ET + 16, p.y * ET + 18, 13, 6, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(120,160,110,0.25)'; c.beginPath(); c.ellipse(p.x * ET + 12, p.y * ET + 16, 5, 1.5, 0, 0, TAU); c.fill();
    }

    // объекты, отсортированные по Y
    const items: { y: number; d: () => void }[] = [];
    for (const b of BUILDINGS) items.push({ y: b.y + b.h - 1, d: () => (b.type === 'factory' ? this.drawFactory(c, b, r) : this.drawHouse(c, b, r)) });
    for (const tr of TREES) items.push({ y: tr.y, d: () => drawDeadTree(c, tr.x * ET + 16, tr.y * ET + 28, r) });
    for (const cr of CRATES) items.push({ y: cr.y, d: () => drawCrate(c, cr.x * ET + 16, cr.y * ET + 30, ET, r() < 0.4) });
    for (const f of FENCES) items.push({ y: f.y, d: () => drawFence(c, f.x, f.y, r) });
    items.push({ y: 10, d: () => drawWell(c, 12 * ET + 16, 10 * ET + 28) });
    items.push({ y: 12, d: () => drawBoard(c, 8 * ET + 16, 12 * ET + 30) });
    items.sort((a, b) => a.y - b.y).forEach((i) => i.d());
    this.bg = cv;
  },

  drawHouse(c: CanvasRenderingContext2D, b: Building, r: () => number) {
    const X = b.x * ET, Y = b.y * ET, Wd = b.w * ET, Ht = b.h * ET;
    const wallH = ET + 8, wy = Y + Ht - wallH;
    const chapel = b.type === 'chapel';
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(X + 4, Y + Ht - 2, Wd, 6);
    c.fillStyle = chapel ? '#4a4945' : '#3b3229'; c.fillRect(X + 3, wy, Wd - 6, wallH);
    c.strokeStyle = chapel ? '#3a3936' : '#221a13'; c.lineWidth = chapel ? 1 : 2;
    if (chapel) {
      for (let yy = wy + 6; yy < wy + wallH; yy += 7) { c.beginPath(); c.moveTo(X + 3, yy); c.lineTo(X + Wd - 3, yy); c.stroke(); }
    } else {
      for (let i = X + 3; i < X + Wd - 3; i += 16) { c.beginPath(); c.moveTo(i, wy); c.lineTo(i, wy + wallH); c.stroke(); }
      c.beginPath(); c.moveTo(X + 3, wy + wallH / 2); c.lineTo(X + Wd - 3, wy + wallH / 2); c.stroke();
    }
    // окна
    for (const wx of b.windows) {
      const lit = b.lit.includes(wx);
      const cx = wx * ET + 16, cy = wy + 15;
      if (chapel) {
        c.fillStyle = lit ? '#3e5a30' : '#151815';
        c.beginPath(); c.moveTo(cx - 5, cy + 9); c.lineTo(cx - 5, cy - 3); c.arc(cx, cy - 3, 5, Math.PI, 0); c.lineTo(cx + 5, cy + 9); c.fill();
        if (lit) this.windows.push({ x: cx, y: cy, color: '#9fef6a' });
      } else {
        c.fillStyle = lit ? '#7a6428' : '#121418'; c.fillRect(cx - 6, cy - 6, 12, 12);
        c.fillStyle = '#1d1712'; c.fillRect(cx - 0.75, cy - 6, 1.5, 12); c.fillRect(cx - 6, cy - 0.75, 12, 1.5);
        if (!lit && r() < 0.5) { c.strokeStyle = '#555'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(cx - 5, cy - 5); c.lineTo(cx + 2, cy + 1); c.stroke(); }
        if (lit) this.windows.push({ x: cx, y: cy, color: '#f0b050' });
      }
    }
    // дверь
    const dx = b.door * ET + 16;
    c.fillStyle = '#17110c';
    if (chapel) { c.beginPath(); c.moveTo(dx - 8, wy + wallH); c.lineTo(dx - 8, wy + wallH - 18); c.arc(dx, wy + wallH - 18, 8, Math.PI, 0); c.lineTo(dx + 8, wy + wallH); c.fill(); }
    else { c.fillRect(dx - 7, wy + wallH - 24, 14, 24); c.fillStyle = '#7a6040'; c.fillRect(dx + 3, wy + wallH - 12, 2, 2); }
    // крыша
    c.fillStyle = chapel ? '#24262a' : '#2a2b2d';
    c.beginPath(); c.moveTo(X - 3, wy + 3); c.lineTo(X + Wd + 3, wy + 3); c.lineTo(X + Wd - 9, Y + 4); c.lineTo(X + 9, Y + 4); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1;
    for (let yy = Y + 10; yy < wy; yy += 6) {
      const k = (yy - Y - 4) / (wy - Y - 1);
      c.beginPath(); c.moveTo(lerp(X + 9, X - 3, k), yy); c.lineTo(lerp(X + Wd - 9, X + Wd + 3, k), yy); c.stroke();
    }
    for (let i = 0; i < 4; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '80,90,50' : '90,60,40'},0.3)`; c.fillRect(X + 10 + r() * (Wd - 30), Y + 8 + r() * (wy - Y - 14), 8 + r() * 10, 3); }
    c.fillStyle = '#1b1c1e'; c.fillRect(X + 9, Y + 2, Wd - 18, 4);
    if (b.ruined) {
      c.fillStyle = '#0b0b0a';
      c.beginPath(); c.moveTo(X + 30, Y + 12); c.lineTo(X + 70, Y + 8); c.lineTo(X + 80, Y + 30); c.lineTo(X + 44, Y + 40); c.lineTo(X + 26, Y + 30); c.fill();
      c.strokeStyle = '#2a2018'; c.lineWidth = 3;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(X + 34 + i * 14, Y + 10); c.lineTo(X + 30 + i * 16, Y + 40); c.stroke(); }
    } else if (!chapel) {
      c.fillStyle = '#3a2a22'; c.fillRect(X + Wd - 26, Y - 8, 9, 20);
      c.fillStyle = '#241a15'; c.fillRect(X + Wd - 27, Y - 10, 11, 3);
    }
    if (chapel) { // колокольня
      const cx = X + Wd / 2;
      c.fillStyle = '#3e3d3a'; c.fillRect(cx - 11, Y - 22, 22, 34);
      c.fillStyle = '#121312';
      c.beginPath(); c.moveTo(cx - 5, Y - 2); c.lineTo(cx - 5, Y - 12); c.arc(cx, Y - 12, 5, Math.PI, 0); c.lineTo(cx + 5, Y - 2); c.fill();
      c.fillStyle = '#26282b';
      c.beginPath(); c.moveTo(cx - 14, Y - 22); c.lineTo(cx, Y - 62); c.lineTo(cx + 14, Y - 22); c.fill();
      c.strokeStyle = '#4a4a46'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx, Y - 62); c.lineTo(cx, Y - 76); c.moveTo(cx - 5, Y - 71); c.lineTo(cx + 5, Y - 71); c.stroke();
    }
  },

  drawFactory(c: CanvasRenderingContext2D, b: Building, r: () => number) {
    const X = b.x * ET, Y = b.y * ET, Wd = b.w * ET, Ht = b.h * ET;
    // трубы
    for (const cx of [X + 46, X + 236]) {
      c.fillStyle = '#2e1c17'; c.fillRect(cx - 10, 8, 20, Y + 40);
      c.fillStyle = '#231511'; c.fillRect(cx - 12, 4, 24, 6);
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(cx + 2, 8, 8, Y + 40);
      for (let yy = 22; yy < Y + 40; yy += 26) { c.fillStyle = '#3a2a1e'; c.fillRect(cx - 10, yy, 20, 2); }
    }
    // пилообразная крыша
    const roofY = Y + 46;
    for (let i = 0; i < 6; i++) {
      const sx = X + i * (Wd / 6), sw = Wd / 6;
      c.fillStyle = '#211f1d';
      c.beginPath(); c.moveTo(sx, roofY); c.lineTo(sx + sw * 0.7, Y + 10); c.lineTo(sx + sw * 0.7, roofY); c.fill();
      c.fillStyle = r() < 0.4 ? '#0b0f0b' : '#1a2a1e';
      c.beginPath(); c.moveTo(sx + sw * 0.7, Y + 10); c.lineTo(sx + sw, roofY); c.lineTo(sx + sw * 0.7, roofY); c.fill();
    }
    // кирпичный фасад
    c.fillStyle = '#3b241e'; c.fillRect(X, roofY, Wd, Ht - 46);
    c.strokeStyle = 'rgba(20,10,8,0.5)'; c.lineWidth = 1;
    for (let yy = roofY + 5; yy < Y + Ht; yy += 6) {
      c.beginPath(); c.moveTo(X, yy); c.lineTo(X + Wd, yy); c.stroke();
      for (let xx = X + ((yy / 6) % 2) * 6; xx < X + Wd; xx += 12) { c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx, yy + 6); c.stroke(); }
    }
    for (let i = 0; i < 10; i++) { c.fillStyle = 'rgba(15,25,12,0.35)'; c.fillRect(X + r() * Wd, roofY + r() * 40, 2, 20 + r() * 40); } // потёки
    // окна: часть выбита, в некоторых — зелёный отсвет
    for (let row = 0; row < 2; row++) for (let i = 0; i < 7; i++) {
      const wx = X + 18 + i * 43, wy = roofY + 14 + row * 56;
      if (Math.abs(wx + 12 - (25 * ET + 16)) < 40 && row === 1) continue;
      const green = r() < 0.3;
      c.fillStyle = green ? '#2d4a26' : '#0d0f0d';
      c.beginPath(); c.moveTo(wx, wy + 30); c.lineTo(wx, wy + 8); c.arc(wx + 12, wy + 8, 12, Math.PI, 0); c.lineTo(wx + 24, wy + 30); c.fill();
      c.strokeStyle = '#261612'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(wx + 12, wy - 4); c.lineTo(wx + 12, wy + 30); c.moveTo(wx, wy + 16); c.lineTo(wx + 24, wy + 16); c.stroke();
      if (green) this.windows.push({ x: wx + 12, y: wy + 14, color: '#9fef6a' });
    }
    // вывеска
    c.fillStyle = '#251c16'; c.fillRect(X + 105, roofY + 2, 115, 13);
    c.fillStyle = '#7a6a4a'; c.font = 'bold 9px "Old Standard TT", serif'; c.textAlign = 'center';
    c.fillText('КРАСИЛЬНЯ ХАРТВЕЛЛА', X + 162, roofY + 12); c.textAlign = 'left';
    // ворота
    const gx = 25 * ET + 16, gy = Y + Ht;
    c.fillStyle = '#100c0a'; c.fillRect(gx - 30, gy - 62, 60, 62);
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? gx - 28 : gx + 1;
      c.fillStyle = '#4a2e20'; c.fillRect(x0, gy - 58, 27, 58);
      c.strokeStyle = '#2a180f'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x0, gy - 58); c.lineTo(x0 + 27, gy); c.stroke();
      c.strokeRect(x0, gy - 58, 27, 58);
      c.fillStyle = '#6a4a30';
      for (let yy = gy - 54; yy < gy; yy += 12) { c.fillRect(x0 + 3, yy, 2, 2); c.fillRect(x0 + 22, yy, 2, 2); }
    }
    // трубы вдоль стены
    c.strokeStyle = '#2a2622'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(X, Y + Ht - 20); c.lineTo(X + 140, Y + Ht - 20); c.lineTo(X + 140, roofY + 4); c.stroke();
  },
};

function drawDerrick(c: CanvasRenderingContext2D, x: number, base: number, h: number) {
  c.strokeStyle = '#151a12'; c.lineWidth = 1.5;
  const w = h * 0.35;
  c.beginPath(); c.moveTo(x - w / 2, base); c.lineTo(x, base - h); c.lineTo(x + w / 2, base);
  for (let i = 1; i < 5; i++) { const k = i / 5, yy = base - h * k, hw = (w / 2) * (1 - k); c.moveTo(x - hw, yy); c.lineTo(x + hw, yy); c.lineTo(x - hw * 0.8, yy - h / 5); }
  c.stroke();
  c.fillStyle = '#151a12'; c.fillRect(x - 3, base - h - 4, 6, 4);
}

function drawLamp(c: CanvasRenderingContext2D, l: { x: number; y: number; b: boolean; ph: number }, t: number) {
  const x = l.x * ET + 16, y = l.y * ET + 30;
  const i = flicker(t, l.ph, l.b);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x, y, 6, 2, 0, 0, TAU); c.fill();
  c.fillStyle = '#15140f';
  c.fillRect(x - 1.5, y - 40, 3, 40); c.fillRect(x - 4, y - 4, 8, 4);
  c.fillRect(x - 1, y - 42, 9, 2);
  c.fillRect(x + 2.5, y - 42, 8, 2);
  c.fillStyle = `rgba(${Math.round(80 + 170 * i)},${Math.round(70 + 130 * i)},${Math.round(40 + 60 * i)},1)`;
  c.fillRect(x + 3.5, y - 40, 6, 8);
  c.strokeStyle = '#15140f'; c.lineWidth = 1; c.strokeRect(x + 3.5, y - 40, 6, 8);
  c.beginPath(); c.moveTo(x + 2.5, y - 40); c.lineTo(x + 6.5, y - 45); c.lineTo(x + 10.5, y - 40); c.fillStyle = '#15140f'; c.fill();
}

function drawFence(c: CanvasRenderingContext2D, tx: number, ty: number, r: () => number) {
  const x = tx * ET, y = ty * ET + 26;
  c.fillStyle = '#2c241b';
  c.fillRect(x + 3, y - 16, 3, 16); c.fillRect(x + 26, y - 14, 3, 14);
  c.fillStyle = '#3a2f22';
  if (r() < 0.85) c.fillRect(x, y - 13, ET, 2.5);
  if (r() < 0.7) c.fillRect(x, y - 6, ET, 2.5);
}

function drawWell(c: CanvasRenderingContext2D, x: number, y: number) {
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x, y, 15, 5, 0, 0, TAU); c.fill();
  c.fillStyle = '#4a4740'; c.fillRect(x - 13, y - 14, 26, 14);
  c.fillStyle = '#3a3832'; c.beginPath(); c.ellipse(x, y - 14, 13, 4, 0, 0, TAU); c.fill();
  c.fillStyle = '#18261a'; c.beginPath(); c.ellipse(x, y - 14, 10, 2.8, 0, 0, TAU); c.fill();
  c.strokeStyle = '#2c241b'; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(x - 12, y - 12); c.lineTo(x - 12, y - 34); c.moveTo(x + 12, y - 12); c.lineTo(x + 12, y - 34); c.stroke();
  c.fillStyle = '#2a2b2d'; c.beginPath(); c.moveTo(x - 17, y - 32); c.lineTo(x, y - 42); c.lineTo(x + 17, y - 32); c.fill();
}

function drawBoard(c: CanvasRenderingContext2D, x: number, y: number) {
  c.fillStyle = '#2c241b'; c.fillRect(x - 11, y - 28, 3, 28); c.fillRect(x + 8, y - 28, 3, 28);
  c.fillStyle = '#3e3226'; c.fillRect(x - 13, y - 32, 26, 16);
  c.fillStyle = '#9a9478'; c.fillRect(x - 10, y - 30, 9, 11); c.fillStyle = '#857f66'; c.fillRect(x + 1, y - 29, 9, 8);
  c.fillStyle = '#5a2020'; c.fillRect(x - 7, y - 28, 3, 1);
}
