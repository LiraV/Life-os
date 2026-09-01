// Лист целей: год и его кварталы одной страницей, чтобы видеть, к чему всё
// сходится, — на бумаге или в PDF.
//
// Своего PDF не собираем: библиотека ради этого весила бы больше всего
// приложения. Печатаем саму страницу — браузер и так умеет «Сохранить в PDF»,
// на телефоне это «Поделиться → Печать». Лист живёт в обычном DOM и виден
// только при печати: отдельное окно на телефоне блокируется, а вкладка с
// голым HTML выглядит поломкой.

import { S } from './store.js';
import { h, raw, num } from './ui.js';
import { todayISO, yearOf, quarterMonths, MONTHS } from './dates.js';
import {
  goalsIn, goalsPlannedIn, goalProgress, yearProgress, quarterProgress,
  isCounter, counterOf,
} from './selectors.js';

const monthsLabel = qk => quarterMonths(qk)
  .map(m => MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 3).toLowerCase()).join('–');

/** Цель строкой: название, счёт и доля — без домыслов о том, чего нет. */
function goalLine(g, planned = '') {
  const pct = goalProgress(g);
  const c = isCounter(g) ? counterOf(g) : null;
  // Числа читают глазами, а не парсером: тысячи разделяем, как и везде.
  const count = c ? `${num(c.current)} / ${num(c.target)}${c.unit ? ` ${c.unit}` : ''}` : '';
  return h`
    <div class="pg-goal ${g.struck ? 'pg-struck' : ''}">
      <div class="pg-goal-top">
        <span class="pg-goal-name">${g.title}</span>
        <span class="pg-goal-num">${count || `${pct}%`}</span>
      </div>
      <div class="pg-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>
      ${planned ? raw('<div class="pg-note">цель года, положена в этот квартал</div>') : ''}
      ${g.why ? raw(h`<div class="pg-note">${g.why}</div>`) : ''}
    </div>`;
}

const list = (title, items) => (items.length ? h`
  <div class="pg-sub">${title}</div>
  <ul class="pg-list">${items.map(x => raw(h`<li>${x}</li>`))}</ul>` : '');

/** Разметка листа: год, его цели и намерения, потом четыре квартала. */
export function sheetHtml(y) {
  const rec = S.years[y] || { theme: '', quarters: {} };
  const yGoals = goalsIn('year', String(y));
  const yPct = yearProgress(y);
  const intents = (S.intentions?.[String(y)] || []).map(i => i.text);
  const who = (S.user.name || '').trim();

  return h`
    <div class="pg-head">
      <div>
        <div class="pg-year">${y}</div>
        ${rec.theme ? raw(h`<div class="pg-theme">«${rec.theme}»</div>`) : ''}
      </div>
      <div class="pg-meta">
        ${who ? raw(h`<div>${who}</div>`) : ''}
        ${yPct != null ? raw(h`<div>год целиком — ${yPct}%</div>`) : ''}
      </div>
    </div>

    <div class="pg-block">
      <div class="pg-title">Цели года</div>
      ${yGoals.length ? yGoals.map(g => raw(goalLine(g)))
        : raw('<div class="pg-empty">Целей года пока нет.</div>')}
      ${raw(list('Намерения года', intents))}
    </div>

    <div class="pg-quarters">
      ${['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
        const qk = `${y}-${q}`;
        const own = goalsIn('quarter', qk);
        const planned = goalsPlannedIn(qk);
        const months = quarterMonths(qk).flatMap(ym => goalsIn('month', ym));
        const pct = quarterProgress(qk);
        const qi = (S.intentions?.[qk] || []).map(i => i.text);
        return raw(h`
          <div class="pg-q">
            <div class="pg-q-head">
              <span class="pg-q-name">${q}</span>
              <span class="pg-q-months">${monthsLabel(qk)}</span>
              ${pct != null ? raw(h`<span class="pg-q-pct">${pct}%</span>`) : ''}
            </div>
            ${rec.quarters?.[q] ? raw(h`<div class="pg-note">${rec.quarters[q]}</div>`) : ''}
            ${own.map(g => raw(goalLine(g)))}
            ${planned.map(g => raw(goalLine(g, qk)))}
            ${raw(list('Цели месяцев', months.map(g => g.title)))}
            ${raw(list('Намерения', qi))}
            ${!own.length && !planned.length && !months.length && !qi.length
              ? raw('<div class="pg-empty">пусто</div>') : ''}
          </div>`);
      })}
    </div>

    <div class="pg-foot">Лист целей · ${todayISO().split('-').reverse().join('.')}</div>`;
}

/**
 * Показать лист и отправить его на печать. Разметку кладём в страницу перед
 * печатью и убираем после: держать её всё время — значит дублировать все цели
 * в DOM ради кнопки, которую нажимают раз в квартал.
 */
export function printGoals(y = yearOf(todayISO())) {
  const box = document.getElementById('printout') || (() => {
    const el = document.createElement('div');
    el.id = 'printout';
    document.body.appendChild(el);
    return el;
  })();
  box.innerHTML = sheetHtml(y);
  // Печать блокирует поток до закрытия окна, поэтому убираем лист следующим
  // кадром: сразу после print() браузер ещё может дорисовывать страницу.
  const clean = () => { box.innerHTML = ''; };
  window.addEventListener('afterprint', clean, { once: true });
  window.print();
  setTimeout(clean, 60000);
}
