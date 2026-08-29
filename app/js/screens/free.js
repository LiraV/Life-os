// «Фриланс»: заказы по стадиям, площадки, услуги и путь выхода.
//
// Деньги считаются только от оплаченных заказов и по дню оплаты: «сдан» —
// это ещё не деньги. Комиссия хранится у заказа, а не только у площадки:
// площадка может поменять условия, а прошлые заказы от этого не поедут.

import { S, update, uid, XP, addXp, addDiary, nameTaken } from '../store.js';
import { todayISO, monthKey, monthIn, yearOf, dayShort, diffDays } from '../dates.js';
import { h, raw, field, toast, openSheet, confirmSheet, plural } from '../ui.js';
import { FREE_STAGES, FREE_KINDS, FREE_PLACES, FREE_STEPS, stageName, netOf } from '../free.js';
import {
  freeOrders, freeBy, freeLive, freePlaces, freeServices, freeSteps, freeStepsDone,
  freePaidIn, freeGross, freeNet, freeAvg, freeDue, freePlaceStats, freeFunnel,
} from '../selectors.js';
import { sphereGoalButton, sphereGoalsCard, sphereGoalActions } from '../spheregoal.js';

const money = n => `${Number(n || 0).toLocaleString('ru-RU')} ₽`;

export function render() {
  const t = todayISO();
  const ym = monthKey(t);
  const y = String(yearOf(t));
  const [mf, mt] = [`${ym}-01`, `${ym}-31`];
  const [yf, yt] = [`${y}-01-01`, `${y}-12-31`];
  const nMonth = freePaidIn(mf, mt).length;
  const due = freeDue();
  const steps = freeSteps();

  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ сферы</button>
      <span class="tag">заказы</span>
    </div>
    <div class="title">Фриланс</div>

    <div class="card">
      <div class="row between"><div class="caps">Деньги</div>
        <span class="lab">за ${y} — ${money(freeGross(yf, yt))}</span></div>
      <div class="ink"><b>${money(freeGross(mf, mt))}</b> в ${monthIn(ym)} · чистыми ${money(freeNet(mf, mt))}</div>
      <div class="lab">${nMonth ? `${nMonth} ${plural(nMonth, 'заказ', 'заказа', 'заказов')} оплачено · средний чек ${money(freeAvg(mf, mt))}`
        : 'В этом месяце оплат не было. Это не упрёк — просто число.'}</div>
      <div class="lab">Считается по дню оплаты. «Сдан» — ещё не деньги.</div>
    </div>

    ${due.length ? raw(h`<div class="card mute">
      <div class="caps">Сроки</div>
      ${due.map(o => raw(h`<button class="link-row" data-act="edit" data-id="${o.id}">
        <span class="ink grow ellip">${o.title}</span>
        <span class="lab">${dueLabel(o.due)} ›</span></button>`))}
    </div>`) : ''}

    ${FREE_STAGES.map(st => {
      const list = freeBy(st.key);
      if (!list.length && (st.key === 'lost' || st.key === 'paid')) return '';
      const show = st.key === 'paid' ? list.slice(0, 6) : list;
      return raw(h`
        <div class="card">
          <div class="row between"><div class="caps">${st.name}</div>
            <span class="lab">${list.length ? `${list.length}${st.key === 'paid' ? ` · ${money(list.reduce((a, o) => a + o.price, 0))}` : ''}` : ''}</span></div>
          ${show.length ? raw(h`<div class="list">${show.map(o => raw(orderRow(o, st.key)))}</div>`)
            : raw(h`<div class="lab">${st.hint}</div>`)}
          ${list.length > show.length ? raw(h`<div class="lab">и ещё ${list.length - show.length}</div>`) : ''}
        </div>`);
    })}
    <button class="add" data-act="add">+ Заказ</button>

    ${raw(placesCard())}
    ${raw(servicesCard())}

    <div class="card ${steps.length ? '' : 'dash'}">
      <div class="row between"><div class="caps">Путь на фриланс</div>
        <span class="lab">${steps.length ? `${freeStepsDone()} из ${steps.length}` : ''}</span></div>
      ${steps.length ? raw(h`<div class="list">${steps.map(x => raw(h`
        <div class="chk-row ${x.done ? 'done' : ''}">
          <button class="check ${x.done ? 'on' : ''}" data-act="steptick" data-id="${x.id}">✓</button>
          <span class="grow">${x.text}</span>
          <button class="q-edit" data-act="stepdel" data-id="${x.id}">×</button>
        </div>`))}</div>`)
        : raw('<div class="lab">Пока пусто. Здесь может лежать то, что нужно сделать один раз, чтобы заказы вообще пошли.</div>')}
      <button class="add" data-act="steps">${steps.length ? 'Ещё шаги' : 'Взять шаги'}</button>
    </div>

    ${raw(funnelCard())}
    ${raw(sphereGoalsCard('free'))}
    ${raw(sphereGoalButton('free'))}
    <div style="height:4px"></div>`;
}

const dueLabel = d => {
  const n = diffDays(d, todayISO());
  return n < 0 ? `просрочен ${dayShort(d)}` : n === 0 ? 'сегодня' : `${dayShort(d)} · через ${n} ${plural(n, 'день', 'дня', 'дней')}`;
};

/** Строка заказа: тап по пилюле двигает стадию, остальное — в шторке. */
function orderRow(o, stage) {
  const i = FREE_STAGES.findIndex(s => s.key === stage);
  const next = FREE_STAGES[(i + 1) % FREE_STAGES.length];
  return h`
    <div class="chk-row">
      <button class="pill" data-act="move" data-id="${o.id}" title="дальше: ${next.name}">${o.kind || '—'}</button>
      <span class="grow ellip" data-act="edit" data-id="${o.id}" style="cursor:pointer">${o.title}</span>
      <span class="lab">${o.price ? money(o.price) : ''}${o.place ? ` · ${o.place}` : ''}</span>
      <button class="q-edit" data-act="edit" data-id="${o.id}">›</button>
    </div>`;
}

/** Площадки: что реально приносит заказы, а что только кажется. */
function placesCard() {
  const list = freePlaceStats();
  return h`
    <div class="card mute">
      <div class="row between"><div class="caps">Площадки</div>
        <button class="q-edit" data-act="places">править ›</button></div>
      ${list.length ? raw(h`<div class="list">${list.map(pl => raw(h`
        <div class="link-row">
          <span class="ink grow ellip">${pl.name}</span>
          <span class="lab">${pl.n ? `${pl.n} · ${money(pl.gross)} · чистыми ${money(pl.net)}` : `комиссия ${pl.fee}%`}</span>
        </div>`))}</div>`)
        : raw('<div class="lab">Площадок пока нет. Кворк, FL, Хабр, телеграм, сарафан — добавь те, где будешь искать.</div>')}
      ${list.length ? raw('<div class="lab">Видно, что правда приносит заказы, а что только кажется.</div>') : ''}
    </div>`;
}

/** Услуги: что продаю и почём — чтобы не считать цену заново каждый раз. */
function servicesCard() {
  const list = freeServices();
  return h`
    <div class="card mute">
      <div class="row between"><div class="caps">Что продаю</div>
        <button class="q-edit" data-act="services">править ›</button></div>
      ${list.length ? raw(h`<div class="pills">${list.map(x => raw(h`
        <button class="pill" data-act="fromservice" data-id="${x.id}">${x.name} · ${money(x.price)}</button>`))}</div>`)
        : raw('<div class="lab">Пусто. Лендинг, вёрстка макета, правки — с ценой, чтобы не считать её заново каждый раз.</div>')}
      ${list.length ? raw('<div class="lab">Тап по услуге заводит заказ с её названием и ценой.</div>') : ''}
    </div>`;
}

/** Воронка: сколько заказов на каждой стадии, вместе с сорвавшимися. */
function funnelCard() {
  const f = freeFunnel().filter(x => x.n);
  if (!f.length) return '';
  return h`
    <div class="card mute">
      <div class="caps">Воронка</div>
      <div class="pills">${f.map(x => raw(h`<span class="pill">${x.name} · ${x.n}</span>`))}</div>
      <div class="lab">Сорвавшиеся показаны наравне с остальными: без них воронка врёт.</div>
    </div>`;
}

/** Заказ целиком. Комиссию подставляем от площадки, но она остаётся своей. */
function orderSheet(id, preset) {
  const o = id ? freeOrders().find(x => x.id === id) : null;
  const base = o || { title: preset?.name || '', place: '', kind: '', price: preset?.price || '', fee: 0,
    stage: 'talk', due: '', paidAt: '', link: '', note: '' };
  const places = freePlaces();
  openSheet({
    title: o ? 'Заказ' : 'Новый заказ',
    sub: o ? stageName(o.stage) : 'от разговора до денег',
    body: [
      field.text('title', 'Что за заказ', base.title, 'лендинг для студии'),
      field.opts('kind', 'Что делаю', FREE_KINDS.map(k => ({ value: k, label: k })), base.kind || ''),
      places.length
        ? field.select('place', 'Откуда', [{ value: '', label: 'не указано' }, ...places.map(x => ({ value: x.name, label: x.name }))], base.place || '')
        : field.note('Площадок пока нет — заведи их в карточке «Площадки», и заказ можно будет к ним привязать.'),
      field.number('price', 'Цена', base.price === '' ? '' : base.price, { min: 0, suffix: '₽' }),
      field.number('fee', 'Комиссия площадки', base.fee, { min: 0, max: 100, suffix: '%' }),
      field.note('Комиссия подставляется от площадки, но живёт у заказа: если площадка поменяет условия, прошлые заказы не поедут.'),
      field.opts('stage', 'Стадия', FREE_STAGES.map(x => ({ value: x.key, label: x.name })), base.stage),
      field.date('due', 'Срок', base.due),
      field.date('paidAt', 'Когда оплачен', base.paidAt),
      field.note('Деньги считаются по дню оплаты. Пока его нет, заказ в доход не идёт, даже если сдан.'),
      field.text('link', 'Ссылка', base.link, 'на заказ или на работу'),
      field.area('note', 'Заметка', base.note, 'что входит, сколько правок, договорённости'),
    ].join(''),
    primary: o ? 'Сохранить' : 'Добавить',
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Нужно название');
      const next = {
        title,
        kind: FREE_KINDS.includes(v.kind) ? v.kind : '',
        place: (v.place || '').trim(),
        price: Math.max(0, Math.round(Number(v.price) || 0)),
        fee: Math.max(0, Math.min(100, Number(v.fee) || 0)),
        stage: FREE_STAGES.some(x => x.key === v.stage) ? v.stage : 'talk',
        due: (v.due || '').slice(0, 10),
        paidAt: (v.paidAt || '').slice(0, 10),
        link: (v.link || '').trim(),
        note: (v.note || '').trim(),
      };
      // Оплачен без дня — ставим сегодняшний: иначе деньги повисли бы вне месяца.
      if (next.stage === 'paid' && !next.paidAt) next.paidAt = todayISO();
      update(s => {
        const was = s.free.orders.find(x => x.id === id);
        if (was) Object.assign(was, next, { movedAt: was.stage !== next.stage ? todayISO() : was.movedAt });
        else s.free.orders.push({ id: uid(), ...next, movedAt: todayISO() });
      });
      close();
      toast(o ? 'Сохранено' : 'Заказ добавлен');
    },
    danger: o ? 'Удалить' : null,
    onDanger: (_v, close) => {
      close();
      confirmSheet(`Удалить «${o.title}»?`, 'Заказ исчезнет вместе с ценой и заметкой.', 'Удалить',
        () => update(s => { s.free.orders = s.free.orders.filter(x => x.id !== id); }));
    },
  });
}

/** Список именованных записей с числом: площадки и услуги устроены одинаково. */
function listSheet({ title, sub, get, add, del, unit, suggest, note }) {
  const draw = () => openSheet({
    title, sub,
    body: [
      get().length ? get().map(x => h`
        <div class="link-row">
          <span class="ink grow ellip">${x.name}</span>
          <span class="lab">${x.n ?? x.fee ?? x.price}${unit}</span>
          <button class="q-edit" data-act="ls-del" data-v="${x.id}">×</button>
        </div>`).join('')
        : field.note('Пока пусто.'),
      suggest?.length ? `<div class="pills">${suggest.filter(sg => !get().some(x => x.name === sg.name))
        .map(sg => `<button type="button" class="pill" data-act="ls-sg" data-n="${sg.name}" data-v="${sg.val}">+ ${sg.name}</button>`).join('')}</div>` : '',
      `<div class="row"><input type="text" class="grow" data-field="lsname" placeholder="Название">
        <input type="number" class="grow" data-field="lsval" placeholder="${unit.trim() || '0'}" style="max-width:96px">
        <button type="button" class="pill" data-act="ls-add">+</button></div>`,
      field.note(note),
    ].join(''),
    onAct: (name, data, close) => {
      const put = (nm, val) => {
        const n = (nm || '').trim();
        if (!n) return;
        if (nameTaken(get(), n)) return toast(`«${n}» уже есть`);
        update(s => add(s, n, Math.max(0, Number(val) || 0)));
        close(); draw();
      };
      if (name === 'ls-sg') return put(data.n, data.v);
      if (name === 'ls-add') return put(document.querySelector('.sheet [data-field="lsname"]')?.value,
        document.querySelector('.sheet [data-field="lsval"]')?.value);
      if (name === 'ls-del') { update(s => del(s, data.v)); close(); draw(); }
      return undefined;
    },
  });
  draw();
}

export const actions = {
  back: () => { location.hash = '#/spheres'; },
  add: () => orderSheet(null),
  edit: v => orderSheet(v.id),

  /** Тап по пилюле двигает заказ дальше. Дошёл до «оплачен» — ставим день. */
  move: v => {
    let msg = '';
    update(s => {
      const o = s.free.orders.find(x => x.id === v.id);
      if (!o) return;
      const i = FREE_STAGES.findIndex(x => x.key === o.stage);
      const next = FREE_STAGES[(i + 1) % FREE_STAGES.length];
      o.stage = next.key;
      o.movedAt = todayISO();
      if (next.key === 'paid') {
        o.paidAt ||= todayISO();
        addXp(XP.step);
        addDiary(s, `оплачен заказ: ${o.title}${o.price ? ` · ${o.price} ₽` : ''}`, 'Фриланс', 'sphere');
        msg = `«${o.title}» оплачен ✦`;
      } else msg = `${o.title} → ${next.name.toLowerCase()}`;
    });
    toast(msg);
  },

  fromservice: v => {
    const sv = freeServices().find(x => x.id === v.id);
    if (sv) orderSheet(null, sv);
  },

  places: () => listSheet({
    title: 'Площадки', sub: 'где ищу заказы и сколько там комиссия',
    get: () => freePlaces(), unit: ' %',
    suggest: FREE_PLACES.map(x => ({ name: x.name, val: x.fee })),
    add: (s, name, fee) => s.free.places.push({ id: uid(), name, fee: Math.min(100, fee) }),
    del: (s, id) => { s.free.places = s.free.places.filter(x => x.id !== id); },
    note: 'Комиссия подставится в новый заказ, но у заказа она своя: у прошлых ничего не поедет. Удалённая площадка остаётся в заказах, где уже указана.',
  }),

  services: () => listSheet({
    title: 'Что продаю', sub: 'название и цена — чтобы не считать заново',
    get: () => freeServices(), unit: ' ₽',
    suggest: [{ name: 'Лендинг', val: 25000 }, { name: 'Многостраничник', val: 60000 },
      { name: 'Вёрстка макета', val: 12000 }, { name: 'Правки по часу', val: 1500 },
      { name: 'Дизайн экрана', val: 4000 }],
    add: (s, name, price) => s.free.services.push({ id: uid(), name, price }),
    del: (s, id) => { s.free.services = s.free.services.filter(x => x.id !== id); },
    note: 'Цены в подсказках — просто числа для примера, а не рекомендация: свои ты знаешь лучше.',
  }),

  steps: () => {
    const draw = () => {
    const have = new Set(freeSteps().map(x => x.text));
    openSheet({
      title: 'Путь на фриланс',
      sub: 'то, что делается один раз, чтобы заказы пошли',
      body: [
        FREE_STEPS.filter(t => !have.has(t)).map(t => h`
          <button class="link-row" data-act="stepadd" data-v="${t}">
            <span class="ink grow">${t}</span><span class="lab">взять ›</span></button>`).join('')
          || field.note('Все подсказки уже взяты. Свой шаг можно вписать ниже.'),
        `<div class="row"><input type="text" class="grow" data-field="stnew" data-act-enter="stepown" placeholder="Свой шаг и Enter">
          <button type="button" class="pill" data-act="stepown">+</button></div>`,
        field.note('Ни один шаг не появится сам — только те, что ты возьмёшь.'),
      ].join(''),
      onAct: (name, data, close) => {
        const put = text => {
          const t = (text || '').trim();
          if (!t) return;
          if (freeSteps().some(x => x.text === t)) return toast('Такой шаг уже есть');
          update(s => s.free.steps.push({ id: uid(), text: t, done: false }));
          // Перерисовываем, а не закрываем: взятый шаг уходит из подсказок,
          // поле пустеет, и можно взять следующий, не открывая заново.
          close(); draw();
          return undefined;
        };
        if (name === 'stepadd') return put(data.v);
        if (name === 'stepown') return put(document.querySelector('.sheet [data-field="stnew"]')?.value);
        return undefined;
      },
    });
    };
    draw();
  },

  steptick: v => update(s => {
    const x = s.free.steps.find(y => y.id === v.id);
    if (!x) return;
    x.done = !x.done;
    if (x.done) addXp(XP.step);
  }),
  stepdel: v => update(s => { s.free.steps = s.free.steps.filter(x => x.id !== v.id); }),

  ...sphereGoalActions('free'),
};
