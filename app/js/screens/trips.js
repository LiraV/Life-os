// «Страны»: где была за жизнь и что из этого случилось в этом году.
//
// Одна поездка — одна запись, поэтому в одну страну можно съездить трижды,
// а «за жизнь» всё равно считается по разу. Год обязателен, всё остальное —
// нет: смысл в отметке, а не в анкете.

import { S, update, updateQuiet, uid, XP, addXp } from '../store.js';
import { todayISO, yearOf } from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import { COUNTRIES, flagOf, countryName, searchCountries, REGIONS } from '../countries.js';
import { visits, countriesEver, countriesInYear, regionsEver, travelYears, COUNTRY_TOTAL } from '../selectors.js';
import { sphereGoalButton, sphereGoalsCard, sphereGoalActions } from '../spheregoal.js';

const TABS = [['life', 'За жизнь'], ['year', 'По годам'], ['add', 'Отметить']];
const tab = () => (TABS.some(([k]) => k === S.ui.tripTab) ? S.ui.tripTab : 'life');
const year = () => S.ui.tripYear || yearOf(todayISO());

export function render() {
  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ сферы</button>
      <span class="tag">карта</span>
    </div>
    <div class="title">Страны</div>
    <div class="pills">${TABS.map(([k, l]) => raw(h`<button class="pill ${tab() === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`))}</div>
    ${raw(tab() === 'year' ? yearView() : tab() === 'add' ? addView() : lifeView())}
    ${raw(sphereGoalsCard('trips'))}
    ${raw(sphereGoalButton('trips'))}
    <div style="height:4px"></div>`;
}

// ── за жизнь ────────────────────────────────────────────────────
function lifeView() {
  const list = countriesEver();
  const regions = regionsEver();
  const pct = Math.round((list.length / COUNTRY_TOTAL) * 100);
  return h`
    <div class="card">
      <div class="caps">За жизнь</div>
      <div class="ink"><b>${list.length}</b><span class="lab"> ${plural(list.length, 'страна', 'страны', 'стран')} из ${COUNTRY_TOTAL}</span></div>
      ${raw(bar(pct))}
      <div class="lab">${regions.length
        ? `${regions.length} ${plural(regions.length, 'часть света', 'части света', 'частей света')}: ${regions.join(', ')}.`
        : 'Отметь первую страну — счёт начнётся с неё.'}</div>
    </div>

    ${REGIONS.map(r => {
      const inR = list.filter(c => c.region === r);
      if (!inR.length) return '';
      return raw(h`
        <div class="card">
          <div class="row between"><div class="caps">${r}</div><span class="lab">${inR.length}</span></div>
          <div class="chips">
            ${inR.map(c => raw(h`<button class="chip" data-act="open" data-v="${c.code}">${flagOf(c.code)} ${c.name}
              <span class="lab">${c.years.join(', ')}</span></button>`))}
          </div>
        </div>`);
    })}

    ${list.length ? '' : raw(h`<div class="card dash"><div class="empty">Пока пусто.<br>Начни с той, где была последней.</div>
      <button class="add" data-act="tab" data-v="add">+ Отметить страну</button></div>`)}`;
}

// ── по годам ────────────────────────────────────────────────────
function yearView() {
  const years = travelYears();
  const y = year();
  const list = countriesInYear(y);
  return h`
    <div class="card">
      <div class="row between">
        <button class="arrow" data-act="prev">‹</button>
        <div><div class="caps" style="text-align:center">${y}</div>
          <div class="lab">${list.length ? `${list.length} ${plural(list.length, 'страна', 'страны', 'стран')}` : 'поездок не отмечено'}</div></div>
        <button class="arrow" data-act="next">›</button>
      </div>
      ${list.length ? raw(h`<div class="chips">${list.map(c => raw(h`
        <button class="chip" data-act="open" data-v="${c.code}">${flagOf(c.code)} ${c.name}</button>`))}</div>`) : ''}
    </div>

    ${years.length ? raw(h`
      <div class="card mute">
        <div class="caps">Все годы</div>
        ${years.map(yy => raw(h`
          <button class="link-row" data-act="goyear" data-v="${yy}">
            <span class="ink grow">${yy}</span>
            <span class="lab">${countriesInYear(yy).map(c => flagOf(c.code)).join(' ')} ›</span>
          </button>`))}
      </div>`) : raw('<div class="card mute"><div class="lab">Поездок пока нет.</div></div>')}`;
}

// ── отметить ────────────────────────────────────────────────────
/**
 * Найденное живёт отдельным куском: при вводе перерисовывается только оно.
 * Перерисовать весь экран нельзя — поле ввода заменилось бы новым, фокус
 * слетел бы, и на телефоне закрывалась бы клавиатура прямо посреди слова.
 */
function foundList() {
  const q = S.ui.tripSearch || '';
  const found = searchCountries(q);
  const been = new Set(countriesEver().map(c => c.code));
  return (q && !found.length ? '<div class="lab">Ничего не нашлось. Проверь написание — список на русском.</div>' : '')
    + (found.length ? h`<div class="list">${found.map(c => raw(h`
        <button class="link-row" data-act="mark" data-v="${c.code}">
          <span class="ink grow">${flagOf(c.code)} ${c.name}</span>
          <span class="lab">${been.has(c.code) ? 'уже была · ещё раз' : c.region} ›</span>
        </button>`))}</div>` : '')
    + (!q ? h`<div class="lab">Отмечу текущим годом — ${year()}. Год и заметку можно поправить, тапнув по стране.</div>` : '');
}

function addView() {
  const q = S.ui.tripSearch || '';
  return h`
    <div class="card">
      <div class="fld"><span>Какая страна</span>
        <input type="text" data-field="q" data-act-input="search" value="${q}" placeholder="начни печатать: тур, ита, гру" autocomplete="off">
      </div>
      <div id="cn_found">${raw(foundList())}</div>
    </div>

    ${visits().length ? raw(h`
      <div class="card mute">
        <div class="caps">Последние отметки</div>
        ${[...visits()].reverse().slice(0, 8).map(v => raw(h`
          <button class="link-row" data-act="edit" data-id="${v.id}">
            <span class="ink grow">${flagOf(v.code)} ${countryName(v.code)}</span>
            <span class="lab">${v.year}${v.note ? ` · ${v.note}` : ''} ›</span>
          </button>`))}
      </div>`) : ''}`;
}

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};

// ── шторки ──────────────────────────────────────────────────────
/** Все поездки в одну страну: годы, заметки, удаление. */
function countrySheet(code) {
  const mine = visits().filter(v => v.code === code).sort((a, b) => a.year - b.year);
  openSheet({
    title: `${flagOf(code)} ${countryName(code)}`,
    sub: mine.length ? `${mine.length} ${plural(mine.length, 'поездка', 'поездки', 'поездок')}` : 'ещё не отмечена',
    body: [
      mine.map(v => h`<div class="row between">
        <span class="lab grow">${v.year}${v.note ? ` · ${v.note}` : ''}</span>
      </div>`).join(''),
      field.number('year', 'Добавить поездку — год', year(), { min: 1900, max: 2200 }),
      field.text('note', 'Заметка', '', 'город, повод, с кем'),
      field.note('Каждая поездка отмечается отдельно. За жизнь страна всё равно считается один раз.'),
    ].join(''),
    primary: 'Добавить поездку',
    onSave: (v, close) => {
      addVisit(code, Number(v.year) || year(), (v.note || '').trim());
      close();
    },
  });
}

/** Одна отметка: год, заметка, удаление. */
function visitSheet(id) {
  const v = visits().find(x => x.id === id);
  if (!v) return;
  openSheet({
    title: `${flagOf(v.code)} ${countryName(v.code)}`,
    sub: 'одна поездка',
    body: [
      field.number('year', 'Год', v.year, { min: 1900, max: 2200 }),
      field.text('note', 'Заметка', v.note || '', 'город, повод, с кем'),
    ].join(''),
    primary: 'Сохранить',
    onSave: (val, close) => {
      update(s => {
        const x = s.travel.visits.find(y => y.id === id);
        if (!x) return;
        x.year = Number(val.year) || x.year;
        x.note = (val.note || '').trim();
      });
      close();
    },
    danger: 'Убрать отметку',
    onDanger: (_val, close) => {
      update(s => { s.travel.visits = s.travel.visits.filter(x => x.id !== id); });
      close();
      toast('Убрала');
    },
  });
}

function addVisit(code, y, note = '') {
  const first = !visits().some(v => v.code === code);
  update(s => {
    s.travel.visits.push({ id: uid(), code, year: y, note });
    addXp(XP.step);
  });
  toast(first ? `${flagOf(code)} ${countryName(code)} — новая страна ✦` : `${countryName(code)} · ${y}`);
}

export const actions = {
  ...sphereGoalActions('trips'),
  back: () => { location.hash = '#/spheres'; },
  tab: v => update(s => { s.ui.tripTab = v.v; }),
  // Сохраняем тихо и перерисовываем только список: экран целиком трогать
  // нельзя, иначе поле ввода пересоздаётся и клавиатура закрывается.
  search: v => {
    updateQuiet(s => { s.ui.tripSearch = v.value; });
    const box = document.getElementById('cn_found');
    if (box) box.innerHTML = foundList();
  },
  mark: v => addVisit(v.v, year()),
  open: v => countrySheet(v.v),
  edit: v => visitSheet(v.id),
  goyear: v => update(s => { s.ui.tripYear = Number(v.v); s.ui.tripTab = 'year'; }),
  prev: () => update(s => { s.ui.tripYear = year() - 1; }),
  next: () => update(s => { s.ui.tripYear = year() + 1; }),
};
