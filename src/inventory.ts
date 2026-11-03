// ============================================================
//  Окно снаряжения: «человечек» со слотами + общий обоз
//  Перетаскивание мышью, клик-выбор, двойной клик — надеть/снять.
// ============================================================
import { G, hasRepairKit, gearBonus } from './state';
import { check, skillBonus, DC } from './rules';
import { load, capacity, carryOf, overload, LOAD_NAME, fmtKg } from './load';
import { UnitBase } from './data';
import { ItemKind, SLOTS, SLOT_ORDER, Slot, KIND_NAMES, canEquip, equipStats, itemStatLines, CONSUMABLES, CONS_ORDER, Consumable, itemOf, itemName, condOf, withCond, COND_NAME, CONS_WT } from './items';
import { woundMods, effMaxHp } from './wounds';
import { drawFigure, applyEquipLooks } from './gfx';
import { h } from './book';
import { $, TAU } from './util';
import { pixelize, outline } from './px';
import { withFrame } from './frames';

// ------------------------------------------------------------ иконки предметов
export const KIND_COLOR: Record<ItemKind, string> = { tool: '#6a8a8a', weapon: '#a07a4a', head: '#7a8a6a', body: '#6a7a8a', hands: '#8a7a5a', legs: '#7a6a5a', charm: '#9a7ab0', face: '#8a9a7a' };

const iconCache = new Map<string, HTMLCanvasElement>();
/** Пиксельная иконка: рисунок в сетке S/2, контур и блик, увеличение ×2 без сглаживания. */
export function drawItemIcon(c: CanvasRenderingContext2D, icon: string, S = 52) {
  const g = Math.round(S / 2), key = icon + '|' + g;
  let cv = iconCache.get(key);
  if (!cv) {
    const src = pixelize(g, g, (v) => drawItemIconVec(v, icon, g));
    const sc = src.getContext('2d')!, img = sc.getImageData(0, 0, g, g), d = img.data;
    const a = (x: number, y: number) => x >= 0 && y >= 0 && x < g && y < g && d[(y * g + x) * 4 + 3] > 0;
    // блик по верхним и левым краям, тень по нижним
    const hi: number[] = [], lo: number[] = [];
    for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) if (a(x, y)) { if (!a(x, y - 1) || !a(x - 1, y)) hi.push(x, y); else if (!a(x, y + 1) || !a(x + 1, y)) lo.push(x, y); }
    const tone = (pts: number[], k: number) => { for (let i = 0; i < pts.length; i += 2) { const p = (pts[i + 1] * g + pts[i]) * 4; for (let j = 0; j < 3; j++) d[p + j] = k > 0 ? d[p + j] + (255 - d[p + j]) * k : d[p + j] * (1 + k); } };
    tone(hi, 0.22); tone(lo, -0.3);
    sc.putImageData(img, 0, 0);
    outline(src, '#0c0e0a');
    cv = src; iconCache.set(key, cv);
  }
  c.imageSmoothingEnabled = false;
  c.drawImage(cv, 0, 0, g, g, Math.round((S - g * 2) / 2), Math.round((S - g * 2) / 2), g * 2, g * 2);
}

