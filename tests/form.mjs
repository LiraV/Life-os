// Связка тела, еды и спорта: общий период и норма белка от веса.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
await ctx.addInitScript(([d0, d20, d40, d3, d5]) => {
  if (localStorage.getItem('seeded') === '1') return;
  localStorage.setItem('seeded', '1');
  const food = {};
  [d3, d5, d0].forEach(d => { food[d] = { water: 2000, entries: [{ id: 'e' + d, title: 'День', kcal: 1800, prot: 90, fat: 60, carb: 200 }] }; });
  localStorage.setItem('lifeos.state', JSON.stringify({
    v: 27, onboarded: true, user: { name: 'Л', traits: [], xp: 0 },
    health: { days: {}, symptoms: [], measures: [
      { id: 'm1', date: d40, weight: 64, waist: 72, hips: 96 },
      { id: 'm2', date: d20, weight: 63.4, waist: 71, hips: 95 },
      { id: 'm3', date: d0, weight: 62.8, waist: 70, hips: 95 },
    ] },
    food: { targets: { kcal: 2000, prot: 90, fat: 70, carb: 220, water: 2000 }, days: food },
    sport: {
      exercises: [], templates: [], tags: [{ id: 'T1', name: 'Пресс' }, { id: 'T2', name: 'Зал с тренером' }],
      workouts: [
        { id: 'w1', date: d3, title: 'Зал', done: true, tags: ['T1', 'T2'], sets: [] },
        { id: 'w2', date: d5, title: 'Дом', done: true, tags: ['T1'], sets: [] },
        { id: 'w3', date: d0, title: 'План', done: false, tags: ['T1'], sets: [] },
      ],
    },
    ui: { tips: 'off' },
  }));
}, [iso(0), iso(-20), iso(-40), iso(-3), iso(-5)]);
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(800);

await p.evaluate(() => { location.hash = '#/health'; }); await p.waitForTimeout(700);
console.log('1) вкладки «Тела»:', (await p.locator('.pills .pill').allInnerTexts()).slice(0, 2).join(' | '));
await p.locator('.pill', { hasText: 'Форма' }).click(); await p.waitForTimeout(700);
const cards = await p.locator('.card').allInnerTexts();
console.log('2) тело:', cards.find(c => c.startsWith('ТЕЛО'))?.replace(/\n+/g, ' | '));
console.log('3) еда:', cards.find(c => c.startsWith('ЕДА'))?.replace(/\n+/g, ' | '));
console.log('4) спорт:', cards.find(c => c.startsWith('СПОРТ'))?.replace(/\n+/g, ' | '));
console.log('5) оговорка:', cards[cards.length - 1].replace(/\n+/g, ' ').slice(0, 80));

// 90 дней захватывает более ранний замер
await p.locator('.pill', { hasText: '90 дней' }).click(); await p.waitForTimeout(700);
console.log('6) за 90 дней:', (await p.locator('.card', { hasText: 'ТЕЛО' }).innerText()).replace(/\n+/g, ' | '));

// норма белка от веса
await p.evaluate(() => { location.hash = '#/food'; }); await p.waitForTimeout(700);
await p.locator('[data-act="goals"]').click(); await p.waitForTimeout(500);
console.log('7) подсказка в нормах:', (await p.locator('.sheet-body').innerText()).split('\n').filter(x => /вес|Вес|взять/i.test(x)).join(' | '));
await p.locator('[data-act="fromweight"]').click(); await p.waitForTimeout(700);
const st = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
console.log('   норма белка стала:', st.food.targets.prot, '(вес 62.8 → 1,2–1,6 г/кг)');
console.log('ошибки:', errs.length ? errs : 'нет');
await p.evaluate(() => { location.hash = '#/health'; }); await p.waitForTimeout(700);
await p.screenshot({ path: 'form.png' });
await b.close();
