// ============================================================
//  Интерфейс: диалоговое окно, HUD, боевая панель, экраны
// ============================================================
import { G, objectiveText } from './state';
import { DIALOGS, SPEAKERS, DNode, Choice, fmt } from './dialogs';
import { drawFigure } from './gfx';
import { Combat } from './combat';
import { $ } from './util';
import { effMaxHp, woundsOf, bestHealer, bandageAmount, bandage, surgery, rest } from './wounds';
import { COURAGE_MAX } from './combat';

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
    this.full = fmt(typeof n.t === 'function' ? n.t(G) : n.t);
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
        b.append(fmt(c.t));
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
  $('squadbar').innerHTML = G.squad.map((s) => {
    const max = effMaxHp(s), w = woundsOf(s);
    const marks = w.map((x) => `<span class="wd ${x.heavy ? 'heavy' : ''}" title="${x.name}: ${x.desc}">✚</span>`).join('');
    return `<div class="sq">${s.name} ${marks}<div class="hp"><span style="width:${(s.hp / s.maxHp) * 100}%"></span><i style="width:${((s.maxHp - max) / s.maxHp) * 100}%"></i></div><div class="hpn">${s.hp}/${max}</div></div>`;
  }).join('') + `<div class="sq res" title="Бинты · медикаменты · пайки">Бинты ${G.supplies.bandages} · Медик. ${G.supplies.medicine} · Пайки ${G.supplies.rations}<div class="hpn">[Q] Отряд и лечение</div></div>`;
}

// ------------------------------------------------------------ Отряд: лечение
export function openSquad(onClose: () => void) {
  const el = $('squad');
  let log = '';
  const render = () => {
    const healer = bestHealer();
    el.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'squad-box';
    box.innerHTML = `<h2>Отряд</h2>
      <div class="sup">Бинты: <b>${G.supplies.bandages}</b> · Медикаменты: <b>${G.supplies.medicine}</b> · Пайки: <b>${G.supplies.rations}</b>
      <span class="healer">Лекарь: ${healer.name} (Медицина ${healer.bonus >= 0 ? '+' : ''}${healer.bonus}) — перевязка +${bandageAmount(healer.bonus)} ОЗ, операция d20 против 13</span></div>`;
    for (const s of G.squad) {
      const max = effMaxHp(s);
      const row = document.createElement('div');
      row.className = 'mem';
      row.innerHTML = `<div class="mn"><b>${s.name}</b> <span class="mhp">${s.hp}/${max} ОЗ${max < s.maxHp ? ` <i>(макс. ${s.maxHp}, −${s.maxHp - max} от ран)</i>` : ''}</span>
        <div class="hp"><span style="width:${(s.hp / s.maxHp) * 100}%"></span><i style="width:${((s.maxHp - max) / s.maxHp) * 100}%"></i></div></div>`;
      const acts = document.createElement('div'); acts.className = 'macts';
      const bb = document.createElement('button');
      bb.className = 'btn'; bb.textContent = 'Перевязать (−1 бинт)';
      bb.disabled = s.hp >= max || G.supplies.bandages <= 0;
      bb.onclick = () => { log = bandage(s) ?? ''; render(); };
      acts.append(bb);
      row.append(acts);
      const wl = document.createElement('div'); wl.className = 'wlist';
      const ws = woundsOf(s);
      if (!ws.length) wl.innerHTML = '<span class="ok">Ранений нет</span>';
      for (const w of ws) {
        const it = document.createElement('div');
        it.className = 'wound' + (w.heavy ? ' heavy' : '');
        it.innerHTML = `<b>${w.name}</b> — ${w.desc} <i>${w.heavy ? 'нужна операция' : 'пройдёт после привала'}</i>`;
        if (w.heavy) {
          const ob = document.createElement('button');
          ob.className = 'btn'; ob.textContent = 'Оперировать (−1 медикаменты)';
          ob.disabled = G.supplies.medicine <= 0;
          ob.onclick = () => { log = surgery(s, w.id).text; render(); };
          it.append(' ', ob);
        }
        wl.append(it);
      }
      row.append(wl);
      box.append(row);
    }
    const foot = document.createElement('div'); foot.className = 'sfoot';
    const rb = document.createElement('button');
    rb.className = 'btn'; rb.textContent = 'Разбить привал (−1 паёк)';
    rb.title = 'Каждый восстанавливает половину недостающих ОЗ, лёгкие ранения заживают.';
    rb.disabled = G.supplies.rations <= 0;
    rb.onclick = () => { log = rest(); render(); };
    const cb = document.createElement('button');
    cb.className = 'btn'; cb.textContent = 'Закрыть [Q]';
    cb.onclick = () => closeSquad(onClose);
    foot.append(rb, cb);
    box.append(foot);
    if (log) { const l = document.createElement('div'); l.className = 'slog'; l.textContent = log; box.append(l); }
    el.append(box);
    refreshHud();
  };
  el.classList.remove('hidden');
  render();
}
export function closeSquad(onClose: () => void) { $('squad').classList.add('hidden'); onClose(); }
export const squadOpen = () => !$('squad').classList.contains('hidden');

export function exploreHint() {
  $('hint').textContent = 'WASD / стрелки — идти · E / Пробел — говорить · клик — идти или говорить · Q — отряд и лечение';
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
  const cour = '✦'.repeat(u.courage) + '✧'.repeat(COURAGE_MAX - u.courage);
  const wnds = (u.base.wounds ?? []).length;
  $('cunit').innerHTML = `<canvas width="56" height="56"></canvas><div><b>${u.name}</b>
    <div class="hpbar"><span style="width:${(u.hp / u.maxHp) * 100}%"></span></div>
    ОЗ ${u.hp}/${u.maxHp} · ОД <span style="color:#e0c070">${ap}</span><br>Кураж <span style="color:#f0a040" title="Копится: устоять под ударом, сразить врага, точный удар, клич командира. Гаснет от ужаса.">${cour}</span>${wnds ? ` · <span style="color:#e09080">ран: ${wnds}</span>` : ''}</div>`;
  drawPortrait($('cunit').querySelector('canvas')!, u.kind, 1.7);
  const box = $('cactions');
  box.innerHTML = '';
  Combat.buttons().forEach((b, i) => {
    const el = document.createElement('button');
    el.className = 'btn' + (b.active ? ' active' : '') + (b.kind === 'c' ? ' brave' : '');
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
