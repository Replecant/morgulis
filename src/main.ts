// ============================================================
//  МОРГУЛИС — точка входа
//  Режимы: глобальная карта (world) ⇄ локальная сцена (explore) → бой (combat)
// ============================================================
import './style.css';
import { G, resetGame } from './state';
import { Explore } from './explore';
import { World, clockText } from './worldmap';
import { Combat, CT } from './combat';
import { Dialog, refreshHud, exploreHint, toast, combatShow, combatLog, combatPanel, screen, hideScreen, openSquad, closeSquad, squadOpen } from './ui';
import { setPcStyle, applyEquipLooks } from './gfx';
import { Inventory } from './inventory';
import { Sheet } from './sheet';
import { Music } from './music';
import { Pause } from './pause';
import { ProsthShop } from './prosthshop';
import { OccultMenu } from './occultmenu';
import { hasProsth, type Shop } from './prosthetics';
import { frameReady, whenFrameReady, frameUrl } from './frames';
import { Trade, resetShops } from './trade';
import { drawMenuBg, showMainMenu, showAbout, openRules } from './menu';
import { openCreation } from './creation';
import { Character, newCharacter, quickCharacter, PROF_ORDER, ProfId } from './rules';
import { rest } from './wounds';
import { $ } from './util';

const cv = $('cv') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;

/** Куда вернуться после боя. */
let returnMode: 'world' | 'explore' = 'world';

// ---------------------------------------------------------------- переходы между режимами
function toWorld(fromScene?: string) {
  G.mode = 'world';
  if (fromScene) World.placeAt(fromScene.startsWith('fort') ? 'fortgate' : fromScene);
  World.updateLocation();
  G.keys.clear();
  hint();
  refreshHud();
}
function toScene(id: string, at?: { x: number; y: number }) {
  G.mode = 'explore';
  Explore.enter(id, at);
  G.keys.clear();
  hint();
  refreshHud();
}
function hint() {
  if (G.mode === 'world') $('hint').textContent = 'Клик — идти · клик по месту — войти · WASD — идти · E — войти рядом · Q — лечение и лагерь · I — снаряжение · C — персонаж · O — оккультизм · Esc — меню';
  else exploreHint();
}

