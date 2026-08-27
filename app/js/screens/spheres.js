// «Сферы»: плитки и разбор одной сферы. У каждой — этапы с прогрессом,
// у блога стадии идей, у бюджета копилка, у спорта — статистика из квестов.

import { S, update, uid, XP, addXp, SPHERES, addDiary, allSpheres, visibleSpheres, isCustomSphere, sphereKinds } from '../store.js';
import { todayISO, addDays, monthKey, monthTitle, weekDates, dayShort, yearOf, DOW, dowIndex } from '../dates.js';
import { h, raw, field, bar, toast, openSheet, confirmSheet } from '../ui.js';
import { sphereProgress, sphereStatus, questsOn, sphereOf, liveLessons, lessonMonth, sportLessonSessions,
  sphereLogOn, sphereLogMonth, sphereLogTotal, sphereLogYear, ROLES, roleById, roleOfSphere } from '../selectors.js';
import { sums } from './food.js';
import { balanceAt, money } from './budget.js';
import { studyNow, workoutsIn } from '../selectors.js';
import { sphereGoalButton, sphereGoalsCard, sphereGoalSheet } from '../spheregoal.js';

const STAGES = ['росток', 'бутон', 'готов ✦'];
const rec = (s, key) => (s.spheres[key] ||= { items: [], note: '', vault: null, log: {} });

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
        const edu = sp.key === 'edu'
          ? liveLessons().filter(l => !l.paused).reduce((a, l) => a + lessonMonth(l, todayISO().slice(0, 7)), 0)
          : null;
        return raw(h`
          <button class="tile" data-act="open" data-v="${sp.key}">
            ${sp.img ? raw(h`<img src="${sp.img}" alt="">`) : raw(h`<div class="tile-emoji">${sp.icon}</div>`)}
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
    <button class="add" data-act="newsphere">+ Своя сфера</button>
    ${hidden().length ? raw(h`
      <div class="card mute">
        <div class="caps">Убраны с глаз</div>
        <div class="lab">Данные на месте — просто не мозолят глаза.</div>
        <div class="pills">${hidden().map(sp => raw(h`<button class="pill" data-act="unhide" data-v="${sp.key}">${sp.icon || ''} ${sp.name}</button>`))}</div>
      </div>`) : ''}
    <div class="card dash">
      <div class="lab">Сферы — это не отчёт. Пустая сфера не отнимает ничего,
        а ненужную можно убрать с глаз — она не удалится.</div>
    </div>`;
}

const hidden = () => allSpheres().filter(sp => (S.spheresHidden || []).includes(sp.key));

