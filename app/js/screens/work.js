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

import { goBack } from '../nav.js';
import { S, update, uid, XP, addXp, WORK_KINDS, blankSched, touchTracker, nameTaken } from '../store.js';
import { todayISO, addDays, dayShort, monthKey, monthTitle, yearOf, MONTHS, weekDates, DOW, dowIndex, diffDays, relativeDay } from '../dates.js';
import { h, raw, field, bar, toast, openSheet, confirmSheet } from '../ui.js';
import {
  workJobs, jobsNow, jobById, jobName, soleJob, jobDayNorm, jobWeekNorm, weekNormAll, isJobDay,
  dayOfJob, dayEntries, workHours, workedDays, officeDays, workMonth, workWeek, workStreak,
  workOver, jobRate, salaryAll, jobVacation, workTasks, taskById, cardsIn, boardMonths,
  checkDone, deadlineInfo, workToday, workAhead, workDoneIn, workWins, winsIn,
  careerLine, jobSpan, spanLabel, careerTotal, careerGap,
} from '../selectors.js';
import {
  KGROUPS, KCOLUMNS, KZONES, KTYPES, PLATFORMS, KTEMPLATES, kColumn, kColumnName,
  platformById, isDoneColumn, weeksOfMonth, weeklyText, monthLabel, monthShift,
} from '../kanban.js';
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
      <button class="q-edit" data-act="back">‹ назад</button>
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
  const today = workToday(curJob());
  const ahead = workAhead(14, curJob());

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

    ${today.length ? raw(h`
      <div class="card">
        <div class="row between"><div class="caps">На сегодня</div><span class="lab">${today.length}</span></div>
        ${today.map(x => raw(h`
          <div class="quest">
            <button class="check" data-act="carddone" data-id="${x.id}" aria-label="Сделано">✓</button>
            <div class="grow" data-act="card" data-id="${x.id}" style="cursor:pointer">
              <div class="q-title">${x.title}</div>
              <div class="q-meta">
                <span class="tag">${x.type}</span>
                <span class="q-time">${x.day < todayISO() ? `с ${dayShort(x.day)}` : 'сегодня'}</span>
              </div>
            </div>
          </div>`))}
      </div>`) : ''}

    ${ahead.length ? raw(h`
      <div class="card mute">
        <div class="row between"><div class="caps">Дальше</div><span class="lab">${ahead.length}</span></div>
        ${ahead.slice(0, 6).map(x => raw(h`
          <button class="link-row" data-act="card" data-id="${x.id}">
            <span class="lab grow ellip">${x.title}</span>
            <span class="lab">${dayShort(x.day)} ›</span>
          </button>`))}
        <div class="lab">Это не сегодняшнее — просто чтобы не забыть.</div>
      </div>`) : ''}

    <button class="add" data-act="cardadd" data-col="ot-todo">+ Задача</button>
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
// Процесс перенесён из отдельного канбана целиком: девятнадцать колонок в
// трёх зонах. На ноутбуке это настоящая доска с перетаскиванием, на телефоне —
// те же колонки, но листаются вбок, а фильтры уезжают в шторку.

const F = () => (S.ui.wboard ||= { search: '', type: '', platform: '', month: '', urgent: false });
const filtersOn = () => { const f = F(); return !!(f.search || f.type || f.platform || f.month || f.urgent); };

function boardView() {
  const jid = curJob();
  const f = F();
  return h`
    ${raw(jobPills())}
    ${raw(filterBar())}
    <div class="kb">
      ${KZONES.map(zone => raw(zoneView(zone, jid, f)))}
    </div>
    ${S.work.tasks.length ? '' : raw(h`<div class="card dash">
      <div class="empty">Доска пуста.<br>Можно завести первую задачу или перенести доску из выгрузки.</div>
      <button class="add" data-act="kimport">Перенести из файла</button>
    </div>`)}
    <button class="btn-ghost" data-act="kimport">Перенести доску из файла</button>`;
}

