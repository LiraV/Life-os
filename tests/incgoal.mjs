// Цель «заработать» — из операций дохода, целиком или по одной статье.
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
const ym = new Date().toISOString().slice(0, 7);
const y = ym.slice(0, 4);

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(m => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.budget.cats.income = [{ id: 'ci1', name: 'Зарплата' }, { id: 'ci2', name: 'Фриланс' }];
  s.budget.ops = [
    { id: 'o1', date: `${m}-03`, kind: 'income', catId: 'ci1', sum: 30000, note: '' },
    { id: 'o2', date: `${m}-10`, kind: 'income', catId: 'ci2', sum: 12000, note: '' },
    { id: 'o3', date: `${m}-12`, kind: 'expense', catId: '', sum: 5000, note: '' },
    { id: 'o4', date: `${m.slice(0, 4) - 1}-05-01`, kind: 'income', catId: 'ci1', sum: 99000, note: '' },
  ];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
}, ym);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);

// ── счёт
const calc = await p.evaluate(async ([yy, mm]) => {
  const cats = JSON.parse(localStorage.getItem('lifeos.state')).budget.cats.income;
  const catId = name => (cats.find(c => c.name === name) || {}).id;
  const m = await import('./app/js/selectors.js');
  const R = h => m.periodRange(h, h === 'month' ? mm : yy);
  return {
    all: m.SOURCES.income.count('', R('month')),
    // Имена статей ищем по названию: у заготовок они выводятся из названия
    // и одинаковы на всех устройствах, а не вписаны в тест.
    salary: m.SOURCES.income.count(catId('Зарплата'), R('month')),
    free: m.SOURCES.income.count(catId('Фриланс'), R('month')),
    year: m.SOURCES.income.count('', R('year')),
    srcs: m.sourcesOf('money').map(x => x.key),
    refs: m.SOURCES.income.ref().map(x => x.label),
  };
}, [y, ym]);
console.log(' ', JSON.stringify(calc));
ok('доход за месяц суммируется', calc.all === 42000, String(calc.all));
ok('расход в доход не попал', calc.all === 42000 && calc.year === 42000, String(calc.year));
ok('по статье считается своё', calc.salary === 30000 && calc.free === 12000, `${calc.salary}/${calc.free}`);
ok('прошлый год в этот не затесался', calc.year === 42000);
ok('в бюджете два счёта', calc.srcs.join(',') === 'income,vault', calc.srcs.join(','));
ok('в уточнении есть «все статьи» и обе статьи', calc.refs.join(', ') === 'все статьи, Зарплата, Фриланс', calc.refs.join(', '));

// ── шторка
await p.evaluate(() => { location.hash = '#/spheres/money'; }); await p.waitForTimeout(700);
await p.locator('[data-act="spheregoal"]').first().click(); await p.waitForTimeout(500);
let sheet = await p.locator('.sheet').innerText();
ok('в списке есть «Заработано»', /Заработано/.test(sheet));
ok('уточнение — статьи дохода', /Зарплата/.test(await p.locator('.sheet select[name="ref"]').innerText()));
ok('сроки все три', await p.locator('.sheet .opts[data-name="horizon"] .opt').count() === 3);

await p.selectOption('.sheet select[name="ref"]', 'ci1'); await p.waitForTimeout(200);
await p.locator('.sheet .opts[data-name="horizon"] .opt[data-value="month"]').click(); await p.waitForTimeout(200);
await p.fill('.sheet input[name="target"]', '40000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);

const g = (await st()).goals.slice(-1)[0];
ok('цель завелась с нужным источником', g.src.kind === 'income' && g.src.ref === 'ci1', JSON.stringify(g.src));
ok('единица — рубли', g.unit === '₽');
ok('в названии видно статью', /Заработано \(Зарплата\)/.test(g.title), g.title);
const cur = await p.evaluate(async gg => (await import('./app/js/selectors.js')).autoCount(gg), g);
ok('набранное считается из операций', cur === 30000, String(cur));
const label = await p.evaluate(async gg => (await import('./app/js/selectors.js')).autoLabel(gg), g);
ok('подпись говорит, откуда число', /Заработано · Зарплата/.test(label), label);

// новая операция сразу двигает цель
await p.evaluate(m => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.budget.ops.push({ id: 'o5', date: `${m}-20`, kind: 'income', catId: 'ci1', sum: 5000, note: '' });
  localStorage.setItem('lifeos.state', JSON.stringify(s));
}, ym);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
const cur2 = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const { S } = await import('./app/js/store.js');
  return m.autoCount(S.goals[S.goals.length - 1]);
});
ok('новая операция сразу учтена', cur2 === 35000, String(cur2));

// ── копилка не сломалась
await p.evaluate(() => { location.hash = '#/spheres/money'; }); await p.waitForTimeout(700);
await p.locator('[data-act="spheregoal"]').first().click(); await p.waitForTimeout(500);
await p.selectOption('.sheet select[name="kind"]', 'vault'); await p.waitForTimeout(350);
ok('у копилки своё уточнение', !/Зарплата/.test(await p.locator('.sheet select[name="ref"]').innerText().catch(() => '')),
  await p.locator('.sheet select[name="ref"]').innerText().catch(() => 'нет копилок'));

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
