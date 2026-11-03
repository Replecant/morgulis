// ============================================================
//  Отладка (F2): бессмертие от голода, невидимость на карте,
//  ускорение передвижения, телепорт, погода; вкладка «Предметы» —
//  выдать в обоз любую вещь (в любом состоянии), расходники, шиллинги.
// ============================================================
import { h } from './book';
import { $ } from './util';
import { G } from './state';
import { PROSTHESES, LIMB_ORDER, LIMB_NAMES, ROMAN, fits, install, loseLimb, limbState, modsText, type Limb } from './prosthetics';
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
  tab: 'main' as 'main' | 'items' | 'prosth',
  member: 0,           // вкладка «Протезы»: чей отряд
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

  /** Протезы: у любого бойца отнять часть тела, вернуть её или бесплатно поставить любой подходящий протез. */
  prosthTab(): HTMLElement[] {
    const b = G.squad[Math.min(this.member, G.squad.length - 1)];
    if (!b) return [h('div', { class: 'dbg-note' }, 'Отряда нет.')];
    const set = (f: () => void, note: string) => { f(); if (!Object.values(b.limbs ?? {}).some(Boolean)) delete b.limbs; this.note = note; this.onSpawn(); this.render(); };
    const who = h('div', { class: 'dbg-row' }, ...G.squad.map((m, i) => h('button', { class: 'btn' + (m === b ? ' active' : ''), onclick: () => { this.member = i; this.render(); } }, m.name)));
    const rows = LIMB_ORDER.map((l: Limb) => {
      const st = limbState(b, l), cur = b.limbs?.[l];
      const sel = h('select', { class: 'dbg-sel' }, ...Object.values(PROSTHESES).filter((p) => fits(p, l)).map((p) => h('option', { value: p.id, selected: cur === p.id }, `${ROMAN[p.cat]} ${p.name}`))) as HTMLSelectElement;
      return h('div', { class: 'dbg-limb' },
        h('div', {}, h('b', {}, LIMB_NAMES[l]), ' — ', st.text),
        h('div', { class: 'dbg-item' }, sel,
          h('button', { class: 'btn', title: 'Поставить выбранный протез (бесплатно, без предметов)', onclick: () => set(() => install(b, l, sel.value, G.clock), `${b.name}: ${LIMB_NAMES[l]} — ${PROSTHESES[sel.value].name}${modsText(PROSTHESES[sel.value].mods) ? ' (' + modsText(PROSTHESES[sel.value].mods) + ')' : ''}`) }, 'Поставить'),
          h('button', { class: 'btn', disabled: cur === 'lost', onclick: () => set(() => loseLimb(b, l), `${b.name}: ${LIMB_NAMES[l]} — утрачена`) }, 'Отнять'),
          h('button', { class: 'btn', disabled: !cur, onclick: () => set(() => { if (b.limbs) delete b.limbs[l]; }, `${b.name}: ${LIMB_NAMES[l]} — своя, целая`) }, 'Вернуть')));
    });
    return [who, h('div', { class: 'dbg-items' }, ...rows), h('div', { class: 'dbg-note' }, this.note || 'Протезы ставятся сразу и бесплатно; нужные для обряда предметы не тратятся.')];
  },

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
    const tabs = h('div', { class: 'dbg-tabs' }, ...([['main', 'Общее'], ['items', 'Предметы'], ['prosth', 'Протезы']] as const).map(([k, label]) =>
      h('button', { class: 'btn' + (this.tab === k ? ' active' : ''), onclick: () => { this.tab = k; this.render(); } }, label)));
    const top = h('div', { class: 'dbg-top' }, h('b', {}, 'Отладка'), h('button', { class: 'btn', onclick: () => this.close() }, '✕ [F2]'));
    if (this.tab === 'items') { $('debug').replaceChildren(h('div', { class: 'dbg-box' }, top, tabs, ...this.itemsTab())); return; }
    if (this.tab === 'prosth') { $('debug').replaceChildren(h('div', { class: 'dbg-box' }, top, tabs, ...this.prosthTab())); return; }
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
