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
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const openW = async () => { if (await p.locator('.w-sets').count() === 0) { await p.locator('[data-act="wtoggle"]').first().click(); await p.waitForTimeout(400); } };
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

// упражнения заведены сами
let s = await st();
console.log('1) упражнения из коробки:', s.sport.exercises.map(e => `${e.name} (${e.unit}${e.dir === 'down' ? ', меньше лучше' : ''})`).join(', '));

// планируем тренировку с экрана «День»
await p.getByText('+ тренировка').click(); await p.waitForTimeout(450);
console.log('2) шторка:', await p.locator('.sheet-sub').innerText());
await p.fill('input[name="title"]', 'Зал А · ноги');
await p.fill('input[name="date"]', iso(0));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('   на «Дне»:', (await p.locator('.quest').innerText()).replace(/\n+/g, ' | '));

// состав набираем прямо в строке дня
for (const [ex, val, reps] of [['Планка', '45', '3'], ['Турник', '6', '2']]) {
  await openW(); await p.locator('[data-act="wsetadd"]').first().click(); await p.waitForTimeout(400);
  await p.selectOption('select[name="exerciseId"]', await p.locator('select[name="exerciseId"]').evaluate((e, n) => [...e.options].find(o => o.text.startsWith(n)).value, ex));
  await p.fill('input[name="value"]', val);
  await p.fill('input[name="reps"]', reps);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
}
console.log('3) состав тренировки:', (await openW(), await p.locator('.w-sets').innerText()).replace(/\n+/g, ' | '));

// отмечаем на экране «День»
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.locator('.quest [data-act="wdone"]').click(); await p.waitForTimeout(900);
console.log('4) после отметки:', await p.locator('.sheet-title').innerText().catch(() => 'шторки нет'));
if (await p.locator('[data-sheet="secondary"]').count()) { await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(400); }
s = await st();
console.log('   тренировка отмечена:', s.sport.workouts[0].done, '| подходов:', s.sport.workouts[0].sets.length);

// рекорды
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(500);
await p.locator('[data-act="tab"][data-v="ex"]').click(); await p.waitForTimeout(500);
console.log('6) планка:', (await p.locator('.card', { hasText: 'Планка' }).innerText()).replace(/\n+/g, ' | ').slice(0, 110));

// шпагат: меньше — лучше
await p.locator('.card:not(.mute)', { hasText: 'Шпагат' }).getByText('+ Результат').click(); await p.waitForTimeout(400);
await p.fill('input[name="value"]', '12'); await p.fill('input[name="date"]', iso(-40));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
await p.locator('.card:not(.mute)', { hasText: 'Шпагат' }).getByText('+ Результат').click(); await p.waitForTimeout(400);
await p.fill('input[name="value"]', '8');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('7) шпагат:', (await p.locator('.card:not(.mute)', { hasText: 'Шпагат' }).innerText()).replace(/\n+/g, ' | ').slice(0, 130));
await p.screenshot({ path: 'sport-ex.png' });

// статистика сферы и трекер
await p.evaluate(() => { location.hash = '#/spheres/sport'; }); await p.waitForTimeout(600);
console.log('8) статы сферы:', (await p.locator('.card', { hasText: 'Статы' }).innerText()).replace(/\n+/g, ' | '));
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(700);
console.log('9) строки трекера:', (await p.locator('.tr tbody .tr-name').allInnerTexts()).join(' / '));
// Упражнения в трекер больше не идут — там считаются пилюли тренировок.
const names = await p.locator('.tr tbody .tr-name').allInnerTexts();
console.log('   упражнений в трекере нет:', !names.some(n => /Шпагат|Планка|Турник/.test(n)));
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(500);
await p.screenshot({ path: 'sport-plan.png' });
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
