// ============================================================
//  МОРГУЛИС — точка входа
//  Режимы: глобальная карта (world) ⇄ локальная сцена (explore) → бой (combat)
// ============================================================
import './style.css';
import { installI18n, tr } from './i18n';
import { G, resetGame, alexIn, arthurIn, ivyIn, ferglowIn, undeadCompanion } from './state';
import { Explore } from './explore';
import { World, clockText, LOCS } from './worldmap';
import { Combat, CT } from './combat';
import { Dialog, refreshHud, exploreHint, toast, combatShow, combatLog, combatPanel, screen, hideScreen, openSquad, closeSquad, squadOpen } from './ui';
import { setPcStyle, applyEquipLooks } from './gfx';
import { makeAlex, makeArthur, makeIvy, makeFerglow, CLASH, refreshLeader } from './data';
import { Inventory } from './inventory';
import { Sheet } from './sheet';
import { Music } from './music';
import { Pause } from './pause';
import { Debug } from './debug';
import { Weather, WEATHER_ORDER, WEATHER_NAMES } from './weather';
import { charSprite } from './sprites';
import { ProsthShop } from './prosthshop';
import { MapWin } from './mapwin';
import { OccultMenu } from './occultmenu';
import { hasProsth, type Shop } from './prosthetics';
import { frameReady, whenFrameReady, frameUrl } from './frames';
import { Trade, resetShops } from './trade';
import { drawMenuBg, showMainMenu, showAbout, openRules } from './menu';
import { openCreation } from './creation';
import { Character, newCharacter, quickCharacter, PROF_ORDER, ProfId, LEVEL_XP, MAX_LEVEL, XP, enemyXp, pendingTalent, classTalent, pendingMove, knownMoves, COURAGE } from './rules';
import { rest } from './wounds';
import { $ } from './util';
import { Save, type Slot } from './save';
installI18n(); // английский: перевод текста в DOM и на холсте

const cv = $('cv') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;

/** Куда вернуться после боя. */
let returnMode: 'world' | 'explore' = 'world';
// стычка фракций: за кого вступил отряд и что он за это получит
let clashSide: 'a' | 'b' = 'a';
function clashWon() {
  const c = World.clashHit;
  if (!c) return;
  const ally = clashSide === 'a' ? c.a : c.b;
  World.endClash(c, clashSide);
  // наград нет — чтобы стычки нельзя было «фармить»; остаются только слова и память сторон
  World.clashReward = ally.kind === 'loyal'
    ? { text: 'Офицер старой гвардии опускает дымящуюся винтовку и снимает фуражку перед Артуром. — Спасибо, господин. — Лоялисты забирают у братьев патроны — себе, до последнего — и исчезают в ельнике. На тракте остаются красные повязки в грязи — теперь и за вами будут охотиться по спискам.', give: () => { G.flags.svobodaWanted = true; } }
    : ally.name === 'Патруль Олдриджа' ? { text: 'Сержант переворачивает мёртвых сапогом и обшаривает карманы раньше, чем вы успеваете отдышаться. — Подсобили. — Солдаты спорят из-за чьих-то часов, стаскивают с убитых сапоги и ремни. Один поднимает на вас глаза: в них не благодарность — прикидка, нет ли и у вас чего. — Пошли, — бросает сержант, и патруль уходит, звеня чужим добром.', give: () => {} }
    : { text: `Сержант вытирает лицо рукавом и долго смотрит на вас. — Подсобили. ${ally.name} такого не забывает. — Солдаты молча собирают оружие убитых и уходят по дороге.`, give: () => {} };
  Dialog.start('after_clash');
}

// ---------------------------------------------------------------- опыт и уровни
let levelPending = false; // новый уровень: показать окно (выбор таланта), когда освободится экран
function gainXp(n: number) {
  const c = G.pc, b = G.squad[0];
  if (!c || !b || n <= 0 || c.level >= MAX_LEVEL) return;
  c.xp += n;
  let up = false;
  while (c.level < MAX_LEVEL && c.xp >= LEVEL_XP[c.level]) { c.level++; up = true; }
  if (up) { refreshLeader(c, b); applyEquipLooks(G.squad); levelPending = true; toast(`Новый уровень: ${c.level}!`); refreshHud(); }
}
Dialog.onXp = (n) => gainXp(n);