/** Фильтры: на широком экране полосой, на телефоне одной кнопкой. */
function filterBar() {
  const f = F();
  const chips = [
    f.type && f.type, f.platform && (platformById(f.platform)?.name || ''),
    f.month && monthLabel(f.month), f.urgent && 'срочные', f.search && `«${f.search}»`,
  ].filter(Boolean);
  return h`
    <div class="kb-filters">
      <input type="search" class="kb-search" data-field="q" data-act-input="search"
             value="${f.search}" placeholder="Поиск по названию, заметкам, запросу…" autocomplete="off">
      <select class="kb-sel" data-change="ftype">
        <option value="" ${raw(f.type ? '' : 'selected')}>Тип: все</option>
        ${KTYPES.map(t => raw(h`<option value="${t}" ${raw(f.type === t ? 'selected' : '')}>${t}</option>`))}
      </select>
      <select class="kb-sel" data-change="fplatform">
        <option value="" ${raw(f.platform ? '' : 'selected')}>Площадка: все</option>
        ${PLATFORMS.map(p => raw(h`<option value="${p.id}" ${raw(f.platform === p.id ? 'selected' : '')}>${p.name}</option>`))}
      </select>
      <select class="kb-sel" data-change="fmonth">
        <option value="" ${raw(f.month ? '' : 'selected')}>Месяц: все</option>
        ${boardMonths().map(m => raw(h`<option value="${m}" ${raw(f.month === m ? 'selected' : '')}>${monthLabel(m)}</option>`))}
      </select>
      <label class="kb-check"><input type="checkbox" data-change="furgent" ${raw(f.urgent ? 'checked' : '')}> только срочные</label>
      ${filtersOn() ? raw(h`<button class="btn-ghost" data-act="freset">сбросить</button>`) : ''}
    </div>
    <div class="kb-filters-sm">
      <button class="pill ${filtersOn() ? 'on' : ''}" data-act="fsheet">Фильтры${chips.length ? ` · ${chips.length}` : ''}</button>
      ${chips.map(c => raw(h`<span class="tag">${c}</span>`))}
      ${filtersOn() ? raw(h`<button class="pill" data-act="freset">сбросить</button>`) : ''}
    </div>`;
}

function zoneView(groupIds, jid, f) {
  const cols = KCOLUMNS.filter(c => groupIds.includes(c.group));
  return h`
    <div class="kb-zone">
      <div class="kb-heads">
        ${groupIds.map(g => raw(h`<div class="kb-group ${KGROUPS[g].cls}"
          style="flex:${KCOLUMNS.filter(c => c.group === g).length}">
          <span>${KGROUPS[g].name}</span><span class="kb-line"></span></div>`))}
      </div>
      <div class="kb-cols">
        ${cols.map(col => {
          const list = cardsIn(col.id, jid, f);
          return raw(h`
            <div class="kb-col kb-${col.group}" data-col="${col.id}">
              <div class="kb-col-head">
                <div class="kb-col-title">${col.emoji} ${col.title}<span class="kb-n">${list.length}</span></div>
                <div class="kb-col-hint">${col.hint}</div>
              </div>
              <div class="kb-body">${list.map(c => raw(cardView(c)))}</div>
              <button class="kb-add" data-act="cardadd" data-col="${col.id}">＋ добавить</button>
            </div>`);
        })}
      </div>
    </div>`;
}

