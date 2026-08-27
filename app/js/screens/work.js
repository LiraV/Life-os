// «Работа»: наём. Один график, свои проекты, канбан и учёт времени.
//
// Экран считает нагрузку и границы, а не производительность. «Мало сделала»
// тут не считается нигде: считаются часы, дни подряд, дни в офисе и отпуск —
// то, что говорит, когда пора остановиться, а не когда поднажать.
//
// График задаётся один раз, и из него берётся норма дня. Поэтому отметить
// день — это один тап: часы подставляются, а не вводятся каждый раз.

import { S, update, uid, XP, addXp, WORK_STAGES, WORK_KINDS, touchTracker } from '../store.js';
import { todayISO, addDays, dayShort, monthKey, addMonths, monthTitle, yearOf, MONTHS, weekDates, DOW, dowIndex, diffDays, relativeDay } from '../dates.js';
import { h, raw, field, bar, toast, openSheet, confirmSheet } from '../ui.js';
import {
  workJob, workDayNorm, workWeekNorm, workDay, workWeek, workMonth, workStreak, workOver,
  workRate, workVacation, isWorkday, workProjects, workProjectName, workTasks, tasksInStage,
  workDue, workDoneIn, workWins, winsIn, officeDays,
  careerTracks, trackName, careerIn, careerCurrent, careerTrackIds,
  careerSpan, spanLabel, trackTotal, careerGap, trackById,
} from '../selectors.js';
import { sphereGoalButton, sphereGoalsCard, sphereGoalSheet } from '../spheregoal.js';

const TABS = [['now', 'Сейчас'], ['board', 'Доска'], ['road', 'Путь'], ['year', 'Год']];
const tab = () => (TABS.some(([k]) => k === S.ui.workTab) ? S.ui.workTab : 'now');
const proj = () => S.ui.workProj ?? null;          // null — все, '' — без проекта
const ym = () => S.ui.workMonth || monthKey(todayISO());
const num = n => Number(n).toLocaleString('ru-RU');
const hrs = n => `${Math.round(n * 10) / 10} ч`;

const DAY_TYPES = [
  { key: 'work', name: 'Работала' },
  { key: 'off', name: 'Выходной' },
  { key: 'vacation', name: 'Отпуск' },
  { key: 'sick', name: 'Больничный' },
];

