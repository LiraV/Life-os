// «Питание»: календарь по месяцу, КБЖУ и вода на каждый день,
// плюс оценка приёма пищи по фотографии.

import { goBack } from '../nav.js';
import { S, update, uid, XP, addXp, isWater, MEALS } from '../store.js';
import { todayISO, monthKey, addMonths, monthTitle, monthDates, dowIndex, dayShort, DOW } from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import { hasKey, analyzeFoodPhoto, analyzeFoodText } from '../ai.js';
import { proteinHint, fatHint, waterHint, carbRest, energyNeed, liveHabits, mealEntries, mealsOn } from '../selectors.js';

const plural = (n, a, b, c) => {
  const m = n % 100, d = n % 10;
  return m > 4 && m < 20 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c;
};

const cal = () => S.ui.foodMonth || monthKey(S.ui.foodDate || todayISO());
const sel = () => S.ui.foodDate || todayISO();
const dayOf = d => S.food.days[d] || { water: 0, entries: [] };
const targets = () => S.food.targets;

export const sums = d => (dayOf(d).entries || []).reduce(
  (a, e) => ({ kcal: a.kcal + (e.kcal || 0), prot: a.prot + (e.prot || 0), fat: a.fat + (e.fat || 0), carb: a.carb + (e.carb || 0) }),
  { kcal: 0, prot: 0, fat: 0, carb: 0 },
);

export function render() {
  const date = sel();
  const day = dayOf(date);
  const s = sums(date);
  const t = targets();
  const linked = liveHabits().filter(isWater);
  const pct = t.kcal ? Math.round((s.kcal / t.kcal) * 100) : 0;

  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ назад</button>
      <span class="tag">зелья</span>
    </div>
    <div class="title">Питание</div>

    ${raw(calendar())}

    <div class="card">
      <div class="row between">
        <div class="caps">${dayShort(date)}${date === todayISO() ? ' · сегодня' : ''}</div>
        <button class="q-edit" data-act="goals">цели ›</button>
      </div>
      <div class="row"><span class="lab" style="width:64px">Калории</span>${raw(bar(pct, pct > 110))}
        <span class="lab">${s.kcal} / ${t.kcal}</span></div>
      <div class="macros">
        ${raw(macro('Б', s.prot, t.prot))}
        ${raw(macro('Ж', s.fat, t.fat))}
        ${raw(macro('У', s.carb, t.carb))}
      </div>
    </div>

    <div class="card">
      <div class="row between">
        <div class="caps">Вода</div>
        <span class="lab">${day.water || 0} / ${t.water} мл</span>
      </div>
      ${raw(bar(t.water ? Math.round(((day.water || 0) / t.water) * 100) : 0))}
      ${linked.length ? raw(h`<div class="lab">То же число — привычка «${linked[0].name}» в «Ритме».</div>`) : ''}
      <div class="pills">
        <button class="pill" data-act="water" data-v="250">+250</button>
        <button class="pill" data-act="water" data-v="500">+500</button>
        <button class="pill" data-act="water" data-v="-250">−250</button>
        <button class="pill" data-act="waterset">вписать</button>
      </div>
    </div>

    <div class="row between"><div class="caps">Приёмы пищи</div>
      <span class="lab">${mealsOn(date) ? `${mealsOn(date)} из ${MEALS.length}` : 'ничего не записано'}</span></div>

    ${MEALS.map(m => raw(mealCard(date, m)))}
    ${raw(looseCard(date))}

    <button class="add" data-act="photo">📷 Определить по фото</button>
    <button class="add" data-act="describe">✎ Описать словами</button>
    ${!hasKey() ? raw(h`<div class="lab" style="padding:0 4px">Оценка по фото и по описанию работает через OpenAI: добавь свой ключ в Настройках.</div>`) : ''}
    <div style="height:4px"></div>`;
}


/** Приём пищи: свои блюда и своя сумма. Пустой приём тоже показан — в него
 *  и добавляют, а «на завтрак ничего» это тоже факт дня. */
function mealCard(date, m) {
  const list = mealEntries(date, m.key);
  const kcal = list.reduce((a, e) => a + (Number(e.kcal) || 0), 0);
  return h`
    <div class="card ${list.length ? '' : 'mute'}">
      <div class="row between">
        <div class="caps">${m.name}</div>
        <span class="lab">${list.length ? `${kcal} ккал` : 'пусто'}</span>
      </div>
      ${list.map(e => raw(entryRow(e)))}
      <button class="add" data-act="add" data-m="${m.key}">+ Блюдо</button>
    </div>`;
}

/** Блюда без приёма: так лежат записи, сделанные до деления на приёмы.
 *  Карточки нет, пока таких блюд нет. */
function looseCard(date) {
  const list = mealEntries(date, '');
  if (!list.length) return '';
  return h`
    <div class="card">
      <div class="row between"><div class="caps">Без приёма</div>
        <span class="lab">${list.length}</span></div>
      ${list.map(e => raw(entryRow(e)))}
      <div class="lab">Записаны без приёма — открой и выбери, к какому они относятся.</div>
    </div>`;
}

const macro = (name, val, target) => h`
  <div class="macro">
    <div class="lab">${name}</div>
    <div class="ink"><b>${val}</b><span class="lab"> / ${target}</span></div>
    ${raw(bar(target ? Math.round((val / target) * 100) : 0))}
  </div>`;

function entryRow(e) {
  return h`
    <div class="meal-row">
      <div class="row between">
        <div class="grow" data-act="edit" data-id="${e.id}" style="cursor:pointer">
          <div class="ink">${e.title}${e.source === 'ai' ? raw('<span class="tag" style="margin-left:6px">по фото</span>') : ''}</div>
          <div class="lab">${e.kcal} ккал · Б ${e.prot} · Ж ${e.fat} · У ${e.carb}${e.time ? ` · ${e.time}` : ''}</div>
        </div>
        <button class="q-edit" data-act="del" data-id="${e.id}">×</button>
      </div>
    </div>`;
}

function calendar() {
  const ym = cal();
  const dates = monthDates(ym);
  const lead = dowIndex(dates[0]);
  const t = todayISO();
  const goal = targets().kcal || 1;

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
          const k = sums(d).kcal;
          const f = Math.min(1, k / goal);
          const cls = [k ? 'has' : '', d === t ? 'today' : '', d === sel() ? 'sel' : '', d > t ? 'fut' : ''].filter(Boolean).join(' ');
          return raw(h`<button class="cal-d ${cls}" data-act="pick" data-d="${d}"
            style="${k ? `--f:${f}` : ''}" aria-label="${dayShort(d)}: ${k} ккал">${Number(d.slice(8))}</button>`);
        })}
      </div>
      <div class="lab">Чем плотнее заливка, тем ближе день к норме калорий. Тапни день, чтобы открыть.</div>
    </div>`;
}

