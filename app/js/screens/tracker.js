// Большой трекер: активности по месяцам за год. Всё считается из отметок
// привычек и из динамичных целей месяца — руками сюда ничего не вводится.

import { S, update, uid, touchTracker } from '../store.js';
import { todayISO, monthKey, MONTHS, yearOf, daysInMonth, dayShort, stampLabel } from '../dates.js';
import { h, raw, field, toast, openSheet } from '../ui.js';
import { buildXlsx, saveFile, readXlsx, pickFile } from '../xlsx.js';
import { liveHabits, habitMonthCount, habitTarget, habitDates, habitCount, goalsIn, counterOf, isCounter, liveLessons, lessonMonth, energyMonth, sphereLogMonth,
  sportTags, tagById, tagMonthCount, tagUsedIn, booksDoneIn, booksDoneYear } from '../selectors.js';

/** В ячейке крупные величины сжимаем: 28000 мл → «28к», иначе колонки разъезжаются. */
const cell = n => n >= 10000 ? Math.round(n / 1000) + 'к' : String(n);
const full = n => Number(n).toLocaleString('ru-RU');


const year = () => S.ui.trackYear || yearOf(todayISO());

export const monthsOf = y => Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);

/** Занятий за месяц: ручная правка поверх журнала занятий. */
export function lessonCell(l, ym) {
  const fixed = S.tracker.lessonValues?.[l.id]?.[ym];
  if (typeof fixed === 'number') return { value: fixed, fixed: true };
  return { value: lessonMonth(l, ym), fixed: false };
}

/** Сколько раз за месяц была эта пилюля: ручная правка поверх счёта по журналу. */
export function tagCell(tag, ym) {
  const fixed = S.tracker.tagValues?.[tag.id]?.[ym];
  if (typeof fixed === 'number') return { value: fixed, fixed: true };
  return { value: tagMonthCount(tag.id, ym), fixed: false };
}

/** Полных дней за месяц: ручная правка, если она есть, иначе расчёт по отметкам. */
export function habitCell(hb, ym) {
  const fixed = S.tracker.habitValues?.[hb.id]?.[ym];
  if (typeof fixed === 'number') return { value: fixed, fixed: true };
  return { value: habitMonthCount(hb, ym), fixed: false };
}

/** Свои сферы, которые ведут журнал: их месяц — готовая строка трекера. */
const customLogSpheres = () => (S.customSpheres || [])
  .filter(sp => !sp.archived && (sp.kinds || []).includes('log'));

/** Строки таблицы — одни и те же для экрана и для выгрузки. */
export function buildRows(y) {
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
      unit: 'дн.',
      cells: months.map(ym => habitCell(hb, ym)),
    })),
    // Свои сферы с журналом: считаются так же, как занятия, — сами.
    ...customLogSpheres().map(sp => ({
      id: sp.key, name: sp.name, unit: 'дн.',
      cells: months.map(ym => ({ value: sphereLogMonth(sp.key, ym) })),
    })),
    // Занятия с полки обучения считаются сами — вручную их заводить не нужно.
    ...liveLessons().filter(l => l.kind === 'practice').map(l => ({
      id: l.id, name: l.name, lesson: true, unit: 'занятий',
      cells: months.map(ym => lessonCell(l, ym)),
    })),
    ...Object.keys(dynamic).map(name => ({
      name, dyn: true,
      cells: months.map(ym => ({ value: dynamic[name][ym] ?? null })),
    })),
    // Тренировки считаются пилюлями: «пресс», «руки», «зал с тренером».
    // Программа со временем меняется, а пилюля остаётся — статистика не рвётся.
    ...sportTags().filter(t => tagUsedIn(t.id, y) || S.tracker.tagValues?.[t.id]).map(t => ({
      id: t.id, name: t.name, tag: true, unit: 'трен.',
      cells: months.map(ym => tagCell(t, ym)),
    })),
    // Книги — сколько дочитано за месяц. Строка появляется, когда за год
    // закрыта хотя бы одна: пустую строку на полке держать незачем.
    ...(booksDoneYear(y).length ? [{
      name: 'Книги', book: true, unit: 'шт.',
      cells: months.map(ym => ({ value: booksDoneIn(ym).length || null })),
    }] : []),
    // Энергия — среднее за месяц, поэтому за год у неё тоже среднее, а не сумма.
    { name: 'Энергия', avg: true, unit: 'сред.', cells: months.map(ym => ({ value: energyMonth(ym) })) },
  ];
}

