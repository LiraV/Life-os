// «Учёба»: заведение → предмет → этапы. Диплом здесь не особая сущность,
// а обычный предмет с длинной цепочкой этапов.
//
// Этап живёт на доске и двигается по стадиям. Стадия «у преподавателя»
// считает дни ожидания: в учёбе больно не «сделать», а «отправила и жду».

import { S, update, uid, XP, addXp } from '../store.js';
import { todayISO, dayShort, diffDays, monthKey, weekKey } from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import {
  STAGES, stageOf, stageIndex, livePlaces, liveSubjects, subjectsOf, subjectById,
  tasksOf, liveTasks, taskSubject, waitingDays, subjectProgress, studyNow,
} from '../selectors.js';

const TABS = [['now', 'Сейчас'], ['board', 'Доска'], ['subjects', 'Предметы']];
const tab = () => S.ui.studyTab || 'now';

const dueLabel = due => {
  if (!due) return '';
  const d = diffDays(due, todayISO());
  if (d < 0) return `просрочено на ${-d} дн.`;
  if (d === 0) return 'сегодня';
  if (d === 1) return 'завтра';
  return `через ${d} дн.`;
};

export function render() {
  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ сферы</button>
      <span class="tag">курсы</span>
    </div>
    <div class="title">Учёба</div>
    <div class="pills">${TABS.map(([k, l]) => raw(h`<button class="pill ${tab() === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`))}</div>
    ${raw({ now: nowView, board: boardView, subjects: subjectsView }[tab()]())}
    <div style="height:4px"></div>`;
}

// ── сейчас ──────────────────────────────────────────────────────
function nowView() {
  const n = studyNow();
  if (!liveSubjects().length) {
    return h`<div class="card dash">
      <div class="empty">Пока нет ни одного предмета.<br>Заведение, внутри предметы, диплом — такой же предмет.</div>
      <button class="add" data-act="placeadd">+ Заведение</button></div>`;
  }
  if (!n.open.length) {
    return h`<div class="card"><div class="empty">Ничего не висит. Всё сдано ✦</div></div>`;
  }

  return h`
    ${raw(block('Просрочено', n.overdue, true))}
    ${n.waiting.length ? raw(h`
      <div class="card">
        <div class="caps">Ждёт ответа</div>
        ${n.waiting.map(t => raw(h`
          <div class="row between" data-act="open" data-id="${t.id}" style="cursor:pointer">
            <div class="grow">
              <div class="ink">${t.title}</div>
              <div class="lab">${taskSubject(t).name}</div>
            </div>
            <span class="lab">${waitingDays(t) === 0 ? 'сегодня' : `${waitingDays(t)} дн.`}</span>
          </div>`))}
        <div class="lab">Если ответа нет неделю, стоит написать самой — это не про вас, это про них.</div>
      </div>`) : ''}
    ${raw(block('Ближайшие сроки', n.due))}
    ${raw(block('В работе', n.inWork.filter(t => !n.overdue.includes(t) && !n.due.includes(t))))}`;
}

function block(title, list, hot) {
  if (!list.length) return '';
  return h`
    <div class="card">
      <div class="caps">${title}</div>
      ${list.map(t => raw(h`
        <div class="row between" data-act="open" data-id="${t.id}" style="cursor:pointer">
          <div class="grow">
            <div class="ink">${t.title}</div>
            <div class="lab">${taskSubject(t).name} · ${stageOf(t.stage).short}</div>
          </div>
          ${t.due ? raw(h`<span class="tag ${hot ? 'boss' : ''}">${dueLabel(t.due)}</span>`) : ''}
        </div>`))}
    </div>`;
}

// ── доска ───────────────────────────────────────────────────────
function boardView() {
  const tasks = liveTasks();
  if (!tasks.length) {
    return h`<div class="card dash"><div class="empty">Этапов пока нет.<br>Добавь их внутри предмета.</div>
      <button class="add" data-act="tab" data-v="subjects">К предметам</button></div>`;
  }
  return h`
    <div class="board">
      ${STAGES.map(st => {
        const list = tasks.filter(t => t.stage === st.id);
        return raw(h`
          <div class="board-col">
            <div class="board-head">${st.name}<span class="lab"> ${list.length}</span></div>
            ${list.length ? list.map(t => raw(card(t))) : raw('<div class="lab" style="padding:4px">пусто</div>')}
          </div>`);
      })}
    </div>
    <div class="lab" style="padding:0 4px">Колонки листаются вбок. «Дальше ›» двигает этап на одну стадию, тап по карточке — правка.</div>`;
}

function card(t) {
  const w = waitingDays(t);
  const last = t.stage === 'done';
  return h`
    <div class="board-card ${last ? 'done' : ''}">
      <div data-act="open" data-id="${t.id}" style="cursor:pointer">
        <div class="ink">${t.title}</div>
        <div class="lab">${taskSubject(t).name}</div>
        ${t.due ? raw(h`<div class="lab">${dueLabel(t.due)}</div>`) : ''}
        ${w != null ? raw(h`<div class="lab">ждёт ${w} дн.</div>`) : ''}
      </div>
      ${!last ? raw(h`<button class="pill" data-act="next" data-id="${t.id}">дальше ›</button>`) : ''}
    </div>`;
}

// ── предметы ────────────────────────────────────────────────────
function subjectsView() {
  const places = livePlaces();
  return h`
    ${places.map(pl => {
      const subs = subjectsOf(pl.id);
      return raw(h`
        <div class="card">
          <div class="row between">
            <div class="ink grow"><b>${pl.name}</b></div>
            <button class="q-edit" data-act="placeedit" data-id="${pl.id}">изменить ›</button>
          </div>
          ${subs.length ? subs.map(sb => {
            const pct = subjectProgress(sb.id);
            const open = tasksOf(sb.id).filter(t => t.stage !== 'done').length;
            return raw(h`
              <div class="row between" data-act="subject" data-id="${sb.id}" style="cursor:pointer">
                <div class="grow">
                  <div class="ink">${sb.name}</div>
                  <div class="lab">${open ? `${open} в работе` : 'всё закрыто'}${sb.teacher ? ` · ${sb.teacher}` : ''}${sb.grade ? ` · оценка ${sb.grade}` : ''}</div>
                </div>
                <span class="lab">${pct == null ? '' : pct + '%'}</span>
              </div>`);
          }) : raw('<div class="lab">предметов пока нет</div>')}
          <button class="add" data-act="subjectadd" data-id="${pl.id}">+ Предмет</button>
        </div>`);
    })}
    <button class="add" data-act="placeadd">+ Заведение</button>
    ${S.ui.studySubject ? raw(subjectCard(S.ui.studySubject)) : ''}`;
}

function subjectCard(id) {
  const sb = subjectById(id);
  if (!sb) return '';
  const list = tasksOf(id);
  return h`
    <div class="card">
      <div class="row between">
        <div class="ink grow"><b>${sb.name}</b></div>
        <button class="q-edit" data-act="subjectedit" data-id="${sb.id}">изменить ›</button>
      </div>
      ${list.length ? raw(h`<div class="list">
        ${list.map(t => raw(h`
          <div class="row between" data-act="open" data-id="${t.id}" style="cursor:pointer">
            <span class="ink grow ellip">${t.title}</span>
            <span class="lab">${stageOf(t.stage).short}${t.due ? ` · ${dayShort(t.due)}` : ''}</span>
          </div>`))}
      </div>`) : raw('<div class="lab">этапов пока нет</div>')}
      <button class="add" data-act="taskadd" data-id="${sb.id}">+ Этап</button>
    </div>`;
}

// ── шторки ──────────────────────────────────────────────────────
function taskSheet(task, subjectId) {
  const isNew = !task;
  const t = task || { id: uid(), subjectId, title: '', stage: 'todo', due: '', note: '' };
  const subs = liveSubjects();

  openSheet({
    title: isNew ? 'Этап' : t.title,
    sub: isNew ? '' : `${taskSubject(t).name} · ${stageOf(t.stage).name}`,
    body: [
      field.text('title', 'Что сделать', t.title, 'например, «Глава 2 · черновик»'),
      subs.length > 1 ? field.select('subjectId', 'Предмет', subs.map(x => ({ value: x.id, label: x.name })), t.subjectId) : '',
      field.select('stage', 'Стадия', STAGES.map(x => ({ value: x.id, label: x.name })), t.stage),
      field.date('due', 'Срок — если есть', t.due || ''),
      field.area('note', 'Заметка', t.note || ''),
      isNew ? '' : field.note('Этап можно вынести выше: сделать целью месяца или боссом недели — тогда он попадёт в Планы и будет двигать общий прогресс.'),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Нужно название');
      update(s => {
        const prev = s.study.tasks.find(x => x.id === t.id);
        const stage = v.stage || t.stage;
        const next = {
          ...t, title, subjectId: v.subjectId || t.subjectId, stage,
          due: v.due || '', note: (v.note || '').trim(),
          // Отсчёт ожидания начинается в момент отправки, а не при любой правке.
          stageAt: stage === 'sent' && (!prev || prev.stage !== 'sent') ? todayISO() : (prev?.stageAt || t.stageAt || null),
        };
        const i = s.study.tasks.findIndex(x => x.id === t.id);
        if (i >= 0) s.study.tasks[i] = next; else s.study.tasks.push(next);
      });
      close();
      toast(isNew ? 'Этап добавлен' : 'Сохранено');
    },
    secondary: isNew ? null : 'Сделать целью месяца',
    onSecondary: (_v, close) => {
      update(s => {
        s.goals.push({
          id: uid(), title: t.title, horizon: 'month', period: monthKey(todayISO()),
          steps: [], slots: [], parentId: '', sphere: 'study', deadline: t.due || '', studyTaskId: t.id,
        });
      });
      close();
      toast('Теперь это цель месяца — видно в Планах');
    },
    danger: isNew ? null : 'Удалить этап',
    onDanger: (_v, close) => {
      update(s => { s.study.tasks = s.study.tasks.filter(x => x.id !== t.id); });
      close();
    },
  });
}

export const actions = {
  back: () => { location.hash = '#/spheres'; },
  tab: v => update(s => { s.ui.studyTab = v.v; }),

  placeadd: () => openSheet({
    title: 'Заведение',
    sub: 'вуз, школа, программа',
    body: field.text('name', 'Название', '', 'например, «EU Business School»'),
    primary: 'Добавить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => { s.study.places.push({ id: uid(), name }); s.ui.studyTab = 'subjects'; });
      close();
    },
  }),
  placeedit: v => {
    const pl = livePlaces().find(x => x.id === v.id);
    if (!pl) return;
    openSheet({
      title: pl.name,
      body: field.text('name', 'Название', pl.name),
      onSave: (val, close) => {
        update(s => { const x = s.study.places.find(y => y.id === pl.id); if (x) x.name = (val.name || '').trim() || x.name; });
        close();
      },
      danger: 'Удалить вместе с предметами',
      onDanger: (_val, close) => {
        update(s => {
          const subs = s.study.subjects.filter(x => x.placeId === pl.id).map(x => x.id);
          s.study.tasks = s.study.tasks.filter(t => !subs.includes(t.subjectId));
          s.study.subjects = s.study.subjects.filter(x => x.placeId !== pl.id);
          s.study.places = s.study.places.filter(x => x.id !== pl.id);
        });
        close();
        toast('Удалила');
      },
    });
  },

  subjectadd: v => subjectSheet(null, v.id),
  subjectedit: v => subjectSheet(subjectById(v.id)),
  subject: v => update(s => { s.ui.studySubject = s.ui.studySubject === v.id ? null : v.id; }),

  taskadd: v => taskSheet(null, v.id),
  open: v => taskSheet(S.study.tasks.find(x => x.id === v.id)),

  /** «Дальше» двигает на одну стадию и отмечает момент отправки. */
  next: v => {
    let done = false, title = '';
    update(s => {
      const t = s.study.tasks.find(x => x.id === v.id);
      if (!t) return;
      const i = Math.min(STAGES.length - 1, stageIndex(t.stage) + 1);
      t.stage = STAGES[i].id;
      if (t.stage === 'sent') t.stageAt = todayISO();
      if (t.stage === 'done') { done = true; title = t.title; addXp(XP.step); }
    });
    if (done) toast(`«${title}» сдано ✦`);
  },
};

function subjectSheet(subject, placeId) {
  const isNew = !subject;
  const sb = subject || { id: uid(), placeId, name: '', teacher: '', from: '', to: '', grade: '' };
  openSheet({
    title: isNew ? 'Предмет' : sb.name,
    sub: 'диплом — такой же предмет, просто с длинной цепочкой этапов',
    body: [
      field.text('name', 'Название', sb.name, 'например, «История моды» или «Диплом»'),
      field.text('teacher', 'Преподаватель', sb.teacher || ''),
      field.date('from', 'Начало', sb.from || ''),
      field.date('to', 'Конец', sb.to || ''),
      field.text('grade', 'Оценка', sb.grade || '', 'когда появится'),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        const next = { ...sb, name, teacher: (v.teacher || '').trim(), from: v.from || '', to: v.to || '', grade: (v.grade || '').trim() };
        const i = s.study.subjects.findIndex(x => x.id === sb.id);
        if (i >= 0) s.study.subjects[i] = next; else s.study.subjects.push(next);
        s.ui.studySubject = next.id;
      });
      close();
    },
    danger: isNew ? null : 'Удалить предмет',
    onDanger: (_v, close) => {
      update(s => {
        s.study.tasks = s.study.tasks.filter(t => t.subjectId !== sb.id);
        s.study.subjects = s.study.subjects.filter(x => x.id !== sb.id);
      });
      close();
      toast('Удалила вместе с этапами');
    },
  });
}
