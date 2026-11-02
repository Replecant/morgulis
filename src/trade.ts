// ============================================================
//  Торговля за шиллинги. Покупка по цене, продажа — за половину.
//  У каждого торговца свой ассортимент; вещи — ограниченный запас,
//  расходники продаются пачками без ограничений.
// ============================================================
import { G } from './state';
import { ITEMS, CONSUMABLES, CONS_ORDER, ConsId, sellPrice, KIND_NAMES, itemStatLines } from './items';
import { drawItemIcon, KIND_COLOR } from './inventory';
import { h } from './book';
import { $ } from './util';
import { withFrame } from './frames';

interface Shop { name: string; greet: string; items: Record<string, number>; cons: ConsId[] }

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
    items: { ritualkit: 2, rabbitfoot: 1, locket: 1 },
    cons: [],
  },
  // ---------------- форт
  clinic: {
    name: 'Клиника — аптечный шкаф', greet: 'Лекарства, инструменты, противогазы. За порошки из форта платят шиллингами, а не грибами.',
    items: { gasmask: 1, surgerykit: 1 },
    cons: ['bandage', 'medkit', 'antiseptic', 'painkiller', 'filter'],
  },
  market: {
    name: 'Торговец — рынок Среднего города', greet: 'Лучший товар в округе. Цены — тоже лучшие. Для меня.',
    items: { revolver: 1, autopistol: 1, rifle: 1, huntrifle: 1, shotgun2: 1, pumpshot: 1, saber: 1, greatcoat: 1, gloves: 1, boots: 1, apron: 1, pouches: 1, tools: 1, lockpicks: 1, grimoire: 1, helmet: 2, quilted: 1, cuirass: 1, sapper: 1, greaves: 1, shootgloves: 1, bandolier: 1, grenadier: 1, flamer: 1, exprifle: 1 },
    cons: ['ammo_pistol', 'ammo_rifle', 'ammo_shell', 'grenade', 'smoke', 'ration'],
  },
};

const stock: Record<string, Record<string, number>> = {};
export function resetShops() { for (const k in SHOPS) stock[k] = { ...SHOPS[k].items }; }
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
    const it = ITEMS[id], st = stock[this.shop];
    if (!st[id]) return;
    if (G.money < it.price) { this.note = `Не хватает шиллингов: нужно ${it.price}.`; return this.render(); }
    G.money -= it.price; st[id]--; G.stash.push(id);
    this.note = `Куплено: ${it.name} за ${it.price} ш.`;
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
    const id = G.stash[idx], it = ITEMS[id], p = sellPrice(it.price);
    G.stash.splice(idx, 1); G.money += p;
    stock[this.shop][id] = (stock[this.shop][id] ?? 0) + 1;
    this.note = `Продано: ${it.name} за ${p} ш.`;
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
      buy.push(row(icon(c.icon), c.name + (c.pack > 1 ? ` ×${c.pack}` : ''), `у вас: ${G.supplies[id]}`, `${c.price} ш.`, 'Купить', G.money >= c.price ? () => this.buyCons(id) : null, [c.name, c.desc]));
    }
    for (const [id, n] of Object.entries(st)) {
      if (!n) continue;
      const it = ITEMS[id];
      buy.push(row(icon(it.icon, KIND_COLOR[it.kind]), it.name + (it.rare ? ' ★' : ''), `${KIND_NAMES[it.kind]} · осталось ${n}`, `${it.price} ш.`, 'Купить', G.money >= it.price ? () => this.buyItem(id) : null, [it.name, it.desc, ...itemStatLines(it)]));
    }
    const sell: HTMLElement[] = [];
    G.stash.forEach((id, idx) => {
      const it = ITEMS[id], p = sellPrice(it.price);
      sell.push(row(icon(it.icon, KIND_COLOR[it.kind]), it.name, KIND_NAMES[it.kind], `${p} ш.`, 'Продать', () => this.sellItem(idx), [it.name, it.desc, `Продажа: ${p} ш.`]));
    });
    for (const id of CONS_ORDER) {
      const c = CONSUMABLES[id];
      if (G.supplies[id] < c.pack) continue;
      const p = sellPrice(c.price);
      sell.push(row(icon(c.icon), c.name + (c.pack > 1 ? ` ×${c.pack}` : ''), `у вас: ${G.supplies[id]}`, `${p} ш.`, 'Продать', () => this.sellCons(id), [c.name, `Продажа: ${p} ш.`]));
    }
    if (!sell.length) sell.push(h('div', { class: 'tempty' }, 'Продавать нечего. Надетые вещи сначала снимите в окне снаряжения.'));

    $('trade').replaceChildren(h('div', { class: 'trade-box' },
      h('div', { class: 'ttop' }, h('h2', {}, shop.name), h('div', { class: 'tmoney' }, 'Ваши шиллинги: ', h('b', {}, String(G.money))),
        h('button', { class: 'btn', onclick: () => this.close() }, 'Закрыть [Esc]')),
      h('div', { class: 'tcols' },
        h('div', { class: 'tcol' }, h('div', { class: 'th' }, 'Товар'), h('div', { class: 'tlist' }, ...buy)),
        h('div', { class: 'tcol' }, h('div', { class: 'th' }, 'Ваш обоз — продажа за полцены'), h('div', { class: 'tlist' }, ...sell))),
      info,
    ));
  },
};