// ---------------------------------------------------------------- бой
Combat.hooks = {
  panel: combatPanel,
  log: combatLog,
  toast,
  victory(id) {
    combatShow(false);
    G.mode = returnMode;
    hint();
    if (id === 'ruins') { G.flags.scavDone = true; Dialog.start('after_scav'); }
    if (id === 'waste') { World.killBand(); Dialog.start('after_band'); }
    if (id.startsWith('trench')) { World.killDead(); World.deadHit = null; Dialog.start('after_dead'); }
    refreshHud();
  },
  defeat(id) {
    screen(
      `<img class="death-img" src="${frameUrl('death')}" alt=""><div class="death-cap">Ещё одна душа сгинула под взглядом Ока</div>`,
      [
        { label: 'Повторить бой', fn: () => { hideScreen(); restoreSnapshot(); startBattle(id); } },
        { label: 'Отступить', fn: () => {
          hideScreen(); restoreSnapshot();
          G.squad.forEach((s) => (s.hp = Math.max(1, Math.ceil(s.hp / 2))));
          if (id === 'waste') World.calmBand(24);
          if (id.startsWith('trench')) World.calmDead(12);
          combatShow(false); G.mode = returnMode; hint(); refreshHud();
        } },
      ],
      'death',
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
  if (G.mode === 'world' || G.mode === 'explore') returnMode = G.mode;
  snapshot = JSON.stringify({ sq: G.squad.map((s) => ({ hp: s.hp, wounds: s.wounds ?? [] })), sup: G.supplies });
  G.mode = 'combat';
  combatShow(true);
  Combat.start(id);
}

// ---------------------------------------------------------------- связки модулей
Explore.onInteract = (d) => Dialog.start(d);
Explore.onLocation = () => refreshHud();
Explore.onExit = (scene) => toWorld(scene);
World.onArrive = (l) => Dialog.start(l.talk);
World.onEncounter = () => Dialog.start('enc_band');
World.onPatrol = () => Dialog.start('enc_patrol');
World.onDiscover = (l) => toast(`Замечено: ${l.name}`);
World.onDead = () => Dialog.start('enc_dead');
World.onGas = (msg) => { toast(msg); refreshHud(); };
/** Плотяная рука: раз в 3 дня нужен тканевый раствор, иначе отторжение. */
function fleshCare() {
  for (const b of G.squad) {
    if (!hasProsth(b, 'flesh') || G.clock < (b.fleshDue ?? 0)) continue;
    if (G.supplies.tissue > 0) {
      G.supplies.tissue--; b.fleshDue = G.clock + 72;
      if (b.fleshReject) toast(`${b.name}: раствор снял отторжение — плотяная рука снова слушается.`);
      else toast(`${b.name}: плотяная рука получила раствор (осталось ${G.supplies.tissue}).`);
      b.fleshReject = false;
    } else if (!b.fleshReject) { b.fleshReject = true; toast(`${b.name}: раствора нет — плотяная рука немеет и чернеет. Отторжение!`); }
  }
}
World.onDay = () => { // раз в сутки отряд ест
  fleshCare();
  if (G.supplies.ration > 0) { G.supplies.ration--; toast(`${clockText()}: отряд съел паёк (осталось ${G.supplies.ration})`); }
  else { G.squad.forEach((s) => (s.hp = Math.max(1, s.hp - 2))); Dialog.start('hunger'); }
  refreshHud();
};
Dialog.onClose = () => { refreshHud(); if (G.mode === 'explore' || G.mode === 'world') hint(); };
Dialog.onAction = (act) => {
  if (act.startsWith('enter:')) toScene(act.slice(6));
  else if (act.startsWith('prosthshop:')) { G.keys.clear(); ProsthShop.show(act.slice(11) as Shop, () => { refreshHud(); hint(); }); }
  else if (act.startsWith('goto:')) { const [, id, x, y] = act.split(':'); toScene(id, { x: +x, y: +y }); }
  else if (act === 'rest') { toast(rest()); refreshHud(); }
  else if (act.startsWith('trade:')) { G.keys.clear(); Trade.show(act.slice(6), () => { refreshHud(); hint(); }); }
  else if (act === 'battle_scav') startBattle('ruins');
  else if (act === 'battle_band') startBattle('waste');
  else if (act === 'band_calm') World.calmBand(24);
  else if (act === 'band_lose') World.calmBand(8);
  else if (act === 'battle_dead') startBattle(World.deadHit?.id ?? 'trench1');
  else if (act === 'battle_trench_poi') { World.deadHit = null; startBattle('trench2'); }
  else if (act === 'dead_lose') World.calmDead(8);
};

$('cend').onclick = () => Combat.endPlayerTurn();
$('squadbar').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('.res') && (G.mode === 'explore' || G.mode === 'world') && !Dialog.active && !squadOpen() && !Inventory.open && !Sheet.open) openSquad(hint);
});

// ---------------------------------------------------------------- экраны
const layer = $('layer');

function showTitle() {
  G.mode = 'title';
  // при первом запуске меню проявляется вместе с рамкой, а не раньше неё
  if (!frameReady('menu')) {
    layer.style.opacity = '0';
    whenFrameReady('menu').then(() => { layer.style.transition = 'opacity 0.5s'; layer.style.opacity = '1'; });
  }
  hideScreen();
  $('hud').classList.add('hidden');
  $('hint').textContent = '';
  showMainMenu(layer, {
    onNew: () => { G.mode = 'create'; openCreation(layer, newGame, showTitle); },
    onQuick: (prof) => newGame(quickCharacter(prof), false),
    onRules: () => openRules(layer, showTitle),
    onAbout: () => showAbout(layer, showTitle),
  });
}

function newGame(pc: Character, intro = true) {
  layer.replaceChildren();
  resetGame(pc);
  resetShops();
  setPcStyle(pc);
  applyEquipLooks(G.squad);
  Explore.init();
  World.init();
  World.placeAt('ashford');
  hideScreen();
  $('hud').classList.remove('hidden');
  toScene('ashford', { x: 24, y: 58 }); // начинаем на разъезде Эшфорда
  if (intro) Dialog.start('intro');
}

