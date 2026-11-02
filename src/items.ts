// ============================================================
//  Снаряжение: слоты, предметы, расходники, цены (шиллинги)
// ============================================================
import { WEAPONS } from './data';
import type { UnitBase } from './data';
import type { ProfId } from './rules';

export type Slot = 'main' | 'side' | 'head' | 'body' | 'hands' | 'legs' | 'charm' | 'belt';
export type ItemKind = 'weapon' | 'head' | 'body' | 'hands' | 'legs' | 'charm' | 'belt' | 'tool';

export const SLOTS: Record<Slot, { name: string; kind: ItemKind }> = {
  main: { name: 'Основное оружие', kind: 'weapon' },
  side: { name: 'Запасное оружие', kind: 'weapon' },
  head: { name: 'Голова', kind: 'head' },
  body: { name: 'Тело', kind: 'body' },
  hands: { name: 'Руки', kind: 'hands' },
  legs: { name: 'Ноги', kind: 'legs' },
  charm: { name: 'Оберег', kind: 'charm' },
  belt: { name: 'Патронташ', kind: 'belt' },
};
export const SLOT_ORDER: Slot[] = ['main', 'side', 'head', 'body', 'hands', 'legs', 'charm', 'belt'];
export const KIND_NAMES: Record<ItemKind, string> = {
  weapon: 'Оружие', head: 'Головной убор', body: 'Броня и одежда', hands: 'Перчатки', legs: 'Обувь и поножи',
  charm: 'Оберег', belt: 'Патронташ', tool: 'Специальное снаряжение',
};

export interface ItemMods { def?: number; atkM?: number; atkR?: number; move?: number; horror?: number }
export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  icon: string;             // ключ рисунка (inventory: drawItemIcon)
  desc: string;
  price: number;            // цена в шиллингах
  rare?: boolean;
  weapon?: string;          // ключ в WEAPONS
  armor?: number;           // поглощение урона
  mods?: ItemMods;
  grenades?: number;        // патронташ: сколько гранат можно применить за бой
  quick?: boolean;          // патронташ: одна перезарядка за ход без траты ОД
  blast?: boolean;          // броня: урон от взрывов вдвое меньше
  courage?: number;         // оберег: кураж в начале боя
  rally?: boolean;          // оберег: «есть ради кого вернуться»
  hat?: 'helmet' | 'cap';   // как выглядит на фигурке
  tool?: string;            // спецснаряжение: что даёт
}

// имя берётся из WEAPONS лениво — чтобы не зависеть от порядка загрузки модулей
const W = (id: string, weapon: string, icon: string, price: number, desc: string, rare = false): Item => {
  const it = { id, kind: 'weapon', icon, desc, weapon, price, rare } as Item;
  Object.defineProperty(it, 'name', { get: () => WEAPONS[weapon].name, enumerable: true });
  return it;
};

