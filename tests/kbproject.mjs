// Задачи-зонтики на доске работы. «Лавка Осенняя 2026» — это не одна карточка:
// внутри неё несколько РК, по площадкам и месяцам, и у каждой свой статус.
// Раньше карточка была и задачей, и позицией сразу, и развести статусы было
// негде — приходилось заводить их вручную и одинаково называть.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const tasks = async () => (await st()).work.tasks;

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off'; s.ui.workTab = 'board';
  s.work.jobs = [{ id: 'j1', name: 'Студия', company: 'Студия', start: '2026-01-01', norm: 8, days: [1, 2, 3, 4, 5] }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
});
await p.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, null, { timeout: 20000 });
await p.evaluate(() => { location.hash = '#/work/board'; });
await p.waitForFunction(() => document.querySelector('.kb-cols'), null, { timeout: 20000 });
await p.waitForTimeout(400);

// ── заводим задачу ──────────────────────────────────────────────
await p.locator(".kb-filters-sm [data-act=\"projects\"]").click(); await p.waitForTimeout(600);
ok('шторка задач открылась', /Задачи/.test(await p.locator('.sheet').innerText()));
await p.fill('.sheet [data-field="pnew"]', 'Лавка Осенняя 2026');
await p.locator('.sheet [data-act="padd"]').click(); await p.waitForTimeout(700);
ok('задача завелась', (await st()).work.projects.some(x => x.name === 'Лавка Осенняя 2026'),
  JSON.stringify((await st()).work.projects.map(x => x.name)));
ok('и сразу открылась', /Лавка Осенняя 2026/.test(await p.locator('.sheet').innerText()));

// ── раскладываем на площадки и месяцы ───────────────────────────
await p.locator('.sheet [data-act="pspread"]').click(); await p.waitForTimeout(600);
ok('разбор открылся', /Разложить задачу/.test(await p.locator('.sheet').innerText()));
await p.locator('.sheet [data-act="sp"][data-v="ue-lavka"]').click(); await p.waitForTimeout(400);
await p.locator('.sheet [data-act="sp"][data-v="ozon"]').click(); await p.waitForTimeout(400);
const months = await p.locator('.sheet [data-act="sm"]').all();
await months[1].click(); await p.waitForTimeout(400);
let sheet = await p.locator('.sheet').innerText();
ok('показал, что получится, до создания', /Получится 4 карточки/.test(sheet), (sheet.match(/Получится[^\n]*/) || [''])[0]);
ok('и перечислил их поимённо', /◆ Лавка Осенняя 2026/.test(sheet) && /УЭ · Лавка · сен/.test(sheet));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);

let list = await tasks();
ok('завелись четыре карточки', list.length === 4, String(list.length));
ok('все под одной задачей', list.every(c => c.projectId) && new Set(list.map(c => c.projectId)).size === 1);
ok('у каждой своя площадка и свой месяц',
  new Set(list.map(c => `${c.platforms[0]}|${c.month}`)).size === 4,
  list.map(c => `${c.platforms[0]}|${c.month}`).join(', '));
ok('и чек-лист этапа подставился', list.every(c => c.checklist.length > 0), String(list[0].checklist.length));

// ── статусы у них разные ────────────────────────────────────────
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.work.tasks[0].column = 'rk-mod';
  s.work.tasks[1].column = 'rk-live';
  s.work.tasks[2].column = 'done';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
});
await p.waitForFunction(() => document.querySelector('.kb-cols'), null, { timeout: 20000 });
await p.waitForTimeout(500);
const board = await p.locator('#scr').innerText();
ok('на доске видно имя задачи', /Лавка Осенняя 2026/.test(board));
ok('карточки стоят в разных колонках', await p.evaluate(() => {
  const cols = [...document.querySelectorAll('.kb-col')].filter(c => c.querySelector('.kb-card'));
  return cols.length >= 3;
}));

