// ============================================================
//  Внешность персонажей (стили для пиксельных спрайтов), мерцание, виньетка
// ============================================================
import { TAU } from './util';
import { drawSprite, clearSpriteCache } from './sprites';
import { Character, PROFESSIONS } from './rules';
import { ITEMS } from './items';
import type { UnitBase } from './data';

type Ctx = CanvasRenderingContext2D;

interface Style {
  coat?: string; legs?: string; skin?: string; hair?: string; beard?: string;
  hat?: 'cap' | 'helmet' | 'tophat' | 'bonnet' | 'flatcap' | 'minerhelm' | 'brodie';
  hatC?: string; trim?: string; belt?: string; apron?: string;
  dress?: boolean; collar?: boolean; mask?: boolean; band?: boolean; sash?: boolean; hood?: boolean; longHair?: boolean; goggles?: boolean; cuirass?: boolean;
  undead?: boolean; tanks?: boolean;
  puttees?: string; webbing?: string; respirator?: boolean; tabs?: string; // военная форма: обмотки, ремни с подсумками, противогаз, петлицы
  limbs?: Partial<Record<string, string>>; // утраченные части тела и протезы (prosthetics.ts) — видны на фигурке // траншейные мертвецы: гнилая кожа, светящиеся глаза; газовые баллоны за спиной
  weapon?: 'saber' | 'rifle' | 'fork' | 'musket' | 'hammer' | 'staff' | 'pole' | 'bottle' | 'book' | 'wrench' | 'bag' | 'knife' | 'pistol' | 'goad' | 'shovel';
  scale?: number;
}

