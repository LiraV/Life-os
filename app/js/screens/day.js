// «День»: реальные даты, энергия дня, квесты с полным редактированием.

import { S, update, updateQuiet, uid, XP, addXp, allSpheres, addDiary, tickHabit, touchTracker, blockAt, energyAt, energyOn } from '../store.js';
import { todayISO, addDays, dayTitle, dayShort, relativeDay } from '../dates.js';
import { h, raw, field, toast, openSheet, plural } from '../ui.js';
import { effects } from '../traits.js';
import { workoutSheet, workoutSetSheet, applyDone } from './sport.js';
import { scheduleMark, occurrenceSheet } from '../schedule.js';
import {
  questsOn, curveInfo, curveOwn, ENERGY_BLOCKS, energyLabel, peakBlock, chronicler, sphereOf,
  sleepOn, sleepAvg, sleepMarks,
  liveGoals, goalChain, liveHabits, habitTarget, habitCount, habitDone, energyRecent, liveLessons,
  workoutsOn, exerciseById, scheduleOn, scheduleDone, scheduleTitle, scheduleMovedFrom, scheduleShiftedOn, tagName, inboxCount, dueOn,
  liveTasks, taskSubject, careItems, careSorted, careGroupName,
} from '../selectors.js';
import { gv, g } from '../gender.js';
import { inboxSheet } from './inbox.js';
import { careSheet, careFlip } from './care.js';
import { taskSheet as studyTaskSheet } from './study.js';

const curDate = () => S.ui.date || todayISO();

const nowBlock = () => blockAt();

/**
 * Что показать на ползунке: своя отметка этого блока, иначе среднее по дню,
 * иначе подсказка кривой. Подсказку не записываем — она не отметка.
 */
export function defaultEnergy(date) {
  const nb = date === todayISO() ? nowBlock() : -1;
  const mine = nb >= 0 ? energyAt(date, nb) : null;
  if (mine != null) return mine;
  const day = energyOn(date);
  if (day != null) return day;
  return curveInfo()[Math.max(0, nb)]?.value ?? 60;
}

/**
 * Отметка ложится в блок дня — по нему потом учится кривая. Ночью блока нет,
 * такие отметки живут под «d»: день они считают, кривую не искажают.
 */
function markEnergy(s, date, val) {
  const b = date === todayISO() ? blockAt() : -1;
  const rec = s.energy[date] && typeof s.energy[date] === 'object' ? s.energy[date] : {};
  rec[b >= 0 ? String(b) : 'd'] = val;
  s.energy[date] = rec;
}

