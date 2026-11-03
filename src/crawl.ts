// ============================================================
//  Траншейный краулинг: спуск в море траншей Траншейного Ада.
//  Сеть строится заново при каждом спуске: развилки-«комнаты»
//  (открытый участок траншеи с точкой интереса) на сетке, между
//  ними — прямые коридоры-траншеи. Видно только то, что рядом:
//  свет героя (фонарь светит дальше) и уже пройденное.
// ============================================================
import { G, lampLevel } from './state';
import { PixelView, applyLight, PLight, T, LW, LH, PS, prect, ppx, pellipse, seeded } from './px';
import { drawSprite } from './sprites';
import { bfs, pathTo, Pt } from './util';

export type RoomKind = 'ladder' | 'empty' | 'cache' | 'corpse' | 'dead' | 'gas' | 'dugout';
export interface Room { id: number; x: number; y: number; r: number; kind: RoomKind; done: boolean; seen: boolean; dead?: string; seed: number }
interface Walker { x: number; y: number; rx: number; ry: number; fx: number; fy: number; flip: boolean }

const GX = 5, GY = 4, STEP = 14, PAD = 6;          // сетка развилок и шаг между ними (клетки)
const MW = PAD * 2 + (GX - 1) * STEP + 1, MH = PAD * 2 + (GY - 1) * STEP + 1;
// клетки: 0 — земля (стена траншеи), 1 — траншея вдоль x, 2 — траншея вдоль y, 3 — развилка
type Cell = 0 | 1 | 2 | 3;

/** Что лежит в комнатах: вес выпадения. */
const KINDS: [RoomKind, number][] = [['empty', 26], ['cache', 20], ['corpse', 20], ['dead', 20], ['gas', 7], ['dugout', 7]];