export function render() {
  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ сферы</button>
      <button class="q-edit" data-act="job">график ›</button>
    </div>
    <div class="title">Работа</div>
    <div class="pills">${TABS.map(([k, l]) => raw(h`<button class="pill ${tab() === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`))}</div>
    ${raw({ now: nowView, board: boardView, road: roadView, year: yearView }[tab()]())}
    <div style="height:4px"></div>`;
}

// ── сейчас ──────────────────────────────────────────────────────
function nowView() {
  const t = todayISO();
  const rec = workDay(t);
  const w = workWeek(t);
  const norm = workWeekNorm();
  const streak = workStreak();
  const due = workDue();
  const doing = tasksInStage('doing');
  const m = workMonth(monthKey(t));
  const job = workJob();

  return h`
    <div class="card">
      <div class="row between"><div class="caps">Сегодня</div>
        <span class="lab">${relativeDay(t) || dayShort(t)}${isWorkday(t) ? '' : ' · не по графику'}</span></div>
      ${rec ? raw(h`
        <div class="ink"><b>${DAY_TYPES.find(x => x.key === rec.type)?.name || rec.type}</b>${rec.type === 'work'
          ? `<span class="lab"> · ${hrs(rec.hours)} · ${rec.where === 'office' ? 'в офисе' : 'из дома'}</span>` : ''}</div>
        <button class="q-edit" data-act="mark" data-d="${t}">изменить ›</button>`)
        : raw(h`
        <div class="lab">Не отмечено. Норма дня по графику — ${hrs(workDayNorm())}.</div>
        <div class="pills">
          <button class="pill" data-act="quick" data-w="office">Отработала · в офисе</button>
          <button class="pill" data-act="quick" data-w="home">Отработала · из дома</button>
          <button class="pill" data-act="mark" data-d="${t}">иначе ›</button>
        </div>`)}
    </div>

    <div class="card">
      <div class="row between"><div class="caps">Эта неделя</div>
        <span class="lab">${hrs(w.hours)} из ${hrs(norm)}</span></div>
      ${raw(bar(norm ? Math.round((w.hours / norm) * 100) : 0, w.hours > norm))}
      <div class="lab">${w.days} ${plural(w.days, 'день', 'дня', 'дней')}, из них ${w.office} в офисе.${
        w.hours > norm ? ` Сверх графика — ${hrs(w.hours - norm)}.` : ''}</div>
      ${raw(weekStrip(t))}
    </div>

    ${streak >= 6 ? raw(h`<div class="card dash">
      <div class="ink">${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд без выходного.</div>
      <div class="lab">Это не упрёк — просто цифра, которую стоит знать.</div>
    </div>`) : ''}

    ${job.officeNorm > 0 ? raw(h`<div class="card mute">
      <div class="row between"><span class="ink">В офисе за ${monthTitle(monthKey(t)).toLowerCase()}</span>
        <span class="ink">${m.office} из ${job.officeNorm}</span></div>
      ${raw(bar(Math.min(100, Math.round((m.office / job.officeNorm) * 100)), m.office >= job.officeNorm))}
    </div>`) : ''}

    ${doing.length ? raw(h`
      <div class="card">
        <div class="row between"><div class="caps">В работе</div><span class="lab">${doing.length}</span></div>
        ${doing.map(t2 => raw(taskRow(t2)))}
      </div>`) : ''}

    ${due.length ? raw(h`
      <div class="card">
        <div class="caps">Со сроком</div>
        ${due.slice(0, 5).map(t2 => raw(h`
          <button class="row between care-name" data-act="task" data-id="${t2.id}">
            <span class="ink grow ellip">${t2.title}</span>
            <span class="lab">${dueLabel(t2.due)} ›</span>
          </button>`))}
      </div>`) : ''}

    <button class="add" data-act="taskadd">+ Задача</button>
    ${raw(winsCard(5))}
    ${raw(sphereGoalsCard('work'))}
    ${raw(sphereGoalButton('work'))}`;
}

/** Неделя полосой: тап по дню отмечает его. */
function weekStrip(date) {
  const t = todayISO();
  return h`
    <div class="hab-grid">
      ${weekDates(date).map(d => {
        const r = workDay(d);
        const mark = r ? { work: r.where === 'office' ? 'о' : 'д', off: '—', vacation: 'от', sick: 'б' }[r.type] : d.slice(8);
        return raw(h`<button class="hab-cell ${r?.type === 'work' ? 'on' : ''} ${r && r.type !== 'work' ? 'part' : ''} ${d === t ? 'today' : ''}"
          data-act="mark" data-d="${d}" ${raw(d > t ? 'disabled style="opacity:.4"' : '')}
          aria-label="${dayShort(d)}">${mark}</button>`);
      })}
    </div>
    <div class="lab">о — офис, д — из дома, от — отпуск, б — больничный, — выходной.</div>`;
}

const dueLabel = due => {
  const d = diffDays(due, todayISO());
  if (d < 0) return `просрочено на ${-d} ${plural(-d, 'день', 'дня', 'дней')}`;
  if (d === 0) return 'сегодня';
  return `через ${d} ${plural(d, 'день', 'дня', 'дней')}`;
};

// ── доска ───────────────────────────────────────────────────────
function boardView() {
  const p = proj();
  const list = workProjects();
  return h`
    <div class="pills">
      <button class="pill ${p === null ? 'on' : ''}" data-act="proj" data-v="all">Все</button>
      <button class="pill ${p === '' ? 'on' : ''}" data-act="proj" data-v="">Без проекта</button>
      ${list.map(x => raw(h`<button class="pill ${p === x.id ? 'on' : ''}" data-act="proj" data-v="${x.id}">${x.name}</button>`))}
      <button class="pill" data-act="projadd">+ проект</button>
    </div>

    <div class="board">
      ${WORK_STAGES.map(st => {
        const items = tasksInStage(st.key, p);
        return raw(h`
          <div class="board-col">
            <div class="board-head">${st.name}<span class="lab"> ${items.length}</span></div>
            ${items.length ? items.map(t => raw(taskCard(t))) : raw('<div class="lab">пусто</div>')}
          </div>`);
      })}
    </div>

    <button class="add" data-act="taskadd">+ Задача</button>
    ${p !== null && p !== '' ? raw(h`<button class="btn-ghost" data-act="projedit" data-v="${p}">Изменить проект</button>`) : ''}`;
}

function taskCard(t) {
  return h`
    <div class="board-card ${t.stage === 'done' ? 'done' : ''}">
      <div class="ink" data-act="task" data-id="${t.id}" style="cursor:pointer">${t.title}</div>
      <div class="lab">${t.projectId ? workProjectName(t.projectId) : 'без проекта'}${t.due ? ` · ${dueLabel(t.due)}` : ''}</div>
      <button class="pill" data-act="move" data-id="${t.id}">дальше ›</button>
    </div>`;
}

function taskRow(t) {
  return h`
    <button class="row between care-name" data-act="task" data-id="${t.id}">
      <span class="ink grow ellip">${t.title}</span>
      <span class="lab">${t.projectId ? workProjectName(t.projectId) : ''} ›</span>
    </button>`;
}

// ── год ─────────────────────────────────────────────────────────
function yearView() {
  const y = yearOf(todayISO());
  const cur = monthKey(todayISO());
  const vac = workVacation(y);
  const rate = workRate(cur);
  const m = workMonth(cur);
  const done = workDoneIn(`${y}-01-01`, `${y}-12-31`).length;
  const wins = winsIn(`${y}-01-01`, `${y}-12-31`).length;
  return h`
    <div class="card">
      <div class="caps">${y} год</div>
      <div class="lab">Задач доведено до конца — ${done}. Записано в опыт — ${wins}.</div>
      <div class="row between"><span class="ink">Отпуск</span>
        <span class="ink">${vac.used} из ${vac.total}<i class="lab"> · осталось ${vac.left}</i></span></div>
      ${raw(bar(vac.total ? Math.round((vac.used / vac.total) * 100) : 0))}
    </div>

    ${rate ? raw(h`
      <div class="card">
        <div class="caps">Сколько стоит час</div>
        <div class="ink"><b>${num(rate.rate)} ₽</b><span class="lab"> в час за ${monthTitle(cur).toLowerCase()}</span></div>
        <div class="lab">${num(rate.salary)} ₽ до налогов делённые на ${hrs(rate.hours)}.
          Число падает от переработок — в этом и смысл, что оно видно.</div>
      </div>`) : raw(h`
      <div class="card mute">
        <div class="lab">Добавь текущую должность на вкладке «Путь» и впиши оклад — покажу, сколько на самом деле стоит час.</div>
      </div>`)}

    <div class="card">
      <div class="caps">По месяцам</div>
      ${MONTHS.map((name, i) => {
        const key = `${y}-${String(i + 1).padStart(2, '0')}`;
        const x = workMonth(key);
        if (!x.days && !x.vacation && !x.sick) return '';
        return raw(h`
          <div class="row between">
            <span class="lab grow">${name}${key === cur ? ' · сейчас' : ''}</span>
            <span class="ink">${hrs(x.hours)}<i class="lab"> · ${x.days} дн.${x.office ? ` · офис ${x.office}` : ''}${x.vacation ? ` · отпуск ${x.vacation}` : ''}${x.sick ? ` · больничный ${x.sick}` : ''}</i></span>
          </div>`);
      })}
      ${!workMonth(cur).days ? raw('<div class="lab">Пока ни одного отмеченного дня.</div>') : ''}
    </div>

    ${raw(winsCard(20))}`;
}

/** Опыт и победы: то, что через год пригодится вспомнить. */
function winsCard(limit) {
  const list = workWins().slice(0, limit);
  return h`
    <div class="card">
      <div class="row between"><div class="caps">Опыт и победы</div>
        <button class="q-edit" data-act="winadd">+ запись</button></div>
      ${list.length ? raw(h`<div class="list">${list.map(x => raw(h`
        <button class="row between care-name" data-act="win" data-id="${x.id}">
          <span class="ink grow ellip">${x.title}</span>
          <span class="lab">${dayShort(x.date)} ›</span>
        </button>`))}</div>`)
        : raw('<div class="lab">Сюда стоит писать не задачи, а то, чему научилась и что получилось. Через год это будет единственным, что помнишь.</div>')}
    </div>`;
}

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};

// ── шторки ──────────────────────────────────────────────────────
/** Отметка дня: тип, часы и где. Часы подставляются из графика. */
function daySheet(date) {
  const rec = workDay(date) || { type: 'work', hours: workDayNorm(), where: 'office', note: '' };
  openSheet({
    title: dayShort(date),
    sub: `${DOW[dowIndex(date)]}${isWorkday(date) ? '' : ' · не по графику'}`,
    body: [
      field.opts('type', 'Что это был за день', DAY_TYPES.map(x => ({ value: x.key, label: x.name })), rec.type),
      field.number('hours', 'Сколько часов', rec.hours ?? workDayNorm(), { min: 0, max: 24, suffix: 'ч' }),
      field.opts('where', 'Где', [{ value: 'office', label: 'В офисе' }, { value: 'home', label: 'Из дома' }], rec.where || 'office'),
      field.text('note', 'Заметка', rec.note || ''),
      field.note(`Норма дня по графику — ${hrs(workDayNorm())}. Часы нужны только у рабочего дня: у отпуска и больничного они не считаются.`),
    ].join(''),
    primary: 'Записать',
    onSave: (v, close) => {
      const type = DAY_TYPES.some(x => x.key === v.type) ? v.type : 'work';
      update(s => {
        s.work.days[date] = {
          type,
          hours: type === 'work' ? Math.max(0, Number(v.hours) || 0) : 0,
          where: v.where === 'home' ? 'home' : 'office',
          note: (v.note || '').trim(),
        };
        touchTracker(s);
      });
      close();
    },
    danger: workDay(date) ? 'Убрать отметку' : null,
    onDanger: (_v, close) => {
      update(s => { delete s.work.days[date]; touchTracker(s); });
      close();
    },
  });
}

/** Задача: название, проект, стадия, срок. */
function taskSheet(id) {
  const t = workTasks().find(x => x.id === id);
  const it = t || { id: uid(), title: '', projectId: proj() && proj() !== '' ? proj() : '', stage: 'queue', stageAt: '', due: '', note: '', createdAt: todayISO() };
  openSheet({
    title: t ? 'Задача' : 'Новая задача',
    sub: t ? workProjectName(t.projectId) : '',
    body: [
      field.text('title', 'Что сделать', it.title, 'коротко'),
      field.select('projectId', 'Проект', [{ value: '', label: 'без проекта' },
        ...workProjects().map(p => ({ value: p.id, label: p.name }))], it.projectId || ''),
      field.opts('stage', 'Стадия', WORK_STAGES.map(st => ({ value: st.key, label: st.name })), it.stage),
      field.date('due', 'Срок — если он есть', it.due || ''),
      field.area('note', 'Заметка', it.note || ''),
      field.note('Проект необязателен: часть задач ни к какому проекту не относится, и это нормально.'),
    ].join(''),
    primary: t ? 'Сохранить' : 'Добавить',
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Нужно название');
      update(s => {
        const stage = WORK_STAGES.some(x => x.key === v.stage) ? v.stage : 'queue';
        const next = {
          ...it, title, projectId: v.projectId || '', stage, due: v.due || '',
          note: (v.note || '').trim(),
          stageAt: stage === it.stage ? it.stageAt : todayISO(),
        };
        const i = s.work.tasks.findIndex(x => x.id === it.id);
        if (i >= 0) s.work.tasks[i] = next; else s.work.tasks.push(next);
        if (stage === 'done' && t?.stage !== 'done') addXp(XP.step);
        touchTracker(s);
      });
      close();
    },
    danger: t ? 'Убрать задачу' : null,
    onDanger: (_v, close) => {
      update(s => { s.work.tasks = s.work.tasks.filter(x => x.id !== it.id); touchTracker(s); });
      close();
      toast('Убрала');
    },
  });
}

/** Проект: имя и архив. Архивный не исчезает — задачи остаются на месте. */
function projectSheet(id) {
  const p = id ? workProjects().find(x => x.id === id) : null;
  const it = p || { id: uid(), name: '', archived: false };
  openSheet({
    title: p ? p.name : 'Новый проект',
    body: [
      field.text('name', 'Название', it.name, 'например, «Кампании для X»'),
      p ? field.note(`Задач в проекте: ${workTasks().filter(t => t.projectId === it.id).length}. Убранный проект уходит из фильтра, а его задачи остаются.`) : '',
    ].join(''),
    primary: p ? 'Сохранить' : 'Добавить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        const i = s.work.projects.findIndex(x => x.id === it.id);
        if (i >= 0) s.work.projects[i] = { ...s.work.projects[i], name };
        else s.work.projects.push({ ...it, name });
        s.ui.workProj = it.id;
      });
      close();
    },
    danger: p ? 'Убрать проект' : null,
    onDanger: (_v, close) => {
      update(s => {
        const x = s.work.projects.find(y => y.id === it.id);
        if (x) x.archived = true;
        s.ui.workProj = null;
      });
      close();
      toast('Убрала — задачи остались');
    },
  });
}

/** Запись в опыт: что получилось или чему научилась. */
function winSheet(id) {
  const w = workWins().find(x => x.id === id);
  const it = w || { id: uid(), date: todayISO(), title: '', note: '' };
  openSheet({
    title: w ? 'Запись' : 'Опыт или победа',
    body: [
      field.text('title', 'Что', it.title, 'например, «первая кампания без правок»'),
      field.date('date', 'Когда', it.date),
      field.area('note', 'Подробнее', it.note || ''),
      field.note('Это не задача и не отчёт. Это то, что стоит помнить: чему научилась, что получилось, что оказалось не таким страшным.'),
    ].join(''),
    primary: w ? 'Сохранить' : 'Записать',
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Нужно название');
      update(s => {
        const next = { ...it, title, date: v.date || todayISO(), note: (v.note || '').trim() };
        const i = s.work.wins.findIndex(x => x.id === it.id);
        if (i >= 0) s.work.wins[i] = next; else { s.work.wins.push(next); addXp(XP.reflection); }
        touchTracker(s);
      });
      close();
    },
    danger: w ? 'Убрать' : null,
    onDanger: (_v, close) => {
      update(s => { s.work.wins = s.work.wins.filter(x => x.id !== it.id); });
      close();
    },
  });
}

/** График: он задаётся один раз и дальше считает норму за тебя. */
function jobSheet() {
  const j = workJob();
  openSheet({
    title: 'График',
    sub: `сейчас норма дня — ${hrs(workDayNorm())}`,
    body: [
      `<div class="fld"><span>Рабочие дни</span><div class="days">
        ${DOW.map((d, i) => `<label class="day-box"><input type="checkbox" name="d${i}" ${(j.days || []).includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}
      </div></div>`,
      field.time('start', 'Начало', j.start),
      field.time('end', 'Конец', j.end),
      field.number('lunch', 'Обед', j.lunch, { min: 0, max: 240, suffix: 'мин' }),
      field.number('officeNorm', 'Сколько дней в офисе нужно за месяц', j.officeNorm || '', { min: 0 }),
      field.number('vacationDays', 'Дней отпуска в году', j.vacationDays, { min: 0 }),
      field.note('Из графика считается норма дня и недели. Ноль в «днях в офисе» — значит, не следим. Оклад живёт не здесь, а у текущей должности на вкладке «Путь»: он относится к должности, а не к расписанию.'),
    ].join(''),
    primary: 'Сохранить',
    onSave: (v, close) => {
      update(s => {
        s.work.job = {
          ...s.work.job,
          days: DOW.map((_, i) => (v['d' + i] ? i : -1)).filter(i => i >= 0),
          start: v.start || s.work.job.start,
          end: v.end || s.work.job.end,
          lunch: Math.max(0, Number(v.lunch) || 0),
          officeNorm: Math.max(0, Number(v.officeNorm) || 0),
          vacationDays: Math.max(0, Number(v.vacationDays) || 0),
        };
      });
      close();
      toast('График сохранён');
    },
  });
}

