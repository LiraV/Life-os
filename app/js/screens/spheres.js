// «Сферы»: плитки и разбор одной сферы. У каждой — этапы с прогрессом,
// у блога стадии идей, у бюджета копилка, у спорта — статистика из квестов.

import { goBack } from '../nav.js';
import { S, update, uid, XP, addXp, SPHERES, addDiary, allSpheres, visibleSpheres, isCustomSphere, sphereKinds, blankSphere, nameTaken } from '../store.js';
import { todayISO, addDays, monthKey, monthTitle, monthIn, weekDates, dayShort, yearOf, DOW, dowIndex } from '../dates.js';
import { h, raw, field, bar, toast, openSheet, confirmSheet, money } from '../ui.js';
import { gt } from '../gender.js';
import { SPHERE_ART, DEFAULT_ART, artSrc } from '../sphereart.js';
import { BLOG_STAGES, BLOG_PLACES, BLOG_FEEDS, placeShort, placeName, PACK, packById, UNPACK, UNPACK_ALL } from '../blog.js';
import { blogPosts, blogBy, blogMonth, blogYear, blogTotal, blogAhead, viewsMonth, viewsRecord,
  subsLast, subsDelta, subsTotal, sleepAvg, blogFormats, blogRubrics, rubricName, formatName,
  rubricMix, rubricUnsorted, formatMix, blockProgress } from '../selectors.js';
import { foodSums as sums, balanceAt } from '../selectors.js';
import { sphereProgress, sphereStatus, questsOn, sphereOf, liveLessons, lessonMonth, sportLessonSessions,
  sphereLogOn, sphereLogMonth, sphereLogTotal, sphereLogYear, ROLES, roleOfSphere,
  SHELF_STATUS, sphereShelf, shelfBy, BOARD_STAGES, sphereBoard, boardBy,
  sphereColl, collYear, sphereMeas, measLast, measRecord, workWeek, jobsNow } from '../selectors.js';
import { studyNow, workoutsIn } from '../selectors.js';
import { sphereGoalButton, sphereGoalsCard, sphereGoalSheet } from '../spheregoal.js';

const rec = (s, key) => (s.spheres[key] ||= blankSphere());

export function render(params) {
  return params[0] ? detail(params[0]) : grid();
}

function grid() {
  return h`
    <div class="title">Сферы</div>
    <div class="sub">У каждой своя механика. Тапни, чтобы открыть.</div>
    <div class="grid2">
      ${visibleSpheres().map(sp => {
        const pct = sphereProgress(sp.key);
        const food = sp.key === 'food' ? sums(todayISO()) : null;
        const bal = sp.key === 'money' ? balanceAt(todayISO().slice(0, 7)) : null;
        const stu = sp.key === 'study' ? studyNow() : null;
        const wk = sp.key === 'work' ? { ...workWeek(todayISO()), jobs: jobsNow().length } : null;
        const bl = sp.key === 'blog' ? { month: blogMonth(todayISO().slice(0, 7)), ideas: blogBy('idea').length } : null;
        const hl = sp.key === 'health' ? { sleep: sleepAvg(30), meas: S.health.measures.slice(-1)[0] } : null;
        const edu = sp.key === 'edu'
          ? liveLessons().filter(l => !l.paused).reduce((a, l) => a + lessonMonth(l, todayISO().slice(0, 7)), 0)
          : null;
        return raw(h`
          <button class="tile" data-act="open" data-v="${sp.key}">
            ${sp.img ? raw(h`<img src="${sp.img}" alt="">`) : raw(h`<div class="tile-emoji">${sp.icon}</div>`)}
            <span class="tile-badge">${sp.mech}</span>
            <b>${sp.name}</b>
            <span>${hl ? (hl.sleep != null ? `сон ${String(hl.sleep).replace('.', ',')} ч в среднем`
                : hl.meas ? `замер ${dayShort(hl.meas.date)}` : 'пока пусто')
              : bl ? (bl.month ? `${bl.month} ${plural(bl.month, 'пост', 'поста', 'постов')} за месяц`
                : bl.ideas ? `${bl.ideas} ${plural(bl.ideas, 'идея', 'идеи', 'идей')} в банке` : 'пока пусто')
              : wk ? (!wk.jobs ? 'место не заведено' : wk.days ? `${wk.hours} ч за неделю` : 'неделя не отмечена')
              : food ? `сегодня ${food.kcal} ккал`
              : bal != null ? `остаток ${money(bal)}`
              : edu != null ? (edu ? `${edu} занятий за месяц` : 'полка занятий')
              : stu ? (stu.overdue.length ? `просрочено ${stu.overdue.length}`
                : stu.due.length ? `скоро сдавать ${stu.due.length}`
                : stu.open.length ? `${stu.open.length} в работе` : 'всё закрыто')
              : sphereStatus(sp.key)}</span>
            ${pct != null ? raw(bar(pct, pct >= 100)) : ''}
          </button>`);
      })}
    </div>
    <button class="add" data-act="newsphere">+ Своя сфера</button>
    ${hidden().length ? raw(h`
      <div class="card mute">
        <div class="caps">Убраны с глаз</div>
        <div class="lab">Данные на месте — просто не мозолят глаза.</div>
        <div class="pills">${hidden().map(sp => raw(h`<button class="pill" data-act="unhide" data-v="${sp.key}">${sp.img ? raw(h`<img class="pill-art" src="${sp.img}" alt="">`) : (sp.icon || '')} ${sp.name}</button>`))}</div>
      </div>`) : ''}
    <div class="card dash">
      <div class="lab">Сферы — это не отчёт. Пустая сфера не отнимает ничего,
        а ненужную можно убрать с глаз — она не удалится.</div>
    </div>`;
}

const hidden = () => allSpheres().filter(sp => (S.spheresHidden || []).includes(sp.key));