export function render() {
  const y = year();
  const months = monthsOf(y);
  const curM = monthKey(todayISO());
  const rows = buildRows(y);

  // Заливку считаем внутри строки: у энергии шкала до ста, у привычек — до тридцати одного.
  const rowMax = r => Math.max(1, ...r.cells.map(c => c.value).filter(c => c != null));

  return h`
    <div class="stepper">
      <button class="arrow" data-act="prev" aria-label="Предыдущий год">‹</button>
      <div style="text-align:center">
        <div class="title" style="font-size:21px">Трекер ${y}</div>
        <div class="lab">полных дней по месяцам</div>
        ${S.tracker.updatedAt ? raw(h`<div class="lab">обновлён ${stampLabel(S.tracker.updatedAt)}</div>`) : ''}
      </div>
      <button class="arrow" data-act="next" aria-label="Следующий год">›</button>
    </div>

    ${raw(duplicateHint())}

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
                const vals = r.cells.map(c => c.value).filter(c => c != null);
                const sum = r.avg
                  ? (vals.length ? Math.round(vals.reduce((a, c) => a + c, 0) / vals.length) : 0)
                  : r.best
                  ? (vals.length ? (r.dir === 'down' ? Math.min(...vals) : Math.max(...vals)) : 0)
                  : r.cells.reduce((a, c) => a + (c.value || 0), 0);
                const mx = rowMax(r);
                return raw(h`
                  <tr>
                    <th class="tr-name ${r.own ? 'own' : ''}" ${raw(r.own ? `data-act="rowedit" data-id="${r.id}"` : '')}>${r.name}${
                      r.own ? raw(h`<i class="tr-dyn">${r.unit || 'своя'}</i>`)
                      : r.lesson ? raw('<i class="tr-dyn">занятия</i>')
                      : r.avg ? raw('<i class="tr-dyn">сред.</i>')
                      : r.tag ? raw('<i class="tr-dyn">трен.</i>')
                      : r.book ? raw('<i class="tr-dyn">книг</i>')
                      : r.best ? raw(h`<i class="tr-dyn">${r.unit}</i>`)
                      : r.dyn ? raw('<i class="tr-dyn">дин.</i>')
                      : r.target > 1 ? raw(h`<i class="tr-dyn">×${r.target}</i>`) : ''}</th>
                    ${r.cells.map((c, i) => raw(h`<td class="${months[i] === curM ? 'now' : ''} ${c.value ? 'has' : ''} ${r.own || r.habit || r.lesson || r.tag ? 'edit' : ''} ${c.fixed ? 'fixed' : ''}"
                      ${raw(r.own ? `data-act="cell" data-id="${r.id}" data-m="${months[i]}"`
                        : r.habit ? `data-act="hcell" data-id="${r.id}" data-m="${months[i]}"`
                        : r.lesson ? `data-act="lcell" data-id="${r.id}" data-m="${months[i]}"`
                        : r.tag ? `data-act="xcell" data-id="${r.id}" data-m="${months[i]}"` : '')}
                      style="${c.value ? `--f:${Math.min(1, c.value / mx)}` : ''}">${c.value == null ? (r.own ? '' : '·') : c.value ? cell(c.value) : ''}</td>`))}
                    <td class="tr-sum">${sum ? cell(sum) : ''}</td>
                  </tr>`);
              })}
            </tbody>
          </table>
        </div>
        <div class="lab" style="padding:6px 4px 0">Считаются только дни, когда норма закрыта целиком. Таблица прокручивается вбок; тапни ячейку, чтобы вписать месяц руками — такие ячейки помечены точкой. Динамичные цели правятся в Планах.</div>
      </div>
      <button class="add" data-act="rowadd">+ Своя строка</button>
      <button class="add" data-act="export">Выгрузить в Excel</button>
      <button class="add" data-act="import">Загрузить из Excel</button>`)
    : raw(h`<div class="card dash"><div class="empty">Пока нечего показывать.<br>Трекер собирается из привычек и динамичных целей — или добавь свою строку.</div>
        <button class="add" data-act="rowadd">+ Своя строка</button>
        <button class="btn-ghost" data-act="gohabits">завести привычку</button></div>`)}


    ${rows.length ? raw(h`
      <div class="card mute">
        <div class="caps">Итог года</div>
        ${rows.map(r => {
          const vals = r.cells.map(c => c.value).filter(c => c != null);
          const sum = r.avg
            ? (vals.length ? Math.round(vals.reduce((a, c) => a + c, 0) / vals.length) : 0)
            : r.cells.reduce((a, c) => a + (c.value || 0), 0);
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
      isNew || !mergeTargets().length ? '' : field.select('merge', 'Это то же, что…',
        [{ value: '', label: 'отдельная строка' },
          ...mergeTargets().map(t => ({ value: `${t.kind}:${t.id}`,
            label: `${t.name} · ${{ lesson: 'занятие', habit: 'привычка', tag: 'пилюля тренировки' }[t.kind]}` }))], ''),
      isNew ? '' : field.note('Если выбрать, строка сольётся с ним: месячные значения станут ручными правками, а дубль пропадёт.'),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      if (!isNew && v.merge) {
        const [kind, id] = v.merge.split(':');
        close();
        return actions.mergerow({ id: row.id, k: kind, t: id });
      }
      update(s => {
        if (isNew) s.tracker.rows.push({ id: uid(), name, unit: (v.unit || '').trim() });
        else {
          const x = s.tracker.rows.find(y => y.id === row.id);
          if (x) { x.name = name; x.unit = (v.unit || '').trim(); }
        }
        touchTracker(s);
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

const norm = v => String(v ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

/** Кандидаты на объединение: занятия и привычки, куда можно влить свою строку. */
export const mergeTargets = () => [
  ...liveLessons().filter(l => l.kind === 'practice').map(l => ({ kind: 'lesson', id: l.id, name: l.name })),
  ...liveHabits().map(hb => ({ kind: 'habit', id: hb.id, name: hb.name })),
  ...sportTags().map(t => ({ kind: 'tag', id: t.id, name: t.name })),
];

/** Своя строка с тем же названием, что занятие или привычка, — почти наверняка дубль. */
function duplicateHint() {
  const targets = mergeTargets();
  const dup = S.tracker.rows.find(r => targets.some(t => norm(t.name) === norm(r.name)));
  if (!dup) return '';
  const t = targets.find(x => norm(x.name) === norm(dup.name));
  return h`
    <div class="card dash">
      <div class="ink">«${dup.name}» дублируется</div>
      <div class="lab">Такое же уже есть ${{ lesson: 'практикой на полке обучения', habit: 'привычкой', tag: 'пилюлей тренировки' }[t.kind]}.
        Объединю: месячные значения станут ручными правками этой строки, а лишняя пропадёт.</div>
      <button class="add" data-act="mergerow" data-id="${dup.id}" data-k="${t.kind}" data-t="${t.id}">Объединить</button>
    </div>`;
}

export const actions = {
  prev: () => update(s => { s.ui.trackYear = year() - 1; }),
  next: () => update(s => { s.ui.trackYear = year() + 1; }),
  gohabits: () => { location.hash = '#/habits'; },

  rowadd: () => rowSheet(null),

  /** Ручное значение привычки за месяц: заменяет расчёт по дням, но не трогает сами отметки. */
  hcell: v => {
    const hb = S.habits.find(x => x.id === v.id);
    if (!hb) return;
    const i = Number(v.m.slice(5, 7)) - 1;
    const auto = habitMonthCount(hb, v.m);
    const fixed = S.tracker.habitValues?.[hb.id]?.[v.m];
    const days = daysInMonth(v.m);

    openSheet({
      title: `${hb.name} · ${MONTHS[i].toLowerCase()}`,
      sub: `по отметкам получается ${auto} из ${days}`,
      body: [
        field.number('n', 'Полных дней', fixed ?? auto, { min: 0, max: days }),
        field.note('Считаются дни, когда норма закрыта целиком. Значение запишется поверх расчёта — удобно, чтобы перенести прошлые месяцы. Ежедневные отметки при этом не меняются, их всегда можно вернуть.'),
      ].join(''),
      primary: 'Записать',
      onSave: (val, close) => {
        const n = Math.max(0, Math.min(days, Number(val.n) || 0));
        update(s => { (s.tracker.habitValues[hb.id] ||= {})[v.m] = n; touchTracker(s); });
        close();
        toast('Записала');
      },
      secondary: fixed != null ? 'вернуть расчётное' : null,
      onSecondary: (_val, close) => {
        update(s => {
          const byHabit = s.tracker.habitValues[hb.id];
          if (!byHabit) return;
          delete byHabit[v.m];
          if (!Object.keys(byHabit).length) delete s.tracker.habitValues[hb.id];
          touchTracker(s);
        });
        close();
        toast('Вернула расчёт по отметкам');
      },
    });
  },

  /** Ручное значение занятия за месяц — тем же способом, что у привычки. */
  lcell: v => {
    const l = S.lessons.find(x => x.id === v.id);
    if (!l) return;
    const i = Number(v.m.slice(5, 7)) - 1;
    const auto = lessonMonth(l, v.m);
    const fixed = S.tracker.lessonValues?.[l.id]?.[v.m];
    openSheet({
      title: `${l.name} · ${MONTHS[i].toLowerCase()}`,
      sub: `по журналу занятий — ${auto}`,
      body: [
        field.number('n', 'Занятий за месяц', fixed ?? auto, { min: 0 }),
        field.note('Пригодится, чтобы перенести прошлые месяцы. Журнал занятий при этом не меняется.'),
      ].join(''),
      primary: 'Записать',
      onSave: (val, close) => {
        update(s => { (s.tracker.lessonValues[l.id] ||= {})[v.m] = Math.max(0, Number(val.n) || 0); touchTracker(s); });
        close();
        toast('Записала');
      },
      secondary: fixed != null ? 'вернуть расчётное' : null,
      onSecondary: (_val, close) => {
        update(s => {
          const by = s.tracker.lessonValues[l.id];
          if (!by) return;
          delete by[v.m];
          if (!Object.keys(by).length) delete s.tracker.lessonValues[l.id];
          touchTracker(s);
        });
        close();
        toast('Вернула расчёт по журналу');
      },
    });
  },

  /** Ручное число тренировок за месяц — чтобы перенести прошлое. */
  xcell: v => {
    const tag = tagById(v.id);
    if (!tag) return;
    const i = Number(v.m.slice(5, 7)) - 1;
    const auto = tagMonthCount(tag.id, v.m);
    const fixed = S.tracker.tagValues?.[tag.id]?.[v.m];
    openSheet({
      title: `${tag.name} · ${MONTHS[i].toLowerCase()}`,
      sub: `по журналу тренировок — ${auto}`,
      body: [
        field.number('n', 'Сколько тренировок', fixed ?? auto, { min: 0 }),
        field.note('Запишется поверх расчёта по журналу. Сами тренировки не меняются.'),
      ].join(''),
      primary: 'Записать',
      onSave: (val, close) => {
        update(s => { (s.tracker.tagValues[tag.id] ||= {})[v.m] = Math.max(0, Number(val.n) || 0); touchTracker(s); });
        close();
        toast('Записала');
      },
      secondary: fixed != null ? 'вернуть расчётное' : null,
      onSecondary: (_val, close) => {
        update(s => {
          const by = s.tracker.tagValues[tag.id];
          if (!by) return;
          delete by[v.m];
          if (!Object.keys(by).length) delete s.tracker.tagValues[tag.id];
          touchTracker(s);
        });
        close();
        toast('Вернула расчёт по журналу');
      },
    });
  },

  /** Объединить свою строку с занятием или привычкой: значения переезжают, дубль исчезает. */
  mergerow: v => {
    const row = S.tracker.rows.find(x => x.id === v.id);
    const target = mergeTargets().find(t => t.kind === v.k && t.id === v.t);
    if (!row || !target) return;
    let moved = 0;
    update(s => {
      const vals = s.tracker.values[row.id] || {};
      const store = v.k === 'lesson' ? (s.tracker.lessonValues[v.t] ||= {})
        : v.k === 'tag' ? (s.tracker.tagValues[v.t] ||= {})
        : (s.tracker.habitValues[v.t] ||= {});
      Object.entries(vals).forEach(([ym, n]) => {
        if (typeof n === 'number' && n > 0 && store[ym] == null) { store[ym] = n; moved++; }
      });
      delete s.tracker.values[row.id];
      s.tracker.rows = s.tracker.rows.filter(x => x.id !== row.id);
      touchTracker(s);
    });
    toast(`Объединила с «${target.name}»${moved ? `, перенесла ${moved} мес.` : ''}`);
  },

  /** Загрузка того же свода: строки ищем по названию, месяцы — по шапке. */
  import: async () => {
    const file = await pickFile('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (!file) return;
    toast('Читаю файл…');
    let sheets;
    try {
      sheets = await readXlsx(file);
    } catch (e) {
      return toast(String(e.message || e).slice(0, 90));
    }

    const y = year();
    const months = monthsOf(y);
    // «Растяжка» и «растяжка», «ё» и «е» — одна и та же строка.
    const norm = v => String(v ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
    let own = 0, hab = 0, skipped = 0;

    update(s => {
      for (const sheet of sheets) {
        // Шапка: ищем строку, где стоят названия месяцев.
        let head = -1, cols = {};
        for (let i = 0; i < Math.min(sheet.rows.length, 20); i++) {
          const map = {};
          sheet.rows[i].forEach((c, j) => {
            const t = String(c ?? '').trim().toLowerCase();
            const mi = MONTHS.findIndex(m => t && m.toLowerCase().startsWith(t.slice(0, 3)));
            if (mi >= 0 && map[mi] === undefined) map[mi] = j;
          });
          if (Object.keys(map).length >= 6) { head = i; cols = map; break; }
        }
        if (head < 0) continue;

        for (const row of sheet.rows.slice(head + 1)) {
          const name = String(row[0] ?? '').trim();
          if (!name || /итог|всего/i.test(name)) continue;

          const habit = s.habits.find(x => !x.archived && norm(x.name) === norm(name));
          const custom = s.tracker.rows.find(x => norm(x.name) === norm(name));
          let target = custom;
          if (!habit && !custom) {
            target = { id: uid(), name, unit: String(row[1] ?? '').trim() };
            s.tracker.rows.push(target);
          }

          Object.entries(cols).forEach(([mi, col]) => {
            const raw2 = row[col];
            if (raw2 == null || raw2 === '') return;                       // пустая клетка — не трогаем месяц
            const n = typeof raw2 === 'number' ? raw2 : Number(String(raw2).replace(',', '.'));
            if (!Number.isFinite(n)) { skipped++; return; }
            const ym2 = months[Number(mi)];
            if (habit) {
              const v2 = Math.max(0, Math.min(daysInMonth(ym2), Math.round(n)));
              // Если число совпало с расчётом по отметкам, правка не нужна:
              // иначе месяц перестал бы обновляться от новых галочек.
              if (v2 === habitMonthCount(habit, ym2)) return;
              (s.tracker.habitValues[habit.id] ||= {})[ym2] = v2;
              hab++;
            } else {
              const v2 = Math.max(0, Math.round(n));
              if (!v2) return;
              (s.tracker.values[target.id] ||= {})[ym2] = v2;
              own++;
            }
          });
        }
      }
      touchTracker(s);
    });

    toast(own || hab
      ? `Загружено: своих ${own}, по привычкам ${hab}${skipped ? `, пропущено ${skipped}` : ''}`
      : 'Не нашлось таблицы с месяцами в шапке');
  },

  /** Выгрузка: две сводные таблицы и все дневные отметки за год. */
  export: async () => {
    const y = year();
    const months = monthsOf(y);
    const head = ['Активность', 'Единица', ...months.map((_, i) => MONTHS[i]), 'За год'];

    const summary = {
      name: 'Полных дней',
      rows: [
        head,
        ...buildRows(y).map(r => {
          const cells = r.cells.map(c => c.value);
          const sum = cells.reduce((a, c) => a + (c || 0), 0);
          // Пустой месяц выгружаем пустым: иначе при обратной загрузке ноль
          // превратился бы в ручную правку и заморозил расчёт по отметкам.
          return [r.name, r.unit || '', ...cells.map(c => (c ? c : '')), sum];
        }),
      ],
    };

    const daily = [['Дата', 'Привычка', 'Значение', 'Норма', 'Норма закрыта']];
    liveHabits().forEach(hb => {
      // Через habitDates, а не по журналу привычки: у воды журнала нет,
      // её дни лежат в «Питании», и выгрузка должна их видеть.
      habitDates(hb).filter(d => d.startsWith(String(y))).forEach(d => {
        const n = habitCount(hb, d);
        daily.push([d, hb.name, n, habitTarget(hb), n >= habitTarget(hb) ? 'да' : 'нет']);
      });
    });

    try {
      const bytes = buildXlsx([summary, { name: 'По дням', rows: daily }]);
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
          touchTracker(s);
        });
        close();
      },
      secondary: 'очистить',
      onSecondary: (_val, close) => {
        update(s => { if (s.tracker.values[v.id]) delete s.tracker.values[v.id][v.m]; touchTracker(s); });
        close();
      },
    });
  },
};
