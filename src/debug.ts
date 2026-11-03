// ============================================================
//  Отладка (F2): бессмертие от голода, невидимость на карте,
//  ускорение передвижения, телепорт, погода; вкладка «Предметы» —
//  выдать в обоз любую вещь (в любом состоянии), расходники, шиллинги.
// ============================================================
import { h } from './book';
import { $ } from './util';
import { G } from './state';
import { ITEMS, CONSUMABLES, CONS_ORDER, KIND_NAMES, ItemKind, withCond, itemName } from './items';

export const Debug = {
  noHunger: false,
  invisible: false,
  speed: 1,            // множитель скорости передвижения (карта и сцены)
  clickTp: false,      // телепорт кликом по карте мира
  open: false,
  onTeleport: (_id: string) => {},
  onWeather: (_k: string) => {},
  onSpawn: () => {},   // обновить HUD и открытые окна после выдачи
  tab: 'main' as 'main' | 'items',
  kind: 'weapon' as ItemKind | 'cons',
  note: '',
  weathers: [] as { id: string; name: string }[],
  places: [] as { id: string; name: string; group: string }[],

  load() {
    try { Object.assign(this, JSON.parse(localStorage.getItem('morgulis.debug') ?? '{}')); } catch { /* нет хранилища */ }
    this.open = false;
  },
  save() {
    try { localStorage.setItem('morgulis.debug', JSON.stringify({ noHunger: this.noHunger, invisible: this.invisible, speed: this.speed, clickTp: this.clickTp })); } catch { /* ничего */ }
  },
  toggle() { this.open ? this.close() : this.show(); },
  show() { this.open = true; this.render(); $('debug').classList.remove('hidden'); },
  close() { this.open = false; $('debug').classList.add('hidden'); },

  /** Выдать предмет в обоз. */
  give(id: string) { G.stash.push(id); this.note = `В обоз: ${itemName(id)}`; this.onSpawn(); this.render(); },
  giveCons(id: keyof typeof CONSUMABLES, n: number) { G.supplies[id] += n; this.note = `${CONSUMABLES[id].name}: +${n} (всего ${G.supplies[id]})`; this.onSpawn(); this.render(); },
  giveMoney(n: number) { G.money += n; this.note = `Шиллинги: +${n} (всего ${G.money})`; this.onSpawn(); this.render(); },

  itemsTab(): HTMLElement[] {
    const kinds: (ItemKind | 'cons')[] = ['weapon', 'head', 'face', 'body', 'hands', 'legs', 'charm', 'tool', 'cons'];
    const KN: Record<string, string> = { ...KIND_NAMES, cons: 'Расходники', tool: 'Спецснаряжение' };
    const chips = h('div', { class: 'dbg-row' }, ...kinds.map((k) =>
      h('button', { class: 'btn' + (this.kind === k ? ' active' : ''), onclick: () => { this.kind = k; this.render(); } }, KN[k])));
    const money = h('div', { class: 'dbg-row' }, 'Шиллинги: ', ...[10, 100, 1000].map((n) => h('button', { class: 'btn', onclick: () => this.giveMoney(n) }, `+${n}`)));
    let rows: HTMLElement[];
    if (this.kind === 'cons') {
      rows = CONS_ORDER.map((id) => { const c = CONSUMABLES[id];
        return h('div', { class: 'dbg-item' }, h('span', {}, `${c.name} `, h('i', {}, String(G.supplies[id]))),
          h('button', { class: 'btn', onclick: () => this.giveCons(id, 1) }, '+1'),
          ...(c.pack > 1 ? [h('button', { class: 'btn', onclick: () => this.giveCons(id, c.pack) }, `+${c.pack}`)] : []),
          h('button', { class: 'btn', onclick: () => this.giveCons(id, 10 * c.pack) }, `+${10 * c.pack}`)); });
    } else {
      rows = Object.values(ITEMS).filter((it) => it.kind === this.kind).map((it) =>
        h('div', { class: 'dbg-item' }, h('span', {}, it.name + (it.rare ? ' ★' : '')),
          h('button', { class: 'btn', title: 'Идеальное', onclick: () => this.give(it.id) }, '+'),
          ...(it.weapon ? [
            h('button', { class: 'btn', title: 'Изношенное', onclick: () => this.give(withCond(it.id, 'worn')) }, 'изн.'),
            h('button', { class: 'btn', title: 'Сломанное', onclick: () => this.give(withCond(it.id, 'broken')) }, 'слом.'),
          ] : [])));
    }
    return [money, chips, h('div', { class: 'dbg-items' }, ...rows), h('div', { class: 'dbg-note' }, this.note || 'Вещи кладутся в обоз отряда (окно снаряжения — I).')];
  },

  render() {
    const flag = (label: string, key: 'noHunger' | 'invisible' | 'clickTp', hint: string) => {
      const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
      cb.checked = this[key];
      cb.onchange = () => { this[key] = cb.checked; this.save(); };
      return h('label', { class: 'dbg-row', title: hint }, cb, ' ', label);
    };
    const speeds = h('div', { class: 'dbg-row' }, 'Скорость: ', ...[1, 2, 4, 8].map((k) =>
      h('button', { class: 'btn' + (this.speed === k ? ' active' : ''), onclick: () => { this.speed = k; this.save(); this.render(); } }, `×${k}`)));
    const groups = [...new Set(this.places.map((p) => p.group))];
    const tp = groups.map((g) => h('div', { class: 'dbg-tpg' }, h('em', {}, g),
      ...this.places.filter((p) => p.group === g).map((p) => h('button', { class: 'btn', onclick: () => this.onTeleport(p.id) }, p.name))));
    const tabs = h('div', { class: 'dbg-tabs' }, ...([['main', 'Общее'], ['items', 'Предметы']] as const).map(([k, label]) =>
      h('button', { class: 'btn' + (this.tab === k ? ' active' : ''), onclick: () => { this.tab = k; this.render(); } }, label)));
    const top = h('div', { class: 'dbg-top' }, h('b', {}, 'Отладка'), h('button', { class: 'btn', onclick: () => this.close() }, '✕ [F2]'));
    if (this.tab === 'items') { $('debug').replaceChildren(h('div', { class: 'dbg-box' }, top, tabs, ...this.itemsTab())); return; }
    $('debug').replaceChildren(h('div', { class: 'dbg-box' },
      top, tabs,
      flag('Не голодать', 'noHunger', 'Пайки не тратятся, голод не отнимает ОЗ.'),
      flag('Невидимость на карте', 'invisible', 'Мародёры и мертвецы не замечают отряд.'),
      speeds,
      flag('Телепорт кликом по карте мира', 'clickTp', 'Клик по глобальной карте переносит отряд в эту точку.'),
      h('div', { class: 'dbg-h' }, 'Погода'),
      h('div', { class: 'dbg-row' }, ...this.weathers.map((w) => h('button', { class: 'btn', onclick: () => this.onWeather(w.id) }, w.name)), h('button', { class: 'btn', onclick: () => this.onWeather('auto') }, 'Сама')),
      h('div', { class: 'dbg-h' }, 'Телепорт к месту'),
      h('div', { class: 'dbg-tp' }, ...tp)));
  },
};
