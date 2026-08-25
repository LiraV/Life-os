// «Спорт»: тренировки и упражнения с рекордами.
//
// Тренировка по умолчанию планируется заранее и живёт на своём дне; можно
// и записать постфактум. Упражнение меряется не количеством походов, а
// результатом — и у шпагата «лучше» значит меньше, а не больше.

import { S, update, uid, XP, addXp, addDiary, touchTracker } from '../store.js';
import { todayISO, addDays, dayShort, monthKey, diffDays } from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import {
  KINDS, kindName, workoutsOn, exerciseById, exerciseHistory, exerciseRecord,
  liveLessons,
} from '../selectors.js';

const TABS = [['plan', 'Тренировки'], ['ex', 'Упражнения']];
const tab = () => S.ui.sportTab || 'plan';

export function render() {
  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ сферы</button>
      <span class="tag">статы</span>
    </div>
    <div class="title">Спорт</div>
    <div class="pills">${TABS.map(([k, l]) => raw(h`<button class="pill ${tab() === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`))}</div>
    ${raw(tab() === 'plan' ? planView() : exView())}
    <div style="height:4px"></div>`;
}

// ── тренировки ──────────────────────────────────────────────────
function planView() {
  const t = todayISO();
  const all = [...S.sport.workouts].sort((a, b) => b.date.localeCompare(a.date));
  const ahead = all.filter(w => !w.done && w.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const past = all.filter(w => w.done || w.date < t).slice(0, 12);

  return h`
    <button class="add" data-act="add">+ Тренировка</button>

    ${ahead.length ? raw(h`
      <div class="caps">Впереди</div>
      ${ahead.map(w => raw(workoutCard(w)))}`) : ''}

    ${past.length ? raw(h`
      <div class="caps">Было</div>
      ${past.map(w => raw(workoutCard(w)))}`)
    : (!ahead.length ? raw(h`<div class="card dash"><div class="empty">Тренировок пока нет.<br>Запланируй ближайшую — или запиши ту, что уже была.</div></div>`) : '')}`;
}

function workoutCard(w) {
  const late = !w.done && w.date < todayISO();
  const sets = w.sets || [];
  return h`
    <div class="card ${w.done ? 'mute' : ''}">
      <div class="row between">
        <div class="grow" data-act="open" data-id="${w.id}" style="cursor:pointer">
          <div class="ink"><b>${w.title || kindName(w.kind)}</b></div>
          <div class="row tight" style="margin-top:3px;flex-wrap:wrap">
            <span class="tag">${kindName(w.kind)}</span>
            <span class="lab">${dayShort(w.date)}${w.date === todayISO() ? ' · сегодня' : ''}</span>
            ${late ? raw('<span class="tag boss">не отмечена</span>') : ''}
            ${w.done ? raw('<span class="lab">✓ сделана</span>') : ''}
          </div>
        </div>
        ${!w.done ? raw(h`<button class="check" data-act="done" data-id="${w.id}" aria-label="Отметить">✓</button>`) : ''}
      </div>
      ${sets.length ? raw(h`
        <div class="list">
          ${sets.map(x => {
            const ex = exerciseById(x.exerciseId);
            return raw(h`<div class="row between">
              <span class="lab grow ellip">${ex ? ex.name : 'упражнение'}</span>
              <span class="lab">${x.reps > 1 ? `${x.reps} × ` : ''}${x.value || '—'}${ex?.unit ? ' ' + ex.unit : ''}</span>
            </div>`);
          })}
        </div>`) : raw('<div class="lab">упражнения не добавлены</div>')}
      <button class="add" data-act="setadd" data-id="${w.id}">+ Упражнение в тренировку</button>
    </div>`;
}

// ── упражнения ──────────────────────────────────────────────────
function exView() {
  const list = S.sport.exercises;
  return h`
    ${list.map(ex => {
      const r = exerciseRecord(ex);
      return raw(h`
        <div class="card">
          <div class="row between">
            <div class="grow" data-act="exopen" data-id="${ex.id}" style="cursor:pointer">
              <div class="ink"><b>${ex.name}</b></div>
              <div class="lab">${ex.unit}${ex.dir === 'down' ? ' · меньше лучше' : ''}</div>
            </div>
            <button class="q-edit" data-act="exedit" data-id="${ex.id}">изменить ›</button>
          </div>
          ${r ? raw(h`
            <div class="row between">
              <span class="ink"><b>${r.last}</b><span class="lab"> ${ex.unit} · ${dayShort(r.lastDate)}</span></span>
              <span class="lab">рекорд ${r.best} ✦</span>
            </div>
            ${r.was != null ? raw(h`<div class="lab">${r.improved ? 'лучше' : 'слабее'}, чем месяц назад: было ${r.was}</div>`)
              : raw(h`<div class="lab">записей: ${r.count}</div>`)}`)
          : raw('<div class="lab">результатов пока нет</div>')}
          <button class="add" data-act="exlog" data-id="${ex.id}">+ Результат</button>
          ${S.ui.openEx === ex.id ? raw(historyBlock(ex)) : ''}
        </div>`);
    })}
    <button class="add" data-act="exadd">+ Упражнение</button>
    <div class="card mute"><div class="lab">Результат можно записать и без тренировки — например, померить шпагат дома.
      Такая запись создаёт короткую тренировку «замер», чтобы история была одна.</div></div>`;
}

function historyBlock(ex) {
  const hist = exerciseHistory(ex.id).slice(-10).reverse();
  if (!hist.length) return h`<div class="lab">истории пока нет</div>`;
  return h`
    <div class="list" style="border-top:1px solid var(--track); padding-top:7px">
      ${hist.map(x => raw(h`<div class="row between">
        <span class="lab">${dayShort(x.date)}</span>
        <span class="lab">${x.reps > 1 ? `${x.reps} × ` : ''}${x.value} ${ex.unit}</span>
      </div>`))}
    </div>`;
}

// ── шторки ──────────────────────────────────────────────────────
export function workoutSheet(workout, date) {
  const isNew = !workout;
  const w = workout || { id: uid(), date: date || todayISO(), kind: 'gym', title: '', lessonId: '', done: false, sets: [], note: '' };
  const lessons = liveLessons().filter(l => l.kind === 'practice');

  openSheet({
    title: isNew ? 'Тренировка' : (w.title || kindName(w.kind)),
    sub: isNew ? 'по умолчанию — план на день; можно отметить сразу как сделанную' : dayShort(w.date),
    body: [
      field.opts('kind', 'Что за тренировка', KINDS.map(k => ({ value: k.id, label: k.name })), w.kind),
      field.text('title', 'Название — необязательно', w.title, 'например, «Зал А · ноги»'),
      field.date('date', 'Когда', w.date),
      lessons.length
        ? field.select('lessonId', 'Занятие с полки', [{ value: '', label: 'не связано' }, ...lessons.map(l => ({ value: l.id, label: l.name }))], w.lessonId || '')
        : '',
      lessons.length ? field.note('Связанная тренировка засчитает занятие и не удвоит статистику.') : '',
      `<label class="row tight" style="font-size:13px"><input type="checkbox" name="done" ${w.done ? 'checked' : ''}> Уже сделала</label>`,
      field.area('note', 'Заметка', w.note || ''),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      update(s => {
        const prev = s.sport.workouts.find(x => x.id === w.id);
        const next = {
          ...w, kind: v.kind || w.kind, title: (v.title || '').trim(),
          date: v.date || w.date, lessonId: v.lessonId || '', note: (v.note || '').trim(), done: !!v.done,
        };
        const i = s.sport.workouts.findIndex(x => x.id === w.id);
        if (i >= 0) s.sport.workouts[i] = next; else s.sport.workouts.push(next);
        if (next.done && !prev?.done) applyDone(s, next);
      });
      close();
      toast(isNew ? 'Добавила' : 'Сохранено');
    },
    danger: isNew ? null : 'Удалить тренировку',
    onDanger: (_v, close) => {
      update(s => { s.sport.workouts = s.sport.workouts.filter(x => x.id !== w.id); touchTracker(s); });
      close();
    },
  });
}

/** Выполненная тренировка засчитывает занятие и даёт опыт — в одном месте. */
function applyDone(s, w) {
  addXp(XP.quest);
  if (w.lessonId) {
    const l = s.lessons.find(x => x.id === w.lessonId);
    if (l) l.log[w.date] = 1;
  }
  touchTracker(s);
}

function setSheet(workoutId, exId) {
  const w = S.sport.workouts.find(x => x.id === workoutId);
  if (!w) return;
  const list = S.sport.exercises;
  if (!list.length) return toast('Сначала заведи упражнение');

  openSheet({
    title: 'Упражнение в тренировку',
    body: [
      field.select('exerciseId', 'Что', list.map(e => ({ value: e.id, label: `${e.name}, ${e.unit}` })), exId || list[0].id),
      field.number('value', 'Результат', '', { min: 0 }),
      field.number('reps', 'Сколько подходов', 1, { min: 1 }),
    ].join(''),
    primary: 'Добавить',
    onSave: (v, close) => {
      const value = Number(v.value);
      if (!Number.isFinite(value)) return toast('Введи результат');
      update(s => {
        const x = s.sport.workouts.find(y => y.id === workoutId);
        if (x) (x.sets ||= []).push({ id: uid(), exerciseId: v.exerciseId, value, reps: Math.max(1, Number(v.reps) || 1) });
        touchTracker(s);
      });
      close();
    },
  });
}

function exSheet(ex) {
  const isNew = !ex;
  const e = ex || { id: uid(), name: '', unit: 'раз', dir: 'up' };
  openSheet({
    title: isNew ? 'Упражнение' : e.name,
    body: [
      field.text('name', 'Название', e.name, 'например, «Планка»'),
      field.text('unit', 'В чём меряем', e.unit, 'сек, раз, кг, см'),
      field.opts('dir', 'Что считается ростом', [{ value: 'up', label: 'Больше лучше' }, { value: 'down', label: 'Меньше лучше' }], e.dir),
      field.note('«Меньше лучше» — для расстояния до пола в шпагате и подобного: иначе прогресс считался бы наоборот.'),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        const next = { ...e, name, unit: (v.unit || 'раз').trim(), dir: v.dir === 'down' ? 'down' : 'up' };
        const i = s.sport.exercises.findIndex(x => x.id === e.id);
        if (i >= 0) s.sport.exercises[i] = next; else s.sport.exercises.push(next);
      });
      close();
    },
    danger: isNew ? null : 'Удалить упражнение',
    onDanger: (_v, close) => {
      update(s => { s.sport.exercises = s.sport.exercises.filter(x => x.id !== e.id); });
      close();
      toast('Убрала, записи в тренировках остались');
    },
  });
}

export const actions = {
  back: () => { location.hash = '#/spheres'; },
  tab: v => update(s => { s.ui.sportTab = v.v; }),

  add: () => workoutSheet(null),
  open: v => workoutSheet(S.sport.workouts.find(x => x.id === v.id)),
  setadd: v => setSheet(v.id),

  done: v => {
    let name = '';
    update(s => {
      const w = s.sport.workouts.find(x => x.id === v.id);
      if (!w || w.done) return;
      w.done = true;
      name = w.title || kindName(w.kind);
      applyDone(s, w);
    });
    if (name) toast(`${name} · засчитана`);
  },

  exadd: () => exSheet(null),
  exedit: v => exSheet(exerciseById(v.id)),
  exopen: v => update(s => { s.ui.openEx = s.ui.openEx === v.id ? null : v.id; }),

  /** Результат без тренировки: создаём короткий «замер», чтобы история была одна. */
  exlog: v => {
    const ex = exerciseById(v.id);
    if (!ex) return;
    openSheet({
      title: ex.name,
      sub: `результат в ${ex.unit}`,
      body: [
        field.number('value', 'Сколько', '', { min: 0 }),
        field.number('reps', 'Подходов', 1, { min: 1 }),
        field.date('date', 'Когда', todayISO()),
      ].join(''),
      primary: 'Записать',
      onSave: (val, close) => {
        const value = Number(val.value);
        if (!Number.isFinite(value)) return toast('Введи результат');
        update(s => {
          const date = val.date || todayISO();
          let w = s.sport.workouts.find(x => x.date === date && x.measure);
          if (!w) {
            // Замер помечаем отдельно: он не тренировка и не должен идти в статистику.
            w = { id: uid(), date, kind: 'other', title: 'Замер', measure: true, lessonId: '', done: true, sets: [], note: '' };
            s.sport.workouts.push(w);
          }
          w.sets.push({ id: uid(), exerciseId: ex.id, value, reps: Math.max(1, Number(val.reps) || 1) });
          touchTracker(s);
        });
        close();
        toast('Записала');
      },
    });
  },
};
