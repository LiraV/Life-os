// Большой трекер: активности по месяцам за год. Всё считается из отметок
// привычек и из динамичных целей месяца — руками сюда ничего не вводится.

import { S, update, uid } from '../store.js';
import { todayISO, monthKey, MONTHS, yearOf } from '../dates.js';
import { h, raw, field, toast, openSheet } from '../ui.js';
import { buildXlsx, saveFile } from '../xlsx.js';
import { liveHabits, habitMonthTotal, habitMonthCount, habitTarget, goalsIn, counterOf, isCounter } from '../selectors.js';

/** В ячейке крупные величины сжимаем: 28000 мл → «28к», иначе колонки разъезжаются. */
const cell = n => n >= 10000 ? Math.round(n / 1000) + 'к' : String(n);
const full = n => Number(n).toLocaleString('ru-RU');

const year = () => S.ui.trackYear || yearOf(todayISO());
const mode = () => S.ui.trackMode || 'total';   // total — сколько раз, days — полных дней

export const monthsOf = y => Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);

/** Значение привычки за месяц: ручная правка, если она есть, иначе расчёт по дням. */
export function habitCell(hb, ym, md) {
  const fixed = S.tracker.habitValues?.[hb.id]?.[ym]?.[md];
  if (typeof fixed === 'number') return { value: fixed, fixed: true };
  return { value: md === 'days' ? habitMonthCount(hb, ym) : habitMonthTotal(hb, ym), fixed: false };
}

/** Строки таблицы — одни и те же для экрана и для выгрузки. */
export function buildRows(y, md) {
  const months = monthsOf(y);

  const dynamic = {};
  months.forEach(ym => {
    goalsIn('month', ym).filter(g => g.dynamic && isCounter(g)).forEach(g => {
      (dynamic[g.title] ||= {})[ym] = counterOf(g).current;
    });
  });

  return [
    // Свои строки — то, что не является привычкой: «шпагат, ч», «анализы».
    ...S.tracker.rows.map(r => ({
      id: r.id, name: r.name, unit: r.unit, own: true,
      cells: months.map(ym => ({ value: S.tracker.values[r.id]?.[ym] ?? null })),
    })),
    ...liveHabits().map(hb => ({
      id: hb.id, name: hb.name, habit: true,
      target: habitTarget(hb),
      unit: md === 'days' ? 'дн.' : hb.unit,
      cells: months.map(ym => habitCell(hb, ym, md)),
    })),
    ...Object.keys(dynamic).map(name => ({
      name, dyn: true,
      cells: months.map(ym => ({ value: dynamic[name][ym] ?? null })),
    })),
  ];
}