export const Crawl = {
  map: [] as Cell[][],
  seen: [] as boolean[][],
  rooms: [] as Room[],
  player: { x: 0, y: 0, rx: 0, ry: 0, fx: 0, fy: 0, flip: false } as Walker,
  followers: [] as Walker[],
  trail: [] as Pt[],
  path: [] as Pt[],
  moveK: 1,
  room: null as Room | null,     // комната, в которой стоит отряд
  prevRoom: null as Room | null, // откуда пришли — для отступления
  depth: 0,                      // сколько раз спускались
  view: null as PixelView | null,
  onRoom: (_r: Room) => {},      // вошли в новую комнату (засада, газ)
  onInteract: (_r: Room) => {},  // E у точки интереса

  /** Новый спуск: строим сеть и ставим отряд у лестницы. */
  enter() {
    this.depth++;
    const r = seeded(Math.floor(Math.random() * 1e9));
    this.map = Array.from({ length: MH }, () => new Array<Cell>(MW).fill(0));
    this.seen = Array.from({ length: MH }, () => new Array<boolean>(MW).fill(false));
    // 1) развилки: почти все узлы сетки, вход — у западного края
    const node = (gx: number, gy: number) => ({ x: PAD + gx * STEP, y: PAD + gy * STEP });
    const start = { gx: 0, gy: Math.floor(r() * GY) };
    const on = new Set<string>();
    for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) if ((gx === start.gx && gy === start.gy) || r() > 0.22) on.add(`${gx},${gy}`);
    // 2) связи: случайное остовное дерево от входа + несколько лишних петель
    const key = (gx: number, gy: number) => `${gx},${gy}`, links: [string, string][] = [], reached = new Set([key(start.gx, start.gy)]);
    const stack = [start];
    while (stack.length) {
      const c = stack[stack.length - 1];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ gx: c.gx + dx, gy: c.gy + dy })).filter((n) => on.has(key(n.gx, n.gy)) && !reached.has(key(n.gx, n.gy)));
      if (!nb.length) { stack.pop(); continue; }
      const n = nb[Math.floor(r() * nb.length)];
      reached.add(key(n.gx, n.gy)); links.push([key(c.gx, c.gy), key(n.gx, n.gy)]); stack.push(n);
    }
    for (const k of reached) { const [gx, gy] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [0, 1]]) { const k2 = key(gx + dx, gy + dy); if (reached.has(k2) && r() < 0.25 && !links.some(([a, b]) => (a === k && b === k2) || (a === k2 && b === k))) links.push([k, k2]); } }
    // 3) вырезаем траншеи (2 клетки шириной) и развилки (круг радиусом 3)
    const at = (k: string) => { const [gx, gy] = k.split(',').map(Number); return node(gx, gy); };
    for (const [a, b] of links) {
      const p = at(a), q = at(b);
      if (p.y === q.y) for (let x = Math.min(p.x, q.x); x <= Math.max(p.x, q.x); x++) for (const y of [p.y, p.y + 1]) this.map[y][x] = 1;
      else for (let y = Math.min(p.y, q.y); y <= Math.max(p.y, q.y); y++) for (const x of [p.x, p.x + 1]) this.map[y][x] = 2;
    }
    this.rooms = [];
    for (const k of reached) {
      const c = at(k), cx = c.x + 0.5, cy = c.y + 0.5, rr = 3.2;
      for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++)
        if (y > 0 && x > 0 && y < MH - 1 && x < MW - 1 && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= rr) this.map[y][x] = 3;
      const isStart = k === key(start.gx, start.gy);
      let kind: RoomKind = 'ladder';
      if (!isStart) { let roll = r() * KINDS.reduce((s, [, w]) => s + w, 0); kind = KINDS.find(([, w]) => (roll -= w) < 0)![0]; }
      this.rooms.push({ id: this.rooms.length, x: c.x, y: c.y, r: 3, kind, done: false, seen: false, seed: Math.floor(r() * 1e6), dead: kind === 'dead' ? (['trench1', 'trench2', 'trench3'] as const)[Math.floor(r() * 3)] : undefined });
    }
    // 4) отряд — у лестницы
    const s = this.rooms.find((q) => q.kind === 'ladder')!;
    const mk = (x: number, y: number): Walker => ({ x, y, rx: x, ry: y, fx: x, fy: y, flip: false });
    this.player = mk(s.x + 1, s.y);
    this.followers = G.squad.slice(1).map(() => mk(s.x, s.y));
    this.trail = this.followers.map(() => ({ x: s.x, y: s.y }));
    this.path = []; this.moveK = 1; this.room = s; this.prevRoom = s; s.seen = true; s.done = true;
    this.reveal();
    G.location = 'Траншейный Ад — в траншеях';
  },

  floor(x: number, y: number) { return y >= 0 && x >= 0 && y < MH && x < MW && this.map[y][x] !== 0; },
  roomAt(x: number, y: number) { return this.rooms.find((q) => Math.hypot(x - q.x, y - q.y) <= q.r + 0.3) ?? null; },
  /** Видно то, что в свете вокруг отряда: с фонарём дальше. Комната открывается целиком, как только в неё вошли. */
  reveal() {
    const p = this.player, R = 4 + lampLevel() * 2;
    for (let y = p.y - R; y <= p.y + R; y++) for (let x = p.x - R; x <= p.x + R; x++) if (y >= 0 && x >= 0 && y < MH && x < MW && Math.hypot(x - p.x, y - p.y) <= R + 0.5) this.seen[y][x] = true;
    const rm = this.roomAt(p.x, p.y);
    if (rm) for (let y = rm.y - 5; y <= rm.y + 5; y++) for (let x = rm.x - 5; x <= rm.x + 5; x++) if (y >= 0 && x >= 0 && y < MH && x < MW) this.seen[y][x] = true;
  },

  /** Шаг на соседнюю клетку (клавиши или путь по клику). */
  step(dx: number, dy: number) {
    const p = this.player, nx = p.x + dx, ny = p.y + dy;
    if (!this.floor(nx, ny)) return false;
    if (dx) p.flip = dx < 0;
    // спутники идут цепочкой по следу
    const all = [p, ...this.followers];
    for (const w of all) { w.fx = w.rx; w.fy = w.ry; }
    for (let i = this.followers.length - 1; i >= 0; i--) { const to = i === 0 ? { x: p.x, y: p.y } : { x: this.followers[i - 1].x, y: this.followers[i - 1].y }; const f = this.followers[i]; if (to.x !== f.x) f.flip = to.x < f.x; f.x = to.x; f.y = to.y; }
    p.x = nx; p.y = ny; this.moveK = 0;
    G.clock += 1 / 60; // минута на клетку
    this.reveal();
    const rm = this.roomAt(p.x, p.y);
    if (rm !== this.room) {
      if (rm) { if (this.room) this.prevRoom = this.room; this.room = rm; const first = !rm.seen; rm.seen = true; if (first || (!rm.done && (rm.kind === 'dead' || rm.kind === 'gas'))) { this.path = []; this.onRoom(rm); } }
      else this.room = null;
    }
    return true;
  },

  update(dt: number) {
    const p = this.player;
    if (this.moveK < 1) {
      this.moveK = Math.min(1, this.moveK + dt / 0.14);
      for (const w of [p, ...this.followers]) { w.rx = w.fx + (w.x - w.fx) * this.moveK; w.ry = w.fy + (w.y - w.fy) * this.moveK; }
      if (this.moveK < 1) return;
    }
    const k = G.keys;
    let d: [number, number] | null = null;
    if (k.has('ArrowLeft') || k.has('KeyA')) d = [-1, 0];
    else if (k.has('ArrowRight') || k.has('KeyD')) d = [1, 0];
    else if (k.has('ArrowUp') || k.has('KeyW')) d = [0, -1];
    else if (k.has('ArrowDown') || k.has('KeyS')) d = [0, 1];
    if (d) { this.path = []; this.step(d[0], d[1]); return; }
    const n = this.path.shift();
    if (n) this.step(n.x - p.x, n.y - p.y);
  },

  /** Клик: идти туда по траншеям (только по уже виденному). */
  click(mx: number, my: number) {
    const c = this.cam(), x = Math.floor((mx / PS + c.x) / T), y = Math.floor((my / PS + c.y) / T);
    if (!this.floor(x, y) || !this.seen[y]?.[x]) return;
    const reach = bfs(MW, MH, this.player.x, this.player.y, (xx, yy) => this.floor(xx, yy) && this.seen[yy][xx], null, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
    if (!reach.has(y * MW + x)) return;
    this.path = pathTo(reach, MW, x, y).slice(1);
  },
  /** E: осмотреть точку интереса, если отряд в развилке. */
  interactKey() { const rm = this.roomAt(this.player.x, this.player.y); if (rm) { this.path = []; this.onInteract(rm); } },
  /** Отступить в комнату, из которой пришли. */
  retreat() {
    const to = this.prevRoom ?? this.rooms[0], p = this.player;
    p.x = p.rx = p.fx = to.x + 1; p.y = p.ry = p.fy = to.y;
    for (const f of this.followers) { f.x = f.rx = f.fx = to.x; f.y = f.ry = f.fy = to.y; }
    this.room = to; this.path = []; this.reveal();
  },

  cam() {
    const p = this.player;
    return { x: Math.round(Math.max(-40, Math.min(MW * T - LW + 40, p.rx * T + T / 2 - LW / 2))), y: Math.round(Math.max(-40, Math.min(MH * T - LH + 40, p.ry * T + T / 2 - LH / 2))) };
  },

  draw(out: CanvasRenderingContext2D, t: number) {
    const v = this.view ?? (this.view = new PixelView()), c = v.c, cam = this.cam();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0a0907'; c.fillRect(0, 0, LW, LH);
    c.setTransform(1, 0, 0, 1, -cam.x, -cam.y);
    const x0 = Math.max(0, Math.floor(cam.x / T) - 1), x1 = Math.min(MW - 1, Math.ceil((cam.x + LW) / T) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / T) - 1), y1 = Math.min(MH - 1, Math.ceil((cam.y + LH) / T) + 1);
    const fl = (x: number, y: number) => this.floor(x, y);
    const seenNear = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.seen[y + dy]?.[x + dx]) return true; return false; };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!seenNear(x, y)) continue; // тьма — ещё не видели
      const X = x * T, Y = y * T, cell = this.map[y][x], r = seeded(x * 7919 + y * 104729);
      if (cell === 0) { // земля над траншеей: перепаханная грязь, у края — бруствер из мешков
        prect(c, X, Y, T, T, '#1a1611');
        for (let i = 0; i < 5; i++) ppx(c, X + r() * T, Y + r() * T, r() < 0.5 ? '#2a241a' : '#110e0a');
        // бруствер: мешки с песком по краю траншеи, светлый верх и тёмная тень вниз
        if (fl(x, y + 1)) { for (let k = 0; k < 4; k++) { prect(c, X + k * 5, Y + T - 6, 5, 6, k % 2 ? '#8a7856' : '#7a6a4c'); ppx(c, X + k * 5, Y + T - 6, '#9a8a66'); } prect(c, X, Y + T - 1, T, 1, '#3a3022'); }
        if (fl(x, y - 1)) { prect(c, X, Y, T, 4, '#5a4c36'); prect(c, X, Y + 4, T, 1, '#0c0a07'); }
        if (fl(x + 1, y)) { prect(c, X + T - 5, Y, 5, T, '#6a5a42'); prect(c, X + T - 1, Y, 1, T, '#0c0a07'); }
        if (fl(x - 1, y)) { prect(c, X, Y, 5, T, '#6a5a42'); prect(c, X, Y, 1, T, '#8a7856'); }
        continue;
      }
      if (cell === 3) { // развилка: грязь, лужи, обломки досок
        prect(c, X, Y, T, T, '#4e4230');
        for (let i = 0; i < 4; i++) ppx(c, X + r() * T, Y + r() * T, '#3e3424');
        if (r() < 0.25) pellipse(c, X + 4 + r() * 12, Y + 4 + r() * 12, 3 + r() * 3, 2, '#34402e');
        if (r() < 0.3) prect(c, X + r() * 12, Y + r() * 16, 8, 2, '#6a5236');
      } else { // траншея: настил из досок поперёк хода
        prect(c, X, Y, T, T, '#2a2016');
        if (cell === 1) for (let k = 0; k < T; k += 4) prect(c, X + k, Y + 1, 3, T - 2, r() < 0.12 ? '#3a2e1f' : '#7a5e3e');
        else for (let k = 0; k < T; k += 4) prect(c, X + 1, Y + k, T - 2, 3, r() < 0.12 ? '#3a2e1f' : '#7a5e3e');
      }
    }
    // точки интереса
    const lights: PLight[] = [];
    for (const rm of this.rooms) {
      if (!rm.seen && !this.seen[rm.y][rm.x]) continue; // точку видно, как только её клетка попала в свет
      const X = rm.x * T + T / 2, Y = rm.y * T + T / 2;
      this.drawPoi(c, rm, X, Y, t);
      if (rm.kind === 'ladder') lights.push({ x: X - cam.x, y: Y - 30 - cam.y, r: 70, a: 0.45, color: '#c8c0a0' }); // свет сверху, у лестницы
      if (rm.kind === 'gas' && !rm.done) lights.push({ x: X - cam.x, y: Y - cam.y, r: 60, a: 0.35, color: '#a8c060' });
    }
    // отряд
    const walking = this.moveK < 1, wf = walking ? 1 + (Math.floor(t * 8) % 2) * 2 : 0, p = this.player;
    const ents = [...this.followers.map((f, i) => ({ y: f.ry - 0.01, d: () => drawSprite(c, G.squad[i + 1]?.look ?? 'pc', f.rx * T + T / 2, f.ry * T + T - 1, { flip: f.flip, frame: wf }) })),
      { y: p.ry, d: () => drawSprite(c, G.squad[0]?.look ?? 'pc', p.rx * T + T / 2, p.ry * T + T - 1, { flip: p.flip, frame: wf }) }];
    ents.sort((a, b) => a.y - b.y).forEach((e) => e.d());
    c.setTransform(1, 0, 0, 1, 0, 0);
    const lamp = lampLevel();
    lights.push({ x: p.rx * T + T / 2 - cam.x, y: p.ry * T + T / 2 - cam.y, r: [80, 112, 144][lamp], a: [0.85, 0.92, 1][lamp], color: lamp === 2 ? '#e8ecd8' : '#d8c890' });
    applyLight(c, LW, LH, lights, 0.34, [0.82, 0.96, 0.74], 0.4);
    v.present(out);
  },

  /** Рисунок точки интереса посреди развилки. */
  drawPoi(c: CanvasRenderingContext2D, rm: Room, X: number, Y: number, t: number) {
    const r = seeded(rm.seed);
    switch (rm.kind) {
      case 'ladder': // лестница наверх
        prect(c, X - 6, Y - 22, 2, 26, '#6a4a2a'); prect(c, X + 4, Y - 22, 2, 26, '#6a4a2a');
        for (let k = 0; k < 6; k++) prect(c, X - 4, Y - 19 + k * 4, 8, 1, '#8a6a3a');
        break;
      case 'cache': // ящики с припасами
        if (rm.done) { prect(c, X - 7, Y - 2, 14, 7, '#4a3620'); prect(c, X - 7, Y - 2, 14, 1, '#2a1e12'); break; }
        prect(c, X - 9, Y - 8, 12, 10, '#6a5030'); prect(c, X - 9, Y - 8, 12, 1, '#8a6a40'); prect(c, X - 4, Y - 8, 1, 10, '#4a3620');
        prect(c, X + 1, Y - 3, 9, 7, '#5a4428'); prect(c, X + 1, Y - 3, 9, 1, '#7a5a34');
        break;
      case 'corpse': drawSprite(c, 'dead_rifle', X, Y + 6, { dead: true }); if (!rm.done) ppx(c, X + 3, Y + 2, '#c8a050'); break;
      case 'dead': // засада: тела в грязи, пока не встали
        if (!rm.done) { drawSprite(c, 'dead_soldier', X - 8, Y + 2, { dead: true }); drawSprite(c, 'dead_soldier', X + 8, Y + 8, { dead: true }); }
        else { for (let k = 0; k < 6; k++) ppx(c, X - 8 + r() * 16, Y - 2 + r() * 8, '#4a3a2a'); }
        break;
      case 'gas': // газовый карман: дрожащая жёлто-зелёная дымка
        if (rm.done) break;
        for (let k = 0; k < 140; k++) { const a = r() * 6.28, d = r() * 40, x = X + Math.cos(a + t * 0.3) * d, y = Y + Math.sin(a + t * 0.25) * d * 0.7; if ((Math.floor(x) + Math.floor(y) + Math.floor(t * 3)) % 3 === 0) ppx(c, x, y, k % 2 ? '#9aaa40' : '#7a8a30'); }
        break;
      case 'dugout': // вход в блиндаж: брёвна и тёмный проём
        prect(c, X - 10, Y - 14, 20, 3, '#5a4028'); prect(c, X - 10, Y - 11, 3, 13, '#5a4028'); prect(c, X + 7, Y - 11, 3, 13, '#5a4028'); prect(c, X - 7, Y - 11, 14, 13, '#0c0a08');
        if (!rm.done) ppx(c, X, Y - 4, '#e8b050');
        break;
      case 'empty': { // крест, каска на винтовке или брошенное колесо
        const v = rm.seed % 3;
        if (v === 0) { prect(c, X, Y - 12, 2, 14, '#4a3a26'); prect(c, X - 4, Y - 9, 10, 2, '#4a3a26'); }
        else if (v === 1) { prect(c, X, Y - 12, 1, 14, '#3a2c1e'); prect(c, X - 2, Y - 14, 5, 3, '#4a4e3a'); }
        else { pellipse(c, X, Y, 6, 6, '#2a2420'); pellipse(c, X, Y, 4, 4, '#3a3226'); ppx(c, X, Y, '#6a5a40'); }
        break;
      }
    }
  },

  // ---------------------------------------------------------- находки (текст и выдача — одной суммой)
  loot: null as null | { room: number; text: string; give: () => void },
  /** Добыча комнаты: считается один раз, текст и выдача совпадают. */
  lootOf(rm: Room) {
    if (this.loot?.room === rm.id) return this.loot;
    const r = seeded(rm.seed + 17), S = G.supplies, got: string[] = [], give: (() => void)[] = [];
    const add = (cond: boolean, txt: string, f: () => void) => { if (cond) { got.push(txt); give.push(f); } };
    if (rm.kind === 'cache') {
      const am = 5 + Math.floor(r() * 8), bd = 1 + Math.floor(r() * 2);
      add(true, `${am} винтовочных патронов`, () => (S.ammo_rifle += am));
      add(true, `${bd} бинт.`, () => (S.bandage += bd));
      add(r() < 0.45, '1 граната', () => (S.grenade += 1));
      add(r() < 0.4, '1 паёк', () => (S.ration += 1));
      add(r() < 0.3, '1 фильтр', () => (S.filter += 1));
    } else if (rm.kind === 'corpse') {
      const sh = 2 + Math.floor(r() * 9);
      add(true, `${sh} шиллингов`, () => (G.money += sh));
      const am = 3 + Math.floor(r() * 4);
      add(r() < 0.5, `${am} винтовочных патронов`, () => (S.ammo_rifle += am));
      const it = r() < 0.25 ? 'rifle~w' : r() < 0.25 ? 'helmet' : r() < 0.2 ? 'gasmask' : '';
      add(!!it, it === 'rifle~w' ? 'изношенная армейская винтовка' : it === 'helmet' ? 'стальная каска' : 'противогаз', () => G.stash.push(it));
    } else if (rm.kind === 'dugout') {
      const sh = 4 + Math.floor(r() * 10), pa = 6 + Math.floor(r() * 6);
      add(true, `${sh} шиллингов`, () => (G.money += sh));
      add(r() < 0.6, '1 аптечка', () => (S.medkit += 1));
      add(r() < 0.5, `${pa} пистолетных патронов`, () => (S.ammo_pistol += pa));
      add(r() < 0.35, '1 динамитная шашка', () => (S.dynamite += 1));
    }
    this.loot = { room: rm.id, text: got.length ? `(Получено: ${got.join(', ')}.)` : '(Ничего полезного.)', give: () => { give.forEach((f) => f()); rm.done = true; } };
    return this.loot;
  },
};
