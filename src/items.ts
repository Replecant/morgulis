// ============================================================
//  Снаряжение: слоты, предметы, расходники, цены (шиллинги)
// ============================================================
import { WEAPONS } from './data';
import type { UnitBase } from './data';
import type { ProfId } from './rules';

export type Slot = 'main' | 'side' | 'head' | 'face' | 'body' | 'hands' | 'legs' | 'charm';
export type ItemKind = 'weapon' | 'head' | 'face' | 'body' | 'hands' | 'legs' | 'charm' | 'tool';

export const SLOTS: Record<Slot, { name: string; kind: ItemKind }> = {
  main: { name: 'Основное оружие', kind: 'weapon' },
  side: { name: 'Запасное оружие', kind: 'weapon' },
  head: { name: 'Голова', kind: 'head' },
  face: { name: 'Лицо', kind: 'face' },
  body: { name: 'Тело', kind: 'body' },
  hands: { name: 'Руки', kind: 'hands' },
  legs: { name: 'Ноги', kind: 'legs' },
  charm: { name: 'Оберег', kind: 'charm' },
};
export const SLOT_ORDER: Slot[] = ['main', 'side', 'head', 'face', 'body', 'hands', 'legs', 'charm'];
export const KIND_NAMES: Record<ItemKind, string> = {
  weapon: 'Оружие', head: 'Головной убор', face: 'Маска и очки', body: 'Броня и одежда', hands: 'Перчатки', legs: 'Обувь и поножи',
  charm: 'Оберег', tool: 'Специальное снаряжение',
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
  blast?: boolean;          // броня: урон от взрывов вдвое меньше
  courage?: number;         // оберег: кураж в начале боя
  rally?: boolean;          // оберег: «есть ради кого вернуться»
  gas?: boolean;            // лицо: противогаз — защита от газа и зловонного дыхания
  splinter?: boolean;       // лицо: защитная маска — осколки, дробь и брызги огня на 1 слабее
  lamp?: number;            // фонарь: 1 — масляный, 2 — электрический
  hat?: 'helmet' | 'cap' | 'tophat'; // как выглядит на фигурке
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
  bayonet:    W('bayonet', 'bayonet', 'bayonet', 6, 'Плоский игольчатый штык в ножнах. Можно примкнуть к винтовке — а можно бить и так.'),
  saber:      W('saber', 'saber', 'blade', 25, 'Офицерская сабля. Знак чина — и острая сталь.'),
  revolver:   W('revolver', 'revolver', 'pistol', 35, 'Шестизарядный револьвер армейского образца. Пистолетные патроны.'),
  autopistol: W('autopistol', 'autopistol', 'autopistol', 60, 'Самозарядный пистолет: магазин на 8 патронов, быстрая перезарядка обоймой.'),
  carbine:    W('carbine', 'carbine', 'carbine', 40, 'Укороченный кавалерийский карабин. Легче и удобнее винтовки, но бьёт ближе и слабее. Винтовочные патроны.'),
  rifle:      W('rifle', 'rifle', 'rifle', 50, 'Магазинная армейская винтовка. Надёжна, точна, бьёт далеко.'),
  huntrifle:  W('huntrifle', 'huntrifle', 'rifle_long', 70, 'Охотничья винтовка с оптикой: очень точна на дальней дистанции, но магазин мал.'),
  shotgun2:   W('shotgun2', 'shotgun2', 'shotgun', 40, 'Двуствольный дробовик. Страшен вблизи, вдали дробь теряет силу.'),
  sawnoff:    W('sawnoff', 'sawnoff', 'sawnoff', 18, 'Двустволка с отпиленными стволами и прикладом. Бандитское оружие: в упор — страшно, дальше пары шагов — почти бесполезно.'),
  pumpshot:   W('pumpshot', 'pumpshot', 'pump', 80, 'Помповый дробовик на пять патронов. Для тех, кто любит ближний бой.'),
  flamer:     W('flamer', 'flamer', 'flamer', 250, 'Огнемёт с ранцевым баллоном. Струя огня поражает цель и соседей, укрытия не спасают. Три залпа за бой; баллон заправляют между боями.', true),
  mg:         W('mg', 'mg', 'mg', 220, 'Ручной пулемёт на сошках, с коробом под ленту. Бьёт очередями: каждая пуля — отдельный бросок с −3, зато цель и всех рядом с ней прижимает к земле. Тяжёл: −1 к перемещению. Свои патроны — пулемётные ленты.', true),
  exprifle:   W('exprifle', 'exprifle', 'exprifle', 300, 'Экспериментальная винтовка из старых имперских мастерских. Пули пробивают любую броню.', true),
  // оружие, которое встречается как трофей
  musket:     W('musket', 'musket', 'musket', 6, 'Старое дульнозарядное ружьё. Неточное, но ещё стреляет.'),
  hammer:     W('hammer', 'hammer', 'hammer', 18, 'Тяжёлый молот на длинной рукояти, держат двумя руками. Медленный и неудобный, но сокрушительный.'),
  wrench:     W('wrench', 'wrench', 'wrench', 8, 'Гаечный ключ длиной в руку. Техник не расстаётся с ним.'),
  axe:        W('axe', 'axe', 'axe', 12, 'Тяжёлый топор на длинном топорище. Рубит двери и кости.'),
  trenchclub: W('trenchclub', 'trenchclub', 'tclub', 10, 'Короткая дубинка, обмотанная проволокой и утыканная гвоздями. В тесноте окопа ей сподручнее, чем штыком.'),
  spade:      W('spade', 'spade', 'spade', 12, 'Сапёрная лопатка с заточенным краем. Копает окопы и рубит не хуже топора.'),
  rdagger:    W('rdagger', 'rdagger', 'rdagger', 45, 'Узкий кинжал с чёрной рукоятью, клинок исчерчен знаками. Демонов и бесов режет так, будто знает их: +3 к урону по ним.', true),
  // ---------------- голова
  cap:      { id: 'cap', name: 'Кепи', kind: 'head', icon: 'cap', hat: 'cap', price: 4, desc: 'Не защищает, зато прикрывает голову от пепла.' },
  helmet:   { id: 'helmet', name: 'Стальная каска', kind: 'head', icon: 'helmet', hat: 'helmet', mods: { def: 1 }, price: 15, desc: 'Плоская каска пехотного образца. Отводит осколки и скользящие пули.' },
  tophat:   { id: 'tophat', name: 'Цилиндр', kind: 'head', icon: 'tophat', hat: 'tophat', price: 10, desc: 'Высокий чёрный цилиндр с потёртой лентой. Не защищает ни от чего — зато сразу видно, что человек знает больше, чем говорит.' },
  steelhelm: { id: 'steelhelm', name: 'Стальной шлем', kind: 'head', icon: 'steelhelm', hat: 'helmet', armor: 1, mods: { def: 1 }, price: 45, desc: 'Глубокий штурмовой шлем с назатыльником и толстым налобником. Держит не только осколки, но и прямой удар.' },
  // ---------------- лицо
  gasmask:  { id: 'gasmask', name: 'Противогаз', kind: 'face', icon: 'gasmask', gas: true, price: 25, desc: 'Резиновая маска с круглыми стёклами и коробкой фильтра. Кто в нём — тот дышит в газовом облаке (тратятся фильтры) и не боится зловонного дыхания.' },
  smask:    { id: 'smask', name: 'Защитная маска', kind: 'face', icon: 'smask', splinter: true, price: 20, desc: 'Стальная полумаска с кольчужной бармицей под глаза. Осколки взрывов, дробь и брызги огня наносят на 1 урона меньше.' },
  goggles:  { id: 'goggles', name: 'Защитные очки', kind: 'face', icon: 'goggles', mods: { atkR: 1 }, price: 15, desc: 'Толстые стёкла в кожаной оправе. Пепел и пыль не лезут в глаза: +1 к стрельбе.' },
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
  // ---------------- специальное снаряжение (лежит в обозе и работает, пока оно у вас есть)
  tools:      { id: 'tools', name: 'Набор инструментов', kind: 'tool', icon: 'toolbox', price: 30, tool: 'Без него не разобрать механизм и не починить оружие в походе.', desc: 'Ключи, отвёртки, напильник и моток проволоки в деревянном ящике.' },
  lockpicks:  { id: 'lockpicks', name: 'Отмычки', kind: 'tool', icon: 'picks', price: 20, tool: 'Без них замки не вскрыть.', desc: 'Связка тонких крючков и натяжителей в кожаном футляре.' },
  surgerykit: { id: 'surgerykit', name: 'Хирургический набор', kind: 'tool', icon: 'surgkit', price: 40, tool: 'Без него нельзя оперировать.', desc: 'Скальпели, зажимы, пила и кетгут в саквояже.' },
  grimoire:   { id: 'grimoire', name: 'Оккультный гримуар', kind: 'tool', icon: 'grimoire', price: 60, tool: 'Оккультисту — на один знак больше.', desc: 'Рукописная книга в почерневшем переплёте. Половина страниц исписана чужими почерками.' },
  ctools:     { id: 'ctools', name: 'Компактный набор инструментов', kind: 'tool', icon: 'ctools', price: 25, tool: 'Без него не разобрать механизм и не починить оружие в походе.', desc: 'Складные ключи, отвёртки и щупы в плоском кожаном свёртке. Помещается за пазухой.' },
  gauges:     { id: 'gauges', name: 'Измерительные инструменты', kind: 'tool', icon: 'gauges', price: 20, desc: 'Штангенциркуль, манометр, щупы и отвес в кожаном футляре.' },
  oillamp:    { id: 'oillamp', name: 'Масляный фонарь', kind: 'tool', icon: 'oillamp', lamp: 1, price: 15, tool: 'Свет вокруг отряда шире; в туман, дождь и бурю легче держать путь и замечать места.', desc: 'Жестяной фонарь со стеклом и фитилём. Коптит, пахнет жучьим жиром, но светит.' },
  elamp:      { id: 'elamp', name: 'Электрический фонарь', kind: 'tool', icon: 'elamp', lamp: 2, price: 90, rare: true, tool: 'Яркий луч: свет вокруг отряда намного шире; непогода почти не сбивает с пути, места видны издалека.', desc: 'Латунный фонарь с гальванической батареей. Редкая вещь: работает ровно и долго, и не гаснет на ветру.' },
  ritualkit:  { id: 'ritualkit', name: 'Ритуальные принадлежности', kind: 'tool', icon: 'ritual', price: 30, tool: 'Нужны для обрядов, в том числе для оккультного протеза.', desc: 'Мел, свечи из жучьего жира, сушёные травы, медная чаша.' },
};

