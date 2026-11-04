// ============================================================
//  Лист персонажа (клавиша C): портрет, уровень и опыт, черты,
//  навыки, итоговые характеристики с учётом снаряжения и ран,
//  талант и умение профессии. Окно — в пиксельной рамке со скелетом.
// ============================================================
import { G } from './state';
import { ATTRS, ATTR_ORDER, SKILLS, SKILL_ORDER, PROFESSIONS, TALENTS, LEVEL_XP, MAX_LEVEL, mastery, trainedSkills, skillBonus, initiative, meleeDamage, fullName, CLASS_TALENTS, TALENT_LEVELS, talentsOf, pendingTalent } from './rules';
import { Dialog } from './ui';
import { memberStats } from './inventory';
import { woundsOf } from './wounds';
import { LIMB_ORDER, LIMB_NAMES, limbState, limbSkill, modsText, modsOf, partOf } from './prosthetics';
import { drawFigure } from './gfx';
import { h } from './book';
import { $ } from './util';
import { withFrame } from './frames';

const sg = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);
const years = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'год' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'года' : 'лет');

export const Sheet = {
  open: false,
  onClose: () => {},

  show(onClose: () => void) {
    if (!G.pc || !G.squad[0]) return;
    this.open = true; this.onClose = onClose;
    this.render();
    withFrame('sheet', $('sheet'), () => { if (this.open) $('sheet').classList.remove('hidden'); });
  },
  close() { this.open = false; $('sheet').classList.add('hidden'); this.onClose(); },

  render() {
    const c = G.pc!, b = G.squad[0], prof = PROFESSIONS[c.prof], st = memberStats(b);
    const info = h('div', { class: 'sh-info' }, 'Наведите на строку, чтобы увидеть пояснение.');
    const tip = (el: HTMLElement, text: string) => {
      el.onmouseenter = () => { info.textContent = text; };
      el.onmouseleave = () => { info.textContent = 'Наведите на строку, чтобы увидеть пояснение.'; };
      return el;
    };

    // --- портрет
    const ph = h('canvas', { width: 150, height: 176, class: 'sh-photo' });
    const pc = ph.getContext('2d')!;
    const gr = pc.createRadialGradient(75, 70, 8, 75, 90, 110);
    gr.addColorStop(0, '#3a4630'); gr.addColorStop(1, '#10140c');
    pc.fillStyle = gr; pc.fillRect(0, 0, 150, 176);
    drawFigure(pc, b.look ?? 'pc', 75, 170, 5, { t: 0 });

    // --- уровень и опыт
    const lvl = c.level, next = lvl < MAX_LEVEL ? LEVEL_XP[lvl] : null, prev = LEVEL_XP[lvl - 1];
    const xpPct = next ? Math.min(100, ((c.xp - prev) / (next - prev)) * 100) : 100;

    // --- черты
    const attrs = ATTR_ORDER.map((k) => tip(h('div', { class: 'sh-attr' },
      h('b', {}, sg(c.attrs[k])), h('span', {}, ATTRS[k].name)), `${ATTRS[k].name}: ${ATTRS[k].desc}`));

    // --- итоговые характеристики (со снаряжением и ранами)
    const dr = (label: string, val: string, text: string, warn = false) =>
      tip(h('div', { class: 'sh-st' + (warn ? ' warn' : '') }, h('span', {}, label), h('b', {}, val)), text);
    const hurt = b.hp < b.maxHp;
    const derived = [
      dr('Очки здоровья', st.hp, 'Сколько урона боец выдержит, прежде чем упадёт. Раны снижают максимум до операции.', hurt),
      dr('Защита', String(st.def), 'Сложность попасть по бойцу: противник бросает 3d6 + атака против этого числа.'),
      dr('Поглощение', String(st.armor), 'Броня гасит столько урона от каждого попадания.'),
      dr('Перемещение', String(st.move), 'Клеток за одно действие хода в бою.'),
      dr('Ближний бой', sg(st.atkM), 'Бонус к броску 3d6 при атаке холодным оружием и прикладом.'),
      dr('Стрельба', sg(st.atkR), 'Бонус к броску 3d6 при стрельбе.'),
      dr('Урон вблизи', sg(meleeDamage(c)), 'Прибавка к урону в рукопашной (Сила, Железная хватка).'),
      dr('Инициатива', sg(initiative(c)), 'Кто раньше действует в начале боя.'),
      dr('Стойкость', sg(st.horror), 'Бонус к проверкам против страха и сверхъестественного ужаса.'),
      dr('Кураж', `${st.courage} / 3`, 'Кураж копится в бою (обереги дают его с самого начала) и тратится на рискованные приёмы: штыковую, рывок, последний рубеж, спасение товарища.'),
    ];

    // --- навыки
    const trained = trainedSkills(c), mb = mastery(lvl) + 1;
    const skills = SKILL_ORDER.map((k) => {
      const t = trained.includes(k);
      return tip(h('div', { class: 'sh-skill' + (t ? ' on' : '') },
        h('i', {}, t ? '◆' : '◇'), h('span', {}, SKILLS[k].name), h('em', {}, ATTRS[SKILLS[k].attr].short), h('b', {}, sg(skillBonus(c, k) + limbSkill(b, k)))),
        `${SKILLS[k].name} (${ATTRS[SKILLS[k].attr].name}${t ? `, обучен: +${mb}` : ', не обучен'}). ${SKILLS[k].desc} Проверка: 3d6 + бонус против сложности.`);
    });

    // --- раны
    const ws = woundsOf(b);
    const wounds = ws.length
      ? ws.map((w) => tip(h('div', { class: 'sh-wound' + (w.heavy ? ' heavy' : '') }, w.name), `${w.name}: ${w.desc} ${w.heavy ? 'Нужна операция.' : 'Пройдёт после привала.'}`))
      : [h('div', { class: 'sh-none' }, 'Ранений нет')];
    // утраченные конечности и протезы
    const limbs = LIMB_ORDER.filter((l) => b.limbs?.[l]).map((l) => {
      const st = limbState(b, l);
      const eff = modsText(modsOf(b, l));
      return tip(h('div', { class: 'sh-wound' + (st.lost ? ' heavy' : ' prost') }, `${LIMB_NAMES[l]}: ${st.text}`),
        st.prost ? `${st.prost.name}. ${st.prost.desc} Поправки: ${eff}.${st.prost.special ? ' ' + st.prost.special : ''}` : `${LIMB_NAMES[l]}: утрата. ${eff}. Протез поставят в клинике Среднего города форта.`);
    });

    const talent = TALENTS[c.talent];
    // таланты профессии: взятые и те, что откроются на 2, 4, 6
    const own = talentsOf(c), pend = pendingTalent(c);
    const ctal = TALENT_LEVELS.map((lv, i) => {
      const t = own[i];
      if (t) return tip(h('div', { class: 'sh-skill on' }, h('i', {}, '◆'), h('span', {}, t.name), h('em', {}, `ур. ${lv}`)), `${t.name}: ${t.desc}`);
      const opts = CLASS_TALENTS[c.prof][i];
      return tip(h('div', { class: 'sh-skill' }, h('i', {}, '◇'), h('span', {}, lvl >= lv ? 'Выбор ждёт' : `Откроется на уровне ${lv}`), h('em', {}, `ур. ${lv}`)),
        `На выбор: ${opts.map((o) => `${o.name} (${o.desc})`).join(' или ')}`);
    });
    if (pend) ctal.push(h('button', { class: 'btn', onclick: () => { this.close(); Dialog.start('levelup'); } }, 'Выбрать талант'));
    $('sheet').replaceChildren(h('div', { class: 'sh-box' },
      h('div', { class: 'sh-col a' },
        h('div', { class: 'sh-photo-wrap' }, ph),
        h('div', { class: 'sh-age' }, `${c.gender === 'f' ? 'Женщина' : 'Мужчина'}, ${c.age} ${years(c.age)}`),
        h('div', { class: 'sh-h' }, 'Раны'), ...wounds,
        ...(limbs.length ? [h('div', { class: 'sh-h' }, 'Тело'), ...limbs] : []),
        h('div', { class: 'sh-money' }, 'Шиллинги: ', h('b', {}, String(G.money)))),
      h('div', { class: 'sh-col b' },
        h('div', { class: 'sh-name' }, fullName(c) || b.name),
        h('div', { class: 'sh-prof' }, `${prof.emblem} ${prof.name} · уровень ${lvl}`),
        tip(h('div', { class: 'sh-xp' }, h('span', { style: `width:${xpPct}%` }), h('em', {}, next ? `опыт ${c.xp} / ${next}` : `опыт ${c.xp} · предел`)),
          next ? `До уровня ${lvl + 1}: ещё ${next - c.xp} опыта. Опыт дают задания, бои и находки.` : 'Достигнут последний уровень.'),
        h('div', { class: 'sh-attrs' }, ...attrs),
        h('div', { class: 'sh-h' }, 'В бою'),
        h('div', { class: 'sh-stats' }, ...derived)),
      h('div', { class: 'sh-col c' },
        h('div', { class: 'sh-h' }, 'Навыки ', h('span', {}, `обученные +${mb}`)),
        h('div', { class: 'sh-skills' }, ...skills),
        h('div', { class: 'sh-h' }, 'Таланты'),
        tip(h('div', { class: 'sh-skill on' }, h('i', {}, '◆'), h('span', {}, talent.name), h('em', {}, 'врожд.')), `${talent.name} (врождённый): ${talent.desc}`), ...ctal,
        tip(h('div', { class: 'sh-skill on' }, h('i', {}, '✦'), h('span', {}, prof.ability.name), h('em', {}, 'умение')), `${prof.ability.name} — умение профессии: ${prof.ability.desc}`)),
      h('div', { class: 'sh-foot' }, info, h('button', { class: 'btn', onclick: () => this.close() }, 'Закрыть [C]')),
    ));
  },
};
