// «День»: реальные даты, энергия дня, квесты с полным редактированием.

import { S, update, updateQuiet, uid, XP, addXp, SPHERES, addDiary, tickHabit, touchTracker } from '../store.js';
import { todayISO, addDays, dayTitle, dayShort, relativeDay } from '../dates.js';
import { h, raw, field, toast, openSheet } from '../ui.js';
import { effects } from '../traits.js';
import { workoutSheet } from './sport.js';
import {
  questsOn, energyCurve, ENERGY_BLOCKS, energyLabel, peakBlock, chronicler, sphereOf,
  liveGoals, goalChain, liveHabits, habitTarget, habitCount, habitDone, energyRecent, liveLessons,
  workoutsOn, kindName, exerciseById,
} from '../selectors.js';

const curDate = () => S.ui.date || todayISO();

/** Текущий блок кривой энергии по часам; ночью (1–7) — вне блоков. */
function nowBlock() {
  const hh = new Date().getHours();
  if (hh >= 7 && hh < 10) return 0;
  if (hh < 13) return 1;
  if (hh < 16) return 2;
  if (hh < 19) return 3;
  if (hh < 22) return 4;
  if (hh >= 22 || hh < 1) return 5;
  return -1;
}

export const defaultEnergy = date => S.energy[date] ?? energyCurve()[Math.max(0, nowBlock())] ?? 60;

