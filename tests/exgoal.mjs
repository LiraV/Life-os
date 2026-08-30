// Цели-рекорды в спорте: планка, подтягивание, сантиметры до шпагата.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(days => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.sport.exercises = [
    { id: 'ex1', name: 'Планка', unit: 'сек', dir: 'up' },
    { id: 'ex2', name: 'Подтягивания', unit: 'раз', dir: 'up' },
    { id: 'ex3', name: 'Шпагат', unit: 'см', dir: 'down' },
  ];
  s.sport.workouts = [
    { id: 'w1', date: days[2], title: 'Раз', done: true, sets: [
      { id: 's1', exerciseId: 'ex1', value: 70, reps: 1, done: true },
      { id: 's2', exerciseId: 'ex3', value: 20, reps: 1, done: true }], tags: [], note: '' },
    { id: 'w2', date: days[1], title: 'Два', done: true, sets: [
      { id: 's3', exerciseId: 'ex1', value: 95, reps: 1, done: true },
      { id: 's4', exerciseId: 'ex3', value: 12, reps: 1, done: true }], tags: [], note: '' },
    { id: 'w3', date: days[0], title: 'Не отмечена', done: false, sets: [
      { id: 's5', exerciseId: 'ex1', value: 999, reps: 1, done: true }], tags: [], note: '' },
  ];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
}, [iso(0), iso(1), iso(5)]);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);

// ── источник и его свойства
const info = await p.evaluate(async () => {
  const exs = JSON.parse(localStorage.getItem('lifeos.state')).sport.exercises;
  const exId = name => (exs.find(e => e.name === name) || {}).id;
  const m = await import('./app/js/selectors.js');
  const src = m.SOURCES.exercise;
  return {
    keys: m.sourcesOf('sport').map(x => x.key),
    refs: src.ref().map(x => x.label),
    // У заготовок имя выводится из названия, поэтому ищем по названию.
    unitPlank: src.unitOf(exId('Планка')), unitSplit: src.unitOf(exId('Шпагат')),
    dirPlank: src.dirOf(exId('Планка')), dirSplit: src.dirOf(exId('Шпагат')),
    bestPlank: src.count(exId('Планка'), null, '', null), bestSplit: src.count(exId('Шпагат'), null, '', null),
  };
});
console.log(' ', JSON.stringify(info));
ok('в спорте появился счёт рекордов', info.keys.includes('exercise'), info.keys.join(', '));
ok('в уточнении — упражнения', info.refs.join(', ') === 'Планка, Подтягивания, Шпагат', info.refs.join(', '));
ok('единица берётся у упражнения', info.unitPlank === 'сек' && info.unitSplit === 'см');
ok('направление тоже', info.dirPlank === 'up' && info.dirSplit === 'down');
ok('рекорд планки — 95, а не 999 из неотмеченной', info.bestPlank === 95, String(info.bestPlank));
ok('у шпагата лучшее — меньшее', info.bestSplit === 12, String(info.bestSplit));

// ── цель «вверх»: планка на 180 секунд
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(700);
await p.locator('[data-act="spheregoal"]').first().click(); await p.waitForTimeout(500);
ok('счёт есть в списке', /Рекорд в упражнении/.test(await p.locator('.sheet').innerText()));
await p.selectOption('.sheet select[name="kind"]', 'exercise'); await p.waitForTimeout(350);
ok('уточнение — упражнения', /Планка/.test(await p.locator('.sheet select[name="ref"]').innerText()));
// Срок у рекорда есть: он значит не окно счёта, а когда хочется дойти.
ok('срок у рекорда можно выбрать', await p.locator('.sheet .opts[data-name="horizon"] .opt').count() === 3,
  String(await p.locator('.sheet .opts[data-name="horizon"] .opt').count()));
ok('и объяснено, что рекорд не обнуляется', /рекорд не обнуляется в начале срока/.test(await p.locator('.sheet').innerText()));
// Имя заготовки выводится из названия, поэтому выбираем по подписи.
await p.selectOption('.sheet select[name="ref"]', { label: 'Планка' }); await p.waitForTimeout(200);
await p.fill('.sheet input[name="target"]', '180');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);