// ------------------------------------------------------------ расходники
export type ConsId = 'bandage' | 'medkit' | 'antiseptic' | 'painkiller' | 'ammo_pistol' | 'ammo_rifle' | 'ammo_shell' | 'ammo_mg' | 'grenade' | 'dynamite' | 'parts' | 'smoke' | 'filter' | 'ration' | 'tissue';
export interface Consumable { id: ConsId; name: string; icon: string; price: number; pack: number; desc: string; short: string }
export const CONSUMABLES: Record<ConsId, Consumable> = {
  bandage:     { id: 'bandage', name: 'Бинты', short: 'Бинты', icon: 'bandage', price: 3, pack: 1, desc: 'Перевязка: +3 ОЗ и бонус Медицины. В бою — 1 ОД, поднимает тяжелораненого.' },
  medkit:      { id: 'medkit', name: 'Аптечка', short: 'Аптечки', icon: 'medkit', price: 15, pack: 1, desc: 'Полевая аптечка: +6 ОЗ и бонус Медицины, вне боя ещё и снимает одно лёгкое ранение.' },
  antiseptic:  { id: 'antiseptic', name: 'Антисептик', short: 'Антисептик', icon: 'bottle', price: 8, pack: 1, desc: 'Карболовый раствор. Тратится на каждую операцию.' },
  painkiller:  { id: 'painkiller', name: 'Обезболивающее', short: 'Обезбол.', icon: 'pills', price: 10, pack: 1, desc: 'В бою, 1 ОД: +3 ОЗ и +1 кураж — боль отступает, решимость возвращается.' },
  ammo_pistol: { id: 'ammo_pistol', name: 'Пистолетные патроны', short: 'Пист.', icon: 'ammo_p', price: 6, pack: 12, desc: 'Для револьвера и самозарядного пистолета. Пачка — 12 штук.' },
  ammo_rifle:  { id: 'ammo_rifle', name: 'Винтовочные патроны', short: 'Винт.', icon: 'ammo_r', price: 10, pack: 10, desc: 'Для армейской, охотничьей и экспериментальной винтовок. Пачка — 10 штук.' },
  ammo_shell:  { id: 'ammo_shell', name: 'Дробовые патроны', short: 'Дроб.', icon: 'ammo_s', price: 8, pack: 6, desc: 'Для дробовиков. Пачка — 6 штук.' },
  ammo_mg:     { id: 'ammo_mg', name: 'Пулемётная лента', short: 'Ленты', icon: 'ammo_mg', price: 18, pack: 15, desc: 'Для ручного пулемёта. Лента — 15 патронов.' },
  grenade:     { id: 'grenade', name: 'Ручная граната', short: 'Гранаты', icon: 'grenade', price: 20, pack: 1, desc: 'Бросок до 5 клеток. Взрыв 3×3, урон 3–5 — и своим тоже.' },
  dynamite:    { id: 'dynamite', name: 'Динамитная шашка', short: 'Динамит', icon: 'dynamite', price: 14, pack: 1, desc: 'Бросок до 4 клеток. Взрыв 3×3, урон 5–8 — и своим тоже; мешки, ящики и заборы в облаке разносит в щепки.' },
  smoke:       { id: 'smoke', name: 'Дымовая граната', short: 'Дым', icon: 'smoke', price: 12, pack: 1, desc: 'Облако 3×3 на два хода: закрывает обзор, стоящим в дыму +3 к Защите.' },
  parts:       { id: 'parts', name: 'Запасные детали', short: 'Детали', icon: 'parts', price: 5, pack: 1, desc: 'Пружины, бойки, винты и шплинты. Одна уходит на каждую удачную починку оружия в походе.' },
  filter:      { id: 'filter', name: 'Сменный фильтр', short: 'Фильтры', icon: 'filter', price: 6, pack: 1, desc: 'Коробка фильтра для противогаза. В газовом облаке одного хватает часа на три.' },
  tissue:      { id: 'tissue', name: 'Тканевый раствор', short: 'Раствор', icon: 'bottle', price: 12, pack: 1, desc: 'Мутная склянка из подпольной мастерской. Плотяной руке нужен раз в 3 дня, иначе — отторжение.' },
  ration:      { id: 'ration', name: 'Паёк', short: 'Пайки', icon: 'ration', price: 4, pack: 1, desc: 'Сухари, солонина или вяленое жучье мясо. Отряд съедает паёк раз в сутки; привал тоже стоит пайка.' },
};
export const CONS_ORDER: ConsId[] = ['bandage', 'medkit', 'antiseptic', 'painkiller', 'ammo_pistol', 'ammo_rifle', 'ammo_shell', 'ammo_mg', 'grenade', 'dynamite', 'smoke', 'parts', 'filter', 'ration', 'tissue'];
export const AMMO_NAME: Record<string, string> = { ammo_pistol: 'пист.', ammo_rifle: 'винт.', ammo_shell: 'дроб.', ammo_mg: 'лент.' };