export const actions = {
  back: () => { location.hash = '#/spheres'; },
  tab: v => update(s => { s.ui.workTab = v.v; }),
  job: () => jobSheet(),

  /** Один тап: рабочий день по норме графика. Всё остальное — через шторку. */
  quick: v => {
    update(s => {
      s.work.days[todayISO()] = { type: 'work', hours: workDayNorm(), where: v.w === 'home' ? 'home' : 'office', note: '' };
      touchTracker(s);
    });
    toast(`Отмечено · ${hrs(workDayNorm())}`);
  },
  mark: v => daySheet(v.d),

  proj: v => update(s => { s.ui.workProj = v.v === 'all' ? null : v.v; }),
  projadd: () => projectSheet(null),
  projedit: v => projectSheet(v.v),

  taskadd: () => taskSheet(null),
  task: v => taskSheet(v.id),
  /** Тап двигает по канбану дальше, с последней стадии — в начало. */
  move: v => update(s => {
    const t = s.work.tasks.find(x => x.id === v.id);
    if (!t) return;
    const order = WORK_STAGES.map(x => x.key);
    const next = order[(order.indexOf(t.stage) + 1) % order.length];
    if (next === 'done' && t.stage !== 'done') addXp(XP.step);
    t.stage = next;
    t.stageAt = todayISO();
    touchTracker(s);
  }),

  winadd: () => winSheet(null),
  win: v => winSheet(v.id),

  posadd: () => positionSheet(null),
  pos: v => positionSheet(v.id),
  trackadd: () => trackSheet(null),
  trackedit: v => trackSheet(v.id),

  spheregoal: () => sphereGoalSheet('work'),
  togoal: () => { location.hash = '#/plans'; },
};