export const STYLES: Record<string, Style> = {
  lieutenant: { coat: '#5a2622', legs: '#1c1a17', trim: '#c09a52', belt: '#2a1d12', hat: 'cap', hatC: '#2b1513', skin: '#cdb69a', weapon: 'saber' },
  sergeant: { coat: '#4b4e3b', legs: '#24251d', belt: '#2c2418', hat: 'helmet', hatC: '#3d4030', mask: true, weapon: 'rifle' },
  sniper: { coat: '#474b3a', legs: '#24251d', belt: '#2c2418', hat: 'helmet', hatC: '#3a3d2d', mask: true, weapon: 'rifle' },
  medic: { coat: '#4d4f3e', legs: '#24251d', belt: '#2c2418', hat: 'helmet', hatC: '#3d4030', mask: true, band: true, weapon: 'rifle' },
  elder: { coat: '#3f3a32', legs: '#24211c', hat: 'tophat', hatC: '#191715', beard: '#b8b4aa', skin: '#c4b29c' },
  widow: { coat: '#2b282d', dress: true, hat: 'bonnet', hatC: '#17151a', skin: '#c0ae98', weapon: 'pole' },
  priest: { coat: '#141414', dress: true, collar: true, hair: '#8a8a86', skin: '#c8b8a2' },
  boy: { coat: '#5a4a35', legs: '#3a3226', hat: 'flatcap', hatC: '#3a3226', scale: 0.78, skin: '#d2bca0' },
  miner: { coat: '#3c382f', legs: '#2a2721', hat: 'minerhelm', hatC: '#5a4a2a', beard: '#6a655c', weapon: 'bottle' },
  militia: { coat: '#5a4a36', legs: '#2e2a22', hat: 'flatcap', hatC: '#2c2620', weapon: 'fork', skin: '#bfa88c' },
  militia_gun: { coat: '#4a4232', legs: '#2a261f', hair: '#3a2a1a', weapon: 'musket', skin: '#bfa88c', belt: '#2a1d12' },
  fanatic: { coat: '#3e3b30', legs: '#25231d', hat: 'flatcap', hatC: '#1e1d18', weapon: 'fork', sash: true },
  fanatic_gun: { coat: '#38362c', legs: '#25231d', hair: '#222', weapon: 'musket', sash: true },
  smith: { coat: '#3a2d22', legs: '#221c16', apron: '#5b3b22', hair: '#1c1a18', beard: '#1c1a18', weapon: 'hammer', scale: 1.15, skin: '#b89a7c' },
  cultist: { coat: '#0f0f12', dress: true, hood: true, weapon: 'staff', scale: 1.05 },
  imp: {},
  // жители региона
  foreman: { coat: '#3a3428', dress: true, apron: '#211b14', hat: 'flatcap', hatC: '#2a2218', skin: '#c8ac90', hair: '#5a3a22', longHair: true, weapon: 'wrench' },
  oilworker: { coat: '#2e2c26', legs: '#1e1c18', apron: '#1a1712', hat: 'flatcap', hatC: '#1e1c18', skin: '#b89878', beard: '#3a2a1a', weapon: 'wrench' },
  herder: { coat: '#4a3e2c', legs: '#2a241c', belt: '#2a1d12', hat: 'flatcap', hatC: '#3a3024', skin: '#c0a080', beard: '#7a6a5a', weapon: 'goad' },
  butcher: { coat: '#4a4038', legs: '#2a2420', apron: '#7a5a50', skin: '#c89a80', hair: '#3a2a20', weapon: 'knife', scale: 1.1 },
  girl: { coat: '#5a4a3a', dress: true, hat: 'bonnet', hatC: '#4a3a2a', skin: '#d8c0a0', hair: '#8a5a2a', longHair: true, scale: 0.85, weapon: 'goad' },
  sutler: { coat: '#3a2e40', legs: '#1c1a1e', belt: '#2a1d12', trim: '#b09040', hat: 'tophat', hatC: '#1a1418', skin: '#d0b498', beard: '#5a4030', weapon: 'bag' },
  grower: { coat: '#34402c', dress: true, hat: 'bonnet', hatC: '#26301e', skin: '#c8b498', hair: '#8a8a7a', longHair: true, weapon: 'goad' },
  picker: { coat: '#4a4a36', legs: '#2a2a20', belt: '#2a1d12', hat: 'flatcap', hatC: '#2e2e22', skin: '#cdb498', weapon: 'bag' },
  // солдаты барона: мундир хаки, плоская каска с широкими полями, ремни с подсумками, обмотки
  guard: { coat: '#6b6345', legs: '#5e573c', belt: '#9a906a', webbing: '#a89c74', puttees: '#9a9070', hat: 'brodie', hatC: '#5c5a40', skin: '#c0a488', weapon: 'rifle' },
  // траншейные мертвецы — павшие солдаты старой войны
  dead_soldier: { coat: '#4a4c3a', legs: '#2a2a22', belt: '#3a2a1a', hat: 'helmet', hatC: '#3e4232', skin: '#8a9a78', undead: true, weapon: 'rifle' },
  dead_rifle: { coat: '#45473a', legs: '#28281f', belt: '#3a2a1a', hat: 'cap', hatC: '#2e3024', skin: '#90a080', undead: true, weapon: 'rifle' },
  dead_gas: { coat: '#3a3e34', legs: '#24261f', hat: 'helmet', hatC: '#33372b', skin: '#8a9a78', mask: true, tanks: true, undead: true },
  dead_sapper: { coat: '#3a3a34', legs: '#222220', hat: 'helmet', hatC: '#55585a', skin: '#7e8e6e', cuirass: true, undead: true, weapon: 'shovel', scale: 1.15 },
  laborer: { coat: '#5a5246', legs: '#2a2620', hat: 'flatcap', hatC: '#2a2620', skin: '#b89878', beard: '#3a2a1a', weapon: 'bag' },
  washer: { coat: '#4a4448', dress: true, apron: '#8a8478', hat: 'bonnet', hatC: '#5a5450', skin: '#c8a890', hair: '#4a3a2a', longHair: true },
  sweep: { coat: '#1e1c1a', legs: '#141210', hat: 'tophat', hatC: '#141210', skin: '#7a6a5a', weapon: 'goad' },
  clerk: { coat: '#3a3a40', legs: '#1e1e22', belt: '#2a1d12', hat: 'tophat', hatC: '#22222a', skin: '#d0b8a0', weapon: 'book' },
  vendor_w: { coat: '#6a4a3a', dress: true, apron: '#a09070', hat: 'bonnet', hatC: '#4a3a2e', skin: '#d0b498', hair: '#7a4a2a', longHair: true, weapon: 'bag' },
  porter: { coat: '#4a4030', legs: '#2a2418', belt: '#3a2a1a', hair: '#2a2018', skin: '#b08a6a', weapon: 'bag', scale: 1.1 },
  surgeon_under: { coat: '#2a2622', legs: '#1a1816', apron: '#4a3020', hair: '#2a2622', skin: '#b8a090', goggles: true, weapon: 'knife' },
  medic_civ: { coat: '#d0ccc0', legs: '#2a2826', apron: '#a8a498', hair: '#5a5a56', skin: '#c8b096', goggles: true, weapon: 'wrench' },
  // земли баронессы
  // солдаты баронессы: тёмный серо-оливковый мундир, красные петлицы, та же каска — и противогаз на лице
  bguard: { coat: '#4e5040', legs: '#44463a', belt: '#7a7458', webbing: '#8a8466', puttees: '#7a7c66', tabs: '#b03830', hat: 'brodie', hatC: '#3e4234', skin: '#c4a888', respirator: true, weapon: 'rifle' },
  bofficer: { coat: '#4e5040', legs: '#3a3c30', belt: '#5a3a22', webbing: '#5a3a22', puttees: '#4a3a26', tabs: '#a03028', trim: '#c8a050', hat: 'cap', hatC: '#4e5040', skin: '#d0b498', weapon: 'saber' },
  bherald: { coat: '#4a2a2a', legs: '#1e1a1a', trim: '#c8a050', hat: 'cap', hatC: '#2e323c', skin: '#c8ac90', beard: '#4a3a2a', weapon: 'book' },
  fisher: { coat: '#4a5048', legs: '#2a2c28', apron: '#3a3a30', hat: 'flatcap', hatC: '#3a3e38', skin: '#b89878', beard: '#6a5a4a', weapon: 'pole' },
  fisher_w: { coat: '#4a4448', dress: true, apron: '#5a5a4a', hat: 'bonnet', hatC: '#3a3a3a', skin: '#c8a890', hair: '#5a4a3a', longHair: true, weapon: 'bag' },
  prospector: { coat: '#5a4a38', legs: '#2e2820', belt: '#2a1d12', hat: 'minerhelm', hatC: '#5a4a2a', skin: '#b08a6a', beard: '#3a2a1a', weapon: 'hammer' },
  scrapper: { coat: '#4a4238', legs: '#2a2620', hat: 'flatcap', hatC: '#2a2620', skin: '#a8886a', goggles: true, weapon: 'bag' },
  bworker: { coat: '#4a4a52', legs: '#26262c', belt: '#2a1d12', hat: 'flatcap', hatC: '#3a3a42', skin: '#c0a080', weapon: 'wrench' },
  // фоновые жители деревень
  townsman: { coat: '#4a4438', legs: '#2a2620', hat: 'flatcap', hatC: '#2e2a22', skin: '#c4a888', beard: '#5a4a3a' },
  townswoman: { coat: '#4a3e44', dress: true, apron: '#6a6050', hat: 'bonnet', hatC: '#3a3034', skin: '#d0b49a', hair: '#6a4a2a', longHair: true },
  oldwoman: { coat: '#3a3634', dress: true, hat: 'bonnet', hatC: '#2a2624', skin: '#c8b4a0', hair: '#b0aca4', longHair: true },
  oldman: { coat: '#3e3a30', legs: '#26231e', hat: 'flatcap', hatC: '#24221c', beard: '#c0bcb0', skin: '#c4b09c', weapon: 'pole' },
  farmhand: { coat: '#4e4632', legs: '#2c281e', belt: '#2a1d12', hair: '#5a3a22', skin: '#c8a888', weapon: 'bag' },
  pickerw: { coat: '#3e4a32', dress: true, apron: '#5a5a40', hat: 'bonnet', hatC: '#2e3626', skin: '#c8b49a', hair: '#5a3a22', longHair: true, weapon: 'bag' },
  kidgirl: { coat: '#4a4a3a', dress: true, skin: '#d8c0a0', hair: '#8a6a3a', longHair: true, scale: 0.78 },
  refugee: { coat: '#3a3a40', legs: '#22222a', hat: 'flatcap', hatC: '#2a2a30', skin: '#c0a48a', beard: '#4a3a2a', weapon: 'bag' },
  refugee_w: { coat: '#4a3a3a', dress: true, hat: 'bonnet', hatC: '#2e2424', skin: '#ccb098', hair: '#3a2a1a', longHair: true, weapon: 'bag' },
};