export type Equip = Partial<Record<Slot, string>>;

/** Стартовое снаряжение героя по профессии. */
export const PROF_EQUIP: Record<ProfId, Equip> = {
  soldier:    { main: 'rifle', side: 'bayonet', head: 'helmet', body: 'greatcoat' },
  shooter:    { main: 'huntrifle', side: 'knife', head: 'cap', body: 'clothes' },
  saboteur:   { main: 'autopistol', side: 'knife', head: 'cap', body: 'clothes' },
  occultist:  { main: 'autopistol~w', side: 'rdagger', head: 'tophat', body: 'clothes' },
  technician: { main: 'autopistol', head: 'cap', body: 'clothes' },
  medic:      { main: 'revolver', head: 'cap', body: 'clothes' },
};
/** Стартовые припасы, спецснаряжение и деньги по профессии. */
export const PROF_START: Record<ProfId, { money: number; tools: string[]; cons: Partial<Record<ConsId, number>> }> = {
  soldier:    { money: 15, tools: [], cons: { ammo_rifle: 10, bandage: 1 } },
  shooter:    { money: 20, tools: [], cons: { ammo_rifle: 20 } },
  saboteur:   { money: 25, tools: ['lockpicks', 'ctools'], cons: { ammo_pistol: 8, grenade: 1 } },
  occultist:  { money: 30, tools: ['grimoire', 'ritualkit'], cons: { ammo_pistol: 8 } },
  technician: { money: 20, tools: ['tools', 'gauges'], cons: { ammo_pistol: 8, parts: 3 } },
  medic:      { money: 20, tools: ['surgerykit'], cons: { ammo_pistol: 6, bandage: 3, antiseptic: 1 } },
};
export const SQUAD_EQUIP: Record<string, Equip> = {
  halloway: { main: 'rifle', side: 'knife', head: 'helmet', body: 'greatcoat' },
  pickett:  { main: 'huntrifle', side: 'knife', head: 'helmet', body: 'clothes' },
  doe:      { main: 'rifle', side: 'knife', head: 'helmet', body: 'clothes' },
};
/** Что лежит в обозе в начале игры (кроме спецснаряжения профессии). */
export const START_STASH: string[] = [];

