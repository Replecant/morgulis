// ============================================================
//  Интерфейс: диалоговое окно, HUD, боевая панель, экраны
// ============================================================
import { G, objectiveText } from './state';
import { DIALOGS, SPEAKERS, DNode, Choice } from './dialogs';
import { drawFigure } from './gfx';
import { Combat } from './combat';
import { $ } from './util';

// ------------------------------------------------------------ Диалоги
export const Dialog = {
  active: false,
  node: null as DNode | null,
  tree: '' as string,
  full: '', shown: 0,
  choices: [] as Choice[],
  onAction: (_act: string) => {},
  onClose: () => {},
  closedAt: 0,

  start(id: string) {
    const tree = DIALOGS[id];
    if (!tree) return;
    this.tree = id; this.active = true;
    $('dialog').classList.remove('hidden');
    $('hint').textContent = 'Пробел / клик — далее · 1–5 — выбор ответа';
    this.goto(typeof tree.start === 'function' ? tree.start(G) : tree.start);
  },

  goto(id: string | undefined) {
    if (!id) return this.close();
    const n = DIALOGS[this.tree].nodes[id];
    if (!n) return this.close();
    this.node = n;
    const sp = SPEAKERS[n.s];
    $('dname').textContent = sp.name;
    $('dtext').className = n.s === 'nar' ? 'nar' : '';
    this.full = typeof n.t === 'function' ? n.t(G) : n.t;
    n.do?.(G); // эффект — после того, как текст уже выбран
    this.shown = 0;
    $('dtext').textContent = '';
    $('dchoices').innerHTML = '';
    const raw = typeof n.c === 'function' ? n.c(G) : n.c;
    this.choices = (raw ?? []).filter((c) => !c.if || c.if(G));
    drawPortrait($('portrait') as HTMLCanvasElement, sp.kind);
  },

  get typing() { return this.shown < this.full.length; },

  update(dt: number) {
    if (!this.active || !this.typing) return;
    this.shown = Math.min(this.full.length, this.shown + dt * 75);
    $('dtext').textContent = this.full.slice(0, Math.floor(this.shown));
    if (!this.typing) this.showChoices();
  },

  finishTyping() {
    this.shown = this.full.length;
    $('dtext').textContent = this.full;
    this.showChoices();
  },

  showChoices() {
    const box = $('dchoices');
    box.innerHTML = '';
    if (this.choices.length) {
      this.choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'choice';
        b.innerHTML = `<span class="n">${i + 1}.</span>`;
        b.append(c.t);
        b.onclick = (e) => { e.stopPropagation(); this.choose(i); };
        box.append(b);
      });
    } else {
      const d = document.createElement('div');
      d.className = 'cont';
      d.textContent = this.node?.act ? '▸ Пробел — продолжить' : this.node?.go ? '▸ Пробел — далее' : '▸ Пробел — завершить';
      box.append(d);
    }
  },

  choose(i: number) {
    const c = this.choices[i];
    if (!c) return;
    if (c.act) return this.close(c.act);
    this.goto(c.go);
  },

  advance() {
    if (this.typing) return this.finishTyping();
    if (this.choices.length || !this.node) return;
    const n = this.node;
    if (n.act) return this.close(n.act);
    if (n.go) return this.goto(typeof n.go === 'function' ? n.go(G) : n.go);
    this.close();
  },

  close(act?: string) {
    this.active = false;
    this.closedAt = performance.now();
    $('dialog').classList.add('hidden');
    this.onClose();
    if (act) this.onAction(act);
  },

  key(e: KeyboardEvent) {
    if (/^Digit[1-9]$/.test(e.code)) {
      if (this.typing) this.finishTyping();
      else this.choose(Number(e.code.slice(5)) - 1);
      return;
    }
    if (['Space', 'Enter', 'KeyE'].includes(e.code)) this.advance();
  },
};