export function render() {
  const date = curDate();
  const qs = questsOn(date);
  const isToday = date === todayISO();
  const e = defaultEnergy(date);
  const nb = isToday ? nowBlock() : -1;
  const marked = (nb >= 0 ? energyAt(date, nb) : energyOn(date)) != null;
  const curve = curveInfo();
  const own = curveOwn();
  const peak = peakBlock();
  const done = qs.filter(q => q.done).length;

  return h`
    <div class="stepper">
      <button class="arrow" data-act="prev" aria-label="Предыдущий день">‹</button>
      <div style="text-align:center">
        <div class="title">${dayTitle(date)}</div>
        <div class="lab">${relativeDay(date) || dayShort(date)}${qs.length ? ` · ${done} из ${qs.length}` : ''}</div>
      </div>
      <button class="arrow" data-act="next" aria-label="Следующий день">›</button>
    </div>
    ${!isToday ? raw('<button class="btn-ghost" data-act="today">вернуться к сегодня</button>') : ''}

    <div class="card">
      <div class="row between"><div class="lab">Кривая дня · ${own ? (own === curve.length ? 'по твоим отметкам' : `твоих блоков ${own} из ${curve.length}`) : S.user.chronotype}</div><div class="lab">пик ${ENERGY_BLOCKS[peak]}</div></div>
      <div class="curve">
        ${curve.map((x, i) => raw(h`<div class="${x.own ? 'own' : 'pre'} ${i === peak ? 'hot' : ''} ${i === nb ? 'now' : ''}"
          style="height:${Math.max(8, x.value)}%" title="${x.own ? `${ENERGY_BLOCKS[i]} · ${x.value} · отметок ${x.n}` : `${ENERGY_BLOCKS[i]} · пока по хронотипу`}"></div>`))}
      </div>
      <div class="curve-x">${ENERGY_BLOCKS.map(b => raw(h`<span>${b}</span>`))}</div>
      <div class="fld" style="margin-top:2px">
        <span>Энергия сейчас <b id="e_out">${marked ? `${e} · ${energyLabel(e)}` : `${e} · не отмечена`}</b></span>
        <input type="range" min="0" max="100" value="${e}" data-act-input="energyLive" data-change="energy" aria-label="Энергия">
      </div>
      ${!marked ? raw(h`<div class="lab hint-energy">${nb >= 0 ? `Пока это подсказка. Двинь ползунок — запишется как отметка на «${ENERGY_BLOCKS[nb]}».` : 'Пока это подсказка. Двинь ползунок — запишется как отметка.'}</div>`) : ''}
      ${raw(energyHistory(date))}
    </div>

    ${raw(sleepCard(date))}

    <div class="row between"><div class="caps">Квесты дня</div>
      <span class="lab">${qs.length ? raw('<span data-act="add" style="cursor:pointer">+ квест</span> · ') : ''}<span data-act="wadd" style="cursor:pointer">+ тренировка</span>${raw(' · ')}<span data-act="inbox" style="cursor:pointer">+ в инбокс</span></span></div>

    ${inboxCount() ? raw(h`<button class="link-row" data-act="toinbox">
      <span class="lab grow">В инбоксе ${inboxCount()} — разобрать, когда будет настроение</span>
      <span class="lab">›</span></button>`) : ''}

    ${raw(scheduleBlock(date))}
    ${raw(dueBlock(date))}

    ${workoutsOn(date).map(w => raw(workoutRow(w)))}

    ${qs.length ? qs.map(q => raw(questRow(q))) : raw(h`
      <div class="card dash"><div class="empty">На этот день пусто.<br>Одно дело — уже достаточно.</div>
        <button class="add" data-act="add">+ Добавить квест</button></div>`)}

    ${raw(habitsBlock(date))}

    ${chronicler(date).map(t => raw(h`<div class="ai">${t}</div>`))}
    <div style="height:4px"></div>`;
}

/**
 * Сон за ночь. Отметка принадлежит дню пробуждения: ночь с воскресенья на
 * понедельник — это понедельник. Пока не тронешь ползунок, ничего не
 * записано: ноль испортил бы и среднее, и связку с энергией.
 */
function sleepCard(date) {
  const h2 = sleepOn(date);
  const norm = Number(S.user.sleep) || 8;
  const avg = sleepAvg(30);
  const n = sleepMarks(30).filter(x => x.h != null).length;
  const val = h2 ?? norm;
  return h`
    <div class="card">
      <div class="row between"><div class="lab">Сон</div>
        <div class="lab">${avg != null ? `в среднем ${sleepNum(avg)} ч за ${n} ${plural(n, 'ночь', 'ночи', 'ночей')}` : `норма ${sleepNum(norm)} ч`}</div></div>
      <div class="fld" style="margin-top:2px">
        <span>${date === todayISO() ? 'Сегодня ночью' : 'В эту ночь'} <b id="s_out">${h2 == null ? `${sleepNum(val)} ч · не отмечено` : `${sleepNum(h2)} ч · ${sleepLabel(h2, norm)}`}</b></span>
        <input type="range" min="0" max="14" step="0.5" value="${val}" data-act-input="sleepLive" data-change="sleep" aria-label="Сон">
        <div class="range-ends"><span>не ${gv('спал')}</span><span>норма ${sleepNum(norm)} ч</span><span>14 ч</span></div>
      </div>
      ${h2 == null ? raw(h`<div class="lab hint-sleep">Двинь ползунок — запишется как отметка за эту ночь. Ночь считается за то утро, в которое ты ${g('проснулась', 'проснулся')}.</div>`) : ''}
      ${raw(sleepSpark(date))}
    </div>`;
}