function cardView(c) {
  const dl = deadlineInfo(c.deadline);
  const total = (c.checklist || []).length;
  const done = checkDone(c);
  const typeCls = c.type === 'МП' ? 'k-mp' : c.type === 'РК' ? 'k-rk' : 'k-ot';
  return h`
    <div class="kb-card" draggable="true" data-card="${c.id}">
      <div class="kb-badges">
        <span class="badge ${typeCls}">${c.type}</span>
        ${c.urgent ? raw('<span class="badge k-fire">🔥 срочно</span>') : ''}
        ${c.month ? raw(h`<span class="badge k-month">${monthLabel(c.month)}</span>`) : ''}
        ${(c.platforms || []).map(pid => {
          const p = platformById(pid);
          return p ? raw(h`<span class="pf ${p.cls}">${p.name}</span>`) : '';
        })}
      </div>
      <div class="kb-title" data-act="card" data-id="${c.id}">${c.title}</div>
      ${c.split ? raw(h`<div class="kb-split">◫ ${c.split}</div>`) : ''}
      <div class="kb-meta">
        ${dl ? raw(h`<span class="chip ${dl.cls}">📅 ${dl.label}</span>`) : ''}
        ${c.day ? raw(h`<span class="chip">🗓 делаю ${dayShort(c.day)}</span>`) : ''}
        ${total ? raw(h`<span class="chip ${done === total ? 'ok' : ''}">☑ ${done}/${total}</span>`) : ''}
        ${c.request ? raw(h`<span class="chip">🔗 ${c.request}</span>`) : ''}
        ${c.budget ? raw(h`<span class="chip">💰 ${c.budget}</span>`) : ''}
        ${c.notes ? raw('<span class="chip">📝</span>') : ''}
      </div>
      <button class="kb-move" data-act="cardmove" data-id="${c.id}">перенести ›</button>
    </div>`;
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
      const twin = nameTaken(S.work.jobs, company, it.id, 'company');
      if (twin) return toast(`«${twin.company}» уже есть на пути`);
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

/**
 * Карточка доски — та же, что была в отдельном канбане: тип, колонка,
 * площадки, месяц, дедлайн, код запроса, бюджет, сплит, ссылки, срочность
 * и чек-лист. Плюс «когда делаю» — это то, что связывает карточку с днём.
 */
export function taskSheet(id, column = 'l1') {
  const t = taskById(id);
  const col = t ? t.column : column;
  const g = kColumn(col).group;
  const it = t || {
    id: uid(), jobId: curJob() || jobsNow()[0]?.id || '', column: col,
    type: g === 'rk' ? 'РК' : g === 'other' ? 'Прочее' : 'МП',
    title: '', platforms: [], month: monthKey(todayISO()), day: '', deadline: '',
    request: '', budget: '', split: '', urgent: false, links: '', notes: '',
    checklist: [], movedAt: '',
  };
  draft = { checklist: it.checklist.map(x => ({ ...x })), platforms: [...(it.platforms || [])] };

  openSheet({
    title: t ? 'Задача' : 'Новая задача',
    sub: t ? kColumnName(t.column) : kColumnName(col),
    body: [
      field.text('title', 'Название', it.title, 'РК Озон — баннеры на главной, сентябрь'),
      field.opts('type', 'Тип', KTYPES.map(x => ({ value: x, label: x })), it.type),
      field.select('column', 'Колонка', KCOLUMNS.map(c => ({ value: c.id, label: `${c.emoji} ${c.title}` })), it.column),
      platformPicker(),
      field.month('month', 'Месяц РК', it.month),
      field.date('day', 'Когда делаю', it.day || ''),
      field.date('deadline', 'Дедлайн', it.deadline || ''),
      field.text('request', 'Код запроса', it.request, 'OZN-SEP — связывает карточки одного запроса'),
      field.text('budget', 'Бюджет', it.budget, '1 200 000 ₽'),
      field.text('split', 'Сплит', it.split, 'ГЕО Москва · статичный баннер'),
      field.area('notes', 'Заметки', it.notes),
      field.area('links', 'Ссылки', it.links, 'по одной на строку'),
      `<label class="row tight" style="font-size:13px"><input type="checkbox" name="urgent" ${it.urgent ? 'checked' : ''}> 🔥 Срочная</label>`,
      checklistBlock(),
      field.note('«Когда делаю» — день, в который задача попадёт в «На сегодня». Дедлайн — срок сдачи, он только подсвечивается на карточке. При переходе в новую колонку чек-лист этапа добавляется сам.'),
    ].join(''),
    primary: t ? 'Сохранить' : 'Добавить',
    onAct: (name, data, close, vals) => {
      if (name === 'pf') {
        draft.platforms = draft.platforms.includes(data.v)
          ? draft.platforms.filter(x => x !== data.v) : [...draft.platforms, data.v];
        return redrawDraft();
      }
      if (name === 'cltoggle') {
        const x = draft.checklist.find(i => i.id === data.v);
        if (x) x.done = !x.done;
        return redrawDraft();
      }
      if (name === 'cldel') {
        draft.checklist = draft.checklist.filter(i => i.id !== data.v);
        return redrawDraft();
      }
      if (name === 'cladd') {
        const box = document.querySelector('.sheet [data-field="clnew"]');
        const text = (box?.value || '').trim();
        if (!text) return;
        draft.checklist.push({ id: uid(), text, done: false });
        box.value = '';
        return redrawDraft();
      }
      if (name === 'cltpl') return addTemplate(document.querySelector('.sheet select[name="column"]')?.value || it.column);
      if (name === 'clweek') return addWeekly(document.querySelector('.sheet input[name="month"]')?.value || it.month);
      if (name === 'dup') { const v = collect(vals, it); close(); return duplicate(v, false); }
      if (name === 'dupnext') { const v = collect(vals, it); close(); return duplicate(v, true); }
    },
    onSave: (v, close) => {
      const next = collect(v, it);
      if (!next.title) return toast('Нужно название');
      update(s2 => {
        const moved = t && t.column !== next.column;
        if (!t || moved) next.movedAt = todayISO();
        if (!t || moved) applyTemplate(next);
        const i = s2.work.tasks.findIndex(x => x.id === it.id);
        if (i >= 0) s2.work.tasks[i] = next; else s2.work.tasks.push(next);
        if (isDoneColumn(next.column) && (!t || !isDoneColumn(t.column))) addXp(XP.step);
        touchTracker(s2);
      });
      close();
    },
    danger: t ? 'Удалить задачу' : null,
    onDanger: (_v, close) => {
      close();
      confirmSheet(`Удалить «${it.title}»?`, 'Карточка исчезнет вместе с чек-листом.', 'Удалить',
        () => update(s2 => { s2.work.tasks = s2.work.tasks.filter(x => x.id !== it.id); touchTracker(s2); }));
    },
  });
}

/** Черновик карточки: площадки и чек-лист живут вне формы, их правят кнопками. */
let draft = { checklist: [], platforms: [] };

const platformPicker = () => h`
  <div class="fld"><span>Площадки</span>
    <div class="pf-pick" id="pf_pick">
      ${PLATFORMS.map(p => raw(h`<button type="button" class="pf-opt ${draft.platforms.includes(p.id) ? 'on' : ''}"
        data-act="pf" data-v="${p.id}">${p.name}</button>`))}
    </div>
  </div>`;

const checklistBlock = () => {
  const done = draft.checklist.filter(x => x.done).length;
  return h`
    <div class="fld" id="cl_block">
      <div class="row between"><span>Чек-лист${draft.checklist.length ? ` · ${done} из ${draft.checklist.length}` : ''}</span></div>
      <div class="pills">
        <button type="button" class="pill" data-act="cltpl">📋 Чек-лист этапа</button>
        <button type="button" class="pill" data-act="clweek">📅 Отчёты по неделям</button>
      </div>
      <div class="cl-list">
        ${draft.checklist.map(i => raw(h`
          <div class="cl-item ${i.done ? 'done' : ''}">
            <button type="button" class="check sm ${i.done ? 'on' : ''}" data-act="cltoggle" data-v="${i.id}">✓</button>
            <span class="grow">${i.text}</span>
            <button type="button" class="q-edit" data-act="cldel" data-v="${i.id}">×</button>
          </div>`))}
      </div>
      <div class="row">
        <input type="text" class="grow" data-field="clnew" data-act-enter="cladd" placeholder="Добавить пункт и Enter">
        <button type="button" class="pill" data-act="cladd">+</button>
      </div>
    </div>`;
};

/** Перерисовать только те части шторки, которые живут вне формы. */
function redrawDraft() {
  const pf = document.getElementById('pf_pick');
  if (pf) pf.innerHTML = PLATFORMS.map(p =>
    `<button type="button" class="pf-opt ${draft.platforms.includes(p.id) ? 'on' : ''}" data-act="pf" data-v="${p.id}">${p.name}</button>`).join('');
  const cl = document.getElementById('cl_block');
  if (cl) cl.outerHTML = checklistBlock();
}

function collect(v, it) {
  return {
    ...it,
    title: (v.title || '').trim(),
    type: KTYPES.includes(v.type) ? v.type : it.type,
    column: KCOLUMNS.some(c => c.id === v.column) ? v.column : it.column,
    platforms: [...draft.platforms],
    month: v.month || '', day: v.day || '', deadline: v.deadline || '',
    request: (v.request || '').trim(), budget: (v.budget || '').trim(),
    split: (v.split || '').trim(), notes: v.notes || '', links: (v.links || '').trim(),
    urgent: !!v.urgent, checklist: draft.checklist.map(x => ({ ...x })),
  };
}

/** Чек-лист этапа добавляется без дублей — по тексту пункта. */
function applyTemplate(card) {
  const tpl = KTEMPLATES[card.column];
  if (!tpl) return;
  const have = new Set(card.checklist.map(i => i.text));
  tpl.filter(x => !have.has(x)).forEach(x => card.checklist.push({ id: uid(), text: x, done: false }));
}

function addTemplate(column) {
  const tpl = KTEMPLATES[column];
  if (!tpl) return toast('Для этого этапа шаблона нет');
  const have = new Set(draft.checklist.map(i => i.text));
  const fresh = tpl.filter(x => !have.has(x));
  if (!fresh.length) return toast('Чек-лист этапа уже добавлен');
  fresh.forEach(x => draft.checklist.push({ id: uid(), text: x, done: false }));
  redrawDraft();
  toast(`Добавлено: ${fresh.length}`);
}

function addWeekly(ym) {
  if (!ym) return toast('Сначала укажи месяц РК');
  const have = new Set(draft.checklist.map(i => i.text));
  let n = 0;
  weeksOfMonth(ym).forEach(([a, b], i) => {
    const text = weeklyText(i, a, b);
    if (!have.has(text)) { draft.checklist.push({ id: uid(), text, done: false }); n++; }
  });
  redrawDraft();
  toast(n ? `Добавлено отчётов: ${n}` : 'Отчёты этого месяца уже в списке');
}

/**
 * Дубликат: для сплитов по гео и креативам — копия рядом; для многомесячных
 * РК — копия на следующий месяц, которая начинает путь заново с проверки
 * заявки, а дедлайн и день работы у неё сбрасываются.
 */
function duplicate(v, nextMonth) {
  const copy = {
    ...v, id: uid(), movedAt: todayISO(),
    checklist: v.checklist.map(x => ({ id: uid(), text: x.text, done: false })),
  };
  if (nextMonth && copy.month) {
    copy.month = monthShift(copy.month, 1);
    copy.column = 'rk-check';
    copy.deadline = ''; copy.day = '';
  } else {
    copy.title = `${copy.title} · копия`;
  }
  update(s2 => { s2.work.tasks.push(copy); touchTracker(s2); });
  toast(nextMonth ? `Копия на ${monthLabel(copy.month)} — в «Проверке заявки»` : 'Дубликат создан — задай сплит');
  taskSheet(copy.id);
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

/**
 * Перетаскивание на ноутбуке. Слушатели вешаются на доску один раз после
 * отрисовки: карточек много, и по обработчику на каждую было бы расточительно.
 */
export function afterRender() {
  const board = document.querySelector('.kb');
  if (!board || board.dataset.dnd) return;
  board.dataset.dnd = '1';
  let dragId = '';
  board.addEventListener('dragstart', e => {
    const card = e.target.closest('.kb-card');
    if (!card) return;
    dragId = card.dataset.card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  board.addEventListener('dragend', e => e.target.closest('.kb-card')?.classList.remove('dragging'));
  board.addEventListener('dragover', e => {
    const col = e.target.closest('.kb-col');
    if (!col) return;
    e.preventDefault();
    col.classList.add('over');
  });
  board.addEventListener('dragleave', e => e.target.closest('.kb-col')?.classList.remove('over'));
  board.addEventListener('drop', e => {
    const col = e.target.closest('.kb-col');
    if (!col) return;
    e.preventDefault();
    col.classList.remove('over');
    const id = e.dataTransfer.getData('text/plain') || dragId;
    if (id) moveCard(id, col.dataset.col);
  });
}

/** Перенос доски из отдельного канбана: файл выгрузки читается как есть. */
function importSheet() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); } catch { return toast('Это не похоже на выгрузку доски'); }
      if (!Array.isArray(data.cards)) return toast('В файле нет карточек');
      const jid = curJob() || jobsNow()[0]?.id || '';
      // Уже перенесённое не двоим: сверяем по названию и колонке.
      const have = new Set(S.work.tasks.map(t => `${t.title}|${t.column}`));
      const fresh = data.cards.filter(c => c.title && !have.has(`${c.title}|${c.column}`));
      if (!fresh.length) return toast('Всё из этого файла уже на доске');
      update(s2 => {
        fresh.forEach(c => s2.work.tasks.push({
          id: uid(), jobId: jid,
          column: KCOLUMNS.some(x => x.id === c.column) ? c.column : 'ot-todo',
          type: KTYPES.includes(c.type) ? c.type : 'Прочее',
          title: c.title, platforms: Array.isArray(c.platforms) ? c.platforms : [],
          month: c.month || '', day: '', deadline: c.deadline || '',
          request: c.request || '', budget: c.budget || '', split: c.split || '',
          urgent: !!c.urgent, links: c.links || '', notes: c.notes || '',
          checklist: (Array.isArray(c.checklist) ? c.checklist : [])
            .map(i => ({ id: uid(), text: String(i.text || ''), done: !!i.done })).filter(i => i.text),
          movedAt: todayISO(),
        }));
        touchTracker(s2);
      });
      toast(`Перенесено задач: ${fresh.length}`);
    };
    reader.readAsText(file);
  };
  input.click();
}