// ── путь ────────────────────────────────────────────────────────
/**
 * Карьерный путь: места и должности во времени. Треков может быть несколько —
 * наём и своё дело идут параллельно, и складывать их стаж в одно число было бы
 * враньём. Поэтому итог считается по каждому треку отдельно.
 */
function roadView() {
  const ids = careerTrackIds();
  const cur = careerCurrent();
  return h`
    ${cur.length ? raw(h`
      <div class="card">
        <div class="caps">Сейчас</div>
        ${cur.map(x => raw(h`
          <button class="row between care-name" data-act="pos" data-id="${x.id}">
            <span class="grow">
              <span class="ink">${x.title}</span>
              <span class="lab"> · ${x.company}</span>
            </span>
            <span class="lab">${spanLabel(careerSpan(x))} ›</span>
          </button>`))}
      </div>`) : ''}

    ${ids.length ? ids.map(id => raw(trackCard(id))) : raw(h`
      <div class="card dash">
        <div class="empty">Путь пока пуст.<br>Первая должность — это уже путь.</div>
        <button class="add" data-act="posadd">+ Должность</button>
      </div>`)}

    ${ids.length ? raw(h`
      <button class="add" data-act="posadd">+ Должность</button>
      <button class="btn-ghost" data-act="trackadd">+ Карьерный трек</button>
      <div class="card mute"><div class="lab">Трек — отдельная линия: наём и своё дело можно вести параллельно.
        Стаж считается по каждому отдельно, а пересекающиеся периоды внутри трека не удваиваются.</div></div>`) : ''}`;
}