/** Часы без хвоста: 7 вместо 7,0 — а половина остаётся половиной. */
const sleepNum = v => String(Math.round(v * 2) / 2).replace('.', ',');

/** Оценка без упрёка: короткая ночь — это факт, а не провинность. */
function sleepLabel(v, norm) {
  if (v === 0) return 'совсем без сна';
  if (v < norm - 2) return 'сильно меньше нормы';
  if (v < norm - 0.5) return 'меньше нормы';
  if (v <= norm + 1) return 'по норме';
  return 'больше нормы';
}

/** Полоска за 30 ночей: неотмеченные остаются пустыми. */
function sleepSpark(date) {
  const marks = sleepMarks(30);
  if (marks.filter(x => x.h != null).length < 2) return '';
  const all = Array.from({ length: 30 }, (_, i) => addDays(todayISO(), -(29 - i)));
  const by = Object.fromEntries(marks.map(x => [x.date, x.h]));
  return h`
    <div class="spark">
      ${all.map(d => raw(h`<i class="${by[d] == null ? 'none' : ''} ${d === date ? 'cur' : ''}"
        style="${by[d] != null ? `height:${Math.min(100, Math.round((by[d] / 12) * 100))}%` : ''}" title="${d}"></i>`))}
    </div>`;
}

/** Волна энергии за месяц: пустые дни оставляем пустыми, а не нулём. */
function energyHistory(date) {
  const list = energyRecent(30);
  const marked = list.filter(x => x.value != null);
  if (marked.length < 2) return '';
  const avg = Math.round(marked.reduce((a, x) => a + x.value, 0) / marked.length);
  return h`
    <div class="spark">
      ${list.map(x => raw(h`<i class="${x.value == null ? 'none' : ''} ${x.date === date ? 'cur' : ''}"
        style="${x.value != null ? `height:${Math.max(6, x.value)}%` : ''}" title="${x.date}"></i>`))}
    </div>
    <div class="lab">30 дней · в среднем ${avg} · отмечено ${marked.length}</div>`;
}

/** По расписанию: не записи, а правила — считаются на лету для этого дня. */

/**
 * Сроки на этот день — только учёба. Рабочие задачи сюда не попадают
 * намеренно: они не должны отвлекать в личном дне, у них свой экран.
 * Просроченное показывается на сегодня, иначе оно пропадает из виду совсем.
 */
function dueBlock(date) {
  const list = dueOn(date);
  if (!list.length) return '';
  return h`
    <div class="row between"><div class="caps">Сроки</div>
      <span class="lab">${list.filter(x => !x.done).length || 'всё закрыто'}</span></div>
    ${list.map(x => raw(h`
      <div class="quest ${x.done ? 'done' : ''}">
        <button class="check ${x.done ? 'on' : ''}" data-act="duedone" data-k="${x.kind}" data-id="${x.id}"
          aria-label="Сделано">✓</button>
        <div class="grow" data-act="dueopen" data-k="${x.kind}" data-id="${x.id}" style="cursor:pointer">
          <div class="q-title">${x.title}</div>
          <div class="q-meta">
            <span class="tag">${x.tag}</span>
            ${x.sub ? raw(h`<span class="tag">${x.sub}</span>`) : ''}
            <span class="q-time">${x.overdue ? `срок был ${dayShort(x.due)}` : 'срок сегодня'}</span>
          </div>
        </div>
        <button class="q-edit" data-act="dueopen" data-k="${x.kind}" data-id="${x.id}">открыть ›</button>
      </div>`))}`;
}

