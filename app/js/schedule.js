// Расписание: правило «по каким дням недели это бывает». Одно на все сферы —
// занятие с полки, предмет учёбы и шаблон тренировки настраиваются одинаково.
//
// Расписание всегда опционально: пока правил нет, ничего не меняется. Событие
// не превращается в запись заранее — день считается из правила, поэтому
// расписание можно поправить задним числом и прошлое не поедет.

import { S, update, uid, XP, addXp, touchTracker } from './store.js';
import { DOW, todayISO, monthKey } from './dates.js';
import { h, raw, field, toast, openSheet } from './ui.js';
import { schedulesOf, scheduleLabel, scheduleTitle, templateById, scheduleMonthCount } from './selectors.js';

/** Подпись одной строкой: «пн, чт · 19:30» или что расписания нет. */
export const scheduleHint = (kind, refId) => {
  const list = schedulesOf(kind, refId);
  return list.length ? list.map(scheduleLabel).join(' · ') : 'расписания нет';
};

/**
 * Блок расписания в карточке сущности. Пусто — значит просто ничего не
 * появляется на дне: расписание нигде не обязательно.
 */
export const scheduleBlock = (kind, refId) => {
  const list = schedulesOf(kind, refId);
  return h`
    <div class="row between"><div class="caps">Расписание</div>
      <button class="q-edit" data-act="schedadd" data-k="${kind}" data-id="${refId}">+ день</button></div>
    ${list.length ? list.map(sc => raw(h`
      <button class="row between care-name" data-act="schededit" data-k="${kind}" data-id="${refId}" data-s="${sc.id}">
        <span class="lab grow ellip">${sc.off ? '⏸ ' : ''}${scheduleLabel(sc)}</span>
        <span class="lab">${sc.place || 'изменить'} ›</span>
      </button>`))
      : raw('<div class="lab">Пусто — и это нормально: без расписания просто ничего не появляется на дне само.</div>')}
    ${list.length ? raw(h`<div class="lab">По расписанию в этом месяце — ${monthTotal(list)}.</div>`) : ''}`;
};

/** Сколько раз это выпадает на текущий месяц: полезно сверить с нормой. */
function monthTotal(list) {
  const ym = monthKey(todayISO());
  const n = list.reduce((a, sc) => a + (sc.off ? 0 : scheduleMonthCount(sc, ym)), 0);
  const a = n % 100, b = n % 10;
  const word = a > 10 && a < 20 ? 'раз' : b === 1 ? 'раз' : b > 1 && b < 5 ? 'раза' : 'раз';
  return `${n} ${word}`;
}

const dayBoxes = days => h`
  <div class="fld"><span>По каким дням</span>
    <div class="days">
      ${DOW.map((d, i) => raw(h`
        <label class="day-box"><input type="checkbox" name="d${i}" ${raw(days.includes(i) ? 'checked' : '')}><span>${d}</span></label>`))}
    </div>
  </div>`;

/** Одно правило: дни, время, длительность, срок. */
export function ruleSheet(kind, refId, rule) {
  const isNew = !rule;
  const sc = rule || { id: uid(), kind, refId, days: [], time: '', dur: 60, every: 1, from: '', to: '', place: '', note: '', off: false };
  openSheet({
    title: isNew ? 'Когда это бывает' : scheduleLabel(sc),
    sub: scheduleTitle(sc),
    body: [
      dayBoxes(sc.days || []),
      field.time('time', 'Во сколько', sc.time || ''),
      field.number('dur', 'Сколько длится', sc.dur || '', { min: 0, suffix: 'мин' }),
      field.opts('every', 'Как часто', [{ value: '1', label: 'Каждую неделю' }, { value: '2', label: 'Раз в две недели' }], String(sc.every || 1)),
      field.date('from', 'С какого дня', sc.from || ''),
      field.date('to', 'По какой — если известен', sc.to || ''),
      field.text('place', 'Где', sc.place || '', 'адрес, кабинет, ссылка'),
      `<label class="row tight" style="font-size:13px"><input type="checkbox" name="off" ${sc.off ? 'checked' : ''}> Пауза — не показывать на дне</label>`,
      field.note('«Раз в две недели» считается от дня, указанного выше: с него и пойдёт чередование.'),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const days = DOW.map((_, i) => (v['d' + i] ? i : -1)).filter(i => i >= 0);
      if (!days.length) return toast('Выбери хотя бы один день');
      update(s => {
        const next = {
          ...sc, days, time: v.time || '', dur: Math.max(0, Number(v.dur) || 0),
          every: Number(v.every) === 2 ? 2 : 1, from: v.from || '', to: v.to || '',
          place: (v.place || '').trim(), off: !!v.off,
        };
        const i = s.schedules.findIndex(x => x.id === sc.id);
        if (i >= 0) s.schedules[i] = next; else s.schedules.push(next);
      });
      close();
    },
    danger: isNew ? null : 'Убрать из расписания',
    onDanger: (_v, close) => {
      update(s => { s.schedules = s.schedules.filter(x => x.id !== sc.id); });
      close();
    },
  });
}

/**
 * Отметка события дня. Отдельной галочки у расписания нет: отмечается та же
 * запись, что и обычно, — занятие в полке, посещение предмета, тренировка.
 */
export function scheduleMark(sc, date) {
  if (sc.kind === 'lesson') {
    update(s => {
      const l = s.lessons.find(x => x.id === sc.refId);
      if (!l) return;
      l.log ||= {};
      if (l.log[date]) delete l.log[date];
      else { l.log[date] = 1; addXp(XP.quest); }
      touchTracker(s);
    });
    return;
  }
  if (sc.kind === 'subject') {
    update(s => {
      s.study.attend ||= {};
      const byDate = (s.study.attend[sc.refId] ||= {});
      if (byDate[date]) delete byDate[date];
      else { byDate[date] = 1; addXp(XP.quest); }
    });
    return;
  }
  if (sc.kind === 'template') {
    // Тренировка становится настоящей записью дня — с составом из шаблона.
    const t = templateById(sc.refId);
    update(s => {
      s.sport.workouts.push({
        id: uid(), date, title: t?.name || 'Тренировка', templateId: sc.refId,
        lessonId: '', goalId: '', done: false, note: '',
        sets: (t?.sets || []).map(x => ({ ...x, id: uid(), done: false })),
      });
      touchTracker(s);
    });
    toast('Тренировка на дне — отметь её, когда сделаешь');
  }
}

/** Общие действия — подмешиваются в таблицы действий сфер. */
export const scheduleActions = {
  schedadd: v => ruleSheet(v.k, v.id, null),
  schededit: v => ruleSheet(v.k, v.id, S.schedules.find(x => x.id === v.s)),
};
