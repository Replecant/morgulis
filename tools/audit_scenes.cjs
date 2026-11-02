// Проверка расстановки объектов во всех сценах (города и деревни):
// наложения, вещи на дороге и рельсах, перегороженные двери, вещи за крышами,
// недостижимые объекты и жители, точки маршрутов в постройках.
// Запуск: npm run dev -- --port 5182, затем node tools/audit_scenes.cjs
// Башни поверх стен, закрытый замок баронессы и фонтан на перекрёстке — задумано.

const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5182/?debug&quick=soldier'); await p.waitForTimeout(1500);
  const rep = await p.evaluate(() => {
    const E = morgulis.Explore, T = 20, MW = 640;
    const scenes = ['ashford', 'richmord', 'fenmor', 'fortgate', 'fort1', 'fort2', 'brimmor', 'hailstone', 'mossley', 'bcamp', 'bfort', 'einbow', 'hawley', 'woodham', 'tarwell', 'svoboda'];
    const out = {};
    const FENCE = new Set(['wall', 'fence', 'wire', 'gate', 'railgate']);
    for (const sc of scenes) {
      morgulis.toScene(sc);
      const L = []; const inS = (o) => o.x >= 0 && E.inScene(o.x, o.y) || E.inScene(o.x + o.w - 1, o.y + o.h - 1);
      const objs = E.objs.filter(o => E.inScene(o.x, o.y) && E.inScene(o.x + o.w - 1, o.y + o.h - 1));
      const part = E.objs.filter(o => !objs.includes(o) && inS(o) && !FENCE.has(o.kind));
      for (const o of part) L.push(`за краем сцены: ${o.kind} «${o.name ?? ''}» @${o.x},${o.y}`);
      const nm = (o) => `${o.kind}${o.name ? ' «' + o.name + '»' : ''} @${o.x},${o.y}`;
      // 1. наложения
      for (let i = 0; i < objs.length; i++) for (let j = i + 1; j < objs.length; j++) {
        const a = objs[i], c = objs[j];
        if (a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y) L.push(`наложение: ${nm(a)} и ${nm(c)}`);
      }
      // 2. на дороге (рельсы тоже)
      for (const o of objs) {
        if (FENCE.has(o.kind) || o.kind === 'wagon' || o.kind === 'boat') continue;
        let road = 0, rail = 0;
        for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) { if (E.ground[y][x] === 'r') road++; if (E.rail[y][x]) rail++; }
        if (road) L.push(`на дороге (${road} кл.): ${nm(o)}`);
        if (rail && o.kind !== 'orecart') L.push(`на рельсах: ${nm(o)}`);
      }
      // 3. дверь перегорожена
      const DOORS = new Set(['house', 'farm', 'hut', 'barracks', 'tenement', 'shack', 'clinic', 'workshop', 'station', 'pumphouse', 'slaughter', 'cell', 'factory', 'keep', 'barn']);
      for (const o of objs) {
        if (!DOORS.has(o.kind)) continue;
        const dx = o.x + Math.floor(o.w / 2), dy = o.y + o.h;
        const bl = objs.find(q => q !== o && dx >= q.x && dx < q.x + q.w && dy >= q.y && dy < q.y + q.h);
        const dx2 = o.x + Math.floor((o.w - 1) / 2);
        const bl2 = objs.find(q => q !== o && dx2 >= q.x && dx2 < q.x + q.w && dy >= q.y && dy < q.y + q.h);
        if (bl && bl2) L.push(`дверь упирается: ${nm(o)} → ${nm(bl)}`);
        if (E.ground[dy]?.[dx] === 'f' || E.ground[dy]?.[dx] === 'x' || E.ground[dy]?.[dx] === 'l') L.push(`дверь в непроходимое: ${nm(o)}`);
      }
      // 4. загорожен спрайтом спереди
      for (const c of objs) {
        if (!c.talk || !c.sprite) continue;
        const cr = { x: c.x * T - c.sx, y: c.y * T - c.sy, w: c.sprite.width, h: c.sprite.height };
        for (const a of objs) {
          if (a === c || !a.sprite || a.y + a.h <= c.y + c.h) continue;
          const ar = { x: a.x * T - a.sx + 4, y: a.y * T - a.sy + 4, w: a.sprite.width - 8, h: a.sprite.height - 8 };
          const ix = Math.max(0, Math.min(ar.x + ar.w, cr.x + cr.w) - Math.max(ar.x, cr.x)), iy = Math.max(0, Math.min(ar.y + ar.h, cr.y + cr.h) - Math.max(ar.y, cr.y));
          if (ix * iy > 0.8 * cr.w * cr.h) L.push(`загорожен: ${nm(c)} за ${nm(a)}`);
        }
      }
      // 5. достижимость
      const pl = E.player, seen = new Set([pl.y * MW + pl.x]), q = [[pl.x, pl.y]];
      while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy, k = ny * MW + nx; if (!seen.has(k) && E.inScene(nx, ny) && !E.block[ny][nx] && !E.npcs.some(n => n.x === nx && n.y === ny)) { seen.add(k); q.push([nx, ny]); } } }
      const reach = (x0, y0, w, h) => { for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) if ((x < x0 || x >= x0 + w || y < y0 || y >= y0 + h) && seen.has(y * MW + x)) return true; return false; };
      for (const o of objs) if (o.talk && !reach(o.x, o.y, o.w, o.h)) L.push(`не подойти: ${nm(o)}`);
      for (const n of E.npcs.filter(n => E.inScene(n.x, n.y))) {
        if (E.block[n.y][n.x]) L.push(`житель в постройке: ${n.name} @${n.x},${n.y}`);
        if (![[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => seen.has((n.y + dy) * MW + n.x + dx))) L.push(`не подойти к жителю: ${n.name} @${n.x},${n.y}`);
      }
      if (!E.inScene(pl.x, pl.y) || E.block[pl.y][pl.x]) L.push('вход в непроходимом месте');
      // 6. маршруты жителей: точка сдвинута с занятой клетки
      const FOLK = E.folk.filter(f => f.def.scene === sc);
      for (const f of FOLK) f.def.route.forEach((st, i) => { if (!seen.has(st.y * MW + st.x)) L.push(`маршрут жителя «${f.name}» точка ${i} @${st.x},${st.y} недостижима`); });
      out[sc] = L;
    }
    return out;
  });
  for (const [sc, L] of Object.entries(rep)) console.log(`== ${sc}: ${L.length}\n` + L.map(s => '  ' + s).join('\n'));
  console.log('ERRORS:', errs.join('\n') || 'none');
  await b.close();
})();
