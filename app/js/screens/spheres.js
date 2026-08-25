// «Сферы»: плитки и разбор одной сферы. У каждой — этапы с прогрессом,
// у блога стадии идей, у бюджета копилка, у спорта — статистика из квестов.

import { S, update, uid, XP, addXp, SPHERES, addDiary } from '../store.js';
import { todayISO, addDays } from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import { sphereProgress, sphereStatus, questsOn, sphereOf, liveLessons, lessonMonth, sportLessonSessions } from '../selectors.js';
import { sums } from './food.js';
import { balanceAt, money } from './budget.js';
import { studyNow, workoutsIn } from '../selectors.js';

const STAGES = ['росток', 'бутон', 'готов ✦'];
const rec = (s, key) => (s.spheres[key] ||= { items: [], note: '', vault: null });

export function render(params) {
  return params[0] ? detail(params[0]) : grid();
}

function grid() {
  return h`
    <div class="title">Сферы</div>
    <div class="sub">У каждой своя механика. Тапни, чтобы открыть.</div>
    <div class="grid2">
      ${SPHERES.map(sp => {
        const pct = sphereProgress(sp.key);
        const food = sp.key === 'food' ? sums(todayISO()) : null;
        const bal = sp.key === 'money' ? balanceAt(todayISO().slice(0, 7)) : null;
        const stu = sp.key === 'study' ? studyNow() : null;
        const edu = sp.key === 'edu'
          ? liveLessons().filter(l => !l.paused).reduce((a, l) => a + lessonMonth(l, todayISO().slice(0, 7)), 0)
          : null;
        return raw(h`
          <button class="tile" data-act="open" data-v="${sp.key}">
            <img src="${sp.img}" alt="">
            <span class="tile-badge">${sp.mech}</span>
            <b>${sp.name}</b>
            <span>${food ? `сегодня ${food.kcal} ккал`
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
    <div class="card dash">
      <div class="lab">Сферы — это не отчёт. Пустая сфера не отнимает ничего.</div>
    </div>`;
}

function detail(key) {
  const sp = sphereOf(key);
  if (!sp) return h`<div class="empty">Такой сферы нет. <button class="q-edit" data-act="back">← к сферам</button></div>`;
  const r = S.spheres[key] || { items: [], note: '' };
  const items = r.items || [];
  const pct = sphereProgress(key);

  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ сферы</button>
      <span class="tag">${sp.mech}</span>
    </div>
    <div class="title">${sp.name}</div>
    <img class="hero-img" src="${sp.img}" alt="">
    ${pct != null ? raw(h`<div class="card"><div class="row">${raw(bar(pct, pct >= 100))}<span class="lab">${pct}%</span></div>
      <div class="lab">${items.filter(i => i.done).length} из ${items.length} закрыто</div></div>`) : ''}

    ${raw(key === 'blog' ? blogBody(items) : key === 'money' ? vaultBody(r) : key === 'sport' ? sportBody() : '')}

    <div class="card">
      <div class="caps">${key === 'blog' ? 'Идеи' : 'Этапы'}</div>
      ${items.length ? raw(h`<div class="list">${items.map(i => raw(itemRow(key, i)))}</div>`)
        : raw('<div class="empty">Пока пусто. Добавь первый шаг — он и будет прогрессом.</div>')}
      <button class="add" data-act="itemadd">+ ${key === 'blog' ? 'Идея' : 'Этап'}</button>
    </div>

    <div class="card">
      <div class="row between"><div class="caps">Заметка</div><button class="q-edit" data-act="note">изменить ›</button></div>
      <div class="ink">${r.note || '—'}</div>
    </div>`;
}

function itemRow(key, i) {
  if (key === 'blog' && !i.done) {
    const st = i.stage || 0;
    return h`
      <div class="chk-row">
        <button class="pill" data-act="stage" data-id="${i.id}">${STAGES[st]}</button>
        <span class="grow">${i.title}</span>
        ${st >= 2 ? raw(h`<button class="q-edit" data-act="publish" data-id="${i.id}">опубликовать ›</button>`)
                  : raw(h`<button class="q-edit" data-act="itemdel" data-id="${i.id}">×</button>`)}
      </div>`;
  }
  return h`
    <div class="chk-row ${i.done ? 'done' : ''}">
      <button class="check ${i.done ? 'on' : ''}" data-act="item" data-id="${i.id}">✓</button>
      <span class="grow">${i.title}</span>
      <button class="q-edit" data-act="itemdel" data-id="${i.id}">×</button>
    </div>`;
}

function blogBody(items) {
  const ready = items.filter(i => !i.done && (i.stage || 0) >= 2).length;
  const published = items.filter(i => i.done).length;
  return h`<div class="card">
    <div class="ink"><b>Ферма идей</b></div>
    <div class="lab">Идея растёт: росток → бутон → готов. Созревших сейчас: ${ready}. Опубликовано: ${published}.</div>
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
  open: v => { location.hash = { food: '#/food', money: '#/budget', edu: '#/edu', study: '#/study', sport: '#/sport' }[v.v] || '#/spheres/' + v.v; },
  back: () => { location.hash = '#/spheres'; },

  itemadd: () => {
    const key = curKey();
    openSheet({
      title: key === 'blog' ? 'Новая идея' : 'Новый этап',
      body: field.text('title', 'Что именно', '', 'коротко'),
      primary: 'Добавить',
      onSave: (v, close) => {
        const t = (v.title || '').trim();
        if (!t) return toast('Нужно название');
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
      addXp(it.done ? XP.step : -XP.step);
      all = rec(s, key).items.every(x => x.done);
      name = it.title;
      if (it.done) addDiary(s, `закрыт этап: ${name}`, sphereOf(key).name, 'sphere');
    });
    if (all) toast('Всё закрыто ✦');
  },

  itemdel: v => update(s => { rec(s, curKey()).items = rec(s, curKey()).items.filter(x => x.id !== v.id); }),

  stage: v => update(s => {
    const it = rec(s, 'blog').items.find(x => x.id === v.id);
    if (it) it.stage = ((it.stage || 0) + 1) % 3;
  }),

  publish: v => {
    let title = '';
    update(s => {
      const it = rec(s, 'blog').items.find(x => x.id === v.id);
      if (!it) return;
      it.done = true;
      title = it.title;
      addXp(XP.step);
      addDiary(s, `опубликовано: ${title}`, 'Блог', 'sphere');
    });
    toast(`«${title}» опубликовано ✦`);
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
