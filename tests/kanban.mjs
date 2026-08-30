// Доска работы: колонки, карточка, чек-листы, фильтры, перенос, широкая раскладка.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const errs = []; let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}`); };

const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.evaluate(async () => {
  const { update, uid, blankSched } = await import('./app/js/store.js');
  const { closeSheet } = await import('./app/js/ui.js');
  update(s => {
    s.ui.tips = 'off';
    s.work.jobs.push({ id: 'j1', company: 'Okkam', title: 'Специалист', kind: 'job', start: '2025-09-01',
      end: '', salary: 30000, note: '', sched: blankSched(), officeNorm: 0, vacationDays: 28 });
  });
  closeSheet();
  const raw = localStorage.getItem('lifeos.state');
  if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
});
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.evaluate(() => { location.hash = '#/work'; }); await p.waitForTimeout(600);
await p.locator('[data-act="tab"][data-v="board"]').click(); await p.waitForTimeout(700);

// ── колонки и зоны
const cols = await p.locator('.kb-col').count();
ok(`девятнадцать колонок (${cols})`, cols === 19);
ok('три зоны', await p.locator('.kb-zone').count() === 3);
const board = await p.locator('.kb').innerText();
ok('этапы МП на месте', /Расчёт МП/i.test(board) && /МП у фронтов/i.test(board));
ok('этапы РК на месте', /Модерация/i.test(board) && /Финальная статистика/i.test(board));
ok('прочие задачи внизу', /Сделать/i.test(board) && /Готово/i.test(board));
ok('на телефоне фильтры одной кнопкой', await p.locator('[data-act="fsheet"]').isVisible());

// ── карточка со всеми полями
await p.locator('[data-act="cardadd"][data-col="rk-check"]').click(); await p.waitForTimeout(600);
const sheet = await p.locator('.sheet').innerText();
ok('тип подставился по колонке', await p.locator('.opts[data-name="type"] .opt.on').innerText() === 'РК');
ok('поля канбана на месте',
   /Код запроса/.test(sheet) && /Сплит/.test(sheet) && /Бюджет/.test(sheet) && /Дедлайн/.test(sheet));
ok('и «когда делаю» отдельно от дедлайна', /Когда делаю/.test(sheet));
ok('площадки выбираются', await p.locator('.pf-opt').count() === 7);
await p.fill('input[name="title"]', 'РК: баннеры в приложении Лавки');
await p.locator('.pf-opt', { hasText: 'УЭ · Лавка' }).click(); await p.waitForTimeout(300);
await p.fill('input[name="request"]', 'LAVKA-SEP');
await p.fill('input[name="budget"]', '900 000 ₽');

// чек-лист этапа
await p.locator('[data-act="cltpl"]').click(); await p.waitForTimeout(500);
const clCount = await p.locator('.cl-item').count();
ok(`чек-лист этапа подставился (${clCount} пунктов)`, clCount === 5);
await p.locator('[data-act="cltpl"]').click(); await p.waitForTimeout(400);
ok('повторно не двоится', await p.locator('.cl-item').count() === 5);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);

let s = await st();
const card = s.work.tasks[0];
ok('карточка сохранилась в своей колонке', card.column === 'rk-check' && card.type === 'РК');
ok('площадка записалась', card.platforms.includes('ue-lavka'));
ok('чек-лист сохранился', card.checklist.length === 5);
ok('код запроса и бюджет на месте', card.request === 'LAVKA-SEP' && card.budget === '900 000 ₽');

// ── карточка видна в своей колонке
const inCol = await p.locator('.kb-col[data-col="rk-check"] .kb-card').count();
ok('карточка в колонке «Проверка заявки»', inCol === 1);
ok('на карточке видны площадка и чек-лист',
   /Лавка/.test(await p.locator('.kb-card').innerText()) && /0\/5/.test(await p.locator('.kb-card').innerText()));

// ── перенос с телефона добавляет чек-лист следующего этапа
await p.locator('[data-act="cardmove"]').click(); await p.waitForTimeout(600);
await p.locator('[data-act="to"][data-v="rk-setup"]').click(); await p.waitForTimeout(800);
s = await st();
ok('карточка переехала в «Заведение РК»', s.work.tasks[0].column === 'rk-setup');
ok(`чек-лист этапа добавился сам (${s.work.tasks[0].checklist.length})`, s.work.tasks[0].checklist.length === 12);

// ── фильтры
await p.locator('[data-act="fsheet"]').click(); await p.waitForTimeout(500);
await p.locator('.opts[data-name="type"] .opt[data-value="МП"]').click(); await p.waitForTimeout(200);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
ok('фильтр по типу спрятал карточку РК', await p.locator('.kb-card').count() === 0);
await p.locator(".kb-filters-sm [data-act=\"freset\"]").click(); await p.waitForTimeout(600);
ok('сброс вернул её', await p.locator('.kb-card').count() === 1);

