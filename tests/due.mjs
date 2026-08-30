// Рабочие задачи на «Дне» не показываются: у них свой экран и тихий счётчик.
// Задания учёбы со сроком — показываются.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}`); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  const { closeSheet } = await import('./app/js/ui.js');
  update(s => { s.ui.tips = 'off'; }); closeSheet();
  const raw = localStorage.getItem('lifeos.state');
  if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
});
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const D = await p.evaluate(async () => {
  const d = await import('./app/js/dates.js');
  return { today: d.todayISO(), plus11: d.addDays(d.todayISO(), 11), minus3: d.addDays(d.todayISO(), -3) };
});

// её случай: место, проект, задача со сроком через 11 дней
await p.evaluate(async ([due, late]) => {
  const { update, uid, blankSched } = await import('./app/js/store.js');
  update(s => {
    s.work.jobs.push({ id: 'j1', company: 'Okkam — Easy Commerce', title: 'Специалист', kind: 'job',
      start: '2025-09-01', end: '', salary: 30000, note: '', sched: blankSched(), officeNorm: 0, vacationDays: 28 });
    const card = (id, title, day) => ({ id, jobId: 'j1', column: 'rk-check', type: 'РК', title,
      platforms: [], month: '', day, deadline: '', request: '', budget: '', split: '',
      urgent: false, links: '', notes: '', checklist: [], movedAt: '' });
    s.work.tasks.push(card('w1', 'Замена креативов РК Йошкар-Ола', due));
    s.work.tasks.push(card('w2', 'Просроченная задача', late));
    s.study.places.push({ id: 'pl1', name: 'Универ' });
    s.study.subjects.push({ id: 'su1', placeId: 'pl1', name: 'Матанализ', archived: false });
    s.study.tasks.push({ id: 's1', subjectId: 'su1', title: 'Курсовая глава 2', stage: 'draft', due, note: '' });
  });
}, [D.plus11, D.minus3]);
await p.waitForTimeout(500);

// ── день со сроком
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
const goDay = async d => {
  await p.evaluate(async x => {
    const { update } = await import('./app/js/store.js');
    update(s => { s.ui.date = x; });
  }, d);
  await p.waitForTimeout(450);
};
await goDay(D.plus11);
let scr = await p.locator('.scr').innerText();
ok('рабочей задачи на «Дне» нет — она не должна отвлекать', !/Замена креативов/.test(scr));
ok('задание учёбы на своём дне видно', /Курсовая глава 2/.test(scr));
ok('и подписано, что это учёба', /учёба/i.test(scr));

// ── отметка задания учёбы со дня
await p.locator('[data-act="duedone"][data-id="s1"]').click(); await p.waitForTimeout(600);
ok('задание учёбы закрывается так же',
   (await st()).study.tasks.find(x => x.id === 's1').stage === 'done');

// ── открытие ведёт в само задание
await p.locator('[data-act="dueopen"][data-id="s1"]').first().click(); await p.waitForTimeout(600);
ok('тап открывает само задание учёбы', /Курсовая глава 2/.test(await p.locator('input[name="title"]').inputValue()));
await p.locator('[data-sheet="close"]').click(); await p.waitForTimeout(400);

// ── на «Работе» задача сегодня и дальше разведены
await goDay(D.today);
ok('рабочих задач нет и на сегодня', !/Замена креативов/.test(await p.locator('.scr').innerText()));
await p.evaluate(() => { location.hash = '#/work'; }); await p.waitForTimeout(700);
const w = await p.locator('.scr').innerText();
ok('просроченная работа лежит в «На сегодня»', /На сегодня/i.test(w) && /Просроченная задача/.test(w));
ok('будущая — в «Дальше», а не в сегодняшнем', /Дальше/i.test(w) && /Замена креативов/.test(w));
ok('и сказано, зачем «Дальше»', /чтобы не забыть/.test(w));

// ── тихий счётчик в меню
await p.locator('[data-nav="more"]').click(); await p.waitForTimeout(500);
const n = await p.locator('.drawer [data-drawer="work"] .item-n').innerText();
ok(`в меню счётчик рабочего на сегодня (${n})`, n === '1');
await p.keyboard.press('Escape').catch(() => {});
await p.locator('.drawer-wrap').click({ position: { x: 5, y: 5 } }).catch(() => {});
await p.waitForTimeout(400);

// ── задание учёбы без срока на «Дне» не появляется
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  update(s => { s.study.tasks.forEach(t => { t.due = ''; }); });
});
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
ok('без срока на «Дне» ничего не появляется', !/Сроки/i.test(await p.locator('.scr').innerText()));

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
