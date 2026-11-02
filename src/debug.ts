// ============================================================
//  Отладка (F2): бессмертие от голода, невидимость на карте,
//  ускорение передвижения, телепорт. Флажки запоминаются.
// ============================================================
import { h } from './book';
import { $ } from './util';

export const Debug = {
  noHunger: false,
  invisible: false,
  speed: 1,            // множитель скорости передвижения (карта и сцены)
  clickTp: false,      // телепорт кликом по карте мира
  open: false,
  onTeleport: (_id: string) => {},
  onWeather: (_k: string) => {},
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
    $('debug').replaceChildren(h('div', { class: 'dbg-box' },
      h('div', { class: 'dbg-top' }, h('b', {}, 'Отладка'), h('button', { class: 'btn', onclick: () => this.close() }, '✕ [F2]')),
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