// ---------------------------------------------------------------- переходы между режимами
// Александр: реакции на крупные форты и край мира (показываются, когда окно разговора свободно)
let alexPending = '';
const ALEX_SCENE: Record<string, string> = { svoboda: 'svoboda', bfort: 'bfort', wf1: 'wfort', fort1: 'fort', fort2: 'fort' };
function alexSee(key: string | undefined) {
  if (!key || !alexIn() || undeadCompanion('alex') || G.flags['alexSaw_' + key]) return; // мертвецу больше ничего не интересно
  G.flags['alexSaw_' + key] = true; alexPending = 'alex_' + key;
}
/** Отданный ведьмам или проданный хирургу Александр «исчезает», когда отряд уходит из сцены. */
function alexLeft(next: string) {
  if (G.flags.alexCoven && next !== 'coven') G.flags.alexCovenGone = true;
  if (G.flags.alexSold && next !== 'fort1') G.flags.alexSoldLeft = true;
}
function alexRemove() {
  G.squad = G.squad.filter((b) => b.id !== 'alex');
  applyEquipLooks(G.squad);
  if (G.mode === 'explore') Explore.enter(Explore.scene, Explore.player);
  refreshHud();
}

function toWorld(fromScene?: string) {
  alexLeft('');
  G.mode = 'world';
  if (fromScene) World.placeAt(fromScene.startsWith('fort') ? 'fortgate' : fromScene);
  World.updateLocation();
  G.keys.clear();
  hint();
  refreshHud();
  if (fromScene) Save.auto(); // автосохранение при выходе на карту
}
function toScene(id: string, at?: { x: number; y: number }) {
  alexLeft(id);
  alexSee(ALEX_SCENE[id]);
  if (id === 'svoboda' && arthurIn() && !undeadCompanion('arthur') && !G.flags.arthurSawUncle) alexPending = 'arthur_svoboda'; // Артур видит повешенного дядю
  if (id === 'coven' && ferglowIn() && !G.flags.ferglowSawCoven && !G.flags.covenDead) alexPending = 'ferglow_coven'; // Ферглоу в восторге от ковена
  if (id === 'richmord' && G.flags.alexDadDenounced) { G.flags.alexDadBeaten = true; if (alexIn() && !undeadCompanion('alex') && !G.flags.alexSawDad) alexPending = 'alex_dad_seen'; } // донос сделал своё: на следующий заход отец избит
  G.mode = 'explore';
  if (!G.flags['visited_' + id]) gainXp(XP.scene); // первый визит
  G.flags['visited_' + id] = true;
  Explore.enter(id, at);
  G.keys.clear();
  hint();
  refreshHud();
  Save.auto(); // и при входе в сцену
}
function hint() {
  if (G.mode === 'world') $('hint').textContent = 'Клик — идти · клик по месту — войти · WASD — идти · E — войти рядом · Q — лечение и лагерь · I — снаряжение · C — персонаж · O — оккультизм · M — карта · Esc — меню';
  else exploreHint();
}