export const actions = {
  back: () => goBack('spheres'),
  kimport: () => importSheet(),
  tab: v => update(s2 => { s2.ui.workTab = v.v; }),
  job: v => update(s2 => { s2.ui.workJob = v.v === 'all' ? null : v.v; }),

  jobadd: () => jobSheet(null),
  job2: v => jobSheet(v.id),

  /** Один тап: рабочий день по норме своего места. */
  quick: v => {
    const j = jobById(v.j);
    update(s2 => {
      (s2.work.days[todayISO()] ||= {})[v.j] = {
        type: 'work', hours: jobDayNorm(j), where: v.w === 'home' ? 'home' : 'office', note: '',
      };
      touchTracker(s2);
    });
    toast(`Отмечено · ${hrs(jobDayNorm(j))}`);
  },
  mark: v => daySheet(v.d, v.j),
  markday: v => pickJobForDay(v.d),

  // ── доска
  cardadd: v => taskSheet(null, v.col || 'l1'),
  card: v => taskSheet(v.id),
  cardmove: v => moveSheet(v.id),
  /** Отметка «сделано» из списка на сегодня: карточка уходит в закрытую колонку. */
  carddone: v => update(s2 => {
    const c = s2.work.tasks.find(x => x.id === v.id);
    if (!c) return;
    c.column = c.type === 'Прочее' ? 'ot-done' : 'done';
    c.movedAt = todayISO();
    addXp(XP.step);
    touchTracker(s2);
  }),
  /** Перетаскивание на ноутбуке — то же перемещение, что и через шторку. */
  drop: (id, col) => moveCard(id, col),

  search: v => update(s2 => { F().search = v.value; }),
  ftype: v => update(s2 => { F().type = v.value; }),
  fplatform: v => update(s2 => { F().platform = v.value; }),
  fmonth: v => update(s2 => { F().month = v.value; }),
  furgent: v => update(s2 => { F().urgent = !!v.checked; }),
  freset: () => update(s2 => { s2.ui.wboard = { search: '', type: '', platform: '', month: '', urgent: false }; }),
  fsheet: () => filterSheet(),

  winadd: () => winSheet(null),
  win: v => winSheet(v.id),

  posadd: () => jobSheet(null),
  pos: v => jobSheet(v.id),

  spheregoal: () => sphereGoalSheet('work'),
  togoal: () => { location.hash = '#/plans'; },
};