// ---------------------------------------------------------------- ввод
function toCanvas(e: MouseEvent) {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * 960) / r.width, y: ((e.clientY - r.top) * 640) / r.height };
}
const roaming = () => G.mode === 'explore' || G.mode === 'world';

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && G.mode !== 'create') { toast(Music.toggle() ? 'Музыка выключена [M]' : 'Музыка включена [M]'); if (Pause.open) Pause.render(); return; }
  if (Pause.open) { if (e.code === 'Escape') Pause.close(); return; }
  // Esc вне окон — меню паузы (в бою: сначала отменяет выбранное действие)
  const anyWindow = Dialog.active || Trade.open || ProsthShop.open || OccultMenu.open || Inventory.open || Sheet.open || squadOpen() || !!$('screen').innerHTML;
  if (e.code === 'Escape' && !anyWindow && (roaming() || G.mode === 'combat')) {
    const sel = Combat.sel, plain = !Combat.magic && (!sel || (Combat.action.type === 'w' && Combat.action.key === sel.weapons[0]));
    if (G.mode !== 'combat' || plain) { G.keys.clear(); Pause.show(() => { combatShow(false); showTitle(); }); return; }
  }
  if (Dialog.active) { e.preventDefault(); Dialog.key(e); return; }
  if (Trade.open) { if (e.code === 'Escape') Trade.close(); return; }
  if (ProsthShop.open) { if (e.code === 'Escape') ProsthShop.close(); return; }
  if (e.code === 'KeyO' && roaming() && !squadOpen() && !Inventory.open && !Sheet.open) {
    if (OccultMenu.open) OccultMenu.close(); else { G.keys.clear(); OccultMenu.show(() => { refreshHud(); hint(); }); }
    return;
  }
  if (OccultMenu.open) {
    if (e.code === 'Escape') OccultMenu.close();
    else if (/^Digit[1-4]$/.test(e.code)) OccultMenu.setTab((['folk', 'demon', 'astro', 'rune'] as const)[+e.code.slice(5) - 1]);
    return;
  }
  if (e.code === 'KeyI' && roaming() && !squadOpen()) {
    if (Inventory.open) Inventory.close(); else { G.keys.clear(); Inventory.show(() => { refreshHud(); hint(); }); }
    return;
  }
  if (Inventory.open) { if (e.code === 'Escape') Inventory.close(); return; }
  if (e.code === 'KeyC' && roaming() && !squadOpen()) {
    if (Sheet.open) Sheet.close(); else { G.keys.clear(); Sheet.show(() => { refreshHud(); hint(); }); }
    return;
  }
  if (Sheet.open) { if (e.code === 'Escape') Sheet.close(); return; }
  if (e.code === 'KeyQ' && roaming()) {
    if (squadOpen()) closeSquad(hint); else { G.keys.clear(); openSquad(hint); }
    return;
  }
  if (squadOpen()) { if (e.code === 'Escape') closeSquad(hint); return; }
  if (roaming()) {
    if (['Space', 'KeyE', 'Enter'].includes(e.code)) {
      e.preventDefault();
      if (performance.now() - Dialog.closedAt > 200) (G.mode === 'world' ? World : Explore).interactKey();
      return;
    }
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
  } else if (G.mode === 'explore') Explore.hover(p.x, p.y);
  else if (G.mode === 'world') World.hoverAt(p.x, p.y);
});
cv.addEventListener('mouseleave', () => { Combat.hover = null; Explore.hoverW = null; World.hover = null; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('mousedown', (e) => {
  const p = toCanvas(e);
  if (Dialog.active) { Dialog.advance(); return; }
  if (G.mode === 'explore') Explore.click(p.x, p.y);
  else if (G.mode === 'world') World.click(p.x, p.y);
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
let last = performance.now(), hudT = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.time += dt;
  Dialog.update(dt);
  const free = !Dialog.active && !squadOpen() && !Inventory.open && !Trade.open && !Sheet.open && !Pause.open && !ProsthShop.open && !OccultMenu.open;
  if (G.mode === 'explore' && free) Explore.update(dt);
  if (G.mode === 'world' && free) World.update(dt);
  if (G.mode === 'combat') { Combat.update(dt); Combat.draw(ctx, G.time); }
  else if (G.mode === 'title' || G.mode === 'create') drawMenuBg(ctx, G.time);
  else if (G.mode === 'world') World.draw(ctx, G.time);
  else Explore.draw(ctx, G.time);
  if (G.mode === 'world' && (hudT += dt) > 0.5) { hudT = 0; refreshHud(); }
  Music.update(dt, G.mode === 'combat'); // в бою — боевая тема, иначе мирные
  requestAnimationFrame(frame);
}

// быстрый старт для тестов: ?quick (солдат) или ?quick=medic
const quick = new URLSearchParams(location.search).get('quick');
if (quick !== null) newGame(quickCharacter(PROF_ORDER.includes(quick as ProfId) ? (quick as ProfId) : 'soldier'), false);
else showTitle();
requestAnimationFrame(frame);

// отладка: ?debug в адресе даёт доступ к состоянию из консоли
if (new URLSearchParams(location.search).has('debug')) {
  (window as any).morgulis = { G, Combat, Explore, World, Dialog, startBattle, newGame, newCharacter, openSquad, Inventory, Trade, Sheet, Music, Pause, ProsthShop, OccultMenu, toScene, toWorld };
}
