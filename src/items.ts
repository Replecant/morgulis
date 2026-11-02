// ============================================================
//  Снаряжение отряда: слоты, предметы, итоговые характеристики
// ============================================================
import { WEAPONS } from './data';
import type { UnitBase } from './data';
import type { ProfId } from './rules';

export type Slot = 'main' | 'side' | 'head' | 'body' | 'hands' | 'legs' | 'charm' | 'belt';
export type ItemKind = 'weapon' | 'head' | 'body' | 'hands' | 'legs' | 'charm' | 'belt';

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
  weapon: 'Оружие', head: 'Головной убор', body: 'Броня тела', hands: 'Перчатки', legs: 'Обувь и поножи', charm: 'Оберег', belt: 'Патронташ',
};

export interface ItemMods { def?: number; atkM?: number; atkR?: number; move?: number; horror?: number }
export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  icon: string;             // ключ рисунка (gfx: drawItemIcon)
  desc: string;
  weapon?: string;          // ключ в WEAPONS
  armor?: number;           // поглощение урона
  mods?: ItemMods;
  reloads?: number;         // патронташ: перезарядок за бой
  grenades?: number;        // патронташ: доп. взрывчатка
  courage?: number;         // оберег: кураж в начале боя
  rally?: boolean;          // оберег: «есть ради кого вернуться»
  hat?: 'helmet' | 'cap';   // как выглядит на фигурке
}

// имя берётся из WEAPONS лениво — чтобы не зависеть от порядка загрузки модулей
const W = (id: string, weapon: string, icon: string, desc: string): Item => {
  const it = { id, kind: 'weapon', icon, desc, weapon } as Item;
  Object.defineProperty(it, 'name', { get: () => WEAPONS[weapon].name, enumerable: true });
  return it;
};

export const ITEMS: Record<string, Item> = {
  // ---------------- оружие
  revolver: W('revolver', 'revolver', 'pistol', 'Надёжный шестизарядный револьвер армейского образца.'),
  carbine:  W('carbine', 'carbine', 'rifle', 'Укороченная винтовка: удобна в тесноте, бьёт чуть слабее.'),
  rifle:    W('rifle', 'rifle', 'rifle_long', 'Длинная магазинная винтовка. Точна на большой дистанции.'),
  musket:   W('musket', 'musket', 'musket', 'Старое дульнозарядное ружьё. Неточное, но ещё стреляет.'),
  sawnoff:  W('sawnoff', 'sawnoff', 'shotgun', 'Двуствольный обрез. Страшен вблизи, бесполезен вдали.'),
  saber:    W('saber', 'saber', 'blade', 'Офицерская сабля. Знак чина — и острая сталь.'),
  bayonet:  W('bayonet', 'bayonet', 'knife', 'Штык-нож. Можно примкнуть, можно держать в руке.'),
  knife:    W('knife', 'knife', 'knife', 'Короткий боевой нож.'),
  axe:      W('axe', 'axe', 'axe', 'Тяжёлый топор с красной рукоятью. Рубит двери и кости.'),
  hammer:   W('hammer', 'hammer', 'hammer', 'Кузнечный молот. Медленный, но сокрушительный.'),
  wrench:   W('wrench', 'wrench', 'wrench', 'Гаечный ключ длиной в руку. Техник не расстаётся с ним.'),
  // ---------------- голова
  cap:      { id: 'cap', name: 'Офицерская фуражка', kind: 'head', icon: 'cap', hat: 'cap', desc: 'Не защищает, зато по уставу.' },
  helmet:   { id: 'helmet', name: 'Стальная каска', kind: 'head', icon: 'helmet', hat: 'helmet', mods: { def: 1 }, desc: 'Плоская каска пехотного образца. Отводит осколки и скользящие пули.' },
  // ---------------- тело
  greatcoat: { id: 'greatcoat', name: 'Плотная шинель', kind: 'body', icon: 'coat', armor: 1, desc: 'Толстое сукно гасит удар ножа и излёт пули.' },
  apron:     { id: 'apron', name: 'Кожаный фартук', kind: 'body', icon: 'apron', armor: 1, desc: 'Рабочий фартук техника из воловьей кожи.' },
  chitin:    { id: 'chitin', name: 'Хитиновый нагрудник', kind: 'body', icon: 'chitin', armor: 1, mods: { def: 1 }, desc: 'Ричмордская работа: пластины жучьего панциря на кожаной основе. Лёгкий и прочный.' },
  cuirass:   { id: 'cuirass', name: 'Стальная кираса', kind: 'body', icon: 'cuirass', armor: 2, mods: { move: -1 }, desc: 'Тяжёлый нагрудник старой имперской гвардии. Спасает жизнь, но сковывает шаг.' },
  // ---------------- руки
  gloves:    { id: 'gloves', name: 'Кожаные перчатки', kind: 'hands', icon: 'gloves', mods: { atkM: 1 }, desc: 'Крепкий хват рукояти: +1 к атакам вблизи.' },
  shootgloves: { id: 'shootgloves', name: 'Стрелковые перчатки', kind: 'hands', icon: 'gloves_thin', mods: { atkR: 1 }, desc: 'Тонкая кожа с открытым указательным пальцем: +1 к стрельбе.' },
  // ---------------- ноги
  boots:     { id: 'boots', name: 'Крепкие сапоги', kind: 'legs', icon: 'boots', mods: { move: 1 }, desc: 'Подкованные сапоги для долгих переходов: +1 к перемещению.' },
  greaves:   { id: 'greaves', name: 'Стальные поножи', kind: 'legs', icon: 'greaves', armor: 1, mods: { move: -1 }, desc: 'Пластины на голени и колене. Защищают, но тяжелы.' },
  // ---------------- обереги (действуют на дух владельца)
  rabbitfoot: { id: 'rabbitfoot', name: 'Кроличья лапка', kind: 'charm', icon: 'paw', courage: 1, desc: 'На удачу. Владелец идёт в бой с одним очком куража.' },
  wormwood:   { id: 'wormwood', name: 'Полынная ладанка', kind: 'charm', icon: 'herb', mods: { horror: 2 }, desc: 'Мешочек с горькой травой — народное средство от дурного глаза. +2 к стойкости против ужаса.' },
  locket:     { id: 'locket', name: 'Медальон с портретом', kind: 'charm', icon: 'locket', rally: true, desc: 'Есть ради кого вернуться. Если владельца поднимут после тяжёлого ранения — он встанет с половиной ОЗ.' },
  // ---------------- патронташи
  pouches:   { id: 'pouches', name: 'Ремень с подсумками', kind: 'belt', icon: 'belt', reloads: 2, desc: 'Пара подсумков на поясе: 2 перезарядки за бой.' },
  bandolier: { id: 'bandolier', name: 'Патронташ', kind: 'belt', icon: 'bandolier', reloads: 4, desc: 'Перевязь через плечо с гнёздами для патронов: 4 перезарядки за бой.' },
  grenadier: { id: 'grenadier', name: 'Подсумок гренадера', kind: 'belt', icon: 'belt_gren', reloads: 2, grenades: 1, desc: '2 перезарядки и гнездо под ещё одну шашку взрывчатки.' },
};

