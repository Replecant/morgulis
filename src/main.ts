// ============================================================
//  МОРГУЛИС: Пепел Эшфорда — точка входа
// ============================================================
import './style.css';
import { G, resetGame } from './state';
import { Explore, ET } from './explore';
import { Combat, CT } from './combat';
import { Dialog, refreshHud, exploreHint, toast, combatShow, combatLog, combatPanel, screen, hideScreen, openSquad, closeSquad, squadOpen } from './ui';
import { updateAsh, setPcStyle, applyEquipLooks } from './gfx';
import { Inventory } from './inventory';
import { drawMenuBg, showMainMenu, showAbout, openRules } from './menu';
import { openCreation } from './creation';
import { Character, g, fullName, newCharacter } from './rules';
import { $ } from './util';

const cv = $('cv') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;

// ---------------------------------------------------------------- связки модулей
Combat.hooks = {
  panel: combatPanel,
  log: combatLog,
  toast,
  victory(id) {
    G.mode = 'explore';
    combatShow(false);
    if (id === 'road') {
      G.flags.battle1Won = true;
      // отряд оказывается у ворот, где стоял Брэм
      Explore.player.x = 25; Explore.player.y = 12; Explore.player.rx = 25; Explore.player.ry = 12;
      Explore.followers.forEach((f, i) => { f.x = f.rx = 24 - i; f.y = f.ry = 13; });
      Explore.trail = Explore.followers.map((f) => ({ x: f.x, y: f.y }));
      Dialog.start('after1');
    } else {
      G.flags.won = true;
      Dialog.start('ending');
    }
    refreshHud();
  },
  defeat(id) {
    screen(
      `<h2>Отряд разбит</h2><p>Лейтенант ${fullName(G.pc!)} ${g(G.pc, 'пал', 'пала')}. Пустошь забирает своё.</p>`,
      [{ label: 'Повторить бой', fn: () => { hideScreen(); restoreSnapshot(); startBattle(id); } }],
    );
  },
};

// снимок отряда перед боем — для «Повторить бой»
let snapshot = '';
function restoreSnapshot() {
  const d = JSON.parse(snapshot);
  G.squad.forEach((s, i) => { s.hp = d.sq[i].hp; s.wounds = d.sq[i].wounds; });
  G.supplies = d.sup;
}

function startBattle(id: 'road' | 'factory') {
  snapshot = JSON.stringify({ sq: G.squad.map((s) => ({ hp: s.hp, wounds: s.wounds ?? [] })), sup: G.supplies });
  G.mode = 'combat';
  combatShow(true);
  Combat.start(id);
}

Explore.onInteract = (d) => Dialog.start(d);
Dialog.onClose = () => { refreshHud(); if (G.mode === 'explore') exploreHint(); };
Dialog.onAction = (act) => {
  if (act === 'battle1') startBattle('road');
  else if (act === 'battle2') startBattle('factory');
  else if (act === 'ending') showEnding();
};

$('cend').onclick = () => Combat.endPlayerTurn();
$('squadbar').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('.res') && G.mode === 'explore' && !Dialog.active && !squadOpen() && !Inventory.open) openSquad(exploreHint);
});

// ---------------------------------------------------------------- экраны
const layer = $('layer');

function showTitle() {
  G.mode = 'title';
  hideScreen();
  $('hud').classList.add('hidden');
  $('hint').textContent = '';
  showMainMenu(layer, {
    onNew: () => { G.mode = 'create'; openCreation(layer, newGame, showTitle); },
    onRules: () => openRules(layer, showTitle),
    onAbout: () => showAbout(layer, showTitle),
  });
}

function newGame(pc: Character) {
  layer.replaceChildren();
  resetGame(pc);
  setPcStyle(pc);
  applyEquipLooks(G.squad);
  Explore.init();
  hideScreen();
  G.mode = 'explore';
  $('hud').classList.remove('hidden');
  refreshHud();
  exploreHint();
  Dialog.start('intro');
}

