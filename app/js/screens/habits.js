// «Ритм»: привычки без стриков. Неделя — тап по дню, месяц — реальные итоги.

import { S, update, uid, XP, addXp } from '../store.js';
import { todayISO, addDays, weekDates, monthKey, addMonths, monthTitle, daysInMonth, DOW, dayShort } from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import { habitMonthCount } from '../selectors.js';

const mode = () => S.ui.habMode || 'week';
const anchor = () => S.ui.habitAnchor || todayISO();
const monthA = () => S.ui.habMonth || monthKey(todayISO());

export function render() {
  const live = S.habits.filter(hb => !hb.archived);
  return h`
    <div class="title">Ритм</div>
    <div class="sub">Отметка — просто отметка. Пропуск ничего не отнимает.</div>
    <div class="pills">
      <button class="pill ${mode() === 'week' ? 'on' : ''}" data-act="mode" data-v="week">Неделя</button>
      <button class="pill ${mode() === 'month' ? 'on' : ''}" data-act="mode" data-v="month">Месяц</button>
    </div>
    ${raw(mode() === 'week' ? weekView(live) : monthView(live))}
    <button class="add" data-act="add">+ Новая привычка</button>
    ${live.length ? raw(h`<div class="ai">${tip(live)}</div>`) : ''}`;
}

function weekView(list) {
  const dates = weekDates(anchor());
  const t = todayISO();
  if (!list.length) return emptyCard();
  return h`
    <div class="stepper">
      <button class="arrow" data-act="prev">‹</button>
      <div class="lab">${dayShort(dates[0])} — ${dayShort(dates[6])}</div>
      <button class="arrow" data-act="next">›</button>
    </div>
    <div class="row" style="padding:0 2px">
      <span class="lab" style="width:0;flex:none"></span>
      ${DOW.map(d => raw(h`<span class="lab grow" style="text-align:center">${d}</span>`))}
    </div>
    ${list.map(hb => {
      const n = dates.filter(d => hb.log[d]).length;
      return raw(h`
        <div class="card">
          <div class="row between"><div class="ink grow ellip">${hb.name}</div>
            <span class="lab">${n} из 7</span>
            <button class="q-edit" data-act="edit" data-id="${hb.id}">›</button></div>
          <div class="hab-grid">
            ${dates.map(d => raw(h`<button class="hab-cell ${hb.log[d] ? 'on' : ''} ${d === t ? 'today' : ''}"
                 data-act="tick" data-id="${hb.id}" data-d="${d}"
                 ${d > t ? 'disabled style="opacity:.4"' : ''}
                 aria-label="${d}">${d.slice(8)}</button>`))}
          </div>
        </div>`);
    })}`;
}

function monthView(list) {
  const ym = monthA();
  const total = daysInMonth(ym);
  if (!list.length) return emptyCard();
  return h`
    <div class="stepper">
      <button class="arrow" data-act="mprev">‹</button>
      <div class="lab">${monthTitle(ym)}</div>
      <button class="arrow" data-act="mnext">›</button>
    </div>
    <img class="hero-img" src="assets/illustration_03.png" alt="">
    <div class="card">
      ${list.map(hb => {
        const n = habitMonthCount(hb, ym);
        return raw(h`<div class="row"><span class="lab grow ellip">${hb.name}</span>
          ${raw(bar(Math.round(n / total * 100), n > total / 2))}<span class="lab">${n} из ${total}</span></div>`);
      })}
    </div>`;
}

const emptyCard = () => h`<div class="card dash"><div class="empty">Привычек пока нет.<br>Начни с одной — этого достаточно.</div></div>`;

function tip(list) {
  const dates = weekDates(anchor());
  const scored = list.map(hb => ({ hb, n: dates.filter(d => hb.log[d]).length })).sort((a, b) => a.n - b.n);
  const worst = scored[0], best = scored[scored.length - 1];
  if (best.n >= 5) return `«${best.hb.name}» держится ${best.n} дней из 7. Это уже ритм, а не усилие.`;
  if (worst.n === 0) return `«${worst.hb.name}» на этой неделе не шла. Может, она сейчас просто не нужна?`;
  return `За неделю отмечено ${scored.reduce((a, s) => a + s.n, 0)} раз. Ровно столько, сколько было сил.`;
}

function habitSheet(hb) {
  const isNew = !hb;
  openSheet({
    title: isNew ? 'Новая привычка' : 'Привычка',
    body: field.text('name', 'Название', hb?.name || '', 'например, «Итальянский 15 минут»'),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        if (isNew) s.habits.push({ id: uid(), name, log: {}, createdAt: todayISO() });
        else { const x = s.habits.find(y => y.id === hb.id); if (x) x.name = name; }
      });
      close();
    },
    danger: isNew ? null : 'Удалить привычку',
    onDanger: (_v, close) => {
      update(s => { s.habits = s.habits.filter(x => x.id !== hb.id); });
      close();
      toast('Удалила — без вины');
    },
  });
}

export const actions = {
  mode: v => update(s => { s.ui.habMode = v.v; }),
  prev: () => update(s => { s.ui.habitAnchor = addDays(anchor(), -7); }),
  next: () => update(s => { s.ui.habitAnchor = addDays(anchor(), 7); }),
  mprev: () => update(s => { s.ui.habMonth = addMonths(monthA(), -1); }),
  mnext: () => update(s => { s.ui.habMonth = addMonths(monthA(), 1); }),
  add: () => habitSheet(null),
  edit: v => habitSheet(S.habits.find(x => x.id === v.id)),
  tick: v => update(s => {
    const hb = s.habits.find(x => x.id === v.id);
    if (!hb) return;
    if (hb.log[v.d]) { delete hb.log[v.d]; addXp(-XP.habit); }
    else { hb.log[v.d] = true; addXp(XP.habit); }
  }),
};
