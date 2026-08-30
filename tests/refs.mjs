// Счёт, которому нечего уточнять, не предлагается: цель на несуществующий
// модуль или пилюлю считалась бы вечным нулём.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off'; s.lessons = []; s.habits = [];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);

let x = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return { edu: m.sourcesOf('edu').map(s2 => s2.key), able: m.countableFor('month').map(s2 => s2.key) };
});
ok('без курсов «пройти модуль» не предлагают', !x.edu.includes('courseModule'), x.edu.join(', '));
ok('и «пройти курс» тоже', !x.edu.includes('courseAll'), x.edu.join(', '));
ok('без привычек счёт привычки не предлагают', !x.able.includes('habit'), x.able.filter(k => k === 'habit').join(''));
ok('счёт без уточнения остаётся', x.able.includes('workouts'), x.able.includes('workouts') ? '' : x.able.join(', '));

await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.lessons = [{ id: 'c1', name: 'Курс', kind: 'course', perMonth: 4, log: {}, items: [{ id: 'm1', title: 'Модуль', done: false, lessons: [] }] }];
  s.habits = [{ id: 'h1', name: 'Вода', target: 1, step: 1, unit: '', link: '', log: {}, createdAt: '2026-08-01' }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
x = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return { edu: m.sourcesOf('edu').map(s2 => s2.key), able: m.countableFor('month').map(s2 => s2.key) };
});
ok('появился курс — появились и счёты', x.edu.includes('courseModule') && x.edu.includes('courseAll'), x.edu.join(', '));
ok('появилась привычка — появился её счёт', x.able.includes('habit'));

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
