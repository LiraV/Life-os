// «Спорт»: тренировки и упражнения с рекордами.
//
// Тренировка по умолчанию планируется заранее и живёт на своём дне; можно
// и записать постфактум. Упражнение меряется не количеством походов, а
// результатом — и у шпагата «лучше» значит меньше, а не больше.

import { S, update, uid, XP, addXp, addDiary, touchTracker } from '../store.js';
import { todayISO, addDays, dayShort, monthKey, diffDays } from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import {
  kinds, kindById, kindName, workoutsOn, exerciseById, exerciseHistory, exerciseRecord,
  liveLessons, liveGoals, isCounter, goalChain,
} from '../selectors.js';

const TABS = [['plan', 'Тренировки'], ['ex', 'Упражнения'], ['kinds', 'Виды']];
const goalTitle = id => (liveGoals().find(g => g.id === id) || {}).title || '';
const tab = () => S.ui.sportTab || 'plan';

export function render() {
  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ сферы</button>
      <span class="tag">статы</span>
    </div>
    <div class="title">Спорт</div>
    <div class="pills">${TABS.map(([k, l]) => raw(h`<button class="pill ${tab() === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`))}</div>
    ${raw({ plan: planView, ex: exView, kinds: kindsView }[tab()]())}
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
            ${w.goalId && goalTitle(w.goalId) ? raw(h`<span class="tag">→ ${goalTitle(w.goalId)}</span>`) : ''}
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
              <div class="lab">${ex.unit} · ${{ up: 'больше лучше', down: 'меньше лучше', both: 'важны оба края' }[ex.dir]}</div>
            </div>
            <button class="q-edit" data-act="exedit" data-id="${ex.id}">изменить ›</button>
          </div>
          ${r ? raw(h`
            <div class="row between">
              <span class="ink"><b>${r.last}</b><span class="lab"> ${ex.unit} · ${dayShort(r.lastDate)}</span></span>
              <span class="lab">${ex.dir === 'both' ? '' : 'рекорд '}${r.best} ✦</span>
            </div>
            <div class="lab">максимум ${r.max} · минимум ${r.min} · записей ${r.count}</div>
            ${r.was != null ? raw(h`<div class="lab">${r.improved ? 'лучше' : 'слабее'}, чем месяц назад: было ${r.was}</div>`) : ''}`)
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

// ── свои виды тренировок ────────────────────────────────────────
function kindsView() {
  return h`
    ${kinds().map(k => raw(h`
      <div class="card">
        <div class="row between">
          <div class="ink grow"><b>${k.name}</b></div>
          <button class="q-edit" data-act="kindedit" data-id="${k.id}">изменить ›</button>
        </div>
        ${k.sets?.length ? raw(h`
          <div class="list">
            ${k.sets.map(x => {
              const ex = exerciseById(x.exerciseId);
              return raw(h`<div class="row between">
                <span class="lab grow ellip">${ex ? ex.name : 'упражнение'}</span>
                <span class="lab">${x.reps > 1 ? `${x.reps} × ` : ''}${x.value || '—'}${ex?.unit ? ' ' + ex.unit : ''}
                  <button class="q-edit" data-act="kindsetdel" data-id="${k.id}" data-s="${x.id}">×</button></span>
              </div>`);
            })}
          </div>`) : raw('<div class="lab">без готового набора</div>')}
        <button class="add" data-act="kindsetadd" data-id="${k.id}">+ Упражнение в набор</button>
      </div>`))}
    <button class="add" data-act="kindadd">+ Свой вид тренировки</button>
    <div class="card mute"><div class="lab">Свой вид — это и название, и готовый набор упражнений: «Зал А · ноги»
      подставится сам, когда выберешь его в новой тренировке.</div></div>`;
}

// ── шторки ──────────────────────────────────────────────────────
export function workoutSheet(workout, date) {
  const isNew = !workout;
  const w = workout || { id: uid(), date: date || todayISO(), kind: kinds()[0]?.id || 'gym', title: '', lessonId: '', goalId: '', done: false, sets: [], note: '' };
  const lessons = liveLessons().filter(l => l.kind === 'practice');
  // К целям-счётчикам тренировка прибавляется сама: «сходить в зал 4 раза».
  const goals = liveGoals().filter(isCounter);

  openSheet({
    title: isNew ? 'Тренировка' : (w.title || kindName(w.kind)),
    sub: isNew ? 'по умолчанию — план на день; можно отметить сразу как сделанную' : dayShort(w.date),
    body: [
      field.select('kind', 'Что за тренировка', kinds().map(k => ({ value: k.id, label: k.name })), w.kind),
      field.text('title', 'Название — необязательно', w.title, 'например, «Зал А · ноги»'),
      field.date('date', 'Когда', w.date),
      lessons.length
        ? field.select('lessonId', 'Занятие с полки', [{ value: '', label: 'не связано' }, ...lessons.map(l => ({ value: l.id, label: l.name }))], w.lessonId || '')
        : '',
      lessons.length ? field.note('Связанная тренировка засчитает занятие и не удвоит статистику.') : '',
      goals.length
        ? field.select('goalId', 'Считать в цель', [{ value: '', label: 'не считать' },
            ...goals.map(g => ({ value: g.id, label: `${g.title} · ${counterLabel(g)}` }))], w.goalId || '')
        : '',
      goals.length ? field.note('Выполненная тренировка прибавит единицу к счётчику цели, снятая — убавит.') : '',
      `<label class="row tight" style="font-size:13px"><input type="checkbox" name="done" ${w.done ? 'checked' : ''}> Уже сделала</label>`,
      field.area('note', 'Заметка', w.note || ''),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      update(s => {
        const prev = s.sport.workouts.find(x => x.id === w.id);
        const next = {
          ...w, kind: v.kind || w.kind, title: (v.title || '').trim(),
          date: v.date || w.date, lessonId: v.lessonId || '', goalId: v.goalId || '',
          note: (v.note || '').trim(), done: !!v.done,
        };
        // У своего вида есть готовый набор упражнений — подставляем при создании.
        if (!prev && !next.sets.length) {
          const k = s.sport.kinds.find(x => x.id === next.kind);
          next.sets = (k?.sets || []).map(x => ({ ...x, id: uid() }));
        }
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

const counterLabel = g => `${Number(g.current) || 0}/${Number(g.target) || 0}${g.unit ? ' ' + g.unit : ''}`;

/** Выполненная тренировка засчитывает занятие, цель и опыт — в одном месте. */
export function applyDone(s, w, undo = false) {
  addXp(undo ? -XP.quest : XP.quest);
  if (w.lessonId) {
    const l = s.lessons.find(x => x.id === w.lessonId);
    if (l) { if (undo) delete l.log[w.date]; else l.log[w.date] = 1; }
  }
  if (w.goalId) {
    const g = s.goals.find(x => x.id === w.goalId);
    if (g) g.current = Math.max(0, (Number(g.current) || 0) + (undo ? -1 : 1));
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

function kindSheet(kind) {
  const isNew = !kind;
  const k = kind || { id: uid(), name: '', sets: [] };
  openSheet({
    title: isNew ? 'Свой вид тренировки' : k.name,
    sub: 'например, «Зал А · ноги» или «Пилатес»',
    body: [
      field.text('name', 'Название', k.name, 'как называешь про себя'),
      isNew ? field.note('Набор упражнений добавишь на карточке — он будет подставляться в новые тренировки.') : '',
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        const i = s.sport.kinds.findIndex(x => x.id === k.id);
        if (i >= 0) s.sport.kinds[i].name = name; else s.sport.kinds.push({ ...k, name });
      });
      close();
    },
    danger: isNew ? null : 'Удалить вид',
    onDanger: (_v, close) => {
      const used = S.sport.workouts.some(w => w.kind === k.id);
      if (used) { close(); return toast('Этот вид уже стоит у тренировок — сначала смени его там'); }
      update(s => { s.sport.kinds = s.sport.kinds.filter(x => x.id !== k.id); });
      close();
      toast('Убрала');
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
      field.opts('dir', 'Что считается ростом', [
        { value: 'up', label: 'Больше лучше' },
        { value: 'down', label: 'Меньше лучше' },
        { value: 'both', label: 'Важны оба' },
      ], e.dir),
      field.note('«Меньше лучше» — для расстояния до пола в шпагате: иначе прогресс считался бы наоборот. «Важны оба» — когда интересны и максимум, и минимум; максимум и минимум показываются в любом случае, направление решает лишь, что считать рекордом.'),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        const next = { ...e, name, unit: (v.unit || 'раз').trim(), dir: ['up', 'down', 'both'].includes(v.dir) ? v.dir : 'up' };
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

  kindadd: () => kindSheet(null),
  kindedit: v => kindSheet(kindById(v.id)),
  kindsetadd: v => {
    const list = S.sport.exercises;
    if (!list.length) return toast('Сначала заведи упражнение');
    openSheet({
      title: 'Упражнение в набор',
      sub: kindName(v.id),
      body: [
        field.select('exerciseId', 'Что', list.map(e => ({ value: e.id, label: `${e.name}, ${e.unit}` })), list[0].id),
        field.number('value', 'Ориентир — необязательно', '', { min: 0 }),
        field.number('reps', 'Подходов', 1, { min: 1 }),
      ].join(''),
      primary: 'Добавить',
      onSave: (val, close) => {
        update(s => {
          const k = s.sport.kinds.find(x => x.id === v.id);
          if (k) (k.sets ||= []).push({
            id: uid(), exerciseId: val.exerciseId,
            value: val.value === '' ? '' : Number(val.value), reps: Math.max(1, Number(val.reps) || 1),
          });
        });
        close();
      },
    });
  },
  kindsetdel: v => update(s => {
    const k = s.sport.kinds.find(x => x.id === v.id);
    if (k) k.sets = (k.sets || []).filter(x => x.id !== v.s);
  }),

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
