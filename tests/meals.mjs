// День питания делится на приёмы; привычка считает приёмы, а не блюда.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
p.on('pageerror', e => errs.push(e.message));
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}`); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.evaluate(async () => {
  const { update, uid } = await import('./app/js/store.js');
  const { closeSheet } = await import('./app/js/ui.js');
  const { todayISO } = await import('./app/js/dates.js');
  update(s => {
    s.ui.tips = 'off';
    s.habits.push({ id: 'hm', name: 'Приёмы пищи', target: 3, step: 1, unit: 'раз',
      link: 'meals', log: {}, createdAt: todayISO() });
  });
  closeSheet();
  const raw = localStorage.getItem('lifeos.state');
  if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
});
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const today = await p.evaluate(async () => (await import('./app/js/dates.js')).todayISO());

// ── день делится на приёмы
await p.evaluate(() => { location.hash = '#/food'; }); await p.waitForTimeout(700);
const scr = await p.locator('.scr').innerText();
ok('день показывает четыре приёма',
   /ЗАВТРАК/i.test(scr) && /ОБЕД/i.test(scr) && /УЖИН/i.test(scr) && /ПЕРЕКУС/i.test(scr));
ok('у каждого своя кнопка добавления', await p.locator('[data-act="add"][data-m]').count() === 4);
ok('пока ничего не записано, так и сказано', /ничего не записано/.test(scr));

// ── блюдо добавляется внутрь приёма
await p.locator('[data-act="add"][data-m="lunch"]').click(); await p.waitForTimeout(600);
ok('приём подставился из раздела',
   (await p.locator('.opts[data-name="meal"] .opt.on').innerText()) === 'Обед');
await p.fill('input[name="title"]', 'Борщ');
await p.fill('input[name="kcal"]', '400');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
let s = await st();
ok('блюдо записалось в обед', s.food.days[today].entries[0].meal === 'lunch');
const lunch = await p.locator('.card').filter({ hasText: 'ОБЕД' }).innerText();
ok('оно видно в карточке обеда и сумма посчитана', /Борщ/.test(lunch) && /400 ккал/.test(lunch));

// второе блюдо в тот же приём
await p.locator('[data-act="add"][data-m="lunch"]').click(); await p.waitForTimeout(600);
await p.fill('input[name="title"]', 'Хлеб');
await p.fill('input[name="kcal"]', '100');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
const lunch2 = await p.locator('.card').filter({ hasText: 'ОБЕД' }).innerText();
ok('два блюда в одном приёме складываются', /500 ккал/.test(lunch2));

// ── привычка считает приёмы, а не блюда
const cnt = () => p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const d = await import('./app/js/dates.js');
  const hb = m.liveHabits().find(x => x.link === 'meals');
  return { n: m.habitCount(hb, d.todayISO()), target: m.habitTarget(hb), unit: m.habitUnit(hb) };
});
let c = await cnt();
ok(`два блюда в одном приёме — это один приём (${c.n})`, c.n === 1);
ok('норма своя, а не из питания', c.target === 3 && c.unit === 'раз');

await p.locator('[data-act="add"][data-m="breakfast"]').click(); await p.waitForTimeout(600);
await p.fill('input[name="title"]', 'Овсянка');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
c = await cnt();
ok(`завтрак добавил второй приём (${c.n})`, c.n === 2);

// ── такую привычку нельзя отметить руками
await p.evaluate(() => { location.hash = '#/habits'; }); await p.waitForTimeout(700);
await p.locator(`[data-act="tick"][data-id="hm"][data-d="${today}"]`).click(); await p.waitForTimeout(700);
ok('тап по привычке ведёт в «Питание»', (await p.evaluate(() => location.hash)).includes('food'));
ok('и число не подскочило', (await cnt()).n === 2);
ok('в журнал привычки ничего не записалось', !Object.keys((await st()).habits[0].log || {}).length);

// ── старые блюда без приёма не выдуманы
await p.evaluate(async t => {
  const { update, uid } = await import('./app/js/store.js');
  update(s => { s.food.days[t].entries.push({ id: uid(), title: 'Старая запись', meal: '', kcal: 50, prot: 0, fat: 0, carb: 0, time: '', source: 'manual' }); });
}, today);
await p.evaluate(() => { location.hash = '#/food'; }); await p.waitForTimeout(700);
const loose = await p.locator('.scr').innerText();
ok('блюдо без приёма лежит отдельно', /БЕЗ ПРИЁМА/i.test(loose) && /Старая запись/.test(loose));
ok('и приёмом его не считают', (await cnt()).n === 2);

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
