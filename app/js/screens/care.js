// «Забота»: повторяющиеся дела, которые держат в порядке тело, внешность,
// дом и питомца. Ритм считается от последней отметки, а не от календаря:
// сделала раньше или позже — план едет за жизнью, а не наоборот.

import { S, update, uid, XP, addXp } from '../store.js';
import { todayISO, dayShort, monthTitle, monthKey, yearOf, MONTHS } from '../dates.js';
import { h, raw, field, toast, openSheet, confirmSheet } from '../ui.js';
import {
  CARE_GROUPS, careGroupName, careItems, careLast, careNext, careDue,
  careDueNow, careSoon, careInGroup, careMonthCost, careYearPlan, petAge,
} from '../selectors.js';

const TABS = [['now', 'Сейчас'], ['all', 'Списком'], ['year', 'Год']];
const tab = () => (TABS.some(([k]) => k === S.ui.careTab) ? S.ui.careTab : 'now');
const num = n => Number(n).toLocaleString('ru-RU');

/** «раз в 3 месяца», «раз в год» — как это звучит вслух. */
export function everyLabel(n) {
  if (n === 1) return 'раз в месяц';
  if (n === 12) return 'раз в год';
  if (n === 6) return 'раз в полгода';
  if (n === 3) return 'раз в квартал';
  if (n > 12 && n % 12 === 0) return `раз в ${n / 12} года`;
  return `раз в ${n} ${n > 1 && n < 5 ? 'месяца' : 'месяцев'}`;
}

/** Когда пора — словами. Точный день только если дело уже отмечали. */
export function dueLabel(it) {
  const next = careNext(it);
  const d = careDue(it);
  if (next.never) return 'ещё ни разу';
  // Дело ни разу не отмечали: точный день выдумывать не из чего, только месяц.
  if (!next.exact) {
    const y = next.month.slice(0, 4);
    const m = MONTHS[Number(next.month.slice(5, 7)) - 1].toLowerCase();
    return `по плану ${m}${y === todayISO().slice(0, 4) ? '' : ' ' + y}`;
  }
  if (d === 0) return 'сегодня';
  if (d < 0) return `просрочено на ${-d} ${plural(-d, 'день', 'дня', 'дней')}`;
  return `через ${d} ${plural(d, 'день', 'дня', 'дней')} · ${dayShort(next.date)}`;
}

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};

