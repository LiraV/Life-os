// Заготовки — пилюли, статьи, копилки — заводились со случайными именами на
// каждом устройстве, и первая же синхронизация показывала каждую дважды.
// Плюс время у тренировки.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
await p.waitForTimeout(800);

// ── имя заготовки одинаково везде ───────────────────────────────
let s = await st();
const press = s.sport.tags.find(t => t.name === 'Пресс');
ok('у заготовки имя не случайное, а выведенное из названия', /^s[a-z0-9]+$/.test(press.id), press.id);
ok('и статьи бюджета тоже', /^s[a-z0-9]+$/.test(s.budget.cats.expense[0].id), s.budget.cats.expense[0].id);

// ── два набора заготовок схлопываются, ссылки переезжают ────────
await p.evaluate(() => {
  const s2 = JSON.parse(localStorage.getItem('lifeos.state'));
  s2.sport.tags = [
    { id: 'phone-1', name: 'Пресс' }, { id: 'phone-2', name: 'Шпагат' }, { id: 'phone-3', name: 'Зал сама' },
    { id: 'lap-1', name: 'Пресс' }, { id: 'lap-2', name: 'Шпагат' },
  ];
  s2.sport.workouts = [
    { id: 'w1', date: '2026-08-30', done: true, tags: ['phone-1'], sets: [] },
    { id: 'w2', date: '2026-08-29', done: true, tags: ['lap-1', 'lap-2'], sets: [] },
  ];
  s2.tracker.tagValues = { 'lap-1': { '2026-08': 4 } };
  s2.budget.cats.expense = [{ id: 'a', name: 'Еда' }, { id: 'b', name: 'еда' }];
  s2.budget.ops = [{ id: 'o1', kind: 'expense', sum: 100, date: '2026-08-30', catId: 'b' }];
  localStorage.setItem('lifeos.state', JSON.stringify(s2));
  location.reload();
});
// Ждём именно записанного на диск: починка в памяти без записи оставила бы
// хранилище с беспорядком, и он уехал бы в облако.
await p.waitForFunction(() => JSON.parse(localStorage.getItem('lifeos.state')).sport.tags.length < 5,
  null, { timeout: 15000 }).catch(() => {});
s = await st();
ok('тёзки схлопнулись в одну пилюлю', s.sport.tags.filter(t => t.name === 'Пресс').length === 1,
  s.sport.tags.map(t => t.name).join(', '));
ok('своя пилюля не пострадала', s.sport.tags.some(t => t.name === 'Зал сама'));
const pressId = s.sport.tags.find(t => t.name === 'Пресс').id;
ok('тренировки переехали на оставшуюся', s.sport.workouts.every(w => !w.tags.includes('phone-1') && !w.tags.includes('lap-1'))
  && s.sport.workouts.some(w => w.tags.includes(pressId)), JSON.stringify(s.sport.workouts.map(w => w.tags)));
ok('значения трекера переехали тоже', Object.keys(s.tracker.tagValues).includes(pressId),
  Object.keys(s.tracker.tagValues).join(', '));
ok('статьи бюджета схлопнулись без учёта регистра', s.budget.cats.expense.length === 1, String(s.budget.cats.expense.length));
ok('операция не потеряла статью', s.budget.ops[0].catId === s.budget.cats.expense[0].id,
  `${s.budget.ops[0].catId} vs ${s.budget.cats.expense[0].id}`);

// ── время у тренировки ──────────────────────────────────────────
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(400);
await p.locator('[data-act="wadd"]').click(); await p.waitForTimeout(600);
ok('в тренировке есть поле времени', await p.locator('.sheet input[name="time"]').count() === 1);
await p.fill('.sheet input[name="title"]', 'Зал');
await p.fill('.sheet input[name="time"]', '19:30');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
ok('время сохранилось', s.sport.workouts.find(w => w.title === 'Зал')?.time === '19:30',
  s.sport.workouts.find(w => w.title === 'Зал')?.time);
ok('и видно в дне', /19:30/.test(await p.locator('#scr').innerText()));

// Тренировка без времени остаётся без него: час никто не выдумывает.
await p.locator('[data-act="wadd"]').click(); await p.waitForTimeout(500);
await p.fill('.sheet input[name="title"]', 'Без часа');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
ok('без времени час не выдумывается', s.sport.workouts.find(w => w.title === 'Без часа')?.time === '',
  JSON.stringify(s.sport.workouts.find(w => w.title === 'Без часа')?.time));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ заготовки не двоятся, у тренировки есть час');
process.exit(bad ? 1 : 0);