// ── импорт выгрузки из канбана
const imported = await p.evaluate(async () => {
  const { update, uid } = await import('./app/js/store.js');
  const { KCOLUMNS, KTYPES } = await import('./app/js/kanban.js');
  const { todayISO } = await import('./app/js/dates.js');
  const cards = [
    { id: 'x1', column: 'mp-calc', type: 'МП', title: 'МП: промо доставки', platforms: ['wb'],
      month: '2026-10', deadline: '2026-09-10', request: '', budget: '2 000 000 ₽', split: '',
      urgent: true, links: '', notes: 'из выгрузки', checklist: [{ id: 'c', text: 'Просчитать', done: true }] },
    { id: 'x2', column: 'done', type: 'РК', title: 'РК: спецразмещение', platforms: [], month: '2026-08',
      deadline: '', request: '', budget: '', split: '', urgent: false, links: '', notes: '', checklist: [] },
  ];
  const have = new Set([]);
  update(s2 => {
    cards.forEach(c => s2.work.tasks.push({
      id: uid(), jobId: 'j1', column: c.column, type: c.type, title: c.title,
      platforms: c.platforms, month: c.month, day: '', deadline: c.deadline, request: c.request,
      budget: c.budget, split: c.split, urgent: c.urgent, links: c.links, notes: c.notes,
      checklist: c.checklist.map(i => ({ id: uid(), text: i.text, done: i.done })), movedAt: todayISO(),
    }));
  });
  return cards.length;
});
await p.waitForTimeout(500);
ok('карточки из выгрузки легли по колонкам', (await st()).work.tasks.length === 3);
const mp = await p.locator('.kb-col[data-col="mp-calc"] .kb-card').innerText();
ok('срочность и месяц видны на карточке', /срочно/.test(mp) && /окт/.test(mp));
ok('дедлайн показан на карточке', /📅/.test(mp));
const dl = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const d = await import('./app/js/dates.js');
  const t = d.todayISO();
  return {
    over: m.deadlineInfo(d.addDays(t, -2))?.cls,
    today: m.deadlineInfo(t)?.cls,
    soon: m.deadlineInfo(d.addDays(t, 2))?.cls,
    far: m.deadlineInfo(d.addDays(t, 20))?.cls,
    none: m.deadlineInfo(''),
  };
});
ok('просроченный дедлайн подсвечен', dl.over === 'dl-over');
ok('сегодняшний — своим цветом', dl.today === 'dl-today');
ok('близкий — тоже', dl.soon === 'dl-soon');
ok('далёкий не кричит', dl.far === '');
ok('без дедлайна ничего не рисуется', dl.none === null);

// ── «когда делаю» связывает с днём, дедлайн — нет
await p.locator('.kb-col[data-col="mp-calc"] .kb-title').click(); await p.waitForTimeout(600);
const today = await p.evaluate(async () => (await import('./app/js/dates.js')).todayISO());
await p.fill('input[name="day"]', today);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
await p.locator('[data-act="tab"][data-v="now"]').click(); await p.waitForTimeout(700);
const now = await p.locator('.scr').innerText();
ok('задача с днём работы попала в «На сегодня»', /На сегодня/i.test(now) && /промо доставки/.test(now));
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
ok('но на «Дне» её по-прежнему нет', !/промо доставки/.test(await p.locator('.scr').innerText()));

// ── закрытая колонка не просится на день
await p.evaluate(() => { location.hash = '#/work'; }); await p.waitForTimeout(600);
const cnt = await p.evaluate(async () => (await import('./app/js/selectors.js')).workTodayCount());
ok('завершённая карточка в счёт не идёт', cnt === 1);
await b.close();

// ── ноутбук: широкая раскладка и перетаскивание
const wide = await (await chromium.launch()).newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
await wide.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const w = await wide.newPage();
w.on('pageerror', e => errs.push(e.message));
await w.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await w.waitForTimeout(600);
await w.getByText('пропустить онбординг').click(); await w.waitForTimeout(400);
await w.evaluate(async () => {
  const { update, uid, blankSched } = await import('./app/js/store.js');
  const { closeSheet } = await import('./app/js/ui.js');
  const { todayISO } = await import('./app/js/dates.js');
  update(s => {
    s.ui.tips = 'off'; s.ui.workTab = 'board';
    s.work.jobs.push({ id: 'j1', company: 'Okkam', title: '', kind: 'job', start: '2025-09-01', end: '',
      salary: 0, note: '', sched: blankSched(), officeNorm: 0, vacationDays: 28 });
    s.work.tasks.push({ id: 'k1', jobId: 'j1', column: 'l1', type: 'МП', title: 'Тестовая карточка',
      platforms: [], month: '', day: '', deadline: '', request: '', budget: '', split: '',
      urgent: false, links: '', notes: '', checklist: [], movedAt: todayISO() });
  });
  closeSheet();
});
await w.evaluate(() => { location.hash = '#/work'; }); await w.waitForTimeout(800);
ok('на ноутбуке приложение раскрывается во всю ширину',
   await w.evaluate(() => document.getElementById('app').classList.contains('wide')));
const appW = await w.evaluate(() => document.getElementById('app').offsetWidth);
ok(`ширина больше телефонной (${appW}px)`, appW > 900);
ok('фильтры показаны полосой', await w.locator('.kb-filters').isVisible());
ok('заголовки групп видны', await w.locator('.kb-group').first().isVisible());
await w.evaluate(() => { location.hash = '#/day'; }); await w.waitForTimeout(600);
ok('на других экранах рамка возвращается',
   !(await w.evaluate(() => document.getElementById('app').classList.contains('wide'))));

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
process.exit(bad || errs.length ? 1 : 0);
