// ============================================================
//  Меню оккультизма (клавиша O): четыре школы, изучение
//  заклинаний за «знаки», напряжение и ритуалы вне боя.
// ============================================================
import { tr } from './i18n';
import { G } from './state';
import { h } from './book';
import { $, keepScroll } from './util';
import { withFrame } from './frames';
import { World, LOCS } from './worldmap';
import { WOUNDS } from './wounds';
import {
  School, SCHOOLS, SCHOOL_ORDER, SPELLS, RITUALS, Ritual, STRAIN_MAX,
  isOccultist, signs, freeSigns, knows, knowsSchool, strain, addStrain, strainCheck,
} from './occult';

export const OccultMenu = {
  open: false,
  note: '',
  onClose: () => {},

  show(onClose: () => void) {
    this.open = true; this.onClose = onClose;
    this.note = isOccultist()
      ? 'Выберите школу на вкладке (1–4). Знаки — сколько заклинаний ещё можно постичь.'
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

  tab: 'folk' as School,
  setTab(t: School) { this.tab = t; this.render(); },

  render() {
    const occ = isOccultist(), s = strain(), sc = this.tab, S = SCHOOLS[sc];
    const info = h('div', { class: 'oc-note' }, this.note);
    const pips = h('span', { class: 'oc-pips' }, ...Array.from({ length: STRAIN_MAX }, (_, i) => h('i', { class: i < s ? (i >= 3 ? 'on hot' : 'on') : '' })));
    // вкладки школ
    const tabs = h('div', { class: 'oc-tabs' }, ...SCHOOL_ORDER.map((k, i) => {
      const all = Object.values(SPELLS).filter((sp) => sp.school === k), got = all.filter((sp) => knows(sp.id)).length;
      return h('button', { class: 'oc-tab' + (k === sc ? ' on' : '') + (got ? ' has' : ''), title: `${SCHOOLS[k].name} [${i + 1}]`, onclick: () => this.setTab(k) },
        h('b', {}, SCHOOLS[k].emblem), ` ${SCHOOLS[k].short} `, h('em', {}, `${got}/${all.length}`));
    }));
    // заклинания школы
    const spells = Object.values(SPELLS).filter((sp) => sp.school === sc).map((sp) => {
      const k = knows(sp.id);
      return h('div', { class: 'oc-row' + (k ? ' known' : '') },
        h('div', { class: 'oc-rh2' }, h('b', {}, sp.name), h('span', { class: 'oc-ss' }, `напряжение +${sp.strain}`),
          k ? h('span', { class: 'oc-ok' }, '✓ постигнуто')
            : h('button', { class: 'btn', disabled: !occ || freeSigns() <= 0, onclick: () => this.learn(sp.id) }, 'Постичь')),
        h('div', { class: 'oc-desc' }, sp.desc));
    });
    // ритуалы школы
    const can = occ && knowsSchool(sc);
    const rituals = RITUALS.filter((r) => r.school === sc).map((r) =>
      h('div', { class: 'oc-row rit' + (can ? '' : ' off') },
        h('div', { class: 'oc-rh2' }, h('b', {}, `Ритуал: ${r.name}`), h('span', { class: 'oc-ss' }, `+${r.strain} · ${r.hours} ч`),
          h('button', { class: 'btn', disabled: !can, onclick: () => this.ritual(r) }, 'Провести')),
        h('div', { class: 'oc-desc' }, tr(r.desc) + (can ? '' : ' ' + tr('Нужно постичь хотя бы одно заклинание этой школы.')))));
    keepScroll($('occult'), '.oc-list', () => $('occult').replaceChildren(h('div', { class: 'oc-box' },
      h('div', { class: 'oc-top' },
        h('h2', {}, 'Оккультизм'),
        h('button', { class: 'btn oc-close', onclick: () => this.close() }, '✕ [O]')),
      h('div', { class: 'oc-stat' },
        h('span', { title: 'Каждое заклинание и ритуал повышают напряжение. С 4 и выше после колдовства — проверка Воли (КС 8 + напряжение), провал — отдача. Сбрасывается на привале (Q).' }, 'Напряжение ', pips, h('b', {}, ` ${s}/${STRAIN_MAX}`)),
        h('span', { title: 'Сколько заклинаний ещё можно постичь: 2 + уровень, +1 с гримуаром.' }, 'Знаки: ', h('b', {}, `${occ ? freeSigns() : 0}`), ` из ${signs()}`)),
      tabs,
      h('div', { class: 'oc-role' }, `${S.emblem} ${tr(S.name)}. ${tr(S.role)}`),
      h('div', { class: 'oc-list' }, ...spells, ...rituals),
      info)));
  },
};