function showEnding() {
  G.mode = 'end';
  const f = G.flags;
  const notes = [
    f.persuade1 && f.persuade2 ? 'Вы убедили Брэма — Эшфорд вам поверил.' : 'Вы проложили путь силой.',
    f.salts ? 'Отец Бенедикт дал вам нюхательную соль против шёпота Вейла.' : 'Вы не заходили к отцу Бенедикту за помощью.',
    f.tommy ? 'Мальчишка Томми показал вам пролом в стене.' : 'Вы вошли через главные ворота.',
  ];
  screen(
    `<h1>МОРГУЛИС</h1><h2>Конец пролога</h2><p>${notes.join('<br>')}</p>
     <p>Мордекай Вейл мёртв. Но Око всё так же смотрит на Пустошь.</p>`,
    [{ label: 'В главное меню', fn: showTitle }],
  );
}

// ---------------------------------------------------------------- ввод
function toCanvas(e: MouseEvent) {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * 960) / r.width, y: ((e.clientY - r.top) * 640) / r.height };
}

window.addEventListener('keydown', (e) => {
  if (Dialog.active) { e.preventDefault(); Dialog.key(e); return; }
  if (e.code === 'KeyI' && G.mode === 'explore' && !Dialog.active && !squadOpen()) {
    if (Inventory.open) Inventory.close(); else { G.keys.clear(); Inventory.show(() => { refreshHud(); exploreHint(); }); }
    return;
  }
  if (Inventory.open) { if (e.code === 'Escape') Inventory.close(); return; }
  if (e.code === 'KeyQ' && G.mode === 'explore' && !Dialog.active) {
    if (squadOpen()) closeSquad(exploreHint); else { G.keys.clear(); openSquad(exploreHint); }
    return;
  }
  if (squadOpen()) { if (e.code === 'Escape') closeSquad(exploreHint); return; }
  if (G.mode === 'explore') {
    if (['Space', 'KeyE', 'Enter'].includes(e.code)) { e.preventDefault(); if (performance.now() - Dialog.closedAt > 200) Explore.interactKey(); return; }
    if (e.code.startsWith('Arrow')) e.preventDefault();
    G.keys.add(e.code);
  } else if (G.mode === 'combat') {
    if (/^Digit[1-9]$/.test(e.code)) Combat.pressButton(Number(e.code.slice(5)) - 1);
    else if (e.code === 'Enter') Combat.endPlayerTurn();
    else if (e.code === 'Escape') Combat.cancel();
    else if (e.code === 'Tab') { e.preventDefault(); if (!Combat.busy) Combat.selectNext(); }
  }
});
window.addEventListener('keyup', (e) => G.keys.delete(e.code));
window.addEventListener('blur', () => G.keys.clear());

cv.addEventListener('mousemove', (e) => {
  const p = toCanvas(e);
  G.mouse = p;
  if (G.mode === 'combat') {
    const h = { x: Math.floor(p.x / CT), y: Math.floor(p.y / CT) };
    Combat.hover = h.y < 14 ? h : null;
  } else if (G.mode === 'explore') {
    Explore.hoverTile = { x: Math.floor(p.x / ET), y: Math.floor(p.y / ET) };
  }
});
cv.addEventListener('mouseleave', () => { Combat.hover = null; Explore.hoverTile = null; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('mousedown', (e) => {
  const p = toCanvas(e);
  if (Dialog.active) { Dialog.advance(); return; }
  if (G.mode === 'explore') Explore.click(p.x, p.y);
  else if (G.mode === 'combat') Combat.click(p.x, p.y, e.button === 2);
});
$('dialog').addEventListener('mousedown', () => Dialog.advance());

// масштабирование под окно
function fit() {
  const s = Math.min(window.innerWidth / 960, window.innerHeight / 640);
  $('game').style.transform = `translate(-50%, -50%) scale(${s})`;
}
window.addEventListener('resize', fit);
fit();

// ---------------------------------------------------------------- цикл
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.time += dt;
  updateAsh(dt, 960, 640);
  Dialog.update(dt);
  if (G.mode === 'explore' && !Dialog.active && !squadOpen() && !Inventory.open) Explore.update(dt);
  if (G.mode === 'combat') { Combat.update(dt); Combat.draw(ctx, G.time); }
  else if (G.mode === 'title' || G.mode === 'create') drawMenuBg(ctx, G.time);
  else Explore.draw(ctx, G.time);
  requestAnimationFrame(frame);
}

showTitle();
requestAnimationFrame(frame);

// отладка: ?debug в адресе даёт доступ к состоянию из консоли
if (new URLSearchParams(location.search).has('debug')) {
  (window as any).morgulis = { G, Combat, Explore, Dialog, startBattle, newGame, newCharacter, openSquad, Inventory };
}
