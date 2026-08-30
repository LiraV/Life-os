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
const tr = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).tracker);
const DIR = '/tmp/claude-0/-home-user-Life-os/41088404-d7d2-525c-94a8-f20fc604e441/scratchpad/';

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
  s.habits = [{ id: 'p', name: 'Таблетки', target: 3, step: 1, unit: 'приёма', log: {} }];
  for (let d = 1; d <= 8; d++) s.habits[0].log[`${y}-07-${String(d).padStart(2,'0')}`] = 3;
  s.tracker = { rows: [{ id: 'r1', name: 'Шпагат', unit: 'ч' }], values: { r1: { [`${y}-01`]: 8 } }, habitValues: {} };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(700);
console.log('1) подпись до правок:', (await p.locator('.stepper').innerText()).replace(/\n/g, ' | '));

// правка ячейки ставит отметку времени
await p.locator('.tr tbody tr', { hasText: 'Таблетки' }).locator('td.edit').nth(1).click(); await p.waitForTimeout(400);
await p.fill('input[name="n"]', '20');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
console.log('2) после правки:', (await p.locator('.stepper').innerText()).replace(/\n/g, ' | '));
console.log('   в состоянии:', (await tr()).updatedAt?.slice(0, 16));

// выгрузка → правка в «экселе» → загрузка
const dl = await Promise.all([p.waitForEvent('download'), p.getByText('Выгрузить в Excel').click()]).then(r => r[0]);
const file = DIR + 'tr-' + dl.suggestedFilename();
await dl.saveAs(file);
console.log('3) выгружено:', fs.statSync(file).size, 'байт');

// стираем значения и грузим обратно
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.tracker.values = {}; s.tracker.habitValues = {};
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(600);
const chooser = p.waitForEvent('filechooser');
await p.getByText('Загрузить из Excel').click();
(await chooser).setFiles(file);
await p.waitForTimeout(2000);
console.log('4) загрузка:', await p.locator('.toast').innerText().catch(() => '—'));
const t = await tr();
console.log('   свои строки:', JSON.stringify(t.values), '| правки привычек:', JSON.stringify(t.habitValues));
console.log('   строка в таблице:', (await p.locator('.tr tbody tr', { hasText: 'Таблетки' }).innerText()).replace(/\s+/g, ' '));
await p.screenshot({ path: 'tracker-import.png' });
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
