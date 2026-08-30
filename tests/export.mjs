import { chromium, devices } from './pw.mjs';
import fs from 'fs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU', acceptDownloads: true });
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
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  const y = new Date().getFullYear();
  s.habits = [
    { id: 'w', name: 'Вода', target: 2000, step: 250, unit: 'мл', log: {} },
    { id: 'p', name: 'Таблетки', target: 3, step: 1, unit: 'приёма', log: {} },
  ];
  for (let d = 1; d <= 10; d++) s.habits[1].log[`${y}-07-${String(d).padStart(2,'0')}`] = 3;
  s.tracker = { rows: [{ id: 'r1', name: 'Шпагат', unit: 'ч' }], values: { r1: { [`${y}-01`]: 8 } }, habitValues: {} };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(700);

// 1. правка привычки за прошлый месяц
const row = p.locator('.tr tbody tr', { hasText: 'Таблетки' });
console.log('1) до правки:', (await row.innerText()).replace(/\s+/g, ' '));
await row.locator('td.edit').nth(0).click(); await p.waitForTimeout(400);   // январь
console.log('   шторка:', await p.locator('.sheet-title').innerText(), '|', await p.locator('.sheet-sub').innerText());
await p.fill('input[name="n"]', '45');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
let st = await state();
console.log('   записано:', JSON.stringify(st.tracker.habitValues), '| дневные отметки не тронуты:', Object.keys(st.habits[1].log).length === 10);
console.log('   в таблице:', (await p.locator('.tr tbody tr', { hasText: 'Таблетки' }).innerText()).replace(/\s+/g, ' '));
console.log('   ячейка помечена точкой:', await p.locator('.tr tbody td.fixed').count() > 0);

// июль остаётся расчётным
console.log('   июль (расчёт по дням):', await row.locator('td').nth(7).innerText());

// 2. возврат к расчётному
await row.locator('td.edit').nth(0).click(); await p.waitForTimeout(400);
await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(500);
st = await state();
console.log('2) после «вернуть расчётное»:', JSON.stringify(st.tracker.habitValues), '| в таблице:', (await p.locator('.tr tbody tr', { hasText: 'Таблетки' }).innerText()).replace(/\s+/g, ' '));

// вернём правку для выгрузки
await row.locator('td.edit').nth(0).click(); await p.waitForTimeout(400);
await p.fill('input[name="n"]', '45');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);

// 3. выгрузка
const dl = await Promise.all([p.waitForEvent('download'), p.getByText('Выгрузить в Excel').click()]).then(r => r[0]);
const file = '/tmp/claude-0/-home-user-Life-os/41088404-d7d2-525c-94a8-f20fc604e441/scratchpad/' + dl.suggestedFilename();
await dl.saveAs(file);
console.log('3) файл:', dl.suggestedFilename(), fs.statSync(file).size, 'байт');
console.log('ошибки:', errs.length ? errs : 'нет');
await p.screenshot({ path: 'tracker-fixed.png' });
await b.close();