let g = (await st()).goals.slice(-1)[0];
ok('цель завелась на упражнение', g.src.kind === 'exercise' && g.src.ref === (await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).sport.exercises.find(e => e.name === 'Планка').id)), JSON.stringify(g.src));
ok('единица цели — секунды', g.unit === 'сек', g.unit);
ok('точки отсчёта у цели «вверх» нет', g.src.from === undefined);
let pr = await p.evaluate(async gg => {
  const m = await import('./app/js/selectors.js');
  return { cur: m.autoCount(gg), pct: m.goalProgress(gg) };
}, g);
ok('набрано 95 из 180', pr.cur === 95 && pr.pct === 53, JSON.stringify(pr));

// ── цель «вниз»: шпагат до нуля
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(600);
await p.locator('[data-act="spheregoal"]').first().click(); await p.waitForTimeout(500);
await p.selectOption('.sheet select[name="kind"]', 'exercise'); await p.waitForTimeout(350);
await p.selectOption('.sheet select[name="ref"]', { label: 'Шпагат' }); await p.waitForTimeout(200);
await p.locator('.sheet .opts[data-name="horizon"] .opt[data-value="quarter"]').click(); await p.waitForTimeout(200);
await p.fill('.sheet input[name="target"]', '0');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
g = (await st()).goals.slice(-1)[0];
const splitId = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).sport.exercises.find(e => e.name === 'Шпагат').id);
ok('цель с нулём завелась', g && g.src.ref === splitId && g.target === 0, JSON.stringify(g?.src) + ' target=' + g?.target);
ok('и встала на квартал', g.horizon === 'quarter' && /^\d{4}-Q\d$/.test(g.period), `${g.horizon} · ${g.period}`);
ok('точка отсчёта записана', g.src.from === 12, String(g.src.from));
ok('единица — сантиметры', g.unit === 'см');
pr = await p.evaluate(async gg => {
  const m = await import('./app/js/selectors.js');
  return { cur: m.autoCount(gg), pct: m.goalProgress(gg), counter: m.isCounter(gg), down: m.goalDown(gg) };
}, g);
ok('цель с нулём считается счётчиком', pr.counter && pr.down, JSON.stringify(pr));
ok('сейчас 12 см, пути пройдено 0 %', pr.cur === 12 && pr.pct === 0, JSON.stringify(pr));

// новый результат двигает цель «вниз»
await p.evaluate(d => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  // Имя упражнения-заготовки выведено из названия при переезде, поэтому
  // новую отметку вешаем на то, что лежит сейчас, а не на прежнее имя.
  const ex = s.sport.exercises.find(e => e.name === 'Шпагат').id;
  s.sport.workouts.push({ id: 'w4', date: d, title: 'Три', done: true, sets: [
    { id: 's6', exerciseId: ex, value: 3, reps: 1, done: true }], tags: [], note: '' });
  localStorage.setItem('lifeos.state', JSON.stringify(s));
}, iso(0));
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
pr = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const { S } = await import('./app/js/store.js');
  const gg = S.goals[S.goals.length - 1];
  return { cur: m.autoCount(gg), pct: m.goalProgress(gg) };
});
ok('стало 3 см — пройдено 75 %', pr.cur === 3 && pr.pct === 75, JSON.stringify(pr));

// достижение цели
await p.evaluate(d => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  const ex = s.sport.exercises.find(e => e.name === 'Шпагат').id;
  s.sport.workouts.push({ id: 'w5', date: d, title: 'Четыре', done: true, sets: [
    { id: 's7', exerciseId: ex, value: 0, reps: 1, done: true }], tags: [], note: '' });
  localStorage.setItem('lifeos.state', JSON.stringify(s));
}, iso(0));
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
const done = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const { S } = await import('./app/js/store.js');
  return m.goalProgress(S.goals[S.goals.length - 1]);
});
ok('ноль — цель взята, 100 %', done === 100, String(done));

// ── как это выглядит в «Планах»
await p.evaluate(() => { location.hash = '#/plans/year'; }); await p.waitForTimeout(800);
const scr = await p.locator('.scr').innerText();
ok('цель «вниз» читается как «сейчас · цель»', /цель 0/.test(scr), (scr.match(/.{0,40}цель 0.{0,20}/) || [''])[0]);
ok('и не как «0 из 0»', !/0 из 0/.test(scr));
ok('цель «вверх» читается как «из»', /95 из 180 сек/.test(scr), (scr.match(/95.{0,20}/) || [''])[0]);

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
