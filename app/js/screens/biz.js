// «Моё дело»: то, что человек делает своим. Не только приложения и сайты —
// бизнес, комьюнити, студенческая организация, продажи через личный бренд,
// мероприятия, товары. Механика у всех одна, разные только подсказки: у клуба
// и у приложения запуск устроен по-разному.
//
// У проекта две своих вещи, которых нет больше нигде: шаги до запуска и
// показатели, за которыми автор следит сам. Общего «успеха» приложение не
// выводит: что тут успех, знает только тот, кто это делает.

import { goBack } from '../nav.js';
import { S, update, uid, XP, addXp, addDiary, nameTaken } from '../store.js';
import { todayISO, monthKey, yearOf, dayShort } from '../dates.js';
import { h, raw, field, bar, toast, openSheet, confirmSheet, plural } from '../ui.js';
import { BIZ_STAGES, BIZ_KINDS, bizStepHints, bizMetricHints, stageName, kindName } from '../biz.js';
import {
  bizProjects, bizById, bizBy, bizLive, bizLaunchedIn, bizSteps, bizStepsLeft, bizProgress,
  bizMetrics, bizMarks, bizLast,
} from '../selectors.js';
import { sphereGoalButton, sphereGoalsCard, sphereGoalActions } from '../spheregoal.js';

export function render(params) {
  return params[0] ? detail(params[0]) : list();
}