function scheduleBlock(date) {
  const list = scheduleOn(date);
  const shifted = scheduleShiftedOn(date);
  if (!list.length && !shifted.length) return '';
  const KIND = { lesson: 'занятие', subject: 'учёба', template: 'тренировка' };
  const moved = shifted.map(({ sc, to }) => h`
    <div class="quest mute">
      <div class="grow">
        <div class="q-title lab">${scheduleTitle(sc)}</div>
        <div class="q-meta"><span class="q-time">${to ? `перенесено на ${dayShort(to)}` : 'отменено на этот раз'}</span></div>
      </div>
      <button class="q-edit" data-act="schedback" data-id="${sc.id}">вернуть</button>
    </div>`).join('');
  return moved + list.map(sc => {
    const done = scheduleDone(sc, date);
    const from = scheduleMovedFrom(sc, date);
    return h`
      <div class="quest ${done ? 'done' : ''}">
        <button class="check ${done ? 'on' : ''}" data-act="scheddone" data-id="${sc.id}"
          aria-label="Было">✓</button>
        <div class="grow" data-act="schedmove" data-id="${sc.id}" style="cursor:pointer">
          <div class="q-title">${scheduleTitle(sc)}</div>
          <div class="q-meta">
            <span class="tag">${KIND[sc.kind] || 'по расписанию'}</span>
            ${from ? raw(h`<span class="tag">перенос с ${dayShort(from)}</span>`) : ''}
            ${sc.place ? raw(h`<span class="tag">${sc.place}</span>`) : ''}
            <span class="q-time">${sc.time || 'по расписанию'}${sc.dur ? ` · ${sc.dur} мин` : ''}</span>
          </div>
        </div>
        <button class="q-edit" data-act="schedmove" data-id="${sc.id}">перенести ›</button>
      </div>`;
  }).join('');
}

const goalTitleOf = id => (liveGoals().find(g => g.id === id) || {}).title || '';

/** Тренировка на дне: свёрнута до строки, по тапу — состав с отметками.
 *  Отметка подхода и есть результат: неотмеченное в рекорды не идёт. */
function workoutRow(w) {
  const sets = w.sets || [];
  const open = S.ui.openWorkout === w.id;
  const done = sets.filter(x => x.done).length;
  return h`
    <div class="quest ${w.done ? 'done' : ''}">
      <button class="check ${w.done ? 'on' : ''}" data-act="wdone" data-id="${w.id}" aria-label="Тренировка сделана">✓</button>
      <div class="grow" data-act="wtoggle" data-id="${w.id}" style="cursor:pointer">
        <div class="q-title">${w.title || 'Тренировка'}</div>
        <div class="q-meta">
          <span class="tag">тренировка</span>
          ${w.time ? raw(h`<span class="q-time">${w.time}</span>`) : ''}
          ${(w.tags || []).map(id => tagName(id)).filter(Boolean).map(n => raw(h`<span class="tag">${n}</span>`))}
          ${w.goalId && goalTitleOf(w.goalId) ? raw(h`<span class="tag">→ ${goalTitleOf(w.goalId)}</span>`) : ''}
          <span class="q-time">${sets.length
            ? `${sets.length} упр.${done ? ` · сделано ${done}` : ''}`
            : 'упражнения не заданы'} ${open ? '▴' : '▾'}</span>
        </div>
      </div>
      <button class="q-edit" data-act="wopen" data-id="${w.id}">настроить ›</button>
    </div>
    ${open ? raw(h`
      <div class="w-sets">
        ${sets.map(x => {
          const ex = exerciseById(x.exerciseId);
          return raw(h`<div class="w-set-row ${x.done ? 'done' : ''}">
            <button class="check sm ${x.done ? 'on' : ''}" data-act="wsetdone" data-id="${w.id}" data-s="${x.id}"
              aria-label="Упражнение сделано">✓</button>
            <button class="grow w-set-name" data-act="wsetedit" data-id="${w.id}" data-s="${x.id}">
              <span class="ellip">${ex ? ex.name : 'упражнение'}</span>
              <span class="lab">${x.reps > 1 ? x.reps + ' × ' : ''}${x.value}${ex?.unit ? ' ' + ex.unit : ''} ›</span>
            </button>
          </div>`);
        })}
        <button class="add" data-act="wsetadd" data-id="${w.id}">+ Упражнение</button>
      </div>`) : ''}`;
}

