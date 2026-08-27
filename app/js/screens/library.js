// «Библиотека»: полка книг. Книга проходит путь «хочу → читаю → прочитано»,
// и на каждом шаге видно ровно то, что нужно: сколько осталось страниц,
// что взять следующим, сколько всего вышло за год.
//
// Отложенная книга — не провал: это отдельный статус, а не удаление.

import { S, update, uid, XP, addXp, touchTracker } from '../store.js';
import { todayISO, dayShort, monthKey, yearOf, MONTHS } from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import {
  BOOK_STATUS, books, booksBy, bookById, bookProgress,
  booksDoneIn, booksDoneYear, pagesInYear, ratingAvg,
} from '../selectors.js';
import { gv } from '../gender.js';
import { sphereGoalButton, sphereGoalsCard, sphereGoalActions } from '../spheregoal.js';

const TABS = [['now', 'Сейчас'], ['shelf', 'Полка'], ['year', 'Год']];
const tab = () => (TABS.some(([k]) => k === S.ui.bookTab) ? S.ui.bookTab : 'now');
const KINDS = { paper: 'бумажная', ebook: 'электронная', audio: 'аудио' };
const num = n => Number(n).toLocaleString('ru-RU');
const stars = n => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');

export function render() {
  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ сферы</button>
      <span class="tag">полка</span>
    </div>
    <div class="title">Библиотека</div>
    <div class="pills">${TABS.map(([k, l]) => raw(h`<button class="pill ${tab() === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`))}</div>
    ${raw(tab() === 'shelf' ? shelfView() : tab() === 'year' ? yearView() : nowView())}
    ${raw(sphereGoalsCard('books'))}
    ${raw(sphereGoalButton('books'))}
    <div style="height:4px"></div>`;
}

// ── сейчас ──────────────────────────────────────────────────────
function nowView() {
  const reading = booksBy('reading');
  const want = booksBy('want');
  return h`
    ${reading.length ? reading.map(b => raw(readingCard(b)))
      : raw(h`<div class="card dash"><div class="empty">Сейчас ничего не читаешь.<br>Это тоже нормально — книга подождёт.</div>
          <button class="add" data-act="add">+ Книга</button></div>`)}

    <div class="card">
      <div class="row between"><div class="caps">Хочу прочитать</div>
        <span class="lab">${want.length || 'пусто'}</span></div>
      ${want.length ? raw(h`<div class="list">${want.map(b => raw(h`
        <button class="row between care-name" data-act="open" data-id="${b.id}">
          <span class="ink grow ellip">${b.title}</span>
          <span class="lab">${b.author || KINDS[b.kind]} ›</span>
        </button>`))}</div>`)
        : raw('<div class="lab">Сюда складывается то, что хочется прочитать — без обязательств.</div>')}
      <button class="add" data-act="add">+ Книга</button>
    </div>`;
}

/** Карточка книги, которую читаешь: прогресс и «дочитал(а) до…». */
function readingCard(b) {
  const pct = bookProgress(b);
  const left = b.pages > 0 ? b.pages - b.page : null;
  return h`
    <div class="card">
      <div class="row between">
        <div class="grow" data-act="open" data-id="${b.id}" style="cursor:pointer">
          <div class="ink"><b>${b.title}</b></div>
          <div class="lab">${[b.author, KINDS[b.kind], b.started ? `с ${dayShort(b.started)}` : ''].filter(Boolean).join(' · ')}</div>
        </div>
        <button class="q-edit" data-act="open" data-id="${b.id}">изменить ›</button>
      </div>
      ${pct != null ? raw(h`
        <div class="row">${raw(bar(pct, pct >= 100))}<span class="lab">${pct}%</span></div>
        <div class="lab">${num(b.page)} из ${num(b.pages)}${left > 0 ? ` · осталось ${num(left)}` : ''}</div>`)
        : raw('<div class="lab">Объём не задан — прогресс не считаю, просто отмечу, когда дочитаешь.</div>')}
      <div class="pills">
        <button class="pill" data-act="page" data-id="${b.id}">докуда ${gv('дочитал')}</button>
        <button class="pill" data-act="finish" data-id="${b.id}">${gv('дочитал')} ✦</button>
      </div>
    </div>`;
}

// ── полка ───────────────────────────────────────────────────────
function shelfView() {
  return h`
    ${BOOK_STATUS.map(st => {
      const list = booksBy(st.key);
      return raw(h`
        <div class="card">
          <div class="row between"><div class="caps">${st.name}</div>
            <span class="lab">${list.length || ''}</span></div>
          ${list.length ? raw(h`<div class="list">${list.map(b => raw(h`
            <button class="row between care-name" data-act="open" data-id="${b.id}">
              <span class="ink grow ellip">${b.title}</span>
              <span class="lab">${b.rating ? stars(b.rating) : (b.author || '')} ›</span>
            </button>`))}</div>`)
            : raw('<div class="lab">Пока пусто.</div>')}
        </div>`);
    })}
    <button class="add" data-act="add">+ Книга</button>`;
}

// ── год ─────────────────────────────────────────────────────────
function yearView() {
  const y = yearOf(todayISO());
  const done = booksDoneYear(y);
  const avg = ratingAvg(y);
  const cur = monthKey(todayISO());
  return h`
    <div class="card">
      <div class="caps">${y} год</div>
      <div class="ink"><b>${done.length}</b><span class="lab"> ${plural(done.length, 'книга', 'книги', 'книг')} дочитано за год</span></div>
      <div class="lab">${pagesInYear(y) ? `${num(pagesInYear(y))} страниц · ` : ''}${avg ? `средняя оценка ${avg}` : 'оценки пока не проставлены'}</div>
    </div>
    ${MONTHS.map((name, i) => {
      const ym = `${y}-${String(i + 1).padStart(2, '0')}`;
      const list = booksDoneIn(ym);
      return raw(h`
        <div class="card ${ym === cur ? '' : 'mute'}">
          <div class="row between"><div class="caps">${name}${ym === cur ? ' · сейчас' : ''}</div>
            <span class="lab">${list.length || ''}</span></div>
          ${list.length ? raw(h`<div class="list">${list.map(b => raw(h`
            <button class="row between care-name" data-act="open" data-id="${b.id}">
              <span class="ink grow ellip">${b.title}</span>
              <span class="lab">${stars(b.rating)}</span>
            </button>`))}</div>`)
            : raw('<div class="lab">пусто</div>')}
        </div>`);
    })}`;
}

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};

// ── шторки ──────────────────────────────────────────────────────
function bookSheet(book) {
  const isNew = !book;
  const b = book || {
    id: uid(), title: '', author: '', kind: 'paper', pages: 0, page: 0,
    status: 'want', rating: 0, started: '', finished: '', note: '',
  };
  openSheet({
    title: isNew ? 'Книга' : b.title,
    sub: isNew ? 'можно просто название — остальное потом' : [b.author, KINDS[b.kind]].filter(Boolean).join(' · '),
    body: [
      field.text('title', 'Название', b.title, 'что читаем'),
      field.text('author', 'Автор', b.author || ''),
      field.opts('kind', 'Вид', [
        { value: 'paper', label: 'Бумажная' }, { value: 'ebook', label: 'Электронная' }, { value: 'audio', label: 'Аудио' },
      ], b.kind),
      field.opts('status', 'Где она сейчас', BOOK_STATUS.map(x => ({ value: x.key, label: x.name })), b.status),
      field.number('pages', 'Сколько всего страниц', b.pages || '', { min: 0 }),
      field.number('page', `Докуда ${gv('дочитал')}`, b.page || '', { min: 0 }),
      field.opts('rating', 'Оценка', [
        { value: '0', label: 'без оценки' }, { value: '1', label: '★' }, { value: '2', label: '★★' },
        { value: '3', label: '★★★' }, { value: '4', label: '★★★★' }, { value: '5', label: '★★★★★' },
      ], String(b.rating || 0)),
      field.area('note', 'Заметка или цитата', b.note || ''),
      field.note('Даты начала и конца проставляются сами, когда меняешь статус. У аудиокниги в «страницах» удобно держать минуты.'),
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Нужно название');
      update(s => {
        const prev = s.library.books.find(x => x.id === b.id);
        const status = v.status || 'want';
        const next = {
          ...b, title, author: (v.author || '').trim(), kind: v.kind || 'paper', status,
          pages: Math.max(0, Number(v.pages) || 0), page: Math.max(0, Number(v.page) || 0),
          rating: Math.min(5, Math.max(0, Number(v.rating) || 0)), note: (v.note || '').trim(),
          started: b.started || (status === 'reading' ? todayISO() : ''),
          finished: status === 'done' ? (b.finished || todayISO()) : '',
        };
        const i = s.library.books.findIndex(x => x.id === b.id);
        if (i >= 0) s.library.books[i] = next; else s.library.books.push(next);
        if (status === 'done' && prev?.status !== 'done') addXp(XP.step);
        touchTracker(s);
      });
      close();
    },
    danger: isNew ? null : 'Убрать с полки',
    onDanger: (_v, close) => {
      update(s => { s.library.books = s.library.books.filter(x => x.id !== b.id); touchTracker(s); });
      close();
      toast('Убрала');
    },
  });
}

/** Отметка «дочитал(а) до…»: страница и, если дошла до конца, вопрос о финале. */
function pageSheet(b) {
  openSheet({
    title: b.title,
    sub: b.pages ? `всего ${num(b.pages)}` : 'объём не задан',
    body: [
      field.number('page', `${gv('Дочитал')} до страницы`, b.page || '', { min: 0 }),
      field.note('Это просто закладка: прогресс пересчитается сам.'),
    ].join(''),
    primary: 'Записать',
    onSave: (v, close) => {
      const page = Math.max(0, Number(v.page) || 0);
      update(s => {
        const x = s.library.books.find(y => y.id === b.id);
        if (!x) return;
        x.page = page;
        if (x.status === 'want') { x.status = 'reading'; x.started = x.started || todayISO(); }
      });
      close();
    },
  });
}

/** Финал книги: дата и оценка. Оценку можно не ставить. */
function finishSheet(b) {
  openSheet({
    title: `${b.title} — дочитана`,
    sub: 'можно поставить оценку, а можно не ставить',
    body: [
      field.date('finished', `Когда ${gv('дочитал')}`, todayISO()),
      field.opts('rating', 'Оценка', [
        { value: '0', label: 'без оценки' }, { value: '1', label: '★' }, { value: '2', label: '★★' },
        { value: '3', label: '★★★' }, { value: '4', label: '★★★★' }, { value: '5', label: '★★★★★' },
      ], String(b.rating || 0)),
      field.area('note', 'Что осталось от книги', b.note || ''),
    ].join(''),
    primary: 'Готово',
    onSave: (v, close) => {
      update(s => {
        const x = s.library.books.find(y => y.id === b.id);
        if (!x) return;
        x.status = 'done';
        x.finished = v.finished || todayISO();
        x.rating = Math.min(5, Math.max(0, Number(v.rating) || 0));
        x.note = (v.note || '').trim();
        if (x.pages) x.page = x.pages;
        addXp(XP.step);
        touchTracker(s);
      });
      close();
      toast('Дочитана ✦');
    },
  });
}

export const actions = {
  ...sphereGoalActions('books'),
  back: () => { location.hash = '#/spheres'; },
  tab: v => update(s => { s.ui.bookTab = v.v; }),
  add: () => bookSheet(null),
  open: v => bookSheet(bookById(v.id)),
  page: v => pageSheet(bookById(v.id)),
  finish: v => finishSheet(bookById(v.id)),
};