export function render() {
  const due = careDueNow();
  const soon = careSoon(45);
  return h`
    <div class="title">Забота</div>
    <div class="sub">Что нужно повторять, чтобы всё держалось. Ритм считается от последнего раза.</div>
    <div class="pills">${TABS.map(([k, l]) => raw(h`<button class="pill ${tab() === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`))}</div>
    ${raw(tab() === 'all' ? listView() : tab() === 'year' ? yearView() : nowView(due, soon))}
    <div style="height:4px"></div>`;
}

// ── сейчас ──────────────────────────────────────────────────────
function nowView(due, soon) {
  const cost = careMonthCost();
  return h`
    <div class="card">
      <div class="row between"><div class="caps">Пора сейчас</div>
        <span class="lab">${due.length ? `${due.length} ${plural(due.length, 'дело', 'дела', 'дел')}` : 'ничего'}</span></div>
      ${due.length ? due.map(it => raw(careRow(it))) : raw('<div class="lab">Всё сделано вовремя. Такое бывает — и это твоя заслуга.</div>')}
    </div>

    <div class="card">
      <div class="caps">Скоро · полтора месяца</div>
      ${soon.length ? soon.map(it => raw(careRow(it))) : raw('<div class="lab">В ближайший месяц ничего не подходит.</div>')}
    </div>

    ${raw(petCard())}

    ${cost ? raw(h`<div class="card mute"><div class="lab">В этом месяце по плану примерно
      <b>${num(cost)} ₽</b> — считаю только те дела, у которых проставлена цена.</div></div>`) : ''}`;
}

/** Строка дела: галочка отмечает сегодняшним днём, тап открывает настройку. */
function careRow(it, withTag = true) {
  const d = careDue(it);
  const late = d < 0;
  const linked = it.link === 'measure';
  return h`
    <div class="care-row">
      <button class="check ${linked ? 'linked' : ''}" data-act="${linked ? 'tomeasure' : 'done'}" data-id="${it.id}"
        aria-label="${linked ? 'Записать замеры' : 'Сделано сегодня'}">✓</button>
      <button class="grow care-name" data-act="edit" data-id="${it.id}">
        <span class="ink ellip">${it.name}</span>
        <span class="lab ${late ? 'late' : ''}">${dueLabel(it)} · ${everyLabel(Number(it.every) || 1)}${it.cost ? ` · ${num(it.cost)} ₽` : ''}</span>
      </button>
      ${withTag ? raw(h`<span class="tag">${careGroupName(it.group)}</span>`) : ''}
    </div>`;
}

// ── списком по группам ──────────────────────────────────────────
function listView() {
  return h`
    ${CARE_GROUPS.map(g => {
      const list = careInGroup(g.key);
      return raw(h`
        <div class="card">
          <div class="row between"><div class="caps">${g.name}</div>
            <button class="q-edit" data-act="add" data-g="${g.key}">+ дело</button></div>
          ${list.length ? list.map(it => raw(careRow(it, false)))
            : raw('<div class="lab">Пока пусто.</div>')}
        </div>`);
    })}
    <button class="add" data-act="add">+ Дело</button>`;
}

// ── год ─────────────────────────────────────────────────────────
/** Тот же вид, что в бумажной заметке, только месяцы считаются сами. */
function yearView() {
  const y = yearOf(todayISO());
  const plan = careYearPlan(y);
  const cur = monthKey(todayISO());
  return h`
    <div class="card mute"><div class="lab">Если ритм не сбивать, год разложится так.
      Отметишь дело раньше или позже — план пересчитается от твоей отметки.</div></div>
    ${MONTHS.map((name, i) => {
      const ym = `${y}-${String(i + 1).padStart(2, '0')}`;
      const list = plan[ym] || [];
      return raw(h`
        <div class="card ${ym === cur ? '' : 'mute'}">
          <div class="row between"><div class="caps">${name}${ym === cur ? ' · сейчас' : ''}</div>
            <span class="lab">${list.length || ''}</span></div>
          ${list.length ? raw(h`<div class="chips">${list.map(it => raw(h`<button class="chip" data-act="edit" data-id="${it.id}">${it.name}</button>`))}</div>`)
            : raw('<div class="lab">свободно</div>')}
        </div>`);
    })}`;
}

// ── питомец ─────────────────────────────────────────────────────
function petCard() {
  const p = S.care.pet;
  const list = careInGroup('pet');
  const ws = [...(p.weights || [])].sort((a, b) => a.date.localeCompare(b.date));
  const last = ws[ws.length - 1];
  const prev = ws[ws.length - 2];
  const delta = last && prev ? Math.round((last.kg - prev.kg) * 100) / 100 : null;
  return h`
    <div class="card">
      <div class="row between">
        <div class="grow" data-act="petedit" style="cursor:pointer">
          <div class="ink"><b>${p.name || 'Питомец'}</b>${p.kind ? raw(h` <span class="lab">${p.kind}</span>`) : ''}</div>
          <div class="lab">${p.birth ? petAge(p.birth) : 'заведи дату рождения — посчитаю возраст'}</div>
        </div>
        <button class="q-edit" data-act="petedit">изменить ›</button>
      </div>
      ${last ? raw(h`<div class="row between">
        <span class="ink"><b>${last.kg}</b><span class="lab"> кг · ${dayShort(last.date)}</span></span>
        ${delta != null ? raw(h`<span class="lab">${delta > 0 ? '+' : ''}${delta} кг с прошлого раза</span>`) : ''}
      </div>`) : ''}
      <button class="add" data-act="weight">+ Вес</button>
      ${list.length ? raw(h`<div class="list">${list.map(it => raw(h`
        <button class="row between care-name" data-act="edit" data-id="${it.id}">
          <span class="lab grow ellip">${it.name}</span>
          <span class="lab ${careDue(it) < 0 ? 'late' : ''}">${dueLabel(it)}</span>
        </button>`))}</div>`) : ''}
    </div>`;
}

// ── шторки ──────────────────────────────────────────────────────
const EVERY = [
  { value: '1', label: 'раз в месяц' },
  { value: '2', label: 'раз в 2 месяца' },
  { value: '3', label: 'раз в квартал' },
  { value: '4', label: 'раз в 4 месяца' },
  { value: '6', label: 'раз в полгода' },
  { value: '12', label: 'раз в год' },
  { value: '24', label: 'раз в 2 года' },
];

function itemSheet(item, group) {
  const isNew = !item;
  const it = item || { id: uid(), name: '', group: group || 'health', every: 3, anchor: 0, last: '', log: [], cost: 0, note: '', link: '' };
  const hist = [...(it.log || [])].sort().reverse().slice(0, 6);
  openSheet({
    title: isNew ? 'Дело' : it.name,
    sub: isNew ? 'то, что нужно повторять' : dueLabel(it),
    body: [
      field.text('name', 'Что делаем', it.name, 'например, «Кровь на литий»'),
      field.select('group', 'Куда отнести', CARE_GROUPS.map(g => ({ value: g.key, label: g.name })), it.group),
      field.select('every', 'Как часто', EVERY, String(it.every)),
      it.link === 'measure'
        ? field.note('Отметка берётся из раздела «Тело»: записала замеры — дело закрылось само, отдельно отмечать не нужно.')
        : field.date('last', 'Когда делала в последний раз', it.last || ''),
      field.select('anchor', 'Если ни разу не отмечено — с какого месяца считать',
        [{ value: '0', label: 'считать сразу' }, ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))], String(it.anchor || 0)),
      field.number('cost', 'Сколько примерно стоит', it.cost || '', { min: 0, suffix: '₽' }),
      field.area('note', 'Заметка', it.note || ''),
      hist.length ? field.note('Отмечала: ' + hist.map(dayShort).join(', ')) : '',
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        const next = {
          ...it, name, group: v.group, every: Math.max(1, Number(v.every) || 1),
          anchor: Number(v.anchor) || 0, cost: Math.max(0, Number(v.cost) || 0),
          note: (v.note || '').trim(),
          last: it.link === 'measure' ? it.last : (v.last || ''),
        };
        const i = s.care.items.findIndex(x => x.id === it.id);
        if (i >= 0) s.care.items[i] = next; else s.care.items.push(next);
      });
      close();
    },
    danger: isNew ? null : 'Удалить дело',
    onDanger: (_v, close) => {
      close();
      confirmSheet(`Удалить «${it.name}»?`, 'История отметок уйдёт вместе с делом.', 'Удалить',
        () => update(s => { s.care.items = s.care.items.filter(x => x.id !== it.id); }));
    },
  });
}

/** Отметка: по умолчанию сегодня, но можно поставить настоящую дату. */
function doneSheet(it) {
  openSheet({
    title: it.name,
    sub: `${everyLabel(Number(it.every) || 1)} · ${dueLabel(it)}`,
    body: [
      field.date('date', 'Когда сделала', todayISO()),
      field.note('От этой даты посчитаю, когда будет пора в следующий раз.'),
    ].join(''),
    primary: 'Отметить',
    onSave: (v, close) => {
      markDone(it.id, v.date || todayISO());
      close();
    },
  });
}

export function markDone(id, date) {
  let name = '';
  update(s => {
    const it = s.care.items.find(x => x.id === id);
    if (!it) return;
    name = it.name;
    it.last = date;
    it.log = [...new Set([...(it.log || []), date])].sort();
    addXp(XP.measure);
  });
  const it = S.care.items.find(x => x.id === id);
  if (it) toast(`${name} · отмечено, следующий раз ${careNext(it).exact ? dayShort(careNext(it).date) : 'по плану'}`);
}

function petSheet() {
  const p = S.care.pet;
  openSheet({
    title: p.name || 'Питомец',
    body: [
      field.text('name', 'Кличка', p.name || '', 'Бусик'),
      field.text('kind', 'Кто это', p.kind || '', 'собака, кот, кто-то ещё'),
      field.date('birth', 'День рождения', p.birth || ''),
      field.area('note', 'Что важно помнить', p.note || '', 'корм, аллергии, клиника'),
    ].join(''),
    primary: 'Сохранить',
    onSave: (v, close) => {
      update(s => {
        s.care.pet = { ...s.care.pet, name: (v.name || '').trim(), kind: (v.kind || '').trim(), birth: v.birth || '', note: (v.note || '').trim() };
      });
      close();
    },
  });
}

function weightSheet() {
  openSheet({
    title: 'Вес',
    sub: S.care.pet.name || 'питомец',
    body: [
      field.number('kg', 'Сколько', '', { min: 0, suffix: 'кг' }),
      field.date('date', 'Когда', todayISO()),
    ].join(''),
    primary: 'Записать',
    onSave: (v, close) => {
      const kg = Number(v.kg);
      if (!kg) return toast('Введи вес');
      update(s => {
        const date = v.date || todayISO();
        s.care.pet.weights = [...(s.care.pet.weights || []).filter(w => w.date !== date), { id: uid(), date, kg }];
      });
      close();
    },
  });
}

export const actions = {
  tab: v => update(s => { s.ui.careTab = v.v; }),
  add: v => itemSheet(null, v.g),
  edit: v => itemSheet(careItems().find(x => x.id === v.id)),
  done: v => doneSheet(careItems().find(x => x.id === v.id)),
  tomeasure: () => { toast('Замеры записываются в разделе «Тело»'); location.hash = '#/health'; },
  petedit: () => petSheet(),
  weight: () => weightSheet(),
};
