// «Ритм»: привычки без стриков. Неделя — тап по дню, месяц — реальные итоги.

import { S, update, uid, tickHabit, habitStep, isWater, isMeals, nameTaken } from '../store.js';
import { todayISO, addDays, weekDates, monthKey, addMonths, monthTitle, daysInMonth, DOW, dayShort } from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import { habitMonthCount, habitTarget, habitCount, habitDone, liveHabits, habitUnit } from '../selectors.js';

const mode = () => S.ui.habMode || 'week';
const anchor = () => S.ui.habitAnchor || todayISO();
const monthA = () => S.ui.habMonth || monthKey(todayISO());

export function render() {
  const live = liveHabits();
  return h`
    <div class="title">Ритм</div>
    <div class="sub">Отметка — просто отметка. Пропуск ничего не отнимает.</div>
    <div class="pills">
      <button class="pill ${mode() === 'week' ? 'on' : ''}" data-act="mode" data-v="week">Неделя</button>
      <button class="pill ${mode() === 'month' ? 'on' : ''}" data-act="mode" data-v="month">Месяц</button>
    </div>
    ${raw(mode() === 'week' ? weekView(live) : monthView(live))}
    <button class="add" data-act="add">+ Новая привычка</button>
    ${live.length ? raw(h`<div class="ai">${tip(live)}</div>`) : ''}`;
}

function weekView(list) {
  const dates = weekDates(anchor());
  const t = todayISO();
  if (!list.length) return emptyCard();
  return h`
    <div class="stepper">
      <button class="arrow" data-act="prev">‹</button>
      <div class="lab">${dayShort(dates[0])} — ${dayShort(dates[6])}</div>
      <button class="arrow" data-act="next">›</button>
    </div>
    <div class="row" style="padding:0 2px">
      <span class="lab" style="width:0;flex:none"></span>
      ${DOW.map(d => raw(h`<span class="lab grow" style="text-align:center">${d}</span>`))}
    </div>
    ${list.map(hb => {
      const target = habitTarget(hb);
      const n = dates.filter(d => habitDone(hb, d)).length;
      return raw(h`
        <div class="card">
          <div class="row between"><div class="ink grow ellip">${hb.name}</div>
            <span class="lab">${n} из 7${target > 1 ? ` · норма ${target}${habitUnit(hb) ? ' ' + habitUnit(hb) : ''}` : ''}</span>
            <button class="q-edit" data-act="edit" data-id="${hb.id}">›</button></div>
          <div class="hab-grid">
            ${dates.map(d => {
              const c = habitCount(hb, d);
              const full = c >= target;
              return raw(h`<button class="hab-cell ${full ? 'on' : ''} ${c && !full ? 'part' : ''} ${d === t ? 'today' : ''}"
                 data-act="tick" data-id="${hb.id}" data-d="${d}"
                 ${raw(d > t ? 'disabled style="opacity:.4"' : '')}
                 aria-label="${dayShort(d)}: ${c} из ${target}">${target > 1 && c ? c : d.slice(8)}</button>`);
            })}
          </div>
        </div>`);
    })}`;
}

function monthView(list) {
  const ym = monthA();
  const total = daysInMonth(ym);
  if (!list.length) return emptyCard();
  return h`
    <div class="stepper">
      <button class="arrow" data-act="mprev">‹</button>
      <div class="lab">${monthTitle(ym)}</div>
      <button class="arrow" data-act="mnext">›</button>
    </div>
    <img class="hero-img" src="assets/illustration_03.png" alt="">
    <div class="card">
      ${list.map(hb => {
        const n = habitMonthCount(hb, ym);
        return raw(h`<div class="row"><span class="lab grow ellip">${hb.name}</span>
          ${raw(bar(Math.round(n / total * 100), n > total / 2))}
          <span class="lab">${n} из ${total}</span></div>`);
      })}
    </div>`;
}

const emptyCard = () => h`<div class="card dash"><div class="empty">Привычек пока нет.<br>Начни с одной — этого достаточно.</div></div>`;

function tip(list) {
  const dates = weekDates(anchor());
  const scored = list.map(hb => ({ hb, n: dates.filter(d => habitDone(hb, d)).length })).sort((a, b) => a.n - b.n);
  const worst = scored[0], best = scored[scored.length - 1];
  if (best.n >= 5) return `«${best.hb.name}» держится ${best.n} дней из 7. Это уже ритм, а не усилие.`;
  if (worst.n === 0) return `«${worst.hb.name}» на этой неделе не шла. Может, она сейчас просто не нужна?`;
  return `За неделю отмечено ${scored.reduce((a, s) => a + s.n, 0)} раз. Ровно столько, сколько было сил.`;
}