export const ITEMS: Record<string, Item> = {
  // ---------------- оружие
  knife:      W('knife', 'knife', 'knife', 8, 'Короткий боевой нож. Всегда под рукой.'),
  saber:      W('saber', 'saber', 'blade', 25, 'Офицерская сабля. Знак чина — и острая сталь.'),
  revolver:   W('revolver', 'revolver', 'pistol', 35, 'Шестизарядный револьвер армейского образца. Пистолетные патроны.'),
  autopistol: W('autopistol', 'autopistol', 'autopistol', 60, 'Самозарядный пистолет: магазин на 8 патронов, быстрая перезарядка обоймой.'),
  rifle:      W('rifle', 'rifle', 'rifle', 50, 'Магазинная армейская винтовка. Надёжна, точна, бьёт далеко.'),
  huntrifle:  W('huntrifle', 'huntrifle', 'rifle_long', 70, 'Охотничья винтовка с оптикой: очень точна на дальней дистанции, но магазин мал.'),
  shotgun2:   W('shotgun2', 'shotgun2', 'shotgun', 40, 'Двуствольный дробовик. Страшен вблизи, вдали дробь теряет силу.'),
  pumpshot:   W('pumpshot', 'pumpshot', 'pump', 80, 'Помповый дробовик на пять патронов. Для тех, кто любит ближний бой.'),
  flamer:     W('flamer', 'flamer', 'flamer', 250, 'Огнемёт с ранцевым баллоном. Струя огня поражает цель и соседей, укрытия не спасают. Три залпа за бой; баллон заправляют между боями.', true),
  exprifle:   W('exprifle', 'exprifle', 'exprifle', 300, 'Экспериментальная винтовка из старых имперских мастерских. Пули пробивают любую броню.', true),
  // оружие, которое встречается как трофей
  musket:     W('musket', 'musket', 'musket', 6, 'Старое дульнозарядное ружьё. Неточное, но ещё стреляет.'),
  hammer:     W('hammer', 'hammer', 'hammer', 10, 'Кузнечный молот. Медленный, но сокрушительный.'),
  wrench:     W('wrench', 'wrench', 'wrench', 8, 'Гаечный ключ длиной в руку. Техник не расстаётся с ним.'),
  axe:        W('axe', 'axe', 'axe', 12, 'Тяжёлый топор с красной рукоятью. Рубит двери и кости.'),
  // ---------------- голова
  cap:      { id: 'cap', name: 'Кепи', kind: 'head', icon: 'cap', hat: 'cap', price: 4, desc: 'Не защищает, зато прикрывает голову от пепла.' },
  helmet:   { id: 'helmet', name: 'Стальная каска', kind: 'head', icon: 'helmet', hat: 'helmet', mods: { def: 1 }, price: 15, desc: 'Плоская каска пехотного образца. Отводит осколки и скользящие пули.' },
  // ---------------- броня и одежда
  clothes:   { id: 'clothes', name: 'Обычная одежда', kind: 'body', icon: 'clothes', armor: 0, price: 4, desc: 'Рубаха, жилет, штаны. Не защищает ни от чего, кроме взглядов.' },
  greatcoat: { id: 'greatcoat', name: 'Плотная шинель', kind: 'body', icon: 'coat', armor: 1, price: 20, desc: 'Толстое сукно гасит удар ножа и излёт пули.' },
  leather:   { id: 'leather', name: 'Кожаная защитная куртка', kind: 'body', icon: 'jacket', armor: 1, mods: { def: 1 }, price: 30, desc: 'Толстая кожа с нашитыми пластинами. Лёгкая, не мешает двигаться.' },
  quilted:   { id: 'quilted', name: 'Стёганый бронежилет', kind: 'body', icon: 'vest', armor: 2, price: 45, desc: 'Многослойная стёганка с прослойкой из стальной стружки.' },
  cuirass:   { id: 'cuirass', name: 'Стальная кираса', kind: 'body', icon: 'cuirass', armor: 3, mods: { move: -1 }, price: 90, desc: 'Тяжёлый нагрудник старой имперской гвардии. Спасает жизнь, но сковывает шаг.' },
  sapper:    { id: 'sapper', name: 'Тяжёлый сапёрный доспех', kind: 'body', icon: 'sapper', armor: 4, mods: { move: -2, atkR: -1 }, blast: true, price: 160, desc: 'Панцирь сапёра с кольчужным воротом и пластинами на бёдрах. Взрывы наносят вдвое меньше урона. Очень тяжёл.', rare: true },
  chitin:    { id: 'chitin', name: 'Хитиновый нагрудник', kind: 'body', icon: 'chitin', armor: 1, mods: { def: 1 }, price: 40, desc: 'Ричмордская работа: пластины жучьего панциря на кожаной основе. Лёгкий и прочный.' },
  apron:     { id: 'apron', name: 'Кожаный фартук', kind: 'body', icon: 'apron', armor: 1, price: 15, desc: 'Рабочий фартук из воловьей кожи.' },
  // ---------------- руки и ноги
  gloves:      { id: 'gloves', name: 'Кожаные перчатки', kind: 'hands', icon: 'gloves', mods: { atkM: 1 }, price: 12, desc: 'Крепкий хват рукояти: +1 к атакам вблизи.' },
  shootgloves: { id: 'shootgloves', name: 'Стрелковые перчатки', kind: 'hands', icon: 'gloves_thin', mods: { atkR: 1 }, price: 15, desc: 'Тонкая кожа с открытым указательным пальцем: +1 к стрельбе.' },
  boots:       { id: 'boots', name: 'Крепкие сапоги', kind: 'legs', icon: 'boots', mods: { move: 1 }, price: 15, desc: 'Подкованные сапоги для долгих переходов: +1 к перемещению.' },
  greaves:     { id: 'greaves', name: 'Стальные поножи', kind: 'legs', icon: 'greaves', armor: 1, mods: { move: -1 }, price: 30, desc: 'Пластины на голени и колене. Защищают, но тяжелы.' },
  // ---------------- обереги (действуют на дух владельца)
  rabbitfoot: { id: 'rabbitfoot', name: 'Кроличья лапка', kind: 'charm', icon: 'paw', courage: 1, price: 12, desc: 'На удачу. Владелец идёт в бой с одним очком куража.' },
  wormwood:   { id: 'wormwood', name: 'Полынная ладанка', kind: 'charm', icon: 'herb', mods: { horror: 2 }, price: 10, desc: 'Мешочек с горькой травой — народное средство от дурного глаза. +2 к стойкости против ужаса.' },
  locket:     { id: 'locket', name: 'Медальон с портретом', kind: 'charm', icon: 'locket', rally: true, price: 20, desc: 'Есть ради кого вернуться. Если владельца поднимут после тяжёлого ранения — он встанет с половиной ОЗ.' },
  // ---------------- патронташи
  pouches:   { id: 'pouches', name: 'Ремень с подсумками', kind: 'belt', icon: 'belt', grenades: 2, price: 10, desc: 'Пара подсумков на поясе: до 2 гранат за бой.' },
  bandolier: { id: 'bandolier', name: 'Патронташ', kind: 'belt', icon: 'bandolier', grenades: 1, quick: true, price: 20, desc: 'Перевязь с гнёздами для патронов: одна перезарядка за ход не тратит ОД. 1 граната за бой.' },
  grenadier: { id: 'grenadier', name: 'Подсумок гренадера', kind: 'belt', icon: 'belt_gren', grenades: 3, price: 25, desc: 'Гнёзда под гранаты: до 3 гранат за бой.' },
  // ---------------- специальное снаряжение (лежит в обозе и работает, пока оно у вас есть)
  gasmask:    { id: 'gasmask', name: 'Противогаз', kind: 'tool', icon: 'gasmask', price: 25, tool: 'Защита от газа и спор (нужны фильтры).', desc: 'Резиновая маска с круглыми стёклами и коробкой фильтра. Пригодится в штольнях и газовых облаках (в разработке).' },
  tools:      { id: 'tools', name: 'Набор инструментов', kind: 'tool', icon: 'toolbox', price: 30, tool: '+2 к проверкам Механики.', desc: 'Ключи, отвёртки, напильник и моток проволоки в деревянном ящике.' },
  lockpicks:  { id: 'lockpicks', name: 'Отмычки', kind: 'tool', icon: 'picks', price: 20, tool: '+2 к Скрытности при взломе; без них многие замки не открыть.', desc: 'Связка тонких крючков и натяжителей в кожаном футляре.' },
  surgerykit: { id: 'surgerykit', name: 'Хирургический набор', kind: 'tool', icon: 'surgkit', price: 40, tool: 'Без него нельзя оперировать; +2 к проверкам Медицины.', desc: 'Скальпели, зажимы, пила и кетгут в саквояже.' },
  grimoire:   { id: 'grimoire', name: 'Оккультный гримуар', kind: 'tool', icon: 'grimoire', price: 60, tool: 'Нужен для ритуалов (в разработке).', desc: 'Рукописная книга в почерневшем переплёте. Половина страниц исписана чужими почерками.' },
  ritualkit:  { id: 'ritualkit', name: 'Ритуальные принадлежности', kind: 'tool', icon: 'ritual', price: 30, tool: 'Нужны для ритуалов (в разработке).', desc: 'Мел, свечи из жучьего жира, сушёные травы, медная чаша.' },
};

