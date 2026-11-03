// ============================================================
//  Создание персонажа — «Личное дело» в виде книги
// ============================================================
import { tr } from './i18n';
import { Book, h, Spread } from './book';
import {
  Character, newCharacter, ATTRS, ATTR_ORDER, ATTR_MIN, ATTR_MAX_START, ATTR_POINTS, pointsLeft,
  SKILLS, SKILL_ORDER, PROFESSIONS, PROF_ORDER, TALENTS, TALENT_ORDER, HAIR, SKIN, NAMES,
  trainedSkills, skillBonus, extraSkillSlots, maxHp, defense, armorOf, initiative,
  meleeAttack, rangedAttack, meleeDamage, horrorSave, check, DC, DC_NAMES, fullName, g, AttrKey, mastery,
} from './rules';
import { drawFigure, setPcStyle } from './gfx';
import { pick } from './util';

const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const ageWord = (a: number, f: boolean) => (a < 25 ? 'юность' : a < 40 ? 'расцвет сил' : a < 52 ? 'зрелость' : f ? 'седая' : 'седой');

function portrait(c: Character, w = 220, hgt = 280, scale = 7) {
  const cv = h('canvas', { width: w, height: hgt, class: 'photo-cv' });
  drawPortrait(cv, c, scale);
  return cv;
}
function drawPortrait(cv: HTMLCanvasElement, c: Character, scale: number) {
  setPcStyle(c);
  const x = cv.getContext('2d')!;
  const gr = x.createRadialGradient(cv.width / 2, cv.height * 0.4, 10, cv.width / 2, cv.height / 2, cv.width * 0.8);
  gr.addColorStop(0, '#5a5a48'); gr.addColorStop(1, '#1e1f18');
  x.fillStyle = gr; x.fillRect(0, 0, cv.width, cv.height);
  drawFigure(x, 'pc', cv.width / 2, cv.height - 8, scale, { t: 0 });
  // сепия старой фотокарточки
  x.globalCompositeOperation = 'color';
  x.fillStyle = 'rgba(120,100,60,0.45)'; x.fillRect(0, 0, cv.width, cv.height);
  x.globalCompositeOperation = 'source-over';
}

function chips<T extends string>(opts: [T, string][], cur: T, set: (v: T) => void) {
  return h('div', { class: 'chips' }, ...opts.map(([v, label]) =>
    h('button', { class: 'chip' + (v === cur ? ' on' : ''), onclick: () => set(v) }, label)));
}
function swatches(list: string[], cur: string, set: (v: string) => void, disabled = false) {
  return h('div', { class: 'swatches' + (disabled ? ' dis' : '') }, ...list.map((col) =>
    h('button', { class: 'sw' + (col === cur ? ' on' : ''), style: `background:${col}`, onclick: () => !disabled && set(col) })));
}
function statRow(label: string, val: string | number, hint = '') {
  return h('tr', {}, h('td', {}, label), h('td', { class: 'v' }, String(val)), h('td', { class: 'hint' }, hint));
}

