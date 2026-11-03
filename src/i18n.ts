// ============================================================
//  Языки: русский (исходный текст в коде) и английский (британский).
//  Русские строки остаются в коде; английский — словарь src/lang/en.json
//  «русская строка → перевод». Строки с подстановками хранятся шаблонами
//  с {0}, {1}… — кусочки на их месте (имена, предметы) переводятся отдельно.
//  Перевод ставится на выходе: в DOM (наблюдатель за текстом) и на холсте
//  (fillText/measureText); диалоги и реплики переводятся заранее, до печати.
// ============================================================
import EN from './lang/en.json';

export type Lang = 'ru' | 'en';
export const LANG: Lang = (() => { try { return localStorage.getItem('morgulis.lang') === 'en' ? 'en' : 'ru'; } catch { return 'ru'; } })();
/** Сменить язык: запоминается, страница перезагружается (меняется только в главном меню). */
export function setLang(l: Lang) { try { localStorage.setItem('morgulis.lang', l); } catch { /* приватный режим */ } location.reload(); }

const CYR = /[А-Яа-яЁё]/;
const dict = EN as Record<string, string>;
interface Pat { re: RegExp; idx: number[]; val: string; weight: number; lits: string[]; head: string; tail: string }
const pats: Pat[] = [];
for (const [k, v] of Object.entries(dict)) {
  if (!/\{\d+\}/.test(k)) continue;
  const idx: number[] = [], parts = k.split(/(\{\d+\})/);
  let src = '', weight = 0;
  for (const part of parts) {
    const m = /^\{(\d+)\}$/.exec(part);
    if (m) { idx.push(+m[1]); src += '([\\s\\S]*?)'; } // подстановка может быть пустой
    else { src += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); weight += part.length; }
  }
  if (weight < 2) continue; // шаблон без своего текста — слишком общий
  pats.push({ re: new RegExp('^' + src + '$'), idx, val: v, weight, lits: parts.filter((x, i) => i % 2 === 0 && x), head: parts[0], tail: parts[parts.length - 1] });
}
pats.sort((a, b) => b.weight - a.weight);

const cache = new Map<string, string>();
function core(s: string, depth: number): string {
  const ex = dict[s];
  if (ex !== undefined) return ex;
  // края без букв (тире, значки, цифры, скобки, точка) — отрезать и искать середину
  const m0 = /^([^А-Яа-яЁёA-Za-z{]*)([\s\S]*?)([^А-Яа-яЁёA-Za-z}]*)$/.exec(s)!;
  if (m0[1] || m0[3]) {
    const mid = m0[2];
    if (dict[mid] !== undefined) return m0[1] + dict[mid] + m0[3];
    if (dict[mid + '.'] !== undefined) return m0[1] + dict[mid + '.'].replace(/\.$/, '') + m0[3];
  }
  if (depth < 4) for (const p of pats) {
    // быстрый отсев: начало, конец и все постоянные куски шаблона должны быть в строке по порядку (иначе регэксп долго перебирает)
    if (!s.startsWith(p.head) || !s.endsWith(p.tail)) continue;
    let at = 0, ok = true;
    for (const l of p.lits) { const j = s.indexOf(l, at); if (j < 0) { ok = false; break; } at = j + l.length; }
    if (!ok) continue;
    const m = p.re.exec(s);
    if (!m) continue;
    let out = p.val;
    p.idx.forEach((n, i) => { out = out.split(`{${n}}`).join(trd(m[i + 1], depth + 1)); });
    return out;
  }
  // «[E] Название», «Название: описание»
  const tag = /^(\[[^\]]+\] )([\s\S]+)$/.exec(s);
  if (tag && depth < 4) return tag[1] + trd(tag[2], depth + 1);
  if (!s.includes('<') && s.includes(': ') && depth < 4) { const i = s.indexOf(': '), a = trd(s.slice(0, i), depth + 1), b = trd(s.slice(i + 2), depth + 1); if (!CYR.test(a + b)) return a + ': ' + b; }
  // составные строки: поделить по разделителям и перевести части; годится, только если перевелись все
  if (!s.includes('<') && depth < 6) for (const sep of [' · ', '. ', ' — ', ', ', '\n', ' ']) {
    if (!s.includes(sep) || (sep === ' ' && s.length > 60)) continue;
    const t = s.split(sep).map((x) => trd(x, depth + 1)).join(sep);
    if (!CYR.test(t.replace(/\{[^}]*\}/g, ''))) return t;
  }
  // запасной путь: перевести отдельные слова, которые есть в словаре (имена и т.п.)
  if (/\s/.test(s)) { const t = s.split(/(\s+)/).map((w) => dict[w] ?? w).join(''); if (t !== s) return t; }
  return s;
}
function trd(s: string, depth: number): string {
  if (!s || !CYR.test(s)) return s;
  const c = cache.get(s);
  if (c !== undefined) return c;
  const r = core(s, depth);
  if (cache.size > 20000) cache.clear();
  cache.set(s, r);
  return r;
}
/** Непереведённые строки (для отладки: window.__untr при ?debug). */
const untr = new Set<string>();
if (typeof window !== 'undefined' && location.search.includes('debug')) (window as any).__untr = untr;
/** Перевести строку на текущий язык (для русского — как есть). */
export function tr(s: string): string {
  if (LANG === 'ru') return s;
  const r = trd(s, 0);
  if (CYR.test(r.replace(/\{[^}]*\}/g, '')) && untr.size < 3000) untr.add(s); // {чужак} и т.п. в переводе — нарочно
  return r;
}

/** Включить перевод на выходе: DOM и холст. Вызывается один раз при старте. */
export function installI18n() {
  if (LANG === 'ru') return;
  document.documentElement.lang = 'en-GB';
  document.title = tr(document.title);
  const C = CanvasRenderingContext2D.prototype as any;
  for (const fn of ['fillText', 'strokeText', 'measureText']) {
    const orig = C[fn];
    C[fn] = function (this: CanvasRenderingContext2D, text: string, ...rest: unknown[]) { return orig.call(this, typeof text === 'string' ? tr(text) : text, ...rest); };
  }
  const skip = (n: Node) => !!(n.parentElement?.closest('[data-notr]'));
  const done = new Set<string>(); // уже выданные переводы — повторно не трогаем (иначе неполный перевод зацикливается)
  const fixText = (n: Node) => {
    const v = n.nodeValue;
    if (!v || !CYR.test(v) || done.has(v) || skip(n)) return;
    const t = tr(v);
    if (t !== v) { if (done.size > 5000) done.clear(); done.add(t); n.nodeValue = t; }
  };
  const fixAttrs = (el: Element) => { for (const a of ['title', 'placeholder']) { const v = el.getAttribute(a); if (v && CYR.test(v) && !done.has(v)) { const t = tr(v); if (t !== v) { done.add(t); el.setAttribute(a, t); } } } }; // запись того же значения тоже даёт мутацию — иначе цикл
  const walk = (root: Node) => {
    if (root.nodeType === 3) return fixText(root);
    if (root.nodeType !== 1) return;
    fixAttrs(root as Element);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = it.nextNode(); n; n = it.nextNode()) n.nodeType === 3 ? fixText(n) : fixAttrs(n as Element);
  };
  walk(document.body);
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') fixText(m.target);
      else if (m.type === 'attributes') fixAttrs(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
}