export function render() {
  const y = year();
  const months = monthsOf(y);
  const curM = monthKey(todayISO());
  const rows = buildRows(y, mode());

  const max = Math.max(1, ...rows.flatMap(r => r.cells.map(c => c.value).filter(c => c != null)));

  return h`
    <div class="stepper">
      <button class="arrow" data-act="prev" aria-label="Предыдущий год">‹</button>
      <div style="text-align:center">
        <div class="title" style="font-size:21px">Трекер ${y}</div>
        <div class="lab">по месяцам, из твоих отметок</div>
      </div>
      <button class="arrow" data-act="next" aria-label="Следующий год">›</button>
    </div>

    <div class="pills">
      <button class="pill ${mode() === 'total' ? 'on' : ''}" data-act="mode" data-v="total">Сколько раз</button>
      <button class="pill ${mode() === 'days' ? 'on' : ''}" data-act="mode" data-v="days">Полных дней</button>
    </div>

    ${rows.length ? raw(h`
      <div class="card" style="padding:10px 8px">
        <div class="tr-wrap">
          <table class="tr">
            <thead>
              <tr>
                <th class="tr-name">Активность</th>
                ${months.map((ym, i) => raw(h`<th class="${ym === curM ? 'now' : ''}">${MONTHS[i].slice(0, 3).toLowerCase()}</th>`))}
                <th class="tr-sum">за год</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => {
                const sum = r.cells.reduce((a, c) => a + (c.value || 0), 0);
                return raw(h`
                  <tr>
                    <th class="tr-name ${r.own ? 'own' : ''}" ${raw(r.own ? `data-act="rowedit" data-id="${r.id}"` : '')}>${r.name}${
                      r.own ? raw(h`<i class="tr-dyn">${r.unit || 'своя'}</i>`)
                      : r.dyn ? raw('<i class="tr-dyn">дин.</i>')
                      : r.target > 1 ? raw(h`<i class="tr-dyn">×${r.target}</i>`) : ''}</th>
                    ${r.cells.map((c, i) => raw(h`<td class="${months[i] === curM ? 'now' : ''} ${c.value ? 'has' : ''} ${r.own || r.habit ? 'edit' : ''} ${c.fixed ? 'fixed' : ''}"
                      ${raw(r.own ? `data-act="cell" data-id="${r.id}" data-m="${months[i]}"`
                        : r.habit ? `data-act="hcell" data-id="${r.id}" data-m="${months[i]}"` : '')}
                      style="${c.value ? `--f:${Math.min(1, c.value / max)}` : ''}">${c.value == null ? (r.own ? '' : '·') : c.value ? cell(c.value) : ''}</td>`))}
                    <td class="tr-sum">${sum ? cell(sum) : ''}</td>
                  </tr>`);
              })}
            </tbody>
          </table>
        </div>
        <div class="lab" style="padding:6px 4px 0">Таблица прокручивается вбок. Тапни ячейку, чтобы вписать значение за месяц — у привычек это заменит расчёт по дням, такие ячейки помечены точкой. Динамичные цели правятся в Планах.</div>
      </div>
      <button class="add" data-act="rowadd">+ Своя строка</button>
      <button class="add" data-act="export">Выгрузить в Excel</button>`)
    : raw(h`<div class="card dash"><div class="empty">Пока нечего показывать.<br>Трекер собирается из привычек и динамичных целей — или добавь свою строку.</div>
        <button class="add" data-act="rowadd">+ Своя строка</button>
        <button class="btn-ghost" data-act="gohabits">завести привычку</button></div>`)}

    ${rows.length ? raw(h`
      <div class="card mute">
        <div class="caps">Итог года</div>
        ${rows.map(r => {
          const sum = r.cells.reduce((a, c) => a + (c.value || 0), 0);
          const best = r.cells.reduce((bi, c, i) => ((c.value || 0) > (r.cells[bi].value || 0) ? i : bi), 0);
          return raw(h`<div class="row between"><span class="lab grow ellip">${r.name}</span>
            <span class="lab">${full(sum)}${r.unit ? ' ' + r.unit : ''}${sum ? ` · лучший ${MONTHS[best].toLowerCase()}` : ''}</span></div>`);
        })}
      </div>`) : ''}
    <div style="height:4px"></div>`;
}

function rowSheet(row) {
  const isNew = !row;
  openSheet({
    title: isNew ? 'Своя строка' : 'Строка трекера',
    sub: isNew ? 'то, что не является привычкой: «шпагат, ч», «анализы»' : row.name,
    body: [
      field.text('name', 'Название', row?.name || '', 'например, «Шпагат»'),
      field.text('unit', 'В чём считаем', row?.unit || '', 'ч, раз, кг — необязательно'),
      field.note('Значения по месяцам вводятся прямо в таблице: тапни ячейку.'),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        if (isNew) s.tracker.rows.push({ id: uid(), name, unit: (v.unit || '').trim() });
        else {
          const x = s.tracker.rows.find(y => y.id === row.id);
          if (x) { x.name = name; x.unit = (v.unit || '').trim(); }
        }
      });
      close();
      toast(isNew ? 'Строка добавлена' : 'Сохранено');
    },
    danger: isNew ? null : 'Удалить строку',
    onDanger: (_v, close) => {
      update(s => {
        s.tracker.rows = s.tracker.rows.filter(x => x.id !== row.id);
        delete s.tracker.values[row.id];
      });
      close();
      toast('Удалила вместе со значениями');
    },
  });
}

