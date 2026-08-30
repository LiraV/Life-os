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
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);

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

// дубль: своя строка «Пресс» из старой таблицы + пилюля тренировки «Пресс»
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.tracker.rows = [{ id: 'R1', name: 'Пресс', unit: 'раз' }];
  s.tracker.values = { R1: { '2026-01': 8, '2026-02': 4 } };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(700);
console.log('1) строк до слияния:', (await p.locator('.tr tbody .tr-name').allInnerTexts()).join(' / '));
console.log('   подсказка:', (await p.locator('.card.dash', { hasText: 'дублируется' }).innerText().catch(() => '—')).replace(/\n+/g, ' | ').slice(0, 130));
await p.getByText('Объединить').click(); await p.waitForTimeout(700);
let s = await st();
console.log('2) после слияния:', await p.locator('.toast').innerText().catch(() => '—'));
console.log('   строк:', (await p.locator('.tr tbody .tr-name').allInnerTexts()).join(' / '));
console.log('   значения у пилюли:', JSON.stringify(s.tracker.tagValues));
console.log('   своих строк осталось:', s.tracker.rows.length, '| данные целы:', JSON.stringify(Object.values(s.tracker.tagValues)[0]));
console.log('   в таблице:', (await p.locator('.tr tbody tr', { hasText: 'Пресс' }).innerText()).replace(/\s+/g, ' '));

// цель-счётчик и связанная тренировка
await p.evaluate(() => { location.hash = '#/plans'; }); await p.waitForTimeout(500);
await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(400);
await p.locator('.card', { hasText: 'ДИНАМИЧНЫЕ ЦЕЛИ' }).getByText('+ добавить').click(); await p.waitForTimeout(400);
await p.fill('input[name="title"]', 'Сходить в зал');
await p.fill('input[name="target"]', '4');
await p.fill('input[name="unit"]', 'раза');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);

await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.getByText('+ тренировка').click(); await p.waitForTimeout(500);
const goalOpts = await p.locator('select[name="goalId"]').evaluate(e => [...e.options].map(o => o.text).join(' | '));
console.log('3) выбор цели в тренировке:', goalOpts);
await p.selectOption('select[name="goalId"]', await p.locator('select[name="goalId"]').evaluate(e => [...e.options].find(o => o.text.includes('Сходить в зал')).value));
await p.fill('input[name="title"]', 'Зал ноги');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('   строка на «Дне»:', (await p.locator('.quest').innerText()).replace(/\n+/g, ' | '));

await p.locator('.quest [data-act="wdone"]').click(); await p.waitForTimeout(900);
if (await p.locator('[data-sheet="secondary"]').count()) { await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(400); }
s = await st();
console.log('4) после отметки цель:', s.goals.filter(g => g.dynamic).map(g => `${g.title} ${g.current}/${g.target}`).join(', '));
await p.locator('.quest [data-act="wdone"]').click(); await p.waitForTimeout(800);
s = await st();
console.log('5) после снятия:', s.goals.filter(g => g.dynamic).map(g => `${g.title} ${g.current}/${g.target}`).join(', '));
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(600);
await p.screenshot({ path: 'sport-goal.png' });
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
