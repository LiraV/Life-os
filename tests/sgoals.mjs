// Цели из сфер: счёт ведёт приложение, решение остаётся за человеком.
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
const year = await p.evaluate(async () => String((await import('./app/js/dates.js')).yearOf((await import('./app/js/dates.js')).todayISO())));

// ── библиотека: цель «прочитать 3 книги за год»
await p.evaluate(() => { location.hash = '#/library'; }); await p.waitForTimeout(700);
ok('на «Библиотеке» есть кнопка цели', await p.locator('[data-act="spheregoal"]').count() === 1);
await p.locator('[data-act="spheregoal"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="target"]', '3');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
let s = await st();
const g = s.goals[0];
ok('цель завелась с источником', g && g.src?.kind === 'books' && g.target === 3);
ok('название человеческое', /Прочитано книг: 3 за /.test(g.title));
ok('единица подставилась сама', g.unit === 'книг');
ok('в состоянии не хранится набранное', g.current === 0);

const cur = () => p.evaluate(async () => {
  const { counterOf, liveGoals, goalProgress } = await import('./app/js/selectors.js');
  const g = liveGoals()[0];
  return { ...counterOf(g), pct: goalProgress(g) };
});
ok('пока книг нет — счётчик ноль', (await cur()).current === 0);

// дочитываем две книги
await p.evaluate(async y => {
  const { update, uid } = await import('./app/js/store.js');
  update(s => {
    s.library.books.push({ id: uid(), title: 'Раз', status: 'done', finished: `${y}-03-04`, pages: 200, page: 200, rating: 4 });
    s.library.books.push({ id: uid(), title: 'Два', status: 'done', finished: `${y}-05-11`, pages: 150, page: 150, rating: 5 });
    s.library.books.push({ id: uid(), title: 'Три', status: 'done', finished: '2019-01-01', pages: 100, page: 100, rating: 3 });
  });
}, year);
const c2 = await cur();
ok(`две книги этого года засчитались, прошлогодняя нет (${c2.current})`, c2.current === 2);
ok('счётчик помечен автоматическим', c2.auto === true);
ok('прогресс посчитался сам (67%)', c2.pct === 67);

// ── в планах у такой цели нет ручных кнопок
await p.evaluate(() => { location.hash = '#/plans'; }); await p.waitForTimeout(800);
const plans = await p.locator('.scr').innerText();
ok('в планах видно, что считается само', /Считается само/.test(plans));
ok('кнопок ручного счёта у неё нет', await p.locator('[data-act="cnt"]').count() === 0);

// ── страны: месяц не предлагается, потому что у поездки только год
await p.evaluate(() => { location.hash = '#/trips'; }); await p.waitForTimeout(700);
await p.locator('[data-act="spheregoal"]').click(); await p.waitForTimeout(500);
const sheet = await p.locator('.sheet').innerText();
ok('у стран срок не предлагается на выбор', await p.locator('[data-act="opt"][data-value="month"]').count() === 0);
ok('и это объяснено', /другого отрезка у этих данных нет/.test(sheet));
await p.fill('input[name="target"]', '4');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
await p.evaluate(async y => {
  const { update, uid } = await import('./app/js/store.js');
  update(s => {
    s.travel.visits.push({ id: uid(), code: 'IT', year: Number(y), note: '' });
    s.travel.visits.push({ id: uid(), code: 'GE', year: Number(y), note: '' });
    s.travel.visits.push({ id: uid(), code: 'IT', year: Number(y), note: 'ещё раз' });
  });
}, year);
const trips = await p.evaluate(async () => {
  const { counterOf, liveGoals } = await import('./app/js/selectors.js');
  return counterOf(liveGoals().find(g => g.src?.kind === 'countriesYear'));
});
ok(`две страны, а не три поездки (${trips.current})`, trips.current === 2);

// ── повтор той же цели не заводится
await p.evaluate(() => { location.hash = '#/trips'; }); await p.waitForTimeout(700);
await p.locator('[data-act="spheregoal"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="target"]', '9');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
ok('вторая такая же цель не завелась', s.goals.filter(x => x.src?.kind === 'countriesYear').length === 1);

// ── спорт: пилюля требует уточнения «что именно»
// Пилюли в приложении уже засеяны — берём настоящую, а не заводим двойника.
const tagId = await p.evaluate(async () => (await import('./app/js/selectors.js')).sportTags()[0].id);
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(700);
await p.locator('[data-act="spheregoal"]').click(); await p.waitForTimeout(500);
// Уточнение принадлежит выбранному счёту: у «всех тренировок» его нет и быть
// не должно, а у пилюли появляется сразу после выбора.
ok('у «всех тренировок» выбора пилюли нет', await p.locator('select[name="ref"]').count() === 0);
await p.locator('select[name="kind"]').selectOption('tag'); await p.waitForTimeout(350);
ok('у пилюли выбор появился', await p.locator('select[name="ref"]').count() === 1);
await p.fill('input[name="target"]', '10');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
await p.evaluate(async ([y, tg]) => {
  const { update, uid } = await import('./app/js/store.js');
  update(s => {
    s.sport.workouts.push({ id: uid(), date: `${y}-04-02`, title: 'A', done: true, tags: [tg], sets: [] });
    s.sport.workouts.push({ id: uid(), date: `${y}-04-05`, title: 'B', done: true, tags: [], sets: [] });
    s.sport.workouts.push({ id: uid(), date: `${y}-04-06`, title: 'C', done: false, tags: [tg], sets: [] });
  });
}, [year, tagId]);
const tag = await p.evaluate(async () => {
  const { counterOf, liveGoals, autoLabel } = await import('./app/js/selectors.js');
  const g = liveGoals().find(x => x.src?.kind === 'tag');
  return { ...counterOf(g), label: autoLabel(g), title: g.title };
});
ok(`по пилюле засчиталась только отмеченная тренировка (${tag.current})`, tag.current === 1);
const tagName = await p.evaluate(async () => (await import('./app/js/selectors.js')).sportTags()[0].name);
ok('подпись называет пилюлю', tag.label.includes(tagName) && tag.title.includes(tagName));

// ── ничего не появилось само
ok('целей ровно столько, сколько завели руками', (await st()).goals.length === 3);

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
