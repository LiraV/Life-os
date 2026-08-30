// Механики своей сферы: полка, коллекция, доска, замеры.
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
const today = await p.evaluate(async () => (await import('./app/js/dates.js')).todayISO());

// делаем сферу из каждой заготовки
const make = async (tpl, name) => {
  await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(600);
  await p.locator('[data-act="newsphere"]').click(); await p.waitForTimeout(500);
  await p.locator(`[data-act="tpl"][data-v="${tpl}"]`).click(); await p.waitForTimeout(600);
  await p.fill('input[name="name"]', name);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
  return (await st()).customSpheres.find(x => x.name === name).key;
};

await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(600);
await p.locator('[data-act="newsphere"]').click(); await p.waitForTimeout(500);
const tpls = await p.locator('.sheet').innerText();
ok('заготовок стало семь', (await p.locator('[data-act="tpl"]').count()) === 7);
ok('среди них полка, коллекция, доска, замеры',
   /Полка/.test(tpls) && /Коллекция/.test(tpls) && /Доска/.test(tpls) && /Дневник числа/.test(tpls));
await p.locator('[data-sheet="close"]').click(); await p.waitForTimeout(400);

// ── ПОЛКА
const kShelf = await make('shelf', 'Сериалы');
ok('полка нарисовалась четырьмя статусами', (await p.locator('.scr').innerText()).match(/ХОЧУ|В ПРОЦЕССЕ|СДЕЛАНО|ОТЛОЖЕНО/gi)?.length === 4);
await p.locator('[data-act="shelfadd"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="title"]', 'Твин Пикс');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
ok('запись легла в «хочу»', (await st()).spheres[kShelf].shelf[0].status === 'want');
await p.locator('[data-act="shelfedit"]').first().click(); await p.waitForTimeout(500);
await p.locator('.opts[data-name="status"] .opt[data-value="done"]').click(); await p.waitForTimeout(200);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
const shelfItem = (await st()).spheres[kShelf].shelf[0];
ok('дата окончания проставилась сама', shelfItem.status === 'done' && shelfItem.finished === today);

// ── КОЛЛЕКЦИЯ
const kColl = await make('coll', 'Пластинки');
await p.locator('[data-act="colladd"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="name"]', 'Kind of Blue');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
const collScr = await p.locator('.scr').innerText();
ok('коллекция считает за жизнь и за год', /1/.test(collScr) && /за всё время/.test(collScr));
ok('у записи есть дата', (await st()).spheres[kColl].coll[0].date === today);

// ── ДОСКА
const kBoard = await make('board', 'Ремонт');
await p.locator('[data-act="boardadd"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="title"]', 'Покрасить стены');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
ok('дело встало в «не начато»', (await st()).spheres[kBoard].board[0].stage === 'todo');
await p.locator('[data-act="boardmove"]').first().click(); await p.waitForTimeout(500);
ok('тап двигает в «в работе»', (await st()).spheres[kBoard].board[0].stage === 'doing');
await p.locator('[data-act="boardmove"]').first().click(); await p.waitForTimeout(500);
const done = (await st()).spheres[kBoard].board[0];
ok('и в «готово», с датой перехода', done.stage === 'done' && done.stageAt === today);
await p.locator('[data-act="boardmove"]').first().click(); await p.waitForTimeout(500);
ok('с последней стадии возвращает в начало', (await st()).spheres[kBoard].board[0].stage === 'todo');

// ── ЗАМЕРЫ
const kMeas = await make('meas', 'Настроение');
const measScr = await p.locator('.scr').innerText();
ok('пустые замеры говорят «точка отсчёта»', /точка отсчёта/.test(measScr));
await p.locator('[data-act="measadd"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="value"]', '6');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
ok('рекорд не считается, пока не сказано куда «лучше»', /не задано/.test(await p.locator('.scr').innerText()));
await p.locator('[data-act="sphereedit"]').click(); await p.waitForTimeout(500);
ok('поле «куда лучше» появилось у замеров', await p.locator('.opts[data-name="dir"]').count() === 1);
await p.locator('.opts[data-name="dir"] .opt[data-value="up"]').click(); await p.waitForTimeout(200);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
await p.evaluate(async ([k]) => {
  const { update, uid } = await import('./app/js/store.js');
  const { addDays, todayISO } = await import('./app/js/dates.js');
  update(s => { s.spheres[k].meas.push({ id: uid(), date: addDays(todayISO(), -3), value: 9, note: '' }); });
}, [kMeas]);
await p.waitForTimeout(500);
const rec = await p.evaluate(async k => (await import('./app/js/selectors.js')).measRecord(k), kMeas);
ok(`лучшее считается по направлению (${rec?.value})`, rec && rec.value === 9);

// ── трекер: строка на каждую считающую механику
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(900);
const tr = await p.locator('.scr').innerText();
ok('в трекере есть все четыре сферы', ['Сериалы', 'Пластинки', 'Ремонт', 'Настроение'].every(n => tr.includes(n)));

// ── цели: у каждой механики свой источник
for (const [key, kind] of [[kShelf, 'sphereShelf'], [kColl, 'sphereColl'], [kBoard, 'sphereBoard']]) {
  await p.evaluate(k => { location.hash = '#/spheres/' + k; }, key); await p.waitForTimeout(700);
  await p.locator('[data-act="spheregoal"]').click(); await p.waitForTimeout(500);
  await p.fill('input[name="target"]', '3');
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
  const g = (await st()).goals.find(x => x.src?.ref === key);
  ok(`цель для «${kind}» завелась`, g?.src?.kind === kind);
}
const counts = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return m.liveGoals().map(g => ({ kind: g.src.kind, cur: m.counterOf(g).current }));
});
ok('полка засчитала закрытое', counts.find(x => x.kind === 'sphereShelf').cur === 1);
ok('коллекция засчитала собранное', counts.find(x => x.kind === 'sphereColl').cur === 1);
ok('доска не засчитала вернувшееся в начало', counts.find(x => x.kind === 'sphereBoard').cur === 0);

// ── роли: без роли сфера в круг не лезет, с ролью — считается
const before = await p.evaluate(async () => (await import('./app/js/selectors.js'))
  .roles().flatMap(r => r.parts.map(x => x.label)));
ok('сфера без роли круг не трогает', !before.includes('закрыто') && !before.includes('собрано'));

await p.evaluate(async ([shelf, coll, meas]) => {
  const { update } = await import('./app/js/store.js');
  update(s => { s.roleOf[shelf] = 'reader'; s.roleOf[coll] = 'keeper'; s.roleOf[meas] = 'healer'; });
}, [kShelf, kColl, kMeas]);
await p.waitForTimeout(400);
const after = await p.evaluate(async () => (await import('./app/js/selectors.js'))
  .roles().flatMap(r => r.parts.map(x => x.label)));
ok('привязанная сфера приносит свои следы',
   ['закрыто', 'собрано', 'замеры'].every(l => after.includes(l)));

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
