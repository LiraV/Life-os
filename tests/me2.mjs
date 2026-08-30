import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(600);
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
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10); };
  s.energy = {};
  for (let i = 0; i < 60; i++) {
    const day = i % 28;
    let base = day < 5 ? 30 : day < 14 ? 70 : day < 18 ? 85 : 55;
    if (i % 3 === 0) base += 12;
    s.energy[iso(i)] = Math.max(5, Math.min(100, base + ((i * 7) % 9) - 4));
  }
  s.health.days = {};
  [0, 28, 56].forEach(off => { for (let k = 0; k < 5; k++) s.health.days[iso(off + k)] = true; });
  s.lessons = [{ id: 'l1', name: 'Вокал', kind: 'practice', perMonth: 4, step: 1, log: {}, items: [], cost: 0 }];
  for (let i = 0; i < 60; i += 3) s.lessons[0].log[iso(i)] = 1;
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(700);
console.log('потребности:', (await p.locator('.card', { hasText: 'ПОТРЕБНОСТИ' }).innerText()).replace(/\n/g, ' | '));
await p.evaluate(() => { const s = document.querySelector('#scr'); s.scrollTop = s.scrollHeight * 0.55; });
await p.waitForTimeout(300);
await p.screenshot({ path: 'energy-me.png' });
await b.close();
