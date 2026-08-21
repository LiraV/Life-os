// «Тело»: месячные отмечаются по дням в календаре — любым числом, задним числом
// и с правкой. Всё остальное (день цикла, фаза, средняя длина, прогноз) считается
// из этих отметок.

import { S, update, uid, XP, addXp } from '../store.js';
import { todayISO, addDays, dayShort, diffDays, monthKey, addMonths, monthTitle, monthDates, dowIndex, DOW } from '../dates.js';
import { h, raw, field, bar, toast, openSheet, confirmSheet } from '../ui.js';
import { cycleInfo, periodBlocks, measureDeltas } from '../selectors.js';

const sign = n => n == null ? '' : n > 0 ? `+${n}` : `${n}`;
const fmt = (v, unit) => v == null || v === '' ? '—' : `${v} ${unit}`;
const calMonth = () => S.ui.calMonth || monthKey(todayISO());

export function render() {
  const c = cycleInfo();
  const m = measureDeltas();
  const cur = m.cur;

  return h`
    <div class="title">Тело</div>
    <div class="sub">Дом, а не проект. Отмечай как есть — задним числом тоже можно.</div>

    <div class="card">
      <div class="row between">
        <div class="caps">Цикл</div>
        <button class="q-edit" data-act="range">+ отметить период</button>
      </div>
      ${c && c.day ? raw(h`
        <div class="ink"><b>день ${c.day}</b> · ${c.phase}</div>
        ${raw(bar(c.pct, c.bleeding))}
        <div class="lab">${c.hint}</div>
        <div class="lab">Средний цикл ${c.avgCycle} ${plural(c.avgCycle, 'день', 'дня', 'дней')}${c.gaps.length ? '' : ' (пока по умолчанию — нужен второй цикл)'} ·
          месячные в среднем ${c.avgLen} ${plural(c.avgLen, 'день', 'дня', 'дней')} ·
          ${c.daysToNext >= 0 ? `следующие примерно ${dayShort(c.next)}` : `задержка ${-c.daysToNext} ${plural(-c.daysToNext, 'день', 'дня', 'дней')}`}</div>`)
      : raw('<div class="lab">Отметь дни в календаре — и я посчитаю день цикла, фазу и прогноз. Одной отметки хватит, чтобы начать.</div>')}
    </div>

    ${S.health.startsOnlyNotice ? raw(h`
      <div class="card dash">
        <div class="ink">Отметки из прошлой версии перенесены.</div>
        <div class="lab">Там хранились только даты начала, поэтому каждый цикл стоит одним днём —
          дотапай остальные дни в календаре, и средние пересчитаются.</div>
        <button class="btn-ghost" data-act="noticeoff">понятно, убрать</button>
      </div>`) : ''}

    ${raw(calendar(c))}

    <div class="row">
      <button class="pill grow" style="text-align:center" data-act="tapToday">${S.health.days[todayISO()] ? 'Снять отметку с сегодня' : 'Отметить сегодня'}</button>
      <button class="pill" data-act="symptom">Симптом</button>
    </div>

    ${raw(cyclesList())}
    ${raw(symptomsCard())}

    <div class="card">
      <div class="row between"><div class="caps">Замеры тела</div>
        <span class="lab">${cur ? dayShort(cur.date) : 'нет данных'}</span></div>
      ${cur ? raw(h`
        <div class="row between"><span class="ink">Вес</span><span class="ink">${fmt(cur.weight, 'кг')} <i class="lab">${sign(m.delta.weight)}</i></span></div>
        <div class="row between"><span class="ink">Талия</span><span class="ink">${fmt(cur.waist, 'см')} <i class="lab">${sign(m.delta.waist)}</i></span></div>
        <div class="row between"><span class="ink">Бёдра</span><span class="ink">${fmt(cur.hips, 'см')} <i class="lab">${sign(m.delta.hips)}</i></span></div>
        <div class="row between"><span class="ink">Сон</span><span class="ink">${fmt(cur.sleep, 'ч')} <i class="lab">цель ${S.user.sleep} ч</i></span></div>`)
      : raw('<div class="empty">Первый замер — точка отсчёта, а не оценка.</div>')}
      <button class="add" data-act="measure">+ Новый замер</button>
    </div>

    ${m.list.length > 1 ? raw(h`
      <div class="card mute">
        <div class="caps">История замеров</div>
        ${m.list.slice(-6).reverse().map(x => raw(h`<div class="row between"><span class="lab">${dayShort(x.date)}</span>
          <span class="lab">${fmt(x.weight, 'кг')} · ${fmt(x.waist, 'см')} · сон ${fmt(x.sleep, 'ч')}</span>
          <button class="q-edit" data-act="mdel" data-id="${x.id}">×</button></div>`))}
      </div>`) : ''}
    <div style="height:4px"></div>`;
}