/** Ритм дня прямо на главном: норма, счёт и плюс в один тап. */
function habitsBlock(date) {
  const list = liveHabits();
  if (!list.length) return h`
    <div class="card dash">
      <div class="row between"><div class="caps">Ритм дня</div>
        <button class="q-edit" data-act="habits">завести ›</button></div>
      <div class="lab">Привычек пока нет. Одной достаточно, чтобы начать.</div>
    </div>`;

  const done = list.filter(hb => habitDone(hb, date)).length;
  const future = date > todayISO();
  return h`
    <div class="card">
      <div class="row between">
        <div class="caps">Ритм дня</div>
        <span class="lab">${done} из ${list.length}${raw(' · ')}<span data-act="habits" style="cursor:pointer">все ›</span></span>
      </div>
      ${list.map(hb => {
        const target = habitTarget(hb);
        const c = habitCount(hb, date);
        const full = c >= target;
        return raw(h`
          <div class="hab-row ${full ? 'done' : ''}">
            <div class="grow">
              <div class="ink">${hb.name}</div>
              <div class="lab">${c} / ${target}${hb.unit ? ' ' + hb.unit : ''}</div>
            </div>
            ${full
              ? raw(h`<button class="hab-plus on" data-act="hab" data-id="${hb.id}" aria-label="Сбросить">✓</button>`)
              : raw(h`<button class="hab-plus" data-act="hab" data-id="${hb.id}" ${raw(future ? 'disabled' : '')} aria-label="Отметить">+</button>`)}
          </div>`);
      })}
    </div>`;
}

function questRow(q) {
  const sp = sphereOf(q.sphere);
  // «Хранительнице смысла» цепочка нужна на виду, а не в шторке.
  const chain = effects().show === 'why' && q.goalId ? goalChain(q.goalId) : null;
  const lesson = q.lessonId ? liveLessons().find(l => l.id === q.lessonId) : null;
  return h`
    <div class="quest ${q.done ? 'done' : ''}">
      <button class="check ${q.done ? 'on' : ''}" data-act="toggle" data-id="${q.id}" aria-label="Выполнено">✓</button>
      <div class="grow" data-act="edit" data-id="${q.id}" style="cursor:pointer">
        <div class="q-title">${q.title}</div>
        <div class="q-meta">
          ${q.time ? raw(h`<span class="q-time">${q.time}${q.minutes ? ` · ${q.minutes} мин` : ''}</span>`) : ''}
          ${sp ? raw(h`<span class="tag">${sp.name}</span>`) : ''}
          ${q.boss ? raw('<span class="tag boss">босс ★</span>') : ''}
          ${lesson ? raw(h`<span class="tag">${lesson.name}</span>`) : ''}
        </div>
        ${chain && chain.links.length ? raw(h`<div class="lab">→ ${chain.links.map(l => l.title).join(' → ')}${chain.theme ? ` → «${chain.theme}»` : ''}</div>`) : ''}
      </div>
      <button class="q-edit" data-act="edit" data-id="${q.id}">настроить ›</button>
    </div>`;
}

// ── редактор квеста ─────────────────────────────────────────────
// Функция, а не константа: своя сфера, заведённая сейчас, должна появиться
// в выборе сразу, а не после перезапуска приложения.
// Длина квеста: от «десять минут и хватит» до половины дня. Сорок пять
// осталось значением по умолчанию — на нём стоит норма дня.
const LENGTHS = [10, 15, 30, 45, 60, 90, 120, 180, 240];

const sphereOpts = () => [{ value: '', label: 'без сферы' }, ...allSpheres().map(s => ({ value: s.key, label: s.name }))];