function trackCard(trackId) {
  const list = careerIn(trackId);
  if (!list.length) return '';
  const total = trackTotal(trackId);
  return h`
    <div class="card">
      <div class="row between">
        <div class="caps">${trackId ? trackName(trackId) : 'Без трека'}</div>
        <span class="lab">${spanLabel(total)}${trackId ? '' : ''}</span>
      </div>
      ${trackId ? raw(h`<button class="q-edit" data-act="trackedit" data-id="${trackId}">изменить трек ›</button>`) : ''}
      <div class="road">
        ${list.map((x, i) => {
          const gap = careerGap(trackId, i);
          return raw(h`
            ${gap > 0 ? raw(h`<div class="road-gap">перерыв ${spanLabel(gap)}</div>`) : ''}
            <button class="road-item ${x.end ? '' : 'now'}" data-act="pos" data-id="${x.id}">
              <span class="road-dot"></span>
              <span class="grow" style="text-align:left">
                <span class="ink">${x.title}</span>
                <span class="lab"> · ${x.company}</span>
                <span class="lab" style="display:block">${period(x)} · ${spanLabel(careerSpan(x))} · ${WORK_KINDS.find(k => k.key === x.kind)?.name || ''}</span>
                ${x.note ? raw(h`<span class="lab" style="display:block">${x.note}</span>`) : ''}
              </span>
            </button>`);
        })}
      </div>
      <div class="lab">Начало — ${period({ start: list[list.length - 1].start })}.</div>
    </div>`;
}

