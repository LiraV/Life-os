// Цель «пройти модуль» и «пройти курс» в обучении.
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

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.lessons = [{
    id: 'c1', name: 'Вёрстка с нуля', kind: 'course', perMonth: 4, step: 1, log: {}, cost: 0,
    items: [
      { id: 'm1', title: 'HTML', done: false, lessons: [
        { id: 's1', text: 'Теги', done: true }, { id: 's2', text: 'Формы', done: true },
        { id: 's3', text: 'Таблицы', done: false }, { id: 's4', text: 'Семантика', done: false }] },
      { id: 'm2', title: 'CSS', done: false, lessons: [] },
      { id: 'm3', title: 'Практика', done: true, lessons: [] },
    ],
  }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);

// ── 1. счёт напрямую
const calc = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const mod = m.SOURCES.courseModule, all = m.SOURCES.courseAll;
  return {
    keys: m.sourcesOf('edu').map(x => x.key),
    refs: mod.ref().map(x => x.label),
    html: mod.count('c1:m1'), css: mod.count('c1:m2'), prac: mod.count('c1:m3'),
    sHtml: mod.suggest('c1:m1'), sCss: mod.suggest('c1:m2'),
    course: all.count('c1'), sCourse: all.suggest('c1'),
    name: mod.refName('c1:m1'),
  };
});
console.log(' ', JSON.stringify(calc));
ok('в обучении появились оба счёта', ['courseModule', 'courseAll'].every(k => calc.keys.includes(k)), calc.keys.join(', '));
ok('в уточнении — курс и модуль', calc.refs[0] === 'Вёрстка с нуля · HTML', calc.refs.join(' | '));
ok('модуль с уроками считает уроки', calc.html === 2, String(calc.html));
ok('модуль без уроков — ноль или один', calc.css === 0 && calc.prac === 1, `${calc.css}/${calc.prac}`);
ok('подсказка «всего» у модуля с уроками — 4', calc.sHtml === 4, String(calc.sHtml));
ok('у модуля без уроков — 1', calc.sCss === 1, String(calc.sCss));
ok('курс считает пройденные модули', calc.course === 1, String(calc.course));
ok('и подсказка — число модулей', calc.sCourse === 3, String(calc.sCourse));
ok('подпись читается как курс · модуль', calc.name === 'Вёрстка с нуля · HTML', calc.name);

// ── 2. цель из сферы
await p.evaluate(() => { location.hash = '#/edu'; }); await p.waitForTimeout(700);
await p.locator('[data-act="spheregoal"]').first().click(); await p.waitForTimeout(500);
ok('в списке есть «Пройти модуль»', /Пройти модуль/.test(await p.locator('.sheet').innerText()));
await p.selectOption('.sheet select[name="kind"]', 'courseModule'); await p.waitForTimeout(400);
ok('уточнение — модули курса', /Вёрстка с нуля · HTML/.test(await p.locator('.sheet select[name="ref"]').innerText()));
ok('поле «сколько» подставилось от модуля', await p.inputValue('.sheet input[name="target"]') === '4',
  await p.inputValue('.sheet input[name="target"]'));
await p.selectOption('.sheet select[name="ref"]', 'c1:m2'); await p.waitForTimeout(400);
ok('на другом модуле подсказка сменилась', await p.inputValue('.sheet input[name="target"]') === '1',
  await p.inputValue('.sheet input[name="target"]'));
await p.selectOption('.sheet select[name="ref"]', 'c1:m1'); await p.waitForTimeout(400);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);

let s = await st();
let g = s.goals.slice(-1)[0];
ok('цель завелась на модуль', g.src.kind === 'courseModule' && g.src.ref === 'c1:m1', JSON.stringify(g.src));
ok('цель — 2 из 4', await p.evaluate(async gg => (await import('./app/js/selectors.js')).autoCount(gg), g) === 2
  && g.target === 4, `${g.target}`);
ok('в названии видно модуль', /Пройти модуль \(Вёрстка с нуля · HTML\)/.test(g.title), g.title);
ok('единица — уроки', g.unit === 'уроков');

// ── 3. отметка урока двигает цель
await p.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  x.lessons[0].items[0].lessons[2].done = true;
  localStorage.setItem('lifeos.state', JSON.stringify(x));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
const now = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const { S } = await import('./app/js/store.js');
  return m.autoCount(S.goals[S.goals.length - 1]);
});
ok('закрытый урок сразу в цели', now === 3, String(now));

// ── 4. цель ручными плюсами не правится
await p.evaluate(() => { location.hash = '#/plans'; }); await p.waitForTimeout(600);
await p.locator('.pill:text-is("Год")').first().click(); await p.waitForTimeout(600);
const scr = await p.locator('.scr').innerText();
ok('в планах видно, откуда число', /Пройти модуль · Вёрстка с нуля · HTML/.test(scr),
  (scr.match(/Считается само[\s\S]{0,60}/) || [''])[0].replace(/\n/g, ' · '));
ok('кнопок «+1» у неё нет', await p.locator('.cnt-row', { hasText: 'из 4' }).locator('[data-act="cnt"]').count() === 0);

// ── 5. курс целиком
await p.evaluate(() => { location.hash = '#/edu'; }); await p.waitForTimeout(700);
await p.locator('[data-act="spheregoal"]').first().click(); await p.waitForTimeout(500);
await p.selectOption('.sheet select[name="kind"]', 'courseAll'); await p.waitForTimeout(400);
ok('в уточнении курса только курсы', await p.locator('.sheet select[name="ref"]').innerText().then(t => !/·/.test(t)),
  await p.locator('.sheet select[name="ref"]').innerText());
ok('подсказка — три модуля', await p.inputValue('.sheet input[name="target"]') === '3',
  await p.inputValue('.sheet input[name="target"]'));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
g = s.goals.slice(-1)[0];
ok('цель на курс завелась', g.src.kind === 'courseAll' && g.src.ref === 'c1', JSON.stringify(g.src));
ok('пройден один модуль из трёх', await p.evaluate(async gg => (await import('./app/js/selectors.js')).autoCount(gg), g) === 1);

// ── 6. вписанное руками подсказка не затирает
await p.evaluate(() => { location.hash = '#/edu'; }); await p.waitForTimeout(700);
await p.locator('[data-act="spheregoal"]').first().click(); await p.waitForTimeout(500);
await p.fill('.sheet input[name="target"]', '2'); await p.waitForTimeout(200);
await p.selectOption('.sheet select[name="kind"]', 'courseModule'); await p.waitForTimeout(400);
ok('своё число осталось', await p.inputValue('.sheet input[name="target"]') === '2',
  await p.inputValue('.sheet input[name="target"]'));

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
