// Большой трекер: активности по месяцам за год. Всё считается из отметок
// привычек и из динамичных целей месяца — руками сюда ничего не вводится.

import { S } from '../store.js';
import { todayISO, monthKey, MONTHS, yearOf } from '../dates.js';
import { h, raw, toast } from '../ui.js';
import { update } from '../store.js';
import { liveHabits, habitMonthTotal, habitMonthCount, habitTarget, goalsIn, counterOf, isCounter } from '../selectors.js';

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

  const rows = [
    ...habits.map(hb => ({
      name: hb.name,
      target: habitTarget(hb),
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
                    <th class="tr-name">${r.name}${r.dyn ? raw('<i class="tr-dyn">дин.</i>') : r.target > 1 ? raw(h`<i class="tr-dyn">×${r.target}</i>`) : ''}</th>
                    ${r.cells.map((c, i) => raw(h`<td class="${months[i] === curM ? 'now' : ''} ${c ? 'has' : ''}"
                      style="${c ? `--f:${Math.min(1, c / max)}` : ''}">${c == null ? '·' : c || ''}</td>`))}
                    <td class="tr-sum">${sum || ''}</td>
                  </tr>`);
              })}
            </tbody>
          </table>
        </div>
        <div class="lab" style="padding:6px 4px 0">Таблица прокручивается вбок. Точка — динамичной цели в этом месяце не было.</div>
      </div>`)
    : raw(h`<div class="card dash"><div class="empty">Пока нечего показывать.<br>Трекер собирается из привычек и динамичных целей месяца.</div>
        <button class="add" data-act="gohabits">Завести привычку</button></div>`)}

    ${rows.length ? raw(h`
      <div class="card mute">
        <div class="caps">Итог года</div>
        ${rows.map(r => {
          const sum = r.cells.reduce((a, c) => a + (c || 0), 0);
          const best = r.cells.reduce((bi, c, i) => ((c || 0) > (r.cells[bi] || 0) ? i : bi), 0);
          return raw(h`<div class="row between"><span class="lab grow ellip">${r.name}</span>
            <span class="lab">${sum}${sum ? ` · лучший ${MONTHS[best].toLowerCase()}` : ''}</span></div>`);
        })}
      </div>`) : ''}
    <div style="height:4px"></div>`;
}

export const actions = {
  prev: () => update(s => { s.ui.trackYear = year() - 1; }),
  next: () => update(s => { s.ui.trackYear = year() + 1; }),
  mode: v => update(s => { s.ui.trackMode = v.v; }),
  gohabits: () => { location.hash = '#/habits'; },
};
