import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);

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
for (const r of ['day','plans','spheres','food','habits','tracker','health','inside/chat','inside/tests','inside/diary','me','settings']) {
  await p.evaluate(x => { location.hash = '#/' + x; }, r);
  await p.waitForTimeout(400);
  const len = (await p.locator('.scr').innerText()).length;
  console.log((r + ':').padEnd(16), len > 25 ? 'ok · ' + (await p.locator('.scr').innerText()).split('\n')[0].slice(0, 30) : 'ПУСТО');
}
// плитка «Питание» ведёт на новый экран
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(400);
await p.locator('.tile', { hasText: 'Питание' }).click(); await p.waitForTimeout(500);
console.log('плитка Питание →', p.url().split('#')[1], '| заголовок:', await p.locator('.title').first().innerText());
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