function detail(key) {
  const sp = sphereOf(key);
  if (!sp) return h`<div class="empty">Такой сферы нет. <button class="q-edit" data-act="back">← к сферам</button></div>`;
  const r = S.spheres[key] || { items: [], note: '', log: {} };
  const items = r.items || [];
  const pct = sphereProgress(key);
  const own = isCustomSphere(key);
  // У встроенных сферы механики зашиты, у своих выбраны при создании.
  const kinds = own ? sphereKinds(key) : ['steps'];

  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ сферы</button>
      <span class="tag">${sp.mech}</span>
    </div>
    <div class="row between">
      <div class="title grow">${sp.name}</div>
      <button class="q-edit" data-act="sphereedit" data-v="${key}">изменить ›</button>
    </div>
    ${sp.img ? raw(h`<img class="hero-img" src="${sp.img}" alt="">`) : raw(h`<div class="hero-emoji">${sp.icon}</div>`)}
    ${pct != null ? raw(h`<div class="card"><div class="row">${raw(bar(pct, pct >= 100))}<span class="lab">${pct}%</span></div>
      <div class="lab">${items.filter(i => i.done).length} из ${items.length} закрыто</div></div>`) : ''}

    ${raw(key === 'blog' ? blogBody(items) : key === 'money' ? vaultBody(r) : key === 'sport' ? sportBody() : '')}
    ${raw(kinds.includes('log') ? logBody(key, sp) : '')}

    ${raw(sphereGoalsCard(key))}
    ${raw(sphereGoalButton(key))}

    ${kinds.includes('steps') ? raw(h`
      <div class="card">
        <div class="caps">${key === 'blog' ? 'Идеи' : 'Этапы'}</div>
        ${items.length ? raw(h`<div class="list">${items.map(i => raw(itemRow(key, i)))}</div>`)
          : raw('<div class="empty">Пока пусто. Добавь первый шаг — он и будет прогрессом.</div>')}
        <button class="add" data-act="itemadd">+ ${key === 'blog' ? 'Идея' : 'Этап'}</button>
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
        <span class="lab">${sphereLogMonth(key, ym)} ${plural(sphereLogMonth(key, ym), 'день', 'дня', 'дней')} в ${monthTitle(ym).toLowerCase()}</span></div>
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

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};

/** Заготовки: шаблон только заполняет форму, сам ничего не создаёт. */
const TEMPLATES = [
  { id: 'practice', name: 'Практика', icon: '🌱', mech: 'практика', kinds: ['log'], unit: 'раз',
    hint: 'медитация, рисование, гитара — важно, как часто' },
  { id: 'projects', name: 'Проекты', icon: '🔨', mech: 'проекты', kinds: ['steps'], unit: 'шагов',
    hint: 'ремонт, фриланс, рукоделие — важно, что закрыто' },
  { id: 'both', name: 'Практика и план', icon: '🧭', mech: 'своя', kinds: ['log', 'steps'], unit: 'раз',
    hint: 'язык, инструмент — и заниматься, и держать план' },
  { id: 'blank', name: 'С нуля', icon: '✦', mech: 'своя', kinds: ['steps'], unit: 'раз',
    hint: 'выберешь всё сам' },
];

/** Создание своей сферы: сначала заготовка, потом её можно переписать. */
function newSphereSheet() {
  openSheet({
    title: 'Своя сфера',
    sub: 'сначала выбери, на что она похожа',
    body: [
      TEMPLATES.map(t => h`
        <button class="row between care-name" data-act="tpl" data-v="${t.id}">
          <span class="ink grow">${t.icon} ${t.name}</span>
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
  const base = own || tpl || { name: '', icon: '✦', mech: 'своя', kinds: ['steps'], unit: 'раз' };
  const kinds = base.kinds || [];
  openSheet({
    title: built ? built.name : own ? own.name : 'Своя сфера',
    sub: built ? 'встроенная сфера — можно сменить роль или убрать с глаз' : 'что это и что она считает',
    body: [
      built ? '' : field.text('name', 'Название', base.name, 'например, «Музыка»'),
      built ? '' : field.text('icon', 'Значок', base.icon, 'один эмодзи'),
      built ? '' : field.text('mech', 'Подпись на плитке', base.mech, 'коротко: практика, проекты'),
      built ? '' : `<div class="fld"><span>Что она считает</span>
        <label class="row tight" style="font-size:13px"><input type="checkbox" name="steps" ${kinds.includes('steps') ? 'checked' : ''}> Этапы — список с галочками и прогрессом</label>
        <label class="row tight" style="font-size:13px"><input type="checkbox" name="log" ${kinds.includes('log') ? 'checked' : ''}> Журнал — отметки по дням, счёт за месяц и год</label>
      </div>`,
      built || !kinds.includes('log') ? '' : field.text('unit', 'В чём считаем журнал', base.unit, 'раз, страниц, минут'),
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
      const picked = [v.steps && 'steps', v.log && 'log'].filter(Boolean);
      if (!key && !picked.length) return toast('Выбери хотя бы одну механику');
      const id = key || ('c' + uid());
      update(s => {
        if (!built) {
          const next = {
            key: id, name, icon: (v.icon || '✦').trim().slice(0, 4) || '✦',
            mech: (v.mech || 'своя').trim() || 'своя', kinds: picked,
            unit: (v.unit || 'раз').trim() || 'раз', archived: false,
          };
          const i = s.customSpheres.findIndex(x => x.key === id);
          if (i >= 0) s.customSpheres[i] = { ...s.customSpheres[i], ...next };
          else s.customSpheres.push(next);
          s.spheres[id] ||= { items: [], note: '', vault: null, log: {} };
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
  open: v => { location.hash = { food: '#/food', money: '#/budget', edu: '#/edu', study: '#/study', sport: '#/sport', books: '#/library', trips: '#/trips' }[v.v] || '#/spheres/' + v.v; },
  back: () => { location.hash = '#/spheres'; },

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
      it.doneAt = todayISO();
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
