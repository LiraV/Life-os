// «Цель отсюда»: сфера предлагает то, что умеет считать сама, человек ставит
// число и период. Общая шторка на все сферы — иначе пять почти одинаковых.
//
// Готовых целей нет ни одной: пока человек не нажмёт «Добавить», в планах
// ничего не появляется. Автоматика касается только счёта, а не решения.

import { S, update, uid } from './store.js';
import { todayISO, yearOf, monthKey, MONTHS } from './dates.js';
import { h, raw, field, toast, openSheet } from './ui.js';
import { sourcesOf, liveGoals, autoLabel, SOURCES, sphereOf, periodRange, intentionsAbove } from './selectors.js';

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
  // Уточнение и сроки — свои у каждого счёта: у постов площадки, у подписчиков
  // площадки другие, а «сколько сейчас» бывает только за год. Поэтому блок
  // перерисовывается при смене счёта, а не строится один на всю сферу: раньше
  // брались общие горизонты, и один «только годовой» счёт отнимал месяц у всех.
  // Блок «показывать в месяце» и выбор намерения: и то и другое имеет смысл
  // только у месячной цели, поэтому появляется вместе со сроком «месяц».
  const dynBlock = (ym, horizon) => {
    if (horizon !== 'month') return '';
    const ints = intentionsAbove(ym);
    return `<label class="row tight" style="font-size:13px"><input type="checkbox" name="dynamic"> Показывать в месяце отдельной строкой</label>`
      + (ints.length
        ? field.select('intentId', 'Ради какого намерения',
          [{ value: '', label: 'просто так' }, ...ints.map(i => ({ value: i.id, label: `${i.text} · ${i.level}` }))], '')
        : field.note('Намерений на этот месяц, квартал и год пока нет — связать цель не с чем.'));
  };

  const optsBlock = src => {
    const refs = src.ref ? src.ref() : [];
    const hz = HZ.filter(x => src.horizons.includes(x.value));
    return (refs.length ? field.select('ref', `Что именно · ${src.name.toLowerCase()}`, refs, refs[0].value) : '')
      + (hz.length > 1 ? field.opts('horizon', 'За какой срок', hz, 'year')
        : field.note(`Считается за ${hz[0]?.label.toLowerCase() || 'год'} — другого отрезка у этих данных нет.`))
      // У «за всё время» срок означает не окно счёта, а когда хочется дойти.
      // Без этой строки квартал у рекорда читался бы как «рекорд за квартал».
      + (src.lifetime ? field.note('Это счёт за всё время: рекорд не обнуляется в начале срока. Срок здесь — когда ты хочешь дойти.') : '');
  };
  const wrap = openSheet({
    title: 'Цель отсюда',
    sub: 'счёт будет вести приложение',
    body: [
      field.select('kind', 'Что считаем', list.map(x => ({ value: x.key, label: x.name })), first.key),
      `<div id="sg_opts">${optsBlock(first)}</div>`,
      field.number('target', 'Сколько', '', { min: 0 }),
      field.text('title', 'Как назвать', '', 'можно не заполнять — придумаю сама'),
      // Динамичная — это не другой счёт, а другое место: месячный блок, где
      // цель видна каждый день. Поэтому только для месяца и без ручных плюсов:
      // число всё равно считает сфера.
      `<div id="sg_dyn">${dynBlock(periodFor('month'), 'year')}</div>`,
      field.note('Число набранного будет считаться из отметок в этой сфере: отдельно вести его не нужно. Цель появится в «Планах» и там же правится или удаляется.'),
    ].join(''),
    primary: 'Добавить цель',
    onSave: (v, close) => {
      const kind = v.kind || first.key;
      const src = list.find(x => x.key === kind) || first;
      // У источника своей сферы уточнение не спрашивают: сфера и есть уточнение.
      const ref = src.ref ? (v.ref ?? '') : (src.fixedRef || '');
      // У цели «вниз» ноль — законная цель: «0 см до шпагата». Поэтому нижнюю
      // границу опускаем и пустое поле от нуля отличаем по самому вводу.
      const down = src.dirOf?.(ref) === 'down';
      const typed = String(v.target ?? '').trim();
      const target = down ? Math.max(0, Number(typed) || 0) : Math.max(1, Number(typed) || 0);
      if (!typed || (!down && !target)) return toast('Нужно число');
      const horizon = src.horizons.includes(v.horizon) ? v.horizon : src.horizons[0];
      const period = periodFor(horizon);
      const goal = {
        id: uid(), title: '', horizon, period, parentId: '',
        // «Внутри» — не сфера, поэтому поле сферы у такой цели остаётся пустым:
        // подставлять туда несуществующий ключ значило бы врать выбору сфер.
        sphere: sphereOf(sphere) ? sphere : '',
        // Единица бывает своя у каждого уточнения: у планки секунды, у шпагата
        // сантиметры. Точку отсчёта запоминаем сразу — по ней потом считается
        // движение цели «вниз»; позже её уже не восстановить.
        deadline: '', target, unit: (src.unitOf ? src.unitOf(ref) : src.unit) || src.unit,
        // Динамичной делаем только месячную: в квартале и годе такого блока нет.
        dynamic: horizon === 'month' && !!v.dynamic,
        intentId: horizon === 'month' ? (v.intentId || '') : '',
        current: 0, steps: [], slots: [],
        src: { kind, ref, ...(down ? { from: src.count(ref, periodRange('year', String(yearOf(todayISO()))), '', null) || 0 } : {}) },
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

  // Смена счёта перерисовывает только уточнение и сроки: число и название,
  // если их уже вписали, остаются на месте.
  /** Поле «сколько» подставляем от уточнения, если счёт знает своё «всего».
   *  Введённое руками не трогаем: подсказка не должна спорить с человеком. */
  const suggestTarget = (src, ref) => {
    if (!src?.suggest) return;
    const el = wrap?.querySelector('input[name="target"]');
    if (!el || el.dataset.touched === '1') return;
    const n = src.suggest(ref);
    if (n) el.value = String(n);
  };

  const redrawDyn = horizon => {
    const box = wrap?.querySelector('#sg_dyn');
    if (box) box.innerHTML = dynBlock(periodFor('month'), horizon);
  };
  wrap?.addEventListener('change', e => {
    if (e.target?.name === 'target') { e.target.dataset.touched = '1'; return; }
    if (e.target?.name === 'ref') {
      const cur = list.find(x => x.key === wrap.querySelector('select[name="kind"]')?.value) || first;
      return suggestTarget(cur, e.target.value);
    }
    if (e.target?.name !== 'kind') return;
    const src = list.find(x => x.key === e.target.value) || first;
    const box = wrap.querySelector('#sg_opts');
    if (box) box.innerHTML = optsBlock(src);
    redrawDyn(src.horizons.includes('year') ? 'year' : src.horizons[0]);
    suggestTarget(src, wrap.querySelector('select[name="ref"]')?.value ?? '');
  });
  // Ввод руками помечаем сразу, а не по «change»: иначе подсказка успела бы
  // затереть начатое, пока поле ещё в фокусе.
  wrap?.addEventListener('input', e => {
    if (e.target?.name === 'target') e.target.dataset.touched = '1';
  });
  // Срок выбирается пилюлями: они шлют своё событие, а не change.
  wrap?.addEventListener('opt', e => {
    if (e.target?.dataset?.name === 'horizon') redrawDyn(e.detail);
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
