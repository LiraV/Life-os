// Состав тренировки правится на дне: добавить, поменять, убрать.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
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

await p.getByText('+ тренировка').click(); await p.waitForTimeout(450);
await p.fill('input[name="title"]', 'Зал А');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('1) строка на дне:', (await p.locator('.quest').innerText()).replace(/\n+/g, ' | '));
console.log('   состав пустой:', (await openW(), await p.locator('.w-sets').innerText()).replace(/\n+/g, ' | '));

await openW(); await p.locator('[data-act="wsetadd"]').click(); await p.waitForTimeout(450);
await p.selectOption('select[name="exerciseId"]', await p.locator('select[name="exerciseId"]').evaluate(e => [...e.options].find(o => o.text.startsWith('Турник')).value));
await p.fill('input[name="value"]', '6'); await p.fill('input[name="reps"]', '3');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('2) после добавления:', (await openW(), await p.locator('.w-sets').innerText()).replace(/\n+/g, ' | '));

await openW(); await p.locator('[data-act="wsetedit"]').first().click(); await p.waitForTimeout(450);
console.log('3) шторка правки:', await p.locator('.sheet-title').innerText(), '| результат подставлен:', await p.inputValue('input[name="value"]'));
await p.fill('input[name="value"]', '8');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('   после правки:', (await openW(), await p.locator('.w-sets').innerText()).replace(/\n+/g, ' | '));

// результат идёт в рекорды только у отмеченной тренировки
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(500);
await p.locator('[data-act="tab"][data-v="ex"]').click(); await p.waitForTimeout(400);
console.log('4) пока тренировка не отмечена:', (await p.locator('.card', { hasText: 'Турник' }).innerText()).includes('результатов пока нет'));
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(500);
await p.locator('.quest [data-act="wdone"]').click(); await p.waitForTimeout(900);
if (await p.locator('[data-sheet="secondary"]').count()) { await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(400); }
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(500);
await p.locator('[data-act="tab"][data-v="ex"]').click(); await p.waitForTimeout(500);
console.log('   рекорд турника:', (await p.locator('.card', { hasText: 'Турник' }).innerText()).replace(/\n+/g, ' | ').slice(0, 120));

await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await openW(); await p.locator('[data-act="wsetedit"]').first().click(); await p.waitForTimeout(450);
await p.locator('[data-sheet="danger"]').click(); await p.waitForTimeout(600);
const s = await st();
console.log('5) после удаления подходов:', s.sport.workouts[0].sets.length, '| ошибки:', errs.length ? errs : 'нет');
await p.screenshot({ path: 'day-sets.png' });
await b.close();
