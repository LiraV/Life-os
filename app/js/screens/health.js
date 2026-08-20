// «Тело»: цикл считается от реальных отметок, замеры хранят историю.

import { S, update, uid, XP, addXp } from '../store.js';
import { todayISO, dayShort, diffDays } from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';
import { cycleInfo, measureDeltas } from '../selectors.js';

const sign = n => n == null ? '' : n > 0 ? `+${n}` : `${n}`;

export function render() {
  const c = cycleInfo();
  const m = measureDeltas();
  const cur = m.cur;

  return h`
    <div class="title">Тело</div>
    <div class="sub">Дом, а не проект. Замеры — раз в месяц, не чаще.</div>
    <img class="hero-img" src="assets/illustration_09.png" alt="">

    <div class="card">
      <div class="caps">Цикл</div>
      ${c ? raw(h`
        <div class="ink"><b>день ${c.day}</b> · ${c.phase}</div>
        ${raw(bar(c.pct, c.phase === 'менструация'))}
        <div class="lab">${c.hint} · средняя длина ${c.len} дней, последнее начало ${dayShort(c.last)}</div>`)
      : raw('<div class="lab">Отметь начало цикла — и я свяжу его с кривой энергии.</div>')}
      <div class="pills">
        <button class="pill" data-act="period">Отметить месячные</button>
        <button class="pill" data-act="symptom">Симптом</button>
      </div>
    </div>

    ${S.health.symptoms.length ? raw(h`
      <div class="card mute">
        <div class="caps">Симптомы</div>
        ${S.health.symptoms.slice(0, 4).map(s => raw(h`<div class="lab">${dayShort(s.date)} — ${s.text}</div>`))}
      </div>`) : ''}

    <div class="card">
      <div class="row between"><div class="caps">Замеры тела</div>
        <span class="lab">${cur ? dayShort(cur.date) : 'нет данных'}</span></div>
      ${cur ? raw(h`
        <div class="row between"><span class="ink">Вес</span><span class="ink">${fmt(cur.weight, 'кг')} <i class="lab">${sign(m.delta.weight)}</i></span></div>
        <div class="row between"><span class="ink">Талия</span><span class="ink">${fmt(cur.waist, 'см')} <i class="lab">${sign(m.delta.waist)}</i></span></div>
        <div class="row between"><span class="ink">Бёдра</span><span class="ink">${fmt(cur.hips, 'см')} <i class="lab">${sign(m.delta.hips)}</i></span></div>
        <div class="row between"><span class="ink">Сон</span><span class="ink">${fmt(cur.sleep, 'ч')} <i class="lab">цель ${S.user.sleep} ч</i></span></div>`)
      : raw('<div class="empty">Первый замер — точка отсчёта, а не оценка.</div>')}
      <button class="add" data-act="measure">+ Новый замер</button>
    </div>

    ${m.list.length > 1 ? raw(h`
      <div class="card mute">
        <div class="caps">История</div>
        ${m.list.slice(-6).reverse().map(x => raw(h`<div class="row between"><span class="lab">${dayShort(x.date)}</span>
          <span class="lab">${fmt(x.weight, 'кг')} · ${fmt(x.waist, 'см')} · сон ${fmt(x.sleep, 'ч')}</span>
          <button class="q-edit" data-act="mdel" data-id="${x.id}">×</button></div>`))}
      </div>`) : ''}

    <div class="card dash"><div class="lab">Если цикл на подходе — я сама предложу мягкие дни на экране «День».</div></div>`;
}

const fmt = (v, unit) => v == null || v === '' ? '—' : `${v} ${unit}`;

export const actions = {
  period: () => {
    const t = todayISO();
    const last = [...S.health.periods].sort().pop();
    if (last && diffDays(t, last) < 10) {
      return openSheet({
        title: 'Уже отмечено недавно',
        sub: `Последняя отметка — ${dayShort(last)}. Поставить ещё одну?`,
        primary: 'Да, отметить',
        onSave: (_v, close) => { update(s => s.health.periods.push(t)); close(); toast('Отмечено'); },
      });
    }
    update(s => s.health.periods.push(t));
    toast('Отмечено · цикл пересчитан');
  },

  symptom: () => openSheet({
    title: 'Симптом',
    body: [
      field.opts('text', 'Что чувствуешь', ['тянет низ живота', 'болит голова', 'нет сил', 'отёки', 'настроение вниз'], 'нет сил'),
      field.text('own', 'Или своими словами', ''),
    ].join(''),
    primary: 'Записать',
    onSave: (v, close) => {
      const text = (v.own || '').trim() || v.text;
      update(s => s.health.symptoms.unshift({ id: uid(), date: todayISO(), text }));
      close();
      toast('Записала');
    },
  }),

  measure: () => {
    const last = measureDeltas().cur;
    openSheet({
      title: 'Новый замер',
      sub: 'Пустые поля просто не запишутся',
      body: [
        field.date('date', 'Когда', todayISO()),
        field.number('weight', 'Вес', '', { min: 0, suffix: 'кг' }),
        field.number('waist', 'Талия', '', { min: 0, suffix: 'см' }),
        field.number('hips', 'Бёдра', '', { min: 0, suffix: 'см' }),
        field.number('sleep', 'Сон в среднем', '', { min: 0, max: 14, suffix: 'ч' }),
        last ? field.note(`Прошлый раз: ${fmt(last.weight, 'кг')} · ${fmt(last.waist, 'см')} · ${fmt(last.hips, 'см')}`) : '',
      ].join(''),
      primary: 'Сохранить · +5 XP',
      onSave: (v, close) => {
        const num = x => x === '' || x == null ? null : Number(x);
        const rec = { id: uid(), date: v.date || todayISO(), weight: num(v.weight), waist: num(v.waist), hips: num(v.hips), sleep: num(v.sleep) };
        if ([rec.weight, rec.waist, rec.hips, rec.sleep].every(x => x == null)) return toast('Заполни хотя бы одно поле');
        update(s => { s.health.measures.push(rec); addXp(XP.measure); });
        close();
        toast('Замер сохранён');
      },
    });
  },

  mdel: v => update(s => { s.health.measures = s.health.measures.filter(x => x.id !== v.id); }),
};
