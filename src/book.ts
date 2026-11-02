// ============================================================
//  Книга: разворот из двух страниц с перелистыванием (CSS 3D)
// ============================================================
import { sleep } from './util';

type Kid = Node | string | number | null | undefined | false;

/** Мини-конструктор DOM: h('div', { class: 'x', onclick }, ...дети). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false || v === null) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k === 'value') (el as HTMLInputElement).value = String(v);
    else if (k.startsWith('on')) (el as any)[k.toLowerCase()] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'number' ? String(c) : c);
  return el;
}

export interface Spread {
  title: string;                 // название главы (для закладок)
  left: () => HTMLElement;
  right: () => HTMLElement;
}

export interface BookOpts {
  heading?: string;              // колонтитул
  onClose?: () => void;
  canLeave?: (i: number) => string | null;   // проверка перед переходом вперёд
}

/** Копия узла вместе с нарисованным содержимым canvas. */
function cloneDeep(el: HTMLElement): HTMLElement {
  const c = el.cloneNode(true) as HTMLElement;
  const src = el.querySelectorAll('canvas'), dst = c.querySelectorAll('canvas');
  src.forEach((s, i) => { if (s.width && s.height) dst[i].getContext('2d')!.drawImage(s, 0, 0); });
  c.querySelectorAll('input').forEach((inp, i) => inp.setAttribute('value', el.querySelectorAll('input')[i].value));
  return c;
}

export class Book {
  root: HTMLElement;
  L: HTMLElement; R: HTMLElement;
  flip: HTMLElement; front: HTMLElement; back: HTMLElement;
  ribbons: HTMLElement; warnEl: HTMLElement;
  i = 0; maxReached = 0; busy = false;
  private warnT = 0;

  constructor(host: HTMLElement, public spreads: Spread[], public opts: BookOpts = {}) {
    this.L = h('div', { class: 'page left' });
    this.R = h('div', { class: 'page right' });
    this.front = h('div', { class: 'face front' });
    this.back = h('div', { class: 'face back-face' });
    this.flip = h('div', { class: 'flip' }, this.front, this.back);
    this.ribbons = h('div', { class: 'ribbons' });
    this.warnEl = h('div', { class: 'book-warn' });
    this.root = h('div', { class: 'book-wrap' },
      h('div', { class: 'book' },
        h('div', { class: 'cover' }),
        this.L, this.R, h('div', { class: 'spine' }), this.flip, this.ribbons, this.warnEl,
        opts.onClose ? h('button', { class: 'book-close', title: 'Закрыть книгу', onclick: () => opts.onClose!() }, '✕') : null,
      ),
    );
    host.replaceChildren(this.root);
    this.render();
  }

  destroy() { this.root.remove(); }

  private wrap(content: HTMLElement, side: 'left' | 'right', idx: number) {
    const last = this.spreads.length - 1;
    const num = idx * 2 + (side === 'left' ? 1 : 2);
    const nav = side === 'left'
      ? (idx > 0 ? h('button', { class: 'pnav', onclick: () => this.go(idx - 1) }, '‹ назад') : h('span'))
      : (idx < last ? h('button', { class: 'pnav', onclick: () => this.go(idx + 1) }, 'далее ›') : h('span'));
    return h('div', { class: 'pwrap' },
      h('div', { class: 'phead' }, side === 'left' ? this.opts.heading ?? '' : this.spreads[idx].title),
      h('div', { class: 'pbody' }, content),
      h('div', { class: 'pfoot' }, side === 'left' ? nav : h('span', { class: 'pnum' }, num), side === 'left' ? h('span', { class: 'pnum' }, num) : nav),
    );
  }

  /** Перерисовать текущий разворот (после изменения данных). */
  render() {
    const s = this.spreads[this.i];
    this.L.replaceChildren(this.wrap(s.left(), 'left', this.i));
    this.R.replaceChildren(this.wrap(s.right(), 'right', this.i));
    this.renderRibbons();
  }

  private renderRibbons() {
    this.ribbons.replaceChildren(...this.spreads.map((s, k) =>
      h('button', {
        class: 'ribbon' + (k === this.i ? ' on' : '') + (k > this.maxReached ? ' locked' : ''),
        title: s.title, style: `top:${40 + k * 58}px`,
        onclick: () => { if (k <= this.maxReached) this.go(k); },
      }, ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][k] ?? String(k + 1)),
    ));
  }

  warn(msg: string) {
    this.warnEl.textContent = msg;
    this.warnEl.classList.add('on');
    clearTimeout(this.warnT);
    this.warnT = window.setTimeout(() => this.warnEl.classList.remove('on'), 2600);
  }

  async go(to: number) {
    if (this.busy || to === this.i || to < 0 || to >= this.spreads.length) return;
    const fwd = to > this.i;
    if (fwd && this.opts.canLeave) {
      for (let k = this.i; k < to; k++) {
        const msg = this.opts.canLeave(k);
        if (msg) { this.warn(msg); if (k !== this.i) this.go(k); return; }
      }
    }
    this.busy = true;
    const old = fwd ? this.R : this.L;
    this.front.replaceChildren(cloneDeep(old.firstElementChild as HTMLElement));
    this.front.className = 'face front ' + (fwd ? 'right' : 'left');
    this.i = to;
    this.maxReached = Math.max(this.maxReached, to);
    const s = this.spreads[to];
    const nl = this.wrap(s.left(), 'left', to), nr = this.wrap(s.right(), 'right', to);
    if (fwd) this.R.replaceChildren(nr); else this.L.replaceChildren(nl);
    // обратная сторона листа должна показать уже нарисованное содержимое
    const tmp = fwd ? nl : nr;
    const holder = fwd ? this.L : this.R;
    const prev = holder.firstElementChild;
    holder.append(tmp); tmp.style.visibility = 'hidden';
    const backCopy = cloneDeep(tmp);
    backCopy.style.visibility = '';
    this.back.replaceChildren(backCopy);
    tmp.remove(); tmp.style.visibility = '';
    if (prev) holder.replaceChildren(prev);
    this.back.className = 'face back-face ' + (fwd ? 'left' : 'right');
    this.flip.className = 'flip ' + (fwd ? 'fwd' : 'bwd');
    void this.flip.offsetWidth;
    this.flip.classList.add('go');
    await sleep(720);
    if (fwd) this.L.replaceChildren(nl); else this.R.replaceChildren(nr);
    this.flip.className = 'flip';
    this.renderRibbons();
    this.busy = false;
  }
}
