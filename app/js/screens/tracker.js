// Большой трекер: активности по месяцам за год. Всё считается из отметок
// привычек и из динамичных целей месяца — руками сюда ничего не вводится.

import { S, update, uid } from '../store.js';
import { todayISO, monthKey, MONTHS, yearOf } from '../dates.js';
import { h, raw, field, toast, openSheet } from '../ui.js';
import { liveHabits, habitMonthTotal, habitMonthCount, habitTarget, goalsIn, counterOf, isCounter } from '../selectors.js';

/** В ячейке крупные величины сжимаем: 28000 мл → «28к», иначе колонки разъезжаются. */
const cell = n => n >= 10000 ? Math.round(n / 1000) + 'к' : String(n);
const full = n => Number(n).toLocaleString('ru-RU');

const year = () => S.ui.trackYear || yearOf(todayISO());
const mode = () => S.ui.trackMode || 'total';   // total — сколько раз, days — полных дней

export function render() {
  const y = year();
  const months = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  const curM = monthKey(todayISO());
  const habits = liveHabits();

  // Динамичные цели идут отдельными строками: они живут внутри своего месяца.
  const dynamic = {};
  months.forEach(ym => {
    goalsIn('month', ym).filter(g => g.dynamic && isCounter(g)).forEach(g => {
      (dynamic[g.title] ||= {})[ym] = counterOf(g).current;
    });
  });
  const dynNames = Object.keys(dynamic);

  // Свои строки — то, что не является привычкой: «шпагат, ч», «анализы».
  // Значения вводятся руками по месяцам, поэтому режим их не касается.
  const own = S.tracker.rows.map(r => ({
    id: r.id, name: r.name, unit: r.unit, own: true,
    cells: months.map(ym => S.tracker.values[r.id]?.[ym] ?? null),
  }));

  const rows = [
    ...own,
    ...habits.map(hb => ({
      name: hb.name,
      target: habitTarget(hb),
      unit: mode() === 'days' ? 'дн.' : hb.unit,
      cells: months.map(ym => (mode() === 'days' ? habitMonthCount(hb, ym) : habitMonthTotal(hb, ym))),
    })),
    ...dynNames.map(name => ({
      name, dyn: true,
      cells: months.map(ym => dynamic[name][ym] ?? null),
    })),
  ];

  const max = Math.max(1, ...rows.flatMap(r => r.cells.filter(c => c != null)));

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
                const sum = r.cells.reduce((a, c) => a + (c || 0), 0);
                return raw(h`
                  <tr>
                    <th class="tr-name ${r.own ? 'own' : ''}" ${raw(r.own ? `data-act="rowedit" data-id="${r.id}"` : '')}>${r.name}${
                      r.own ? raw(h`<i class="tr-dyn">${r.unit || 'своя'}</i>`)
                      : r.dyn ? raw('<i class="tr-dyn">дин.</i>')
                      : r.target > 1 ? raw(h`<i class="tr-dyn">×${r.target}</i>`) : ''}</th>
                    ${r.cells.map((c, i) => raw(h`<td class="${months[i] === curM ? 'now' : ''} ${c ? 'has' : ''} ${r.own ? 'edit' : ''}"
                      ${raw(r.own ? `data-act="cell" data-id="${r.id}" data-m="${months[i]}"` : '')}
                      style="${c ? `--f:${Math.min(1, c / max)}` : ''}">${c == null ? (r.own ? '' : '·') : c ? cell(c) : ''}</td>`))}
                    <td class="tr-sum">${sum ? cell(sum) : ''}</td>
                  </tr>`);
              })}
            </tbody>
          </table>
        </div>
        <div class="lab" style="padding:6px 4px 0">Таблица прокручивается вбок. Привычки и динамичные цели считаются сами; свои строки заполняются вручную — тапни ячейку.</div>
      </div>
      <button class="add" data-act="rowadd">+ Своя строка</button>`)
    : raw(h`<div class="card dash"><div class="empty">Пока нечего показывать.<br>Трекер собирается из привычек и динамичных целей — или добавь свою строку.</div>
        <button class="add" data-act="rowadd">+ Своя строка</button>
        <button class="btn-ghost" data-act="gohabits">завести привычку</button></div>`)}

    ${rows.length ? raw(h`
      <div class="card mute">
        <div class="caps">Итог года</div>
        ${rows.map(r => {
          const sum = r.cells.reduce((a, c) => a + (c || 0), 0);
          const best = r.cells.reduce((bi, c, i) => ((c || 0) > (r.cells[bi] || 0) ? i : bi), 0);
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
