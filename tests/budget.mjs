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
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).budget);

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
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(400);
await p.locator('.tile', { hasText: 'Бюджет' }).click(); await p.waitForTimeout(600);
console.log('1) с плитки попали на:', p.url().split('#')[1], '| заголовок:', await p.locator('.title').first().innerText());
let s = await st();
console.log('   статьи расходов:', s.cats.expense.map(c => c.name).join(', '));
console.log('   доходы:', s.cats.income.map(c => c.name).join(', '));
console.log('   копилки:', s.vaults.map(v => v.name).join(', '), '| правил:', s.rules.length);

// стартовая сумма
await p.getByText('стартовая сумма').click(); await p.waitForTimeout(350);
await p.fill('input[name="n"]', '50000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(400);

// план по статье
await p.locator('[data-act="catedit"]', { hasText: 'Еда' }).click(); await p.waitForTimeout(400);
console.log('2) шторка статьи:', await p.locator('.sheet-title').innerText(), '|', await p.locator('.sheet-sub').innerText());
await p.fill('input[name="plan"]', '21000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);

// операции
await p.locator('[data-act="tab"][data-v="ops"]').click(); await p.waitForTimeout(350);
await p.getByText('+ Доход').click(); await p.waitForTimeout(400);
await p.fill('input[name="sum"]', '200000');
await p.selectOption('select[name="catId"]', await p.locator('select[name="catId"]').evaluate(e => [...e.options].find(o => o.text === 'От отца').value));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
for (const [sum, cat, note] of [['6630', 'Еда', 'GROWFOOD'], ['2800', 'Транспорт', 'Метро'], ['11994', 'Буся', '10 кг корма + наполнитель']]) {
  await p.getByText('− Трата').click(); await p.waitForTimeout(350);
  await p.fill('input[name="sum"]', sum);
  await p.selectOption('select[name="catId"]', await p.locator('select[name="catId"]').evaluate((e, c) => [...e.options].find(o => o.text === c).value, cat));
  await p.fill('input[name="note"]', note);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(400);
}
await p.getByText('В копилку').click(); await p.waitForTimeout(400);
await p.fill('input[name="sum"]', '81850');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
s = await st();
console.log('3) операций:', s.ops.length, '| виды:', [...new Set(s.ops.map(o => o.kind))].join(', '));
console.log('   список:', (await p.locator('.card').last().innerText()).replace(/\n+/g, ' | ').slice(0, 130));

// сводка месяца
await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(450);
const summary = await p.locator('.card', { hasText: 'ИТОГ МЕСЯЦА' }).innerText();
console.log('4) итог месяца:', summary.replace(/\n+/g, ' | '));
console.log('   ожидаем остаток 50000 + 200000 − 21424 − 81850 = 146726');
console.log('   недели:', (await p.locator('.card', { hasText: 'ПО НЕДЕЛЯМ' }).innerText()).replace(/\n+/g, ' | '));
console.log('   статья «Еда»:', (await p.locator('.card', { hasText: 'СТАТЬИ РАСХОДОВ' }).innerText()).split('\n').filter(l => /Еда/.test(l)).join(' '));
await p.screenshot({ path: 'budget-month.png' });

// копилки
await p.locator('[data-act="tab"][data-v="vaults"]').click(); await p.waitForTimeout(400);
console.log('5) копилка:', (await p.locator('.card').first().innerText()).replace(/\n+/g, ' | '));
await p.locator('[data-act="vaulttake"]').first().click(); await p.waitForTimeout(350);
await p.fill('input[name="n"]', '1850');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
console.log('   после снятия 1850:', (await p.locator('.card').first().innerText()).replace(/\n+/g, ' | '));
await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(400);
console.log('   остаток вырос:', (await p.locator('.card', { hasText: 'ИТОГ МЕСЯЦА' }).innerText()).split('\n').filter(l => /Остаток/.test(l))[0]);
await p.screenshot({ path: 'budget-vaults.png' });

// прошлый месяц пуст, но баланс переносится
await p.locator('[data-act="next"]').click(); await p.waitForTimeout(450);
console.log('6) следующий месяц:', (await p.locator('.card', { hasText: 'ИТОГ МЕСЯЦА' }).innerText()).replace(/\n+/g, ' | ').slice(0, 120));
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