const plural = (n, a, b, c) => {
  const mm = n % 100, d = n % 10;
  return mm > 4 && mm < 20 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c;
};

// ── календарь ───────────────────────────────────────────────────
function calendar(c) {
  const ym = calMonth();
  const dates = monthDates(ym);
  const lead = dowIndex(dates[0]);
  const t = todayISO();
  const starts = new Set(periodBlocks().map(b => b.start));
  // Прогноз рисуем только вперёд и только когда есть от чего считать.
  const predicted = new Set();
  if (c && c.next && c.avgLen) {
    for (let i = 0; i < c.avgLen; i++) {
      const d = addDays(c.next, i);
      if (d > t) predicted.add(d);
    }
  }

  return h`
    <div class="card">
      <div class="stepper">
        <button class="arrow" data-act="cprev" aria-label="Предыдущий месяц">‹</button>
        <div class="lab">${monthTitle(ym)}</div>
        <button class="arrow" data-act="cnext" aria-label="Следующий месяц">›</button>
      </div>
      <div class="cal-head">${DOW.map(d => raw(h`<span>${d}</span>`))}</div>
      <div class="cal">
        ${Array.from({ length: lead }, () => raw('<span></span>'))}
        ${dates.map(d => {
          const on = !!S.health.days[d];
          const cls = [on ? 'on' : '', starts.has(d) ? 'start' : '', d === t ? 'today' : '', predicted.has(d) ? 'pred' : '', d > t ? 'fut' : ''].filter(Boolean).join(' ');
          return raw(h`<button class="cal-d ${cls}" data-act="tap" data-d="${d}" ${raw(d > t ? 'disabled' : '')}
            aria-pressed="${on ? 'true' : 'false'}" aria-label="${dayShort(d)}">${Number(d.slice(8))}</button>`);
        })}
      </div>
      <div class="cal-legend">
        <span><i class="sw-on"></i> отмечено</span>
        <span><i class="sw-pred"></i> прогноз</span>
        <span><i class="sw-today"></i> сегодня</span>
      </div>
      <div class="lab">Тапни любой день — прошлые тоже. Пропуск в один-два дня считается теми же месячными.</div>
    </div>`;
}

// ── список циклов ───────────────────────────────────────────────
function cyclesList() {
  const blocks = periodBlocks().slice().reverse();
  if (!blocks.length) return '';
  const starts = periodBlocks().map(b => b.start);
  return h`
    <div class="card">
      <div class="caps">Циклы</div>
      ${blocks.slice(0, 8).map(b => {
        const i = starts.indexOf(b.start);
        const gap = i > 0 ? diffDays(b.start, starts[i - 1]) : null;
        return raw(h`
          <div class="row between">
            <div class="grow">
              <div class="ink">${b.len > 1 ? `${dayShort(b.start)} — ${dayShort(b.end)}` : dayShort(b.start)}</div>
              <div class="lab">${b.len} ${plural(b.len, 'день', 'дня', 'дней')}${gap ? ` · цикл ${gap} ${plural(gap, 'день', 'дня', 'дней')}` : ''}</div>
            </div>
            <button class="q-edit" data-act="cedit" data-d="${b.start}">изменить ›</button>
          </div>`);
      })}
      ${blocks.length > 8 ? raw(h`<div class="lab">…и ещё ${blocks.length - 8}</div>`) : ''}
    </div>`;
}

function symptomsCard() {
  if (!S.health.symptoms.length) return '';
  return h`
    <div class="card mute">
      <div class="caps">Симптомы</div>
      ${S.health.symptoms.slice(0, 6).map(x => raw(h`
        <div class="row between"><span class="lab grow">${dayShort(x.date)} — ${x.text}</span>
          <button class="q-edit" data-act="sdel" data-id="${x.id}">×</button></div>`))}
    </div>`;
}

// ── шторки ──────────────────────────────────────────────────────
/** Проставить или снять диапазон дат — сюда сходится и «отметить период», и правка цикла. */
function setRange(s, from, to, on) {
  const [a, b] = from <= to ? [from, to] : [to, from];
  for (let d = a; d <= b; d = addDays(d, 1)) {
    if (on) s.health.days[d] = true; else delete s.health.days[d];
  }
}