function drawItemIconVec(c: CanvasRenderingContext2D, icon: string, S = 52) {
  c.save();
  c.scale(S / 52, S / 52);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const L = (pts: number[], col: string, w: number) => { c.strokeStyle = col; c.lineWidth = Math.max(w, 2.6); c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke(); };
  const R = (x: number, y: number, w: number, hh: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, hh); };
  const steel = '#9a9c98', dark = '#2a2622', wood = '#6a4428', leather = '#5a3a22';
  switch (icon) {
    case 'pistol': R(14, 20, 26, 6, steel); R(14, 24, 8, 3, dark); c.fillStyle = steel; c.beginPath(); c.arc(25, 25, 4, 0, TAU); c.fill(); L([16, 26, 12, 38], wood, 6); break;
    case 'rifle': L([8, 40, 44, 12], wood, 5); L([30, 23, 46, 10], steel, 2.5); R(20, 28, 5, 4, dark); break;
    case 'rifle_long': L([6, 44, 46, 8], wood, 5); L([26, 26, 48, 6], steel, 2.5); R(18, 30, 5, 4, dark); L([34, 18, 40, 14], '#444', 3); break;
    case 'musket': L([6, 42, 46, 12], '#7a5030', 6); L([28, 26, 48, 10], '#6a6a5a', 3); c.fillStyle = '#b08a40'; c.beginPath(); c.arc(16, 35, 2.5, 0, TAU); c.fill(); break;
    case 'shotgun': L([8, 38, 30, 22], wood, 7); L([26, 24, 46, 14], steel, 3); L([26, 28, 46, 18], steel, 3); break;
    case 'blade': L([14, 42, 42, 10], '#cfd0c8', 3); L([10, 36, 20, 46], '#c09a52', 3); L([8, 46, 13, 41], dark, 4); break;
    case 'knife': L([18, 38, 38, 16], '#cfd0c8', 3.5); L([12, 44, 19, 37], leather, 5); L([16, 34, 22, 40], '#888', 2); break;
    case 'axe': L([14, 46, 34, 12], '#8a2a1e', 4); c.fillStyle = steel; c.beginPath(); c.moveTo(30, 8); c.quadraticCurveTo(46, 12, 42, 26); c.lineTo(32, 18); c.closePath(); c.fill(); break;
    case 'hammer': L([16, 46, 30, 16], wood, 4); R(22, 6, 18, 12, '#555'); break;
    case 'wrench': L([14, 42, 36, 16], steel, 5); c.strokeStyle = steel; c.lineWidth = 4; c.beginPath(); c.arc(38, 13, 6, 0.6, 5.2); c.stroke(); break;
    case 'cap': c.fillStyle = '#2b1513'; c.beginPath(); c.ellipse(26, 24, 16, 8, 0, Math.PI, TAU); c.fill(); R(10, 24, 32, 6, '#2b1513'); R(26, 29, 18, 3, '#111'); R(24, 19, 4, 4, '#c09a52'); break;
    case 'tophat': R(16, 8, 20, 26, '#18161a'); R(16, 26, 20, 4, '#5a3a3a'); R(8, 33, 36, 5, '#18161a'); R(18, 10, 3, 16, '#2e2a30'); break;
    case 'helmet': c.fillStyle = '#4a4e3a'; c.beginPath(); c.arc(26, 30, 13, Math.PI, TAU); c.fill(); c.beginPath(); c.ellipse(26, 30, 21, 4, 0, 0, TAU); c.fill(); break;
    case 'coat': c.fillStyle = '#4b4e3b'; c.beginPath(); c.moveTo(16, 10); c.lineTo(36, 10); c.lineTo(42, 44); c.lineTo(10, 44); c.closePath(); c.fill(); for (const y of [18, 26, 34]) R(25, y, 2, 2, '#c09a52'); L([16, 10, 8, 26], '#4b4e3b', 6); L([36, 10, 44, 26], '#4b4e3b', 6); break;
    case 'apron': c.fillStyle = '#5b3b22'; c.beginPath(); c.moveTo(18, 12); c.lineTo(34, 12); c.lineTo(38, 44); c.lineTo(14, 44); c.closePath(); c.fill(); L([18, 12, 22, 6, 30, 6, 34, 12], '#3a2414', 2); break;
    case 'cuirass': c.fillStyle = '#7a7c7e'; c.beginPath(); c.moveTo(12, 12); c.lineTo(40, 12); c.lineTo(36, 38); c.lineTo(26, 44); c.lineTo(16, 38); c.closePath(); c.fill(); L([26, 14, 26, 40], '#5a5c5e', 2); R(16, 16, 5, 14, '#9a9c9e'); break;
    case 'chitin': c.fillStyle = '#5a3a1e'; c.beginPath(); c.moveTo(12, 12); c.lineTo(40, 12); c.lineTo(36, 40); c.lineTo(16, 40); c.closePath(); c.fill(); for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#7a5228' : '#8a6030'; c.beginPath(); c.ellipse(26, 16 + i * 7, 12 - i, 3.2, 0, 0, TAU); c.fill(); } break;
    case 'gloves': case 'gloves_thin': { const col = icon === 'gloves' ? leather : '#7a5a3a'; c.fillStyle = col; c.beginPath(); c.roundRect(14, 18, 16, 20, 4); c.fill(); for (let i = 0; i < 4; i++) R(14 + i * 4, icon === 'gloves_thin' && i === 0 ? 14 : 8, 3.5, 12, col); R(28, 20, 8, 5, col); R(14, 36, 16, 6, '#3a2414'); break; }
    case 'boots': c.fillStyle = '#2a1e16'; c.beginPath(); c.moveTo(16, 8); c.lineTo(28, 8); c.lineTo(28, 34); c.lineTo(42, 38); c.lineTo(42, 44); c.lineTo(14, 44); c.closePath(); c.fill(); R(16, 12, 12, 2, '#4a3a2a'); break;
    case 'greaves': c.fillStyle = '#7a7c7e'; c.beginPath(); c.roundRect(18, 8, 16, 34, 6); c.fill(); c.fillStyle = '#9a9c9e'; c.beginPath(); c.arc(26, 22, 6, 0, TAU); c.fill(); break;
    case 'paw': c.fillStyle = '#b0a080'; c.beginPath(); c.ellipse(26, 32, 7, 11, -0.3, 0, TAU); c.fill(); for (const [x, y] of [[20, 20], [26, 17], [32, 20]]) { c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill(); } L([30, 42, 36, 48], '#8a6a3a', 2); break;
    case 'herb': c.fillStyle = '#6a5a3a'; c.beginPath(); c.ellipse(26, 32, 11, 12, 0, 0, TAU); c.fill(); L([20, 22, 26, 18, 32, 22], '#3a2a1a', 2); L([26, 18, 26, 8], '#7a9a5a', 2); L([26, 12, 20, 6], '#7a9a5a', 2); L([26, 12, 32, 7], '#7a9a5a', 2); break;
    case 'locket': L([18, 6, 26, 18, 34, 6], '#b09040', 1.5); c.fillStyle = '#c0a050'; c.beginPath(); c.ellipse(26, 30, 10, 12, 0, 0, TAU); c.fill(); c.fillStyle = '#e8dcc0'; c.beginPath(); c.ellipse(26, 30, 6, 8, 0, 0, TAU); c.fill(); c.fillStyle = '#5a4a3a'; c.beginPath(); c.arc(26, 28, 2.5, 0, TAU); c.fill(); break;
    case 'bayonet': L([16, 40, 40, 14], '#cfd0c8', 2.4); L([12, 44, 18, 38], '#3a3a36', 4); R(15, 36, 6, 2, '#888'); break;
    case 'ctools': R(8, 20, 36, 14, '#5a3a22'); R(8, 20, 36, 3, '#6a4a2a'); for (let i = 0; i < 5; i++) L([13 + i * 6, 24, 13 + i * 6, 12 + (i % 2) * 3], steel, 2); R(8, 33, 36, 3, '#3a2414'); break;
    case 'gauges': R(8, 22, 36, 16, '#3a2a1e'); c.fillStyle = '#d8d0b0'; c.beginPath(); c.arc(36, 18, 8, 0, TAU); c.fill(); L([36, 18, 40, 13], '#2a2622', 1.5); c.strokeStyle = '#8a6a30'; c.lineWidth = 2; c.beginPath(); c.arc(36, 18, 8, 0, TAU); c.stroke(); L([10, 12, 10, 30], steel, 2.5); L([10, 12, 22, 12], steel, 2.5); L([16, 12, 16, 20], steel, 2); break;
    case 'parts': c.strokeStyle = steel; c.lineWidth = 2.5; c.beginPath(); for (let i = 0; i < 4; i++) { c.moveTo(10, 14 + i * 4); c.lineTo(22, 16 + i * 4); } c.stroke(); c.fillStyle = '#8a8a84'; c.beginPath(); c.arc(34, 20, 7, 0, TAU); c.fill(); c.fillStyle = '#2a2622'; c.beginPath(); c.arc(34, 20, 2.5, 0, TAU); c.fill(); L([14, 38, 40, 38], '#b08a40', 3); R(12, 34, 5, 8, '#9a9c98'); break;
    case 'carbine': L([10, 38, 40, 18], wood, 5); L([30, 25, 44, 15], steel, 2.5); R(20, 28, 4, 4, dark); break;
    case 'sawnoff': L([12, 36, 26, 28], wood, 7); L([24, 28, 40, 20], steel, 3); L([24, 32, 40, 24], steel, 3); break;
    case 'mg': L([6, 36, 26, 30], wood, 6); R(20, 24, 22, 7, '#3a3c38'); L([40, 27, 50, 25], steel, 3); R(24, 31, 8, 7, '#4a4c40'); L([36, 31, 32, 44], '#555', 2); L([38, 31, 42, 44], '#555', 2); for (let i = 0; i < 4; i++) R(12 + i * 3, 33 + i * 2, 2, 4, '#c0a060'); break;
    case 'tclub': L([14, 44, 34, 14], wood, 6); for (const [x, y] of [[28, 20], [31, 17], [26, 25], [33, 21], [29, 24]]) R(x, y, 3, 2, '#9a9a90'); L([18, 38, 22, 33], '#6a6a60', 7); break;
    case 'spade': L([14, 44, 30, 22], wood, 4); R(12, 40, 6, 6, '#3a2a1a'); c.fillStyle = '#6a6e60'; c.beginPath(); c.moveTo(28, 14); c.lineTo(40, 8); c.lineTo(44, 18); c.lineTo(34, 26); c.closePath(); c.fill(); L([40, 8, 44, 18], '#b8bab0', 1.5); break;
    case 'rdagger': L([20, 34, 40, 10], '#c8c0b0', 3); L([28, 26, 34, 20], '#6a5a8a', 1.4); L([14, 38, 22, 30], '#1a1414', 5); L([16, 28, 26, 38], '#8a6a30', 2.6); c.fillStyle = '#a02020'; c.beginPath(); c.arc(12, 42, 2.5, 0, TAU); c.fill(); break;
    case 'steelhelm': c.fillStyle = '#4a4e44'; c.beginPath(); c.arc(26, 28, 15, Math.PI, TAU); c.fill(); R(11, 28, 30, 7, '#4a4e44'); R(9, 33, 8, 6, '#40443a'); R(35, 33, 8, 6, '#40443a'); R(18, 22, 16, 3, '#6a6e64'); R(22, 12, 8, 3, '#5a5e54'); break;
    case 'smask': c.fillStyle = '#6a6c66'; c.beginPath(); c.ellipse(26, 20, 15, 9, 0, 0, TAU); c.fill(); c.fillStyle = '#1a1a18'; R(15, 17, 8, 3, '#1a1a18'); R(29, 17, 8, 3, '#1a1a18'); for (let y = 28; y < 44; y += 3) for (let x = 14 + (y % 2) * 2; x < 38; x += 4) R(x, y, 2, 2, '#8a8c84'); break;
    case 'goggles': L([6, 24, 46, 24], leather, 4); for (const x of [18, 34]) { c.fillStyle = '#5a4a3a'; c.beginPath(); c.arc(x, 24, 8, 0, TAU); c.fill(); c.fillStyle = '#9ab8b0'; c.beginPath(); c.arc(x, 24, 5, 0, TAU); c.fill(); } R(24, 22, 4, 4, '#5a4a3a'); break;
    case 'oillamp': L([18, 12, 26, 6, 34, 12], '#555', 2); R(17, 12, 18, 4, '#5a5a50'); R(18, 16, 16, 20, '#c8b070'); c.fillStyle = '#f0c060'; c.beginPath(); c.ellipse(26, 27, 4, 6, 0, 0, TAU); c.fill(); R(16, 36, 20, 6, '#5a5a50'); L([18, 16, 18, 36], '#444', 1.5); L([34, 16, 34, 36], '#444', 1.5); break;
    case 'elamp': R(12, 18, 22, 18, '#a08040'); R(14, 20, 18, 3, '#c8a860'); c.fillStyle = '#e8f0ff'; c.beginPath(); c.ellipse(38, 27, 6, 10, 0, 0, TAU); c.fill(); R(32, 17, 4, 20, '#8a6a30'); L([16, 18, 20, 10, 28, 10, 32, 18], '#555', 2); R(16, 28, 6, 4, '#2a2a28'); break;
    case 'dynamite': for (let i = 0; i < 3; i++) R(13 + i * 9, 18, 8, 24, '#a83a26'); R(12, 26, 28, 3, '#d8c890'); R(12, 34, 28, 3, '#d8c890'); L([26, 18, 30, 10, 38, 8], '#888', 1.5); c.fillStyle = '#ffd060'; c.beginPath(); c.arc(39, 8, 2.5, 0, TAU); c.fill(); break;
    case 'ammo_mg': for (let i = 0; i < 6; i++) { const x = 6 + i * 7, y = 18 + i * 3; R(x, y + 5, 5, 14, '#b08a40'); c.fillStyle = '#8a6a3a'; c.beginPath(); c.ellipse(x + 2.5, y + 5, 2.5, 4, 0, Math.PI, TAU); c.fill(); } L([6, 36, 48, 50], '#4a3a22', 3); break;
    case 'autopistol': R(12, 18, 28, 7, '#2a2a28'); R(13, 19, 26, 2, steel); L([16, 25, 12, 40], wood, 6); R(22, 25, 4, 6, '#1a1a18'); break;
    case 'pump': L([6, 40, 30, 22], wood, 7); L([26, 24, 48, 10], steel, 3.5); L([30, 25, 40, 18], '#4a3420', 5); break;
    case 'flamer': c.fillStyle = '#6a3a20'; c.beginPath(); c.roundRect(6, 14, 14, 30, 6); c.fill(); R(8, 12, 10, 4, '#444'); L([18, 34, 30, 30, 46, 20], '#555', 4); c.fillStyle = '#f0a040'; c.beginPath(); c.arc(47, 19, 3, 0, TAU); c.fill(); break;
    case 'exprifle': L([6, 42, 46, 10], '#2a3034', 5); L([28, 26, 48, 8], '#8aa0a8', 2.5); c.fillStyle = '#6ad0e0'; c.beginPath(); c.arc(20, 32, 3, 0, TAU); c.fill(); R(24, 22, 10, 3, '#b08a40'); break;
    case 'clothes': c.fillStyle = '#5a5040'; c.beginPath(); c.moveTo(16, 10); c.lineTo(36, 10); c.lineTo(38, 42); c.lineTo(14, 42); c.closePath(); c.fill(); R(22, 10, 8, 32, '#4a3a2a'); L([16, 10, 8, 24], '#5a5040', 6); L([36, 10, 44, 24], '#5a5040', 6); break;
    case 'jacket': c.fillStyle = '#4a3020'; c.beginPath(); c.moveTo(14, 10); c.lineTo(38, 10); c.lineTo(40, 40); c.lineTo(12, 40); c.closePath(); c.fill(); for (const [x, y] of [[16, 16], [28, 16], [16, 28], [28, 28]]) R(x, y, 8, 8, '#6a4a30'); break;
    case 'vest': c.fillStyle = '#5a5a44'; c.beginPath(); c.moveTo(14, 10); c.lineTo(38, 10); c.lineTo(38, 42); c.lineTo(14, 42); c.closePath(); c.fill(); c.strokeStyle = '#3a3a2a'; c.lineWidth = 1.5; for (let y = 14; y < 42; y += 5) { c.beginPath(); c.moveTo(14, y); c.lineTo(38, y); c.stroke(); } break;
    case 'sapper': c.fillStyle = '#5a5c5e'; c.beginPath(); c.moveTo(10, 8); c.lineTo(42, 8); c.lineTo(40, 34); c.lineTo(26, 44); c.lineTo(12, 34); c.closePath(); c.fill(); R(14, 34, 8, 12, '#4a4c4e'); R(30, 34, 8, 12, '#4a4c4e'); c.strokeStyle = '#8a8c8e'; c.lineWidth = 2; for (let y = 14; y < 34; y += 6) { c.beginPath(); c.moveTo(14, y); c.lineTo(38, y); c.stroke(); } break;
    case 'gasmask': c.fillStyle = '#2b2d28'; c.beginPath(); c.ellipse(26, 24, 14, 16, 0, 0, TAU); c.fill(); c.fillStyle = '#8fbf5a'; c.beginPath(); c.arc(20, 20, 4, 0, TAU); c.arc(32, 20, 4, 0, TAU); c.fill(); R(21, 34, 10, 10, '#555'); break;
    case 'toolbox': R(8, 22, 36, 20, '#6a4a28'); R(8, 22, 36, 4, '#7a5a30'); L([20, 22, 20, 14, 32, 14, 32, 22], '#444', 3); L([12, 18, 22, 8], steel, 2.5); break;
    case 'picks': for (let i = 0; i < 4; i++) L([12 + i * 6, 40, 16 + i * 6, 10], steel, 1.6); R(10, 34, 24, 8, leather); break;
    case 'surgkit': R(8, 18, 36, 24, '#2a1a12'); L([18, 18, 22, 10, 30, 10, 34, 18], '#2a1a12', 3); R(22, 26, 8, 3, '#e0dcc8'); R(24.5, 23, 3, 9, '#e0dcc8'); break;
    case 'grimoire': R(12, 8, 28, 36, '#2a1612'); R(14, 10, 2, 32, '#c8b88a'); c.strokeStyle = '#8a7a4a'; c.lineWidth = 1.2; c.beginPath(); c.arc(28, 26, 7, 0, TAU); c.moveTo(28, 19); c.lineTo(28, 33); c.moveTo(21, 26); c.lineTo(35, 26); c.stroke(); break;
    case 'ritual': R(10, 30, 8, 14, '#d8d0b0'); R(26, 26, 8, 18, '#d8d0b0'); c.fillStyle = '#f0c060'; c.beginPath(); c.arc(14, 27, 2.5, 0, TAU); c.arc(30, 23, 2.5, 0, TAU); c.fill(); c.fillStyle = '#b08040'; c.beginPath(); c.ellipse(40, 40, 8, 4, 0, 0, TAU); c.fill(); break;
    case 'bandage': c.fillStyle = '#e0dcc8'; c.beginPath(); c.arc(26, 28, 13, 0, TAU); c.fill(); c.fillStyle = '#b8b4a0'; c.beginPath(); c.arc(26, 28, 5, 0, TAU); c.fill(); L([30, 16, 44, 10], '#e0dcc8', 5); break;
    case 'medkit': R(8, 14, 36, 28, '#7a2a22'); R(8, 14, 36, 4, '#8a3a2a'); R(23, 20, 6, 18, '#e8e0d0'); R(17, 26, 18, 6, '#e8e0d0'); break;
    case 'bottle': R(19, 18, 14, 26, '#3a5a4a'); R(23, 10, 6, 9, '#3a5a4a'); R(22, 7, 8, 4, '#6a4a2a'); R(21, 26, 10, 8, '#d8d0b0'); break;
    case 'pills': R(14, 16, 24, 28, '#d8d0b0'); R(14, 12, 24, 6, '#5a4a3a'); for (const [x, y] of [[20, 26], [30, 30], [22, 36]]) { c.fillStyle = '#c86a4a'; c.beginPath(); c.ellipse(x, y, 3, 2, 0.4, 0, TAU); c.fill(); } break;
    case 'ammo_p': case 'ammo_r': case 'ammo_s': {
      const n = icon === 'ammo_s' ? 4 : 5, w = icon === 'ammo_s' ? 7 : 5, hh = icon === 'ammo_r' ? 28 : icon === 'ammo_s' ? 20 : 16;
      for (let i = 0; i < n; i++) { const x = 10 + i * (w + 2.5), y = 42 - hh; R(x, y + hh * 0.3, w, hh * 0.7, icon === 'ammo_s' ? '#8a2a1e' : '#b08a40'); c.fillStyle = icon === 'ammo_s' ? '#c8a050' : '#8a6a3a'; c.beginPath(); c.ellipse(x + w / 2, y + hh * 0.3, w / 2, w / 2 + 2, 0, Math.PI, TAU); c.fill(); if (icon === 'ammo_s') R(x, y + hh - 4, w, 4, '#c8a050'); }
      break;
    }
    case 'grenade': c.fillStyle = '#4a4e3a'; c.beginPath(); c.ellipse(26, 30, 11, 13, 0, 0, TAU); c.fill(); c.strokeStyle = '#2a2e1a'; c.lineWidth = 1; for (let y = 22; y < 42; y += 5) { c.beginPath(); c.moveTo(16, y); c.lineTo(36, y); c.stroke(); } R(22, 12, 8, 6, '#6a6a60'); L([30, 14, 38, 10], steel, 1.5); break;
    case 'smoke': R(18, 16, 16, 28, '#5a5a54'); R(18, 22, 16, 4, '#c8c8c0'); R(22, 10, 8, 6, '#3a3a34'); c.fillStyle = 'rgba(200,200,190,0.6)'; c.beginPath(); c.arc(36, 12, 6, 0, TAU); c.arc(42, 8, 4, 0, TAU); c.fill(); break;
    case 'filter': c.fillStyle = '#4a4a44'; c.beginPath(); c.roundRect(14, 14, 24, 28, 5); c.fill(); for (let i = 0; i < 3; i++) R(18, 20 + i * 7, 16, 2, '#2a2a26'); R(22, 8, 8, 7, '#6a6a60'); break;
    case 'ration': R(10, 22, 32, 18, '#6a5030'); R(10, 22, 32, 4, '#7a6040'); c.fillStyle = '#8a3a22'; c.beginPath(); c.ellipse(26, 18, 10, 6, 0, 0, TAU); c.fill(); break;
    default: c.fillStyle = '#555'; c.fillRect(14, 14, 24, 24);
  }
  c.restore();
}