/** Без патронташа — только то, что влезло в карманы. */
export const BASE_RELOADS = 1;

export type Equip = Partial<Record<Slot, string>>;

/** Стартовое снаряжение героя по профессии. */
export const PROF_EQUIP: Record<ProfId, Equip> = {
  soldier:    { main: 'carbine', side: 'bayonet', head: 'cap', body: 'greatcoat', belt: 'pouches' },
  shooter:    { main: 'rifle', side: 'revolver', head: 'cap', hands: 'shootgloves', belt: 'bandolier' },
  saboteur:   { main: 'revolver', side: 'knife', head: 'cap', belt: 'grenadier' },
  occultist:  { main: 'revolver', side: 'knife', head: 'cap', charm: 'wormwood', belt: 'pouches' },
  technician: { main: 'revolver', side: 'wrench', head: 'cap', body: 'apron', hands: 'gloves', belt: 'pouches' },
  medic:      { main: 'revolver', side: 'knife', head: 'cap', belt: 'pouches' },
};
export const SQUAD_EQUIP: Record<string, Equip> = {
  halloway: { main: 'carbine', side: 'bayonet', head: 'helmet', body: 'greatcoat', belt: 'pouches' },
  pickett:  { main: 'rifle', side: 'bayonet', head: 'helmet', belt: 'pouches' },
  doe:      { main: 'carbine', side: 'bayonet', head: 'helmet', belt: 'pouches' },
};
/** Что лежит в обозе в начале игры. */
export const START_STASH = ['helmet', 'rabbitfoot'];

export function canEquip(slot: Slot, itemId: string) { return ITEMS[itemId]?.kind === SLOTS[slot].kind; }

export interface EquipStats {
  weapons: string[]; armor: number; def: number; atkM: number; atkR: number; move: number; horror: number;
  reloads: number; grenades: number; courage: number; rally: boolean;
}
/** Итоговые бонусы от надетых вещей. */
export function equipStats(b: UnitBase): EquipStats {
  const e = b.equip ?? {};
  const s: EquipStats = { weapons: [], armor: 0, def: 0, atkM: 0, atkR: 0, move: 0, horror: 0, reloads: BASE_RELOADS, grenades: 0, courage: 0, rally: false };
  for (const slot of SLOT_ORDER) {
    const it = e[slot] ? ITEMS[e[slot]!] : null;
    if (!it) continue;
    if (it.weapon) s.weapons.push(it.weapon);
    s.armor += it.armor ?? 0;
    for (const k in it.mods) (s as any)[k] += (it.mods as any)[k];
    if (it.reloads != null) s.reloads = it.reloads;
    s.grenades += it.grenades ?? 0;
    s.courage += it.courage ?? 0;
    if (it.rally) s.rally = true;
  }
  if (!s.weapons.length) s.weapons.push('fists');
  return s;
}

/** Краткая строка характеристик предмета для подсказок. */
export function itemStatLines(it: Item): string[] {
  const out: string[] = [];
  const sg = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
  if (it.weapon) {
    const w = WEAPONS[it.weapon];
    out.push(w.type === 'melee' ? 'Ближний бой' : `Дальность ${w.range}, без штрафа до ${w.opt}`);
    out.push(`Урон ${w.dmg[0]}–${w.dmg[1]} · бонус атаки ${w.atk >= 0 ? '+' : '−'}${Math.abs(w.atk)}`);
    if (w.ammo) out.push(`Магазин: ${w.ammo}`);
  }
  if (it.armor) out.push(`Поглощение ${it.armor}`);
  const names: Record<string, string> = { def: 'Защита', atkM: 'Атака вблизи', atkR: 'Стрельба', move: 'Перемещение', horror: 'Стойкость к ужасу' };
  for (const k in it.mods) out.push(`${names[k]} ${sg((it.mods as any)[k])}`);
  if (it.reloads != null) out.push(`Перезарядок за бой: ${it.reloads}`);
  if (it.grenades) out.push(`Взрывчатка +${it.grenades}`);
  if (it.courage) out.push(`Кураж в начале боя +${it.courage}`);
  return out;
}