/** Перенос карточки в колонку: чек-лист этапа добавляется сам, без дублей. */
export function moveCard(id, col) {
  if (!KCOLUMNS.some(c => c.id === col)) return;
  let name = '';
  update(s2 => {
    const c = s2.work.tasks.find(x => x.id === id);
    if (!c || c.column === col) return;
    const before = c.checklist.length;
    c.column = col;
    c.movedAt = todayISO();
    applyTemplate(c);
    if (isDoneColumn(col)) addXp(XP.step);
    name = c.checklist.length > before ? `Чек-лист этапа: +${c.checklist.length - before}` : '';
    touchTracker(s2);
  });
  if (name) toast(name);
}

/** Перенос с телефона: списком колонок, без перетаскивания. */
function moveSheet(id) {
  const c = taskById(id);
  if (!c) return;
  openSheet({
    title: c.title,
    sub: `сейчас — ${kColumnName(c.column)}`,
    body: [
      KZONES.flatMap(z => KCOLUMNS.filter(x => z.includes(x.group)))
        .map(x => h`<button class="link-row" data-act="to" data-v="${x.id}">
          <span class="${x.id === c.column ? 'ink' : 'lab'} grow">${x.emoji} ${x.title}</span>
          <span class="lab">${x.id === c.column ? 'сейчас' : '›'}</span>
        </button>`).join(''),
      field.note('При переходе в новую колонку чек-лист этапа добавляется сам.'),
    ].join(''),
    onAct: (name, data, close) => {
      if (name !== 'to') return;
      close();
      moveCard(id, data.v);
    },
  });
}