// ── шторки ──────────────────────────────────────────────────────
function entrySheet(entry, preset) {
  const isNew = !entry;
  const e = entry || { id: uid(), title: '', kcal: '', prot: '', fat: '', carb: '', time: '', source: 'manual', ...(preset || {}) };
  openSheet({
    title: isNew ? 'Блюдо' : 'Правка',
    sub: preset?.note || (preset ? 'оценка по фото — поправь, если мимо' : ''),
    body: [
      field.text('title', 'Что ели', e.title, 'например, «Овсянка с бананом»'),
      field.opts('meal', 'К какому приёму', [...MEALS.map(m => ({ value: m.key, label: m.name })),
        { value: '', label: 'без приёма' }], e.meal || ''),
      field.number('kcal', 'Калории', e.kcal, { min: 0 }),
      field.number('prot', 'Белки, г', e.prot, { min: 0 }),
      field.number('fat', 'Жиры, г', e.fat, { min: 0 }),
      field.number('carb', 'Углеводы, г', e.carb, { min: 0 }),
      field.time('time', 'Когда — необязательно', e.time || ''),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Нужно название');
      const n = x => Math.max(0, Math.round(Number(x) || 0));
      const date = sel();
      update(s => {
        const day = (s.food.days[date] ||= { water: 0, entries: [] });
        const next = { ...e, title, meal: v.meal ?? e.meal ?? '',
          kcal: n(v.kcal), prot: n(v.prot), fat: n(v.fat), carb: n(v.carb), time: v.time || '' };
        const i = day.entries.findIndex(x => x.id === e.id);
        if (i >= 0) day.entries[i] = next; else day.entries.push(next);
        if (isNew) addXp(XP.habit);
      });
      close();
      toast(isNew ? 'Записала' : 'Сохранено');
    },
    danger: isNew ? null : 'Удалить',
    onDanger: (_v, close) => {
      update(s => {
        const day = s.food.days[sel()];
        if (day) day.entries = day.entries.filter(x => x.id !== e.id);
      });
      close();
    },
  });
}