export function render() {
  const date = curDate();
  const qs = questsOn(date);
  const isToday = date === todayISO();
  const e = defaultEnergy(date);
  const marked = S.energy[date] != null;
  const curve = energyCurve();
  const peak = peakBlock();
  const nb = isToday ? nowBlock() : -1;
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
      <div class="row between"><div class="lab">Кривая дня · ${S.user.chronotype}</div><div class="lab">пик ${ENERGY_BLOCKS[peak]}</div></div>
      <div class="curve">
        ${curve.map((v, i) => raw(h`<div class="${i === peak ? 'hot' : ''} ${i === nb ? 'now' : ''}" style="height:${Math.max(8, v)}%"></div>`))}
      </div>
      <div class="curve-x">${ENERGY_BLOCKS.map(b => raw(h`<span>${b}</span>`))}</div>
      <div class="fld" style="margin-top:2px">
        <span>Энергия сейчас <b id="e_out">${marked ? `${e} · ${energyLabel(e)}` : `${e} · не отмечена`}</b></span>
        <input type="range" min="0" max="100" value="${e}" data-act-input="energyLive" data-change="energy" aria-label="Энергия">
      </div>
      ${!marked ? raw('<div class="lab">Пока это подсказка по хронотипу. Двинь ползунок — запишется как твоя отметка.</div>') : ''}
      ${raw(energyHistory(date))}
    </div>

    <div class="row between"><div class="caps">Квесты дня</div>
      <span class="lab">${qs.length ? raw('<span data-act="add" style="cursor:pointer">+ квест</span> · ') : ''}<span data-act="wadd" style="cursor:pointer">+ тренировка</span></span></div>

    ${workoutsOn(date).map(w => raw(workoutRow(w)))}

    ${qs.length ? qs.map(q => raw(questRow(q))) : raw(h`
      <div class="card dash"><div class="empty">На этот день пусто.<br>Одно дело — уже достаточно.</div>
        <button class="add" data-act="add">+ Добавить квест</button></div>`)}

    ${raw(habitsBlock(date))}

    ${chronicler(date).map(t => raw(h`<div class="ai">${t}</div>`))}
    <div style="height:4px"></div>`;
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

/** Тренировка на дне: план видно заранее, отметка засчитывает её и занятие. */
function workoutRow(w) {
  const sets = (w.sets || []).map(x => {
    const ex = exerciseById(x.exerciseId);
    return ex ? `${ex.name} ${x.reps > 1 ? x.reps + '×' : ''}${x.value}${ex.unit ? ' ' + ex.unit : ''}` : '';
  }).filter(Boolean);
  return h`
    <div class="quest ${w.done ? 'done' : ''}">
      <button class="check ${w.done ? 'on' : ''}" data-act="wdone" data-id="${w.id}" aria-label="Тренировка сделана">✓</button>
      <div class="grow" data-act="wopen" data-id="${w.id}" style="cursor:pointer">
        <div class="q-title">${w.title || kindName(w.kind)}</div>
        <div class="q-meta">
          <span class="tag">${kindName(w.kind)}</span>
          ${sets.length ? raw(h`<span class="q-time">${sets.join(' · ')}</span>`) : raw('<span class="q-time">упражнения не заданы</span>')}
        </div>
      </div>
      <button class="q-edit" data-act="wopen" data-id="${w.id}">настроить ›</button>
    </div>`;
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
const SPHERE_OPTS = [{ value: '', label: 'без сферы' }, ...SPHERES.map(s => ({ value: s.key, label: s.name }))];

export function questSheet(quest, date, onDone) {
  const isNew = !quest;
  const q = quest || { id: uid(), title: '', time: '', minutes: 45, sphere: '', boss: false, goalId: '', lessonId: '', done: false };
  const lessons = liveLessons();
  const goals = liveGoals();
  const chain = q.goalId ? goalChain(q.goalId) : null;

  openSheet({
    title: isNew ? 'Новый квест' : 'Квест',
    body: [
      field.text('title', 'Что делаем', q.title, 'например, «Черновик главы 2»'),
      field.time('time', 'Когда', q.time),
      field.opts('minutes', 'Длина', [{ value: '45', label: '45 мин' }, { value: '90', label: '90 мин' }, { value: '120', label: '120 мин' }], String(q.minutes || 45)),
      field.opts('sphere', 'Сфера', SPHERE_OPTS, q.sphere || ''),
      lessons.length
        ? field.select('lessonId', 'Занятие с полки', [{ value: '', label: 'не связано' }, ...lessons.map(l => ({ value: l.id, label: l.name }))], q.lessonId || '')
        : '',
      lessons.length ? field.note('Связанный квест при выполнении сам отметит занятие: оно попадёт в полку, трекер и статистику сферы. Дважды отмечать не нужно.') : '',
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
        const next = {
          ...q, title, time: v.time || '', minutes: Number(v.minutes) || 45,
          // Связка с занятием сама проставляет сферу: обучение — её дом.
          sphere: v.sphere || (lessonId ? 'edu' : ''),
          goalId: v.goalId || '', lessonId, boss: !!v.boss,
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
      field.opts('body', 'Тело', ['устала', 'приятная усталость', 'лёгкость'], 'приятная усталость'),
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
  prev: () => update(s => { s.ui.date = addDays(curDate(), -1); }),
  next: () => update(s => { s.ui.date = addDays(curDate(), 1); }),
  today: () => update(s => { s.ui.date = todayISO(); }),

  /** Пишем сразу, как только ползунок тронули: без перерисовки, чтобы не сорвать жест. */
  energyLive: (v, el) => {
    const val = Number(v.value);
    updateQuiet(s => { s.energy[curDate()] = val; });
    const out = document.getElementById('e_out');
    if (out) out.textContent = `${val} · ${energyLabel(val)}`;
    el?.closest('.card')?.querySelector('.lab.hint-energy')?.remove();
  },
  /** По отпусканию перерисовываем: совет Летописца и график должны догнать. */
  energy: v => update(s => { s.energy[curDate()] = Number(v.value); }),

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
    if (flipped.done && flipped.boss) toast('Босс повержен ✦');
    else if (flipped.done) toast(`+${XP.quest} XP`);
    if (flipped.done && flipped.sphere === 'sport') setTimeout(() => reflectionSheet(flipped), 350);
  },

  habits: () => { location.hash = '#/habits'; },

  wadd: () => workoutSheet(null, curDate()),
  wopen: v => workoutSheet(S.sport.workouts.find(x => x.id === v.id)),
  wdone: v => {
    let name = '';
    update(s => {
      const w = s.sport.workouts.find(x => x.id === v.id);
      if (!w) return;
      w.done = !w.done;
      name = w.title || kindName(w.kind);
      if (w.done) {
        addXp(XP.quest);
        if (w.lessonId) { const l = s.lessons.find(x => x.id === w.lessonId); if (l) l.log[w.date] = 1; }
      } else {
        addXp(-XP.quest);
        if (w.lessonId) { const l = s.lessons.find(x => x.id === w.lessonId); if (l) delete l.log[w.date]; }
      }
      touchTracker(s);
    });
    const w = S.sport.workouts.find(x => x.id === v.id);
    if (w?.done) toast(`${name} · засчитана`);
    if (w?.done && w.kind !== 'other') setTimeout(() => reflectionSheet({ title: name, sphere: 'sport' }), 350);
  },

  /** Плюс добавляет шаг, галочка на закрытой норме обнуляет день. */
  hab: v => {
    const date = curDate();
    if (date > todayISO()) return;
    let res = null;
    update(s => { res = tickHabit(s, v.id, date); });
    if (res?.reached) toast(`${res.name} — норма закрыта ✦`);
  },

  edit: v => {
    const q = questsOn(curDate()).find(x => x.id === v.id);
    if (q) questSheet(q, curDate());
  },
  add: () => questSheet(null, curDate()),
};