/** Внешность персонажа игрока: пол, волосы, кожа, возраст и профессия. */
export function setPcStyle(c: Character) {
  const p = PROFESSIONS[c.prof];
  const grey = c.age >= 52;
  clearSpriteCache('pc');
  STYLES.pc = {
    coat: p.look.coat, trim: p.look.trim ?? '#9a8050', legs: '#1c1a17', belt: '#2a1d12',
    hat: 'cap', hatC: '#211a16', skin: c.skin, hair: grey ? '#a8a49a' : c.hair,
    longHair: c.gender === 'f', beard: c.gender === 'm' && c.age >= 40 ? (grey ? '#a8a49a' : c.hair) : undefined,
    weapon: p.look.weapon, goggles: p.look.goggles, band: p.look.band,
  };
}

const WEAPON_LOOK: Record<string, Style['weapon']> = {
  carbine: 'rifle', rifle: 'rifle', musket: 'musket', sawnoff: 'musket', saber: 'saber', knife: 'knife', bayonet: 'knife',
  axe: 'hammer', hammer: 'hammer', wrench: 'wrench', revolver: 'pistol', autopistol: 'pistol',
  huntrifle: 'rifle', exprifle: 'rifle', shotgun2: 'musket', pumpshot: 'musket', flamer: 'musket',
};
/** Пересобрать внешний вид бойцов отряда по снаряжению: головной убор, кираса, оружие в руках. */
export function applyEquipLooks(squad: UnitBase[]) {
  for (const b of squad) {
    const base = STYLES[b.kind];
    if (!base || !b.equip) continue;
    const head = b.equip.head ? ITEMS[b.equip.head] : null;
    const main = b.equip.main ? ITEMS[b.equip.main] : null;
    const tool = base.weapon === 'book' || base.weapon === 'bag';
    const key = 'eq_' + b.id;
    clearSpriteCache(key);
    STYLES[key] = {
      ...base,
      hat: head?.hat, hatC: head?.hat === 'helmet' ? '#3d4030' : head?.hat === 'cap' ? (base.hat === 'cap' ? base.hatC : '#211a16') : undefined,
      hair: base.hair ?? (head ? undefined : '#3a2a1a'),
      cuirass: b.equip.body === 'cuirass',
      limbs: b.limbs && Object.keys(b.limbs).length ? { ...b.limbs } : undefined,
      weapon: main?.weapon === 'revolver' && tool ? base.weapon : main?.weapon ? WEAPON_LOOK[main.weapon] : undefined,
    };
    b.look = key;
  }
}