/** Одинаково открываем форму и после фото, и после описания. */
function fromAI(r) {
  const conf = { low: 'уверенности мало', medium: 'примерно', high: 'уверенно' }[r.confidence];
  entrySheet(null, {
    title: r.title, kcal: r.kcal, prot: r.prot, fat: r.fat, carb: r.carb, source: 'ai',
    note: `${conf}${r.portion ? ' · ' + r.portion : ''}${r.note ? ' · ' + r.note : ''}`,
  });
}

/** Без ключа обе оценки работать не могут — объясняем и ведём в настройки. */
function askForKey() {
  openSheet({
    title: 'Нужен ключ OpenAI',
    sub: 'приложение работает без сервера, поэтому обращается к OpenAI напрямую',
    body: field.note('Заведи ключ на platform.openai.com и вставь его в Настройках. Он останется на этом устройстве и не попадёт ни в резервную копию, ни в репозиторий.'),
    primary: 'Открыть настройки',
    onSave: (_v, close) => { close(); location.hash = '#/settings'; },
  });
}

export const actions = {
  back: () => goBack('spheres'),
  cprev: () => update(s => { s.ui.foodMonth = addMonths(cal(), -1); }),
  cnext: () => update(s => { s.ui.foodMonth = addMonths(cal(), 1); }),
  pick: v => update(s => { s.ui.foodDate = v.d; s.ui.foodMonth = monthKey(v.d); }),

  add: v => entrySheet(null, v?.m ? { meal: v.m } : null),
  edit: v => entrySheet((dayOf(sel()).entries || []).find(x => x.id === v.id)),
  del: v => update(s => {
    const day = s.food.days[sel()];
    if (day) day.entries = day.entries.filter(x => x.id !== v.id);
  }),

  water: v => {
    const date = sel();
    update(s => {
      const day = (s.food.days[date] ||= { water: 0, entries: [] });
      day.water = Math.max(0, (day.water || 0) + Number(v.v));
    });
  },
  waterset: () => openSheet({
    title: 'Вода за день',
    body: field.number('n', 'Сколько выпито, мл', dayOf(sel()).water || 0, { min: 0 }),
    onSave: (v, close) => {
      const n = Math.max(0, Math.round(Number(v.n) || 0));
      update(s => { (s.food.days[sel()] ||= { water: 0, entries: [] }).water = n; });
      close();
    },
  }),

  goals: () => {
    const t = targets();
    const p = proteinHint();
    const f = fatHint();
    const w = waterHint();
    const en = energyNeed();
    // Каждая кнопка только подставляет число в своё поле и оставляет шторку
    // открытой: раньше она молча сохраняла и закрывала форму, теряя всё, что
    // человек в ней успел набрать.
    const put = (name, val) => {
      const el = document.querySelector(`.sheet input[name="${name}"]`);
      if (el) el.value = String(val);
    };
    const live = n => Number(document.querySelector(`.sheet input[name="${n}"]`)?.value) || 0;
    openSheet({
      title: 'Дневные нормы',
      body: [
        field.number('kcal', 'Калории', t.kcal, { min: 0 }),
        // Расход считается по весу, росту, возрасту и полу — они уже есть
        // в профиле. Кнопка ставит расход как есть: дефицит или профицит
        // от него — решение человека, а не приложения.
        en ? h`<button type="button" class="pill" data-act="frombody">взять от тела: ${en.tdee} ккал</button>` : '',
        en ? field.note(`Формула Миффлина: ${en.kg} кг, ${en.cm} см, ${en.age} ${plural(en.age, 'год', 'года', 'лет')} · покой ${en.bmr} ккал, с активностью ×${String(en.pal).replace('.', ',')}.`)
           : field.note('Чтобы посчитать норму калорий, заполни в «Я» пол, дату рождения и рост, а в «Теле» — вес.'),
        field.number('prot', 'Белки, г', t.prot, { min: 0 }),
        // Связка с замерами: белок обычно считают от веса, а вес уже есть
        // в «Теле». Кнопка ставит середину диапазона — решение всё равно твоё.
        p ? h`<button type="button" class="pill" data-act="fromweight">взять от веса: ${Math.round((p.low + p.high) / 2)} г</button>` : '',
        p ? field.note(`Вес ${p.kg} кг от ${dayShort(p.date)} · ориентир 1,2–1,6 г на кг, это ${p.low}–${p.high} г.`) : '',
        field.number('fat', 'Жиры, г', t.fat, { min: 0 }),
        f ? h`<button type="button" class="pill" data-act="fatweight">взять от веса: ${f.mid} г</button>` : '',
        f ? field.note(`Около грамма на кг · ориентир ${f.low}–${f.high} г. Ниже нижней границы жиры обычно не опускают: это не про похудение, а про гормоны.`) : '',
        field.number('carb', 'Углеводы, г', t.carb, { min: 0 }),
        h`<button type="button" class="pill" data-act="carbrest">взять остаток калорий</button>`,
        field.note('Углеводы — это то, что осталось от калорий после белка и жира: 4 ккал в грамме белка и углеводов, 9 в грамме жира. Кнопка считает от того, что стоит в полях сейчас.'),
        field.number('water', 'Вода, мл', t.water, { min: 0 }),
        w ? h`<button type="button" class="pill" data-act="waterweight">взять от веса: ${w.ml} мл</button>` : '',
        w ? field.note(`Вес ${w.kg} кг · ориентир 30 мл на кг. Это привычная прикидка, а не предписание: в жару и в тренировки пьётся больше.`) : '',
      ].join(''),
      onAct: name => {
        if (name === 'fromweight' && p) { put('prot', Math.round((p.low + p.high) / 2)); toast(`Белки: ${Math.round((p.low + p.high) / 2)} г`); }
        if (name === 'frombody' && en) { put('kcal', en.tdee); toast(`Калории: ${en.tdee} ккал`); }
        if (name === 'fatweight' && f) { put('fat', f.mid); toast(`Жиры: ${f.mid} г`); }
        if (name === 'waterweight' && w) { put('water', w.ml); toast(`Вода: ${w.ml} мл`); }
        if (name === 'carbrest') {
          const r = carbRest(live('kcal'), live('prot'), live('fat'));
          if (!r.enough) return toast(`Белок и жир уже съели все калории: не хватает ${-r.left} ккал`);
          put('carb', r.g);
          toast(`Углеводы: ${r.g} г`);
        }
        return undefined;
      },
      onSave: (v, close) => {
        const n = (x, d) => Math.max(0, Math.round(Number(x) || d));
        update(s => {
          s.food.targets = { kcal: n(v.kcal, 2000), prot: n(v.prot, 90), fat: n(v.fat, 70), carb: n(v.carb, 220), water: n(v.water, 2000) };
        });
        close();
        toast('Нормы сохранены');
      },
    });
  },

  /** Снимок уходит в OpenAI и не сохраняется — в хранилище остаются только числа. */
  photo: () => {
    if (!hasKey()) return askForKey();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      toast('Смотрю на фото…');
      try {
        fromAI(await analyzeFoodPhoto(file));
      } catch (e) {
        toast(String(e.message || e).slice(0, 90));
      }
    };
    input.click();
  },

  /** То же самое, но словами: когда фотографировать неудобно или уже съедено. */
  describe: () => {
    if (!hasKey()) return askForKey();
    openSheet({
      title: 'Описать словами',
      sub: 'чем подробнее порция, тем точнее оценка',
      body: [
        field.area('text', 'Что ели', '', 'тарелка борща, два куска бородинского и чай с ложкой сахара'),
        field.note('Уйдёт в OpenAI только это описание. Числа вернутся в форму — их можно поправить перед сохранением.'),
      ].join(''),
      primary: 'Оценить',
      onSave: async (v, close) => {
        const text = (v.text || '').trim();
        if (!text) return toast('Опиши, что ели');
        close();
        toast('Считаю…');
        try {
          fromAI(await analyzeFoodText(text));
        } catch (e) {
          toast(String(e.message || e).slice(0, 90));
        }
      },
    });
  },
};