export function questSheet(quest, date, onDone) {
  const isNew = !quest;
  const q = quest || { id: uid(), title: '', time: '', minutes: 45, sphere: '', boss: false, goalId: '', lessonId: '', studyId: '', careId: '', done: false };
  // Открытые задания учёбы: связанный квест закроет задание, когда его отметят.
  const stTasks = liveTasks().filter(x => x.stage !== 'done');
  const lessons = liveLessons();
  const goals = liveGoals();
  const chain = q.goalId ? goalChain(q.goalId) : null;

  openSheet({
    title: isNew ? 'Новый квест' : 'Квест',
    body: [
      field.text('title', 'Что делаем', q.title, 'например, «Черновик главы 2»'),
      field.time('time', 'Когда', q.time),
      field.opts('minutes', 'Длина', LENGTHS.map(m => ({ value: String(m), label: m < 60 ? `${m} мин` : m % 60 === 0 ? `${m / 60} ч` : `${Math.floor(m / 60)} ч ${m % 60}` })), String(q.minutes || 45)),
      field.opts('sphere', 'Сфера', sphereOpts(), q.sphere || ''),
      lessons.length
        ? field.select('lessonId', 'Занятие с полки', [{ value: '', label: 'не связано' }, ...lessons.map(l => ({ value: l.id, label: l.name }))], q.lessonId || '')
        : '',
      lessons.length ? field.note('Связанный квест при выполнении сам отметит занятие: оно попадёт в полку, трекер и статистику сферы. Дважды отмечать не нужно.') : '',
      stTasks.length
        ? field.select('studyId', 'Задание учёбы', [{ value: '', label: 'не связано' },
            ...stTasks.map(x => ({ value: x.id, label: `${x.title} · ${taskSubject(x).name}` }))], q.studyId || '')
        : '',
      stTasks.length ? field.note('Отметишь квест — задание перейдёт в «Сдано». Снимешь отметку — вернётся в работу. Второй раз закрывать его в «Учёбе» не нужно.') : '',
      careItems().length
        ? field.select('careId', 'Дело из «Заботы»', [{ value: '', label: 'не связано' },
            ...careSorted().map(x => ({ value: x.id, label: `${x.name} · ${careGroupName(x.group)}` }))], q.careId || '')
        : '',
      careItems().length ? field.note('Отметишь квест — дело отметится тем же днём, и следующий срок отсчитается от него.') : '',
      goals.length
        ? field.select('goalId', 'Зачем — ведёт к цели', [{ value: '', label: 'просто так' }, ...goals.map(g => ({ value: g.id, label: g.title }))], q.goalId || '')
        : field.note('Целей пока нет — связь «зачем» появится, когда добавишь цель в Планах.'),
      chain && chain.links.length
        ? field.note('→ ' + chain.links.map(l => l.title).join(' → ') + (chain.theme ? ` → «${chain.theme}»` : ''))
        : '',
      field.date('date', 'День', date),
      `<label class="row tight" style="font-size:13px"><input type="checkbox" name="boss" ${q.boss ? 'checked' : ''}> Это босс недели ★</label>`,
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Без названия не сохранится');
      const target = v.date || date;
      update(s => {
        // Удаляем из старого дня — квест мог переехать на другую дату.
        Object.keys(s.quests).forEach(d => { s.quests[d] = s.quests[d].filter(x => x.id !== q.id); });
        const lessonId = v.lessonId || '';
        const studyId = v.studyId || '';
        const careId = v.careId || '';
        const next = {
          ...q, title, time: v.time || '', minutes: Number(v.minutes) || 45,
          // Связка с занятием сама проставляет сферу: обучение — её дом.
          sphere: v.sphere || (lessonId ? 'edu' : studyId ? 'study' : ''),
          goalId: v.goalId || '', lessonId, studyId, careId, boss: !!v.boss,
        };
        (s.quests[target] ||= []).push(next);
        s.quests[target].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
        if (target !== date) s.ui.date = target;
      });
      close();
      toast(isNew ? 'Квест добавлен' : 'Сохранено');
      onDone?.();
    },
    danger: isNew ? null : 'Удалить квест',
    onDanger: (_v, close) => {
      update(s => { Object.keys(s.quests).forEach(d => { s.quests[d] = s.quests[d].filter(x => x.id !== q.id); }); });
      close();
      toast('Удалено — без вины');
    },
  });
}

