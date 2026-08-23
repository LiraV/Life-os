// «Планы»: неделя, месяц, год — реальные периоды с навигацией в обе стороны.
// Цепочка «задача → цель месяца → квартал → тема года» строится из данных.

import { S, update, uid, XP, addXp, SPHERES } from '../store.js';
import {
  todayISO, addDays, addMonths, weekKey, weekDates, isoWeek,
  monthKey, monthTitle, dayShort, yearOf, quarterKey, quarterMonths, MONTHS,
} from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import {
  questsOn, weekStats, goalProgress, goalsIn, goalChain, goalChildren, goalById,
  quarterProgress, yearProgress, liveGoals, sphereOf, HORIZONS,
  goalSlots, goalsPlannedIn, monthGoals, isCounter, counterOf,
} from '../selectors.js';

const TABS = [['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год']];
const tab = () => S.ui.planTab || 'week';
const anchor = () => S.ui.weekAnchor || todayISO();
const month = () => S.ui.monthAnchor || monthKey(todayISO());
const year = () => S.ui.year || yearOf(todayISO());
const quarterOfMonth = ym => quarterKey(ym).slice(5);

export function render() {
  return h`
    <div class="title">Планы</div>
    <div class="pills">${TABS.map(([k, l]) => raw(h`<button class="pill ${tab() === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`))}</div>
    ${raw({ week: weekView, month: monthView, year: yearView }[tab()]())}
    <div style="height:4px"></div>`;
}

// ── неделя ──────────────────────────────────────────────────────
function weekView() {
  const a = anchor();
  const key = weekKey(a);
  const { week } = isoWeek(a);
  const dates = weekDates(a);
  const w = S.weeks[key] || {};
  const stats = weekStats(a);
  const isCur = weekKey(todayISO()) === key;
  const past = dates[6] < todayISO();
  const steps = w.boss?.steps || [];
  const stepsDone = steps.filter(s => s.done).length;

  const bySphere = {};
  dates.forEach(d => questsOn(d).forEach(q => {
    const k = q.sphere || '—';
    (bySphere[k] ||= { total: 0, done: 0 });
    bySphere[k].total++;
    if (q.done) bySphere[k].done++;
  }));

  return h`
    <div class="stepper">
      <button class="arrow" data-act="wprev">‹</button>
      <div style="text-align:center">
        <div class="ink"><b>Неделя ${week}</b></div>
        <div class="lab">${dayShort(dates[0])} — ${dayShort(dates[6])}${isCur ? ' · текущая' : ''}</div>
      </div>
      <button class="arrow" data-act="wnext">›</button>
    </div>

    ${w.rest ? raw('<div class="card dash"><div class="ink">Неделя отдыха ✦</div><div class="lab">Треки роста приглушены. Это не пауза в жизни — это часть плана.</div></div>') : ''}

    <div class="card">
      <div class="row between">
        <div class="caps">Босс недели</div>
        <button class="q-edit" data-act="boss">${w.boss ? 'изменить ›' : '+ назначить'}</button>
      </div>
      ${w.boss ? raw(h`
        <div class="ink"><b>${w.boss.title}</b></div>
        ${steps.length ? raw(h`<div class="row"><span class="lab">${stepsDone}/${steps.length}</span>${raw(bar(Math.round(stepsDone / steps.length * 100), stepsDone === steps.length))}</div>`) : ''}
        <div class="list">
          ${steps.map(s => raw(h`
            <div class="chk-row ${s.done ? 'done' : ''}">
              <button class="check ${s.done ? 'on' : ''}" data-act="bstep" data-id="${s.id}">✓</button>
              <span class="grow">${s.title}</span>
              <button class="q-edit" data-act="bstepdel" data-id="${s.id}">×</button>
            </div>`))}
        </div>
        <button class="add" data-act="bstepadd">+ Этап</button>`)
      : raw('<div class="lab">Крупное дело недели, которое двигает цель месяца. Необязательно — но помогает.</div>')}
    </div>

    <div class="card">
      <div class="row between"><div class="caps">${past ? 'Итог недели' : 'Задачи по сферам'}</div>
        <span class="lab">${stats.done} из ${stats.total}</span></div>
      ${stats.total ? Object.entries(bySphere).map(([k, v]) => {
        const sp = sphereOf(k);
        return raw(h`<div class="row"><span class="lab" style="width:78px">${sp ? sp.name : 'без сферы'}</span>${raw(bar(Math.round(v.done / v.total * 100)))}<span class="lab">${v.done}/${v.total}</span></div>`);
      }) : raw(h`<div class="empty">${past ? 'На этой неделе задач не было.' : 'Пока пусто. Задачи добавляются на экране «День».'}</div>`)}
    </div>

    <div class="row">
      ${dates.map(d => raw(h`<button class="pill grow" style="text-align:center" data-act="goday" data-v="${d}">${d.slice(8)}</button>`))}
    </div>

    <button class="btn-ghost" data-act="rest">${w.rest ? 'вернуть обычный режим' : 'объявить неделю отдыха'}</button>`;
}

// ── месяц ───────────────────────────────────────────────────────
function monthView() {
  const ym = month();
  const own = goalsIn('month', ym);
  const planned = goalsPlannedIn(ym);
  const goals = [...own, ...planned];
  const qk = quarterKey(ym);
  const theme = S.years[ym.slice(0, 4)]?.theme;

  return h`
    <div class="stepper">
      <button class="arrow" data-act="mprev">‹</button>
      <div style="text-align:center">
        <div class="ink"><b>${monthTitle(ym)}</b></div>
        <div class="lab">${qk.slice(5)}${theme ? ` · «${theme}»` : ''}</div>
      </div>
      <button class="arrow" data-act="mnext">›</button>
    </div>

    ${own.map(g => raw(goalCard(g)))}
    ${planned.length ? raw(h`<div class="caps">Положены в этот месяц</div>`) : ''}
    ${planned.map(g => raw(goalCard(g, { compact: true, plannedIn: ym })))}
    ${!goals.length ? raw(h`
      <div class="card dash"><div class="empty">Целей на ${monthTitle(ym).toLowerCase()} пока нет.<br>Три штуки — уже много.</div></div>`) : ''}

    <button class="add" data-act="goaladd" data-h="month" data-p="${ym}">+ Цель месяца</button>
    <div class="card dash">
      <div class="lab">После большого этапа имеет смысл поставить неделю отдыха — на вкладке «Неделя».</div>
    </div>`;
}

/** Карточка цели — одна на все горизонты.
 *  `plannedIn` — период, в котором карточка сейчас показана как положенная сверху. */
function goalCard(g, { compact = false, plannedIn = null } = {}) {
  const pct = goalProgress(g);
  const open = S.ui.openGoal === g.id;
  const steps = g.steps || [];
  const sp = sphereOf(g.sphere);
  const kids = goalChildren(g.id);
  const parent = g.parentId ? goalById(g.parentId) : null;
  const chain = goalChain(g.id);
  const slots = goalSlots(g);

  return h`
    <div class="card ${compact ? 'mute' : ''} ${g.dropped ? 'goal-dropped' : ''} ${g.done ? 'goal-done' : ''}">
      <div class="row between">
        ${g.dropped
          ? raw(h`<button class="check" data-act="goalrestore" data-id="${g.id}" aria-label="Вернуть">↺</button>`)
          : raw(h`<button class="check ${g.done ? 'on' : ''}" data-act="goaldone" data-id="${g.id}"
              aria-pressed="${g.done ? 'true' : 'false'}" aria-label="Цель выполнена">✓</button>`)}
        <div class="grow" data-act="goaltoggle" data-id="${g.id}" style="cursor:pointer">
          <div class="ink"><b>${g.title}</b></div>
          <div class="row tight" style="margin-top:4px;flex-wrap:wrap">
            ${g.dropped ? raw('<span class="tag">вычеркнута</span>') : ''}
            ${g.done ? raw('<span class="tag boss">готово ✦</span>') : ''}
            <span class="tag">${periodLabel(g)}</span>
            ${sp ? raw(h`<span class="tag">${sp.name}</span>`) : ''}
            ${parent ? raw(h`<span class="lab">→ ${parent.title}</span>`) : ''}
            ${g.deadline ? raw(h`<span class="lab">до ${dayShort(g.deadline)}</span>`) : ''}
          </div>
        </div>
        ${plannedIn
          ? raw(h`<button class="q-edit" data-act="unplan" data-id="${g.id}" data-p="${plannedIn}">убрать отсюда</button>`)
          : raw(h`<button class="q-edit" data-act="goaledit" data-id="${g.id}">изменить ›</button>`)}
      </div>
      <div class="row">${raw(bar(pct, pct >= 100))}<span class="lab">${pct}%</span></div>
      ${isCounter(g) ? raw(counterRow(g)) : ''}
      ${g.dropped ? raw('<div class="lab">Вычеркнута — в этом году не закрыть. В расчётах остаётся.</div>') : ''}

      ${!plannedIn && g.horizon !== 'month' ? raw(h`
        <div class="row tight" style="flex-wrap:wrap">
          ${slots.length
            ? slots.map(sl => raw(h`<button class="tag" data-act="unplan" data-id="${g.id}" data-p="${sl}" title="убрать">${slotLabel(sl)} ×</button>`))
            : raw('<span class="lab">пока без срока — только год</span>')}
          <button class="q-edit" data-act="plan" data-id="${g.id}">+ в квартал или месяц</button>
        </div>`) : ''}

      ${open ? raw(h`
        ${kids.length ? raw(h`
          <div class="lab" style="margin-top:2px">Ведут к ней:</div>
          ${kids.map(k => raw(h`<div class="row between" style="padding-left:4px">
            <span class="lab grow ellip">${k.title} · ${periodLabel(k)}${k.dropped ? ' · вычеркнута' : ''}</span>
            <span class="lab">${goalProgress(k)}%</span></div>`))}`) : ''}
        <div class="list" style="margin-top:4px">
          ${steps.map(st => raw(h`
            <div class="chk-row ${st.done ? 'done' : ''}">
              <button class="check ${st.done ? 'on' : ''}" data-act="gstep" data-gid="${g.id}" data-id="${st.id}">✓</button>
              <span class="grow">${st.title}</span>
              <button class="q-edit" data-act="gstepdel" data-gid="${g.id}" data-id="${st.id}">×</button>
            </div>`))}
        </div>
        <button class="add" data-act="gstepadd" data-id="${g.id}">+ Этап</button>
        ${plannedIn ? raw(h`<button class="btn-ghost" data-act="goaledit" data-id="${g.id}">изменить саму цель ›</button>`) : ''}
        <div class="lab">${g.done ? 'Отмечена выполненной целиком — остальное уже не считается.'
          : isCounter(g) ? 'Прогресс считается из счётчика.'
          : steps.length ? 'Прогресс считается из этапов.'
          : kids.length ? 'Прогресс считается из вложенных целей.'
          : 'Можно не дробить: галочка слева отмечает цель выполненной целиком.'}${chain.theme ? ` Ведёт к «${chain.theme}».` : ''}</div>`) : ''}
    </div>`;
}

const num = n => Number(n).toLocaleString('ru-RU');

/** Счётчик: «7 из 12 книг» и кнопки прибавления.
 *  Для мелких величин удобны шаги по единице, для крупных — только сумма. */
function counterRow(g) {
  const { current, target, unit } = counterOf(g);
  const small = target <= 200;
  const reached = current >= target;
  return h`
    <div class="cnt-row">
      <div class="grow ink"><b>${num(current)}</b> из ${num(target)}${unit ? ' ' + unit : ''}${reached ? ' ✦' : ''}</div>
      <div class="row tight" style="flex:none">
        ${small
          ? raw(h`<button class="pill" data-act="cnt" data-id="${g.id}" data-d="-1" aria-label="Минус один">−1</button>
                  <button class="pill" data-act="cnt" data-id="${g.id}" data-d="1" aria-label="Плюс один">+1</button>`)
          : ''}
        <button class="pill" data-act="cntadd" data-id="${g.id}">${small ? '+ ещё' : '+ добавить'}</button>
      </div>
    </div>`;
}

/** Подпись слота: '2026-Q3' → 'Q3', '2026-08' → 'август'. */
const slotLabel = sl => sl.includes('Q') ? sl.slice(5) : MONTHS[Number(sl.slice(5, 7)) - 1].toLowerCase();

const periodLabel = g => g.horizon === 'year' ? g.period
  : g.horizon === 'quarter' ? `${g.period.slice(5)} ${g.period.slice(0, 4)}`
  : `${MONTHS[Number(g.period.slice(5, 7)) - 1]}`;

// ── год ─────────────────────────────────────────────────────────
function yearView() {
  const y = year();
  const rec = S.years[y] || { theme: '', quarters: {} };
  const curQ = quarterKey(monthKey(todayISO()));
  const thisYear = y === yearOf(todayISO());
  const yGoals = goalsIn('year', String(y));
  const yPct = yearProgress(y);

  return h`
    <div class="stepper">
      <button class="arrow" data-act="yprev">‹</button>
      <div style="text-align:center"><div class="ink"><b>${y}</b></div>
        <div class="lab">${rec.theme ? `«${rec.theme}»` : 'тема не задана'}</div></div>
      <button class="arrow" data-act="ynext">›</button>
    </div>

    <img class="hero-img" src="assets/illustration_10.png" alt="">
    <div class="card">
      <div class="row between"><div class="caps">Тема года</div><button class="q-edit" data-act="theme">изменить ›</button></div>
      <div class="title" style="font-size:20px">${rec.theme || 'Ещё не выбрана'}</div>
      ${yPct != null ? raw(h`<div class="row"><span class="lab" style="width:84px">Год целиком</span>${raw(bar(yPct, yPct >= 100))}<span class="lab">${yPct}%</span></div>`) : ''}
      <div class="lab">Это то, к чему сходятся цели. Менять можно — но лучше редко.</div>
    </div>

    <div class="row between"><div class="caps">Цели года</div>
      ${yGoals.length ? raw(h`<button class="q-edit" data-act="goaladd" data-h="year" data-p="${y}">+ цель</button>`) : ''}</div>
    ${yGoals.length ? yGoals.map(g => raw(goalCard(g)))
      : raw(h`<div class="card dash"><div class="empty">Целей года пока нет.<br>Одна-три крупные — этого достаточно.</div>
          <button class="add" data-act="goaladd" data-h="year" data-p="${y}">+ Цель года</button></div>`)}
    ${yGoals.length ? raw(h`<div class="lab" style="padding:0 4px">Цель года может стоять без срока, а когда придёт время — положи её в квартал или месяц. Это та же цель, а не копия.</div>`) : ''}

    <div class="caps" style="margin-top:4px">Кварталы</div>
    ${['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
      const qk = `${y}-${q}`;
      const own = goalsIn('quarter', qk);
      const planned = goalsPlannedIn(qk);
      const months = quarterMonths(qk).flatMap(ym => goalsIn('month', ym));
      const pct = quarterProgress(qk);
      const active = thisYear && qk === curQ;
      return raw(h`
        <div class="card ${active ? '' : 'mute'}">
          <div class="row between">
            <div class="ink"><b>${q}</b> ${active ? raw('<span class="tag">сейчас</span>') : ''}
              <span class="lab">${monthsLabel(qk)}</span></div>
            <button class="q-edit" data-act="qnote" data-v="${q}">заметка ›</button>
          </div>
          ${rec.quarters?.[q] ? raw(h`<div class="lab">${rec.quarters[q]}</div>`) : ''}
          ${pct != null ? raw(h`<div class="row">${raw(bar(pct, pct >= 100))}<span class="lab">${pct}%</span></div>`) : ''}
          ${own.map(g => raw(goalCard(g, { compact: true })))}
          ${planned.map(g => raw(goalCard(g, { compact: true, plannedIn: qk })))}
          ${months.length ? raw(h`<div class="lab">Цели месяцев: ${months.map(g => g.title).join(' · ')}</div>`) : ''}
          ${!own.length && !planned.length && !months.length ? raw('<div class="lab">целей пока нет</div>') : ''}
          <button class="add" data-act="goaladd" data-h="quarter" data-p="${qk}">+ Цель квартала</button>
        </div>`);
    })}`;
}

const monthsLabel = qk => quarterMonths(qk).map(m => MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 3).toLowerCase()).join('–');

// ── шторки ──────────────────────────────────────────────────────
function bossSheet() {
  const key = weekKey(anchor());
  const w = S.weeks[key] || {};
  openSheet({
    title: w.boss ? 'Босс недели' : 'Назначить босса',
    sub: 'Одно крупное дело, которое двигает месяц',
    body: field.text('title', 'Название', w.boss?.title || '', 'например, «Черновик главы 2»'),
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Нужно название');
      update(s => {
        const rec = (s.weeks[key] ||= {});
        rec.boss = { ...(rec.boss || { steps: [] }), title };
      });
      close();
      toast('Босс назначен ★');
    },
    danger: w.boss ? 'Убрать босса' : null,
    onDanger: (_v, close) => { update(s => { if (s.weeks[key]) s.weeks[key].boss = null; }); close(); toast('Убрала'); },
  });
}

function stepSheet(title, onAdd) {
  openSheet({
    title,
    body: field.text('title', 'Этап', '', 'коротко — что именно сделать'),
    primary: 'Добавить',
    onSave: (v, close) => {
      const t = (v.title || '').trim();
      if (!t) return toast('Пустой этап не добавлю');
      onAdd(t);
      close();
    },
  });
}

/** Периоды, доступные для горизонта: без этого цель некуда положить. */
function periodOptions(horizon, current) {
  const y = yearOf(todayISO());
  if (horizon === 'year') {
    const years = [...new Set([y - 1, y, y + 1, Number(current?.slice(0, 4)) || y])].sort();
    return years.map(v => ({ value: String(v), label: String(v) }));
  }
  if (horizon === 'quarter') {
    const years = [...new Set([y, y + 1, Number(current?.slice(0, 4)) || y])].sort();
    return years.flatMap(yy => ['Q1', 'Q2', 'Q3', 'Q4'].map(q => ({ value: `${yy}-${q}`, label: `${q} ${yy}` })));
  }
  // месяц: год назад и год вперёд — хватает и для «доделать за прошлый», и для планов
  const base = monthKey(todayISO());
  const list = Array.from({ length: 25 }, (_, i) => addMonths(base, i - 12));
  if (current && !list.includes(current)) list.push(current);
  return list.sort().map(v => ({ value: v, label: monthTitle(v) }));
}

/** Кандидаты в родители: цель может вести только к более крупному горизонту. */
function parentOptions(horizon, selfId) {
  const bigger = horizon === 'month' ? ['quarter', 'year'] : horizon === 'quarter' ? ['year'] : [];
  const list = liveGoals().filter(g => bigger.includes(g.horizon) && g.id !== selfId);
  return [{ value: '', label: 'ни к чему' }, ...list.map(g => ({ value: g.id, label: `${g.title} · ${periodLabel(g)}` }))];
}

// Названия целей — пользовательский ввод, поэтому строим через h`` с экранированием.
const selectHTML = (options, value) => options
  .map(o => h`<option value="${o.value}" ${raw(o.value === value ? 'selected' : '')}>${o.label}</option>`).join('');

/** Перенос периода между горизонтами: месяц → его квартал → его год и обратно. */
function convertPeriod(period, from, to) {
  if (from === to) return period;
  const y = period.slice(0, 4);
  const nowY = String(yearOf(todayISO()));
  const nowQ = quarterKey(monthKey(todayISO())).slice(5);
  const nowM = monthKey(todayISO()).slice(5);
  if (to === 'year') return y;
  if (to === 'quarter') return from === 'month' ? quarterKey(period) : `${y}-${y === nowY ? nowQ : 'Q1'}`;
  // to === 'month'
  if (from === 'quarter') return quarterMonths(period)[0];
  return `${y}-${y === nowY ? nowM : '01'}`;
}

function goalSheet(goal, preset) {
  const isNew = !goal;
  const horizon0 = goal?.horizon || preset?.horizon || 'month';
  const period0 = goal?.period || preset?.period || (horizon0 === 'year' ? String(year()) : horizon0 === 'quarter' ? quarterKey(month()) : month());
  const g = goal || { id: uid(), title: '', steps: [], slots: [], progress: 0, deadline: '', sphere: '', parentId: '' };

  const wrap = openSheet({
    title: isNew ? `Новая цель · ${HORIZONS[horizon0].toLowerCase()}` : 'Цель',
    sub: 'Цель месяца может вести к цели квартала, та — к цели года',
    body: [
      field.text('title', 'Цель', g.title, 'например, «Сдать главу 2»'),
      field.opts('horizon', 'Горизонт', Object.entries(HORIZONS).map(([value, label]) => ({ value, label })), horizon0),
      field.select('period', 'Период', periodOptions(horizon0, period0), period0),
      field.select('parentId', 'Ведёт к', parentOptions(horizon0, g.id), g.parentId || ''),
      field.opts('sphere', 'Сфера', [{ value: '', label: 'без сферы' }, ...SPHERES.map(x => ({ value: x.key, label: x.name }))], g.sphere || ''),
      field.date('deadline', 'Срок — если он есть', g.deadline || ''),
      field.number('target', 'Счётчик — сколько всего', g.target ?? '', { min: 0 }),
      field.text('unit', 'В чём считаем', g.unit || '', 'книг, ₽, км — необязательно'),
      field.note('Со счётчиком прогресс считается от набранного. Без него — по этапам, которые добавляются в самой цели.'),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    secondary: isNew ? null : (goal.dropped ? 'Вернуть в работу' : 'Вычеркнуть — останется в списке'),
    onSecondary: (_v, close) => {
      update(s2 => {
        const x = s2.goals.find(y2 => y2.id === g.id);
        if (!x) return;
        x.dropped = !x.dropped;
        x.droppedAt = x.dropped ? todayISO() : null;
        if (x.dropped) x.done = false;
      });
      close();
      toast(S.goals.find(x => x.id === g.id)?.dropped ? 'Вычеркнула — пометка на этот год' : 'Вернула в работу');
    },
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Нужно название');
      const horizon = v.horizon || horizon0;
      const period = v.period || period0;
      if (v.parentId === g.id) return toast('Цель не может вести сама к себе');
      update(s => {
        const target = Number(v.target) || 0;
        const next = {
          ...g, title, horizon, period, parentId: v.parentId || '',
          sphere: v.sphere || '', deadline: v.deadline || '',
          target, unit: (v.unit || '').trim(),
          current: target ? (Number(g.current) || 0) : 0,
        };
        const i = s.goals.findIndex(x => x.id === g.id);
        if (i >= 0) s.goals[i] = next; else s.goals.push(next);
        // Уводим экран туда, где цель теперь живёт, — иначе она «пропадает».
        if (horizon === 'month') { s.ui.planTab = 'month'; s.ui.monthAnchor = period; }
        else if (horizon === 'quarter') { s.ui.planTab = 'year'; s.ui.year = Number(period.slice(0, 4)); }
        else { s.ui.planTab = 'year'; s.ui.year = Number(period); }
      });
      close();
      toast(isNew ? 'Цель добавлена' : 'Сохранено');
    },
    danger: isNew ? null : 'В архив',
    onDanger: (_v, close) => {
      update(s => {
        const x = s.goals.find(y2 => y2.id === g.id);
        if (x) x.archived = true;
        // Осиротевшие подцели остаются, но перестают ссылаться в пустоту.
        s.goals.forEach(y2 => { if (y2.parentId === g.id) y2.parentId = ''; });
      });
      close();
      toast('В архиве — не потеряется');
    },
  });

  // Смена горизонта перестраивает зависимые списки: период и «ведёт к».
  let hzNow = horizon0;
  wrap.addEventListener('opt', e => {
    if (e.target.dataset.name !== 'horizon') return;
    const hz = e.detail;
    const per = wrap.querySelector('select[name="period"]');
    const par = wrap.querySelector('select[name="parentId"]');
    const want = convertPeriod(per.value, hzNow, hz);
    const opts = periodOptions(hz, want);
    per.innerHTML = selectHTML(opts, opts.some(o => o.value === want) ? want : opts[0].value);
    par.innerHTML = selectHTML(parentOptions(hz, g.id), par.value);
    wrap.querySelector('.sheet-title').textContent = isNew ? `Новая цель · ${HORIZONS[hz].toLowerCase()}` : 'Цель';
    hzNow = hz;
  });
}

/** Куда можно положить цель: только периоды мельче её горизонта и внутри её года. */
function slotOptions(g, kind) {
  const y = g.horizon === 'year' ? g.period : g.period.slice(0, 4);
  if (kind === 'quarter') {
    return ['Q1', 'Q2', 'Q3', 'Q4'].map(q => ({ value: `${y}-${q}`, label: `${q} ${y}` }));
  }
  const months = g.horizon === 'quarter' ? quarterMonths(g.period)
    : Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  return months.map(m => ({ value: m, label: monthTitle(m) }));
}

function planSheet(g) {
  const canQuarter = g.horizon === 'year';
  const kind0 = canQuarter ? 'quarter' : 'month';
  const taken = goalSlots(g);
  const first = slotOptions(g, kind0).find(o => !taken.includes(o.value)) || slotOptions(g, kind0)[0];

  const wrap = openSheet({
    title: 'Положить цель в период',
    sub: `${g.title} · сейчас ${taken.length ? taken.map(slotLabel).join(', ') : 'без срока'}`,
    body: [
      canQuarter ? field.opts('kind', 'Куда', [{ value: 'quarter', label: 'В квартал' }, { value: 'month', label: 'В месяц' }], kind0) : '',
      field.select('slot', 'Период', slotOptions(g, kind0), first.value),
      field.note('Цель останется целью года — просто появится ещё и в выбранном периоде. Убрать оттуда можно в один тап.'),
    ].join(''),
    primary: 'Положить',
    onSave: (v, close) => {
      const slot = v.slot;
      if (!slot) return toast('Выбери период');
      update(s2 => {
        const goal = s2.goals.find(x => x.id === g.id);
        if (!goal) return;
        goal.slots = Array.isArray(goal.slots) ? goal.slots : [];
        if (!goal.slots.includes(slot)) goal.slots.push(slot);
        goal.slots.sort();
        if (slot.includes('Q')) { s2.ui.planTab = 'year'; s2.ui.year = Number(slot.slice(0, 4)); }
        else { s2.ui.planTab = 'month'; s2.ui.monthAnchor = slot; }
      });
      close();
      toast(`Положила в ${slotLabel(slot)}`);
    },
  });

  wrap.addEventListener('opt', e => {
    if (e.target.dataset.name !== 'kind') return;
    const opts = slotOptions(g, e.detail);
    const pick = opts.find(o => !taken.includes(o.value)) || opts[0];
    wrap.querySelector('select[name="slot"]').innerHTML = selectHTML(opts, pick.value);
  });
}

/** Изменить счётчик, не пуская его ниже нуля, и подсказать при достижении цели. */
function bumpCounter(id, delta) {
  let reached = false, title = '';
  update(s2 => {
    const g = s2.goals.find(x => x.id === id);
    if (!g) return;
    const target = Number(g.target) || 0;
    const before = Number(g.current) || 0;
    const after = Math.max(0, before + delta);
    g.current = after;
    title = g.title;
    reached = target > 0 && before < target && after >= target;
  });
  if (reached) toast(`«${title}» — набрано ✦ Можно закрыть галочкой`);
}

// ── действия ────────────────────────────────────────────────────
const weekRec = s => (s.weeks[weekKey(anchor())] ||= {});

export const actions = {
  tab: v => update(s => { s.ui.planTab = v.v; }),

  wprev: () => update(s => { s.ui.weekAnchor = addDays(anchor(), -7); }),
  wnext: () => update(s => { s.ui.weekAnchor = addDays(anchor(), 7); }),
  goday: v => update(s => { s.ui.date = v.v; location.hash = '#/day'; }),
  rest: () => { update(s => { const w = weekRec(s); w.rest = !w.rest; }); toast(S.weeks[weekKey(anchor())].rest ? 'Неделя отдыха ✦' : 'Обычный режим'); },

  boss: bossSheet,
  bstepadd: () => stepSheet('Этап босса', t => update(s => {
    const w = weekRec(s);
    w.boss ||= { title: 'Босс недели', steps: [] };
    (w.boss.steps ||= []).push({ id: uid(), title: t, done: false });
  })),
  bstep: v => {
    let all = false;
    update(s => {
      const st = weekRec(s).boss?.steps?.find(x => x.id === v.id);
      if (!st) return;
      st.done = !st.done;
      addXp(st.done ? XP.step : -XP.step);
      all = weekRec(s).boss.steps.every(x => x.done);
    });
    if (all) toast('Босс повержен ✦ Можно взять неделю отдыха');
  },
  bstepdel: v => update(s => { const b = weekRec(s).boss; if (b) b.steps = b.steps.filter(x => x.id !== v.id); }),

  mprev: () => update(s => { s.ui.monthAnchor = addMonths(month(), -1); }),
  mnext: () => update(s => { s.ui.monthAnchor = addMonths(month(), 1); }),
  goaladd: v => goalSheet(null, { horizon: v.h, period: v.p }),
  plan: v => { const g = goalById(v.id); if (g) planSheet(g); },

  cnt: v => bumpCounter(v.id, Number(v.d)),
  cntadd: v => {
    const g = goalById(v.id);
    if (!g) return;
    const { unit } = counterOf(g);
    openSheet({
      title: 'Пополнить счётчик',
      sub: g.title,
      body: [
        field.number('n', `Сколько добавить${unit ? ', ' + unit : ''}`, '', {}),
        field.note('Можно и отнять — введи число со знаком минус.'),
      ].join(''),
      primary: 'Добавить',
      onSave: (val, close) => {
        const n = Number(val.n);
        if (!n) return toast('Введи число');
        bumpCounter(v.id, n);
        close();
      },
    });
  },

  goaldone: v => {
    let now = false, title = '';
    update(s2 => {
      const g = s2.goals.find(x => x.id === v.id);
      if (!g) return;
      g.done = !g.done;
      g.doneAt = g.done ? todayISO() : null;
      if (g.done) g.dropped = false;
      now = g.done; title = g.title;
      addXp(g.done ? XP.boss : -XP.boss);
    });
    toast(now ? `«${title}» — цель закрыта ✦` : 'Снова в работе');
  },

  goalrestore: v => {
    update(s2 => { const g = s2.goals.find(x => x.id === v.id); if (g) { g.dropped = false; g.droppedAt = null; } });
    toast('Вернула в работу');
  },
  unplan: v => {
    update(s2 => {
      const g = s2.goals.find(x => x.id === v.id);
      if (g) g.slots = goalSlots(g).filter(x => x !== v.p);
    });
    toast('Убрала из периода — сама цель на месте');
  },
  goaledit: v => goalSheet(S.goals.find(g => g.id === v.id)),
  goaltoggle: v => update(s => { s.ui.openGoal = s.ui.openGoal === v.id ? null : v.id; }),
  gstepadd: v => stepSheet('Этап цели', t => update(s => {
    const g = s.goals.find(x => x.id === v.id);
    if (g) (g.steps ||= []).push({ id: uid(), title: t, done: false });
    s.ui.openGoal = v.id;
  })),
  gstep: v => {
    let done100 = false, title = '';
    update(s => {
      const g = s.goals.find(x => x.id === v.gid);
      const st = g?.steps.find(x => x.id === v.id);
      if (!st) return;
      st.done = !st.done;
      addXp(st.done ? XP.step : -XP.step);
      done100 = g.steps.every(x => x.done);
      title = g.title;
    });
    if (done100) toast(`«${title}» — цель закрыта ✦`);
  },
  gstepdel: v => update(s => {
    const g = s.goals.find(x => x.id === v.gid);
    if (g) g.steps = g.steps.filter(x => x.id !== v.id);
  }),

  yprev: () => update(s => { s.ui.year = year() - 1; }),
  ynext: () => update(s => { s.ui.year = year() + 1; }),
  theme: () => {
    const y = year();
    openSheet({
      title: `Тема ${y} года`,
      sub: 'Одна фраза, к которой сходится всё остальное',
      body: field.text('theme', 'Тема', S.years[y]?.theme || '', 'например, «Свой голос»'),
      onSave: (v, close) => {
        update(s => { const r = (s.years[y] ||= { theme: '', quarters: {} }); r.theme = (v.theme || '').trim(); });
        close();
        toast('Тема сохранена');
      },
    });
  },
  qnote: v => {
    const y = year(), q = v.v;
    openSheet({
      title: `${q} · ${y}`,
      body: field.area('note', 'Что за квартал', S.years[y]?.quarters?.[q] || ''),
      onSave: (val, close) => {
        update(s => {
          const r = (s.years[y] ||= { theme: '', quarters: {} });
          (r.quarters ||= {})[q] = (val.note || '').trim();
        });
        close();
        toast('Сохранено');
      },
    });
  },
};
