// ============================================================
//  МОРГУЛИС — точка входа
// ============================================================
import './style.css';
import { G, resetGame } from './state';
import { Explore } from './explore';
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
    if (id === 'ruins') { G.flags.scavDone = true; Dialog.start('after_scav'); }
    refreshHud();
  },
  defeat(id) {
    screen(
      `<h2>Поражение</h2><p>${fullName(G.pc!)} ${g(G.pc, 'падает', 'падает')} без сил. Пустошь забирает своё.</p>`,
      [
        { label: 'Повторить бой', fn: () => { hideScreen(); restoreSnapshot(); startBattle(id); } },
        { label: 'Отступить', fn: () => { hideScreen(); restoreSnapshot(); G.squad.forEach((s) => (s.hp = Math.max(1, Math.ceil(s.hp / 2)))); G.mode = 'explore'; combatShow(false); refreshHud(); } },
      ],
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

function startBattle(id: string) {
  snapshot = JSON.stringify({ sq: G.squad.map((s) => ({ hp: s.hp, wounds: s.wounds ?? [] })), sup: G.supplies });
  G.mode = 'combat';
  combatShow(true);
  Combat.start(id);
}

Explore.onInteract = (d) => Dialog.start(d);
Explore.onLocation = () => refreshHud();
Dialog.onClose = () => { refreshHud(); if (G.mode === 'explore') exploreHint(); };
Dialog.onAction = (act) => {
  if (act === 'battle_scav') startBattle('ruins');
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
  if (G.mode === 'explore' && (e.code === 'KeyM' || (e.code === 'Escape' && Explore.mapOpen))) { Explore.mapOpen = !Explore.mapOpen; G.keys.clear(); return; }
  if (G.mode === 'explore' && Explore.mapOpen) return;
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
    Explore.hover(p.x, p.y);
  }
});
cv.addEventListener('mouseleave', () => { Combat.hover = null; Explore.hoverW = null; });
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
