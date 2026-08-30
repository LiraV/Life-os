import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
const bud = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).budget);
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

// старт + пополнение + снятие
const card = p.locator('.card', { hasText: 'Накопительный' });
await card.getByText('стартовая сумма ›').click(); await p.waitForTimeout(400);
await p.fill('input[name="start"]', '81850');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
await card.getByText('пополнить').click(); await p.waitForTimeout(400);
await p.fill('input[name="sum"]', '10000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
await p.locator('[data-act="tab"][data-v="vaults"]').click(); await p.waitForTimeout(400);
console.log('1) после пополнения:', (await p.locator('.card', { hasText: 'Накопительный' }).innerText()).replace(/\n+/g, ' | '));
await p.locator('.card', { hasText: 'Накопительный' }).getByText('снять').click(); await p.waitForTimeout(400);
await p.fill('input[name="n"]', '2000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
console.log('2) после снятия:', (await p.locator('.card', { hasText: 'Накопительный' }).innerText()).replace(/\n+/g, ' | '));

// новая копилка со стартовой суммой
await p.getByText('+ Копилка').click(); await p.waitForTimeout(400);
console.log('3) поля новой копилки:', await p.locator('.sheet .fld > span').allInnerTexts());
await p.fill('input[name="name"]', 'Милан');
await p.fill('input[name="start"]', '30000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
console.log('   создана:', (await p.locator('.card', { hasText: 'Милан' }).innerText()).replace(/\n+/g, ' | '));

// стартовая сумма не влияет на остаток бюджета
await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(450);
const summary = await p.locator('.card', { hasText: 'ИТОГ МЕСЯЦА' }).innerText();
console.log('4) остаток бюджета:', summary.split('\n').find(l => l.includes('₽') && summary.split('\n')[summary.split('\n').indexOf(l) - 1] === 'Остаток') || summary.replace(/\n+/g,' | ').slice(0,120));
const s = await bud();
console.log('   отложено за месяц:', s.ops.filter(o => o.kind === 'save').reduce((a, o) => a + o.sum, 0), '(10000 − 2000, старт не считается)');
console.log('   старты копилок:', s.vaults.map(v => `${v.name}: ${v.start}`).join(', '));
await p.locator('[data-act="tab"][data-v="vaults"]').click(); await p.waitForTimeout(400);
await p.screenshot({ path: 'vaults.png' });
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