const ymLabel = ym => `${MONTHS[Number(ym.slice(5, 7)) - 1].toLowerCase()} ${ym.slice(0, 4)}`;
const period = x => (x.end ? `${ymLabel(x.start)} — ${ymLabel(x.end)}` : `с ${ymLabel(x.start)}`);

/** Должность: место, название, вид, период и оклад. */
function positionSheet(id) {
  const x = S.work.career.find(y => y.id === id);
  const it = x || {
    id: uid(), trackId: careerTracks()[0]?.id || '', company: '', title: '',
    kind: 'job', start: todayISO().slice(0, 7) + '-01', end: '', salary: 0, note: '',
  };
  const tracks = careerTracks();
  openSheet({
    title: x ? x.title : 'Должность',
    sub: x ? x.company : 'место, должность и период',
    body: [
      field.text('company', 'Где', it.company, 'название компании или своё дело'),
      field.text('title', 'Кем', it.title, 'например, «специалист по рекламе»'),
      field.opts('kind', 'Что это', WORK_KINDS.map(k => ({ value: k.key, label: k.name })), it.kind),
      tracks.length ? field.select('trackId', 'Карьерный трек',
        [{ value: '', label: 'без трека' }, ...tracks.map(t => ({ value: t.id, label: t.name }))], it.trackId || '') : '',
      field.date('start', 'С какого дня', it.start),
      field.date('end', 'По какой — пусто, если это сейчас', it.end || ''),
      field.number('salary', 'Оклад до налогов', it.salary || '', { min: 0, suffix: '₽' }),
      field.area('note', 'Чем занималась', it.note || ''),
      field.note('Пустая дата окончания означает «работаю сейчас». Оклад текущей должности используется для расчёта стоимости часа.'),
    ].join(''),
    primary: x ? 'Сохранить' : 'Добавить',
    onSave: (v, close) => {
      const company = (v.company || '').trim();
      const title = (v.title || '').trim();
      if (!company || !title) return toast('Нужны место и должность');
      if (v.end && v.end < (v.start || it.start)) return toast('Конец раньше начала');
      update(s => {
        const next = {
          ...it, company, title, kind: WORK_KINDS.some(k => k.key === v.kind) ? v.kind : 'job',
          trackId: v.trackId ?? it.trackId, start: v.start || it.start, end: v.end || '',
          salary: Math.max(0, Number(v.salary) || 0), note: (v.note || '').trim(),
        };
        const i = s.work.career.findIndex(y => y.id === it.id);
        if (i >= 0) s.work.career[i] = next; else { s.work.career.push(next); addXp(XP.step); }
      });
      close();
    },
    danger: x ? 'Убрать должность' : null,
    onDanger: (_v, close) => {
      close();
      confirmSheet(`Убрать «${it.title}»?`, 'Запись уйдёт из пути. Часы, задачи и опыт останутся.', 'Убрать',
        () => update(s => { s.work.career = s.work.career.filter(y => y.id !== it.id); }));
    },
  });
}

/** Трек: отдельная линия карьеры. */
function trackSheet(id) {
  const t = id ? trackById(id) : null;
  const it = t || { id: uid(), name: '', archived: false };
  openSheet({
    title: t ? t.name : 'Карьерный трек',
    sub: 'отдельная линия — например, наём и своё дело',
    body: [
      field.text('name', 'Название', it.name, 'например, «Маркетинг»'),
      t ? field.note(`Должностей в треке: ${careerIn(it.id).length}. Убранный трек уходит из выбора, а его должности остаются на пути.`) : '',
    ].join(''),
    primary: t ? 'Сохранить' : 'Добавить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        const i = s.work.tracks.findIndex(y => y.id === it.id);
        if (i >= 0) s.work.tracks[i] = { ...s.work.tracks[i], name };
        else s.work.tracks.push({ ...it, name });
      });
      close();
    },
    danger: t ? 'Убрать трек' : null,
    onDanger: (_v, close) => {
      update(s => { const y = s.work.tracks.find(z => z.id === it.id); if (y) y.archived = true; });
      close();
      toast('Убрала — должности остались');
    },
  });
}
