import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
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
await p.evaluate(() => { location.hash = '#/budget'; }); await p.waitForTimeout(600);
await p.locator('[data-act="tab"][data-v="vaults"]').click(); await p.waitForTimeout(400);

const card = p.locator('.card', { hasText: 'Накопительный' });
console.log('карточка копилки:', (await card.innerText()).replace(/\n+/g, ' | '));
console.log('видимых кнопок правки:', await card.locator('[data-act="vaultedit"]').count(),
  '| подсказки, что название нажимается: нет');
// правка через тап по названию
await card.getByText('стартовая сумма ›').click(); await p.waitForTimeout(400);
console.log('шторка открылась:', await p.locator('.sheet-title').innerText());
console.log('поля:', await p.locator('.sheet .fld > span').allInnerTexts());
await p.fill('input[name="start"]', '81850');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
const s = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).budget);
console.log('стартовая сумма записалась:', s.vaults[0].start);
console.log('в карточке:', (await p.locator('.card', { hasText: 'Накопительный' }).innerText()).replace(/\n+/g, ' | '));
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
