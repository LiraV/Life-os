// Старая заготовка «Растяжка» переименовывается в «Шпагат», свои названия целы.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await ctx.addInitScript(() => {
  if (localStorage.getItem('seeded') === '1') return;
  localStorage.setItem('seeded', '1');
  const t = new Date().toISOString().slice(0, 10);
  localStorage.setItem('lifeos.state', JSON.stringify({
    v: 24, onboarded: true, user: { name: 'Л', traits: [], xp: 0 },
    sport: {
      exercises: [], templates: [], workouts: [
        { id: 'W1', date: t, title: 'Утро', done: true, tags: ['T1', 'T9'], sets: [] },
      ],
      tags: [{ id: 'T1', name: 'Растяжка' }, { id: 'T9', name: 'Своя пилюля' }],
    },
    tracker: { rows: [], values: {}, habitValues: {}, lessonValues: {}, exerciseValues: {}, tagValues: {} },
    ui: { tips: 'off' },
  }));
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(900);
const s = await p.evaluate(async () => (await import('./app/js/store.js')).S);
console.log('1) пилюли:', s.sport.tags.map(t => t.name).join(', '));
console.log('   переименовалась:', s.sport.tags.find(t => t.id === 'T1').name === 'Шпагат');
console.log('   своя не тронута:', s.sport.tags.find(t => t.id === 'T9').name === 'Своя пилюля');
console.log('   тренировка держит те же пилюли:', JSON.stringify(s.sport.workouts[0].tags));
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(600);
console.log('2) в трекере:', (await p.locator('.tr tbody .tr-name').allInnerTexts()).join(' / '));
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