/** Иконка экземпляра: рисунок предмета + метка состояния (изношено — жёлтая трещина, сломано — красный крест). */
function iconCanvas(id: string, size = 52) {
  const cv = h('canvas', { width: size, height: size, class: 'icv' });
  const c = cv.getContext('2d')!, cond = condOf(id);
  drawItemIcon(c, itemOf(id).icon, size);
  if (cond !== 'ok') {
    const k = size / 52, x = size - 15 * k, y = size - 15 * k;
    c.fillStyle = '#0c0e0a'; c.fillRect(x - 2 * k, y - 2 * k, 15 * k, 15 * k);
    c.fillStyle = cond === 'worn' ? '#e0a83a' : '#d04030';
    if (cond === 'worn') { for (let i = 0; i < 5; i++) c.fillRect(x + (i % 2 ? 6 : 3) * k + i * k, y + i * 2.2 * k, 3 * k, 3 * k); }
    else for (let i = 0; i < 5; i++) { c.fillRect(x + i * 2.2 * k, y + i * 2.2 * k, 3 * k, 3 * k); c.fillRect(x + (8.8 - i * 2.2) * k, y + i * 2.2 * k, 3 * k, 3 * k); }
  }
  return cv;
}

// ------------------------------------------------------------ расчёт итоговых характеристик
export function memberStats(b: UnitBase) {
  const m = woundMods(b), e = equipStats(b);
  return {
    hp: `${b.hp}/${effMaxHp(b)}`,
    def: b.def + m.def + e.def,
    armor: (b.armor ?? 0) + e.armor,
    atkM: b.atkM + m.atkM + e.atkM,
    atkR: b.atkR + m.atkR + e.atkR,
    move: Math.max(2, b.move + m.move + e.move),
    horror: (b.horror ?? 0) + m.horror + e.horror,
    weapon: b.equip?.main ? COND_NAME[condOf(b.equip.main)] : '—',
    courage: e.courage,
  };
}
const sg = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