function drawPortrait(cv: HTMLCanvasElement, kind: string | null, scale = 3) {
  const c = cv.getContext('2d')!;
  const w = cv.width, h = cv.height;
  const g = c.createRadialGradient(w / 2, h * 0.35, 4, w / 2, h / 2, w * 0.75);
  g.addColorStop(0, '#2c3a22'); g.addColorStop(1, '#0b0f09');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  if (!kind) {
    c.fillStyle = 'rgba(185,217,146,0.8)';
    c.beginPath(); c.arc(w / 2, h / 2, w * 0.18, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(60,90,40,0.7)';
    c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.05, w * 0.1, 0, 0, Math.PI * 2); c.fill();
    return;
  }
  const big = kind === 'smith' ? 0.88 : kind === 'boy' ? 1.25 : 1;
  drawFigure(c, kind, w / 2, h + 4 * scale * big + (kind === 'imp' ? -10 : 0), scale * big, { t: 0 });
}

// ------------------------------------------------------------ HUD
export function refreshHud() {
  $('objective').innerHTML = `<b>Задача</b>${objectiveText()}`;
  $('squadbar').innerHTML = G.squad.map((s) =>
    `<div class="sq">${s.name}<div class="hp"><span style="width:${(s.hp / s.maxHp) * 100}%"></span></div></div>`).join('');
}

export function exploreHint() {
  $('hint').textContent = 'WASD / стрелки — идти · E / Пробел — говорить · клик — идти или говорить';
}

let toastTimer = 0;
export function toast(s: string) {
  const el = $('toast');
  el.textContent = s; el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('on'), 1600);
}

// ------------------------------------------------------------ Боевая панель
export function combatShow(on: boolean) {
  for (const id of ['cpanel', 'clog']) $(id).classList.toggle('hidden', !on);
  $('hud').classList.toggle('hidden', on);
  if (on) {
    $('clog').innerHTML = '';
    $('hint').textContent = '';
  } else exploreHint();
}

export function combatLog(s: string) {
  const el = $('clog');
  const d = document.createElement('div');
  d.textContent = s;
  el.append(d);
  while (el.children.length > 8) el.firstChild!.remove();
}

export function combatPanel() {
  const u = Combat.sel;
  const myTurn = Combat.turn === 'player' && !Combat.busy;
  ($('cend') as HTMLButtonElement).disabled = !myTurn;
  if (!u) {
    $('cunit').innerHTML = Combat.turn === 'enemy' ? '<i>Противник действует…</i>' : '';
    $('cactions').innerHTML = '';
    return;
  }
  const ap = '◆'.repeat(u.ap) + '◇'.repeat(Math.max(0, 2 - u.ap));
  $('cunit').innerHTML = `<canvas width="56" height="56"></canvas><div><b>${u.name}</b>
    <div class="hpbar"><span style="width:${(u.hp / u.maxHp) * 100}%"></span></div>
    ОЗ ${u.hp}/${u.maxHp} · ОД <span style="color:#e0c070">${ap}</span></div>`;
  drawPortrait($('cunit').querySelector('canvas')!, u.kind, 1.7);
  const box = $('cactions');
  box.innerHTML = '';
  Combat.buttons().forEach((b, i) => {
    const el = document.createElement('button');
    el.className = 'btn' + (b.active ? ' active' : '');
    el.disabled = b.disabled || !myTurn;
    el.title = b.desc;
    el.innerHTML = `<span class="k">${i + 1}</span>`;
    el.append(b.label);
    el.onclick = () => Combat.pressButton(i);
    box.append(el);
  });
}

// ------------------------------------------------------------ Экраны
export function screen(html: string, buttons: { label: string; fn: () => void }[] = []) {
  const s = $('screen');
  s.innerHTML = `<div class="scr">${html}<div class="btns"></div></div>`;
  const bx = s.querySelector('.btns')!;
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = 'btn'; el.textContent = b.label;
    el.onclick = () => b.fn();
    bx.append(el);
  }
}
export const hideScreen = () => { $('screen').innerHTML = ''; };
