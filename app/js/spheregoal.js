// «Цель отсюда»: сфера предлагает то, что умеет считать сама, человек ставит
// число и период. Общая шторка на все сферы — иначе пять почти одинаковых.
//
// Готовых целей нет ни одной: пока человек не нажмёт «Добавить», в планах
// ничего не появляется. Автоматика касается только счёта, а не решения.

import { S, update, uid } from './store.js';
import { todayISO, yearOf, monthKey, MONTHS } from './dates.js';
import { h, raw, field, toast, openSheet } from './ui.js';
import { sourcesOf, liveGoals, autoLabel, SOURCES, sphereOf } from './selectors.js';

const HZ = [
  { value: 'year', label: 'Год' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'month', label: 'Месяц' },
];

const periodFor = horizon => {
  const t = todayISO();
  if (horizon === 'month') return monthKey(t);
  if (horizon === 'quarter') return `${yearOf(t)}-Q${Math.ceil(Number(t.slice(5, 7)) / 3)}`;
  return String(yearOf(t));
};

/**
 * Шторка «цель из сферы». Выбирается, что считать, сколько и за какой период.
 * Горизонты ограничены источником: у поездок есть только год, и месяц там
 * не предлагается, потому что считать его нечем.
 */
export function sphereGoalSheet(sphere) {
  const list = sourcesOf(sphere);
  if (!list.length) return;
  const first = list[0];
  // Уточнение «что именно» нужно не каждому источнику: в спорте пилюле нужно,
  // а «всем тренировкам» нет. Список строим по тому источнику, у которого он
  // есть, и на сохранении берём только если выбранный источник его просит.
  const refSrc = list.find(x => x.ref);
  const refs = refSrc ? refSrc.ref() : [];
  // Горизонты — общие для сферы: то, что умеют все её источники.
  const hz = HZ.filter(x => list.every(src => src.horizons.includes(x.value)));
  openSheet({
    title: 'Цель отсюда',
    sub: 'счёт будет вести приложение',
    body: [
      field.select('kind', 'Что считаем', list.map(x => ({ value: x.key, label: x.name })), first.key),
      refs.length ? field.select('ref', `Что именно · ${refSrc.name.toLowerCase()}`, refs, refs[0].value) : '',
      field.number('target', 'Сколько', '', { min: 1 }),
      hz.length > 1 ? field.opts('horizon', 'За какой срок', hz, 'year')
                    : field.note(`Считается за ${hz[0]?.label.toLowerCase() || 'год'} — другого отрезка у этих данных нет.`),
      field.text('title', 'Как назвать', '', 'можно не заполнять — придумаю сама'),
      field.note('Число набранного будет считаться из отметок в этой сфере: отдельно вести его не нужно. Цель появится в «Планах» и там же правится или удаляется.'),
    ].join(''),
    primary: 'Добавить цель',
    onSave: (v, close) => {
      const kind = v.kind || first.key;
      const src = list.find(x => x.key === kind) || first;
      const target = Math.max(1, Number(v.target) || 0);
      if (!target) return toast('Нужно число');
      const horizon = src.horizons.includes(v.horizon) ? v.horizon : src.horizons[0];
      const period = periodFor(horizon);
      // У источника своей сферы уточнение не спрашивают: сфера и есть уточнение.
      const ref = src.ref ? (v.ref ?? '') : (src.fixedRef || '');
      const goal = {
        id: uid(), title: '', horizon, period, parentId: '',
        // «Внутри» — не сфера, поэтому поле сферы у такой цели остаётся пустым:
        // подставлять туда несуществующий ключ значило бы врать выбору сфер.
        sphere: sphereOf(sphere) ? sphere : '',
        deadline: '', target, unit: src.unit, current: 0, steps: [], slots: [],
        src: { kind, ref },
      };
      goal.title = (v.title || '').trim() || defaultTitle(goal, src, target, horizon, period);
      // Такая же цель уже есть — второй счётчик про то же самое не заводим.
      const twin = liveGoals().find(x => x.src?.kind === kind && (x.src?.ref || '') === ref
        && x.horizon === horizon && x.period === period);
      if (twin) { close(); return toast(`Такая цель уже есть: «${twin.title}»`); }
      update(s => {
        s.goals.push(goal);
        if (horizon === 'month') { s.ui.planTab = 'month'; s.ui.monthAnchor = period; }
        else { s.ui.planTab = 'year'; s.ui.year = Number(period.slice(0, 4)); }
      });
      close();
      toast(`Цель добавлена: «${goal.title}»`);
    },
  });
}

/** Название по умолчанию — человеческое, а не «books/year/2026». */
function defaultTitle(goal, src, target, horizon, period) {
  const when = horizon === 'year' ? `за ${period}`
    : horizon === 'quarter' ? `за ${period.slice(5)} ${period.slice(0, 4)}`
    : `за ${MONTHS[Number(period.slice(5, 7)) - 1].toLowerCase()}`;
  // Название своей сферы в заголовок не подставляем: цель и так живёт в ней,
  // и «Отметок в журнале (Музыка)» внутри «Музыки» читалось бы дважды.
  const what = src.ref && goal.src.ref && src.refName ? ` (${src.refName(goal.src.ref)})` : '';
  return `${src.name}${what}: ${target} ${when}`;
}

/** Кнопка для экрана сферы — рисуется только там, где есть что считать. */
export const sphereGoalButton = sphere => (sourcesOf(sphere).length
  ? h`<button class="btn-ghost" data-act="spheregoal">+ Цель отсюда</button>`
  : '');

/** Готовые цели этой сферы — короткой строкой, чтобы было видно, что уже взято. */
export function sphereGoalsCard(sphere) {
  // Ищем по источнику, а не по полю сферы: у целей из «Внутри» сферы нет,
  // а у своих сфер источник общий и различается ссылкой.
  const list = liveGoals().filter(g => {
    const src = g.src && SOURCES[g.src.kind];
    if (!src) return false;
    return src.sphere === '*' ? g.src.ref === sphere : src.sphere === sphere;
  });
  if (!list.length) return '';
  return h`
    <div class="card mute">
      <div class="caps">Цели отсюда</div>
      ${list.map(g => raw(h`
        <button class="link-row" data-act="togoal" data-id="${g.id}">
          <span class="ink grow ellip">${g.title}</span>
          <span class="lab">${autoLabel(g)} ›</span>
        </button>`))}
    </div>`;
}

/** Действия, одинаковые во всех сферах. */
export const sphereGoalActions = sphere => ({
  spheregoal: () => sphereGoalSheet(sphere),
  togoal: () => { location.hash = '#/plans'; },
});