// ------------------------------------------------------------ раскладка «человечка»
// координаты ячеек слотов (левый верхний угол) и точки на теле, к которым ведут линии
// «человечек» 360×320: ячейки по бокам, линии к частям тела пиксельной фигурки (масштаб 6)
const SLOT_POS: Record<Slot, { x: number; y: number; ax: number; ay: number; side: 'l' | 'r' }> = {
  head:  { x: 10, y: 10, ax: 180, ay: 126, side: 'l' },
  body:  { x: 10, y: 86, ax: 176, ay: 190, side: 'l' },
  hands: { x: 10, y: 162, ax: 138, ay: 204, side: 'l' },
  legs:  { x: 10, y: 238, ax: 172, ay: 252, side: 'l' },
  face:  { x: 294, y: 10, ax: 186, ay: 140, side: 'r' },
  main:  { x: 294, y: 86, ax: 224, ay: 200, side: 'r' },
  side:  { x: 294, y: 162, ax: 156, ay: 222, side: 'r' },
  charm: { x: 294, y: 238, ax: 184, ay: 172, side: 'r' },
};
const CELL = 56;

type Sel = { from: 'stash'; idx: number } | { from: 'slot'; slot: Slot } | null;

export const Inventory = {
  open: false,
  member: 0,
  sel: null as Sel,
  filter: 'all' as 'all' | ItemKind | 'armor',
  hover: null as string | null, // id экземпляра под курсором
  note: '',                     // итог починки в походе
  onClose: () => {},

  show(onClose: () => void) {
    this.open = true; this.onClose = onClose; this.sel = null; this.note = '';
    this.render();
    withFrame('inv', $('inv'), () => { if (this.open) $('inv').classList.remove('hidden'); });
  },
  close() {
    this.open = false;
    $('inv').classList.add('hidden');
    this.onClose();
  },

  // ---------------------------------------------- операции с предметами
  changed() {
    applyEquipLooks(G.squad);
    this.render();
  },
  equipFromStash(idx: number, slot: Slot) {
    const b = G.squad[this.member];
    const id = G.stash[idx];
    if (!id || !canEquip(slot, id)) return false;
    const eq = b.equip ?? (b.equip = {});
    const old = eq[slot];
    eq[slot] = id;
    G.stash.splice(idx, 1);
    if (old) G.stash.push(old);
    this.sel = null; this.changed();
    return true;
  },
  unequip(slot: Slot) {
    const b = G.squad[this.member];
    const id = b.equip?.[slot];
    if (!id) return;
    delete b.equip![slot];
    G.stash.push(id);
    this.sel = null; this.changed();
  },
  moveSlot(from: Slot, to: Slot) {
    const eq = G.squad[this.member].equip ?? {};
    const a = eq[from];
    if (!a || from === to || !canEquip(to, a)) return;
    const b = eq[to];
    if (b && !canEquip(from, b)) return;
    eq[to] = a;
    if (b) eq[from] = b; else delete eq[from];
    this.sel = null; this.changed();
  },
  autoEquip(idx: number) {
    const it = itemOf(G.stash[idx]);
    if (it.kind === 'tool') return; // спецснаряжение не надевается — работает из обоза
    const eq = G.squad[this.member].equip ?? {};
    let slot = SLOT_ORDER.find((s) => SLOTS[s].kind === it.kind)!;
    if (it.kind === 'weapon') slot = !eq.main ? 'main' : !eq.side ? 'side' : 'main';
    this.equipFromStash(idx, slot);
  },
  /** Починка изношенного оружия в походе: нужен набор инструментов, проверка Механики героя. */
  fieldRepair(idx: number) {
    const id = G.stash[idx];
    if (!id || condOf(id) !== 'worn' || !hasRepairKit() || !G.pc) return;
    if (G.supplies.parts <= 0) { this.note = 'Нет запасных деталей — чинить нечем.'; this.render(); return; }
    const lock = G.checkLock.repair ?? -1;
    if (lock > G.clock) { this.note = `Руки ещё не дошли: следующая попытка — через ${Math.ceil(lock - G.clock)} ч.`; this.render(); return; }
    const bonus = skillBonus(G.pc, 'mechanics') + gearBonus('mechanics'), r = check(bonus, DC.normal);
    const rt = `[Механика: d20 ${r.roll}${bonus >= 0 ? '+' : ''}${bonus} против ${DC.normal}]`;
    G.clock += 1;
    if (r.success) { G.stash[idx] = withCond(id, 'ok'); G.supplies.parts--; this.note = `${itemOf(id).name}: разобрано, вычищено, собрано — снова в идеальном состоянии. ${rt}`; }
    else { G.checkLock.repair = G.clock + 24; this.note = `${itemOf(id).name}: не выходит — нужна деталь или свежая голова. Следующая попытка через сутки. ${rt}`; }
    this.sel = r.success ? this.sel : null; this.render();
  },
  /** Куда можно положить выбранную/перетаскиваемую вещь. */
  validSlots(id: string | undefined): Slot[] {
    return id ? SLOT_ORDER.filter((s) => canEquip(s, id)) : [];
  },
  selId(): string | undefined {
    const s = this.sel;
    if (!s) return undefined;
    return s.from === 'stash' ? G.stash[s.idx] : G.squad[this.member].equip?.[s.slot];
  },

  // ---------------------------------------------- отрисовка
  render() {
    const root = $('inv');
    const b = G.squad[this.member];
    const eq = b.equip ?? (b.equip = {});
    const selId = this.selId();
    const valid = this.sel?.from === 'stash' ? this.validSlots(selId) : this.sel?.from === 'slot' && selId ? this.validSlots(selId).filter((s) => s !== (this.sel as any).slot) : [];

    // вкладки бойцов
    const tabs = h('div', { class: 'inv-tabs' }, ...G.squad.map((m, i) => {
      const cv = h('canvas', { width: 34, height: 34 });
      drawFigure(cv.getContext('2d')!, m.look ?? m.kind, 17, 58, 2, { t: 0 });
      return h('button', { class: 'inv-tab' + (i === this.member ? ' on' : ''), onclick: () => { this.member = i; this.sel = null; this.render(); } }, cv, h('span', {}, m.name));
    }));

    // «человечек»
    const fig = h('canvas', { width: 160, height: 220, class: 'doll-fig' });
    const fc = fig.getContext('2d')!;
    const glow = fc.createRadialGradient(80, 130, 10, 80, 130, 110);
    glow.addColorStop(0, 'rgba(159,211,106,0.10)'); glow.addColorStop(1, 'rgba(159,211,106,0)');
    fc.fillStyle = glow; fc.fillRect(0, 0, 160, 220);
    drawFigure(fc, b.look ?? b.kind, 80, 212, 6, { t: 0 });

    const svgLines = SLOT_ORDER.map((s) => {
      const p = SLOT_POS[s];
      const sx = p.side === 'l' ? p.x + CELL : p.x, sy = p.y + CELL / 2;
      const on = valid.includes(s) || (this.sel?.from === 'slot' && this.sel.slot === s);
      return `<path d="M${sx},${sy} L${(sx + p.ax) / 2},${sy} L${p.ax},${p.ay}" class="ln${on ? ' on' : ''}"/><circle cx="${p.ax}" cy="${p.ay}" r="3" class="dot${on ? ' on' : ''}"/>`;
    }).join('');
    const doll = h('div', { class: 'doll' });
    doll.innerHTML = `<svg class="doll-svg" viewBox="0 0 360 320">${svgLines}</svg>`;
    doll.append(fig);
    for (const s of SLOT_ORDER) doll.append(this.slotCell(s, eq[s], valid.includes(s)));

    // характеристики
    const st = memberStats(b);
    const stats = h('div', { class: 'inv-stats' },
      ...([
        ['ОЗ', st.hp], ['Защита', st.def], ['Поглощение', st.armor], ['Атака вблизи', sg(st.atkM)],
        ['Стрельба', sg(st.atkR)], ['Перемещение', st.move], ['Стойкость', sg(st.horror)], ['Оружие', st.weapon], ['Поднимет', `${carryOf(b)} кг`],
      ] as [string, string | number][]).map(([k, v]) => h('div', { class: 'st' }, h('span', {}, k), h('b', {}, String(v)))),
      st.courage ? h('div', { class: 'st wide' }, h('span', {}, 'Кураж в начале боя'), h('b', {}, '✦'.repeat(st.courage))) : null,
    );

    // обоз
    const FILTERS: [typeof this.filter, string][] = [['all', 'Всё'], ['weapon', 'Оружие'], ['armor', 'Броня'], ['face', 'Лицо'], ['charm', 'Обереги'], ['tool', 'Снаряжение']];
    const isArmor = (k: ItemKind) => k === 'head' || k === 'body' || k === 'hands' || k === 'legs';
    const shown = G.stash.map((id, idx) => ({ id, idx })).filter(({ id }) => {
      const k = itemOf(id).kind;
      return this.filter === 'all' || (this.filter === 'armor' ? isArmor(k) : k === this.filter);
    });
    const cells: HTMLElement[] = shown.map(({ id, idx }) => this.stashCell(id, idx));
    const total = Math.max(24, Math.ceil((cells.length + 1) / 6) * 6);
    while (cells.length < total) cells.push(h('div', { class: 'scell empty' }));
    const grid = h('div', { class: 'stash-grid' }, ...cells);
    grid.ondragover = (e) => { if (dragData?.from === 'slot') { e.preventDefault(); grid.classList.add('drop-ok'); } };
    grid.ondragleave = () => grid.classList.remove('drop-ok');
    grid.ondrop = (e) => { e.preventDefault(); grid.classList.remove('drop-ok'); if (dragData?.from === 'slot') this.unequip(dragData.slot); };

    const right = h('div', { class: 'inv-right' },
      h('div', { class: 'inv-h' }, 'Обоз отряда', h('span', { class: 'cnt' + (overload() ? ' over' : ''), title: 'Вся ноша отряда (надетое, обоз, расходники) / сколько поднимут бойцы — по 20 кг и +5 за каждое очко Силы. Перегруз: на карте медленнее, в бою −1 к перемещению; больше полутора — втрое медленнее и −2.' }, `${G.stash.length} предм. · ⚖ ${fmtKg(load())} / ${capacity()} кг${overload() ? ' · ' + LOAD_NAME[overload()] : ''}`)),
      h('div', { class: 'chips inv-filters' }, ...FILTERS.map(([k, label]) =>
        h('button', { class: 'chip' + (this.filter === k ? ' on' : ''), onclick: () => { this.filter = k; this.render(); } }, label))),
      grid,
      this.suppliesRow(),
      this.detail(),
    );

    root.replaceChildren(h('div', { class: 'inv-box' },
      h('div', { class: 'inv-top' }, h('h2', {}, 'Снаряжение'), tabs, h('button', { class: 'btn', onclick: () => this.close() }, 'Закрыть [I]')),
      h('div', { class: 'inv-main' }, h('div', { class: 'inv-left' }, doll, stats), right),
      h('div', { class: 'inv-hint' }, 'Перетащите вещь на ячейку или в обоз · клик — выбрать, клик по подсвеченной ячейке — надеть · двойной клик — надеть/снять · ПКМ — снять'),
    ));
  },

  slotCell(slot: Slot, id: string | undefined, can: boolean) {
    const p = SLOT_POS[slot];
    const it = id ? itemOf(id) : null;
    const selected = this.sel?.from === 'slot' && this.sel.slot === slot;
    const cell = h('div', {
      class: `slot${it ? ' full' : ''}${can ? ' can' : ''}${selected ? ' sel' : ''}`,
      style: `left:${p.x}px;top:${p.y}px;${it ? `border-color:${KIND_COLOR[it.kind]}` : ''}`,
      draggable: it ? 'true' : undefined, title: it ? itemName(id!) : SLOTS[slot].name,
    }, it ? iconCanvas(id!) : h('span', { class: 'ph' }, SLOT_GLYPH[slot]), h('div', { class: 'slabel' }, SLOTS[slot].name));
    cell.onclick = () => {
      if (this.sel?.from === 'stash') { if (!this.equipFromStash(this.sel.idx, slot)) flash(cell); return; }
      if (this.sel?.from === 'slot' && this.sel.slot !== slot) { this.moveSlot(this.sel.slot, slot); return; }
      this.sel = it ? { from: 'slot', slot } : null; this.hover = null; this.render();
    };
    cell.ondblclick = () => this.unequip(slot);
    cell.oncontextmenu = (e) => { e.preventDefault(); this.unequip(slot); };
    cell.onmouseenter = () => { this.hover = id ?? null; this.updateDetail(); };
    cell.onmouseleave = () => { this.hover = null; this.updateDetail(); };
    cell.ondragstart = (e) => { dragData = { from: 'slot', slot }; e.dataTransfer!.setData('text/plain', slot); this.highlight(this.validSlots(id).filter((s) => s !== slot)); };
    cell.ondragend = () => { dragData = null; this.highlight([]); };
    cell.ondragover = (e) => {
      const dId = dragId();
      if (dId && canEquip(slot, dId)) { e.preventDefault(); cell.classList.add('drop-ok'); }
    };
    cell.ondragleave = () => cell.classList.remove('drop-ok');
    cell.ondrop = (e) => {
      e.preventDefault();
      if (dragData?.from === 'stash') this.equipFromStash(dragData.idx, slot);
      else if (dragData?.from === 'slot') this.moveSlot(dragData.slot, slot);
      dragData = null;
    };
    return cell;
  },

  stashCell(id: string, idx: number) {
    const it = itemOf(id);
    const selected = this.sel?.from === 'stash' && this.sel.idx === idx;
    const cell = h('div', { class: 'scell' + (selected ? ' sel' : ''), draggable: 'true', title: itemName(id), style: `border-color:${KIND_COLOR[it.kind]}` }, iconCanvas(id, 46));
    cell.onclick = () => { this.sel = selected ? null : { from: 'stash', idx }; this.hover = null; this.render(); };
    cell.ondblclick = () => this.autoEquip(idx);
    cell.onmouseenter = () => { this.hover = id; this.updateDetail(); };
    cell.onmouseleave = () => { this.hover = null; this.updateDetail(); };
    cell.ondragstart = (e) => { dragData = { from: 'stash', idx }; e.dataTransfer!.setData('text/plain', id); this.highlight(this.validSlots(id)); };
    cell.ondragend = () => { dragData = null; this.highlight([]); };
    return cell;
  },

  /** Подсветка ячеек во время перетаскивания (без полной перерисовки). */
  highlight(slots: Slot[]) {
    document.querySelectorAll<HTMLElement>('#inv .slot').forEach((el, i) => el.classList.toggle('can', slots.includes(SLOT_ORDER[i])));
  },

  /** Шиллинги и расходники отряда. */
  suppliesRow(): HTMLElement {
    const cells = CONS_ORDER.filter((id) => G.supplies[id] > 0).map((id) => {
      const c = CONSUMABLES[id];
      const cv = h('canvas', { width: 30, height: 30 });
      drawItemIcon(cv.getContext('2d')!, c.icon, 30);
      const el = h('div', { class: 'sup-cell', title: `${c.name}: ${G.supplies[id]} · ПКМ — выбросить ${c.pack > 1 ? 'пачку' : 'штуку'}` }, cv, h('span', {}, String(G.supplies[id])));
      el.oncontextmenu = (e) => { e.preventDefault(); const n = Math.min(c.pack, G.supplies[id]); G.supplies[id] -= n; this.note = `Выброшено: ${c.name} ×${n}.`; this.hoverCons = null; this.render(); };
      el.onmouseenter = () => { this.hoverCons = c; this.updateDetail(); };
      el.onmouseleave = () => { this.hoverCons = null; this.updateDetail(); };
      return el;
    });
    return h('div', { class: 'inv-supplies' }, h('div', { class: 'money' }, h('b', {}, String(G.money)), ' ш.'), ...cells);
  },
  hoverCons: null as Consumable | null,

  detail(): HTMLElement {
    const box = h('div', { class: 'inv-detail' });
    this.fillDetail(box);
    return box;
  },
  updateDetail() {
    const box = document.querySelector<HTMLElement>('#inv .inv-detail');
    if (box) this.fillDetail(box);
  },
  fillDetail(box: HTMLElement) {
    const selId = this.selId();
    const iid = this.hover ?? selId ?? null, it = iid ? itemOf(iid) : null;
    box.replaceChildren();
    if (this.hoverCons) {
      const c = this.hoverCons, cv = h('canvas', { width: 40, height: 40, class: 'icv' });
      drawItemIcon(cv.getContext('2d')!, c.icon, 40);
      box.append(h('div', { class: 'dh' }, cv, h('div', {}, h('b', {}, c.name), h('div', { class: 'dk' }, `Расходник · в запасе ${G.supplies[c.id]}`))),
        h('div', { class: 'ddesc' }, c.desc), h('div', { class: 'dstats' }, `Цена: ${c.price} ш.${c.pack > 1 ? ` за ${c.pack} шт.` : ''} · вес ${fmtKg(CONS_WT[c.id] * c.pack)} кг${c.pack > 1 ? ' за пачку' : ''}, всего ${fmtKg(CONS_WT[c.id] * G.supplies[c.id])} кг`));
      return;
    }
    if (!it) { box.append(h('div', { class: 'none' }, 'Наведите на вещь, чтобы увидеть её свойства.')); if (this.note) box.append(h('div', { class: 'dcmp' }, this.note)); return; }
    const b = G.squad[this.member];
    const slots = SLOT_ORDER.filter((s) => SLOTS[s].kind === it.kind);
    const worn = slots.map((s) => b.equip?.[s]).filter((x): x is string => !!x && x !== iid);
    box.append(
      h('div', { class: 'dh' }, iconCanvas(iid!, 40), h('div', {}, h('b', {}, itemName(iid!)), h('div', { class: 'dk' }, KIND_NAMES[it.kind]))),
      h('div', { class: 'dstats' }, ...itemStatLines(iid!).map((l) => h('div', {}, l))),
      h('div', { class: 'ddesc' }, it.desc),
      ...(worn.length ? [h('div', { class: 'dcmp' }, `Сейчас надето: ${worn.map((w) => itemName(w)).join(', ')}`)] : []),
    );
    if (!this.hover && this.sel) {
      const btns = h('div', { class: 'dbtns' });
      if (this.sel.from === 'stash') {
        const idx = this.sel.idx;
        if (it.weapon && condOf(iid!) === 'worn' && hasRepairKit()) btns.append(h('button', { class: 'btn', disabled: G.supplies.parts <= 0, title: G.supplies.parts > 0 ? `Инструменты: изношенное — в идеальное, уходит 1 запасная деталь (есть ${G.supplies.parts}). Час работы. Провал — следующая попытка через сутки.` : 'Нужны запасные детали', onclick: () => this.fieldRepair(idx) }, `Починить [Механика ${DC.normal}]`));
        if (it.kind !== 'tool' && condOf(iid!) !== 'broken') btns.append(h('button', { class: 'btn', onclick: () => this.autoEquip(idx) }, 'Надеть'));
        btns.append(h('button', { class: 'btn', title: 'Оставить вещь здесь — насовсем', onclick: () => { G.stash.splice(idx, 1); this.note = `Выброшено: ${itemName(iid!)}.`; this.sel = null; this.render(); } }, 'Выбросить'));
      } else {
        const slot = this.sel.slot;
        btns.append(h('button', { class: 'btn', onclick: () => this.unequip(slot) }, 'Снять в обоз'));
      }
      box.querySelector('.dh')!.append(btns); // кнопки — в шапке описания, чтобы не уезжали за край
    }
    if (this.note) box.append(h('div', { class: 'dcmp' }, this.note));
  },
};

const SLOT_GLYPH: Record<Slot, string> = { main: '⚔', side: '†', head: '☗', body: '▣', hands: '☚', legs: '⫴', charm: '❂', face: '◎' };

let dragData: { from: 'stash'; idx: number } | { from: 'slot'; slot: Slot } | null = null;
function dragId(): string | undefined {
  if (!dragData) return undefined;
  return dragData.from === 'stash' ? G.stash[dragData.idx] : G.squad[Inventory.member].equip?.[dragData.slot];
}
function flash(el: HTMLElement) { el.classList.add('bad'); setTimeout(() => el.classList.remove('bad'), 300); }

