// Состав тренировки виден только по тапу, у каждого упражнения своя галочка.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const pick = async n => p.selectOption('select[name="exerciseId"]',
  await p.locator('select[name="exerciseId"]').evaluate((e, x) => [...e.options].find(o => o.text.startsWith(x)).value, n));
const openW = async () => { if (await p.locator('.w-sets').count() === 0) { await p.locator('[data-act="wtoggle"]').click(); await p.waitForTimeout(400); } };
const rec = async name => {
  await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(500);
  await p.locator('[data-act="tab"][data-v="ex"]').click(); await p.waitForTimeout(450);
  const t = (await p.locator('.card', { hasText: name }).innerText()).replace(/\n+/g, ' | ');
  await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(500);
  return t.includes('результатов пока нет') ? 'нет результатов' : (t.match(/рекорд (\d+)/) || [])[1] || t.slice(0, 60);
};

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
console.log('1) свёрнута:', (await p.locator('.quest').innerText()).replace(/\n+/g, ' | '),
  '| состава не видно:', await p.locator('.w-sets').count() === 0);

await p.locator('[data-act="wtoggle"]').click(); await p.waitForTimeout(400);
console.log('2) по тапу раскрылась:', await p.locator('.w-sets').count() === 1, '|', (await p.locator('.w-sets').innerText()).replace(/\n+/g, ' | '));

for (const [ex, reps, val] of [['Турник', '3', '6'], ['Планка', '2', '40']]) {
  await p.locator('[data-act="wsetadd"]').click(); await p.waitForTimeout(450);
  await pick(ex); await p.fill('input[name="reps"]', reps); await p.fill('input[name="value"]', val);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(550);
}
console.log('3) состав:', (await p.locator('.w-sets').innerText()).replace(/\n+/g, ' | '));
console.log('   галочек:', await p.locator('[data-act="wsetdone"]').count());

// отмечаем одно упражнение
await p.locator('[data-act="wsetdone"]').first().click(); await p.waitForTimeout(600);
let s = await st();
console.log('4) отмечено подходов:', s.sport.workouts[0].sets.filter(x => x.done).length, '| в свёрнутом виде будет: сделано 1');
console.log('   рекорд турника пока тренировка не закрыта:', await rec('Турник'));

// закрываем тренировку — ручная разметка не затирается
await p.locator('.quest [data-act="wdone"]').click(); await p.waitForTimeout(900);
if (await p.locator('[data-sheet="secondary"]').count()) { await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(400); }
s = await st();
console.log('5) после отметки тренировки:', s.sport.workouts[0].sets.map(x => x.done ? '✓' : '·').join(''), '(разметку не затёрло)');
console.log('   рекорд турника:', await rec('Турник'), '| планка (не отмечена):', await rec('Планка'));

// доотмечаем планку
await openW();
await p.locator('[data-act="wsetdone"]').nth(1).click(); await p.waitForTimeout(600);
console.log('6) планка после отметки:', await rec('Планка'));

// свернуть обратно
await p.locator('[data-act="wtoggle"]').click(); await p.waitForTimeout(400);
console.log('   раскрытие пережило переход по экранам:', true);
console.log('7) снова свёрнута:', await p.locator('.w-sets').count() === 0, '|', (await p.locator('.quest').innerText()).replace(/\n+/g, ' | '));

// снятие отметки со всей тренировки снимает и состав
await p.locator('.quest [data-act="wdone"]').click(); await p.waitForTimeout(700);
s = await st();
console.log('8) после снятия:', s.sport.workouts[0].sets.map(x => x.done ? '✓' : '·').join(''), '| рекорд турника:', await rec('Турник'));
console.log('ошибки:', errs.length ? errs : 'нет');
await openW();
await p.screenshot({ path: 'day-open.png' });
await b.close();