// ------------------------------------------------------------ расходники
export type ConsId = 'bandage' | 'medkit' | 'antiseptic' | 'painkiller' | 'ammo_pistol' | 'ammo_rifle' | 'ammo_shell' | 'grenade' | 'smoke' | 'filter' | 'ration';
export interface Consumable { id: ConsId; name: string; icon: string; price: number; pack: number; desc: string; short: string }
export const CONSUMABLES: Record<ConsId, Consumable> = {
  bandage:     { id: 'bandage', name: 'Бинты', short: 'Бинты', icon: 'bandage', price: 3, pack: 1, desc: 'Перевязка: +3 ОЗ и бонус Медицины. В бою — 1 ОД, поднимает тяжелораненого.' },
  medkit:      { id: 'medkit', name: 'Аптечка', short: 'Аптечки', icon: 'medkit', price: 15, pack: 1, desc: 'Полевая аптечка: +6 ОЗ и бонус Медицины, вне боя ещё и снимает одно лёгкое ранение.' },
  antiseptic:  { id: 'antiseptic', name: 'Антисептик', short: 'Антисептик', icon: 'bottle', price: 8, pack: 1, desc: 'Карболовый раствор. Тратится на каждую операцию.' },
  painkiller:  { id: 'painkiller', name: 'Обезболивающее', short: 'Обезбол.', icon: 'pills', price: 10, pack: 1, desc: 'В бою, 1 ОД: +3 ОЗ и +1 кураж — боль отступает, решимость возвращается.' },
  ammo_pistol: { id: 'ammo_pistol', name: 'Пистолетные патроны', short: 'Пист.', icon: 'ammo_p', price: 6, pack: 12, desc: 'Для револьвера и самозарядного пистолета. Пачка — 12 штук.' },
  ammo_rifle:  { id: 'ammo_rifle', name: 'Винтовочные патроны', short: 'Винт.', icon: 'ammo_r', price: 10, pack: 10, desc: 'Для армейской, охотничьей и экспериментальной винтовок. Пачка — 10 штук.' },
  ammo_shell:  { id: 'ammo_shell', name: 'Дробовые патроны', short: 'Дроб.', icon: 'ammo_s', price: 8, pack: 6, desc: 'Для дробовиков. Пачка — 6 штук.' },
  grenade:     { id: 'grenade', name: 'Ручная граната', short: 'Гранаты', icon: 'grenade', price: 20, pack: 1, desc: 'Взрыв 3×3, урон 3–5 — и своим тоже. Сколько можно бросить за бой, зависит от патронташа.' },
  smoke:       { id: 'smoke', name: 'Дымовая граната', short: 'Дым', icon: 'smoke', price: 12, pack: 1, desc: 'Облако 3×3 на два хода: закрывает обзор, стоящим в дыму +3 к Защите.' },
  filter:      { id: 'filter', name: 'Сменный фильтр', short: 'Фильтры', icon: 'filter', price: 6, pack: 1, desc: 'Коробка фильтра для противогаза (в разработке).' },
  ration:      { id: 'ration', name: 'Паёк', short: 'Пайки', icon: 'ration', price: 4, pack: 1, desc: 'Сухари, солонина или вяленое жучье мясо. Отряд съедает паёк раз в сутки; привал тоже стоит пайка.' },
};
export const CONS_ORDER: ConsId[] = ['bandage', 'medkit', 'antiseptic', 'painkiller', 'ammo_pistol', 'ammo_rifle', 'ammo_shell', 'grenade', 'smoke', 'filter', 'ration'];
export const AMMO_NAME: Record<string, string> = { ammo_pistol: 'пист.', ammo_rifle: 'винт.', ammo_shell: 'дроб.' };

