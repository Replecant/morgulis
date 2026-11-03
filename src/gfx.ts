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
  armband?: string; // повязка на рукаве
  horns?: string; eyes?: string; // рога (цвет) и горящие глаза — у демонов и ведьм ковена
  puttees?: string; webbing?: string; respirator?: boolean; tabs?: string; number?: boolean; // number — нашивка с номером (заключённые) // военная форма: обмотки, ремни с подсумками, противогаз, петлицы
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
  // мародёры-бандиты: длинные тёмные плащи, шарфы на лицах, ремни, трофейное оружие
  bandit_gun: { coat: '#2e2a26', legs: '#1e1c18', belt: '#3a2a1a', webbing: '#4a3a26', hat: 'flatcap', hatC: '#1a1816', skin: '#b8987c', mask: true, weapon: 'rifle' },
  bandit_shot: { coat: '#3a2e24', legs: '#221e18', belt: '#3a2a1a', hat: 'brodie', hatC: '#2e2a22', skin: '#b08a6a', beard: '#2a2018', weapon: 'musket' },
  bandit_axe: { coat: '#35302a', legs: '#201e1a', belt: '#4a3420', apron: '#2a2420', hair: '#2a2018', skin: '#a88a70', mask: true, weapon: 'hammer', scale: 1.1 },
  bandit_boss: { coat: '#2a1e1e', legs: '#18161a', belt: '#4a2e1a', trim: '#8a6a3a', hat: 'tophat', hatC: '#141214', skin: '#c4a488', beard: '#3a2a20', weapon: 'saber' },
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
  // горожане форта баронессы — у многих красные повязки
  bcit_m: { coat: '#5a5248', legs: '#3a362e', hat: 'flatcap', hatC: '#3a342c', skin: '#c4a888', beard: '#5a4a3a', armband: '#a03028' },
  bcit_w: { coat: '#4e4a52', dress: true, apron: '#6a5a50', hat: 'bonnet', hatC: '#8a2a24', skin: '#d0b49a', hair: '#5a3a22', longHair: true, weapon: 'bag' },
  bcit_w2: { coat: '#6a5a44', dress: true, apron: '#a09070', skin: '#d8c0a0', hair: '#b09060', longHair: true, armband: '#a03028' },
  bcit_old: { coat: '#4a4a40', legs: '#32322a', trim: '#c8a050', hat: 'cap', hatC: '#3a3a32', skin: '#c4b09c', beard: '#c0bcb0', weapon: 'pole' },
  bcit_youth: { coat: '#3e4a3a', legs: '#2e3428', belt: '#5a3a22', hat: 'cap', hatC: '#7a2a24', skin: '#d4b89c', armband: '#a03028', weapon: 'book', scale: 0.88 },
  bcit_work: { coat: '#4a4438', legs: '#2e2a24', apron: '#5a3e28', hat: 'flatcap', hatC: '#2a2620', skin: '#b89878', weapon: 'wrench' },
  bguard: { coat: '#4e5040', legs: '#44463a', belt: '#7a7458', webbing: '#8a8466', puttees: '#7a7c66', tabs: '#b03830', hat: 'brodie', hatC: '#3e4234', skin: '#c4a888', respirator: true, weapon: 'rifle' },
  bofficer: { coat: '#4e5040', legs: '#3a3c30', belt: '#5a3a22', webbing: '#5a3a22', puttees: '#4a3a26', tabs: '#a03028', trim: '#c8a050', hat: 'cap', hatC: '#4e5040', skin: '#d0b498', weapon: 'saber' },
  bherald: { coat: '#4a2a2a', legs: '#1e1a1a', trim: '#c8a050', hat: 'cap', hatC: '#2e323c', skin: '#c8ac90', beard: '#4a3a2a', weapon: 'book' },
  fisher: { coat: '#4a5048', legs: '#2a2c28', apron: '#3a3a30', hat: 'flatcap', hatC: '#3a3e38', skin: '#b89878', beard: '#6a5a4a', weapon: 'pole' },
  fisher_w: { coat: '#4a4448', dress: true, apron: '#5a5a4a', hat: 'bonnet', hatC: '#3a3a3a', skin: '#c8a890', hair: '#5a4a3a', longHair: true, weapon: 'bag' },
  prospector: { coat: '#5a4a38', legs: '#2e2820', belt: '#2a1d12', hat: 'minerhelm', hatC: '#5a4a2a', skin: '#b08a6a', beard: '#3a2a1a', weapon: 'hammer' },
  prospector_w: { coat: '#5a4a38', legs: '#2e2820', belt: '#2a1d12', hat: 'minerhelm', hatC: '#5a4a2a', skin: '#c0a088', hair: '#6a4a2a', longHair: true, weapon: 'hammer' },
  scrapper: { coat: '#4a4238', legs: '#2a2620', hat: 'flatcap', hatC: '#2a2620', skin: '#a8886a', goggles: true, weapon: 'bag' },
  hungry: { coat: '#4e4436', legs: '#3a342a', skin: '#b8a08a', hair: '#3a2e24', beard: '#4a3e30', apron: '#5a4a38', weapon: 'knife' },
  hungry2: { coat: '#46443c', legs: '#36342c', hat: 'flatcap', hatC: '#2e2a24', skin: '#c0a690', weapon: 'pole' },
  inmate: { coat: '#5c5c58', legs: '#4c4c48', hat: 'flatcap', hatC: '#46463f', skin: '#b8a894', beard: '#6a6660', number: true },
  inmate2: { coat: '#56564f', legs: '#48483f', hair: '#3a3632', skin: '#c0a890', number: true, weapon: 'bag' },
  inmate_w: { coat: '#5c5c58', dress: true, hat: 'bonnet', hatC: '#46463f', skin: '#c4ae98', hair: '#4a3e34', longHair: true, number: true },
  bworker_w: { coat: '#4a4a52', dress: true, apron: '#6a6458', hat: 'bonnet', hatC: '#3a3a42', skin: '#c8a890', hair: '#5a3a22', longHair: true, weapon: 'wrench' },
  bworker: { coat: '#4a4a52', legs: '#26262c', belt: '#2a1d12', hat: 'flatcap', hatC: '#3a3a42', skin: '#c0a080', weapon: 'wrench' },
  ashsoldier: { coat: '#6b6345', legs: '#5e573c', belt: '#a89c74', webbing: '#a89c74', puttees: '#9a9070', hat: 'brodie', hatC: '#5c5a40', skin: '#c8ac90', weapon: 'rifle' },
  // ---------------- север: край Народного Собрания
  // братья свободы: серо-бурая форма, мягкие фуражки, красные повязки на рукаве
  brother: { coat: '#4e4a40', legs: '#3a362e', belt: '#5a3a22', webbing: '#6a5a3e', puttees: '#56503e', hat: 'cap', hatC: '#3a3630', skin: '#c4a888', armband: '#b8281e', weapon: 'rifle' },
  brother2: { coat: '#4a463c', legs: '#36322a', belt: '#5a3a22', webbing: '#6a5a3e', hat: 'flatcap', hatC: '#2e2a24', skin: '#bfa084', beard: '#4a3a2a', armband: '#b8281e', weapon: 'rifle' },
  brother_w: { coat: '#4e4a40', legs: '#3a362e', belt: '#5a3a22', hat: 'cap', hatC: '#3a3630', skin: '#d0b49a', hair: '#5a3a22', longHair: true, armband: '#b8281e', weapon: 'rifle' },
  brother_off: { coat: '#2e2a26', legs: '#24201c', belt: '#4a2e1a', webbing: '#4a2e1a', hat: 'cap', hatC: '#2a2622', skin: '#ccb094', armband: '#c02a20', weapon: 'pistol' },
  // лоялисты старого режима: выцветшая сине-серая форма гвардии барона Сильвера, небритые
  loyalist: { coat: '#4e5462', legs: '#34363e', belt: '#2a1d12', puttees: '#4a4a48', trim: '#8a7a4a', hat: 'cap', hatC: '#3a3e4a', skin: '#b89c84', beard: '#4a3e34', weapon: 'rifle' },
  loyalist2: { coat: '#4a4e58', legs: '#30323a', belt: '#2a1d12', hat: 'brodie', hatC: '#4a4e54', skin: '#c0a48a', beard: '#3a2e24', weapon: 'rifle' },
  loyal_off: { coat: '#464c5c', legs: '#2a2c34', belt: '#3a2a1a', trim: '#b09a5a', hat: 'cap', hatC: '#2e3240', skin: '#c8ac92', beard: '#6a5a4a', weapon: 'saber' },
  // протезисты: военный врач баронессы и врач братьев
  bmedic: { coat: '#c8c4b4', legs: '#3a3c30', apron: '#a8a498', belt: '#5a3a22', tabs: '#b03830', hat: 'cap', hatC: '#4e5040', skin: '#d0b498', goggles: true, armband: '#a03028', weapon: 'wrench' },
  rmedic: { coat: '#c4beae', legs: '#2e2c28', apron: '#9a9488', hat: 'cap', hatC: '#3a3630', skin: '#c8ac90', hair: '#4a3a2a', goggles: true, armband: '#b8281e', weapon: 'wrench' },
  hawley_prosth: { coat: '#3e3a30', legs: '#26231e', apron: '#4a3020', hat: 'flatcap', hatC: '#24221c', beard: '#9a968c', skin: '#c4b09c', goggles: true, weapon: 'pole' },
  // юг: земли барона Винферда — опрятная тёмно-синяя форма с латунью, фуражки
  wfguard: { coat: '#2e3a4e', legs: '#262c36', belt: '#1e1a14', webbing: '#5a4a32', puttees: '#3a4252', trim: '#c8a050', hat: 'cap', hatC: '#26303e', skin: '#c8ac90', weapon: 'rifle' },
  wfofficer: { coat: '#2a3446', legs: '#1e2430', belt: '#3a2a1a', trim: '#d8b060', hat: 'cap', hatC: '#202838', skin: '#d0b498', weapon: 'saber' },
  wfclerk: { coat: '#3a3a44', legs: '#22222a', trim: '#8a8a90', hat: 'tophat', hatC: '#1e1e26', skin: '#d4bca4', goggles: true, weapon: 'book' },
  wfcit_m: { coat: '#4a4a52', legs: '#2a2a30', belt: '#2a1d12', hat: 'flatcap', hatC: '#2e3440', skin: '#c8ac90', beard: '#5a4a3a' },
  wfcit_w: { coat: '#4a4058', dress: true, apron: '#8a8478', hat: 'bonnet', hatC: '#3a3448', skin: '#d4b89c', hair: '#6a4a2a', longHair: true, weapon: 'bag' },
  wfrich_m: { coat: '#2e2a36', legs: '#1a1820', trim: '#c8a050', hat: 'tophat', hatC: '#16141a', skin: '#d8c0a8', beard: '#3a2a20', weapon: 'staff' },
  wfrich_w: { coat: '#5a2a3a', dress: true, apron: '#c8b8a8', hat: 'bonnet', hatC: '#3a1a2a', skin: '#e0c8b0', hair: '#3a2416', longHair: true },
  wfstudent: { coat: '#2e3a4e', legs: '#262c36', hat: 'cap', hatC: '#26303e', skin: '#dcc4a8', scale: 0.82, weapon: 'book' },
  wfminer: { coat: '#3a3630', legs: '#262420', belt: '#2a1d12', hat: 'minerhelm', hatC: '#4a4a44', skin: '#a8907a', beard: '#3a2a1a', weapon: 'shovel' },
  wfoil: { coat: '#2e3440', legs: '#1e2028', apron: '#1a1a1e', hat: 'flatcap', hatC: '#1e222a', skin: '#c0a084', weapon: 'wrench' },
  refugee2: { coat: '#4a4038', legs: '#2e2a24', hair: '#3a2e24', skin: '#b89c84', beard: '#4a3e30', weapon: 'bag' },
  refugee_kid: { coat: '#4a4440', dress: true, skin: '#d0b498', hair: '#5a3a22', longHair: true, scale: 0.75 },
  // ковен: жуткие старухи-ведьмы и старшие демоны в человеческом облике
  crone: { coat: '#2a2622', dress: true, apron: '#3a3226', skin: '#a8a494', hair: '#d0ccc0', longHair: true, eyes: '#c8ff60', weapon: 'staff' },
  crone2: { coat: '#1e1c1e', dress: true, hood: true, weapon: 'staff' },
  crone3: { coat: '#2e2a24', dress: true, skin: '#9a9a8a', hair: '#8a8a80', longHair: true, eyes: '#c8ff60', weapon: 'bag' },
  demon: { coat: '#24161a', legs: '#1a1012', belt: '#4a2a1a', trim: '#7a5a2a', skin: '#6e2a22', horns: '#d0c4a8', eyes: '#ffb040', scale: 1.15 },
  demon2: { coat: '#1a1418', dress: true, skin: '#4e2a2e', horns: '#c0b498', eyes: '#ff7030', scale: 1.15, weapon: 'staff' },
  // знахари — народные колдуны
  wise_fen: { coat: '#3a3a2c', dress: true, apron: '#4a5232', hat: 'bonnet', hatC: '#2a2c22', skin: '#c4ae98', hair: '#b0aca4', longHair: true, weapon: 'staff' },
  wise_moss: { coat: '#4a3e2c', legs: '#2a241c', apron: '#5a4a30', hat: 'flatcap', hatC: '#2e2a20', skin: '#c0a488', beard: '#c0bcb0', weapon: 'staff' },
  wise_wood: { coat: '#3e4630', dress: true, apron: '#5a4a32', hat: 'bonnet', hatC: '#5a3a2a', skin: '#c8ac90', hair: '#6a4a2a', longHair: true, weapon: 'bag' },
  // жители севера
  nb_m: { coat: '#46443c', legs: '#2c2a24', hat: 'flatcap', hatC: '#2a2824', skin: '#c0a488', beard: '#5a4a3a' },
  nb_w: { coat: '#44404a', dress: true, apron: '#5a564c', hat: 'bonnet', hatC: '#2e2a30', skin: '#ccb098', hair: '#5a4a3a', longHair: true, weapon: 'bag' },
  nb_red: { coat: '#4a463e', legs: '#2e2c26', hat: 'flatcap', hatC: '#2a2824', skin: '#c4a888', armband: '#b8281e', weapon: 'book' },
  lumber: { coat: '#5a3e2c', legs: '#2e2a22', belt: '#2a1d12', hat: 'flatcap', hatC: '#3a2a1e', skin: '#bf9c7c', beard: '#6a4a2a', weapon: 'hammer', scale: 1.08 },
  lumber2: { coat: '#4e4a32', legs: '#2c2a20', belt: '#2a1d12', hair: '#3a2a1a', skin: '#c4a080', weapon: 'shovel' },
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
