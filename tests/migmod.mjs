// Прежние уроки курса становятся модулями без уроков — отметки и прогресс целы.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await ctx.addInitScript(() => {
  if (localStorage.getItem('seeded') === '1') return;
  localStorage.setItem('seeded', '1');
  localStorage.setItem('lifeos.state', JSON.stringify({
    v: 24, onboarded: true, user: { name: 'Л', traits: [], xp: 0 },
    lessons: [{
      id: 'L1', name: 'Итальянский', kind: 'course', perMonth: 0, cost: 0, log: {},
      items: [
        { id: 'I1', title: 'Урок 1', done: true },
        { id: 'I2', title: 'Урок 2', done: true },
        { id: 'I3', title: 'Урок 3', done: false },
        { id: 'I4', title: 'Урок 4', done: false },
      ],
    }],
    ui: { tips: 'off', openLesson: 'L1' },
  }));
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
const s = await p.evaluate(async () => (await import('./app/js/store.js')).S);
const m = s.lessons[0].items;
console.log('1) модулей:', m.length, '| отметки целы:', m.filter(x => x.done).length === 2);
console.log('   у каждого появился список уроков:', m.every(x => Array.isArray(x.lessons) && x.lessons.length === 0));
await p.evaluate(() => { location.hash = '#/edu'; }); await p.waitForTimeout(700);
const card = await p.locator('.card', { hasText: 'Итальянский' }).innerText();
console.log('2) прогресс не поехал:', card.match(/\d+%/)?.[0], '(было 2 из 4)');
console.log('   строки:', card.split('\n').filter(x => /Урок/.test(x)).join(' | '));
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