// ── рефлексия после занятия ─────────────────────────────────────
function reflectionSheet(q) {
  openSheet({
    title: 'Как оно?',
    sub: q.title,
    body: [
      field.opts('body', 'Тело', [gv('устал'), 'приятная усталость', 'лёгкость'], 'приятная усталость'),
      field.opts('mood', 'Настроение', ['наполнилась', 'ровно', 'не зашло'], 'ровно'),
      field.area('note', 'Заметка — если хочется', ''),
    ].join(''),
    primary: 'Сохранить · +8 XP',
    onSave: (v, close) => {
      update(s => {
        addDiary(s, `тело: ${v.body} · настроение: ${v.mood}${v.note ? ` — ${v.note}` : ''}`, `после «${q.title}»`, 'reflection');
        addXp(XP.reflection);
      });
      close();
      toast('Записала в дневник');
    },
    secondary: 'пропустить — ничего не случится',
    onSecondary: (_v, close) => close(),
  });
}

export const actions = {
  inbox: () => inboxSheet(),

  /** Отметка срока: само задание живёт в «Учёбе», день его только закрывает. */
  duedone: v => {
    if (v.k === 'care') return careFlip(v.id, curDate());
    update(s => {
      const t = s.study.tasks.find(x => x.id === v.id);
      if (!t) return;
      const done = t.stage === 'done';
      t.stage = done ? 'draft' : 'done';
      addXp(done ? -XP.step : XP.step);
      touchTracker(s);
    });
  },
  dueopen: v => (v.k === 'care'
    ? careSheet(S.care.items.find(x => x.id === v.id))
    : studyTaskSheet(S.study.tasks.find(x => x.id === v.id))),
  toinbox: () => { location.hash = '#/inbox'; },
  prev: () => update(s => { s.ui.date = addDays(curDate(), -1); }),
  next: () => update(s => { s.ui.date = addDays(curDate(), 1); }),
  today: () => update(s => { s.ui.date = todayISO(); }),

  /** Пишем сразу, как только ползунок тронули: без перерисовки, чтобы не сорвать жест. */
  energyLive: (v, el) => {
    const val = Number(v.value);
    updateQuiet(s => { markEnergy(s, curDate(), val); });
    const out = document.getElementById('e_out');
    if (out) out.textContent = `${val} · ${energyLabel(val)}`;
    el?.closest('.card')?.querySelector('.lab.hint-energy')?.remove();
  },
  /** По отпусканию перерисовываем: совет Летописца и график должны догнать. */
  energy: v => update(s => { markEnergy(s, curDate(), Number(v.value)); }),

  sleepLive: (v, el) => {
    const val = Math.round(Number(v.value) * 2) / 2;
    updateQuiet(s => { s.sleep[curDate()] = val; });
    const out = document.getElementById('s_out');
    if (out) out.textContent = `${sleepNum(val)} ч · ${sleepLabel(val, Number(S.user.sleep) || 8)}`;
    el?.closest('.card')?.querySelector('.lab.hint-sleep')?.remove();
  },
  sleep: v => update(s => { s.sleep[curDate()] = Math.round(Number(v.value) * 2) / 2; }),

  toggle: v => {
    const date = curDate();
    let flipped = null;
    update(s => {
      const q = (s.quests[date] || []).find(x => x.id === v.id);
      if (!q) return;
      q.done = !q.done;
      q.doneAt = q.done ? new Date().toISOString() : null;
      addXp(q.done ? (q.boss ? XP.boss : XP.quest) : -(q.boss ? XP.boss : XP.quest));
      flipped = q;
    });
    if (!flipped) return;
    if (flipped.lessonId) {
      update(s => {
        const l = s.lessons.find(x => x.id === flipped.lessonId);
        if (!l) return;
        if (flipped.done) l.log[date] = 1;
        // Снимаем отметку, только если этот день не держит другой связанный квест.
        else if (!(s.quests[date] || []).some(x => x.done && x.lessonId === flipped.lessonId)) delete l.log[date];
        touchTracker(s);
      });
      const l = liveLessons().find(x => x.id === flipped.lessonId);
      if (l && flipped.done) toast(`${l.name} · занятие засчитано`);
    }
    if (flipped.studyId) {
      let name = '';
      update(s => {
        const t = s.study.tasks.find(x => x.id === flipped.studyId);
        if (!t) return;
        name = t.title;
        // Возвращаем в работу, только если этот день не держит другой связанный квест.
        if (flipped.done) t.stage = 'done';
        else if (!(s.quests[date] || []).some(x => x.done && x.studyId === flipped.studyId)) t.stage = 'draft';
        touchTracker(s);
      });
      if (name) toast(flipped.done ? `${name} · сдано` : `${name} · снова в работе`);
    }
    if (flipped.careId) {
      // Отметка дня, а не «сделано навсегда»: у заботы есть журнал, и снятая
      // галочка должна убрать именно этот день, а не последний по счёту.
      careFlip(flipped.careId, date, flipped.done);
    }
    if (flipped.done && flipped.boss) toast('Босс повержен ✦');
    else if (flipped.done) toast(`+${XP.quest} XP`);
    if (flipped.done && flipped.sphere === 'sport') setTimeout(() => reflectionSheet(flipped), 350);
  },

  habits: () => { location.hash = '#/habits'; },
  schedback: v => update(s => {
    const sc = s.schedules.find(x => x.id === v.id);
    if (sc) delete (sc.moves || {})[curDate()];
  }),
  schedmove: v => {
    const sc = S.schedules.find(x => x.id === v.id);
    if (sc) occurrenceSheet(sc, curDate());
  },
  scheddone: v => {
    const sc = S.schedules.find(x => x.id === v.id);
    if (sc) scheduleMark(sc, curDate());
  },

  wadd: () => workoutSheet(null, curDate()),
  wopen: v => workoutSheet(S.sport.workouts.find(x => x.id === v.id)),
  // Состав видно только у раскрытой тренировки: строка дня остаётся строкой.
  wtoggle: v => update(s => { s.ui.openWorkout = s.ui.openWorkout === v.id ? '' : v.id; }),
  wsetadd: v => workoutSetSheet(v.id),
  wsetedit: v => workoutSetSheet(v.id, v.s),
  wsetdone: v => update(s => {
    const w = s.sport.workouts.find(x => x.id === v.id);
    const set = w && (w.sets || []).find(x => x.id === v.s);
    if (!set) return;
    set.done = !set.done;
    touchTracker(s);
  }),
  wdone: v => {
    let name = '';
    update(s => {
      const w = s.sport.workouts.find(x => x.id === v.id);
      if (!w) return;
      w.done = !w.done;
      name = w.title || 'Тренировка';
      applyDone(s, w, !w.done);
    });
    const w = S.sport.workouts.find(x => x.id === v.id);
    if (w?.done) toast(`${name} · засчитана`);
    if (w?.done && !w.measure) setTimeout(() => reflectionSheet({ title: name, sphere: 'sport' }), 350);
  },

  /** Плюс добавляет шаг, галочка на закрытой норме обнуляет день. */
  hab: v => {
    const date = curDate();
    if (date > todayISO()) return;
    let res = null;
    update(s => { res = tickHabit(s, v.id, date); });
    // Приёмы пищи не отмечают — их едят. Ведём туда, где они записываются.
    if (res?.readOnly) { toast(`${res.name} считаются в «Питании»`); location.hash = '#/food'; return; }
    if (res?.reached) toast(`${res.name} — норма закрыта ✦`);
  },

  edit: v => {
    const q = questsOn(curDate()).find(x => x.id === v.id);
    if (q) questSheet(q, curDate());
  },
  add: () => questSheet(null, curDate()),
};