/** Без патронташа — одна граната за бой. */
export const BASE_GRENADES = 1;

export type Equip = Partial<Record<Slot, string>>;

/** Стартовое снаряжение героя по профессии. */
export const PROF_EQUIP: Record<ProfId, Equip> = {
  soldier:    { main: 'rifle', side: 'knife', head: 'helmet', body: 'greatcoat', belt: 'pouches' },
  shooter:    { main: 'huntrifle', side: 'revolver', head: 'cap', body: 'clothes', hands: 'shootgloves', belt: 'bandolier' },
  saboteur:   { main: 'autopistol', side: 'knife', head: 'cap', body: 'leather', belt: 'grenadier' },
  occultist:  { main: 'revolver', side: 'knife', head: 'cap', body: 'clothes', charm: 'wormwood' },
  technician: { main: 'shotgun2', side: 'wrench', head: 'cap', body: 'apron', hands: 'gloves' },
  medic:      { main: 'revolver', side: 'knife', head: 'cap', body: 'clothes' },
};
/** Стартовые припасы, спецснаряжение и деньги по профессии. */
export const PROF_START: Record<ProfId, { money: number; tools: string[]; cons: Partial<Record<ConsId, number>> }> = {
  soldier:    { money: 15, tools: [], cons: { ammo_rifle: 20, grenade: 1, bandage: 2 } },
  shooter:    { money: 20, tools: [], cons: { ammo_rifle: 20, ammo_pistol: 12, bandage: 2 } },
  saboteur:   { money: 25, tools: ['lockpicks'], cons: { ammo_pistol: 24, grenade: 2, smoke: 1, bandage: 1 } },
  occultist:  { money: 30, tools: ['grimoire', 'ritualkit'], cons: { ammo_pistol: 12, bandage: 2 } },
  technician: { money: 20, tools: ['tools', 'gasmask'], cons: { ammo_shell: 12, grenade: 1, filter: 2, bandage: 1 } },
  medic:      { money: 20, tools: ['surgerykit'], cons: { ammo_pistol: 12, bandage: 4, medkit: 1, antiseptic: 2, painkiller: 1 } },
};
export const SQUAD_EQUIP: Record<string, Equip> = {
  halloway: { main: 'rifle', side: 'knife', head: 'helmet', body: 'greatcoat', belt: 'pouches' },
  pickett:  { main: 'huntrifle', side: 'knife', head: 'helmet', body: 'clothes' },
  doe:      { main: 'rifle', side: 'knife', head: 'helmet', body: 'clothes' },
};
/** Что лежит в обозе в начале игры (кроме спецснаряжения профессии). */
export const START_STASH: string[] = [];

