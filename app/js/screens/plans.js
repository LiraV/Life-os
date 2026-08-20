// «Планы»: неделя, месяц, год — реальные периоды с навигацией в обе стороны.
// Цепочка «задача → цель месяца → квартал → тема года» строится из данных.

import { S, update, uid, XP, addXp, SPHERES } from '../store.js';
import {
  todayISO, addDays, addMonths, weekKey, weekDates, isoWeek,
  monthKey, monthTitle, dayShort, yearOf,
} from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import { questsOn, weekStats, goalProgress, goalsOfMonth, sphereOf } from '../selectors.js';

const TABS = [['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год']];
const tab = () => S.ui.planTab || 'week';
const anchor = () => S.ui.weekAnchor || todayISO();
const month = () => S.ui.monthAnchor || monthKey(todayISO());
const year = () => S.ui.year || yearOf(todayISO());
const quarterOfMonth = ym => `Q${Math.floor((Number(ym.slice(5, 7)) - 1) / 3) + 1}`;

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
  const goals = goalsOfMonth(ym);
  const q = quarterOfMonth(ym);
  const theme = S.years[ym.slice(0, 4)]?.theme;

  return h`
    <div class="stepper">
      <button class="arrow" data-act="mprev">‹</button>
      <div style="text-align:center">
        <div class="ink"><b>${monthTitle(ym)}</b></div>
        <div class="lab">${q}${theme ? ` · «${theme}»` : ''}</div>
      </div>
      <button class="arrow" data-act="mnext">›</button>
    </div>

    ${goals.length ? goals.map(g => raw(goalCard(g, q, theme))) : raw(h`
      <div class="card dash"><div class="empty">Целей на ${monthTitle(ym).toLowerCase()} пока нет.<br>Три штуки — уже много.</div></div>`)}

    <button class="add" data-act="goaladd">+ Цель месяца</button>
    <div class="card dash">
      <div class="lab">После большого этапа имеет смысл поставить неделю отдыха — на вкладке «Неделя».</div>
    </div>`;
}

function goalCard(g, q, theme) {
  const pct = goalProgress(g);
  const open = S.ui.openGoal === g.id;
  const steps = g.steps || [];
  const sp = sphereOf(g.sphere);
  return h`
    <div class="card">
      <div class="row between">
        <div class="grow" data-act="goaltoggle" data-id="${g.id}" style="cursor:pointer">
          <div class="ink"><b>${g.title}</b></div>
          <div class="row tight" style="margin-top:4px">
            <span class="tag">→ ${q}</span>
            ${sp ? raw(h`<span class="tag">${sp.name}</span>`) : ''}
            ${g.deadline ? raw(h`<span class="lab">до ${dayShort(g.deadline)}</span>`) : ''}
          </div>
        </div>
        <button class="q-edit" data-act="goaledit" data-id="${g.id}">изменить ›</button>
      </div>
      <div class="row">${raw(bar(pct, pct >= 100))}<span class="lab">${pct}%</span></div>
      ${open ? raw(h`
        <div class="list" style="margin-top:4px">
          ${steps.map(s => raw(h`
            <div class="chk-row ${s.done ? 'done' : ''}">
              <button class="check ${s.done ? 'on' : ''}" data-act="gstep" data-gid="${g.id}" data-id="${s.id}">✓</button>
              <span class="grow">${s.title}</span>
              <button class="q-edit" data-act="gstepdel" data-gid="${g.id}" data-id="${s.id}">×</button>
            </div>`))}
        </div>
        <button class="add" data-act="gstepadd" data-id="${g.id}">+ Этап</button>
        ${steps.length ? raw(h`<div class="lab">Прогресс считается из этапов${theme ? `, а цель ведёт к «${theme}»` : ''}.</div>`) : ''}`) : ''}
    </div>`;
}

// ── год ─────────────────────────────────────────────────────────
function yearView() {
  const y = year();
  const rec = S.years[y] || { theme: '', quarters: {} };
  const curQ = quarterOfMonth(monthKey(todayISO()));
  const thisYear = y === yearOf(todayISO());

  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
    const goals = S.goals.filter(g => !g.archived && g.month.startsWith(String(y)) && quarterOfMonth(g.month) === q);
    const pct = goals.length ? Math.round(goals.reduce((a, g) => a + goalProgress(g), 0) / goals.length) : 0;
    return { q, goals, pct, active: thisYear && q === curQ, note: rec.quarters?.[q] || '' };
  });

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
      <div class="lab">Это то, к чему сходятся цели месяцев. Менять можно — но лучше редко.</div>
    </div>

    ${quarters.map(qq => raw(h`
      <div class="card ${qq.active ? '' : 'mute'}">
        <div class="row between">
          <div class="ink"><b>${qq.q}</b> ${qq.active ? raw('<span class="tag">сейчас</span>') : ''}</div>
          <button class="q-edit" data-act="qnote" data-v="${qq.q}">заметка ›</button>
        </div>
        ${qq.note ? raw(h`<div class="lab">${qq.note}</div>`) : ''}
        ${qq.goals.length
          ? raw(h`<div class="row">${raw(bar(qq.pct, qq.pct >= 100))}<span class="lab">${qq.pct}%</span></div>
                  <div class="lab">${qq.goals.map(g => g.title).join(' · ')}</div>`)
          : raw('<div class="lab">целей пока нет</div>')}
      </div>`))}`;
}

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

function goalSheet(goal) {
  const isNew = !goal;
  const g = goal || { id: uid(), title: '', month: month(), steps: [], progress: 0, deadline: '', sphere: '' };
  openSheet({
    title: isNew ? 'Новая цель' : 'Цель месяца',
    body: [
      field.text('title', 'Цель', g.title, 'например, «Сдать главу 2»'),
      field.opts('sphere', 'Сфера', [{ value: '', label: 'без сферы' }, ...SPHERES.map(s => ({ value: s.key, label: s.name }))], g.sphere || ''),
      field.date('deadline', 'Срок — если он есть', g.deadline || ''),
      field.opts('month', 'Месяц', [
        { value: addMonths(month(), -1), label: monthTitle(addMonths(month(), -1)).split(' ')[0] },
        { value: month(), label: monthTitle(month()).split(' ')[0] },
        { value: addMonths(month(), 1), label: monthTitle(addMonths(month(), 1)).split(' ')[0] },
      ], g.month),
      field.note('Этапы добавляются в самой цели — прогресс считается по ним.'),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Нужно название');
      update(s => {
        const next = { ...g, title, sphere: v.sphere || '', deadline: v.deadline || '', month: v.month || g.month };
        const i = s.goals.findIndex(x => x.id === g.id);
        if (i >= 0) s.goals[i] = next; else s.goals.push(next);
        s.ui.monthAnchor = next.month;
      });
      close();
      toast(isNew ? 'Цель добавлена' : 'Сохранено');
    },
    danger: isNew ? null : 'В архив',
    onDanger: (_v, close) => {
      update(s => { const x = s.goals.find(y => y.id === g.id); if (x) x.archived = true; });
      close();
      toast('В архиве — не потеряется');
    },
  });
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
  goaladd: () => goalSheet(null),
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