// ------------------------------------------------------------ вес (кг), см. load.ts
/** Вес вещей, кг. */
export const ITEM_WT: Record<string, number> = {
  knife: 0.5, saber: 1.5, revolver: 1.2, autopistol: 1, carbine: 3.5, rifle: 4.5, huntrifle: 5, shotgun2: 3.5, sawnoff: 2.5,
  pumpshot: 4, mg: 11, flamer: 18, exprifle: 5, musket: 5, hammer: 6, wrench: 2, axe: 3, trenchclub: 1.5, spade: 1.5, rdagger: 0.4,
  cap: 0.2, tophat: 0.3, helmet: 1.2, steelhelm: 2.5, gasmask: 1, smask: 1, goggles: 0.3,
  clothes: 1, greatcoat: 3, leather: 4, quilted: 6, cuirass: 10, sapper: 18, chitin: 4, apron: 2,
  gloves: 0.3, shootgloves: 0.2, boots: 1.5, greaves: 3,
  rabbitfoot: 0.1, wormwood: 0.1, locket: 0.1,
  tools: 6, ctools: 1.5, gauges: 1, bayonet: 0.5, lockpicks: 0.3, surgerykit: 3, grimoire: 1.5, ritualkit: 2, oillamp: 1.5, elamp: 2,
};
/** Вес одной штуки расходника, кг (патроны — за патрон). */
export const CONS_WT: Record<ConsId, number> = {
  bandage: 0.1, medkit: 1, antiseptic: 0.3, painkiller: 0.1, ammo_pistol: 0.02, ammo_rifle: 0.03, ammo_shell: 0.05, ammo_mg: 0.04,
  grenade: 0.6, dynamite: 0.3, parts: 0.2, smoke: 0.5, filter: 0.3, tissue: 0.4, ration: 0.5,
};

