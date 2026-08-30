// Тёзок в каталогах быть не должно. А в журналах — можно и нужно.
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
  const { update } = await import('./app/js/store.js');
  const { closeSheet } = await import('./app/js/ui.js');
  update(s => { s.ui.tips = 'off'; }); closeSheet();
  const raw = localStorage.getItem('lifeos.state');
  if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
});
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

// ── сравнение имён: регистр, пробелы и «ё» не создают новую сущность
const norm = await p.evaluate(async () => {
  const { nameTaken } = await import('./app/js/store.js');
  const list = [{ id: '1', name: 'Приёмы пищи' }];
  return {
    same: !!nameTaken(list, 'приемы   пищи'),
    trimmed: !!nameTaken(list, '  Приёмы пищи '),
    other: !!nameTaken(list, 'Приёмы воды'),
    self: !!nameTaken(list, 'Приёмы пищи', '1'),
    empty: !!nameTaken(list, '   '),
  };
});
ok('регистр, лишние пробелы и «ё» — то же имя', norm.same && norm.trimmed);
ok('другое имя тёзкой не считается', !norm.other);
ok('сама себя запись не блокирует', !norm.self);
ok('пустое имя проверку не трогает', !norm.empty);

// ── привычка
await p.evaluate(() => { location.hash = '#/habits'; }); await p.waitForTimeout(700);
const addHabit = async name => {
  await p.locator('[data-act="add"]').first().click(); await p.waitForTimeout(500);
  await p.fill('input[name="name"]', name);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
};
await addHabit('Вода');
ok('привычка завелась', (await st()).habits.length === 1);
await addHabit('  вода  ');
ok('тёзка привычки не завелась', (await st()).habits.length === 1);
ok('и сказано почему', /уже есть в ритме/.test(await p.locator('.toast').innerText().catch(() => '')));
await p.locator('[data-sheet="close"]').click().catch(() => {}); await p.waitForTimeout(400);
await addHabit('Таблетки');
ok('другое имя проходит', (await st()).habits.length === 2);

// ── правка себя не блокируется
await p.locator('[data-act="edit"]').first().click(); await p.waitForTimeout(500);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
ok('сохранить привычку под своим же именем можно', (await st()).habits.length === 2);

// ── каталоги: сфера, место работы, книга, дело заботы
const cases = [
  ['своя сфера', async () => {
    await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(600);
    await p.locator('[data-act="newsphere"]').click(); await p.waitForTimeout(500);
    await p.locator('[data-act="tpl"][data-v="blank"]').click(); await p.waitForTimeout(500);
    await p.fill('input[name="name"]', 'Спорт');
    await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
    return (await st()).customSpheres.length === 0;
  }],
  ['книга', async () => {
    await p.evaluate(async () => {
      const { update, uid } = await import('./app/js/store.js');
      update(s => { s.library.books.push({ id: uid(), title: 'Хребты безумия', status: 'want', pages: 0, page: 0, rating: 0 }); });
      location.hash = '#/library';
    });
    await p.waitForTimeout(700);
    await p.locator('[data-act="add"]').first().click(); await p.waitForTimeout(500);
    await p.fill('input[name="title"]', 'хребты БЕЗУМИЯ');
    await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
    return (await st()).library.books.length === 1;
  }],
];
for (const [name, run] of cases) {
  ok(`тёзка не заводится: ${name}`, await run());
  await p.locator('[data-sheet="close"]').click().catch(() => {}); await p.waitForTimeout(400);
}

// ── правка своей сущности под своим же именем: у сфер опознание по key
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(600);
await p.locator('[data-act="newsphere"]').click(); await p.waitForTimeout(500);
await p.locator('[data-act="tpl"][data-v="practice"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="name"]', 'Музыка');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
ok('своя сфера завелась', (await st()).customSpheres.length === 1);
await p.locator('[data-act="sphereedit"]').click(); await p.waitForTimeout(600);
await p.fill('input[name="mech"]', 'практика');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
ok('её можно сохранить под тем же именем',
   (await st()).customSpheres[0].mech === 'практика');
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(600);
await p.locator('[data-act="newsphere"]').click(); await p.waitForTimeout(500);
await p.locator('[data-act="tpl"][data-v="blank"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="name"]', 'музыка');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
ok('а вторая с тем же именем не заводится', (await st()).customSpheres.length === 1);
await p.locator('[data-sheet="close"]').click().catch(() => {}); await p.waitForTimeout(400);

// ── журналы: повторы законны
await p.evaluate(async () => {
  const { update, uid } = await import('./app/js/store.js');
  const { todayISO } = await import('./app/js/dates.js');
  update(s => {
    const t = todayISO();
    s.quests[t] = [
      { id: uid(), title: 'Прогулка', done: false, sphere: '', minutes: 45, time: '', boss: false },
      { id: uid(), title: 'Прогулка', done: false, sphere: '', minutes: 45, time: '', boss: false },
    ];
    (s.food.days[t] ||= { water: 0, entries: [] }).entries.push(
      { id: uid(), meal: 'breakfast', title: 'Овсянка', kcal: 300, prot: 0, fat: 0, carb: 0, time: '', source: 'manual' },
      { id: uid(), meal: 'dinner', title: 'Овсянка', kcal: 300, prot: 0, fat: 0, carb: 0, time: '', source: 'manual' });
  });
});
await p.waitForTimeout(500);
const s2 = await st();
const t2 = await p.evaluate(async () => (await import('./app/js/dates.js')).todayISO());
ok('два одинаковых квеста в дне — законно', s2.quests[t2].length === 2);
ok('одно блюдо на завтрак и на ужин — законно', s2.food.days[t2].entries.length === 2);

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
