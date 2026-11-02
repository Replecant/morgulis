// ============================================================
//  Меню оккультизма (клавиша O): четыре школы, изучение
//  заклинаний за «знаки», напряжение и ритуалы вне боя.
// ============================================================
import { G } from './state';
import { h } from './book';
import { $ } from './util';
import { withFrame } from './frames';
import { World, LOCS } from './worldmap';
import { WOUNDS } from './wounds';
import {
  SCHOOLS, SCHOOL_ORDER, SPELLS, RITUALS, Ritual, STRAIN_MAX,
  isOccultist, signs, freeSigns, knows, knowsSchool, strain, addStrain, strainCheck,
} from './occult';

export const OccultMenu = {
  open: false,
  note: '',
  onClose: () => {},

  show(onClose: () => void) {
    this.open = true; this.onClose = onClose;
    this.note = isOccultist()
      ? 'Знаки — сколько заклинаний вы можете постичь (2 + уровень, +1 с гримуаром). Наведите на заклинание, чтобы прочесть о нём.'
      : 'Оккультизм — путь оккультиста. Остальным эти знаки ничего не говорят.';
    this.render();
    withFrame('occult', $('occult'), () => { if (this.open) $('occult').classList.remove('hidden'); });
  },
  close() { this.open = false; $('occult').classList.add('hidden'); this.onClose(); },

  learn(id: string) {
    if (!isOccultist() || knows(id) || freeSigns() <= 0) return;
    G.known.push(id);
    this.note = `Постигнуто: «${SPELLS[id].name}». В бою — кнопка «✶ Оккультизм».`;
    this.render();
  },

  ritual(r: Ritual) {
    const b = G.squad[0];
    if (strain() + r.strain > STRAIN_MAX) { this.note = 'Напряжение на пределе — сначала привал (Q).'; return this.render(); }
    if (r.where === 'world' && G.mode !== 'world') { this.note = `«${r.name}» проводят только на карте региона.`; return this.render(); }
    let res = '';
    switch (r.id) {
      case 'cleanse': {
        const light = (b.wounds ?? []).find((id) => !WOUNDS[id].heavy);
        if (!light) { this.note = 'Снимать нечего: лёгких ранений нет.'; return this.render(); }
        b.wounds = b.wounds!.filter((id) => id !== light);
        res = `Наговор и горькие травы: «${WOUNDS[light].name}» снято.`;
        break;
      }
      case 'banish': {
        const near = World.dead.filter((g) => g.alive && Math.hypot(g.x - World.party.x, g.y - World.party.y) < 250);
        if (!near.length) { this.note = 'Поблизости нет потусторонних — изгонять некого.'; return this.render(); }
        for (const g of near) { World.deadHit = g; World.calmDead(24); }
        World.deadHit = null;
        res = `Слова изгнания стелются над землёй. Мертвецы (${near.length}) теряют след и бредут прочь.`;
        break;
      }
      case 'sense': {
        const found = LOCS.filter((l) => l.kind === 'poi' && !G.flags['found_' + l.id] && Math.hypot(l.x - World.party.x, l.y - World.party.y) < 600);
        for (const l of found) G.flags['found_' + l.id] = true;
        res = found.length ? `Звёзды указывают: ${found.map((l) => l.name).join(', ')}. Места отмечены на карте.` : 'Звёзды молчат: поблизости нет скрытого.';
        break;
      }
      case 'runeweap':
        G.flags.runeWeapon = true;
        res = 'Руны вырезаны на оружии. В следующем бою: +1 к атакам и урону вблизи.';
        break;
    }
    addStrain(r.strain);
    G.clock += r.hours;
    const sc = strainCheck();
    if (sc && !sc.ok) { const d = 1 + Math.floor(Math.random() * 3); b.hp = Math.max(1, b.hp - d); res += ` Отдача: кровь из носа, −${d} ОЗ. [Воля: d20 ${sc.roll} → ${sc.total} против ${sc.dc}]`; }
    this.note = `${r.name} (${r.hours} ч). ${res}`;
    this.render();
  },

  render() {
    const occ = isOccultist(), s = strain();
    const info = h('div', { class: 'oc-note' }, this.note);
    const tip = (el: HTMLElement, text: string) => {
      el.onmouseenter = () => { info.textContent = text; };
      el.onmouseleave = () => { info.textContent = this.note; };
      return el;
    };
    const pips = h('span', { class: 'oc-pips' }, ...Array.from({ length: STRAIN_MAX }, (_, i) => h('i', { class: i < s ? (i >= 3 ? 'on hot' : 'on') : '' })));
    const cols = SCHOOL_ORDER.map((sc) => {
      const S = SCHOOLS[sc];
      const cards = Object.values(SPELLS).filter((sp) => sp.school === sc).map((sp) => {
        const k = knows(sp.id);
        return tip(h('div', { class: 'oc-spell' + (k ? ' known' : '') },
          h('div', { class: 'oc-sn' }, sp.name), h('div', { class: 'oc-ss' }, `напряжение +${sp.strain}`),
          k ? h('span', { class: 'oc-ok' }, '✓ постигнуто')
            : h('button', { class: 'btn', disabled: !occ || freeSigns() <= 0, onclick: () => this.learn(sp.id) }, 'Постичь')),
          `${sp.name} (${S.name}). ${sp.desc} Напряжение +${sp.strain}.`);
      });
      return h('div', { class: 'oc-col' + (knowsSchool(sc) ? ' active' : '') },
        tip(h('div', { class: 'oc-sh' }, h('b', {}, `${S.emblem} ${S.name}`)), `${S.name}: ${S.role}`), ...cards);
    });
    const rituals = RITUALS.map((r) => {
      const can = occ && knowsSchool(r.school);
      return tip(h('div', { class: 'oc-rit' + (can ? '' : ' off') },
        h('b', {}, `${SCHOOLS[r.school].emblem} ${r.name}`),
        h('button', { class: 'btn', disabled: !can, onclick: () => this.ritual(r) }, `Провести (+${r.strain}, ${r.hours} ч)`)),
        `${r.name}. ${r.desc} Напряжение +${r.strain}, время ${r.hours} ч.${can ? '' : ` Нужно постичь хотя бы одно заклинание школы «${SCHOOLS[r.school].name}».`}`);
    });
    $('occult').replaceChildren(h('div', { class: 'oc-box' },
      h('div', { class: 'oc-top' },
        h('h2', {}, 'Оккультизм'),
        tip(h('div', { class: 'oc-strain' }, 'Напряжение ', pips, h('b', {}, ` ${s}/${STRAIN_MAX}`)),
          'Оккультное напряжение. Каждое заклинание и ритуал его повышают. С 4 и выше после колдовства — проверка Воли (КС 8 + напряжение), провал — отдача: потеря ОЗ, видения или шёпот. Сбрасывается на привале (Q).'),
        h('div', { class: 'oc-signs' }, 'Знаки: ', h('b', {}, `${occ ? freeSigns() : 0}`), ` из ${signs()}`),
        h('button', { class: 'btn', onclick: () => this.close() }, 'Закрыть [O]')),
      h('div', { class: 'oc-cols' }, ...cols),
      h('div', { class: 'oc-rh' }, 'Ритуалы — вне боя'),
      h('div', { class: 'oc-rits' }, ...rituals),
      info));
  },
};
