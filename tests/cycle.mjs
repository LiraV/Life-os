import { chromium } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  viewport: { width: 400, height: 900 }, locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
await p.goto('http://127.0.0.1:8765/#/day', { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.getByText('пропустить онбординг').click();

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
await p.waitForTimeout(400);
await p.goto('http://127.0.0.1:8765/#/health', { waitUntil: 'load' });
await p.waitForTimeout(600);
const days = () => p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('lifeos.state')).health.days).sort());
const info = () => p.locator('.card').first().innerText().then(t => t.replace(/\n+/g, ' | '));

console.log('1) пусто:', await info());

// отметить прошлый месяц задним числом
await p.locator('[data-act="cprev"]').click(); await p.waitForTimeout(250);
const monthShown = await p.locator('.stepper .lab').innerText();
const cells = p.locator('.cal-d:not(.fut)');
for (const n of ['3','4','5','6','7']) { await p.locator('.cal-d', { hasText: new RegExp('^'+n+'$') }).first().click(); await p.waitForTimeout(120); }
console.log('2) отмечено в', monthShown + ':', (await days()).join(', '));

// вернуться и отметить текущий цикл через "+ отметить период"
await p.locator('[data-act="cnext"]').click(); await p.waitForTimeout(250);
await p.getByText('+ отметить период').click(); await p.waitForTimeout(300);
const from = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 3); return d.toISOString().slice(0,10); });
const to = await p.evaluate(() => new Date().toISOString().slice(0,10));
await p.fill('input[name="from"]', from);
await p.fill('input[name="to"]', to);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
console.log('3) после «отметить период»:', await info());
console.log('   дней всего:', (await days()).length);
console.log('   циклы:', (await p.locator('.card', { hasText: 'ЦИКЛЫ' }).innerText()).replace(/\n+/g, ' | '));
await p.screenshot({ path: 'cycle-1.png' });

// правка цикла
await p.locator('[data-act="cedit"]').first().click(); await p.waitForTimeout(300);
console.log('4) шторка правки:', await p.locator('.sheet-sub').innerText());
const newFrom = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 5); return d.toISOString().slice(0,10); });
await p.fill('input[name="from"]', newFrom);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
console.log('   после правки день цикла:', (await info()).split('|')[1]);

// снять отметку тапом
const before = (await days()).length;
await p.locator('.cal-d.on').last().click(); await p.waitForTimeout(350);
console.log('5) тап по отмеченному дню:', before, '→', (await days()).length);

// удалить цикл целиком
await p.locator('[data-act="cedit"]').first().click(); await p.waitForTimeout(300);
await p.locator('[data-sheet="danger"]').click(); await p.waitForTimeout(300);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
console.log('6) после удаления цикла дней:', (await days()).length, '| осталось:', (await days()).join(', '));

// статистика по двум циклам
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.health.days = {};
  const mk = (back, n) => { for (let i = 0; i < n; i++) { const d = new Date(); d.setDate(d.getDate() - back + i); s.health.days[d.toISOString().slice(0,10)] = true; } };
  mk(60, 5); mk(31, 5); mk(2, 3);
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
console.log('7) три цикла:', await info());
console.log('   список:', (await p.locator('.card', { hasText: 'ЦИКЛЫ' }).innerText()).replace(/\n+/g, ' | '));
await p.screenshot({ path: 'cycle-2.png' });

// совет Летописца на экране «День»
await p.goto('http://127.0.0.1:8765/#/day', { waitUntil: 'load' }); await p.waitForTimeout(600);
console.log('8) Летописец:', (await p.locator('.ai').first().innerText()));
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
