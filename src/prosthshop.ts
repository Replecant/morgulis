// ============================================================
//  Окно протезирования: «человечек» с частями тела слева,
//  подходящие протезы для выбранной части — справа.
//  Клиника (Средний город) ставит протезы I–III и стеклянный глаз,
//  подпольная мастерская (Нижний город) — экспериментальные.
// ============================================================
import { G } from './state';
import { h } from './book';
import { $, keepScroll } from './util';
import { drawFigure, applyEquipLooks } from './gfx';
import { withFrame } from './frames';
import { ITEMS, CONSUMABLES } from './items';
import {
  Limb, LIMB_ORDER, LIMB_NAMES, PROSTHESES, Prosthesis, Shop, SHOP_NAMES, SHOP_WHERE, sells, ROMAN,
  partOf, limbState, fits, install, modsText, lostModsText, modsOf,
} from './prosthetics';

// где на «человечке» (300×330) стоят ячейки частей тела
const POS: Record<Limb, { x: number; y: number }> = {
  eyeR: { x: 192, y: 14 }, eyeL: { x: 10, y: 14 },
  armR: { x: 192, y: 130 }, armL: { x: 10, y: 130 },
  legR: { x: 192, y: 262 }, legL: { x: 10, y: 262 },
};

export const ProsthShop = {
  open: false,
  shop: 'clinic' as Shop,
  sel: null as Limb | null,
  note: '',
  onClose: () => {},

  show(shop: Shop, onClose: () => void) {
    this.open = true; this.shop = shop; this.onClose = onClose;
    const b = G.squad[0];
    applyEquipLooks(G.squad); // облик фигурки — по текущим протезам
    this.sel = LIMB_ORDER.find((l) => b.limbs?.[l]) ?? 'armR';
    this.note = {
      clinic: 'Протезист вытирает руки о фартук. — Железо, дерево, пружины, поршни. Выбирай, что подогнать.',
      under: 'Хирург в кожаном фартуке не поднимает глаз от банок с раствором. — Деньги вперёд. Вопросы — не задавай.',
      bclinic: 'Военный врач листает ведомость. — Протезы казённого образца. Солдатам — по норме, вольным — за шиллинги.',
      hawley: 'Старик задёргивает занавеску на окне сарая. — Говори тихо. Поршней у меня нет — только то, что можно выточить и склепать здесь.',
    }[shop];
    this.render();
    withFrame('inv', $('prosth'), () => { if (this.open) $('prosth').classList.remove('hidden'); });
  },
  close() { this.open = false; $('prosth').classList.add('hidden'); this.onClose(); },

  buy(l: Limb, p: Prosthesis) {
    const b = G.squad[0];
    if (G.money < p.price) { this.note = `Не хватает шиллингов: нужно ${p.price}.`; return this.render(); }
    if (p.needItem) {
      const i = G.stash.indexOf(p.needItem);
      if (i < 0) { this.note = `Для обряда нужны: ${ITEMS[p.needItem].name}.`; return this.render(); }
      G.stash.splice(i, 1);
    }
    G.money -= p.price;
    install(b, l, p.id, G.clock);
    applyEquipLooks(G.squad);
    this.note = `${LIMB_NAMES[l]}: ${p.name}. (−${p.price} ш.${p.needItem ? `, −${ITEMS[p.needItem].name.toLowerCase()}` : ''}) ` +
      { clinic: 'Протезист подгоняет ремни и затягивает винты. — Носи на здоровье.', under: 'Хирург вытирает руки. — Будет жечь. Это нормально.',
        bclinic: 'Врач затягивает ремни и ставит отметку в ведомости. — Годен. Следующий.', hawley: 'Старик подгоняет ремни при свете лампы. — И никому. Ни слова. Понял?' }[this.shop];
    this.render();
  },
  buyTissue() {
    const c = CONSUMABLES.tissue;
    if (G.money < c.price) { this.note = `Не хватает шиллингов: нужно ${c.price}.`; return this.render(); }
    G.money -= c.price; G.supplies.tissue += 1;
    this.note = `Куплен тканевый раствор (в запасе: ${G.supplies.tissue}).`;
    this.render();
  },

  render() {
    const b = G.squad[0];
    // «человечек»
    const fig = h('canvas', { width: 144, height: 220, class: 'pr-fig' });
    drawFigure(fig.getContext('2d')!, b.look ?? 'pc', 72, 212, 6, { t: 0 });
    const cells = LIMB_ORDER.map((l) => {
      const st = limbState(b, l), p = POS[l];
      const cls = 'pr-slot' + (this.sel === l ? ' sel' : '') + (st.lost ? ' lost' : st.prost ? ' prost' : '');
      return h('button', { class: cls, style: `left:${p.x}px;top:${p.y}px`, onclick: () => { this.sel = l; this.render(); } },
        h('b', {}, LIMB_NAMES[l]), h('span', {}, st.text));
    });
    const doll = h('div', { class: 'pr-doll' }, fig, ...cells);

    // правая колонка
    const l = this.sel!, st = limbState(b, l), part = partOf(l);
    const head = h('div', { class: 'pr-cur' },
      h('div', { class: 'pr-h' }, LIMB_NAMES[l], h('span', {}, st.text)),
      h('div', { class: 'pr-eff' }, st.prost ? `Сейчас: ${modsText(modsOf(b, l))}` : st.lost ? `Без протеза: ${lostModsText(part)}` : 'Здоровое не режут: протез ставится вместо утраченного.'));
    const list: HTMLElement[] = [];
    if (b.limbs?.[l]) {
      for (const p of Object.values(PROSTHESES)) {
        if (!fits(p, l)) continue;
        const here = sells(this.shop, p), worn = b.limbs[l] === p.id;
        const where = (['clinic', 'bclinic', 'under'] as Shop[]).filter((s) => sells(s, p)).map((s) => SHOP_WHERE[s]).join(', ');
        const lack = !here ? `Здесь не ставят. Есть: ${where}`
          : worn ? 'Уже установлен' : G.money < p.price ? `Не хватает ${p.price - G.money} ш.`
          : p.needItem && !G.stash.includes(p.needItem) ? `Нужно: ${ITEMS[p.needItem].name}` : '';
        list.push(h('div', { class: 'pr-item' + (here ? '' : ' far') },
          h('div', { class: 'pr-top' }, h('b', {}, p.name), h('em', {}, `кат. ${ROMAN[p.cat]}`), h('span', { class: 'pr-price' }, `${p.price} ш.`)),
          h('div', { class: 'pr-desc' }, p.desc),
          h('div', { class: 'pr-mods' }, modsText(p.mods)),
          ...(p.special ? [h('div', { class: 'pr-spec' }, p.special)] : []),
          h('div', { class: 'pr-act' }, lack ? h('span', { class: 'pr-lack' }, lack) : h('button', { class: 'btn', onclick: () => this.buy(l, p) }, 'Установить'))));
      }
    } else list.push(h('div', { class: 'pr-none' }, part === 'eye' ? 'Глаз видит — менять нечего.' : 'Часть тела цела — протез не нужен.'));
    if (this.shop === 'under') list.push(h('div', { class: 'pr-item' },
      h('div', { class: 'pr-top' }, h('b', {}, CONSUMABLES.tissue.name), h('span', { class: 'pr-price' }, `${CONSUMABLES.tissue.price} ш.`)),
      h('div', { class: 'pr-desc' }, `${CONSUMABLES.tissue.desc} В запасе: ${G.supplies.tissue}.`),
      h('div', { class: 'pr-act' }, h('button', { class: 'btn', disabled: G.money < CONSUMABLES.tissue.price, onclick: () => this.buyTissue() }, 'Купить'))));

    keepScroll($('prosth'), '.pr-list', () => $('prosth').replaceChildren(h('div', { class: 'pr-box' },
      h('div', { class: 'pr-topbar' }, h('h2', {}, SHOP_NAMES[this.shop]), h('div', { class: 'tmoney' }, 'Шиллинги: ', h('b', {}, String(G.money))),
        h('button', { class: 'btn', onclick: () => this.close() }, 'Закрыть [Esc]')),
      h('div', { class: 'pr-main' }, doll, h('div', { class: 'pr-right' }, head, h('div', { class: 'pr-list' }, ...list))),
      h('div', { class: 'pr-note' }, this.note))));
  },
};
