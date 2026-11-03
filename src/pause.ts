// ============================================================
//  Меню паузы (Esc): продолжить, сохранить/загрузить, громкость, выход в главное меню.
// ============================================================
import { Music } from './music';
import { Sfx } from './sfx';
import { h } from './book';
import { $ } from './util';
import { Save, canSave, metaText, type Slot } from './save';
import { Dialog } from './ui';

export const Pause = {
  open: false,
  onExit: () => {},
  onLoad: (_s: Slot) => {},
  note: '',

  show(onExit: () => void, io?: { load: (s: Slot) => void }) {
    this.open = true; this.onExit = onExit; this.note = '';
    if (io) this.onLoad = io.load;
    this.render();
    $('pause').classList.remove('hidden');
  },
  close() { this.open = false; $('pause').classList.add('hidden'); },

  render(confirmExit = false) {
    const pct = h('b', { class: 'pv' }, `${Math.round(Music.volume * 100)}%`);
    const slider = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(Music.volume * 100)), class: 'pslider' }) as HTMLInputElement;
    slider.oninput = () => { Music.setVolume(+slider.value / 100); pct.textContent = `${slider.value}%`; };
    const spct = h('b', { class: 'pv' }, `${Math.round(Sfx.volume * 100)}%`);
    const sslider = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(Sfx.volume * 100)), class: 'pslider' }) as HTMLInputElement;
    sslider.oninput = () => { Sfx.setVolume(+sslider.value / 100); spct.textContent = `${sslider.value}%`; };
    sslider.onchange = () => Sfx.thunder(0.6); // проба
    const son = h('input', { type: 'checkbox' }) as HTMLInputElement;
    son.checked = Sfx.on; son.onchange = () => Sfx.setOn(son.checked);
    const on = h('input', { type: 'checkbox' }) as HTMLInputElement;
    on.checked = !Music.muted;
    on.onchange = () => Music.setMuted(!on.checked);
    const saveOk = canSave() && !Dialog.active;
    const loadBtn = (s: Slot, label: string) => { const m = Save.meta(s); return m ? h('button', { class: 'mitem psave', onclick: () => { this.close(); this.onLoad(s); } }, `${label}`, h('small', {}, metaText(m))) : null; };
    $('pause').replaceChildren(h('div', { class: 'pause-box' },
      h('h2', {}, 'Пауза'),
      h('div', { class: 'pbtns psaves' },
        h('button', { class: 'mitem', disabled: !saveOk, title: saveOk ? 'Также F5' : 'В бою и в разговоре сохраняться нельзя', onclick: () => { this.note = Save.write('manual') ? 'Игра сохранена.' : 'Не удалось сохранить.'; this.render(); } }, 'Сохранить игру'),
        loadBtn('manual', 'Загрузить сохранение'),
        loadBtn('auto', 'Загрузить автосохранение'),
        this.note ? h('div', { class: 'phint' }, this.note) : null),
      h('div', { class: 'prow' }, h('span', {}, 'Громкость музыки'), pct),
      slider,
      h('label', { class: 'pcheck' }, on, ' Музыка включена'),
      h('div', { class: 'prow', style: 'margin-top:10px' }, h('span', {}, 'Громкость звуков (гром, выстрелы)'), spct),
      sslider,
      h('label', { class: 'pcheck' }, son, ' Звуки включены'),
      h('div', { class: 'pbtns' },
        h('button', { class: 'mitem', onclick: () => this.close() }, 'Продолжить'),
        confirmExit
          ? h('div', { class: 'pconfirm' }, h('div', {}, 'Выйти в главное меню? Несохранённый прогресс пропадёт.'),
              h('button', { class: 'btn', onclick: () => { this.close(); this.onExit(); } }, 'Выйти'), ' ',
              h('button', { class: 'btn', onclick: () => this.render() }, 'Отмена'))
          : h('button', { class: 'mitem', onclick: () => this.render(true) }, 'Главное меню')),
      h('div', { class: 'phint' }, 'Esc — продолжить · F5 — сохранить · F9 — загрузить'),
    ));
  },
};
