// ============================================================
//  Меню паузы (Esc): продолжить, громкость музыки, выход в главное меню.
// ============================================================
import { Music } from './music';
import { h } from './book';
import { $ } from './util';

export const Pause = {
  open: false,
  onExit: () => {},

  show(onExit: () => void) {
    this.open = true; this.onExit = onExit;
    this.render();
    $('pause').classList.remove('hidden');
  },
  close() { this.open = false; $('pause').classList.add('hidden'); },

  render(confirmExit = false) {
    const pct = h('b', { class: 'pv' }, `${Math.round(Music.volume * 100)}%`);
    const slider = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(Music.volume * 100)), class: 'pslider' }) as HTMLInputElement;
    slider.oninput = () => { Music.setVolume(+slider.value / 100); pct.textContent = `${slider.value}%`; };
    const on = h('input', { type: 'checkbox' }) as HTMLInputElement;
    on.checked = !Music.muted;
    on.onchange = () => Music.setMuted(!on.checked);
    $('pause').replaceChildren(h('div', { class: 'pause-box' },
      h('h2', {}, 'Пауза'),
      h('div', { class: 'prow' }, h('span', {}, 'Громкость музыки'), pct),
      slider,
      h('label', { class: 'pcheck' }, on, ' Музыка включена ', h('i', {}, '(клавиша M)')),
      h('div', { class: 'pbtns' },
        h('button', { class: 'mitem', onclick: () => this.close() }, 'Продолжить'),
        confirmExit
          ? h('div', { class: 'pconfirm' }, h('div', {}, 'Выйти в главное меню? Прогресс не сохраняется.'),
              h('button', { class: 'btn', onclick: () => { this.close(); this.onExit(); } }, 'Выйти'), ' ',
              h('button', { class: 'btn', onclick: () => this.render() }, 'Отмена'))
          : h('button', { class: 'mitem', onclick: () => this.render(true) }, 'Главное меню')),
      h('div', { class: 'phint' }, 'Esc — продолжить'),
    ));
  },
};
