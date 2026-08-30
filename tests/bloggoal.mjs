// Цели блога: посты, подписчики, прирост и просмотры.
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
const open = async () => { await p.evaluate(() => { location.hash = '#/spheres/blog'; }); await p.waitForTimeout(650); };
const y = new Date().getFullYear();
const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(days => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.blog.posts = [
    { id: 'p1', title: 'Раз', place: 'ig', stage: 'out', day: days[3], link: '', views: 800, format: '', rubrics: [], blocks: [], seed: '', note: '', movedAt: '' },
    { id: 'p2', title: 'Два', place: 'tg', stage: 'out', day: days[2], link: '', views: 1200, format: '', rubrics: [], blocks: [], seed: '', note: '', movedAt: '' },
    { id: 'p3', title: 'Три', place: 'both', stage: 'out', day: days[1], link: '', views: 300, format: '', rubrics: [], blocks: [], seed: '', note: '', movedAt: '' },
  ];
  s.blog.subs = [
    { id: 's1', date: days[5], ig: 1000, tg: 200 },
    { id: 's2', date: days[1], ig: 1100, tg: null },
  ];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
}, [iso(0), iso(1), iso(2), iso(3), iso(4), iso(40)]);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);

// ── 1. счёт в селекторах
const calc = await p.evaluate(async yy => {
  const m = await import('./app/js/selectors.js');
  const R = { from: `${yy}-01-01`, to: `${yy}-12-31` };
  return {
    subsAll: m.subsNow(''), subsIg: m.subsNow('ig'), subsTg: m.subsNow('tg'),
    views: m.viewsSum(R.from, R.to), viewsIg: m.viewsSum(R.from, R.to, 'ig'),
    rec: m.viewsRecordValue(), gain: m.subsGain('', R.from, R.to), gainIg: m.subsGain('ig', R.from, R.to),
    srcs: m.sourcesOf('blog').map(s2 => s2.key),
  };
}, y);
console.log(' ', JSON.stringify(calc));
ok('подписчики суммой по последним отметкам каждой площадки', calc.subsAll === 1300, String(calc.subsAll));
ok('незаполненный телеграм не обнулил себя', calc.subsTg === 200, String(calc.subsTg));
ok('просмотры суммируются', calc.views === 2300, String(calc.views));
ok('по площадке считаются свои', calc.viewsIg === 1100, String(calc.viewsIg));
ok('рекорд — лучший пост', calc.rec === 1200, String(calc.rec));
ok('прирост инстаграма 100', calc.gainIg === 100, String(calc.gainIg));
ok('в блоге четыре новых счёта', ['posts', 'subs', 'subsGain', 'views', 'viewsTop'].every(k => calc.srcs.includes(k)), calc.srcs.join(', '));

// ── 2. шторка: уточнение и сроки идут за выбранным счётом
await open();
await p.locator('[data-act="spheregoal"]').first().click(); await p.waitForTimeout(500);
ok('в списке есть подписчики и просмотры',
  /Подписчиков всего/.test(await p.locator('.sheet').innerText()) && /Просмотров/.test(await p.locator('.sheet').innerText()));
ok('у постов есть месяц и квартал', await p.locator('.sheet .opts[data-name="horizon"] .opt').count() === 3,
  String(await p.locator('.sheet .opts[data-name="horizon"] .opt').count()));
ok('уточнение у постов — площадки', /Инстаграм/.test(await p.locator('.sheet select[name="ref"]').innerText()));

await p.selectOption('.sheet select[name="kind"]', 'subs'); await p.waitForTimeout(350);
// Срок у «сколько сейчас» есть, но значит он «когда хочу дойти», а не окно счёта.
ok('у «сколько сейчас» срок выбирается', await p.locator('.sheet .opts[data-name="horizon"] .opt').count() === 3,
  String(await p.locator('.sheet .opts[data-name="horizon"] .opt').count()));
ok('и объяснено, что счёт за всё время', /Это счёт за всё время/.test(await p.locator('.sheet').innerText()));

await p.selectOption('.sheet select[name="kind"]', 'subsGain'); await p.waitForTimeout(350);
ok('у прироста сроки вернулись', await p.locator('.sheet .opts[data-name="horizon"] .opt').count() === 3);

// ── 3. цель по подписчикам
await p.selectOption('.sheet select[name="kind"]', 'subs'); await p.waitForTimeout(300);
await p.fill('.sheet input[name="target"]', '2000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
let g = (await st()).goals.slice(-1)[0];
ok('цель по подписчикам завелась', g.src.kind === 'subs' && g.target === 2000, JSON.stringify(g.src));
ok('название человеческое', /Подписчиков всего: 2000/.test(g.title), g.title);
ok('единица — подписчики', g.unit === 'подписчиков');
const cur = await p.evaluate(async gg => (await import('./app/js/selectors.js')).autoCount(gg), g);
ok('счёт берётся из отметок', cur === 1300, String(cur));

// ── 4. цель по просмотрам за месяц
await open();
await p.locator('[data-act="spheregoal"]').first().click(); await p.waitForTimeout(500);
await p.selectOption('.sheet select[name="kind"]', 'views'); await p.waitForTimeout(350);
await p.locator('.sheet .opts[data-name="horizon"] .opt[data-value="month"]').click(); await p.waitForTimeout(200);
await p.fill('.sheet input[name="target"]', '5000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
g = (await st()).goals.slice(-1)[0];
ok('цель по просмотрам за месяц', g.src.kind === 'views' && g.horizon === 'month', `${g.src.kind}/${g.horizon}`);
const cur2 = await p.evaluate(async gg => (await import('./app/js/selectors.js')).autoCount(gg), g);
ok('месяц считает свои просмотры', cur2 === 2300, String(cur2));

// ── 5. рекорд как цель
await open();
await p.locator('[data-act="spheregoal"]').first().click(); await p.waitForTimeout(500);
await p.selectOption('.sheet select[name="kind"]', 'viewsTop'); await p.waitForTimeout(350);
ok('у рекорда уточнения нет', await p.locator('.sheet select[name="ref"]').count() === 0);
await p.fill('.sheet input[name="target"]', '10000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
g = (await st()).goals.slice(-1)[0];
const cur3 = await p.evaluate(async gg => (await import('./app/js/selectors.js')).autoCount(gg), g);
ok('рекорд считается за всё время', cur3 === 1200, String(cur3));
ok('в подписи сказано «за всё время»', /за всё время/.test(await p.evaluate(async gg => (await import('./app/js/selectors.js')).autoLabel(gg), g)));

// ── 6. цели видны в сфере и не двоятся
await open();
const sc = await p.locator('.scr').innerText();
ok('цели показаны в сфере', /Подписчиков всего/.test(sc) && /Просмотров/.test(sc));
await p.locator('[data-act="spheregoal"]').first().click(); await p.waitForTimeout(500);
await p.selectOption('.sheet select[name="kind"]', 'subs'); await p.waitForTimeout(300);
await p.fill('.sheet input[name="target"]', '3000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
const same = (await st()).goals.filter(x => x.src?.kind === 'subs').length;
ok('вторая такая же цель не заводится', same === 1, String(same));

// ── 7. прирост без отметки до периода не выдумывается
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.blog.subs = [{ id: 'only', date: new Date().toISOString().slice(0, 10), ig: 500, tg: 100 }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
const gain0 = await p.evaluate(async yy => {
  const m = await import('./app/js/selectors.js');
  return m.subsGain('', `${yy}-01-01`, `${yy}-12-31`);
}, y);
ok('одна отметка — прирост 0, а не 600', gain0 === 0, String(gain0));

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
