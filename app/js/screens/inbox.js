// «Инбокс»: место, куда мысль кладут, не решая сразу, когда её делать.
// Без даты, без сферы, без обязательств — иначе это был бы ещё один день.
//
// Отсюда ничего не уходит само. В планер переносит человек: в день, в цель,
// в этап сферы или в повторяющееся дело. Пока не перенёс — просто лежит,
// и лежать здесь можно сколько угодно.

import { S, update, uid, XP, addXp, allSpheres, blankSphere } from '../store.js';
import { todayISO, addDays, dayShort, monthKey, yearOf, MONTHS, relativeDay } from '../dates.js';
import { h, raw, field, toast, openSheet, confirmSheet } from '../ui.js';
import { inboxItems, inboxCount, inboxAge, HORIZONS } from '../selectors.js';
import { CARE_GROUPS } from '../selectors.js';

export function render() {
  const list = inboxItems();
  return h`
    <div class="title">Инбокс</div>
    <div class="sub">Сюда складывается то, что пришло в голову. Решать, когда это делать, — потом.</div>

    <div class="card">
      <div class="fld">
        <span>Что пришло в голову</span>
        <input type="text" data-field="quick" data-act-enter="quickadd" placeholder="одной строкой" autocomplete="off">
      </div>
      <div class="lab">Enter — и оно здесь. Ни даты, ни сферы вводить не нужно.</div>
    </div>

    ${list.length ? list.map(it => raw(row(it))) : raw(h`
      <div class="card dash">
        <div class="empty">Инбокс пуст.<br>Это не задача на сегодня — просто пусто.</div>
      </div>`)}

    ${list.length ? raw(h`<div class="card mute">
      <div class="lab">${list.length} ${plural(list.length, 'запись', 'записи', 'записей')}.
        Разбирать инбокс целиком не обязательно: можно взять одну и закрыть экран.</div>
    </div>`) : ''}
    <div style="height:4px"></div>`;
}

/** Строка входящего: в день — одним тапом, остальное — через «перенести». */
function row(it) {
  const age = inboxAge(it);
  return h`
    <div class="card">
      <div class="row between">
        <div class="grow" data-act="edit" data-id="${it.id}" style="cursor:pointer">
          <div class="ink">${it.text}</div>
          <div class="lab">${age === 0 ? 'сегодня' : age === 1 ? 'вчера' : `лежит ${age} ${plural(age, 'день', 'дня', 'дней')}`}${it.note ? ` · ${it.note}` : ''}</div>
        </div>
        <button class="q-edit" data-act="edit" data-id="${it.id}">изменить ›</button>
      </div>
      <div class="pills">
        <button class="pill" data-act="today" data-id="${it.id}">в сегодня</button>
        <button class="pill" data-act="move" data-id="${it.id}">перенести ›</button>
      </div>
    </div>`;
}

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};

const byId = id => (S.inbox || []).find(x => x.id === id);
const drop = (s, id) => { s.inbox = s.inbox.filter(x => x.id !== id); };

/** Добавить строкой. Пустое молча игнорируем — это не ошибка. */
function add(text) {
  const t = String(text || '').trim();
  if (!t) return;
  update(s => { s.inbox.push({ id: uid(), text: t, note: '', sphere: '', createdAt: todayISO() }); });
  toast('В инбоксе');
}

/** Правка записи: текст, заметка, сфера. Сфера необязательна и здесь. */
function editSheet(id) {
  const it = byId(id);
  if (!it) return;
  openSheet({
    title: 'Запись',
    sub: `лежит с ${dayShort(it.createdAt)}`,
    body: [
      field.text('text', 'Что это', it.text),
      field.area('note', 'Подробности — если нужны', it.note || ''),
      field.opts('sphere', 'Сфера', [{ value: '', label: 'без сферы' },
        ...allSpheres().map(sp => ({ value: sp.key, label: sp.name }))], it.sphere || ''),
      field.note('Сфера подставится при переносе. Можно не выбирать — инбокс тем и хорош, что ничего не требует.'),
    ].join(''),
    primary: 'Сохранить',
    onSave: (v, close) => {
      const text = (v.text || '').trim();
      if (!text) return toast('Нужен текст');
      update(s => {
        const x = s.inbox.find(y => y.id === id);
        if (x) { x.text = text; x.note = (v.note || '').trim(); x.sphere = v.sphere || ''; }
      });
      close();
    },
    danger: 'Убрать из инбокса',
    onDanger: (_v, close) => {
      close();
      confirmSheet(`Убрать «${it.text}»?`, 'Запись просто исчезнет — никуда не перенесётся.', 'Убрать',
        () => update(s => drop(s, id)));
    },
  });
}

/** Куда перенести. Четыре места, каждое со своей короткой формой. */
function moveSheet(id) {
  const it = byId(id);
  if (!it) return;
  openSheet({
    title: 'Перенести',
    sub: it.text,
    body: [
      [['day', '📅 В день', 'станет квестом на выбранную дату'],
       ['goal', '🎯 В цель', 'месяц, квартал или год'],
       ['sphere', '🧩 В сферу', 'этапом внутри сферы'],
       ['care', '🔁 В заботу', 'повторяющимся делом']]
        .map(([k, name, hint]) => h`
          <button class="row between care-name" data-act="to" data-v="${k}">
            <span class="ink grow">${name}</span>
            <span class="lab">${hint} ›</span>
          </button>`).join(''),
      field.note('После переноса запись уходит из инбокса — она уже там, где ей место.'),
    ].join(''),
    onAct: (name, data, close) => {
      if (name !== 'to') return;
      close();
      ({ day: toDay, goal: toGoal, sphere: toSphere, care: toCare }[data.v])(it);
    },
  });
}