// ---------------------------------------------------------------- бой
Combat.hooks = {
  panel: combatPanel,
  log: combatLog,
  toast,
  victory(id) {
    combatShow(false);
    { const xp = Combat.units.filter((u) => u.team === 'enemy').reduce((s, u) => s + enemyXp(u.base.maxHp, Math.max(u.base.atkM, u.base.atkR)), 0); if (xp) { toast(`Победа: +${xp} опыта`); gainXp(xp); } }
    G.mode = returnMode;
    hint();
    if (id === 'ruins') { G.flags.scavDone = true; Dialog.start('after_scav'); }
    if (id === 'clash') clashWon();
    if (id.startsWith('band_')) {
      const kinds = id.slice(5).split('+');
      World.bandLoot = kinds.length; World.bandKinds = kinds; World.bandFac = kinds.some((k) => k.startsWith('deserter')) ? 'deserter' : 'bandit'; World.killBand();
      // трофей: иногда — оружие одного из бандитов, обычно потрёпанное
      const TROPHY: Record<string, string> = { bandit_gun: 'rifle', bandit_shot: 'sawnoff', bandit_axe: 'axe', bandit_boss: 'revolver', deserter: 'rifle', deserter_sapper: 'spade', deserter_sgt: 'revolver', deserter_mg: 'mg' };
      const k = TROPHY[kinds[Math.floor(Math.random() * kinds.length)]];
      World.bandTrophy = k && Math.random() < 0.45 ? k + (Math.random() < 0.25 ? '~b' : '~w') : '';
      Dialog.start('after_band');
    }
    if (id.startsWith('hungry')) { World.killHungry(); Dialog.start('after_hungry'); }
    if (id === 'lake') { World.killDemon(); Dialog.start('after_demon'); }
    if (id.startsWith('loyal')) { World.killLoyal(); Dialog.start('after_loyal'); }
    if (id === 'coven') Dialog.start('after_coven');
    if (id.startsWith('dsq_')) { World.killDsq(); Dialog.start('after_dsq'); }
    if (id.startsWith('dsqh_')) { World.killDsq(); Dialog.start('after_cult'); }
    if (id === 'revo') { World.beatRevo(); Dialog.start('after_revo'); }
    if (id === 'ivy') Dialog.start('after_ivy');
    if (id.startsWith('trench')) { World.killDead(); World.deadHit = null; Dialog.start('after_dead'); }
    if (Combat.wearNotes.length) toast(Combat.wearNotes.join(' '));
    refreshHud();
  },
  defeat(id) {
    // отступления нет: бой заново, загрузка сохранения или главное меню
    const cap = id === 'coven' ? 'Ведьмы принесли вас в жертву'
      : id === 'lake' ? 'Морской демон утащил вас вглубь бездны'
      : id.startsWith('trench') ? 'Мертвецы теперь будут лакомиться вашей плотью'
      : id.startsWith('dsqh_') ? 'Культ отдал вас демонам'
      : id === 'revo' ? 'Братья свободы повесили вас на площади — рядом с бароном'
      : id === 'ivy' ? 'Айви не промахнулась'
      : 'Ещё одна душа сгинула под взглядом Ока';
    const last = Save.latest();
    screen(
      `<img class="death-img" src="${frameUrl('death')}" alt=""><div class="death-cap">${tr(cap)}</div>`,
      [
        { label: 'Повторить бой', fn: () => { hideScreen(); restoreSnapshot(); startBattle(id); } },
        ...(last ? [{ label: 'Загрузить сохранение', fn: () => { hideScreen(); combatShow(false); loadGame(last); } }] : []),
        { label: 'В главное меню', fn: () => { hideScreen(); combatShow(false); showTitle(); } },
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
World.onClash = () => Dialog.start('clash');
World.onArrive = (l) => { if (l.id === 'deadend') alexSee('deadend'); Dialog.start(l.talk); };
World.onEncounter = () => Dialog.start(World.bandHit?.fac === 'deserter' ? 'enc_deserters' : 'enc_band');
// ---------------------------------------------------------------- отладка (F2)
Debug.load();
Debug.weathers = WEATHER_ORDER.map((k) => ({ id: k, name: WEATHER_NAMES[k] }));
Debug.onSpawn = () => { applyEquipLooks(G.squad); refreshHud(); if (Inventory.open) Inventory.render(); }; // и протезы видны на фигурке сразу
Debug.onWeather = (k) => { if (k === 'auto') Weather.locked = false; else Weather.set(k as typeof WEATHER_ORDER[number], true); refreshHud(); };
Debug.places = LOCS.map((l) => ({ id: l.id, name: l.name, group: l.x > 2200 ? 'Восток: Траншейное море' : l.y > 1280 ? 'Юг: земли Винферда' : l.y < 0 ? 'Север: земли Собрания' : l.x < -900 ? 'Земли Леди Харрингтон' : l.x < 120 ? 'Поле сражений' : 'Земли Олдриджа' }));
Debug.onTeleport = (id) => {
  if (G.mode === 'combat' || G.mode === 'title' || G.mode === 'create') { toast('Телепорт — только на карте или в сцене'); return; }
  const l = LOCS.find((x) => x.id === id)!;
  if (Dialog.active) Dialog.close();
  if (l.kind === 'poi' || l.hidden) G.flags['found_' + l.id] = true;
  toWorld();
  World.party.x = World.party.tx = l.x; World.party.y = World.party.ty = l.y + (l.kind === 'fort' ? 60 : 30);
  World.party.moving = false; World.pending = null;
  World.updateLocation(); World.discover(); refreshHud();
  toast(`Телепорт: ${l.name}`);
};
World.onRevo = () => Dialog.start('revo_arthur');
World.onRat = (msg) => toast(msg);
// отладка: взять спутника в отряд или убрать (флаги вербовки — как при обычной вербовке)
Debug.companions = [{ id: 'alex', name: 'Александр' }, { id: 'arthur', name: 'Артур Сильвер' }, { id: 'ivy', name: 'Айви Гримшоу' }, { id: 'ferglow', name: 'Уильям Ферглоу' }];
const JOINED: Record<string, string> = { alex: 'alexJoined', arthur: 'arthurJoined', ivy: 'ivyJoined', ferglow: 'ferglowJoined' };
Debug.onCompanion = (id) => {
  if (G.squad.some((b) => b.id === id)) { // убрать — и вернуть на его место в мире (можно снова позвать обычным путём)
    G.squad = G.squad.filter((b) => b.id !== id); G.flags[JOINED[id]] = false;
    applyEquipLooks(G.squad); if (G.mode === 'explore') Explore.enter(Explore.scene, Explore.player); refreshHud(); return;
  }
  G.flags[JOINED[id]] = true;
  Dialog.onAction('recruit_' + id);
};
World.onPatrol = (owner) => (World.hunts(owner) ? (World.revoHit = World.patrolNear(World.party, 60), World.onRevo(owner)) : Dialog.start(owner === 'baroness' ? 'enc_bpatrol' : owner === 'revo' ? 'enc_revo' : owner === 'winford' ? 'enc_wfpatrol' : owner === 'wfcar' ? 'enc_wfcar' : 'enc_patrol'));
World.onLoyal = () => Dialog.start(arthurIn() ? 'loyal_arthur' : 'enc_loyal');
World.onDsq = () => Dialog.start(World.dsqHit?.hell ? 'enc_cult' : 'enc_dsq');
World.onDiscover = (l) => { const n = l.kind === 'poi' ? XP.poi : XP.place; toast(`Замечено: ${l.name} (+${n} опыта)`); gainXp(n); };
World.onDead = () => Dialog.start(World.deadHit?.hell ? 'enc_hdead' : 'enc_dead');
World.onHungry = () => Dialog.start('enc_hungry');
World.onDemon = () => Dialog.start('enc_demon');
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
  setTimeout(() => Save.auto(), 0); // и автосохранение
  fleshCare();
  // Ферглоу на вторые сутки в отряде (если есть кого «улучшать») заводит разговор о ритуале
  if (ferglowIn() && !G.flags.ferglowOffered && G.squad.some((b) => ['alex', 'arthur', 'ivy'].includes(b.id) && !undeadCompanion(b.id))) { if (G.flags.ferglowDay) alexPending = 'ferglow_offer'; else G.flags.ferglowDay = true; }
  if (Debug.noHunger) { refreshHud(); return; } // отладка: голода нет
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
  else if (act === 'recruit_alex') { if (!G.squad.some((s) => s.id === 'alex')) { G.squad.push(makeAlex()); applyEquipLooks(G.squad); if (G.mode === 'explore') Explore.enter(Explore.scene, Explore.player); toast('Александр в отряде'); refreshHud(); } }
  else if (act === 'alex_to_coven' || act === 'alex_sold') alexRemove();
  else if (act.startsWith('talent:')) { const c = G.pc, t = classTalent(act.slice(7)); if (c && t && pendingTalent(c)?.some((x) => x.id === t.id)) { (c.classTalents ??= []).push(t.id); refreshLeader(c, G.squad[0]); toast(`Талант: ${t.name}`); refreshHud(); if (pendingTalent(c) || pendingMove(c)) levelPending = true; } }
  else if (act.startsWith('move:')) { const c = G.pc, k = act.slice(5); if (c && COURAGE[k] && pendingMove(c)?.includes(k)) { c.courageMoves = [...knownMoves(c), k]; toast(`Приём куража: ${COURAGE[k].name}`); if (pendingTalent(c) || pendingMove(c)) levelPending = true; } }
  else if (act === 'recruit_arthur') { if (!arthurIn()) { G.squad.push(makeArthur()); applyEquipLooks(G.squad); if (G.mode === 'explore') Explore.enter(Explore.scene, Explore.player); toast('Артур Сильвер в отряде'); refreshHud(); } }
  else if (act === 'recruit_ivy') { if (!ivyIn()) { G.squad.push(makeIvy()); applyEquipLooks(G.squad); if (G.mode === 'explore') Explore.enter(Explore.scene, Explore.player); toast('Айви Гримшоу в отряде'); refreshHud(); } }
  else if (act.startsWith('undead:')) { // ритуал Ферглоу: спутник становится мертвецом — крепче и бесстрашен, но без души
    const id = act.slice(7), b = G.squad.find((x) => x.id === id);
    if (b) { alexPending = 'undead_react'; G.flags.ritualDone = true; G.flags['undead_' + id] = true; b.kind = id + '_dead'; b.maxHp += 4; b.hp = b.maxHp; b.horror = 99; b.def -= 1; b.move = Math.max(3, b.move - 1); if (id === 'ivy') b.med = 1; applyEquipLooks(G.squad); if (G.mode === 'explore') Explore.enter(Explore.scene, Explore.player); refreshHud(); }
  }
  else if (act === 'ivy_leave') { G.squad = G.squad.filter((b) => b.id !== 'ivy'); G.flags.ivyJoined = false; applyEquipLooks(G.squad); if (G.mode === 'explore') Explore.enter(Explore.scene, Explore.player); refreshHud(); toast('Айви ушла из отряда'); } // вернулась в Лимбридж — с мертвецом не вступит
  else if (act === 'ivy_raise') { if (!ivyIn()) G.squad.push(makeIvy()); G.flags.ivyDead = false; Dialog.onAction('undead:ivy'); } // Ферглоу поднимает убитую Айви
  else if (act === 'battle_ivy') { G.squad = G.squad.filter((b) => b.id !== 'ivy'); applyEquipLooks(G.squad); refreshHud(); startBattle('ivy'); }
  else if (act === 'recruit_ferglow') { if (!ferglowIn()) { G.squad.push(makeFerglow()); applyEquipLooks(G.squad); if (G.mode === 'explore') Explore.enter(Explore.scene, Explore.player); toast('Уильям Ферглоу в отряде'); refreshHud(); } }
  else if (act === 'ivy_betray') { G.squad = G.squad.filter((b) => b.id !== 'ivy'); applyEquipLooks(G.squad); World.spareRevo(48); if (G.mode === 'explore') Explore.enter(Explore.scene, Explore.player); refreshHud(); }
  else if (act === 'ivy_gone') { if (G.mode === 'explore') Explore.enter(Explore.scene, Explore.player); }
  else if (act === 'arthur_betray') { G.squad = G.squad.filter((b) => b.id !== 'arthur'); applyEquipLooks(G.squad); World.spareRevo(48); refreshHud(); }
  else if (act === 'revo_spare') World.spareRevo(24);
  else if (act === 'revo_spare_short') World.spareRevo(8);
  else if (act === 'battle_revo') startBattle('revo');
  else if (act === 'clash_a' || act === 'clash_b') { // вступить в стычку на стороне a или b
    const c = World.clashHit;
    if (c) {
      const ally = act === 'clash_a' ? c.a : c.b, foe = act === 'clash_a' ? c.b : c.a;
      CLASH.allies = ally.units.slice(); CLASH.enemies = foe.units.slice(); CLASH.forest = ally.kind === 'loyal' || foe.kind === 'loyal';
      CLASH.title = `Стычка: вы с союзниками (${ally.name}) против — ${foe.name}`;
      clashSide = act === 'clash_a' ? 'a' : 'b';
      startBattle('clash');
    }
  }
  else if (act === 'alex_grown') { G.flags.alexGrown = true; const b = G.squad.find((x) => x.id === 'alex'); if (b) { b.maxHp += 2; b.hp += 2; b.atkM += 1; b.atkR += 1; } refreshHud(); }
  else if (act === 'battle_band') startBattle('band_' + (World.bandHit?.kinds.join('+') ?? 'bandit_gun+bandit_axe'));
  else if (act === 'band_calm') World.calmBand(24);
  else if (act === 'band_lose') World.calmBand(8);
  else if (act === 'battle_dead') { const g = World.deadHit; startBattle(g?.hell ? 'trench+' + g.kinds.join('+') : g?.id ?? 'trench1'); }
  else if (act === 'battle_trench_poi') { World.deadHit = null; startBattle('trench2'); }
  else if (act === 'battle_hell_poi') { World.deadHit = null; startBattle('trench+dead_soldier+dead_storm+dead_rifle+dead_gren'); }
  else if (act === 'dead_lose') World.calmDead(8);
  else if (act === 'battle_demon') startBattle('lake');
  else if (act === 'demon_lose') World.calmDemon(12);
  else if (act === 'battle_hungry') startBattle('hungry' + (World.hungryHit?.kinds.length ?? 2));
  else if (act === 'hungry_calm') World.calmHungry(48);
  else if (act === 'battle_coven') startBattle('coven');
  else if (act === 'battle_dsq') startBattle((World.dsqHit?.hell ? 'dsqh_' : 'dsq_') + (World.dsqHit?.kinds.join('+') ?? 'imp+hound'));
  else if (act === 'dsq_calm') World.calmDsq(48);
  else if (act === 'dsq_lose') World.calmDsq(8);
  else if (act === 'battle_loyal') startBattle('loyal' + (World.loyalHit?.kinds.length ?? 2));
  else if (act === 'loyal_calm') World.calmLoyal(72);
  else if (act === 'loyal_lose') World.calmLoyal(10);
  else if (act === 'hungry_lose') World.calmHungry(6);
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
    onContinue: Save.latest() ? () => loadGame(Save.latest()!) : undefined,
    onNew: () => { G.mode = 'create'; openCreation(layer, newGame, showTitle); },
    onQuick: (prof) => newGame(quickCharacter(prof), false),
    onRules: () => openRules(layer, showTitle),
    onAbout: () => showAbout(layer, showTitle),
  });
}

/** Загрузка: та же подготовка, что у новой игры, затем — сохранённое состояние поверх. */
function loadGame(slot: Slot) {
  const d = Save.read(slot);
  if (!d) { toast('Сохранение не найдено'); return false; }
  layer.replaceChildren();
  if (Dialog.active) Dialog.close();
  resetGame(d.g.pc!);
  Object.assign(G, d.g);
  Weather.reset();
  resetShops();
  setPcStyle(G.pc!);
  applyEquipLooks(G.squad);
  Explore.init();
  World.init();
  Save.applyWorld(d);
  hideScreen();
  $('hud').classList.remove('hidden');
  if (d.mode === 'explore' && d.scene) toScene(d.scene, d.at ?? undefined);
  else toWorld();
  toast(slot === 'manual' ? 'Игра загружена' : 'Загружено автосохранение');
  return true;
}

function newGame(pc: Character, intro = true) {
  layer.replaceChildren();
  resetGame(pc);
  Weather.reset();
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
  if (e.code === 'F2') { e.preventDefault(); if (G.mode !== 'title' && G.mode !== 'create') Debug.toggle(); return; }
  // быстрое сохранение и загрузка
  if (e.code === 'F5') { e.preventDefault(); if (Dialog.active || !Save.write('manual')) toast('Сейчас сохраниться нельзя'); else toast('Игра сохранена'); return; }
  if (e.code === 'F9') { e.preventDefault(); if (G.mode !== 'create' && Save.meta('manual')) { Pause.close(); combatShow(false); loadGame('manual'); } else toast('Нет ручного сохранения'); return; }
  if (Pause.open) { if (e.code === 'Escape') Pause.close(); return; }
  // Esc вне окон — меню паузы (в бою: сначала отменяет выбранное действие)
  const anyWindow = MapWin.open || Dialog.active || Trade.open || ProsthShop.open || OccultMenu.open || Inventory.open || Sheet.open || squadOpen() || !!$('screen').innerHTML;
  if (e.code === 'Escape' && !anyWindow && (roaming() || G.mode === 'combat')) {
    const sel = Combat.sel, plain = !Combat.magic && (!sel || (Combat.action.type === 'w' && Combat.action.key === sel.weapons[0]));
    if (G.mode !== 'combat' || plain) { G.keys.clear(); Pause.show(() => { combatShow(false); showTitle(); }, { load: (s) => { combatShow(false); loadGame(s); } }); return; }
  }
  if (MapWin.open) { if (e.code === 'Escape' || e.code === 'KeyM') MapWin.close(); else { e.preventDefault(); MapWin.key(e.code, true); } return; }
  if (e.code === 'KeyM' && roaming() && !Dialog.active && !Trade.open && !ProsthShop.open && !OccultMenu.open && !Inventory.open && !Sheet.open && !squadOpen()) {
    G.keys.clear(); MapWin.show(() => { refreshHud(); hint(); }); return;
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
window.addEventListener('keyup', (e) => { G.keys.delete(e.code); if (MapWin.open) MapWin.key(e.code, false); });
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
  if (alexPending && free && (G.mode === 'explore' || G.mode === 'world')) { const d = alexPending; alexPending = ''; Dialog.start(d); }
  else if (levelPending && free && (G.mode === 'explore' || G.mode === 'world')) { levelPending = false; Dialog.start('levelup'); }
  if (G.mode === 'explore' && free) Explore.update(dt);
  if (G.mode === 'world' && free) World.update(dt);
  if (G.mode === 'combat') { Combat.update(dt); Combat.draw(ctx, G.time); }
  else if (G.mode === 'title' || G.mode === 'create') drawMenuBg(ctx, G.time);
  else if (G.mode === 'world') World.draw(ctx, G.time);
  else Explore.draw(ctx, G.time);
  if (G.mode === 'world' && (hudT += dt) > 0.5) { hudT = 0; refreshHud(); }
  Music.update(dt, G.mode === 'combat', G.mode === 'title' || G.mode === 'create');
  // зловещий туман — только в самом ковене и в бою там
  Weather.omen = (G.mode === 'explore' && Explore.scene === 'coven') || (G.mode === 'combat' && Combat.def?.id === 'coven');
  if (G.mode !== 'title' && G.mode !== 'create') Weather.update(dt); // в бою — боевая тема, иначе мирные
  requestAnimationFrame(frame);
}

// быстрый старт для тестов: ?quick (солдат) или ?quick=medic
const quick = new URLSearchParams(location.search).get('quick');
if (quick !== null) newGame(quickCharacter(PROF_ORDER.includes(quick as ProfId) ? (quick as ProfId) : 'soldier'), false);
else showTitle();
requestAnimationFrame(frame);

// отладка: ?debug в адресе даёт доступ к состоянию из консоли
if (new URLSearchParams(location.search).has('debug')) {
  (window as any).morgulis = { G, Combat, Explore, World, Dialog, startBattle, newGame, newCharacter, openSquad, Inventory, Trade, Sheet, Music, Pause, ProsthShop, OccultMenu, Debug, Weather, charSprite, toScene, toWorld };
}