function rangeSheet(block) {
  const isNew = !block;
  const t = todayISO();
  const guessLen = cycleInfo()?.avgLen || 5;
  const start = block ? block.start : addDays(t, -(guessLen - 1));
  const end = block ? block.end : t;

  openSheet({
    title: isNew ? 'Отметить месячные' : 'Правка цикла',
    sub: isNew ? 'Можно задним числом — хоть за прошлый месяц' : `сейчас: ${dayShort(block.start)} — ${dayShort(block.end)}`,
    body: [
      field.date('from', 'Начало', start),
      field.date('to', 'Конец — или тот же день, если ещё идут', end),
      field.note('Дни между этими датами будут отмечены. Отдельные дни можно потом поправить тапом в календаре.'),
    ].join(''),
    primary: 'Сохранить',
    onSave: (v, close) => {
      const from = v.from, to = v.to || v.from;
      if (!from) return toast('Нужна дата начала');
      if (from > todayISO()) return toast('Будущее пока не отмечаем');
      if (diffDays(to, from) > 14) return toast('Больше двух недель — похоже на ошибку в датах');
      update(s => {
        if (block) setRange(s, block.start, block.end, false);   // старый диапазон убираем целиком
        setRange(s, from, to > todayISO() ? todayISO() : to, true);
        s.ui.calMonth = monthKey(from);
      });
      close();
      toast(isNew ? 'Отмечено' : 'Цикл поправлен');
    },
    danger: isNew ? null : 'Удалить этот цикл',
    onDanger: (_v, close) => {
      close();
      confirmSheet('Удалить цикл?', `${dayShort(block.start)} — ${dayShort(block.end)} будет снят с календаря.`, 'Да, удалить', () => {
        update(s => setRange(s, block.start, block.end, false));
        toast('Удалено');
      });
    },
  });
}

export const actions = {
  noticeoff: () => update(s => { delete s.health.startsOnlyNotice; }),
  cprev: () => update(s => { s.ui.calMonth = addMonths(calMonth(), -1); }),
  cnext: () => update(s => { s.ui.calMonth = addMonths(calMonth(), 1); }),

  tap: v => {
    if (v.d > todayISO()) return;
    update(s => { if (s.health.days[v.d]) delete s.health.days[v.d]; else s.health.days[v.d] = true; });
  },
  tapToday: () => {
    const t = todayISO();
    update(s => { if (s.health.days[t]) delete s.health.days[t]; else s.health.days[t] = true; s.ui.calMonth = monthKey(t); });
    toast(S.health.days[t] ? 'Отмечено' : 'Отметка снята');
  },

  range: () => rangeSheet(null),
  cedit: v => {
    const block = periodBlocks().find(b => b.start === v.d);
    if (block) rangeSheet(block);
  },

  symptom: () => openSheet({
    title: 'Симптом',
    body: [
      field.date('date', 'Когда', todayISO()),
      field.opts('text', 'Что чувствуешь', ['тянет низ живота', 'болит голова', 'нет сил', 'отёки', 'настроение вниз'], 'нет сил'),
      field.text('own', 'Или своими словами', ''),
    ].join(''),
    primary: 'Записать',
    onSave: (v, close) => {
      const text = (v.own || '').trim() || v.text;
      update(s => {
        s.health.symptoms.unshift({ id: uid(), date: v.date || todayISO(), text });
        s.health.symptoms.sort((a, b) => b.date.localeCompare(a.date));
      });
      close();
      toast('Записала');
    },
  }),
  sdel: v => update(s => { s.health.symptoms = s.health.symptoms.filter(x => x.id !== v.id); }),

  measure: () => {
    const last = measureDeltas().cur;
    openSheet({
      title: 'Новый замер',
      sub: 'Пустые поля просто не запишутся',
      body: [
        field.date('date', 'Когда', todayISO()),
        field.number('weight', 'Вес', '', { min: 0, suffix: 'кг' }),
        field.number('waist', 'Талия', '', { min: 0, suffix: 'см' }),
        field.number('hips', 'Бёдра', '', { min: 0, suffix: 'см' }),
        field.number('sleep', 'Сон в среднем', '', { min: 0, max: 14, suffix: 'ч' }),
        last ? field.note(`Прошлый раз: ${fmt(last.weight, 'кг')} · ${fmt(last.waist, 'см')} · ${fmt(last.hips, 'см')}`) : '',
      ].join(''),
      primary: 'Сохранить · +5 XP',
      onSave: (v, close) => {
        const num = x => x === '' || x == null ? null : Number(x);
        const r = { id: uid(), date: v.date || todayISO(), weight: num(v.weight), waist: num(v.waist), hips: num(v.hips), sleep: num(v.sleep) };
        if ([r.weight, r.waist, r.hips, r.sleep].every(x => x == null)) return toast('Заполни хотя бы одно поле');
        update(s => { s.health.measures.push(r); addXp(XP.measure); });
        close();
        toast('Замер сохранён');
      },
    });
  },

  mdel: v => update(s => { s.health.measures = s.health.measures.filter(x => x.id !== v.id); }),
};