export const actions = {
  prev: () => update(s => { s.ui.trackYear = year() - 1; }),
  next: () => update(s => { s.ui.trackYear = year() + 1; }),
  mode: v => update(s => { s.ui.trackMode = v.v; }),
  gohabits: () => { location.hash = '#/habits'; },

  rowadd: () => rowSheet(null),

  /** Ручное значение привычки за месяц: заменяет расчёт по дням, но не трогает сами отметки. */
  hcell: v => {
    const hb = S.habits.find(x => x.id === v.id);
    if (!hb) return;
    const md = mode();
    const i = Number(v.m.slice(5, 7)) - 1;
    const auto = md === 'days' ? habitMonthCount(hb, v.m) : habitMonthTotal(hb, v.m);
    const fixed = S.tracker.habitValues?.[hb.id]?.[v.m]?.[md];
    const label = md === 'days' ? 'Полных дней' : `Сколько${hb.unit ? ', ' + hb.unit : ' раз'}`;

    openSheet({
      title: `${hb.name} · ${MONTHS[i].toLowerCase()}`,
      sub: `по отметкам получается ${auto}${md === 'days' ? ' дн.' : hb.unit ? ' ' + hb.unit : ''}`,
      body: [
        field.number('n', label, fixed ?? auto, { min: 0 }),
        field.note('Значение запишется поверх расчёта — удобно, чтобы перенести прошлые месяцы. Ежедневные отметки при этом не меняются, их всегда можно вернуть.'),
      ].join(''),
      primary: 'Записать',
      onSave: (val, close) => {
        const n = Math.max(0, Number(val.n) || 0);
        update(s => {
          const byHabit = (s.tracker.habitValues[hb.id] ||= {});
          const byMonth = (byHabit[v.m] ||= {});
          byMonth[md] = n;
        });
        close();
        toast('Записала');
      },
      secondary: fixed != null ? 'вернуть расчётное' : null,
      onSecondary: (_val, close) => {
        update(s => {
          const byHabit = s.tracker.habitValues[hb.id];
          const byMonth = byHabit?.[v.m];
          if (!byMonth) return;
          delete byMonth[md];
          if (!Object.keys(byMonth).length) delete byHabit[v.m];
          if (!Object.keys(byHabit).length) delete s.tracker.habitValues[hb.id];
        });
        close();
        toast('Вернула расчёт по отметкам');
      },
    });
  },

  /** Выгрузка: две сводные таблицы и все дневные отметки за год. */
  export: async () => {
    const y = year();
    const months = monthsOf(y);
    const head = ['Активность', 'Единица', ...months.map((_, i) => MONTHS[i]), 'За год'];

    const sheet = md => ({
      name: md === 'days' ? 'Полных дней' : 'Сколько раз',
      rows: [
        head,
        ...buildRows(y, md).map(r => {
          const cells = r.cells.map(c => c.value);
          const sum = cells.reduce((a, c) => a + (c || 0), 0);
          return [r.name, r.unit || '', ...cells, sum];
        }),
      ],
    });

    const daily = [['Дата', 'Привычка', 'Значение', 'Норма', 'Норма закрыта']];
    liveHabits().forEach(hb => {
      Object.keys(hb.log || {}).filter(d => d.startsWith(String(y))).sort().forEach(d => {
        const n = Number(hb.log[d]) || 0;
        daily.push([d, hb.name, n, habitTarget(hb), n >= habitTarget(hb) ? 'да' : 'нет']);
      });
    });

    try {
      const bytes = buildXlsx([sheet('total'), sheet('days'), { name: 'По дням', rows: daily }]);
      const how = await saveFile(bytes, `life-os-tracker-${y}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      if (how === 'share') toast('Отправила в «Поделиться»');
      else if (how === 'download') toast('Файл скачан');
    } catch (e) {
      console.error('[lifeos] выгрузка не удалась', e);
      toast('Не получилось выгрузить: ' + String(e.message || e).slice(0, 40));
    }
  },
  rowedit: v => { const r = S.tracker.rows.find(x => x.id === v.id); if (r) rowSheet(r); },

  cell: v => {
    const row = S.tracker.rows.find(x => x.id === v.id);
    if (!row) return;
    const i = Number(v.m.slice(5, 7)) - 1;
    openSheet({
      title: `${row.name} · ${MONTHS[i].toLowerCase()}`,
      body: field.number('n', `Сколько${row.unit ? ', ' + row.unit : ''}`, S.tracker.values[v.id]?.[v.m] ?? '', { min: 0 }),
      primary: 'Сохранить',
      onSave: (val, close) => {
        const n = val.n === '' ? null : Math.max(0, Number(val.n) || 0);
        update(s => {
          const vals = (s.tracker.values[v.id] ||= {});
          if (n == null) delete vals[v.m]; else vals[v.m] = n;
        });
        close();
      },
      secondary: 'очистить',
      onSecondary: (_val, close) => {
        update(s => { if (s.tracker.values[v.id]) delete s.tracker.values[v.id][v.m]; });
        close();
      },
    });
  },
};
