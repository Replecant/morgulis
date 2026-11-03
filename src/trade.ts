// ============================================================
//  Торговля за шиллинги. Покупка по цене, продажа — за половину.
//  У каждого торговца свой ассортимент; вещи — ограниченный запас,
//  расходники продаются пачками без ограничений.
// ============================================================
import { G } from './state';
import { CONSUMABLES, CONS_ORDER, ConsId, sellPrice, KIND_NAMES, itemStatLines, itemOf, itemName, itemPrice, condOf, withCond, repairPrice, itemWt, CONS_WT } from './items';
import { load, capacity, overload, LOAD_NAME, fmtKg } from './load';
import { drawItemIcon, KIND_COLOR } from './inventory';
import { h } from './book';
import { $, keepScroll } from './util';
import { withFrame } from './frames';

interface Shop { name: string; greet: string; items: Record<string, number>; cons: ConsId[]; repair?: boolean } // repair — чинит оружие

export const SHOPS: Record<string, Shop> = {
  // ---------------- деревни: провиант и немного своего товара
  oldos: {
    name: 'Олдос — склад разъезда', greet: 'Пайки, бинты, кое-что из тряпья. Остальное — в форт, там и покупай.',
    items: { knife: 1, clothes: 1, cap: 1 },
    cons: ['ration', 'bandage'],
  },
  hob: {
    name: 'Хоб — лавка при бойне', greet: 'Мясо и панцирь. Всё своё, ричмордское.',
    items: { chitin: 1, leather: 1 },
    cons: ['ration'],
  },
  agnes: {
    name: 'Агнес — грибная аптека', greet: 'Бинты, грибная настойка, сушёные шляпки в дорогу. Городских порошков не держим.',
    items: { wormwood: 1 },
    cons: ['ration', 'bandage', 'painkiller'],
  },
  abe: {
    name: 'Слепой Эйб — старые вещи', greet: 'Руками трогай, глазами не верь. Тут всё настоящее.',
    items: { ritualkit: 2, rabbitfoot: 1, locket: 1, oillamp: 1, tophat: 1, 'revolver~w': 1 },
    cons: [],
  },
  // ---------------- земли Леди Харрингтон
  brimmor: {
    name: 'Скупщица — Бриммор', greet: 'Рыба солёная и копчёная. В дорогу — лучше не придумаешь.',
    items: { knife: 1 },
    cons: ['ration', 'bandage'],
  },
  // ---------------- Траншейный Ад
  volnitsa: {
    name: 'Барыга — Вольница', greet: 'С чужого плеча, без вопросов. Сломанное — дешевле, целое — дороже, краденое — как повезёт.',
    items: { sawnoff: 1, 'revolver~w': 1, 'rifle~w': 1, 'carbine~b': 1, trenchclub: 1, knife: 1, leather: 1, smask: 1, lockpicks: 1, oillamp: 1 },
    cons: ['ammo_pistol', 'ammo_rifle', 'ammo_shell', 'dynamite', 'ration', 'bandage', 'painkiller'],
  },
  post314: {
    name: 'Каптенармус — Пост 314', greet: 'Старое имперское снаряжение. Каждая вещь — по ведомости, каждая пуговица учтена.',
    items: { rifle: 1, 'rifle~w': 1, bayonet: 2, spade: 1, steelhelm: 1, helmet: 2, gasmask: 1, greatcoat: 2, boots: 1, 'mg~w': 1 },
    cons: ['ammo_rifle', 'ammo_mg', 'grenade', 'filter', 'ration', 'bandage', 'antiseptic'], repair: true,
  },
  hailstone: {
    name: 'Скупщик лома — Хейлстоун', greet: 'Всё, что звенит, — ко мне. Кое-что из найденного продам.',
    items: { helmet: 1, tools: 1, ctools: 1, gauges: 1, smask: 1, spade: 1, 'carbine~w': 1, 'rifle~w': 1, 'mg~b': 1 },
    cons: ['parts', 'ration', 'ammo_rifle'], repair: true,
  },
  mossley: {
    name: 'Ровена — Мосслей', greet: 'Сушёные грибы, вяленое жучье мясо, настойка от боли.',
    items: { wormwood: 1 },
    cons: ['ration', 'painkiller'],
  },
  bquarter: {
    name: 'Интендант — форт Леди Харрингтон', greet: 'Казённое снаряжение. Каждая вещь — по ведомости.',
    items: { rifle: 2, carbine: 2, bayonet: 2, spade: 2, helmet: 2, steelhelm: 1, greatcoat: 2, quilted: 1, boots: 1, gloves: 1, goggles: 1, oillamp: 1 },
    cons: ['ammo_rifle', 'ammo_pistol', 'ammo_mg', 'grenade', 'ration', 'bandage', 'medkit'], repair: true,
  },
  // ---------------- юг: земли Винферда
  greywell: { name: 'Контора промысла — Грейвелл', greet: 'По накладной и с квитанцией. Иначе — никак.', items: { wrench: 1, gloves: 1, goggles: 1, oillamp: 1 }, cons: ['parts', 'ration', 'filter', 'bandage'], repair: true },
  bramley: { name: 'Старший погонщик — Брэмли', greet: 'Мясо, панцирь — всё с номером.', items: { chitin: 2 }, cons: ['ration'] },
  willowbrook: { name: 'Староста — Уиллоубрук', greet: 'Рыба вяленая, грибы сушёные, настойка от боли.', items: { wormwood: 1 }, cons: ['ration', 'painkiller'] },
  ironcliff: { name: 'Штейгер — Айронклифф', greet: 'Каски, инструмент, патроны со склада. Всё казённое — с клеймом.', items: { helmet: 2, tools: 1, boots: 1, hammer: 1, oillamp: 2, goggles: 1 }, cons: ['parts', 'ammo_rifle', 'dynamite', 'ration'], repair: true },
  wf_market: { name: 'Торговые ряды — форт Винферда', greet: 'Лучший выбор по эту сторону пустоши. Ценники, клейма, квитанции.', items: { rifle: 1, carbine: 1, huntrifle: 1, revolver: 1, autopistol: 1, pumpshot: 1, mg: 1, greatcoat: 1, quilted: 1, leather: 1, steelhelm: 1, boots: 2, gloves: 1, gasmask: 1, smask: 1, goggles: 1, oillamp: 1, elamp: 1, cap: 1 }, repair: true, cons: ['ammo_pistol', 'ammo_rifle', 'ammo_shell', 'ammo_mg', 'grenade', 'dynamite', 'smoke', 'ration', 'bandage', 'medkit', 'antiseptic', 'painkiller', 'filter'] },
  // ---------------- ковен
  coven: { name: 'Старшая ведьма — ковен', greet: 'Бери, что глянется. Платят у нас по-разному — сегодня шиллингами.', items: { ritualkit: 2, grimoire: 1, rdagger: 1, locket: 1, rabbitfoot: 1 }, cons: ['painkiller', 'tissue'] },
  // ---------------- знахари
  wise_fen: { name: 'Шептунья — Фенмор', greet: 'Ладанки от дурного глаза, лапки на удачу, отвар от боли. Остальное — сам.', items: { wormwood: 2, rabbitfoot: 1 }, cons: ['painkiller', 'bandage'] },
  wise_moss: { name: 'Знахарь — Мосслей', greet: 'Обереги, травы, нитки с узлами. Бери, пока никто не видит.', items: { wormwood: 1, rabbitfoot: 1, ritualkit: 1 }, cons: ['painkiller'] },
  wise_wood: { name: 'Лесная знахарка — Вудхэм', greet: 'Смола, мох, корешки да ладанки. Что лес дал — то и продам.', items: { wormwood: 2, locket: 1 }, cons: ['painkiller', 'bandage'] },
  // ---------------- север
  svoboda: {
    name: 'Пункт распределения — форт Свобода', greet: 'Без карточки — за шиллинги. Бери и уходи.',
    items: { clothes: 1, cap: 1, trenchclub: 1, 'carbine~w': 1 },
    cons: ['ration', 'bandage', 'filter'],
  },
  hawley: {
    name: 'Староста Хоули', greet: 'Вяленое жучье мясо. Панцирь — что осталось после разнарядки.',
    items: { chitin: 1 },
    cons: ['ration'],
  },
  woodham: {
    name: 'Бригадир — Вудхэм', greet: 'Похлёбка, бинты да топор. Больше ничего лишнего.',
    items: { axe: 1, gloves: 1 },
    cons: ['ration', 'bandage'],
  },
  tarwell: {
    name: 'Старший нефтяник — Тарвелл', greet: 'Пайки по норме. Фильтры для противогазов — из старых запасов.',
    items: { goggles: 1, smask: 1 },
    cons: ['ration', 'filter'],
  },
  // ---------------- форт
  clinic: {
    name: 'Клиника — аптечный шкаф', greet: 'Лекарства, инструменты, противогазы. За порошки из форта платят шиллингами, а не грибами.',
    items: { gasmask: 1, surgerykit: 1 },
    cons: ['bandage', 'medkit', 'antiseptic', 'painkiller', 'filter'],
  },
  market: {
    name: 'Торговец — рынок Среднего города', greet: 'Лучший товар в округе. Цены — тоже лучшие. Для меня.',
    items: { revolver: 1, autopistol: 1, carbine: 1, rifle: 1, huntrifle: 1, shotgun2: 1, pumpshot: 1, mg: 1, saber: 1, hammer: 1, trenchclub: 1, spade: 1, greatcoat: 1, gloves: 1, boots: 1, apron: 1, tools: 1, lockpicks: 1, grimoire: 1, helmet: 2, steelhelm: 1, smask: 1, goggles: 1, quilted: 1, cuirass: 1, sapper: 1, greaves: 1, shootgloves: 1, oillamp: 1, elamp: 1, flamer: 1, exprifle: 1, 'shotgun2~w': 1 },
    cons: ['ammo_pistol', 'ammo_rifle', 'ammo_shell', 'ammo_mg', 'grenade', 'dynamite', 'smoke', 'parts', 'ration'], repair: true,
  },
};

