// v17 → v18: у подходов появилась своя отметка. Прошлые результаты
// отмеченных тренировок обязаны остаться в рекордах.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await ctx.addInitScript(() => {
  if (localStorage.getItem('seeded') === '1') return;
  localStorage.setItem('seeded', '1');
  localStorage.setItem('lifeos.state', JSON.stringify({
    v: 17, onboarded: true, user: { name: 'Л', traits: [], xp: 0 },
    sport: {
      exercises: [{ id: 'X1', name: 'Турник', unit: 'раз', dir: 'up' }],
      templates: [{ id: 'T1', name: 'Зал', sets: [{ id: 'S0', exerciseId: 'X1', value: 5, reps: 3 }] }],
      workouts: [
        { id: 'W1', date: '2026-08-01', title: 'Сделанная', done: true, sets: [{ id: 'S1', exerciseId: 'X1', value: 9, reps: 3 }] },
        { id: 'W2', date: '2026-08-20', title: 'Только план', done: false, sets: [{ id: 'S2', exerciseId: 'X1', value: 99, reps: 3 }] },
      ],
    },
  }));
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(1300);

// Предложение про подсказки в тестах не участвует. Гасим его через состояние,
// а не кликом: так не ждём анимацию шторки и не зависим от её появления.
await p.evaluate(async () => {
  try {
    const { update } = await import('./app/js/store.js');
    const { closeSheet } = await import('./app/js/ui.js');
    update(s => { s.ui.tips = 'off'; });
    closeSheet();
    // Сохранение в приложении отложенное, а тесты правят хранилище сразу —
    // поэтому дублируем запись, чтобы отказ не потерялся при перезагрузке.
    const raw = localStorage.getItem('lifeos.state');
    if (raw) {
      const cur = JSON.parse(raw);
      (cur.ui ||= {}).tips = 'off';
      localStorage.setItem('lifeos.state', JSON.stringify(cur));
    }
  } catch { /* страница без приложения — гасить нечего */ }
});
const s = await p.evaluate(async () => (await import('./app/js/store.js')).S);
const done = s.sport.workouts.find(w => w.id === 'W1').sets[0].done;
const plan = s.sport.workouts.find(w => w.id === 'W2').sets[0].done;
console.log(done === true ? '  ✓ подход сделанной тренировки отмечен' : '  ✗ подход сделанной тренировки отмечен');
console.log(plan === false ? '  ✓ подход плановой тренировки не отмечен' : '  ✗ подход плановой тренировки не отмечен');

await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(600);
await p.locator('[data-act="tab"][data-v="ex"]').click(); await p.waitForTimeout(500);
const card = (await p.locator('.card', { hasText: 'Турник' }).innerText()).replace(/\n+/g, ' | ');
console.log(/рекорд 9/.test(card) ? '  ✓ прошлый рекорд на месте: 9' : '  ✗ прошлый рекорд потерян: ' + card);
console.log(/99/.test(card) ? '  ✗ план попал в рекорды' : '  ✓ план в рекорды не попал');
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