export function openCreation(host: HTMLElement, onDone: (c: Character) => void, onCancel: () => void) {
  const c = newCharacter();
  c.first = tr(pick(NAMES.m)); c.last = tr(pick(NAMES.last)); // имена — на языке игры
  let lastRoll: HTMLElement | null = null;
  let book: Book;
  const refresh = () => book.render();

  // ------------------------------------------------ I. Происхождение
  const origin: Spread = {
    title: 'Происхождение',
    left: () => {
      const ageLbl = h('span', { class: 'age-lbl' }, `${c.age} · ${ageWord(c.age, c.gender === 'f')}`);
      return h('div', {},
        h('div', { class: 'chapter' }, 'Глава I'), h('h1', {}, 'Происхождение'),
        h('p', { class: 'drop' }, 'Сим удостоверяется личность предъявител', g(c, 'я', 'ьницы'), ' сего, следующ', g(c, 'его', 'ей'), ' по землям его милости барона Сайласа Олдриджа. Документ надлежит предъявлять по первому требованию стражи.'),
        h('label', { class: 'field' }, h('span', {}, 'Имя'),
          h('input', { value: c.first, maxlength: 18, oninput: (e: Event) => { c.first = (e.target as HTMLInputElement).value.trim(); } })),
        h('label', { class: 'field' }, h('span', {}, 'Фамилия'),
          h('input', { value: c.last, maxlength: 18, oninput: (e: Event) => { c.last = (e.target as HTMLInputElement).value.trim(); } })),
        h('button', { class: 'bbtn small', onclick: () => { c.first = tr(pick(NAMES[c.gender])); c.last = tr(pick(NAMES.last)); refresh(); } }, '⚄ Случайное имя'),
        h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Пол'),
          chips<'m' | 'f'>([['m', 'Мужчина'], ['f', 'Женщина']], c.gender, (v) => {
            if (v !== c.gender && NAMES[c.gender].map(tr).includes(c.first)) c.first = tr(pick(NAMES[v]));
            c.gender = v; refresh();
          })),
        h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Возраст'),
          h('input', {
            type: 'range', min: 18, max: 60, value: c.age, class: 'range',
            oninput: (e: Event) => {
              c.age = Number((e.target as HTMLInputElement).value);
              ageLbl.textContent = `${c.age} · ${ageWord(c.age, c.gender === 'f')}`;
              const cv = book.R.querySelector('canvas'); if (cv) drawPortrait(cv, c, 7);
            },
            onchange: refresh,
          }), ageLbl),
      );
    },
    right: () => h('div', { class: 'center' },
      h('h3', {}, 'Фотокарточка'),
      h('div', { class: 'photo' }, portrait(c)),
      h('div', { class: 'caption' }, fullName(c) || '…'),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Волосы'), swatches(HAIR, c.hair, (v) => { c.hair = v; refresh(); }, c.age >= 52)),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Кожа'), swatches(SKIN, c.skin, (v) => { c.skin = v; refresh(); })),
      h('p', { class: 'note' }, 'Пол, возраст и внешность не влияют на характеристики.'),
    ),
  };

  // ------------------------------------------------ II. Призвание
  const calling: Spread = {
    title: 'Призвание',
    left: () => h('div', {},
      h('div', { class: 'chapter' }, 'Глава II'), h('h1', {}, 'Призвание'),
      h('p', {}, 'Чему вы обучены? Профессия определяет здоровье, обученные навыки, особое умение и снаряжение.'),
      h('div', { class: 'profs' }, ...PROF_ORDER.map((id) => {
        const p = PROFESSIONS[id];
        return h('button', { class: 'prof' + (c.prof === id ? ' on' : ''), onclick: () => {
          c.prof = id;
          c.extraSkills = c.extraSkills.filter((s) => !p.skills.includes(s));
          refresh();
        } },
        h('span', { class: 'emb' }, p.emblem), h('span', { class: 'pn' }, p.name), h('span', { class: 'pm' }, p.motto));
      })),
    ),
    right: () => {
      const p = PROFESSIONS[c.prof];
      return h('div', {},
        h('div', { class: 'prof-title' }, h('span', { class: 'emb big' }, p.emblem), h('div', {}, h('h2', {}, p.name), h('i', {}, `«${p.motto}»`))),
        h('p', {}, p.desc),
        h('table', { class: 'stats' },
          statRow('Ключевая черта', ATTRS[p.key].name),
          statRow('Здоровье', `${p.hp} + Сила`, `+${p.hpLevel} за уровень`),
          statRow('Навыки', p.skills.map((s) => SKILLS[s].name).join(', ')),
        ),
        h('div', { class: 'ability' }, h('b', {}, p.ability.name), ' — ', p.ability.desc),
        h('div', { class: 'kit' }, h('b', {}, 'Снаряжение: '), p.kit.join(' · ')),
        h('p', { class: 'note' }, `Архетипы в будущем: ${p.archetypes}.`),
      );
    },
  };

  // ------------------------------------------------ III. Характеристики
  const attrs: Spread = {
    title: 'Характеристики',
    left: () => {
      const left = pointsLeft(c), key = PROFESSIONS[c.prof].key;
      return h('div', {},
        h('div', { class: 'chapter' }, 'Глава III'), h('h1', {}, 'Характеристики'),
        h('p', {}, `Распределите ${ATTR_POINTS} очков. Любую черту можно опустить до −1 ради лишнего очка. При создании — не выше +${ATTR_MAX_START}.`),
        h('div', { class: 'points' + (left ? '' : ' done') }, `Осталось очков: ${left}`),
        ...ATTR_ORDER.map((k: AttrKey) => {
          const v = c.attrs[k];
          return h('div', { class: 'attr' + (k === key ? ' key' : '') },
            h('div', { class: 'an' }, h('b', {}, ATTRS[k].name), ` (${ATTRS[k].short})`, k === key ? h('span', { class: 'star' }, ' ★ ключевая') : null,
              h('div', { class: 'ad' }, ATTRS[k].desc)),
            h('div', { class: 'ctl' },
              h('button', { class: 'bbtn bsq', disabled: v <= ATTR_MIN, onclick: () => { c.attrs[k]--; refresh(); } }, '−'),
              h('span', { class: 'av' }, sign(v)),
              h('button', { class: 'bbtn bsq', disabled: v >= ATTR_MAX_START || left <= 0, onclick: () => { c.attrs[k]++; refresh(); } }, '+')),
          );
        }),
      );
    },
    right: () => {
      const tested = PROFESSIONS[c.prof].skills[0];
      return h('div', {},
        h('h3', {}, 'Производные показатели'),
        h('table', { class: 'stats' },
          statRow('Здоровье (ОЗ)', maxHp(c)),
          statRow('Защита', defense(c), 'КС, чтобы попасть по вам'),
          statRow('Поглощение', armorOf(c), 'вычитается из урона'),
          statRow('Инициатива', sign(initiative(c))),
          statRow('Атака вблизи', sign(meleeAttack(c))),
          statRow('Атака издали', sign(rangedAttack(c))),
          statRow('Урон вблизи', sign(meleeDamage(c))),
          statRow('Стойкость к ужасу', sign(horrorSave(c))),
        ),
        h('h3', {}, 'Как бросают кость'),
        h('p', { class: 'formula' }, 'd20 + черта + мастерство (если навык обучен) ≥ КС'),
        h('div', { class: 'dcs' }, ...Object.values(DC).map((d) => h('span', {}, DC_NAMES[d], ' ', String(d)))),
        h('button', { class: 'bbtn small', onclick: () => {
          const b = skillBonus(c, tested), r = check(b, DC.normal);
          lastRoll = h('div', { class: 'roll ' + (r.success ? 'ok' : 'bad') },
            `${SKILLS[tested].name}: d20 (${r.roll}) ${b >= 0 ? '+' : '−'} ${Math.abs(b)} = ${r.total} против 13 — `,
            h('b', {}, r.crit ? 'блестяще!' : r.fumble ? 'позорный провал' : r.success ? 'успех' : 'провал'));
          refresh();
        } }, `⚄ Испытать: ${SKILLS[tested].name}, КС 13`),
        lastRoll,
      );
    },
  };

  // ------------------------------------------------ IV. Навыки и таланты
  const skills: Spread = {
    title: 'Навыки и таланты',
    left: () => {
      const prof = PROFESSIONS[c.prof].skills, slots = extraSkillSlots(c), free = slots - c.extraSkills.length;
      return h('div', {},
        h('div', { class: 'chapter' }, 'Глава IV'), h('h1', {}, 'Навыки'),
        h('p', {}, 'Обученный навык добавляет мастерство к проверке. Профессия дала три навыка — ', h('b', {}, `выберите ещё ${slots}`), '.'),
        h('div', { class: 'points' + (free ? '' : ' done') }, free ? `Осталось выбрать: ${free}` : 'Выбор сделан'),
        h('div', { class: 'skills' }, ...SKILL_ORDER.map((s) => {
          const fromProf = prof.includes(s), chosen = c.extraSkills.includes(s);
          return h('button', {
            class: 'skill' + (fromProf ? ' prof' : chosen ? ' chosen' : ''), title: SKILLS[s].desc,
            onclick: () => {
              if (fromProf) return;
              if (chosen) c.extraSkills = c.extraSkills.filter((x) => x !== s);
              else if (c.extraSkills.length < slots) c.extraSkills.push(s);
              else { book.warn('Свободных навыков больше нет — снимите отметку с другого'); return; }
              refresh();
            },
          },
          h('span', { class: 'mark' }, fromProf ? '✓' : chosen ? '✎' : '·'),
          h('span', { class: 'sn' }, SKILLS[s].name), h('span', { class: 'sa' }, ATTRS[SKILLS[s].attr].short),
          h('span', { class: 'sb' }, sign(skillBonus(c, s))));
        })),
      );
    },
    right: () => h('div', {},
      h('h1', {}, 'Таланты'),
      h('p', {}, 'Выберите один талант. Новые таланты и специализации открываются с уровнем.'),
      h('div', { class: 'talents' }, ...TALENT_ORDER.map((t) =>
        h('button', { class: 'talent' + (c.talent === t ? ' on' : ''), onclick: () => {
          c.talent = t;
          c.extraSkills = c.extraSkills.slice(0, extraSkillSlots(c));
          refresh();
        } }, h('b', {}, TALENTS[t].name), h('span', {}, TALENTS[t].desc)))),
    ),
  };

  // ------------------------------------------------ V. Личное дело
  let signed = false;
  const sheet: Spread = {
    title: 'Личное дело',
    left: () => {
      const p = PROFESSIONS[c.prof];
      return h('div', { class: 'sheet' },
        h('div', { class: 'chapter' }, 'Глава V'), h('h1', {}, 'Личное дело'),
        h('table', { class: 'stats' },
          statRow('Имя', fullName(c)),
          statRow('Пол, возраст', `${g(c, 'мужчина', 'женщина')}, ${c.age}`),
          statRow('Профессия', `${p.emblem} ${p.name}`),
          statRow('Уровень', `${c.level} (мастерство +${mastery(c.level)})`),
          statRow('Черты', ATTR_ORDER.map((k) => `${ATTRS[k].short} ${sign(c.attrs[k])}`).join('  ')),
          statRow('ОЗ / Защита / Погл.', `${maxHp(c)} / ${defense(c)} / ${armorOf(c)}`),
          statRow('Навыки', trainedSkills(c).map((s) => SKILLS[s].name).join(', ')),
          statRow('Талант', TALENTS[c.talent].name),
          statRow('Умение', p.ability.name),
        ),
        h('div', { class: 'kit' }, h('b', {}, 'При себе: '), p.kit.join(' · ')),
      );
    },
    right: () => h('div', { class: 'center' },
      h('div', { class: 'photo small' }, portrait(c, 150, 190, 4.6)),
      h('p', {}, 'Личность удостоверена. Подорожная выдана.'),
      h('div', { class: 'sign-line' }, h('span', { class: 'signature' }, fullName(c))),
      h('div', { class: 'sign-cap' }, 'подпись'),
      h('button', { class: 'bbtn big', disabled: signed, onclick: () => {
        for (let k = 0; k < 4; k++) { const m = canLeave(k); if (m) { book.warn(m); book.go(k); return; } }
        signed = true; refresh();
        requestAnimationFrame(() => requestAnimationFrame(() => book.R.querySelector('.signature')?.classList.add('done')));
        setTimeout(() => onDone(c), 1500);
      } }, signed ? 'В путь…' : 'Подписать и отправиться'),
    ),
  };

  function canLeave(i: number): string | null {
    if (i === 0 && (!c.first || !c.last)) return 'Впишите имя и фамилию';
    if (i === 2 && pointsLeft(c) > 0) return `Распределите все очки (осталось ${pointsLeft(c)})`;
    if (i === 3 && c.extraSkills.length < extraSkillSlots(c)) return 'Выберите обученные навыки';
    return null;
  }

  book = new Book(host, [origin, calling, attrs, skills, sheet], { heading: 'Личное дело', onClose: onCancel, canLeave });
  return book;
}