function detail(key) {
  const sp = sphereOf(key);
  if (!sp) return h`<div class="empty">Такой сферы нет. <button class="q-edit" data-act="tolist">← к сферам</button></div>`;
  const r = S.spheres[key] || { items: [], note: '', log: {} };
  const items = r.items || [];
  const pct = sphereProgress(key);
  const own = isCustomSphere(key);
  // У встроенных сферы механики зашиты, у своих выбраны при создании.
  const kinds = own ? sphereKinds(key) : ['steps'];

  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ назад</button>
      <span class="tag">${sp.mech}</span>
    </div>
    <div class="row between">
      <div class="title grow">${sp.name}</div>
      <button class="q-edit" data-act="sphereedit" data-v="${key}">изменить ›</button>
    </div>
    ${sp.img ? raw(h`<img class="hero-img" src="${sp.img}" alt="">`) : raw(h`<div class="hero-emoji">${sp.icon}</div>`)}
    ${pct != null ? raw(h`<div class="card"><div class="row">${raw(bar(pct, pct >= 100))}<span class="lab">${pct}%</span></div>
      <div class="lab">${items.filter(i => i.done).length} из ${items.length} закрыто</div></div>`) : ''}

    ${raw(key === 'blog' ? blogBody() : key === 'money' ? vaultBody(r) : key === 'sport' ? sportBody() : '')}
    ${raw(kinds.includes('log') ? logBody(key, sp) : '')}
    ${raw(kinds.includes('shelf') ? shelfBody(key, sp) : '')}
    ${raw(kinds.includes('coll') ? collBody(key, sp) : '')}
    ${raw(kinds.includes('board') ? boardBody(key) : '')}
    ${raw(kinds.includes('meas') ? measBody(key, sp) : '')}

    ${raw(sphereGoalsCard(key))}
    ${raw(sphereGoalButton(key))}

    ${kinds.includes('steps') && key !== 'blog' ? raw(h`
      <div class="card">
        <div class="caps">Этапы</div>
        ${items.length ? raw(h`<div class="list">${items.map(i => raw(itemRow(key, i)))}</div>`)
          : raw('<div class="empty">Пока пусто. Добавь первый шаг — он и будет прогрессом.</div>')}
        <button class="add" data-act="itemadd">+ Этап</button>
      </div>`) : ''}

    <div class="card">
      <div class="row between"><div class="caps">Заметка</div><button class="q-edit" data-act="note">изменить ›</button></div>
      <div class="ink">${r.note || '—'}</div>
    </div>`;
}


/**
 * Механика «журнал»: отметки по дням. Неделя тапами, итоги за месяц и год.
 * Одна отметка — один раз; сколько именно, можно вписать.
 */
function logBody(key, sp) {
  const t = todayISO();
  const week = weekDates(t);
  const ym = monthKey(t);
  const y = yearOf(t);
  return h`
    <div class="card">
      <div class="row between"><div class="caps">Журнал</div>
        <span class="lab">${sphereLogMonth(key, ym)} ${plural(sphereLogMonth(key, ym), 'день', 'дня', 'дней')} в ${monthIn(ym)}</span></div>
      <div class="hab-grid">
        ${week.map(d => {
          const n = sphereLogOn(key, d);
          return raw(h`<button class="hab-cell ${n ? 'on' : ''} ${d === t ? 'today' : ''}"
             data-act="logtick" data-d="${d}"
             ${raw(d > t ? 'disabled style="opacity:.4"' : '')}
             aria-label="${dayShort(d)}: ${n}">${n || d.slice(8)}</button>`);
        })}
      </div>
      <div class="lab">За ${y} год — ${sphereLogYear(key, y)} ${plural(sphereLogYear(key, y), 'день', 'дня', 'дней')},
        всего ${sphereLogTotal(key, ym)} ${sp.unit || 'раз'} за месяц.
        Тап отмечает день, долгий путь — кнопка ниже.</div>
      <button class="add" data-act="logset">Вписать за день</button>
    </div>`;
}


// ── полка ───────────────────────────────────────────────────────
/** Путь «хочу → в процессе → сделано». Отложенное — статус, а не провал. */
function shelfBody(key, sp) {
  return h`
    ${SHELF_STATUS.map(st => {
      const list = shelfBy(key, st.key);
      return raw(h`
        <div class="card ${st.key === 'off' && !list.length ? 'mute' : ''}">
          <div class="row between"><div class="caps">${st.name}</div>
            <span class="lab">${list.length || ''}</span></div>
          ${list.length ? raw(h`<div class="list">${list.map(x => raw(h`
            <button class="link-row" data-act="shelfedit" data-id="${x.id}">
              <span class="ink grow ellip">${x.title}</span>
              <span class="lab">${x.rating ? '★'.repeat(x.rating) : (x.note || '')} ›</span>
            </button>`))}</div>`)
            : raw('<div class="lab">Пусто.</div>')}
        </div>`);
    })}
    <button class="add" data-act="shelfadd">+ ${sp.unit || 'Запись'}</button>`;
}

// ── коллекция ───────────────────────────────────────────────────
/** Единицы с датой: сколько за год и сколько за всё время. */
function collBody(key, sp) {
  const all = sphereColl(key);
  const y = yearOf(todayISO());
  const thisYear = collYear(key, y);
  return h`
    <div class="card">
      <div class="row between"><div class="caps">Собрано</div>
        <span class="lab">за ${y} — ${thisYear.length}</span></div>
      <div class="ink"><b>${all.length}</b><span class="lab"> ${sp.unit || 'штук'} за всё время</span></div>
      ${all.length ? raw(h`<div class="chips">${[...all].reverse().slice(0, 40).map(x => raw(h`
        <button class="chip" data-act="colledit" data-id="${x.id}">${x.name}
          <span class="lab">${(x.date || '').slice(0, 4)}</span></button>`))}</div>`)
        : raw('<div class="lab">Пока пусто. Первая запись и будет началом.</div>')}
      ${all.length > 40 ? raw(h`<div class="lab">Показаны последние 40 из ${all.length}.</div>`) : ''}
      <button class="add" data-act="colladd">+ ${sp.unit || 'Запись'}</button>
    </div>`;
}

// ── доска ───────────────────────────────────────────────────────
/** Три стадии. Тап по стадии двигает дальше, с последней возвращает в начало. */
function boardBody(key) {
  return h`
    ${BOARD_STAGES.map(st => {
      const list = boardBy(key, st.key);
      return raw(h`
        <div class="card">
          <div class="row between"><div class="caps">${st.name}</div>
            <span class="lab">${list.length || ''}</span></div>
          ${list.length ? raw(h`<div class="list">${list.map(x => raw(h`
            <div class="chk-row">
              <button class="pill" data-act="boardmove" data-id="${x.id}">${st.name.toLowerCase()}</button>
              <span class="grow ellip" data-act="boardedit" data-id="${x.id}" style="cursor:pointer">${x.title}</span>
              <button class="q-edit" data-act="boardedit" data-id="${x.id}">›</button>
            </div>`))}</div>`)
            : raw('<div class="lab">Пусто.</div>')}
        </div>`);
    })}
    <button class="add" data-act="boardadd">+ Дело</button>`;
}

// ── замеры ──────────────────────────────────────────────────────
/** Число с датой. Рекорд показываем только если сказано, куда «лучше». */
function measBody(key, sp) {
  const list = sphereMeas(key);
  const last = measLast(key);
  const rec = measRecord(key);
  const prev = list.length > 1 ? list[list.length - 2] : null;
  const d = last && prev ? Math.round((last.value - prev.value) * 100) / 100 : null;
  return h`
    <div class="card">
      <div class="row between"><div class="caps">Замеры</div>
        <span class="lab">${last ? dayShort(last.date) : 'нет данных'}</span></div>
      ${last ? raw(h`
        <div class="ink"><b>${last.value}</b><span class="lab"> ${sp.unit || ''}${d != null ? ` · ${d > 0 ? '+' : ''}${d} к прошлому` : ''}</span></div>
        ${rec ? raw(h`<div class="lab">Лучшее — ${rec.value} ${sp.unit || ''} · ${dayShort(rec.date)}</div>`)
              : raw('<div class="lab">Куда «лучше» — не задано, поэтому рекорд не считаю.</div>')}`)
        : raw('<div class="empty">Первый замер — точка отсчёта, а не оценка.</div>')}
      <button class="add" data-act="measadd">+ Замер</button>
    </div>
    ${list.length > 1 ? raw(h`
      <div class="card mute">
        <div class="caps">История</div>
        ${[...list].reverse().slice(0, 8).map(x => raw(h`
          <button class="link-row" data-act="measedit" data-id="${x.id}">
            <span class="lab">${dayShort(x.date)}</span>
            <span class="ink">${x.value} ${sp.unit || ''}</span>
            <span class="lab">${x.note || ''} ›</span>
          </button>`))}
      </div>`) : ''}`;
}

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};


/** Одна запись полки: название, статус, оценка, заметка. */
function shelfSheet(id) {
  const key = curKey();
  const x = sphereShelf(key).find(y => y.id === id);
  const it = x || { id: uid(), title: '', status: 'want', rating: 0, note: '', started: '', finished: '' };
  openSheet({
    title: x ? x.title : 'Новая запись',
    body: [
      field.text('title', 'Что это', it.title, 'название'),
      field.opts('status', 'Где оно сейчас', SHELF_STATUS.map(st => ({ value: st.key, label: st.name })), it.status),
      field.opts('rating', 'Оценка', [
        { value: '0', label: 'без оценки' }, { value: '1', label: '★' }, { value: '2', label: '★★' },
        { value: '3', label: '★★★' }, { value: '4', label: '★★★★' }, { value: '5', label: '★★★★★' },
      ], String(it.rating || 0)),
      field.text('note', 'Заметка', it.note || ''),
      field.note('Дата окончания проставляется сама, когда ставишь «Сделано», — по ней считаются итоги за месяц и год.'),
    ].join(''),
    primary: x ? 'Сохранить' : 'Добавить',
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Нужно название');
      update(s => {
        const list = rec(s, key).shelf;
        const status = v.status || 'want';
        const next = {
          ...it, title, status, rating: Math.min(5, Math.max(0, Number(v.rating) || 0)),
          note: (v.note || '').trim(),
          started: it.started || (status === 'doing' ? todayISO() : ''),
          finished: status === 'done' ? (it.finished || todayISO()) : '',
        };
        const i = list.findIndex(y => y.id === it.id);
        if (i >= 0) list[i] = next; else list.push(next);
        if (status === 'done' && x?.status !== 'done') addXp(XP.step);
      });
      close();
    },
    danger: x ? 'Убрать' : null,
    onDanger: (_v, close) => {
      update(s => { const r = rec(s, key); r.shelf = r.shelf.filter(y => y.id !== it.id); });
      close();
      toast('Убрала');
    },
  });
}

/** Единица коллекции: имя и дата. Дата нужна, чтобы считать «за год». */
function collSheet(id) {
  const key = curKey();
  const x = sphereColl(key).find(y => y.id === id);
  const it = x || { id: uid(), name: '', date: todayISO(), note: '' };
  openSheet({
    title: x ? x.name : 'Новая запись',
    body: [
      field.text('name', 'Что', it.name, 'название'),
      field.date('date', 'Когда', it.date || todayISO()),
      field.text('note', 'Заметка', it.note || ''),
      field.note('Дата нужна, чтобы считать «за год». Если это было давно — поставь ту дату, какая была.'),
    ].join(''),
    primary: x ? 'Сохранить' : 'Добавить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => {
        const list = rec(s, key).coll;
        const next = { ...it, name, date: v.date || todayISO(), note: (v.note || '').trim() };
        const i = list.findIndex(y => y.id === it.id);
        if (i >= 0) list[i] = next; else { list.push(next); addXp(XP.step); }
      });
      close();
    },
    danger: x ? 'Убрать' : null,
    onDanger: (_v, close) => {
      update(s => { const r = rec(s, key); r.coll = r.coll.filter(y => y.id !== it.id); });
      close();
      toast('Убрала');
    },
  });
}

/** Дело на доске: название и стадия. */
function boardSheet(id) {
  const key = curKey();
  const x = sphereBoard(key).find(y => y.id === id);
  const it = x || { id: uid(), title: '', stage: 'todo', stageAt: '', note: '' };
  openSheet({
    title: x ? x.title : 'Новое дело',
    body: [
      field.text('title', 'Что делаем', it.title, 'коротко'),
      field.opts('stage', 'Стадия', BOARD_STAGES.map(st => ({ value: st.key, label: st.name })), it.stage || 'todo'),
      field.text('note', 'Заметка', it.note || ''),
    ].join(''),
    primary: x ? 'Сохранить' : 'Добавить',
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Нужно название');
      update(s => {
        const list = rec(s, key).board;
        const stage = v.stage || 'todo';
        const next = {
          ...it, title, stage, note: (v.note || '').trim(),
          stageAt: stage === it.stage ? it.stageAt : todayISO(),
        };
        const i = list.findIndex(y => y.id === it.id);
        if (i >= 0) list[i] = next; else list.push(next);
        if (stage === 'done' && x?.stage !== 'done') addXp(XP.step);
      });
      close();
    },
    danger: x ? 'Убрать' : null,
    onDanger: (_v, close) => {
      update(s => { const r = rec(s, key); r.board = r.board.filter(y => y.id !== it.id); });
      close();
      toast('Убрала');
    },
  });
}

/** Замер: дата и число. */
function measSheet(id) {
  const key = curKey();
  const sp = sphereOf(key);
  const x = sphereMeas(key).find(y => y.id === id);
  const it = x || { id: uid(), date: todayISO(), value: '', note: '' };
  openSheet({
    title: x ? 'Замер' : 'Новый замер',
    sub: sp.unit ? `в ${sp.unit}` : '',
    body: [
      field.date('date', 'Когда', it.date),
      field.number('value', `Сколько${sp.unit ? `, ${sp.unit}` : ''}`, it.value, {}),
      field.text('note', 'Заметка', it.note || ''),
    ].join(''),
    primary: x ? 'Сохранить' : 'Записать',
    onSave: (v, close) => {
      if (v.value === '' || v.value == null) return toast('Нужно число');
      update(s => {
        const list = rec(s, key).meas;
        const next = { ...it, date: v.date || todayISO(), value: Number(v.value), note: (v.note || '').trim() };
        const i = list.findIndex(y => y.id === it.id);
        if (i >= 0) list[i] = next; else { list.push(next); addXp(XP.measure); }
      });
      close();
    },
    danger: x ? 'Убрать' : null,
    onDanger: (_v, close) => {
      update(s => { const r = rec(s, key); r.meas = r.meas.filter(y => y.id !== it.id); });
      close();
      toast('Убрала');
    },
  });
}

/** Заготовки: шаблон только заполняет форму, сам ничего не создаёт. */
const TEMPLATES = [
  { id: 'practice', name: 'Практика', icon: '🌱', art: 'move', mech: 'практика', kinds: ['log'], unit: 'раз',
    hint: 'медитация, рисование, гитара — важно, как часто' },
  { id: 'shelf', name: 'Полка', icon: '📺', art: 'read', mech: 'полка', kinds: ['shelf'], unit: 'Запись',
    hint: 'сериалы, игры, фильмы — важно, что смотришь и что досмотрел' },
  { id: 'coll', name: 'Коллекция', icon: '🗃', art: 'photo', mech: 'коллекция', kinds: ['coll'], unit: 'штук',
    hint: 'пластинки, растения, концерты — важно, сколько набралось' },
  { id: 'board', name: 'Доска', icon: '🗂', art: 'sign', mech: 'доска', kinds: ['board'], unit: 'дел',
    hint: 'ремонт, заказы, фриланс — важно, что на какой стадии' },
  { id: 'projects', name: 'Список дел', icon: '🔨', art: 'plan', mech: 'проекты', kinds: ['steps'], unit: 'шагов',
    hint: 'простой список с галочками и прогрессом' },
  { id: 'meas', name: 'Дневник числа', icon: '📈', art: 'note', mech: 'замеры', kinds: ['meas'], unit: 'баллов',
    hint: 'настроение, шаги, часы за рулём — важно, как меняется' },
  { id: 'blank', name: 'С нуля', icon: '✦', art: 'plan', mech: 'своя', kinds: ['steps'], unit: 'раз',
    hint: 'выберешь всё сам' },
];

/** Механики в форме: подпись и пояснение, чтобы выбор был осмысленным. */
const KINDS = [
  ['steps', 'Этапы', 'список с галочками и прогрессом'],
  ['log', 'Журнал', 'отметки по дням, счёт за месяц и год'],
  ['shelf', 'Полка', 'хочу → в процессе → сделано → отложено'],
  ['coll', 'Коллекция', 'единицы с датой: за год и за всё время'],
  ['board', 'Доска', 'не начато → в работе → готово'],
  ['meas', 'Замеры', 'число с датой, разница и лучшее'],
];

/** Создание своей сферы: сначала заготовка, потом её можно переписать. */
function newSphereSheet() {
  openSheet({
    title: 'Своя сфера',
    sub: 'сначала выбери, на что она похожа',
    body: [
      TEMPLATES.map(t => h`
        <button class="link-row" data-act="tpl" data-v="${t.id}">
          <img class="tpl-art" src="${artSrc(t.art)}" alt="" loading="lazy">
          <span class="ink grow">${t.name}</span>
          <span class="lab">${t.hint} ›</span>
        </button>`).join(''),
      field.note('Заготовка только заполнит форму — можно поменять всё до создания и после. Пока не нажмёшь «Создать», ничего не появится.'),
    ].join(''),
    onAct: (name, data, close) => {
      if (name !== 'tpl') return;
      close();
      sphereSheet(null, TEMPLATES.find(t => t.id === data.v));
    },
  });
}

/** Форма сферы: имя, значок, механики, роль. Она же правит существующую. */
function sphereSheet(key, tpl) {
  const own = key ? S.customSpheres.find(x => x.key === key) : null;
  const built = key && !own ? sphereOf(key) : null;
  const base = own || tpl || { name: '', icon: '✦', art: DEFAULT_ART, mech: 'своя', kinds: ['steps'], unit: 'раз' };
  const kinds = base.kinds || [];
  openSheet({
    title: built ? built.name : own ? own.name : 'Своя сфера',
    sub: built ? 'встроенная сфера — можно сменить роль или убрать с глаз' : 'что это и что она считает',
    body: [
      built ? '' : field.text('name', 'Название', base.name, 'например, «Музыка»'),
      built ? '' : field.pics('art', 'Обложка', SPHERE_ART, base.art || DEFAULT_ART),
      built ? '' : field.text('mech', 'Подпись на плитке', base.mech, 'коротко: практика, проекты'),
      built ? '' : `<div class="fld"><span>Что она считает</span>
        ${KINDS.map(([k, name, hint]) => `<label class="row tight" style="font-size:13px">
          <input type="checkbox" name="${k}" ${kinds.includes(k) ? 'checked' : ''}> ${name} — ${hint}</label>`).join('')}
      </div>`,
      built ? '' : field.text('unit', 'Как называть единицу', base.unit, 'раз, штук, баллов'),
      built || !kinds.includes('meas') ? '' : field.opts('dir', 'Куда «лучше»', [
        { value: 'none', label: 'не считать' }, { value: 'up', label: 'больше' }, { value: 'down', label: 'меньше' },
      ], base.dir || 'none'),
      field.select('role', 'К какой роли относится',
        [{ value: '', label: 'без роли' }, ...ROLES.map(r => ({ value: r.id, label: r.name }))],
        key ? roleOfSphere(key) : ''),
      field.note('Роль — это характер в «Круге ролей»: она оживает от отметок своих сфер. Ролей фиксированный набор, но кто к какой относится — решаешь ты.'),
      `<label class="row tight" style="font-size:13px"><input type="checkbox" name="hide" ${key && (S.spheresHidden || []).includes(key) ? 'checked' : ''}> Убрать с глаз — данные останутся</label>`,
    ].join(''),
    primary: key ? 'Сохранить' : 'Создать',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!key && !name) return toast('Нужно название');
      const twin = name && nameTaken(allSpheres(), name, key);
      if (twin) return toast(`Сфера «${twin.name}» уже есть`);
      const picked = KINDS.map(([k]) => (v[k] ? k : null)).filter(Boolean);
      if (!key && !picked.length) return toast('Выбери хотя бы одну механику');
      const id = key || ('c' + uid());
      update(s => {
        if (!built) {
          const next = {
            key: id, name, art: SPHERE_ART.some(a => a.key === v.art) ? v.art : DEFAULT_ART,
            mech: (v.mech || 'своя').trim() || 'своя', kinds: picked,
            unit: (v.unit || 'раз').trim() || 'раз',
            dir: ['up', 'down'].includes(v.dir) ? v.dir : 'none', archived: false,
          };
          const i = s.customSpheres.findIndex(x => x.key === id);
          if (i >= 0) s.customSpheres[i] = { ...s.customSpheres[i], ...next };
          else s.customSpheres.push(next);
          s.spheres[id] ||= blankSphere();
        }
        s.roleOf[id] = v.role || '';
        s.spheresHidden = (s.spheresHidden || []).filter(x => x !== id);
        if (v.hide) s.spheresHidden.push(id);
      });
      close();
      if (!key) location.hash = '#/spheres/' + id;
      toast(key ? 'Сохранено' : `Сфера «${name}» создана`);
    },
    danger: own ? 'Убрать сферу' : null,
    onDanger: (_v, close) => {
      close();
      confirmSheet(`Убрать «${own.name}»?`, 'Сфера уйдёт из списка, но её этапы, журнал и связанные цели останутся в данных.', 'Убрать',
        () => {
          update(s => { const x = s.customSpheres.find(y => y.key === key); if (x) x.archived = true; });
          location.hash = '#/spheres';
        });
    },
  });
}

function itemRow(key, i) {
  return h`
    <div class="chk-row ${i.done ? 'done' : ''}">
      <button class="check ${i.done ? 'on' : ''}" data-act="item" data-id="${i.id}">✓</button>
      <span class="grow">${i.title}</span>
      <button class="q-edit" data-act="itemdel" data-id="${i.id}">×</button>
    </div>`;
}

/**
 * Блог. Ритм и отклик разведены: ритм приложение считает само из вышедших
 * постов, отклик человек вписывает руками и только если хочет. Серий и
 * «ты пропустила неделю» здесь нет и не будет — это ровно тот механизм
 * вины, ради отсутствия которого всё и затевалось.
 */
function blogBody() {
  const t = todayISO();
  const ym = monthKey(t);
  const y = yearOf(t);
  const month = blogMonth(ym);
  const ahead = blogAhead();
  const subs = subsLast();
  const best = viewsMonth(ym);
  const rec2 = viewsRecord();

  return h`
    <div class="card">
      <div class="row between"><div class="caps">Ритм</div>
        <span class="lab">всего ${blogTotal()} ${plural(blogTotal(), 'пост', 'поста', 'постов')}</span></div>
      <div class="ink"><b>${month}</b> ${plural(month, 'пост', 'поста', 'постов')} в ${monthIn(ym)} · за год ${blogYear(y)}</div>
      <div class="lab">${BLOG_FEEDS.map(f => `${f.name} ${blogMonth(ym, f.key)}`).join(' · ')} за месяц</div>
      ${month ? '' : raw('<div class="lab">В этом месяце пока ничего не выходило. Это не упрёк — просто число.</div>')}
    </div>

    ${ahead.length ? raw(h`<div class="card mute">
      <div class="caps">Скоро выходит</div>
      ${ahead.map(p => raw(h`<button class="link-row" data-act="postedit" data-id="${p.id}">
        <span class="ink grow ellip">${p.title}</span>
        <span class="lab">${dayShort(p.day)} · ${placeShort(p.place)} ›</span></button>`))}
      <div class="lab">Лежит здесь, а не в «Дне»: незачем маячить перед глазами раньше времени.</div>
    </div>`) : ''}

    <div class="card">
      <div class="row between"><div class="caps">Подписчики</div>
        <button class="q-edit" data-act="subsmark">отметить ›</button></div>
      ${subs ? raw(h`
        <div class="ink"><b>${subsTotal() ?? '—'}</b> всего · на ${dayShort(subs.date)}</div>
        <div class="lab">${BLOG_FEEDS.map(f => {
          const d = subsDelta(f.key);
          const dd = d == null ? '' : d > 0 ? ` (+${d})` : d < 0 ? ` (${d})` : ' (без изменений)';
          return `${f.name} ${subs[f.key] ?? '—'}${dd}`;
        }).join(' · ')}</div>`)
        : raw('<div class="lab">Ещё не отмечено. Отмечать можно когда угодно — хоть раз в месяц, хоть раз в полгода.</div>')}
    </div>

    ${best || rec2 ? raw(h`<div class="card">
      <div class="caps">Просмотры</div>
      ${best ? raw(h`<div class="link-row"><span class="ink grow ellip">${best.title}</span>
        <span class="lab">${best.views} · лучший за месяц</span></div>`) : ''}
      ${rec2 ? raw(h`<div class="link-row"><span class="ink grow ellip">${rec2.title}</span>
        <span class="lab">${rec2.views} · рекорд</span></div>`) : ''}
    </div>`) : ''}

    ${BLOG_STAGES.map(st => {
      const all = blogBy(st.key);
      const list = st.key === 'out' ? all.slice().sort((a, b) => ((a.day || '') < (b.day || '') ? 1 : -1)).slice(0, 8) : all;
      return raw(h`
        <div class="card">
          <div class="row between"><div class="caps">${st.name}</div>
            <span class="lab">${all.length || ''}</span></div>
          ${list.length ? raw(h`<div class="list">${list.map(p => raw(postRow(p, st.key)))}</div>`)
            : raw(h`<div class="lab">${st.key === 'idea' ? 'Пусто. Идея может прийти из инбокса или прямо отсюда.' : 'Пусто.'}</div>`)}
          ${all.length > list.length ? raw(h`<div class="lab">и ещё ${all.length - list.length}</div>`) : ''}
        </div>`);
    })}
    <button class="add" data-act="postadd">+ Пост</button>

    ${raw(unpackCard())}
    ${raw(rubricCard(ym))}`;
}

/**
 * Распаковка: вопрос, из которого может вырасти пост. Приложение спрашивает,
 * человек отвечает — и только если он сам нажмёт «взять», в банке появляется
 * идея. Вопрос запоминается вместе с ней, чтобы через месяц было понятно,
 * откуда она взялась.
 */
function unpackCard() {
  const q = UNPACK_ALL[S.ui.unpack ?? 0] || UNPACK_ALL[0];
  return h`
    <div class="card">
      <div class="row between"><div class="caps">Распаковка</div>
        <span class="lab">${q.group}</span></div>
      <div class="ink">${gt(q.q)}</div>
      <div class="pills">
        <button class="pill" data-act="unpacknext">другой вопрос</button>
        <button class="pill on" data-act="unpacktake">взять в идеи</button>
        <button class="pill" data-act="unpackall">все ${UNPACK_ALL.length}</button>
      </div>
      <div class="lab">Вопрос сам ничего не создаёт. Идея появится, только если ты её возьмёшь.</div>
    </div>`;
}

/** Рубрикатор и форматы: что есть на самом деле, без долей-обязательств. */
function rubricCard(ym) {
  const mix = rubricMix();
  const none = rubricUnsorted();
  const fmt = formatMix(ym);
  return h`
    <div class="card mute">
      <div class="row between"><div class="caps">Рубрикатор</div>
        <button class="q-edit" data-act="rubrics">править ›</button></div>
      ${mix.length ? raw(h`<div class="list">${mix.map(r => raw(h`
        <div class="link-row">
          <span class="ink grow ellip">${r.name}</span>
          <span class="lab">${r.n ? `${r.n} · ${r.share}%` : 'ещё не выходило'}${r.last ? ` · ${dayShort(r.last)}` : ''}</span>
        </div>`))}</div>`)
        : raw('<div class="lab">Рубрик пока нет. Их можно завести и вешать на посты.</div>')}
      ${none ? raw(h`<div class="lab">Без рубрики: ${none}.</div>`) : ''}
      <div class="lab">Доли за год — это про то, о чём ты пишешь на самом деле, а не норма.</div>
    </div>

    <div class="card mute">
      <div class="row between"><div class="caps">Форматы</div>
        <button class="q-edit" data-act="formats">править ›</button></div>
      ${fmt.length ? raw(h`<div class="pills">${fmt.map(f => raw(h`<span class="pill">${f.name} · ${f.n}</span>`))}</div>`)
        : raw('<div class="lab">За этот месяц форматы не отмечены.</div>')}
    </div>`;
}

/**
 * Пост целиком. Формат и рубрики — метки, структура — скелет черновика.
 * Черновик живёт вне формы (как на доске работы): пункты можно двигать,
 * не потеряв то, что уже вписано в поля.
 */
let draft = { blocks: [], rubrics: [] };

function postSheet(id, seed = '') {
  const p = id ? blogPosts().find(x => x.id === id) : null;
  const base = p || { title: seed, place: 'both', stage: 'idea', day: '', format: '', link: '',
    views: null, rubrics: [], blocks: [], seed, note: '' };
  draft = { blocks: (base.blocks || []).map(x => ({ ...x })), rubrics: [...(base.rubrics || [])] };
  openSheet({
    title: p ? 'Пост' : 'Новый пост',
    sub: p ? placeName(p.place) : 'идея, черновик или уже готовое',
    body: [
      field.text('title', 'О чём', base.title, 'коротко'),
      base.seed ? field.note(`Из распаковки: ${base.seed}`) : '',
      field.opts('place', 'Куда', BLOG_PLACES.map(x => ({ value: x.key, label: x.name })), base.place),
      field.opts('stage', 'Стадия', BLOG_STAGES.map(x => ({ value: x.key, label: x.name })), base.stage),
      field.opts('format', 'Формат', [{ value: '', label: 'не выбран' },
        ...blogFormats().map(f => ({ value: f.id, label: f.name }))], base.format),
      rubricBlock(),
      field.date('day', 'День выхода', base.day),
      field.note('День выхода — это когда пост выходит, а не дедлайн. В «Дне» он не появится: незачем маячить перед глазами раньше времени.'),
      packBlock(),
      field.number('views', 'Просмотры', base.views ?? '', { min: 0, step: 1 }),
      field.text('link', 'Ссылка', base.link, 'после публикации'),
      field.area('note', 'Заметка', base.note, 'мысли, план, что зашло'),
    ].join(''),
    primary: p ? 'Сохранить' : 'Добавить',
    onAct: (name, data) => {
      if (name === 'rub') {
        draft.rubrics = draft.rubrics.includes(data.v)
          ? draft.rubrics.filter(x => x !== data.v) : [...draft.rubrics, data.v];
        return redrawPost();
      }
      if (name === 'pktoggle') {
        const x = draft.blocks.find(bk => bk.id === data.v);
        if (x) x.done = !x.done;
        return redrawPost();
      }
      if (name === 'pkdel') { draft.blocks = draft.blocks.filter(bk => bk.id !== data.v); return redrawPost(); }
      if (name === 'pkadd') {
        const box = document.querySelector('.sheet [data-field="pknew"]');
        const text = (box?.value || '').trim();
        if (!text) return;
        draft.blocks.push({ id: uid(), text, done: false });
        box.value = '';
        return redrawPost();
      }
      if (name === 'pktpl') return addPack(data.v);
      return undefined;
    },
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Нужно название');
      const twin = nameTaken(blogPosts(), title, id, 'title');
      if (twin) return toast(`«${twin.title}» уже есть`);
      const next = {
        title,
        place: BLOG_PLACES.some(x => x.key === v.place) ? v.place : 'both',
        stage: BLOG_STAGES.some(x => x.key === v.stage) ? v.stage : 'idea',
        format: blogFormats().some(f => f.id === v.format) ? v.format : '',
        rubrics: [...draft.rubrics],
        blocks: draft.blocks.map(bk => ({ ...bk })),
        seed: base.seed || '',
        day: (v.day || '').trim().slice(0, 10),
        link: (v.link || '').trim(),
        views: String(v.views ?? '').trim() === '' ? null : Math.max(0, Math.round(Number(v.views) || 0)),
        note: (v.note || '').trim(),
      };
      // Дата выхода нужна, чтобы пост попал в ритм. Ставим сегодняшнюю только
      // тогда, когда человек сам двинул пост в «опубликовано» и дня не назвал.
      if (next.stage === 'out' && !next.day) next.day = todayISO();
      update(s2 => {
        const was = s2.blog.posts.find(x => x.id === id);
        if (was) Object.assign(was, next, { movedAt: was.stage !== next.stage ? todayISO() : was.movedAt });
        else s2.blog.posts.push({ id: uid(), ...next, movedAt: todayISO() });
      });
      close();
      toast(p ? 'Сохранено' : 'Добавлено');
    },
    danger: p ? 'Удалить' : null,
    onDanger: (_v, close) => {
      close();
      confirmSheet(`Удалить «${p.title}»?`, 'Пост исчезнет вместе со структурой, просмотрами и заметкой.', 'Удалить',
        () => update(s2 => { s2.blog.posts = s2.blog.posts.filter(x => x.id !== id); }));
    },
  });
}

const rubricBlock = () => h`
  <div class="fld" id="rub_block"><span>Рубрики</span>
    <div class="pills" id="rub_pick">${raw(rubricPicker())}</div>
    ${blogRubrics().length ? '' : raw('<div class="lab">Рубрик пока нет — их заводят на экране сферы.</div>')}
  </div>`;

const rubricPicker = () => blogRubrics()
  .map(r => `<button type="button" class="pill ${draft.rubrics.includes(r.id) ? 'on' : ''}" data-act="rub" data-v="${r.id}">${r.name}</button>`)
  .join('');

const packBlock = () => {
  const done = draft.blocks.filter(x => x.done).length;
  return h`
    <div class="fld" id="pk_block">
      <span>Упаковка${draft.blocks.length ? ` · ${done} из ${draft.blocks.length}` : ''}</span>
      <div class="pills">${PACK.map(t => raw(h`<button type="button" class="pill" data-act="pktpl" data-v="${t.id}">${t.name}</button>`))}</div>
      <div class="lab">Скелет только подставит пункты: лишние можно стереть, свои — дописать.</div>
      <div class="cl-list">
        ${draft.blocks.map(x => raw(h`
          <div class="cl-item ${x.done ? 'done' : ''}">
            <button type="button" class="check sm ${x.done ? 'on' : ''}" data-act="pktoggle" data-v="${x.id}">✓</button>
            <span class="grow">${x.text}</span>
            <button type="button" class="q-edit" data-act="pkdel" data-v="${x.id}">×</button>
          </div>`))}
      </div>
      <div class="row">
        <input type="text" class="grow" data-field="pknew" data-act-enter="pkadd" placeholder="Свой пункт и Enter">
        <button type="button" class="pill" data-act="pkadd">+</button>
      </div>
    </div>`;
};

/** Перерисовываем только то, что живёт вне формы: введённое не теряется. */
function redrawPost() {
  const rp = document.getElementById('rub_pick');
  if (rp) rp.innerHTML = rubricPicker();
  const pk = document.getElementById('pk_block');
  if (pk) pk.outerHTML = packBlock();
}

/**
 * Скелет поста добавляется пилюлей прямо в форме: отдельная шторка закрыла бы
 * эту и стёрла всё, что уже вписано. Дубли по тексту не добавляются.
 */
function addPack(id) {
  const tpl = packById(id);
  if (!tpl) return;
  const have = new Set(draft.blocks.map(x => x.text));
  const fresh = tpl.blocks.filter(x => !have.has(x));
  if (!fresh.length) return toast(`«${tpl.name}» уже добавлен`);
  fresh.forEach(text => draft.blocks.push({ id: uid(), text, done: false }));
  redrawPost();
  toast(`${tpl.name}: +${fresh.length}`);
}

/**
 * Список именованных записей: добавить, переименовать, убрать. Один код на
 * рубрикатор и форматы — они устроены одинаково, и расходиться им незачем.
 */
function listSheet({ title, sub, get, add, ren, del, note }) {
  const draw = () => openSheet({
    title, sub,
    body: [
      get().length ? get().map(x => h`
        <div class="link-row">
          <span class="ink grow ellip" data-act="ls-ren" data-v="${x.id}" style="cursor:pointer">${x.name}</span>
          <button class="q-edit" data-act="ls-del" data-v="${x.id}">×</button>
        </div>`).join('')
        : field.note('Пока пусто.'),
      `<div class="row"><input type="text" class="grow" data-field="lsnew" data-act-enter="ls-add" placeholder="Добавить и Enter">
        <button type="button" class="pill" data-act="ls-add">+</button></div>`,
      field.note(note),
    ].join(''),
    onAct: (name, data, close) => {
      if (name === 'ls-add') {
        const box = document.querySelector('.sheet [data-field="lsnew"]');
        const val = (box?.value || '').trim();
        if (!val) return;
        if (nameTaken(get(), val)) return toast(`«${val}» уже есть`);
        update(s2 => add(s2, val));
        close(); draw();
        return;
      }
      if (name === 'ls-ren') {
        const cur = get().find(x => x.id === data.v);
        if (!cur) return;
        close();
        openSheet({
          title: 'Переименовать',
          body: field.text('name', 'Название', cur.name),
          onSave: (v, cl) => {
            const val = (v.name || '').trim();
            if (!val) return toast('Нужно название');
            if (nameTaken(get(), val, cur.id)) return toast(`«${val}» уже есть`);
            update(s2 => ren(s2, cur.id, val));
            cl(); draw();
          },
        });
        return;
      }
      if (name === 'ls-del') {
        const cur = get().find(x => x.id === data.v);
        if (!cur) return;
        close();
        confirmSheet(`Убрать «${cur.name}»?`, note, 'Убрать', () => { update(s2 => del(s2, cur.id)); draw(); });
      }
    },
  });
  draw();
}

/** Строка поста: стадия двигается тапом по пилюле, остальное — в шторке. */
function postRow(p, stage) {
  const next = BLOG_STAGES[(BLOG_STAGES.findIndex(s2 => s2.key === stage) + 1) % BLOG_STAGES.length];
  return h`
    <div class="chk-row">
      <button class="pill" data-act="postmove" data-id="${p.id}" title="дальше: ${next.name}">${placeShort(p.place)}</button>
      <span class="grow ellip" data-act="postedit" data-id="${p.id}" style="cursor:pointer">${p.title}</span>
      <span class="lab">${p.stage === 'out' && p.views != null ? `${p.views} просм.`
        : p.stage === 'draft' && blockProgress(p) != null ? `${blockProgress(p)}%`
        : p.day ? dayShort(p.day) : formatName(p.format)}</span>
      <button class="q-edit" data-act="postedit" data-id="${p.id}">›</button>
    </div>`;
}

function vaultBody(r) {
  const v = r.vault;
  if (!v) return h`<div class="card"><div class="ink"><b>Казна пуста</b></div>
    <div class="lab">Заведи цель накопления — и складывай в неё сколько получается.</div>
    <button class="add" data-act="vaultnew">+ Копилка</button></div>`;
  const pct = v.target ? Math.min(100, Math.round((v.saved / v.target) * 100)) : 0;
  return h`<div class="card">
    <div class="row between"><div class="ink"><b>${v.title}</b></div><button class="q-edit" data-act="vaultnew">изменить ›</button></div>
    <div class="row">${raw(bar(pct, pct >= 100))}<span class="lab">${pct}%</span></div>
    <div class="lab">${Math.round(v.saved).toLocaleString('ru-RU')} из ${Math.round(v.target).toLocaleString('ru-RU')}</div>
    <button class="add" data-act="vaultadd">+ Пополнить</button>
  </div>`;
}

function sportBody() {
  const days = Array.from({ length: 30 }, (_, i) => addDays(todayISO(), -i));
  const fromLessons = sportLessonSessions(days);
  const fromWorkouts = workoutsIn(days).filter(w => !w.lessonId).length;
  const done = days.reduce((a, d) => a + questsOn(d).filter(q => q.done && q.sphere === 'sport').length, 0) + fromLessons + fromWorkouts;
  const minutes = days.reduce((a, d) => a + questsOn(d).filter(q => q.done && q.sphere === 'sport').reduce((x, q) => x + (q.minutes || 0), 0), 0);
  return h`<div class="card">
    <div class="ink"><b>Статы за 30 дней</b></div>
    <div class="row"><span class="lab" style="width:78px">Тренировки</span>${raw(bar(Math.min(100, done * 8)))}<span class="lab">${done}</span></div>
    <div class="row"><span class="lab" style="width:78px">Минуты</span>${raw(bar(Math.min(100, minutes / 12)))}<span class="lab">${minutes}</span></div>
    <div class="lab">Считается из квестов сферы «Спорт»${fromWorkouts ? `, тренировок — их ${fromWorkouts}` : ''}${fromLessons ? ` и занятий с полки — их ${fromLessons}` : ''}.</div>
  </div>`;
}

const curKey = () => location.hash.replace(/^#\/?/, '').split('/')[1];

export const actions = {
  // У питания свой экран: календарь КБЖУ не влезает в общую механику этапов.
  // Куда ведёт плитка, знает сама сфера: список экранов один на приложение,
  // иначе новая сфера открывается, но нигде не подсвечивается.
  open: v => {
    const own = SPHERES.find(x => x.key === v.v);
    location.hash = own?.screen ? '#/' + own.screen : '#/spheres/' + v.v;
  },
  back: () => goBack('spheres'),
  tolist: () => { location.hash = '#/spheres'; },

  // Сфера тут не одна на экран, поэтому берём ту, что открыта, а не зашитую.
  spheregoal: () => sphereGoalSheet(curKey()),
  togoal: () => { location.hash = '#/plans'; },
  newsphere: () => newSphereSheet(),
  sphereedit: v => sphereSheet(v.v),
  unhide: v => update(s => { s.spheresHidden = s.spheresHidden.filter(x => x !== v.v); }),

  /** Тап по дню журнала: первый раз ставит единицу, повторный снимает. */
  logtick: v => update(s => {
    const log = rec(s, curKey()).log;
    if (log[v.d]) delete log[v.d];
    else { log[v.d] = 1; addXp(XP.habit); }
  }),

  shelfadd: () => shelfSheet(null),
  shelfedit: v => shelfSheet(v.id),
  colladd: () => collSheet(null),
  colledit: v => collSheet(v.id),
  boardadd: () => boardSheet(null),
  boardedit: v => boardSheet(v.id),
  measadd: () => measSheet(null),
  measedit: v => measSheet(v.id),

  /** Тап по стадии двигает дальше, с последней возвращает в начало. */
  boardmove: v => update(s => {
    const x = rec(s, curKey()).board.find(y => y.id === v.id);
    if (!x) return;
    const order = ['todo', 'doing', 'done'];
    const next = order[(order.indexOf(x.stage || 'todo') + 1) % order.length];
    if (next === 'done' && x.stage !== 'done') addXp(XP.step);
    x.stage = next;
    x.stageAt = todayISO();
  }),

  logset: () => {
    const key = curKey();
    openSheet({
      title: 'Отметка в журнале',
      body: [
        field.date('date', 'Когда', todayISO()),
        field.number('n', 'Сколько', sphereLogOn(key, todayISO()) || 1, { min: 0 }),
        field.note('Ноль убирает отметку за этот день.'),
      ].join(''),
      primary: 'Записать',
      onSave: (v, close) => {
        const d = v.date || todayISO();
        const n = Math.max(0, Number(v.n) || 0);
        update(s => { const log = rec(s, key).log; if (n) log[d] = n; else delete log[d]; });
        close();
      },
    });
  },

  itemadd: () => {
    const key = curKey();
    openSheet({
      title: key === 'blog' ? 'Новая идея' : 'Новый этап',
      body: field.text('title', 'Что именно', '', 'коротко'),
      primary: 'Добавить',
      onSave: (v, close) => {
        const t = (v.title || '').trim();
        if (!t) return toast('Нужно название');
        const twin = nameTaken(sphereItems(key), t, null, 'title');
        if (twin) return toast(`«${twin.title}» уже есть`);
        update(s => rec(s, key).items.push({ id: uid(), title: t, done: false, stage: 0 }));
        close();
      },
    });
  },

  item: v => {
    const key = curKey();
    let all = false, name = '';
    update(s => {
      const it = rec(s, key).items.find(x => x.id === v.id);
      if (!it) return;
      it.done = !it.done;
      // Дата закрытия: по ней круг ролей понимает, было это на неделе или год назад.
      it.doneAt = it.done ? todayISO() : '';
      addXp(it.done ? XP.step : -XP.step);
      all = rec(s, key).items.every(x => x.done);
      name = it.title;
      if (it.done) addDiary(s, `закрыт этап: ${name}`, sphereOf(key).name, 'sphere');
    });
    if (all) toast('Всё закрыто ✦');
  },

  itemdel: v => update(s => { rec(s, curKey()).items = rec(s, curKey()).items.filter(x => x.id !== v.id); }),

  // ── блог
  postadd: () => postSheet(null),
  postedit: v => postSheet(v.id),

  /** Распаковка: вопрос меняется по кругу и живёт в настройках вида, а не
   *  в данных — это не запись человека, а то, где он остановился. */
  unpacknext: () => update(s2 => { s2.ui.unpack = ((s2.ui.unpack ?? 0) + 1) % UNPACK_ALL.length; }),
  unpacktake: () => {
    const q = UNPACK_ALL[S.ui.unpack ?? 0] || UNPACK_ALL[0];
    // В идею уходит уже склонённый вопрос: там он станет заголовком поста.
    postSheet(null, gt(q.q));
  },
  unpackall: () => openSheet({
    title: 'Распаковка',
    sub: `${UNPACK_ALL.length} вопросов · тапни, чтобы взять`,
    body: UNPACK.map(g => h`
      <div class="fld"><span>${g.name}</span>
        ${g.questions.map(q => raw(h`<button class="link-row" data-act="uq" data-v="${q}">
          <span class="ink grow">${q}</span><span class="lab">взять ›</span></button>`))}
      </div>`).join(''),
    onAct: (name, data, close) => { if (name === 'uq') { close(); postSheet(null, data.v); } },
  }),

  rubrics: () => listSheet({
    title: 'Рубрикатор',
    sub: 'о чём ты пишешь — списком',
    get: () => blogRubrics(),
    add: (s2, name) => s2.blog.rubrics.push({ id: uid(), name, note: '' }),
    ren: (s2, id, name) => { const x = s2.blog.rubrics.find(r => r.id === id); if (x) x.name = name; },
    del: (s2, id) => {
      s2.blog.rubrics = s2.blog.rubrics.filter(r => r.id !== id);
      // Рубрику убрали — снимаем её и с постов, иначе они ссылались бы в пустоту.
      s2.blog.posts.forEach(pst => { pst.rubrics = (pst.rubrics || []).filter(r => r !== id); });
    },
    note: 'Удалённая рубрика снимается с постов, сами посты остаются.',
  }),

  formats: () => listSheet({
    title: 'Форматы',
    sub: 'чем именно выходит пост',
    get: () => blogFormats(),
    add: (s2, name) => s2.blog.formats.push({ id: uid(), name }),
    ren: (s2, id, name) => { const x = s2.blog.formats.find(f => f.id === id); if (x) x.name = name; },
    del: (s2, id) => {
      s2.blog.formats = s2.blog.formats.filter(f => f.id !== id);
      s2.blog.posts.forEach(pst => { if (pst.format === id) pst.format = ''; });
    },
    note: 'Удалённый формат снимается с постов, сами посты остаются.',
  }),

  /** Тап по пилюле двигает пост на следующую стадию. Вышедшему ставим день
   *  выхода — но только если он не задан: свою дату не перетираем. */
  postmove: v => {
    let msg = '';
    update(s => {
      const p = s.blog.posts.find(x => x.id === v.id);
      if (!p) return;
      const i = BLOG_STAGES.findIndex(x => x.key === p.stage);
      const next = BLOG_STAGES[(i + 1) % BLOG_STAGES.length];
      p.stage = next.key;
      p.movedAt = todayISO();
      if (next.key === 'out') {
        p.day ||= todayISO();
        addXp(XP.step);
        addDiary(s, `опубликовано: ${p.title}`, 'Блог', 'sphere');
        msg = `«${p.title}» опубликовано ✦`;
      } else msg = `${p.title} → ${next.name.toLowerCase()}`;
    });
    toast(msg);
  },

  subsmark: () => {
    const last = subsLast();
    openSheet({
      title: 'Подписчики',
      sub: 'сколько сейчас — отмечать можно когда угодно',
      body: [
        field.date('date', 'Дата', todayISO()),
        ...BLOG_FEEDS.map(f => field.number(f.key, f.name, last?.[f.key] ?? '', { min: 0, step: 1 })),
        field.note('Пустое поле — просто не отмечено. Число не придумывается и разницу не портит.'),
      ].join(''),
      primary: 'Записать',
      onSave: (v, close) => {
        const date = (v.date || todayISO()).trim().slice(0, 10);
        const num = x => (String(x ?? '').trim() === '' ? null : Math.max(0, Math.round(Number(x) || 0)));
        const ig = num(v.ig), tg = num(v.tg);
        if (ig == null && tg == null) return toast('Впиши хотя бы одно число');
        update(s => {
          const was = s.blog.subs.find(x => x.date === date);
          if (was) { was.ig = ig; was.tg = tg; }
          else s.blog.subs.push({ id: uid(), date, ig, tg });
          s.blog.subs.sort((a, b) => (a.date < b.date ? -1 : 1));
        });
        close();
        toast('Отмечено');
      },
    });
  },

  note: () => {
    const key = curKey();
    openSheet({
      title: 'Заметка по сфере',
      body: field.area('note', 'Что важно помнить', S.spheres[key]?.note || ''),
      onSave: (v, close) => { update(s => { rec(s, key).note = (v.note || '').trim(); }); close(); toast('Сохранено'); },
    });
  },

  vaultnew: () => {
    const v0 = S.spheres.money?.vault;
    openSheet({
      title: 'Копилка',
      body: [
        field.text('title', 'На что копим', v0?.title || '', 'например, «Милан»'),
        field.number('target', 'Сколько нужно', v0?.target ?? '', { min: 0 }),
        field.number('saved', 'Уже отложено', v0?.saved ?? 0, { min: 0 }),
      ].join(''),
      onSave: (v, close) => {
        const title = (v.title || '').trim();
        if (!title) return toast('Нужно название');
        update(s => { rec(s, 'money').vault = { title, target: Number(v.target) || 0, saved: Number(v.saved) || 0 }; });
        close();
        toast('Копилка обновлена');
      },
      danger: v0 ? 'Убрать копилку' : null,
      onDanger: (_v, close) => { update(s => { rec(s, 'money').vault = null; }); close(); },
    });
  },

  vaultadd: () => openSheet({
    title: 'Пополнить',
    body: field.number('sum', 'Сколько', '', { min: 0 }),
    primary: 'Добавить',
    onSave: (v, close) => {
      const n = Number(v.sum);
      if (!n) return toast('Введи сумму');
      update(s => { const vault = rec(s, 'money').vault; if (vault) vault.saved += n; });
      close();
      toast(`+${n.toLocaleString('ru-RU')} в казну`);
    },
  }),
};