// ── свод по задаче показывает, где кто ──────────────────────────
await p.locator(".kb-filters-sm [data-act=\"projects\"]").click(); await p.waitForTimeout(600);
await p.locator('.sheet [data-act="open"]').first().click(); await p.waitForTimeout(700);
sheet = await p.locator('.sheet').innerText();
ok('свод считает закрытые', /4 карточки · 1 закрыто/.test(sheet), (sheet.split('\n')[1] || ''));
ok('и показывает, где стоят остальные', /Модерация/.test(sheet) && /Запущена/.test(sheet), sheet.slice(0, 200).replace(/\n/g, ' · '));

// ── креативы живут внутри карточки со своим состоянием ──────────
await p.locator('.sheet [data-act="pcard"]').first().click(); await p.waitForTimeout(700);
await p.fill('.sheet [data-field="crnew"]', 'Баннер 1080×1080');
await p.locator('.sheet [data-act="cradd"]').click(); await p.waitForTimeout(400);
await p.fill('.sheet [data-field="crnew"]', 'Баннер 300×250');
await p.locator('.sheet [data-act="cradd"]').click(); await p.waitForTimeout(400);
sheet = await p.locator('.sheet').innerText();
ok('креативы добавились', /Баннер 1080/.test(sheet) && /Баннер 300/.test(sheet));
// Тап двигает состояние по кругу: в работе → на модерации → отклонён → принят.
await p.locator('.sheet [data-act="crmove"]').first().click(); await p.waitForTimeout(300);
await p.locator('.sheet [data-act="crmove"]').first().click(); await p.waitForTimeout(300);
sheet = await p.locator('.sheet').innerText();
ok('состояние креатива двигается тапом', /Отклонён/.test(sheet), (sheet.match(/(В работе|На модерации|Отклонён|Принят)/g) || []).join(', '));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
list = await tasks();
const withCr = list.find(c => (c.creatives || []).length);
ok('креативы сохранились с состоянием', withCr && withCr.creatives.length === 2
  && withCr.creatives[0].state === 'bad', JSON.stringify(withCr?.creatives));
ok('и на карточке виден их счёт', /🖼 0\/2/.test(await p.locator('#scr').innerText()),
  (await p.locator('#scr').innerText()).match(/🖼[^\n]*/)?.[0] || 'нет');

// ── фильтр по задаче ────────────────────────────────────────────
await p.evaluate(async () => {
  const { update } = await import('/app/js/store.js');
  const { S } = await import('/app/js/store.js');
  update(s => { s.work.tasks.push({ id: 'other', jobId: 'j1', projectId: '', column: 'ot-todo', type: 'Прочее',
    title: 'Чужая задача', platforms: [], month: '', day: '', deadline: '', request: '', budget: '', split: '',
    urgent: false, links: '', notes: '', checklist: [], creatives: [], movedAt: '' }); });
});
await p.waitForTimeout(400);
ok('чужая карточка на доске видна', /Чужая задача/.test(await p.locator('#scr').innerText()));
await p.evaluate(async () => {
  const { update, S } = await import('/app/js/store.js');
  update(s => { s.ui.wboard.project = S.work.projects[0].id; });
});
await p.waitForTimeout(500);
const filtered = await p.locator('#scr').innerText();
ok('фильтр по задаче убирает чужое', !/Чужая задача/.test(filtered));
ok('а своё оставляет', /Лавка Осенняя 2026/.test(filtered));

// ── убрать задачу — карточки остаются ───────────────────────────
await p.evaluate(async () => {
  const { update, S } = await import('/app/js/store.js');
  const id = S.work.projects[0].id;
  update(s => {
    s.ui.wboard.project = '';
    s.work.projects = s.work.projects.filter(x => x.id !== id);
    s.work.tasks.forEach(c => { if (c.projectId === id) c.projectId = ''; });
  });
});
await p.waitForTimeout(500);
list = await tasks();
ok('карточки пережили удаление задачи', list.length === 5, String(list.length));
ok('и просто перестали быть её частью', list.every(c => !c.projectId));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ задача собирает свои кампании');
process.exit(bad ? 1 : 0);
