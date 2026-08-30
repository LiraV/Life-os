// Путь: места работы во времени, перерывы, стаж, миграция со старой формы.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}`); };

// ── миграция: плоская отметка дня из прошлой версии не должна пропасть
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.evaluate(() => localStorage.setItem('lifeos.state', JSON.stringify({
  v: 33, onboarded: true, ui: { tips: 'off' },
  work: {
    days: { '2026-08-24': { type: 'work', hours: 7, where: 'office', note: 'до миграции' } },
    projects: [], tasks: [], wins: [], tracks: [], career: [],
    job: { start: '11:00', end: '18:00', lunch: 60, days: [0, 1, 2, 3, 4], salary: 30000, officeNorm: 8, vacationDays: 28 },
  },
})));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(900);
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
let s = await st();
ok('под отметки завелось одно место', s.work.jobs.length === 1);
ok('оно названо общим словом, а не выдуманной компанией', s.work.jobs[0].company === 'Работа');
ok('старый график переехал к месту', s.work.jobs[0].sched.start === '11:00' && s.work.jobs[0].sched.lunch === 60);
ok('оклад и норма офиса переехали', s.work.jobs[0].salary === 30000 && s.work.jobs[0].officeNorm === 8);
const jid = s.work.jobs[0].id;
ok('отметка дня переехала под место', s.work.days['2026-08-24'][jid].hours === 7);
ok('и заметка не потерялась', s.work.days['2026-08-24'][jid].note === 'до миграции');

// ── чистое состояние для остального
await p.evaluate(() => localStorage.removeItem('lifeos.state'));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  const { closeSheet } = await import('./app/js/ui.js');
  update(s2 => { s2.ui.tips = 'off'; }); closeSheet();
  const raw = localStorage.getItem('lifeos.state');
  if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
});

await p.evaluate(() => { location.hash = '#/work'; }); await p.waitForTimeout(700);
await p.locator('[data-act="tab"][data-v="road"]').click(); await p.waitForTimeout(600);
ok('пустой путь не ругается', /Путь пока пуст/.test(await p.locator('.scr').innerText()));

// ── прошлые места и перерыв
await p.evaluate(async () => {
  const { update, uid, blankSched } = await import('./app/js/store.js');
  update(s2 => {
    s2.work.jobs.push(
      { id: uid(), company: 'Ozon', title: 'Ассистент', kind: 'intern', start: '2023-01-01', end: '2023-12-31',
        salary: 0, note: '', sched: blankSched(), officeNorm: 0, vacationDays: 28 },
      { id: uid(), company: 'Пятёрочка', title: 'Стажёр', kind: 'intern', start: '2024-06-01', end: '2024-12-31',
        salary: 0, note: '', sched: blankSched(), officeNorm: 0, vacationDays: 28 },
      { id: uid(), company: 'Магнит', title: 'Специалист', kind: 'job', start: '2025-09-01', end: '',
        salary: 30000, note: '', sched: blankSched(), officeNorm: 0, vacationDays: 28 });
  });
});
await p.waitForTimeout(500);
const road = await p.locator('.scr').innerText();
ok('путь показан целиком', /Ozon/.test(road) && /Пятёрочка/.test(road) && /Магнит/.test(road));
ok('перерывы показаны', /перерыв/.test(road));
const gaps = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return [m.careerGap(0), m.careerGap(1), m.careerGap(2)];
});
ok(`перерыв перед «Магнитом» — 8 месяцев (${gaps[0]})`, gaps[0] === 8);
ok(`перерыв перед «Пятёрочкой» — 5 месяцев (${gaps[1]})`, gaps[1] === 5);
ok('перед самым первым местом перерыва нет', gaps[2] === 0);

// ── параллельное место не создаёт ложного перерыва и не удваивает стаж
const before = await p.evaluate(async () => (await import('./app/js/selectors.js')).careerTotal());
await p.evaluate(async () => {
  const { update, uid, blankSched } = await import('./app/js/store.js');
  update(s2 => {
    s2.work.jobs.push({ id: uid(), company: 'Подработка', title: 'Курьер', kind: 'part',
      start: '2025-10-01', end: '2026-01-31', salary: 0, note: '', sched: blankSched(), officeNorm: 0, vacationDays: 28 });
  });
});
await p.waitForTimeout(500);
const after = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return { total: m.careerTotal(), gaps: m.careerLine().map((_, i) => m.careerGap(i)) };
});
ok(`параллельное место стаж не удвоило (${before} → ${after.total})`, before === after.total);
ok('и ложного перерыва не появилось', after.gaps.every(g => g >= 0) && after.gaps.filter(g => g > 0).length === 2);

// ── проверка дат
await p.locator('[data-act="jobadd"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="company"]', 'Тест');
await p.fill('input[name="start"]', '2025-01-01');
await p.fill('input[name="end"]', '2024-01-01');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
ok('конец раньше начала не принимается', (await st()).work.jobs.length === 4);
await p.locator('[data-sheet="close"]').click(); await p.waitForTimeout(400);

// ── правка места
await p.locator('[data-act="job2"]').first().click(); await p.waitForTimeout(500);
await p.fill('input[name="title"]', 'Ведущий специалист');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
ok('место правится', (await st()).work.jobs.some(x => x.title === 'Ведущий специалист'));

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
