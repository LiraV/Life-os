import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

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

// 1. норма 2000 мл — раньше упиралась в 50
await p.evaluate(() => { location.hash = '#/habits'; }); await p.waitForTimeout(500);
await p.getByText('+ Новая привычка').click(); await p.waitForTimeout(350);
await p.fill('input[name="name"]', 'Вода');
await p.fill('input[name="target"]', '2000');
await p.fill('input[name="unit"]', 'мл');
await p.fill('input[name="step"]', '250');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
let st = await state();
const w = st.habits[0];
console.log('1) привычка:', JSON.stringify({ n: w.name, target: w.target, step: w.step, unit: w.unit }));
console.log('   норма больше 50 принялась:', w.target === 2000 ? '✓' : '✗ ' + w.target);

// 2. шаг работает на главном
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(500);
const plus = p.locator('.hab-row', { hasText: 'Вода' }).locator('.hab-plus');
console.log('2) на главном:', (await p.locator('.hab-row', { hasText: 'Вода' }).innerText()).replace(/\n+/g, ' | '));
for (let i = 0; i < 3; i++) { await plus.click(); await p.waitForTimeout(250); }
console.log('   после трёх тапов:', (await p.locator('.hab-row', { hasText: 'Вода' }).innerText()).replace(/\n+/g, ' | '));
for (let i = 0; i < 5; i++) { await plus.click(); await p.waitForTimeout(220); }
st = await state();
const today = Object.keys(st.habits[0].log)[0];
console.log('   после восьми:', st.habits[0].log[today], 'мл | XP:', st.user.xp, '| тост:', await p.locator('.toast').innerText().catch(() => '—'));
await plus.click(); await p.waitForTimeout(350);
st = await state();
console.log('   тап по закрытой норме сбрасывает:', st.habits[0].log[today] ?? 0);

// 3. свои строки в трекере
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(600);
await p.getByText('+ Своя строка').click(); await p.waitForTimeout(350);
await p.fill('input[name="name"]', 'Медитация');
await p.fill('input[name="unit"]', 'ч');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
st = await state();
console.log('3) своя строка:', JSON.stringify(st.tracker.rows));
const row = p.locator('.tr tbody tr', { hasText: 'Медитация' });
console.log('   строка в таблице:', (await row.innerText()).replace(/\s+/g, ' '));
// заполняем январь и февраль
for (const [idx, val] of [[0, '8'], [1, '2']]) {
  await row.locator('td.edit').nth(idx).click(); await p.waitForTimeout(350);
  await p.fill('input[name="n"]', val);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
}
st = await state();
console.log('   значения:', JSON.stringify(st.tracker.values[st.tracker.rows[0].id]));
console.log('   в таблице:', (await p.locator('.tr tbody tr', { hasText: 'Медитация' }).innerText()).replace(/\s+/g, ' '));

// 4. привычки по-прежнему считаются сами и не редактируются вручную
const habRow = p.locator('.tr tbody tr', { hasText: 'Вода' });
console.log('4) у привычки редактируемых ячеек:', await habRow.locator('td.edit').count(), '(12 — по месяцу на каждый)');
console.log('   название привычки не притворяется кнопкой:', await habRow.locator('.tr-name.own').count() === 0);

// 5. правка и удаление своей строки
await p.locator('.tr-name.own', { hasText: 'Медитация' }).click(); await p.waitForTimeout(400);
await p.fill('input[name="name"]', 'Медитация, часы');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
console.log('5) после правки:', (await state()).tracker.rows[0].name);
await p.locator('.tr-name.own', { hasText: 'Медитация' }).click(); await p.waitForTimeout(400);
await p.locator('[data-sheet="danger"]').click(); await p.waitForTimeout(500);
st = await state();
console.log('   после удаления: строк', st.tracker.rows.length, '| значения подчищены:', Object.keys(st.tracker.values).length === 0);
await p.screenshot({ path: 'tracker-own.png' });
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