/** Фильтры на телефоне — одной шторкой, чтобы не занимать полэкрана пилюлями. */
function filterSheet() {
  const f = F();
  openSheet({
    title: 'Фильтры доски',
    body: [
      field.text('search', 'Поиск', f.search, 'по названию, заметкам, запросу'),
      field.opts('type', 'Тип', [{ value: '', label: 'все' }, ...KTYPES.map(t => ({ value: t, label: t }))], f.type),
      field.select('platform', 'Площадка', [{ value: '', label: 'все' },
        ...PLATFORMS.map(p => ({ value: p.id, label: p.name }))], f.platform),
      field.select('month', 'Месяц', [{ value: '', label: 'все' },
        ...boardMonths().map(m => ({ value: m, label: monthLabel(m) }))], f.month),
      `<label class="row tight" style="font-size:13px"><input type="checkbox" name="urgent" ${f.urgent ? 'checked' : ''}> только срочные</label>`,
    ].join(''),
    primary: 'Показать',
    onSave: (v, close) => {
      update(s2 => {
        s2.ui.wboard = {
          search: (v.search || '').trim(), type: v.type || '', platform: v.platform || '',
          month: v.month || '', urgent: !!v.urgent,
        };
      });
      close();
    },
    secondary: 'Сбросить',
    onSecondary: (_v, close) => {
      update(s2 => { s2.ui.wboard = { search: '', type: '', platform: '', month: '', urgent: false }; });
      close();
    },
  });
}
