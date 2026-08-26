// «Спорт»: шаблоны тренировок и упражнения с рекордами.
//
// Дат тут нет: в сфере лежат только заготовки — название и состав. Сама
// тренировка заводится на экране «День» и может подтянуть шаблон.
// Упражнение меряется не количеством походов, а результатом — и у шпагата
// «лучше» значит меньше, а не больше.

import { S, update, uid, XP, addXp, addDiary, touchTracker } from '../store.js';
import { todayISO, addDays, dayShort, monthKey, diffDays } from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import { scheduleBlock, scheduleActions } from '../schedule.js';
import {
  templates, templateById, templateName, exerciseById, exerciseHistory, exerciseRecord,
  liveLessons, liveGoals, isCounter, sportTags, tagMonthCount,
} from '../selectors.js';

const TABS = [['tpl', 'Шаблоны'], ['ex', 'Упражнения']];
const tab = () => (S.ui.sportTab === 'ex' ? 'ex' : 'tpl');

export function render() {
  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ сферы</button>
      <span class="tag">статы</span>
    </div>
    <div class="title">Спорт</div>
    <div class="pills">${TABS.map(([k, l]) => raw(h`<button class="pill ${tab() === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`))}</div>
    ${raw(tab() === 'ex' ? exView() : tplView())}
    <div style="height:4px"></div>`;
}

// ── шаблоны ─────────────────────────────────────────────────────
function tplView() {
  const list = templates();
  return h`
    ${list.map(t => raw(h`
      <div class="card">
        <div class="row between">
          <div class="ink grow"><b>${t.name}</b></div>
          <button class="q-edit" data-act="tpledit" data-id="${t.id}">изменить ›</button>
        </div>
        ${t.sets?.length ? raw(h`
          <div class="list">
            ${t.sets.map(x => {
              const ex = exerciseById(x.exerciseId);
              return raw(h`<button class="row between tpl-set" data-act="tplsetedit" data-id="${t.id}" data-s="${x.id}">
                <span class="lab grow ellip">${ex ? ex.name : 'упражнение'}</span>
                <span class="lab">${x.reps > 1 ? `${x.reps} × ` : ''}${x.value || '—'}${ex?.unit ? ' ' + ex.unit : ''} ›</span>
              </button>`);
            })}
          </div>`) : raw('<div class="lab">упражнений пока нет</div>')}
        <button class="add" data-act="tplsetadd" data-id="${t.id}">+ Упражнение</button>
        ${raw(scheduleBlock('template', t.id))}
      </div>`))}
    ${!list.length ? raw(h`<div class="card dash"><div class="empty">Шаблонов пока нет.<br>Шаблон — это состав тренировки без даты.</div></div>`) : ''}
    <button class="add" data-act="tpladd">+ Шаблон</button>

    <div class="card">
      <div class="row between"><div class="caps">Пилюли</div>
        <button class="q-edit" data-act="tagadd">+ пилюля</button></div>
      <div class="lab">Именно они считаются в трекере года: тренировка со временем меняется, а «пресс» остаётся.
        Тап по пилюле — переименовать или убрать.</div>
      ${sportTags().length ? raw(h`<div class="chips">${sportTags().map(t => {
        const n = tagMonthCount(t.id, monthKey(todayISO()));
        return raw(h`<button class="chip" data-act="tagedit" data-id="${t.id}">${t.name}${n ? ` · ${n}` : ''}</button>`);
      })}</div>`) : raw('<div class="lab">Пока пусто.</div>')}
    </div>

    <div class="card mute"><div class="lab">Сами тренировки живут на своих днях: заводятся на экране «День»,
      где шаблон подставляет состав. Здесь только заготовки.</div></div>`;
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

// ── шторки ──────────────────────────────────────────────────────
/**
 * Пилюли тренировки: «пресс», «руки», «зал с тренером». Именно они считаются
 * в трекере года — программа меняется, а пилюля остаётся.
 */
function tagPicks(chosen = []) {
  const list = sportTags();
  return [
    list.length ? h`
      <div class="fld"><span>Что качаем</span>
        <div class="picks">
          ${list.map(t => raw(h`
            <label class="pick-box"><input type="checkbox" name="tag_${t.id}" ${raw(chosen.includes(t.id) ? 'checked' : '')}><span>${t.name}</span></label>`))}
        </div>
      </div>` : '',
    field.text('newtag', 'Новая пилюля', '', 'если нужной нет — впиши'),
    field.note('В трекере года считаются именно пилюли: сколько раз за месяц был пресс или зал с тренером.'),
  ].join('');
}

/** Собрать выбранные пилюли из полей шторки и завести новую, если вписали. */
function tagsFrom(v, s) {
  const picked = sportTags().filter(t => v['tag_' + t.id]).map(t => t.id);
  const name = (v.newtag || '').trim();
  if (!name) return picked;
  const exist = s.sport.tags.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (exist) return [...new Set([...picked, exist.id])];
  const fresh = { id: uid(), name };
  s.sport.tags.push(fresh);
  return [...picked, fresh.id];
}

export function workoutSheet(workout, date) {
  const isNew = !workout;
  const w = workout || { id: uid(), date: date || todayISO(), title: '', templateId: '', lessonId: '', goalId: '', done: false, sets: [], note: '' };
  const lessons = liveLessons().filter(l => l.kind === 'practice');
  const goals = liveGoals();
  openSheet({
    title: isNew ? 'Тренировка' : (w.title || 'Тренировка'),
    sub: isNew ? 'по умолчанию — план на день; можно отметить сразу как сделанную' : dayShort(w.date),
    body: [
      isNew && templates().length
        ? field.select('templateId', 'Взять шаблон', [{ value: '', label: 'с нуля' },
            ...templates().map(t => ({ value: t.id, label: `${t.name} · ${(t.sets || []).length} упр.` }))], '')
        : '',
      isNew && templates().length ? field.note('Состав подставится из шаблона, дальше правится как обычно.') : '',
      field.text('title', 'Название', w.title, 'например, «Зал А · ноги»'),
      field.date('date', 'Когда', w.date),
      lessons.length
        ? field.select('lessonId', 'Занятие с полки', [{ value: '', label: 'не связано' }, ...lessons.map(l => ({ value: l.id, label: l.name }))], w.lessonId || '')
        : '',
      lessons.length ? field.note('Связанная тренировка засчитает занятие и не удвоит статистику.') : '',
      goals.length
        ? field.select('goalId', 'К какой цели', [{ value: '', label: 'ни к какой' },
            ...goals.map(g => ({ value: g.id, label: isCounter(g) ? `${g.title} · ${counterLabel(g)}` : g.title }))], w.goalId || '')
        : '',
      goals.length ? field.note('Это только подпись, к чему тренировка относится: счётчик цели остаётся за тобой.') : '',
      tagPicks(w.tags || []),
      `<label class="row tight" style="font-size:13px"><input type="checkbox" name="done" ${w.done ? 'checked' : ''}> Уже сделала</label>`,
      field.area('note', 'Заметка', w.note || ''),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      update(s => {
        const prev = s.sport.workouts.find(x => x.id === w.id);
        const next = {
          ...w, title: (v.title || '').trim() || templateName(v.templateId) || 'Тренировка',
          templateId: v.templateId || w.templateId || '',
          date: v.date || w.date, lessonId: v.lessonId || '', goalId: v.goalId || '',
          note: (v.note || '').trim(), done: !!v.done, tags: tagsFrom(v, s),
        };
        // Шаблон подставляет состав один раз, при создании.
        if (!prev && v.templateId) {
          const t = s.sport.templates.find(x => x.id === v.templateId);
          if (!next.sets.length) next.sets = (t?.sets || []).map(x => ({ ...x, id: uid(), done: false }));
          // Пилюли шаблона подставляются, если руками ничего не выбрано.
          if (!next.tags.length) next.tags = [...(t?.tags || [])];
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

/** Выполненная тренировка засчитывает занятие и опыт. Цель — только подпись. */
export function applyDone(s, w, undo = false) {
  addXp(undo ? -XP.quest : XP.quest);
  // Отметка всей тренировки закрывает и её состав — но только если ничего
  // не размечено вручную: разметку по упражнениям затирать нельзя.
  const sets = w.sets || [];
  if (undo) sets.forEach(x => { x.done = false; });
  else if (!sets.some(x => x.done)) sets.forEach(x => { x.done = true; });
  if (w.lessonId) {
    const l = s.lessons.find(x => x.id === w.lessonId);
    if (l) { if (undo) delete l.log[w.date]; else l.log[w.date] = 1; }
  }
  touchTracker(s);
}

/**
 * Состав тренировки правится там же, где сама тренировка, — на дне.
 * Без результата упражнение бессмысленно: рекорды считаются по нему.
 */
export function workoutSetSheet(workoutId, setId) {
  const w = S.sport.workouts.find(x => x.id === workoutId);
  if (!w) return;
  const list = S.sport.exercises;
  if (!list.length) return toast('Сначала заведи упражнение');
  const cur = setId ? (w.sets || []).find(x => x.id === setId) : null;

  openSheet({
    title: cur ? 'Упражнение' : 'Упражнение в тренировку',
    sub: w.title || 'Тренировка',
    body: [
      field.select('exerciseId', 'Что', list.map(e => ({ value: e.id, label: `${e.name}, ${e.unit}` })), cur?.exerciseId || list[0].id),
      field.number('reps', 'Подходов', cur ? cur.reps : 1, { min: 1 }),
      field.number('value', 'Повторов в подходе', cur ? cur.value : '', { min: 0 }),
      field.note('Считаем в единице упражнения: у турника это повторы, у планки — секунды, у шпагата — сантиметры. В рекорд идёт один подход, а не сумма.'),
    ].join(''),
    primary: cur ? 'Сохранить' : 'Добавить',
    onSave: (v, close) => {
      const value = Number(v.value);
      if (!Number.isFinite(value) || v.value === '') return toast('Введи, сколько повторов');
      const set = { exerciseId: v.exerciseId, value, reps: Math.max(1, Number(v.reps) || 1) };
      update(s => {
        const x = s.sport.workouts.find(y => y.id === workoutId);
        if (!x) return;
        x.sets ||= [];
        const at = cur ? x.sets.findIndex(y => y.id === setId) : -1;
        if (at >= 0) x.sets[at] = { ...x.sets[at], ...set };
        // Упражнение, дописанное в уже отмеченную тренировку, — это тоже сделанное.
        else x.sets.push({ id: uid(), ...set, done: !!x.done });
        touchTracker(s);
      });
      close();
    },
    danger: cur ? 'Убрать из тренировки' : '',
    onDanger: cur ? (_, close) => {
      update(s => {
        const x = s.sport.workouts.find(y => y.id === workoutId);
        if (x) x.sets = (x.sets || []).filter(y => y.id !== setId);
        touchTracker(s);
      });
      close();
    } : undefined,
  });
}

/** Набор шаблона правится так же, как состав тренировки: подходы и повторы. */
function tplSetSheet(tplId, setId) {
  const t = templateById(tplId);
  if (!t) return;
  const list = S.sport.exercises;
  if (!list.length) return toast('Сначала заведи упражнение');
  const cur = setId ? (t.sets || []).find(x => x.id === setId) : null;

  openSheet({
    title: cur ? 'Упражнение в наборе' : 'Упражнение в набор',
    sub: t.name,
    body: [
      field.select('exerciseId', 'Что', list.map(e => ({ value: e.id, label: `${e.name}, ${e.unit}` })), cur?.exerciseId || list[0].id),
      field.number('reps', 'Подходов', cur ? cur.reps : 1, { min: 1 }),
      field.number('value', 'Повторов в подходе — ориентир', cur ? cur.value : '', { min: 0 }),
      field.note('Это заготовка: в тренировке на дне числа правятся под то, как получилось на самом деле.'),
    ].join(''),
    primary: cur ? 'Сохранить' : 'Добавить',
    onSave: (val, close) => {
      const set = {
        exerciseId: val.exerciseId,
        value: val.value === '' ? '' : Number(val.value),
        reps: Math.max(1, Number(val.reps) || 1),
      };
      update(s => {
        const k = s.sport.templates.find(x => x.id === tplId);
        if (!k) return;
        k.sets ||= [];
        const at = cur ? k.sets.findIndex(y => y.id === setId) : -1;
        if (at >= 0) k.sets[at] = { ...k.sets[at], ...set };
        else k.sets.push({ id: uid(), ...set });
      });
      close();
    },
    danger: cur ? 'Убрать из набора' : '',
    onDanger: cur ? (_v, close) => {
      update(s => {
        const k = s.sport.templates.find(x => x.id === tplId);
        if (k) k.sets = (k.sets || []).filter(y => y.id !== setId);
      });
      close();
    } : undefined,
  });
}

function tplSheet(tpl) {
  const isNew = !tpl;
  const k = tpl || { id: uid(), name: '', sets: [] };
  openSheet({
    title: isNew ? 'Шаблон тренировки' : k.name,
    sub: 'например, «Зал А · ноги» или «Пилатес»',
    body: [
      field.text('name', 'Название', k.name, 'как называешь про себя'),
      tagPicks(k.tags || []),
      isNew ? field.note('Состав добавишь на карточке — он будет подставляться в новые тренировки на дне.') : '',
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        const tags = tagsFrom(v, s);
        const i = s.sport.templates.findIndex(x => x.id === k.id);
        if (i >= 0) { s.sport.templates[i].name = name; s.sport.templates[i].tags = tags; }
        else s.sport.templates.push({ ...k, name, tags });
      });
      close();
    },
    danger: isNew ? null : 'Удалить шаблон',
    onDanger: (_v, close) => {
      // Шаблон только заготовка: удаление не трогает уже созданные тренировки.
      update(s => { s.sport.templates = s.sport.templates.filter(x => x.id !== k.id); });
      close();
      toast('Убрала, прошлые тренировки остались');
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
  ...scheduleActions,
  tagadd: () => tagSheet(null),
  tagedit: v => tagSheet(sportTags().find(t => t.id === v.id)),
  back: () => { location.hash = '#/spheres'; },
  tab: v => update(s => { s.ui.sportTab = v.v; }),

  tpladd: () => tplSheet(null),
  tpledit: v => tplSheet(templateById(v.id)),
  tplsetadd: v => tplSetSheet(v.id),
  tplsetedit: v => tplSetSheet(v.id, v.s),

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
            w = { id: uid(), date, title: 'Замер', measure: true, templateId: '', lessonId: '', goalId: '', done: true, sets: [], note: '' };
            s.sport.workouts.push(w);
          }
          w.sets.push({ id: uid(), exerciseId: ex.id, value, reps: Math.max(1, Number(val.reps) || 1), done: true });
          touchTracker(s);
        });
        close();
        toast('Записала');
      },
    });
  },
};

/** Пилюля: имя и удаление. Удаление снимает её с тренировок, но их не трогает. */
function tagSheet(tag) {
  const isNew = !tag;
  const t = tag || { id: uid(), name: '' };
  const used = S.sport.workouts.filter(w => (w.tags || []).includes(t.id)).length;
  openSheet({
    title: isNew ? 'Пилюля' : t.name,
    sub: isNew ? 'например, «Пресс» или «Зал с тренером»' : `тренировок с ней: ${used}`,
    body: [
      field.text('name', 'Название', t.name, 'что качаем'),
      field.note('Пилюлями считается трекер года. Одна тренировка может нести несколько сразу.'),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        const i = s.sport.tags.findIndex(x => x.id === t.id);
        if (i >= 0) s.sport.tags[i].name = name; else s.sport.tags.push({ ...t, name });
      });
      close();
    },
    danger: isNew ? null : 'Удалить пилюлю',
    onDanger: (_v, close) => {
      update(s => {
        s.sport.tags = s.sport.tags.filter(x => x.id !== t.id);
        s.sport.workouts.forEach(w => { w.tags = (w.tags || []).filter(x => x !== t.id); });
        s.sport.templates.forEach(x => { x.tags = (x.tags || []).filter(y => y !== t.id); });
        delete s.tracker.tagValues[t.id];
        touchTracker(s);
      });
      close();
      toast('Убрала — тренировки остались');
    },
  });
}
