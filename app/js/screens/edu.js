// «Обучение» — полка занятий. Курс меряется пройденными уроками,
// практика — ритмом: сколько занятий в месяце и когда было последнее.
// Проценты для практики не считаем: у вокала не бывает «80% пройдено».

import { S, update, uid, XP, addXp, addDiary, touchTracker } from '../store.js';
import { todayISO, monthKey, addMonths, monthTitle, dayShort, diffDays } from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import { liveLessons, lessonMonth, lessonLast, lessonAgo, courseProgress } from '../selectors.js';
import { scheduleBlock, scheduleActions } from '../schedule.js';

const cal = () => S.ui.eduMonth || monthKey(todayISO());
const money = n => `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} ₽`;

const agoLabel = l => {
  const d = lessonAgo(l);
  if (d == null) return 'ещё не было';
  if (d === 0) return 'сегодня';
  if (d === 1) return 'вчера';
  return `${d} ${d % 10 === 1 && d % 100 !== 11 ? 'день' : d % 10 >= 2 && d % 10 <= 4 && (d % 100 < 10 || d % 100 >= 20) ? 'дня' : 'дней'} назад`;
};

export function render() {
  const m = cal();
  const all = liveLessons();
  const live = all.filter(l => !l.paused);
  const paused = all.filter(l => l.paused);
  const sessions = live.reduce((a, l) => a + lessonMonth(l, m), 0);
  const cost = all.filter(l => !l.paused).reduce((a, l) => a + (Number(l.cost) || 0), 0);

  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ сферы</button>
      <span class="tag">полка</span>
    </div>
    <div class="title">Обучение</div>

    <div class="stepper">
      <button class="arrow" data-act="prev">‹</button>
      <div style="text-align:center">
        <div class="ink"><b>${monthTitle(m)}</b></div>
        <div class="lab">${sessions ? `${sessions} ${sessions === 1 ? 'занятие' : sessions < 5 ? 'занятия' : 'занятий'}` : 'занятий пока нет'}${cost ? ` · ${money(cost)} в месяц` : ''}</div>
      </div>
      <button class="arrow" data-act="next">›</button>
    </div>

    ${live.length ? live.map(l => raw(l.kind === 'course' ? courseCard(l) : practiceCard(l, m))) : raw(h`
      <div class="card dash"><div class="empty">Полка пуста.<br>Курс меряется уроками, практика — ритмом.</div></div>`)}

    <button class="add" data-act="add">+ Занятие</button>

    ${paused.length ? raw(h`
      <div class="card mute">
        <div class="caps">На паузе</div>
        ${paused.map(l => raw(h`<div class="row between">
          <span class="lab grow ellip">${l.name}</span>
          <button class="q-edit" data-act="resume" data-id="${l.id}">вернуть</button>
        </div>`))}
        <div class="lab">Пауза — нейтральное действие. Курс не пропал и ничего не отнимает.</div>
      </div>`) : ''}
    <div style="height:4px"></div>`;
}

function practiceCard(l, m) {
  const n = lessonMonth(l, m);
  const goal = Number(l.perMonth) || 0;
  const pct = goal ? Math.round((n / goal) * 100) : 0;
  return h`
    <div class="card">
      <div class="row between">
        <div class="grow">
          <div class="ink"><b>${l.name}</b></div>
          <div class="row tight" style="margin-top:3px;flex-wrap:wrap">
            <span class="tag">практика</span>
            ${l.alsoSport ? raw('<span class="tag">и спорт</span>') : ''}
            ${l.place ? raw(h`<span class="lab">${l.place}</span>`) : ''}
          </div>
        </div>
        <button class="q-edit" data-act="edit" data-id="${l.id}">изменить ›</button>
      </div>
      <div class="row">
        <span class="ink"><b>${n}</b>${goal ? raw(h`<span class="lab"> из ${goal} за месяц</span>`) : raw('<span class="lab"> занятий</span>')}</span>
        <span class="grow"></span>
        <span class="lab">${agoLabel(l)}</span>
      </div>
      ${goal ? raw(bar(pct, pct >= 100)) : ''}
      <div class="pills">
        <button class="pill" data-act="mark" data-id="${l.id}">отметить занятие</button>
        ${lessonLast(l) ? raw(h`<button class="pill" data-act="undo" data-id="${l.id}">убрать последнее</button>`) : ''}
        <button class="pill" data-act="pause" data-id="${l.id}">пауза</button>
      </div>
      ${raw(scheduleBlock('lesson', l.id))}
    </div>`;
}

function courseCard(l) {
  const pct = courseProgress(l);
  const open = S.ui.openLesson === l.id;
  const items = l.items || [];
  const left = l.deadline ? diffDays(l.deadline, todayISO()) : null;
  return h`
    <div class="card">
      <div class="row between">
        <div class="grow" data-act="toggle" data-id="${l.id}" style="cursor:pointer">
          <div class="ink"><b>${l.name}</b></div>
          <div class="row tight" style="margin-top:3px;flex-wrap:wrap">
            <span class="tag">курс</span>
            ${l.place ? raw(h`<span class="lab">${l.place}</span>`) : ''}
            ${l.deadline ? raw(h`<span class="lab">${left >= 0 ? `осталось ${left} дн.` : `срок прошёл ${-left} дн. назад`}</span>`) : ''}
          </div>
        </div>
        <button class="q-edit" data-act="edit" data-id="${l.id}">изменить ›</button>
      </div>
      ${pct != null ? raw(h`<div class="row">${raw(bar(pct, pct >= 100))}<span class="lab">${pct}%</span></div>`)
        : raw('<div class="lab">Добавь уроки — из них и посчитается прогресс.</div>')}
      ${open ? raw(h`
        <div class="list">
          ${items.map(i => raw(h`
            <div class="chk-row ${i.done ? 'done' : ''}">
              <button class="check ${i.done ? 'on' : ''}" data-act="item" data-id="${l.id}" data-i="${i.id}">✓</button>
              <span class="grow">${i.title}</span>
              <button class="q-edit" data-act="itemdel" data-id="${l.id}" data-i="${i.id}">×</button>
            </div>`))}
        </div>
        <button class="add" data-act="itemadd" data-id="${l.id}">+ Урок</button>
        ${raw(scheduleBlock('lesson', l.id))}
        <button class="btn-ghost" data-act="pause" data-id="${l.id}">поставить на паузу</button>`) : ''}
    </div>`;
}

// ── шторки ──────────────────────────────────────────────────────
function lessonSheet(lesson) {
  const isNew = !lesson;
  const l = lesson || { id: uid(), name: '', kind: 'practice', perMonth: 4, cost: 0, place: '', deadline: '', alsoSport: false, log: {}, items: [] };

  const wrap = openSheet({
    title: isNew ? 'Новое занятие' : l.name,
    sub: 'курс меряется уроками, практика — ритмом',
    body: [
      field.text('name', 'Название', l.name, 'например, «Вокал»'),
      field.opts('kind', 'Вид', [{ value: 'practice', label: 'Практика' }, { value: 'course', label: 'Курс' }], l.kind),
      `<div data-when="practice">${field.number('perMonth', 'Сколько раз в месяц хочу', l.perMonth || '', { min: 0 })}</div>`,
      `<div data-when="course">${field.date('deadline', 'Срок — если есть', l.deadline || '')}</div>`,
      field.text('place', 'Где или с кем', l.place || '', 'школа, преподаватель, площадка'),
      field.number('cost', 'Стоимость в месяц', l.cost || '', { min: 0 }),
      `<label class="row tight" style="font-size:13px"><input type="checkbox" name="alsoSport" ${l.alsoSport ? 'checked' : ''}> Считать и в спорте</label>`,
      field.note('Занятие само появится строкой в трекере года. Галочка «и в спорте» добавит его в статистику спорта и в потребность «Движение».'),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        const next = {
          ...l, name, kind: v.kind || l.kind,
          perMonth: Math.max(0, Number(v.perMonth) || 0),
          cost: Math.max(0, Number(v.cost) || 0),
          place: (v.place || '').trim(), deadline: v.deadline || '',
          alsoSport: !!v.alsoSport,
        };
        const i = s.lessons.findIndex(x => x.id === l.id);
        if (i >= 0) s.lessons[i] = next; else s.lessons.push(next);
        touchTracker(s);
      });
      close();
      toast(isNew ? 'Добавила на полку' : 'Сохранено');
    },
    danger: isNew ? null : 'Удалить занятие',
    onDanger: (_v, close) => {
      update(s => { s.lessons = s.lessons.filter(x => x.id !== l.id); touchTracker(s); });
      close();
      toast('Убрала вместе с журналом');
    },
  });

  // Поля курса и практики показываем по выбранному виду, а не оба сразу.
  const sync = kind => wrap.querySelectorAll('[data-when]').forEach(el => {
    el.style.display = el.dataset.when === kind ? '' : 'none';
  });
  sync(l.kind);
  wrap.addEventListener('opt', e => { if (e.target.dataset.name === 'kind') sync(e.detail); });
}

export const actions = {
  ...scheduleActions,
  back: () => { location.hash = '#/spheres'; },
  prev: () => update(s => { s.ui.eduMonth = addMonths(cal(), -1); }),
  next: () => update(s => { s.ui.eduMonth = addMonths(cal(), 1); }),
  add: () => lessonSheet(null),
  edit: v => lessonSheet(S.lessons.find(x => x.id === v.id)),
  toggle: v => update(s => { s.ui.openLesson = s.ui.openLesson === v.id ? null : v.id; }),

  /** Отметка занятия: дату можно поставить задним числом, заметка уходит в дневник. */
  mark: v => {
    const l = S.lessons.find(x => x.id === v.id);
    if (!l) return;
    openSheet({
      title: l.name,
      sub: 'занятие прошло',
      body: [
        field.date('date', 'Когда', todayISO()),
        field.area('note', 'Как прошло — необязательно', '', 'что получилось, что было трудно'),
      ].join(''),
      primary: 'Записать',
      onSave: (val, close) => {
        const date = val.date || todayISO();
        if (date > todayISO()) return toast('Будущее пока не отмечаем');
        update(s => {
          const x = s.lessons.find(y => y.id === l.id);
          if (!x) return;
          x.log[date] = 1;
          addXp(XP.quest);
          if ((val.note || '').trim()) addDiary(s, val.note.trim(), l.name, 'lesson');
          touchTracker(s);
        });
        close();
        toast(`${l.name} · записано`);
      },
    });
  },

  undo: v => {
    let name = '';
    update(s => {
      const l = s.lessons.find(x => x.id === v.id);
      if (!l) return;
      const last = Object.keys(l.log).filter(d => l.log[d]).sort().pop();
      if (!last) return;
      delete l.log[last];
      addXp(-XP.quest);
      name = dayShort(last);
      touchTracker(s);
    });
    if (name) toast(`Убрала занятие за ${name}`);
  },

  pause: v => { update(s => { const l = s.lessons.find(x => x.id === v.id); if (l) l.paused = true; }); toast('На паузе — ничего не потеряно'); },
  resume: v => { update(s => { const l = s.lessons.find(x => x.id === v.id); if (l) l.paused = false; }); toast('Вернула на полку'); },

  itemadd: v => openSheet({
    title: 'Урок или модуль',
    body: field.text('title', 'Название', '', 'например, «Модуль 3 · воронки»'),
    primary: 'Добавить',
    onSave: (val, close) => {
      const t = (val.title || '').trim();
      if (!t) return toast('Нужно название');
      update(s => {
        const l = s.lessons.find(x => x.id === v.id);
        if (l) (l.items ||= []).push({ id: uid(), title: t, done: false });
        s.ui.openLesson = v.id;
      });
      close();
    },
  }),

  item: v => {
    let all = false, name = '';
    update(s => {
      const l = s.lessons.find(x => x.id === v.id);
      const it = l?.items.find(x => x.id === v.i);
      if (!it) return;
      it.done = !it.done;
      addXp(it.done ? XP.step : -XP.step);
      all = l.items.every(x => x.done);
      name = l.name;
    });
    if (all) toast(`«${name}» — курс пройден ✦`);
  },

  itemdel: v => update(s => {
    const l = s.lessons.find(x => x.id === v.id);
    if (l) l.items = l.items.filter(x => x.id !== v.i);
  }),
};