function habitSheet(hb) {
  const isNew = !hb;
  const water = isWater(hb);
  const meals = isMeals(hb);
  openSheet({
    title: isNew ? 'Новая привычка' : 'Привычка',
    body: [
      field.text('name', 'Название', hb?.name || '', 'например, «Итальянский 15 минут»'),
      `<label class="row tight" style="font-size:13px"><input type="checkbox" name="water" ${water ? 'checked' : ''}> Это вода из «Питания»</label>`,
      `<label class="row tight" style="font-size:13px"><input type="checkbox" name="meals" ${meals ? 'checked' : ''}> Это приёмы пищи из «Питания»</label>`,
      meals ? field.note('Число берётся из «Питания»: считаются приёмы, в которых есть хоть одно блюдо. Отметить такую привычку руками нельзя — её отмечает еда.') : '',
      field.number('target', water ? 'Норма воды за день, мл' : 'Норма за день', hb ? habitTarget(hb) : 1, { min: 1 }),
      water ? field.note(`Норма и выпитое — одно число с «Питанием»: изменишь здесь, изменится и там. Стакан, отмеченный тут, виден в «Питании», и наоборот. Свой журнал привычки сохранён и вернётся, если снять галочку.`) : '',
      water && Number(hb?.target) >= 1 && Number(hb.target) !== habitTarget(hb)
        ? field.note(`Раньше у этой привычки была своя норма ${hb.target} ${hb.unit || 'мл'}. Когда она связалась с «Питанием», считать стало «Питание» — а его норма ${habitTarget(hb)} мл. Если нужна прежняя, впиши её сюда: поменяется в обоих местах.`)
        : '',
      water ? '' : field.text('unit', 'В чём считаем', hb?.unit || '', 'раз, мл, минут — необязательно'),
      field.number('step', 'Сколько добавляет один тап', hb ? habitStep(hb) : 1, { min: 1 }),
      field.note('Норма больше одного превращает привычку в счётчик: «таблетки 0/3». Для крупных величин задай шаг — «вода 2000 мл» с шагом 250 закрывается восемью тапами.'),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      const twin = nameTaken(S.habits, name, hb?.id);
      if (twin) return toast(`«${twin.name}» уже есть в ритме`);
      const target = Math.max(1, Number(v.target) || 1);
      const step = Math.max(1, Math.min(target, Number(v.step) || 1));
      const unit = (v.unit || '').trim();
      const link = v.water ? 'water' : v.meals ? 'meals' : '';
      // В режиме воды поля нормы и единицы на экране нет, поэтому их нельзя
      // перезаписывать тем, чего не спрашивали: своя норма привычки лежит
      // нетронутой и возвращается вместе со снятой связью.
      // Норма всегда одна и принадлежит тому, кто её считает: у воды это
      // «Питание», у остальных — сама привычка. Единственное исключение —
      // снятие связи: там поле показывало чужую норму, поэтому свою не трогаем,
      // и она возвращается такой, какой была.
      const wasWater = isWater(hb);
      const asked = v.target !== undefined;
      update(s => {
        if (isNew) {
          s.habits.push({ id: uid(), name, target, step, unit, link, log: {}, createdAt: todayISO() });
          if (link === 'water' && asked) s.food.targets.water = target;
          return;
        }
        const x = s.habits.find(y => y.id === hb.id);
        if (!x) return;
        x.name = name; x.step = step; x.link = link;
        if (link === 'water') { if (asked) s.food.targets.water = target; }
        else if (!wasWater && asked) { x.target = target; x.unit = unit; }
      });
      close();
    },
    danger: isNew ? null : 'Удалить привычку',
    onDanger: (_v, close) => {
      update(s => { s.habits = s.habits.filter(x => x.id !== hb.id); });
      close();
      toast('Удалила — без вины');
    },
  });
}

export const actions = {
  mode: v => update(s => { s.ui.habMode = v.v; }),
  prev: () => update(s => { s.ui.habitAnchor = addDays(anchor(), -7); }),
  next: () => update(s => { s.ui.habitAnchor = addDays(anchor(), 7); }),
  mprev: () => update(s => { s.ui.habMonth = addMonths(monthA(), -1); }),
  mnext: () => update(s => { s.ui.habMonth = addMonths(monthA(), 1); }),
  add: () => habitSheet(null),
  edit: v => habitSheet(S.habits.find(x => x.id === v.id)),
  tick: v => {
    let res = null;
    update(s => { res = tickHabit(s, v.id, v.d); });
    // Приёмы пищи не отмечают — их едят. Ведём туда, где они записываются.
    if (res?.readOnly) { toast(`${res.name} считаются в «Питании»`); location.hash = '#/food'; }
  },
};
