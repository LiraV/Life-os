// «Работа»: наём. Мест работы может быть несколько, и у каждого свой график,
// оклад, норма офиса и отпуск.
//
// Второй наём не должен утяжелять экран тому, у кого он один: пока место
// одно, выбора места нигде нет — он появляется сам, когда мест становится
// больше. Это же правило действует в доске, в опыте и на «Годе».
//
// Экран считает нагрузку и границы, а не производительность. «Мало сделала»
// тут не считается нигде: считаются часы, дни подряд, офис и отпуск — то,
// что говорит, когда пора остановиться.

import { S, update, uid, XP, addXp, WORK_STAGES, WORK_KINDS, blankSched, touchTracker } from '../store.js';
import { todayISO, addDays, dayShort, monthKey, monthTitle, yearOf, MONTHS, weekDates, DOW, dowIndex, diffDays, relativeDay } from '../dates.js';
import { h, raw, field, bar, toast, openSheet, confirmSheet } from '../ui.js';
import {
  workJobs, jobsNow, jobById, jobName, soleJob, jobDayNorm, jobWeekNorm, weekNormAll, isJobDay,
  dayOfJob, dayEntries, workHours, workedDays, officeDays, workMonth, workWeek, workStreak,
  workOver, jobRate, salaryAll, jobVacation, workProjects, workProjectName, workTasks,
  tasksInStage, workDue, workDoneIn, workWins, winsIn, careerLine, jobSpan, spanLabel,
  careerTotal, careerGap,
} from '../selectors.js';
import { sphereGoalButton, sphereGoalsCard, sphereGoalSheet } from '../spheregoal.js';

const TABS = [['now', 'Сейчас'], ['board', 'Доска'], ['road', 'Путь'], ['year', 'Год']];
const tab = () => (TABS.some(([k]) => k === S.ui.workTab) ? S.ui.workTab : 'now');
const proj = () => S.ui.workProj ?? null;          // null — все, '' — без проекта
/** Выбранное место: null — все. Пока место одно, выбирать нечего. */
const curJob = () => (soleJob() ? soleJob().id : (S.ui.workJob ?? null));
const many = () => jobsNow().length > 1;
const num = n => Number(n).toLocaleString('ru-RU');
const hrs = n => `${Math.round(n * 10) / 10} ч`;

const DAY_TYPES = [
  { key: 'work', name: 'Работала' },
  { key: 'off', name: 'Выходной' },
  { key: 'vacation', name: 'Отпуск' },
  { key: 'sick', name: 'Больничный' },
];
const typeName = k => DAY_TYPES.find(x => x.key === k)?.name || k;