export interface FigOpts { t?: number; flip?: boolean; dead?: boolean; flash?: number; seed?: number; terror?: boolean }

/** Рисует персонажа (пиксельный спрайт 24×32): (x, y) — точка между ступнями, s — целый масштаб. */
export function drawFigure(c: Ctx, kind: string, x: number, y: number, s = 1, o: FigOpts = {}) {
  drawSprite(c, kind, x, y, { scale: Math.max(1, Math.round(s)), flip: o.flip, dead: o.dead, flash: (o.flash ?? 0) > 0 });
}

export function flicker(t: number, phase: number, broken: boolean) {
  if (broken) {
    const v = Math.sin(t * 2.7 + phase) + Math.sin(t * 7.3 + phase * 3) + Math.sin(t * 17 + phase);
    if (v > 0.9) return 0;
    return 0.35 + (Math.sin(t * 31 + phase) * 0.5 + 0.5) * 0.3;
  }
  return 0.82 + Math.sin(t * 9 + phase) * Math.sin(t * 5.3 + phase * 2) * 0.12;
}

export function vignette(c: Ctx, w: number, h: number) {
  const g = c.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
}

// ------------------------------------------------------------------ окружение

export function drawDeadTree(c: Ctx, x: number, y: number, r: () => number, size = 1) {
  c.strokeStyle = '#1b1814'; c.lineCap = 'round';
  const br = (x: number, y: number, a: number, len: number, w: number, d: number) => {
    if (d === 0 || len < 2) return;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
    br(x2, y2, a - 0.35 - r() * 0.45, len * 0.7, w * 0.62, d - 1);
    if (r() < 0.8) br(x2, y2, a + 0.3 + r() * 0.45, len * 0.66, w * 0.6, d - 1);
  };
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath(); c.ellipse(x, y, 9 * size, 3 * size, 0, 0, TAU); c.fill();
  br(x, y, -Math.PI / 2 + (r() - 0.5) * 0.25, 17 * size, 4.2 * size, 5);
}
