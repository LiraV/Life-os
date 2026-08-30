// Норма воды — одно число с «Питанием», и менять его можно из привычки.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.habits = [{ id: 'hw', name: 'Вода', target: 1000, step: 250, unit: 'мл', link: 'water', log: {}, waterMoved: true, createdAt: '2026-08-01' }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/habits'; }); await p.waitForTimeout(700);

// ── 1. расхождение названо вслух
ok('пока считает «Питание» — 2000', /норма 2000 мл/.test(await p.locator('.scr').innerText()),
  (await p.locator('.scr').innerText()).match(/норма.{0,10}/)?.[0]);
const openHabit = async () => { await p.locator('[data-act="edit"][data-id="hw"], [data-act="edit"]').first().click(); await p.waitForTimeout(450); };
await openHabit();
let sheet = await p.locator('.sheet').innerText();
ok('в форме есть поле нормы воды', await p.locator('.sheet input[name="target"]').count() === 1);
ok('поле показывает норму «Питания»', await p.inputValue('.sheet input[name="target"]') === '2000',
  await p.inputValue('.sheet input[name="target"]'));
ok('о прежней норме сказано прямо', /была своя норма 1000/.test(sheet), (sheet.match(/Раньше.{0,80}/) || [''])[0]);
ok('сказано, что число общее с «Питанием»', /изменишь здесь, изменится и там/.test(sheet));

// ── 2. правка пишется в «Питание»
await p.fill('.sheet input[name="target"]', '1000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
let s2 = await st();
ok('норма воды в «Питании» стала 1000', s2.food.targets.water === 1000, String(s2.food.targets.water));
ok('в ритме тоже 1000', /норма 1000 мл/.test(await p.locator('.scr').innerText()));
await p.evaluate(() => { location.hash = '#/food'; }); await p.waitForTimeout(700);
ok('и в «Питании» видно 1000', /1000/.test(await p.locator('.scr').innerText()));

// ── 3. снятие связи возвращает свою норму, а не чужую
await p.evaluate(() => { location.hash = '#/habits'; }); await p.waitForTimeout(700);
await openHabit();
await p.locator('.sheet input[name="water"]').uncheck();
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
s2 = await st();
ok('своя норма привычки не затёрлась', s2.habits[0].target === 1000, String(s2.habits[0].target));
ok('норма «Питания» осталась своей', s2.food.targets.water === 1000, String(s2.food.targets.water));

// ── 4. новая привычка с водой сразу задаёт норму
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.habits = []; s.food.targets.water = 2000;
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/habits'; }); await p.waitForTimeout(700);
await p.locator('[data-act="add"]').first().click(); await p.waitForTimeout(450);
await p.fill('.sheet input[name="name"]', 'Вода');
await p.locator('.sheet input[name="water"]').check();
await p.fill('.sheet input[name="target"]', '1500');
await p.fill('.sheet input[name="step"]', '250');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s2 = await st();
ok('новая водная привычка задала норму «Питания»', s2.food.targets.water === 1500, String(s2.food.targets.water));
ok('и в ритме видно её', /норма 1500 мл/.test(await p.locator('.scr').innerText()));

// ── 5. обычной привычке ничего не сломали
await p.locator('[data-act="add"]').first().click(); await p.waitForTimeout(450);
await p.fill('.sheet input[name="name"]', 'Таблетки');
await p.fill('.sheet input[name="target"]', '3');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s2 = await st();
ok('обычная привычка держит свою норму', s2.habits.find(x => x.name === 'Таблетки')?.target === 3);
ok('и норму воды не тронула', s2.food.targets.water === 1500, String(s2.food.targets.water));

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