function toDay(it) {
  openSheet({
    title: 'В день',
    sub: it.text,
    body: [
      field.date('date', 'На какой день', todayISO()),
      field.number('minutes', 'Сколько займёт', 45, { min: 0, suffix: 'мин' }),
      field.note('Дальше это обычный квест: его можно двигать, править и отмечать на «Дне».'),
    ].join(''),
    primary: 'Перенести',
    onSave: (v, close) => {
      const date = v.date || todayISO();
      update(s => {
        (s.quests[date] ||= []).push({
          id: uid(), title: it.text, time: '', minutes: Math.max(0, Number(v.minutes) || 0),
          sphere: it.sphere || '', boss: false, goalId: '', lessonId: '', done: false,
          note: it.note || '',
        });
        drop(s, it.id);
      });
      close();
      toast(`На ${dayShort(date)}`);
    },
  });
}

function toGoal(it) {
  const t = todayISO();
  openSheet({
    title: 'В цель',
    sub: it.text,
    body: [
      field.opts('horizon', 'Горизонт', Object.entries(HORIZONS).map(([value, label]) => ({ value, label })), 'month'),
      field.note('Период возьму текущий — месяц, квартал или год. В «Планах» его можно поменять, как у любой цели.'),
    ].join(''),
    primary: 'Перенести',
    onSave: (v, close) => {
      const horizon = ['year', 'quarter', 'month'].includes(v.horizon) ? v.horizon : 'month';
      const period = horizon === 'month' ? monthKey(t)
        : horizon === 'quarter' ? `${yearOf(t)}-Q${Math.ceil(Number(t.slice(5, 7)) / 3)}`
        : String(yearOf(t));
      update(s => {
        s.goals.push({
          id: uid(), title: it.text, horizon, period, parentId: '', sphere: it.sphere || '',
          deadline: '', target: 0, unit: '', current: 0, steps: [], slots: [], note: it.note || '',
        });
        drop(s, it.id);
        s.ui.planTab = horizon === 'month' ? 'month' : 'year';
      });
      close();
      toast('Теперь это цель');
    },
  });
}

function toSphere(it) {
  const list = allSpheres();
  openSheet({
    title: 'В сферу',
    sub: it.text,
    body: [
      field.select('key', 'Куда', list.map(sp => ({ value: sp.key, label: sp.name })), it.sphere || list[0].key),
      field.note('Станет этапом внутри сферы — с галочкой и прогрессом.'),
    ].join(''),
    primary: 'Перенести',
    onSave: (v, close) => {
      const key = v.key || list[0].key;
      update(s => {
        (s.spheres[key] ||= blankSphere()).items.push({ id: uid(), title: it.text, done: false, stage: 0 });
        drop(s, it.id);
      });
      close();
      toast('В сфере');
    },
  });
}

function toCare(it) {
  openSheet({
    title: 'В заботу',
    sub: it.text,
    body: [
      field.select('group', 'Куда отнести', CARE_GROUPS.map(g => ({ value: g.key, label: g.name })), 'health'),
      field.select('every', 'Как часто', [
        { value: '1', label: 'раз в месяц' }, { value: '3', label: 'раз в квартал' },
        { value: '6', label: 'раз в полгода' }, { value: '12', label: 'раз в год' },
      ], '12'),
      field.note('«Когда пора» будет считаться от первой отметки, а не от сегодня.'),
    ].join(''),
    primary: 'Перенести',
    onSave: (v, close) => {
      update(s => {
        s.care.items.push({
          id: uid(), name: it.text, group: v.group || 'health', every: Math.max(1, Number(v.every) || 12),
          anchor: 0, last: '', log: [], cost: 0, note: it.note || '', link: '',
        });
        drop(s, it.id);
      });
      close();
      toast('В заботе');
    },
  });
}

export const actions = {
  quickadd: v => { add(v.value); },
  edit: v => editSheet(v.id),
  move: v => moveSheet(v.id),

  /** Самый частый случай — в сегодня, одним тапом и без формы. */
  today: v => {
    const it = byId(v.id);
    if (!it) return;
    update(s => {
      (s.quests[todayISO()] ||= []).push({
        id: uid(), title: it.text, time: '', minutes: 45, sphere: it.sphere || '',
        boss: false, goalId: '', lessonId: '', done: false, note: it.note || '',
      });
      drop(s, it.id);
    });
    toast('На сегодня');
  },
};

/** Быстрое добавление с других экранов — например, с «Дня». */
export function inboxSheet() {
  openSheet({
    title: 'В инбокс',
    sub: 'без даты и обязательств',
    body: [
      field.text('text', 'Что пришло в голову', '', 'одной строкой'),
      field.note('Полежит в инбоксе, пока не решишь, когда это делать.'),
    ].join(''),
    primary: 'Положить',
    onSave: (v, close) => {
      const t = (v.text || '').trim();
      if (!t) return toast('Нужен текст');
      add(t);
      close();
    },
  });
}