export function render() {
  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ сферы</button>
      <span class="tag">наём</span>
    </div>
    <div class="title">Работа</div>
    <div class="pills">${TABS.map(([k, l]) => raw(h`<button class="pill ${tab() === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`))}</div>
    ${raw({ now: nowView, board: boardView, road: roadView, year: yearView }[tab()]())}
    <div style="height:4px"></div>`;
}

/** Полоска выбора места — рисуется только когда мест больше одного. */
function jobPills(withAll = true) {
  if (!many()) return '';
  return h`
    <div class="pills">
      ${withAll ? raw(h`<button class="pill ${curJob() === null ? 'on' : ''}" data-act="job" data-v="all">Все места</button>`) : ''}
      ${jobsNow().map(j => raw(h`<button class="pill ${curJob() === j.id ? 'on' : ''}" data-act="job" data-v="${j.id}">${jobName(j.id)}</button>`))}
    </div>`;
}

// ── сейчас ──────────────────────────────────────────────────────
function nowView() {
  const t = todayISO();
  const list = jobsNow();
  if (!list.length) {
    return h`
      <div class="card dash">
        <div class="empty">Мест работы пока нет.<br>Заведи первое — из его графика посчитается норма.</div>
        <button class="add" data-act="jobadd">+ Место работы</button>
      </div>`;
  }
  const week = workWeek(t);
  const norm = weekNormAll();
  const streak = workStreak();
  const due = workDue(7, curJob());
  const doing = tasksInStage('doing', null, curJob());

  return h`
    ${list.map(j => raw(jobToday(j, t)))}

    <div class="card">
      <div class="row between"><div class="caps">Эта неделя${many() ? ' · всё вместе' : ''}</div>
        <span class="lab">${hrs(week.hours)} из ${hrs(norm)}</span></div>
      ${raw(bar(norm ? Math.round((week.hours / norm) * 100) : 0, week.hours > norm))}
      <div class="lab">${week.days} ${plural(week.days, 'день', 'дня', 'дней')}, из них ${week.office} в офисе.${
        week.hours > norm ? ` Сверх графика — ${hrs(week.hours - norm)}.` : ''}</div>
      ${many() ? raw(h`<div class="lab">${list.map(j => `${jobName(j.id)} — ${hrs(workWeek(t, j.id).hours)}`).join(' · ')}</div>`) : ''}
      ${raw(weekStrip(t))}
    </div>

    ${streak >= 6 ? raw(h`<div class="card dash">
      <div class="ink">${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд без выходного.</div>
      <div class="lab">Это не упрёк — просто цифра, которую стоит знать.</div>
    </div>`) : ''}

    ${list.filter(j => j.officeNorm > 0).map(j => {
      const m = workMonth(monthKey(t), j.id);
      return raw(h`<div class="card mute">
        <div class="row between"><span class="ink">В офисе${many() ? ` · ${jobName(j.id)}` : ''}</span>
          <span class="ink">${m.office} из ${j.officeNorm}</span></div>
        ${raw(bar(Math.min(100, Math.round((m.office / j.officeNorm) * 100)), m.office >= j.officeNorm))}
      </div>`);
    })}

    ${raw(jobPills())}

    ${doing.length ? raw(h`
      <div class="card">
        <div class="row between"><div class="caps">В работе</div><span class="lab">${doing.length}</span></div>
        ${doing.map(x => raw(taskRow(x)))}
      </div>`) : ''}

    ${due.length ? raw(h`
      <div class="card">
        <div class="caps">Со сроком</div>
        ${due.slice(0, 5).map(x => raw(h`
          <button class="link-row" data-act="task" data-id="${x.id}">
            <span class="ink grow ellip">${x.title}</span>
            <span class="lab">${dueLabel(x.due)} ›</span>
          </button>`))}
      </div>`) : ''}

    <button class="add" data-act="taskadd">+ Задача</button>
    ${raw(winsCard(5))}
    ${raw(sphereGoalsCard('work'))}
    ${raw(sphereGoalButton('work'))}`;
}

/** Карточка «сегодня» у одного места: отметка в один тап. */
function jobToday(j, t) {
  const rec = dayOfJob(t, j.id);
  return h`
    <div class="card">
      <div class="row between">
        <div class="caps">${many() ? jobName(j.id) : 'Сегодня'}</div>
        <span class="lab">${many() ? relativeDay(t) || dayShort(t) : ''}${isJobDay(j, t) ? '' : ' · не по графику'}</span>
      </div>
      ${rec ? raw(h`
        <div class="ink"><b>${typeName(rec.type)}</b>${rec.type === 'work'
          ? `<span class="lab"> · ${hrs(rec.hours)} · ${rec.where === 'office' ? 'в офисе' : 'из дома'}</span>` : ''}</div>
        <button class="q-edit" data-act="mark" data-d="${t}" data-j="${j.id}">изменить ›</button>`)
        : raw(h`
        <div class="lab">Не отмечено. Норма дня — ${hrs(jobDayNorm(j))}.</div>
        <div class="pills">
          <button class="pill" data-act="quick" data-j="${j.id}" data-w="office">Отработала · в офисе</button>
          <button class="pill" data-act="quick" data-j="${j.id}" data-w="home">Из дома</button>
          <button class="pill" data-act="mark" data-d="${t}" data-j="${j.id}">иначе ›</button>
        </div>`)}
    </div>`;
}

/** Неделя полосой. С двумя местами в клетке — сумма часов за день. */
function weekStrip(date) {
  const t = todayISO();
  return h`
    <div class="hab-grid">
      ${weekDates(date).map(d => {
        const es = dayEntries(d);
        const worked = es.filter(e => e.type === 'work');
        const mark = !es.length ? d.slice(8)
          : worked.length ? (many() ? String(Math.round(worked.reduce((a, e) => a + (Number(e.hours) || 0), 0)))
            : (worked[0].where === 'office' ? 'о' : 'д'))
          : { off: '—', vacation: 'от', sick: 'б' }[es[0].type] || '·';
        return raw(h`<button class="hab-cell ${worked.length ? 'on' : ''} ${es.length && !worked.length ? 'part' : ''} ${d === t ? 'today' : ''}"
          data-act="markday" data-d="${d}" ${raw(d > t ? 'disabled style="opacity:.4"' : '')}
          aria-label="${dayShort(d)}">${mark}</button>`);
      })}
    </div>
    <div class="lab">${many() ? 'В клетке — часы за день по всем местам.' : 'о — офис, д — из дома, от — отпуск, б — больничный, — выходной.'}</div>`;
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
  const jid = curJob();
  const list = workProjects(jid);
  return h`
    ${raw(jobPills())}
    <div class="pills">
      <button class="pill ${p === null ? 'on' : ''}" data-act="proj" data-v="all">Все</button>
      <button class="pill ${p === '' ? 'on' : ''}" data-act="proj" data-v="">Без проекта</button>
      ${list.map(x => raw(h`<button class="pill ${p === x.id ? 'on' : ''}" data-act="proj" data-v="${x.id}">${x.name}</button>`))}
      <button class="pill" data-act="projadd">+ проект</button>
    </div>

    <div class="board">
      ${WORK_STAGES.map(st => {
        const items = tasksInStage(st.key, p, jid);
        return raw(h`
          <div class="board-col">
            <div class="board-head">${st.name}<span class="lab"> ${items.length}</span></div>
            ${items.length ? items.map(x => raw(taskCard(x))) : raw('<div class="lab">пусто</div>')}
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
      <div class="lab">${[many() ? jobName(t.jobId) : '', t.projectId ? workProjectName(t.projectId) : 'без проекта',
        t.due ? dueLabel(t.due) : ''].filter(Boolean).join(' · ')}</div>
      <button class="pill" data-act="move" data-id="${t.id}">дальше ›</button>
    </div>`;
}

function taskRow(t) {
  return h`
    <button class="link-row" data-act="task" data-id="${t.id}">
      <span class="ink grow ellip">${t.title}</span>
      <span class="lab">${t.projectId ? workProjectName(t.projectId) : ''} ›</span>
    </button>`;
}

// ── путь ────────────────────────────────────────────────────────
/**
 * Места работы во времени. Пересекаться они могут — два найма разом это
 * нормально, и на шкале это видно как есть. Общий стаж при этом считается
 * календарно: параллельные места не дают двойного стажа.
 */
function roadView() {
  const line = careerLine();
  const now = jobsNow();
  if (!line.length) {
    return h`
      <div class="card dash">
        <div class="empty">Путь пока пуст.<br>Первое место — это уже путь.</div>
        <button class="add" data-act="jobadd">+ Место работы</button>
      </div>`;
  }
  return h`
    ${now.length ? raw(h`
      <div class="card">
        <div class="caps">Сейчас</div>
        ${now.map(j => raw(h`
          <button class="link-row" data-act="job2" data-id="${j.id}">
            <span class="grow"><span class="ink">${j.title || 'без должности'}</span>
              <span class="lab"> · ${j.company}</span></span>
            <span class="lab">${spanLabel(jobSpan(j))} ›</span>
          </button>`))}
        ${now.length > 1 ? raw(h`<div class="lab">Два места разом — это нормально. Часы, отпуск и норма офиса у каждого свои.</div>`) : ''}
      </div>`) : ''}

    <div class="card">
      <div class="row between"><div class="caps">Путь</div>
        <span class="lab">всего ${spanLabel(careerTotal())}</span></div>
      <div class="road">
        ${line.map((j, i) => {
          const gap = careerGap(i);
          return raw(h`
            ${gap > 0 ? raw(h`<div class="road-gap">перерыв ${spanLabel(gap)}</div>`) : ''}
            <button class="road-item ${j.end ? '' : 'now'}" data-act="job2" data-id="${j.id}">
              <span class="road-dot"></span>
              <span class="grow" style="text-align:left">
                <span class="ink">${j.title || 'без должности'}</span>
                <span class="lab"> · ${j.company}</span>
                <span class="lab" style="display:block">${period(j)} · ${spanLabel(jobSpan(j))} · ${WORK_KINDS.find(k => k.key === j.kind)?.name || ''}</span>
                ${j.note ? raw(h`<span class="lab" style="display:block">${j.note}</span>`) : ''}
              </span>
            </button>`);
        })}
      </div>
      <div class="lab">Общий стаж считается календарно: параллельные места не удваивают его.</div>
    </div>

    <button class="add" data-act="jobadd">+ Место работы</button>`;
}

const ymLabel = ym => `${MONTHS[Number(ym.slice(5, 7)) - 1].toLowerCase()} ${ym.slice(0, 4)}`;
const period = j => (j.end ? `${ymLabel(j.start)} — ${ymLabel(j.end)}` : `с ${ymLabel(j.start)}`);

// ── год ─────────────────────────────────────────────────────────
function yearView() {
  const y = yearOf(todayISO());
  const cur = monthKey(todayISO());
  const now = jobsNow();
  const done = workDoneIn(`${y}-01-01`, `${y}-12-31`).length;
  const wins = winsIn(`${y}-01-01`, `${y}-12-31`).length;
  return h`
    <div class="card">
      <div class="caps">${y} год</div>
      <div class="lab">Задач доведено до конца — ${done}. Записано в опыт — ${wins}.</div>
      ${now.length > 1 ? raw(h`<div class="lab">Оклады текущих мест вместе — ${num(salaryAll())} ₽ до налогов.</div>`) : ''}
    </div>

    ${now.map(j => {
      const v = jobVacation(j, y);
      const r = jobRate(j, cur);
      return raw(h`
        <div class="card">
          <div class="row between"><div class="caps">${jobName(j.id)}</div>
            <button class="q-edit" data-act="job2" data-id="${j.id}">изменить ›</button></div>
          <div class="row between"><span class="ink">Отпуск</span>
            <span class="ink">${v.used} из ${v.total}<i class="lab"> · осталось ${v.left}</i></span></div>
          ${raw(bar(v.total ? Math.round((v.used / v.total) * 100) : 0))}
          ${r ? raw(h`
            <div class="ink" style="margin-top:6px"><b>${num(r.rate)} ₽</b><span class="lab"> в час за ${monthTitle(cur).toLowerCase()}</span></div>
            <div class="lab">${num(r.salary)} ₽ до налогов делённые на ${hrs(r.hours)}. Число падает от переработок — в этом и смысл, что оно видно.</div>`)
            : raw('<div class="lab">Впиши оклад в месте работы — покажу, сколько на самом деле стоит час. Ставки разных мест не складываю: среднее было бы красивым враньём.</div>')}
        </div>`);
    })}

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
  const list = workWins(curJob()).slice(0, limit);
  return h`
    <div class="card">
      <div class="row between"><div class="caps">Опыт и победы</div>
        <button class="q-edit" data-act="winadd">+ запись</button></div>
      ${list.length ? raw(h`<div class="list">${list.map(x => raw(h`
        <button class="link-row" data-act="win" data-id="${x.id}">
          <span class="ink grow ellip">${x.title}</span>
          <span class="lab">${many() && x.jobId ? `${jobName(x.jobId)} · ` : ''}${dayShort(x.date)} ›</span>
        </button>`))}</div>`)
        : raw('<div class="lab">Сюда стоит писать не задачи, а то, чему научилась и что получилось. Через год это будет единственным, что помнишь.</div>')}
    </div>`;
}

const plural = (n, one, few, many_) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many_;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many_;
};

// ── шторки ──────────────────────────────────────────────────────
/** Отметка дня у одного места: тип, часы и где. Часы — из графика. */
function daySheet(date, jobId) {
  const j = jobById(jobId);
  const rec = dayOfJob(date, jobId) || { type: 'work', hours: jobDayNorm(j), where: 'office', note: '' };
  openSheet({
    title: dayShort(date),
    sub: `${DOW[dowIndex(date)]}${many() ? ` · ${jobName(jobId)}` : ''}${isJobDay(j, date) ? '' : ' · не по графику'}`,
    body: [
      field.opts('type', 'Что это был за день', DAY_TYPES.map(x => ({ value: x.key, label: x.name })), rec.type),
      field.number('hours', 'Сколько часов', rec.hours ?? jobDayNorm(j), { min: 0, max: 24, suffix: 'ч' }),
      field.opts('where', 'Где', [{ value: 'office', label: 'В офисе' }, { value: 'home', label: 'Из дома' }], rec.where || 'office'),
      field.text('note', 'Заметка', rec.note || ''),
      field.note(`Норма дня по графику — ${hrs(jobDayNorm(j))}. Часы нужны только у рабочего дня: у отпуска и больничного они не считаются.`),
    ].join(''),
    primary: 'Записать',
    onSave: (v, close) => {
      const type = DAY_TYPES.some(x => x.key === v.type) ? v.type : 'work';
      update(s => {
        (s.work.days[date] ||= {})[jobId] = {
          type,
          hours: type === 'work' ? Math.max(0, Number(v.hours) || 0) : 0,
          where: v.where === 'home' ? 'home' : 'office',
          note: (v.note || '').trim(),
        };
        touchTracker(s);
      });
      close();
    },
    danger: dayOfJob(date, jobId) ? 'Убрать отметку' : null,
    onDanger: (_v, close) => {
      update(s => {
        delete (s.work.days[date] || {})[jobId];
        if (s.work.days[date] && !Object.keys(s.work.days[date]).length) delete s.work.days[date];
        touchTracker(s);
      });
      close();
    },
  });
}

/** Тап по дню недели: с одним местом сразу шторка, с несколькими — выбор места. */
function pickJobForDay(date) {
  const list = jobsNow();
  if (list.length <= 1) return daySheet(date, list[0]?.id || jobsNow()[0]?.id);
  openSheet({
    title: dayShort(date),
    sub: 'какое место отмечаем',
    body: list.map(j => {
      const rec = dayOfJob(date, j.id);
      return h`<button class="link-row" data-act="pick" data-v="${j.id}">
        <span class="ink grow">${jobName(j.id)}</span>
        <span class="lab">${rec ? `${typeName(rec.type)}${rec.type === 'work' ? ` · ${hrs(rec.hours)}` : ''}` : 'не отмечено'} ›</span>
      </button>`;
    }).join(''),
    onAct: (name, data, close) => {
      if (name !== 'pick') return;
      close();
      daySheet(date, data.v);
    },
  });
}

/** Место работы: кто, кем, когда, график, оклад, офис и отпуск. */
function jobSheet(id) {
  const j = id ? jobById(id) : null;
  const it = j || {
    id: uid(), company: '', title: '', kind: 'job',
    start: todayISO(), end: '', salary: 0, note: '',
    sched: blankSched(), officeNorm: 0, vacationDays: 28,
  };
  const sc = it.sched || blankSched();
  openSheet({
    title: j ? jobName(j.id) : 'Место работы',
    sub: j ? `норма дня — ${hrs(jobDayNorm(j))}` : 'из графика посчитается норма',
    body: [
      field.text('company', 'Где', it.company, 'название компании'),
      field.text('title', 'Кем', it.title, 'например, «специалист по рекламе»'),
      field.opts('kind', 'Что это', WORK_KINDS.map(k => ({ value: k.key, label: k.name })), it.kind),
      field.date('start', 'С какого дня', it.start),
      field.date('end', 'По какой — пусто, если работаю сейчас', it.end || ''),
      `<div class="fld"><span>Рабочие дни</span><div class="days">
        ${DOW.map((d, i) => `<label class="day-box"><input type="checkbox" name="d${i}" ${(sc.days || []).includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}
      </div></div>`,
      field.time('from', 'Начало дня', sc.start),
      field.time('to', 'Конец дня', sc.end),
      field.number('lunch', 'Обед', sc.lunch, { min: 0, max: 240, suffix: 'мин' }),
      field.number('salary', 'Оклад до налогов', it.salary || '', { min: 0, suffix: '₽' }),
      field.number('officeNorm', 'Сколько дней в офисе нужно за месяц', it.officeNorm || '', { min: 0 }),
      field.number('vacationDays', 'Дней отпуска в году', it.vacationDays, { min: 0 }),
      field.area('note', 'Чем занималась', it.note || ''),
      field.note('График, оклад, офис и отпуск — свои у каждого места: со вторым наймом общими они быть перестают. Пустая дата окончания означает «работаю сейчас».'),
    ].join(''),
    primary: j ? 'Сохранить' : 'Добавить',
    onSave: (v, close) => {
      const company = (v.company || '').trim();
      if (!company) return toast('Нужно название места');
      if (v.end && v.end < (v.start || it.start)) return toast('Конец раньше начала');
      update(s => {
        const next = {
          ...it, company, title: (v.title || '').trim(),
          kind: WORK_KINDS.some(k => k.key === v.kind) ? v.kind : 'job',
          start: v.start || it.start, end: v.end || '',
          salary: Math.max(0, Number(v.salary) || 0),
          officeNorm: Math.max(0, Number(v.officeNorm) || 0),
          vacationDays: Math.max(0, Number(v.vacationDays) || 0),
          note: (v.note || '').trim(),
          sched: {
            days: DOW.map((_, i) => (v['d' + i] ? i : -1)).filter(i => i >= 0),
            start: v.from || sc.start, end: v.to || sc.end,
            lunch: Math.max(0, Number(v.lunch) || 0),
          },
        };
        const i = s.work.jobs.findIndex(x => x.id === it.id);
        if (i >= 0) s.work.jobs[i] = next; else { s.work.jobs.push(next); addXp(XP.step); }
      });
      close();
    },
    danger: j ? 'Убрать место' : null,
    onDanger: (_v, close) => {
      close();
      confirmSheet(`Убрать «${jobName(it.id)}»?`, 'Уйдёт и место, и его отметки дней. Задачи и опыт останутся.', 'Убрать',
        () => update(s => {
          s.work.jobs = s.work.jobs.filter(x => x.id !== it.id);
          Object.keys(s.work.days).forEach(d => {
            delete s.work.days[d][it.id];
            if (!Object.keys(s.work.days[d]).length) delete s.work.days[d];
          });
          if (s.ui.workJob === it.id) s.ui.workJob = null;
        }));
    },
  });
}

/** Задача: место, проект, стадия, срок. Место спрашивается, когда их много. */
function taskSheet(id) {
  const t = workTasks().find(x => x.id === id);
  const jid = curJob() || jobsNow()[0]?.id || '';
  const it = t || {
    id: uid(), title: '', projectId: proj() && proj() !== '' ? proj() : '', jobId: jid,
    stage: 'queue', stageAt: '', due: '', note: '', createdAt: todayISO(),
  };
  openSheet({
    title: t ? 'Задача' : 'Новая задача',
    sub: t ? [many() ? jobName(t.jobId) : '', workProjectName(t.projectId)].filter(Boolean).join(' · ') : '',
    body: [
      field.text('title', 'Что сделать', it.title, 'коротко'),
      many() ? field.select('jobId', 'Место работы',
        jobsNow().map(j => ({ value: j.id, label: jobName(j.id) })), it.jobId || jid) : '',
      field.select('projectId', 'Проект', [{ value: '', label: 'без проекта' },
        ...workProjects(it.jobId || jid).map(p => ({ value: p.id, label: p.name }))], it.projectId || ''),
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
          ...it, title, projectId: v.projectId || '', jobId: v.jobId ?? it.jobId,
          stage, due: v.due || '', note: (v.note || '').trim(),
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

/** Проект: имя и место работы. Архивный не исчезает — задачи остаются. */
function projectSheet(id) {
  const p = id ? workProjects().find(x => x.id === id) : null;
  const jid = curJob() || jobsNow()[0]?.id || '';
  const it = p || { id: uid(), name: '', jobId: jid, archived: false };
  openSheet({
    title: p ? p.name : 'Новый проект',
    body: [
      field.text('name', 'Название', it.name, 'например, «Кампании для X»'),
      many() ? field.select('jobId', 'Место работы',
        jobsNow().map(j => ({ value: j.id, label: jobName(j.id) })), it.jobId || jid) : '',
      p ? field.note(`Задач в проекте: ${workTasks().filter(t => t.projectId === it.id).length}. Убранный проект уходит из фильтра, а его задачи остаются.`) : '',
    ].join(''),
    primary: p ? 'Сохранить' : 'Добавить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        const next = { ...it, name, jobId: v.jobId ?? it.jobId };
        const i = s.work.projects.findIndex(x => x.id === it.id);
        if (i >= 0) s.work.projects[i] = { ...s.work.projects[i], ...next };
        else s.work.projects.push(next);
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
  const it = w || { id: uid(), date: todayISO(), title: '', note: '', jobId: curJob() || jobsNow()[0]?.id || '' };
  openSheet({
    title: w ? 'Запись' : 'Опыт или победа',
    body: [
      field.text('title', 'Что', it.title, 'например, «первая кампания без правок»'),
      field.date('date', 'Когда', it.date),
      many() ? field.select('jobId', 'Где',
        [{ value: '', label: 'не про место' }, ...workJobs().map(j => ({ value: j.id, label: jobName(j.id) }))], it.jobId || '') : '',
      field.area('note', 'Подробнее', it.note || ''),
      field.note('Это не задача и не отчёт. Это то, что стоит помнить: чему научилась, что получилось, что оказалось не таким страшным.'),
    ].join(''),
    primary: w ? 'Сохранить' : 'Записать',
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Нужно название');
      update(s => {
        const next = { ...it, title, date: v.date || todayISO(), jobId: v.jobId ?? it.jobId, note: (v.note || '').trim() };
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

export const actions = {
  back: () => { location.hash = '#/spheres'; },
  tab: v => update(s => { s.ui.workTab = v.v; }),
  job: v => update(s => { s.ui.workJob = v.v === 'all' ? null : v.v; }),

  jobadd: () => jobSheet(null),
  job2: v => jobSheet(v.id),

  /** Один тап: рабочий день по норме своего места. */
  quick: v => {
    const j = jobById(v.j);
    update(s => {
      (s.work.days[todayISO()] ||= {})[v.j] = {
        type: 'work', hours: jobDayNorm(j), where: v.w === 'home' ? 'home' : 'office', note: '',
      };
      touchTracker(s);
    });
    toast(`Отмечено · ${hrs(jobDayNorm(j))}`);
  },
  mark: v => daySheet(v.d, v.j),
  markday: v => pickJobForDay(v.d),

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

  spheregoal: () => sphereGoalSheet('work'),
  togoal: () => { location.hash = '#/plans'; },
};