export const canEquip = (slot: Slot, itemId: string) => ITEMS[itemId]?.kind === SLOTS[slot].kind;
export const sellPrice = (price: number) => Math.max(1, Math.floor(price / 2));

export interface EquipStats {
  weapons: string[]; armor: number; def: number; atkM: number; atkR: number; move: number; horror: number;
  grenades: number; quick: boolean; blast: boolean; courage: number; rally: boolean;
}
/** Итоговые бонусы от надетых вещей. */
export function equipStats(b: UnitBase): EquipStats {
  const e = b.equip ?? {};
  const s: EquipStats = { weapons: [], armor: 0, def: 0, atkM: 0, atkR: 0, move: 0, horror: 0, grenades: BASE_GRENADES, quick: false, blast: false, courage: 0, rally: false };
  for (const slot of SLOT_ORDER) {
    const it = e[slot] ? ITEMS[e[slot]!] : null;
    if (!it) continue;
    if (it.weapon) s.weapons.push(it.weapon);
    s.armor += it.armor ?? 0;
    for (const k in it.mods) (s as any)[k] += (it.mods as any)[k];
    if (it.grenades != null) s.grenades = it.grenades;
    if (it.quick) s.quick = true;
    if (it.blast) s.blast = true;
    s.courage += it.courage ?? 0;
    if (it.rally) s.rally = true;
  }
  if (!s.weapons.length) s.weapons.push('fists');
  return s;
}

/** Строки характеристик предмета для подсказок. */
export function itemStatLines(it: Item): string[] {
  const out: string[] = [];
  const sg = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
  if (it.weapon) {
    const w = WEAPONS[it.weapon];
    out.push(w.type === 'melee' ? 'Ближний бой' : `Дальность ${w.range}, без штрафа до ${w.opt}`);
    out.push(`Урон ${w.dmg[0]}–${w.dmg[1]} · бонус атаки ${w.atk >= 0 ? '+' : '−'}${Math.abs(w.atk)}`);
    if (w.ammo) out.push(w.ammoType ? `Магазин ${w.ammo} · ${CONSUMABLES[w.ammoType as ConsId].name.toLowerCase()}` : `Заряды: ${w.ammo} за бой`);
    if (w.shot) out.push('Дробь: −1 урона за каждую клетку дальше оптимальной');
    if (w.pierce) out.push('Пробивает броню');
    if (w.splash) out.push('Задевает соседние клетки, укрытия не спасают');
  }
  if (it.armor) out.push(`Поглощение ${it.armor}`);
  const names: Record<string, string> = { def: 'Защита', atkM: 'Атака вблизи', atkR: 'Стрельба', move: 'Перемещение', horror: 'Стойкость к ужасу' };
  for (const k in it.mods) out.push(`${names[k]} ${sg((it.mods as any)[k])}`);
  if (it.blast) out.push('Урон от взрывов вдвое меньше');
  if (it.grenades != null) out.push(`Гранат за бой: ${it.grenades}`);
  if (it.quick) out.push('Быстрая перезарядка: одна за ход без ОД');
  if (it.courage) out.push(`Кураж в начале боя +${it.courage}`);
  if (it.tool) out.push(it.tool);
  out.push(`Цена: ${it.price} ш.`);
  return out;
}