function list() {
  const y = String(yearOf(todayISO()));
  const launched = bizLaunchedIn(`${y}-01-01`, `${y}-12-31`).length;
  const live = bizLive().length;
  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ назад</button>
      <span class="tag">проекты</span>
    </div>
    <div class="title">Моё дело</div>
    <div class="sub">${live ? `${live} ${plural(live, 'проект живёт', 'проекта живут', 'проектов живут')}${launched ? ` · запущено за ${y} — ${launched}` : ''}`
      : 'Пока ничего не запущено. Идея — тоже дело.'}</div>

    ${BIZ_STAGES.map(st => {
      const mine = bizBy(st.key);
      if (!mine.length && st.key === 'frozen') return '';
      return raw(h`
        <div class="card">
          <div class="row between"><div class="caps">${st.name}</div>
            <span class="lab">${mine.length || ''}</span></div>
          ${mine.length ? raw(h`<div class="list">${mine.map(pr => raw(projectRow(pr)))}</div>`)
            : raw(h`<div class="lab">${st.hint}</div>`)}
        </div>`);
    })}
    <button class="add" data-act="add">+ Проект</button>

    ${raw(sphereGoalsCard('biz'))}
    ${raw(sphereGoalButton('biz'))}
    <div style="height:4px"></div>`;
}

function projectRow(pr) {
  const left = bizStepsLeft(pr);
  const m = bizMetrics(pr)[0];
  const last = m ? bizLast(pr, m.id) : null;
  return h`
    <div class="chk-row">
      <button class="pill" data-act="move" data-id="${pr.id}">${kindName(pr.kind) || '—'}</button>
      <span class="grow ellip" data-act="open" data-id="${pr.id}" style="cursor:pointer">${pr.name}</span>
      <span class="lab">${last ? `${last.value} ${m.unit}` : left ? `${left} ${plural(left, 'шаг', 'шага', 'шагов')}` : ''}</span>
      <button class="q-edit" data-act="open" data-id="${pr.id}">›</button>
    </div>`;
}

/** Один проект: что это, шаги до запуска и свои показатели. */
function detail(id) {
  const pr = bizById(id);
  if (!pr) return h`<div class="empty">Такого проекта нет. <button class="q-edit" data-act="tolist">← к проектам</button></div>`;
  const pct = bizProgress(pr);
  return h`
    <div class="row between">
      <button class="q-edit" data-act="tolist">‹ проекты</button>
      <span class="tag">${stageName(pr.stage).toLowerCase()}</span>
    </div>
    <div class="row between">
      <div class="title grow">${pr.name}</div>
      <button class="q-edit" data-act="edit" data-id="${pr.id}">изменить ›</button>
    </div>
    <div class="sub">${[kindName(pr.kind), pr.launched ? `запущено ${dayShort(pr.launched)}` : ''].filter(Boolean).join(' · ') || 'ещё не запущено'}</div>
    ${pr.link ? raw(h`<div class="lab ellip">${pr.link}</div>`) : ''}

    <div class="card">
      <div class="row between"><div class="caps">Шаги до запуска</div>
        <span class="lab">${pct != null ? `${pct}%` : ''}</span></div>
      ${pct != null ? raw(h`<div class="row">${raw(bar(pct, pct >= 100))}</div>`) : ''}
      ${bizSteps(pr).length ? raw(h`<div class="list">${bizSteps(pr).map(x => raw(h`
        <div class="chk-row ${x.done ? 'done' : ''}">
          <button class="check ${x.done ? 'on' : ''}" data-act="steptick" data-id="${pr.id}" data-s="${x.id}">✓</button>
          <span class="grow">${x.text}</span>
          <button class="q-edit" data-act="stepdel" data-id="${pr.id}" data-s="${x.id}">×</button>
        </div>`))}</div>`)
        : raw('<div class="lab">Пусто. Здесь то, без чего проект не выйдет наружу.</div>')}
      <button class="add" data-act="steps" data-id="${pr.id}">${bizSteps(pr).length ? 'Ещё шаги' : 'Взять шаги'}</button>
    </div>

    <div class="card">
      <div class="row between"><div class="caps">Показатели</div>
        <button class="q-edit" data-act="metrics" data-id="${pr.id}">править ›</button></div>
      ${bizMetrics(pr).length ? raw(h`<div class="list">${bizMetrics(pr).map(m => {
        const last = bizLast(pr, m.id);
        return raw(h`
          <button class="link-row" data-act="mark" data-id="${pr.id}" data-m="${m.id}">
            <span class="ink grow ellip">${m.name}</span>
            <span class="lab">${last ? `${last.value} ${m.unit}${last.delta ? ` · ${last.delta > 0 ? '+' : ''}${last.delta}` : ''} · ${dayShort(last.date)}`
              : 'ещё не отмечали'} ›</span>
          </button>`);
      })}</div>`)
        : raw('<div class="lab">Пусто. Что именно смотреть — участников, заказы, выручку, — решаешь ты.</div>')}
      ${bizMetrics(pr).length ? raw('<div class="lab">Тап по показателю записывает новое значение на сегодня.</div>') : ''}
    </div>

    ${pr.note ? raw(h`<div class="card mute"><div class="caps">Заметка</div><div class="ink">${pr.note}</div></div>`) : ''}
    <div style="height:4px"></div>`;
}

/** Проект целиком. Дата запуска ставится сама только при переходе в «запущено». */
function projectSheet(id) {
  const pr = id ? bizById(id) : null;
  const base = pr || { name: '', kind: '', stage: 'idea', link: '', launched: '', note: '' };
  openSheet({
    title: pr ? 'Проект' : 'Новый проект',
    sub: pr ? stageName(pr.stage) : 'от идеи до того, чем живут',
    body: [
      field.text('name', 'Название', base.name, 'как ты его называешь'),
      field.opts('kind', 'Что это', BIZ_KINDS.map(k => ({ value: k.key, label: k.name })), base.kind || ''),
      field.note('Вид ничего не ограничивает и ничего не считает — от него зависят только подсказки: '
        + 'какие шаги предложить и за чем обычно следят. У клуба и у приложения запуск устроен по-разному.'),
      field.opts('stage', 'Стадия', BIZ_STAGES.map(x => ({ value: x.key, label: x.name })), base.stage),
      field.date('launched', 'Когда запущено', base.launched),
      field.note('День запуска нужен, чтобы считать «проектов за год». Пока его нет, проект в этот счёт не идёт, даже если стадия «запущено».'),
      field.text('link', 'Ссылка', base.link, 'сайт, страница, чат'),
      field.area('note', 'Заметка', base.note, 'для кого это и чем отличается'),
    ].join(''),
    primary: pr ? 'Сохранить' : 'Добавить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      const twin = nameTaken(bizProjects(), name, id);
      if (twin) return toast(`«${twin.name}» уже есть`);
      const next = {
        name,
        kind: BIZ_KINDS.some(k => k.key === v.kind) ? v.kind : '',
        stage: BIZ_STAGES.some(x => x.key === v.stage) ? v.stage : 'idea',
        launched: (v.launched || '').slice(0, 10),
        link: (v.link || '').trim(),
        note: (v.note || '').trim(),
      };
      if (next.stage === 'live' && !next.launched) next.launched = todayISO();
      update(s => {
        const was = s.biz.projects.find(x => x.id === id);
        if (was) Object.assign(was, next);
        else s.biz.projects.push({ id: uid(), ...next, steps: [], metrics: [], marks: [] });
      });
      close();
      toast(pr ? 'Сохранено' : 'Проект добавлен');
    },
    danger: pr ? 'Удалить' : null,
    onDanger: (_v, close) => {
      close();
      confirmSheet(`Удалить «${pr.name}»?`, 'Проект исчезнет вместе с шагами и отметками показателей.', 'Удалить',
        () => { update(s => { s.biz.projects = s.biz.projects.filter(x => x.id !== id); }); location.hash = '#/biz'; });
    },
  });
}

export const actions = {
  back: () => goBack('spheres'),
  tolist: () => { location.hash = '#/biz'; },
  open: v => { location.hash = '#/biz/' + v.id; },
  add: () => projectSheet(null),
  edit: v => projectSheet(v.id),

  /** Тап по пилюле двигает стадию. Дошёл до «запущено» — ставим день. */
  move: v => {
    let msg = '';
    update(s => {
      const pr = s.biz.projects.find(x => x.id === v.id);
      if (!pr) return;
      const i = BIZ_STAGES.findIndex(x => x.key === pr.stage);
      const next = BIZ_STAGES[(i + 1) % BIZ_STAGES.length];
      pr.stage = next.key;
      if (next.key === 'live') {
        pr.launched ||= todayISO();
        addXp(XP.step);
        addDiary(s, `запущено: ${pr.name}`, 'Моё дело', 'sphere');
        msg = `«${pr.name}» запущено ✦`;
      } else msg = `${pr.name} → ${next.name.toLowerCase()}`;
    });
    toast(msg);
  },

  steps: v => {
    const draw = () => {
    const pr = bizById(v.id);
    if (!pr) return;
    const have = new Set(bizSteps(pr).map(x => x.text));
    openSheet({
      title: 'Шаги до запуска',
      sub: pr.name,
      body: [
        bizStepHints(pr.kind).filter(t => !have.has(t)).map(t => h`
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
          if (bizSteps(bizById(v.id)).some(x => x.text === t)) return toast('Такой шаг уже есть');
          update(s => s.biz.projects.find(x => x.id === v.id)?.steps.push({ id: uid(), text: t, done: false }));
          // Перерисовываем, а не закрываем: можно взять несколько подряд.
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
    const x = s.biz.projects.find(y => y.id === v.id)?.steps.find(y => y.id === v.s);
    if (!x) return;
    x.done = !x.done;
    if (x.done) addXp(XP.step);
  }),
  stepdel: v => update(s => {
    const pr = s.biz.projects.find(y => y.id === v.id);
    if (pr) pr.steps = pr.steps.filter(x => x.id !== v.s);
  }),

  /** Показатели проекта: свои названия и единицы, подсказки — не список. */
  metrics: v => {
    const draw = () => {
      const pr = bizById(v.id);
      if (!pr) return;
      openSheet({
        title: 'Показатели',
        sub: pr.name,
        body: [
          bizMetrics(pr).length ? bizMetrics(pr).map(m => h`
            <div class="link-row">
              <span class="ink grow ellip">${m.name}</span>
              <span class="lab">${m.unit}</span>
              <button class="q-edit" data-act="mdel" data-v="${m.id}">×</button>
            </div>`).join('')
            : field.note('Пока ничего. Возьми из подсказок или впиши своё.'),
          `<div class="pills">${bizMetricHints(pr.kind).filter(x => !bizMetrics(pr).some(m => m.name === x.name))
            .map(x => `<button type="button" class="pill" data-act="madd" data-n="${x.name}" data-u="${x.unit}">+ ${x.name}</button>`).join('')}</div>`,
          `<div class="row"><input type="text" class="grow" data-field="mname" placeholder="Свой показатель">
            <input type="text" class="grow" data-field="munit" placeholder="ед." style="max-width:86px">
            <button type="button" class="pill" data-act="mown">+</button></div>`,
          field.note('Удалённый показатель уходит из списка, а его отметки остаются в данных проекта.'),
        ].join(''),
        onAct: (name, data, close) => {
          const put = (nm, unit) => {
            const n = (nm || '').trim();
            if (!n) return;
            if (nameTaken(bizMetrics(bizById(v.id)), n)) return toast(`«${n}» уже есть`);
            update(s => s.biz.projects.find(x => x.id === v.id)?.metrics.push({ id: uid(), name: n, unit: (unit || 'шт').trim() }));
            close(); draw();
          };
          if (name === 'madd') return put(data.n, data.u);
          if (name === 'mown') return put(document.querySelector('.sheet [data-field="mname"]')?.value,
            document.querySelector('.sheet [data-field="munit"]')?.value);
          if (name === 'mdel') {
            update(s => {
              const pr2 = s.biz.projects.find(x => x.id === v.id);
              if (pr2) pr2.metrics = pr2.metrics.filter(x => x.id !== data.v);
            });
            close(); draw();
          }
          return undefined;
        },
      });
    };
    draw();
  },

  /** Отметка показателя: число на дату. Прошлые отметки не трогаются. */
  mark: v => {
    const pr = bizById(v.id);
    const m = bizMetrics(pr).find(x => x.id === v.m);
    if (!pr || !m) return;
    const last = bizLast(pr, m.id);
    openSheet({
      title: m.name,
      sub: `${pr.name}${last ? ` · прошлый раз ${last.value} ${m.unit} от ${dayShort(last.date)}` : ''}`,
      body: [
        field.date('date', 'Когда', todayISO()),
        field.number('value', `Сколько, ${m.unit}`, '', { min: 0 }),
        field.note('Каждая отметка ложится отдельно: история показателя — это и есть его график.'),
      ].join(''),
      primary: 'Записать',
      onSave: (val, close) => {
        const value = Number(val.value);
        if (!Number.isFinite(value)) return toast('Нужно число');
        const date = (val.date || todayISO()).slice(0, 10);
        update(s => {
          const pr2 = s.biz.projects.find(x => x.id === v.id);
          if (!pr2) return;
          const was = pr2.marks.find(x => x.metricId === m.id && x.date === date);
          if (was) was.value = value;
          else pr2.marks.push({ id: uid(), metricId: m.id, date, value });
          pr2.marks.sort((a, b) => (a.date < b.date ? -1 : 1));
          addXp(XP.measure);
        });
        close();
        toast('Записала');
      },
    });
  },

  ...sphereGoalActions('biz'),
};