const stock: Record<string, Record<string, number>> = {};
export function resetShops() { for (const k in SHOPS) stock[k] = { ...SHOPS[k].items }; }
/** Запас торговцев — для сохранения. */
export const getStock = () => stock;
export function setStock(s: Record<string, Record<string, number>>) { for (const k in SHOPS) stock[k] = { ...(s[k] ?? SHOPS[k].items) }; }
resetShops();

export const Trade = {
  open: false,
  shop: '',
  note: '',
  onClose: () => {},

  show(shop: string, onClose: () => void) {
    this.open = true; this.shop = shop; this.onClose = onClose; this.note = SHOPS[shop].greet;
    this.render();
    withFrame('trade', $('trade'), () => { if (this.open) $('trade').classList.remove('hidden'); });
  },
  close() { this.open = false; $('trade').classList.add('hidden'); this.onClose(); },

  buyItem(id: string) {
    const st = stock[this.shop], price = itemPrice(id);
    if (!st[id]) return;
    if (G.money < price) { this.note = `Не хватает шиллингов: нужно ${price}.`; return this.render(); }
    G.money -= price; st[id]--; G.stash.push(id);
    this.note = `Куплено: ${itemName(id)} за ${price} ш.`;
    this.render();
  },
  repairItem(idx: number) {
    const id = G.stash[idx], p = repairPrice(id);
    if (!p || G.money < p) return;
    G.money -= p; G.stash[idx] = withCond(id, 'ok');
    this.note = `Починено: ${itemOf(id).name} — снова в идеальном состоянии. (−${p} ш.)`;
    this.render();
  },
  buyCons(id: ConsId) {
    const c = CONSUMABLES[id];
    if (G.money < c.price) { this.note = `Не хватает шиллингов: нужно ${c.price}.`; return this.render(); }
    G.money -= c.price; G.supplies[id] += c.pack;
    this.note = `Куплено: ${c.name}${c.pack > 1 ? ` ×${c.pack}` : ''} за ${c.price} ш.`;
    this.render();
  },
  sellItem(idx: number) {
    const id = G.stash[idx], p = sellPrice(itemPrice(id));
    G.stash.splice(idx, 1); G.money += p;
    stock[this.shop][id] = (stock[this.shop][id] ?? 0) + 1;
    this.note = `Продано: ${itemName(id)} за ${p} ш.`;
    this.render();
  },
  sellCons(id: ConsId) {
    const c = CONSUMABLES[id], p = sellPrice(c.price);
    if (G.supplies[id] < c.pack) return;
    G.supplies[id] -= c.pack; G.money += p;
    this.note = `Продано: ${c.name}${c.pack > 1 ? ` ×${c.pack}` : ''} за ${p} ш.`;
    this.render();
  },

  render() {
    const shop = SHOPS[this.shop], st = stock[this.shop];
    const icon = (key: string, color?: string) => {
      const cv = h('canvas', { width: 36, height: 36, class: 'ticv', style: color ? `border-color:${color}` : '' });
      drawItemIcon(cv.getContext('2d')!, key, 36);
      return cv;
    };
    const info = h('div', { class: 'tinfo' }, this.note);
    const hover = (el: HTMLElement, lines: string[]) => {
      el.onmouseenter = () => { info.replaceChildren(...lines.map((l, i) => h('div', { class: i ? '' : 'b' }, l))); };
      el.onmouseleave = () => { info.textContent = this.note; };
      return el;
    };
    const row = (ic: HTMLElement, name: string, sub: string, price: string, btn: string, fn: (() => void) | null, lines: string[]) =>
      hover(h('div', { class: 'trow' }, ic, h('div', { class: 'tn' }, h('b', {}, name), h('span', {}, sub)), h('div', { class: 'tp' }, price),
        h('button', { class: 'btn', disabled: !fn, onclick: fn ?? undefined }, btn)), lines);

    const buy: HTMLElement[] = [];
    for (const id of shop.cons) {
      const c = CONSUMABLES[id];
      buy.push(row(icon(c.icon), c.name + (c.pack > 1 ? ` ×${c.pack}` : ''), `у вас: ${G.supplies[id]}`, `${c.price} ш.`, 'Купить', G.money >= c.price ? () => this.buyCons(id) : null, [c.name, c.desc, `Вес: ${fmtKg(CONS_WT[id] * c.pack)} кг`]));
    }
    for (const [id, n] of Object.entries(st)) {
      if (!n) continue;
      const it = itemOf(id), pr = itemPrice(id);
      buy.push(row(icon(it.icon, KIND_COLOR[it.kind]), itemName(id) + (it.rare ? ' ★' : ''), `${KIND_NAMES[it.kind]} · осталось ${n}`, `${pr} ш.`, 'Купить', G.money >= pr ? () => this.buyItem(id) : null, [itemName(id), it.desc, ...itemStatLines(id)]));
    }
    const sell: HTMLElement[] = [];
    G.stash.forEach((id, idx) => {
      const it = itemOf(id), p = sellPrice(itemPrice(id)), rp = shop.repair ? repairPrice(id) : 0;
      if (rp) sell.push(row(icon(it.icon, KIND_COLOR[it.kind]), `Починить: ${it.name}`, condOf(id) === 'broken' ? 'сломано' : 'изношено', `${rp} ш.`, 'Починить', G.money >= rp ? () => this.repairItem(idx) : null, [itemName(id), 'Мастер приведёт оружие в идеальное состояние.', `Починка: ${rp} ш.`]));
      sell.push(row(icon(it.icon, KIND_COLOR[it.kind]), itemName(id), KIND_NAMES[it.kind], `${p} ш.`, 'Продать', () => this.sellItem(idx), [itemName(id), it.desc, `Вес: ${fmtKg(itemWt(id))} кг · продажа: ${p} ш.`]));
    });
    for (const id of CONS_ORDER) {
      const c = CONSUMABLES[id];
      if (G.supplies[id] < c.pack) continue;
      const p = sellPrice(c.price);
      sell.push(row(icon(c.icon), c.name + (c.pack > 1 ? ` ×${c.pack}` : ''), `у вас: ${G.supplies[id]}`, `${p} ш.`, 'Продать', () => this.sellCons(id), [c.name, `Продажа: ${p} ш.`]));
    }
    if (!sell.length) sell.push(h('div', { class: 'tempty' }, 'Продавать нечего. Надетые вещи сначала снимите в окне снаряжения.'));

    keepScroll($('trade'), '.tlist', () => $('trade').replaceChildren(h('div', { class: 'trade-box' },
      h('div', { class: 'ttop' }, h('h2', {}, shop.name), h('div', { class: 'tmoney' }, 'Ваши шиллинги: ', h('b', {}, String(G.money)), h('span', { class: 'tload' + (overload() ? ' over' : '') }, ` · ⚖ ${fmtKg(load())} / ${capacity()} кг${overload() ? ' — ' + LOAD_NAME[overload()].toLowerCase() : ''}`)),
        h('button', { class: 'btn', onclick: () => this.close() }, 'Закрыть [Esc]')),
      h('div', { class: 'tcols' },
        h('div', { class: 'tcol' }, h('div', { class: 'th' }, 'Товар'), h('div', { class: 'tlist' }, ...buy)),
        h('div', { class: 'tcol' }, h('div', { class: 'th' }, shop.repair ? 'Ваш обоз — продажа за полцены, починка оружия' : 'Ваш обоз — продажа за полцены'), h('div', { class: 'tlist' }, ...sell))),
      info,
    )));
  },
};