// ------------------------------------------------------------ состояние оружия
// Экземпляр в обозе или в слоте — строка id: «rifle» (идеальное), «rifle~w» (изношенное), «rifle~b» (сломанное).
export type Cond = 'ok' | 'worn' | 'broken';
export const COND_NAME: Record<Cond, string> = { ok: 'Идеальное', worn: 'Изношенное', broken: 'Сломанное' };
export const baseId = (id: string) => id.split('~')[0];
export const condOf = (id: string): Cond => (id.endsWith('~w') ? 'worn' : id.endsWith('~b') ? 'broken' : 'ok');
export const withCond = (id: string, c: Cond) => baseId(id) + (c === 'worn' ? '~w' : c === 'broken' ? '~b' : '');
/** Предмет по id экземпляра (с пометкой состояния или без). */
export const itemOf = (id: string): Item => ITEMS[baseId(id)];
export const itemWt = (id: string) => ITEM_WT[baseId(id)] ?? 1;
/** Название с состоянием: «Армейская винтовка (изношенная)». */
export const itemName = (id: string) => { const c = condOf(id); return itemOf(id).name + (c === 'worn' ? ' (изношено)' : c === 'broken' ? ' (сломано)' : ''); };
/** Цена экземпляра с учётом износа. */
export const itemPrice = (id: string) => { const p = itemOf(id).price, c = condOf(id); return c === 'worn' ? Math.max(1, Math.round(p * 0.6)) : c === 'broken' ? Math.max(1, Math.round(p * 0.25)) : p; };
/** Сколько стоит починка у торговца: изношенное — четверть цены, сломанное — половина. */
export const repairPrice = (id: string) => { const p = itemOf(id).price, c = condOf(id); return c === 'worn' ? Math.max(2, Math.round(p * 0.25)) : c === 'broken' ? Math.max(3, Math.round(p * 0.5)) : 0; };

