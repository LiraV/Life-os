// Смена периодов: приложение открывается на сегодня, старое не тащится,
// но и не пропадает — оно остаётся в своём месяце.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const go = async x => { await p.evaluate(h => { location.hash = h; }, x); await p.waitForTimeout(650); };
const today = new Date().toISOString().slice(0, 10);
const ym = today.slice(0, 7);
const y = Number(today.slice(0, 4));
const prevYm = (() => { const d = new Date(today); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(([pm, yy]) => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  // где человек листал в прошлый раз — полгода назад
  s.ui.date = '2026-05-14'; s.ui.monthAnchor = pm; s.ui.weekAnchor = '2026-05-14';
  s.ui.year = yy - 1; s.ui.trackYear = yy - 1; s.ui.habitAnchor = '2026-05-14';
  s.ui.budMonth = pm; s.ui.tripYear = yy - 2;
  // цели прошлого месяца: обычная, динамичная и незакрытая
  s.goals = [
    { id: 'g-old', title: 'Цель прошлого месяца', horizon: 'month', period: pm, target: 5, current: 2, steps: [], slots: [] },
    { id: 'd-old', title: 'Динамичная прошлая', horizon: 'month', period: pm, dynamic: true, target: 4, current: 1, steps: [], slots: [] },
  ];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
}, [pm(), yy()]);
async function pm() {} async function yy() {}
await p.evaluate(([pmv, yyv]) => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.goals[0].period = pmv; s.goals[1].period = pmv;
  s.ui.monthAnchor = pmv; s.ui.budMonth = pmv; s.ui.year = yyv - 1; s.ui.trackYear = yyv - 1;
  localStorage.setItem('lifeos.state', JSON.stringify(s));
}, [prevYm, y]);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);

// ── 1. якоря встали на сегодня
let s = await st();
ok('день — сегодняшний', s.ui.date === today, s.ui.date);
ok('месяц — этот', s.ui.monthAnchor === ym, s.ui.monthAnchor);
ok('неделя — эта', s.ui.weekAnchor === today, s.ui.weekAnchor);
ok('год планов — этот', s.ui.year === y, String(s.ui.year));
ok('год трекера — этот', s.ui.trackYear === y, String(s.ui.trackYear));
ok('месяц бюджета — этот', s.ui.budMonth === ym, s.ui.budMonth);
ok('год стран — этот', s.ui.tripYear === y, String(s.ui.tripYear));
ok('якорь привычек — сегодня', s.ui.habitAnchor === today, s.ui.habitAnchor);

await go('#/day');
ok('«День» открылся на сегодня', /сегодня/.test(await p.locator('.scr').innerText()));
await go('#/tracker');
ok('трекер открылся на этот год', new RegExp(`Трекер ${y}`).test(await p.locator('.scr').innerText()),
  (await p.locator('.scr').innerText()).split('\n')[1]);

// ── 2. старые цели не тащатся в новый месяц
await go('#/plans');
await p.locator('.pill:text-is("Месяц")').first().click(); await p.waitForTimeout(600);
let scr = await p.locator('.scr').innerText();
ok('цель прошлого месяца не показана', !/Цель прошлого месяца/.test(scr));
ok('и динамичная тоже', !/Динамичная прошлая/.test(scr));
ok('месяц открыт этот', new RegExp(String(new Date(today).getFullYear())).test(scr));

// ── 3. но никуда не делись — лежат в своём месяце
await p.locator('[data-act="mprev"]').first().click(); await p.waitForTimeout(600);
scr = await p.locator('.scr').innerText();
ok('в прошлом месяце цель на месте', /Цель прошлого месяца/.test(scr));
ok('и динамичная на месте', /Динамичная прошлая/.test(scr));
ok('их набранное сохранилось', /2 из 5/.test(scr) && /1 \/ 4/.test(scr),
  (scr.match(/Цель прошлого[\s\S]{0,40}/) || [''])[0].replace(/\n/g, ' · '));
s = await st();
ok('в данных обе цели целы', s.goals.length === 2 && s.goals[0].current === 2);

// ── 4. листание внутри сеанса запоминается
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(500);
await p.evaluate(() => { location.hash = '#/plans'; }); await p.waitForTimeout(600);
ok('внутри сеанса остались на прошлом месяце', /Цель прошлого месяца/.test(await p.locator('.scr').innerText()));

// ── 5. новая загрузка снова возвращает к сегодня
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await go('#/plans');
await p.locator('.pill:text-is("Месяц")').first().click(); await p.waitForTimeout(600);
ok('после перезапуска снова этот месяц', !/Цель прошлого месяца/.test(await p.locator('.scr').innerText()));

// ── 6. трекер считает по месяцам, а не тащит прошлое
await p.evaluate(([d1, d2]) => {
  const s2 = JSON.parse(localStorage.getItem('lifeos.state'));
  s2.habits = [{ id: 'h1', name: 'Вода', target: 1, step: 1, unit: '', link: '', log: { [d1]: 1, [d2]: 1 }, createdAt: d2 }];
  localStorage.setItem('lifeos.state', JSON.stringify(s2));
}, [today, `${prevYm}-05`]);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
const cells = await p.evaluate(async ([m1, m2]) => {
  const sel = await import('./app/js/selectors.js');
  const { S } = await import('./app/js/store.js');
  const hb = S.habits[0];
  return { now: sel.habitMonthCount(hb, m1), prev: sel.habitMonthCount(hb, m2) };
}, [ym, prevYm]);
ok('каждый месяц считает своё', cells.now === 1 && cells.prev === 1, JSON.stringify(cells));

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