export const canEquip = (slot: Slot, itemId: string) => !!itemOf(itemId) && itemOf(itemId).kind === SLOTS[slot].kind && condOf(itemId) !== 'broken';
export const sellPrice = (price: number) => Math.max(1, Math.floor(price / 2));

export interface EquipStats {
  weapons: string[]; worn: string[]; armor: number; def: number; atkM: number; atkR: number; move: number; horror: number;
  blast: boolean; gas: boolean; splinter: boolean; courage: number; rally: boolean;
}
/** Итоговые бонусы от надетых вещей. */
export function equipStats(b: UnitBase): EquipStats {
  const e = b.equip ?? {};
  const s: EquipStats = { weapons: [], worn: [], armor: 0, def: 0, atkM: 0, atkR: 0, move: 0, horror: 0, blast: false, gas: false, splinter: false, courage: 0, rally: false };
  for (const slot of SLOT_ORDER) {
    const id = e[slot], it = id ? itemOf(id) : null;
    if (!it || condOf(id!) === 'broken') continue;
    if (it.weapon) { s.weapons.push(it.weapon); if (condOf(id!) === 'worn') s.worn.push(it.weapon); }
    s.armor += it.armor ?? 0;
    for (const k in it.mods) (s as any)[k] += (it.mods as any)[k];
    if (it.weapon && WEAPONS[it.weapon].heavy) s.move -= 1;
    if (it.blast) s.blast = true;
    if (it.gas) s.gas = true;
    if (it.splinter) s.splinter = true;
    s.courage += it.courage ?? 0;
    if (it.rally) s.rally = true;
  }
  if (!s.weapons.length) s.weapons.push('fists');
  return s;
}

/** Строки характеристик предмета для подсказок (id — экземпляр, с состоянием). */
export function itemStatLines(id: string): string[] {
  const it = itemOf(id), out: string[] = [];
  const sg = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
  if (it.weapon) {
    const w = WEAPONS[it.weapon];
    out.push(w.type === 'melee' ? 'Ближний бой' : `Дальность ${w.range}, без штрафа до ${w.opt}`);
    out.push(`Урон ${w.dmg[0]}–${w.dmg[1]} · бонус атаки ${w.atk >= 0 ? '+' : '−'}${Math.abs(w.atk)}`);
    if (w.burst) out.push(`Очередь: ${w.burst} выстрела, каждый с −3; цель и соседи с ней подавлены (−2 к атакам и перемещению)`);
    if (w.ammo) out.push(w.ammoType ? `Магазин ${w.ammo} · ${CONSUMABLES[w.ammoType as ConsId].name.toLowerCase()}` : `Заряды: ${w.ammo} за бой`);
    if (w.shot) out.push('Дробь: −1 урона за каждую клетку дальше оптимальной');
    if (w.pierce) out.push('Пробивает броню');
    if (w.splash) out.push('Задевает соседние клетки, укрытия не спасают');
    if (w.antiDemon) out.push(`+${w.antiDemon} к урону по демонам и бесам`);
    if (w.heavy) out.push('Тяжёлое: −1 к перемещению');
    const c = condOf(id);
    out.push(`Состояние: ${COND_NAME[c]}` + (c === 'worn' ? (w.ammoType ? ' — может заклинить (1–2 на d20)' : ' — −1 к урону') : c === 'broken' ? ' — не стреляет и не рубит, нужна починка' : ''));
  }
  if (it.armor) out.push(`Поглощение ${it.armor}`);
  const names: Record<string, string> = { def: 'Защита', atkM: 'Атака вблизи', atkR: 'Стрельба', move: 'Перемещение', horror: 'Стойкость к ужасу' };
  for (const k in it.mods) out.push(`${names[k]} ${sg((it.mods as any)[k])}`);
  if (it.blast) out.push('Урон от взрывов вдвое меньше');
  if (it.gas) out.push('Газ и зловонное дыхание не действуют (на карте тратятся фильтры)');
  if (it.splinter) out.push('Осколки, дробь и огонь: −1 урона');
  if (it.courage) out.push(`Кураж в начале боя +${it.courage}`);
  if (it.tool) out.push(it.tool);
  out.push(`Вес: ${String(itemWt(id)).replace('.', ',')} кг · цена: ${itemPrice(id)} ш.`);
  return out;
}
